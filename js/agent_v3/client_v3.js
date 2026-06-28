// ── Agent v3 SSE 통신·phase 루프 — client_v2.js 미러 ─
// V3-M1: v1/v2 클라이언트 로직과 동일하게 동작. 엔드포인트만 /agent/v3/* 로 변경.
// 전역 _AGENT_V3_URL / _agentV3ThreadId / _agentV3Abort / _agentV3Draft / _agentV3IdRemap
// — v1·v2 전역 재사용·재정의 금지(§9.1 불변식 ③).
// 공유 읽기 자원: AGENT_TOOL_CATALOG·_agentToolDef·_agentCloneState·_agentCommitDraft (agent_tools.js)

// ── v3 전용 전역 ──────────────────────────────────────────────────
const _AGENT_V3_URL = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
let _agentV3ThreadId = null;
let _agentV3Abort = null;
let _agentV3Busy = false;       // 질의 진행 중 여부(전송↔중단 토글·재진입 방지)
let _agentV3Draft = null;       // ACT 턴의 드래프트 ({entities,relations,layout})
let _agentV3IdRemap = {};       // 계획상 엔티티 id → 실제 생성 id 매핑

// ── fetch 기반 SSE 스트림 파서 ────────────────────────────────────
async function _agentV3ReadSSE(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let ev = 'message', data = '';
      frame.split('\n').forEach(line => {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      });
      let parsed = {};
      try { parsed = data ? JSON.parse(data) : {}; } catch {}
      onEvent(ev, parsed);
    }
  }
}

// ── 응답·계획 렌더 헬퍼 ──────────────────────────────────────────
function _agentV3SetReply(bubble, html) {
  if (!bubble) return;
  const reply = bubble.querySelector('.agent-reply');
  if (reply) reply.innerHTML = html;
  else bubble.innerHTML = html;
}

function _agentV3StepLabel(s) {
  const a = (s && s.args) || {};
  const tgt = a.entityId || a.id || a.name || '';
  if (s.tool === 'create_entity') return '테이블 생성: ' + (a.logicalName || a.physicalName || a.id || '');
  if (s.tool === 'create_relation') return '관계 생성: ' + a.from + ' → ' + a.to + ' (' + (a.card || '1:N') + ')';
  if (s.tool === 'auto_layout') return '자동 정렬: ' + (a.type || 'hierarchical');
  if (s.tool === 'delete_entity') return '⚠ 테이블 삭제: ' + tgt;
  if (s.tool === 'delete_relation') return '⚠ 관계 삭제: ' + a.from + ' → ' + a.to;
  if (s.tool === 'add_attribute') return '컬럼 추가: ' + tgt + '.' + ((a.attr && (a.attr.physicalName || a.attr.logicalName)) || a.physicalName || a.logicalName || '');
  if (s.tool === 'update_attribute') return '컬럼 수정: ' + tgt + '.' + (a.attrName || a.column || '');
  if (s.tool === 'remove_attribute') return '⚠ 컬럼 삭제: ' + tgt + '.' + (a.attrName || a.column || '');
  if (s.tool === 'update_entity') return '테이블 수정: ' + tgt;
  if (s.tool === 'describe_tool') return '툴 정보 조회: ' + (a.name || a.tool || '전체');
  if (s.tool === 'find_tables') return '테이블 검색: ' + (a.keyword || a.name || a.query || '전체');
  if (s.tool === 'describe_table') return '테이블 조회: ' + tgt;
  if (s.tool === 'list_relations') return '관계 조회: ' + (tgt || '전체');
  if (s.tool === 'get_selection') return '현재 선택/다이어그램 조회';
  if (s.tool === 'generate_ddl') return 'CREATE SQL 생성' + (a.dialect ? ' (' + a.dialect + ')' : '');
  if (s.tool === 'fetch_db_schema') return 'DB 스키마 조회(서버)';
  if (s.tool && s.tool.indexOf('db_doc_') === 0) return 'SQL 문법 참고: ' + s.tool.slice(7);
  if (s.tool === 'run_sql') return '⚠ SQL 실행(서버): ' + (a.sql ? String(a.sql).slice(0, 40) : '');
  // 신규 툴: 공유 친화 라벨(인자 반영) → 없으면 카탈로그 desc 폴백
  const _lbl = (typeof _agentToolLabel === 'function') ? _agentToolLabel(s && s.tool, a) : null;
  if (_lbl) return _lbl;
  const def = (typeof _agentToolDef === 'function') ? _agentToolDef(s && s.tool) : null;
  return (def && def.desc) || (s && s.tool) || '작업';
}

