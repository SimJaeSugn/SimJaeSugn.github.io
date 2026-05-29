## 단축키 동기화
- 상태: N/A
- 상세: 단축키 변경 없음. centerOnEntities는 내부 함수로, 사용자가 직접 호출하는 단축키 없음.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: 새 localStorage 키, 새 데이터 배열, 새 UI 설정값 변경 없음.

## 상태 저장/로드
- 상태: N/A
- 상세: 새 상태 변수 추가 없음. vx, vy, scale은 기존 saveState에서 이미 처리됨. centerOnEntities 완료 후 layout.js에서 saveState() 호출 확인.

## 렌더링 연동
- 상태: OK
- 상세: centerOnEntities() 함수 내부에서 render()를 직접 호출함 (ui.js:670). canvas.js render()에 별도 추가 불필요.

## 최종 상태: PASS
