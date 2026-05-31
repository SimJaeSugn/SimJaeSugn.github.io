# 도구 ▸ SQL 실행기 — 분석 보고서

## 1. 개요

`js/sql_runner.js`는 sql.js(WASM) 기반 인-브라우저 SQLite 실행기로, ERD(ENTITIES/RELATIONS)를 CREATE TABLE DDL로 변환해 메모리 DB에 로드하고 쿼리를 실행한다. 모달은 1회만 생성하고 Ctrl+Enter 리스너도 1회만 등록하며, escHtml 출력은 모두 텍스트 컨텍스트라 XSS 위험은 없다. 다만 `_buildSqliteDDL`의 `ent.attrs` 무방어 접근으로 attrs 없는 엔티티에서 메뉴가 조용히 통째로 실패하는 문제와, SQLite 전용 제약(AUTOINCREMENT는 INTEGER PRIMARY KEY에서만 허용)을 무시한 DDL 생성으로 비-정수 PK+AI 시 전체 로드가 실패하는 결함이 실제 동작을 깨뜨린다. 식별자 따옴표 미이스케이프, `getRowsModified`의 SELECT 시 오해 소지 등은 견고성 개선 대상이며, 단축키(Ctrl+Enter)는 README/모달과 일치하고 SQL 실행기는 휘발성 인-메모리라 영속성 무결성 규칙 위반은 없다.

## 2. 발견된 오류 및 수정 결과

### [medium] _buildSqliteDDL 가 ent.attrs 를 무방어 접근하고 try 밖에서 호출 → attrs 없는 엔티티에서 스키마 불러오기 전체 실패

- **상태**: 수정완료
- **증상**: 속성이 없는 엔티티(빈 엔티티, 가져오기/리버스엔지니어링으로 attrs 가 누락된 엔티티 등)가 하나라도 있으면 ENTITIES.forEach 내부의 `ent.attrs.filter(...)` / `ent.attrs.forEach(...)` 에서 'Cannot read properties of undefined (reading filter)' TypeError 가 발생한다. 게다가 `_buildSqliteDDL()` 호출(`loadSqlSchema` 의 `const ddl = _buildSqliteDDL();`)은 try/catch 바깥에 있어 예외가 catch 되지 못하고, 토스트/상태표시 없이 '스키마 불러오기' 가 조용히 통째로 실패한다. 코드베이스 다른 곳(import.js:470, export.js:652, diagrams.js:218, join_explorer.js:132 등)은 모두 `(ent.attrs || [])` 로 방어하고 있어 attrs 누락은 실제로 발생 가능한 상태다.
- **원인**: `ent.attrs` 가 항상 배열이라고 가정(`|| []` 가드 누락). 또한 DDL 생성이 try 블록 밖이라 발생한 예외가 사용자에게 전달되지 않음.
- **수정 내용**: `ent.attrs` 무방어 접근을 수정하여 attrs가 없는 엔티티에서도 안전하게 빈 배열로 처리되도록 방어 코드 추가 및 pkCols 매핑 시 fallback 'col' 추가
- **파일**: `E:\04.개발환경\python\98.ETC\SimJaeSugn.github.io\js\sql_runner.js`

### [medium] SQLite AUTOINCREMENT 를 비-정수 PK 에도 출력 → 전체 DDL 실행 실패

- **상태**: 수정완료
- **증상**: SQLite 에서 AUTOINCREMENT 키워드는 반드시 INTEGER PRIMARY KEY 컬럼에만 허용된다. 현재 코드는 type 이 INTEGER 가 아니어도(예: 타입 미지정/VARCHAR/SERIAL 등은 affinity 매핑 결과 TEXT 로 떨어짐) 단일 PK 이고 `a.autoIncrement` 이면 `' PRIMARY KEY AUTOINCREMENT'` 를 붙인다. 그러면 sql.js 가 "AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY" 로 throw 하고, 이는 `loadSqlSchema` 의 try/catch 에 잡혀 'DDL 오류' 토스트와 함께 스키마 로드 전체가 실패한다(해당 테이블뿐 아니라 한 번의 `run(ddl)` 이 전부 롤백). 정수가 아닌 PK 에 AI 체크는 ERD 작성 시 충분히 발생 가능한 입력이다.
- **원인**: AUTOINCREMENT 가 INTEGER 타입에서만 유효하다는 SQLite 제약을 검사하지 않고 `a.autoIncrement` 플래그만으로 출력.
- **수정 내용**: AUTOINCREMENT 출력 조건에 `type === 'INTEGER'` 검사를 추가하여 비-정수 PK에 AUTOINCREMENT가 붙지 않도록 수정
- **파일**: `E:\04.개발환경\python\98.ETC\SimJaeSugn.github.io\js\sql_runner.js`

## 3. 개선점 (자동수정 안 함 — 권장)

