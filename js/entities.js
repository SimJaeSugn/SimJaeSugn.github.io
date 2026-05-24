// ── Entity CRUD ──────────────────────────────────────────────────
let editingEntity = null;
let attrDragSrc = null;
let modalDbType = 'mysql';
let _modalColorTag = null; // 모달에서 선택 중인 색상
let _extractSource = null;

function buildTypeOptions(dbType, selectedValue = '') {
  const db = DB_TYPES[dbType] || DB_TYPES.mysql;
  let found = false;
  let html = '';
  db.groups.forEach(g => {
    html += `<optgroup label="${g.label}">`;
    g.types.forEach(t => {
      const sel = t === selectedValue ? (found = true, 'selected') : '';
      html += `<option value="${t}" ${sel}>${t}</option>`;
    });
    html += '</optgroup>';
  });
  // 기존 값이 목록에 없으면 맨 위에 추가
  if (!found && selectedValue) {
    html = `<option value="${selectedValue}" selected>${selectedValue}</option>` + html;
  }
  return html;
}

function onDbTypeChange(dbType) {
  modalDbType = dbType;
  const d = getActiveDiagram();
  if (d) d.dbType = dbType;
  document.querySelectorAll('#attrList .attr-type').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = buildTypeOptions(dbType, cur);
  });
}

function openAddEntityModal() {
  editingEntity = null;
  document.getElementById('entModalTitle').textContent = '엔티티 추가';
  document.getElementById('entId').value = '';
  document.getElementById('entId').disabled = false;
  document.getElementById('entLogical').value = '';
  document.getElementById('entPhysical').value = '';
  document.getElementById('entDesc').value = '';
  document.getElementById('entRowCount').value = '';
  document.getElementById('entDelBtn').style.display = 'none';
  document.getElementById('entExtractBtn').style.display = 'none';
  clearFormErrs();
  modalDbType = getActiveDiagram().dbType || 'mysql';
  document.getElementById('entDbType').value = modalDbType;
  document.getElementById('attrList').innerHTML = '';
  addAttrRow();
  renderIndexList([]);
  renderColorSwatches(null);
  document.getElementById('entOverlay').classList.add('active');
  setTimeout(() => document.getElementById('entLogical').focus(), 50);
}

// 콤마 분리 속성명 배열을 논리명으로 미리 채워 엔티티 추가 팝업 열기
function openAddEntityModalWithAttrs(attrNames) {
  openAddEntityModal();                        // 기본 초기화 (빈 행 1개 추가됨)
  document.getElementById('attrList').innerHTML = '';   // 빈 행 제거
  attrNames.forEach(name => addAttrRow({ logicalName: name }));
  // 첫 번째 속성명 입력란에 포커스 (엔티티 이름 먼저 입력하도록 논리명 필드 유지)
  setTimeout(() => {
    const firstLogical = document.querySelector('#attrList .attr-logical');
    if (firstLogical) firstLogical.focus();
  }, 80);
}

function openEditEntityModal(entity) {
  editingEntity = entity;
  document.getElementById('entModalTitle').textContent = '엔티티 편집';
  document.getElementById('entId').value = entity.id;
  document.getElementById('entId').disabled = true;
  document.getElementById('entLogical').value = entity.logicalName || '';
  document.getElementById('entPhysical').value = entity.physicalName || '';
  document.getElementById('entDesc').value = entity.description || '';
  document.getElementById('entRowCount').value = entity.rowCount != null ? entity.rowCount : '';
  document.getElementById('entDelBtn').style.display = '';
  document.getElementById('entExtractBtn').style.display = '';
  clearFormErrs();
  modalDbType = getActiveDiagram().dbType || 'mysql';
  document.getElementById('entDbType').value = modalDbType;
  const list = document.getElementById('attrList');
  list.innerHTML = '';
  entity.attrs.forEach(a => addAttrRow(a));
  renderIndexList(entity.indexes || []);
  renderColorSwatches(entity.colorTag || null);
  document.getElementById('entOverlay').classList.add('active');
  setTimeout(() => document.getElementById('entLogical').focus(), 50);
}

function closeEntModal() { document.getElementById('entOverlay').classList.remove('active'); }

function clearFormErrs() {
  document.querySelectorAll('.form-err').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.add('show');
}

