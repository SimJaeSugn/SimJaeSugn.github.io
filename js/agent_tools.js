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
  args = args || {};
  const _ascii = s => /^[A-Za-z][A-Za-z0-9_]*$/.test(String(s || ''));
  // id 는 영문 snake_case 식별자여야 한다(물리명·논리명과 혼동 방지).
  // 한글/빈 id 면 물리명(영문) → 임의값 순으로 파생하고, 물리명이 비면 id 의 대문자형을 쓴다.
  let _physical = (args.physicalName || '').toString().trim();
  let origId = (args.id || '').toString().trim();
  if (!_ascii(origId)) origId = _ascii(_physical) ? _physical.toLowerCase() : ('ent_' + Math.random().toString(36).slice(2, 7));
  if (!_physical) _physical = origId.toUpperCase();
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
    physicalName: _physical,
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
  // 3) 이름(논리/물리) 정확 일치 — 괄호/대괄호(라벨 "논리명 [물리명]") 앞 부분 포함
  const namePart = raw.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase();
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
  const rels = view.relations.filter(r => r.from === id || r.to === id).map(r => ({ from: _agentEntLabel(view, r.from), to: _agentEntLabel(view, r.to), card: r.card }));
  return { ok: true, table: {
    id: e.id, logicalName: e.logicalName, physicalName: e.physicalName, description: e.description || '',
    attrs: (e.attrs || []).map(a => ({ logicalName: a.logicalName, physicalName: a.physicalName, type: a.type, kind: a.kind, notNull: !!a.notNull,
      ref: (a.ref && a.ref.entity) ? { entity: _agentEntLabel(view, a.ref.entity), attr: a.ref.attr } : (a.ref || null) })),
    relations: rels,
  } };
}

