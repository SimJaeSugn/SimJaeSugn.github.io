# 통합 검사 보고서 — UXERManager 리버스 엔지니어링 기능

검사일: 2026-05-27  
검사자: 통합 검사 에이전트  

---

## 1. 단축키 동기화 [최우선]

### 검사 결과: PASS

**근거:**
- `shortcuts.js`의 `SC_DEFAULTS` 객체: `addEnt`, `addRel`, `fitAll`, `undo`, `redo`, `save`, `saveAll`, `search`, `copy`, `paste`, `dup`, `selAll`, `del` — 총 13개. 리버스 엔지니어링 관련 단축키 없음.
- `main.js` keydown 핸들러: `matchSC()` 호출 목록이 SC_DEFAULTS와 1:1 대응. 신규 `matchSC` 호출 없음.
- `index.html #shortcutsTableBody`: `data-sc-id` 속성이 있는 `.sc-row`가 SC_DEFAULTS 키와 일치. 리버스 엔지니어링 행 없음 (메뉴 진입점은 `openReverseEngineerModal()` 클릭으로만).
- 결론: 단축키 추가 없음, 3개 위치 완전 일치. 수정 불필요.

---

## 2. 백업 통합 [최우선]

### 검사 결과: PASS

**근거:**
- `isView` 필드는 엔티티 객체 내부 필드 (`entity.isView`). `saveState()`는 `diagrams` 배열 전체를 JSON.stringify하므로 isView 자동 직렬화.
- `ui.js`의 `_BK_GROUPS` 배열: `diagrams`, `snapshots`, `templates`, `uiSettings`, `aiKey` 5개 그룹. isView를 위한 신규 최상위 localStorage 키 없음 → `_BK_GROUPS` 변경 불필요. 확인 완료.
- `export.js`: `_doExportWithGroups`에서 `diagrams` 그룹 선택 시 `data.main = { diagrams, ... }`로 직렬화 → isView 자동 포함.
- `import.js`: `_doImportWithGroups`에서 diagrams 복원 시 `migrateEntity()`를 통과 → isView 기본값 보장.
- 신규 최상위 localStorage 키 없음. 확인 완료.

---

## 3. 상태 저장/로드 일관성

### 검사 결과: PASS

**근거 (js/state.js 직접 확인):**
```js
function migrateEntity(e) {
  // ...
  if (e.isView === undefined) e.isView = false;  // ← 정상 추가됨 (line 185)
  e.attrs = (e.attrs || []).map(a => migrateAttr(a));
  return e;
}
```
- `loadState()` 내 3개 경로 모두 `migrateEntity()` 통과:
  1. v1 호환 경로 (line 153): `d.entities = s.entities.map(migrateEntity)`
  2. diagrams 배열 경로 (line 162): `d.entities = (d.entities || []).map(migrateEntity)`
  3. `restoreFromSnapshot()` (line 128): `d.entities = (d.entities || []).map(migrateEntity)`
- `saveState()`는 별도 처리 불필요 (isView가 엔티티 객체 내부에 있으므로 자동 저장).
- 수정 불필요.

---

## 4. 렌더링 연동

### 검사 결과: PASS

**근거 (js/canvas.js 직접 확인):**
```js
function drawEntity(e) {
  // ...헤더 렌더링 후...
  // ── VIEW 뱃지 (헤더 좌상단) ──  (line 919)
  if (e.isView) {
    ctx.save();
    ctx.font = 'bold 9px Segoe UI';
    ctx.roundRect ? ctx.roundRect(x + 4, y + 3, 28, 13, 3) : ctx.rect(x + 4, y + 3, 28, 13);
    ctx.fill();
    ctx.fillStyle = '#89dceb';
    ctx.fillText('VIEW', x + 6, y + 5);
    ctx.restore();
  }
  // ...
}
```
- `render()` 함수 내부: `ENTITIES.forEach(drawEntity)` (line 1765) → drawEntity가 render 사이클에 자동 포함됨.
- `js/reverse_engineer.js`에서 ERD 생성 완료 후 `render()` 명시적 호출 확인 (line 135, 144).
- 접힌 엔티티(isCollapsed) 경로에서도 `drawEntity` 내 VIEW 뱃지 코드가 접히기 전 헤더 영역에서 실행됨 (isCollapsed 분기 전에 배치됨, line 919 vs return at line 982).

**잠재적 이슈 확인:** VIEW 뱃지(좌상단)와 볼륨 레이블(우상단)이 동일한 위치(x+4, y+3)를 사용하는 것처럼 보이나, 볼륨 레이블은 우측 정렬(`x + 4`는 왼쪽이지만 볼륨은 `x + 7`, 텍스트가 짧음)이므로 실제로는 겹치지 않음. 양쪽 모두 isView=true AND rowCount가 있는 엔티티에서 동시 표시 가능하나 기능상 문제없음.