function addAttrRow(attr = {}) {
  const { logicalName = '', physicalName = '', type = 'VARCHAR', kind = 'normal', description = '', ref = null, notNull = false, unique = false, autoIncrement = false, defaultValue = '' } = attr;
  const entry = document.createElement('div');
  entry.className = 'attr-entry';
  const esc = v => String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  entry.innerHTML = `
    <div class="attr-row-main">
      <div class="attr-drag-handle" title="드래그하여 순서 변경">⠿</div>
      <input class="form-input attr-logical"  value="${esc(logicalName)}"  placeholder="논리명" />
      <input class="form-input attr-physical" value="${esc(physicalName)}" placeholder="물리명" />
      <select class="form-select attr-type">${buildTypeOptions(modalDbType, type)}</select>
      <select class="form-select attr-kind" onchange="onKindChange(this)">
        <option value="normal" ${kind==='normal'?'selected':''}>일반</option>
        <option value="pk"     ${kind==='pk'    ?'selected':''}>PK</option>
        <option value="fk"     ${kind==='fk'    ?'selected':''}>FK</option>
      </select>
      <label class="attr-ck-label"><input type="checkbox" class="attr-notnull"   ${notNull?'checked':''}> NOT NULL</label>
      <label class="attr-ck-label"><input type="checkbox" class="attr-unique"    ${unique ?'checked':''}> UNIQUE</label>
      <label class="attr-ck-label"><input type="checkbox" class="attr-autoinc"   ${autoIncrement?'checked':''}> AI</label>
      <input class="form-input attr-default" value="${esc(defaultValue)}" placeholder="DEFAULT" style="${kind==='fk'?'display:none':''}" />
      <input class="form-input attr-desc"    value="${esc(description)}" placeholder="설명 (선택)" style="font-size:12px;${kind==='fk'?'display:none':''}" />
      <span class="fk-lbl-inline" style="${kind!=='fk'?'display:none':''}">참조 →</span>
      <select class="form-select fk-ent-sel" onchange="onRefEntityChange(this)" style="${kind!=='fk'?'display:none':''}"></select>
      <span class="fk-dot-inline" style="${kind!=='fk'?'display:none':''}">.</span>
      <select class="form-select fk-att-sel" style="${kind!=='fk'?'display:none':''}"></select>
      <button class="btn-rm" onclick="this.closest('.attr-entry').remove()" title="삭제">×</button>
    </div>`;
  document.getElementById('attrList').appendChild(entry);
  if (kind === 'fk') populateRefEntitySelect(entry, ref?.entity, ref?.attr);

  const handle = entry.querySelector('.attr-drag-handle');
  handle.addEventListener('mousedown', () => { entry.draggable = true; });
  handle.addEventListener('mouseup',   () => { entry.draggable = false; });

  entry.addEventListener('dragstart', e => {
    attrDragSrc = entry;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => entry.classList.add('attr-dragging'), 0);
  });
  entry.addEventListener('dragend', () => {
    entry.draggable = false;
    entry.classList.remove('attr-dragging');
    document.querySelectorAll('#attrList .attr-entry').forEach(el =>
      el.classList.remove('drag-over-top', 'drag-over-bottom')
    );
    attrDragSrc = null;
  });
  entry.addEventListener('dragover', e => {
    if (!attrDragSrc || attrDragSrc === entry) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#attrList .attr-entry').forEach(el =>
      el.classList.remove('drag-over-top', 'drag-over-bottom')
    );
    const rect = entry.getBoundingClientRect();
    entry.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
  });
  entry.addEventListener('dragleave', () => {
    entry.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  entry.addEventListener('drop', e => {
    e.preventDefault();
    entry.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!attrDragSrc || attrDragSrc === entry) return;
    const list = document.getElementById('attrList');
    const rect = entry.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      list.insertBefore(attrDragSrc, entry);
    } else {
      list.insertBefore(attrDragSrc, entry.nextSibling);
    }
  });
}

function onKindChange(sel) {
  const entry = sel.closest('.attr-entry');
  const isFk = sel.value === 'fk';
  const show = (cls, visible) => { const el = entry.querySelector(cls); if (el) el.style.display = visible ? '' : 'none'; };
  show('.attr-default',    !isFk);
  show('.attr-desc',       !isFk);
  show('.fk-lbl-inline',   isFk);
  show('.fk-ent-sel',      isFk);
  show('.fk-dot-inline',   isFk);
  show('.fk-att-sel',      isFk);
  if (isFk && !entry.querySelector('.fk-ent-sel').options.length) {
    populateRefEntitySelect(entry, null, null);
  }
}

