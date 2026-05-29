# 04_review.md — V2 라우터 독립 코드 리뷰

날짜: 2026-05-29  
리뷰어: reviewer agent  
대상: `js/layout.js` V2 영역 (라인 404~1000)  
참조: `js/canvas.js` (obstacleOnSeg, faceAnchor, buildFullWpts, _fixEntityCrossingsForRel)

---

## 1. 기능 정확성 — 4가지 수정이 엔티티 관통 문제를 실제로 해소하는가?

### 수정 A: `_v2RouteWithFaceCycle` (line 647~706)

**판정: 올바르게 구현됨. 핵심 관통 해소 로직이 정상 작동한다.**

- 16조합(4×4)을 생성하고 score 기준 정렬 후 순환 탐색한다. 관통 0 즉시 break 설계는 불필요한 탐색을 줄인다.
- `bestWpts = rel.bend.wpts ? rel.bend.wpts.map(p => [p[0], p[1]]) : null` — 깊은 복사(shallow 배열 원소의 새 배열) 방식이다. wpts 원소는 2-원소 숫자 배열이므로 `[p[0], p[1]]`은 충분히 깊은 복사다. 올바름.
- `_v2AStarRoute`가 A* 실패 시 `_v2SpineRoute`를 내부에서 호출하여 `rel.bend.wpts`를 반드시 설정하므로, 첫 콤보 이후 `bestWpts`가 null로 남는 경우는 없다. 단 예외는 아래 2절에서 별도 논의한다.
- 최적 결과 복원(line 703~705)에서 `fromFace/toFace/fromPct/toPct/wpts` 모두 함께 복원한다. 올바름.

**주의 사항 (버그 아님, 설계 트레이드오프):**  
`runRound`에서 `_v2RouteWithFaceCycle`을 호출할 때 `usage`를 공유 맵으로 넘긴다. 그런데 `_v2AStarRoute` 내부에서는 A* 성공 시 즉시 usage를 갱신한다(line 827~833). 즉 한 관계가 16조합을 순환하는 동안 A* 성공 시마다 usage 맵이 누적 갱신된다. 최종적으로 채택되지 않은 조합의 usage 기록도 맵에 남는다. 이는 동일 라운드 내 후속 관계의 경로 선택에 편향을 유발할 수 있으나, `_v2UpdateUsage`가 라운드 종료 후 전체 재집계로 덮어쓰므로 다음 라운드에는 영향 없다. 관통 정확성에는 영향 없음.

---

### 수정 B: `_v2ClearSpineX/Y` bestCross 추적 (line 930~974)

**판정: 올바르게 구현됨. 관통 최소 후보 추적 로직이 정상 작동한다.**

- 각 이터레이션에서 `obstacleOnSeg`를 3회 재호출하여 `crossCount`를 집계한다. 동일 인자를 `obs` 계산(line 936~938)과 `crossCount` 계산(line 939~943)에서 중복 호출한다. 성능 비용이 있으나 정확성에는 문제 없음.
- `bestCross`는 `Infinity`로 초기화하고 `crossCount < bestCross`이면 갱신한다. 3-세그먼트 경로 모두 검사한다(0~3 범위 정수). 올바름.
- 루프 종료 후 `bestX`/`bestY`를 반환한다. 관통 최소 보장됨.

**경계 케이스:**  
`_v2ClearSpineX/Y`는 3-세그먼트 L자(혹은 Z자) 경로만 가정한다. `_v2SpineRoute`에서 호출되는 시점은 `fromH === toH` 경우(line 905~913, 920~924)이므로 이 3-세그먼트 가정이 성립한다. 올바름.

**미세 결함 (기존 설계 한계):**  
`obs`는 첫 번째 장애물 엔티티를 반환하는 단순 `||` 체인이다. 이 엔티티 기준으로 `candL/candR`을 계산해 `x`를 이동한다. 두 번째/세 번째 세그먼트에 다른 엔티티가 막고 있을 경우 올바른 방향으로 이동하지 못할 수 있다. 그러나 이는 수정 이전부터 존재한 폴백 로직의 한계이며, 이번 수정의 범위를 벗어난다. `_v2RouteWithFaceCycle`가 폴백 경로도 `_v2CountCrossings`로 검증하여 더 나은 면 조합으로 재시도하므로, 실질적 영향은 감소한다.

