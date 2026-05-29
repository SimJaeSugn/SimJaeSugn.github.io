// ── 단축키 커스터마이징 ─────────────────────────────────────────────

const SC_DEFAULTS = {
  addEnt:  { ctrl: false, shift: false, alt: false, key: 'n',      label: '엔티티 추가' },
  addRel:  { ctrl: false, shift: false, alt: false, key: 'r',      label: '관계 추가' },
  fitAll:  { ctrl: false, shift: false, alt: false, key: 'Home',   label: '전체 맞춤' },
  undo:    { ctrl: true,  shift: false, alt: false, key: 'z',      label: '실행취소' },
  redo:    { ctrl: true,  shift: false, alt: false, key: 'y',      label: '다시실행' },
  save:    { ctrl: true,  shift: false, alt: false, key: 's',      label: 'JSON 저장' },
  saveAll: { ctrl: true,  shift: true,  alt: false, key: 's',      label: '전체 백업 저장' },
  search:  { ctrl: true,  shift: false, alt: false, key: 'f',      label: '검색' },
  copy:    { ctrl: true,  shift: false, alt: false, key: 'c',      label: '복사' },
  paste:   { ctrl: true,  shift: false, alt: false, key: 'v',      label: '붙여넣기' },
  dup:     { ctrl: true,  shift: false, alt: false, key: 'd',      label: '복제' },
  selAll:  { ctrl: true,  shift: false, alt: false, key: 'a',      label: '전체 선택' },
  del:     { ctrl: false, shift: false, alt: false, key: 'Delete', label: '삭제' },
};

let _scMap = {};
let _scRecording = null;

function loadShortcuts() {
  _scMap = {};
  for (const [id, def] of Object.entries(SC_DEFAULTS)) {
    _scMap[id] = { ...def };
  }
  try {
    const saved = JSON.parse(localStorage.getItem('_shortcuts') || '{}');
    for (const [id, val] of Object.entries(saved)) {
      if (_scMap[id]) _scMap[id] = { ..._scMap[id], ...val };
    }
  } catch {}
}

function _saveShortcuts() {
  const custom = {};
  for (const [id, val] of Object.entries(_scMap)) {
    const def = SC_DEFAULTS[id];
    if (val.ctrl !== def.ctrl || val.shift !== def.shift ||
        val.alt !== def.alt || val.key.toLowerCase() !== def.key.toLowerCase()) {
      custom[id] = { ctrl: val.ctrl, shift: val.shift, alt: val.alt, key: val.key };
    }
  }
  try { localStorage.setItem('_shortcuts', JSON.stringify(custom)); } catch {}
}

function matchSC(e, id) {
  const sc = _scMap[id];
  if (!sc) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  return ctrl === sc.ctrl &&
         e.shiftKey === sc.shift &&
         e.altKey  === sc.alt &&
         e.key.toLowerCase() === sc.key.toLowerCase();
}

function _scParts(id) {
  const sc = _scMap[id] || SC_DEFAULTS[id];
  const parts = [];
  if (sc.ctrl)  parts.push('Ctrl');
  if (sc.alt)   parts.push('Alt');
  if (sc.shift) parts.push('Shift');
  const k = sc.key;
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts;
}

function _isCustom(id) {
  const sc = _scMap[id], def = SC_DEFAULTS[id];
  if (!sc || !def) return false;
  return sc.ctrl !== def.ctrl || sc.shift !== def.shift ||
         sc.alt !== def.alt || sc.key.toLowerCase() !== def.key.toLowerCase();
}

