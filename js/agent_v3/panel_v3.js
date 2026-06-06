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

// ── 플로팅 패널 드래그 이동 + 자유 리사이즈 (+ 위치·크기 기억) ──────────
// v3 전용 — #agentV3Panel 만 대상(v1·v2 무관). DOM/전역 모두 _agentV3* 접두.
const _AGENT_V3_BOX_KEY = 'agentV3PanelBox';      // localStorage 키
const _AGENT_V3_MIN_W = 280, _AGENT_V3_MIN_H = 220;

// 현재 패널 박스를 저장
function _agentV3SaveBox(panel) {
  try {
    const r = panel.getBoundingClientRect();
    localStorage.setItem(_AGENT_V3_BOX_KEY,
      JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height }));
  } catch { /* localStorage 불가 환경 무시 */ }
}

// 패널을 자유 배치 모드(left/top/width/height px)로 고정 — 도크 앵커(bottom/right) 해제
function _agentV3PinBox(panel, box) {
  const w = Math.max(_AGENT_V3_MIN_W, Math.min(box.width, window.innerWidth));
  const h = Math.max(_AGENT_V3_MIN_H, Math.min(box.height, window.innerHeight));
  const left = Math.max(0, Math.min(box.left, window.innerWidth - 40));
  const top = Math.max(0, Math.min(box.top, window.innerHeight - 30));
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.width = w + 'px';
  panel.style.height = h + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.maxWidth = 'none';
  panel.style.maxHeight = 'none';
  panel.style.borderRadius = '12px';   // 자유 플로팅이므로 네 모서리 둥글게
}

// 저장된 박스가 있으면 적용(뷰포트 안으로 클램프)
function _agentV3ApplySavedBox(panel) {
  let box = null;
  try { box = JSON.parse(localStorage.getItem(_AGENT_V3_BOX_KEY) || 'null'); } catch { box = null; }
  if (box && typeof box.left === 'number') _agentV3PinBox(panel, box);
}

function _agentV3InitDragResize() {
  const panel = document.getElementById('agentV3Panel');
  if (!panel || panel._dragResizeInit) return;
  panel._dragResizeInit = true;

  _agentV3ApplySavedBox(panel);   // 지난 세션 위치·크기 복원

  const header = panel.querySelector(':scope > div');   // 첫 자식 div = 헤더
  if (header) header.style.cursor = 'move';

  // 최초 상호작용 시 현재(앵커) 위치를 px 박스로 고정
  function ensurePinned() {
    if (panel.style.left && panel.style.left !== 'auto') return;
    const r = panel.getBoundingClientRect();
    _agentV3PinBox(panel, { left: r.left, top: r.top, width: r.width, height: r.height });
  }

  // ── 리사이즈 그립(우하단 코너) ──
  const grip = document.createElement('div');
  grip.title = '크기 조절';
  grip.setAttribute('style',
    'position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:3;'
    + 'background:linear-gradient(135deg,transparent 0 45%,var(--border,#585b70) 45% 55%,'
    + 'transparent 55% 65%,var(--border,#585b70) 65% 75%,transparent 75%)');
  panel.appendChild(grip);

  let mode = null;          // 'drag' | 'resize'
  let ox = 0, oy = 0, ol = 0, ot = 0, ow = 0, oh = 0;

  function onDown(e, m) {
    ensurePinned();
    mode = m;
    const r = panel.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    ol = r.left; ot = r.top; ow = r.width; oh = r.height;
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
  }

  if (header) header.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;   // 헤더의 닫기(×) 버튼 등은 드래그 제외
    onDown(e, 'drag');
  });
  grip.addEventListener('mousedown', e => onDown(e, 'resize'));

  document.addEventListener('mousemove', e => {
    if (!mode) return;
    if (mode === 'drag') {
      let nl = ol + (e.clientX - ox), nt = ot + (e.clientY - oy);
      nl = Math.max(0, Math.min(nl, window.innerWidth - 40));   // 일부는 항상 화면 안
      nt = Math.max(0, Math.min(nt, window.innerHeight - 30));
      panel.style.left = nl + 'px';
      panel.style.top = nt + 'px';
    } else {
      const nw = Math.max(_AGENT_V3_MIN_W, ow + (e.clientX - ox));
      const nh = Math.max(_AGENT_V3_MIN_H, oh + (e.clientY - oy));
      panel.style.width = nw + 'px';
      panel.style.height = nh + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (!mode) return;
    mode = null;
    document.body.style.userSelect = '';
    _agentV3SaveBox(panel);   // 이동·리사이즈 결과 기억
  });
}

// DOM 준비 시 1회 초기화(스크립트는 body 끝에서 로드되지만 안전하게 가드)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _agentV3InitDragResize);
} else {
  _agentV3InitDragResize();
}
