# autoOptimizeRelationsV2() 관계선 엔티티 관통 — 근본 원인 분석 및 수정 계획

대상 파일:
- `js/layout.js` (V2 영역 404~901라인)
- `js/canvas.js` (`obstacleOnSeg` 145, `faceAnchor` 160, `buildFullWpts` 212, `_fixEntityCrossingsForRel` 471)

---

## 0. 요약 (TL;DR)

V2는 A* 격자 라우터로 직교 경로를 찾지만 **관통이 잔존**한다. 근본 원인은 4가지가 복합적으로 작동한다.

1. **A* 실패 시 폴백(`_v2SpineRoute`)이 관통을 전혀 재검증하지 않고 경로를 그대로 확정**한다. (layout.js:727~731, 806~842) → 관통 경로가 그대로 살아남는 최대 원인.
2. **수렴 루프가 관통 있는 관계선을 재라우팅할 때 포트 면(fromFace/toFace)을 절대 바꾸지 않는다.** usage cost만 올린다. (layout.js:442~447, 462~463) → 동일 면·동일 격자에서 A*가 매번 같은(혹은 동일하게 막힌) 경로를 재생산 → 탈출 불가.
3. **Hanan 격자의 `blocked`는 노드(꼭짓점)만 막고, 간선(edge) 자체가 엔티티를 가로지르는 경우는 `blocked.has()`로 못 막는다.** 간선 검사는 `obstacleOnSeg`에만 의존하는데, **격자 thinning(`thinArr`)으로 엔티티 경계 좌표선이 누락되면** 한 격자 간선이 엔티티를 통째로 건너뛰어도 `obstacleOnSeg`가 잡되, A*가 실패하면 (원인 1로) 폴백이 관통을 확정한다.
4. **`_v2FinishUp`의 `_fixEntityCrossingsForRel`는 우회 공간(canL/canR 또는 above/below 범위)이 없으면 아무 것도 못 한다.** (canvas.js:528~539) 빽빽한 배치에서 무한정 같은 시도를 6회 반복 후 포기 → 관통 잔존.

핵심: **포트 면을 고정한 채 같은 격자에서만 재시도**하므로, 출발/도착 면 조합을 순환(4×4)하며 관통 0이 될 때까지 재라우팅하는 로직이 없다. 이것이 "관통이 0이 될 때까지 반복"이라는 기대 동작을 충족 못 하는 설계상 결함이다.

---

## 1. A* 라우터의 obstacleOnSeg 호출이 실제로 관통을 막는가?

### 코드 확인 (layout.js:702~724)
이웃 탐색 루프:
```
for (const [dx, dy] of dirs) {
  ...
  if (blocked.has(nKey)) continue;                                  // 706: 노드만 검사
  if (obstacleOnSeg(xs[cur.xi], ys[cur.yi], xs[nxi], ys[nyi], exIds)) continue;  // 709: 간선 검사
  ...
}
```

- **간선(edge) 통과는 709라인에서 `obstacleOnSeg`로 실제 검사된다.** 즉 "blocked는 노드만 보고 간선은 안 본다"는 우려는 절반만 맞다. 706은 노드, 709는 간선을 본다.
- `obstacleOnSeg`(canvas.js:145~154)는 세그먼트 bbox와 엔티티 rect의 AABB 겹침(1px 마진)을 본다. **축정렬 격자 간선에 대해서는 관통을 올바르게 검출한다.**
- `exIds`는 `_v2AStarRoute(rel, grid, usage, exIds)` 호출 시 `[rel.from, rel.to]`로 전달된다(layout.js:447). 함수 내부에서 그대로 `obstacleOnSeg(..., exIds)`에 넘긴다. → **출발/도착 엔티티 ID가 올바르게 들어간다. 자기 엔티티를 장애물로 오인하지 않는다.**

### 결론
**A* 자체의 간선 관통 검사는 정상 작동한다.** A*가 경로를 *찾으면* 그 경로는 관통이 없다(격자 간선 단위에서). 문제는 A*가 **실패할 때**와 **격자가 너무 성겨서 우회로가 격자상에 존재하지 않을 때**다 → 원인 2·3으로 연결.

