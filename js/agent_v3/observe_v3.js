// ── Agent v3 관측 핸들러 — observe_v3.js ─────────────────────────
// V3-M2: ReAct 루프의 관측 이벤트(intent·thought·observation)를 버블 안 추적(trace) 카드로 렌더한다.
// client_v3.js의 _agentV3ReadSSE onEvent 스위치에서 호출된다.
// verdict/plan 은 후속 마일스톤(M3)용 골격으로 남겨둔다.

// 버블 안 ReAct 추적 컨테이너 확보(헤더 토글 + 스텝 본문). 스텝이 들어갈 본문(.agent-react-steps)을 반환.
// reply 영역도 보장 → 토큰 스트림이 추적을 덮어쓰지 않음.
function _agentV3Trace(bubble) {
  if (!bubble) return null;
  const existing = bubble.querySelector('.agent-react-steps');
  if (existing) return existing;
  const wrap = document.createElement('div');
  wrap.className = 'agent-react-trace';
  wrap.setAttribute('style', 'margin:2px 0 6px;font-size:11px;line-height:1.45;'
    + 'border-left:2px solid var(--mauve,#cba6f7);padding-left:8px');
  const hdr = document.createElement('div');
  hdr.className = 'agent-react-hdr';
  hdr.setAttribute('style', 'cursor:pointer;opacity:.6;user-select:none;padding:1px 0');
  hdr.textContent = '▾ 처리 단계';
  hdr.onclick = function () { _agentV3ToggleTrace(wrap); };
  const body = document.createElement('div');
  body.className = 'agent-react-steps';
  body.setAttribute('style', 'display:flex;flex-direction:column;gap:2px');
  wrap.appendChild(hdr);
  wrap.appendChild(body);
  if (!bubble.querySelector('.agent-reply')) {
    // 타이핑 인디케이터 제거 + 추적/응답 영역 동시 생성
    bubble.innerHTML = '';
    bubble.appendChild(wrap);
    const reply = document.createElement('div');
    reply.className = 'agent-reply';
    bubble.appendChild(reply);
  } else {
    bubble.insertBefore(wrap, bubble.querySelector('.agent-reply'));
  }
  return body;
}

// 처리 단계 헤더 텍스트 갱신
function _agentV3TraceHdr(wrap, collapsed) {
  const hdr = wrap && wrap.querySelector('.agent-react-hdr');
  const body = wrap && wrap.querySelector('.agent-react-steps');
  if (!hdr || !body) return;
  const n = body.children.length;
  hdr.textContent = (collapsed ? '▸' : '▾') + ' 처리 단계' + (n ? ' (' + n + '단계)' : '');
}

// 헤더 클릭 → 펼침/접힘 토글
function _agentV3ToggleTrace(wrap) {
  const body = wrap && wrap.querySelector('.agent-react-steps');
  if (!body) return;
  const collapsed = body.style.display !== 'none';
  body.style.display = collapsed ? 'none' : 'flex';
  _agentV3TraceHdr(wrap, collapsed);
}

