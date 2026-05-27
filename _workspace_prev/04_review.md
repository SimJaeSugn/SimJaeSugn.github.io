## 리뷰 요약
- 전체 평가: PASS (주의사항 있음)

---

## 발견 사항

### 심각 (즉시 수정 필요)

**1. mssql.js:4-5 — 모듈 수준 단일 풀 변수로 인한 race condition**

`_pool`, `_poolConfig`가 모듈 수준 변수이며 `getPool`이 async로 선언되어 있다. 동시에 두 요청이 들어와 `_pool === null`을 확인한 뒤 각각 새로운 ConnectionPool을 생성·connect하면, 먼저 완료된 것이 `_pool`에 저장되고 나중 완료된 것이 다시 덮어쓴다. 이전 풀은 닫히지 않은 채 누수된다.

- 수정 방안: `_connecting` 프로미스 변수를 두어 진행 중인 connect를 공유한다.
  ```js
  let _connecting = null;
  async function getPool(config) {
    const key = configKey(config);
    if (_pool && _poolConfig === key && _pool.connected) return _pool;
    if (_connecting) return _connecting; // 진행 중 연결 재사용
    _connecting = (async () => {
      if (_pool) { try { await _pool.close(); } catch (_) {} }
      const pool = new mssql.ConnectionPool({ ... });
      await pool.connect();
      _pool = pool; _poolConfig = key; _connecting = null;
      return pool;
    })();
    return _connecting;
  }
  ```

**2. crypto.js:5 — 모듈 로드 시점에 KEY가 동기로 초기화됨**

`const KEY = loadOrCreateKey();`가 모듈 임포트 시점에 즉시 실행된다. keystore 파일에 대한 읽기/쓰기 실패(권한 문제, 디스크 오류 등)가 발생하면 전체 모듈 임포트가 실패하고 서버가 기동 자체를 못 한다. 에러 메시지가 `keystore.js`에서 나오기 때문에 사용자 진단이 어렵다.

- 수정 방안: `loadOrCreateKey()` 내부에서 예외를 catch하고 의미 있는 오류 메시지를 포함해 re-throw한다.
  ```js
  function loadOrCreateKey() {
    try {
      if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
      if (fs.existsSync(KEY_FILE)) {
        return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
      }
      const key = crypto.randomBytes(32);
      fs.writeFileSync(KEY_FILE, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
      return key;
    } catch (err) {
      throw new Error(`[keystore] 암호화 키 초기화 실패: ${err.message}`);
    }
  }
  ```

**3. config.js:24 — 비밀번호 없는 설정의 캐시가 올바르게 무효화되지 않음**

`loadConfig()`에서 `!raw.password` 인 경우 `_configCache = raw`를 설정하지 않고 `raw`를 그대로 반환한다(24번째 줄). 이후 `loadConfig()`를 다시 호출하면 `_configCache`가 `null`이므로 파일을 다시 읽는다. 이는 성능 문제이지만, 더 중요하게는 **POST /config 저장 후 `invalidateCache()`를 호출해도 실제로 캐시된 값이 없었으므로 아무 효과가 없다**. 반면, 새로운 설정 저장 직후 파일이 올바르게 읽히므로 기능 오동작은 없다. 그러나 일관성 결여로 추후 버그를 유발할 수 있다.

- 수정 방안:
  ```js
  if (!raw.password) { _configCache = raw; return _configCache; }
  ```

---

### 경미 (개선 권장)

**4. postgres.js:12-13 / mysql.js:12-13 — 풀 교체 시 비동기 종료 경쟁**

`_pool.end().catch(() => {})`를 fire-and-forget으로 호출하고 즉시 새 풀을 생성한다. 이전 풀이 완전히 종료되기 전에 새 풀이 동일한 DB에 연결을 시도하면 연결 수가 일시적으로 2배가 된다. 낮은 부하 환경에서는 문제가 없으나, MSSQL과 달리 동기 함수(`getPool`)로 설계된 의도는 이해하나 일관성을 위해 MSSQL 방식(async getPool)을 고려할 수 있다.

**5. execute.js:9-13 — SQL 분할 정규식 엣지 케이스**

