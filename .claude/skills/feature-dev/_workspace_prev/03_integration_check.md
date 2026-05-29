# 03 Integration Check

## 단축키 동기화
- 상태: N/A
- 상세: 새 단축키 추가 없음. 메뉴/명령팔레트 항목만 추가됨(단축키 미할당). `#shortcutsTableBody` 수정 불필요.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: 신규 영속 localStorage 키·데이터 배열 없음. DDL 옵션/엔티티 선택 상태(`_ddlEntityIds`)와 PNG 고해상도 옵션은 모달 세션 비영속 상태 → 백업 통합 대상 아님. 단, ui.js 명령 팔레트(L2262 인근)에서 변경된 export 함수를 호출하므로 일관성 차원에서 "이미지 내보내기 (고해상도 2x)" 항목을 추가함(downloadImage(true,true)). async 함수를 await 없이 호출하나 fire-and-forget 이므로 동작 정상.

## 상태 저장/로드
- 상태: N/A
- 상세: state.js loadState/saveState 변경 없음. 신규 상태 변수는 export.js 모듈 스코프 비영속.

## 렌더링 연동
- 상태: N/A
- 상세: 캔버스 새 시각 요소 없음. PNG 내보내기는 기존 draw 함수(drawSections/drawRelations/drawEntity)를 off-canvas에 재사용하며 canvas.js render() 사이클 무변경.

## 추가 검증
- DDL 모달 신규 element ID(ddlOptFK/ddlOptIndex/ddlOptComment/ddlEntMode×2/ddlEntityListWrap/ddlEntityList) 7개 모두 index.html에 존재, export.js 참조와 일치.
- `entDisplayName` (state.js 정의) renderDDLEntityList에서 사용 — 정의 확인됨.
- 변경 export 함수 호출부: index.html 메뉴바/imgMenu, ui.js 명령 팔레트 — 모두 반환값 의존 없는 호출. async 전환 영향 없음.
- `node --check` 통과: js/export.js, js/ui.js (ALL SYNTAX OK).
- `_fallbackDownload` 기존 2-인자 JSON 호출부(L120, L171) 기본값 유지로 무영향.

## 최종 상태: PASS
