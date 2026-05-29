## 변경 파일 목록
- index.html: ddlOverlay 모달을 960px 2단 flex 레이아웃으로 교체, 라디오 버튼 제거, 좌측 엔티티 목록 패널 항상 표시
- js/export.js: openDDLModal에서 라디오 초기화·wrap 숨김 코드 제거 후 renderDDLEntityList() 호출 추가
- js/export.js: onDDLEntityModeChange 함수 전체 삭제
- js/export.js: generateDDL에서 mode 판별 3줄을 _ddlEntityIds 기준 필터 1줄로 교체

## 주요 결정 사항
- 계획과 동일하게 구현. 별도 이탈 없음.

## 미완료 항목
- 없음.
