## 요청 요약

UXERManager 미들웨어(`middleware/src/`)에 대해 보안·안정성·성능 관련 개선 항목 10개를 우선순위별로 분석하고 구체적인 구현 계획을 수립한다.

---

## 탐색한 파일

- `src/utils/crypto.js`: 암호화 키(`KEY`)가 `'uxermanager-local-secret-key-32b'` 문자열로 하드코딩되어 있음. `encrypt`/`decrypt` 두 함수 노출. 키를 바꾸면 기존 암호문 복호화 불가이므로 마이그레이션 처리 필요.
- `src/db/adapters/mssql.js`: `mssql.connect()`로 전역 풀을 사용하고 `finally`에서 `mssql.close()`(전역 풀 종료)를 호출. `execute()`와 `test()` 두 함수 노출.
- `src/db/adapters/postgres.js`: 매 호출마다 `new Client()` → `connect()` → `query()` → `end()` 패턴. `execute()`와 `test()` 두 함수.
- `src/db/adapters/mysql.js`: 매 호출마다 `createConnection()` → `query()` → `end()` 패턴. `execute()`와 `test()` 두 함수.
- `src/db/connector.js`: 어댑터 레지스트리 역할. `getAdapter(dbType)` 하나 노출. 현재 어댑터 인스턴스를 그대로 반환 (풀 상태 없음).
- `src/routes/config.js`: `loadConfig()`가 매 호출마다 파일 I/O + `decrypt()` 수행. `POST /config` 저장 시 `CONFIG_DIR`를 `ensureConfigDir()`로 생성. `loadConfig`를 `module.exports.loadConfig`로 외부 노출.
- `src/routes/execute.js`: `POST /execute`(단일)와 `POST /execute/stream`(SSE 다중). stream에서 오류 발생 시 다음 SQL로 계속 진행(stopOnError 없음). `loadConfig()`를 매 요청마다 호출.
- `src/routes/schema.js`: `GET /schema`에서 `loadConfig()`를 매 요청마다 호출. `Promise.all`로 3개 쿼리 병렬 실행.
- `src/index.js`: 포트 `3737` 하드코딩. `app.listen()` 오류 처리 없음(EADDRINUSE 미처리). `express.json()` limit 미지정. `null` origin CORS 주석 없음. `/ping`에서 version `'1.0.0'` 하드코딩.
- `src/tray.js`: `'UXERManager v1.0.0'` 트레이 메뉴 제목에 버전 하드코딩. `systray2/package.json`에서 버전을 읽는 패턴이 이미 존재하나 앱 버전에는 미적용.

---

## 영향 분석

- 단축키 변경: 없음 (미들웨어 작업)
- 새 localStorage 키: 없음 (미들웨어 작업)
- 기타 파급 효과:
  - **암호화 키 변경**: 기존 `~/.uxermanager/config.json`의 `password` 필드는 하드코딩 키로 암호화되어 있음. 키 파일 방식으로 전환 시, 기존 암호문을 구 키로 복호화→신 키로 재암호화하는 **1회성 마이그레이션** 로직이 필요하다. 대안: 키 파일이 없을 때만 신규 생성(기존 사용자는 하드코딩 키로 복호화 실패 → 재설정 요구). 구현 계획에서는 **마이그레이션 포함** 방향으로 설계.
  - **커넥션 풀링**: 어댑터 모듈이 풀 인스턴스를 보관해야 하므로 `connector.js`의 `getAdapter()` 반환값 구조가 변경되지 않더라도 내부적으로 상태를 갖게 됨. config 변경(`POST /config`) 시 기존 풀을 drain/close해야 함.
  - **MSSQL 전역 pool 수정**: `mssql.connect()` 대신 `new mssql.ConnectionPool()`을 써야 하므로 어댑터 내부 구조 변경. 외부 인터페이스(`execute`, `test`)는 동일.
  - **loadConfig 캐싱**: config 저장(`POST /config`) 시 캐시를 무효화해야 함. `config.js`와 캐시 모듈 간 결합 주의.

---

## 구현 계획