function populateRefEntitySelect(entry, selectedEntityId, selectedAttrName) {
  const entSel = entry.querySelector('.fk-ent-sel');
  if (!ENTITIES.length) {
    entSel.innerHTML = '<option value="">엔티티 없음</option>';
    return;
  }
  entSel.innerHTML = ENTITIES.map(e =>
    `<option value="${e.id}" ${e.id===selectedEntityId?'selected':''}>${e.logicalName||e.physicalName||e.id} (${e.id})</option>`
  ).join('');
  const targetId = selectedEntityId || entSel.value;
  populateRefAttrSelect(entry, targetId, selectedAttrName);
}

function populateRefAttrSelect(entry, entityId, selectedAttrName) {
  const entity = entityMap()[entityId];
  const attSel = entry.querySelector('.fk-att-sel');
  if (!entity) { attSel.innerHTML = ''; return; }
  const sorted = [...entity.attrs].sort((a, b) => {
    const rank = { pk: 0, fk: 1, normal: 2 };
    return (rank[a.kind] ?? 2) - (rank[b.kind] ?? 2);
  });
  attSel.innerHTML = sorted.map(a => {
    const badge = a.kind === 'pk' ? 'PK' : a.kind === 'fk' ? 'FK' : '일반';
    const pn = a.physicalName || a.logicalName || '';
    return `<option value="${pn}" ${pn===selectedAttrName?'selected':''}>${a.logicalName||pn} / ${pn} (${badge})</option>`;
  }).join('');
}

function onRefEntityChange(sel) {
  populateRefAttrSelect(sel.closest('.attr-entry'), sel.value, null);
}

function syncFKReferences(entityId, oldAttrs, newAttrs) {
  // position-based rename map: old physicalName → new physicalName
  const renameMap = {};
  oldAttrs.forEach((oldA, i) => {
    const newA = newAttrs[i];
    if (!newA) return;
    const oldKey = oldA.physicalName || oldA.logicalName;
    const newKey = newA.physicalName || newA.logicalName;
    if (oldKey) renameMap[oldKey] = newKey;
  });

  ENTITIES.forEach(ent => {
    let changed = false;
    ent.attrs.forEach(attr => {
      if (attr.kind !== 'fk' || attr.ref?.entity !== entityId) return;
      const oldRef = attr.ref.attr;
      const newRef = renameMap[oldRef] ?? oldRef;
      // update ref.attr if renamed
      if (newRef !== oldRef) {
        attr.ref = { ...attr.ref, attr: newRef };
        attr.physicalName = newRef;
        changed = true;
      }
      // sync type from referenced attr
      const refAttr = newAttrs.find(a => (a.physicalName || a.logicalName) === attr.ref.attr);
      if (refAttr && refAttr.type && refAttr.type !== attr.type) {
        attr.type = refAttr.type;
        changed = true;
      }
    });
    return changed;
  });
}