`body.sql` 문자열을 `;` 기준으로 분할하는 정규식 `/;\s*\n|;\s*$/`이 SQL 내 문자열 리터럴 안의 세미콜론도 분할한다. 예) `INSERT INTO t VALUES('hello; world')`. 프로덕션 다중 SQL 지원 시 파서 수준 분할이 필요하나, 현재 사용 목적(스키마 DDL 등)에서는 허용 가능한 제약이다. 주석 또는 문서화 권장.

**6. index.js:17 — `null`이 ALLOWED_ORIGINS 배열에 포함됨**

`ALLOWED_ORIGINS` 배열에 JavaScript `null` 값이 포함되어 있으나(17번째 줄), CORS 미들웨어에서는 `origin === 'null'` 문자열 비교를 별도로 처리하고 있다(22번째 줄). 배열의 `null` 항목은 실제로 `ALLOWED_ORIGINS.includes(origin)`에서 origin이 문자열 `'null'`일 때 일치하지 않는다(`null !== 'null'`). 배열의 `null` 항목은 불필요하며 오해를 유발한다.

- 수정 방안: 배열에서 `null` 제거, 주석을 22번째 줄 `origin === 'null'` 조건 옆으로 이동.

**7. tray.js:104 — `copyDir: true` 옵션과 `_prepTrayBin()` 충돌 가능성**

`_prepTrayBin()`에서 tray 바이너리를 수동 추출한 뒤, `new SysTray({ copyDir: true })`로 systray2에 복사를 허용한다. `pkg` 번들 환경에서 fse.copy 패치를 통해 재복사를 막고 있으나, 패치 실패 시(`fse` 없을 때) systray2가 손상된 소스에서 재복사를 시도할 수 있다. 현재 catch로 실패를 무시하므로 위험이 잠재하나, 정상 환경에서는 문제 없음.

**8. keystore.js:15 — Windows에서 `mode: 0o600` 무시**

`fs.writeFileSync(KEY_FILE, ..., { mode: 0o600 })`은 Linux/macOS에서만 파일 권한을 제한한다. Windows에서는 해당 모드가 무시되므로 키 파일이 다른 사용자에게 노출될 수 있다. Windows 환경에서는 `icacls` 또는 DPAPI를 활용한 추가 보호가 필요하다. 현재 로컬 미들웨어 특성상 허용 가능한 수준이지만, 보안 문서화 권장.

**9. config.js:79-91 — /config/test에서 임시 풀이 캐시에 저장됨**

`POST /config/test`는 테스트용 설정(아직 저장되지 않은)으로 `adapter.test()`를 호출한다. `adapter.test()`는 내부적으로 `execute()`→`getPool()`을 호출하고, 이 풀은 어댑터 모듈 내 `_pool`에 저장된다. 이후 실제 저장된 설정이 다른 경우 `configKey`가 달라 풀이 교체되지만, 테스트 설정과 저장 설정의 host/port/database/user가 동일하고 password만 다를 경우(password는 configKey에 포함되지 않음) 테스트 시점의 연결이 계속 재사용될 수 있다. 다만 password 변경 시 `POST /config`에서 `closeAllPools()`를 호출하므로 이 경우에는 풀이 교체된다. 현재 흐름에서 오동작 가능성은 낮으나 구조적으로 취약하다.

---

## 최종 권고

전체적으로 코드 품질이 양호하며 핵심 기능(암호화, DB 연결, SSE 스트리밍)의 구현은 올바르게 작성되었다. 레거시 암호화 자동 마이그레이션, 쿼리 타임아웃 설정, CORS 화이트리스트 방식 등 보안 의식이 반영된 구현이다.

**즉시 수정 권고 (심각):**
1. `mssql.js` getPool race condition — 동시 요청 시 풀 누수 가능
2. `crypto.js` 모듈 로드 시 예외 처리 미흡 — 서버 기동 실패 시 진단 어려움
3. `config.js:24` 비밀번호 없는 설정의 캐시 미설정 — 코드 일관성 결여

**합리적인 수정 범위 (경미):**
- `index.js` ALLOWED_ORIGINS 배열의 불필요한 `null` 제거
- `keystore.js` Windows 환경 파일 권한 한계 문서화

배포 전 심각 항목 3건을 수정한 후 재배포를 권고한다.
