// ── HTML 이스케이프 ──────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── 상태 표시줄 ──────────────────────────────────────────────────
function updateStatusBar() {
  const sbE = document.getElementById('sb-entities');
  const sbR = document.getElementById('sb-relations');
  const sbN = document.getElementById('sb-notes');
  const sbS = document.getElementById('sb-sel-wrap');
  const sbT = document.getElementById('sb-sel-text');
  const sbZ = document.getElementById('sb-zoom-stat');
  if (sbE) sbE.textContent = `엔티티 ${ENTITIES.length}`;
  if (sbR) sbR.textContent = `관계 ${RELATIONS.length}`;
  if (sbN) sbN.textContent = `메모 ${(typeof NOTES !== 'undefined' ? NOTES.length : 0) + (typeof NOTES_V2 !== 'undefined' ? NOTES_V2.length : 0)}`;
  const sel = typeof selectedEntities !== 'undefined' ? selectedEntities.size : 0;
  if (sbS && sbT) { sbT.textContent = `선택 ${sel}개`; sbS.style.display = sel ? '' : 'none'; }
  if (sbZ) sbZ.textContent = `${Math.round((typeof scale !== 'undefined' ? scale : 1) * 100)}%`;
}

// ── 토스트 알림 ──────────────────────────────────────────────────
function showToast(msg) {
  document.querySelector('.erd-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'erd-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

// ── 메뉴바 ───────────────────────────────────────────────────────
let _mbOpen = null;

function mbToggle(id) {
  if (_mbOpen === id) { mbClose(); return; }
  mbClose();
  _mbOpen = id;
  const drop = document.getElementById('mb-drop-' + id);
  const lbl  = drop?.previousElementSibling;
  if (!drop || !lbl) return;
  const rect = lbl.getBoundingClientRect();
  drop.style.left = rect.left + 'px';
  drop.style.top  = rect.bottom + 'px';
  drop.classList.add('open');
  lbl.classList.add('open');
}

function mbHover(id) {
  if (_mbOpen && _mbOpen !== id) mbToggle(id);
}

function mbClose() {
  if (!_mbOpen) return;
  const drop = document.getElementById('mb-drop-' + _mbOpen);
  if (drop) {
    drop.classList.remove('open');
    drop.previousElementSibling?.classList.remove('open');
  }
  _mbOpen = null;
}

document.addEventListener('click', e => {
  if (!e.target.closest('#menubar')) mbClose();
});

function syncToolDropdownLabels() {
  // 메뉴바 체크 표시
  const logEl = document.getElementById('mbi-logical');
  const phyEl = document.getElementById('mbi-physical');
  if (logEl) logEl.querySelector('.mb-chk').textContent = viewMode === 'logical' ? '✓' : '';
  if (phyEl) phyEl.querySelector('.mb-chk').textContent = viewMode === 'physical' ? '✓' : '';
  const notEl = document.getElementById('mbi-notation');
  if (notEl) notEl.querySelector('.mb-chk').textContent = notationStyle === 'crowsfoot' ? '✓' : '';
  const snapEl = document.getElementById('mbi-snap');
  if (snapEl) snapEl.querySelector('.mb-chk').textContent = gridSnap ? '✓' : '';
  const secEl = document.getElementById('mbi-section');
  if (secEl) secEl.querySelector('.mb-chk').textContent = sectionMode ? '✓' : '';
  // 퀵바 토글 버튼 활성 상태
  document.getElementById('qb-logical')?.classList.toggle('active', viewMode === 'logical');
  document.getElementById('qb-physical')?.classList.toggle('active', viewMode === 'physical');
  document.getElementById('qb-snap')?.classList.toggle('active', !!gridSnap);
  document.getElementById('qb-section')?.classList.toggle('active', !!sectionMode);
}

// 툴박스 함수 (no-op — menubar로 대체)
function loadToolboxState() {}
function toggleToolbox() {}

// ── 빠른 실행 도구 모음 ───────────────────────────────────────
let _quickbarOpen = true;
let _qbLarge = false;
let _qbDock  = 'top'; // 'top' | 'left'

function _qbBarH() {
  if (_qbDock === 'left' || !_quickbarOpen) return 0;
  const qb = document.getElementById('quickbar');
  return (qb && qb.offsetHeight) ? qb.offsetHeight : (_qbLarge ? 40 : 28);
}
function _qbBarW() { return _qbLarge ? 52 : 42; }

// 패널 top을 퀵바의 실제 높이에 맞춰 동기화
function _syncPanelTop() {
  const panel = document.getElementById('diagramPanel');
  if (!panel) return;
  if (!_quickbarOpen || _qbDock === 'left') {
    panel.style.top = '32px';
  } else {
    panel.style.top = (32 + _qbBarH()) + 'px';
  }
}

function _applyQuickbarState() {
  const qb      = document.getElementById('quickbar');
  const btn     = document.getElementById('quickbarToggleBtn');
  const panel   = document.getElementById('diagramPanel');
  const sizeBtn = document.getElementById('qb-size-btn');
  const isLeft  = _qbDock === 'left';

  if (qb) {
    qb.classList.toggle('qb-large', _qbLarge);
    qb.classList.toggle('qb-left',  isLeft);
  }
  if (sizeBtn) {
    sizeBtn.textContent = _qbLarge ? '⊖' : '⊕';
    sizeBtn.title = _qbLarge ? '기본 크기로 전환' : '대형 크기로 전환';
  }
  if (_quickbarOpen) {
    if (qb) qb.style.display = 'flex';
    _syncPanelTop();
    if (btn) btn.textContent = '▼';
  } else {
    if (qb) qb.style.display = 'none';
    _syncPanelTop();
    if (btn) btn.textContent = '▶';
  }

  // 좌측 도킹 시 하단 플로팅 패널·상태바가 퀵바에 덮이지 않도록 left 보정
  const qbLeftPx = (_quickbarOpen && isLeft) ? _qbBarW() : 0;
  const blp = document.getElementById('bottomLeftPanel');
  const sb  = document.getElementById('statusbar');
  if (blp) blp.style.left = (qbLeftPx + 16) + 'px';
  if (sb)  sb.style.left  = qbLeftPx ? qbLeftPx + 'px' : '';
}

function toggleQuickbar() {
  _quickbarOpen = !_quickbarOpen;
  _applyQuickbarState();
  try { localStorage.setItem('_qbOpen', _quickbarOpen ? '1' : '0'); } catch {}
  if (typeof render === 'function') render();
}

function toggleQuickbarSize() {
  _qbLarge = !_qbLarge;
  _applyQuickbarState();
  try { localStorage.setItem('_qbLarge', _qbLarge ? '1' : '0'); } catch {}
  if (typeof render === 'function') render();
}

function loadQuickbarState() {
  const saved = localStorage.getItem('_qbOpen');
  _quickbarOpen = (saved !== '0');
  _qbLarge = localStorage.getItem('_qbLarge') === '1';
  _qbDock  = localStorage.getItem('_qbDock') || 'top';
  _applyQuickbarState();
  _loadCustomQbItems();
  _initQuickbarDnd();
  _initQbDockDrag();
  // 퀵바 높이 변화(줄 수 증감) 시 패널 위치 자동 동기화
  const _qbEl = document.getElementById('quickbar');
  if (_qbEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      _syncPanelTop();
      if (typeof render === 'function') render();
    }).observe(_qbEl);
  }
}

// ── 퀵바 도킹 드래그 ─────────────────────────────────────────
function _initQbDockDrag() {
  const handle = document.getElementById('qb-dock-handle');
  const ghost  = document.getElementById('qb-dock-ghost');
  if (!handle || !ghost) return;

  handle.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    let pending = null;

    function onMove(ev) {
      const x = ev.clientX, y = ev.clientY;
      // 왼쪽 가장자리(x<70) → 좌측 도킹, 상단(y<70, x>=70) → 상단 도킹
      if (x < 70) {
        pending = 'left';
        const w = _qbBarW();
        ghost.style.cssText =
          `display:block;left:0;top:32px;width:${w}px;height:calc(100vh - 32px);` +
          `position:fixed;pointer-events:none;z-index:9999;` +
          `background:rgba(137,180,250,0.08);border:2px dashed var(--ac);border-radius:3px;`;
      } else if (y < 70) {
        pending = 'top';
        const h = _qbBarH();
        ghost.style.cssText =
          `display:block;left:0;top:32px;width:100vw;height:${h}px;` +
          `position:fixed;pointer-events:none;z-index:9999;` +
          `background:rgba(137,180,250,0.08);border:2px dashed var(--ac);border-radius:3px;`;
      } else {
        pending = null;
        ghost.style.display = 'none';
      }
    }

    function onUp() {
      ghost.style.display = 'none';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (pending && pending !== _qbDock) {
        _qbDock = pending;
        try { localStorage.setItem('_qbDock', _qbDock); } catch {}
        _applyQuickbarState();
        if (typeof render === 'function') render();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── 퀵바 커스텀 버튼 (드래그 앤 드롭) ────────────────────────
let _qbCustomItems = [];

let _qbDragSrcIdx = null;

function _renderCustomQbItems() {
  const area = document.getElementById('qb-custom-area');
  const sep  = document.getElementById('qb-custom-sep');
  if (!area) return;
  area.innerHTML = '';
  if (sep) sep.style.display = _qbCustomItems.length ? '' : 'none';

  _qbCustomItems.forEach((item, idx) => {
    // ── 구분선 타입 ──
    if (item.type === 'sep') {
      const sepEl = document.createElement('div');
      sepEl.className = 'qb-sep qb-csep';
      sepEl.draggable = true;
      sepEl.dataset.qbIdx = idx;
      const delBtn = document.createElement('span');
      delBtn.className = 'qb-csep-del';
      delBtn.textContent = '×';
      delBtn.title = '구분선 제거';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        _qbCustomItems.splice(idx, 1);
        _renderCustomQbItems(); _saveCustomQbItems();
      });
      sepEl.appendChild(delBtn);
      _attachQbReorderDrag(sepEl, idx);
      area.appendChild(sepEl);
      return;
    }

    // ── 일반 버튼 ──
    const btn = document.createElement('button');
    btn.className = 'qb-btn qb-cbtn';
    btn.title = item.text;
    btn.draggable = true;
    btn.dataset.qbIdx = idx;
    const ico = document.createElement('span');
    ico.textContent = item.icon;
    if (/[가-힣]/.test(item.icon)) ico.style.cssText = 'font-size:11px;font-weight:bold';
    const del = document.createElement('span');
    del.className = 'qb-cbtn-del';
    del.textContent = '×';
    del.title = '제거';
    del.addEventListener('click', e => {
      e.stopPropagation();
      _qbCustomItems.splice(idx, 1);
      _renderCustomQbItems(); _saveCustomQbItems();
    });
    btn.appendChild(ico); btn.appendChild(del);
    btn.addEventListener('click', e => {
      if (e.target === del) return;
      try { new Function(item.action)(); } catch {}
    });
    _attachQbReorderDrag(btn, idx);
    area.appendChild(btn);
  });
}

function _attachQbReorderDrag(el, idx) {
  el.addEventListener('dragstart', e => {
    // 내부 재정렬인지 외부(메뉴) 드롭인지 구분
    if (e.dataTransfer.types.includes('application/qb-item')) return;
    _qbDragSrcIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/qb-reorder', String(idx));
    setTimeout(() => { if (el.style) el.style.opacity = '0.4'; }, 0);
  });
  el.addEventListener('dragend', () => { el.style.opacity = ''; _qbDragSrcIdx = null; });
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('application/qb-reorder')) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    el.style.outline = '2px solid var(--ac)';
  });
  el.addEventListener('dragleave', () => { el.style.outline = ''; });
  el.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    el.style.outline = '';
    const fromIdx = parseInt(e.dataTransfer.getData('application/qb-reorder'));
    const toIdx = idx;
    if (isNaN(fromIdx) || fromIdx === toIdx) return;
    const [moved] = _qbCustomItems.splice(fromIdx, 1);
    _qbCustomItems.splice(toIdx, 0, moved);
    _renderCustomQbItems(); _saveCustomQbItems();
  });
}

function _saveCustomQbItems() {
  try { localStorage.setItem('_qbCustom', JSON.stringify(_qbCustomItems)); } catch {}
}

function _loadCustomQbItems() {
  try {
    const raw = localStorage.getItem('_qbCustom');
    if (raw) _qbCustomItems = JSON.parse(raw);
  } catch {}
  _renderCustomQbItems();
}