function saveEntity() {
  clearFormErrs();
  const logicalVal  = document.getElementById('entLogical').value.trim();
  const physicalVal = document.getElementById('entPhysical').value.trim();
  const descVal     = document.getElementById('entDesc').value.trim();
  const idRaw       = document.getElementById('entId').value.trim();
  const rowCountRaw = document.getElementById('entRowCount').value.trim();
  const rowCount    = rowCountRaw !== '' ? parseInt(rowCountRaw) || 0 : undefined;

  if (!logicalVal && !physicalVal) {
    showErr('entLogicalErr', '논리명 또는 물리명을 입력하세요.'); return;
  }

  const attrs = Array.from(document.getElementById('attrList').querySelectorAll('.attr-entry')).map(entry => {
    const logicalName  = entry.querySelector('.attr-logical').value.trim();
    const physicalName = entry.querySelector('.attr-physical').value.trim();
    const type         = entry.querySelector('.attr-type').value.trim() || 'VARCHAR';
    const kind         = entry.querySelector('.attr-kind').value;
    const description  = entry.querySelector('.attr-desc').value.trim();
    const notNull       = entry.querySelector('.attr-notnull')?.checked || false;
    const unique        = entry.querySelector('.attr-unique')?.checked || false;
    const autoIncrement = entry.querySelector('.attr-autoinc')?.checked || false;
    const defaultValue  = entry.querySelector('.attr-default')?.value.trim() || '';
    const result = { logicalName, physicalName, type, kind, description, ref: null, notNull, unique, autoIncrement, defaultValue };
    if (kind === 'fk') {
      const entSel = entry.querySelector('.fk-ent-sel');
      const attSel = entry.querySelector('.fk-att-sel');
      if (entSel?.value) result.ref = { entity: entSel.value, attr: attSel?.value || '' };
    }
    return result;
  }).filter(a => a.logicalName || a.physicalName);

  let targetEntityId;
  const indexes = collectIndexes();

  if (editingEntity) {
    const oldAttrs = editingEntity.attrs.slice(); // snapshot before overwrite
    editingEntity.logicalName  = logicalVal;
    editingEntity.physicalName = physicalVal;
    editingEntity.description  = descVal;
    editingEntity.attrs        = attrs;
    editingEntity.indexes      = indexes;
    editingEntity.colorTag     = _modalColorTag || undefined;
    editingEntity.rowCount     = rowCount;
    targetEntityId = editingEntity.id;
    syncFKReferences(editingEntity.id, oldAttrs, attrs);
  } else {
    const newId = idRaw || 'entity_' + Date.now().toString(36);
    if (ENTITIES.find(e => e.id === newId)) {
      showErr('entIdErr', '이미 사용 중인 ID입니다.'); return;
    }
    const cx = (canvas.width / 2 - vx) / scale;
    const cy = (canvas.height / 2 - vy) / scale;
    ENTITIES.push({ id: newId, logicalName: logicalVal, physicalName: physicalVal, description: descVal, colorTag: _modalColorTag || undefined, rowCount, x: cx - W / 2, y: cy - 60, attrs, indexes });
    targetEntityId = newId;
  }

  attrs.filter(a => a.kind === 'fk' && a.ref?.entity).forEach(attr => {
    const from = attr.ref.entity, to = targetEntityId;
    const exists = RELATIONS.some(r =>
      (r.from === from && r.to === to) || (r.from === to && r.to === from)
    );
    if (!exists && from !== to) RELATIONS.push({ from, to, card: '1:N' });
  });

  closeEntModal(); render(); saveState(); renderEntityTree();
}

function deleteEntity(entity, save = true) {
  const idx = ENTITIES.indexOf(entity);
  if (idx >= 0) ENTITIES.splice(idx, 1);
  expandedEntities.delete(entity.id);
  for (let i = RELATIONS.length - 1; i >= 0; i--) {
    if (RELATIONS[i].from === entity.id || RELATIONS[i].to === entity.id) RELATIONS.splice(i, 1);
  }
  if (save) { render(); saveState(); renderEntityTree(); }
}

function deleteCurrentEntity() {
  closeEntModal();
  askConfirm(`'${entDisplayName(editingEntity)}' 엔티티와 연결된 모든 관계를 삭제합니다.`, () => deleteEntity(editingEntity), '삭제');
}

// ── 색상 스와치 ──────────────────────────────────────────────────
function renderColorSwatches(selectedId) {
  _modalColorTag = selectedId;
  const wrap = document.getElementById('colorSwatches');
  if (!wrap) return;
  wrap.innerHTML = ENTITY_COLOR_PALETTE.map(c => {
    const active = (c.id === selectedId) ? ' cs-active' : '';
    return `<div class="color-swatch${active}" title="${c.label}"
      style="background:${c.bg};"
      onclick="selectColorTag(${c.id === null ? 'null' : `'${c.id}'`})"></div>`;
  }).join('');
}
function selectColorTag(id) {
  _modalColorTag = id;
  renderColorSwatches(id);
}

