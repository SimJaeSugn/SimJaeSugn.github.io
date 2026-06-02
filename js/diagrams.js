// ── 패널 열림 상태 ───────────────────────────────────────────────
let panelOpen = false;

// 마우스 위치 추적 (hover 강제 재평가용)
let _pmx = 0, _pmy = 0;
document.addEventListener('mousemove', e => { _pmx = e.clientX; _pmy = e.clientY; }, { passive: true, capture: true });
let expandedEntities = new Set();

// ── 다이어그램 패널 관리 ─────────────────────────────────────────
function showNewDiagModal() {
  const inp = document.getElementById('newDiagNameInput');
  inp.value = '';
  document.getElementById('newDiagOverlay').classList.add('active');
  setTimeout(() => inp.focus(), 50);
}
function closeNewDiagModal() {
  document.getElementById('newDiagOverlay').classList.remove('active');
}
function confirmNewDiag() {
  const name = document.getElementById('newDiagNameInput').value.trim() || '새 다이어그램';
  closeNewDiagModal();
  const d = createEmptyDiagram(name);
  flushCurrentState();
  diagrams.push(d);
  activeDiagramId = d.id;
  loadDiagramIntoWorkspace(d);
  pasteCount = 0;
  selectedEntity = null;
  if (typeof selectedEntities !== 'undefined') selectedEntities.clear();
  if (typeof hidePropPanel === 'function') hidePropPanel();
  renderDiagramPanel();
  updateZoomLabel();
  render();
  saveState();
}

function switchDiagram(id) {
  if (id === activeDiagramId) return;
  flushCurrentState();
  activeDiagramId = id;
  loadDiagramIntoWorkspace(getActiveDiagram());
  pasteCount = 0;
  selectedEntity = null;
  if (typeof selectedEntities !== 'undefined') selectedEntities.clear();
  if (typeof hidePropPanel === 'function') hidePropPanel();
  renderDiagramPanel();
  updateZoomLabel();
  render();
  saveState();
}

function renameDiagram(id, e) {
  e.stopPropagation();
  const d = diagrams.find(x => x.id === id);
  if (!d) return;
  const item = document.querySelector(`.ex-diag-item[data-id="${id}"]`);
  if (!item) return;
  const nameEl = item.querySelector('.ex-diag-name');
  const oldName = d.name;
  const input = document.createElement('input');
  input.className = 'diag-rename-input';
  input.value = oldName;
  nameEl.replaceWith(input);
  input.focus(); input.select();
  const commit = () => {
    const newName = input.value.trim() || oldName;
    d.name = newName;
    renderDiagramPanel();
    saveState();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
  });
}

function deleteDiagram(id, e) {
  e.stopPropagation();
  if (diagrams.length <= 1) { alert('마지막 다이어그램은 삭제할 수 없습니다.'); return; }
  const d = diagrams.find(x => x.id === id);
  if (!d) return;
  askConfirm(`'${d.name}' 다이어그램을 삭제합니다.`, () => {
    const idx = diagrams.indexOf(d);
    diagrams.splice(idx, 1);
    if (activeDiagramId === id) {
      const next = diagrams[Math.max(0, idx - 1)];
      activeDiagramId = next.id;
      loadDiagramIntoWorkspace(next);
      updateZoomLabel();
      render();
    }
    renderDiagramPanel();
    saveState();
  }, '삭제');
}

const DIAG_TAB_COLORS = [
  { id: null,     bg: '#585b70', label: '기본' },
  { id: 'blue',   bg: '#89b4fa', label: '파랑' },
  { id: 'green',  bg: '#a6e3a1', label: '초록' },
  { id: 'orange', bg: '#fab387', label: '주황' },
  { id: 'red',    bg: '#f38ba8', label: '빨강' },
  { id: 'purple', bg: '#cba6f7', label: '보라' },
  { id: 'yellow', bg: '#f9e2af', label: '노랑' },
  { id: 'teal',   bg: '#89dceb', label: '하늘' },
];

// 다이어그램·엔티티 목록은 좌측 탐색기(explorer.js)로 이관되었다.
// 이 함수는 호환을 위해 유지하되, 좌측 탐색기 렌더를 위임 호출한다.
function renderDiagramPanel() {
  if (typeof renderExplorerDiagrams === 'function') renderExplorerDiagrams();
  renderEntityTree();
}

// ── 다이어그램 탭 색상 피커 ────────────────────────────────────────
let _diagColorTargetId = null;

