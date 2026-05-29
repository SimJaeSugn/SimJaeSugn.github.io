## 요청 요약

400개 엔티티 렌더링 성능 개선: 뷰포트 컬링(엔티티/관계선), render debounce 현황 확인.

## 탐색한 파일

- js/canvas.js: render/renderNow, drawRelations, drawEntity, 이벤트 리스너
- js/state.js: vx, vy, scale, ENTITIES, RELATIONS 전역 상태
- js/config.js: W=295, HEADER_H=36, ROW_H=22 등 상수

## 영향 분석

- 단축키 변경: 없음
- 새 localStorage 키: 없음
- 새 데이터 배열/상태 변수: 없음
- 기타: hitTest/hover는 월드좌표 기반이므로 컬링과 무관. debounce는 이미 _renderPending+RAF로 구현됨.

## 구현 계획

### 파일: js/canvas.js

변경 1 - _viewportBounds() 헬퍼 함수 추가 (renderNow 직전):
  뷰포트 경계를 월드 좌표로 반환. _qbLeftOff()와 panelOpen/PANEL_W 반영.
  x1=(0-vx)/scale, y1=(0-vy)/scale, x2=(cw-vx)/scale, y2=(ch-vy)/scale

변경 2 - 엔티티 컬링 (renderNow 내 ENTITIES.forEach(drawEntity) 교체):
  _viewportBounds() 호출 후 각 엔티티의 AABB가 뷰포트 밖이면 drawEntity 스킵.
  MARGIN=20px 여유값 사용.

변경 3 - 관계선 컬링 (drawRelations 내 RELATIONS.forEach 진입부):
  활성(hover/drag/selected) 관계선과 선택 엔티티 연결 관계선은 컬링 예외.
  컬링 판단용 entityMap을 drawRelations 내부에서 별도 생성.
  양 끝(aOut && bOut) 모두 뷰포트 밖일 때만 스킵(AND 조건).

변경 4 - debounce:
  render()는 이미 _renderPending+RAF 패턴으로 중복 방지됨. 추가 구현 불필요.

## 주의사항

- 컬링 판단은 월드 좌표 기준 (e.x, e.y는 이미 월드 좌표)
- aOut && bOut AND 조건만 스킵 (한 끝이 화면 안이면 선이 가로질러 그려야 함)
- getRelationPath() 시그니처 변경 금지 - 컬링 판단용 entityMap만 별도 선언