추가 미세 결함:
- **startNode를 제외하면 `prevDir`를 갱신해 push하지만(722), turn penalty 계산 시 `cur.prevDir`만 본다.** 같은 노드를 다른 방향에서 재방문할 때 방향별 g가 분리되지 않아(gScore 키가 노드 단위) 최적 꺾임 경로를 놓칠 수 있으나, 관통 자체와는 무관(품질 문제).
- **startDir 강제가 실제로 적용되지 않는다.** startNode.prevDir에 startDir을 넣지만, 첫 확장에서 출발 면과 반대 방향으로도 이동 가능 → 포트에서 엔티티 안쪽으로 파고드는 첫 세그먼트가 생길 수 있다. 다만 obstacleOnSeg가 exIds로 자기 엔티티를 제외하므로 자기 엔티티 관통은 검출 안 됨 → **포트에서 곧장 자기 몸체를 가로지르는 첫 간선이 허용**될 수 있다(시각적 관통처럼 보임). 보강 필요.

---

## 2. _v2SpineRoute 폴백이 관통을 유발하는가?

### 코드 확인 (layout.js:727~731, 806~842)
```
if (!found) {
  _v2SpineRoute(rel);   // 729
  return;               // 730  ← 관통 재검증 없이 즉시 반환
}
```
`_v2SpineRoute`(806~842):
- 같은 축(fromH===toH)이면 `_v2ClearSpineX/Y`로 스파인 1개를 장애물 회피 시도(최대 12회).
- 혼합 축이면 corner L-shape 시도 후 막히면 스파인.
- **그러나 `_v2ClearSpineX/Y`(845~875)는 단일 스파인 좌표 하나만 좌우/상하로 밀어보는 방식**이고, 12회 안에 깨끗한 위치를 못 찾으면 **마지막 후보 좌표를 그대로 반환**한다(루프 break 없이 종료). 반환 경로가 관통하는지 최종 확인하지 않는다.
- `_v2SpineRoute`는 **반환 후 관통 카운트(`_v2CountCrossings`)를 호출하지 않는다.** 폴백 경로의 관통 여부는 다음 라운드 `runRound`의 검증 단계(layout.js:452)에서야 집계되지만, 그때도 **재라우팅은 같은 면으로 다시 A*만 호출**(원인 2)하므로 폴백이 다시 발생하면 동일 관통이 반복된다.

### 결론
**폴백은 관통을 유발/잔존시키는 직접 원인이다.** 폴백 직후 관통 재검증 + 포트 면 교체 재시도가 없어, 한 번 폴백에 빠진 관계선은 라운드를 반복해도 동일 경로로 고착된다.

---

## 3. 수렴 루프에서 포트 면을 바꾸는가? → 안 바꾼다 (핵심 결함)

### 코드 확인 (layout.js:439~466)
```
const toRoute = round === 1
  ? RELATIONS.slice()
  : RELATIONS.filter(rel => _v2CountCrossings(rel, [rel.from, rel.to]) > 0);  // 444

toRoute.forEach(rel => {
  _v2AStarRoute(rel, grid, usage, [rel.from, rel.to]);   // 447  ← 동일 fromFace/toFace 사용
  _v2SimplifyWpts(rel);
});
...
_v2UpdateUsage(usage, RELATIONS, grid);   // 463  ← usage cost만 갱신
```
- 재라우팅은 `rel.bend.fromFace/toFace`를 그대로 둔 채 `_v2AStarRoute`만 다시 호출한다.
- 라운드 간 유일한 변화는 **usage 비용**(같은 간선 재사용에 +40)뿐이다. usage는 *겹침* 완화용이지 관통 해소용이 아니다.
- A*는 결정적이고 격자/면이 동일하므로, 관통이 발생한 경우 → **A*가 또 실패 → 또 폴백 → 동일 관통**. 또는 A*가 성공해도 동일 비용 지형에서 동일 경로를 반환.

### 결론
**포트 면 순환(4×4 조합) 재시도 로직이 전혀 없다.** 이것이 "관통 0까지 경로를 바꿔가며 반복"이라는 기대 동작을 구조적으로 불가능하게 만드는 가장 본질적인 결함이다.

---

## 4. _v2FinishUp에서 _fixEntityCrossingsForRel가 효과 없는 케이스

### 코드 확인 (layout.js:476~488, canvas.js:471~542)
- `_fixEntityCrossingsForRel`는 최대 6회 시도(canvas.js:476).
- 수직 세그먼트 우회(canvas.js:519~539): `canL = left >= lo`, `canR = right <= hi`. **출발/도착 X 범위(lo~hi) 안에 우회 X가 없으면 `canL`,`canR` 모두 false** → `_routeAroundBlockingObs`로 상/하 우회 시도.
- `_routeAroundBlockingObs`(canvas.js:545~)는 **fromFace/toFace를 top/bottom으로 강제 변경**하지만, 변경 후 그 경로가 *다른* 엔티티를 새로 관통하는지는 검사하지 않는다.
- 빽빽한 배치: above/below 모두 다른 엔티티가 있으면 어디로 우회하든 관통. 6회 시도 동안 같은 obs만 반복 처리하고 빠져나오지 못함 → **관통 잔존 확정**.
- 또한 `_v2FinishUp`의 nudge 루프는 `_fixEntityCrossingsForRel` 후 다시 `_v2AStarRoute`(격자 기반)를 호출하지 않으므로, 격자 최적해로 복귀할 기회가 없다.

