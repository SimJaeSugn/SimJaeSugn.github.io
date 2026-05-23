// ── 패널 열림 상태 ───────────────────────────────────────────────
let panelOpen = false;
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
  renderDiagramPanel();
  updateZoomLabel();
  render();
  saveState();
}

function renameDiagram(id, e) {
  e.stopPropagation();
  const d = diagrams.find(x => x.id === id);
  if (!d) return;
  const item = document.querySelector(`.diag-item[data-id="${id}"]`);
  if (!item) return;
  const nameEl = item.querySelector('.diag-item-name');
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

function renderDiagramPanel() {
  const list = document.getElementById('diagramList');
  list.innerHTML = '';
  diagrams.forEach(d => {
    const item = document.createElement('div');
    item.className = 'diag-item' + (d.id === activeDiagramId ? ' active' : '');
    item.dataset.id = d.id;
    item.innerHTML = `
      <span class="diag-item-name">${escHtml(d.name)}</span>
      <div class="diag-item-btns">
        <button class="diag-btn" title="이름 변경" onclick="renameDiagram('${d.id}',event)">✏</button>
        <button class="diag-btn danger" title="삭제" onclick="deleteDiagram('${d.id}',event)">✕</button>
      </div>`;
    item.addEventListener('click', () => switchDiagram(d.id));
    list.appendChild(item);
  });
  renderEntityTree();
}

// ── 엔티티 트리 렌더링 ──────────────────────────────────────────
function renderEntityTree() {
  const tree = document.getElementById('entityTree');
  if (!tree) return;
  tree.innerHTML = '';
  if (!ENTITIES.length) {
    tree.innerHTML = '<div class="tree-empty">엔티티 없음</div>';
    return;
  }
  const sorted = [...ENTITIES].sort((a, b) =>
    entDisplayName(a).localeCompare(entDisplayName(b), 'ko')
  );
  sorted.forEach(ent => {
    const id = ent.id;
    const expanded = expandedEntities.has(id);
    const name = entDisplayName(ent);
    const attrCount = (ent.attrs || []).length;

    const hdr = document.createElement('div');
    hdr.className = 'tree-ent-hdr' + (ent === selectedEntity ? ' tree-selected' : '');
    hdr.innerHTML = `
      <span class="tree-expand-icon">${expanded ? '▾' : '▸'}</span>
      <span class="tree-ent-name" title="${escHtml(name)}">${escHtml(name)}</span>
      <span class="tree-ent-count">${attrCount}</span>`;
    hdr.addEventListener('click', () => {
      if (expandedEntities.has(id)) expandedEntities.delete(id);
      else expandedEntities.add(id);
      renderEntityTree();
    });
    tree.appendChild(hdr);

    if (expanded && attrCount > 0) {
      const list = document.createElement('div');
      list.className = 'tree-attr-list';
      ent.attrs.forEach((a, idx) => {
        const row = document.createElement('div');
        row.className = 'tree-attr';
        const isLast = idx === attrCount - 1;
        const lineChar = isLast ? '└' : '├';
        const badgeCls = a.pk ? 'tree-badge tree-badge-pk' : (a.fk ? 'tree-badge tree-badge-fk' : 'tree-badge tree-badge-normal');
        const badgeTxt = a.pk ? 'PK' : (a.fk ? 'FK' : '');
        const aName = escHtml(attrDisplayName(a) || a.logicalName || a.physicalName || '');
        const aType = escHtml(a.type || '');
        row.innerHTML = `
          <span class="tree-line">${lineChar}</span>
          <span class="${badgeCls}">${badgeTxt}</span>
          <span class="tree-attr-name" title="${aName}">${aName}</span>
          <span class="tree-attr-type">${aType}</span>`;
        list.appendChild(row);
      });
      tree.appendChild(list);
    }
  });
}

// ── 패널 토글 ──────────────────────────────────────────────────
function toggleDiagramPanel() {
  panelOpen = !panelOpen;
  document.getElementById('diagramPanel').classList.toggle('collapsed', !panelOpen);
  document.getElementById('panelReopenTab').classList.toggle('visible', !panelOpen);
  const rOff = panelOpen ? PANEL_W + 12 : 12;
  document.getElementById('zoomPanel').style.right = rOff + 'px';
  render();
}

// ── 패널 디바이더 드래그 ────────────────────────────────────────
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
