// ── Relation CRUD ────────────────────────────────────────────────
let editingRelation = null;

function populateEntitySelects(fromId, toId) {
  ['relFrom','relTo'].forEach((selId, idx) => {
    const sel = document.getElementById(selId);
    const cur = idx === 0 ? fromId : toId;
    sel.innerHTML = ENTITIES.map(e =>
      `<option value="${e.id}" ${e.id===cur?'selected':''}>${entDisplayName(e)} (${e.id})</option>`
    ).join('');
  });
}

function openAddRelationModal(fromId, toId) {
  if (ENTITIES.length < 2) { alert('엔티티가 2개 이상 있어야 관계를 추가할 수 있습니다.'); return; }
  editingRelation = null;
  document.getElementById('relModalTitle').textContent = '관계 추가';
  document.getElementById('relDelBtn').style.display = 'none';
  document.getElementById('relErr').classList.remove('show');
  populateEntitySelects(fromId || ENTITIES[0].id, toId || ENTITIES[1].id);
  document.getElementById('relCard').value = '1:N';
  document.getElementById('relLineStyle').value = 'solid';
  document.getElementById('relLabel').value = '';
  document.getElementById('relFkAutoGroup').style.display = '';
  document.getElementById('relFkAuto').checked = false;
  document.getElementById('relOverlay').classList.add('active');
}

function openEditRelationModal(rel) {
  if (ENTITIES.length < 2) return;
  editingRelation = rel;
  document.getElementById('relModalTitle').textContent = '관계 편집';
  document.getElementById('relDelBtn').style.display = '';
  document.getElementById('relErr').classList.remove('show');
  populateEntitySelects(rel.from, rel.to);
  document.getElementById('relCard').value = rel.card;
  document.getElementById('relLineStyle').value = rel.lineStyle || 'solid';
  document.getElementById('relLabel').value = rel.label || '';
  document.getElementById('relFkAutoGroup').style.display = 'none';
  document.getElementById('relOverlay').classList.add('active');
}

function closeRelModal() { document.getElementById('relOverlay').classList.remove('active'); }

function saveRelation() {
  const from      = document.getElementById('relFrom').value;
  const to        = document.getElementById('relTo').value;
  const card      = document.getElementById('relCard').value;
  const lineStyle = document.getElementById('relLineStyle').value;
  const label     = document.getElementById('relLabel').value.trim();
  const errEl = document.getElementById('relErr');
  errEl.classList.remove('show');

  if (from === to) { errEl.textContent = '시작과 끝 엔티티가 같을 수 없습니다.'; errEl.classList.add('show'); return; }

  if (!editingRelation) {
    const dup = RELATIONS.find(r => r.from === from && r.to === to);
    if (dup) { errEl.textContent = '이미 동일한 관계가 존재합니다.'; errEl.classList.add('show'); return; }
  }

  if (editingRelation) {
    editingRelation.from = from; editingRelation.to = to; editingRelation.card = card;
    editingRelation.lineStyle = lineStyle === 'solid' ? undefined : lineStyle;
    editingRelation.label = label || undefined;
  } else {
    RELATIONS.push({ from, to, card, ...(lineStyle !== 'solid' && { lineStyle }), ...(label && { label }) });
    if (document.getElementById('relFkAuto')?.checked) autoAddFkColumn(from, to, card);
  }
  closeRelModal(); render(); saveState();
}

function deleteRelation(rel) {
  const idx = RELATIONS.indexOf(rel);
  if (idx >= 0) RELATIONS.splice(idx, 1);
  render(); saveState();
}

function deleteCurrentRelation() {
  closeRelModal();
  const em = entityMap();
  const fromName = entDisplayName(em[editingRelation.from]) || editingRelation.from;
  const toName   = entDisplayName(em[editingRelation.to])   || editingRelation.to;
  askConfirm(`'${fromName} → ${toName}' 관계를 삭제합니다.`, () => deleteRelation(editingRelation), '삭제');
}