---

### 수정 C: `mustKeepX/Y` + `thinArr` (line 598~626)

**판정: 올바르게 구현됨.**

- 엔티티 경계 4종(e.x-GAP, e.x, e.x+W, e.x+W+GAP)과 포트 anchor 좌표를 mustKeepX/Y에 등록한다.
- `thinArr` 내 `mustKeep.has(v)`로 보존 여부 결정. 호출 2곳(line 625~626) 모두 3인자. 올바름.
- `thinArr` 알고리즘: `mustKeep.has(v)` OR `Math.round(i/step)*step === i` OR `i===0` OR `i===arr.length-1`. 이 조건으로 must-keep이 아닌 좌표만 솎인다. 정상.

**잠재적 경계 케이스:**  
mustKeepX/Y의 좌표 수가 이미 maxDim(≈63)을 초과할 경우 `thinArr`는 must-keep을 모두 보존하면서 limit를 초과한 결과를 반환한다. 이때 격자 노드 수는 `_V2_GRID_LIMIT(4000)`을 초과할 수 있다. 실제로는 엔티티 63개(X방향) × 63개(Y방향) 이상의 극단적 배치에서만 발생하며, 그 경우 성능은 저하되나 정확성은 오히려 개선된다. 버그 아님, 보수적으로 올바른 방향.

---

### 수정 D: startKey/goalKey blocked 예외 + startDir 가드 (line 788, 791)

**판정: 올바르게 구현됨.**

- `blocked.has(nKey) && nKey !== startKey && nKey !== goalKey` — startKey/goalKey는 blocked여도 허용. 올바름.
- `cur.key === startKey && startDir && (dx !== startDir[0] || dy !== startDir[1])` — startDir null 안전. `faceDirMap[rel.bend.fromFace]`은 항상 4면 중 하나이므로 null이 될 조건은 없으나, `|| null` 폴백이 있어 안전하다. 올바름.

---

## 2. 엣지 케이스 처리

### 빈 배열 (관계 0개)

`runRound`: `RELATIONS.slice()`가 `[]`이므로 `toRoute.forEach`는 즉시 종료. `crossings = 0`, `overlaps = 0` → `_v2FinishUp` 호출. 정상.

### 엔티티 0개

`_v2BuildGrid`: `xs`, `ys` 모두 빈 Set. `xArr/yArr`는 `[]`. `blocked` 빈 Set. 이후 `_v2AStarRoute`에서 `em[rel.from]`이 null → 첫 가드(line 712)에서 return. 정상.

### 관계 0개

라우팅 루프 미진입, `crossings = 0` → 즉시 완료. 정상.

### self-loop (rel.from === rel.to)

`_v2AssignPorts`에서 `fromFace='right', toFace='bottom'`을 설정하고 `wpts=null`로 초기화(line 521~526).

`_v2RouteWithFaceCycle`에서 `a === b`이고 `rel.bend?.fromFace`가 있으므로 16조합 루프로 진입한다. 각 조합마다 `_v2AStarRoute`를 호출하는데, `_v2AStarRoute`는 `rel.from === rel.to` 검사(line 715)에서 고정 루프 wpts를 설정하고 즉시 return한다.

이때 `_v2CountCrossings`가 self-loop 경로를 평가한다. `buildFullWpts`는 `rel.from === rel.to`를 특별 처리하지 않으며 `a === b`이므로 `fromPt`와 `toPt`가 같은 엔티티에서 나온다. `obstacleOnSeg`의 `exIds = [rel.from, rel.to]`는 `[id, id]`로 동일 엔티티를 이중 포함한다. 이 엔티티는 excludeIds에 포함되어 obstacle로 잡히지 않으므로 crossings는 0이 된다.

따라서 첫 조합에서 `cross === 0` → 즉시 break → self-loop 처리 정상. 단 16조합을 순환하지 않고 첫 조합에서 종료하므로 성능 낭비도 없다.

### startKey === goalKey (포트 anchor가 같은 격자점으로 snap)