function _initQuickbarDnd() {
  // 메뉴 아이템에 draggable 부여
  document.querySelectorAll('.mb-item').forEach(item => {
    const ico    = item.querySelector('.mb-ico')?.textContent?.trim() || '';
    const txt    = item.querySelector('.mb-text')?.textContent?.trim() || '';
    const action = (item.getAttribute('onclick') || '').replace(/^mbClose\(\);\s*/, '').trim();
    if (!action || !txt) return;
    item.draggable = true;
    item.style.cursor = 'grab';
    item.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/qb-item', JSON.stringify({
        icon: ico || txt.slice(0, 1),
        text: txt,
        action
      }));
    });
  });

  const qb = document.getElementById('quickbar');
  if (!qb) return;

  qb.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('application/qb-item')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    qb.classList.add('qb-drag-over');
  });
  qb.addEventListener('dragleave', e => {
    if (!qb.contains(e.relatedTarget)) qb.classList.remove('qb-drag-over');
  });
  qb.addEventListener('drop', e => {
    e.preventDefault();
    qb.classList.remove('qb-drag-over');
    if (e.dataTransfer.types.includes('application/qb-reorder')) return; // 내부 재정렬은 개별 핸들러가 처리
    const raw = e.dataTransfer.getData('application/qb-item');
    if (!raw) return;
    try {
      const newItem = JSON.parse(raw);
      if (_qbCustomItems.some(i => i.action && i.action === newItem.action)) {
        showToast('이미 등록된 항목입니다.');
        return;
      }
      _qbCustomItems.push(newItem);
      _renderCustomQbItems();
      _saveCustomQbItems();
      showToast(`"${newItem.text}" 추가됨`);
    } catch {}
  });

  // 우클릭 → 구분선 추가
  const customArea = document.getElementById('qb-custom-area');
  if (customArea) {
    customArea.addEventListener('contextmenu', e => {
      e.preventDefault();
      _qbCustomItems.push({ type: 'sep' });
      _renderCustomQbItems(); _saveCustomQbItems();
      showToast('구분선 추가됨');
    });
  }
}

// ── 범례 / 미니맵 토글 ───────────────────────────────────────────
function toggleLegend() {
  const el = document.getElementById('legend');
  const btn = document.getElementById('legendToggleBtn');
  const collapsed = el.classList.toggle('leg-collapsed');
  btn.textContent = collapsed ? '+' : '−';
  btn.title = collapsed ? '범례 펼치기' : '범례 접기';
}

function toggleMinimap() {
  const wrap = document.getElementById('minimapWrap');
  const btn = document.getElementById('minimapToggleBtn');
  const collapsed = wrap.classList.toggle('mm-collapsed');
  btn.textContent = collapsed ? '+' : '−';
  btn.title = collapsed ? '미니맵 펼치기' : '미니맵 접기';
}

// ── 검색 ─────────────────────────────────────────────────────────
function openSearch() {
  const p = document.getElementById('searchPanel');
  const isLeft = _quickbarOpen && _qbDock === 'left';
  // 좌측 도킹 시: 퀵바 오른쪽에서 시작 / 상단 도킹 시: 중앙 정렬
  if (isLeft) {
    p.style.top       = '36px';
    p.style.left      = (_qbBarW() + 4) + 'px';
    p.style.transform = 'none';
  } else {
    p.style.top       = (_quickbarOpen ? (32 + _qbBarH() + 4) + 'px' : '36px');
    p.style.left      = '50%';
    p.style.transform = 'translateX(-50%)';
  }
  p.style.display = 'block';
  const inp = document.getElementById('searchInput');
  inp.value = '';
  onSearchInput('');
  setTimeout(() => inp.focus(), 50);
}
function closeSearch() { document.getElementById('searchPanel').style.display = 'none'; }
function onSearchKey(e) { if (e.key === 'Escape') closeSearch(); }
function onSearchInput(q) {
  const qt = q.trim().toLowerCase();
  const hits = ENTITIES.filter(en => {
    if (!qt) return true;
    const entStr = (en.logicalName + ' ' + en.physicalName + ' ' + (en.description || '')).toLowerCase();
    if (entStr.includes(qt)) return true;
    return en.attrs.some(a =>
      (a.logicalName + ' ' + a.physicalName + ' ' + (a.description || '')).toLowerCase().includes(qt)
    );
  }).slice(0, 12);
  document.getElementById('searchResults').innerHTML = hits.length
    ? hits.map(en => {
        const matchAttr = qt ? en.attrs.find(a =>
          !(en.logicalName + ' ' + en.physicalName).toLowerCase().includes(qt) &&
          (a.logicalName + ' ' + a.physicalName + ' ' + (a.description || '')).toLowerCase().includes(qt)
        ) : null;
        const sub = matchAttr
          ? `<span style="color:#585b70;font-size:10px;margin-left:4px;">→ ${escHtml(attrDisplayName(matchAttr) || matchAttr.logicalName || matchAttr.physicalName)}</span>`
          : '';
        return `<div class="search-result-item" onclick="jumpToEntity('${en.id}')">
          <span>${escHtml(entDisplayName(en))}${sub}</span>
          <span class="sr-tag">${escHtml(en.physicalName || '')}</span>
        </div>`;
      }).join('')
    : '<div style="color:#45475a;font-size:12px;padding:6px 8px;">검색 결과 없음</div>';
}
function jumpToEntity(id) {
  const en = ENTITIES.find(e => e.id === id);
  if (!en) return;
  const h = entityHeight(en);
  vx = canvas.width  / 2 - (en.x + W / 2) * scale;
  vy = canvas.height / 2 - (en.y + h / 2) * scale;
  selectedEntity = en;
  render();
  closeSearch();
}

// ── 미니맵 (OffscreenCanvas Worker) ──────────────────────────────
let _mmWorker  = null;   // minimap_worker.js 인스턴스
let _mmPending = false;  // Worker가 처리 중이면 중복 전송 방지

function _getMinimapWorker() {
  if (_mmWorker) return _mmWorker;
  try {
    _mmWorker = new Worker('js/minimap_worker.js');
    _mmWorker.onmessage = e => {
      if (e.data.type !== 'frame') return;
      const mc = document.getElementById('minimap');
      if (mc) {
        mc.width = 196; mc.height = 120;
        mc.getContext('2d').drawImage(e.data.bitmap, 0, 0);
        e.data.bitmap.close();
      }
      _mmPending = false;
    };
    _mmWorker.onerror = () => { _mmWorker = null; _mmPending = false; };
  } catch { _mmWorker = null; }
  return _mmWorker;
}

function renderMinimap() {
  const mc = document.getElementById('minimap');
  if (!mc) return;
  mc.width = 196; mc.height = 120;

  if (!ENTITIES.length) {
    mc.getContext('2d').clearRect(0, 0, 196, 120);
    return;
  }

  const worker = _getMinimapWorker();

  // Worker 미지원 브라우저 폴백 — 메인 스레드에서 직접 렌더
  if (!worker) { _renderMinimapFallback(mc); return; }

  if (_mmPending) return; // Worker 바쁨 → 이번 프레임 스킵
  _mmPending = true;

  // 직렬화: 최소 데이터만 전송
  const entities = ENTITIES.map(e => ({
    x: e.x, y: e.y,
    attrCount: e.attrs?.length || 0,
    collapsed: collapsedEntities.has(e.id)
  }));
  const relWaypoints = RELATIONS.map(r => {
    try { return getRelationPath(r)?.waypoints ?? null; } catch { return null; }
  });

  worker.postMessage({
    type: 'render',
    entities, relWaypoints,
    vx, vy, scale,
    canvasW: canvas.width, canvasH: canvas.height,
    W, HEADER_H, ROW_H,
    colors: {
      rel:      COLOR.border   || '#4a5568',
      body:     COLOR.bodyBg   || '#313244',
      header:   COLOR.hovHdr   || '#45475a',
      border:   COLOR.border   || '#45475a',
      viewport: COLOR.line     || '#89b4fa'
    }
  });
}

// ── 폴백: Worker 미지원 시 메인 스레드 렌더 ─────────────────────
function _renderMinimapFallback(mc) {
  const mctx = mc.getContext('2d');
  const MW = 196, MH = 120, MPAD = 10;
  mctx.clearRect(0, 0, MW, MH);
  if (!ENTITIES.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + W); maxY = Math.max(maxY, e.y + h);
  });
  const pad = 40, bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
  const ms  = Math.min((MW - MPAD * 2) / bw, (MH - MPAD * 2) / bh);
  const tx  = x => (x + pad - minX) * ms + MPAD;
  const ty  = y => (y + pad - minY) * ms + MPAD;

  mctx.strokeStyle = '#4a5568'; mctx.lineWidth = 1;
  RELATIONS.forEach(r => {
    const p = getRelationPath(r); if (!p) return;
    mctx.beginPath(); mctx.moveTo(tx(p.waypoints[0][0]), ty(p.waypoints[0][1]));
    p.waypoints.slice(1).forEach(pt => mctx.lineTo(tx(pt[0]), ty(pt[1])));
    mctx.stroke();
  });
  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    mctx.fillStyle = '#313244';
    mctx.fillRect(tx(e.x), ty(e.y), W * ms, h * ms);
    mctx.strokeStyle = '#45475a'; mctx.lineWidth = 0.5;
    mctx.strokeRect(tx(e.x), ty(e.y), W * ms, h * ms);
  });
  const vpX = -vx / scale, vpY = -vy / scale;
  mctx.strokeStyle = COLOR.line || '#89b4fa'; mctx.lineWidth = 1.5;
  mctx.strokeRect(tx(vpX), ty(vpY), canvas.width / scale * ms, canvas.height / scale * ms);
}

// ── 미니맵 네비게이션 ──────────────────────────────────────────────
function minimapWorldCoord(cx, cy) {
  if (!ENTITIES.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ENTITIES.forEach(en => {
    const h = entityHeight(en);
    minX = Math.min(minX, en.x); minY = Math.min(minY, en.y);
    maxX = Math.max(maxX, en.x + W); maxY = Math.max(maxY, en.y + h);
  });
  const MW = 196, MH = 120, MPAD = 10, pad = 40;
  const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
  const ms = Math.min((MW - MPAD * 2) / bw, (MH - MPAD * 2) / bh);
  return { wx: (cx - MPAD) / ms - (pad - minX), wy: (cy - MPAD) / ms - (pad - minY) };
}
function minimapNavigateTo(e) {
  const mc = document.getElementById('minimap');
  if (!mc || !ENTITIES.length) return;
  const rect = mc.getBoundingClientRect();
  const coord = minimapWorldCoord(e.clientX - rect.left, e.clientY - rect.top);
  if (!coord) return;
  vx = canvas.width  / 2 - coord.wx * scale;
  vy = canvas.height / 2 - coord.wy * scale;
  render();
}
window.addEventListener('DOMContentLoaded', () => {
  const mc = document.getElementById('minimap');
  if (!mc) return;
  let mmDragging = false;
  mc.addEventListener('mousedown', e => { mmDragging = true; minimapNavigateTo(e); e.preventDefault(); });
  mc.addEventListener('mousemove', e => { if (mmDragging) minimapNavigateTo(e); });
  mc.addEventListener('mouseup',   () => { if (mmDragging) { mmDragging = false; saveState(); } });
  mc.addEventListener('mouseleave',() => { mmDragging = false; });
});

// ── 전체 맞춤 ────────────────────────────────────────────────────
function fitAll() {
  const hasContent = ENTITIES.length > 0 || NOTES.length > 0 || SECTIONS.length > 0;
  if (!hasContent) return;
  const pad = 120;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + W); maxY = Math.max(maxY, e.y + h);
  });
  SECTIONS.forEach(s => {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
  });
  NOTES.forEach(n => {
    const nw = n.w || NOTE_W;
    const nh = n.h || NOTE_H;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + nw); maxY = Math.max(maxY, n.y + nh);
  });
  const cw = canvas.width, ch = canvas.height;
  const scaleX = (cw - pad*2) / (maxX - minX);
  const scaleY = (ch - pad*2) / (maxY - minY);
  scale = Math.min(scaleX, scaleY, 2);
  vx = pad - minX * scale;
  vy = pad - minY * scale;
  updateZoomLabel();
  render();
  saveState();
}

// ── 그리드 스냅 토글 ────────────────────────────────────────────
function toggleGridSnap() {
  gridSnap = !gridSnap;
  syncToolDropdownLabels();
  render();
}

// ── 크로우풋 표기법 토글 ────────────────────────────────────────
function toggleNotation() {
  notationStyle = notationStyle === 'simple' ? 'crowsfoot' : 'simple';
  syncToolDropdownLabels();
  render();
}

// ── 관계명 인라인 편집 ────────────────────────────────────────────
function showRelLabelInlineEdit(rel) {
  const lpos = getRelLabelPositions(rel);
  if (!lpos) return;
  const [wx, wy] = lpos.label;
  const _qlo2 = (typeof _qbLeftOff === 'function') ? _qbLeftOff() : 0;
  const sx = wx * scale + vx + _qlo2, sy = wy * scale + vy;
  const inp = document.createElement('input');
  inp.className = 'form-input';
  inp.value = rel.label || '';
  inp.placeholder = '관계명…';
  inp.style.cssText = `position:fixed;left:${sx-65}px;top:${sy-14}px;width:130px;height:26px;font-size:11px;padding:2px 7px;z-index:1000;text-align:center;border-radius:5px;`;
  document.body.appendChild(inp);
  inp.focus(); inp.select();
  const commit = () => { rel.label = inp.value.trim() || undefined; inp.remove(); render(); saveState(); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); inp.blur(); }
    if (ev.key === 'Escape') { inp.remove(); render(); }
  });
}

