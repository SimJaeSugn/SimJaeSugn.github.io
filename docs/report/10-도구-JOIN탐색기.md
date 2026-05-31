# 도구 ▸ JOIN 경로 탐색기 — 분석 보고서

## 1. 개요

`js/join_explorer.js`는 '도구 ▸ JOIN 경로 탐색기' 메뉴를 구현한다. `openJoinExplorer()`가 모달을 1회 생성·캐시하고 ENTITIES로 시작/도착 셀렉트를 채우며, `runJoinExplorer()`가 `_bfsJoinPath()`로 두 엔티티 간 무방향 그래프(RELATIONS)에서 BFS 최단 경로 1개를 찾고 `_buildJoinSQL()`로 JOIN SQL을 생성해 표시·복사한다. 데이터 모델(attrs/kind 'pk'|'fk'/ref.entity·ref.attr)과 RELATIONS(from/to/card) 구조에 부합하며, `entMap`·`attrs`·`ref`를 모두 옵셔널체이닝으로 안전하게 접근하여 orphan 관계나 빈 attrs에도 크래시하지 않는다. 이 기능은 읽기 전용이라 saveState/undo/전체백업 무결성 이슈는 해당 없고 단축키도 등록하지 않아 동기화 충돌도 없다. 다만 README 사양("모든 경로 표시")과 달리 단일 최단 경로만 반환하고, 경로 칩의 이름 폴백이 physicalName을 건너뛰는 등 사양·UX 불일치가 존재한다.

## 2. 발견된 오류 및 수정 결과

### [low] 경로 칩 이름 폴백이 physicalName을 건너뛰어 id가 노출됨 (드롭다운과 불일치)

- **상태**: 수정완료
- **증상**: 결과 경로를 표시하는 칩은 `e?.logicalName || id`로 이름을 정한다. 그러나 시작/도착 드롭다운(`openJoinExplorer`)은 `logicalName || physicalName || id` 순으로 표시한다. 따라서 논리명(logicalName)이 비어 있고 물리명(physicalName)만 있는 엔티티의 경우, 드롭다운에는 물리명이 보이지만 경로 칩에는 사람이 읽기 어려운 내부 id(예: 'activemodel')가 그대로 노출된다. 같은 화면에서 같은 테이블이 드롭다운과 경로에서 다른 라벨로 보여 혼란을 준다.
- **원인**: 칩 라벨 폴백 체인에서 physicalName 단계가 누락됨. 드롭다운(`escHtml(e.logicalName || e.physicalName || e.id)`)과 폴백 규칙이 어긋난다.
- **수정 내용**: 경로 칩 표시 이름 폴백에 `e?.physicalName`을 추가하여 logicalName 없을 때 id 대신 physicalName이 표시되도록 수정
- **파일**: `E:\04.개발환경\python\98.ETC\SimJaeSugn.github.io\js\join_explorer.js`

## 3. 개선점 (자동수정 안 함 — 권장)

| 우선순위 | 제목 | 파일 |
|----------|------|------|
| high | README 사양('모든 JOIN 경로')과 구현(최단 단일 경로) 불일치 | `js/join_explorer.js` |
| medium | N:M 관계가 경로에 포함되면 잘못된 JOIN 조건(주석부 fallback)을 생성 | `js/join_explorer.js` |
| medium | JOIN 조건이 FK의 ref.attr 대신 참조 테이블의 첫 PK를 사용 (복합 PK·비단순 참조에서 부정확) | `js/join_explorer.js` |
| low | 클립보드 복사에 .catch() 누락으로 미처리 거부 가능 | `js/join_explorer.js` |
| low | 모달 배경 클릭으로 닫히지 않음 (overlayCloseExtra 미등록 id) | `js/join_explorer.js` |
| low | 물리 뷰모드에서도 경로 칩은 항상 논리명 표시 | `js/join_explorer.js` |

**상세 설명**

- **[high] README 사양('모든 JOIN 경로')과 구현(최단 단일 경로) 불일치**: README 10절은 '두 테이블 사이의 모든 JOIN 경로 표시', '각 경로마다 완성된 SQL 생성 및 복사 버튼 제공'이라고 명시한다. 그러나 `_bfsJoinPath()`는 BFS로 최단 경로 1개만 반환(`return [...path, next]`)하고 `runJoinExplorer()`도 단일 SQL만 렌더한다. 대안 경로(예: 동일 두 엔티티가 여러 FK 사슬로 연결된 경우)는 전혀 노출되지 않는다. 사양에 맞추려면 visited 기반 단일 BFS 대신 경로별 방문집합을 갖는 DFS/모든-경로 열거(깊이·개수 상한 포함)로 확장하고, 결과를 경로 목록 + 경로별 SQL/복사 버튼으로 렌더해야 한다.

