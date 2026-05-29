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
  } else if (_agentAbort) {
    // Agent 탭을 떠나면 진행 중인 스트림 중단
    _agentAbort.abort();
  }
}

// ── Agent 채팅 — 프록시 /agent/stream (LangGraph) 연동 (M1) ───────
// M1: 직접 응답(ANSWER) 토큰 스트리밍. 행동(ACT) 실행은 M2+ 에서 추가.
const _AGENT_URL = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
let _agentThreadId = null;
let _agentAbort = null;

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

function _agentRender(t) { return _agentEsc(t).replace(/\n/g, '<br>'); }

function _agentScrollBottom() {
  const wrap = document.getElementById('agentMessages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// 현재 ERD 요약을 프록시에 전달 (읽기성 질문·맥락용)
function agentBuildContext() {
  try {
    const ents = (typeof ENTITIES !== 'undefined' ? ENTITIES : []) || [];
    const rels = (typeof RELATIONS !== 'undefined' ? RELATIONS : []) || [];
    return {
      entities: ents.map(e => {
        const attrs = e.attrs || [];
        return {
          id: e.id,
          name: (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.physicalName || e.id),
          pk: attrs.filter(a => a.kind === 'pk').map(a => a.physicalName || a.logicalName),
          cols: attrs.length,
        };
      }),
      relations: rels.map(r => ({ from: r.from, to: r.to, card: r.card })),
      activeDiagram: (typeof getActiveDiagram === 'function' && getActiveDiagram()) ? getActiveDiagram().name : null,
    };
  } catch {
    return {};
  }
}

// fetch 기반 SSE 스트림 파서 (POST 라서 EventSource 대신 직접 파싱)
async function _agentReadSSE(res, onEvent) {
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

async function agentSend() {
  const input = document.getElementById('agentInput');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;

  _agentAppendMsg('user', _agentEsc(text));
  input.value = '';
  agentAutoGrow(input);

  const sendBtn = document.getElementById('agentSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  const thinking = _agentAppendMsg('agent', '<span class="agent-typing"><i></i><i></i><i></i></span>');
  const bubble = thinking.querySelector('.agent-msg-bubble');
  let acc = '';

  try {
    _agentAbort = new AbortController();
    const res = await fetch(`${_AGENT_URL}/agent/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text, context: agentBuildContext(), threadId: _agentThreadId }),
      signal: _agentAbort.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    await _agentReadSSE(res, (ev, data) => {
      if (ev === 'meta' && data.threadId) {
        _agentThreadId = data.threadId;
      } else if (ev === 'token') {
        acc += (data.t || '');
        bubble.innerHTML = _agentRender(acc);
        _agentScrollBottom();
      } else if (ev === 'error') {
        bubble.innerHTML = '⚠ ' + _agentEsc(data.error || '오류');
      } else if (ev === 'done') {
        if (!acc) bubble.innerHTML = '(응답 없음)';
      }
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      bubble.innerHTML = acc ? _agentRender(acc) + '<br><span style="opacity:.6">(중단됨)</span>' : '(중단됨)';
    } else if (e instanceof TypeError) {
      bubble.innerHTML = '⚠ 프록시(127.0.0.1:3737)에 연결할 수 없습니다.<br>UXERManager 데스크탑 앱 또는 프록시를 실행하세요.';
    } else {
      bubble.innerHTML = '⚠ ' + _agentEsc(e.message);
      if (/키|key/i.test(e.message)) agentShowKeyPrompt();
    }
  } finally {
    _agentAbort = null;
    if (sendBtn) sendBtn.disabled = false;
    _agentScrollBottom();
  }
}

// ── OpenAI 키 입력 (미설정 시) ───────────────────────────────────
function agentShowKeyPrompt() {
  if (document.getElementById('agentKeyCard')) return;
  const wrap = document.getElementById('agentMessages');
  if (!wrap) return;
  const card = document.createElement('div');
  card.className = 'agent-msg agent';
  card.id = 'agentKeyCard';
  card.innerHTML =
    '<div class="agent-msg-ava">🔑</div>' +
    '<div class="agent-msg-bubble">OpenAI API 키를 입력하세요. (프록시에 암호화 저장)' +
    '<div style="display:flex;gap:6px;margin-top:8px">' +
    '<input id="agentKeyInput" type="password" class="agent-input" style="flex:1;max-height:none;overflow:hidden" placeholder="sk-..." />' +
    '<button class="agent-send" onclick="agentSaveKey()" title="저장">저장</button>' +
    '</div></div>';
  wrap.appendChild(card);
  _agentScrollBottom();
  setTimeout(() => { const i = document.getElementById('agentKeyInput'); if (i) i.focus(); }, 50);
}

async function agentSaveKey() {
  const inp = document.getElementById('agentKeyInput');
  const key = (inp && inp.value || '').trim();
  if (!key) return;
  try {
    const res = await fetch(`${_AGENT_URL}/agent/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    });
    if (!res.ok) throw new Error('저장 실패');
    const card = document.getElementById('agentKeyCard');
    if (card) card.remove();
    _agentAppendMsg('agent', '✅ 키가 저장되었습니다. 다시 질문해 주세요.');
  } catch (e) {
    _agentAppendMsg('agent', '⚠ 키 저장 실패: ' + _agentEsc(e.message));
  }
}
