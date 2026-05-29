## 요청 요약

자동 배치(`autoLayout`) 실행 후 엔티티가 화면 밖(주로 우측 등)으로 이동하는 버그를 수정하고, 배치 완료 후 현재 배율(scale)을 유지하면서 배치된 엔티티 전체가 화면에 보이도록 뷰포트를 자동 이동(fit/center)하는 기능을 추가한다.

---

## 탐색한 파일

- `js/layout.js`: `autoLayout`, `placeHierarchical`, `placeGrid`, `placeCircular`, `_runAutoOptimizeRelations`, `_v2FinishUp` 구현 위치. `fitAll()` 호출 지점 2곳 포함.
- `js/state.js`: `vx`, `vy`, `scale` 전역 변수 선언 위치. `flushCurrentState`에서 저장됨.
- `js/canvas.js`: `_qbLeftOff()`, `render()`, `canvas.width`/`canvas.height` 사용 패턴.
- `js/ui.js`: `fitAll()` 함수 구현 — 현재 scale을 콘텐츠 크기에 맞춰 변경하며 `saveState()` 호출 포함.

---

## 영향 분석

- **단축키 변경**: 없음 — 기존 `fitAll` 단축키는 유지됨.
- **새 localStorage 키**: 없음 — `vx`, `vy`, `scale`은 이미 `flushCurrentState`에서 저장됨.
- **새 데이터 배열/상태 변수**: 없음.
- **기타 파급 효과**:
  - `fitAll()`은 scale을 변경하기 때문에 `autoLayout` 완료 후 그대로 호출하면 사용자의 현재 배율이 바뀐다. 요청은 "현재 배율 유지"이므로 `fitAll` 대신 새로운 `centerOnEntities()` 함수가 필요하다.
  - `_runAutoOptimizeRelations`와 `_v2FinishUp` 두 곳에서 `fitAll()`을 호출한다. 두 곳 모두 `centerOnEntities()`로 교체해야 한다.
  - `fitAll()` 자체는 단축키/버튼에서도 사용되므로 그 함수 자체는 변경하지 않는다.
  - 화면 밖 이동 버그의 원인: `fitAll()`이 내부에서 `canvas.width`를 그대로 사용하는데, `_qbLeftOff()`(빠른바 좌측 도킹 offset)를 빼지 않아 유효 캔버스 폭이 과대계산됨. autoLayout 완료 후 fitAll이 호출되지만 quickbar 오프셋 미반영으로 vx 계산에 오차 발생 → 엔티티가 우측 밖으로 밀림.

---

## 구현 계획

### 파일: `js/ui.js`

**위치: `fitAll` 함수 바로 다음에 새 함수 `centerOnEntities` 추가**

- **변경 내용**: 현재 scale을 최대한 유지하되, 콘텐츠가 화면 밖으로 나갈 경우에만 scale을 줄이면서 배치된 엔티티 집합의 bounding box 중심을 화면 중앙에 맞추는 `centerOnEntities()` 함수 추가.
- **핵심**: `_qbLeftOff()`를 반영하여 quickbar 좌측 도킹 시에도 올바른 화면 폭을 사용.

```javascript
function centerOnEntities() {
  if (!ENTITIES.length) return;
  const pad = 60;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + W); maxY = Math.max(maxY, e.y + h);
  });
  const _qlo = (typeof _qbLeftOff === 'function') ? _qbLeftOff() : 0;
  const cw = canvas.width - _qlo;
  const ch = canvas.height;
  const contentW = (maxX - minX) * scale;
  const contentH = (maxY - minY) * scale;
  let newScale = scale;
  if (contentW > cw - pad * 2 || contentH > ch - pad * 2) {
    const scaleX = (cw - pad * 2) / (maxX - minX);
    const scaleY = (ch - pad * 2) / (maxY - minY);
    newScale = Math.min(scaleX, scaleY, scale);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  scale = newScale;
  vx = _qlo + cw / 2 - cx * scale;
  vy = ch / 2 - cy * scale;
  updateZoomLabel();
  render();
}
```

### 파일: `js/layout.js`

**위치 1: `_runAutoOptimizeRelations` 함수 내 `iterate()` 완료 시점**
- **변경 내용**: `fitAll()` 호출을 `centerOnEntities()`로 교체.

**위치 2: `_v2FinishUp` 함수 내 `nudgeIterate()` 완료 시점**
- **변경 내용**: `fitAll()` 호출을 `centerOnEntities()`로 교체.

---

## 핵심 버그 요약

기존 `fitAll()`은 `canvas.width`를 그대로 사용하며 `_qbLeftOff()`(quickbar 도킹 오프셋)를 차감하지 않는다. 이 때문에 quickbar가 좌측 도킹 상태일 때 vx 계산에서 오차가 발생해 엔티티가 화면 우측 밖으로 밀린다. 새 `centerOnEntities` 함수는 이 오프셋을 올바르게 반영하고, 현재 배율을 유지하면서(콘텐츠가 넘칠 때만 축소) bounding box 중심을 화면 중앙에 맞춘다.

**확인 필요**: `fitAll()` 자체도 `_qbLeftOff()`를 반영하도록 수정하면 단축키/버튼 fit 동작도 개선된다. 단, 요청 범위는 autoLayout 완료 시 동작이므로 별도 결정 필요.