// ── 스티커 메모 ──────────────────────────────────────────────────
function makeNoteId() { return 'note_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

let _editingNote = null;

function addNoteAt(wx, wy) {
  const color = NOTE_COLORS[_noteColorIdx % NOTE_COLORS.length];
  _noteColorIdx++;
  const note = { id: makeNoteId(), x: wx - NOTE_W/2, y: wy - NOTE_H/2, w: NOTE_W, h: NOTE_H,
                 text: '', color, mode: 'text' };
  NOTES.push(note);
  render();
  showNoteEdit(note);
}

// 탭 전환 (Text ↔ Markdown)
function switchNoteTab(mode) {
  if (!_editingNote) return;
  const ta = document.getElementById('noteEditInput');
  _editingNote.text = ta.value;
  _editingNote.mode = mode;
  _applyNoteTabUI(mode);
  ta.focus();
  render();
}

function _applyNoteTabUI(mode) {
  document.getElementById('noteTabText')    .classList.toggle('active', mode !== 'markdown');
  document.getElementById('noteTabMarkdown').classList.toggle('active', mode === 'markdown');
  // placeholder hint
  const ta = document.getElementById('noteEditInput');
  ta.placeholder = mode === 'markdown'
    ? '# 제목\n**굵게**, *기울임*, `코드`\n- 목록'
    : '메모를 입력하세요…';
}

function closeNoteEdit() {
  const panel = document.getElementById('noteEditPanel');
  const ta    = document.getElementById('noteEditInput');
  if (_editingNote) { _editingNote.text = ta.value; }
  panel.style.display = 'none';
  _editingNote = null;
  render();
  saveState();
}

function showNoteEdit(note) {
  _editingNote = note;
  const nw    = note.w || NOTE_W;
  const nh    = note.h || NOTE_H;
  const color = note.color || '#f9e2af';
  const mode  = note.mode  || 'text';

  // 캔버스 노트의 뷰포트 좌표 (border 2px 를 -1px 보정해 딱 맞게)
  // 좌측 도킹 시 canvas marginLeft 만큼 보정
  const BORDER = 2;
  const _qlo   = (typeof _qbLeftOff === 'function') ? _qbLeftOff() : 0;
  const sx = Math.round(note.x * scale + vx) + _qlo - BORDER;
  const sy = Math.round(note.y * scale + vy) - BORDER;
  const pw = Math.round(nw * scale) + BORDER * 2;
  const ph = Math.round(nh * scale) + BORDER * 2;

  // 탭 바 높이(px): 캔버스와 동일한 비율
  const tabH = Math.round(NOTE_TAB_H * scale);

  const panel  = document.getElementById('noteEditPanel');
  const tabBar = document.getElementById('noteEditTabBar');
  const ta     = document.getElementById('noteEditInput');

  // ── 패널: 노트 위에 픽셀 완벽 오버레이 ──────────────
  panel.style.cssText =
    `display:flex; flex-direction:column; position:fixed; box-sizing:border-box;` +
    `left:${sx}px; top:${sy}px; width:${pw}px; height:${ph}px;` +
    `background:${color}; border-radius:6px; overflow:hidden;` +
    `border:${BORDER}px solid #89b4fa;` +
    `box-shadow:2px 6px 18px rgba(0,0,0,0.50); z-index:1000;`;

  // ── 탭 바: 캔버스 탭 바와 동일한 높이 ───────────────
  tabBar.style.cssText =
    `display:flex; flex-shrink:0; height:${tabH}px;` +
    `background:rgba(0,0,0,0.14); border-bottom:1px solid rgba(0,0,0,0.12);` +
    `font-size:${Math.max(9, Math.round(10 * scale))}px;`;

  // ── textarea: 나머지 공간 전부 ───────────────────────
  ta.style.cssText =
    `display:block; flex:1; position:static; width:100%; box-sizing:border-box;` +
    `border:none; outline:none; resize:none; overflow-y:auto;` +
    `padding:${Math.round(6*scale)}px ${Math.round(7*scale)}px;` +
    `font-size:${Math.round(12*scale)}px; line-height:1.55;` +
    `background:${color}; color:#11111b;` +
    `font-family:'Segoe UI',sans-serif;`;

  ta.value = note.text || '';
  _applyNoteTabUI(mode);
  ta.focus(); ta.select();

  // 포커스 이탈 시 저장 (탭 버튼 클릭 허용을 위해 150ms 지연)
  ta.onblur = () => {
    setTimeout(() => {
      const focused = document.activeElement;
      if (!focused || !panel.contains(focused)) closeNoteEdit();
    }, 150);
  };
  ta.onkeydown = ev => { if (ev.key === 'Escape') closeNoteEdit(); };
}

// ── 스티커 메모 V2 ──────────────────────────────────────────────
let _noteV2ColorIdx = 0;
let _v2DragState = null;  // { noteId, startX, startY, origX, origY }
let _v2ResizeState = null; // { noteId, startX, startY, origW, origH }
let _ctxTargetNoteV2 = null;

function makeNoteV2Id() {
  return 'nv2_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
}

function addNoteV2At(wx, wy) {
  const themes = Object.keys(NOTE_V2_THEMES);
  const color = themes[_noteV2ColorIdx % themes.length];
  _noteV2ColorIdx++;
  const note = {
    id: makeNoteV2Id(),
    x: wx - NOTE_V2_W / 2,
    y: wy - NOTE_V2_H / 2,
    w: NOTE_V2_W,
    h: NOTE_V2_H,
    title: '',
    text: '',
    color,
    pinned: false,
    tags: [],
    createdAt: new Date().toISOString(),
  };
  NOTES_V2.push(note);
  renderNoteV2Overlays();
  saveState();
}

function deleteNoteV2(noteId) {
  const i = NOTES_V2.findIndex(n => n.id === noteId);
  if (i >= 0) { NOTES_V2.splice(i, 1); renderNoteV2Overlays(); saveState(); }
}

function toggleNoteV2Pin(noteId) {
  const n = NOTES_V2.find(n => n.id === noteId);
  if (!n) return;
  const _qlo = (typeof _qbLeftOff === 'function') ? _qbLeftOff() : 0;
  if (!n.pinned) {
    // 월드 → 스크린 좌표 변환 (핀 고정 시)
    n.x = Math.round(n.x * scale + vx) + _qlo;
    n.y = Math.round(n.y * scale + vy);
    n.w = Math.round(n.w * scale);
    n.h = Math.round(n.h * scale);
  } else {
    // 스크린 → 월드 좌표 변환 (핀 해제 시)
    n.x = (n.x - _qlo - vx) / scale;
    n.y = (n.y - vy) / scale;
    n.w = n.w / scale;
    n.h = n.h / scale;
  }
  n.pinned = !n.pinned;
  renderNoteV2Overlays();
  saveState();
}

function renderNoteV2Overlays() {
  const layer = document.getElementById('noteV2Layer');
  if (!layer) return;

  // 기존 카드 id 맵
  const existing = {};
  layer.querySelectorAll('.note-v2-card').forEach(el => { existing[el.dataset.id] = el; });

  const toRemove = new Set(Object.keys(existing));

  NOTES_V2.forEach(note => {
    toRemove.delete(note.id);
    let card = existing[note.id];
    const isNew = !card;
    if (isNew) {
      card = _createNoteV2Card(note);
      layer.appendChild(card);
    }
    _positionNoteV2Card(card, note);
    _updateNoteV2Card(card, note);
  });

  toRemove.forEach(id => { const el = existing[id]; if (el) el.remove(); });
}

function _noteV2WorldToScreen(note) {
  const _qlo = (typeof _qbLeftOff === 'function') ? _qbLeftOff() : 0;
  if (note.pinned) {
    return { left: note.x + _qlo, top: note.y, w: note.w, h: note.h };
  }
  return {
    left: Math.round(note.x * scale + vx) + _qlo,
    top:  Math.round(note.y * scale + vy),
    w:    Math.round(note.w * scale),
    h:    Math.round(note.h * scale),
  };
}

function _positionNoteV2Card(card, note) {
  const pos = _noteV2WorldToScreen(note);
  card.style.left   = pos.left + 'px';
  card.style.top    = pos.top  + 'px';
  card.style.width  = pos.w   + 'px';
  card.style.height = pos.h   + 'px';
}

function _updateNoteV2Card(card, note) {
  card.dataset.theme = note.color || 'cream';
  card.classList.toggle('pinned', !!note.pinned);

  // 핀 버튼 아이콘 갱신
  const pinBtn = card.querySelector('.note-v2-actions button[title="핀 고정"]');
  if (pinBtn) pinBtn.textContent = note.pinned ? '📌' : '📍';

  // 제목
  const titleEl = card.querySelector('.nv2-title');
  if (titleEl && document.activeElement !== titleEl) titleEl.textContent = note.title || '';

  // 본문
  const bodyEl = card.querySelector('.note-v2-body');
  if (bodyEl && document.activeElement !== bodyEl) bodyEl.textContent = note.text || '';

  // 태그
  const footer = card.querySelector('.note-v2-footer');
  if (footer) {
    // 기존 tag/add-btn 제거 후 재렌더
    footer.querySelectorAll('.nv2-tag, .nv2-tag-add').forEach(el => el.remove());
    note.tags.forEach((tag, idx) => {
      const pill = document.createElement('span');
      pill.className = 'nv2-tag';
      pill.textContent = tag;
      const rm = document.createElement('span');
      rm.className = 'nv2-tag-rm'; rm.textContent = '×';
      rm.onmousedown = e => { e.stopPropagation(); };
      rm.onclick = e => { e.stopPropagation(); note.tags.splice(idx, 1); renderNoteV2Overlays(); saveState(); };
      pill.appendChild(rm);
      footer.appendChild(pill);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'nv2-tag-add'; addBtn.textContent = '+ 태그';
    addBtn.onmousedown = e => e.stopPropagation();
    addBtn.onclick = e => {
      e.stopPropagation();
      const tag = prompt('태그 입력:');
      if (tag && tag.trim()) { note.tags.push(tag.trim()); renderNoteV2Overlays(); saveState(); }
    };
    footer.appendChild(addBtn);
  }
}

function _createNoteV2Card(note) {
  const card = document.createElement('div');
  card.className = 'note-v2-card';
  card.dataset.id = note.id;

  // 헤더
  const header = document.createElement('div');
  header.className = 'note-v2-header';

  const title = document.createElement('div');
  title.className = 'nv2-title';
  title.contentEditable = 'true';
  title.spellcheck = false;
  title.onmousedown = e => e.stopPropagation();
  title.oninput = () => { note.title = title.textContent; };
  title.onblur  = () => { saveState(); };
  title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } };

  const actions = document.createElement('div');
  actions.className = 'note-v2-actions';

  const pinBtn = document.createElement('button');
  pinBtn.title = '핀 고정';
  pinBtn.textContent = note.pinned ? '📌' : '📍';
  pinBtn.onmousedown = e => e.stopPropagation();
  pinBtn.onclick = e => { e.stopPropagation(); toggleNoteV2Pin(note.id); };

  const colorBtn = document.createElement('button');
  colorBtn.title = '색상 변경'; colorBtn.textContent = '🎨';
  colorBtn.onmousedown = e => e.stopPropagation();
  colorBtn.onclick = e => { e.stopPropagation(); showNoteV2ColorPicker(note.id, colorBtn); };

  const delBtn = document.createElement('button');
  delBtn.title = '삭제'; delBtn.textContent = '✕';
  delBtn.onmousedown = e => e.stopPropagation();
  delBtn.onclick = e => { e.stopPropagation(); deleteNoteV2(note.id); };

  actions.append(pinBtn, colorBtn, delBtn);
  header.append(title, actions);

  // 본문
  const body = document.createElement('div');
  body.className = 'note-v2-body';
  body.contentEditable = 'true';
  body.spellcheck = false;
  body.onmousedown = e => e.stopPropagation();
  body.oninput = () => { note.text = body.textContent; };
  body.onblur  = () => { saveState(); };

  // 푸터 (태그 영역)
  const footer = document.createElement('div');
  footer.className = 'note-v2-footer';

  // 리사이즈 핸들
  const resize = document.createElement('div');
  resize.className = 'note-v2-resize';
  resize.onmousedown = e => {
    e.preventDefault(); e.stopPropagation();
    _v2ResizeState = { noteId: note.id, startX: e.clientX, startY: e.clientY, origW: note.w, origH: note.h };
  };

  card.append(header, body, footer, resize);

  // 드래그 이벤트 (헤더로 드래그)
  header.onmousedown = e => {
    if (e.target.closest('button, [contenteditable]')) return;
    e.preventDefault();
    _v2DragState = { noteId: note.id, startX: e.clientX, startY: e.clientY, origX: note.x, origY: note.y };
    card.classList.add('dragging');
  };

  // 컨텍스트 메뉴
  card.oncontextmenu = e => {
    e.preventDefault(); e.stopPropagation();
    _ctxTargetNoteV2 = note;
    showCtxMenu(e.clientX, e.clientY, 'noteV2');
  };

  return card;
}

function showNoteV2ColorPicker(noteId, anchor) {
  // 기존 피커 제거
  document.querySelectorAll('.nv2-color-picker').forEach(el => el.remove());
  const note = NOTES_V2.find(n => n.id === noteId);
  if (!note) return;

  const picker = document.createElement('div');
  picker.className = 'nv2-color-picker';

  Object.keys(NOTE_V2_THEMES).forEach(theme => {
    const sw = document.createElement('div');
    sw.className = 'nv2-color-swatch' + (note.color === theme ? ' active' : '');
    sw.title = theme;
    const t = NOTE_V2_THEMES[theme];
    sw.style.background = t.header;
    sw.style.border = '2px solid ' + (note.color === theme ? t.text : 'transparent');
    sw.onclick = e => {
      e.stopPropagation();
      note.color = theme;
      renderNoteV2Overlays();
      saveState();
      picker.remove();
    };
    picker.appendChild(sw);
  });

  const rect = anchor.getBoundingClientRect();
  picker.style.top  = (rect.bottom + 4) + 'px';
  picker.style.left = (rect.left - 60) + 'px';
  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
}

// 마우스 이벤트 — V2 드래그/리사이즈
document.addEventListener('mousemove', e => {
  if (_v2DragState) {
    const { noteId, startX, startY, origX, origY } = _v2DragState;
    const note = NOTES_V2.find(n => n.id === noteId);
    if (!note) return;
    const dx = (e.clientX - startX) / (note.pinned ? 1 : scale);
    const dy = (e.clientY - startY) / (note.pinned ? 1 : scale);
    note.x = origX + dx;
    note.y = origY + dy;
    const card = document.querySelector('.note-v2-card[data-id="' + noteId + '"]');
    if (card) _positionNoteV2Card(card, note);
  }
  if (_v2ResizeState) {
    const { noteId, startX, startY, origW, origH } = _v2ResizeState;
    const note = NOTES_V2.find(n => n.id === noteId);
    if (!note) return;
    const dx = (e.clientX - startX) / (note.pinned ? 1 : scale);
    const dy = (e.clientY - startY) / (note.pinned ? 1 : scale);
    note.w = Math.max(NOTE_V2_MIN_W, origW + dx);
    note.h = Math.max(NOTE_V2_MIN_H, origH + dy);
    const card = document.querySelector('.note-v2-card[data-id="' + noteId + '"]');
    if (card) _positionNoteV2Card(card, note);
  }
});
document.addEventListener('mouseup', e => {
  if (_v2DragState) {
    const card = document.querySelector('.note-v2-card[data-id="' + _v2DragState.noteId + '"]');
    if (card) card.classList.remove('dragging');
    _v2DragState = null;
    saveState();
  }
  if (_v2ResizeState) { _v2ResizeState = null; saveState(); }
});

// ── Context Menu ─────────────────────────────────────────────────
let ctxTargetEntity = null;
let ctxTargetRelation = null;
let ctxTargetSection = null;
let _ctxScreenX = 0, _ctxScreenY = 0;
const ctxMenu = document.getElementById('ctxMenu');

const CTX_VISIBILITY = {
  canvas:        { 'ctx-add-ent':1, 'ctx-add-rel':1, 'ctx-add-note':1, 'ctx-sep-canvas':1, 'ctx-sel-all':1, 'ctx-auto-arrange':1, 'ctx-sep-note-v2':1, 'ctx-add-note-v2':1 },
  entity:        { 'ctx-edit-ent':1, 'ctx-dup-ent':1, 'ctx-copy-diag':1, 'ctx-color-ent':1, 'ctx-sel-related':1, 'ctx-sep-ent':1, 'ctx-add-rel':1, 'ctx-sep-del':1, 'ctx-del-ent':1 },
  relation:      { 'ctx-edit-rel':1, 'ctx-style-rel':1, 'ctx-sep-del':1, 'ctx-del-rel':1 },
  relation_bent: { 'ctx-edit-rel':1, 'ctx-style-rel':1, 'ctx-reset-rel':1, 'ctx-sep-del':1, 'ctx-del-rel':1 },
  section:       { 'ctx-rename-sec':1, 'ctx-sep-del':1, 'ctx-del-sec':1 },
  note:          { 'ctx-add-note':1, 'ctx-sep-del':1, 'ctx-del-note':1 },
  noteV2:        { 'ctx-add-note-v2':1, 'ctx-del-note-v2':1, 'ctx-pin-note-v2':1, 'ctx-color-note-v2':1 },
};

function showCtxMenu(x, y, mode) {
  _ctxScreenX = x; _ctxScreenY = y;
  const modeKey = (mode === 'relation' && ctxTargetRelation?.bend) ? 'relation_bent' : mode;
  const visible = CTX_VISIBILITY[modeKey] || {};
  ['ctx-add-ent','ctx-edit-ent','ctx-dup-ent','ctx-copy-diag','ctx-color-ent','ctx-sel-related',
   'ctx-add-note','ctx-sep-ent','ctx-add-rel',
   'ctx-edit-rel','ctx-style-rel','ctx-reset-rel',
   'ctx-sep-del','ctx-del-ent','ctx-del-rel',
   'ctx-rename-sec','ctx-del-sec','ctx-del-note',
   'ctx-sep-note-v2','ctx-add-note-v2','ctx-del-note-v2','ctx-pin-note-v2','ctx-color-note-v2',
   'ctx-sep-canvas','ctx-sel-all','ctx-auto-arrange'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible[id] ? '' : 'none';
  });
  ctxMenu.style.left = x + 'px'; ctxMenu.style.top = y + 'px'; ctxMenu.style.display = 'block';
  const r = ctxMenu.getBoundingClientRect();
  if (r.right > window.innerWidth - (panelOpen ? PANEL_W : 0)) ctxMenu.style.left = (x - r.width) + 'px';
  if (r.bottom > window.innerHeight) ctxMenu.style.top = (y - r.height) + 'px';
}
function hideCtxMenu() { ctxMenu.style.display = 'none'; }
document.addEventListener('click', e => { if (!ctxMenu.contains(e.target)) hideCtxMenu(); });

