# 리버스 엔지니어링 기능 구현 계획

## 요청 요약

미들웨어(http://127.0.0.1:3737)를 통해 연결된 DB의 테이블·뷰를 조회하여 ERD를 자동 생성한다.
- 새 다이어그램 생성 또는 현재 다이어그램 덮어쓰기 선택
- 뷰 테이블은 별도 colorTag(`'teal'`)로 색상 구분
- 뷰 테이블의 DDL(CREATE VIEW …) 정보를 메모장V2(NOTES_V2)로 작성

---

## 탐색한 파일

| 파일 | 역할 |
|------|------|
| `js/state.js` | diagrams 배열 구조, ENTITIES/RELATIONS/NOTES_V2 배열, saveState/loadDiagramIntoWorkspace |
| `js/entities.js` | 엔티티 객체 구조, ENTITIES.push() 패턴, colorTag 사용법 |
| `js/relations.js` | RELATIONS.push() 패턴 (from, to, card 필드) |
| `js/diagrams.js` | createEmptyDiagram(), confirmNewDiag() 패턴, renderDiagramPanel() |
| `js/ui.js` | addNoteV2At() / NOTES_V2 구조, makeNoteV2Id(), renderNoteV2Overlays() |
| `js/db_connect.js` | 미들웨어 연동 패턴: MW_URL, fetch, _mwPing(), _errShow() |
| `js/config.js` | ENTITY_COLOR_PALETTE (id:'teal' → bg:'#0e6878') |
| `js/sql_runner.js` | POST /execute 호출 패턴 참고 |
| `middleware/src/index.js` | 라우터 구조 (/ping, /config, /execute) |
| `middleware/src/routes/execute.js` | POST /execute → adapter.execute(config, sql) |
| `middleware/src/routes/config.js` | loadConfig(), GET /config |
| `middleware/src/db/connector.js` | getAdapter(dbType) |
| `middleware/src/db/adapters/postgres.js` | execute() 반환 { rows, rowCount, fields } |
| `index.html` | 메뉴바 구조, `도구 > Remote > 리버스엔지니어링` 항목 (disabled 상태) |

---

## 발견한 핵심 패턴

### 엔티티 객체 구조 (entities.js:313)
```js
{
  id: 'entity_' + Date.now().toString(36),
  logicalName: '논리명',
  physicalName: 'TB_NAME',
  description: '',
  colorTag: null | 'blue'|'green'|'orange'|'red'|'purple'|'yellow'|'teal',
  rowCount: undefined,
  x: Number, y: Number,
  attrs: [
    {
      logicalName: '', physicalName: 'COL_NM',
      type: 'VARCHAR(50)', kind: 'pk'|'fk'|'normal',
      notNull: false, unique: false, autoIncrement: false,
      defaultValue: '', description: '', ref: null
    }
  ],
  indexes: []
}
```
- **뷰 테이블 색상**: `colorTag: 'teal'` (bg: `#0e6878`, dot: `#89dceb`)
- 뷰임을 추가로 표시할 플래그: `isView: true` 필드 추가 권장 (migrateEntity에서 기본값 false 처리)

### 관계 객체 구조 (relations.js:77)
```js
{ from: 'entity_id', to: 'entity_id', card: '1:N' }
// 선택적: lineStyle, pathStyle, label, color
```

### 새 다이어그램 생성 패턴 (diagrams.js:19-31)
```js
const d = createEmptyDiagram(name);  // state.js:53
flushCurrentState();
diagrams.push(d);
activeDiagramId = d.id;
loadDiagramIntoWorkspace(d);
renderDiagramPanel();
updateZoomLabel();
render();
saveState();
```

### 현재 다이어그램 덮어쓰기 패턴 (state.js:resetToDefault 참고)
```js
const d = getActiveDiagram();
d.entities = [...];
d.relations = [...];
d.notesV2 = [...];
loadDiagramIntoWorkspace(d);
updateZoomLabel();
render();
saveState();
```

### 메모장V2 생성 패턴 (ui.js:795-815)
```js
// makeNoteV2Id()로 ID 생성
const note = {
  id: makeNoteV2Id(),           // 'nv2_' + timestamp + random
  x: Number, y: Number,
  w: NOTE_V2_W,  h: NOTE_V2_H, // 220, 160
  title: '뷰 DDL: VIEW_NAME',
  text: 'CREATE VIEW ... AS ...',
  color: 'ocean',               // NOTE_V2_THEMES 중 선택 (ocean이 뷰에 어울림)
  pinned: false,
  tags: ['VIEW', 'DDL'],
  createdAt: new Date().toISOString()
};
NOTES_V2.push(note);
renderNoteV2Overlays();
saveState();
```

### 미들웨어 연동 패턴 (db_connect.js)
```js
const MW_URL = 'http://127.0.0.1:3737';

// 1. 미들웨어 실행 확인
const running = await _mwPing();  // GET /ping

// 2. DB 설정 확인
const config = await _mwGetConfig();  // GET /config → { configured: true, dbType, ... }

// 3. SQL 실행
const res = await fetch(`${MW_URL}/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: '...' })
});
const data = await res.json();
// data: { ok: true, rows: [...], rowCount: N, fields: [...] }
```

### DB별 테이블·뷰 조회 SQL

**PostgreSQL:**
```sql
-- 테이블 컬럼
SELECT table_name, column_name, data_type, character_maximum_length,
       is_nullable, column_default,
       (SELECT tc.constraint_type FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_name = kcu.table_name
        WHERE kcu.table_name = c.table_name AND kcu.column_name = c.column_name
          AND tc.constraint_type = 'PRIMARY KEY' LIMIT 1) AS constraint_type