function _agentToolListRelations(draft, args) {
  const view = _agentReadView(draft);
  const id = (args && (args.entityId || args.id || args.name)) ? _agentResolveEntityId(view, args.entityId || args.id || args.name, {}) : null;
  const rels = view.relations.filter(r => !id || r.from === id || r.to === id).map(r => ({ from: _agentEntLabel(view, r.from), to: _agentEntLabel(view, r.to), card: r.card }));
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

// 기존 관계의 카디널리티만 변경(관계를 지우고 다시 만들지 않음) — from↔to 양방향 매칭
function _agentToolSetCardinality(draft, args, remap) {
  const from = _agentResolveEntityId(draft, args.from, remap) || args.from;
  const to = _agentResolveEntityId(draft, args.to, remap) || args.to;
  if (!from || !to) throw new Error('관계의 from/to 가 비어 있습니다');
  const card = ['1:1', '1:N', 'N:M'].includes(args.card) ? args.card : null;
  if (!card) throw new Error('card 는 1:1|1:N|N:M 중 하나여야 합니다');
  let rel = draft.relations.find(r => r.from === from && r.to === to);
  if (!rel) rel = draft.relations.find(r => r.from === to && r.to === from);
  if (!rel) throw new Error('해당 관계를 찾을 수 없습니다: ' + from + ' ↔ ' + to);
  const prev = rel.card;
  rel.card = card;
  return { ok: true, from: rel.from, to: rel.to, prevCard: prev, card };
}

// ERD 정규화 위반 진단(읽기 전용) — PK 부재·N:M 관계 등 후보 보고
function _agentToolNormalizeCheck(draft) {
  const ents = (draft && draft.entities) || [];
  const rels = (draft && draft.relations) || [];
  const findings = [];
  const _view = { entities: ents };
  ents.forEach(e => {
    const hasPk = (e.attrs || []).some(a => a.kind === 'pk');
    if (!hasPk) findings.push({ type: 'no_pk', entity: _agentEntLabel(_view, e), note: 'PK가 없어 식별 불가(1NF 점검)' });
  });
  rels.forEach(r => {
    if (r.card === 'N:M') findings.push({ type: 'nm_relation', from: _agentEntLabel(_view, r.from), to: _agentEntLabel(_view, r.to), note: 'N:M은 연결(junction) 테이블로 분해 권장' });
  });
  return { ok: true, violationCount: findings.length, findings };
}

// 표준용어 사전 연동 — 속성(컬럼) 논리명을 표준 영문약어로 물리명 자동 표준화.
// create_entity·add_attribute·update_attribute 실행 직전 execTools 에서 await 로 호출한다.
// 표준용어사전(stdLookupTerm)에 일치 항목이 있으면 physicalName 을 표준 abbr 로 설정,
// 사전 미가용(웹 등)·미일치 시 기존 명명을 그대로 둔다(graceful).
async function _agentStandardizeAttrs(tool, args) {
  if (typeof stdLookupTerm !== 'function' || !args) return;
  let unavailable = false;
  async function apply(attr) {
    if (unavailable || !attr) return;
    const logical = attr.logicalName || attr.name;
    if (!logical) return;
    try {
      const term = await stdLookupTerm(logical);
      if (term && term.abbr) attr.physicalName = term.abbr;   // 표준 물리명 적용
    } catch (e) { unavailable = true; }                        // 사전 미가용 → 이후 조회 중단
  }
  if (tool === 'create_entity') {
    for (const a of (args.attrs || [])) await apply(a);
  } else if (tool === 'add_attribute') {
    await apply(args.attr || args);
  } else if (tool === 'update_attribute' && args.logicalName) {
    await apply(args);
  }
}

// 표준용어사전 조회(read) — name 정확 일치 용어 + 유사 후보 반환(데스크탑 사이드카 전용).
async function _agentToolLookupStdTerm(draft, args) {
  if (typeof stdLookupTerm !== 'function') throw new Error('표준용어사전을 사용할 수 없습니다(데스크탑 전용).');
  const name = String(args.name || args.keyword || args.term || '').trim();
  if (!name) throw new Error('조회할 용어명(name)이 필요합니다.');
  const exact = await stdLookupTerm(name);
  let suggestions = [];
  if (typeof stdSuggestTerms === 'function') {
    try { suggestions = (await stdSuggestTerms(name, 8)).map(t => ({ name: t.name, abbr: t.abbr })); } catch (e) {}
  }
  return { ok: true, term: exact ? { name: exact.name, abbr: exact.abbr, descr: exact.descr } : null, suggestions };
}

// 표준용어사전 등록(write) — name·abbr 필수, 이미 있으면 중복 등록 안 함.
async function _agentToolRegisterStdTerm(draft, args) {
  if (typeof stdInsert !== 'function') throw new Error('표준용어사전을 사용할 수 없습니다(데스크탑 전용).');
  const name = String(args.name || '').trim();
  const abbr = String(args.abbr || '').trim();
  if (!name || !abbr) throw new Error('표준용어명(name)과 영문약어(abbr)가 필요합니다.');
  if (typeof stdLookupTerm === 'function') {
    const ex = await stdLookupTerm(name);
    if (ex) return { ok: true, note: '이미 등록된 용어', term: { name: ex.name, abbr: ex.abbr } };
  }
  const row = { name, abbr };
  if (args.descr) row.descr = args.descr;
  if (args.domain_name) row.domain_name = args.domain_name;
  const id = await stdInsert('term', row);
  if (id == null) return { ok: false, error: '표준용어 등록 실패' };
  return { ok: true, registered: { name, abbr }, id };
}

// ══════════════════════════════════════════════════════════════════
// 추가 클라이언트 툴 — 선택·하이라이트·뷰·일괄·분석·내보내기·다이어그램·섹션·메모·버전
//   분류: read(상태변경 없음) · write-draft(엔티티/관계 드래프트) ·
//         live(드래프트와 직교한 라이브 전역 직접 조작 + saveState).
//   워크스페이스 교체 툴은 펜딩 드래프트를 먼저 커밋해 유실을 막고 드래프트를 재동기화한다.
// ══════════════════════════════════════════════════════════════════

// 대상 id 목록 해소: args.ids/entityIds(배열) → keyword 매칭 → 현재 선택
function _agentLiveIds(view, args) {
  const out = [];
  // 전체 선택: all:true / scope:'all' / keyword:'*' → 모든 엔티티 ("모든 엔티티 선택/복사" 류)
  if (args && (args.all === true || args.scope === 'all' || args.keyword === '*' || args.name === '*')) {
    return view.entities.map(e => e.id);
  }
  const raw = args && (args.ids || args.entityIds || args.entities);
  if (Array.isArray(raw) && raw.length) {
    raw.forEach(x => { const id = _agentResolveEntityId(view, x, {}); if (id) out.push(id); });
    return [...new Set(out)];
  }
  const kw = args && (args.keyword || args.name || args.query);
  if (kw) {
    const t = String(kw).toLowerCase();
    view.entities.forEach(e => {
      const hit = (e.id && e.id.toLowerCase().includes(t)) ||
        (e.logicalName && e.logicalName.toLowerCase().includes(t)) ||
        (e.physicalName && e.physicalName.toLowerCase().includes(t)) ||
        (args.includeAttrs && (e.attrs || []).some(a =>
          (a.physicalName && a.physicalName.toLowerCase().includes(t)) ||
          (a.logicalName && a.logicalName.toLowerCase().includes(t))));
      if (hit) out.push(e.id);
    });
    return [...new Set(out)];
  }
  if (typeof selectedEntities !== 'undefined' && selectedEntities) selectedEntities.forEach(id => out.push(id));
  if (typeof selectedEntity !== 'undefined' && selectedEntity && selectedEntity.id) out.push(selectedEntity.id);
  return [...new Set(out)];
}

function _agentNameOf(e) {
  return (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.physicalName || e.id);
}

// 엔티티 ID → 사용자용 라벨. 엔티티ID는 내부값이므로 사용자/LLM에 노출되는 모든 ERD 툴 출력은
// 이 라벨(논리명 [물리명])을 쓴다. 관계 from/to·정규화 대상 등 ID 참조를 이 함수로 치환한다.
// (라벨은 _agentResolveEntityId 가 괄호·대괄호를 떼고 논리/물리명으로 되해소하므로 후속 툴 호출에도 안전)
function _agentEntLabel(view, idOrEnt) {
  const e = (idOrEnt && typeof idOrEnt === 'object')
    ? idOrEnt
    : ((view && view.entities) || []).find(x => x.id === idOrEnt);
  if (!e) return String(idOrEnt == null ? '' : idOrEnt);   // 못 찾으면 최후로 원값(ID 노출 회피 불가 시)
  const ln = e.logicalName || '', pn = e.physicalName || '';
  if (ln && pn) return ln + ' [' + pn + ']';
  return ln || pn || e.id || '';
}

// ── 분석·통계 (read) ──────────────────────────────────────────────
function _agentToolGetStatistics(draft) {
  const v = _agentReadView(draft);
  const ents = v.entities, rels = v.relations;
  let pkCount = 0, fkCount = 0, colTotal = 0, noPk = 0;
  ents.forEach(e => {
    const attrs = e.attrs || []; colTotal += attrs.length;
    const hasPk = attrs.some(a => a.kind === 'pk'); if (hasPk) pkCount++; else noPk++;
    fkCount += attrs.filter(a => a.kind === 'fk').length;
  });
  const deg = {}; ents.forEach(e => deg[e.id] = 0);
  rels.forEach(r => { if (deg[r.from] != null) deg[r.from]++; if (deg[r.to] != null) deg[r.to]++; });
  const orphans = ents.filter(e => !deg[e.id]).map(_agentNameOf);
  return { ok: true, stats: {
    entityCount: ents.length, relationCount: rels.length,
    columnsTotal: colTotal, avgColumns: ents.length ? +(colTotal / ents.length).toFixed(1) : 0,
    tablesWithPk: pkCount, tablesWithoutPk: noPk, fkColumns: fkCount,
    orphanCount: orphans.length, orphans: orphans.slice(0, 20),
    cardinalities: { '1:1': rels.filter(r => r.card === '1:1').length, '1:N': rels.filter(r => r.card === '1:N').length, 'N:M': rels.filter(r => r.card === 'N:M').length },
  } };
}

function _agentToolGetConnectedEntities(draft, args) {
  const v = _agentReadView(draft);
  const id = _agentResolveEntityId(v, args && (args.entityId || args.id || args.name), {});
  if (!id) return { ok: false, error: '기준 엔티티를 찾을 수 없습니다.' };
  const adj = {}; v.entities.forEach(e => adj[e.id] = new Set());
  v.relations.forEach(r => { if (adj[r.from]) adj[r.from].add(r.to); if (adj[r.to]) adj[r.to].add(r.from); });
  const direct = [...(adj[id] || [])];
  const depth = (args && args.depth) || 'all';
  let reach = new Set(direct);
  if (depth === 'all') {
    const q = [...direct], seen = new Set([id, ...direct]);
    while (q.length) { const cur = q.shift(); (adj[cur] || []).forEach(n => { if (!seen.has(n)) { seen.add(n); reach.add(n); q.push(n); } }); }
  }
  const nm = x => { const e = v.entities.find(y => y.id === x); return e ? _agentNameOf(e) : x; };
  return { ok: true, base: nm(id), direct: direct.map(nm), all: [...reach].map(nm), directCount: direct.length, totalReachable: reach.size };
}

function _agentToolDetectOrphans(draft) {
  const v = _agentReadView(draft);
  const deg = {}; v.entities.forEach(e => deg[e.id] = 0);
  v.relations.forEach(r => { if (deg[r.from] != null) deg[r.from]++; if (deg[r.to] != null) deg[r.to]++; });
  const orphans = v.entities.filter(e => !deg[e.id]).map(e => ({ id: e.id, name: _agentNameOf(e) }));
  return { ok: true, orphanCount: orphans.length, orphans };
}

function _agentToolDetectCircularRefs(draft) {
  const v = _agentReadView(draft);
  const adj = {}; v.entities.forEach(e => adj[e.id] = []);
  v.relations.forEach(r => { if (adj[r.from]) adj[r.from].push(r.to); });
  const cycles = [], WHITE = 0, GRAY = 1, BLACK = 2, color = {}, stack = [];
  v.entities.forEach(e => color[e.id] = WHITE);
  const nm = x => { const e = v.entities.find(y => y.id === x); return e ? _agentNameOf(e) : x; };
  function dfs(u) {
    color[u] = GRAY; stack.push(u);
    for (const w of (adj[u] || [])) {
      if (color[w] === GRAY) { const i = stack.indexOf(w); cycles.push(stack.slice(i).concat(w).map(nm)); }
      else if (color[w] === WHITE) dfs(w);
    }
    stack.pop(); color[u] = BLACK;
  }
  v.entities.forEach(e => { if (color[e.id] === WHITE) dfs(e.id); });
  return { ok: true, hasCycle: cycles.length > 0, cycleCount: cycles.length, cycles: cycles.slice(0, 10) };
}

function _agentToolValidateSchema(draft, args) {
  const v = _agentReadView(draft);
  const issues = [];
  const conv = args && args.convention;
  const reCase = { snake_case: /^[a-z][a-z0-9_]*$/, camelCase: /^[a-z][a-zA-Z0-9]*$/, PascalCase: /^[A-Z][a-zA-Z0-9]*$/ };
  v.entities.forEach(e => {
    const nm = _agentNameOf(e);
    if (!(e.attrs || []).some(a => a.kind === 'pk')) issues.push({ entity: nm, type: 'no_pk', note: 'PK 없음' });
    (e.attrs || []).forEach(a => {
      if (!a.type) issues.push({ entity: nm, column: a.physicalName || a.logicalName, type: 'no_type', note: '자료형 누락' });
      if (conv && reCase[conv] && a.physicalName && !reCase[conv].test(a.physicalName))
        issues.push({ entity: nm, column: a.physicalName, type: 'naming', note: conv + ' 위반' });
    });
  });
  return { ok: true, valid: issues.length === 0, issueCount: issues.length, issues: issues.slice(0, 40) };
}

function _agentToolGenerateMarkdown(draft, args) {
  const v = _agentReadView(draft);
  let ids = _agentLiveIds(v, args || {});
  const ents = ids.length ? v.entities.filter(e => ids.includes(e.id)) : v.entities;
  if (!ents.length) return { ok: false, error: '대상 테이블이 없습니다.' };
  const style = (args && args.style) || 'table';
  const lines = [];
  ents.forEach(e => {
    lines.push('### ' + _agentNameOf(e) + (e.physicalName ? ' (`' + e.physicalName + '`)' : ''));
    if (e.description) lines.push('> ' + e.description);
    if (style === 'list') {
      (e.attrs || []).forEach(a => lines.push('- **' + (a.physicalName || a.logicalName) + '** ' + (a.type || '') + (a.kind === 'pk' ? ' `PK`' : a.kind === 'fk' ? ' `FK`' : '') + (a.notNull ? ' NOT NULL' : '')));
    } else {
      lines.push('| 논리명 | 물리명 | 타입 | 종류 | NN |');
      lines.push('|---|---|---|---|---|');
      (e.attrs || []).forEach(a => lines.push('| ' + (a.logicalName || '') + ' | ' + (a.physicalName || '') + ' | ' + (a.type || '') + ' | ' + (a.kind || '') + ' | ' + (a.notNull ? 'Y' : '') + ' |'));
    }
    lines.push('');
  });
  return { ok: true, count: ents.length, markdown: lines.join('\n') };
}

function _agentToolListNotes() {
  const n1 = (typeof NOTES !== 'undefined' ? NOTES : []) || [];
  const n2 = (typeof NOTES_V2 !== 'undefined' ? NOTES_V2 : []) || [];
  return { ok: true, count: n1.length + n2.length,
    notes: n1.map(n => ({ id: n.id, text: n.text, type: 'note' })).concat(n2.map(n => ({ id: n.id, title: n.title, text: n.text, pinned: !!n.pinned, type: 'noteV2' }))) };
}

function _agentToolListSnapshots() {
  const s = (typeof SNAPSHOTS !== 'undefined' ? SNAPSHOTS : []) || [];
  return { ok: true, count: s.length, snapshots: s.map(x => ({ id: x.id, name: x.name, ts: x.ts })) };
}

// ── 일괄·관계 자동화 (write-draft) ────────────────────────────────
function _agentToolBatchUpdateEntities(draft, args) {
  const ids = _agentLiveIds(draft, args);
  if (!ids.length) throw new Error('대상 엔티티가 없습니다(ids/keyword/선택).');
  const u = args.updates || args.patch || {};
  let n = 0;
  ids.forEach(id => {
    const e = draft.entities.find(x => x.id === id); if (!e) return;
    if (u.description != null) e.description = u.description;
    if (u.color != null || u.colorTag != null) e.colorTag = (u.color != null ? u.color : u.colorTag);
    if (u.rowCount != null) e.rowCount = u.rowCount;
    if (u.logicalName != null && ids.length === 1) e.logicalName = u.logicalName;
    n++;
  });
  return { ok: true, updated: n };
}

function _agentToolBatchRenameAttributes(draft, args) {
  const ids = _agentLiveIds(draft, args);
  const from = args.fromPattern || args.from, to = args.toPattern || args.to;
  const conv = args.convention;  // snake_case|camelCase|PascalCase|UPPER|lower
  const target = (args.target === 'logical') ? 'logicalName' : 'physicalName';
  if (!from && !conv) throw new Error('fromPattern→toPattern 또는 convention 이 필요합니다.');
  let changed = 0;
  const toCase = (s) => {
    const words = String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').split('_').filter(Boolean);
    if (conv === 'snake_case') return words.join('_').toLowerCase();
    if (conv === 'UPPER') return words.join('_').toUpperCase();
    if (conv === 'lower') return words.join('').toLowerCase();
    if (conv === 'camelCase') return words.map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join('');
    if (conv === 'PascalCase') return words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
    return s;
  };
  const ents = ids.length ? draft.entities.filter(e => ids.includes(e.id)) : draft.entities;
  ents.forEach(e => (e.attrs || []).forEach(a => {
    const cur = a[target] || ''; let next = cur;
    if (from) { if (cur.includes(from)) next = cur.split(from).join(to || ''); }
    else if (conv) next = toCase(cur);
    if (next && next !== cur) { a[target] = next; changed++; }
  }));
  return { ok: true, renamed: changed };
}

function _agentToolAutoDetectRelationships(draft, args) {
  const ents = draft.entities;
  const byPhysical = {}; ents.forEach(e => { byPhysical[(e.physicalName || e.id).toUpperCase()] = e; });
  let added = 0;
  ents.forEach(child => {
    (child.attrs || []).forEach(a => {
      const pn = (a.physicalName || '').toUpperCase();
      const m = pn.match(/^(.*?)_?ID$/); if (!m || !m[1]) return;
      const parent = byPhysical[m[1]] || ents.find(e => (e.physicalName || '').toUpperCase() === m[1] || (e.id || '').toUpperCase() === m[1]);
      if (!parent || parent.id === child.id) return;
      if (draft.relations.some(r => r.from === parent.id && r.to === child.id)) return;
      draft.relations.push({ from: parent.id, to: child.id, card: '1:N' });
      if (a.kind !== 'fk') { a.kind = 'fk'; a.ref = { entity: parent.id, attr: 'ID' }; }
      added++;
    });
  });
  return { ok: true, relationsAdded: added };
}

function _agentToolDuplicateEntity(draft, args, remap) {
  const id = _agentResolveEntityId(draft, args.entityId || args.id || args.name, remap);
  if (!id) throw new Error('복제할 엔티티를 찾을 수 없습니다.');
  const src = draft.entities.find(e => e.id === id);
  const existing = new Set(draft.entities.map(e => e.id));
  let nid = id + '_copy', n = 2; while (existing.has(nid)) nid = id + '_copy' + (n++);
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = nid;
  clone.logicalName = args.newLogicalName || (src.logicalName ? src.logicalName + ' 복사본' : nid);
  clone.physicalName = args.newPhysicalName || (src.physicalName ? src.physicalName + '_COPY' : nid.toUpperCase());
  clone.x = (src.x || 60) + 40; clone.y = (src.y || 60) + 40;
  draft.entities.push(clone);
  return { ok: true, entityId: nid };
}

// ── 선택·하이라이트·뷰 (live, read) ───────────────────────────────
function _agentToolSelectEntities(draft, args) {
  const v = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []), relations: (typeof RELATIONS !== 'undefined' ? RELATIONS : []) };
  const ids = _agentLiveIds(v, args || {});
  if (typeof selectedEntities !== 'undefined' && selectedEntities) { selectedEntities.clear(); ids.forEach(id => selectedEntities.add(id)); }
  if (typeof selectedEntity !== 'undefined') selectedEntity = ids.length === 1 ? v.entities.find(e => e.id === ids[0]) || null : null;
  if (typeof render === 'function') render();
  return { ok: true, selectedCount: ids.length, selected: ids };
}

function _agentToolHighlightEntities(draft, args) {
  const v = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []), relations: [] };
  const ids = _agentLiveIds(v, args || {});
  if (!ids.length) return { ok: false, error: '강조할 대상을 찾지 못했습니다.' };
  if (typeof selectedEntities !== 'undefined' && selectedEntities) { selectedEntities.clear(); ids.forEach(id => selectedEntities.add(id)); }
  if (typeof setFocusEntity === 'function') setFocusEntity(ids[0]);
  else if (typeof render === 'function') render();
  return { ok: true, highlighted: ids };
}

function _agentToolFocusEntity(draft, args) {
  const v = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []) };
  const id = _agentResolveEntityId(v, args && (args.entityId || args.id || args.name), {});
  if (!id) return { ok: false, error: '대상 엔티티를 찾을 수 없습니다.' };
  if (args && args.focusMode === false) { if (typeof clearFocusMode === 'function') clearFocusMode(); }
  else if (typeof setFocusEntity === 'function') setFocusEntity(id);
  return { ok: true, focused: id };
}

function _agentToolFitView(draft, args) {
  const mode = (args && args.mode) || 'all';
  if (mode === 'reset' && typeof resetView === 'function') resetView();
  else if (typeof fitAll === 'function') fitAll();
  return { ok: true, mode };
}

