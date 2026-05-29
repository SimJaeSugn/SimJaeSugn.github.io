# 최종 리뷰 — autoOptimizeRelationsV2() 우선순위 재설계

리뷰 일시: 2026-05-29
대상 파일: js/layout.js (V2 영역 405~754, nudge 영역 335~422)
리뷰어: 직접 코드 읽기 (4가지 핵심 검토 사항)

---

## 검토 1: `_v2NudgeWithCrossingCheck` 성능 영향

### 코드 근거 (layout.js)

- 405~422: `_v2NudgeWithCrossingCheck` — RELATIONS.forEach × 2회 `_v2CountCrossings` 호출 (before/after)
- 902~912: `_v2CountCrossings` — `buildFullWpts` + 세그먼트별 `obstacleOnSeg`
- canvas.js 145~154: `obstacleOnSeg` — ENTITIES 전체 순회 O(E)
- canvas.js 212~233: `buildFullWpts` — O(wpts.length) 배열 복사

### 비용 계산

| 변수 | 현실적 값 |
| --- | --- |
| N (관계 수) | 50~100 |
| E (엔티티 수) | 10~30 |
| S (평균 세그먼트/관계) | 2~4 |
| MAX_NUDGE 패스 | 60 |

1패스당 추가 비용: 2 × N × S × E ≈ 2 × 100 × 3 × 30 = 18,000회 정수 비교
60패스 총계: 약 108만 회 정수 비교 → JS 엔진 기준 수 ms 수준

또한 `runRound` (_V2_MAX_ROUND=8)에서도 동일하게 호출되므로:
8라운드 × 2 × N × S × E ≈ 144,000회 추가

**판정: 허용 가능.** requestAnimationFrame으로 라운드가 분산되고, 각 패스 안에서 N이 클 때도 단순 정수/부동소수 비교만 수행하므로 실용적 부담 없음. 관계 500개 이상 극단적 대형 다이어그램에서는 체감 가능하지만 현실적 ERD(관계 수십~100개)에선 문제 없다.

---

## 검토 2: pct 확장 시 `outer` 레이블 문법

### 코드 (layout.js 732~747)

```js
if (bestCross > 0) {
  const pctCandidates = [0.25, 0.75];
  outer: for (const fp of pctCandidates) {    // ← 734: for 루프에 직접 레이블 선언
    for (const tp of pctCandidates) {
      ...
      if (cross === 0) break outer;            // ← 744: 외부 for 루프 탈출
    }
  }
}
```

### 검증

- JavaScript 레이블 문(`LabelledStatement`)은 `label: Statement` 형식으로, 어떤 구문에도 붙일 수 있다. for 루프에 직접 선언하는 것은 표준 문법이다.
- `outer:` 레이블이 pctCandidates 이중 루프 전체를 감싸는 외부 for 루프에 붙어 있고, `break outer`는 해당 레이블 블록을 탈출한다.
- `if (bestCross > 0)` 블록 자체에는 레이블이 없으며, `break outer`는 for 루프를 대상으로 한다 — 의도대로 작동.

**판정: 문법 정확, 오류 없음.** 이중 루프에서 cross===0 발견 즉시 탈출하는 early-exit 로직이 올바르게 구현되어 있다.

---

## 검토 3: `_v2BuildGrid` 격자 폭발 위험

### 추가되는 anchor 수 계산 (layout.js 615~622)

```js
ENTITIES.forEach(ent => {
  for (const pct of [0.25, 0.5, 0.75]) {
    ['right', 'left', 'top', 'bottom'].forEach(face => {
      const pt = faceAnchor(ent, face, pct);
      if (pt) { xs.add(pt[0]); ys.add(pt[1]); }
    });
  }
});
```

- N 엔티티 × 3 pct × 4 면 = 12N 좌표 추가
- N=30: 360점 → xs/ys 각각 최대 360개 원소 추가
- 기존 원소 (ENTITIES 8점/entity + RELATIONS 2점/rel): N=30, R=50 → 240 + 100 = 340
- 총 xs/ys 원소 합계 ≈ 700개

### thinArr 상한 적용 (layout.js 643~655)

```js
const maxDim = Math.ceil(Math.sqrt(_V2_GRID_LIMIT)); // = ceil(sqrt(4000)) = 64
const xFinal = thinArr(xArr, maxDim, mustKeepX);
const yFinal = thinArr(yArr, maxDim, mustKeepY);
```

- maxDim = 64. 700 > 64이면 thinArr가 간소화.
- 최종 격자: xFinal.length × yFinal.length ≤ 64 × 64 = 4,096

### mustKeep과의 관계

mustKeepX/mustKeepY에 보존되는 좌표 (layout.js 628~641):

- ENTITIES 경계 좌표 (e.x-GAP, e.x, e.x+W, e.x+W+GAP 등) ← 반드시 유지
- RELATIONS 현재 anchor (fromFace/toPct 기반) ← 반드시 유지
- **pct 확장 anchor (0.25/0.5/0.75)는 mustKeep에 없음** ← thinArr가 제거 가능

