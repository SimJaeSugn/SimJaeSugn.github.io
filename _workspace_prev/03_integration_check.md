## 단축키 동기화
- 상태: N/A (미들웨어 전용 변경)

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js: N/A

## 상태 저장/로드
- 상태: N/A

## 렌더링 연동
- 상태: N/A

---

## 미들웨어 특화 검사

### A. 모듈 연결 일관성

| 항목 | 결과 | 비고 |
|------|------|------|
| auditLogger.js 존재 | OK | `~/.uxermanager/audit.log` 기록, 10MB 로테이션 |
| auditLogger.js `writeAuditLog` export | OK | `module.exports = { writeAuditLog }` |
| health.js 존재 | OK | |
| health.js `loadConfig` import | OK | `require('./config')` |
| health.js `getAdapter` import | OK | `require('../db/connector')` |
| health.js `GET /` 라우터 구현 | OK | DB 연결 테스트 후 latencyMs 반환 |
| execute.js `auditLogger` import | OK | `require('../utils/auditLogger')` |
| execute.js `writeAuditLog` 호출 (POST /execute 성공) | OK | `writeAuditLog('EXECUTE', sql, { durationMs, rowCount })` |
| execute.js `writeAuditLog` 호출 (POST /execute 실패) | OK | `writeAuditLog('EXECUTE', sql, { error: err.message })` |
| execute.js `writeAuditLog` 호출 (POST /execute/stream 성공) | OK | `writeAuditLog('STREAM', sql, { durationMs, rowCount })` |
| execute.js `writeAuditLog` 호출 (POST /execute/stream 실패) | OK | `writeAuditLog('STREAM', sql, { error: err.message })` |
| config.js 라우터 `GET /profiles` | OK | 비밀번호 마스킹 후 전체 목록 반환 |
| config.js 라우터 `POST /profiles` | OK | 중복 이름 409 거부 |
| config.js 라우터 `DELETE /profiles/:name` | OK | 활성/마지막 프로파일 삭제 400 거부 |
| config.js 라우터 `POST /profiles/:name/activate` | OK | closeAllPools() 호출 후 전환 |
| config.js `loadConfig` export | OK | `module.exports.loadConfig = loadConfig` |
| index.js `healthRouter` 등록 | OK | `app.use('/health', healthRouter)` |
| index.js CORS `methods`에 `DELETE` 포함 | OK | `['GET', 'POST', 'DELETE', 'OPTIONS']` |

### B. 다중 프로파일 로직 정확성

| 항목 | 결과 | 비고 |
|------|------|------|
| `loadRawStore()` 구버전 단일 객체 마이그레이션 | OK | `if (!raw.profiles)` 체크 후 `{ profiles: [{ name: '기본', ...raw }], active: '기본' }` 형태로 변환 및 파일 재기록 |
| `loadConfig()` 기존 시그니처 유지 (활성 프로파일 평문 반환) | OK | store에서 active 이름으로 프로파일 조회 후 decrypt 적용, 레거시 키 자동 마이그레이션 포함 |
| `saveStore()` 호출 후 `invalidateCache()` 실행 | OK | `saveStore()` 내부 마지막에 `invalidateCache()` 호출 |
| `DELETE /profiles/:name` 활성 프로파일 삭제 거부 | OK | `store.active === name` 시 400 반환 |
| `DELETE /profiles/:name` 마지막 프로파일 삭제 거부 | OK | `store.profiles.length <= 1` 시 400 반환 |
| `POST /profiles/:name/activate` `closeAllPools()` 호출 | OK | `saveStore()` → `invalidateCache()` → `await closeAllPools()` 순서 실행 |

**참고:** `POST /profiles/:name/activate`에서 `saveStore()` 내부의 `invalidateCache()` 호출 이후 라우터 본문에서 `invalidateCache()`를 한 번 더 호출하는 중복이 있으나, 기능 오류는 없음.

### C. 감사 로그 완전성

| 항목 | 결과 | 비고 |
|------|------|------|
| `POST /execute` 성공 시 `writeAuditLog('EXECUTE', ...)` | OK | `{ durationMs, rowCount }` 포함 |
| `POST /execute` 실패 시 `writeAuditLog('EXECUTE', ...)` | OK | `{ error: err.message }` 포함 |
| `POST /execute/stream` 각 SQL 성공 시 `writeAuditLog('STREAM', ...)` | OK | `{ durationMs, rowCount }` 포함 |
| `POST /execute/stream` 각 SQL 실패 시 `writeAuditLog('STREAM', ...)` | OK | `{ error: err.message }` 포함 |

### D. Watchdog 스크립트

| 항목 | 결과 | 비고 |
|------|------|------|
| `scripts/install-watchdog.ps1` 존재 | OK | |
| `scripts/uninstall-watchdog.ps1` 존재 | OK | |

### E. README 동기화

| 항목 | 결과 | 비고 |
|------|------|------|
| `/health` API 섹션 | OK | `GET /health` 섹션에 응답 예시 3가지(성공/접속정보없음/연결실패) 기술 |
| `/config/profiles` 관련 API 섹션 | OK | GET/POST/DELETE/activate 4개 엔드포인트 모두 기술 |
| 감사 로그(`audit.log`) 경로 및 설명 | OK | `## 접속정보 저장 위치` 하단 `### 감사 로그 (audit.log)` 섹션에 OS별 경로·형식·로테이션 설명 포함 |
| Watchdog 설치 섹션 | OK | `## Watchdog 설치 (Windows)` 섹션에 등록/제거 명령어 포함 |
| 파일 구조에 `health.js` 반영 | OK | `routes/health.js` 기술됨 |
| 파일 구조에 `auditLogger.js` 반영 | OK | `utils/auditLogger.js` 기술됨 |
| 파일 구조에 `scripts/` 반영 | OK | `install-watchdog.ps1`, `uninstall-watchdog.ps1` 모두 기술됨 |

- 상태: OK (수정 불필요)

---

## 최종 상태: PASS

모든 검사 항목이 정상 확인됨. 미해결 이슈 없음.

> **참고 (비기능적 중복):** `config.js`의 `POST /profiles/:name/activate` 라우터에서 `saveStore()` 내부와 라우터 본문 양쪽에서 `invalidateCache()`가 호출되는 중복이 존재하나, 동작 오류는 없음. 향후 정리 대상.
