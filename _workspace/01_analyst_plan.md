# autoOptimizeRelationsV2() 우선순위 재설계 — 분석 보고서

분석일: 2026-05-29
대상 파일:
- `js/layout.js` (V2 영역 404~1000, nudge 영역 335~402, V1 호출 305)
- `js/canvas.js` (`obstacleOnSeg` 145, `buildFullWpts` 212, `_fixEntityCrossingsForRel` 471)

> 정정: 과제 설명은 `_nudgeOverlapPass` / `_applySegNudge`가 `canvas.js`에 있다고 했으나, 실제로는 **둘 다 `js/layout.js`에 정의**되어 있다 (`_nudgeOverlapPass` = layout.js:335, `_applySegNudge` = layout.js:390). `obstacleOnSeg`만 canvas.js:145에 있다.

---

## 우선순위 정의 (재확인)

- **우선순위 1 (절대):** 엔티티 관통 = 절대 불허
- **우선순위 2 (허용):** 선 겹침은 관통 없이 해소 불가할 때만 허용

핵심 결론: 현재 구현은 A* 라우팅 단계(`_v2AStarRoute`)에서는 관통을 hard-constraint로 막지만, **그 이후의 nudge 단계(`_nudgeOverlapPass` → `_applySegNudge`)는 관통 검사를 전혀 하지 않는다.** 즉 겹침 해소(우선순위 2)가 관통 금지(우선순위 1)를 깨뜨릴 수 있는 구조다. 이것이 핵심 결함이다.

---

## 1. `_nudgeOverlapPass`가 엔티티 관통을 새로 유발하는가? → **예 (유발 가능)**

### 근거
- `_nudgeOverlapPass` (layout.js:335~387):
  - 겹치는 세그먼트를 Union-Find로 묶고(360~369), 그룹별 중앙 정렬 오프셋을 계산해(375~384) `_applySegNudge(seg.rel, seg.si, seg.dir, offset)`를 호출(382)한다.
  - 이 함수 본문 어디에도 `obstacleOnSeg` 호출이나 관통 재검사가 **없다.**
- `_applySegNudge` (layout.js:390~402):
  - `wpts[wi1]`/`wpts[wi2]`의 x(또는 y) 좌표에 단순히 `+= offset`만 한다(396~400).
  - 이동 후 관통 검사 **없음.** 이동된 세그먼트가 엔티티 위로 올라타도 그대로 확정된다.

### 결론
NUDGE(=14px) 단위로 세그먼트를 평행 이동시키면, 좁은 통로에 정렬돼 있던 직교 세그먼트가 인접 엔티티 바운딩박스 안으로 밀려 들어가 **새로운 관통을 생성**한다. 검사·롤백 장치가 전혀 없다.

---

## 2. V2에서 nudge 호출 위치와 관통 재검증 여부

### 호출 지점 (2곳)
- `_runOptimizeV2` → `runRound` 내 **layout.js:453**: `overlaps = _nudgeOverlapPass(14, 2);`
- `_v2FinishUp` → `nudgeIterate` 내 **layout.js:478**: `const ov = _nudgeOverlapPass(14, 2);`

### 재검증 분석
- **layout.js:453 (runRound):**
  - 관통 카운트(`crossings`)는 nudge **이전인** 452라인에서 계산된다.
  - nudge(453)는 그 뒤에 실행되므로, **nudge가 만든 관통은 이번 라운드의 `crossings`에 반영되지 않는다.**
  - 부분적 안전장치: 다음 라운드(444)에서 `_v2CountCrossings(rel) > 0`인 선만 재라우팅한다. 즉 "다음 라운드"에 nudge 관통이 잡혀 다시 라우팅될 수 있다.
  - **그러나** 마지막 라운드(`round >= _V2_MAX_ROUND`, 459)에서 nudge가 관통을 만들면 재라우팅 기회 없이 `_v2FinishUp`으로 넘어간다.