`_v2AStarRoute` line 739: `rel.bend.wpts = []` 반환. `_v2CountCrossings`는 `buildFullWpts`의 `full = [fromPt, toPt]`(길이 2)에서 세그먼트 1개를 검사한다. 이 세그먼트가 장애물을 관통하면 crossings > 0이 된다. `_v2RouteWithFaceCycle`은 다른 면 조합을 시도한다. 정상.

---

## 3. 무한루프 위험: `_v2RouteWithFaceCycle`의 16조합 루프

**판정: 안전하다.**

- 외부 루프: `for (const { ff, tf } of combos)` — combos는 정확히 16개 원소의 배열이며 splice나 push 없이 순수 iteration이다. 최대 16회 반복 후 반드시 종료한다.
- 내부 `_v2AStarRoute`: `iters < MAX_ITER` (최대 8000회) 상한이 있다. 올바름.
- 내부 `_v2SpineRoute`: 폴백 스파인 함수는 `for (let t = 0; t < 12; t++)` 상한 루프. 올바름.
- `_v2SimplifyWpts`: `while (changed)` 루프이나 매 반복마다 `wpts.splice(wi, 1)`로 wpts 길이가 감소한다. 유한 종료 보장.
- `runRound`의 수렴 루프: `round >= _V2_MAX_ROUND(8)` 조건으로 최대 8라운드 후 강제 종료.
- `nudgeIterate`: `nudgePass >= _V2_MAX_NUDGE(60)` 조건으로 최대 60회 후 강제 종료.

**무한루프 없음.**

---

## 4. 성능: 16조합 × A* + countCrossings 호출

**판정: 대형 다이어그램에서 허용 가능하나 주의가 필요하다.**

- 관계 R개, 격자 노드 N개(최대 4000), 엔티티 E개라 할 때:
  - `_v2RouteWithFaceCycle` 1회당 최대 16 × (A* O(N log N) + countCrossings O(세그먼트×E))
  - A*의 실제 비용: open 리스트 선형 탐색 O(open.length). 최악 O(N²) — min-heap 미사용.
  - MAX_ITER=8000으로 상한이 있으므로 단일 A*는 8000×open_size 연산으로 bounded.
  - crossings = 0이면 즉시 break하므로 평균 케이스는 훨씬 적다(보통 1~3조합).
  - 빽빽한 배치(R=30개 관계, 16조합 모두 소진)에서 최악 30×16×8000 = 3,840,000 이터레이션. 브라우저에서 수 초 소요 가능.
- `requestAnimationFrame`으로 라운드를 분리하여 UI 응답성은 유지된다.

**성능 개선 가능 영역 (선택적):**
1. open 리스트를 정렬 배열에서 실제 min-heap으로 교체 → O(N log N) 보장.
2. `_v2ClearSpineX/Y`의 중복 `obstacleOnSeg` 호출 제거(obs/crossCount 동시 계산 가능).
3. self-loop의 경우 `_v2RouteWithFaceCycle`에서 `rel.from === rel.to` 조기 반환 추가 가능.

---

## 5. `_v2RouteWithFaceCycle`에서 bestWpts 복원 로직 정확성

**판정: 대체로 올바름. 단 한 가지 시나리오에서 주의 필요.**

### 정상 경로

```
bestWpts = rel.bend.wpts ? rel.bend.wpts.map(p => [p[0], p[1]]) : null
```

`_v2AStarRoute`가 성공하면 `rel.bend.wpts`는 배열(빈 배열 포함). 깊은 복사됨. 올바름.  
`_v2AStarRoute`가 실패하면 폴백 `_v2SpineRoute`가 `rel.bend.wpts`를 설정함. 올바름.

### wpts가 null이 될 수 있는 경우

`_v2AStarRoute`의 조건 체크에서 `return`하는 경우들:
- `!a || !b || !rel.bend?.fromFace` → return (wpts 미설정)
- `rel.from === rel.to` → wpts 설정 후 return (정상)
- `startKey === goalKey` → `wpts = []` 후 return (정상)

첫 번째 경우(`!a || !b || !rel.bend?.fromFace`)에서 wpts가 설정되지 않고 return된다.