// ── 속성 패널 (우측 인라인 편집) ──────────────────────────────────
let _ppMode   = null;  // 'entity' | 'relation'
let _ppTarget = null;  // 현재 표시 대상 (entity or relation object)

function _ensurePanelOpen() {
  if (typeof panelOpen !== 'undefined' && !panelOpen) toggleDiagramPanel();
}

function showPropPanel(entity) {
  if (!entity) { hidePropPanel(); return; }
  _ppMode   = 'entity';
  _ppTarget = entity;
  if (!document.getElementById('propPanel')) return;
  _ensurePanelOpen();
  const title = document.getElementById('ppTitle');
  const icon  = document.getElementById('ppIcon');
  const btn   = document.getElementById('ppModalBtn');
  if (title) title.textContent = entity.logicalName || entity.physicalName || '엔티티';
  if (icon)  icon.textContent  = '📋';
  if (btn)   btn.style.display = '';
  _renderEntityPropPanel(entity);
}

function showRelPropPanel(rel) {
  if (!rel) { hidePropPanel(); return; }
  _ppMode   = 'relation';
  _ppTarget = rel;
  if (!document.getElementById('propPanel')) return;
  _ensurePanelOpen();
  const fe = ENTITIES.find(e => e.id === rel.from);
  const te = ENTITIES.find(e => e.id === rel.to);
  const title = document.getElementById('ppTitle');
  const icon  = document.getElementById('ppIcon');
  const btn   = document.getElementById('ppModalBtn');
  if (title) title.textContent = `${fe?.logicalName || rel.from} → ${te?.logicalName || rel.to}`;
  if (icon)  icon.textContent  = '↔';
  if (btn)   btn.style.display = '';
  _renderRelPropPanel(rel);
}

function hidePropPanel() {
  _ppMode = null; _ppTarget = null;
  _renderEmptyPropPanel();
}

function _renderEmptyPropPanel() {
  const title    = document.getElementById('ppTitle');
  const icon     = document.getElementById('ppIcon');
  const modalBtn = document.getElementById('ppModalBtn');
  const content  = document.getElementById('ppContent');
  if (title)    title.textContent    = '속성';
  if (icon)     icon.textContent     = '📋';
  if (modalBtn) modalBtn.style.display = 'none';
  if (!content) return;
  content.innerHTML =
    `<div class="pp-empty">
       <div class="pp-empty-ico">📋</div>
       <div class="pp-empty-msg">엔티티 또는 관계선을 클릭하면<br>속성을 인라인으로 편집합니다</div>
     </div>`;
}

function openPropPanelModal() {
  if (_ppMode === 'entity'   && _ppTarget) openEditEntityModal(_ppTarget);
  if (_ppMode === 'relation' && _ppTarget) openEditRelationModal(_ppTarget);
}

// 속성 패널이 열려 있고 대상이 같으면 제목만 동기화
function refreshPropPanel() {
  if (!_ppTarget || !_ppMode) return;
  if (_ppMode === 'entity') {
    const t = document.getElementById('ppTitle');
    if (t) t.textContent = _ppTarget.logicalName || _ppTarget.physicalName || '엔티티';
  }
}

// ── 엔티티 속성 패널 렌더 ─────────────────────────────────────────
function _renderEntityPropPanel(entity) {
  const content = document.getElementById('ppContent');
  if (!content) return;
  const scrollTop = content.scrollTop;
  content.innerHTML = '';

  // ── 기본 정보 ──
  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'pp-fields';

  const mkField = (labelText, inputEl) => {
    const row = document.createElement('div');
    row.className = 'pp-field';
    const lbl = document.createElement('span');
    lbl.className = 'pp-lbl';
    lbl.textContent = labelText;
    row.appendChild(lbl);
    row.appendChild(inputEl);
    return row;
  };

  const logInp = document.createElement('input');
  logInp.className = 'pp-inp'; logInp.value = entity.logicalName || '';
  logInp.placeholder = '논리명';
  logInp.addEventListener('input', () => {
    entity.logicalName = logInp.value;
    document.getElementById('ppTitle').textContent = logInp.value || entity.physicalName || '엔티티';
    render(); renderEntityTree();
  });
  logInp.addEventListener('blur', saveState);
  fieldsWrap.appendChild(mkField('논리', logInp));

  const phyInp = document.createElement('input');
  phyInp.className = 'pp-inp pp-mono'; phyInp.value = entity.physicalName || '';
  phyInp.placeholder = '물리명';
  phyInp.addEventListener('input', () => { entity.physicalName = phyInp.value; render(); });
  phyInp.addEventListener('blur', saveState);
  fieldsWrap.appendChild(mkField('물리', phyInp));

  const descInp = document.createElement('textarea');
  descInp.className = 'pp-inp pp-desc'; descInp.value = entity.description || '';
  descInp.placeholder = '설명'; descInp.rows = 2;
  descInp.addEventListener('input', () => { entity.description = descInp.value; });
  descInp.addEventListener('blur', saveState);
  fieldsWrap.appendChild(mkField('설명', descInp));

  content.appendChild(fieldsWrap);
  content.appendChild(Object.assign(document.createElement('div'), { className: 'pp-sep' }));

  // ── 컬럼 목록 ──
  const attrHdr = document.createElement('div');
  attrHdr.className = 'pp-attr-hdr';
  attrHdr.innerHTML = `<span class="pp-attr-hdr-lbl">컬럼 <span style="color:var(--tx-muted);font-weight:normal">(${entity.attrs.length})</span></span>`;
  const addBtn = document.createElement('button');
  addBtn.className = 'pp-attr-add'; addBtn.innerHTML = '＋'; addBtn.title = '컬럼 추가';
  addBtn.addEventListener('click', () => {
    entity.attrs.push({ logicalName: '', physicalName: '', type: 'VARCHAR(50)',
      kind: 'normal', description: '', notNull: false, unique: false, autoIncrement: false });
    render(); saveState(); _renderEntityPropPanel(entity);
    // 마지막 행 논리명에 포커스
    setTimeout(() => {
      const rows = content.querySelectorAll('.pp-attr-row');
      if (rows.length) rows[rows.length - 1].querySelector('.pp-aname')?.focus();
    }, 30);
  });
  attrHdr.appendChild(addBtn);
  content.appendChild(attrHdr);

  entity.attrs.forEach((attr, i) => content.appendChild(_buildAttrRow(entity, attr, i)));

  // 스크롤 위치 복원
  content.scrollTop = scrollTop;
}