function _renderRowKeys(row, id) {
  const custom = _isCustom(id);
  const parts  = _scParts(id);
  const keysEl = row.querySelector('.sc-keys');
  if (!keysEl) return;
  const rendered = parts.map((p, i) =>
    `<span class="sc-key${custom ? ' sc-key-custom' : ''}">${p}</span>` +
    (i < parts.length - 1 ? '<span class="sc-key-sep">+</span>' : '')
  ).join('');
  // redo는 하드코딩 보조 단축키(Ctrl+Shift+Z)가 main.js에 별도로 존재하므로 함께 표시
  if (id === 'redo') {
    keysEl.innerHTML = rendered +
      '&thinsp;<span class="sc-key-sep">/</span>&thinsp;' +
      '<span class="sc-key">Ctrl</span><span class="sc-key-sep">+</span>' +
      '<span class="sc-key">Shift</span><span class="sc-key-sep">+</span><span class="sc-key">Z</span>';
  } else {
    keysEl.innerHTML = rendered;
  }

  let resetBtn = row.querySelector('.sc-reset-btn');
  if (custom) {
    if (!resetBtn) {
      resetBtn = document.createElement('button');
      resetBtn.className = 'sc-reset-btn';
      resetBtn.title = '기본값으로 되돌리기';
      resetBtn.textContent = '↺';
      resetBtn.addEventListener('click', e => { e.stopPropagation(); scResetOne(id); });
      row.appendChild(resetBtn);
    }
  } else {
    resetBtn?.remove();
  }
}

// ── 모달 열릴 때 모든 행 갱신 ────────────────────────────────────────
function scRefreshRows() {
  document.querySelectorAll('.sc-row[data-sc-id]').forEach(row => {
    const id = row.dataset.scId;
    _renderRowKeys(row, id);
    if (!row.querySelector('.sc-edit-btn')) {
      const btn = document.createElement('button');
      btn.className = 'sc-edit-btn';
      btn.title = '단축키 재할당';
      btn.textContent = '✏';
      btn.addEventListener('click', e => { e.stopPropagation(); scStartRecord(id, row); });
      row.appendChild(btn);
    }
  });
}

// ── 키 녹화 ──────────────────────────────────────────────────────────
function scStartRecord(id, row) {
  if (_scRecording) _scCancelRecord();
  _scRecording = { id, row };
  row.classList.add('sc-recording');
  row.querySelector('.sc-keys').innerHTML =
    '<span class="sc-recording-badge">⌨ 키를 누르세요… (Esc: 취소)</span>';
  document.addEventListener('keydown', _scOnKey, { capture: true });
}

function _scOnKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (['Control','Shift','Alt','Meta'].includes(e.key)) return;
  if (e.key === 'Escape') { _scCancelRecord(); return; }

  const sc = {
    ctrl:  e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt:   e.altKey,
    key:   e.key,
  };

  // 충돌 검사
  const conflict = Object.entries(_scMap).find(([oid, osc]) =>
    oid !== _scRecording.id &&
    osc.ctrl === sc.ctrl && osc.shift === sc.shift &&
    osc.alt === sc.alt && osc.key.toLowerCase() === sc.key.toLowerCase()
  );

  const { id, row } = _scRecording;
  document.removeEventListener('keydown', _scOnKey, { capture: true });
  _scRecording = null;
  row.classList.remove('sc-recording');

  if (conflict) {
    const [cid] = conflict;
    const label = SC_DEFAULTS[cid]?.label || cid;
    row.querySelector('.sc-keys').innerHTML =
      `<span class="sc-conflict-badge">⚠ 충돌: ${label}</span>`;
    setTimeout(() => _renderRowKeys(row, id), 2000);
    return;
  }

  _scMap[id] = { ..._scMap[id], ...sc };
  _saveShortcuts();
  _renderRowKeys(row, id);
}

function _scCancelRecord() {
  if (!_scRecording) return;
  document.removeEventListener('keydown', _scOnKey, { capture: true });
  const { id, row } = _scRecording;
  _scRecording = null;
  row.classList.remove('sc-recording');
  _renderRowKeys(row, id);
}

function scResetOne(id) {
  const def = SC_DEFAULTS[id];
  if (!def) return;
  _scMap[id] = { ...def };
  _saveShortcuts();
  const row = document.querySelector(`.sc-row[data-sc-id="${id}"]`);
  if (row) _renderRowKeys(row, id);
}

function scResetAll() {
  for (const id of Object.keys(SC_DEFAULTS)) _scMap[id] = { ...SC_DEFAULTS[id] };
  _saveShortcuts();
  scRefreshRows();
}

loadShortcuts();
