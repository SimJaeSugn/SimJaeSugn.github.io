export const meta = {
  name: 'agentv2-autoloop',
  description: 'v2 의도·계획 프롬프트를 eval 점수로 자동 수렴시키는 loop-until-pass (P3, 계획서 §12~15)',
  whenToUse: 'P2 오라클 보정 완료 후, agent/v2 프롬프트를 골든/홀드아웃 통과율 목표까지 자동 개선할 때',
  phases: [{ title: 'Loop', detail: '라운드마다 plan→implement→gate→verify, 점수↑면 채택·↓면 롤백' }],
}

// ── 정지/목표 파라미터 (사용자 결정 반영) ──────────────────────────
const GOLDEN_TARGET = 0.90
const HOLDOUT_TARGET = 0.90
const HOLDOUT_FLOOR = 0.85          // 홀드아웃이 이 밑으로 떨어지면 과적합 의심 → 채택 거부
const MAX_ROUNDS = 12
const K_NOPROGRESS = 3              // 연속 무진전 K회 → 에스컬레이트
const REPS_ITER = 3                 // 반복 중 채점(비용 절감)
const REPS_FINAL = 5                // 성공 확정 시 재확인

// ── 라운드 에이전트 반환 스키마 ────────────────────────────────────
const ROUND = {
  type: 'object',
  required: ['hypothesis', 'changedFiles', 'gatePass', 'golden', 'holdout', 'accepted'],
  properties: {
    hypothesis:   { type: 'string', description: '이번 라운드의 가설 1개 (무엇을 왜 고쳤나)' },
    targetCase:   { type: 'string', description: '겨냥한 실패 케이스 ID (예: F-10)' },
    changedFiles: { type: 'array', items: { type: 'string' }, description: '수정한 파일 경로' },
    gatePass:     { type: 'boolean', description: 'python -m agent.v2.eval.gate 통과 여부' },
    golden:       { type: 'number', description: '수정 후 golden rep 통과율 0~1' },
    holdout:      { type: 'number', description: '수정 후 holdout rep 통과율 0~1' },
    accepted:     { type: 'boolean', description: '변경을 채택(커밋)했는지. 회귀·게이트fail이면 false(롤백)' },
    failing:      { type: 'array', items: { type: 'string' }, description: '아직 실패하는 케이스 ID들' },
    note:         { type: 'string' },
  },
}

const CONTRACT = `너는 UXERManager agent/v2 를 개선하는 자율 개발자다.
"올바름"의 유일한 정의는 \`python -m agent.v2.eval.runner\` 스코어카드다(오라클이 진리. 네 자기판단 아님).
작업 디렉토리: proxy/python 에서 명령을 실행한다.

[수정 허용 범위] proxy/python/agent/v2/ 중 eval/ 를 제외한 파일만.
  - 우선 대상: agent/v2/common/prompts.py 의 ANALYZE_SYSTEM·PLAN_V2_SYSTEM
  - 프롬프트로 안 풀리면: agent/v2/nodes/*, agent/v2/common/schemas.py·state.py
[절대 금지]
  - v1 파일 변경(agent/ 기존 파일, routers/agent.py, js/agent_panel.js 등) — §9.1
  - agent/v2/eval/** (fixtures·scorer·runner·gate) 수정 — 점수 위조
  - 질의→정답 하드코딩/특수분기, 채점 우회
[작업 단위] 한 라운드 = 가설 1개·최소 변경.`

function roundPrompt(round, bestGolden, history) {
  const hist = history.length
    ? history.map(h => `  R: "${h.hypothesis}" → golden ${h.golden} holdout ${h.holdout} (${h.accepted ? '채택' : '롤백'})`).join('\n')
    : '  (없음 — 첫 라운드)'
  return `${CONTRACT}

[라운드] ${round}/${MAX_ROUNDS} · 현재 최고 golden=${bestGolden.toFixed(3)} (목표 golden≥${GOLDEN_TARGET} AND holdout≥${HOLDOUT_TARGET})
[지난 시도]
${hist}

[이번 라운드 절차 — 순서대로]
1. proxy/python 에서 \`python -X utf8 -m agent.v2.eval.runner --json --reps ${REPS_ITER}\` 실행 → 현재 스코어카드 파악(golden/holdout/실패 케이스·사유).
2. 실패 케이스 중 하나(또는 공통 원인)를 골라 **가설 1개**를 세운다. "어느 케이스가 좋아질지" 먼저 적는다.
3. 허용 범위 파일만 **최소 수정**한다.
4. \`python -m agent.v2.eval.gate\` 실행 → 반드시 PASS(exit 0)여야 한다. FAIL이면 즉시 \`git restore .\`(또는 해당 파일 되돌리기)하고 accepted=false 로 반환.
5. \`python -X utf8 -m agent.v2.eval.runner --json --reps ${REPS_ITER}\` 재실행 → 새 golden/holdout.
6. 채택 판정:
   - golden 이 현재 최고(${bestGolden.toFixed(3)})보다 오르고 holdout ≥ ${HOLDOUT_FLOOR} → \`git add -A && git commit\` 으로 채택(accepted=true).
   - 그 외(회귀·정체·홀드아웃 붕괴) → 변경 되돌리기(accepted=false).
7. 결과를 스키마로 반환한다(golden·holdout 은 5번의 실제 수치).`
}

// ── 루프 본체 ─────────────────────────────────────────────────────
let bestGolden = 0, bestHoldout = 0, dry = 0
const history = []
let outcome = 'max_rounds'

for (let round = 1; round <= MAX_ROUNDS; round++) {
  if (budget.total && budget.remaining() < 40_000) { outcome = 'budget'; break }

  const r = await agent(roundPrompt(round, bestGolden, history), {
    schema: ROUND, phase: 'Loop', label: `round-${round}`,
  })
  if (!r) { dry++; if (dry >= K_NOPROGRESS) { outcome = 'noprogress'; break } continue }
  history.push(r)
  log(`R${round}: ${r.accepted ? '채택' : '롤백'} | golden ${r.golden} holdout ${r.holdout} | 가설: ${r.hypothesis}`)

  // 성공 판정 — 오로지 점수로(LLM 판단 아님)
  if (r.accepted && r.gatePass && r.golden >= GOLDEN_TARGET && r.holdout >= HOLDOUT_TARGET) {
    bestGolden = r.golden; bestHoldout = r.holdout; outcome = 'success'; break
  }
  // 진전 판정
  if (r.accepted && r.golden > bestGolden && r.holdout >= HOLDOUT_FLOOR) {
    bestGolden = r.golden; bestHoldout = r.holdout; dry = 0
  } else {
    if (++dry >= K_NOPROGRESS) { outcome = 'noprogress'; break }
  }
}

return {
  outcome,                      // success | noprogress | max_rounds | budget
  bestGolden, bestHoldout,
  rounds: history.length,
  accepted: history.filter(h => h.accepted).length,
  history,
}
