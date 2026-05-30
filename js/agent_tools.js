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

// 엔티티 id 해소: remap → 정확한 id → "이름(id)" 형식 → 이름 일치 → 부분 포함
// (플래너가 "에이전트설정(agentconfig)" 같은 표시 문자열을 그대로 넘겨도 해소되도록 관대하게)
function _agentResolveEntityId(draft, idOrName, remap) {
  if (idOrName == null) return null;
  const ents = (draft && draft.entities) || [];
  const raw = String(idOrName).trim();
  if (!raw) return null;
  if (remap && remap[raw]) return remap[raw];
  // 1) 정확한 id
  if (ents.some(e => e.id === raw)) return raw;
  // 2) "이름(id)" 형식 → 괄호 안 id 추출
  const m = raw.match(/\(([^)]+)\)\s*$/);
  if (m) {
    const inner = m[1].trim();
    if (remap && remap[inner]) return remap[inner];
    if (ents.some(e => e.id === inner)) return inner;
  }
  // 3) 이름(논리/물리) 정확 일치 — 괄호 앞 부분 포함
  const namePart = raw.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
  const cands = [raw.toLowerCase(), namePart].filter(Boolean);
  let hit = ents.find(e =>
    cands.includes((e.logicalName || '').toLowerCase()) ||
    cands.includes((e.physicalName || '').toLowerCase()) ||
    cands.includes((e.id || '').toLowerCase()));
  if (hit) return hit.id;
  // 4) 부분 포함 (마지막 수단)
  if (namePart) {
    hit = ents.find(e =>
      (e.logicalName && e.logicalName.toLowerCase().includes(namePart)) ||
      (e.physicalName && e.physicalName.toLowerCase().includes(namePart)) ||
      (e.id && e.id.toLowerCase().includes(namePart)));
  }
  return hit ? hit.id : null;
}

function _agentToolDeleteEntity(draft, args, remap) {
  const id = _agentResolveEntityId(draft, args.entityId || args.id || args.name, remap);
  if (!id) throw new Error('삭제할 엔티티를 찾을 수 없습니다: ' + (args.entityId || args.id || args.name || ''));
  draft.entities = draft.entities.filter(e => e.id !== id);
  // 연결된 관계도 함께 삭제 (deleteEntity 와 동일)
  draft.relations = draft.relations.filter(r => r.from !== id && r.to !== id);
  return { ok: true, entityId: id };
}

function _agentToolDeleteRelation(draft, args, remap) {
  const from = _agentResolveEntityId(draft, args.from, remap) || args.from;
  const to = _agentResolveEntityId(draft, args.to, remap) || args.to;
  const before = draft.relations.length;
  draft.relations = draft.relations.filter(r => !(r.from === from && r.to === to));
  if (draft.relations.length === before) return { ok: true, note: '해당 관계 없음' };
  return { ok: true };
}

function _agentToolAddAttribute(draft, args, remap) {
  const id = _agentResolveEntityId(draft, args.entityId || args.id || args.name, remap);
  if (!id) throw new Error('컬럼을 추가할 엔티티를 찾을 수 없습니다: ' + (args.entityId || args.id || args.name || ''));
  const ent = draft.entities.find(e => e.id === id);
  const a = args.attr || args;
  const physical = a.physicalName || String(a.logicalName || a.name || '').toUpperCase();
  if (!physical && !a.logicalName) throw new Error('컬럼명이 비어 있습니다');
  if ((ent.attrs || []).some(x => x.physicalName && x.physicalName.toUpperCase() === physical.toUpperCase())) {
    return { ok: true, note: '이미 존재하는 컬럼' };
  }
  ent.attrs.push({
    logicalName: a.logicalName || a.name || physical,
    physicalName: physical,
    type: a.type || 'VARCHAR(100)',
    kind: ['pk', 'fk', 'normal'].includes(a.kind) ? a.kind : 'normal',
    notNull: !!a.notNull, unique: !!a.unique, autoIncrement: false, defaultValue: '', description: a.description || '', ref: null,
  });
  return { ok: true, entityId: id, column: physical };
}

