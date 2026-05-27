## 요청 요약

미들웨어 리버스 엔지니어링 기능의 7개 개선 항목을 구현한다.
주요 변경 대상은 `js/reverse_engineer.js`(프론트엔드 ERD 생성 로직)와
`middleware/src/routes/schema.js`(DB 스키마 조회 API)이며,
`middleware/src/routes/config.js`에는 PostgreSQL schema 파라미터 추가가 필요하다.
미들웨어 변경 후 `middleware/README.md`도 반드시 갱신한다.

---

## 탐색한 파일

- `js/reverse_engineer.js`: 리버스 엔지니어링 전체 프론트엔드 로직
- `middleware/src/routes/schema.js`: GET /schema 구현, 4개 DB 쿼리 상수 및 buildResult 포함
- `middleware/src/routes/config.js`: 프로파일 CRUD, loadConfig 구현. schema 필드는 현재 없음
- `middleware/src/routes/execute.js`: 라우터 등록 패턴 참고 (router.get/post, loadConfig 호출 방식)
- `middleware/src/index.js`: 라우터 마운트 확인 (`app.use('/schema', schemaRouter)`)
- `middleware/README.md`: API 레퍼런스 문서 (변경 시 갱신 대상)

---

## 영향 분석

- 단축키 변경: 없음
- 새 localStorage 키: 없음
- 새 데이터 배열/상태 변수: 없음 (reverse_engineer.js 내 함수 지역 변수만 변경)
- 새 API 엔드포인트: `GET /schema/tables` 추가 (6-2)
- 미들웨어 쿼리 변경: schema.js 쿼리 상수 4개 DB 모두 변경 (6-4, 6-5, 6-6, 6-7)
- config.js 프로파일 구조 변경: schema 선택 필드 추가 (6-6). PUT/POST/프로파일 추가 엔드포인트 모두 영향
- README 갱신: GET /schema 응답 구조(isUnique, isAutoIncrement 필드 추가), GET /schema/tables 신규 엔드포인트, POST /config/profiles schema 필드 추가 반영 필요
- 기타 파급 효과:
  - 6-2(테이블 선택)는 `runReverseEngineering` 함수 흐름을 2단계로 전환하므로 모달 HTML도 수정됨
  - 6-3(위치 보존)은 overwrite 분기 코드에만 영향
  - buildResult 반환 구조에 isUnique/isAutoIncrement 추가 시, 기존 클라이언트와 하위 호환 유지 가능 (undefined → false fallback)

---

## 구현 계획

---

### 항목 6-1: 엔티티 배치 겹침 수정

**파일: `js/reverse_engineer.js`**

**위치:** `_buildEntitiesFromSchema` 함수 (line 170-222)

**변경 내용:**

1. 상수 `COL_H = 200` 제거. 대신 행별 최대 높이를 누적하는 `rowMaxH` 배열과 `rowOffsets` 배열 도입.
2. 각 엔티티의 실제 높이: `headerH(50) + columns.length * 28 + paddingH(20)`.
3. `rowOffsets[0] = OFFSET_Y`. 이후 `rowOffsets[r+1] = rowOffsets[r] + rowMaxH[r] + GAP_Y(30)`.
4. `forEach` 루프에서 `y: OFFSET_X + row * COL_H` → `y: rowOffsets[row]` 로 교체.
5. `rowMaxH` 계산을 위해 2-pass 또는 단일 pass 방식 선택:
   - **단일 pass (권장)**: `rowMaxH` 배열을 먼저 all 배열에서 행별 max 높이로 채운 뒤, `rowOffsets`를 누적 계산. 그 후 엔티티 생성 루프 실행.

**상세 구현:**