#### 영향 평가

pct anchor가 mustKeep에 없어 thinArr 시 일부 제거될 수 있다. 그러나:

1. pct anchor의 목적은 A*가 0.25/0.5/0.75 위치를 격자 노드로 가지는 것이며, 제거되어도 인근 snap으로 대체된다.
2. 모든 엔티티 경계는 mustKeep으로 보존되므로 A*의 핵심 장애물 회피 정확성에는 영향 없다.
3. pct anchor 전부 제거되어도 A*는 기존과 동일하게 작동 (이 기능 추가 전 상태로 degradation).

**판정: 격자 폭발 위험 없음.** thinArr가 _V2_GRID_LIMIT=4000 상한 내로 제한하며 mustKeep 보존도 정상 작동. pct anchor의 mustKeep 미포함은 기능 저하는 아니며 허용 가능한 설계 선택이다.

---

## 검토 4: 롤백 후 `overlaps` 반환값 신뢰성

### 코드 흐름 분석

**`_nudgeOverlapPass` 반환값의 의미 (layout.js 359~386):**

```js
let overlapCount = 0;
for (let i = 0; i < segs.length; i++) {
  for (let j = i + 1; j < segs.length; j++) {
    ...
    union(i, j);
    overlapCount++;      // ← nudge 적용 전 감지된 겹침 쌍 수
  }
}
if (overlapCount === 0) return 0;
// nudge 적용 후 overlapCount를 재계산하지 않음
return overlapCount;    // ← 386: nudge 전 겹침 쌍 수 그대로 반환
```

**핵심**: `overlapCount`는 nudge **시작 전** 상태에서 감지된 겹침 쌍 수이다. nudge 적용 후 (또는 롤백 후) 실제 잔여 겹침을 다시 세지 않는다.

### 조기 종료 위험 평가

**runRound 종료 조건 (layout.js 479):**

```js
if ((crossings === 0 && overlaps === 0) || round >= _V2_MAX_ROUND)
```

- `overlaps === 0`: 이번 패스 **시작 전** 겹침이 없었다는 뜻
- 롤백으로 일부 wpts가 복원되어도 `overlaps` 값은 이미 확정되어 있음
- 복원된 선의 겹침은 **다음 패스 시작 시** `_nudgeOverlapPass` 첫 단계에서 재감지됨

**시나리오: 조기 종료 발생하는가?**

| 시나리오 | 설명 | 결론 |
| --- | --- | --- |
| overlaps=0 반환 | 패스 시작 전 겹침이 없었으므로 rollback과 무관하게 실제도 0 | 안전 |
| overlaps=5 반환 후 일부 rollback | overlaps=5 → 다음 루프 반복, rollback된 겹침이 다음 패스에 재감지 | 안전 |
| 모든 nudge가 rollback됨 | overlaps=K 반환 → 루프 반복, 다음 패스에서 K 재감지 | 안전 (수렴 느려질 수 있음) |

**핵심 결론**: `overlaps === 0`은 실제로 패스 시작 전 겹침이 없다는 뜻과 동치이므로, 롤백 여부와 무관하게 종료 조건이 신뢰할 수 있다. **과소 평가로 인한 조기 종료 위험 없음.**

**수렴 속도 영향**: 롤백이 자주 발생하면 겹침이 해소되지 않아 overlaps > 0이 유지되고 루프가 MAX_NUDGE까지 도는 경우가 있을 수 있다. 이는 **우선순위 1(관통 금지) > 우선순위 2(겹침 해소)** 설계 의도와 일치하는 정상 동작이다.

**판정: 신뢰성 문제 없음.** 롤백 후 종료 조건의 과소 평가로 인한 조기 종료는 발생하지 않는다.

---

## 심각한 문제 수정 여부

4가지 항목 모두 허용 가능하거나 정상이므로 코드 수정 없음.

---

## 총평

| 검토 항목 | 판정 | 비고 |
| --- | --- | --- |
| 1. `_v2NudgeWithCrossingCheck` 성능 (120N회/MAX_NUDGE) | PASS | N≤100 현실 ERD에서 수 ms 수준, 허용 가능 |
| 2. `outer` 레이블 문법 (for 루프 이중 break) | PASS | JavaScript 표준 문법, 의도대로 동작 |
| 3. `_v2BuildGrid` 격자 폭발 (thinArr+mustKeep) | PASS | 4,096 상한 내 보장, pct anchor 미보존은 허용 범위 |
| 4. 롤백 후 `overlaps` 반환값 신뢰성 | PASS | 조기 종료 없음, 수렴 지연은 설계 의도와 일치 |

## 최종 판정: PASS

심각 이슈 없음. 4가지 핵심 검토 사항 모두 코드가 설계 의도에 부합하며 실용적으로 안전하다.
