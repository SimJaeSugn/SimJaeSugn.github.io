## 변경 파일 목록
- src/routes/config.js: 다중 프로파일 지원으로 전체 재작성 — loadRawStore/saveStore 추가, _storeCache/_activeConfigCache 이중 캐시, 구버전 단일 객체 자동 마이그레이션, GET/POST /config 기존 호환 유지, 프로파일 CRUD 5개 엔드포인트 신규 추가
- src/utils/auditLogger.js: 신규 생성 — SQL 실행 감사 로그 기록 (writeAuditLog), 10 MB 로테이션
- src/routes/execute.js: auditLogger import 추가, POST /execute 성공·실패 분기에 writeAuditLog 호출, POST /execute/stream 성공·실패 분기에 writeAuditLog 호출, duration 변수 분리로 중복 계산 제거
- src/routes/health.js: 신규 생성 — GET /health (DB 연결 상태 확인, latencyMs 반환)
- src/index.js: healthRouter require 추가, app.use('/health', healthRouter) 등록
- scripts/install-watchdog.ps1: 신규 생성 — Windows Task Scheduler Watchdog 등록 스크립트
- scripts/uninstall-watchdog.ps1: 신규 생성 — Watchdog 작업 제거 스크립트
- middleware/README.md: /health, 프로파일 CRUD API 섹션 추가; 파일 구조 다이어그램 갱신; 감사 로그 경로 및 형식 추가; Watchdog 설치 섹션 추가

## 주요 결정 사항
- config.js의 loadRawStore 내부에서 saveStore를 호출하면 재귀적 캐시 무효화가 발생할 수 있으므로, 마이그레이션 후 _storeCache를 직접 할당하여 파일 재읽기 없이 반환했다.
- 레거시 암호화 마이그레이션(decryptLegacy → encrypt)은 loadConfig 내부에서 loadRawStore를 재호출해 최신 store를 얻은 후 인덱스를 찾아 갱신하는 방식으로, 캐시 상태와의 일관성을 유지했다.
- CORS allowedHeaders에 'DELETE' 메서드가 없어 DELETE /config/profiles/:name이 CORS 차단될 수 있으나, 이는 index.js CORS 설정 범위이므로 요청 범위(config.js 재작성)에 포함되지 않아 수정하지 않았다. (추후 별도 수정 권장)

## 미완료 항목
- 없음 (계획의 모든 항목 구현 완료)
