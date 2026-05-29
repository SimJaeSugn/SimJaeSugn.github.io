## 요청 요약

요청 1 — 붙여넣기(Ctrl+V) 시 엔티티 그룹을 현재 뷰포트(화면) 중앙 좌표에 배치한다.
- 기존: 원본 좌표 + (30 * pasteCount) 오프셋
- 변경: 클립보드 엔티티 그룹의 바운딩 박스 중심을 현재 화면 중앙의 월드 좌표로 이동시켜 배치

요청 2 — 복사(Ctrl+C) 시 선택 집합 내에서 from/to 양쪽이 모두 포함된 관계선을 함께 복사하고, 붙여넣기 시 새 엔티티 id로 재매핑하여 RELATIONS에 추가한다.

## 탐색한 파일

- js/entities.js (448~511): copyEntity()/pasteEntity()/_clipboard/pasteCount 구현. 변경 핵심 파일.
- js/state.js (11, 31): RELATIONS 배열, vx/vy/scale 전역 뷰포트 변수 선언 위치.
- js/config.js (107~123): DEFAULT_RELATIONS로 관계선 객체 구조 확인, PANEL_W=240, W=295 상수.
- js/relations.js (51~98): 관계선 객체 필드 구조와 from/to가 엔티티 id임을 확인.
- js/canvas.js (1731~1853): _viewportBounds(), toWorld(), _qbLeftOff(), panelOpen/PANEL_W 등 화면→월드 좌표 변환 패턴.
- js/main.js (62~84): copy/paste 단축키 핸들러. paste는 이미 빈 선택 시 CSV 모드 분기 존재.

## 영향 분석

- 단축키 변경: 없음 — Ctrl+C(copy), Ctrl+V(paste) 동작만 내부 수정. main.js 키 바인딩·index.html #shortcutsTableBody·ui.js 메뉴 변경 불필요.
- 새 localStorage 키: 없음 — _clipboard는 메모리 전용 변수(저장 안 됨). RELATIONS는 saveState()/flushCurrentState()에서 이미 직렬화되므로 백업·export 영향 없음.
- 새 데이터 배열/상태 변수: 없음 — _clipboard 객체에 `relations` 속성만 추가(기존 구조 확장). 새 전역 변수 없음.
- 기타 파급 효과:
  - 관계선 객체는 **id 필드가 없고** from/to(엔티티 id) 쌍으로 식별됨. card/lineStyle/pathStyle/label/color는 옵션 필드. 복사 시 JSON 깊은 복제 후 from/to만 새 id로 재매핑하면 됨.
  - pasteEntity()는 현재 FK ref를 null로 제거함(copy.attrs.map(a => ({...a, ref:null}))). 관계선을 함께 복사하더라도 **FK ref와 관계선은 별개**다. 요청 2 범위는 "관계선만" 복사이므로 ref:null 유지(관계선 시각 요소만 복원). FK ref까지 재매핑하는 것은 요청 범위 밖 — 확인 필요(현 계획은 ref:null 유지로 안전하게 진행).
  - 화면 중앙 월드 좌표 계산은 _qbLeftOff()(좌측 도킹 퀵바)와 panelOpen?PANEL_W:0(우측 패널)을 반영해야 정확함. canvas.js 패턴과 동일하게 처리.
  - 뷰포트 중앙 배치로 변경되므로 pasteCount 기반 누적 오프셋은 더 이상 좌표 계산에 사용하지 않음(연속 붙여넣기 시 같은 위치 겹침 방지를 위해 소량 누적 오프셋은 선택적으로 유지 가능 — 구현 시 판단).

## 관계선 객체 구조 (확정)

```
{ from: <entityId>, to: <entityId>, card: '1:N',
  lineStyle?: 'dashed', pathStyle?: 'curved', label?: string, color?: '#xxxxxx', waypoints?: [...] }
```
- id 없음. from/to는 엔티티 id. RELATIONS는 state.js 전역.

## 뷰포트 중앙 월드 좌표 계산 (확정 패턴)

canvas.js 패턴 기반:
```
const off = _qbLeftOff();
const cw  = window.innerWidth - off - (panelOpen ? PANEL_W : 0);
const ch  = window.innerHeight;
const centerWorldX = (cw / 2 - off - vx) / scale;   // toWorld(off + cw/2, ch/2) 와 동일
const centerWorldY = (ch / 2 - vy) / scale;
```
주의: toWorld(cx,cy) = ((cx - _qbLeftOff() - vx)/scale, (cy - vy)/scale). 화면 중앙 화면좌표는 cx = off + cw/2, cy = ch/2. → toWorld(off + cw/2, ch/2) 사용이 가장 안전(중복 보정 방지). 구현 시 toWorld() 헬퍼 직접 호출 권장.

