## 리뷰 요약
- 전체 평가: **PASS (주의사항 있음)**
- 7개 개선 항목(6-1 ~ 6-7) 및 README 갱신이 계획대로 모두 구현됨. 핵심 기능 및 보안 측면은 합격이지만 일부 경미한 개선 권장 사항과 잠재 엣지 케이스가 있다.

---

## 발견 사항

### 심각 (즉시 수정 필요)
- **없음**

### 경미 (개선 권장)

1. **schema.js:218–245 — `isAutoIncrement` Bool 평가의 이중 처리 모호성**
   - 현재 코드:
     ```js
     isAutoIncrement: !!(row.is_auto_increment || s(row.is_auto_increment) === 'true')
     ```
   - 문제: `s(val)`이 `null`이면 `null`을 반환하므로 `null === 'true'`는 항상 false라 안전하지만, `row.is_auto_increment`가 `0`(MSSQL/Oracle CASE의 false 결과)일 때는 `!!(0 || ...) → false`로 올바르게 동작한다. 다만, `s(true)`가 문자열 `"true"`로 반환되는 케이스(드라이버에 따른 boolean 직렬화)에만 의미 있는 fallback이라 의도가 불명확. 일반적으로 `!!row.is_auto_increment`만으로 충분하므로 OR 분기 제거 권장.
   - 수정 방안: `isAutoIncrement: !!row.is_auto_increment` 또는 `s(row.is_auto_increment) === 'true' || row.is_auto_increment === 1 || row.is_auto_increment === true`처럼 명시적 비교로 단순화.

2. **schema.js:23, 87, 126 — `is_unique`를 SQL에서 false 고정, JS에서 OR 보정 (의도된 결정이나 코드 가독성 저하)**
   - PG/MSSQL/Oracle 컬럼 쿼리에서 `false AS is_unique`로 항상 false를 반환하고, `buildResult`에서 별도 `uniqueRows`로부터 보정한다. 구현자 메모(02_implementer_changes.md)에 명시되어 있으나, SQL 단의 `false AS is_unique` 컬럼은 죽은 코드처럼 보여 후속 유지보수자가 혼동할 수 있다.
   - 수정 방안: 코드 주석으로 `-- 실제 unique 판정은 buildResult.uniqueSet에서 처리. 여기서는 컬럼 정렬 일관성 유지를 위해 false 고정` 명시 권장.

3. **schema.js:60 (MySQL `MY_COLUMNS`) — `column_key = 'UNI'`의 복합 UNIQUE 인덱스 한계 (analyst 메모 항목)**
   - MySQL의 `column_key`는 단일 컬럼 UNIQUE에서 'UNI', 복합 UNIQUE의 첫 컬럼에서는 'MUL'을 반환한다. 따라서 복합 UNIQUE 인덱스의 첫 컬럼은 SQL 단에서 false로 잡힌다.
   - 다행히 `MY_UNIQUE` 쿼리(line 169–173)에서 `information_schema.statistics`의 `non_unique = 0` 조건으로 전체 UNIQUE 인덱스 컬럼을 별도 조회하고, `buildResult`에서 OR 보정하므로 **실질적인 누락은 없다**. 다만 MySQL의 `IF(c.column_key='UNI', true, false)` SQL은 사실상 불필요한 중복 평가가 된다.
   - 수정 방안: MySQL도 PG/MSSQL/Oracle처럼 `false AS is_unique`로 통일하거나, 현재 형태를 유지하되 주석으로 의도 명시.

4. **reverse_engineer.js:315–327 — `all.length === 0` 시 `rowCount = 0`에서 `rowOffsets = [60]` 단일 원소로 남음**
   - `rowCount = Math.ceil(0 / 5) = 0` → `rowMaxH = []`, `rowOffsets = [OFFSET_Y]`로 초기화되고 for 루프는 실행되지 않는다.
   - 이후 entities 생성 루프(line 332)도 빈 배열이므로 `rowOffsets[row]` 접근이 발생하지 않아 런타임 에러는 없다. **실질적으로 안전하다.** 다만 명시적 가드(early return)가 있으면 더 견고하다.
   - 수정 방안: 선택 사항. 가독성을 위해 `if (!all.length) return { entities: [], entityIdMap: {} };` 추가 가능.

5. **reverse_engineer.js:179 — `data-name="${it.name}"` 의 잠재 XSS 위험**
   - DB에서 받은 테이블명을 HTML 속성에 이스케이프 없이 직접 삽입한다. 일반 DB 객체 이름에는 따옴표·꺽쇠가 들어가지 않지만, PostgreSQL/Oracle의 따옴표 식별자(`"User<script>"`) 같은 비정상 이름이라면 속성 인젝션 가능성이 있다.
   - 영향도: 로컬 미들웨어 + 본인 DB 접속 컨텍스트로 한정되어 외부 공격 표면은 작지만, 방어적 코딩이 권장된다.
   - 수정 방안: 간단한 escape 헬퍼 도입.
     ```js
     const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
     ```
     를 `it.name`, `badge` 외 텍스트 노드에도 적용.

6. **reverse_engineer.js:220 — `/schema` 호출 시 전체 결과를 가져오고 클라이언트 필터링**
   - 02_implementer_changes.md에 명시된 의도된 결정. 그러나 테이블이 수백 개 이상인 DB에서는 사용자가 1개만 선택해도 전체 컬럼/FK/UNIQUE를 모두 받는다.
   - 영향: 성능 저하 가능 (대규모 스키마에서). 보안·기능 정확성에는 문제 없음.
   - 수정 방안: 후속 작업으로 서버 측 `?tables=` 필터링 도입 고려 (현재 단계에서는 의도된 단순화 결정으로 OK).

