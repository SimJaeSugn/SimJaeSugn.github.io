## 단축키 동기화
- 상태: N/A
- 상세: 새 단축키 추가 없음. 기존 Ctrl+C(copy)/Ctrl+V(paste) 동작만 내부 수정. main.js 키 바인딩·index.html #shortcutsTableBody·shortcuts.js 변경 불필요.

## 백업 통합 (export/import/ui)
- export.js: N/A — 신규 키/배열 없음. 복사된 관계선은 RELATIONS(기존 배열)에 push되며, flushCurrentState()가 RELATIONS를 diagram.relations로 직렬화 → export 자동 포함(export.js:321에서 RELATIONS 순회 확인).
- import.js: N/A — diagram.relations(import.js:133,193,212)로 이미 처리. 신규 처리 불필요.
- ui.js (_BK_GROUPS): N/A — 신규 백업 그룹 없음.
- 상세: _clipboard는 메모리 전용 변수로 localStorage에 저장되지 않음. 영속 데이터는 기존 RELATIONS 배열뿐이며 이미 백업 파이프라인에 포함됨.

## 상태 저장/로드
- 상태: N/A
- 상세: state.js에 새 전역 변수 추가 없음. _clipboard/pasteCount는 entities.js 내 기존 모듈 변수. saveState()는 pasteEntity() 말미에서 기존대로 호출됨.

## 렌더링 연동
- 상태: OK
- 상세: 새 시각 요소 없음. 붙여넣은 관계선은 RELATIONS에 추가되어 drawRelations()(canvas.js)가 기존대로 렌더링. pasteEntity()에서 render() 호출 유지됨.

## 검증 메모
- toWorld/_qbLeftOff/entityHeight/panelOpen/PANEL_W 모두 전역 스코프이며 entities.js에서 호출 가능. typeof 가드로 방어 처리됨.
- 관계선 영속 waypoints 미존재 확인 → 좌표 보정 불필요(analyst 확인 필요 항목 해소).

## 최종 상태: PASS