---

### 파일: `src/utils/crypto.js` + 신규 `src/utils/keystore.js`

#### 변경 1-A: 키 로드/생성 모듈 분리 (신규 `keystore.js`)

- **변경 위치**: 신규 파일 생성
- **변경 내용**:
  ```js
  // src/utils/keystore.js
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const KEY_DIR  = path.join(os.homedir(), '.uxermanager');
  const KEY_FILE = path.join(KEY_DIR, 'key');

  function loadOrCreateKey() {
    if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
    if (fs.existsSync(KEY_FILE)) {
      return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    return key;
  }

  module.exports = { loadOrCreateKey };
  ```
- **이유**: 키 생성·저장·로드 책임을 분리. `mode: 0o600`으로 소유자만 읽기 가능.

#### 변경 1-B: `crypto.js` — 하드코딩 키 제거, 동적 키 사용

- **변경 위치**: 파일 상단 `const KEY = ...` 라인 및 `encrypt`/`decrypt` 함수
- **변경 전**:
  ```js
  const KEY = Buffer.from('uxermanager-local-secret-key-32b', 'utf8');
  ```
- **변경 후**:
  ```js
  const { loadOrCreateKey } = require('./keystore');
  // 모듈 로드 시 1회 실행 (프로세스 생애주기 동안 고정)
  const KEY = loadOrCreateKey();

  // LEGACY: 하드코딩 키 (마이그레이션용)
  const LEGACY_KEY = Buffer.from('uxermanager-local-secret-key-32b', 'utf8');

  function decryptLegacy(encryptedJson) {
    const { iv, tag, data } = JSON.parse(encryptedJson);
    const decipher = require('crypto').createDecipheriv('aes-256-gcm', LEGACY_KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
  }

  module.exports = { encrypt, decrypt, decryptLegacy };
  ```
- **이유**: 신 키로 복호화 실패 시 구 키로 재시도하는 fallback을 `config.js`에서 처리할 수 있도록 `decryptLegacy` 노출.

#### 변경 1-C: `config.js` — 마이그레이션 처리

- **변경 위치**: `loadConfig()` 함수
- **변경 내용**: `decrypt()` 실패 시 `decryptLegacy()`로 재시도 → 성공하면 신 키로 재암호화 후 파일 저장
  ```js
  const { encrypt, decrypt, decryptLegacy } = require('../utils/crypto');

  function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!raw.password) return raw;
    let password;
    try {
      password = decrypt(raw.password);
    } catch (_) {
      // 신 키 복호화 실패 → 구 키(하드코딩)로 시도
      try {
        password = decryptLegacy(raw.password);
        // 마이그레이션: 신 키로 재암호화하여 저장
        ensureConfigDir();
        const migrated = { ...raw, password: encrypt(password), updatedAt: new Date().toISOString() };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2), 'utf8');
      } catch (_2) {
        // 복호화 완전 실패 → null 반환 (재설정 요구)
        return null;
      }
    }
    return { ...raw, password };
  }
  ```
- **이유**: 기존 사용자가 재설정 없이 자동 마이그레이션되도록 보장.

---

### 파일: `src/db/adapters/mssql.js`

#### 변경 2: `ConnectionPool` 인스턴스 직접 관리