```
const HEADER_H = 50;
const COL_ROW_H = 28;
const PADDING_H = 20;
const GAP_Y = 30;
const COL_W = 240;
const GAP_X = 30;
const COLS = 5;
const OFFSET_X = 60;
const OFFSET_Y = 60;

// 1-pass: 행별 최대 높이 계산
const rowCount = Math.ceil(all.length / COLS);
const rowMaxH = Array(rowCount).fill(0);
all.forEach((tbl, idx) => {
  const row = Math.floor(idx / COLS);
  const h = HEADER_H + (tbl.columns || []).length * COL_ROW_H + PADDING_H;
  if (h > rowMaxH[row]) rowMaxH[row] = h;
});

// rowOffsets 누적
const rowOffsets = [OFFSET_Y];
for (let r = 0; r < rowCount - 1; r++) {
  rowOffsets.push(rowOffsets[r] + rowMaxH[r] + GAP_Y);
}

// 엔티티 생성 루프에서:
x: OFFSET_X + col * (COL_W + GAP_X),
y: rowOffsets[row],
```

---

### 항목 6-2: 테이블 선택 기능 (2단계 UI)

**파일 A: `middleware/src/routes/schema.js`**

**위치:** 기존 `router.get('/')` 아래 (line 220 이후)에 새 라우트 추가.

**변경 내용:**

`GET /schema/tables` 라우트 추가. 각 DB별로 테이블·뷰 이름만 빠르게 조회하는 경량 쿼리 추가.

```javascript
// 각 DB별 테이블·뷰 이름 목록 쿼리
const PG_TABLES_LIST = `
SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM information_schema.tables
WHERE table_schema = $1
ORDER BY table_type DESC, table_name
`;

const MY_TABLES_LIST = `
SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_type DESC, table_name
`;

const MS_TABLES_LIST = `
SELECT name,
       CASE WHEN type_desc = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM (
  SELECT name, 'TABLE' AS type_desc FROM sys.tables
  UNION ALL
  SELECT name, 'VIEW' AS type_desc FROM sys.views
) t ORDER BY type_desc DESC, name
`;

const ORA_TABLES_LIST = `
SELECT table_name AS name, 'table' AS type FROM user_tables
UNION ALL
SELECT view_name AS name, 'view' AS type FROM user_views
ORDER BY type DESC, name
`;

router.get('/tables', async (req, res) => {
  const config = loadConfig();
  if (!config) return res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });
  try {
    const adapter = getAdapter(config.dbType);
    let query, params = [];
    switch (config.dbType) {
      case 'postgres':
        query = PG_TABLES_LIST;
        params = [config.schema || 'public'];
        break;
      case 'mysql':   query = MY_TABLES_LIST; break;
      case 'mssql':   query = MS_TABLES_LIST; break;
      case 'oracle':  query = ORA_TABLES_LIST; break;
      default: throw new Error(`지원하지 않는 DB 타입: ${config.dbType}`);
    }
    const result = await adapter.execute(config, query, params);
    const items = (result.rows || []).map(r => { const row = norm(r); return { name: s(row.name), type: s(row.type) }; });
    res.json({ items });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

`GET /schema` 에 `?tables=t1,t2` 쿼리파라미터 지원 추가:
- `router.get('/')` 에서 `req.query.tables` 파싱
- 비어있으면 기존 동작 유지
- 있으면 각 DB별로 `WHERE table_name IN (...)` 조건을 동적으로 추가하여 컬럼 쿼리 필터링

구체적으로 `router.get('/')` 수정:
```javascript
router.get('/', async (req, res) => {
  const config = loadConfig();
  if (!config) return res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });

  const filterTables = req.query.tables
    ? req.query.tables.split(',').map(t => t.trim()).filter(Boolean)
    : null;

  try {
    const queries = getQueries(config.dbType, config.schema || 'public', filterTables);
    // ... 기존 동일
  }
});
```

`getQueries`에 `schema`와 `filterTables` 파라미터를 추가하고, 각 쿼리 상수를 파라미터 바인딩 방식으로 동적 생성하도록 변경 (6-6 항목과 통합 구현).

**파일 B: `js/reverse_engineer.js`**

**위치:** `_renderReverseEngineerModal` 함수, `runReverseEngineering` 함수, `openReverseEngineerModal` 함수.

**변경 내용: 2단계 흐름 구현**

모달에 테이블 선택 영역 추가:
- 1단계: 초기 모달 — "ERD 생성" 버튼 클릭 시 `/schema/tables` 호출 → 체크리스트 UI로 교체
- 2단계: 테이블 선택 후 "ERD 생성 (선택)" 버튼 → 선택된 테이블 목록을 `?tables=` 파라미터로 전달

모달 내 추가 UI 요소:
- `#reTableList` div: 테이블 체크리스트 (초기 숨김)
- `#reSelectAllBtn`: 전체 선택/해제
- `#reRunBtn` 텍스트를 단계에 따라 변경

