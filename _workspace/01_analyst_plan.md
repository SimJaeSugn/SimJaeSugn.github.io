## 요청 요약
Node.js REST API 미들웨어 구현 - DB 접속정보 로컬 암호화 저장, SSE 실시간 진행률, pkg exe 빌드, ERD 공유 메뉴에 DB 연결 설정 UI 추가

## 탐색한 파일
- index.html: 공유 메뉴 구조, 모달 패턴, script 태그 순서
- js/share.js: 기존 공유 기능 패턴

## 영향 분석
- 단축키 변경: 없음
- 새 localStorage 키: 없음 (접속정보는 미들웨어 로컬 파일에 저장)
- 새 데이터 배열/상태 변수: 없음
- 기타 파급 효과: 공유 메뉴에 항목 추가, db_connect.js 신규 파일

## 구현 계획
### 파일: middleware/ (신규)
- package.json, .gitignore
- src/index.js: Express 서버 port 3737
- src/routes/config.js: POST/GET /config, POST /config/test
- src/routes/execute.js: POST /execute, POST /execute/stream (SSE)
- src/db/connector.js: 어댑터 라우터
- src/db/adapters/postgres.js, mysql.js, mssql.js
- src/utils/crypto.js: AES-256-GCM

### 파일: js/db_connect.js (신규)
- openDbConnectModal(), saveDbConfig(), testDbConfig()
- _mwPing() 미들웨어 실행 확인

### 파일: index.html
- 공유 메뉴에 "DB 연결 설정" 항목 추가
- db_connect.js 스크립트 태그 추가
