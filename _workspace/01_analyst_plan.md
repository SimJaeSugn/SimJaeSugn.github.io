## 요청 요약

엔티티가 선택된 상태에서 바탕(빈 영역)을 드래그해 화면을 패닝(이동)할 때 선택이 풀리는 현상 수정.
단순 클릭 시에는 선택 해제가 유지되어야 하고, 드래그(패닝)일 때는 선택이 유지되어야 한다.

## 탐색한 파일
- `js/canvas.js`: 마우스 이벤트 핸들러(mousedown/mousemove/mouseup) 전체 구현 파일

## 문제 원인

`canvas.js` `mousedown` 핸들러(라인 2013)에서 빈 영역 클릭 시 `selectedEntity = null`과 `selectedEntities.clear()`를 **즉시(mousedown 시점)** 실행한다. 이후 드래그인지 단순 클릭인지 판별하는 `_didMove` 플래그는 `mousemove` 이후에야 `true`로 설정되지만, 이미 선택 상태가 지워진 뒤다.

`panStart`를 처리하는 `mousemove` 구간(라인 2206~2210)에는 `_didMove = true`가 없어, `mouseup`의 `_ppEmpty` 조건이 "빈 영역 클릭"으로 판별되어 `hidePropPanel()`을 호출한다. 하지만 그 이전에 이미 `selectedEntity`가 null이 되어 버린 것이 핵심 버그다.

## 영향 분석
- 단축키 변경: 없음
- 새 localStorage 키: 없음
- 새 데이터 배열/상태 변수: 없음 (기존 `_didMove`, `panStart` 변수 활용 + `_pendingDeselect` 플래그 추가)
- 기타 파급 효과: mousedown에서 render를 호출하지 않으면 선택 해제 시각적 반영이 mouseup으로 늦춰짐 (의도된 동작)

## 구현 계획

### 파일: `js/canvas.js`

**변경 1 — 상단 변수 선언부: `_pendingDeselect` 플래그 추가**
- 위치: 기존 `_didMove` 선언 근처 (라인 46 근처)
- 변경 내용: `let _pendingDeselect = false;` 추가
- 이유: mousedown에서 즉시 해제 대신, mouseup 시점에 판별하기 위한 지연 플래그

**변경 2 — mousedown 핸들러: 선택 해제를 지연 플래그로 처리**
- 위치: 라인 2013~2015 (빈 영역 fallthrough 블록, `selectedEntity = null` 코드)
- 변경 내용: `selectedEntity = null; selectedRelation = null; selectedEntities.clear();` → `_pendingDeselect = true;` 로 대체
- 이유: mousedown 시점에 드래그인지 클릭인지 알 수 없으므로 mouseup에서 최종 판별

**변경 3 — mousemove 핸들러: panStart 구간에 `_didMove` 및 `_pendingDeselect` 처리 추가**
- 위치: 라인 2206~2210 (panStart 처리 블록)
- 변경 내용:
  ```js
  if (panStart) {
    vx = e.clientX - _qbLeftOff() - panStart.x;
    vy = e.clientY - panStart.y;
    _didMove = true;
    _pendingDeselect = false;
    render(); return;
  }
  ```
- 이유: 패닝이 실제로 발생했을 때 `_didMove = true`, `_pendingDeselect = false`로 선택 해제 취소

**변경 4 — mouseup 핸들러: `_pendingDeselect` 확정**
- 위치: `_ppEmpty` 판별 직전
- 변경 내용:
  ```js
  if (_pendingDeselect && !_didMove) {
    selectedEntity = null;
    selectedRelation = null;
    selectedEntities.clear();
  }
  _pendingDeselect = false;
  ```
- 이유: mouseup 시점에 `_didMove`가 false(단순 클릭)일 때만 선택 해제. 패닝 드래그였으면 `_didMove`가 true이므로 선택 유지.

**변경 5 — mouseleave 핸들러: `_pendingDeselect` 초기화**
- 위치: `panStart = null; selectionBox = null;` 라인 이후
- 변경 내용: `_pendingDeselect = false;` 추가
- 이유: 마우스가 캔버스를 벗어날 때 미결 상태 정리