### 결론
밀집 배치에서 우회 공간 부재 시 잔존. 이는 **마지막 안전망이지 1차 해결책이 아니어야** 한다. 근본 해결은 1차 라우팅 단계(원인 2·3)에서 포트 면 순환으로 해소하는 것.

---

## 5. Hanan 격자 blocked 노드 판정 + exIds 전달

### 코드 확인 (layout.js:574~624)
- `_v2BuildGrid`는 좌표 집합에 `e.x-GAP, e.x, e.x+W, e.x+W+GAP` / `e.y-GAP ... e.y+eh+GAP`를 넣는다(581~582). GAP 포함 정상.
- blocked 판정(615): `px > e.x && px < e.x+W && py > e.y && py < e.y+eh` — **strict 부등호**. 경계선(e.x, e.x+W) 위 노드는 blocked 아님 → 엔티티 표면을 따라 도는 노드는 허용. 의도대로 정상.
- **문제 1 — thinArr 누락(599~606):** 노드 수 상한(`_V2_GRID_LIMIT=4000`, maxDim≈63) 초과 시 `thinArr`로 좌표선을 솎아낸다. 이때 **엔티티 경계 좌표선(e.x, e.x+W 등)이 보존된다는 보장이 없다.** 경계선이 솎이면:
  - blocked 판정이 엉성해져 엔티티 내부를 통과하는 노드 쌍이 생기고,
  - 한 격자 간선이 엔티티를 통째로 가로질러도 `obstacleOnSeg`는 잡지만(709) → A* 실패 → 폴백 → 관통.
  - 즉 큰 다이어그램에서 관통이 더 빈번해진다.
- **문제 2 — exIds 전달:** 격자는 전 관계 공유(layout.js:429), blocked도 **모든 엔티티 기준 공유**(라우팅별 exIds 미반영). 따라서 **출발/도착 엔티티의 경계/포트 노드가 blocked로 막힐 수 있다.** 포트 anchor 좌표는 xs/ys에 추가되지만(586~593), 그 좌표가 다른 엔티티 내부면 blocked 처리됨. 출발/도착 자기 엔티티 표면 노드는 strict 부등호 덕에 대체로 안전하나, **포트가 인접 엔티티에 가까우면 startKey/goalKey가 blocked 노드로 snap될 수 있다.** 이 경우 A*는 시작부터 막혀 즉시 실패 → 폴백 → 관통.
  - 간선 검사(709)는 exIds를 옳게 쓰지만, **노드 blocked(706)는 exIds를 못 쓴다.** start/goal 노드가 자기 엔티티가 아닌 인접 엔티티 때문에 막히는 엣지 케이스 존재.

### 결론
- 경계 strict 판정 자체는 정상.
- **thinArr가 엔티티 경계 좌표를 보존하지 않는 점**과 **start/goal 노드가 공유 blocked에 걸릴 수 있는 점**이 A* 실패율을 높여 폴백·관통을 유발한다.

---

# 수정 계획 (파일:라인 기준)

## 수정 A — 포트 면 순환(4×4) 재라우팅 (핵심)
**위치:** `js/layout.js` `_runOptimizeV2`의 `runRound` (439~466), `_v2AStarRoute`(627~753) 호출부.

1. `_v2AStarRoute`를 **성공/실패 + 관통수**를 반환하도록 변경:
   - 반환값 `{ ok, crossings }`. A* 성공이어도 최종 wpts에 대해 `_v2CountCrossings(rel,[rel.from,rel.to])`로 관통 재집계.
2. 새 함수 `_v2RouteWithFaceCycle(rel, grid, usage)` 추가:
   - 후보 면 조합 생성: 1순위 = 현재 `_v2AssignPorts`가 정한 면, 그 다음 fromFace∈{right,left,bottom,top} × toFace∈{...} 전체(자기참조 제외).
   - **상대 엔티티 방향과 모순되는 명백히 나쁜 조합은 후순위**(예: dx>0인데 fromFace=left)로 정렬해 탐색량 축소.
   - 각 조합마다 `rel.bend.fromFace/toFace` 설정 → `rel.bend.wpts=null` → `_v2AStarRoute` → 관통 0이면 즉시 채택하고 break.
   - 모든 조합이 관통>0이면 **관통 최소 조합**을 채택(잔존 최소화).
