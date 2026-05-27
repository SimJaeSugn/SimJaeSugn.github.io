# UXERManager 미들웨어 — 코드 리뷰 & 개선 제안

> 작성일: 2026-05-27  
> 대상 버전: 1.0.0  
> 검토 범위: `src/` 전체 (index, routes, db/adapters, utils)

---

## 1. 보안

### 1-1. 암호화 키 하드코딩 (High)
**파일:** `src/utils/crypto.js:4`

```js
const KEY = Buffer.from('uxermanager-local-secret-key-32b', 'utf8');
```

키가 소스코드에 고정되어 있어 바이너리를 분석하면 노출된다. 빌드된 `.exe` 안에도 그대로 포함된다.

**개선 방안:**
- 최초 실행 시 `crypto.randomBytes(32)`로 키를 생성하여 `~/.uxermanager/key` 파일에 저장
- 이후 실행 시 해당 파일에서 로드

```js
function getKey() {
  const keyPath = path.join(os.homedir(), '.uxermanager', 'key');
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath);
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}
```

---

### 1-2. `null` origin CORS 허용 (Medium)
**파일:** `src/index.js:16`

```js
null // file:// 로컬 실행 시
```

`origin: null`은 `file://` 외에도 sandboxed iframe, `data:` URL 등에서도 발생한다. 공격자가 악의적인 로컬 파일을 이용해 API를 호출할 수 있다.

**개선 방안:** 실제로 `file://`에서 동작이 필요한지 재검토. 필요 없다면 `null` 제거. 필요하다면 주석으로 위험을 명시.

---

### 1-3. SQL Injection 방어 없음 (참고)
현재 구조상 사용자가 직접 SQL을 입력하는 도구이므로 parameterized query가 무의미하지만,  
`/execute` 엔드포인트에 대한 **요청 크기 제한**은 필요하다.

```js
app.use(express.json({ limit: '1mb' }));
```

현재 기본값(100kb)이 적용되나 명시적으로 설정하는 것이 좋다.

---

## 2. 성능

### 2-1. 매 쿼리마다 연결 생성/종료 (High)
**파일:** `src/db/adapters/postgres.js`, `mysql.js`, `mssql.js`

세 어댑터 모두 쿼리마다 `connect()` → 쿼리 → `end()` 패턴을 사용한다.  
스키마 조회(`/schema`)는 `Promise.all`로 3개 쿼리를 동시에 보내므로 연결 3개를 동시 생성한다.

**개선 방안:** 커넥션 풀 사용

```js
// postgres 예시
const { Pool } = require('pg');
let pool = null;

function getPool(config) {
  if (!pool) pool = new Pool({ ...config, max: 5, idleTimeoutMillis: 30000 });
  return pool;
}

async function execute(config, sql) {
  const client = await getPool(config).connect();
  try {
    const result = await client.query(sql);
    return { rows: result.rows, rowCount: result.rowCount, fields: result.fields.map(f => f.name) };
  } finally {
    client.release();
  }
}
```

config가 바뀔 때 기존 풀을 종료하고 새 풀을 만드는 처리도 필요하다.

---

### 2-2. `loadConfig()` 매 요청마다 파일 I/O (Medium)
**파일:** `src/routes/config.js:16-21`, `src/routes/execute.js:19`, `src/routes/schema.js:167`

`loadConfig()`는 `fs.readFileSync` + `JSON.parse` + `decrypt()`를 매 요청마다 실행한다.  
`/execute/stream`에서 반복 호출되는 경우에도 동일하다.

**개선 방안:** 메모리 캐싱 (POST /config 저장 시 캐시 무효화)

```js
let _configCache = null;

function invalidateCache() { _configCache = null; }

function loadConfig() {
  if (_configCache) return _configCache;
  // ... 기존 로직 ...
  _configCache = result;
  return result;
}
```

---

### 2-3. MSSQL 전역 풀 close 위험 (High)
**파일:** `src/db/adapters/mssql.js:14`

```js
const pool = await mssql.connect({ ... });
// ...
finally { await mssql.close(); }
```

`mssql.close()`는 **전역 연결 풀**을 닫는다. 동시 요청이 두 개 이상 오면 한 요청의 `close()`가 다른 요청의 연결을 끊는다.

**개선 방안:** 전역 pool 대신 `ConnectionPool` 인스턴스를 직접 관리

```js
const mssql = require('mssql');

async function execute(config, sql) {
  const pool = new mssql.ConnectionPool({ ... });
  await pool.connect();
  try {
    const result = await pool.request().query(sql);
    // ...
  } finally {
    await pool.close(); // 전역 close() 대신 인스턴스 close
  }
}
```

---

## 3. 안정성

### 3-1. SQL 분리 로직의 세미콜론 오판 (Medium)
**파일:** `src/routes/execute.js:6-15`

```js
.split(/;\s*\n|;\s*$/)
```

문자열 리터럴이나 주석 내부의 세미콜론도 분리 기준으로 처리된다.

예시: `INSERT INTO t VALUES ('hello; world')` → 잘못 분리됨

**개선 방안:** 단순 세미콜론 파싱의 한계를 UI에 명시하거나, `sqls` 배열 방식 사용을 권장한다 (이미 지원됨). 혹은 간단한 상태 머신으로 문자열 내부 세미콜론을 스킵한다.

---

### 3-2. SSE 스트리밍에서 중단 옵션 없음 (Low)
**파일:** `src/routes/execute.js:65-84`

오류 발생 시 `send('error', ...)` 후 다음 SQL을 계속 실행한다. 트랜잭션 중 오류가 나면 남은 SQL을 멈춰야 하는 경우에 대응이 안 된다.

**개선 방안:** 요청 바디에 `stopOnError: true` 옵션 지원

