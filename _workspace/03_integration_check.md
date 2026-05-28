## 단축키 동기화
- 상태: N/A
- 상세: main.js keydown 핸들러 및 shortcuts.js 모두에서 profile manager 관련 신규 단축키 없음. 변경은 순수 UI 레이아웃 개편으로 단축키 추가 없음.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: 새 localStorage 키 없음. `_pmSelectedName`은 모달 내부 UI 상태 변수(페이지 새로고침 시 초기화)이며 `js/profile_manager.js` 모듈 스코프에만 존재. export/import/백업 그룹에 포함할 대상 없음.

## 상태 저장/로드
- 상태: N/A
- 상세: `_pmSelectedName`은 `state.js`와 무관한 순수 모달 UI 상태. `loadState()`/`saveState()` 처리 불필요.

## 렌더링 연동
- 상태: N/A
- 상세: 변경 사항은 DOM 기반 모달 UI에 국한됨. 캔버스(canvas.js render/draw 함수)에 추가된 시각적 요소 없음.

## 최종 상태: PASS
