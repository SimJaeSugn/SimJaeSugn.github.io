## 리뷰 요약
- 전체 평가: **PASS (주의사항 있음)**

---

## 발견 사항

### 심각 (즉시 수정 필요)

**config.js:246 — `saveStore()` 후 중복 `invalidateCache()` 호출 (이중 무효화)**
- `saveStore()` 내부에서 이미 `invalidateCache()`를 호출하고 있음 (52번째 줄).
- `POST /config/profiles/:name/activate` 핸들러(246번째 줄)는 `saveStore()` 호출 후 다시 `invalidateCache()`를 수동으로 호출하여 불필요한 이중 호출이 발생함.
- 현재 구현은 단순 null 초기화라 기능 버그는 없으나, 향후 캐시 로직이 복잡해질 경우 의도치 않은 부작용이 생길 수 있음.
- **수정 방안:** `activate` 핸들러에서 `invalidateCache()` 수동 호출 제거 (saveStore 내부가 이미 처리).

**config.js:77 — 레거시 마이그레이션 중 `loadRawStore()` 재호출로 캐시 불일치 위험**
- 레거시 암호 마이그레이션 코드(77번째 줄)에서 `loadRawStore()`를 다시 호출하고 있음.
- 이때 `_storeCache`는 이미 채워져 있으므로 캐시된 값을 그대로 반환하는데, 직전에 `store` 변수(59번째 줄)와 동일 객체이므로 현재는 실제 문제 없음.
- 그러나 `saveStore()` 호출 이후 `_storeCache`가 null로 초기화되어 있는 상황이라면(다른 경로로 중간에 무효화된 경우) 파일을 재파싱하게 되어 예외가 발생할 수 있음.
- **수정 방안:** 이미 갖고 있는 `store` 변수를 직접 참조하도록 리팩터링하여 재호출 제거.

**auditLogger.js:23 — `result.rowCount` 가 undefined일 때 "undefined rows" 출력**
- `writeAuditLog('EXECUTE', ..., { durationMs: ..., rowCount: result.rowCount })` 호출 시 어댑터가 `rowCount`를 반환하지 않으면 `undefined rows`라는 로그가 남음.
- 특히 INSERT/UPDATE/DELETE 결과에서 어댑터별 반환 구조가 다를 수 있음.
- **수정 방안:** `result.rowCount ?? 0` 또는 `result.rowCount ?? 'N/A'` 형태로 방어 처리.

**execute.js:16 — 이스케이프 문자(`\\`) 처리 불완전 (SQL 파서 edge case)**
- `splitSql`에서 백슬래시 이스케이프를 `sql[i-1] !== '\\'` 조건으로 검사하고 있음.
- `i === 0`일 때 `sql[-1]`은 `undefined`이므로 조건은 `undefined !== '\\'` → `true`가 되어 의도치 않게 첫 문자가 이스케이프로 처리될 수 있음 (실제로 첫 문자가 `'`나 `"`인 경우).
- 또한 연속 백슬래시(`\\`)를 인식하지 못해 `SELECT '\\'` 같은 쿼리에서 파서가 잘못 동작할 수 있음.
- **수정 방안:** `i > 0 && sql[i-1] === '\\'` 조건으로 변경하거나, 상태 기반 이스케이프 추적 변수 도입.

---

### 경미 (개선 권장)

**config.js:31 — JSON 파싱 오류 미처리**
- `JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))`가 try-catch 없이 호출됨. config.json이 손상된 경우 uncaught exception으로 서버 전체가 중단될 수 있음.
- **개선 방안:** `loadRawStore()` 내부에 try-catch를 추가하고 파싱 실패 시 `null` 또는 에러 응답 반환.

**config.js:212 — 프로파일 이름 path traversal 가능성 (저위험)**
- `DELETE /config/profiles/:name`에서 `req.params.name`을 받아 profile 이름으로 사용함.
- 현재는 파일 시스템에 직접 사용하지 않고(JSON 내 배열 필터링에만 사용) path traversal 위험은 없음.
- 다만 이름에 특수문자(`../`, `<script>` 등)가 들어갈 경우 JSON 출력에 그대로 포함되어 로그나 클라이언트에 노출될 수 있음.
- **개선 방안:** 프로파일 이름 정규식 검증 추가 (예: `/^[a-zA-Z0-9가-힣 _-]{1,50}$/`).