function _buildAttrRow(entity, attr, i) {
  const row = document.createElement('div');
  row.className = 'pp-attr-row';

  // ── Line 1: kind badge | 논리명 | ▲ ▼ ✕ ──
  const l1 = document.createElement('div');
  l1.className = 'pp-attr-l1';

  const KINDS = ['normal', 'pk', 'fk'];
  const KIND_LABELS = { pk: 'PK', fk: 'FK', normal: '일반' };
  const KIND_CLS    = { pk: 'pp-kind-pk', fk: 'pp-kind-fk', normal: 'pp-kind-n' };

  const kindEl = document.createElement('span');
  kindEl.className = `pp-kind ${KIND_CLS[attr.kind] || 'pp-kind-n'}`;
  kindEl.textContent = KIND_LABELS[attr.kind] || '일반';
  kindEl.title = '클릭 → PK / FK / 일반 순환';
  kindEl.addEventListener('click', () => {
    const idx = KINDS.indexOf(attr.kind ?? 'normal');
    attr.kind = KINDS[(idx + 1) % KINDS.length];
    render(); saveState(); _renderEntityPropPanel(entity);
  });

  const nameInp = document.createElement('input');
  nameInp.className = 'pp-ai pp-aname'; nameInp.value = attr.logicalName || '';
  nameInp.placeholder = '논리명';
  nameInp.addEventListener('input', () => { attr.logicalName = nameInp.value; render(); });
  nameInp.addEventListener('blur', () => { saveState(); renderEntityTree(); });

  const mkBtn = (html, title, cls, handler) => {
    const b = document.createElement('button');
    b.className = `pp-abtn${cls ? ' ' + cls : ''}`;
    b.innerHTML = html; b.title = title;
    b.addEventListener('click', handler);
    return b;
  };

  const upBtn   = mkBtn('▲', '위로', '', () => {
    if (i === 0) return;
    [entity.attrs[i-1], entity.attrs[i]] = [entity.attrs[i], entity.attrs[i-1]];
    render(); saveState(); _renderEntityPropPanel(entity);
  });
  const downBtn = mkBtn('▼', '아래로', '', () => {
    if (i >= entity.attrs.length - 1) return;
    [entity.attrs[i+1], entity.attrs[i]] = [entity.attrs[i], entity.attrs[i+1]];
    render(); saveState(); _renderEntityPropPanel(entity);
  });
  const delBtn  = mkBtn('✕', '컬럼 삭제', 'pp-adel', () => {
    entity.attrs.splice(i, 1);
    render(); saveState(); _renderEntityPropPanel(entity);
  });
  if (i === 0) upBtn.disabled = true;
  if (i === entity.attrs.length - 1) downBtn.disabled = true;

  l1.append(kindEl, nameInp, upBtn, downBtn, delBtn);

  // ── Line 2: 물리명 | 타입 | N U A ──
  const l2 = document.createElement('div');
  l2.className = 'pp-attr-l2';

  const physInp = document.createElement('input');
  physInp.className = 'pp-ai pp-aphys'; physInp.value = attr.physicalName || '';
  physInp.placeholder = '물리명';
  physInp.addEventListener('input', () => { attr.physicalName = physInp.value; render(); });
  physInp.addEventListener('blur', saveState);

  const typeInp = document.createElement('input');
  typeInp.className = 'pp-ai pp-atype'; typeInp.value = attr.type || '';
  typeInp.placeholder = 'VARCHAR(50)';
  typeInp.addEventListener('input', () => { attr.type = typeInp.value; render(); });
  typeInp.addEventListener('blur', saveState);

  const mkCb = (label, title, get, set) => {
    const b = document.createElement('button');
    b.className = 'pp-cb' + (get() ? ' on' : '');
    b.textContent = label; b.title = title;
    b.addEventListener('click', () => {
      set(!get()); b.classList.toggle('on', get()); render(); saveState();
    });
    return b;
  };
  const nnBtn = mkCb('N', 'NOT NULL',        () => !!attr.notNull,       v => { attr.notNull       = v; });
  const uqBtn = mkCb('U', 'UNIQUE',          () => !!attr.unique,        v => { attr.unique        = v; });
  const aiBtn = mkCb('A', 'AUTO_INCREMENT',  () => !!attr.autoIncrement, v => { attr.autoIncrement = v; });

  l2.append(physInp, typeInp, nnBtn, uqBtn, aiBtn);

  row.appendChild(l1);
  row.appendChild(l2);
  return row;
}

// ── 관계 속성 패널 렌더 ──────────────────────────────────────────
function _renderRelPropPanel(rel) {
  const content = document.getElementById('ppContent');
  if (!content) return;
  content.innerHTML = '';

  const fe = ENTITIES.find(e => e.id === rel.from);
  const te = ENTITIES.find(e => e.id === rel.to);

  const mkRow = (label, val) => {
    const d = document.createElement('div');
    d.className = 'pp-rel-row';
    d.innerHTML = `<span class="pp-rel-lbl">${label}</span><span class="pp-rel-val">${escHtml(val || '-')}</span>`;
    return d;
  };
  content.appendChild(mkRow('출발', fe?.logicalName || rel.from));
  content.appendChild(mkRow('도착', te?.logicalName || rel.to));
  content.appendChild(Object.assign(document.createElement('div'), { className: 'pp-sep' }));

  // 관계 유형
  const cardRow = document.createElement('div');
  cardRow.className = 'pp-rel-row';
  cardRow.innerHTML = `<span class="pp-rel-lbl">관계</span>`;
  const cardGrp = document.createElement('div');
  cardGrp.className = 'pp-card-grp';
  ['1:1', '1:N', 'N:M'].forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'pp-card-btn' + (rel.card === c ? ' on' : '');
    btn.textContent = c;
    btn.addEventListener('click', () => {
      rel.card = c;
      cardGrp.querySelectorAll('.pp-card-btn').forEach(b => b.classList.toggle('on', b.textContent === c));
      render(); saveState();
    });
    cardGrp.appendChild(btn);
  });
  cardRow.appendChild(cardGrp);
  content.appendChild(cardRow);

  // 레이블
  const labelRow = document.createElement('div');
  labelRow.className = 'pp-rel-row';
  labelRow.innerHTML = `<span class="pp-rel-lbl">레이블</span>`;
  const labelInp = document.createElement('input');
  labelInp.className = 'pp-inp'; labelInp.style.cssText = 'flex:1;font-size:12px;padding:2px 6px;';
  labelInp.value = rel.label || ''; labelInp.placeholder = '레이블';
  labelInp.addEventListener('input', () => { rel.label = labelInp.value || undefined; render(); });
  labelInp.addEventListener('blur', saveState);
  labelRow.appendChild(labelInp);
  content.appendChild(labelRow);

  // 선 형태 (직선 / 곡선)
  const pathRow = document.createElement('div');
  pathRow.className = 'pp-rel-row';
  pathRow.innerHTML = `<span class="pp-rel-lbl">형태</span>`;
  const pathGrp = document.createElement('div');
  pathGrp.className = 'pp-card-grp';
  const _curPath = (rel.pathStyle === 'curved' || rel.lineStyle === 'curved') ? 'curved' : 'straight';
  [['straight','직선'], ['curved','곡선']].forEach(([v, txt]) => {
    const btn = document.createElement('button');
    btn.className = 'pp-card-btn' + (_curPath === v ? ' on' : '');
    btn.textContent = txt;
    btn.addEventListener('click', () => {
      rel.pathStyle  = v === 'curved' ? 'curved' : undefined;
      if (rel.lineStyle === 'curved') rel.lineStyle = undefined; // 레거시 정리
      pathGrp.querySelectorAll('.pp-card-btn').forEach(b => b.classList.toggle('on', b.textContent === txt));
      render(); saveState();
    });
    pathGrp.appendChild(btn);
  });
  pathRow.appendChild(pathGrp);
  content.appendChild(pathRow);

  // 선 패턴 (실선 / 점선)
  const lineRow = document.createElement('div');
  lineRow.className = 'pp-rel-row';
  lineRow.innerHTML = `<span class="pp-rel-lbl">패턴</span>`;
  const lineGrp = document.createElement('div');
  lineGrp.className = 'pp-card-grp';
  const _curLine = rel.lineStyle === 'dashed' ? 'dashed' : 'solid';
  [['solid','실선'], ['dashed','점선']].forEach(([v, txt]) => {
    const btn = document.createElement('button');
    btn.className = 'pp-card-btn' + (_curLine === v ? ' on' : '');
    btn.textContent = txt;
    btn.addEventListener('click', () => {
      rel.lineStyle = v === 'dashed' ? 'dashed' : undefined;
      lineGrp.querySelectorAll('.pp-card-btn').forEach(b => b.classList.toggle('on', b.textContent === txt));
      render(); saveState();
    });
    lineGrp.appendChild(btn);
  });
  lineRow.appendChild(lineGrp);
  content.appendChild(lineRow);

  content.appendChild(Object.assign(document.createElement('div'), { className: 'pp-sep' }));

  // 삭제
  const delBtn = document.createElement('button');
  delBtn.className = 'pp-del-rel'; delBtn.textContent = '관계선 삭제';
  delBtn.addEventListener('click', () => {
    askConfirm('이 관계를 삭제합니다.', () => {
      const idx = RELATIONS.indexOf(rel);
      if (idx >= 0) RELATIONS.splice(idx, 1);
      hidePropPanel(); render(); saveState();
    }, '삭제');
  });
  content.appendChild(delBtn);
}

// ── 속성 패널 구분선 드래그 리사이즈 ──────────────────────────────
function _initPropDividerDrag() {
  const divider = document.getElementById('propDivider');
  const panel   = document.getElementById('propPanel');
  const bottom  = document.getElementById('panelBottom');
  if (!divider || !panel) return;

  let startY = 0, startPpH = 0, startPbH = 0;
  divider.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    startY   = e.clientY;
    startPpH = panel.offsetHeight;
    startPbH = bottom ? bottom.offsetHeight : 0;
    // flex:N 은 flex-basis:0% 를 설정하므로 style.height 을 override함
    // 드래그 시작 시점에 명시적 px 높이로 전환해야 resize가 동작함
    panel.style.flex   = 'none';
    panel.style.height = startPpH + 'px';
    if (bottom) { bottom.style.flex = 'none'; bottom.style.height = startPbH + 'px'; }
    divider.classList.add('dragging');
    const onMove = ev => {
      const delta  = startY - ev.clientY; // 위로 드래그 → propPanel 증가
      const totalH = startPpH + startPbH;
      const newPpH = Math.max(80, Math.min(totalH - 60, startPpH + delta));
      const newPbH = totalH - newPpH;
      panel.style.height  = newPpH + 'px';
      if (bottom) bottom.style.height = newPbH + 'px';
    };
    const onUp = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // 더블클릭 → 기본 3:7 비율로 리셋
  divider.addEventListener('dblclick', () => {
    panel.style.height = ''; panel.style.flex = '';
    if (bottom) { bottom.style.height = ''; bottom.style.flex = ''; }
  });
}

function ctxFn(action) {
  hideCtxMenu();
  if (action === 'addEnt')  openAddEntityModal();
  if (action === 'editEnt') { showPropPanel(ctxTargetEntity); }
  if (action === 'dupEnt') {
    // clipboard을 건드리지 않고 직접 복제
    const e = ctxTargetEntity;
    if (e) {
      const copy = JSON.parse(JSON.stringify(e));
      copy.id = 'entity_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      copy.logicalName = (copy.logicalName || '') + ' (복사)';
      copy.x = e.x + 30; copy.y = e.y + 30;
      copy.attrs = copy.attrs.map(a => ({ ...a, ref: null }));
      ENTITIES.push(copy);
      selectedEntity = copy; selectedEntities.clear(); selectedSections.clear();
      render(); saveState();
      if (typeof renderEntityTree === 'function') renderEntityTree();
    }
  }
  if (action === 'copyToDiag') { if (ctxTargetEntity) openCopyDiagModal(ctxTargetEntity); }
  if (action === 'colorEnt')  showCtxEntityColorPicker();
  if (action === 'selRelated') selectRelatedEntities(ctxTargetEntity);
  if (action === 'addNote')   addNoteAt(ctxLastWorld.x, ctxLastWorld.y);
  if (action === 'delNote')   { if (ctxTargetNote) { const i = NOTES.indexOf(ctxTargetNote); if (i>=0) NOTES.splice(i,1); render(); saveState(); } }
  if (action === 'delEnt')  askConfirm(`'${entDisplayName(ctxTargetEntity)}' 엔티티와 연결된 모든 관계를 삭제합니다.`, () => deleteEntity(ctxTargetEntity), '삭제');
  if (action === 'addRel')  openAddRelationModal();
  if (action === 'editRel') showRelPropPanel(ctxTargetRelation);
  if (action === 'styleRel') {
    if (!ctxTargetRelation) return;
    ctxTargetRelation.lineStyle = (ctxTargetRelation.lineStyle === 'dashed') ? undefined : 'dashed';
    render(); saveState();
  }
  if (action === 'delRel')  askConfirm('이 관계를 삭제합니다.', () => deleteRelation(ctxTargetRelation), '삭제');
  if (action === 'resetRel') { ctxTargetRelation.bend = null; render(); saveState(); }
  if (action === 'renameSec') showSectionNameInput(ctxTargetSection);
  if (action === 'delSec')    askConfirm(`'${ctxTargetSection.name || '섹션'}' 섹션을 삭제합니다.`, () => deleteSection(ctxTargetSection), '삭제');
  if (action === 'selAll')    { ENTITIES.forEach(e => selectedEntities.add(e.id)); render(); }
  if (action === 'autoArrange') autoLayout('hierarchical');
  if (action === 'addNoteV2')   addNoteV2At(ctxLastWorld.x, ctxLastWorld.y);
  if (action === 'delNoteV2')   { if (_ctxTargetNoteV2) { deleteNoteV2(_ctxTargetNoteV2.id); _ctxTargetNoteV2 = null; } }
  if (action === 'pinNoteV2')   { if (_ctxTargetNoteV2) toggleNoteV2Pin(_ctxTargetNoteV2.id); }
  if (action === 'colorNoteV2') { if (_ctxTargetNoteV2) showNoteV2ColorPicker(_ctxTargetNoteV2.id, ctxMenu); }
}