FROM information_schema.columns c
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 뷰 목록 + DDL
SELECT table_name AS view_name,
       pg_get_viewdef(table_name::regclass, true) AS view_def
FROM information_schema.views
WHERE table_schema = 'public';

-- FK 관계
SELECT kcu.table_name AS from_table, kcu.column_name AS from_col,
       ccu.table_name AS to_table, ccu.column_name AS to_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
```

**MySQL:**
```sql
-- 테이블 컬럼
SELECT table_name, column_name, column_type, is_nullable,
       column_default, column_key, extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
ORDER BY table_name, ordinal_position;

-- 뷰 목록 + DDL
SELECT table_name AS view_name, view_definition
FROM information_schema.views
WHERE table_schema = DATABASE();

-- FK
SELECT table_name AS from_table, column_name AS from_col,
       referenced_table_name AS to_table, referenced_column_name AS to_col
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL;
```

**SQL Server (MSSQL):**
```sql
-- 테이블 컬럼
SELECT t.name AS table_name, c.name AS column_name,
       tp.name AS data_type, c.max_length, c.is_nullable,
       c.is_identity,
       (SELECT 1 FROM sys.index_columns ic JOIN sys.indexes i ON ic.object_id = i.object_id
        WHERE ic.object_id = c.object_id AND ic.column_id = c.column_id AND i.is_primary_key = 1) AS is_pk
FROM sys.tables t
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.types tp ON c.user_type_id = tp.user_type_id
ORDER BY t.name, c.column_id;

-- 뷰 목록 + DDL
SELECT v.name AS view_name, m.definition AS view_def
FROM sys.views v
JOIN sys.sql_modules m ON v.object_id = m.object_id;

-- FK
SELECT 
  tp.name AS from_table, cp.name AS from_col,
  tr.name AS to_table, cr.name AS to_col