- **layout.js:478 (nudgeIterate, 마무리 단계):**
  - nudge(478) 이후 `crossings > 0`일 때만 `_fixEntityCrossingsForRel`로 보정(480~488)한다.
  - 문제: 진입 시점에 `crossings === 0`이면 `if (crossings > 0)` 블록을 건너뛴다(480). 따라서 **nudge(478)가 새로 만든 관통은 측정조차 되지 않는다.**
  - 종료 조건(493) `ov === 0 && crossings === 0`은 nudge 이전 상태의 `crossings`(또는 0)만 본다. nudge로 생긴 관통을 0으로 오인해 "V2 최적화 완료"를 띄울 수 있다(500~502).

### 결론
**두 호출 모두 nudge 직후의 관통을 같은 사이클 안에서 검증하지 않는다.** runRound는 다음 라운드에 부분 보정 가능성이 있으나 마지막 라운드에선 그대로 통과하고, nudgeIterate는 `crossings===0` 진입 시 nudge 관통을 완전히 놓친다. → 우선순위 1 위반 가능.

---

## 3. `_v2RouteWithFaceCycle`의 관통=0 우선순위 → **A* 라우팅 단계는 올바름**

### 면 조합 선택 로직 (layout.js:647~706)
- 16조합(4 from-face × 4 to-face)을 score로 정렬(669~677)하여 순회.
- 채택 기준은 **오직 `cross` 값**: `if (cross < bestCross)` (693). cross가 더 적은 조합만 best로 갱신하며, `cross === 0`을 만나면 즉시 `break`(698)로 탐색 종료.
- **usage·turn 비용은 best 선택 기준에 전혀 반영되지 않는다.** 면 조합 단계의 비교 척도는 순수하게 관통 개수다.
- → **관통=0 경로가 존재하면 반드시 최우선 채택된다. usage 페널티 때문에 관통>0를 택하는 일은 이 레벨에서는 없다.**

### `_v2AStarRoute` 내부 usage 비용의 영향 (layout.js:709~838)
- 관통은 **hard constraint**로 처리된다: `if (obstacleOnSeg(...)) continue;` (794). 관통 세그먼트는 비용 비교 대상이 아니라 **확장 후보에서 완전히 배제**된다.
- usage 비용(`uCost`, 800)·turn 비용(798)은 g-score에만 더해지므로 **관통 없는 경로들 사이의 선택**에만 영향을 준다. usage가 아무리 커도 관통 간선을 열어주지 않는다.
- 단, A*가 MAX_ITER(771) 안에 목표를 못 찾으면(`!found`, 812) `_v2SpineRoute`(814) 폴백으로 빠진다. 폴백은 `obstacleOnSeg` 기반 best-effort라 관통이 남을 수 있으나, 이는 usage 때문이 아니라 격자/반복 한계 때문이다.

### 결론
- 면 조합 단계(`_v2RouteWithFaceCycle`)와 A* 단계(`_v2AStarRoute`) **둘 다 관통=0을 절대 우선**으로 둔다. usage 페널티가 관통을 무릅쓰게 만드는 경로는 없다.
- **관통을 새로 만드는 진짜 원인은 라우팅이 아니라 라우팅 이후의 nudge다** (섹션 1·2). 즉 우선순위 위반의 근원은 nudge 단계에 국한된다.

---

## 4. 수정 방향 결정 → **방법 A 채택 (추천 동의)**

### 방법 A: V2 전용 nudge 래퍼 `_v2NudgeWithCrossingCheck()` 신설
- nudge 전 대상 관계선들의 `rel.bend.wpts` 백업
- `_nudgeOverlapPass(14, 2)` 호출
- 호출 후 각 관계선의 관통(`_v2CountCrossings(rel, [rel.from, rel.to])`)을 재측정하여, **nudge 전 대비 관통이 늘어난 선만 wpts를 백업으로 복원**

