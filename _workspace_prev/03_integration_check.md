# 03 — Integration Check Report
날짜: 2026-05-29

---

## 1. 단축키 동기화 [N/A — 확인 완료]
새 단축키 없음. `index.html #shortcutsTableBody` 변경 불필요.
V2 라우팅 기능은 UI 진입점 없이 내부 레이아웃 함수로만 동작하므로 단축키 등록 대상이 아니다.

**결과: PASS**

---

## 2. 백업 통합 [N/A — 확인 완료]
V2 라우팅 로직은 `rel.bend` 객체를 런타임 중 조작하는 순수 연산이다.
새 `localStorage` 키 없음. `export/import/ui.js` 변경 불필요.

**결과: PASS**

---

## 3. 구현 코드 정확성

### 수정 D — `blocked` 예외 및 `startDir` 방향 가드 (line 788, 791)

```js
if (blocked.has(nKey) && nKey !== startKey && nKey !== goalKey) continue;  // line 788
if (cur.key === startKey && startDir && (dx !== startDir[0] || dy !== startDir[1])) continue;  // line 791
```

- `blocked.has(nKey) && nKey !== startKey && nKey !== goalKey`: startKey/goalKey는 blocked여도 통과 — **올바름**.
- `startDir` 방향 가드는 `cur.key === startKey`일 때만 적용 — **올바름**.
- `startDir`이 null(면 정보 없을 때)이면 가드 통과 — **올바름**.

**결과: PASS**

---

### 수정 C — `mustKeepX/Y` + `thinArr` (lines 599-626)

**mustKeep 집합 구성:**
```js
[e.x - GAP, e.x, e.x + W, e.x + W + GAP].forEach(v => mustKeepX.add(v));  // line 602
[e.y - GAP, e.y, e.y + eh, e.y + eh + GAP].forEach(v => mustKeepY.add(v)); // line 603
```
4개 X 좌표(−GAP, 0, +W, +W+GAP)와 4개 Y 좌표(−GAP, 0, +eh, +eh+GAP) 모두 포함 — **올바름**.

포트 anchor 좌표도 mustKeepX/Y에 추가 (lines 610-611) — **올바름**.

**thinArr 3인자 시그니처 호환성:**
`thinArr`는 `_v2BuildGrid` 내부 로컬 함수이며, 외부 호출 위치 없음.
내부 호출 2곳(lines 625-626) 모두 3인자로 호출. 2인자 호출 없음 — **호환 문제 없음**.

단, `thinArr` 내부에서 `mustKeep.has(v)`를 직접 호출하므로, `mustKeep`이 `undefined`이면 런타임 오류 발생.
현재 모든 호출이 3인자이므로 실제 문제 없음. 필요 시 `mustKeep = mustKeep || new Set()` 기본값 추가 권장(옵션).

**결과: PASS** (방어적 기본값 추가는 선택사항)

---

### 수정 B — `_v2ClearSpineX/Y`의 `bestCross` 추적

```js
function _v2ClearSpineX(fromPt, toPt, exIds) {   // line 930
  ...
  let bestX = x, bestCross = Infinity;
  for (let t = 0; t < 12; t++) {
    const crossCount = [...].filter(Boolean).length;
    if (crossCount < bestCross) { bestCross = crossCount; bestX = x; }
    ...
  }
  return bestX;
}
```

- 시그니처: `(fromPt, toPt, exIds)` — `rel` 인자 없음.
- 내부에서 `_v2CountCrossings` 호출 없음. `obstacleOnSeg` 결과를 직접 카운트.
- `exIds`는 `_v2SpineRoute`에서 `[rel.from, rel.to]`로 전달 (line 901) — **올바름**.
- `bestCross` 추적 로직: `crossCount`(0~3 범위 정수)를 순회하며 최솟값 갱신 — **올바름**.

