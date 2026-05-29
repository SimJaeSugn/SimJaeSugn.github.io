// ── 우측 패널: 목록 / Agent 탭 전환 ──────────────────────────────
function switchPanelTab(tab) {
  document.querySelectorAll('#panelTabs .panel-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.ptab === tab);
  });
  const list  = document.getElementById('panelViewList');
  const agent = document.getElementById('panelViewAgent');
  if (list)  list.classList.toggle('active', tab === 'list');
  if (agent) agent.classList.toggle('active', tab === 'agent');
  if (tab === 'agent') {
    setTimeout(() => { const i = document.getElementById('agentInput'); if (i) i.focus(); }, 60);
  }
}

// ── Agent 채팅 (UI 셸) ───────────────────────────────────────────
// 실제 Agent 백엔드(LangGraph 프록시) 연동은 추후 진행. 현재는 채팅 UI만 동작한다.

function agentAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  // 최대 높이(120px)를 넘을 때만 스크롤바 표시 — 한 줄일 땐 숨김
  el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
}

function agentFillInput(text) {
  const i = document.getElementById('agentInput');
  if (!i) return;
  i.value = text;
  agentAutoGrow(i);
  i.focus();
}

function agentInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    agentSend();
  }
}

function _agentEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _agentAppendMsg(role, html) {
  const empty = document.getElementById('agentEmpty');
  if (empty) empty.remove();
  const wrap = document.getElementById('agentMessages');
  const msg = document.createElement('div');
  msg.className = 'agent-msg ' + role;
  const ava = role === 'user' ? '🧑' : '🤖';
  msg.innerHTML = `<div class="agent-msg-ava">${ava}</div><div class="agent-msg-bubble">${html}</div>`;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
  return msg;
}

function agentSend() {
  const input = document.getElementById('agentInput');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;

  _agentAppendMsg('user', _agentEsc(text));
  input.value = '';
  agentAutoGrow(input);

  // 입력 중 인디케이터 → 안내 메시지 (백엔드 미연동 상태)
  const thinking = _agentAppendMsg('agent', '<span class="agent-typing"><i></i><i></i><i></i></span>');
  setTimeout(() => {
    const bubble = thinking.querySelector('.agent-msg-bubble');
    if (bubble) {
      bubble.innerHTML = 'ⓘ Agent 백엔드는 아직 연동되지 않았습니다.<br>현재는 채팅 UI 미리보기입니다.';
    }
    const wrap = document.getElementById('agentMessages');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }, 700);
}
