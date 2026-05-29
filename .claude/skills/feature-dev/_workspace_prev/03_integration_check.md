## 단축키 동기화
- 상태: N/A
- 상세: 이번 변경에서 새 단축키 추가 없음 (01_analyst_plan.md 영향 분석 확인).

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: 새 localStorage 키 없음. reverse_engineer.js의 변경은 모듈 지역 변수(`_reverseEngineerStep`, `_reverseEngineerTables`)만 추가했으며 localStorage에 저장되지 않음.

## 상태 저장/로드
- 상태: N/A
- 상세: state.js에 새 상태 변수 없음.

## 렌더링 연동
- 상태: N/A
- 상세: 새 캔버스 시각 요소 없음.

## 미들웨어 README 동기화 (CLAUDE.md 규칙)
- 상태: OK
- 상세: `middleware/README.md`에 `GET /schema/tables` 신규 엔드포인트(252~270행), `GET /schema` 응답의 `isUnique`/`isAutoIncrement`/`fks[].card` 필드(282~328행), `POST /config`·`POST /config/profiles`·`PUT /config/profiles/:name`의 `schema` 필드(83~89, 195~198, 208~209행)가 모두 반영됨.

## schema.js 코드 일관성
- 상태: OK
- 상세:
  - `pgValidateSchema()` 함수(8~14행) — `/schema/tables`(316행)·`getQueries` PG 분기(194행) 양쪽에서 호출됨.
  - `router.get('/tables', ...)` (309행)이 `router.get('/', ...)` (334행)보다 먼저 정의됨. Express 라우팅 순서 문제 없음.
  - `buildResult(colRows, viewRows, fkRows, uniqueRows = [])` 시그니처(218행) 확인.
  - `getQueries(dbType, schema = 'public')` (191행) — schema 파라미터를 받아 `pgValidateSchema(schema)` 검증 후 PG 쿼리 함수에 전달.

## config.js schema 필드
- 상태: OK
- 상세:
  - `POST /config` (118행): `schema` 추출 및 저장(138행) 확인.
  - `POST /config/profiles` (183행): `schema` 추출 및 저장(205행) 확인.
  - `PUT /config/profiles/:name` (239행): `schema` 추출 및 `schema !== undefined` 조건부 저장(259행) 확인.
  - `GET /config` 응답(104~113행): `schema: config.schema || ''` 포함 확인.

## reverse_engineer.js UI/로직
- 상태: OK
- 상세:
  - `let _reverseEngineerStep = 1;` 선언(6행) 확인.
  - `_resetReverseEngineerUI()` 함수(60~71행)가 `closeReverseEngineerModal()`(56행) 및 `openReverseEngineerModal()`(47행) 양쪽에서 호출됨 확인.
  - 위치 보존 posMap 코드가 overwrite 분기(258~266행)에 위치. `physicalName.toLowerCase()` 키 정규화 비교 적용 확인.
  - `_buildEntitiesFromSchema`에서 `rowOffsets` 배열(324~327행) 사용 및 엔티티 생성 루프(358행) `y: rowOffsets[row]` 적용 확인.
  - `unique: c.isUnique ?? false` 및 `autoIncrement: c.isAutoIncrement ?? false` 패턴(343~344행) 확인.

## 최종 상태: PASS