// 응답 완료 시 처리 단계 접기 (client_v3 finally 에서 호출)
function _agentV3CollapseTrace(bubble) {
  const wrap = bubble && bubble.querySelector('.agent-react-trace');
  const body = wrap && wrap.querySelector('.agent-react-steps');
  if (!body || body.style.display === 'none') return;
  body.style.display = 'none';
  _agentV3TraceHdr(wrap, true);
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

// 준수 검증(verify) 결과 — 추적에 한 줄 렌더
function _agentV3RenderVerdict(data, bubble) {
  const t = _agentV3Trace(bubble);
  if (!t || !data) return;
  const adh = data.adherence || '';
  const icon = adh === 'pass' ? '<span style="color:var(--green,#a6e3a1)">✓</span>'
    : adh === 'fail' ? '<span style="color:var(--red,#f38ba8)">✗</span>'
    : '<span style="color:var(--peach,#fab387)">◑</span>';
  const miss = (data.missing && data.missing.length) ? ' · 미충족: ' + _agentV3TraceEsc(data.missing.join(', ')) : '';
  const line = document.createElement('div');
  line.innerHTML = icon + ' <span style="opacity:.8">검증: ' + _agentV3TraceEsc(adh)
    + (data.next === 'continue' ? '(보완)' : '') + '</span>'
    + '<span style="opacity:.6">' + miss + '</span>';
  t.appendChild(line);
  _agentV3ScrollBottom();
}
// (구) plan 이벤트 — M2 ReAct 루프에선 사용 안 함. 호환용 no-op.
function _agentV3RenderPlan(data, bubble)   { /* M2 ReAct 루프 미사용 */ }

// ── clarify 되묻기 (HITL) — 질문 카드 + 답변 입력 → Promise<string|null> ──
// 백엔드 clarify 노드의 interrupt({type:'clarify', question, options})에 대응.
// 보기(options)가 있으면 버튼, 없으면 자유 입력. '건너뛰기'(빈 답)면 취소로 진행.
function _agentV3AwaitClarify(data, bubble) {
  return new Promise(resolve => {
    const q = (data && data.question) || '진행에 필요한 정보를 알려주세요.';
    const opts = (data && Array.isArray(data.options)) ? data.options : [];
    const esc = (typeof _agentV3Esc === 'function') ? _agentV3Esc : (s => String(s == null ? '' : s));
    const card = document.createElement('div');
    card.className = 'agent-clarify';
    card.setAttribute('style', 'margin:4px 0;padding:8px 10px;border:1px solid var(--surface2,#585b70);'
      + 'border-radius:8px;background:rgba(203,166,247,.08);font-size:12px');
    const optHtml = opts.map(o =>
      '<button class="agent-btn agent-clarify-opt" data-v="' + esc(String(o)) + '" '
      + 'style="margin:0 4px 4px 0">' + esc(String(o)) + '</button>').join('');
    card.innerHTML =
      '<div style="margin-bottom:6px"><span style="color:var(--mauve,#cba6f7)">❓</span> '
      + esc(q) + '</div>'
      + (optHtml ? '<div class="agent-clarify-opts" style="display:flex;flex-wrap:wrap;margin-bottom:4px">'
          + optHtml + '</div>' : '')
      + '<div style="display:flex;gap:4px">'
      + '<input class="agent-clarify-input" type="text" placeholder="답변을 입력하세요…" '
      + 'style="flex:1;padding:4px 8px;border:1px solid var(--surface2,#585b70);border-radius:6px;'
      + 'background:var(--base,#1e1e2e);color:inherit;font-size:12px">'
      + '<button class="agent-btn agent-btn-ok agent-clarify-send">보내기</button>'
      + '<button class="agent-btn agent-btn-cancel agent-clarify-skip">건너뛰기</button>'
      + '</div>';
    // 추적/응답 영역을 보장(타이핑 인디케이터 제거)하고 그 위에 질문 카드를 끼운다
    if (typeof _agentV3Trace === 'function') _agentV3Trace(bubble);
    const reply = bubble ? bubble.querySelector('.agent-reply') : null;
    if (reply && reply.parentNode) reply.parentNode.insertBefore(card, reply);
    else if (bubble) bubble.appendChild(card);
    if (typeof _agentV3ScrollBottom === 'function') _agentV3ScrollBottom();
    const input = card.querySelector('.agent-clarify-input');
    if (input) input.focus();

    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      // 카드를 컴팩트 기록으로 동결(중복 입력 방지)
      card.innerHTML =
        '<div style="opacity:.85"><span style="color:var(--mauve,#cba6f7)">❓</span> ' + esc(q) + '</div>'
        + (val ? '<div style="opacity:.7;margin-top:2px">↳ ' + esc(val) + '</div>'
               : '<div style="opacity:.6;margin-top:2px">↳ (건너뜀)</div>');
      resolve(val);
    };
    card.querySelectorAll('.agent-clarify-opt').forEach(b =>
      b.addEventListener('click', () => done(b.getAttribute('data-v') || '')));
    const send = card.querySelector('.agent-clarify-send');
    const skip = card.querySelector('.agent-clarify-skip');
    if (send) send.addEventListener('click', () => done((input && input.value.trim()) || ''));
    if (skip) skip.addEventListener('click', () => done(''));
    if (input) input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim()); }
    });
  });
}