```js
const stopOnError = req.body.stopOnError === true;
// ...
} catch (err) {
  failed++;
  send('error', { step, total, sql, error: err.message });
  if (stopOnError) break;
}
```

---

### 3-3. 포트 충돌 시 에러 처리 없음 (Medium)
**파일:** `src/index.js:46`

`app.listen()`에서 `EADDRINUSE` 발생 시 프로세스가 에러를 출력하고 종료되는데, 사용자에게 안내 메시지가 없다.

```js
const server = app.listen(PORT, '127.0.0.1', () => { ... });
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[오류] 포트 ${PORT}가 이미 사용 중입니다. 실행 중인 미들웨어를 트레이에서 종료 후 다시 시작하세요.`);
    process.exit(1);
  }
});
```

---

### 3-4. 쿼리 타임아웃 없음 (Medium)
**파일:** `src/db/adapters/*.js`

`connectionTimeoutMillis` / `connectTimeout`은 연결 타임아웃이고, 쿼리 실행 타임아웃은 설정되지 않았다. 오래 걸리는 쿼리가 서버를 점유한다.

**개선 방안:**
- PostgreSQL: `statement_timeout` 설정 파라미터 또는 `query_timeout` 옵션
- MySQL: `mysql2`의 `queryTimeout` 옵션 (v3+)
- MSSQL: `requestTimeout` 옵션

---

## 4. 코드 품질

### 4-1. 버전 하드코딩 중복 (Low)
**파일:** `src/index.js:34`, `src/tray.js:94`

```js
res.json({ ok: true, version: '1.0.0', port: PORT });
// ...
{ title: `UXERManager v1.0.0`, ... }
```

`package.json`의 버전과 동기화가 안 될 수 있다.

```js
const { version } = require('../../package.json');
```

---

### 4-2. `getDefaultPort` MySQL 누락 (Low)
**파일:** `src/routes/config.js:73-75`

```js
return { postgres: 5432, mysql: 3306, mssql: 1433 }[dbType] || 5432;
```

MySQL은 정의되어 있으나, 미래에 DB 타입을 추가할 경우 `postgres` 기본값이 반환되는 것은 혼란스럽다. `undefined`를 명시적으로 처리하는 편이 낫다.

```js
const PORTS = { postgres: 5432, mysql: 3306, mssql: 1433 };
return PORTS[dbType] ?? null;
```

---

### 4-3. `norm()` 함수 중복 호출 (Low)
**파일:** `src/routes/schema.js:116-120`

`buildResult` 내부에서 모든 row에 `norm()`을 호출하는데, 이미 정규화된 결과를 다시 `norm()`하지 않도록 한 번만 호출하고 있다. 현재는 괜찮지만 `fkRows.map()` 내부에서도 `norm(raw)` 후 즉시 사용하므로 일관성을 위해 초반에 한 번에 정규화하는 패턴도 고려할 수 있다.

---

## 5. 기능 추가 제안

### 5-1. 다중 접속 프로파일
현재 단일 DB 설정만 저장된다. 개발/스테이징/운영 DB를 전환하려면 매번 재입력해야 한다.

**제안:** `config.json` 구조를 프로파일 배열로 변경
```json
{
  "profiles": [
    { "name": "개발", "dbType": "postgres", ... },
    { "name": "운영", "dbType": "mssql", ... }
  ],
  "active": "개발"
}
```

---

### 5-2. `/health` 엔드포인트 (DB 연결 포함)
현재 `/ping`은 서버 생존만 확인한다. DB 실제 연결 가능 여부를 포함한 헬스체크가 있으면 UI에서 상태 표시에 활용할 수 있다.

```
GET /health
→ { ok: true, db: { connected: true, latencyMs: 4 } }
```

---

### 5-3. 요청/쿼리 감사 로그
로컬 도구이지만 어떤 SQL이 언제 실행되었는지 `~/.uxermanager/audit.log`에 기록하면 디버깅에 유용하다.

```
2026-05-27T10:23:11Z [EXECUTE] SELECT * FROM users (12ms, 42 rows)
2026-05-27T10:23:15Z [EXECUTE] DROP TABLE sessions (ERROR: permission denied)
```

---

### 5-4. 자동 재시작 / Watchdog
현재 예상치 못한 예외로 프로세스가 종료되면 수동으로 재실행해야 한다.  
배포 방식에 따라 `pm2`나 Windows 서비스(NSSM) 등록을 설치 가이드에 포함하거나,  
설치 스크립트에서 Task Scheduler 등록을 자동화하는 방안을 고려할 수 있다.

---

## 우선순위 요약

| 우선순위 | 항목 | 파일 | 이유 |
|---------|------|------|------|
| 🔴 High | MSSQL 전역 pool close | `adapters/mssql.js` | 동시 요청 시 데이터 손실 |
| 🔴 High | 커넥션 풀링 미적용 | `adapters/*.js` | 성능·안정성 |
| 🔴 High | 암호화 키 하드코딩 | `utils/crypto.js` | 보안 |
| 🟡 Medium | 포트 충돌 처리 | `index.js` | UX |
| 🟡 Medium | `loadConfig` 캐싱 | `routes/config.js` | 성능 |
| 🟡 Medium | 쿼리 타임아웃 | `adapters/*.js` | 안정성 |
| 🟡 Medium | SSE stopOnError 옵션 | `routes/execute.js` | 기능 |
| 🟡 Medium | SQL 세미콜론 파싱 | `routes/execute.js` | 정확성 |
| 🟢 Low | 버전 하드코딩 | `index.js`, `tray.js` | 유지보수 |
| 🟢 Low | `/health` 엔드포인트 | 신규 | UX |
| 🟢 Low | 감사 로그 | 신규 | 운영성 |
| 🟢 Low | 다중 프로파일 | 신규 | 기능 |