function _agentToolSetViewMode(draft, args) {
  const out = {};
  if (args && args.view && typeof setViewMode === 'function') { setViewMode(args.view); out.view = args.view; }
  else if (args && args.view && typeof viewMode !== 'undefined') { viewMode = args.view; if (typeof render === 'function') render(); out.view = args.view; }
  if (args && args.notation != null && typeof toggleNotation === 'function') { toggleNotation(); out.notationToggled = true; }
  if (args && args.gridSnap != null && typeof toggleGridSnap === 'function' && typeof gridSnap !== 'undefined' && gridSnap !== !!args.gridSnap) { toggleGridSnap(); out.gridSnap = !!args.gridSnap; }
  return { ok: true, applied: out };
}

function _agentToolAlignEntities(draft, args) {
  const dirs = ['left', 'right', 'top', 'bottom', 'hcenter', 'vcenter', 'hdist', 'vdist'];
  const dir = (args && (dirs.includes(args.direction) ? args.direction : (dirs.includes(args.dir) ? args.dir : null)));
  if (!dir) throw new Error('direction 은 ' + dirs.join('|') + ' 중 하나여야 합니다.');
  const v = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []), relations: [] };
  const ids = _agentLiveIds(v, args);
  if (ids.length < 2) throw new Error('정렬하려면 2개 이상 대상이 필요합니다(ids 또는 현재 선택).');
  if (typeof selectedEntities !== 'undefined' && selectedEntities) { selectedEntities.clear(); ids.forEach(id => selectedEntities.add(id)); }
  if (typeof alignEntities !== 'function') throw new Error('정렬 기능(alignEntities)을 찾을 수 없습니다.');
  alignEntities(dir);
  if (draft && draft.entities) ids.forEach(id => { const le = v.entities.find(e => e.id === id), de = draft.entities.find(e => e.id === id); if (le && de) { de.x = le.x; de.y = le.y; } });
  return { ok: true, direction: dir, count: ids.length };
}

// ── 섹션·메모 (live) ──────────────────────────────────────────────
function _agentToolCreateSection(draft, args) {
  if (typeof SECTIONS === 'undefined') throw new Error('섹션 기능을 사용할 수 없습니다.');
  let x = args.x, y = args.y, w = args.w, h = args.h;
  if (x == null || w == null) {
    const v = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []) };
    const ids = _agentLiveIds(v, args);
    const targets = v.entities.filter(e => ids.includes(e.id));
    if (targets.length) {
      const W2 = (typeof W !== 'undefined' ? W : 295);
      const minX = Math.min(...targets.map(e => e.x)), minY = Math.min(...targets.map(e => e.y));
      const maxX = Math.max(...targets.map(e => e.x + W2)), maxY = Math.max(...targets.map(e => (e.y) + 200));
      x = minX - 30; y = minY - 50; w = (maxX - minX) + 60; h = (maxY - minY) + 80;
    } else { x = 60; y = 60; w = 400; h = 300; }
  }
  const id = (typeof makeSectionId === 'function') ? makeSectionId() : ('sec_' + Math.random().toString(36).slice(2, 8));
  const sec = { id, name: args.name || '섹션', x, y, w, h, colorIdx: args.colorIdx || 0 };
  SECTIONS.push(sec);
  if (typeof render === 'function') render();
  if (typeof saveState === 'function') saveState();
  return { ok: true, sectionId: id, name: sec.name };
}

function _agentToolManageSection(draft, args) {
  if (typeof SECTIONS === 'undefined') throw new Error('섹션 기능을 사용할 수 없습니다.');
  const key = String(args.sectionId || args.name || '').toLowerCase();
  const sec = SECTIONS.find(s => s.id === args.sectionId) || SECTIONS.find(s => (s.name || '').toLowerCase() === key);
  if (!sec) throw new Error('섹션을 찾을 수 없습니다: ' + (args.sectionId || args.name || ''));
  const action = args.action || (args.newName ? 'rename' : null);
  if (action === 'delete') { if (typeof deleteSection === 'function') deleteSection(sec); else { SECTIONS.splice(SECTIONS.indexOf(sec), 1); if (typeof render === 'function') render(); if (typeof saveState === 'function') saveState(); } return { ok: true, deleted: sec.id }; }
  if (action === 'recolor' && args.colorIdx != null) sec.colorIdx = args.colorIdx;
  if ((action === 'rename' || args.newName) && args.newName) sec.name = args.newName;
  if (typeof render === 'function') render();
  if (typeof saveState === 'function') saveState();
  return { ok: true, sectionId: sec.id, name: sec.name };
}

function _agentToolAddNote(draft, args) {
  const content = args.content || args.text || '';
  const wx = args.x != null ? args.x : 80, wy = args.y != null ? args.y : 80;
  if (typeof NOTES_V2 !== 'undefined' && typeof makeNoteV2Id === 'function') {
    const themes = (typeof NOTE_V2_THEMES !== 'undefined') ? Object.keys(NOTE_V2_THEMES) : ['cream'];
    const color = (args.color && themes.includes(args.color)) ? args.color : themes[0];
    const note = { id: makeNoteV2Id(), x: wx, y: wy, w: (typeof NOTE_V2_W !== 'undefined' ? NOTE_V2_W : 220), h: (typeof NOTE_V2_H !== 'undefined' ? NOTE_V2_H : 160), title: args.title || '', text: content, color, pinned: false, tags: [], createdAt: new Date().toISOString() };
    NOTES_V2.push(note);
    if (typeof renderNoteV2Overlays === 'function') renderNoteV2Overlays();
    if (typeof saveState === 'function') saveState();
    return { ok: true, noteId: note.id };
  }
  if (typeof NOTES !== 'undefined') {
    const note = { id: 'note_' + Math.random().toString(36).slice(2, 8), x: wx, y: wy, w: 180, h: 110, text: content, color: '#f9e2af', mode: (args.style === 'markdown' ? 'markdown' : 'text') };
    NOTES.push(note);
    if (typeof render === 'function') render();
    if (typeof saveState === 'function') saveState();
    return { ok: true, noteId: note.id };
  }
  throw new Error('메모 기능을 사용할 수 없습니다.');
}

// ── 버전·스냅샷 (live; restore 는 워크스페이스 교체) ───────────────
function _agentToolSaveSnapshot(draft, args) {
  if (draft && draft.entities) _agentCommitDraft(draft);   // 펜딩 편집 먼저 반영 후 스냅샷
  if (typeof autoSnapshot !== 'function') throw new Error('스냅샷 기능을 사용할 수 없습니다.');
  const snap = autoSnapshot((args && (args.name || args.description)) || '');
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, snapshotId: snap && snap.id, name: snap && snap.name };
}

function _agentToolRestoreSnapshot(draft, args) {
  if (typeof SNAPSHOTS === 'undefined') throw new Error('스냅샷 기능을 사용할 수 없습니다.');
  const key = String((args && (args.snapshot || args.snapshotId || args.name)) || '').toLowerCase();
  const snap = SNAPSHOTS.find(s => s.id === (args && (args.snapshot || args.snapshotId))) || SNAPSHOTS.find(s => (s.name || '').toLowerCase() === key);
  if (!snap) throw new Error('스냅샷을 찾을 수 없습니다: ' + ((args && (args.snapshot || args.name)) || ''));
  if (typeof restoreFromSnapshot !== 'function') throw new Error('복원 기능(restoreFromSnapshot)을 찾을 수 없습니다.');
  try { restoreFromSnapshot(JSON.parse(snap.state)); } catch (e) { throw new Error('스냅샷 복원 실패: ' + e.message); }
  if (typeof saveState === 'function') saveState();
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, restored: snap.name };
}

// ── 다이어그램 (live, 워크스페이스 교체) ──────────────────────────
function _agentDiagFind(arg) {
  if (typeof diagrams === 'undefined') return null;
  return diagrams.find(d => d.id === arg) || diagrams.find(d => (d.name || '').toLowerCase() === String(arg || '').toLowerCase()) || null;
}

function _agentToolCreateDiagram(draft, args) {
  if (typeof diagrams === 'undefined' || typeof createEmptyDiagram !== 'function') throw new Error('다이어그램 기능을 사용할 수 없습니다.');
  if (draft && draft.entities) _agentCommitDraft(draft);
  if (typeof flushCurrentState === 'function') flushCurrentState();
  const d = createEmptyDiagram(args && args.name ? args.name : '새 다이어그램');
  diagrams.push(d);
  activeDiagramId = d.id;
  if (typeof loadDiagramIntoWorkspace === 'function') loadDiagramIntoWorkspace(d);
  if (Array.isArray(args && args.entities) && typeof applyAISchema === 'function') {
    const sel = document.getElementById('aiApplyMode'); const prev = sel ? sel.value : null; if (sel) sel.value = 'replace';
    applyAISchema({ entities: args.entities, relations: args.relations || [] });
    if (sel && prev != null) sel.value = prev;
  }
  if (typeof renderDiagramPanel === 'function') renderDiagramPanel();
  if (typeof render === 'function') render();
  if (typeof saveState === 'function') saveState();
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, diagramId: d.id, name: d.name };
}

function _agentToolSwitchDiagram(draft, args) {
  const d = _agentDiagFind(args && (args.diagram || args.diagramId || args.diagramName || args.name));
  if (!d) throw new Error('다이어그램을 찾을 수 없습니다.');
  if (draft && draft.entities) _agentCommitDraft(draft);
  if (typeof switchDiagram === 'function') switchDiagram(d.id);
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, diagramId: d.id, name: d.name };
}

function _agentToolRenameDiagram(draft, args) {
  const d = _agentDiagFind(args && (args.diagram || args.diagramId || args.name));
  if (!d) throw new Error('다이어그램을 찾을 수 없습니다.');
  if (!args.newName) throw new Error('newName 이 필요합니다.');
  d.name = args.newName;
  if (typeof renderDiagramPanel === 'function') renderDiagramPanel();
  if (typeof saveState === 'function') saveState();
  return { ok: true, diagramId: d.id, name: d.name };
}

function _agentToolDeleteDiagram(draft, args) {
  if (typeof diagrams === 'undefined') throw new Error('다이어그램 기능을 사용할 수 없습니다.');
  if (diagrams.length <= 1) throw new Error('마지막 다이어그램은 삭제할 수 없습니다.');
  const d = _agentDiagFind(args && (args.diagram || args.diagramId || args.name));
  if (!d) throw new Error('다이어그램을 찾을 수 없습니다.');
  const wasActive = (typeof activeDiagramId !== 'undefined') && d.id === activeDiagramId;
  if (draft && draft.entities && !wasActive) _agentCommitDraft(draft);
  const idx = diagrams.indexOf(d); diagrams.splice(idx, 1);
  if (wasActive) { activeDiagramId = diagrams[Math.max(0, idx - 1)].id; if (typeof loadDiagramIntoWorkspace === 'function') loadDiagramIntoWorkspace(getActiveDiagram()); }
  if (typeof renderDiagramPanel === 'function') renderDiagramPanel();
  if (typeof render === 'function') render();
  if (typeof saveState === 'function') saveState();
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, deleted: d.id };
}

// ── 테마·내보내기·가져오기 ────────────────────────────────────────
function _agentToolSetTheme(draft, args) {
  if (typeof applyTheme !== 'function') throw new Error('테마 기능을 사용할 수 없습니다.');
  const name = args && (args.theme || args.name || args.themeName);
  if (!name || (typeof THEMES !== 'undefined' && !THEMES[name])) throw new Error('알 수 없는 테마: ' + name + (typeof THEMES !== 'undefined' ? ' (사용가능: ' + Object.keys(THEMES).join(', ') + ')' : ''));
  applyTheme(name);
  return { ok: true, theme: name };
}

function _agentToolExportDiagram(draft, args) {
  const fmt = (args && args.format) || 'png';
  if (draft && draft.entities) _agentCommitDraft(draft);
  try {
    if (fmt === 'png' && typeof downloadImage === 'function') { downloadImage(args && args.includeSection !== false, !!(args && args.hiRes)); }
    else if (fmt === 'svg' && typeof downloadSVG === 'function') { downloadSVG(); }
    else if (fmt === 'json' && typeof exportData === 'function') { exportData(); }
    else if (fmt === 'markdown' && typeof exportMarkdown === 'function') { exportMarkdown(); }
    else return { ok: false, error: '지원하지 않는 포맷이거나 내보내기 함수를 찾을 수 없습니다: ' + fmt };
  } catch (e) { return { ok: false, error: e.message }; }
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, format: fmt, note: '내보내기 다이얼로그/다운로드를 시작했습니다.' };
}