- **변경 위치**: 파일 전체 재작성
- **변경 전 문제**: `mssql.connect(config)`는 라이브러리 내부 전역 풀을 사용하고, `mssql.close()`는 그 전역 풀 전체를 닫음 → 동시 요청 시 다른 요청의 풀도 닫힘.
- **변경 후 패턴**:
  ```js
  const mssql = require('mssql');

  let _pool = null;
  let _poolConfig = null;

  function configKey(config) {
    return JSON.stringify({
      server: config.host, port: config.port || 1433,
      database: config.database, user: config.username
    });
  }

  async function getPool(config) {
    const key = configKey(config);
    if (_pool && _poolConfig === key && _pool.connected) return _pool;
    if (_pool) { try { await _pool.close(); } catch (_) {} }
    const pool = new mssql.ConnectionPool({
      server: config.host,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate !== false,
        connectTimeout: 10000
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    });
    await pool.connect();
    _pool = pool;
    _poolConfig = key;
    return pool;
  }

  async function execute(config, sql, timeoutMs = 30000) {
    const pool = await getPool(config);
    const req = pool.request();
    req.timeout = timeoutMs;
    const result = await req.query(sql);
    const recordset = result.recordset || [];
    return {
      rows: recordset,
      rowCount: result.rowsAffected ? result.rowsAffected[0] : recordset.length,
      fields: recordset.length > 0 ? Object.keys(recordset[0]) : []
    };
  }

  async function test(config) {
    const result = await execute(config, 'SELECT 1 AS ok');
    return result.rows.length > 0;
  }

  async function closePool() {
    if (_pool) { try { await _pool.close(); } catch (_) {} _pool = null; _poolConfig = null; }
  }

  module.exports = { execute, test, closePool };
  ```
- **이유**: 인스턴스 별 풀 관리로 전역 충돌 제거. `closePool()` 노출로 config 변경 시 외부에서 풀 재설정 가능.

---

### 파일: `src/db/adapters/postgres.js`

#### 변경 3-A: `pg.Pool` 기반으로 전환

- **변경 위치**: 파일 전체 재작성
- **변경 전 패턴**: 매 쿼리마다 `new Client()` → `connect()` → `query()` → `end()`
- **변경 후 패턴**:
  ```js
  const { Pool } = require('pg');

  let _pool = null;
  let _poolConfig = null;

  function configKey(config) {
    return JSON.stringify({ host: config.host, port: config.port || 5432, database: config.database, user: config.username });
  }

  function getPool(config) {
    const key = configKey(config);
    if (_pool && _poolConfig === key) return _pool;
    if (_pool) { _pool.end().catch(() => {}); }
    _pool = new Pool({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      max: 10,
      idleTimeoutMillis: 30000
    });
    _poolConfig = key;
    return _pool;
  }

  async function execute(config, sql) {
    const pool = getPool(config);
    const result = await pool.query(sql);
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      fields: result.fields ? result.fields.map(f => f.name) : []
    };
  }

  async function test(config) {
    const result = await execute(config, 'SELECT 1 AS ok');
    return result.rows.length > 0;
  }

  async function closePool() {
    if (_pool) { try { await _pool.end(); } catch (_) {} _pool = null; _poolConfig = null; }
  }

  module.exports = { execute, test, closePool };
  ```
- **이유**: `pg.Pool`은 내부에서 클라이언트를 재사용하므로 연결 오버헤드 제거. `statement_timeout: 30000`으로 쿼리 타임아웃 내장(항목 6 동시 처리).

---

### 파일: `src/db/adapters/mysql.js`

#### 변경 3-B: `mysql2/promise` 풀 기반으로 전환

- **변경 위치**: 파일 전체 재작성
- **변경 전 패턴**: 매 쿼리마다 `createConnection()` → `query()` → `end()`
- **변경 후 패턴**:
  ```js
  const mysql = require('mysql2/promise');

  let _pool = null;
  let _poolConfig = null;

  function configKey(config) {
    return JSON.stringify({ host: config.host, port: config.port || 3306, database: config.database, user: config.username });
  }

  function getPool(config) {
    const key = configKey(config);
    if (_pool && _poolConfig === key) return _pool;
    if (_pool) { _pool.end().catch(() => {}); }
    _pool = mysql.createPool({
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.username,
      password: config.password,
      connectTimeout: 10000,
      multipleStatements: false,
      connectionLimit: 10,
      idleTimeout: 30000
    });
    _poolConfig = key;
    return _pool;
  }

  async function execute(config, sql) {
    const pool = getPool(config);
    const conn = await pool.getConnection();
    try {
      // 쿼리 타임아웃 (항목 6)
      await conn.query('SET SESSION MAX_EXECUTION_TIME=30000');
      const [rows, fields] = await conn.query(sql);
      const isArray = Array.isArray(rows);
      return {
        rows: isArray ? rows : [],
        rowCount: isArray ? rows.length : (rows.affectedRows || 0),
        fields: fields ? fields.map(f => f.name) : []
      };
    } finally {
      conn.release();
    }
  }

  async function test(config) {
    const result = await execute(config, 'SELECT 1 AS ok');
    return result.rows.length > 0;
  }

  async function closePool() {
    if (_pool) { try { await _pool.end(); } catch (_) {} _pool = null; _poolConfig = null; }
  }

  module.exports = { execute, test, closePool };
  ```
