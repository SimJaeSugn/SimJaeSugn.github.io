# 02_implementer_changes.md

## 구현 완료 — js/layout.js V2 라우터 버그 수정 (2026-05-29)

### 수정 D — start/goal 노드 blocked 예외 (layout.js:787~791)

**변경 위치:** `_v2AStarRoute` A* 확장 루프 내

| 항목 | 내용 |
|------|------|
| 파일 | `js/layout.js` |
| 원인 | startKey/goalKey가 blocked 집합에 포함될 경우 A*가 즉시 막혀 폴백으로 전락 |
| 수정 | `blocked.has(nKey)` 조건에 `&& nKey !== startKey && nKey !== goalKey` 예외 추가 |
| 추가 | 출발 노드(cur.key === startKey)에서 startDir과 불일치하는 방향 확장을 차단하는 가드 추가 |

---

### 수정 C — thinArr 엔티티 경계·포트 anchor must-keep 보존 (layout.js:598~626)

**변경 위치:** `_v2BuildGrid` 내 `thinArr` 함수

| 항목 | 내용 |
|------|------|
| 파일 | `js/layout.js` |
| 원인 | 격자 솎기 시 엔티티 경계 좌표(e.x, e.x+W, e.y, e.y+eh 등)와 포트 anchor가 제거됨 |
| 수정 | `mustKeepX` / `mustKeepY` Set을 생성해 엔티티 경계 4종(±GAP 포함) 및 포트 anchor 좌표를 등록 |
| 수정 | `thinArr(arr, limit, mustKeep)` 시그니처에 mustKeep 파라미터 추가, mustKeep.has(v) 이면 항상 유지 |

---

### 수정 B — _v2ClearSpineX/Y 관통 최소 후보 추적 반환 (layout.js:907~945)

**변경 위치:** `_v2ClearSpineX`, `_v2ClearSpineY` 함수

| 항목 | 내용 |
|------|------|
| 파일 | `js/layout.js` |
| 원인 | 12회 루프 실패 시 마지막 이동 좌표를 반환하여 최악의 경로가 선택될 수 있음 |
| 수정 | `bestX`/`bestY`, `bestCross` 추적 변수 추가 |
| 수정 | 매 이터레이션마다 현재 교차 수를 집계하여 bestCross보다 낮으면 갱신 |
| 수정 | 루프 종료 후 best 좌표 반환 (관통 최소 보장) |

---

### 수정 A — `_v2RouteWithFaceCycle` 신규 함수 + runRound 교체 (layout.js:647~706, 447)

**변경 위치:** `_v2AStarRoute` 바로 앞에 신규 함수 삽입, `runRound` toRoute.forEach 교체

| 항목 | 내용 |
|------|------|
| 파일 | `js/layout.js` |
| 원인 | 수렴 루프에서 포트 면을 바꾸지 않고 동일 면 A*만 반복 → 관통이 있어도 면 변경 없음 |
| 신규 함수 | `_v2RouteWithFaceCycle(rel, grid, usage)` |
| 로직 | 16조합(fromFace × toFace = 4×4) 생성, 현재 면 0순위·상대 방향 선호 면 우선 정렬 |
| 로직 | 각 조합마다 `_v2AStarRoute` → `_v2CountCrossings` 재검증 → crossing 0이면 즉시 채택 |
| 로직 | 전체 관통 > 0이면 최소 crossing 조합의 결과를 최종 채택 |
| runRound | `toRoute.forEach`에서 `_v2AStarRoute` 직접 호출 → `_v2RouteWithFaceCycle` 호출로 교체 |

---

## 변경된 줄 수 요약

| 수정 | 추가 | 삭제 | 순 추가 |
|------|------|------|---------|
| D | +3 | -1 | +2 |
| C | +17 | -5 | +12 |
| B | +14 | -8 | +6 |
| A | +57 | -1 | +56 |
| **합계** | **+91** | **-15** | **+76** |