function _agentToolImportJson(draft, args) {
  if (typeof applyAISchema !== 'function') throw new Error('가져오기 기능을 사용할 수 없습니다.');
  const data = args && (args.data || args.json);
  if (!data || !Array.isArray(data.entities)) throw new Error('data.entities 배열이 필요합니다.');
  if (draft && draft.entities) _agentCommitDraft(draft);
  const sel = document.getElementById('aiApplyMode'); const prev = sel ? sel.value : null;
  if (sel) sel.value = (args.mode === 'replace') ? 'replace' : 'add';
  applyAISchema({ entities: data.entities, relations: data.relations || [] });
  if (sel && prev != null) sel.value = prev;
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, imported: data.entities.length, mode: (args.mode === 'replace') ? 'replace' : 'add' };
}

// ── 산출물: 테이블 정의서 ──────────────────────────────────────────
// 대상 테이블 선택(ids/keyword/전체) 공통 해소
function _agentSpecTargets(args) {
  const v = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []) || [], relations: (typeof RELATIONS !== 'undefined' ? RELATIONS : []) || [] };
  const ids = _agentLiveIds(v, args || {});
  return ids.length ? v.entities.filter(e => ids.includes(e.id)) : v.entities;
}

// 테이블 정의서 → 인쇄용 HTML 을 새 창으로 (채팅이 아닌 정식 문서). 클라 전용.
function _agentToolGenerateTableSpec(draft, args) {
  const ents = _agentSpecTargets(args || {});
  if (!ents.length) return { ok: false, error: '대상 테이블이 없습니다.' };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const diagName = (typeof getActiveDiagram === 'function' && getActiveDiagram() && getActiveDiagram().name) || 'ERD';
  const title = (args && args.title) || (diagName + ' 테이블 정의서');
  let body = '';
  ents.forEach((e, ti) => {
    const nm = (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.physicalName || e.id);
    const rows = (e.attrs || []).map((a, i) =>
      '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(a.logicalName) + '</td><td>' + esc(a.physicalName) + '</td><td>' + esc(a.type) +
      '</td><td class="c">' + (a.kind === 'pk' ? '●' : '') + '</td><td class="c">' + (a.kind === 'fk' ? '●' : '') +
      '</td><td class="c">' + (a.notNull ? '●' : '') + '</td><td>' + esc(a.defaultValue || '') + '</td><td>' + esc(a.description || '') + '</td></tr>'
    ).join('');
    body += '<section><h2>' + (ti + 1) + '. ' + esc(nm) + ' <span class="phys">' + esc(e.physicalName || '') + '</span></h2>' +
      (e.description ? '<p class="desc">' + esc(e.description) + '</p>' : '') +
      '<table><thead><tr><th>순번</th><th>논리명</th><th>물리명</th><th>데이터타입</th><th>PK</th><th>FK</th><th>NN</th><th>기본값</th><th>설명</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
  });
  const css = 'body{font-family:"Malgun Gothic","Segoe UI",sans-serif;margin:28px;color:#222;font-size:13px}'
    + 'h1{font-size:22px;margin:0 0 4px}.meta{color:#666;font-size:12px;margin-bottom:18px}'
    + 'section{margin:0 0 22px;page-break-inside:avoid}h2{font-size:15px;background:#d9e1f2;padding:6px 10px;border-radius:4px;margin:18px 0 6px}'
    + '.phys{color:#555;font-weight:400;font-size:12px}.desc{color:#555;margin:2px 0 6px}'
    + 'table{border-collapse:collapse;width:100%}td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}'
    + 'th{border:1px solid #bbb;padding:5px 7px;background:#4472c4;color:#fff;font-weight:600;font-size:12px;text-align:center}'
    + 'td.c{text-align:center}.noprint{margin:14px 0}button{padding:8px 16px;font-size:13px;cursor:pointer}'
    + '@media print{.noprint{display:none}body{margin:0}}';
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + css + '</style></head><body>'
    + '<div class="noprint"><button onclick="window.print()">🖨 인쇄 / PDF 저장</button></div>'
    + '<h1>' + esc(title) + '</h1><div class="meta">' + ents.length + '개 테이블</div>' + body + '</body></html>';
  const w = window.open('', '_blank');
  if (!w) return { ok: false, error: '팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.' };
  w.document.open(); w.document.write(html); w.document.close();
  return { ok: true, count: ents.length, note: '테이블 정의서를 새 창에 열었습니다(인쇄→PDF 저장 가능).' };
}

// 테이블 정의서 → 엑셀(.xlsx). 사이드카 /export/table-spec(openpyxl) 호출 후 다운로드. 데스크탑 전용.
async function _agentToolExportTableSpecXlsx(draft, args) {
  const ents = _agentSpecTargets(args || {});
  if (!ents.length) return { ok: false, error: '대상 테이블이 없습니다.' };
  const payload = {
    title: (args && args.title) || '테이블 정의서',
    tables: ents.map(e => ({
      logicalName: (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.id),
      physicalName: e.physicalName || '',
      description: e.description || '',
      columns: (e.attrs || []).map(a => ({
        logicalName: a.logicalName || '', physicalName: a.physicalName || '', type: a.type || '',
        kind: a.kind || 'normal', notNull: !!a.notNull, defaultValue: a.defaultValue || '', description: a.description || '',
      })),
    })),
  };
  const base = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
  let res;
  try {
    res = await fetch(base + '/export/table-spec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {
    return { ok: false, error: '사이드카에 연결할 수 없습니다(엑셀 내보내기는 데스크탑 전용). ' + e.message };
  }
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json()).detail || ''; } catch (e2) {}
    return { ok: false, error: '엑셀 생성 실패: HTTP ' + res.status + (detail ? ' — ' + detail : '') };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (args && args.fileName) || ((payload.title || '테이블정의서') + '.xlsx');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { ok: true, count: ents.length, note: '엑셀 테이블 정의서를 다운로드했습니다.' };
}

// ── 추가 분석·산출물 툴 ────────────────────────────────────────────
function _agentEscHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 표준 스타일의 인쇄용 문서를 새 창으로 연다 → true(열림)/false(팝업차단)
function _agentOpenDoc(title, innerHtml) {
  const esc = _agentEscHtml;
  const css = 'body{font-family:"Malgun Gothic","Segoe UI",sans-serif;margin:28px;color:#222;font-size:13px}'
    + 'h1{font-size:22px;margin:0 0 4px}.meta{color:#666;font-size:12px;margin-bottom:16px}'
    + 'h2{font-size:15px;background:#d9e1f2;padding:6px 10px;border-radius:4px;margin:20px 0 6px}'
    + 'table{border-collapse:collapse;width:100%;margin:6px 0 16px}'
    + 'td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}'
    + 'th{border:1px solid #bbb;padding:5px 7px;background:#4472c4;color:#fff;font-weight:600;font-size:12px;text-align:center}'
    + 'td.c{text-align:center}.bad{color:#c0392b;font-weight:600}.ok{color:#1e7d4f}'
    + '.noprint{margin:14px 0}button{padding:8px 16px;font-size:13px;cursor:pointer}'
    + '@media print{.noprint{display:none}body{margin:0}}';
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + css + '</style></head><body>'
    + '<div class="noprint"><button onclick="window.print()">🖨 인쇄 / PDF 저장</button></div>'
    + '<h1>' + esc(title) + '</h1>' + innerHtml + '</body></html>';
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}

