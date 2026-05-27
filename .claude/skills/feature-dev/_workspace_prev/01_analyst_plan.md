## 요청 요약

미들웨어에 Oracle DB 지원을 추가한다. 구체적으로:
1. 미들웨어(Node.js)에 Oracle 어댑터(`oracledb` npm 패키지) 추가
2. `/schema` 라우터에 Oracle 전용 스키마 쿼리 추가
3. `connector.js`에 Oracle 어댑터 등록
4. `routes/config.js`의 `getDefaultPort`에 Oracle 기본 포트(1521) 추가
5. 프론트엔드 DB 프로파일 관리 UI(`db_connect.js`, `profile_manager.js`)에 Oracle 옵션 추가 + 추가 필드(서비스명/SID) 고려
6. `middleware/README.md` 지원 DB 표 및 파일 구조 섹션 업데이트

---

## 탐색한 파일

- `middleware/src/db/adapters/mysql.js` — MySQL 어댑터 패턴 파악 (Pool 생성, execute, test, closePool)
- `middleware/src/db/adapters/postgres.js` — PostgreSQL 어댑터 패턴 파악
- `middleware/src/db/adapters/mssql.js` — MSSQL 어댑터 패턴 파악 (비동기 Pool 생성)
- `middleware/src/db/connector.js` — 어댑터 라우팅 진입점 (`adapters` 객체에 추가 필요)
- `middleware/src/routes/config.js` — `getDefaultPort` 함수, 프로파일 CRUD 라우터 확인
- `middleware/src/routes/schema.js` — DB별 스키마 쿼리 상수 + `getQueries` switch문
- `middleware/src/routes/execute.js` — SQL 실행 (어댑터 패턴 자동 연계, 변경 불필요)
- `middleware/src/routes/health.js` — 헬스체크 (어댑터 패턴 자동 연계, 변경 불필요)
- `middleware/src/index.js` — 서버 진입점 (변경 불필요)
- `middleware/package.json` — 현재 의존성 목록 (`oracledb` 추가 필요)
- `middleware/README.md` — 지원 DB 표 및 파일 구조 섹션
- `js/db_connect.js` — DB 연결 설정 모달 (dbType select, 기본포트 defaults 객체)
- `js/profile_manager.js` — 프로파일 관리 모달 (dbType select, `_pmAutoPort` defaults 객체)

---

## 영향 분석

- **단축키 변경**: 없음
- **새 localStorage 키**: 없음 (DB 프로파일 설정은 미들웨어 서버의 `~/.uxermanager/config.json`에 저장)
- **새 데이터 배열/상태 변수**: 없음
- **새 npm 의존성**: `oracledb` 패키지 추가 필요
- **pkg 빌드 assets**: Oracle thin mode 사용 시 네이티브 바이너리 불필요. `oracledb` v6+ thin mode는 순수 JS이므로 `pkg` assets에 별도 추가 없이 동작 가능. 단, thick mode 사용 시 Oracle Instant Client 별도 필요 → thin mode 채택 권장
- **Oracle 연결 특이사항**: Oracle은 `host:port/serviceName` 또는 `host:port:SID` 형태의 connectString 사용. 기존 `database` 필드를 `serviceName`으로 재사용하는 것이 가장 단순한 접근법 (기존 스키마 구조 유지)
- **스키마 쿼리**: Oracle은 `information_schema` 없음. `ALL_TAB_COLUMNS`, `ALL_CONSTRAINTS`, `ALL_CONS_COLUMNS`, `ALL_VIEWS` 시스템 뷰 사용
- **기타 파급 효과**: `execute.js`, `health.js`, `routes/config.js`의 CRUD 로직은 어댑터 패턴 덕분에 별도 수정 불필요. `getQueries` switch문과 `getAdapter` 등록만 추가하면 연계됨

---

## 구현 계획

### 파일 1: `middleware/package.json`
- **위치**: `dependencies` 섹션
- **변경 내용**: `"oracledb": "^6.4.0"` 추가
- **이유**: Oracle DB 연결에 필요한 공식 Node.js 드라이버. v6+ thin mode는 네이티브 라이브러리 없이 순수 JS로 동작하여 `pkg` 빌드에 유리함

```json
"dependencies": {
  "cors": "^2.8.5",
  "express": "^4.18.2",
  "mssql": "^10.0.2",
  "mysql2": "^3.6.5",
  "oracledb": "^6.4.0",
  "pg": "^8.11.3",
  "systray2": "^2.1.4"
}
```

---

### 파일 2: `middleware/src/db/adapters/oracle.js` (신규 생성)
- **위치**: `middleware/src/db/adapters/` 디렉터리에 새 파일 생성
- **변경 내용**: `oracledb` thin mode 기반 커넥션 풀 어댑터 구현
- **이유**: 기존 `mysql.js`, `postgres.js`, `mssql.js`와 동일한 인터페이스(`execute`, `test`, `closePool`) 구현

