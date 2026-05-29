## 단축키 동기화
- 상태: N/A
- 상세: 신규 단축키 없음. Ctrl+C/V는 기존 유지. index.html의 단축키 모달은 #shortcutsTableBody가 아닌 커스텀 구조이며, 기존 Ctrl+C/V 설명 행 보강은 선택 사항으로 판단 — 미수정.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: `_clipboard`, `_copyDiagEntities`, `pasteCount` 모두 in-memory 전용 세션 변수. export.js/import.js에 없음 확인 — 의도적이며 올바름.

## 상태 저장/로드
- 상태: N/A
- 상세: state.js에 신규 상태 변수 추가 없음. `_copyDiagEntities`는 모달 호출 시 임시 보관용이며 saveState 대상 아님.

## 렌더링 연동
- 상태: N/A
- 상세: 신규 시각적 요소(캔버스 그리기) 없음.

## 코드 정확성 검증

### entities.js — openCopyDiagModal / confirmCopyToDiag
- `openCopyDiagModal` 우선순위: selectedEntities(Set) > entity 인자 > selectedEntity 순서 — 올바름.
- `confirmCopyToDiag`: `_copyDiagEntities.forEach` 배열 순회 — 올바름(단일 엔티티 버그 없음).
- id 재발급 패턴 버그 발견 및 수정:
  - 기존: `forEach(orig => { copy.id = 'entity_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); })`
  - 문제: 다중 엔티티를 동기적으로 순회 시 Date.now()가 동일 ms를 반환할 수 있고, 3자리 랜덤 suffix만으로는 충돌 방지 불충분.
  - 수정: `forEach((orig, i) => { copy.id = 'entity_' + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2,5); })` — 루프 인덱스(i) 추가로 동일 ms 내 중복 id 완전 방지.

### diagrams.js — switchDiagram / confirmNewDiag
- `switchDiagram`: `loadDiagramIntoWorkspace` 직후 `pasteCount = 0` 위치 올바름. `_clipboard` 미접근 확인.
- `confirmNewDiag` 누락 발견 및 수정: 새 다이어그램 생성 시 `pasteCount` 리셋이 누락되어 있었음. `loadDiagramIntoWorkspace(d)` 직후 `pasteCount = 0` 추가. (switchDiagram과 동일 로직 일관성 확보.)

### index.html — copyDiagOverlay 모달 문구
- 496행: `선택한 엔티티를 복사할 대상 다이어그램을 선택하세요.` — 계획대로 수정 완료 확인.

## 최종 상태: PASS
- 수정 항목 2건:
  1. js/entities.js `confirmCopyToDiag` — forEach 인덱스(i) 추가로 동기 다중 복사 시 id 중복 방지
  2. js/diagrams.js `confirmNewDiag` — `pasteCount = 0` 추가(switchDiagram과 일관성)
