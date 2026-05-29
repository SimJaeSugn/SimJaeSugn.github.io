## 변경 파일 목록
- js/entities.js: `_copyDiagEntity` → `_copyDiagEntities` 배열로 교체, `openCopyDiagModal` 다중 선택 우선순위 처리, `confirmCopyToDiag` 배열 순회 및 id 재발급 방식으로 변경
- js/diagrams.js: `switchDiagram` 함수 내 `loadDiagramIntoWorkspace` 호출 직후 `pasteCount = 0` 추가
- index.html: copyDiagOverlay 모달 설명 문구를 "선택한 엔티티를 복사할 대상 다이어그램을 선택하세요."로 변경

## 주요 결정 사항
- `pasteCount`가 entities.js의 전역 스코프에 선언되어 있어 diagrams.js에서 직접 대입 가능함 — helper 함수 불필요
- `confirmCopyToDiag`에서 기존의 `copy.id += '_copy'` 중복 id 처리 방식을 제거하고, 계획대로 항상 신규 id를 발급하는 방식으로 교체

## 미완료 항목
- 없음