7. **reverse_engineer.js:265 — `e.x = posMap[key].x` 시 z-order(배열 순서)는 새 엔티티 순서로 재배치됨**
   - 좌표는 보존되지만 배열 인덱스가 바뀌어 캔버스 렌더링 시 겹침 z-index가 달라질 수 있다.
   - 영향도: 미미. 사용자가 사전에 배치를 정리해 둔 경우 렌더링 순서 차이는 작다.

8. **schema.js:32, 34, 51, 166, 282 — 화이트리스트 검증 통과 후 문자열 치환된 schema 값이 SQL에 `'${schema}'`로 inline**
   - 검증 정규식: `^[A-Za-z0-9_.]+$`
   - 평가: 알파뉴메릭+언더스코어+점만 허용하므로 따옴표/세미콜론/공백/주석문자(`--`, `/*`)가 차단된다. **SQL Injection 방지로 충분하다.**
   - 부수 효과: `.`(점) 허용으로 `schema.subschema` 같은 값이 들어와도 정규식은 통과하지만, PostgreSQL `information_schema.tables.table_schema`는 단일 식별자이므로 매칭이 안 돼 빈 결과가 나올 뿐 보안 위험은 없다.
   - 수정 방안: 점 허용이 의도가 아니라면 `^[A-Za-z0-9_]+$`로 더 엄격하게 제한. (의도된 결정이라면 OK)

9. **reverse_engineer.js:209–212 — 0개 선택 시 에러 메시지 노출 후 `btn`은 disabled 상태가 유지됨**
   - 코드 흐름:
     ```js
     if (!checked.length) {
       errEl.textContent = '최소 한 개 이상의 테이블을 선택하세요.';
       errEl.style.display = 'block';
       return;
     }
     btn.disabled = true;  // 위 return 이후 실행되지 않음
     ```
   - `btn.disabled = true`는 0개 선택 분기 이후 실행되므로, 0개 선택 시에는 버튼이 다시 disabled되지 않고 그대로 활성화 유지. **올바른 동작**이다.
   - 다만 `_runReverseEngineerStep1()`의 finally에서 `btn.disabled = false`로 해제하므로 2단계 진입 후 0개 선택 시에도 사용자가 계속 시도 가능. **OK.**

10. **README.md:170–172 — `GET /config/profiles` 응답 예시에 `schema` 필드 미포함**
    - `POST /config/profiles`, `PUT /config/profiles/:name`, `GET /config` 응답에는 schema 필드가 추가되었으나, `GET /config/profiles` 응답 예시(line 162–177)에는 schema 필드가 누락되어 있다. 실제 코드(config.js:173)는 `...p`로 spread하므로 schema가 저장돼 있다면 자동 노출된다.
    - 수정 방안: 응답 예시에 `"schema": "public"` 한 줄 추가.

---

## Express 라우트 순서 (사용자 요청 검증)
- `router.get('/tables', ...)` (line 309) 가 `router.get('/', ...)` (line 334) 보다 먼저 등록됨 — **OK**.
- Express에서 정확한 경로 `/tables`는 `/`보다 먼저 매칭되어야 하므로 순서가 올바르다. (사실 `/` 라우트는 `app.use('/schema', ...)` 마운트 경로 자체에 대응하므로 순서 무관하지만, 안전한 등록 순서다.)

## SQL Injection 방지 검증 (사용자 요청 검증)
- `pgValidateSchema()` 화이트리스트 정규식 `^[A-Za-z0-9_.]+$`는 SQL 메타 문자(따옴표, 세미콜론, 공백, 주석)를 모두 차단한다.
- 호출 지점: `getQueries('postgres', schema)` 진입 시(line 194), `/schema/tables` 진입 시(line 316) 모두 검증 후 사용. **충분하다.**

## `uniqueRows = []` 기본값 검증 (사용자 요청 검증)
- `buildResult(colRows, viewRows, fkRows, uniqueRows = [])`(line 218) — 기본값 OK.
- 모든 DB 분기에서 unique 쿼리가 정의되어 있어 실제로는 항상 배열이 전달된다. (line 342–354)

## 2단계 UI에서 미선택 처리 (사용자 요청 검증)
- `_runReverseEngineerStep2()` line 209–213에서 `!checked.length` 가드 존재. 에러 메시지 표시 후 return. **OK.**

## `rowOffsets` 계산 시 `all.length === 0` 엣지 케이스 (사용자 요청 검증)
- 위 경미 4번 참조. 런타임 에러 없음. **OK.**

## MySQL `column_key = 'UNI'` 복합 UNIQUE 처리 (사용자 요청 검증)
- 위 경미 3번 참조. SQL 단에서 누락되더라도 `MY_UNIQUE`(line 169–173)의 별도 쿼리로 보정되므로 **실질적 누락 없음**.

---

## 최종 권고
- **현 상태로 머지 가능**(PASS). 심각한 수정 사항은 없다.
- 후속 개선 권장 사항:
  1. README.md `GET /config/profiles` 응답 예시에 `schema` 필드 추가 (경미 10).
  2. `it.name`을 HTML 속성에 삽입할 때 escape 헬퍼 사용 (경미 5).
  3. SQL 단 `false AS is_unique` 컬럼에 의도 주석 추가 (경미 2).
  4. `isAutoIncrement` 평가식 단순화 (경미 1).
- 우선순위는 모두 낮음. 다음 PR에서 정리 가능.