---

## 5. 구현 코드 실제 확인

### 5-1. js/reverse_engineer.js

**상태: PASS**

| 항목 | 확인 내용 |
|------|----------|
| `openReverseEngineerModal()` | `_mwPing()` → `_mwGetConfig()` 순서로 사전 검증 후 모달 진입 |
| `runReverseEngineering()` | `fetch(${MW_URL}/schema)` — 30초 타임아웃 |
| 응답 구조 | `{ tables, views, fks }` 구조분해 |
| 새 다이어그램 모드 | `createEmptyDiagram()` → `loadDiagramIntoWorkspace()` → `render()` → `saveState()` |
| 덮어쓰기 모드 | `getActiveDiagram()` → `loadDiagramIntoWorkspace()` → `render()` → `saveState()` |
| `_buildEntitiesFromSchema()` | `isView: false` (tables), `isView: true` (views), `colorTag: 'teal'` (views) |
| `makeNoteV2Id()` | `ui.js` line 791에 정의됨 — `reverse_engineer.js` 로드 전 `ui.js`가 먼저 로드됨(line 967 vs 981) → 의존성 충족 |
| `createEmptyDiagram()` | `state.js` line 53에 정의 — `reverse_engineer.js` 로드 전 `state.js`(line 959) 먼저 로드 → 의존성 충족 |
| `_mwPing`, `_mwGetConfig`, `_showMwNotRunning`, `MW_URL` | `db_connect.js` line 6, 112, 121, 131에 정의 — `reverse_engineer.js` 로드 전 `db_connect.js`(line 980) 먼저 로드 → 의존성 충족 |

### 5-2. middleware/src/routes/schema.js

**상태: PASS**

| 항목 | 확인 내용 |
|------|----------|
| GET `/` 라우터 | `router.get('/', ...)` — `/schema`로 마운트됨 → 클라이언트의 `fetch(${MW_URL}/schema)` 와 일치 |
| DB 타입 지원 | `postgres`, `mysql`, `mssql` 3종 |
| 응답 구조 | `{ tables, views, fks }` — 클라이언트 구조분해와 일치 |
| `views` 배열 | `{ viewName, columns, ddl }` — `_buildEntitiesFromSchema()`의 `v.viewName`, `v.columns`, `_buildViewNotes()`의 `v.ddl` 참조와 일치 |
| `tables` 배열 | `{ tableName, columns }` — `_buildEntitiesFromSchema()`의 `t.tableName`, `t.columns` 참조와 일치 |
| `fks` 배열 | `{ fromTable, fromCol, toTable, toCol }` — `_buildRelationsFromFks()`의 `fk.fromTable`, `fk.toTable` 참조와 일치 |
| 에러 처리 | config 없을 때 400, DB 오류 시 400 |

### 5-3. middleware/src/index.js

**상태: PASS**

```js
const schemaRouter = require('./routes/schema');   // line 5
app.use('/schema', schemaRouter);                  // line 38
```
`schemaRouter` 정상 등록 확인.

### 5-4. js/state.js — migrateEntity()

**상태: PASS**

line 185: `if (e.isView === undefined) e.isView = false;` 정상 추가됨.

### 5-5. js/canvas.js — drawEntity/VIEW 뱃지

**상태: PASS**

line 919-932: VIEW 뱃지 코드 정상 구현. `render()` 사이클의 `ENTITIES.forEach(drawEntity)` (line 1765)에 자동 포함.

### 5-6. index.html — 메뉴 항목 및 script 태그

**상태: PASS**

- 메뉴 항목 (line 118): `onclick="mbClose();openReverseEngineerModal()"` — Remote 그룹 하단에 위치
- script 태그 (line 981): `<script src="js/reverse_engineer.js"></script>` — `db_connect.js`(980) 다음, `main.js`(982) 이전으로 적절한 순서

---

## 누락/수정 사항

**수정된 항목: 없음**

모든 검사 항목이 구현 코드에서 정상 확인됨. 직접 수정이 필요한 누락 사항 없음.

---

## 최종 상태: PASS

| 검사 항목 | 결과 |
|----------|------|
| 1. 단축키 동기화 | PASS — 신규 단축키 없음, 3개 위치 일치 |
| 2. 백업 통합 | PASS — isView 자동 직렬화, _BK_GROUPS 변경 불필요 |
| 3. 상태 저장/로드 일관성 | PASS — migrateEntity()에 isView 기본값 정상 추가 |
| 4. 렌더링 연동 | PASS — drawEntity()가 render() 사이클에 자동 포함 |
| 5. 구현 코드 실제 확인 | PASS — 모든 의존성, API 계약, 로드 순서 정상 |