function _agentV3SetStepIcon(bubble, stepId, icon) {
  if (!bubble) return;
  const el = bubble.querySelector('.agent-step[data-sid="' + stepId + '"] .agent-step-ico');
  if (el) el.textContent = icon;
}

// 계획 미리보기 카드 + 승인 대기 (HITL) → Promise<bool>
function _agentV3AwaitApproval(plan, bubble) {
  return new Promise(resolve => {
    const rows = (plan || []).map(s =>
      '<div class="agent-step" data-sid="' + _agentV3Esc(s.id || '') + '">'
      + '<span class="agent-step-ico">○</span><span>' + _agentV3Esc(_agentV3StepLabel(s)) + '</span></div>'
    ).join('');
    bubble.innerHTML =
      '<div class="agent-plan">'
      + '<div class="agent-plan-title" onclick="this.parentElement.classList.toggle(\'collapsed\')" title="계획 펼치기/접기">실행 계획 · ' + ((plan || []).length) + '단계</div>'
      + rows
      + '<div class="agent-plan-actions">'
      + '<button class="agent-btn agent-btn-ok">실행</button>'
      + '<button class="agent-btn agent-btn-cancel">취소</button>'
      + '</div></div>'
      + '<div class="agent-reply"></div>';
    _agentV3ScrollBottom();
    const finish = v => {
      const act = bubble.querySelector('.agent-plan-actions');
      if (act) act.remove();
      resolve(v);
    };
    const ok = bubble.querySelector('.agent-btn-ok');
    const cancel = bubble.querySelector('.agent-btn-cancel');
    if (ok) ok.addEventListener('click', () => finish(true));
    if (cancel) cancel.addEventListener('click', () => finish(false));
  });
}

// interrupt 로 위임된 툴들을 드래프트에 실행 → 결과 목록 반환
// 공유 읽기 자원: _agentToolDef·_agentCloneState(agent_tools.js)
async function _agentV3ExecTools(calls, bubble) {
  const results = [];
  for (const c of (calls || [])) {
    _agentV3SetStepIcon(bubble, c.id, '⏳');
    const def = (typeof _agentToolDef === 'function') ? _agentToolDef(c.tool) : null;
    let r;
    if (!def) r = { id: c.id, ok: false, error: '알 수 없는 툴: ' + c.tool };
    else {
      if (def.kind === 'write' && !_agentV3Draft) _agentV3Draft = _agentCloneState();
      if (typeof _agentStandardizeAttrs === 'function') await _agentStandardizeAttrs(c.tool, c.args || {});  // 속성명 표준용어사전 표준화
      try { r = { id: c.id, ...(await def.run(_agentV3Draft, c.args || {}, _agentV3IdRemap)) }; }
      catch (e) { r = { id: c.id, ok: false, error: e.message }; }
    }
    _agentV3SetStepIcon(bubble, c.id, r.ok === false ? '❌' : '✅');
    results.push(r);
  }
  return results;
}

// ── 전송 버튼 모드(전송 ↔ 중단) ───────────────────────────────────
function _agentV3SetSendBtnMode(mode) {
  const btn = document.getElementById('agentV3SendBtn');
  if (!btn) return;
  btn.disabled = false;
  if (mode === 'stop') {
    btn.textContent = '■';
    btn.title = '중단 (응답 멈추기)';
    btn.style.background = 'var(--danger,#e03e3e)';
    btn.style.color = '#fff';
  } else {
    btn.textContent = '➤';
    btn.title = '전송';
    btn.style.background = '';
    btn.style.color = '';
  }
}