// ── 속성 추출 ────────────────────────────────────────────────────
function openExtractModal() {
  _extractSource = editingEntity;
  if (!_extractSource) return;
  document.getElementById('extractLogical').value  = (_extractSource.logicalName || '') + '_분리';
  document.getElementById('extractPhysical').value = '';
  document.getElementById('extractKeepOriginal').checked = false;
  document.getElementById('extractErr').classList.remove('show');
  const list = document.getElementById('extractAttrList');
  list.innerHTML = '';
  _extractSource.attrs.forEach((a, i) => {
    const row = document.createElement('label');
    row.className = 'extract-attr-row';
    const kindColor = a.kind==='pk' ? '#f38ba8' : a.kind==='fk' ? '#fab387' : '#cdd6f4';
    row.innerHTML = `
      <input type="checkbox" value="${i}" style="width:14px;height:14px;cursor:pointer">
      <span style="color:${kindColor};font-size:13px">${escHtml(a.logicalName||a.physicalName||'(unnamed)')}</span>
      <span style="color:#6c7086;font-size:11px">${escHtml(a.physicalName||'')}</span>
      <span style="color:#45475a;font-size:11px;margin-left:auto">${escHtml(a.type||'')}</span>`;
    list.appendChild(row);
  });
  document.getElementById('extractOverlay').classList.add('active');
}
function closeExtractModal() {
  document.getElementById('extractOverlay').classList.remove('active');
  _extractSource = null;
}
function doExtractEntity() {
  if (!_extractSource) return;
  const logical  = document.getElementById('extractLogical').value.trim();
  const physical = document.getElementById('extractPhysical').value.trim();
  const keep     = document.getElementById('extractKeepOriginal').checked;
  const errEl    = document.getElementById('extractErr');
  errEl.textContent = ''; errEl.classList.remove('show');
  if (!logical) { errEl.textContent = '새 엔티티 이름을 입력하세요.'; errEl.classList.add('show'); return; }
  const checked = [...document.querySelectorAll('#extractAttrList input[type=checkbox]:checked')];
  if (!checked.length) { errEl.textContent = '추출할 속성을 1개 이상 선택하세요.'; errEl.classList.add('show'); return; }
  const idxs = checked.map(cb => parseInt(cb.value));
  const extracted = idxs.map(i => JSON.parse(JSON.stringify(_extractSource.attrs[i])));
  const newEnt = {
    id: 'entity_' + Date.now().toString(36),
    logicalName: logical, physicalName: physical, description: '',
    colorTag: null, attrs: extracted, indexes: [],
    x: _extractSource.x + W + 80, y: _extractSource.y
  };
  ENTITIES.push(newEnt);
  RELATIONS.push({ from: _extractSource.id, to: newEnt.id, card: '1:N' });
  if (!keep) _extractSource.attrs = _extractSource.attrs.filter((_, i) => !idxs.includes(i));
  closeExtractModal(); closeEntModal();
  render(); saveState();
  showToast(`'${logical}'으로 ${extracted.length}개 속성 추출 완료`);
}

// ── 인덱스 CRUD ──────────────────────────────────────────────────
function renderIndexList(indexes) {
  const list = document.getElementById('indexList');
  if (!list) return;
  list.innerHTML = '';
  (indexes || []).forEach(idx => addIndexRow(idx));
}

function addIndexRow(idx = {}) {
  const list = document.getElementById('indexList');
  if (!list) return;
  const esc = v => String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const name = idx.name || '';
  const cols = (idx.columns || []).join(', ');
  const unique = idx.unique || false;
  const entry = document.createElement('div');
  entry.className = 'idx-entry';
  entry.innerHTML = `
    <input class="form-input idx-name-col" value="${esc(name)}" placeholder="인덱스명 (예: IDX_TB_USER_01)" />
    <input class="form-input idx-cols-col" value="${esc(cols)}" placeholder="컬럼 (쉼표 구분, 예: EML_ADDR)" />
    <label class="attr-ck-label" style="white-space:nowrap"><input type="checkbox" class="idx-unique" ${unique?'checked':''}> UNIQUE</label>
    <button class="btn-rm" onclick="this.closest('.idx-entry').remove()" title="삭제">×</button>`;
  list.appendChild(entry);
}

function collectIndexes() {
  return Array.from(document.querySelectorAll('#indexList .idx-entry')).map(entry => {
    const name = entry.querySelector('.idx-name-col').value.trim();
    const colsRaw = entry.querySelector('.idx-cols-col').value.trim();
    const unique = entry.querySelector('.idx-unique')?.checked || false;
    const columns = colsRaw ? colsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    return { name, columns, unique };
  }).filter(idx => idx.columns.length > 0);
}