`_v2ClearSpineX/Y`는 "폴백 스파인 라우팅" 내부 헬퍼이며, `_v2CountCrossings`(rel 기반) 대신 세그먼트별 obstacle 카운트를 사용한다. 이는 폴백 용도에 적합하고 `rel` 없이도 작동 가능 — **설계상 의도적**.

**결과: PASS**

---

### 수정 A — `_v2RouteWithFaceCycle` (lines 647-706)

**16조합 생성:**
```js
const faces = ['right', 'left', 'bottom', 'top'];  // 4면
for (const ff of faces) {
  for (const tf of faces) { ... }  // 4×4 = 16 조합
}
```
16조합 정확히 생성 — **올바름**.

**각 조합 시도 시 면/pct 설정:**
```js
rel.bend.fromFace = ff;   rel.bend.toFace   = tf;
if (ff !== origFrom) { rel.bend.fromPct = 0.5; }
if (tf !== origTo)   { rel.bend.toPct   = 0.5; }
```
`fromFace`, `toFace`, `fromPct`, `toPct` 모두 올바르게 설정 — **올바름**.

**최적 wpts 저장 및 복원:**
```js
bestWpts = rel.bend.wpts ? rel.bend.wpts.map(p => [p[0], p[1]]) : null;  // 깊은 복사
...
rel.bend.wpts = bestWpts;  // 복원
```
- `rel.bend.wpts`를 `.map(p => [p[0], p[1]])`으로 깊은 복사 — **올바름**.
- `_v2AStarRoute`는 실패 시 `_v2SpineRoute`로 폴백하여 `rel.bend.wpts`를 항상 설정.
  따라서 `bestWpts`는 첫 콤보 후 반드시 non-null — **올바름**.
- bestFrom/bestTo/bestFromPct/bestToPct도 함께 복원 (lines 703-705) — **올바름**.

**`runRound`에서 `_v2AStarRoute` 직접 호출 제거:**
```js
toRoute.forEach(rel => {
  _v2RouteWithFaceCycle(rel, grid, usage);  // line 447 — 완전 교체
  _v2SimplifyWpts(rel);
});
```
`runRound` 내 `_v2AStarRoute` 직접 호출 없음. 확인된 `_v2AStarRoute` 호출:
- line 651: `_v2RouteWithFaceCycle` 내부 조기 반환 폴백
- line 690: `_v2RouteWithFaceCycle` 내부 조합 루프

**첫 라운드에서도 `_v2RouteWithFaceCycle` 사용:**
```js
const toRoute = round === 1 ? RELATIONS.slice() : RELATIONS.filter(...)  // line 442
toRoute.forEach(rel => { _v2RouteWithFaceCycle(rel, grid, usage); ... })  // line 447
```
첫 라운드(round === 1)에도 `_v2RouteWithFaceCycle` 적용 — **올바름**.

**결과: PASS**

---

## 4. V1 공유 함수 시그니처 불변 확인

| 함수 | 위치 | 시그니처 | 변경 여부 |
|------|------|----------|----------|
| `_nudgeOverlapPass` | layout.js:335 | `(NUDGE, TOL)` | 변경 없음 |
| `_fixEntityCrossingsForRel` | canvas.js:471 | `(rel)` | 변경 없음 |

두 함수 모두 시그니처 불변 — **PASS**.

---

## 종합 결과

| 항목 | 결과 |
|------|------|
| 단축키 동기화 | PASS (N/A) |
| 백업 통합 | PASS (N/A) |
| 수정 D (blocked 예외) | PASS |
| 수정 C (mustKeep thinArr) | PASS |
| 수정 B (_v2ClearSpineX/Y bestCross) | PASS |
| 수정 A (_v2RouteWithFaceCycle 16조합) | PASS |
| V1 시그니처 불변 | PASS |

**발견된 버그: 없음. 수정 불필요.**

모든 수정이 올바르게 구현됐다. 코드 변경 없이 검증 완료.
