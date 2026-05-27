## 변경 파일 목록

- src/utils/keystore.js: 신규 생성 - ~/.uxermanager/key 파일 기반으로 AES-256-GCM 암호화 키를 로드 또는 최초 생성
- src/utils/crypto.js: loadOrCreateKey() 기반 KEY로 교체, LEGACY_KEY 보존, decryptLegacy() 추가, exports에 decryptLegacy 포함
- src/db/adapters/mssql.js: mssql.connect() 매번 생성하던 방식 → ConnectionPool 기반 싱글톤 풀링으로 전체 재작성, closePool() 추가
- src/db/adapters/postgres.js: Client 매번 생성하던 방식 → Pool 기반 싱글톤 풀링으로 전체 재작성, closePool() 추가
- src/db/adapters/mysql.js: createConnection() 매번 생성하던 방식 → createPool() 기반 싱글톤 풀링으로 전체 재작성, MAX_EXECUTION_TIME 설정, closePool() 추가
- src/db/connector.js: closeAllPools() 함수 추가 및 exports에 포함
- src/routes/config.js: decryptLegacy·closeAllPools import 추가; _configCache/invalidateCache 추가; loadConfig()에 캐시 + 레거시 키 마이그레이션 로직 추가; POST /config를 async로 변경하여 저장 후 invalidateCache()·closeAllPools() 호출
- src/routes/execute.js: POST /execute/stream 라우트에 stopOnError 옵션 추가, catch 블록에 if (stopOnError) break 분기 추가
- src/index.js: package.json에서 version 동적 로드; express.json({ limit: '10mb' }) 적용; CORS null origin 주석 명확화; app.listen → const server = app.listen으로 변경 후 EADDRINUSE 에러 핸들러 추가; /ping의 version 하드코딩 제거
- src/tray.js: _appVersion을 package.json에서 동적 로드하여 트레이 제목에 반영

## 주요 결정 사항

- 계획과 동일하게 구현함. 특이 사항 없음.
- config.js의 loadConfig()에서 마이그레이션 성공 후 _configCache 세팅 시 { ...raw, password } 형태로 저장 (raw.password는 암호문이지만 password 변수로 평문을 덮어쓰는 spread 순서가 맞아 정상 동작).

## 미완료 항목

없음. 계획의 모든 항목을 구현 완료.