- **이유**: 풀 재사용으로 연결 오버헤드 감소. `MAX_EXECUTION_TIME`으로 MySQL 서버 측 타임아웃 설정(항목 6).

---

### 파일: `src/db/connector.js`

#### 변경 3-C: `closeAllPools()` 추가 노출

- **변경 위치**: 파일 말미 `module.exports` 추가
- **변경 내용**:
  ```js
  async function closeAllPools() {
    for (const adapter of Object.values(adapters)) {
      if (typeof adapter.closePool === 'function') await adapter.closePool();
    }
  }

  module.exports = { getAdapter, closeAllPools };
  ```
- **이유**: `POST /config`로 접속정보 변경 시 `closeAllPools()`를 호출해 기존 풀을 재생성 트리거.

---

### 파일: `src/routes/config.js`

#### 변경 4: `loadConfig` 메모리 캐싱 + 캐시 무효화 + pool close 연동

- **변경 위치**: `loadConfig()` 함수, `POST /config` 라우트
- **변경 내용**:
  ```js
  const { closeAllPools } = require('../db/connector');

  let _configCache = null;

  function invalidateCache() { _configCache = null; }

  function loadConfig() {
    if (_configCache) return _configCache;
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!raw.password) { _configCache = raw; return raw; }
    // decrypt (with migration fallback — 변경 1-C 참조)
    let password;
    try { password = decrypt(raw.password); }
    catch (_) {
      try {
        password = decryptLegacy(raw.password);
        const migrated = { ...raw, password: encrypt(password), updatedAt: new Date().toISOString() };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2), 'utf8');
      } catch (_2) { return null; }
    }
    _configCache = { ...raw, password };
    return _configCache;
  }

  // POST /config 라우트 저장 부분 추가:
  // fs.writeFileSync(...) 이후
  invalidateCache();
  await closeAllPools(); // 비동기 처리 위해 라우트 핸들러를 async로 변경
  ```
- **이유**: 파일 I/O + decrypt를 매 요청마다 반복 제거. 설정 변경 시 캐시 무효화 + 풀 재생성으로 일관성 보장.

---

### 파일: `src/routes/execute.js`

#### 변경 5: SSE `stopOnError` 옵션 지원

- **변경 위치**: `POST /execute/stream` 라우트, for 루프 내 catch 블록
- **변경 내용**:
  ```js
  // 요청 바디에서 stopOnError 파싱 (기본값 false — 기존 동작 유지)
  const stopOnError = req.body.stopOnError === true;

  // catch 블록 내:
  } catch (err) {
    failed++;
    send('error', { step, total, sql, error: err.message });
    if (stopOnError) {
      send('done', { success, failed, total, duration: Date.now() - startAll, stoppedAt: step });
      res.end();
      return;
    }
  }
  ```
- **이유**: 오류 발생 시 이후 SQL을 계속 실행할지 중단할지 클라이언트가 선택 가능. 기존 동작(continue)이 기본값이므로 하위 호환성 유지.

---

### 파일: `src/index.js`

#### 변경 6: EADDRINUSE 처리

- **변경 위치**: `app.listen(PORT, ...)` 호출부
- **변경 전**:
  ```js
  app.listen(PORT, '127.0.0.1', () => { ... });
  ```
