// ── 좌측 Explorer 패널 (VSCode 스타일) ───────────────────────────
// 다이어그램 목록 + 엔티티 목록을 좌측 사이드바로 제공한다.
// 데이터·전환·포커스 로직은 기존 전역(diagrams·ENTITIES·switchDiagram·jumpToEntity)을
// 그대로 재사용한다. 우측 #diagramPanel 과 독립적으로 동작한다.

let explorerOpen   = false;        // 패널 열림 상태 (캔버스 좌측 오프셋 계산에 사용)
let EXPLORER_W     = 240;          // 패널 폭(px) — canvas.js _qbLeftOff()에서 참조
let _exDiagSecOpen = true;         // '다이어그램' 섹션 펼침 여부
let _exEntSecOpen  = true;         // '엔티티' 섹션 펼침 여부
let _exEntExpanded = new Set();    // 속성까지 펼친 엔티티 id 집합

// ── 좌측 도킹된 퀵바가 차지하는 폭 ───────────────────────────────
// 퀵바가 좌측에 도킹돼 있으면 그만큼 오른쪽에서 패널을 시작해 겹침을 피한다.
function _exLeftBase() {
  if (typeof _quickbarOpen !== 'undefined' && _quickbarOpen &&
      typeof _qbDock !== 'undefined' && _qbDock === 'left')
    return (typeof _qbBarW === 'function' ? _qbBarW() : 42);
  return 0;
}

// ── 패널 토글 ──────────────────────────────────────────────────
function toggleExplorerPanel() {
  explorerOpen = !explorerOpen;
  _applyExplorerState();
  try { localStorage.setItem('_explorerOpen', explorerOpen ? '1' : '0'); } catch {}
  if (typeof render === 'function') render();
}

// 현재 explorerOpen 값에 맞춰 DOM 표시·위치·메뉴 체크를 적용한다.
function _applyExplorerState() {
  const panel = document.getElementById('explorerPanel');
  const tab   = document.getElementById('explorerReopenTab');
  if (!panel) return;
  const base = _exLeftBase();
  panel.style.left = base + 'px';
  if (tab) tab.style.left = base + 'px';

  if (explorerOpen) {
    panel.style.visibility = '';
    panel.classList.remove('collapsed');
    panel.style.transform = '';
  } else {
    panel.classList.add('collapsed');
    panel.style.transform = 'translateX(-100%)';
    panel.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'transform') return;
      panel.removeEventListener('transitionend', onEnd);
      if (!explorerOpen) panel.style.visibility = 'hidden';
    });
  }
  if (tab) tab.classList.toggle('visible', !explorerOpen);

  // 좌측 하단 플로팅 패널(범례·미니맵)이 Explorer에 덮이지 않도록 left 보정
  const blp = document.getElementById('bottomLeftPanel');
  if (blp) blp.style.left = (base + (explorerOpen ? EXPLORER_W : 0) + 16) + 'px';

  const mbi = document.getElementById('mbi-explorer');
  if (mbi) { const chk = mbi.querySelector('.mb-chk'); if (chk) chk.textContent = explorerOpen ? '✓' : ''; }
  if (typeof _syncLayoutButtons === 'function') _syncLayoutButtons();
}

// ── 아코디언 섹션 토글 ─────────────────────────────────────────
function toggleExDiagSection() {
  _exDiagSecOpen = !_exDiagSecOpen;
  renderExplorerDiagrams();
}
function toggleExEntSection() {
  _exEntSecOpen = !_exEntSecOpen;
  renderExplorerEntities();
}

// ── 다이어그램 목록 렌더 ───────────────────────────────────────
function renderExplorerDiagrams() {
  const sec  = document.getElementById('exDiagSection');
  const list = document.getElementById('exDiagramList');
  if (!sec || !list) return;

  sec.classList.toggle('collapsed', !_exDiagSecOpen);
  const caret = sec.querySelector('.ex-sec-caret');
  if (caret) caret.textContent = _exDiagSecOpen ? '▾' : '▸';

  list.innerHTML = '';
  if (typeof diagrams === 'undefined' || !diagrams.length) {
    list.innerHTML = '<div class="tree-empty">다이어그램 없음</div>';
    return;
  }
  let _dragSrc = null;
  const COLORS = (typeof DIAG_TAB_COLORS !== 'undefined') ? DIAG_TAB_COLORS : [{ id: null, bg: '#585b70' }];

  diagrams.forEach(d => {
    const item = document.createElement('div');
    item.className = 'ex-diag-item' + (d.id === activeDiagramId ? ' active' : '');
    item.dataset.id = d.id;
    item.draggable = true;

    const tabColor = COLORS.find(c => c.id === (d.tabColor || null)) || COLORS[0];
    item.style.borderLeftColor = tabColor.bg;

    // ▼ 신규: DB 다이어그램 배지
    const _dbBadge = (d.source === 'db' && d.connection?.profileName)
      ? `<span class="diag-db-badge" title="DB 연결: ${escHtml(d.connection.profileName)}">DB</span>`
      : '';

    // M5-2: DB 다이어그램 전용 포워드 엔지니어링 버튼
    const _feBtnHtml = (d.source === 'db')
      ? `<button class="diag-btn" title="포워드 엔지니어링 (ERD→DB DDL 실행)"
           onclick="event.stopPropagation();_openFEForDbDiagram(diagrams.find(x=&gt;x.id===${JSON.stringify(d.id)}))">⬆</button>`
      : '';

    item.innerHTML = `
      <span class="diag-color-dot" title="탭 색상 변경" style="background:${tabColor.bg};"
        onclick="openDiagColorPicker('${d.id}',event)"></span>
      <span class="ex-diag-name" title="${escHtml(d.name)}">${escHtml(d.name)}</span>
      ${_dbBadge}
      <div class="diag-item-btns">
        ${_feBtnHtml}
        <button class="diag-btn" title="이름 변경" onclick="renameDiagram('${d.id}',event)">✏</button>
        <button class="diag-btn danger" title="삭제" onclick="deleteDiagram('${d.id}',event)">✕</button>
      </div>`;

    item.addEventListener('click', e => {
      if (e.target.closest('.diag-item-btns') || e.target.classList.contains('diag-color-dot')) return;
      if (typeof switchDiagram === 'function') switchDiagram(d.id);
    });

    // 드래그로 순서 변경
    item.addEventListener('dragstart', e => {
      _dragSrc = d.id; e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.style.opacity = '0.4', 0);
    });
    item.addEventListener('dragend', () => { item.style.opacity = ''; });
    item.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      item.style.background = 'var(--sel-bg)';
    });
    item.addEventListener('dragleave', () => { item.style.background = ''; });
    item.addEventListener('drop', e => {
      e.preventDefault(); item.style.background = '';
      if (!_dragSrc || _dragSrc === d.id) return;
      const fromIdx = diagrams.findIndex(x => x.id === _dragSrc);
      const toIdx   = diagrams.findIndex(x => x.id === d.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = diagrams.splice(fromIdx, 1);
      diagrams.splice(toIdx, 0, moved);
      _dragSrc = null;
      if (typeof renderDiagramPanel === 'function') renderDiagramPanel();
      if (typeof saveState === 'function') saveState();
    });

    list.appendChild(item);
  });
}