// ── 관련 엔티티 선택 ─────────────────────────────────────────────
function selectRelatedEntities(ent) {
  if (!ent) return;
  selectedEntities.clear();
  const connected = new Set([ent.id]);
  const queue = [ent.id]; let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    RELATIONS.forEach(r => {
      if (r.from === cur && !connected.has(r.to))   { connected.add(r.to);   queue.push(r.to); }
      if (r.to   === cur && !connected.has(r.from)) { connected.add(r.from); queue.push(r.from); }
    });
  }
  connected.forEach(id => selectedEntities.add(id));
  render();
}

// ── 컨텍스트 엔티티 색상 피커 ────────────────────────────────────
function showCtxEntityColorPicker() {
  const picker = document.getElementById('ctxColorPicker');
  if (!picker || !ctxTargetEntity) return;
  picker.innerHTML = ENTITY_COLOR_PALETTE.map(c => {
    const active = (c.id === (ctxTargetEntity.colorTag || null)) ? ' active' : '';
    return `<div class="ctx-color-swatch${active}" title="${c.label}"
      style="background:${c.bg};"
      onclick="applyCtxEntityColor(${c.id === null ? 'null' : `'${c.id}'`})"></div>`;
  }).join('');
  picker.style.left = _ctxScreenX + 'px';
  picker.style.top  = _ctxScreenY + 'px';
  picker.classList.add('open');
  // open 후 실제 크기 기준으로 화면 밖 보정
  const pr = picker.getBoundingClientRect();
  if (pr.right > window.innerWidth - (panelOpen ? PANEL_W : 0))
    picker.style.left = (_ctxScreenX - pr.width) + 'px';
  if (pr.bottom > window.innerHeight)
    picker.style.top  = (_ctxScreenY - pr.height) + 'px';
  setTimeout(() => {
    document.addEventListener('click', function _cls(e) {
      if (!picker.contains(e.target)) { picker.classList.remove('open'); document.removeEventListener('click', _cls); }
    });
  }, 0);
}
function applyCtxEntityColor(colorTag) {
  if (!ctxTargetEntity) return;
  ctxTargetEntity.colorTag = (colorTag === 'null' || colorTag === null) ? null : colorTag;
  document.getElementById('ctxColorPicker')?.classList.remove('open');
  render(); saveState();
}

// ── Confirm Dialog ───────────────────────────────────────────────
let pendingConfirmFn = null;

function askConfirm(msg, fn, btnLabel = '삭제') {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmOkBtn').textContent = btnLabel;
  pendingConfirmFn = fn;
  document.getElementById('confirmOverlay').classList.add('active');
}
function doConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
  if (pendingConfirmFn) { pendingConfirmFn(); pendingConfirmFn = null; }
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
  pendingConfirmFn = null;
}

// ── Overlay 닫기 ─────────────────────────────────────────────────
function overlayClose(e, overlayId) {
  if (e.target.id === overlayId) {
    if (overlayId === 'entOverlay')      closeEntModal();
    if (overlayId === 'relOverlay')      closeRelModal();
    if (overlayId === 'ddlOverlay')      closeDDLModal();
    if (overlayId === 'copyDiagOverlay') closeCopyDiagModal();
    if (overlayId === 'newDiagOverlay')  closeNewDiagModal();
    if (overlayId === 'pmOverlay')       closeProfileManagerModal();
    if (overlayId === 'mwNotRunningOverlay') document.getElementById('mwNotRunningOverlay')?.classList.remove('active');
  }
}

function overlayCloseExtra(e, overlayId) {
  overlayClose(e, overlayId);
  if (e.target.id === overlayId) {
    if (overlayId === 'ddlImportOverlay')    closeDDLImportModal();
    if (overlayId === 'snapshotOverlay')     closeSnapshotModal();
    if (overlayId === 'aiSchemaOverlay')     closeAISchemaModal();
    if (overlayId === 'shortcutsOverlay')    closeShortcutsModal();
    if (overlayId === 'backupConfigOverlay') closeBackupConfigModal();
  }
}

// ── 툴팁 ────────────────────────────────────────────────────────
function updateTooltip(cx, cy, wx, wy, ent) {
  const tt = document.getElementById('erdTooltip');
  if (!tt) return;
  if (!ent) { tt.style.display = 'none'; return; }
  const eh = entityHeight(ent);
  let title = '', desc = '';
  if (wy >= ent.y && wy <= ent.y + HEADER_H) {
    if (!ent.description) { tt.style.display = 'none'; return; }
    title = entDisplayName(ent);
    desc = ent.description;
  } else if (wy > ent.y + HEADER_H && wy <= ent.y + eh) {
    const attrIdx = Math.floor((wy - ent.y - HEADER_H) / ROW_H);
    const attr = ent.attrs[attrIdx];
    if (!attr || !attr.description) { tt.style.display = 'none'; return; }
    title = attrDisplayName(attr) || attr.logicalName || attr.physicalName || '';
    desc = attr.description;
  } else {
    tt.style.display = 'none'; return;
  }
  tt.innerHTML = `<div class="tt-title">${escHtml(title)}</div><div class="tt-desc">${escHtml(desc)}</div>`;
  tt.style.display = 'block';
  const pad = 14;
  let tx = cx + pad, ty = cy + pad;
  tt.style.left = tx + 'px'; tt.style.top = ty + 'px';
  const r = tt.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 8) tx = cx - r.width  - pad;
  if (r.bottom > window.innerHeight - 8) ty = cy - r.height - pad;
  tt.style.left = tx + 'px'; tt.style.top = ty + 'px';
}

// ════════════════════════════════════════════════════════════════
// FEATURE 2: Focus Mode (관계 영향 분석)
// ════════════════════════════════════════════════════════════════
let focusEntityId = null;

function setFocusEntity(id) {
  focusEntityId = id;
  const ent = ENTITIES.find(e => e.id === id);
  const badge = document.getElementById('focusBadge');
  const nameEl = document.getElementById('focusBadgeName');
  if (ent && badge && nameEl) {
    nameEl.textContent = entDisplayName(ent);
    badge.style.display = 'block';
  }
  render();
}

function clearFocusMode() {
  focusEntityId = null;
  const badge = document.getElementById('focusBadge');
  if (badge) badge.style.display = 'none';
  render();
}

function getFocusConnectedIds() {
  if (!focusEntityId) return null;
  const connected = new Set([focusEntityId]);
  const queue = [focusEntityId];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    RELATIONS.forEach(r => {
      if (r.from === cur && !connected.has(r.to)) { connected.add(r.to); queue.push(r.to); }
      if (r.to === cur && !connected.has(r.from)) { connected.add(r.from); queue.push(r.from); }
    });
  }
  return connected;
}

// Patch drawEntity to support focus dimming
const _origDrawEntity = drawEntity;
drawEntity = function(e) {
  if (focusEntityId) {
    const connected = getFocusConnectedIds();
    if (!connected.has(e.id)) {
      ctx.save(); ctx.globalAlpha = 0.2;
      _origDrawEntity(e);
      ctx.restore(); return;
    }
  }
  _origDrawEntity(e);
};

// Patch drawRelations to dim unrelated relations
const _origDrawRelations = drawRelations;
drawRelations = function() {
  if (!focusEntityId) { _origDrawRelations(); return; }
  const connected = getFocusConnectedIds();
  const savedRels = RELATIONS.slice();
  // draw dim ones first
  RELATIONS.forEach(rel => {
    if (connected.has(rel.from) && connected.has(rel.to)) return;
    const path = getRelationPath(rel);
    if (!path) return;
    ctx.save(); ctx.globalAlpha = 0.15;
    const { waypoints: wp } = path;
    ctx.strokeStyle = COLOR.line; ctx.lineWidth = 1.5;
    ctx.setLineDash(rel.lineStyle === 'dashed' ? [7,4] : []);
    ctx.beginPath(); ctx.moveTo(wp[0][0], wp[0][1]);
    for (let j = 1; j < wp.length; j++) ctx.lineTo(wp[j][0], wp[j][1]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  });
  // temporarily filter RELATIONS to only connected ones for full draw
  const focusedRels = RELATIONS.filter(r => connected.has(r.from) && connected.has(r.to));
  RELATIONS.length = 0; focusedRels.forEach(r => RELATIONS.push(r));
  _origDrawRelations();
  RELATIONS.length = 0; savedRels.forEach(r => RELATIONS.push(r));
};

// ════════════════════════════════════════════════════════════════
// FEATURE 3: 변경 이력 스냅샷
// ════════════════════════════════════════════════════════════════
let SNAPSHOTS = [];

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw) SNAPSHOTS = JSON.parse(raw);
  } catch { SNAPSHOTS = []; }
}

function persistSnapshots() {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAPSHOTS)); } catch {}
}

function saveSnapshot() {
  const now = new Date();
  const defaultName = now.toLocaleDateString('ko-KR') + ' ' + now.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
  const name = prompt('스냅샷 이름을 입력하세요:', defaultName);
  if (name === null) return;
  flushCurrentState();
  const state = JSON.stringify({ diagrams, activeDiagramId, viewMode, notationStyle, gridSnap });
  const snap = {
    id: 'snap_' + Date.now().toString(36),
    name: name.trim() || defaultName,
    ts: now.toISOString(),
    state
  };
  SNAPSHOTS.unshift(snap);
  if (SNAPSHOTS.length > SNAPSHOT_MAX) SNAPSHOTS.length = SNAPSHOT_MAX;
  persistSnapshots();
  showToast(`스냅샷 '${snap.name}' 저장됨`);
}

function openSnapshotListModal() {
  renderSnapshotList();
  document.getElementById('snapshotOverlay').classList.add('active');
}

function closeSnapshotModal() {
  document.getElementById('snapshotOverlay').classList.remove('active');
}

function renderSnapshotList() {
  const listEl = document.getElementById('snapshotList');
  const emptyEl = document.getElementById('snapshotEmpty');
  listEl.innerHTML = '';
  if (!SNAPSHOTS.length) {
    emptyEl.style.display = 'block'; listEl.style.display = 'none'; return;
  }
  emptyEl.style.display = 'none'; listEl.style.display = 'flex';
  SNAPSHOTS.forEach(snap => {
    const ts = new Date(snap.ts);
    const tsStr = ts.toLocaleDateString('ko-KR') + ' ' + ts.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    const item = document.createElement('div');
    item.className = 'snapshot-item';
    item.innerHTML = `
      <div class="snapshot-item-name" title="${escHtml(snap.name)}">${escHtml(snap.name)}</div>
      <div class="snapshot-item-ts">${escHtml(tsStr)}</div>
      <button class="btn" style="padding:4px 10px;font-size:12px;" onclick="openDiffModal('${snap.id}')">비교</button>
      <button class="btn" style="padding:4px 10px;font-size:12px;" onclick="restoreSnapshot('${snap.id}')">복원</button>
      <button class="btn-rm" onclick="deleteSnapshot('${snap.id}')" title="삭제">×</button>`;
    listEl.appendChild(item);
  });
}

function restoreSnapshot(id) {
  const snap = SNAPSHOTS.find(s => s.id === id);
  if (!snap) return;
  askConfirm(`'${snap.name}' 스냅샷으로 복원합니다. 현재 상태는 실행취소로 되돌릴 수 있습니다.`, () => {
    try {
      const s = JSON.parse(snap.state);
      restoreFromSnapshot(s);
      saveState();
      closeSnapshotModal();
      showToast(`'${snap.name}' 복원 완료`);
    } catch { showToast('복원 중 오류가 발생했습니다.'); }
  }, '복원');
}

function deleteSnapshot(id) {
  const idx = SNAPSHOTS.findIndex(s => s.id === id);
  if (idx >= 0) { SNAPSHOTS.splice(idx, 1); persistSnapshots(); renderSnapshotList(); }
}

// ── 백업 설정 모달 컨트롤러 ─────────────────────────────────────
let _bkMode = 'export';
let _bkFileData = null;

const _BK_GROUPS = [
  { id: 'diagrams',   icon: '📊', label: '다이어그램 데이터', descFn: (fd) => {
      const n = fd ? (fd.main?.diagrams?.length ?? 0) : diagrams.length;
      return `다이어그램 ${n}개 · 엔티티 · 관계 · 섹션 · 메모 · V2메모`;
    }
  },
  { id: 'snapshots',  icon: '⏱', label: '스냅샷', descFn: (fd) => {
      const n = fd ? (Array.isArray(fd.snapshots) ? fd.snapshots.length : 0) : SNAPSHOTS.length;
      return `타임라인 스냅샷 ${n}개`;
    }
  },
  { id: 'templates',  icon: '📋', label: '컬럼 템플릿', descFn: (fd) => {
      const src = fd ? (fd.templates || []) : (typeof loadTemplates === 'function' ? loadTemplates() : []);
      return `저장된 컬럼 템플릿 ${src.length}개`;
    }
  },
  { id: 'uiSettings', icon: '🎨', label: '화면 · UI 설정', descFn: () => '테마 · 퀵바 · 단축키 · 패널 너비 · 도킹' },
  { id: 'aiKey',      icon: '🔑', label: 'AI API 키',      descFn: () => 'Anthropic API 키' },
];

