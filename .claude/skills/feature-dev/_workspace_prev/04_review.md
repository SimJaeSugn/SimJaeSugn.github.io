# 04 — Review

## 리뷰 요약
- 전체 평가: **PASS**

독립적으로 변경된 코드(`js/import.js`, `js/state.js`)를 읽고 기능 정확성·엣지 케이스·LocalStorage·리스너·보안·패턴을 검토했다. Section 2 버그 3건은 이미 적용되어 있어 변경 없음(확인 완료). Section 3 6건은 모두 올바르게 구현되었다.

## 항목별 검증

### A — parseDDL 괄호 균형 파서: 정확
- `_extractBalancedBody`가 문자열 리터럴 내 `;`/괄호, 중첩 괄호, `\` 이스케이프, `''`/`""` 연속 이스케이프를 처리. `createRe.lastIndex`를 본문 종료 위치로 보정해 다음 CREATE 탐색 정상.
- 엣지: 짝이 안 맞는 괄호 → `null` 반환 후 `continue`로 안전 스킵.
- 회귀 검증: 단순 2-table + `DEFAULT 'a;b'` + `DECIMAL(10,2)` + FK 샘플 파싱 정상(엔티티 2, FK 관계 1). 반환 구조 불변으로 preview/apply 무영향.

### B — FileReader onerror: 정확
- 두 핸들러 모두 alert + `e.target.value=''`. 화살표 함수가 핸들러 스코프의 `e`를 클로저로 캡처 — 정상.

### C — selectedEntities 초기화: 정확
- `loadDiagramIntoWorkspace`의 모든 호출 경로(탭 전환·undo/redo·import·init·reverse-engineer)에서 이전 다이어그램의 선택 잔상 제거. 엔티티는 deep clone으로 재생성되므로 이전 선택 유지는 의미 없고 스테일 상태만 유발 → 초기화가 올바름.
- `typeof` 가드로 canvas.js 로드 순서/미정의 환경 방어.

### D — uiSettings render: 정확
- `!groups.includes('diagrams')` 조건으로 diagrams 자체 render()와 중복 방지. uiSettings 단독 복원 시 1회 갱신 보장.

### E — AbortController: 정확
- fetch `signal` 연결, `closeAISchemaModal`(배경 클릭 경로 포함)에서 abort, `catch`의 `AbortError` 조용히 return, `finally` null 정리. 모달 닫은 뒤 늦은 응답/유령 토스트 차단. 리스너 누수 없음.

### F — baseY collapsed 보정: 정확
- `_expandedH`로 collapsed 엔티티도 펼친 높이 기준 baseY 계산. applyDDLImport·applyAISchema 모두 적용.
- applyAISchema add 모드: 시뮬레이션으로 신규 y = 기존(펼친)하단+80 검증 완료(`-60`이 인라인 base 오프셋 정확히 상쇄). 기존 +20 고정 오프셋(겹침 유발) 제거로 개선.

## 발견 사항

### 심각 (즉시 수정 필요)
- 없음.

### 경미 (개선 권장)
- `_expandedH` 헬퍼가 applyDDLImport·applyAISchema에 각각 인라인 선언됨(중복). 향후 공유 유틸로 추출 여지 있으나, 최소 변경 원칙상 현 상태 허용. (실질 문제 아님)

## reviewer 확인 요청 항목 처리
- 항목 C 전환/undo·redo 선택 해제: 의도 적합 확인(스테일 참조 제거).
- 항목 F applyAISchema 좌표 변경 회귀: 시뮬레이션으로 겹침 회피 확인, 회귀 없음.
- 항목 D render만으로 충분: 테마/퀵바는 각 apply 함수가 즉시 반영, render()로 캔버스 갱신 충분.
- 항목 E AbortError/finally: 정상.
- 항목 A 단순 DDL 회귀: 정상 파싱 확인.

## 최종 권고
머지 가능. 추가 수정 불필요. node --check 통과, 핵심 로직 단위 검증 완료.