- **[medium] N:M 관계가 경로에 포함되면 잘못된 JOIN 조건(주석부 fallback)을 생성**: `_bfsJoinPath()`는 RELATIONS의 card를 무시하고 모든 관계를 간선으로 사용한다. `autoAddFkColumn()`은 card==='N:M'에서 FK 컬럼을 만들지 않으므로, N:M 관계를 경유한 경로 구간은 `_buildJoinSQL`의 joinCond에서 양방향 FK 모두 미발견 → `tbl.id = tbl.id /* 조인 조건 확인 필요 */` 라는 실행 불가/부정확 SQL을 낸다. N:M 구간은 교차(중간) 테이블을 통해 두 단계로 분해하거나, N:M 관계를 경로 탐색에서 제외/경고 표시하는 처리가 필요하다.

- **[medium] JOIN 조건이 FK의 ref.attr 대신 참조 테이블의 첫 PK를 사용 (복합 PK·비단순 참조에서 부정확)**: joinCond는 FK를 찾은 뒤 참조 컬럼을 `(b.attrs).find(at => at.kind==='pk')`로 첫 번째 PK에서 가져온다. 그러나 FK 속성에는 정확한 참조 컬럼이 `fkAB.ref.attr`(예: 'VNDR_ID')로 이미 저장되어 있다. 복합 PK이거나 PK가 아닌 유니크 컬럼을 참조하는 경우, 첫 PK를 고르면 잘못된 컬럼으로 조인한다. `ref.attr`를 우선 사용(없을 때만 첫 PK로 폴백)하도록 변경을 권장한다.

- **[low] 클립보드 복사에 .catch() 누락으로 미처리 거부 가능**: SQL 복사 버튼 onclick은 `navigator.clipboard?.writeText(...).then(()=>showToast('SQL 복사됨'))`로 끝나 `.catch()`가 없다. 권한 거부·비보안 컨텍스트에서 쓰기 실패 시 unhandled rejection이 발생하고 사용자에게 실패 피드백도 없다. 실패 시 토스트로 안내하는 `.catch()`를 추가하면 좋다.

- **[low] 모달 배경 클릭으로 닫히지 않음 (overlayCloseExtra 미등록 id)**: 오버레이에 `onmousedown="overlayCloseExtra(event,'joinExplorerOverlay')"`를 달았지만 overlayClose/overlayCloseExtra 어디에도 'joinExplorerOverlay' 분기가 없어 배경 클릭으로 닫히지 않는다. '닫기' 버튼으로는 정상 동작하므로 기능 파손은 아니나, 다른 모달과 동작이 달라 일관성이 떨어진다.

- **[low] 물리 뷰모드에서도 경로 칩은 항상 논리명 표시**: viewMode가 'physical'일 때 SQL은 물리명을 쓰지만 경로 칩은 항상 logicalName을 표시한다. 현재 viewMode에 맞춰 칩 라벨도 물리/논리를 전환하면 화면 표현이 일관된다.

## 4. 추천 사항

- **경로 길이/개수 상한 및 명확한 빈/순환 스키마 처리**: 모든-경로 열거로 확장할 때 무한·폭발을 막기 위해 최대 깊이(예: 5단계)와 경로 개수 상한을 두고, 상한 초과 시 '상위 N개만 표시'를 안내하라. FK 없는 스키마, 단절 그래프, 순환 관계에 대한 명시적 안내 메시지(현재는 '경로 없음' 한 줄)를 강화하면 진단성이 올라간다.

- **JOIN 종류 선택 및 별칭(alias) 지원**: INNER/LEFT JOIN 토글과 테이블 별칭(t1, t2 ...) 부여 옵션을 제공하면 생성 SQL의 실사용성이 크게 향상된다. 컬럼 목록도 `SELECT *` 대신 경로상 테이블의 PK/대표 컬럼을 명시적으로 나열하는 옵션을 고려하라.

- **선택 엔티티 사전 채움(prefill) 및 캔버스 연동**: 캔버스에서 두 엔티티를 선택한 상태로 메뉴를 열면 시작/도착 드롭다운을 자동 채우고, 탐색된 경로를 캔버스에서 하이라이트(관계선 강조)하면 탐색 결과를 시각적으로 검증하기 쉽다.