// 전송 버튼 클릭 디스패처 — 진행 중이면 중단, 아니면 전송
function agentV3SendOrStop() {
  if (_agentV3Busy) agentV3Stop();
  else agentV3Send();
}

// 진행 중인 질의 중단(응답이 늦을 때) — fetch 를 abort 한다.
// 실제 정리(버블 '(중단됨)' 표기·버튼 복원)는 agentV3Send 의 catch/finally 가 처리한다.
function agentV3Stop() {
  if (_agentV3Abort) {
    try { _agentV3Abort.abort(); } catch (e) { /* noop */ }
  }
}

// ── agentV3Send — 메인 전송 함수 ─────────────────────────────────
async function agentV3Send() {
  if (_agentV3Busy) return;   // 진행 중 재진입 방지(Enter 연타 등)
  const input = document.getElementById('agentV3Input');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;

  _agentV3AppendMsg('user', _agentV3Esc(text));
  input.value = '';
  agentV3AutoGrow(input);

  _agentV3Busy = true;
  _agentV3SetSendBtnMode('stop');   // 전송 버튼 → 중단(■) 버튼으로 전환
  const thinking = _agentV3AppendMsg('agent', '<span class="agent-typing"><i></i><i></i><i></i></span>');
  const bubble = thinking ? thinking.querySelector('.agent-msg-bubble') : null;
  let acc = '';

  // 턴 단위 초기화
  _agentV3Draft = null;
  _agentV3IdRemap = {};
  let turnHadError = false;
  let turnError = false;
  let cancelled = false;
  let phase = 'stream';
  let resumePayload = null;

  try {
    _agentV3Abort = new AbortController();
    for (;;) {
      const url = phase === 'stream' ? '/agent/v3/stream' : '/agent/v3/resume';
      const body = phase === 'stream'
        ? { query: text, context: agentV3BuildContext(), threadId: _agentV3ThreadId }
        : { threadId: _agentV3ThreadId, resume: resumePayload };
      const res = await fetch(`${_AGENT_V3_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: _agentV3Abort.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      let interruptData = null;
      await _agentV3ReadSSE(res, (ev, data) => {
        if (ev === 'meta' && data.threadId) {
          _agentV3ThreadId = data.threadId;
        } else if (ev === 'token') {
          acc += (data.t || '');
          _agentV3SetReply(bubble, _agentV3Render(acc));
          _agentV3ScrollBottom();
        } else if (ev === 'interrupt') {
          interruptData = data || {};
        } else if (ev === 'error') {
          _agentV3SetReply(bubble, '⚠ ' + _agentV3Esc(data.error || '오류'));
          turnError = true;
        } else if (ev === 'intent') {
          _agentV3RenderIntent(data, bubble);
        } else if (ev === 'thought') {
          _agentV3RenderThought(data, bubble);
        } else if (ev === 'observation') {
          _agentV3RenderObservation(data, bubble);
        } else if (ev === 'plan') {
          _agentV3RenderPlan(data, bubble);
        } else if (ev === 'verdict') {
          _agentV3RenderVerdict(data, bubble);
        }
      });

      if (interruptData) {
        if (interruptData.type === 'tools_request') {
          resumePayload = (typeof AGENT_TOOL_CATALOG !== 'undefined') ? AGENT_TOOL_CATALOG : [];
          phase = 'resume';
          continue;
        }
        if (interruptData.type === 'plan_approval') {
          const approved = await _agentV3AwaitApproval(interruptData.plan || [], bubble);
          if (!approved) cancelled = true;
          resumePayload = { approved };
          phase = 'resume';
          continue;
        }
        if (interruptData.type === 'clarify') {
          // 의도불명·정보부족 → 사용자에게 되묻고 답을 resume({text})로 회신
          const ans = await _agentV3AwaitClarify(interruptData, bubble);
          resumePayload = { text: ans || '' };
          phase = 'resume';
          continue;
        }
        // tool_calls — 클라 툴 실행(드래프트) + 진행 표시
        const results = await _agentV3ExecTools(interruptData.calls || [], bubble);
        if (results.some(r => r.ok === false)) turnHadError = true;
        resumePayload = results;
        phase = 'resume';
        continue;
      }
      break; // 그래프 종료(done)
    }

    // 결과 처리: 취소 / 오류 / 부분실패 / 정상 커밋
    if (cancelled) {
      _agentV3SetReply(bubble, '취소되었습니다. (변경 없음)');
    } else if (turnError) {
      // 백엔드 오류 메시지를 그대로 유지 (드래프트 폐기)
    } else if (_agentV3Draft) {
      if (turnHadError) {
        _agentV3SetReply(bubble, (acc ? _agentV3Render(acc) + '<br>' : '')
          + '<span style="opacity:.75">⚠ 일부 작업이 실패하여 변경을 적용하지 않았습니다.</span>');
      } else {
        _agentCommitDraft(_agentV3Draft);   // 공유 읽기 자원 _agentCommitDraft (agent_tools.js)
        if (!acc) _agentV3SetReply(bubble, '✅ 완료되었습니다.');
      }
    } else if (!acc) {
      _agentV3SetReply(bubble, '(응답 없음)');
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      // 사용자 중단(중단 버튼) — thread_id 를 보존해 대화 세션 컨텍스트를 유지한다.
      // (예전엔 여기서 thread_id 를 null 로 비워, 중단 후 다음 질의가 직전 대화를 잃었다.)
      if (bubble) bubble.innerHTML = acc ? _agentV3Render(acc) + '<br><span style="opacity:.6">(중단됨)</span>' : '(중단됨)';
    } else if (e instanceof TypeError) {
      _agentV3ThreadId = null;   // 프록시 연결 실패 — 스레드 미수립이므로 초기화
      if (bubble) bubble.innerHTML = '⚠ 프록시(127.0.0.1:3737)에 연결할 수 없습니다.<br>AgenticERM 데스크탑 앱 또는 프록시를 실행하세요.';
    } else {
      _agentV3ThreadId = null;   // HTTP/백엔드 오류 — 스레드 상태 불확실하므로 안전하게 초기화
      if (bubble) bubble.innerHTML = '⚠ ' + _agentV3Esc(e.message);
      if (/키|key/i.test(e.message)) agentV3ShowKeyPrompt();
    }
  } finally {
    _agentV3Draft = null;
    _agentV3IdRemap = {};
    _agentV3Abort = null;
    _agentV3Busy = false;
    _agentV3SetSendBtnMode('send');   // 중단 버튼 → 전송(➤) 버튼으로 복원
    const _plan = bubble ? bubble.querySelector('.agent-plan') : null;
    if (_plan) _plan.classList.add('collapsed');
    if (typeof _agentV3CollapseTrace === 'function') _agentV3CollapseTrace(bubble);  // 처리 단계 접기
    _agentV3ScrollBottom();
  }
}

// ── OpenAI 키 입력 안내 ───────────────────────────────────────────
// v3 자체 키 안내 카드. v1 openAgentSettingsModal을 안내하여 공유 키스토어 사용(단방향 허용).
function agentV3ShowKeyPrompt() {
  if (document.getElementById('agentV3KeyCard')) return;
  const wrap = document.getElementById('agentV3Messages');
  if (!wrap) return;
  const card = document.createElement('div');
  card.className = 'agent-msg agent';
  card.id = 'agentV3KeyCard';
  card.innerHTML =
    '<div class="agent-msg-ava">🔑</div>' +
    '<div class="agent-msg-bubble">OpenAI API 키가 필요합니다.' +
    '<div style="margin-top:8px">' +
    '<button class="agent-send" onclick="document.getElementById(\'agentV3KeyCard\').remove();openAgentSettingsModal()" style="width:100%">⚙ Agent설정에서 키 입력</button>' +
    '</div></div>';
  wrap.appendChild(card);
  _agentV3ScrollBottom();
}