function _agentToolUpdateEntity(draft, args, remap) {
  const id = _agentResolveEntityId(draft, args.entityId || args.id || args.name, remap);
  if (!id) throw new Error('수정할 엔티티를 찾을 수 없습니다: ' + (args.entityId || args.id || args.name || ''));
  const ent = draft.entities.find(e => e.id === id);
  if (args.logicalName != null) ent.logicalName = args.logicalName;
  if (args.physicalName != null) ent.physicalName = args.physicalName;
  if (args.description != null) ent.description = args.description;
  return { ok: true, entityId: id };
}

// 대상 엔티티에서 attrName(현재 물리명 또는 논리명)으로 컬럼을 찾는다
function _agentFindAttr(ent, attrName) {
  const t = String(attrName || '').toLowerCase();
  if (!t) return null;
  return (ent.attrs || []).find(a =>
    (a.physicalName && a.physicalName.toLowerCase() === t) ||
    (a.logicalName && a.logicalName.toLowerCase() === t)) || null;
}

function _agentToolUpdateAttribute(draft, args, remap) {
  const id = _agentResolveEntityId(draft, args.entityId || args.id || args.name, remap);
  if (!id) throw new Error('엔티티를 찾을 수 없습니다: ' + (args.entityId || args.id || args.name || ''));
  const ent = draft.entities.find(e => e.id === id);
  const target = args.attrName || args.column || args.target;
  if (!target) throw new Error('수정할 컬럼명(attrName)이 필요합니다');
  const attr = _agentFindAttr(ent, target);
  if (!attr) throw new Error('컬럼을 찾을 수 없습니다: ' + target);
  const p = args.patch || args;
  ['logicalName', 'physicalName', 'type', 'description', 'defaultValue'].forEach(f => {
    if (p[f] != null) attr[f] = p[f];
  });
  if (p.kind && ['pk', 'fk', 'normal'].includes(p.kind)) attr.kind = p.kind;
  if (p.notNull != null) attr.notNull = !!p.notNull;
  if (p.unique != null) attr.unique = !!p.unique;
  if (p.autoIncrement != null) attr.autoIncrement = !!p.autoIncrement;
  return { ok: true, entityId: id, column: attr.physicalName || attr.logicalName };
}

function _agentToolRemoveAttribute(draft, args, remap) {
  const id = _agentResolveEntityId(draft, args.entityId || args.id || args.name, remap);
  if (!id) throw new Error('엔티티를 찾을 수 없습니다: ' + (args.entityId || args.id || args.name || ''));
  const ent = draft.entities.find(e => e.id === id);
  const target = args.attrName || args.column || args.target;
  if (!target) throw new Error('삭제할 컬럼명(attrName)이 필요합니다');
  const before = (ent.attrs || []).length;
  const t = String(target).toLowerCase();
  ent.attrs = (ent.attrs || []).filter(a =>
    !((a.physicalName && a.physicalName.toLowerCase() === t) ||
      (a.logicalName && a.logicalName.toLowerCase() === t)));
  if (ent.attrs.length === before) throw new Error('컬럼을 찾을 수 없습니다: ' + target);
  return { ok: true, entityId: id };
}

// ── 데이터 해소 읽기 툴 (M4) — 드래프트 또는 현재 ERD를 읽는다(상태 변경 없음) ──
function _agentReadView(draft) {
  if (draft && draft.entities) return draft;
  return {
    entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []) || [],
    relations: (typeof RELATIONS !== 'undefined' ? RELATIONS : []) || [],
  };
}

function _agentToolFindTables(draft, args) {
  const view = _agentReadView(draft);
  const kw = String((args && (args.keyword || args.name || args.query)) || '').toLowerCase();
  const matches = view.entities.filter(e => {
    if (!kw) return true;
    return (e.id && e.id.toLowerCase().includes(kw)) ||
           (e.logicalName && e.logicalName.toLowerCase().includes(kw)) ||
           (e.physicalName && e.physicalName.toLowerCase().includes(kw));
  }).map(e => ({ id: e.id, name: (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.physicalName || e.id) }));
  return { ok: true, matches: matches.slice(0, 30) };
}