// ── 복사 / 붙여넣기 ──────────────────────────────────────────────
let copiedEntity   = null;
let pasteCount     = 0;

function copyEntity() {
  if (!selectedEntity) return;
  copiedEntity = JSON.parse(JSON.stringify(selectedEntity));
  pasteCount = 0;
  showToast(`'${entDisplayName(selectedEntity)}' 복사됨`);
}

function pasteEntity() {
  if (!copiedEntity) return;
  pasteCount++;
  const offset = 30 * pasteCount;
  const newEnt = JSON.parse(JSON.stringify(copiedEntity));
  // 새 ID 생성 (충돌 방지)
  let baseId = copiedEntity.id.replace(/_copy\d*$/, '');
  let newId = baseId + '_copy' + (pasteCount > 1 ? pasteCount : '');
  while (ENTITIES.find(e => e.id === newId)) newId += '_';
  newEnt.id = newId;
  newEnt.x  = copiedEntity.x + offset;
  newEnt.y  = copiedEntity.y + offset;
  // FK ref 제거 (관계선 미복사)
  newEnt.attrs = newEnt.attrs.map(a => ({ ...a, ref: null }));
  ENTITIES.push(newEnt);
  selectedEntity = newEnt;
  render();
  saveState();
  renderEntityTree();
  showToast(`'${entDisplayName(newEnt)}' 붙여넣기 완료`);
}

// ── 다이어그램 간 복사 ────────────────────────────────────────────
let _copyDiagEntity = null;
function openCopyDiagModal(entity) {
  _copyDiagEntity = entity;
  const others = diagrams.filter(d => d.id !== activeDiagramId);
  if (!others.length) { showToast('다른 다이어그램이 없습니다.'); return; }
  const list = document.getElementById('copyDiagList');
  list.innerHTML = others.map(d => `
    <div class="diag-item" style="border-radius:7px;border:1px solid #313244;" onclick="confirmCopyToDiag('${d.id}')">
      <span class="diag-item-name">${escHtml(d.name)}</span>
      <span style="color:#6c7086;font-size:11px;">${d.entities.length}개 엔티티</span>
    </div>`).join('');
  document.getElementById('copyDiagOverlay').classList.add('active');
}
function closeCopyDiagModal() { document.getElementById('copyDiagOverlay').classList.remove('active'); }
function confirmCopyToDiag(diagId) {
  const target = diagrams.find(d => d.id === diagId);
  if (!target || !_copyDiagEntity) return;
  const copy = JSON.parse(JSON.stringify(_copyDiagEntity));
  copy.attrs = copy.attrs.map(a => ({ ...a, ref: null }));
  copy.x += 30; copy.y += 30;
  if (target.entities.find(e => e.id === copy.id)) copy.id += '_copy';
  target.entities.push(copy);
  closeCopyDiagModal();
  saveState();
  showToast(`'${entDisplayName(_copyDiagEntity)}' → '${target.name}' 복사 완료`);
}

// ── FK 컬럼 자동 생성 ────────────────────────────────────────────
function autoAddFkColumn(fromId, toId, card) {
  if (card === 'N:M') return;
  const fromEnt = ENTITIES.find(e => e.id === fromId);
  const toEnt   = ENTITIES.find(e => e.id === toId);
  if (!fromEnt || !toEnt) return;
  const pkAttr = fromEnt.attrs.find(a => a.kind === 'pk');
  const baseName = fromEnt.physicalName || fromEnt.logicalName || fromEnt.id;
  const fkPhysical = baseName.toUpperCase() + '_ID';
  const fkLogical  = (fromEnt.logicalName || fromEnt.id) + 'ID';
  if (toEnt.attrs.some(a =>
    a.physicalName?.toUpperCase() === fkPhysical ||
    (a.kind === 'fk' && a.ref?.entity === fromEnt.id)
  )) return;
  toEnt.attrs.push({
    logicalName: fkLogical, physicalName: fkPhysical,
    type: pkAttr?.type || 'BIGINT', kind: 'fk',
    notNull: false, unique: false, autoIncrement: false, defaultValue: '',
    description: (fromEnt.logicalName || fromEnt.id) + ' 참조',
    ref: { entity: fromEnt.id, attr: pkAttr?.physicalName || pkAttr?.logicalName || 'ID' }
  });
}
