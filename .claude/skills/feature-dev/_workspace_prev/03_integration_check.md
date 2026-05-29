## 단축키 동기화
- 상태: N/A

## 백업 통합
- 상태: N/A

## 상태 저장/로드
- 상태: N/A

## 렌더링 연동
- 상태: OK
- 상세:
  a) 엔티티 컬링 (renderNow, line 1790-1799): _viewportBounds() 호출 후 e.x, e.y, W, entityHeight(e) 기반 AABB 비교. MARGIN=20 적용. 정상.
  b) 관계선 컬링 AND 조건 (drawRelations, line 1159): if (aOut && bOut) return — OR가 아닌 AND 조건으로 양 끝 모두 밖일 때만 스킵. 정상.
  c) 활성/연결 관계선 예외 처리 (line 1149-1151): isActive(hover/drag/selected) 또는 isConnected(선택 엔티티 연결선)이면 컬링 블록 자체를 진입하지 않음. 정상.
  d) _viewportBounds() 월드 좌표 계산 (line 1731-1741): x1=(0-vx)/scale, y1=(0-vy)/scale, x2=(cw-vx)/scale, y2=(ch-vy)/scale. _qbLeftOff()와 panelOpen/PANEL_W 반영. 정상.

## 최종 상태: PASS