### 방법 B: `_nudgeOverlapPass` 내부에서 관통 시 nudge 취소
- `_applySegNudge` 적용 후 `obstacleOnSeg`로 관통 확인 → 발생 시 해당 세그먼트 취소
- **단점:** V1(`autoOptimizeRelations`, layout.js:305)도 이 함수를 공유 → V1 동작 변경 위험.

### 판단
**방법 A를 채택한다.** 이유:
1. **V1 무영향:** `_nudgeOverlapPass`는 V1(305)·V2(453, 478)가 공유한다. 방법 B는 V1의 겹침 분리 결과를 바꿔 회귀를 일으킬 수 있다. 방법 A는 V2 호출 지점만 래퍼로 교체하므로 V1은 그대로다.
2. **그룹 단위 정합성:** `_nudgeOverlapPass`는 겹침 그룹 전체를 중앙 정렬 오프셋으로 한 번에 이동시킨다(375~384). 방법 B처럼 세그먼트별로 개별 취소하면 그룹 정렬 대칭이 깨져 "절반만 이동된" 어정쩡한 상태가 남는다. 방법 A는 관계선 단위 all-or-nothing 복원이라 정렬 일관성이 유지된다.
3. **구현 격리·롤백 용이:** 래퍼는 layout.js V2 영역에 독립 추가되므로 리스크가 작고 제거도 쉽다.

### 구현 계획 (파일:라인)

1. **신규 함수 추가 — `js/layout.js`, `_applySegNudge` 직후(현 402라인 다음)에 삽입:**
   ```js
   // V2 전용: nudge 후 새 관통이 생긴 관계선은 wpts를 복원 (우선순위 1 보호)
   function _v2NudgeWithCrossingCheck(NUDGE, TOL) {
     // 1) nudge 전 wpts 백업 + 기존 관통 수 기록
     const backup = new Map();   // rel -> deep-copied wpts (또는 null)
     const before = new Map();   // rel -> crossing count
     RELATIONS.forEach(rel => {
       const w = rel.bend?.wpts;
       backup.set(rel, w ? w.map(p => [p[0], p[1]]) : null);
       before.set(rel, _v2CountCrossings(rel, [rel.from, rel.to]));
     });
     // 2) 기존 겹침 분리 패스 수행
     const overlaps = _nudgeOverlapPass(NUDGE, TOL);
     // 3) 관통이 늘어난 관계선만 복원
     RELATIONS.forEach(rel => {
       const after = _v2CountCrossings(rel, [rel.from, rel.to]);
       if (after > before.get(rel)) {
         const b = backup.get(rel);
         if (rel.bend) rel.bend.wpts = b ? b.map(p => [p[0], p[1]]) : null;
       }
     });
     return overlaps;
   }
   ```
   - 비교 기준을 "관통 0 여부"가 아니라 "before 대비 증가"로 두는 이유: 마무리 단계에서 잔여 관통이 이미 있는 선이라도 nudge가 그것을 악화시키지 않으면 겹침 해소 효과는 살리기 위함(우선순위 2 존중).

2. **호출 교체 1 — `js/layout.js:453`:**
   - `overlaps = _nudgeOverlapPass(14, 2);`
   - → `overlaps = _v2NudgeWithCrossingCheck(14, 2);`

3. **호출 교체 2 — `js/layout.js:478`:**
   - `const ov = _nudgeOverlapPass(14, 2);`
   - → `const ov = _v2NudgeWithCrossingCheck(14, 2);`

4. **V1 호출(layout.js:305)은 변경하지 않는다.**

> 주의: `overlaps` 반환값의 의미가 약간 달라진다(복원된 선의 겹침이 다시 살아날 수 있어 실제 잔여 겹침과 불일치 가능). 진행 표시(456, 490)·종료 판정(459, 493)에서 overlaps를 "수렴 신호"로 쓰므로, 복원으로 인해 겹침이 줄지 않아 루프가 `_V2_MAX_ROUND`/`_V2_MAX_NUDGE` 상한까지 도는 경우가 생길 수 있다. 이는 우선순위 1(관통 금지)을 우선순위 2(겹침)보다 우위에 둔다는 설계 의도와 일치하므로 허용 가능. 필요 시 종료 메시지(500~502)에서 "겹침은 관통 회피를 위해 잔존" 취지로 문구만 조정.

