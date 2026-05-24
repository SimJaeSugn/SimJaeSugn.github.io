// ── 다이어그램 상태 ──────────────────────────────────────────────
let diagrams = [];
let activeDiagramId = null;

// ── 실행취소/다시실행 스택 ───────────────────────────────────────
let undoStack = [];
let redoStack = [];

// 현재 작업 배열 (항상 활성 다이어그램 데이터를 담음)
let ENTITIES = [];
let RELATIONS = [];

// ── 섹션 / 메모 ───────────────────────────────────────────────────
let SECTIONS = [];
let NOTES = [];

// ── 보기 모드 ────────────────────────────────────────────────────
let viewMode = 'logical'; // 'logical' | 'physical'

// ── 크로우풋 표기법 ───────────────────────────────────────────────
let notationStyle = 'simple'; // 'simple' | 'crowsfoot'

// ── 그리드 스냅 ──────────────────────────────────────────────────
let gridSnap = false;

// ── 변경 뱃지 ────────────────────────────────────────────────────
let sessionModified = false;

// ── 뷰포트 상태 ──────────────────────────────────────────────────
let vx = 0, vy = 0, scale = 1;

// ── 엔티티 접기 ──────────────────────────────────────────────────
let collapsedEntities = new Set();

function getActiveDiagram() {
  return diagrams.find(d => d.id === activeDiagramId) || diagrams[0];
}

function makeDiagramId() {
  return 'diag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function createDefaultDiagram(name = '기본 ERD') {
  return {
    id: makeDiagramId(), name,
    entities: DEFAULT_ENTITIES.map(e => JSON.parse(JSON.stringify(e))),
    relations: DEFAULT_RELATIONS.map(r => ({ ...r })),
    vx: 40, vy: 40, scale: 1
  };
}

function createEmptyDiagram(name = '새 다이어그램') {
  return { id: makeDiagramId(), name, entities: [], relations: [], vx: 40, vy: 40, scale: 1 };
}

// 현재 작업 배열을 활성 다이어그램 객체로 플러시
function flushCurrentState() {
  const d = getActiveDiagram();
  if (!d) return;
  d.entities = ENTITIES.map(e => JSON.parse(JSON.stringify(e)));
  d.relations = RELATIONS.map(r => JSON.parse(JSON.stringify(r)));
  d.sections  = SECTIONS.map(s => JSON.parse(JSON.stringify(s)));
  d.notes     = NOTES.map(n => JSON.parse(JSON.stringify(n)));
  d.collapsed = [...collapsedEntities];
  d.vx = vx; d.vy = vy; d.scale = scale;
}

function loadDiagramIntoWorkspace(d) {
  ENTITIES.length = 0;  d.entities.forEach(e => ENTITIES.push(JSON.parse(JSON.stringify(e))));
  RELATIONS.length = 0; d.relations.forEach(r => RELATIONS.push(JSON.parse(JSON.stringify(r))));
  SECTIONS.length = 0;  (d.sections || []).forEach(s => SECTIONS.push(JSON.parse(JSON.stringify(s))));
  NOTES.length = 0;     (d.notes    || []).forEach(n => NOTES.push(JSON.parse(JSON.stringify(n))));
  collapsedEntities = new Set(d.collapsed || []);
  selectedSection = null; selectedSections = new Set();
  vx = d.vx ?? 40; vy = d.vy ?? 40; scale = d.scale ?? 1;
  renderEntityTree();
}

function saveState() {
  flushCurrentState();
  const snapshot = JSON.stringify({ diagrams, activeDiagramId, viewMode, notationStyle, gridSnap });
  // 직전 상태와 동일하면 undo 스택에 추가하지 않음
  if (undoStack.length && undoStack[undoStack.length - 1] === snapshot) return;
  sessionModified = true;
  const badge = document.getElementById('sessionBadge');
  if (badge) badge.style.display = 'inline';
  undoStack.push(snapshot);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];
  try {
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch {}
}

function undo() {
  if (document.querySelector('.modal-overlay.active')) return;
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const prev = undoStack[undoStack.length - 1];
  if (!prev) return;
  try {
    const s = JSON.parse(prev);
    restoreFromSnapshot(s);
    try { localStorage.setItem(STORAGE_KEY, prev); } catch {}
  } catch {}
}

function redo() {
  if (document.querySelector('.modal-overlay.active')) return;
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(next);
  try {
    const s = JSON.parse(next);
    restoreFromSnapshot(s);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  } catch {}
}