- **변경 후**:
  ```js
  const server = app.listen(PORT, '127.0.0.1', () => { ... });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[ERROR] 포트 ${PORT}가 이미 사용 중입니다. 기존 UXERManager를 종료하거나 포트를 변경하세요.`);
      process.exit(1);
    } else {
      throw err;
    }
  });
  ```
- **이유**: 포트 충돌 시 의미 있는 메시지 출력 후 종료. 기존에는 unhandled error로 스택 트레이스만 출력.

#### 변경 7: null origin CORS 주석 명시

- **변경 위치**: `ALLOWED_ORIGINS` 배열의 `null` 항목
- **변경 전**: `null // file:// 로컬 실행 시`
- **변경 후**:
  ```js
  // null: file:// 프로토콜 또는 브라우저 확장에서 접근 시 origin이 'null' 문자열로 전달됨.
  // 로컬 단독 실행 환경을 지원하기 위해 허용. 원격 배포 시 제거 검토 필요.
  null
  ```
- **이유**: 보안 리뷰 시 `null` origin 허용 의도를 명확히 기록.

#### 변경 8: `express.json()` limit 명시

- **변경 위치**: `app.use(express.json())` 라인
- **변경 전**: `app.use(express.json());`
- **변경 후**: `app.use(express.json({ limit: '10mb' }));`
- **이유**: 기본값(100kb)은 대형 DDL 스크립트나 다중 SQL 배치 전송에 부족할 수 있음. 10mb로 명시하여 의도를 문서화.

#### 변경 9: 버전 하드코딩 제거 (index.js)

- **변경 위치**: `/ping` 라우트 핸들러
- **변경 전**: `res.json({ ok: true, version: '1.0.0', port: PORT });`
- **변경 후**:
  ```js
  const { version } = require('../../package.json'); // 파일 상단 require 추가
  // ...
  res.json({ ok: true, version, port: PORT });
  ```
- **이유**: `package.json`의 버전을 단일 진실 공급원으로 사용.

---

### 파일: `src/tray.js`

#### 변경 10: 버전 하드코딩 제거 (tray.js)

- **변경 위치**: `setupTray()` 함수 내 `items` 배열 첫 번째 항목
- **변경 전**: `{ title: 'UXERManager v1.0.0', ... }`
- **변경 후**:
  ```js
  // 파일 상단에 추가
  let _appVersion = 'unknown';
  try { _appVersion = require('../../package.json').version; } catch (_) {}

  // setupTray 내부
  { title: `UXERManager v${_appVersion}`, tooltip: '', enabled: false, name: 'info' },
  ```
- **이유**: `package.json` 버전과 트레이 표시 버전의 불일치 방지. `pkg` 번들 환경에서는 `require` 경로가 달라질 수 있으므로 try-catch 유지.

---

## 구현 순서 권장

1. `src/utils/keystore.js` 신규 생성 (다른 항목의 선행 조건)
2. `src/utils/crypto.js` 수정 (keystore 의존)
3. `src/db/adapters/mssql.js` 수정 (독립, High Priority)
4. `src/db/adapters/postgres.js` 수정 (독립)
5. `src/db/adapters/mysql.js` 수정 (독립)
6. `src/db/connector.js` 수정 (`closeAllPools` 추가)
7. `src/routes/config.js` 수정 (crypto 마이그레이션 + 캐시 + pool close)
8. `src/routes/execute.js` 수정 (stopOnError)
9. `src/index.js` 수정 (EADDRINUSE + CORS 주석 + json limit + 버전)
10. `src/tray.js` 수정 (버전)

## 주의사항

- **mysql.js의 `MAX_EXECUTION_TIME`**: MySQL 5.7.8+ 이상에서만 지원. MariaDB에서는 `MAX_STATEMENT_TIME`이므로 어댑터에서 DB 종류를 확인하거나 try-catch로 감싸야 함.
- **풀 config 키 비교**: `configKey()`는 host/port/database/user만 비교하고 password는 제외함. password 변경 시 재연결이 안 되므로, `POST /config` 저장 후 `closeAllPools()` 호출이 필수.
- **pkg 번들 경로**: `require('../../package.json')` 경로는 `pkg` 번들 시 번들 루트 기준으로 해석됨. `tray.js`에서 이미 try-catch 패턴을 사용 중이므로 동일 패턴 적용.
