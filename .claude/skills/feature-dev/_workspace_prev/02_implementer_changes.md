## 변경 파일 목록
- middleware/package.json: `oracledb: ^6.4.0` 의존성 추가
- middleware/src/db/adapters/oracle.js: Oracle thin mode 커넥션 풀 어댑터 신규 생성 (execute, test, closePool)
- middleware/src/db/connector.js: oracle 어댑터 require 및 adapters 객체 등록, 에러 메시지 업데이트
- middleware/src/routes/config.js: getDefaultPort에 oracle: 1521 추가
- middleware/src/routes/schema.js: ORA_COLUMNS, ORA_VIEWS, ORA_FKS 쿼리 상수 추가, getQueries switch에 oracle case 추가, buildResult의 isNullable 정규화에 'Y' 조건 추가
- js/db_connect.js: _onDbTypeChange defaults에 oracle: 1521 추가, dbConnType select에 Oracle 옵션 추가
- js/profile_manager.js: _pmAutoPort defaults에 oracle: 1521 추가, 추가 폼(pmAddType)과 인라인 편집 폼(data-field="dbType") select에 Oracle 옵션 추가
- middleware/README.md: 지원 DB 표에 oracle 행 추가, 파일 구조 섹션에 oracle.js 항목 추가

## 주요 결정 사항
- README.md 파일 구조 섹션 수정 시 Edit 도구가 특수 문자(│, ├, └)와 CRLF 혼용으로 매칭 실패 → PowerShell의 String.Replace로 직접 처리
- Oracle 어댑터는 계획대로 thin mode 채택하여 네이티브 바이너리 없이 동작하도록 구현

## 미완료 항목
- 없음 (계획의 모든 항목 구현 완료)