## 구현 계획

### 파일: js/entities.js

#### copyEntity() (453~469)
- 위치: _clipboard 객체 생성부.
- 변경 내용:
  1. 복사 대상 엔티티 id 집합 `entIds`를 Set으로 확보(이미 있음).
  2. RELATIONS를 순회하여 `entIds.has(r.from) && entIds.has(r.to)`인 관계선만 추려 깊은 복제 후 `_clipboard.relations`에 저장.
  3. _clipboard 구조: `{ entities, sections, relations }`.
  4. 토스트 메시지에 관계선 개수 포함 가능(선택). 예: `${total}개 항목 복사됨` 유지 또는 관계선 수 표기.
- 이유: 선택 집합 내부 완결 관계선만 복사(한쪽만 선택된 관계선 제외).

#### pasteEntity() (471~511)
- 위치: 좌표 계산부 + 관계선 붙여넣기 로직 추가.
- 변경 내용:
  1. **좌표 재계산(요청 1)**: 클립보드 엔티티들의 바운딩 박스를 계산.
     - `minX = min(e.x)`, `minY = min(e.y)`, `maxX = max(e.x + W)`, `maxY = max(e.y + entityHeight(e))` (높이 함수는 entityHeight(e) 사용 — canvas.js 전역). 섹션도 포함하려면 섹션 x/y/w/h 반영(엔티티만으로 충분하면 엔티티 기준).
     - 그룹 중심 `gcx = (minX+maxX)/2`, `gcy = (minY+maxY)/2`.
     - 화면 중앙 월드좌표 `c = toWorld(_qbLeftOff() + cw/2, window.innerHeight/2)` (cw = window.innerWidth - _qbLeftOff() - (panelOpen?PANEL_W:0)).
     - 이동량 `dx = c.x - gcx`, `dy = c.y - gcy`.
     - 연속 붙여넣기 겹침 방지를 위해 pasteCount 기반 소량 오프셋(예: 20*pasteCount)을 dx/dy에 가산(선택, 권장).
  2. 각 새 엔티티 좌표 = `e.x + dx`, `e.y + dy` (기존 `e.x + offset` 대체). 섹션도 동일 dx/dy 적용.
  3. **엔티티 id 매핑(요청 2)**: 기존 엔티티 id → 새 엔티티 id 매핑 테이블 `idMap` 구축(newEnts 생성 시 `idMap[origId] = newId`).
  4. **관계선 붙여넣기(요청 2)**: `_clipboard.relations`(있으면) 순회 → 깊은 복제 후 `from = idMap[r.from]`, `to = idMap[r.to]` 재매핑. 두 매핑이 모두 존재할 때만 RELATIONS.push. waypoints가 있으면 dx/dy만큼 이동(있을 경우만; 좌표 기반 waypoint면 보정, 포트 기반이면 그대로).
  5. FK ref는 기존대로 null 유지(요청 범위 밖). 확인 필요 표기.
  6. render(); saveState(); renderEntityTree() 기존 호출 유지.
- 이유: 화면 중앙 배치 + 내부 완결 관계선 동시 복원.

### 파일: js/state.js
- 변경 없음 — RELATIONS/vx/vy/scale 기존 전역 사용.

### 파일: js/canvas.js
- 변경 없음 — toWorld()/_qbLeftOff()/panelOpen/PANEL_W 기존 헬퍼·전역 그대로 활용. (entities.js에서 toWorld가 전역 함수로 호출 가능한지 확인 필요 — 전역 스코프 함수이므로 호출 가능.)

## 확인 필요 (integration-checker 주의)

1. FK ref 재매핑 여부: 현 계획은 관계선만 복원하고 FK ref는 null 유지. 사용자가 FK 컬럼 참조까지 함께 복원하길 원하는지 범위 재확인 가능(현재 요청 문구는 "관계선" 한정 → ref:null 안전).
2. waypoints 좌표 보정: 관계선에 waypoints가 dx/dy 절대 월드좌표로 저장되는 경우 이동 보정 필요. 미보정 시 새 위치에서 경로가 틀어질 수 있음 — 보정 로직 포함 권장.
3. 섹션 바운딩 박스 포함: 섹션만 복사 후 붙여넣을 때도 중앙 배치가 자연스러운지(엔티티 없을 때 분모 0 방지) 엣지케이스 처리 필요.
4. entityHeight(e) 함수가 entities.js에서 호출 가능한 전역인지 확인(canvas.js 정의, 전역 스코프 → 호출 가능 예상).
5. _clipboard에 relations 미존재(이전 복사본/구조) 시 옵셔널 처리(`_clipboard.relations || []`).