흐름:
```
openReverseEngineerModal()
  → 기존 설정 확인 후 모달 표시 (1단계: 설정 선택만)

runReverseEngineering() - 1단계
  → /schema/tables 호출
  → 성공 시 체크리스트 표시, 버튼을 "선택한 테이블로 ERD 생성"으로 변경
  → step 변수 = 2

runReverseEngineering() - 2단계
  → 선택된 테이블 목록 수집
  → /schema?tables=t1,t2,... 호출
  → 기존 ERD 생성 로직 실행
```

구현 전략: `_reverseEngineerStep` 전역(모듈) 변수로 현재 단계 추적, 또는 버튼의 data-step 속성 활용.

---

### 항목 6-3: 덮어쓰기 시 기존 엔티티 위치 보존

**파일: `js/reverse_engineer.js`**

**위치:** `runReverseEngineering` 함수 내 `mode === 'overwrite'` 분기 (line 146-155)

**변경 내용:**

```javascript
} else {
  const d = getActiveDiagram();

  // 기존 엔티티 위치 맵 구성 (physicalName → {x, y})
  const posMap = {};
  (d.entities || []).forEach(e => {
    posMap[e.physicalName] = { x: e.x, y: e.y };
  });

  // 새 엔티티에 기존 위치 적용
  entities.forEach(e => {
    if (posMap[e.physicalName]) {
      e.x = posMap[e.physicalName].x;
      e.y = posMap[e.physicalName].y;
    }
  });

  d.entities = entities;
  d.relations = relations;
  // ... 이하 동일
}
```

대소문자 처리 주의: `toUpper` 옵션이 켜져 있으면 기존 physicalName도 대문자일 수 있으므로, 비교 시 `posMap`의 키를 `toUpper`와 동일한 변환 적용. 단, 현재 기존 엔티티는 이전 리버스 엔지니어링으로 생성되었으므로 toUpper 상태가 동일하다고 가정 가능. 안전하게 `posMap` 키를 소문자로 정규화하여 비교하는 방식 적용:

```javascript
const posMap = {};
(d.entities || []).forEach(e => {
  posMap[e.physicalName.toLowerCase()] = { x: e.x, y: e.y };
});
entities.forEach(e => {
  const key = e.physicalName.toLowerCase();
  if (posMap[key]) { e.x = posMap[key].x; e.y = posMap[key].y; }
});
```

---

### 항목 6-4: FK 카디널리티 동적 설정

**파일 A: `middleware/src/routes/schema.js`**

**위치:** 각 DB별 쿼리 상수 및 `buildResult` 함수

**변경 내용:**

각 DB별 UNIQUE 컬럼 조회 쿼리 추가:

```
PG_UNIQUE: information_schema.table_constraints + key_column_usage WHERE constraint_type = 'UNIQUE'
MY_UNIQUE: information_schema.statistics WHERE non_unique = 0 AND index_name != 'PRIMARY'
MS_UNIQUE: sys.indexes JOIN sys.index_columns WHERE is_unique = 1 AND is_primary_key = 0
ORA_UNIQUE: user_constraints + user_cons_columns WHERE constraint_type = 'U'
```

