## 변경 파일 목록

### 신규 생성
| 파일 | 설명 |
|------|------|
| middleware/package.json | 의존성, pkg 빌드 설정 |
| middleware/.gitignore | node_modules, dist 제외 |
| middleware/src/index.js | Express 서버 (port 3737), CORS |
| middleware/src/routes/config.js | DB 접속정보 CRUD + 연결 테스트 |
| middleware/src/routes/execute.js | 단일 SQL + SSE 스트리밍 |
| middleware/src/db/connector.js | 어댑터 라우터 |
| middleware/src/db/adapters/postgres.js | pg 드라이버 |
| middleware/src/db/adapters/mysql.js | mysql2 드라이버 |
| middleware/src/db/adapters/mssql.js | mssql 드라이버 |
| middleware/src/utils/crypto.js | AES-256-GCM 암호화 |
| js/db_connect.js | 브라우저 연동 로직 |
| middleware/dist/uxermanager.exe | 빌드 결과물 (93MB) |

### 기존 수정
| 파일 | 변경 내용 |
|------|----------|
| index.html | 공유 메뉴에 "DB 연결 설정" 항목 추가, db_connect.js 스크립트 태그 추가 |

## 주요 설계 결정
- 접속정보 저장 위치: ~/.uxermanager/config.json (AES-256-GCM 암호화)
- SSE: POST /execute/stream — sqls 배열 또는 sql 문자열(세미콜론 분리)
- CORS: simjaesugn.github.io, localhost 계열만 허용
- 미들웨어 미실행 시: 안내 모달 표시