FROM sys.foreign_key_columns fkc
JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id;
```

---

## 영향 분석

- **단축키 변경**: 없음 (새 단축키 불필요 — 메뉴 클릭으로만 접근)
- **새 localStorage 키**: 없음 (기존 `STORAGE_KEY` 내 diagrams/notesV2 구조에 포함됨)
- **미들웨어 신규 라우트**: `GET /reverse-engineering` 추가 필요 (또는 기존 `/execute`를 재사용하는 방식 선택 가능)
- **entity 객체에 `isView` 필드 추가**: `migrateEntity()`에서 기본값(`false`) 처리 필요
- **canvas.js 렌더링**: `isView` 플래그가 있는 엔티티 헤더에 'VIEW' 뱃지 표시 (확인 필요)
- **기타 파급 효과**: DDL 생성(`export.js`)에서 뷰 엔티티 제외 또는 뷰 DDL 출력 여부 (확인 필요)

---

## 구현 계획

### 1. 미들웨어 — `middleware/src/routes/schema.js` (신규)

**위치**: `middleware/src/routes/schema.js` 신규 생성

**변경 내용**:
```
GET /schema/tables  → DB 테이블·컬럼·PK 정보 반환
GET /schema/views   → 뷰 목록 + DDL 반환
GET /schema/fks     → FK 관계 반환
```
DB별 조회 SQL을 내부에 정의하고, `loadConfig()`로 현재 dbType 확인 후 해당 SQL 실행.

반환 형식:
```json
{
  "tables": [
    {
      "tableName": "TB_USER",
      "columns": [
        { "columnName": "USER_ID", "dataType": "VARCHAR(20)", "isPk": true, "isNullable": false, "isIdentity": false, "defaultValue": null }
      ]
    }
  ],
  "views": [
    { "viewName": "V_USER_SUMMARY", "ddl": "CREATE VIEW V_USER_SUMMARY AS ..." }
  ],
  "fks": [
    { "fromTable": "TB_MODEL", "fromCol": "VNDR_ID", "toTable": "TB_VNDR", "toCol": "VNDR_ID" }
  ]
}
```

**이유**: 클라이언트에서 한 번의 fetch로 모든 스키마 정보를 가져와 ERD를 구성하기 위함.

---

### 2. 미들웨어 — `middleware/src/index.js`

**위치**: `app.use('/config', configRouter);` 라인 아래

**변경 내용**: `schemaRouter` 추가
```js
const schemaRouter = require('./routes/schema');
app.use('/schema', schemaRouter);
```

---

### 3. 클라이언트 — `js/reverse_engineer.js` (신규)

**위치**: `E:\04.개발환경\python\98.ETC\SimJaeSugn.github.io\js\reverse_engineer.js` 신규 생성

**주요 함수**:

#### `openReverseEngineerModal()`
- `_mwPing()` 호출 → 미들웨어 미실행 시 기존 `_showMwNotRunning()` 호출
- `_mwGetConfig()` 호출 → 미설정 시 "DB 접속정보를 먼저 설정하세요." 안내
- 모달 렌더링: 새 다이어그램 이름 입력 + "새 다이어그램 생성" / "현재 덮어쓰기" 라디오 버튼

#### `runReverseEngineering(mode)`
- `mode`: `'new'` | `'overwrite'`
- `GET ${MW_URL}/schema/tables` + `GET ${MW_URL}/schema/views` + `GET ${MW_URL}/schema/fks` 호출
- 결과를 `_buildEntitiesFromSchema(tables, views)`, `_buildRelationsFromFks(fks, entityMap)` 로 변환
- `autoLayout('grid')` 방식으로 x/y 좌표 부여 (격자 배치)
- `mode === 'new'` → `createEmptyDiagram(name)` + diagrams.push + activeDiagramId 설정
- `mode === 'overwrite'` → `getActiveDiagram()` 의 entities/relations/notesV2 직접 교체
- 뷰 DDL → NOTES_V2 배열에 추가 (`title: 'VIEW: ' + viewName`, `text: ddl`, `color: 'ocean'`, `tags: ['VIEW', 'DDL']`)
- `loadDiagramIntoWorkspace(d); renderDiagramPanel(); render(); saveState();`

#### `_buildEntitiesFromSchema(tables, views)`
- 테이블 엔티티: `colorTag: null`, `isView: false`
- 뷰 엔티티: `colorTag: 'teal'`, `isView: true`, attrs는 뷰 컬럼 기반
- 격자 배치 좌표: `x = (idx % cols) * (W + 60) + 60`, `y = Math.floor(idx / cols) * 250 + 60`
  (cols는 `Math.ceil(Math.sqrt(tables.length + views.length))`)

#### `_buildRelationsFromFks(fks, entityIdMap)`
- FK 정보를 `{ from: entityId, to: entityId, card: '1:N' }` 형태로 변환
- `entityIdMap`은 `physicalName → entity.id` 매핑 (대소문자 무시)

---

### 4. 클라이언트 — `js/state.js`

**위치**: `migrateEntity(e)` 함수 (176행)

**변경 내용**:
```js
function migrateEntity(e) {
  // ... 기존 코드 ...
  if (e.isView === undefined) e.isView = false;  // ← 추가
  return e;
}
```

**이유**: 구버전 JSON 불러오기 시 isView 필드 누락 방지.

---

### 5. 클라이언트 — `js/canvas.js`

**위치**: 엔티티 헤더 렌더링 부분 (909행 근처, `_ec` 팔레트 조회 이후)

**변경 내용**: `isView` 플래그가 있는 엔티티 헤더에 '[V]' 텍스트 뱃지 표시
```js
// 헤더 우측에 VIEW 뱃지
if (e.isView) {
  ctx.fillStyle = '#89dceb';
  ctx.font = `bold ${Math.max(9, Math.round(10 * scale))}px monospace`;
  ctx.fillText('VIEW', e.x + W - 8, e.y + HEADER_H / 2 + ...);
}
```

**이유**: 뷰 테이블과 일반 테이블을 캔버스에서 시각적으로 구분.

---

### 6. 클라이언트 — `index.html`

**위치**: 118행 (`도구 > Remote > 리버스엔지니어링` disabled 항목)

**변경 내용**:
```html
<!-- 변경 전 -->
<div class="mb-item disabled"><span class="mb-ico">🔄</span><span class="mb-text">리버스엔지니어링</span></div>