function _bkGroupInFile(gid, fd) {
  if (!fd) return false;
  if (gid === 'diagrams')   return !!(fd.main && Array.isArray(fd.main.diagrams) && fd.main.diagrams.length);
  if (gid === 'snapshots')  return Array.isArray(fd.snapshots) && fd.snapshots.length > 0;
  if (gid === 'templates')  return Array.isArray(fd.templates) && fd.templates.length > 0;
  if (gid === 'uiSettings') return !!(fd.settings && (fd.settings.theme || fd.settings.qbOpen !== undefined || fd.settings.shortcuts));
  if (gid === 'aiKey')      return !!(fd.settings?.aiKey);
  return false;
}

function openBackupConfigModal(mode, fileData) {
  _bkMode = mode;
  _bkFileData = fileData || null;

  document.getElementById('bkModalTitle').textContent =
    mode === 'export' ? '전체 백업 내보내기' : '전체 백업 불러오기';
  document.getElementById('bkConfirmBtn').textContent =
    mode === 'export' ? '백업 시작' : '선택 항목 복원';

  const metaEl = document.getElementById('bkModalMeta');
  if (mode === 'import' && fileData?.exportedAt) {
    metaEl.textContent = '내보낸 일시: ' + new Date(fileData.exportedAt).toLocaleString('ko-KR');
    metaEl.classList.add('visible');
  } else {
    metaEl.classList.remove('visible');
  }

  const listEl = document.getElementById('bkGroupList');
  listEl.innerHTML = _BK_GROUPS.map(g => {
    const avail = mode === 'export' ? true : _bkGroupInFile(g.id, fileData);
    const desc = g.descFn(fileData);
    return `<label class="bk-group${avail ? '' : ' bk-na'}" onclick="if(!${avail})event.preventDefault()">
      <input type="checkbox" class="bk-group-chk" data-gid="${g.id}" ${avail ? 'checked' : 'disabled'}>
      <span class="bk-group-ico">${g.icon}</span>
      <span class="bk-group-info">
        <span class="bk-group-label">${g.label}</span>
        <span class="bk-group-desc">${desc}</span>
      </span>
    </label>`;
  }).join('');

  // 체크 상태에 따라 .bk-checked 토글
  listEl.querySelectorAll('.bk-group-chk').forEach(chk => {
    const row = chk.closest('.bk-group');
    if (chk.checked) row.classList.add('bk-checked');
    chk.addEventListener('change', () => row.classList.toggle('bk-checked', chk.checked));
  });

  document.getElementById('backupConfigOverlay').classList.add('active');
}

function closeBackupConfigModal() {
  document.getElementById('backupConfigOverlay').classList.remove('active');
  _bkFileData = null;
}

function doBackupAction() {
  const groups = [...document.querySelectorAll('.bk-group-chk:checked')].map(el => el.dataset.gid);
  if (!groups.length) { showToast('항목을 하나 이상 선택하세요.'); return; }
  // closeBackupConfigModal()이 _bkFileData를 null로 초기화하므로 먼저 로컬에 보관
  const mode     = _bkMode;
  const fileData = _bkFileData;
  closeBackupConfigModal();
  if (mode === 'export') {
    _doExportWithGroups(groups);
  } else {
    _doImportWithGroups(fileData, groups);
  }
}

// ════════════════════════════════════════════════════════════════
// FEATURE 5: 단축키 모달
// ════════════════════════════════════════════════════════════════
function openShortcutsModal() {
  document.getElementById('shortcutsOverlay').classList.add('active');
  scGoTo(0);
  if (typeof scRefreshRows === 'function') scRefreshRows();
}
function closeShortcutsModal() {
  document.getElementById('shortcutsOverlay').classList.remove('active');
}

// ── 단축키 슬라이더 ────────────────────────────────────────────
(function () {
  const SC_COUNT = 3;
  let _idx = 0;

  window.scGoTo = function (idx) {
    _idx = Math.max(0, Math.min(SC_COUNT - 1, idx));
    const slides = document.getElementById('scSlides');
    if (slides) slides.style.transform = `translateX(-${_idx * 100}%)`;
    document.querySelectorAll('.sc-envtab').forEach((t, i) => t.classList.toggle('active', i === _idx));
    document.querySelectorAll('#scDots .sc-dot').forEach((d, i) => d.classList.toggle('active', i === _idx));
    const prev = document.getElementById('scPrevBtn');
    const next = document.getElementById('scNextBtn');
    if (prev) prev.disabled = _idx === 0;
    if (next) next.disabled = _idx === SC_COUNT - 1;
  };

  window.scPrev = function () { scGoTo(_idx - 1); };
  window.scNext = function () { scGoTo(_idx + 1); };
}());

// ── ESC 키 확장 (포커스 모드 해제 + 새 모달) ────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (focusEntityId) { clearFocusMode(); return; }
    if (document.getElementById('ddlImportOverlay').classList.contains('active')) { closeDDLImportModal(); return; }
    if (document.getElementById('snapshotOverlay').classList.contains('active'))  { closeSnapshotModal(); return; }
    if (document.getElementById('aiSchemaOverlay').classList.contains('active'))  { closeAISchemaModal(); return; }
    if (document.getElementById('shortcutsOverlay').classList.contains('active')) { closeShortcutsModal(); return; }
  }
}, true);

// ── Context menu 포커스 모드 항목 ────────────────────────────────
window._showCtxMenuOrig = showCtxMenu;
window.showCtxMenu = function(x, y, mode) {
  const focusItem   = document.getElementById('ctx-focus-ent');
  const unfocusItem = document.getElementById('ctx-unfocus-ent');
  if (focusItem)   focusItem.style.display   = (mode === 'entity' && !focusEntityId) ? '' : 'none';
  if (unfocusItem) unfocusItem.style.display = (mode === 'entity' && focusEntityId)  ? '' : 'none';
  window._showCtxMenuOrig(x, y, mode);
};

window._ctxFnOrig = ctxFn;
window.ctxFn = function(action) {
  if (action === 'focusEnt')   { hideCtxMenu(); setFocusEntity(ctxTargetEntity?.id); return; }
  if (action === 'unfocusEnt') { hideCtxMenu(); clearFocusMode(); return; }
  window._ctxFnOrig(action);
};

// ── 컬럼 템플릿 관리 ────────────────────────────────────────────
function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_TEMPLATES.map(t => JSON.parse(JSON.stringify(t)));
}
function saveTemplates(templates) {
  try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates)); } catch {}
}
function openTemplateModal() {
  renderTemplateList();
  document.getElementById('templateOverlay').classList.add('active');
}
function closeTemplateModal() {
  document.getElementById('templateOverlay').classList.remove('active');
}
function renderTemplateList() {
  const wrap = document.getElementById('templateListWrap');
  const templates = loadTemplates();
  if (!templates.length) {
    wrap.innerHTML = '<div style="color:#45475a;font-size:13px;text-align:center;padding:20px;">템플릿이 없습니다.</div>';
    return;
  }
  wrap.innerHTML = '';
  templates.forEach((tmpl, ti) => {
    const entry = document.createElement('div');
    entry.className = 'tmpl-entry';
    const hdr = document.createElement('div');
    hdr.className = 'tmpl-hdr';
    hdr.innerHTML = `
      <span class="tmpl-expand" onclick="toggleTmplBody(this)" title="펼치기">▸</span>
      <input class="tmpl-hdr-name-inp" value="${escHtml(tmpl.name)}" placeholder="템플릿 이름"
        onchange="renameTmpl(${ti},this.value)" onclick="event.stopPropagation()">
      <span class="tmpl-hdr-cnt">${tmpl.attrs.length}개 컬럼</span>
      <button class="diag-btn danger" title="삭제" onclick="deleteTmpl(${ti})">✕</button>`;
    const body = document.createElement('div');
    body.className = 'tmpl-body';
    body.style.display = 'none';
    const attrWrap = document.createElement('div');
    attrWrap.dataset.ti = ti;
    tmpl.attrs.forEach((a, ai) => attrWrap.appendChild(makeTmplAttrRow(ti, ai, a, templates)));
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-attr';
    addBtn.style.cssText = 'margin-top:6px';
    addBtn.textContent = '+ 컬럼 추가';
    addBtn.onclick = () => { addTmplAttr(ti); };
    body.appendChild(attrWrap);
    body.appendChild(addBtn);
    entry.appendChild(hdr);
    entry.appendChild(body);
    wrap.appendChild(entry);
  });
}
function makeTmplAttrRow(ti, ai, a, templates) {
  const esc2 = v => String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:5px;align-items:center;margin-bottom:5px;';
  row.innerHTML = `
    <input class="form-input" style="flex:1;padding:4px 6px;font-size:12px" placeholder="논리명" value="${esc2(a.logicalName)}"
      onchange="updateTmplAttr(${ti},${ai},'logicalName',this.value)">
    <input class="form-input" style="flex:1;padding:4px 6px;font-size:12px" placeholder="물리명" value="${esc2(a.physicalName)}"
      onchange="updateTmplAttr(${ti},${ai},'physicalName',this.value)">
    <input class="form-input" style="width:110px;padding:4px 6px;font-size:12px" placeholder="타입" value="${esc2(a.type)}"
      onchange="updateTmplAttr(${ti},${ai},'type',this.value)">
    <input class="form-input" style="width:80px;padding:4px 6px;font-size:12px" placeholder="DEFAULT" value="${esc2(a.defaultValue)}"
      onchange="updateTmplAttr(${ti},${ai},'defaultValue',this.value)">
    <button class="btn-rm" onclick="deleteTmplAttr(${ti},${ai})" title="삭제">×</button>`;
  return row;
}
function toggleTmplBody(icon) {
  const body = icon.closest('.tmpl-entry').querySelector('.tmpl-body');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  icon.textContent = open ? '▸' : '▾';
}
function renameTmpl(ti, name) {
  const t = loadTemplates(); t[ti].name = name; saveTemplates(t);
}
function updateTmplAttr(ti, ai, field, value) {
  const t = loadTemplates(); t[ti].attrs[ai][field] = value; saveTemplates(t);
}
function deleteTmpl(ti) {
  const t = loadTemplates(); t.splice(ti, 1); saveTemplates(t); renderTemplateList();
}
function addNewTemplate() {
  const t = loadTemplates();
  t.push({ id: 'tmpl_' + Date.now().toString(36), name: '새 템플릿', attrs: [] });
  saveTemplates(t); renderTemplateList();
  const entries = document.querySelectorAll('.tmpl-entry');
  const last = entries[entries.length - 1];
  if (last) {
    const body = last.querySelector('.tmpl-body');
    const icon = last.querySelector('.tmpl-expand');
    if (body) body.style.display = 'block';
    if (icon) icon.textContent = '▾';
    last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const nameInp = last.querySelector('.tmpl-hdr-name-inp');
    if (nameInp) { nameInp.focus(); nameInp.select(); }
  }
}
function addTmplAttr(ti) {
  const t = loadTemplates();
  t[ti].attrs.push({ logicalName:'', physicalName:'', type:'VARCHAR', kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'', description:'', ref:null });
  saveTemplates(t); renderTemplateList();
  const entries = document.querySelectorAll('.tmpl-entry');
  if (entries[ti]) {
    const body = entries[ti].querySelector('.tmpl-body');
    const icon = entries[ti].querySelector('.tmpl-expand');
    if (body) body.style.display = 'block';
    if (icon) icon.textContent = '▾';
  }
}
function deleteTmplAttr(ti, ai) {
  const t = loadTemplates(); t[ti].attrs.splice(ai, 1); saveTemplates(t); renderTemplateList();
}
function openTemplateApplyMenu(e) {
  e.stopPropagation();
  const templates = loadTemplates();
  const menu = document.getElementById('templateApplyMenu');
  if (!templates.length) { showToast('등록된 템플릿이 없습니다. 도구 → 컬럼 템플릿 관리에서 추가하세요.'); return; }
  menu.innerHTML = templates.map(t =>
    `<div class="tmpl-apply-item" onclick="applyTemplate('${t.id}')">
      <span style="color:#89b4fa">📎</span>${escHtml(t.name)}
      <span style="color:#45475a;font-size:11px;margin-left:auto">${t.attrs.length}개</span>
    </div>`
  ).join('') + `<div class="tmpl-apply-manage" onclick="openTemplateModal();document.getElementById('templateApplyMenu').style.display='none'">⚙ 템플릿 관리…</div>`;
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  menu.style.display = 'block';
  menu.style.left = rect.left + 'px';
  menu.style.top  = (rect.bottom + 4) + 'px';
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth - 8) menu.style.left = (rect.right - r.width) + 'px';
  setTimeout(() => document.addEventListener('click', () => { menu.style.display='none'; }, { once:true }), 0);
}
function applyTemplate(id) {
  document.getElementById('templateApplyMenu').style.display = 'none';
  const templates = loadTemplates();
  const tmpl = templates.find(t => t.id === id);
  if (!tmpl) return;
  tmpl.attrs.forEach(a => addAttrRow(a));
  showToast(`'${tmpl.name}' 템플릿 적용 (${tmpl.attrs.length}개 컬럼)`);
}