`buildResult`에 `uniqueRows` 파라미터 추가 및 unique 컬럼 Set 구성:
```javascript
const uniqueSet = new Set(); // "tableName.columnName"
for (const raw of uniqueRows) {
  const r = norm(raw);
  uniqueSet.add(`${s(r.table_name)}.${s(r.column_name)}`);
}
```

`router.get('/')` 에서 unique 쿼리도 병렬 조회.

**파일 B: `js/reverse_engineer.js`**

**위치:** `_buildRelationsFromFks` 함수 (line 225-235)

**변경 내용:**

`entityIdMap` 외에 `uniqueColSet` 파라미터 추가:
```javascript
function _buildRelationsFromFks(fks, entityIdMap, uniqueColSet = new Set()) {
  for (const fk of fks) {
    const card = uniqueColSet.has(`${fk.fromTable}.${fk.fromCol}`) ? '1:1' : '1:N';
    relations.push({ from, to, card });
  }
}
```

`runReverseEngineering` 에서 schema 응답에 `uniqueCols` 배열을 받아 Set으로 변환 후 전달.

---

### 항목 6-5: UNIQUE·AUTO_INCREMENT 정보 추출

**파일 A: `middleware/src/routes/schema.js`**

**위치:** 각 DB별 컬럼 쿼리 상수 및 `buildResult`

**변경 내용:**

각 DB 컬럼 쿼리에 `is_unique`, `is_auto_increment` 컬럼 추가:

- **MySQL (`MY_COLUMNS`):**
  ```sql
  IF(c.column_key IN ('UNI'), true, false) AS is_unique,
  IF(c.extra = 'auto_increment', true, false) AS is_auto_increment
  ```

- **PostgreSQL (`PG_COLUMNS`):**
  `is_auto_increment`: `c.column_default LIKE 'nextval%'` 조건으로 판별
  `is_unique`: 6-4에서 별도 uniqueSet으로 처리하거나 서브쿼리로 inline 처리.
  inline 방식:
  ```sql
  CASE WHEN c.column_default LIKE 'nextval%' THEN true ELSE false END AS is_auto_increment,
  CASE WHEN uq.column_name IS NOT NULL THEN true ELSE false END AS is_unique
  ```
  LEFT JOIN으로 unique 인덱스 조인 추가.

- **MSSQL (`MS_COLUMNS`):**
  ```sql
  c.is_identity AS is_auto_increment,
  CASE WHEN uq.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_unique
  ```
  LEFT JOIN으로 unique 인덱스 조인 추가.

- **Oracle (`ORA_COLUMNS`):**
  ```sql
  CASE WHEN c.identity_column = 'YES' THEN 1 ELSE 0 END AS is_auto_increment,
  CASE WHEN uq.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_unique
  ```
  user_constraints + user_cons_columns LEFT JOIN 추가.

`buildResult`의 `columns.push(...)` 에 필드 추가:
```javascript
isUnique:        !!row.is_unique,
isAutoIncrement: !!row.is_auto_increment,
```

**파일 B: `js/reverse_engineer.js`**

**위치:** `_buildEntitiesFromSchema` 함수 내 `attrs` 맵 (line 191-202)

**변경 내용:**
```javascript
unique:        c.isUnique        ?? false,
autoIncrement: c.isAutoIncrement ?? false,
```

현재 `false` 하드코딩을 위 코드로 교체.

---

### 항목 6-6: PostgreSQL 스키마 파라미터화

**파일 A: `middleware/src/routes/config.js`**

**위치:** `POST /config` (line 116-149), `POST /config/profiles` (line 180-208), `PUT /config/profiles/:name` (line 234-265)

**변경 내용:**

각 엔드포인트의 구조 분해 및 저장 객체에 `schema` 선택 필드 추가.

`POST /config` — `router.post('/')`:
```javascript
const { dbType, host, port, database, username, password, schema } = req.body;
const updated = {
  ...
  schema: schema || undefined,   // postgres 전용, 없으면 저장 안 함
  ...
};
```

`POST /config/profiles`, `PUT /config/profiles/:name` 동일하게 `schema` 필드 수용.