<!-- 변경 후 -->
<div class="mb-item" onclick="mbClose();openReverseEngineerModal()"><span class="mb-ico">🔄</span><span class="mb-text">리버스엔지니어링</span></div>
```

**이유**: 기능 활성화 및 함수 연결.

---

### 7. 클라이언트 — `index.html` (script 태그)

**위치**: 다른 `<script src="js/...">` 태그들 근처

**변경 내용**:
```html
<script src="js/reverse_engineer.js"></script>
```

---

## 구현 순서 (우선순위)

1. **미들웨어 `schema.js` 라우트** — 데이터 소스이므로 최우선
2. **미들웨어 `index.js`** — 라우터 등록
3. **`js/reverse_engineer.js`** — 핵심 기능 구현
4. **`js/state.js`** — migrateEntity에 isView 기본값 추가
5. **`index.html`** — 메뉴 활성화 + script 태그
6. **`js/canvas.js`** — VIEW 뱃지 렌더링 (선택적 개선)

---

## 미확인 사항 (확인 필요)

1. **canvas.js 헤더 렌더 정확한 위치**: 909행 전후 코드 구조 확인 필요 (엔티티 헤더 그리기 로직)
2. **DDL export 시 뷰 엔티티 처리**: `export.js`에서 `isView: true` 엔티티를 `CREATE VIEW`로 출력할지, 건너뛸지 정책 결정 필요
3. **뷰 컬럼 조회 지원 여부**: 일부 DB는 뷰 컬럼을 `information_schema.columns`에서 같이 반환하므로 tables SQL로 함께 처리 가능한지 확인 필요 (DB별 차이 있음)
4. **자동 레이아웃 x/y 좌표**: `layout.js`의 `autoLayout()` 직접 호출 여부 vs. 자체 격자 배치 계산 선택
5. **미들웨어 빌드/배포**: `middleware/dist/` 폴더에 빌드된 바이너리가 있는지, schema.js 추가 후 재빌드 필요 여부