// ── 엔티티 목록 렌더 ───────────────────────────────────────────
function renderExplorerEntities() {
  const sec  = document.getElementById('exEntSection');
  const tree = document.getElementById('exEntList');
  if (!sec || !tree) return;

  sec.classList.toggle('collapsed', !_exEntSecOpen);
  const caret = sec.querySelector('.ex-sec-caret');
  if (caret) caret.textContent = _exEntSecOpen ? '▾' : '▸';
  const cnt = sec.querySelector('.ex-sec-count');
  if (cnt) cnt.textContent = (typeof ENTITIES !== 'undefined') ? ENTITIES.length : 0;

  tree.innerHTML = '';
  if (typeof ENTITIES === 'undefined' || !ENTITIES.length) {
    tree.innerHTML = '<div class="tree-empty">엔티티 없음</div>';
    return;
  }
  const sorted = [...ENTITIES].sort((a, b) =>
    entDisplayName(a).localeCompare(entDisplayName(b), 'ko')
  );
  sorted.forEach(ent => {
    const id = ent.id;
    const expanded = _exEntExpanded.has(id);
    const name = entDisplayName(ent);
    const attrCount = (ent.attrs || []).length;

    const hdr = document.createElement('div');
    hdr.className = 'tree-ent-hdr' + (ent === selectedEntity ? ' tree-selected' : '');
    hdr.innerHTML = `
      <span class="tree-expand-icon">${expanded ? '▾' : '▸'}</span>
      <span class="tree-ent-name" title="${escHtml(name)}">${escHtml(name)}</span>
      <span class="tree-ent-count">${attrCount}</span>`;
    // 캐럿 클릭 → 속성 펼침/접힘 / 이름 클릭 → 캔버스에서 포커스
    hdr.querySelector('.tree-expand-icon').addEventListener('click', e => {
      e.stopPropagation();
      if (_exEntExpanded.has(id)) _exEntExpanded.delete(id);
      else _exEntExpanded.add(id);
      renderExplorerEntities();
    });
    hdr.addEventListener('click', () => {
      if (typeof jumpToEntity === 'function') jumpToEntity(id);
      renderExplorerEntities();
    });
    tree.appendChild(hdr);

    if (expanded && attrCount > 0) {
      const alist = document.createElement('div');
      alist.className = 'tree-attr-list';
      ent.attrs.forEach((a, idx) => {
        const row = document.createElement('div');
        row.className = 'tree-attr';
        const isLast   = idx === attrCount - 1;
        const lineChar = isLast ? '└' : '├';
        const badgeCls = a.kind === 'pk' ? 'tree-badge tree-badge-pk' : (a.kind === 'fk' ? 'tree-badge tree-badge-fk' : 'tree-badge tree-badge-normal');
        const badgeTxt = a.kind === 'pk' ? 'PK' : (a.kind === 'fk' ? 'FK' : '');
        const aName = escHtml(attrDisplayName(a) || a.logicalName || a.physicalName || '');
        const aType = escHtml(a.type || '');
        row.innerHTML = `
          <span class="tree-line">${lineChar}</span>
          <span class="${badgeCls}">${badgeTxt}</span>
          <span class="tree-attr-name" title="${aName}">${aName}</span>
          <span class="tree-attr-type">${aType}</span>`;
        alist.appendChild(row);
      });
      tree.appendChild(alist);
    }
  });
}

// ── 전체 렌더 (외부에서 호출) ──────────────────────────────────
function renderExplorer() {
  renderExplorerDiagrams();
  renderExplorerEntities();
}

// ── 초기화 ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // 저장된 열림 상태 복원 (기본값: 열림)
  let saved = '1';
  try { saved = localStorage.getItem('_explorerOpen'); } catch {}
  explorerOpen = (saved !== '0');
  _applyExplorerState();
  renderExplorer();
  if (explorerOpen && typeof render === 'function') render();
});
