## 변경 파일 목록
- js/canvas.js: _viewportBounds() 헬퍼 추가, 엔티티 컬링, 관계선 컬링 구현

## 주요 결정 사항
- 관계선 컬링에서 entityMap() 재사용: getRelationPath() 내부도 entityMap()을 매 rel마다 호출하는 구조이므로, drawRelations() 시작 시 한 번만 생성한 _relEM을 컬링 판단에 사용해 중복 생성을 줄임
- isActive || isConnected 조건 시 컬링 완전 면제: hover/drag/selected 관계선과 선택 엔티티 연결 관계선은 컬링 검사 자체를 건너뜀
- aOut && bOut (AND 조건)만 스킵: 한쪽 엔티티라도 뷰포트 안에 있으면 선이 가로질러 그려질 수 있으므로 OR 조건 사용하지 않음

## 미완료 항목
- 없음 (변경 4 debounce는 계획에서 이미 추가 구현 불필요로 확인됨)
