## 단축키 동기화
- 상태: N/A
- 상세: 이번 변경(Oracle DB 어댑터 추가)에서 새 단축키 추가 없음. shortcuts.js 및 main.js keydown 핸들러 변경 없음.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: Oracle 어댑터의 DB 접속 정보는 미들웨어 서버의 `~/.uxermanager/config.json`에 저장되며, 브라우저의 localStorage에 저장되지 않음. 따라서 export/import/백업 대상 키 변경 없음. js/db_connect.js와 js/profile_manager.js의 변경은 드롭다운 UI 옵션(Oracle 항목) 및 기본 포트(1521) 추가에 한정되며, 새 localStorage 키를 도입하지 않음.

## 상태 저장/로드
- 상태: N/A
- 상세: state.js에 새 상태 변수 추가 없음.

## 렌더링 연동
- 상태: N/A
- 상세: 새 캔버스 시각 요소 추가 없음.

## 최종 상태: PASS
