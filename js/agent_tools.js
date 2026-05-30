// ══════════════════════════════════════════════════════════════════
// Agent 클라이언트 툴 (M2) — 드래프트 기반 ERD 조작
//   실제 ENTITIES/RELATIONS 는 건드리지 않고 draft({entities,relations,layout})
//   에만 적용한다. 그래프 종료(respond) 시 한 번에 커밋 → 원자적 undo.
//   기존 함수(applyAISchema·autoAddFkColumn·autoLayout)와 동일한 데이터 형태를 따른다.
// ══════════════════════════════════════════════════════════════════

// 현재 상태를 깊은 복사해 드래프트 생성
function _agentCloneState() {
  return {
    entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []).map(e => JSON.parse(JSON.stringify(e))),
    relations: (typeof RELATIONS !== 'undefined' ? RELATIONS : []).map(r => JSON.parse(JSON.stringify(r))),
    layout: null,
  };
}

// 드래프트를 실제 상태에 반영 + 렌더 + 1회 저장(원자적 undo)
function _agentCommitDraft(draft) {
  if (typeof ENTITIES === 'undefined' || typeof RELATIONS === 'undefined') return;
  ENTITIES.length = 0; draft.entities.forEach(e => ENTITIES.push(e));
  RELATIONS.length = 0; draft.relations.forEach(r => RELATIONS.push(r));
  if (typeof renderEntityTree === 'function') renderEntityTree();
  if (draft.layout && typeof autoLayout === 'function') {
    // autoLayout 이 재배치 + 관계선 최적화 후 saveState() 를 1회 호출 → 단일 커밋
    autoLayout(draft.layout);
  } else {
    if (typeof render === 'function') render();
    if (typeof saveState === 'function') saveState();
  }
}

// ── 툴 구현 ──────────────────────────────────────────────────────
// 시그니처: (draft, args, remap) → output  (오류 시 throw)

function _agentToolCreateEntity(draft, args, remap) {
  const origId = (args.id || ('ent_' + Math.random().toString(36).slice(2, 7))).toString();
  const existing = new Set(draft.entities.map(e => e.id));
  let id = origId, n = 2;
  while (existing.has(id)) id = origId + '_' + (n++);
  remap[origId] = id;

  const i = draft.entities.length;
  const attrs = (args.attrs || []).map(a => ({
    logicalName: a.logicalName || a.name || a.physicalName || '',
    physicalName: a.physicalName || String(a.logicalName || a.name || '').toUpperCase(),
    type: a.type || 'VARCHAR(100)',
    kind: ['pk', 'fk', 'normal'].includes(a.kind) ? a.kind : 'normal',
    notNull: !!a.notNull,
    unique: false, autoIncrement: false, defaultValue: '', description: '', ref: null,
  }));
  const ent = {
    id,
    logicalName: args.logicalName || args.name || origId,
    physicalName: args.physicalName || origId.toUpperCase(),
    description: args.description || '',
    attrs,
    indexes: [],
    isView: false,
    x: 60 + (i % 4) * 340,
    y: 60 + Math.floor(i / 4) * 320,
  };
  draft.entities.push(ent);
  return { ok: true, entityId: id };
}

// autoAddFkColumn(entities.js) 과 동일한 규칙으로 드래프트에 FK 추가
function _agentDraftAddFk(draft, fromId, toId, card) {
  if (card === 'N:M') return;
  const fromEnt = draft.entities.find(e => e.id === fromId);
  const toEnt = draft.entities.find(e => e.id === toId);
  if (!fromEnt || !toEnt) return;
  const pkAttr = (fromEnt.attrs || []).find(a => a.kind === 'pk');
  const baseName = fromEnt.physicalName || fromEnt.logicalName || fromEnt.id;
  const fkPhysical = baseName.toUpperCase() + '_ID';
  const fkLogical = (fromEnt.logicalName || fromEnt.id) + 'ID';
  const dup = (toEnt.attrs || []).some(a =>
    (a.physicalName && a.physicalName.toUpperCase() === fkPhysical) ||
    (a.kind === 'fk' && a.ref && a.ref.entity === fromEnt.id));
  if (dup) return;
  toEnt.attrs.push({
    logicalName: fkLogical, physicalName: fkPhysical,
    type: (pkAttr && pkAttr.type) || 'BIGINT', kind: 'fk',
    notNull: false, unique: false, autoIncrement: false, defaultValue: '',
    description: (fromEnt.logicalName || fromEnt.id) + ' 참조',
    ref: { entity: fromEnt.id, attr: (pkAttr && (pkAttr.physicalName || pkAttr.logicalName)) || 'ID' },
  });
}

function _agentToolCreateRelation(draft, args, remap) {
  const from = remap[args.from] || args.from;
  const to = remap[args.to] || args.to;
  if (!from || !to) throw new Error('관계의 from/to 가 비어 있습니다');
  if (from === to) throw new Error('시작과 끝 엔티티가 같습니다');
  const em = {}; draft.entities.forEach(e => { em[e.id] = e; });
  if (!em[from]) throw new Error('존재하지 않는 엔티티: ' + from);
  if (!em[to]) throw new Error('존재하지 않는 엔티티: ' + to);
  if (draft.relations.find(r => r.from === from && r.to === to)) {
    return { ok: true, note: '이미 존재하는 관계' };
  }
  const card = ['1:1', '1:N', 'N:M'].includes(args.card) ? args.card : '1:N';
  const rel = { from, to, card };
  if (args.label) rel.label = args.label;
  draft.relations.push(rel);
  if (args.addFk !== false) _agentDraftAddFk(draft, from, to, card);
  return { ok: true };
}

function _agentToolAutoLayout(draft, args) {
  const type = ['hierarchical', 'grid', 'circular'].includes(args.type) ? args.type : 'hierarchical';
  draft.layout = type;
  return { ok: true, type };
}

const AGENT_TOOLS = {
  create_entity: _agentToolCreateEntity,
  create_relation: _agentToolCreateRelation,
  auto_layout: _agentToolAutoLayout,
};