function openDiagColorPicker(diagId, e) {
  e.stopPropagation();
  _diagColorTargetId = diagId;
  let picker = document.getElementById('diagColorPicker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'diagColorPicker';
    document.body.appendChild(picker);
  }
  const d = diagrams.find(x => x.id === diagId);
  picker.innerHTML = DIAG_TAB_COLORS.map(c => {
    const active = (c.id === (d?.tabColor || null)) ? ' active' : '';
    return `<div class="ctx-color-swatch${active}" title="${c.label}"
      style="background:${c.bg};"
      onclick="applyDiagTabColor(${c.id === null ? 'null' : `'${c.id}'`})"></div>`;
  }).join('');
  const rect = e.target.getBoundingClientRect();
  picker.style.left = rect.left + 'px';
  picker.style.top  = (rect.bottom + 4) + 'px';
  picker.classList.add('open');
  setTimeout(() => {
    document.addEventListener('click', function _close(ev) {
      if (!picker.contains(ev.target)) { picker.classList.remove('open'); document.removeEventListener('click', _close); }
    });
  }, 0);
}

function applyDiagTabColor(colorId) {
  const d = diagrams.find(x => x.id === _diagColorTargetId);
  if (!d) return;
  d.tabColor = (colorId === 'null' || colorId === null) ? null : colorId;
  document.getElementById('diagColorPicker')?.classList.remove('open');
  renderDiagramPanel();
  saveState();
}

// ── 엔티티 트리 렌더링 ──────────────────────────────────────────
// 엔티티 목록도 좌측 탐색기(explorer.js)로 이관되었다. 호환을 위해 함수명을 유지하되
// 좌측 탐색기 엔티티 렌더로 위임한다. (여러 모듈이 renderEntityTree()를 호출함)
function renderEntityTree() {
  if (typeof renderExplorerEntities === 'function') renderExplorerEntities();
}

// ── 패널 토글 ──────────────────────────────────────────────────
function toggleDiagramPanel() {
  panelOpen = !panelOpen;
  const panel = document.getElementById('diagramPanel');

  if (panelOpen) {
    panel.style.visibility = '';
    panel.classList.remove('collapsed');
    panel.style.transform = '';
  } else {
    panel.classList.add('collapsed');
    panel.style.transform = `translateX(${PANEL_W}px)`;
    panel.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'transform') return;
      panel.removeEventListener('transitionend', onEnd);
      if (!panelOpen) panel.style.visibility = 'hidden';
    });
    // transform 적용 직후 현재 마우스 위치에서 hit-test 재실행 → stale :hover 소거
    requestAnimationFrame(() => {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, view: window,
        clientX: _pmx, clientY: _pmy
      }));
    });
  }

  document.getElementById('panelReopenTab').classList.toggle('visible', !panelOpen);
  const rOff = panelOpen ? PANEL_W + 12 : 12;
  const _zp = document.getElementById('zoomPanel');
  if (_zp) _zp.style.right = rOff + 'px';
  const _mbiR = document.getElementById('mbi-right');
  if (_mbiR) { const chk = _mbiR.querySelector('.mb-chk'); if (chk) chk.textContent = panelOpen ? '✓' : ''; }
  if (typeof _syncLayoutButtons === 'function') _syncLayoutButtons();
  render();
}

// ── 패널 폭 드래그 조절 ──────────────────────────────────────────
(function initPanelWidthResize() {
  let dragging = false, startX = 0, startW = 0;
  window.addEventListener('DOMContentLoaded', () => {
    const handle = document.getElementById('panelWidthHandle');
    const panel  = document.getElementById('diagramPanel');
    if (!handle || !panel) return;
    const saved = parseInt(localStorage.getItem('_panelW') || '0');
    if (saved >= 160 && saved !== 240) {
      panel.style.width = saved + 'px';
      PANEL_W = saved;
    }
    if (!panelOpen) { panel.style.transform = `translateX(${PANEL_W}px)`; panel.style.visibility = 'hidden'; }
    handle.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = panel.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newW = Math.max(160, Math.min(480, startW - (e.clientX - startX)));
      panel.style.width = newW + 'px';
      PANEL_W = newW;
      render();
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      try { localStorage.setItem('_panelW', PANEL_W); } catch {}
    });
  });
})();