**config.js:122-149 — `POST /config` 에서 store.active가 null/빈 문자열인 경우**
- `store = { profiles: [], active: '기본' }`으로 초기화 후, `findIndex`가 -1이면 push하므로 기능상 동작함.
- 그러나 `store.active`가 빈 문자열(`""`)인 경우 의도치 않은 이름으로 프로파일이 생성될 수 있음.
- **개선 방안:** `activeName`이 유효한 문자열인지 확인 후 기본값('기본') 대체 처리.

**auditLogger.js:전체 — `writeAuditLog` 실패 시 예외 전파 위험**
- `fs.appendFileSync`나 `rotateIfNeeded`의 `fs.renameSync` 등이 실패(권한 오류, 디스크 풀 등)하면 예외가 호출부(execute.js)로 전파됨.
- execute.js는 `writeAuditLog`를 try-catch 없이 호출하므로 감사 로그 실패가 요청 처리 실패로 이어질 수 있음.
- **개선 방안:** `writeAuditLog` 내부를 try-catch로 감싸거나, execute.js 호출부에 개별 try-catch 추가.

```js
// auditLogger.js 권장 수정
function writeAuditLog(tag, sql, result) {
  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    rotateIfNeeded();
    // ... 기존 로직
  } catch (err) {
    console.error('[AuditLogger] 로그 기록 실패:', err.message);
  }
}
```

**health.js:전체 — HTTP 상태코드 불일치**
- DB 연결 실패 시 `res.json({ ok: false, ... })`으로 200 OK를 반환함.
- health check 용도이므로 연결 실패 시 503 Service Unavailable을 반환하는 것이 표준적이며, 모니터링 도구가 이를 올바르게 감지할 수 있음.
- **개선 방안:** `res.status(503).json({ ok: false, db: { connected: false, error: err.message } })`.

**install-watchdog.ps1:전체 — ExePath 존재 여부 미검증**
- `$ExePath` 파라미터로 받은 경로가 실제로 존재하는지 확인하지 않고 Task를 등록함.
- 경로가 잘못되면 태스크는 등록되지만 실행 시 오류가 발생하여 사용자가 원인을 파악하기 어려움.
- **개선 방안:** 스크립트 상단에 `if (-not (Test-Path $ExePath)) { throw "실행 파일을 찾을 수 없습니다: $ExePath" }` 추가.

**crypto.js:11 — LEGACY_KEY 하드코딩 (31바이트 실제 사용)**
- `'uxermanager-local-secret-key-32b'`는 UTF-8로 31바이트임 (aes-256-gcm은 정확히 32바이트 필요).
- Node.js의 `createDecipheriv`는 키 길이 불일치 시 에러를 던지므로, 레거시 데이터를 복호화할 때 런타임 오류가 발생할 수 있음.
- **확인 필요:** `Buffer.byteLength('uxermanager-local-secret-key-32b', 'utf8')`가 32인지 실제 테스트 필요 (ASCII만 사용 시 31바이트).
- **개선 방안:** 실제 32바이트 확보(`'uxermanager-local-secret-key-32b!'`) 또는 `Buffer.alloc(32)` 패딩 처리.

---

## 최종 권고

전체적으로 설계 의도가 명확하고 구조가 잘 분리되어 있음. 심각 등급 4개 중 `invalidateCache` 이중 호출은 현재 버그로 이어지지 않지만 잠재적 위험이 있으며, `auditLogger` 예외 전파와 `crypto.js` 레거시 키 길이 문제는 실제 운영 환경에서 장애를 유발할 수 있으므로 우선 수정을 권고함.

**즉시 수정 권고 (우선순위 순):**
1. `auditLogger.js` — `writeAuditLog` 전체를 try-catch로 감싸 예외 전파 차단
2. `crypto.js` — LEGACY_KEY 길이(32바이트 여부) 검증 및 패딩 보정
3. `execute.js:16` — `splitSql` 이스케이프 처리 `i > 0` 조건 추가
4. `config.js:246` — `activate` 핸들러 불필요한 `invalidateCache()` 제거

**개선 권고:**
- `config.js:31` — `loadRawStore()` JSON 파싱 try-catch 추가
- `health.js` — 연결 실패 시 503 반환
- `install-watchdog.ps1` — ExePath 존재 검증 추가
- 프로파일 이름 입력값 정규식 검증 추가
