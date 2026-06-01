// ── Agent v2 패널 셸 — 독립 컨테이너 #agentV2Panel ────────────────
// V2-M1: v1 agent_panel.js 미러. 전역 _AGENT_V2_* 접두, DOM #agentV2* 접두.
// v1 전역(_AGENT_URL·_agentThreadId·panelOpen·toggleDiagramPanel 등) 재사용·재정의 금지.
// CSS 클래스(.agent-msg·.agent-plan·.agent-step·.agent-reply 등)는 v1 것 읽기 재사용(css/* 불변).

// ── v2 패널 토글 상태 ─────────────────────────────────────────────
let _agentV2Open = false;

function toggleAgentV2Panel() {
  _agentV2Open = !_agentV2Open;
  const panel = document.getElementById('agentV2Panel');
  if (!panel) return;
  panel.style.display = _agentV2Open ? 'flex' : 'none';
  if (_agentV2Open) {
    setTimeout(() => {
      const i = document.getElementById('agentV2Input');
      if (i) i.focus();
    }, 60);
  } else if (typeof _agentV2Abort !== 'undefined' && _agentV2Abort) {
    // 패널 닫을 때 진행 중인 스트림 중단
    _agentV2Abort.abort();
  }
}

function closeAgentV2Panel() {
  _agentV2Open = false;
  const panel = document.getElementById('agentV2Panel');
  if (panel) panel.style.display = 'none';
  if (typeof _agentV2Abort !== 'undefined' && _agentV2Abort) {
    _agentV2Abort.abort();
  }
}

// ── 입력창 자동 높이 ──────────────────────────────────────────────
function agentV2AutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
}

function agentV2FillInput(text) {
  const i = document.getElementById('agentV2Input');
  if (!i) return;
  i.value = text;
  agentV2AutoGrow(i);
  i.focus();
}

function agentV2InputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    agentV2Send();
  }
}

// ── 메시지 렌더 헬퍼 ─────────────────────────────────────────────
function _agentV2Esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _agentV2AppendMsg(role, html) {
  const empty = document.getElementById('agentV2Empty');
  if (empty) empty.remove();
  const wrap = document.getElementById('agentV2Messages');
  if (!wrap) return null;
  const msg = document.createElement('div');
  msg.className = 'agent-msg ' + role;
  const ava = role === 'user' ? '🧑' : '🤖';
  msg.innerHTML = `<div class="agent-msg-ava">${ava}</div><div class="agent-msg-bubble">${html}</div>`;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
  return msg;
}

// Agent v2 응답 렌더 — marked 로 markdown 파싱(있으면), 없으면 이스케이프+<br>
function _agentV2Render(t) {
  const text = String(t == null ? '' : t);
  if (typeof marked !== 'undefined' && marked.parse) {
    try { return marked.parse(text, { breaks: true, gfm: true }); } catch (e) { /* fallback */ }
  }
  return _agentV2Esc(text).replace(/\n/g, '<br>');
}

function _agentV2ScrollBottom() {
  const wrap = document.getElementById('agentV2Messages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// 현재 ERD 요약을 v2 프록시에 전달 (v1 agentBuildContext 미러)
// 내부에서 읽는 ENTITIES·RELATIONS·AGENT_TOOL_CATALOG·entDisplayName·getActiveDiagram·selectedEntities는
// 앱 전역 공유 읽기 자원이므로 그대로 참조(불변식 ② 허용).
function agentV2BuildContext() {
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
      dbType: (typeof getActiveDiagram === 'function' && getActiveDiagram() && getActiveDiagram().dbType) || 'mysql',
      selection: (function () {
        const ids = new Set();
        if (typeof selectedEntities !== 'undefined' && selectedEntities) selectedEntities.forEach(id => ids.add(id));
        if (typeof selectedEntity !== 'undefined' && selectedEntity && selectedEntity.id) ids.add(selectedEntity.id);
        return { entityIds: [...ids] };
      })(),
      tools: (typeof AGENT_TOOL_CATALOG !== 'undefined') ? AGENT_TOOL_CATALOG : [],
    };
  } catch {
    return {};
  }
}
