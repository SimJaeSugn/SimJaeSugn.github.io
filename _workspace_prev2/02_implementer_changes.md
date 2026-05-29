## 변경 파일 목록
- `js/db_connect.js`: Oracle 선택 시 Instant Client 안내 및 clientLibDir 입력 섹션 표시, saveDbConfig/testDbConfig payload에 clientLibDir 포함, _fillForm에서 값 복원 및 섹션 표시 처리
- `middleware/src/routes/config.js`: GET /config 응답에 clientLibDir 포함, POST /config·POST /config/test·POST /config/profiles·PUT /config/profiles/:name 모두 clientLibDir 처리 추가
- `middleware/README.md`: POST /config·GET /config·POST /config/profiles·PUT /config/profiles/:name 요청/응답 예시에 clientLibDir 선택 필드 추가

## 주요 결정 사항
- `POST /config/test` 라우트에서 `clientLibDir`을 어댑터에 전달할 때 `undefined`로 넘기면 oracle.js의 `config.clientLibDir` 체크가 undefined를 받으므로, Oracle이고 값이 있을 때만 포함하도록 처리했다. 계획 명세와 동일하다.
- PUT /config/profiles/:name에서 `clientLibDir`이 요청에 포함되지 않은 경우(`=== undefined`) 기존 값을 유지하고, 명시적으로 빈 문자열을 보내거나 oracle이 아닌 경우 빈 문자열로 저장하도록 처리했다.

## 미완료 항목
- 없음
