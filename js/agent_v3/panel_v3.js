// ── Agent v3 패널 셸 — 독립 컨테이너 #agentV3Panel ────────────────
// V3-M1: v1 agent_panel.js / v2 panel_v2.js 미러. 전역 _AGENT_V3_* 접두, DOM #agentV3* 접두.
// v1 전역(_AGENT_URL·_agentThreadId 등)·v2 전역(_AGENT_V2_* 등) 재사용·재정의 금지(§9.1 불변식 ③).
// CSS 클래스(.agent-msg·.agent-plan·.agent-step·.agent-reply 등)는 v1 것 읽기 재사용(css/* 불변).

// ── v3 패널 토글 상태 ─────────────────────────────────────────────
let _agentV3Open = false;

function toggleAgentV3Panel() {
  _agentV3Open = !_agentV3Open;
  const panel = document.getElementById('agentV3Panel');
  if (!panel) return;
  panel.style.display = _agentV3Open ? 'flex' : 'none';
  if (_agentV3Open) {
    setTimeout(() => {
      const i = document.getElementById('agentV3Input');
      if (i) i.focus();
    }, 60);
  } else if (typeof _agentV3Abort !== 'undefined' && _agentV3Abort) {
    _agentV3Abort.abort();
  }
}

function closeAgentV3Panel() {
  _agentV3Open = false;
  const panel = document.getElementById('agentV3Panel');
  if (panel) panel.style.display = 'none';
  if (typeof _agentV3Abort !== 'undefined' && _agentV3Abort) {
    _agentV3Abort.abort();
  }
}

// ── 입력창 자동 높이 ──────────────────────────────────────────────
function agentV3AutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
}

function agentV3FillInput(text) {
  const i = document.getElementById('agentV3Input');
  if (!i) return;
  i.value = text;
  agentV3AutoGrow(i);
  i.focus();
}

function agentV3InputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    agentV3Send();
  }
}

// ── 메시지 렌더 헬퍼 ─────────────────────────────────────────────
function _agentV3Esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _agentV3AppendMsg(role, html) {
  const empty = document.getElementById('agentV3Empty');
  if (empty) empty.remove();
  const wrap = document.getElementById('agentV3Messages');
  if (!wrap) return null;
  const msg = document.createElement('div');
  msg.className = 'agent-msg ' + role;
  const ava = role === 'user' ? '🧑' : '🤖';
  msg.innerHTML = `<div class="agent-msg-ava">${ava}</div><div class="agent-msg-bubble">${html}</div>`;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
  return msg;
}

// Agent v3 응답 렌더 — marked 로 markdown 파싱(있으면), 없으면 이스케이프+<br>
function _agentV3Render(t) {
  const text = String(t == null ? '' : t);
  if (typeof marked !== 'undefined' && marked.parse) {
    try { return marked.parse(text, { breaks: true, gfm: true }); } catch (e) { /* fallback */ }
  }
  return _agentV3Esc(text).replace(/\n/g, '<br>');
}

function _agentV3ScrollBottom() {
  const wrap = document.getElementById('agentV3Messages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// 현재 ERD 요약을 v3 프록시에 전달 (v1 agentBuildContext / v2 agentV2BuildContext 미러)
// 내부에서 읽는 ENTITIES·RELATIONS·AGENT_TOOL_CATALOG 등은 앱 전역 공유 읽기 자원(불변식 ② 허용).
function agentV3BuildContext() {
  try {
    const ents = (typeof ENTITIES !== 'undefined' ? ENTITIES : []) || [];
    const rels = (typeof RELATIONS !== 'undefined' ? RELATIONS : []) || [];
    return {
      entities: ents.map(e => {
        const attrs = e.attrs || [];
        return {
          id: e.id,
          name: (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.physicalName || e.id),
          physical: e.physicalName || '',
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
