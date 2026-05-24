## 관계선 드래그 UX 개선

### 문제 요약
관계선을 연결하거나 세그먼트·엔드포인트를 드래그할 때 선이 갑자기 튀는(순간 이동하는) 현상이 발생함.

---

### 버그 1 — `initWpts` 호출 시점에 경로 불일치 (선 튀기의 주원인)

**위치**: `canvas.js` `mousedown` 핸들러 (~line 1657), `initWpts()` 함수 (~line 234)

**원인**:
세그먼트(`type === 'seg'`) 또는 중간 포인트(`type === 'wpt'`) 드래그 시작 시 `initWpts(rel)`를 호출한다.
`initWpts`는 내부에서 `getRelationPath`로 경로를 계산한 뒤 레거시 bend 속성(`midX`, `midY`, `fromOff`, `toOff`)을 **삭제**하고 `wpts` 배열로 변환한다.
이 변환 과정에서 실제 화면에 그려진 경로와 미세하게 달라지면, mousedown 순간 선이 픽셀 단위로 튀는 현상이 발생한다.

**개선 방향**:
- `initWpts` 호출 전/후 waypoints를 비교해 이전 경로를 그대로 유지하도록 보정.
- 또는 mousedown 시점의 `getRelationPath` 결과를 `origWaypoints`로 저장해두고, 첫 번째 mousemove 까지 해당 경로를 기준으로 사용.

---

### 버그 2 — `applyRelSegDrag`에서 `origBend.wpts === null`이면 경로 재산출

**위치**: `canvas.js` `applyRelSegDrag()` (~line 266)

**원인**:
드래그 중 매 mousemove마다 `origBend`로 상태를 초기화한 후 `buildFullWpts`를 호출한다.
`origBend.wpts`가 null이면 `buildFullWpts`는 `fromFace`/`toFace`만 참조해 경로를 재산출하는데,
이 경로가 `initWpts` 직후의 경로와 다를 경우 드래그 중 선이 흔들린다.

**개선 방향**:
`origBend`를 저장할 때 `wpts`가 null이더라도 `initWpts` 직후 확정된 wpts를 저장.

---

### 버그 3 — 엔드포인트(`from`/`to`) 드래그 시 `initWpts` 미호출로 기존 wpts와 충돌

**위치**: `canvas.js` mousedown 핸들러 `type === 'seg'` 분기 (~line 1657),
mousemove 핸들러 `type === 'from'`/`'to'` 분기 (~line 1794)

**원인**:
`type === 'seg'`/`'wpt'`일 때만 `initWpts(rel)`를 호출하고, `type === 'from'`/`'to'`일 때는 호출하지 않는다.
기존에 `wpts` 배열이 있는 관계선의 엔드포인트를 드래그하면, mousemove 안에서 `fromFace`/`toFace`만 변경된 채로 `getRelationPath`가 **wpts 기반 경로**를 반환해 예상치 못한 경로가 출력된다.

**개선 방향**:
`type === 'from'`/`'to'` mousedown 처리 시에도 `initWpts(rel)`를 호출해 상태를 wpts 기반으로 통일.

---

### 버그 4 — `routeFacePath` L-shape 전환 시 경로 형태 급변

**위치**: `canvas.js` `routeFacePath()` (~line 189)

**원인**:
앵커 포인트의 face가 수평↔수직으로 바뀌는 순간, 반환되는 경로 형태가 H-H/V-V(4포인트 직교) ↔ L-shape(3포인트)로 전환된다.
또한 L-shape 반환 시 `wps`의 마지막 두 원소가 동일 좌표(`[toPt, toPt]`)여서 길이 0인 세그먼트가 포함된다.

**개선 방향**:
- L-shape 시 `[toPt, toPt]` → `[toPt]`로 정리해 길이 0 세그먼트 제거.
- face 전환 시 부드러운 애니메이션 또는 전환 임계값(hysteresis)을 추가해 순간적인 경로 변화를 완화.

---

### 버그 5 — 새 관계선 연결 드래그(`draggingRelPort`) 중 미리보기가 직선

**위치**: `canvas.js` renderNow() 내 `draggingRelPort` 렌더링 (~line 1499)

**원인**:
포트에서 드래그해 새 관계선을 연결할 때 미리보기가 단순 직선(straight line)으로 표시된다.
연결 완료 후 실제 경로는 `computeOrthogonalPath`에 의해 직교 경로로 전환되므로,
연결 순간 선 모양이 급격히 바뀌는 것처럼 느껴진다.

**개선 방향**:
`draggingRelPort.targetEntity`가 있을 때 `computeOrthogonalPath`로 실제 경로를 미리 계산해 점선으로 표시.

---

### 버그 6 — `segIdx`가 `initWpts` 이후 waypoints 구조 변경으로 틀릴 수 있음

**위치**: `canvas.js` mousedown → `draggingSegment` 저장 (~line 1658),
`applyRelSegDrag()` 내 `full` 배열 인덱싱 (~line 277)

**원인**:
mousedown에서 `hitTestRelHandle`이 반환한 `segIdx`는 당시 렌더된 경로 기준이다.
직후 `initWpts(rel)`를 호출하면 레거시 bend 형식에서 wpts 형식으로 변환되며 waypoints 구조가 달라질 수 있다.
이때 저장된 `segIdx`가 새 구조에서 다른 세그먼트를 가리켜 엉뚱한 세그먼트가 이동한다.

**개선 방향**:
`initWpts` 호출 후의 `buildFullWpts` 결과를 기준으로 `segIdx`를 재검증하거나,
mousedown에서 실제 드래그 대상 세그먼트의 좌표를 저장해 인덱스 대신 좌표 기준으로 추적.

---

## 개선 및 추천 기능 (메뉴 / 아이콘 패널)

### 퀵 액세스 툴바 (Quick Access Toolbar)
- 퀵바 구성 프리셋 저장/불러오기 — 업무 유형별(설계/검토/발표) 버튼 세트 전환
- 퀵바 커스텀 버튼 우클릭 편집 — 현재 호버 삭제 버튼 외에 아이콘·이름 변경 기능


### 메뉴바
- 최근 사용 항목 (MRU) — 파일 메뉴 상단에 최근 열거나 내보낸 항목 5개 고정 표시
- 메뉴 항목 숨기기 — 자주 쓰지 않는 항목을 숨겨 메뉴를 간소화하고 우클릭으로 복원


### 선 겹침 해소 개선 
선 겹침 해소가 선의 겹침 뿐 아니라 엔티티를 가로지르지 않도록 변경 