// LLM이 직접 생성한 임의 콘텐츠(HTML 보고서·Markdown·CSV·JSON·텍스트 등)를 파일로 저장(다운로드).
// "위 내용을 HTML 보고서로 만들어 저장해줘" 류 — 모델이 완성한 본문을 content 인자에 담아 전달하면 파일로 떨군다.
// 클라 전용(웹·데스크탑 공통, Blob 다운로드). ERD 를 바꾸지 않음(read).
function _agentToolSaveContent(draft, args) {
  args = args || {};
  let content = (args.content != null) ? args.content : (args.text != null ? args.text : args.body);
  if (content == null || String(content).trim() === '')
    return { ok: false, error: 'content(저장할 본문)가 비어 있습니다. 완성된 본문을 content 인자에 담아 전달하세요.' };
  if (typeof content !== 'string') { try { content = JSON.stringify(content, null, 2); } catch (e) { content = String(content); } }

  // 포맷 결정: format 인자 → fileName 확장자 → 기본 txt
  const fmtRaw = String(args.format || '').toLowerCase().trim().replace(/^\./, '');
  const nameExt = (String(args.fileName || '').match(/\.([a-z0-9]+)\s*$/i) || [])[1];
  const fmt = fmtRaw || (nameExt ? nameExt.toLowerCase() : 'txt');
  const MAP = {
    html: { ext: 'html', mime: 'text/html' }, htm: { ext: 'html', mime: 'text/html' },
    md: { ext: 'md', mime: 'text/markdown' }, markdown: { ext: 'md', mime: 'text/markdown' },
    txt: { ext: 'txt', mime: 'text/plain' }, text: { ext: 'txt', mime: 'text/plain' },
    csv: { ext: 'csv', mime: 'text/csv' }, json: { ext: 'json', mime: 'application/json' },
    svg: { ext: 'svg', mime: 'image/svg+xml' }, xml: { ext: 'xml', mime: 'application/xml' },
    sql: { ext: 'sql', mime: 'text/plain' },
  };
  const spec = MAP[fmt] || { ext: (fmt.replace(/[^a-z0-9]/gi, '') || 'txt'), mime: 'text/plain' };
  const title = String(args.title || '에이전트 산출물');

  // HTML 인데 단편(fragment)이면 인쇄 가능한 문서로 감싼다(전체 문서면 그대로).
  if (spec.ext === 'html' && !/<!doctype|<html[\s>]/i.test(content)) {
    const esc = _agentEscHtml;
    const css = 'body{font-family:"Malgun Gothic","Segoe UI",sans-serif;margin:28px;color:#222;font-size:13px;line-height:1.6}'
      + 'h1{font-size:22px}h2{font-size:16px;border-bottom:2px solid #4472c4;padding-bottom:4px;margin-top:22px}'
      + 'table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #bbb;padding:5px 8px;text-align:left}'
      + 'th{background:#4472c4;color:#fff}code,pre{background:#f4f4f4;padding:2px 5px;border-radius:3px}'
      + '@media print{body{margin:0}}';
    content = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title)
      + '</title><style>' + css + '</style></head><body>' + content + '</body></html>';
  }

  // 파일명 결정 + 금지문자 정리
  let fileName = String(args.fileName || '').trim();
  if (!fileName) fileName = title + '.' + spec.ext;
  else if (!/\.[a-z0-9]+$/i.test(fileName)) fileName += '.' + spec.ext;
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');

  try {
    const blob = new Blob([content], { type: spec.mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) {
    return { ok: false, error: '파일 저장 실패: ' + e.message };
  }
  return { ok: true, fileName: fileName, format: spec.ext, chars: content.length,
           note: '"' + fileName + '" 파일로 저장(다운로드)했습니다.' };
}

// 선택(또는 전체) 엔티티를 다른 다이어그램으로 복사. 없으면 생성(createIfMissing 기본 true).
// "모든 엔티티를 AAA다이어그램으로 복사" → ids/keyword 없으면 전체 복사. 복사 집합 내부 관계도 이식.
function _agentToolCopyEntitiesToDiagram(draft, args) {
  if (typeof diagrams === 'undefined') throw new Error('다이어그램 기능을 사용할 수 없습니다.');
  args = args || {};
  // 펜딩 드래프트·현재 워크스페이스를 먼저 반영(유실 방지)
  if (draft && draft.entities) _agentCommitDraft(draft);
  if (typeof flushCurrentState === 'function') flushCurrentState();

  const live = { entities: (typeof ENTITIES !== 'undefined' ? ENTITIES : []) || [],
                 relations: (typeof RELATIONS !== 'undefined' ? RELATIONS : []) || [] };
  let ids = _agentLiveIds(live, args);
  // 명시 대상(ids/keyword/selection)이 전혀 없으면 전체 복사로 간주
  const hadSelector = !!(args.ids || args.entityIds || args.entities || args.keyword || args.name || args.query || args.all || args.scope);
  if (!ids.length && !hadSelector) ids = live.entities.map(e => e.id);
  if (!ids.length) return { ok: false, error: '복사할 엔티티가 없습니다.' };

  const target = String(args.target || args.toDiagram || args.diagram || args.diagramName || args.name || '').trim();
  if (!target) return { ok: false, error: 'target(대상 다이어그램 이름)이 필요합니다.' };
  let d = _agentDiagFind(target);
  const createIfMissing = args.createIfMissing !== false;
  let created = false;
  if (!d) {
    if (!createIfMissing || typeof createEmptyDiagram !== 'function')
      return { ok: false, error: "대상 다이어그램 '" + target + "' 을 찾을 수 없습니다." };
    d = createEmptyDiagram(target);
    diagrams.push(d);
    created = true;
  }
  d.entities = d.entities || []; d.relations = d.relations || [];

  // 엔티티 복제(새 id) + id 매핑
  const idMap = {};
  const srcEnts = ids.map(id => live.entities.find(e => e.id === id)).filter(Boolean);
  srcEnts.forEach(e => {
    const copy = JSON.parse(JSON.stringify(e));
    const nid = 'entity_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    idMap[e.id] = nid; copy.id = nid;
    d.entities.push(copy);
  });
  // FK ref.entity 재매핑(복사 집합 내부 참조만)
  d.entities.forEach(c => (c.attrs || []).forEach(a => {
    if (a && a.ref && a.ref.entity && idMap[a.ref.entity]) a.ref = { ...a.ref, entity: idMap[a.ref.entity] };
  }));
  // 복사 집합 내부 관계만 이식(from·to 둘 다 복사 대상일 때) — id 재매핑
  let relCount = 0;
  const idset = new Set(ids);
  live.relations.forEach(r => {
    if (idset.has(r.from) && idset.has(r.to)) {
      d.relations.push({ ...r, from: idMap[r.from], to: idMap[r.to] });
      relCount++;
    }
  });

  // 복사 후 대상으로 전환(기본) — "만들고 복사" 의도상 채워진 대상을 사용자가 바로 보게 한다.
  // 위치(x,y)를 그대로 복사하므로 재정렬(auto_layout) 불필요. activate:false 면 현재 다이어그램 유지.
  const activate = args.activate !== false;
  if (typeof activeDiagramId !== 'undefined' && typeof loadDiagramIntoWorkspace === 'function') {
    if (activate) { activeDiagramId = d.id; loadDiagramIntoWorkspace(d); }
    else if (d.id === activeDiagramId) loadDiagramIntoWorkspace(d);   // 대상이 이미 활성이면 갱신
  }
  if (typeof renderDiagramPanel === 'function') renderDiagramPanel();
  if (typeof render === 'function') render();
  if (typeof saveState === 'function') saveState();
  if (draft) { const cur = _agentCloneState(); draft.entities = cur.entities; draft.relations = cur.relations; draft.layout = null; }
  return { ok: true, copied: srcEnts.length, relations: relCount, target: d.name, diagramId: d.id, created, activated: activate };
}

// 사용 가능한 테마 목록 — read. 테마 변경(set_theme) 전에 어떤 테마가 있는지 모를 때 조회.
function _agentToolListThemes() {
  if (typeof THEMES === 'undefined') return { ok: false, error: '테마 정보를 사용할 수 없습니다.' };
  const cur = (typeof currentTheme !== 'undefined') ? currentTheme : null;
  const themes = Object.entries(THEMES).map(([key, t]) => ({ key, name: (t && t.name) || key, active: key === cur }));
  return { ok: true, count: themes.length, current: cur, themes };
}

// 키보드 단축키 목록 — read. "단축키 알려줘".
function _agentToolListShortcuts() {
  const defs = (typeof _scMap !== 'undefined' && _scMap && Object.keys(_scMap).length)
    ? _scMap : (typeof SC_DEFAULTS !== 'undefined' ? SC_DEFAULTS : null);
  if (!defs) return { ok: false, error: '단축키 정보를 사용할 수 없습니다.' };
  const fmt = (typeof _scParts === 'function')
    ? (id => _scParts(id).join('+'))
    : (id => { const s = defs[id]; const p = []; if (s.ctrl) p.push('Ctrl'); if (s.alt) p.push('Alt'); if (s.shift) p.push('Shift'); p.push(s.key.length === 1 ? s.key.toUpperCase() : s.key); return p.join('+'); });
  const shortcuts = Object.keys(defs).map(id => ({ id, action: defs[id].label || id, keys: fmt(id) }));
  return { ok: true, count: shortcuts.length, shortcuts };
}

// 메뉴/명령 정보(사이트맵) — read. "메뉴 어디 있어?"·자연어 메뉴 탐색. CMD_LIST(명령 팔레트 레지스트리) 기반.
function _agentToolListMenus(draft, args) {
  if (typeof CMD_LIST === 'undefined') return { ok: false, error: '메뉴 정보를 사용할 수 없습니다.' };
  const kw = String((args && (args.keyword || args.query || args.name)) || '').toLowerCase().trim();
  const scKeys = (id) => (id && typeof _scParts === 'function') ? _scParts(id).join('+') : '';
  let items = CMD_LIST.map(c => ({ label: c.label, category: c.category, shortcut: scKeys(c.scId) }));
  if (kw) items = items.filter(c => c.label.toLowerCase().includes(kw) || c.category.toLowerCase().includes(kw));
  // 카테고리별 사이트맵 그룹화
  const sitemap = {};
  items.forEach(c => { (sitemap[c.category] = sitemap[c.category] || []).push(c.label); });
  return { ok: true, count: items.length, query: kw || null, sitemap, items };
}

// 컬럼 템플릿 관리 — live(localStorage). list/add/delete. "사용자ID,사용자이름,사용자나이를 컬럼 템플릿에 추가".
function _agentToolManageColumnTemplate(draft, args) {
  if (typeof loadTemplates !== 'function' || typeof saveTemplates !== 'function')
    return { ok: false, error: '컬럼 템플릿 기능을 사용할 수 없습니다.' };
  args = args || {};
  const action = String(args.action || (args.attrs || args.columns ? 'add' : 'list')).toLowerCase();
  const templates = loadTemplates();

  if (action === 'list') {
    return { ok: true, count: templates.length,
             templates: templates.map(t => ({ id: t.id, name: t.name, columnCount: (t.attrs || []).length,
               columns: (t.attrs || []).map(a => a.logicalName || a.physicalName) })) };
  }

  if (action === 'delete') {
    const key = String(args.id || args.name || '').toLowerCase();
    const idx = templates.findIndex(t => (t.id || '').toLowerCase() === key || (t.name || '').toLowerCase() === key);
    if (idx === -1) return { ok: false, error: "템플릿 '" + (args.id || args.name || '') + "' 을 찾을 수 없습니다." };
    const removed = templates.splice(idx, 1)[0];
    saveTemplates(templates);
    return { ok: true, deleted: removed.name || removed.id, note: "컬럼 템플릿 '" + (removed.name || removed.id) + "' 삭제됨." };
  }

  // add — attrs(또는 columns) 를 받아 새 템플릿 등록(이름 중복 시 attrs 병합)
  const name = String(args.name || args.templateName || '').trim();
  if (!name) return { ok: false, error: 'add 에는 name(템플릿 이름)이 필요합니다.' };
  let rawCols = args.attrs || args.columns || args.cols || [];
  if (!Array.isArray(rawCols) || !rawCols.length)
    return { ok: false, error: 'attrs(컬럼 목록)가 필요합니다. 예: attrs:[{logicalName,physicalName,type}]' };
  const norm = rawCols.map(c => {
    if (typeof c === 'string') return { logicalName: c, physicalName: '', type: 'VARCHAR(50)', kind: 'normal', notNull: false, unique: false, autoIncrement: false, defaultValue: '', description: '', ref: null };
    return { logicalName: c.logicalName || c.name || '', physicalName: c.physicalName || '', type: c.type || 'VARCHAR(50)',
      kind: c.kind || 'normal', notNull: !!c.notNull, unique: !!c.unique, autoIncrement: !!c.autoIncrement,
      defaultValue: c.defaultValue || '', description: c.description || '', ref: c.ref || null };
  });
  const existing = templates.find(t => (t.name || '').toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.attrs = (existing.attrs || []).concat(norm);
    saveTemplates(templates);
    return { ok: true, templateId: existing.id, added: norm.length, note: "기존 템플릿 '" + name + "'에 컬럼 " + norm.length + "개 추가됨." };
  }
  const id = 'tmpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  templates.push({ id, name, attrs: norm });
  saveTemplates(templates);
  return { ok: true, templateId: id, added: norm.length, note: "컬럼 템플릿 '" + name + "' 생성(컬럼 " + norm.length + "개)." };
}

// ERD 구조 메트릭(허브·결합도·fan-in/out) — read
function _agentToolAnalyzeErdMetrics(draft) {
  const v = _agentReadView(draft);
  const ents = v.entities, rels = v.relations;
  const inn = {}, out = {};
  ents.forEach(e => { inn[e.id] = 0; out[e.id] = 0; });
  rels.forEach(r => { if (out[r.from] != null) out[r.from]++; if (inn[r.to] != null) inn[r.to]++; });
  const metrics = ents.map(e => ({ name: _agentNameOf(e), fanOut: out[e.id] || 0, fanIn: inn[e.id] || 0, degree: (out[e.id] || 0) + (inn[e.id] || 0) }));
  metrics.sort((a, b) => b.degree - a.degree);
  return {
    ok: true, entityCount: ents.length, relationCount: rels.length,
    avgDegree: ents.length ? +(rels.length * 2 / ents.length).toFixed(2) : 0,
    hubs: metrics.filter(m => m.degree >= 3).slice(0, 10),
    topByDegree: metrics.slice(0, 10),
    isolated: metrics.filter(m => m.degree === 0).map(m => m.name),
  };
}

// 정규화 위반 + 수정안 제시 — read
function _agentToolSuggestNormalization(draft) {
  const v = _agentReadView(draft);
  const findings = [];
  v.entities.forEach(e => {
    const nm = _agentNameOf(e);
    if (!(e.attrs || []).some(a => a.kind === 'pk'))
      findings.push({ target: nm, issue: 'PK 없음', suggestion: '대리키(예: ' + (e.physicalName || 'TBL') + '_SN) 또는 자연키를 PK로 지정 (1NF/식별성)' });
    const grp = {};
    (e.attrs || []).forEach(a => { const m = (a.physicalName || '').match(/^(.*?)(\d+)$/); if (m && m[1]) grp[m[1]] = (grp[m[1]] || 0) + 1; });
    Object.keys(grp).forEach(k => { if (grp[k] >= 2) findings.push({ target: nm, issue: '반복 컬럼 의심: ' + k + '1..' + grp[k], suggestion: '반복 그룹을 별도 테이블로 분해(1NF)' }); });
  });
  v.relations.forEach(r => {
    if (r.card !== 'N:M') return;
    const ef = (v.entities || []).find(x => x.id === r.from), et = (v.entities || []).find(x => x.id === r.to);
    // 대상은 사용자용 라벨(논리명 [물리명]), junction 제안명은 유효 식별자라야 하므로 물리명 기반
    const jn = ((ef && ef.physicalName) || _agentEntLabel(v, r.from)) + '_' + ((et && et.physicalName) || _agentEntLabel(v, r.to));
    findings.push({ target: _agentEntLabel(v, r.from) + ' ↔ ' + _agentEntLabel(v, r.to), issue: 'N:M 관계', suggestion: '연결(junction) 테이블로 분해 (예: ' + jn + ')' });
  });
  return { ok: true, count: findings.length, findings };
}

// 데이터 사전(컬럼 정의서) — HTML 새 창
function _agentToolGenerateDataDictionary(draft, args) {
  const ents = _agentSpecTargets(args || {});
  if (!ents.length) return { ok: false, error: '대상 테이블이 없습니다.' };
  const esc = _agentEscHtml;
  let rows = '';
  ents.forEach(e => {
    const tn = _agentNameOf(e);
    (e.attrs || []).forEach(a => {
      rows += '<tr><td>' + esc(tn) + '</td><td>' + esc(e.physicalName || '') + '</td><td>' + esc(a.logicalName) + '</td><td>' + esc(a.physicalName)
        + '</td><td>' + esc(a.type) + '</td><td class="c">' + (a.kind === 'pk' ? 'PK' : a.kind === 'fk' ? 'FK' : '') + '</td><td class="c">' + (a.notNull ? '●' : '')
        + '</td><td>' + esc(a.description || '') + '</td></tr>';
    });
  });
  const title = (args && args.title) || '데이터 사전';
  const inner = '<div class="meta">' + ents.length + '개 테이블</div>'
    + '<table><thead><tr><th>테이블</th><th>테이블물리명</th><th>컬럼 논리명</th><th>컬럼 물리명</th><th>데이터타입</th><th>종류</th><th>NN</th><th>설명</th></tr></thead><tbody>' + rows + '</tbody></table>';
  if (!_agentOpenDoc(title, inner)) return { ok: false, error: '팝업이 차단되었습니다. 허용 후 다시 시도하세요.' };
  return { ok: true, count: ents.length, note: '데이터 사전을 새 창에 열었습니다.' };
}

// ERD 종합 명세서(통계+이슈+엔티티+관계) — HTML 새 창
function _agentToolGenerateErdReport(draft, args) {
  const v = _agentReadView(draft);
  if (!v.entities.length) return { ok: false, error: 'ERD에 엔티티가 없습니다.' };
  const stats = _agentToolGetStatistics(draft).stats;
  const norm = _agentToolSuggestNormalization(draft).findings;
  const esc = _agentEscHtml;
  const diagName = (typeof getActiveDiagram === 'function' && getActiveDiagram() && getActiveDiagram().name) || 'ERD';
  const title = (args && args.title) || (diagName + ' ERD 명세서');
  let inner = '<h2>1. 요약 통계</h2><table><tbody>'
    + '<tr><th>엔티티</th><td>' + stats.entityCount + '</td><th>관계</th><td>' + stats.relationCount + '</td></tr>'
    + '<tr><th>총 컬럼</th><td>' + stats.columnsTotal + '</td><th>평균 컬럼</th><td>' + stats.avgColumns + '</td></tr>'
    + '<tr><th>PK 있는 테이블</th><td>' + stats.tablesWithPk + '</td><th>PK 없는 테이블</th><td class="' + (stats.tablesWithoutPk ? 'bad' : 'ok') + '">' + stats.tablesWithoutPk + '</td></tr>'
    + '<tr><th>고아 테이블</th><td>' + stats.orphanCount + '</td><th>카디널리티</th><td>1:1 ' + stats.cardinalities['1:1'] + ' / 1:N ' + stats.cardinalities['1:N'] + ' / N:M ' + stats.cardinalities['N:M'] + '</td></tr>'
    + '</tbody></table>';
  inner += '<h2>2. 엔티티 목록</h2><table><thead><tr><th>#</th><th>논리명</th><th>물리명</th><th>컬럼수</th><th>설명</th></tr></thead><tbody>'
    + v.entities.map((e, i) => '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(_agentNameOf(e)) + '</td><td>' + esc(e.physicalName || '') + '</td><td class="c">' + (e.attrs || []).length + '</td><td>' + esc(e.description || '') + '</td></tr>').join('') + '</tbody></table>';
  inner += '<h2>3. 관계 목록</h2><table><thead><tr><th>From</th><th>To</th><th>카디널리티</th></tr></thead><tbody>'
    + (v.relations.length ? v.relations.map(r => '<tr><td>' + esc(_agentEntLabel(v, r.from)) + '</td><td>' + esc(_agentEntLabel(v, r.to)) + '</td><td class="c">' + esc(r.card) + '</td></tr>').join('') : '<tr><td colspan="3">관계 없음</td></tr>') + '</tbody></table>';
  inner += '<h2>4. 정규화·이슈 진단</h2><table><thead><tr><th>대상</th><th>이슈</th><th>권고</th></tr></thead><tbody>'
    + (norm.length ? norm.map(f => '<tr><td>' + esc(f.target) + '</td><td class="bad">' + esc(f.issue) + '</td><td>' + esc(f.suggestion) + '</td></tr>').join('') : '<tr><td colspan="3" class="ok">발견된 이슈 없음</td></tr>') + '</tbody></table>';
  if (!_agentOpenDoc(title, inner)) return { ok: false, error: '팝업이 차단되었습니다. 허용 후 다시 시도하세요.' };
  return { ok: true, entityCount: v.entities.length, issueCount: norm.length, note: 'ERD 명세서를 새 창에 열었습니다.' };
}

// 표준용어 준수 점검표 — 컬럼 논리명의 표준 abbr vs 실제 물리명 (async, 데스크탑 전용)
async function _agentToolGenerateTermCompliance(draft, args) {
  if (typeof stdLookupTerm !== 'function') return { ok: false, error: '표준용어사전을 사용할 수 없습니다(데스크탑 전용).' };
  const ents = _agentSpecTargets(args || {});
  if (!ents.length) return { ok: false, error: '대상 테이블이 없습니다.' };
  const cap = Number(args && args.limit) || 150;
  const violations = [], unregistered = [];
  let checked = 0, compliant = 0;
  for (const e of ents) {
    const tn = _agentNameOf(e);
    for (const a of (e.attrs || [])) {
      if (checked >= cap) break;
      const logical = a.logicalName; if (!logical) continue;
      let term;
      try { term = await stdLookupTerm(logical); } catch (err) { return { ok: false, error: '표준사전 조회 실패: ' + err.message }; }
      checked++;
      if (term && term.abbr) {
        if (String(a.physicalName || '').toUpperCase() === String(term.abbr).toUpperCase()) compliant++;
        else violations.push({ table: tn, column: logical, physical: a.physicalName || '', standard: term.abbr });
      } else {
        unregistered.push({ table: tn, column: logical, physical: a.physicalName || '' });
      }
    }
    if (checked >= cap) break;
  }
  return {
    ok: true, checked, compliant,
    violationCount: violations.length, violations: violations.slice(0, 60),
    unregisteredCount: unregistered.length, unregistered: unregistered.slice(0, 40),
    note: checked >= cap ? ('상위 ' + cap + '개 컬럼만 점검(상한).') : undefined,
  };
}

// 데이터 사전 → 엑셀(.xlsx). 사이드카 /export/data-dictionary 호출. 데스크탑 전용.
async function _agentToolExportDataDictionaryXlsx(draft, args) {
  const ents = _agentSpecTargets(args || {});
  if (!ents.length) return { ok: false, error: '대상 테이블이 없습니다.' };
  const cols = [];
  ents.forEach(e => {
    const tn = _agentNameOf(e);
    (e.attrs || []).forEach(a => cols.push({
      table: tn, tablePhysical: e.physicalName || '',
      logicalName: a.logicalName || '', physicalName: a.physicalName || '', type: a.type || '',
      kind: a.kind || 'normal', notNull: !!a.notNull, description: a.description || '',
    }));
  });
  const payload = { title: (args && args.title) || '데이터 사전', columns: cols };
  const base = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
  let res;
  try {
    res = await fetch(base + '/export/data-dictionary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) { return { ok: false, error: '사이드카에 연결할 수 없습니다(엑셀 내보내기는 데스크탑 전용). ' + e.message }; }
  if (!res.ok) { let d = ''; try { d = (await res.json()).detail || ''; } catch (e2) {} return { ok: false, error: '엑셀 생성 실패: HTTP ' + res.status + (d ? ' — ' + d : '') }; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (args && args.fileName) || ((payload.title || '데이터사전') + '.xlsx');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { ok: true, columnCount: cols.length, note: '데이터 사전 엑셀을 다운로드했습니다.' };
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
    detail: '세 필드를 혼동·교체하지 말 것: id=소문자 snake_case 영문 식별자(관계에서 이 id로 참조), logicalName=한글 논리명, '
          + 'physicalName=UPPER_SNAKE_CASE 영문 물리명(DB 테이블명). 예: {id:"common_model", logicalName:"공통모델", physicalName:"TB_CMM_MDL"}. '
          + 'attrs 각 항목도 동일 규칙: {logicalName:한글, physicalName:UPPER_SNAKE_CASE 영문, type, kind(pk|fk|normal), notNull}.' },
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
    detail: '대상 엔티티에 컬럼을 추가한다. logicalName=한글 컬럼명, physicalName=UPPER_SNAKE_CASE 영문 컬럼명(혼동 금지). 동일 physicalName이 이미 있으면 추가하지 않는다.' },
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
  { name: 'set_cardinality', kind: 'write', danger: false, run: _agentToolSetCardinality,
    desc: '기존 관계의 카디널리티 변경', params: 'from, to, card(1:1|1:N|N:M)',
    detail: '이미 있는 from↔to 관계를 찾아 card 만 바꾼다(관계를 지우고 다시 만들지 않음). 방향이 반대로 와도 매칭한다. FK 컬럼은 유지. "관계를 …로 바꿔/변경"에 사용.' },
  { name: 'normalize_check', kind: 'read', danger: false, run: _agentToolNormalizeCheck,
    desc: 'ERD 정규화 위반 진단(읽기 전용)', params: '(없음)',
    detail: 'PK 없는 테이블·N:M 관계 등 정규화 위반 후보를 찾아 {violationCount, findings} 로 반환한다. 상태 변경 없음. "정규화 위반 찾아/검사"에 사용.' },
  { name: 'lookup_std_term', kind: 'read', danger: false, run: _agentToolLookupStdTerm,
    desc: '표준용어사전 조회', params: 'name(표준용어명/키워드)',
    detail: '표준용어사전(term)에서 name 과 정확 일치하는 표준용어({name, abbr, descr})와 유사 후보를 반환한다(읽기 전용). 속성/테이블 명명 전 표준 영문약어 확인용. 데스크탑(사이드카) 전용.' },
  { name: 'register_std_term', kind: 'write', danger: false, run: _agentToolRegisterStdTerm,
    desc: '표준용어사전 등록', params: 'name(표준용어명), abbr(영문약어), descr?, domain_name?',
    detail: '표준용어사전(term)에 새 용어를 등록한다(name·abbr 필수). 이미 있으면 중복 등록하지 않는다. 데스크탑(사이드카) 전용.' },

  // ── 추가 툴 (선택·일괄·분석·내보내기·다이어그램·섹션·메모·버전) ──
  { name: 'get_statistics', kind: 'read', danger: false, run: _agentToolGetStatistics,
    desc: 'ERD 통계 요약', params: '(없음)',
    detail: '엔티티/관계 수·평균 컬럼수·PK 유무·FK 수·고아 테이블·카디널리티 분포를 반환한다(읽기 전용). "ERD 통계/현황 보여줘".' },
  { name: 'get_connected_entities', kind: 'read', danger: false, run: _agentToolGetConnectedEntities,
    desc: '특정 테이블과 연결된 테이블 탐색', params: 'entityId, depth?(direct|all)',
    detail: '기준 엔티티와 직접(direct) 또는 간접 전체(all) 연결된 엔티티를 반환한다(읽기 전용). "USER와 연결된 테이블 모두 찾아줘".' },
  { name: 'detect_orphans', kind: 'read', danger: false, run: _agentToolDetectOrphans,
    desc: '고아(관계 없는) 테이블 탐지', params: '(없음)',
    detail: '어떤 관계에도 연결되지 않은 엔티티를 찾아 반환한다(읽기 전용). "고아 테이블 있나 확인".' },
  { name: 'detect_circular_refs', kind: 'read', danger: false, run: _agentToolDetectCircularRefs,
    desc: '순환 참조 탐지', params: '(없음)',
    detail: '관계 방향(from→to)을 따라 순환(A→B→…→A)을 DFS로 탐지해 경로를 반환한다(읽기 전용). "순환 참조 진단".' },
  { name: 'validate_schema', kind: 'read', danger: false, run: _agentToolValidateSchema,
    desc: '스키마 검증(PK·자료형·네이밍)', params: 'convention?(snake_case|camelCase|PascalCase)',
    detail: 'PK 부재·자료형 누락·네이밍 컨벤션 위반을 점검해 이슈 목록을 반환한다(읽기 전용). "스키마 검증해줘".' },
  { name: 'generate_markdown', kind: 'read', danger: false, run: _agentToolGenerateMarkdown,
    desc: '테이블 정의를 마크다운 텍스트로 생성', params: 'ids?|keyword?, style?(table|list)',
    detail: '대상(또는 전체) 테이블의 컬럼 정의를 마크다운으로 만들어 텍스트로 반환한다(파일 저장 아님, 읽기 전용). "문서용 마크다운 만들어줘".' },
  { name: 'list_notes', kind: 'read', danger: false, run: _agentToolListNotes,
    desc: '캔버스 메모 목록', params: '(없음)',
    detail: '현재 다이어그램의 메모(V1·V2) 목록을 반환한다(읽기 전용).' },
  { name: 'list_snapshots', kind: 'read', danger: false, run: _agentToolListSnapshots,
    desc: '스냅샷 목록', params: '(없음)',
    detail: '저장된 스냅샷(id·이름·시각) 목록을 반환한다(읽기 전용).' },
  { name: 'batch_update_entities', kind: 'write', danger: false, run: _agentToolBatchUpdateEntities,
    desc: '여러 테이블 속성 일괄 수정', params: 'ids?|keyword?, updates{description?,color?,rowCount?}',
    detail: '대상(또는 현재 선택) 테이블들의 설명·색상(color)·예상행수(rowCount)를 일괄 수정한다. color는 blue|green|orange|red|purple|yellow|teal|null.' },
  { name: 'batch_rename_attributes', kind: 'write', danger: false, run: _agentToolBatchRenameAttributes,
    desc: '컬럼명 일괄 변경(패턴/컨벤션)', params: 'ids?, fromPattern→toPattern 또는 convention(snake_case|camelCase|PascalCase|UPPER|lower), target?(physical|logical)',
    detail: '대상 테이블 컬럼명을 패턴 치환 또는 네이밍 컨벤션으로 일괄 변경한다. "FK 컬럼명을 snake_case로 통일".' },
  { name: 'auto_detect_relationships', kind: 'write', danger: false, run: _agentToolAutoDetectRelationships,
    desc: 'FK 컬럼명 패턴으로 관계 자동 감지', params: '(없음)',
    detail: '컬럼명이 <테이블>_ID 패턴이면 해당 부모 테이블과 1:N 관계를 자동 추가한다(기존 관계는 보존). "FK 패턴으로 관계 연결".' },
  { name: 'duplicate_entity', kind: 'write', danger: false, run: _agentToolDuplicateEntity,
    desc: '테이블 복제', params: 'entityId, newLogicalName?, newPhysicalName?',
    detail: '대상 엔티티를 컬럼 포함 복제해 새 id로 추가한다(관계는 복제하지 않음). "이 테이블 복제해줘".' },
  { name: 'select_entities', kind: 'read', danger: false, run: _agentToolSelectEntities,
    desc: '키워드/조건으로 테이블 선택', params: 'ids?|keyword?, includeAttrs?',
    detail: '대상 엔티티를 화면에서 다중 선택한다(후속 정렬·일괄작업·내보내기의 대상 지정). "주문 관련 테이블 선택해줘".' },
  { name: 'highlight_entities', kind: 'read', danger: false, run: _agentToolHighlightEntities,
    desc: '테이블 강조 표시', params: 'ids?|keyword?',
    detail: '대상 엔티티를 선택+포커스로 강조한다. "회원 테이블 강조해줘".' },
  { name: 'focus_entity', kind: 'read', danger: false, run: _agentToolFocusEntity,
    desc: '특정 테이블로 포커스 이동', params: 'entityId, focusMode?(false면 해제)',
    detail: '특정 엔티티에 포커스 배지를 표시한다. "주문 테이블로 이동/포커스".' },
  { name: 'fit_view', kind: 'read', danger: false, run: _agentToolFitView,
    desc: '화면 맞춤/뷰 초기화', params: 'mode?(all|reset)',
    detail: 'all=전체가 보이게 맞춤, reset=줌/위치 초기화. "전체 보이게 맞춰줘".' },
  { name: 'set_view_mode', kind: 'read', danger: false, run: _agentToolSetViewMode,
    desc: '표시 모드 전환(논리/물리·표기·그리드)', params: 'view?(logical|physical), notation?, gridSnap?',
    detail: '논리/물리 표시 전환, 크로우풋 표기·그리드 스냅 토글. "물리명으로 보여줘".' },
  { name: 'align_entities', kind: 'write', danger: false, run: _agentToolAlignEntities,
    desc: '선택 테이블 정렬/균등배분', params: 'direction(left|right|top|bottom|hcenter|vcenter|hdist|vdist), ids?',
    detail: '2개 이상 대상(ids 또는 현재 선택)을 지정 방향으로 정렬하거나 균등 배분한다. "수평 중앙 정렬해줘".' },
  { name: 'create_section', kind: 'write', danger: false, run: _agentToolCreateSection,
    desc: '섹션(그룹 영역) 생성', params: 'name, ids?|keyword?(범위 자동) 또는 x,y,w,h, colorIdx?',
    detail: '엔티티 그룹을 감싸는 섹션을 만든다. ids/keyword를 주면 그 엔티티들을 감싸는 범위로 자동 계산. "이 테이블들을 \'회원관리\' 섹션으로".' },
  { name: 'manage_section', kind: 'write', danger: false, run: _agentToolManageSection,
    desc: '섹션 이름변경/색상/삭제', params: 'sectionId|name, action(rename|recolor|delete), newName?|colorIdx?',
    detail: '기존 섹션을 이름변경·색상변경·삭제한다.' },
  { name: 'add_note', kind: 'write', danger: false, run: _agentToolAddNote,
    desc: '메모 추가', params: 'content, title?, x?, y?, color?, style?(text|markdown)',
    detail: '캔버스에 메모(노트)를 추가한다. "여기에 설명 메모 붙여줘".' },
  { name: 'save_snapshot', kind: 'write', danger: false, run: _agentToolSaveSnapshot,
    desc: '현재 상태 스냅샷 저장', params: 'name?',
    detail: '현재 워크스페이스를 스냅샷으로 저장한다(펜딩 편집을 먼저 반영). "현재를 \'v1.0\'으로 저장".' },
  { name: 'restore_snapshot', kind: 'write', danger: true, run: _agentToolRestoreSnapshot,
    desc: '스냅샷으로 복원', params: 'snapshot(id|name)',
    detail: '되돌리기 주의 — 지정 스냅샷으로 워크스페이스 전체를 교체한다. "2시간 전 저장본으로 복원".' },
  { name: 'create_diagram', kind: 'write', danger: false, run: _agentToolCreateDiagram,
    desc: '새 다이어그램 생성', params: 'name?, entities?, relations?',
    detail: '새 다이어그램 탭을 만들고 전환한다(초기 엔티티/관계 선택 가능). "\'쇼핑몰\' 다이어그램 만들어줘".' },
  { name: 'switch_diagram', kind: 'write', danger: false, run: _agentToolSwitchDiagram,
    desc: '활성 다이어그램 전환', params: 'diagram(id|name)',
    detail: '다른 다이어그램 탭으로 전환한다(펜딩 편집을 현재 탭에 먼저 반영). "\'회원관리\'로 넘어가줘".' },
  { name: 'rename_diagram', kind: 'write', danger: false, run: _agentToolRenameDiagram,
    desc: '다이어그램 이름 변경', params: 'diagram(id|name), newName',
    detail: '다이어그램 이름을 변경한다.' },
  { name: 'delete_diagram', kind: 'write', danger: true, run: _agentToolDeleteDiagram,
    desc: '다이어그램 삭제', params: 'diagram(id|name)',
    detail: '되돌리기 주의 — 다이어그램을 삭제한다(마지막 1개는 불가).' },
  { name: 'set_theme', kind: 'write', danger: false, run: _agentToolSetTheme,
    desc: '테마 변경', params: 'theme(dark|light|frappe|macchiato 등)',
    detail: '앱 테마를 변경한다. "라이트 테마로 바꿔줘".' },
  { name: 'export_diagram', kind: 'read', danger: false, run: _agentToolExportDiagram,
    desc: '다이어그램 내보내기(이미지/SVG/JSON/MD)', params: 'format(png|svg|json|markdown), includeSection?, hiRes?',
    detail: '현재 다이어그램을 지정 포맷으로 내보내기(다운로드/다이얼로그)를 시작한다. 파일 저장은 사용자 상호작용을 동반할 수 있다.' },
  { name: 'import_json', kind: 'write', danger: true, run: _agentToolImportJson,
    desc: 'JSON 스키마 가져오기', params: 'data{entities[],relations[]}, mode?(add|replace)',
    detail: '되돌리기 주의(replace) — JSON 엔티티/관계를 현재 다이어그램에 추가(add)하거나 교체(replace)한다.' },
  { name: 'generate_table_spec', kind: 'read', danger: false, run: _agentToolGenerateTableSpec,
    desc: '테이블 정의서 생성(HTML 새 창, 인쇄/PDF)', params: 'ids?|keyword?, title?',
    detail: '대상(또는 전체) 테이블의 정의서(논리/물리·컬럼·PK/FK·NN·기본값·설명)를 새 창에 인쇄용 HTML 문서로 연다(→ 인쇄/PDF 저장). 좁은 채팅이 아니라 정식 문서. 클라 전용.' },
  { name: 'export_table_spec_xlsx', kind: 'read', danger: false, run: _agentToolExportTableSpecXlsx,
    desc: '테이블 정의서 엑셀(.xlsx) 다운로드', params: 'ids?|keyword?, title?, fileName?',
    detail: '대상(또는 전체) 테이블의 정의서를 엑셀 파일로 생성·다운로드한다(목차+테이블정의서 시트). 사이드카 openpyxl 사용 — 데스크탑 전용.' },
  { name: 'analyze_erd_metrics', kind: 'read', danger: false, run: _agentToolAnalyzeErdMetrics,
    desc: 'ERD 구조 메트릭(허브·결합도·fan-in/out)', params: '(없음)',
    detail: '엔티티별 fan-in/fan-out·degree·허브 테이블·평균 결합도·고립 엔티티를 반환한다(읽기 전용, get_statistics 심화).' },
  { name: 'suggest_normalization', kind: 'read', danger: false, run: _agentToolSuggestNormalization,
    desc: '정규화 위반 + 수정안 제시', params: '(없음)',
    detail: 'PK 없음·반복 컬럼 의심·N:M 관계를 찾아 각각 **수정 권고안**과 함께 반환한다(normalize_check는 진단만, 이건 권고까지).' },
  { name: 'generate_data_dictionary', kind: 'read', danger: false, run: _agentToolGenerateDataDictionary,
    desc: '데이터 사전(컬럼 정의서) HTML 새 창', params: 'ids?|keyword?, title?',
    detail: '대상(또는 전체) 테이블의 전 컬럼을 한 표(테이블·논리/물리·타입·종류·설명)로 묶은 데이터 사전을 새 창에 인쇄용 HTML로 연다. 클라 전용.' },
  { name: 'generate_erd_report', kind: 'read', danger: false, run: _agentToolGenerateErdReport,
    desc: 'ERD 종합 명세서 HTML 새 창', params: 'title?',
    detail: '요약 통계 + 엔티티 목록 + 관계 목록 + 정규화/이슈 진단을 묶은 종합 명세서를 새 창에 인쇄용 HTML로 연다. 클라 전용.' },
  { name: 'generate_term_compliance', kind: 'read', danger: false, run: _agentToolGenerateTermCompliance,
    desc: '표준용어 준수 점검표', params: 'ids?|keyword?, limit?',
    detail: '각 컬럼 논리명의 표준용어 abbr 과 실제 물리명을 대조해 위반·미등록을 보고한다(표준사전 연동, 데스크탑 전용). "표준 안 지킨 컬럼 찾아줘".' },
  { name: 'export_data_dictionary_xlsx', kind: 'read', danger: false, run: _agentToolExportDataDictionaryXlsx,
    desc: '데이터 사전 엑셀(.xlsx) 다운로드', params: 'ids?|keyword?, title?, fileName?',
    detail: '대상(또는 전체) 테이블의 전 컬럼을 엑셀 데이터 사전으로 생성·다운로드한다(사이드카 openpyxl, /export/data-dictionary). 데스크탑 전용.' },
  { name: 'copy_entities_to_diagram', kind: 'write', danger: false, run: _agentToolCopyEntitiesToDiagram,
    desc: '다이어그램 생성+엔티티 복사를 한 번에', params: 'target(대상 다이어그램명), ids?|keyword?|all?, createIfMissing?, activate?',
    detail: '"AA 다이어그램 만들고 (모든) 엔티티 복사" 류는 이 툴 하나로 끝낸다. 대상 다이어그램이 없으면 생성하고(createIfMissing 기본 true), 현재 엔티티를 거기로 복사한 뒤 그 다이어그램으로 전환한다(activate 기본 true). '
            + '중요: create_diagram 을 먼저 부르지 말 것 — 그러면 빈 다이어그램으로 전환돼 복사할 원본 엔티티를 잃는다(이 툴이 생성까지 한다). 또 엔티티 위치(x,y)를 그대로 복사하므로 복사 후 auto_layout(정렬)을 호출하지 말 것 — 재정렬 불필요. '
            + 'ids/keyword 지정 시 그 대상만, 없거나 all:true 면 전체 복사. 복사 집합 내부 관계·FK 참조도 새 id로 이식하며 원본은 유지된다.' },
  { name: 'list_themes', kind: 'read', danger: false, run: _agentToolListThemes,
    desc: '사용 가능한 테마 목록 조회', params: '(없음)',
    detail: '앱이 제공하는 모든 테마(key·이름·활성여부)를 반환한다. set_theme 로 변경하기 전에 어떤 테마가 있는지 모를 때 먼저 조회한다.' },
  { name: 'list_shortcuts', kind: 'read', danger: false, run: _agentToolListShortcuts,
    desc: '키보드 단축키 목록 조회', params: '(없음)',
    detail: '현재 설정된 모든 키보드 단축키(동작 라벨·키 조합)를 반환한다. "단축키 알려줘"·"저장 단축키 뭐야".' },
  { name: 'list_menus', kind: 'read', danger: false, run: _agentToolListMenus,
    desc: '메뉴/기능 정보·사이트맵 조회', params: 'keyword?',
    detail: '앱의 메뉴·명령 목록(라벨·분류·단축키)과 카테고리별 사이트맵을 반환한다(명령 팔레트 레지스트리 기반). keyword 로 좁힌다. "내보내기 메뉴 어디 있어?"·"정규화 기능 있어?" 류 자연어 메뉴 탐색용.' },
  { name: 'manage_column_template', kind: 'write', danger: false, run: _agentToolManageColumnTemplate,
    desc: '컬럼 템플릿 관리(목록·추가·삭제)', params: 'action(list|add|delete), name?, attrs?[{logicalName,physicalName,type}], id?',
    detail: '재사용 컬럼 묶음(감사컬럼 등)을 관리한다. action=add(name+attrs 로 새 템플릿; 같은 이름이면 컬럼 병합), list(전체 조회), delete(id|name). "사용자ID·사용자이름·사용자나이를 \'사용자\' 컬럼 템플릿에 추가" 류. localStorage 저장.' },
  { name: 'save_content', kind: 'read', danger: false, run: _agentToolSaveContent,
    desc: 'LLM 생성 콘텐츠를 파일로 저장(다운로드)', params: 'content(필수), format?(html|md|csv|json|txt|svg|xml|sql), fileName?, title?',
    detail: '모델(너)이 직접 작성한 본문을 그대로 파일로 저장(다운로드)한다. "위 내용을 HTML 보고서로 만들어 저장해줘"처럼 산출물을 파일로 떨궈야 할 때 쓴다 — 완성된 HTML/Markdown/CSV/JSON/텍스트 본문 전체를 content 인자에 담아 전달하면 된다(본문은 네가 만든다, 이 툴은 저장만 한다). 포맷은 format 또는 fileName 확장자로 결정(기본 txt), HTML 단편은 인쇄용 문서로 자동 래핑. 클라 전용(웹·데스크탑 공통). 다른 산출물 툴(generate_table_spec 등)이 다루지 못하는 자유형 문서에 사용.' },
];

// ── 파생(중복 정의 없음) ──────────────────────────────────────────
const AGENT_TOOLS = Object.fromEntries(AGENT_TOOL_DEFS.map(d => [d.name, d.run]));
// 프록시 플래너로 전달되는 카탈로그(실행 함수 제외)
const AGENT_TOOL_CATALOG = AGENT_TOOL_DEFS.map(d => ({
  name: d.name, kind: d.kind, desc: d.desc, params: d.params, danger: d.danger, detail: d.detail,
}));
function _agentToolDef(name) { return AGENT_TOOL_DEFS.find(d => d.name === name) || null; }

// 신규 툴의 친화 스텝 라벨(인자 반영) — v1·v2·v3 StepLabel 의 폴백에서 공유 호출.
// 모르는 툴은 null 반환 → 호출 측이 catalog desc 로 폴백. (서버) 표시는 프록시 툴.
function _agentToolLabel(tool, args) {
  const a = args || {};
  const ids = Array.isArray(a.ids || a.entityIds) ? (a.ids || a.entityIds).join(', ') : (a.ids || a.entityIds || '');
  const sel = a.keyword || a.name || a.query || ids || '';
  const tbl = a.table || a.tableName || '';
  switch (tool) {
    // 선택·뷰
    case 'select_entities': return '테이블 선택' + (sel ? ': ' + sel : '');
    case 'highlight_entities': return '테이블 강조' + (sel ? ': ' + sel : '');
    case 'focus_entity': return '테이블 포커스: ' + (a.entityId || a.id || a.name || '');
    case 'fit_view': return a.mode === 'reset' ? '뷰 초기화' : '전체 화면 맞춤';
    case 'set_view_mode': return '표시 모드 전환' + (a.view ? ': ' + a.view : '');
    case 'align_entities': return '정렬/배분' + (a.direction || a.dir ? ': ' + (a.direction || a.dir) : '');
    // 일괄·관계
    case 'batch_update_entities': return '테이블 일괄 수정' + (sel ? ': ' + sel : '');
    case 'batch_rename_attributes': return '컬럼명 일괄 변경';
    case 'auto_detect_relationships': return 'FK 패턴 관계 자동 감지';
    case 'duplicate_entity': return '테이블 복제: ' + (a.entityId || a.id || a.name || '');
    // 분석
    case 'get_statistics': return 'ERD 통계 조회';
    case 'get_connected_entities': return '연결 테이블 탐색: ' + (a.entityId || a.id || a.name || '');
    case 'detect_orphans': return '고아 테이블 탐지';
    case 'detect_circular_refs': return '순환 참조 탐지';
    case 'validate_schema': return '스키마 검증';
    case 'analyze_erd_metrics': return 'ERD 메트릭 분석';
    case 'suggest_normalization': return '정규화 권고 진단';
    case 'generate_markdown': return '마크다운 생성';
    case 'list_notes': return '메모 목록 조회';
    case 'list_snapshots': return '스냅샷 목록 조회';
    // 섹션·메모
    case 'create_section': return '섹션 생성' + (a.name ? ': ' + a.name : '');
    case 'manage_section': return '섹션 ' + (a.action || '관리') + (a.newName || a.name ? ': ' + (a.newName || a.name) : '');
    case 'add_note': return '메모 추가';
    // 다이어그램·버전
    case 'create_diagram': return '다이어그램 생성' + (a.name ? ': ' + a.name : '');
    case 'switch_diagram': return '다이어그램 전환: ' + (a.diagram || a.diagramId || a.name || '');
    case 'rename_diagram': return '다이어그램 이름변경: ' + (a.newName || '');
    case 'delete_diagram': return '⚠ 다이어그램 삭제: ' + (a.diagram || a.diagramId || a.name || '');
    case 'save_snapshot': return '스냅샷 저장' + (a.name ? ': ' + a.name : '');
    case 'restore_snapshot': return '⚠ 스냅샷 복원: ' + (a.snapshot || a.snapshotId || a.name || '');
    // 테마·입출력·산출물
    case 'set_theme': return '테마 변경: ' + (a.theme || a.name || a.themeName || '');
    case 'export_diagram': return '다이어그램 내보내기' + (a.format ? '(' + a.format + ')' : '');
    case 'import_json': return '⚠ JSON 가져오기' + (a.mode ? '(' + a.mode + ')' : '');
    case 'generate_table_spec': return '테이블 정의서 생성(문서)';
    case 'export_table_spec_xlsx': return '테이블 정의서 엑셀 다운로드';
    case 'generate_data_dictionary': return '데이터 사전 생성(문서)';
    case 'export_data_dictionary_xlsx': return '데이터 사전 엑셀 다운로드';
    case 'generate_erd_report': return 'ERD 종합 명세서 생성(문서)';
    case 'generate_term_compliance': return '표준용어 준수 점검';
    case 'copy_entities_to_diagram': return '엔티티 복사 → ' + (a.target || a.toDiagram || a.diagram || a.name || '다이어그램');
    case 'list_themes': return '테마 목록 조회';
    case 'list_shortcuts': return '단축키 목록 조회';
    case 'list_menus': return '메뉴 정보 조회' + (a.keyword ? ': ' + a.keyword : '');
    case 'manage_column_template': return '컬럼 템플릿 ' + (a.action === 'delete' ? '삭제' : a.action === 'list' ? '목록' : '추가') + (a.name ? ': ' + a.name : '');
    case 'save_content': return '파일로 저장' + (a.fileName ? ': ' + a.fileName : (a.format ? ' (' + a.format + ')' : ''));
    // 프록시 DB (서버)
    case 'get_db_connection_info': return 'DB 접속 정보(서버)';
    case 'list_db_profiles': return 'DB 프로파일 목록(서버)';
    case 'manage_db_profile': return 'DB 프로파일 ' + (a.action === 'delete' ? '삭제' : a.action === 'activate' ? '전환' : a.action === 'update' ? '수정' : '추가') + (a.name ? ': ' + a.name : '') + '(서버)';
    case 'list_db_tables': return 'DB 테이블 목록(서버)';
    case 'describe_db_table': return 'DB 테이블 구조(서버): ' + tbl;
    case 'count_db_rows': return 'DB 행 수 조회(서버): ' + tbl;
    case 'sample_db_rows': return 'DB 데이터 미리보기(서버): ' + tbl;
    case 'get_db_constraints': return 'DB 제약 조회(서버)' + (tbl ? ': ' + tbl : '');
    case 'find_db_column': return 'DB 컬럼 검색(서버): ' + (a.keyword || a.name || a.column || '');
    case 'profile_table': return 'DB 컬럼 프로파일(서버): ' + tbl;
    case 'check_referential_integrity': return 'FK 무결성 점검(서버)';
    case 'measure_cardinality': return '카디널리티 실측(서버): ' + (a.from || '') + ' → ' + (a.to || '');
    case 'find_data_anomalies': return '데이터 이상 탐지(서버)' + (tbl ? ': ' + tbl : '');
    case 'suggest_indexes': return '인덱스 추천(서버)';
    case 'run_select': return 'SELECT 조회(서버)';
    case 'explain_query': return '쿼리 실행계획(서버)';
    case 'compare_erd_to_db': return 'ERD↔운영DB 비교(서버)';
    case 'apply_erd_to_db': return '⚠ ERD를 운영 DB에 반영(서버)';
    default: return null;
  }
}