---

## 5. pct 값도 순환해야 하는가? → **예, 보조 개선으로 유효 (선택적, 2순위 작업)**

### 현재 한계
- `_v2RouteWithFaceCycle`는 면이 바뀌면 pct를 **0.5로 고정**한다: `if (ff !== origFrom) { rel.bend.fromPct = 0.5; }` / `if (tf !== origTo) { rel.bend.toPct = 0.5; }` (687~688).
- `_v2AssignPorts`의 같은-면 다중 포트 분산(549~571)은 라우팅 진입 전 1회만 수행되고, 면 조합 순환 중에는 0.5로 덮어써진다.
- 결과: 면이 같아도 **포트가 면 중앙(0.5)에 고정**되어, 좁은 엔티티 사이에서 0.5 anchor에서 출발하는 모든 후보 경로가 관통할 때 면 조합만으로는 탈출구가 없다. 0.25/0.75 같은 가장자리 anchor라면 관통 없는 우회가 가능한 상황을 놓친다.

### pct 순환의 효과
- 면 16조합 각각에 fromPct ∈ {0.25, 0.5, 0.75}, toPct ∈ {0.25, 0.5, 0.75}를 곱하면 탐색 공간이 16 → 최대 144조합으로 늘어 **관통=0 경로 발견 확률이 상승**한다.
- 채택 기준이 이미 cross 최소(693) + cross===0 즉시 break(698)이므로, 조합만 추가하면 우선순위 로직 변경 없이 자연스럽게 더 나은 해를 찾는다.

### 비용·리스크
- 조합 폭증 → 관계당 A* 호출 횟수 9배. `_v2AStarRoute`는 관계마다 격자 전체 A*(MAX_ITER 최대 8000, 771)를 돈다. 대형 다이어그램에서 **runRound가 무거워질 수 있다.**
- 완화책: pct 순환은 **면 조합으로 cross===0을 못 찾은 경우에만** 2차로 시도하는 단계적 확장(early-exit 유지)으로 비용을 억제. 또는 pct 후보를 {0.3, 0.7} 2개로 제한.
- `_v2BuildGrid`는 현재 fromPct/toPct가 0.5 또는 `_v2AssignPorts` 분산값일 때의 anchor만 격자선으로 등록(589~592, 608~611)한다. pct를 순환하려면 **0.25/0.75 anchor 좌표도 격자선에 추가**해야 A*가 그 점을 노드로 가진다(추가 안 하면 snap이 어긋나 경로 품질 저하).

### 결론
- pct 순환은 관통=0 경로 탐색력을 높이는 **유효한 보조 개선**이며 현재 0.5 고정이 실제 한계다.
- 단, 우선순위 1 위반(섹션 1·2의 nudge 문제)과는 **독립**된 사안이다. **1차 수정은 방법 A(nudge 관통 차단)**가 우선이고, pct 순환은 **2순위 선택 작업**으로 분리 권장한다. 도입 시: (a) 면 조합 실패 후 단계적 pct 확장, (b) `_v2BuildGrid`에 pct anchor 격자선 추가를 함께 처리.

---

## 작업 우선순위 요약

| 순위 | 작업 | 위치 | 효과 |
|------|------|------|------|
| 1 (필수) | `_v2NudgeWithCrossingCheck` 신설 | layout.js 402 직후 신설 | nudge가 만드는 관통 차단 (우선순위 1 보호) |
| 1 (필수) | nudge 호출 2곳 래퍼로 교체 | layout.js:453, 478 | V2만 적용, V1(305) 무영향 |
| 2 (선택) | pct 순환 단계적 확장 + 격자 anchor 추가 | layout.js 683~700, 589~592/608~611 | 관통=0 경로 발견율 상승 |
