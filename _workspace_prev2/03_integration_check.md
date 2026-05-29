## 단축키 동기화
- 상태: N/A
- 상세: 이번 변경(Oracle clientLibDir UI 추가)에서 새 단축키가 추가되지 않았음.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: clientLibDir은 미들웨어 서버 측 config.json에 저장되며 localStorage를 사용하지 않음.
  UXERManager 백업 대상(diagrams, snapshots, templates, uiSettings, aiKey)에 해당하지 않으므로
  export.js / import.js / _BK_GROUPS 수정 불필요.

## 상태 저장/로드
- 상태: N/A
- 상세: state.js에 새 상태 변수가 추가되지 않았음. clientLibDir은 서버 측에서만 관리됨.

## 렌더링 연동
- 상태: N/A
- 상세: 이번 변경은 DB 연결 설정 모달 UI 추가이며, 캔버스에 새 시각적 요소를 그리는 변경이 없음.

## 최종 상태: PASS
