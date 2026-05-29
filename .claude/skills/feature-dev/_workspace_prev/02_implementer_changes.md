# 02 구현 결과

## 변경 파일 목록
- middleware/src/routes/schema.js: Oracle 시스템 뷰 `user_*` 전환, UNIQUE/AUTO_INCREMENT 컬럼 추출, FK 카디널리티 동적 설정(uniqueSet 기반 1:1/1:N), PostgreSQL 스키마 파라미터화(화이트리스트 검증 후 문자열 치환), `/schema/tables` 라우트 신규 추가.
- middleware/src/routes/config.js: POST `/config`, POST `/config/profiles`, PUT `/config/profiles/:name` 가 `schema` 필드를 수용하고 저장. GET `/config` 응답에 `schema` 필드 포함.
- js/reverse_engineer.js: 엔티티 배치 겹침 수정(행별 최대 높이 기반 동적 Y 오프셋, X 갭 30px 추가, 컬럼 폭 240px), 덮어쓰기 시 기존 엔티티 위치(physicalName 기준) 보존, 모달을 2단계 UI로 개편(1단계: 옵션 + 테이블 목록 조회 → 2단계: 체크박스로 대상 테이블 선택 후 ERD 생성). 클라이언트가 서버에서 받은 `fk.card`·`column.isUnique`·`column.isAutoIncrement` 값을 그대로 사용하도록 변경.
- middleware/README.md: GET `/schema/tables` 신규 엔드포인트 추가, GET `/schema` 응답 스키마에 `columns[].isUnique`, `columns[].isAutoIncrement`, `fks[].card` 필드 추가, POST `/config`·POST `/config/profiles`·PUT `/config/profiles/:name` 요청 Body 및 GET `/config` 응답에 `schema` 필드 추가.

## 주요 결정 사항
- **PostgreSQL adapter 파라미터화 불가**: `middleware/src/db/adapters/postgres.js` 의 `execute(config, sql)` 가 세 번째 인자(params)를 받지 않으며 내부에서 `pool.query(sql)` 만 호출한다. 따라서 계획에 따라 안전 대안인 화이트리스트(`^[A-Za-z0-9_.]+$`) 검증 후 문자열 치환을 택했다. `pgValidateSchema()` 함수로 캡슐화하여 `/schema`·`/schema/tables` 양쪽에서 재사용한다.
- **`/schema` 라우트의 `?tables=` 필터는 클라이언트 측 필터링으로 대체**: 계획대로 서버 측 동적 IN 절을 도입하지 않고, 전체 `/schema` 조회 결과를 받은 뒤 선택된 테이블 집합으로 `tables`/`views`/`fks` 를 필터링한다. FK 는 양쪽 테이블이 모두 선택된 경우만 유지한다.
- **PG·MSSQL·Oracle 컬럼 쿼리의 `is_unique` 는 SQL 단에서 항상 false 로 반환**: 실제 UNIQUE 판정은 buildResult 의 uniqueSet(별도 UNIQUE 쿼리 결과) 으로 OR 보정한다. MySQL 만 `column_key = 'UNI'` 가 단일 컬럼 UNIQUE 를 직접 알려주므로 SQL 단에서도 채워 둔다.
- **클라이언트의 `_buildEntitiesFromSchema` 의 엔티티 ID 생성 로직, 컬럼 attr 매핑 등 다른 부분은 보존**: `unique`/`autoIncrement` 만 서버 값을 반영하도록 `?? false` 패턴으로 안전하게 교체.
- **모달 UI 너비 440 → 480px 로 확장**: 2단계의 테이블 체크리스트가 가독성을 가지도록. 모달 닫힘 시 `_reverseEngineerStep`·`_reverseEngineerTables` 및 UI 가 자동 초기화되도록 `_resetReverseEngineerUI()` 헬퍼 추가.

## 미완료 항목
- 없음. 계획의 7개 항목(6-1, 6-2, 6-3, 6-4, 6-5, 6-6, 6-7) 및 README 갱신을 모두 구현했다.