function restoreFromSnapshot(s) {
  if (!Array.isArray(s.diagrams) || !s.diagrams.length) return;
  // 뷰포트는 undo/redo 대상에서 제외 — 현재 값을 그대로 유지
  const curVx = vx, curVy = vy, curScale = scale;
  diagrams = s.diagrams.map(d => { d.entities = (d.entities || []).map(migrateEntity); return d; });
  if (s.viewMode) viewMode = s.viewMode;
  if (s.notationStyle) { notationStyle = s.notationStyle; }
  if (typeof s.gridSnap !== 'undefined') { gridSnap = s.gridSnap; }
  syncToolDropdownLabels();
  activeDiagramId = s.activeDiagramId && diagrams.find(d => d.id === s.activeDiagramId)
    ? s.activeDiagramId : diagrams[0].id;
  loadDiagramIntoWorkspace(getActiveDiagram());
  vx = curVx; vy = curVy; scale = curScale;
  const active = getActiveDiagram();
  if (active) { active.vx = curVx; active.vy = curVy; active.scale = curScale; }
  renderDiagramPanel();
  updateZoomLabel();
  render();
  setViewMode(viewMode);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    // v1 호환: entities 배열이 최상위에 있는 경우
    if (Array.isArray(s.entities) && !Array.isArray(s.diagrams)) {
      const d = createDefaultDiagram('불러온 ERD');
      d.entities = s.entities.map(migrateEntity); d.relations = s.relations || [];
      if (s.vx != null) d.vx = s.vx;
      if (s.vy != null) d.vy = s.vy;
      if (s.scale != null) d.scale = s.scale;
      diagrams = [d]; activeDiagramId = d.id;
      loadDiagramIntoWorkspace(d);
      return true;
    }
    if (!Array.isArray(s.diagrams) || !s.diagrams.length) return false;
    diagrams = s.diagrams.map(d => { d.entities = (d.entities || []).map(migrateEntity); return d; });
    if (s.viewMode) { viewMode = s.viewMode; }
    if (s.notationStyle) notationStyle = s.notationStyle;
    if (typeof s.gridSnap !== 'undefined') gridSnap = s.gridSnap;
    activeDiagramId = s.activeDiagramId && diagrams.find(d => d.id === s.activeDiagramId)
      ? s.activeDiagramId : diagrams[0].id;
    loadDiagramIntoWorkspace(getActiveDiagram());
    undoStack = []; redoStack = [];
    return true;
  } catch {}
  return false;
}

// 구버전 데이터 → 새 구조 변환
function migrateEntity(e) {
  if (!e.logicalName && !e.physicalName) {
    // name이 한글이면 논리명, 영문 대문자면 물리명으로 추론
    const isKorean = /[가-힣]/.test(e.name || '');
    e.logicalName  = isKorean ? (e.name || '') : '';
    e.physicalName = isKorean ? '' : (e.name || '');
  }
  if (!e.description) e.description = '';
  if (!e.indexes) e.indexes = [];
  e.attrs = (e.attrs || []).map(a => migrateAttr(a));
  return e;
}
function migrateAttr(a) {
  if (!a.logicalName && !a.physicalName) {
    const isKorean = /[가-힣]/.test(a.name || '');
    a.logicalName  = isKorean ? (a.name || '') : '';
    a.physicalName = isKorean ? '' : (a.name || '');
  }
  if (!a.description) a.description = '';
  if (a.ref === undefined) a.ref = null;
  if (a.notNull === undefined) a.notNull = false;
  if (a.unique === undefined) a.unique = false;
  if (a.autoIncrement === undefined) a.autoIncrement = false;
  if (!a.defaultValue) a.defaultValue = '';
  return a;
}

function entDisplayName(e) {
  return viewMode === 'logical'
    ? (e.logicalName || e.physicalName || e.id)
    : (e.physicalName || e.logicalName || e.id);
}
function attrDisplayName(a) {
  return viewMode === 'logical'
    ? (a.logicalName || a.physicalName || '')
    : (a.physicalName || a.logicalName || '');
}

function setViewMode(mode) {
  viewMode = mode;
  renderEntityTree();
  render();
  syncToolDropdownLabels();
}

function resetToDefault() {
  askConfirm('현재 다이어그램을 기본 데이터로 초기화합니다.', () => {
    const d = getActiveDiagram();
    d.entities = DEFAULT_ENTITIES.map(e => JSON.parse(JSON.stringify(e)));
    d.relations = DEFAULT_RELATIONS.map(r => ({ ...r }));
    d.sections  = [];
    d.vx = 40; d.vy = 40; d.scale = 1;
    loadDiagramIntoWorkspace(d);
    updateZoomLabel();
    render();
    saveState();
  }, '초기화');
}