| 우선순위 | 제목 | 설명 | 파일 |
|---------|------|------|------|
| medium | SQLite 식별자(테이블/컬럼명) 따옴표 미이스케이프 | `quot = s => \`"${s}"\`` 는 식별자 내부의 큰따옴표(`"`)를 `""` 로 이스케이프하지 않는다. physicalName 에 `"` 가 포함되면 생성 DDL 이 깨진다(드물지만 가능). `quot` 도 `s.replace(/"/g,'""')` 후 감싸도록 보강 권장. 또한 defaultValue 를 항상 작은따옴표 문자열 리터럴로만 출력하므로 CURRENT_TIMESTAMP/숫자/표현식이 문자열로 저장된다(export.js 의 `_sanitizeDefault` 처럼 표현식 판별 필요). | js/sql_runner.js |
| low | SELECT 등 무결과 쿼리에서 getRowsModified() 오해 소지 | `results.length===0` 분기에서 '영향받은 행: ${modified}개' 를 항상 표시한다. SELECT 가 0행을 반환하거나 CREATE/PRAGMA 처럼 결과셋이 없는 문에서는 `getRowsModified()` 가 직전 INSERT/UPDATE/DELETE 의 누적/이전 값을 반환해 잘못된 행 수를 보여줄 수 있다. INSERT/UPDATE/DELETE 일 때만 영향 행수를 노출하거나, 결과셋 없는 비-DML 은 '실행 완료'만 표시하도록 분기하는 편이 정확하다. | js/sql_runner.js |
| low | 다중 결과셋에서 동일 elapsed 표시 | `_sqlDb.exec(sql)` 가 여러 결과셋을 반환할 때 모든 결과 블록에 전체 실행 시간(elapsed) 을 동일하게 붙인다. 결과별 시간이 아니라 전체 시간이라는 점이 표기상 오해를 줄 수 있어, 결과별로는 행수만 표시하고 시간은 상단에 1회만 표기하는 것이 명확하다. | js/sql_runner.js |
| low | 모달 닫기 시 _sqlDb 미해제로 WASM 메모리 점유 지속 | '닫기' 버튼은 `classList.remove('active')` 만 수행하고 `_sqlDb` 는 그대로 유지된다(재오픈 시 상태 유지 의도로 보임). 의도된 동작이면 문제 없으나, 대용량 DB 로드 후 닫아도 메모리가 해제되지 않으므로 README 의 '휘발성' 설명과 함께 사용자가 명시적으로 'DB 초기화'를 해야 함을 안내하거나, 장기 미사용 시 정리 정책을 고려할 수 있다. | js/sql_runner.js |
| low | 비표준 onmousedown.stop 속성(코드베이스 전역 패턴) | 모달 내부 클릭이 오버레이로 버블링되어 모달이 닫히지 않게 하려는 의도로 보이는 `onmousedown.stop` 은 유효한 HTML 속성이 아니라 무시된다(전 파일 공통). `overlayCloseExtra` 가 `e.target.id===overlayId` 일 때만 닫으므로 실제 닫힘 문제는 없지만, 의도를 살리려면 `onmousedown="event.stopPropagation()"` 로 통일하는 정리가 바람직하다. sql_runner 단독 결함은 아니라 개선으로 분류. | js/sql_runner.js |

## 4. 추천 사항

- **INSERT 샘플/시드 데이터 생성 기능**: 현재 스키마(빈 테이블)만 로드되어 SELECT 결과가 항상 0행이라 체감 가치가 낮다. rowCount 나 타입 기반으로 더미 INSERT 를 자동 생성하는 '샘플 데이터 채우기' 버튼을 추가하면 JOIN/집계 샘플이 실제 결과를 보여줘 학습/검증 효용이 커진다.
- **FK 제약 및 PRAGMA foreign_keys 지원**: `_buildSqliteDDL` 이 컬럼/PK 만 생성하고 FOREIGN KEY 제약은 생성하지 않는다. ref 정보를 활용해 `FOREIGN KEY(...) REFERENCES` 절을 추가하고 `PRAGMA foreign_keys=ON` 으로 무결성 검증까지 가능하게 하면 ERD 검증 도구로서 완성도가 높아진다.
- **쿼리 히스토리/결과 CSV 내보내기**: 실행한 쿼리 히스토리(위/아래 키 탐색)와 결과 표의 CSV/클립보드 복사를 제공하면 반복 테스트와 결과 활용성이 향상된다. 결과 영속화는 인-메모리 정책상 불필요하므로 세션 한정으로 두면 된다.
- **에디터 보강(구문 강조/자동완성/여러 문 실행 안내)**: textarea 대신 경량 코드에디터(CodeMirror 등)나 최소한 테이블/컬럼명 자동완성을 제공하고, exec 가 여러 문을 실행한다는 점/세미콜론 구분 규칙을 placeholder 나 도움말로 안내하면 사용성이 개선된다.
