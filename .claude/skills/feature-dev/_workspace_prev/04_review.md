## 리뷰 요약
- 전체 평가: PASS (주의사항 있음)

## 발견 사항

### 심각 (즉시 수정 필요)
- 없음

### 경미 (개선 권장)

**oracle.js:4-5** — 모듈 수준 단일 풀 변수(`_pool`, `_poolConfig`)  
oracle.js는 postgres.js·mssql.js와 동일한 단일 풀 패턴을 따른다. 이는 기존 어댑터와 일관된 패턴이므로 구조 자체는 문제없으나, 다중 프로파일 간 전환 시 풀이 즉시 교체됨(19번 줄 `_pool.close(0)`)을 인지해야 한다. 기존 어댑터도 동일한 구조이므로 설계상 허용된 트레이드오프이며 수정 필요 없음.

**oracle.js:8-13** — `configKey`에 `database` 사용, schema.js ORA_COLUMNS는 `SYS_CONTEXT('USERENV','CURRENT_SCHEMA')` 기반  
config 저장 시 `database` 필드를 Oracle의 service name으로 재사용한다. connectString에도 `config.database`를 그대로 사용하므로 동작 자체는 일관되다. 그러나 Oracle에서 `database` 필드가 실제로 무엇을 의미하는지(SID, Service Name, 등) UI 레이블이 여전히 "데이터베이스"로 표시되어 혼동 가능성이 있다. Oracle 연결 시 플레이스홀더를 `orcl`, `myservice` 등으로 변경하거나 레이블에 힌트를 제공하면 UX가 개선된다. (기능 정확성에는 영향 없음)

**package.json:19** — `oracledb ^6.4.0` pkg 빌드 시 네이티브 모듈 고려  
oracledb thin mode는 순수 JavaScript 구현으로 네이티브 바이너리가 없어 pkg 빌드와 호환된다. 단, `pkg.assets` 배열에 oracledb 관련 항목이 추가되지 않았는데, thin mode에서는 런타임 네이티브 로드가 없으므로 현재 구성으로 충분하다. 만약 향후 thick mode로 전환 시에는 assets 항목 추가가 필요하다.

**schema.js:110-115** — ORA_COLUMNS의 FROM 절: `all_tables UNION ALL all_views`  
`all_tab_columns c`를 서브쿼리 `t`와 JOIN한다. `all_tab_columns`는 테이블과 뷰 컬럼을 모두 포함하므로, 뷰 컬럼은 `t`(all_views)와도 매칭되어 중복 없이 정상 동작한다. 다만 `all_tab_columns`에는 현재 스키마 소유 객체뿐 아니라 권한이 부여된 타 스키마 객체도 포함될 수 있으므로 125번 줄 `WHERE c.owner = SYS_CONTEXT(...)` 조건이 반드시 필요하다. 이 조건은 정상적으로 추가되어 있음.

**schema.js:191** — `isNullable` 정규화 조건 `|| s(row.is_nullable) === 'Y'`  
Oracle `all_tab_columns.nullable`은 `'Y'` 또는 `'N'`을 반환한다. 기존 조건(`'YES'`, `true`, `1`)에 `'Y'`를 추가한 것은 정확하다. `is_pk`의 경우 ORA_COLUMNS는 `1`/`0`을 반환하므로 `!!row.is_pk`가 올바르게 동작한다.

**profile_manager.js:323** — `onclick` 인라인 핸들러에 이스케이프된 이름 삽입  
`_pmEsc()`로 이스케이프된 `eName`을 `onclick` 속성 값 내 작은따옴표 문자열로 삽입한다. `_pmEsc()`가 `'`를 `&#39;`로 변환하므로 프로파일 이름에 작은따옴표가 포함된 경우 `onclick` 속성 파싱은 정상이나, 함수 인자 문자열로 전달될 때 JavaScript 런타임에서 `&#39;`가 그대로 전달되어 실제 이름과 불일치가 발생할 수 있다. 예: 이름이 `O'Brien`이면 서버에 `O&#39;Brien`으로 전송된다. 프로파일 이름에 특수문자를 허용하지 않는다면 현재 UX에서 실질적 문제는 발생하지 않는다. 기존 코드(Oracle 추가 전)부터 존재하던 패턴이므로 이번 변경에서 새로 도입된 결함은 아님.

## 최종 권고

Oracle DB 지원 구현은 전반적으로 올바르다. 어댑터 구조·SQL 쿼리·이벤트 흐름 모두 기존 패턴을 일관되게 따르고 있으며, 즉시 수정이 필요한 심각 결함은 없다. 경미 항목들은 기능 동작에 영향을 주지 않으며 대부분 기존 코드와 공유하는 패턴이거나 Oracle 특유의 UX 힌트 부재에 해당한다.

릴리스 전 확인 권장 사항:
1. Oracle 실 환경에서 service name 기반 connectString(`host:port/serviceName`) 동작 검증
2. pkg 빌드 후 oracledb thin mode가 번들 내에서 정상 로드되는지 확인