`GET /config` 응답에 `schema` 포함 (dbType이 postgres이고 schema가 있는 경우):
```javascript
res.json({
  configured: true,
  dbType: config.dbType,
  ...,
  ...(config.schema ? { schema: config.schema } : {})
});
```

**파일 B: `middleware/src/routes/schema.js`**

**위치:** `PG_COLUMNS`, `PG_VIEWS`, `PG_FKS` 상수 및 `getQueries` 함수, `router.get('/')`

**변경 내용:**

`PG_COLUMNS`, `PG_VIEWS`, `PG_FKS`에서 `'public'` 하드코딩을 파라미터로 교체.

전략: 쿼리 상수를 그대로 두되 `getQueries`를 함수로 전환하여 schema 값을 받아 쿼리 문자열 내 `'public'`을 치환하거나, 파라미터 바인딩($1) 방식 사용.

**파라미터 바인딩 방식 (권장, SQL Injection 방지):**

`PG_COLUMNS`, `PG_VIEWS`, `PG_FKS`에서 `'public'` → `$1` 교체.
`adapter.execute` 호출 시 params 배열 `[schemaName]` 전달.

단, 현재 `adapter.execute(config, query)` 시그니처에 params 지원 여부 확인 필요.

→ **확인 필요**: `middleware/src/db/adapters/postgres.js`의 `execute` 함수가 파라미터 배열을 지원하는지 확인. 지원하지 않으면 문자열 치환 방식 사용 (입력값을 알파뉴메릭 + `_` + `.`만 허용하는 화이트리스트로 검증 후 치환).

현재 `MY_COLUMNS`, `ORA_COLUMNS` 등은 파라미터 미사용. PostgreSQL만 파라미터 변경이므로 getQueries 반환값에 `params` 배열 추가:

```javascript
function getQueries(dbType, schema = 'public', filterTables = null) {
  switch (dbType) {
    case 'postgres': return {
      columns: PG_COLUMNS,  // $1 사용
      views:   PG_VIEWS,    // $1 사용
      fks:     PG_FKS,      // $1 사용
      params:  [schema]
    };
    case 'mysql': return { columns: MY_COLUMNS, views: MY_VIEWS, fks: MY_FKS, params: [] };
    // ...
  }
}
```

`router.get('/')` 에서:
```javascript
const { columns, views, fks, params } = getQueries(config.dbType, config.schema || 'public', filterTables);
const [colResult, viewResult, fkResult] = await Promise.all([
  adapter.execute(config, columns, params),
  adapter.execute(config, views,   params),
  adapter.execute(config, fks,     params),
]);
```

---

### 항목 6-7: Oracle `all_` → `user_` 시스템 뷰 전환

**파일: `middleware/src/routes/schema.js`**

**위치:** `ORA_COLUMNS`, `ORA_VIEWS`, `ORA_FKS` 상수 (line 100-150)

**변경 내용:**

`ORA_COLUMNS` (line 100-127):
- `all_tab_columns c` → `user_tab_columns c`
- `all_tables`/`all_views` 서브쿼리에서 `WHERE owner = SYS_CONTEXT(...)` 조건 제거
  → `SELECT table_name FROM user_tables UNION ALL SELECT view_name AS table_name FROM user_views`
- `all_views v` LEFT JOIN → `user_views v`, `AND v.owner = ...` 조건 제거
- `all_constraints ac` → `user_constraints ac`, `all_cons_columns acc` → `user_cons_columns acc`
  `AND ac.owner = acc.owner` JOIN 조건 제거, `AND ac.owner = SYS_CONTEXT(...)` WHERE 조건 제거
- `WHERE c.owner = SYS_CONTEXT(...)` 제거
- `JOIN t ON c.table_name = t.table_name` (owner 조건 없음)