이때 `_v2RouteWithFaceCycle` 내부에서 `rel.bend?.fromFace`가 있는지 확인(line 650)하고 있으므로 16조합 루프 전에 가드된다. 단, 16조합 루프 내에서 `ff/tf`를 설정한 후 `_v2AStarRoute`를 호출하면, 이 시점에서는 `rel.bend.fromFace`는 존재하므로 해당 가드는 통과한다. 그러나 `a` 또는 `b`가 null이면 가드에 걸려 wpts가 설정되지 않은 채 return된다.

이 경우: `rel.bend.wpts`는 직전 조합에서 설정된 값이 남아 있거나, 최초 호출 시 `_v2AssignPorts`가 `wpts=null`로 설정한 그대로다. `bestWpts = rel.bend.wpts ? ...` 조건에서 null이면 `bestWpts = null`이 된다. 최종 복원(line 705): `rel.bend.wpts = null`.

**이 경우 `_v2CountCrossings` 결과는?**  
`buildFullWpts`는 `!a || !b`이면 `null` 반환 → `_v2CountCrossings`는 0 반환 → `cross = 0` → `bestCross = 0`, `break`.

즉 `a` 또는 `b`가 null인 관계는 "관통 0"으로 간주되어 `wpts = null`로 복원된다. `buildFullWpts`가 null을 반환하면 렌더링이 해당 관계를 기본 경로로 처리한다(`computeOrthogonalPath` 경유). 이는 정확성 문제가 아니라 누락 엔티티 참조의 데이터 이상(orphan relation)에 해당한다.

**판정: wpts null 처리는 사실상 정상. 누락 엔티티 관계는 조용히 skip되며, 렌더링은 기존 기본 경로를 사용한다.**

---

## 6. 특별 확인 항목

### 6-1. `_v2RouteWithFaceCycle`의 최초 면 우선순위 정렬

```js
const score = (ff === origFrom && tf === origTo ? 0 : 1)
            + (ff === prefFrom ? 0 : 2)
            + (tf === prefTo   ? 0 : 2);
```

**분석:**
- 현재 면(origFrom, origTo)이 선호 면(prefFrom, prefTo)과 일치하면 score = 0+0+0 = 0 (최우선).
- 현재 면이지만 선호 면과 불일치하면 score = 0+2+2 = 4 (후순위).
- 선호 면이지만 현재 면이 아니면 score = 1+0+0 = 1 (2순위).

`_v2AssignPorts`는 dx/dy 기반으로 `prefFrom/prefTo`와 동일한 로직으로 면을 배정한다(line 536~542). 따라서 정상 배치에서는 origFrom === prefFrom, origTo === prefTo가 성립하여 score = 0, 즉 현재 면이 1순위로 탐색된다. 이미 최적인 경우 첫 조합에서 cross=0이 나와 즉시 break된다. **효과적.**

**관통이 있는 경우:** origFrom/origTo는 이미 관통을 유발하는 면이므로 이 score 우선순위가 도움이 되지 않는다. 그러나 score 1(선호 면과 일치하는 다른 조합)이 그 다음에 탐색되어, 상대 방향에 맞는 최선 조합을 빠르게 찾는다. **관통 없는 조합을 실제로 먼저 탐색하게 하는가?** 결론: dx/dy 기반 prefFrom/prefTo 조합이 관통 회피에 적합하다는 보장은 없다(장애물 배치에 따라 다름). 그러나 score 정렬은 탐색 순서를 개선하는 휴리스틱으로 유효하며, 최악의 경우 16조합 전체를 소진해 관통 최소 조합을 선택한다. **충분히 견고함.**

### 6-2. `_v2ClearSpineX/Y`의 bestCross 집계

```js
const crossCount = [
  obstacleOnSeg(fromPt[0], fromPt[1], x,       fromPt[1], exIds),
  obstacleOnSeg(x,         fromPt[1], x,        toPt[1],   exIds),
  obstacleOnSeg(x,         toPt[1],   toPt[0],  toPt[1],   exIds)
].filter(Boolean).length;
```