```javascript
'use strict';
const oracledb = require('oracledb');

// thin mode: Oracle Instant Client 불필요
oracledb.initOracleClient = undefined; // thin mode 명시적 보장

let _pool = null;
let _poolConfig = null;

function configKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port || 1521,
    database: config.database,  // Oracle에서는 serviceName 또는 SID로 사용
    user: config.username
  });
}

async function getPool(config) {
  const key = configKey(config);
  if (_pool && _poolConfig === key) return _pool;
  if (_pool) { try { await _pool.close(0); } catch (_) {} }

  const connectString = `${config.host}:${config.port || 1521}/${config.database}`;
  _pool = await oracledb.createPool({
    user:          config.username,
    password:      config.password,
    connectString,
    poolMin:       0,
    poolMax:       10,
    poolTimeout:   30,
    queueTimeout:  10000
  });
  _poolConfig = key;
  return _pool;
}

async function execute(config, sql) {
  const pool = await getPool(config);
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 100
    });
    const rows = result.rows || [];
    const fields = result.metaData ? result.metaData.map(m => m.name.toLowerCase()) : [];
    return {
      rows: rows.map(row => {
        // 컬럼명 소문자 정규화
        const out = {};
        for (const [k, v] of Object.entries(row)) out[k.toLowerCase()] = v;
        return out;
      }),
      rowCount: result.rowsAffected != null ? result.rowsAffected : rows.length,
      fields
    };
  } finally {
    if (conn) { try { await conn.close(); } catch (_) {} }
  }
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok FROM DUAL');
  return result.rows.length > 0;
}

async function closePool() {
  if (_pool) {
    try { await _pool.close(0); } catch (_) {}
    _pool = null;
    _poolConfig = null;
  }
}

module.exports = { execute, test, closePool };
```

---

### 파일 3: `middleware/src/db/connector.js`
- **위치**: 상단 require 목록 및 `adapters` 객체, 에러 메시지
- **변경 내용**: oracle 어댑터 추가 등록

```javascript
// 변경 전
const postgres = require('./adapters/postgres');
const mysql    = require('./adapters/mysql');
const mssql    = require('./adapters/mssql');
const adapters = { postgres, mysql, mssql };
// 에러: `지원하지 않는 DB 타입: ${dbType}. (postgres / mysql / mssql)`

// 변경 후
const postgres = require('./adapters/postgres');
const mysql    = require('./adapters/mysql');
const mssql    = require('./adapters/mssql');
const oracle   = require('./adapters/oracle');
const adapters = { postgres, mysql, mssql, oracle };
// 에러: `지원하지 않는 DB 타입: ${dbType}. (postgres / mysql / mssql / oracle)`
```

---

### 파일 4: `middleware/src/routes/config.js`
- **위치**: `getDefaultPort` 함수 (96번째 줄)
- **변경 내용**: `oracle` 기본 포트 1521 추가

```javascript
// 변경 전
function getDefaultPort(dbType) {
  const PORTS = { postgres: 5432, mysql: 3306, mssql: 1433 };
  return PORTS[dbType] ?? null;
}

// 변경 후
function getDefaultPort(dbType) {
  const PORTS = { postgres: 5432, mysql: 3306, mssql: 1433, oracle: 1521 };
  return PORTS[dbType] ?? null;
}
```

---

### 파일 5: `middleware/src/routes/schema.js`
- **위치**: 스키마 쿼리 상수 선언부(현재 MS_FKS 다음) 및 `getQueries` switch문
- **변경 내용**: Oracle 전용 쿼리 3개 + switch case 추가

```javascript
// ── Oracle 쿼리 ───────────────────────────────────────────────────
const ORA_COLUMNS = `
SELECT t.table_name,
       c.column_name,
       c.data_type,
       c.char_length AS character_maximum_length,
       c.nullable     AS is_nullable,
       c.data_default AS column_default,
       CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk,
       CASE WHEN v.view_name IS NOT NULL THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type
FROM all_tab_columns c
JOIN (
  SELECT table_name FROM all_tables WHERE owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
  UNION ALL
  SELECT view_name AS table_name FROM all_views WHERE owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
) t ON c.table_name = t.table_name
LEFT JOIN all_views v
  ON v.view_name = c.table_name AND v.owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