function _agentToolDescribeTable(draft, args) {
  const view = _agentReadView(draft);
  const id = _agentResolveEntityId(view, (args && (args.entityId || args.id || args.name)), {});
  if (!id) return { ok: false, error: '테이블을 찾을 수 없습니다: ' + ((args && (args.entityId || args.id || args.name)) || '') };
  const e = view.entities.find(x => x.id === id);
  const rels = view.relations.filter(r => r.from === id || r.to === id).map(r => ({ from: r.from, to: r.to, card: r.card }));
  return { ok: true, table: {
    id: e.id, logicalName: e.logicalName, physicalName: e.physicalName, description: e.description || '',
    attrs: (e.attrs || []).map(a => ({ logicalName: a.logicalName, physicalName: a.physicalName, type: a.type, kind: a.kind, notNull: !!a.notNull, ref: a.ref || null })),
    relations: rels,
  } };
}

function _agentToolListRelations(draft, args) {
  const view = _agentReadView(draft);
  const id = (args && (args.entityId || args.id || args.name)) ? _agentResolveEntityId(view, args.entityId || args.id || args.name, {}) : null;
  const rels = view.relations.filter(r => !id || r.from === id || r.to === id).map(r => ({ from: r.from, to: r.to, card: r.card }));
  return { ok: true, relations: rels };
}

