export const meta = {
  name: 'agentv2-autoloop-blind',
  description: 'v2 프롬프트 자동 최적화 — 홀드아웃 비공개(true holdout) + loop-until-dry',
  whenToUse: '잔여 골든 실패를 짜내되 과적합을 엄격히 막고 싶을 때. 최적화 에이전트는 골든만 보고, 홀드아웃은 검사·과적합 가드로만 쓴다.',
  phases: [{ title: 'Loop', detail: '골든만으로 최적화 → 홀드아웃 검사(비공개) → 과적합이면 롤백' }],
}

// ── 파라미터 ───────────────────────────────────────────────────────
const GOLDEN_DONE = 0.99       // 골든 거의 전부 통과 시 성공 종료
const HOLDOUT_FLOOR = 0.95     // 홀드아웃이 이 밑이면 과적합 → 채택 취소(reset)
const MAX_ROUNDS = 8
const K_NOPROGRESS = 3         // 연속 무진전 → 종료(loop-until-dry)
const REPS = 3

// ── 스키마 ─────────────────────────────────────────────────────────
const OPT = {
  type: 'object',
  required: ['goldenBefore', 'goldenAfter', 'committed', 'gatePass', 'hypothesis'],
  properties: {
    goldenBefore: { type: 'number', description: '수정 전 golden rep 통과율 0~1' },
    goldenAfter:  { type: 'number', description: '수정 후 golden rep 통과율 0~1 (커밋 안 했으면 before와 같음)' },
    committed:    { type: 'boolean', description: 'golden이 올라 gate 통과로 커밋했으면 true. 아니면(개선 없음/gate fail) restore하고 false' },
    gatePass:     { type: 'boolean' },
    hypothesis:   { type: 'string', description: '이번 가설(무엇을 왜 고쳤나)' },
    targetCase:   { type: 'string', description: '겨냥한 골든 실패 케이스 ID' },
    goldenFailing:{ type: 'array', items: { type: 'string' }, description: '아직 실패하는 골든 케이스 ID' },
  },
}
const HOLD = {
  type: 'object',
  required: ['holdout'],
  properties: { holdout: { type: 'number', description: 'holdout rep 통과율 0~1' } },
}

// ── 프롬프트 ───────────────────────────────────────────────────────
const RULES = `[수정 허용] proxy/python/agent/v2/ 중 eval/ 제외 (우선 prompts.py의 ANALYZE_SYSTEM·PLAN_V2_SYSTEM, 필요시 nodes/schemas).
[절대 금지] v1 파일 변경, agent/v2/eval/** 변경(점수 위조), 질의→정답 하드코딩/특수분기.
[홀드아웃 비공개] 너는 골든셋만 본다. 절대 \`--split holdout\` 이나 전체 채점을 실행하지 말 것. 홀드아웃 케이스를 추측·언급·겨냥하지 말 것.`

function optPrompt(round, bestGolden, hist) {
  const h = hist.length ? hist.map(x => `  · "${x.hypothesis}" → golden ${x.golden}`).join('\n') : '  (없음)'
  return `너는 UXERManager agent/v2 의 의도·계획 프롬프트를 개선하는 자율 개발자다. 작업 디렉토리: proxy/python.
"올바름"의 정의는 골든셋 eval 점수다.

${RULES}

[라운드] ${round}/${MAX_ROUNDS} · 현재 최고 golden=${bestGolden.toFixed(3)} (목표: 골든 실패를 최대한 없앤다)
[지난 채택 가설]
${h}

[절차 — 순서대로]
1. \`python -X utf8 -m agent.v2.eval.runner --json --split golden --reps ${REPS}\` 실행 → summary.golden.rep_pass_rate(=goldenBefore)와 실패 골든 케이스·사유 파악.
2. 실패 케이스 중 하나(또는 공통 원인)로 가설 1개. "어느 케이스가 좋아질지" 먼저 적기.
3. 허용 파일만 최소 수정.
4. \`python -m agent.v2.eval.gate\` → 반드시 PASS(exit 0). FAIL이면 \`git restore .\` 하고 committed=false 반환.
5. \`python -X utf8 -m agent.v2.eval.runner --json --split golden --reps ${REPS}\` 재실행 → goldenAfter.
6. 판정:
   - goldenAfter > goldenBefore 이고 gate PASS → 저장소 루트에서 \`git add -A && git commit -m "autoloop(blind): <가설요약>"\` → committed=true.
   - 그 외(개선 없음/하락/gate fail) → \`git restore .\` (커밋 금지) → committed=false.
7. 스키마로 반환. (홀드아웃은 절대 보지 말 것)`
}

function holdPrompt() {
  return `너는 검사만 하는 평가자다. 작업 디렉토리: proxy/python.
\`python -X utf8 -m agent.v2.eval.runner --json --split holdout --reps ${REPS}\` 를 실행하고 summary.holdout.rep_pass_rate 만 반환하라.
파일이나 git 을 절대 건드리지 말 것(읽기 전용). 어떤 코드도 수정하지 말 것.`
}

function revertPrompt() {
  return `직전 커밋이 홀드아웃을 떨어뜨려(과적합) 취소해야 한다. 저장소 루트에서 \`git reset --hard HEAD~1\` 을 실행해 직전 커밋 1개만 제거하라. 그 외 변경 금지. 완료했으면 "reverted" 라고 답하라.`
}

// ── 루프 본체 ──────────────────────────────────────────────────────
let bestGolden = 0, lastHoldout = 0, dry = 0
const hist = []
let outcome = 'noprogress'

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const opt = await agent(optPrompt(round, bestGolden, hist), { schema: OPT, phase: 'Loop', label: `opt-${round}` })
  if (!opt) { if (++dry >= K_NOPROGRESS) { outcome = 'noprogress'; break } continue }
  if (round === 1 && opt.goldenBefore > bestGolden) bestGolden = opt.goldenBefore

  if (!opt.committed || !opt.gatePass) {
    log(`R${round}: 개선 없음/게이트 — 가설: ${opt.hypothesis}`)
    if (++dry >= K_NOPROGRESS) { outcome = 'noprogress'; break }
    continue
  }

  // 커밋된 후보 변경에 대해 홀드아웃을 '비공개'로 검사 (최적화 에이전트는 못 봄)
  const hc = await agent(holdPrompt(), { schema: HOLD, phase: 'Loop', label: `holdout-${round}` })
  lastHoldout = hc ? hc.holdout : 0

  if (lastHoldout < HOLDOUT_FLOOR) {
    log(`R${round}: ⚠️ 과적합 — golden ${opt.goldenAfter} but holdout ${lastHoldout} < ${HOLDOUT_FLOOR} → 롤백`)
    await agent(revertPrompt(), { phase: 'Loop', label: `revert-${round}` })
    if (++dry >= K_NOPROGRESS) { outcome = 'noprogress'; break }
    continue
  }

  // 채택
  bestGolden = opt.goldenAfter
  hist.push({ hypothesis: opt.hypothesis, golden: opt.goldenAfter })
  dry = 0
  log(`R${round}: ✅ 채택 golden→${opt.goldenAfter} holdout ${lastHoldout} | ${opt.hypothesis}`)
  if (bestGolden >= GOLDEN_DONE) { outcome = 'success'; break }
}

return { outcome, bestGolden, lastHoldout, rounds: hist.length, history: hist }