LEFT JOIN (
  SELECT ac.table_name, acc.column_name
  FROM all_constraints ac
  JOIN all_cons_columns acc
    ON ac.constraint_name = acc.constraint_name AND ac.owner = acc.owner
  WHERE ac.constraint_type = 'P'
    AND ac.owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
WHERE c.owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
ORDER BY c.table_name, c.column_id
`;

const ORA_VIEWS = `
SELECT view_name, text AS view_def
FROM all_views
WHERE owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
`;

const ORA_FKS = `
SELECT ac.table_name AS from_table,
       acc.column_name AS from_col,
       rc.table_name AS to_table,
       rcc.column_name AS to_col
FROM all_constraints ac
JOIN all_cons_columns acc
  ON ac.constraint_name = acc.constraint_name AND ac.owner = acc.owner
JOIN all_constraints rc
  ON ac.r_constraint_name = rc.constraint_name AND ac.r_owner = rc.owner
JOIN all_cons_columns rcc
  ON rc.constraint_name = rcc.constraint_name AND rc.owner = rcc.owner
  AND acc.position = rcc.position
WHERE ac.constraint_type = 'R'
  AND ac.owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
`;
```

`getQueries` switch문에 case 추가:
```javascript
case 'oracle': return { columns: ORA_COLUMNS, views: ORA_VIEWS, fks: ORA_FKS };
```

`buildResult` 내 `isNullable` 정규화 로직 확인 필요:
- Oracle은 `nullable` 컬럼이 `'Y'` / `'N'`으로 반환됨
- 기존 코드: `s(row.is_nullable) === 'YES' || row.is_nullable === true || row.is_nullable === 1`
- Oracle용 추가 조건: `|| s(row.is_nullable) === 'Y'` 추가 필요

---

### 파일 6: `js/db_connect.js`
- **위치 1**: `_onDbTypeChange` 함수 (104번째 줄) — `defaults` 객체
- **위치 2**: `_renderDbConnectModal` 함수 내 HTML 템플릿 — `dbConnType` select 옵션

변경 내용:
```javascript
// _onDbTypeChange의 defaults 객체
const defaults = { postgres: 5432, mysql: 3306, mssql: 1433, oracle: 1521 };

// select 옵션 추가
<option value="oracle">Oracle</option>
```

---

### 파일 7: `js/profile_manager.js`
- **위치 1**: `_pmAutoPort` 함수 (197번째 줄) — `defaults` 객체
- **위치 2**: `_renderProfileManagerModal` 내 추가 폼 HTML — `pmAddType` select 옵션
- **위치 3**: `_renderProfileList` 내 인라인 편집 폼 HTML — `data-field="dbType"` select 옵션

변경 내용:
```javascript
// _pmAutoPort의 defaults 객체
const defaults = { postgres: 5432, mysql: 3306, mssql: 1433, oracle: 1521 };

// select 옵션 추가 (추가 폼 & 편집 폼 모두)
<option value="oracle">Oracle</option>
```

---

### 파일 8: `middleware/README.md`
- **위치 1**: "지원 DB" 표 (48번째 줄 근처)
- **위치 2**: "파일 구조" 섹션 — adapters 목록 (444번째 줄 근처)

변경 내용:

지원 DB 표에 행 추가:
```
| `oracle` | Oracle DB      | 1521      |
```

파일 구조에 항목 추가:
```
│       └── oracle.js     oracledb Pool 드라이버 (thin mode, 커넥션 풀링)
```

---

## 추가 확인 필요 사항

1. **`pkg` 빌드 호환성 (확인 필요)**: `oracledb` v6+ thin mode는 순수 JS이므로 pkg 번들링 대부분 문제없으나, 실제 빌드 테스트 필요. thick mode가 필요한 환경(일부 Oracle 기능)에서는 pkg assets 설정과 Oracle Instant Client 배포 정책 별도 검토 필요.

2. **Oracle 서비스명 vs SID (확인 필요)**: 현재 모든 어댑터는 `database` 필드를 DB 이름으로 사용. Oracle은 `serviceName`(권장) 또는 `SID`(레거시)로 접속. `database` 필드를 `serviceName`으로 재사용하되, UI 라벨을 "데이터베이스 / 서비스명"으로 변경하면 사용자 혼란 최소화 가능. 또는 Oracle 선택 시 추가 필드(서비스명/SID 구분 라디오)를 동적으로 표시하는 방법도 있으나 구현 복잡도 증가.

3. **`buildResult`의 `isPk` 정규화**: Oracle의 `is_pk`는 `0` / `1` (정수)로 반환. 기존 코드 `!!row.is_pk`는 `0`을 `false`로, `1`을 `true`로 올바르게 처리함 — 별도 변경 불필요.

4. **`buildResult`의 `isNullable` 정규화**: 기존 코드가 `'YES'`, `true`, `1`만 처리하므로 Oracle의 `'Y'` 처리를 위해 조건 추가 필요.