3. `runRound`의 `toRoute.forEach`(446~449)에서 `_v2AStarRoute` 직접 호출을 `_v2RouteWithFaceCycle`로 교체.

## 수정 B — 폴백 경로 관통 재검증 + 면 교체 (원인 2)
**위치:** `js/layout.js:727~731`(`_v2AStarRoute`의 `!found` 분기), `_v2SpineRoute`(806~842).

1. `_v2SpineRoute` 끝에서 `_v2CountCrossings`로 관통 검사. 0이 아니면 반환값에 관통수 포함(수정 A의 면 순환이 받아 다음 조합 시도).
2. `_v2ClearSpineX/Y`(845~875): 12회 내 깨끗한 좌표를 못 찾으면 **마지막 후보가 아니라 "관통 최소" 후보를 추적해 반환**하도록 변경(현재는 무조건 마지막 x/y 반환).
3. 폴백 자체가 면 순환 루프(수정 A) 안에서 호출되므로, 폴백 관통도 다음 면 조합으로 자연히 탈출.

## 수정 C — 격자 thinArr가 엔티티 경계 좌표 보존 (원인 5-문제1)
**위치:** `js/layout.js:598~606`(`thinArr`).

1. 엔티티 경계 핵심 좌표(`e.x, e.x+W, e.y, e.y+eh` 및 GAP 변형, 포트 anchor)를 **"must-keep" 집합**으로 따로 모은다.
2. `thinArr`를 must-keep을 항상 포함하도록 수정: 솎기는 must-keep이 아닌 보조 좌표에서만 수행. must-keep만으로 maxDim 초과 시 GAP 좌표부터 양보.
3. 이로써 blocked 판정·간선 관통 검출이 큰 다이어그램에서도 정확 → A* 실패율 감소.

## 수정 D — start/goal 노드 blocked 예외 + 출발 면 방향 강제 (원인 1 보강, 원인 5-문제2)
**위치:** `js/layout.js:653~706`.

1. `blocked` 검사를 라우팅별로 보정: start/goal 노드 키는 **무조건 통행 허용**(`if (blocked.has(nKey) && nKey!==startKey && nKey!==goalKey) continue;`). 706라인 수정.
2. 출발/도착 면 방향 강제: 첫 확장에서 출발 노드는 `startDir`과 일치하는 이웃만, 도착 노드 진입은 `toFace` 반대 방향만 허용하도록 가드 추가 → 포트에서 자기 몸체로 파고드는 첫 세그먼트 제거.
3. 자기 엔티티 표면 인접 노드가 인접 엔티티 blocked에 걸려도 start/goal 예외로 진입 가능.

## 수정 E — 통합 수렴 루프를 "관통 0까지" 반복하도록 강화 (원인 2·4)
**위치:** `js/layout.js:439~466`(`runRound`), `_v2FinishUp`(472~509).

1. `runRound` 종료 조건(459)은 유지하되, 매 라운드 재라우팅을 **수정 A의 면 순환 버전**으로 수행하므로 라운드마다 실제로 경로 위상이 바뀐다.
2. `_V2_MAX_ROUND`(409, 현재 8)는 유지하되, **라운드 간 관통이 줄지 않으면(stall) 면 순환 후보 우선순위를 셔플**하거나 `_fixEntityCrossingsForRel`를 조기 투입.
3. `_v2FinishUp`(480~488)의 잔존 관통 보정 후, 보정된 관계선을 **다시 `_v2RouteWithFaceCycle`로 1회 재라우팅**해 격자 최적해 복귀 기회 부여.
4. 최종 토스트(499~502)에서 잔존 관통수를 정확히 보고(현재 로직 유지).

## 수정 우선순위
1. **수정 A + B** (포트 면 순환 + 폴백 재검증) — 관통의 80% 이상 해소 예상. 단독으로도 기대 동작에 가장 근접.
2. **수정 D** (start/goal blocked 예외 + 면 방향 강제) — A* 실패율·자기 관통 감소.
3. **수정 C** (thinArr 보존) — 대형 다이어그램 정확도.
4. **수정 E** (수렴 루프/마무리 강화) — 잔존 최소화·안정성.

## 검증 방법
- 빽빽한 배치 샘플(엔티티 8~15개, 좌우/상하 인접)에서 `autoOptimizeRelationsV2()` 실행 후 `RELATIONS.reduce((s,r)=>s+_v2CountCrossings(r,[r.from,r.to]),0) === 0` 확인.
- 면 순환이 모든 조합 소진 시에도 무한 루프 없이 "관통 최소" 채택 후 종료하는지 확인(`_V2_MAX_ROUND` 상한 준수).