// ── 패널 디바이더 드래그 ──────────────────────────────────────────
(function initPanelDivider() {
  let dragging = false, startY = 0, startH = 0;
  window.addEventListener('DOMContentLoaded', () => {
    const divider = document.getElementById('panelDivider');
    const panelTop = document.getElementById('panelTop');
    if (!divider || !panelTop) return;
    divider.addEventListener('mousedown', e => {
      dragging = true;
      startY = e.clientY;
      startH = panelTop.offsetHeight;
      divider.classList.add('dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const panel = document.getElementById('diagramPanel');
      const panelH = panel ? panel.offsetHeight : window.innerHeight;
      const minH = 64, maxH = panelH - 64 - 6;
      let newH = Math.min(maxH, Math.max(minH, startH + (e.clientY - startY)));
      panelTop.style.height = newH + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.getElementById('panelDivider')?.classList.remove('dragging');
    });
  });
})();

// ── 다이어그램 비교(diff) ────────────────────────────────────────
function openDiffModal(snapId) {
  const snap = SNAPSHOTS.find(s => s.id === snapId);
  if (!snap) return;
  flushCurrentState();
  const curDiag  = getActiveDiagram();
  const snapState = JSON.parse(snap.state);
  const snapDiag  = snapState.diagrams?.find(d => d.id === curDiag.id) || snapState.diagrams?.[0];
  if (!snapDiag) { showToast('스냅샷에 비교할 다이어그램이 없습니다.'); return; }
  const curE  = curDiag.entities  || [];
  const snapE = snapDiag.entities || [];
  const curR  = curDiag.relations  || [];
  const snapR = snapDiag.relations || [];
  const curMap = {}; curE.forEach(e => curMap[e.id] = e);
  const snapMap= {}; snapE.forEach(e => snapMap[e.id] = e);
  const added    = curE.filter(e => !snapMap[e.id]);
  const removed  = snapE.filter(e => !curMap[e.id]);
  const modified = curE.filter(e => {
    const s = snapMap[e.id]; if (!s) return false;
    return JSON.stringify(e.attrs) !== JSON.stringify(s.attrs) ||
           e.logicalName !== s.logicalName || e.physicalName !== s.physicalName;
  });
  const addedRels   = curR.filter(r => !snapR.some(sr => sr.from===r.from && sr.to===r.to));
  const removedRels = snapR.filter(r => !curR.some(cr => cr.from===r.from && cr.to===r.to));
  const allEntMap = {}; [...curE, ...snapE].forEach(e => allEntMap[e.id] = e);
  const entLabel = id => escHtml(allEntMap[id]?.logicalName || id);
  let html = `<p style="color:#6c7086;font-size:12px;margin-bottom:14px">스냅샷: <b style="color:#cdd6f4">${escHtml(snap.name)}</b></p>`;
  if (!added.length && !removed.length && !modified.length && !addedRels.length && !removedRels.length) {
    html += '<p style="color:#a6e3a1;text-align:center;padding:24px">변경사항이 없습니다.</p>';
  }
  const section = (title, cls, items, renderFn) => {
    if (!items.length) return '';
    return `<div class="diff-section"><div class="diff-section-title" style="color:${cls==='diff-added'?'#a6e3a1':cls==='diff-removed'?'#f38ba8':'#fab387'}">${title} (${items.length})</div>
      ${items.map(renderFn).join('')}</div>`;
  };
  html += section('+ 추가된 엔티티', 'diff-added', added, e =>
    `<div class="diff-row diff-added">${escHtml(e.logicalName||'')}${e.physicalName?` <span style="color:#45475a;font-size:11px">(${escHtml(e.physicalName)})</span>`:''} <span style="color:#45475a;font-size:11px">${e.attrs?.length||0}개 속성</span></div>`);
  html += section('- 삭제된 엔티티', 'diff-removed', removed, e =>
    `<div class="diff-row diff-removed">${escHtml(e.logicalName||'')}${e.physicalName?` <span style="color:#45475a;font-size:11px">(${escHtml(e.physicalName)})</span>`:''}</div>`);
  html += section('~ 변경된 엔티티', 'diff-modified', modified, e => {
    const s = snapMap[e.id];
    const curNames  = (e.attrs||[]).map(a => a.physicalName||a.logicalName);
    const snapNames = (s.attrs||[]).map(a => a.physicalName||a.logicalName);
    const addedA    = curNames.filter(n => !snapNames.includes(n));
    const removedA  = snapNames.filter(n => !curNames.includes(n));
    const nameChg   = (e.logicalName!==s.logicalName||e.physicalName!==s.physicalName)
      ? `<span style="color:#45475a;font-size:11px"> 이름 변경</span>` : '';
    return `<div class="diff-row diff-modified">${escHtml(e.logicalName||'')}${nameChg}
      ${addedA.length||removedA.length ? `<div class="diff-attr">${addedA.map(n=>`<span style="color:#a6e3a1;margin-right:6px">+${escHtml(n)}</span>`).join('')}${removedA.map(n=>`<span style="color:#f38ba8;margin-right:6px">-${escHtml(n)}</span>`).join('')}</div>` : ''}</div>`;
  });
  if (addedRels.length || removedRels.length) {
    html += `<div class="diff-section"><div class="diff-section-title" style="color:#89b4fa">관계 변경</div>
      ${addedRels.map(r=>`<div class="diff-row diff-added" style="font-size:12px">+ ${entLabel(r.from)} → ${entLabel(r.to)} (${escHtml(r.card)})</div>`).join('')}
      ${removedRels.map(r=>`<div class="diff-row diff-removed" style="font-size:12px">- ${entLabel(r.from)} → ${entLabel(r.to)} (${escHtml(r.card)})</div>`).join('')}
    </div>`;
  }
  document.getElementById('diffContent').innerHTML = html;
  closeSnapshotModal();
  document.getElementById('diffOverlay').classList.add('active');
}
function closeDiffModal() {
  document.getElementById('diffOverlay').classList.remove('active');
}