// ERD 엔티티로부터 CREATE TABLE DDL 생성 (읽기 전용, DB 실행 아님) — 기존 buildDDL 재사용
function _agentToolGenerateDdl(draft, args) {
  const view = _agentReadView(draft);
  args = args || {};
  const dialect = ['mysql', 'postgres', 'oracle', 'mssql'].includes(args.dialect)
    ? args.dialect
    : ((typeof getActiveDiagram === 'function' && getActiveDiagram() && getActiveDiagram().dbType) || 'mysql');
  // 대상 엔티티: entityIds 지정 → 해소 / 없으면 현재 선택 / 그것도 없으면 전체
  let ids = [];
  if (Array.isArray(args.entityIds) && args.entityIds.length) {
    ids = args.entityIds.map(x => _agentResolveEntityId(view, x, {})).filter(Boolean);
  } else {
    const sel = new Set();
    if (typeof selectedEntities !== 'undefined' && selectedEntities) selectedEntities.forEach(id => sel.add(id));
    if (typeof selectedEntity !== 'undefined' && selectedEntity && selectedEntity.id) sel.add(selectedEntity.id);
    ids = [...sel];
  }
  const ents = ids.length ? view.entities.filter(e => ids.includes(e.id)) : view.entities;
  if (!ents.length) return { ok: false, error: '대상 엔티티가 없습니다(선택되거나 지정된 테이블 없음).' };
  if (typeof buildDDL !== 'function') return { ok: false, error: 'DDL 생성기(buildDDL)를 찾을 수 없습니다.' };
  try {
    const out = buildDDL(dialect, ents, { includeFK: true, includeIndex: true, includeComment: true });
    const ddl = (out && out.text) || (typeof out === 'string' ? out : '');
    return { ok: true, dialect, count: ents.length, ddl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 현재 선택(엔티티) + 활성 다이어그램 정보 (읽기 전용) — "이 테이블/현재 선택" 참조용
function _agentToolGetSelection(draft, args) {
  const view = _agentReadView(draft);
  const d = (typeof getActiveDiagram === 'function') ? getActiveDiagram() : null;
  const diagram = d ? { id: d.id, name: d.name, entityCount: view.entities.length, relationCount: view.relations.length } : null;
  const ids = new Set();
  if (typeof selectedEntities !== 'undefined' && selectedEntities) selectedEntities.forEach(id => ids.add(id));
  if (typeof selectedEntity !== 'undefined' && selectedEntity && selectedEntity.id) ids.add(selectedEntity.id);
  const selected = [...ids].map(id => {
    const e = view.entities.find(x => x.id === id);
    if (!e) return { id };
    return {
      id: e.id, logicalName: e.logicalName, physicalName: e.physicalName,
      attrs: (e.attrs || []).map(a => ({ physicalName: a.physicalName, logicalName: a.logicalName, type: a.type, kind: a.kind })),
    };
  });
  return { ok: true, diagram, selectedEntities: selected };
}

// 툴 상세정보 제공 (읽기 전용) — 단일 소스(AGENT_TOOL_CATALOG)를 참조해 반환
function _agentToolDescribeTool(draft, args) {
  const wanted = args && (args.name || args.tool);
  if (wanted) {
    const t = AGENT_TOOL_CATALOG.find(x => x.name === wanted);
    if (!t) return { ok: false, error: '알 수 없는 툴: ' + wanted };
    return { ok: true, tool: t };
  }
  return { ok: true, tools: AGENT_TOOL_CATALOG };
}

// ══════════════════════════════════════════════════════════════════
// 단일 소스(SSOT): 툴의 모든 정보(실행·메타·상세)를 여기서만 정의한다.
//   - AGENT_TOOLS(이름→실행), AGENT_TOOL_CATALOG(프록시 전달 메타),
//     describe_tool, 스텝 라벨 폴백이 모두 이 배열에서 파생된다.
//   - 툴 추가/변경은 이 배열만 수정하면 모든 참조처에 일관되게 반영된다.
// ══════════════════════════════════════════════════════════════════
const AGENT_TOOL_DEFS = [
  { name: 'create_entity',   kind: 'write', danger: false, run: _agentToolCreateEntity,
    desc: '새 테이블 생성(각 엔티티 PK 1개 이상)', params: 'id, logicalName, physicalName, attrs[]',
    detail: 'id는 snake_case 영문이며 이후 관계에서 이 id로 참조된다. attrs 각 항목: {logicalName, physicalName, type, kind(pk|fk|normal), notNull}.' },
  { name: 'create_relation', kind: 'write', danger: false, run: _agentToolCreateRelation,
    desc: '관계 생성(+FK 자동)', params: 'from, to, card(1:1|1:N|N:M), addFk?',
    detail: '1:N이면 from이 부모(1)·to가 자식(N). addFk 생략 시 부모 PK 기반 FK 컬럼을 자식에 자동 추가(N:M 제외).' },
  { name: 'auto_layout',     kind: 'write', danger: false, run: _agentToolAutoLayout,
    desc: '자동 배치', params: 'type(hierarchical|grid|circular)',
    detail: '전체 엔티티를 선택한 방식으로 재배치하고 관계선을 최적화한다. 계획의 마지막 단계로 두는 것이 자연스럽다.' },
  { name: 'delete_entity',   kind: 'write', danger: true,  run: _agentToolDeleteEntity,
    desc: '테이블 삭제(연결 관계 포함)', params: 'entityId',
    detail: '되돌리기 어려운 작업. 해당 엔티티와 그에 연결된 모든 관계를 함께 삭제한다. entityId는 id 또는 이름.' },
  { name: 'delete_relation', kind: 'write', danger: true,  run: _agentToolDeleteRelation,
    desc: '관계 삭제', params: 'from, to', detail: 'from→to 관계 1개를 제거한다(FK 컬럼은 유지).' },
  { name: 'add_attribute',   kind: 'write', danger: false, run: _agentToolAddAttribute,
    desc: '컬럼 추가', params: 'entityId, attr{logicalName,physicalName,type,kind,notNull}',
    detail: '대상 엔티티에 컬럼을 추가한다. 동일 physicalName이 이미 있으면 추가하지 않는다.' },
  { name: 'update_attribute', kind: 'write', danger: false, run: _agentToolUpdateAttribute,
    desc: '기존 컬럼 수정', params: 'entityId, attrName, {logicalName?,physicalName?,type?,kind?,notNull?,unique?}',
    detail: 'attrName(현재 물리명 또는 논리명)으로 대상 컬럼을 찾아 전달된 필드만 수정한다. physicalName 전달 시 컬럼명 변경.' },
  { name: 'remove_attribute', kind: 'write', danger: true,  run: _agentToolRemoveAttribute,
    desc: '컬럼 삭제', params: 'entityId, attrName',
    detail: '대상 엔티티에서 attrName 컬럼을 제거한다. 되돌리기 주의(undo로 복구 가능).' },
  { name: 'update_entity',   kind: 'write', danger: false, run: _agentToolUpdateEntity,
    desc: '테이블 이름/설명 수정', params: 'entityId, logicalName?, physicalName?, description?',
    detail: '대상 엔티티의 논리명/물리명/설명을 부분 수정한다(전달된 필드만).' },
  { name: 'find_tables',     kind: 'read',  danger: false, run: _agentToolFindTables,
    desc: '키워드로 테이블 검색', params: 'keyword?',
    detail: '이름/키워드로 엔티티를 검색해 {id, name} 목록을 반환한다(상태 변경 없음). 정확한 id를 모를 때 먼저 사용.' },
  { name: 'describe_table',  kind: 'read',  danger: false, run: _agentToolDescribeTable,
    desc: '테이블 상세 조회(컬럼·관계)', params: 'entityId',
    detail: '엔티티의 컬럼(타입·종류·PK/FK·notNull)과 연결된 관계를 반환한다. 수정 전 현재 구조 확인용(읽기 전용).' },
  { name: 'list_relations',  kind: 'read',  danger: false, run: _agentToolListRelations,
    desc: '관계 목록 조회', params: 'entityId?(생략 시 전체)',
    detail: '특정 엔티티(또는 전체)에 연결된 관계를 반환한다(읽기 전용).' },
  { name: 'generate_ddl',    kind: 'read',  danger: false, run: _agentToolGenerateDdl,
    desc: 'ERD로부터 CREATE TABLE DDL(SQL) 생성', params: 'dialect?(mysql|postgres|oracle|mssql), entityIds?',
    detail: '선택(또는 지정/전체) 엔티티의 CREATE TABLE 문을 텍스트로 생성한다. DB에 실행하지 않음(run_sql 과 다름). '
          + 'dialect 생략 시 현재 다이어그램 DB 유형. "테이블 생성 SQL 만들어줘"는 이 툴을 사용한다.' },
  { name: 'get_selection',   kind: 'read',  danger: false, run: _agentToolGetSelection,
    desc: '현재 선택된 테이블·활성 다이어그램 정보', params: '(없음)',
    detail: '현재 화면에서 선택된 엔티티(테이블)들의 컬럼과 활성 다이어그램(이름·엔티티/관계 수)을 반환한다. "이 테이블", "현재 선택한 것" 참조 해소용(읽기 전용).' },
  { name: 'describe_tool',   kind: 'read',  danger: false, run: _agentToolDescribeTool,
    desc: '툴 상세정보 제공', params: 'name?(특정 툴) — 생략 시 전체',
    detail: '특정 툴(name) 또는 전체 툴의 이름·종류·설명·파라미터·위험여부·상세를 반환한다. 상태를 바꾸지 않는 읽기 전용 툴.' },
];

// ── 파생(중복 정의 없음) ──────────────────────────────────────────
const AGENT_TOOLS = Object.fromEntries(AGENT_TOOL_DEFS.map(d => [d.name, d.run]));
// 프록시 플래너로 전달되는 카탈로그(실행 함수 제외)
const AGENT_TOOL_CATALOG = AGENT_TOOL_DEFS.map(d => ({
  name: d.name, kind: d.kind, desc: d.desc, params: d.params, danger: d.danger, detail: d.detail,
}));
function _agentToolDef(name) { return AGENT_TOOL_DEFS.find(d => d.name === name) || null; }