// ── 테마 ─────────────────────────────────────────────────────────
function applyTheme(name, save = true) {
  const theme = THEMES[name];
  if (!theme) return;
  currentTheme = name;
  if (name === 'dark') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = name;
  }
  Object.assign(COLOR, theme.color);
  render();
  if (save) { try { localStorage.setItem(THEME_STORAGE, name); } catch {} }
  document.querySelectorAll('.theme-card').forEach(el => {
    el.classList.toggle('ts-active', el.dataset.theme === name);
  });
}

function openThemeModal() {
  let modal = document.getElementById('themeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'themeModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="width:400px">
        <h3>🎨 테마 변경</h3>
        <div class="theme-grid" id="themeGrid"></div>
        <div class="modal-actions" style="margin-top:18px">
          <button class="btn-cancel-m" onclick="document.getElementById('themeModal').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    document.body.appendChild(modal);
  }
  const grid = modal.querySelector('#themeGrid');
  grid.innerHTML = Object.entries(THEMES).map(([key, t]) => {
    const p = t.preview;
    const active = currentTheme === key ? ' ts-active' : '';
    return `<div class="theme-card${active}" data-theme="${key}" onclick="applyTheme('${key}')">
      <div class="theme-card-preview" style="background:${p.bg}">
        <div class="tp-header" style="background:${p.header}"></div>
        <div class="tp-body">
          <div class="tp-line" style="background:${p.line}"></div>
          <div class="tp-line" style="background:${p.accent};flex:0.6"></div>
          <div class="tp-line" style="background:${p.line};flex:0.8"></div>
        </div>
      </div>
      <div class="theme-card-name">${t.name}</div>
    </div>`;
  }).join('');
  modal.classList.add('active');
}

function loadSavedTheme() {
  try {
    const MIGRATE = { ocean: 'frappe', forest: 'macchiato' };
    let saved = localStorage.getItem(THEME_STORAGE);
    if (saved && MIGRATE[saved]) saved = MIGRATE[saved]; // 구 테마명 마이그레이션
    if (saved && THEMES[saved]) applyTheme(saved, false);
  } catch {}
}

// ── 커맨드 팔레트 (메뉴 전체 검색) ──────────────────────────────
const CMD_LIST = [
  // 파일
  { label: '엔티티 추가',                category: '파일', icon: '📋', scId: 'addEnt',  action: () => openAddEntityModal() },
  { label: '관계 추가',                  category: '파일', icon: '⟷', scId: 'addRel',  action: () => openAddRelationModal() },
  { label: 'JSON 내보내기',              category: '파일', icon: '💾', scId: 'save',    action: () => exportData() },
  { label: '전체 백업 내보내기',          category: '파일', icon: '💾', scId: 'saveAll', action: () => exportFullBackup() },
  { label: 'DDL 생성',                   category: '파일', icon: '🗄', action: () => openDDLModal() },
  { label: '이미지 내보내기 (섹션 포함)', category: '파일', icon: '🖼', action: () => downloadImage(true) },
  { label: '이미지 내보내기 (섹션 제외)', category: '파일', icon: '🖼', action: () => downloadImage(false) },
  { label: 'SVG 내보내기',               category: '파일', icon: '⬡', action: () => downloadSVG() },
  { label: 'Markdown 내보내기',          category: '파일', icon: '📄', action: () => exportMarkdown() },
  { label: 'HTML 내보내기',              category: '파일', icon: '🌐', action: () => exportHTML() },
  { label: '인쇄 / PDF 저장',            category: '파일', icon: '🖨', action: () => exportPDF() },
  { label: '내보내기 폴더 재설정',        category: '파일', icon: '📁', action: () => resetExportDir() },
  { label: 'JSON 불러오기',              category: '파일', icon: '📂', action: () => importData() },
  { label: '전체 백업 불러오기',          category: '파일', icon: '📥', action: () => importFullBackup() },
  { label: 'DDL 가져오기',               category: '파일', icon: '⬆', action: () => openDDLImportModal() },
  // 편집
  { label: '실행취소',       category: '편집', icon: '↩', scId: 'undo',   action: () => undo() },
  { label: '다시실행',       category: '편집', icon: '↪', scId: 'redo',   action: () => redo() },
  { label: '복사',           category: '편집', icon: '⧉', scId: 'copy',   action: () => copyEntity() },
  { label: '붙여넣기',       category: '편집', icon: '📋', scId: 'paste',  action: () => pasteEntity() },
  { label: '복제',           category: '편집', icon: '⧉', scId: 'dup',    action: () => {} },
  { label: '전체 선택',      category: '편집', icon: '⊡', scId: 'selAll', action: () => { ENTITIES.forEach(en => selectedEntities.add(en.id)); render(); } },
  { label: '섹션 모드',      category: '편집', icon: '▭', action: () => toggleSectionMode() },
  { label: '그리드 스냅',    category: '편집', icon: '⊞', action: () => toggleGridSnap() },
  { label: 'AI 스키마 생성', category: '편집', icon: '🤖', action: () => openAISchemaModal() },
  { label: '데이터 초기화',  category: '편집', icon: '⚠', action: () => resetToDefault() },
  // 보기
  { label: '테마 변경',      category: '보기', icon: '🎨', action: () => openThemeModal() },
  { label: '뷰 초기화',      category: '보기', icon: '↺',  action: () => resetView() },
  { label: '전체 맞춤',      category: '보기', icon: '⊟', scId: 'fitAll', action: () => fitAll() },
  { label: '계층형 배치',    category: '보기', icon: '⋹', action: () => autoLayout('hierarchical') },
  { label: '격자형 배치',    category: '보기', icon: '⊞', action: () => autoLayout('grid') },
  { label: '원형 배치',      category: '보기', icon: '◯', action: () => autoLayout('circular') },
  { label: '자동 관계선 최적화', category: '보기', icon: '⫸', action: () => autoOptimizeRelations() },
  { label: '관계선최적화V2',    category: '보기', icon: '⫷', action: () => autoOptimizeRelationsV2() },
  { label: '논리 보기',      category: '보기', icon: '𝐋',  action: () => setViewMode('logical') },
  { label: '물리 보기',      category: '보기', icon: '𝐏',  action: () => setViewMode('physical') },
  { label: '크로우풋 표기',  category: '보기', icon: '⋈', action: () => toggleNotation() },
  { label: '왼쪽 정렬',      category: '보기', icon: '◧', action: () => alignEntities('left') },
  { label: '수평 중앙 정렬', category: '보기', icon: '↔', action: () => alignEntities('hcenter') },
  { label: '오른쪽 정렬',    category: '보기', icon: '◨', action: () => alignEntities('right') },
  { label: '위 정렬',        category: '보기', icon: '⬒', action: () => alignEntities('top') },
  { label: '수직 중앙 정렬', category: '보기', icon: '↕', action: () => alignEntities('vcenter') },
  { label: '아래 정렬',      category: '보기', icon: '⬓', action: () => alignEntities('bottom') },
  { label: '수평 균등 배분', category: '보기', icon: '⇔', action: () => alignEntities('hdist') },
  { label: '수직 균등 배분', category: '보기', icon: '⇕', action: () => alignEntities('vdist') },
  // 도구
  { label: '엔티티 검색',     category: '도구', icon: '🔍', scId: 'search', action: () => openSearch() },
  { label: '컬럼 탬플릿 관리', category: '도구', icon: '📎', action: () => openTemplateModal() },
  { label: 'SQL 실행기',       category: '도구', icon: '🗄', action: () => openSqlRunner() },
  { label: 'JOIN 경로 탐색기', category: '도구', icon: '🔗', action: () => openJoinExplorer() },
  { label: '정규화 진단',      category: '도구', icon: '⚠', action: () => runNormalizeDiagnosis() },
  { label: '진단 배지 제거',   category: '도구', icon: '✓', action: () => clearNormDiagnosis() },
  { label: '스냅샷 저장',      category: '도구', icon: '📷', action: () => saveSnapshot() },
  { label: '스냅샷 목록',      category: '도구', icon: '📋', action: () => openSnapshotListModal() },
  { label: '타임라인 슬라이더', category: '도구', icon: '⏱', action: () => openTimelineModal() },
  { label: '단축키 편집기',    category: '도구', icon: '⌨', action: () => openShortcutsModal() },
  // 공유
  { label: 'P2P 실시간 협업', category: '공유', icon: '🔗', action: () => openRtcModal() },
  { label: '탭 동기화',       category: '공유', icon: '🔄', action: () => toggleBcSync() },
  { label: '공유 URL 생성',   category: '공유', icon: '🔗', action: () => generateShareUrl() },
  // Help
  { label: '단축키 목록',     category: 'Help', icon: '⌨', action: () => openShortcutsModal() },
];

let _cmdActiveIdx = -1;
let _cmdFiltered  = [];

function openCmdPalette() {
  const el = document.getElementById('cmdPalette');
  if (!el) return;
  el.style.display = 'flex';
  _cmdActiveIdx = 0;
  _cmdFiltered  = [...CMD_LIST];
  const input = document.getElementById('cmdInput');
  if (input) { input.value = ''; input.focus(); }
  _renderCmdResults();
}

function closeCmdPalette() {
  const el = document.getElementById('cmdPalette');
  if (el) el.style.display = 'none';
  _cmdActiveIdx = -1;
  _cmdFiltered  = [];
}

function onCmdInput(q) {
  const query = q.trim().toLowerCase();
  if (!query) {
    _cmdFiltered  = [...CMD_LIST];
    _cmdActiveIdx = 0;
  } else {
    _cmdFiltered = CMD_LIST.filter(cmd => {
      if (cmd.label.toLowerCase().includes(query))    return true;
      if (cmd.category.toLowerCase().includes(query)) return true;
      if (cmd.scId) {
        // 단축키 문자열 매칭 (예: "ctrl+k", "ctrl s", "ctrl", "k")
        const raw = _scParts(cmd.scId).join('+').toLowerCase();
        if (raw.includes(query)) return true;
        const compact = _scParts(cmd.scId).join('').toLowerCase();
        if (compact.includes(query.replace(/[\+\s\-]/g, ''))) return true;
      }
      return false;
    });
    _cmdActiveIdx = _cmdFiltered.length > 0 ? 0 : -1;
  }
  _renderCmdResults();
}

function _highlightMatch(text, query) {
  if (!query) return escHtml(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escHtml(text);
  return escHtml(text.slice(0, idx))
    + '<mark>' + escHtml(text.slice(idx, idx + query.length)) + '</mark>'
    + escHtml(text.slice(idx + query.length));
}

function _renderCmdResults() {
  const el = document.getElementById('cmdResults');
  if (!el) return;
  const query = (document.getElementById('cmdInput')?.value || '').trim().toLowerCase();
  if (!_cmdFiltered.length) {
    el.innerHTML = '<div class="cmd-empty">검색 결과 없음</div>';
    return;
  }
  el.innerHTML = _cmdFiltered.map((cmd, i) => {
    const keysHtml = cmd.scId
      ? _scParts(cmd.scId).map((p, j, arr) =>
          `<span class="cmd-key">${escHtml(p)}</span>` +
          (j < arr.length - 1 ? '<span class="cmd-key-sep">+</span>' : '')
        ).join('')
      : '';
    const isActive = i === _cmdActiveIdx;
    return `<div class="cmd-item${isActive ? ' cmd-active' : ''}" onmouseenter="_cmdSetActive(${i})" onclick="_execCmd(${i})" data-cmd-idx="${i}">
      <span class="cmd-item-icon">${escHtml(cmd.icon || '')}</span>
      <span class="cmd-item-label">${_highlightMatch(cmd.label, query)}</span>
      <span class="cmd-item-cat">${escHtml(cmd.category)}</span>
      ${keysHtml ? `<span class="cmd-item-keys">${keysHtml}</span>` : ''}
    </div>`;
  }).join('');
  // 활성 항목이 보이도록 스크롤
  const active = el.querySelector('.cmd-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function _cmdSetActive(idx) {
  _cmdActiveIdx = idx;
  _renderCmdResults();
}

function onCmdKey(e) {
  if (e.key === 'Escape')    { closeCmdPalette(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (_cmdFiltered.length) {
      _cmdActiveIdx = (_cmdActiveIdx + 1) % _cmdFiltered.length;
      _renderCmdResults();
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (_cmdFiltered.length) {
      _cmdActiveIdx = (_cmdActiveIdx - 1 + _cmdFiltered.length) % _cmdFiltered.length;
      _renderCmdResults();
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (_cmdActiveIdx >= 0 && _cmdActiveIdx < _cmdFiltered.length) {
      _execCmd(_cmdActiveIdx);
    }
    return;
  }
}

function _execCmd(idx) {
  const cmd = _cmdFiltered[idx];
  if (!cmd) return;
  closeCmdPalette();
  // 팔레트 닫힌 뒤 실행 (모달 포커스 이슈 방지)
  setTimeout(() => { try { cmd.action(); } catch(err) { console.warn('[CMD]', err); } }, 30);
}
