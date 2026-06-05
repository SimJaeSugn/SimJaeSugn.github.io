// ── Agent v3 관측 핸들러 — observe_v3.js ─────────────────────────
// V3-M2: ReAct 루프의 관측 이벤트(intent·thought·observation)를 버블 안 추적(trace) 카드로 렌더한다.
// client_v3.js의 _agentV3ReadSSE onEvent 스위치에서 호출된다.
// verdict/plan 은 후속 마일스톤(M3)용 골격으로 남겨둔다.

// 버블 안 ReAct 추적 컨테이너 확보(없으면 생성하며 reply 영역도 보장 → 토큰 스트림이 추적을 덮어쓰지 않음)
function _agentV3Trace(bubble) {
  if (!bubble) return null;
  let t = bubble.querySelector('.agent-react-trace');
  if (t) return t;
  const traceStyle = 'margin:2px 0 6px;font-size:11px;line-height:1.45;'
    + 'border-left:2px solid var(--mauve,#cba6f7);padding-left:8px;'
    + 'display:flex;flex-direction:column;gap:2px;max-height:220px;overflow-y:auto';
  if (!bubble.querySelector('.agent-reply')) {
    // 타이핑 인디케이터 제거 + 추적/응답 영역 동시 생성
    bubble.innerHTML = '<div class="agent-react-trace" style="' + traceStyle + '"></div>'
      + '<div class="agent-reply"></div>';
    return bubble.querySelector('.agent-react-trace');
  }
  t = document.createElement('div');
  t.className = 'agent-react-trace';
  t.setAttribute('style', traceStyle);
  bubble.insertBefore(t, bubble.querySelector('.agent-reply'));
  return t;
}

function _agentV3TraceEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 의도 요약 — 한 줄
function _agentV3RenderIntent(data, bubble) {
  const t = _agentV3Trace(bubble);
  if (!t || !data || !data.summary) return;
  const line = document.createElement('div');
  line.innerHTML = '<span style="color:var(--green,#a6e3a1)">🎯</span> '
    + '<span style="opacity:.85">' + _agentV3TraceEsc(data.summary) + '</span>';
  t.appendChild(line);
  _agentV3ScrollBottom();
}

// ReAct 추론(생각) + 다음 행동
function _agentV3RenderThought(data, bubble) {
  const t = _agentV3Trace(bubble);
  if (!t) return;
  const tool = data.tool === 'finish' ? '완료' : ('→ ' + _agentV3TraceEsc(data.tool || ''));
  const line = document.createElement('div');
  line.innerHTML = '<span style="color:var(--mauve,#cba6f7)">🧠</span> '
    + _agentV3TraceEsc(data.thought || '')
    + ' <span style="opacity:.55">' + tool + '</span>';
  t.appendChild(line);
  _agentV3ScrollBottom();
}

// 행동 결과(관찰)
function _agentV3RenderObservation(data, bubble) {
  const t = _agentV3Trace(bubble);
  if (!t) return;
  let obs = String((data && data.observation) || '');
  if (obs.length > 180) obs = obs.slice(0, 180) + '…';
  const line = document.createElement('div');
  line.innerHTML = '<span style="opacity:.7">👁</span> '
    + '<span style="opacity:.7">' + _agentV3TraceEsc(obs) + '</span>';
  t.appendChild(line);
  _agentV3ScrollBottom();
}

// M3 골격 — 준수 리포트
function _agentV3RenderVerdict(data, bubble) { /* M3 구현 예정 */ }
// (구) plan 이벤트 — M2 ReAct 루프에선 사용 안 함. 호환용 no-op.
function _agentV3RenderPlan(data, bubble)   { /* M2 ReAct 루프 미사용 */ }