3-세그먼트 경로(수평→수직→수평)의 각 세그먼트를 모두 검사한다. `obstacleOnSeg`는 엔티티 객체(truthy) 또는 null(falsy)을 반환하므로 `.filter(Boolean).length`로 관통 세그먼트 수를 정확히 집계한다. 0~3 범위. **올바름.**

**경계 케이스 — 3-세그먼트가 아닌 경우:** `_v2ClearSpineX`는 `_v2SpineRoute`의 `fromH === toH` 분기에서만 호출되며, 항상 3-세그먼트 경로를 전제한다. 이 가정이 성립하는 한 정확함.

### 6-3. `startDir` 가드

```js
const startDir = faceDirMap[rel.bend.fromFace] || null;
// ...
if (cur.key === startKey && startDir && (dx !== startDir[0] || dy !== startDir[1])) continue;
```

- `faceDirMap`은 4면 모두 정의됨. `rel.bend.fromFace`는 `_v2AssignPorts`에서 반드시 설정되므로 `faceDirMap[rel.bend.fromFace]`는 항상 `[dx, dy]` 배열(truthy). `|| null` 폴백은 실질적으로 도달하지 않는다.
- `startDir`이 truthy일 때 `cur.key === startKey`에서만 방향 제한 적용. 그 이후 노드에서는 자유롭게 확장. **올바름.**
- A* 내부에서 startDir이 null인 경우 가드 통과: `startDir &&` 조건이 false가 되어 모든 방향 허용. **null 안전.**

---

## 7. 발견된 버그 및 심각도

### 버그 없음 (P0/P1 수준)

모든 4가지 수정(A/B/C/D)은 의도한 대로 구현되었다. 관통 해소 로직은 정확하게 작동한다.

---

## 8. 주의 사항 및 권고 사항 (P2 이하 — 선택적 개선)

| 번호 | 위치 | 내용 | 심각도 |
|------|------|------|--------|
| W-1 | layout.js:690, 827~833 | 16조합 순환 중 채택되지 않은 조합의 A* usage 기록이 사용 맵에 누적됨. `_v2UpdateUsage`가 라운드 후 재집계하므로 정확성 영향 없으나, 라운드 내 편향 가능. | P3 |
| W-2 | layout.js:930~943 | `obstacleOnSeg`를 obs 계산과 crossCount 계산에서 동일 인자로 중복 호출. 성능 최적화 여지. | P3 |
| W-3 | layout.js:647~706 | self-loop 관계에서도 16조합 루프에 진입하나 첫 조합에서 cross=0으로 즉시 break. 성능 낭비 미미. `rel.from === rel.to` 조기 반환 추가 가능. | P3 |
| W-4 | layout.js:614~622 | `thinArr`에서 mustKeep 인자 없이 호출하면 `mustKeep.has(v)` 런타임 오류. 현재 모든 호출이 3인자이므로 실제 문제 없음. 방어적 기본값(`mustKeep = mustKeep ?? new Set()`) 추가 권장. | P3 |
| W-5 | layout.js:771, 807 | A* open 리스트 선형 탐색(O(N)). 대형 다이어그램 + 16조합 × 8라운드에서 성능 저하 가능. 실제 min-heap으로 교체하면 O(log N)으로 개선. | P3 |

---

## 9. 종합 판정

**수정 A/B/C/D 모두 정확하게 구현됨. P0/P1 버그 없음. 엔티티 관통 해소 로직이 코드 수준에서 올바르게 동작한다.**

| 리뷰 항목 | 결과 |
|----------|------|
| 수정 A (면 순환 16조합) | PASS |
| 수정 B (bestCross 추적) | PASS |
| 수정 C (mustKeep thinArr) | PASS |
| 수정 D (blocked 예외 + startDir 가드) | PASS |
| 엣지 케이스 (빈 배열/self-loop/0개) | PASS |
| 무한루프 안전성 | PASS |
| 성능 (허용 가능성) | PASS (대형 다이어그램 주의) |
| bestWpts 복원 정확성 | PASS |
| 면 우선 정렬 효과 | PASS |
| bestCross 세그먼트 집계 | PASS |
| startDir null 가드 | PASS |

**수정 불필요. 선택적 개선(W-1~W-5)은 성능/방어적 코딩 관점에서 검토 가능.**
