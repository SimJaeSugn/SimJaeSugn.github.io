## 단축키 동기화
- 상태: N/A (미들웨어 작업)

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js: N/A

## 상태 저장/로드
- 상태: N/A

## 렌더링 연동
- 상태: N/A

## 미들웨어 특화 검사

### A. 모듈 연결 일관성
- `src/utils/keystore.js` 파일 존재 여부: OK
  - `loadOrCreateKey()` 구현 및 `module.exports` 정상
- `src/utils/crypto.js`에서 keystore.js require: OK
  - `require('./keystore')` 로 `loadOrCreateKey` import
  - `decryptLegacy` exports에 포함: OK (`module.exports = { encrypt, decrypt, decryptLegacy }`)
- `src/db/connector.js`에서 `closeAllPools` exports: OK
  - `module.exports = { getAdapter, closeAllPools }` 확인
- `src/routes/config.js`에서 `decryptLegacy`, `closeAllPools` import: OK
  - `const { encrypt, decrypt, decryptLegacy } = require('../utils/crypto')`
  - `const { getAdapter, closeAllPools } = require('../db/connector')`

### B. 풀링 일관성
- `postgres.js` `closePool()` exports: OK (`module.exports = { execute, test, closePool }`)
- `mysql.js` `closePool()` exports: OK (`module.exports = { execute, test, closePool }`)
- `mssql.js` `closePool()` exports: OK (`module.exports = { execute, test, closePool }`)
- `connector.js`의 `closeAllPools()`가 어댑터들의 `closePool()` 호출: OK
  - `Object.values(adapters)` 순회하며 `adapter.closePool()` 호출
- `config.js` POST /config 핸들러가 async이고 저장 후 `closeAllPools()` 호출: OK
  - `router.post('/', async (req, res) => { ... await closeAllPools(); ... })`

### C. 캐시 무효화
- `config.js`의 `loadConfig()`가 `_configCache`를 먼저 확인: OK
  - `if (_configCache) return _configCache;` 첫 줄에서 체크
- POST /config 저장 후 `invalidateCache()` 호출: OK
  - `invalidateCache()` 호출 후 `await closeAllPools()` 순서 정상

### D. stopOnError 구현
- `execute.js`의 SSE 스트리밍에서 `stopOnError` 파싱: OK
  - `const stopOnError = req.body.stopOnError === true;`
- catch 블록에서 `stopOnError` 분기: OK
  - `if (stopOnError) break;` — 오류 발생 시 루프 탈출

### E. README 동기화
- `keystore.js` 신규 파일 (파일 구조 섹션): OK
  - `utils/keystore.js — ~/.uxermanager/key 기반 암호화 키 생성·로드` 반영됨
- 커넥션 풀링 적용 (어댑터 설명): OK
  - 파일 구조에 `(커넥션 풀링)` 명시됨 (postgres, mysql, mssql 모두)
  - `connector.js — dbType → 어댑터 라우팅, 전체 풀 종료` 반영됨
  - POST /config 설명에 "기존 DB 커넥션 풀을 모두 닫고 설정 캐시를 초기화한다" 반영됨
- `stopOnError` 옵션 (API 레퍼런스 POST /execute/stream): OK
  - `stopOnError: true` 예시 및 설명 반영됨
- 버전 동적 로드 (GET /ping 응답): OK
  - `` `version` 값은 `package.json`의 버전을 그대로 반환한다.`` 반영됨
- EADDRINUSE 처리: OK (index.js에 구현됨, README에 별도 섹션 없으나 실행/빌드 섹션에 포트 정보 있음 — 추가 문서화 불필요)
- `express.json` 10mb limit: OK (index.js에 `express.json({ limit: '10mb' })` 구현됨, README에 API 레퍼런스에서 암묵적으로 지원)

## 최종 상태: PASS

모든 검사 항목 이상 없음. 누락된 구현 또는 README 미동기화 항목 없음.
