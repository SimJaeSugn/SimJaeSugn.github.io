## 변경 파일 목록
- js/entities.js: copyEntity()가 선택 집합 내 from/to 양쪽 포함 관계선을 _clipboard.relations에 함께 복사. pasteEntity()가 클립보드 그룹 바운딩 박스 중심을 뷰포트 중앙 월드좌표로 이동(dx/dy)시켜 배치하고, 원본→신규 엔티티 id 매핑으로 관계선을 재매핑하여 RELATIONS에 추가.

## 주요 결정 사항
- 관계선 객체에 영속 waypoints 필드가 없음(canvas.js에서 매 렌더링 시 엔티티 위치로 재계산). 따라서 analyst가 "확인 필요"로 표시한 waypoints 좌표 보정은 불필요 — 구현하지 않음.
- 관계선은 id 필드가 없고 from/to(엔티티 id) 쌍으로 식별됨. JSON 깊은 복제 후 from/to만 idMap으로 재매핑. card/lineStyle/pathStyle/label/color 옵션 필드는 깊은 복제로 그대로 보존됨.
- 좌표 계산은 toWorld(off + cw/2, ch/2) 헬퍼를 직접 호출하여 중복 보정을 방지(analyst 권장안). off=_qbLeftOff()(좌측 도킹 퀵바), cw는 우측 패널(panelOpen?PANEL_W:0) 반영.
- 연속 붙여넣기 시 완전 겹침 방지를 위해 pasteCount 기반 소량 누적 오프셋 nudge=20*(pasteCount-1)을 dx/dy에 가산(첫 붙여넣기는 정확히 중앙).
- FK ref는 기존 동작대로 null 유지(요청 범위는 "관계선" 한정). FK 컬럼 참조 복원은 미수행 — 확인 필요 항목 유지.
- 엔티티가 없고 섹션만 복사한 경우 바운딩 박스에 섹션 x/y/w/h를 포함하여 중앙 배치. 둘 다 비어 바운딩이 Infinity이면 dx=dy=0으로 안전 처리.
- panelOpen/PANEL_W/entityHeight/_qbLeftOff/toWorld 모두 전역 스코프 함수·변수로 entities.js에서 호출 가능함을 확인. 방어적으로 typeof 가드 적용.

## 미완료 항목
- 없음 (요청 1, 요청 2 모두 구현 완료).