결과:
```sql
SELECT t.table_name,
       c.column_name,
       c.data_type,
       c.char_length AS character_maximum_length,
       c.nullable     AS is_nullable,
       c.data_default AS column_default,
       CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk,
       CASE WHEN v.view_name IS NOT NULL THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type
FROM user_tab_columns c
JOIN (
  SELECT table_name FROM user_tables
  UNION ALL
  SELECT view_name AS table_name FROM user_views
) t ON c.table_name = t.table_name
LEFT JOIN user_views v ON v.view_name = c.table_name
LEFT JOIN (
  SELECT ac.table_name, acc.column_name
  FROM user_constraints ac
  JOIN user_cons_columns acc ON ac.constraint_name = acc.constraint_name
  WHERE ac.constraint_type = 'P'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
ORDER BY c.table_name, c.column_id
```

`ORA_VIEWS` (line 129-133):
- `all_views` → `user_views`
- `WHERE owner = SYS_CONTEXT(...)` 조건 제거

결과:
```sql
SELECT view_name, text AS view_def FROM user_views
```

`ORA_FKS` (line 135-150):
- `all_constraints` → `user_constraints`, `all_cons_columns` → `user_cons_columns`
- `AND ac.owner = acc.owner`, `AND ac.r_owner = rc.owner`, `AND rc.owner = rcc.owner` JOIN 조건 제거
- `AND ac.owner = SYS_CONTEXT(...)` WHERE 조건 제거

결과:
```sql
SELECT ac.table_name AS from_table,
       acc.column_name AS from_col,
       rc.table_name AS to_table,
       rcc.column_name AS to_col
FROM user_constraints ac
JOIN user_cons_columns acc ON ac.constraint_name = acc.constraint_name
JOIN user_constraints rc ON ac.r_constraint_name = rc.constraint_name
JOIN user_cons_columns rcc ON rc.constraint_name = rcc.constraint_name
  AND acc.position = rcc.position
WHERE ac.constraint_type = 'R'
```

---

## 구현 순서 (권장)

1. **6-7** (Oracle user_ 전환) — schema.js 쿼리 상수만 수정, 영향 범위 최소
2. **6-1** (배치 겹침) — reverse_engineer.js 독립 함수 수정
3. **6-3** (위치 보존) — reverse_engineer.js overwrite 분기 수정
4. **6-6** (PG 스키마 파라미터화) — config.js + schema.js 연동. adapter.execute params 지원 여부 먼저 확인
5. **6-5** (UNIQUE/autoIncrement) — schema.js 쿼리 + buildResult + reverse_engineer.js attrs
6. **6-4** (FK 카디널리티) — 6-5 이후 구현 (uniqueSet 재활용 가능)
7. **6-2** (테이블 선택 2단계) — 가장 복잡, 앞 항목 완료 후 구현
8. **README 갱신** — 미들웨어 변경 완료 후 동반 갱신

---

## 확인 필요 사항

1. **`adapter.execute` params 지원 여부**: `middleware/src/db/adapters/postgres.js`의 `execute(config, sql)` 시그니처가 세 번째 `params` 인자를 지원하는지 확인. 지원하지 않으면 6-6의 파라미터 바인딩 전략을 문자열 치환으로 변경해야 함.
2. **Oracle `char_length` vs `data_length`**: `user_tab_columns`에서 문자열 컬럼 길이 컬럼명이 `char_length`인지 `char_col_decl_length`인지 Oracle 버전별 차이 있음. 현재 `all_tab_columns`에서 `char_length`를 사용 중이므로 동일하게 유지.
3. **MySQL `column_key = 'MUL'`**: UNIQUE 인덱스가 복합 UNIQUE의 첫 컬럼이면 `column_key = 'MUL'`로 표시될 수 있음. 6-5 구현 시 `statistics` 뷰 별도 조회 방식이 더 정확함.
4. **PostgreSQL UNIQUE 인라인 조회 성능**: PG_COLUMNS에 unique 서브쿼리를 LEFT JOIN으로 인라인 추가하면 쿼리가 복잡해짐. 6-4에서 별도 쿼리로 분리하는 것이 더 명확.
