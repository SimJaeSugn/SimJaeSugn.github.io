# 통합 검사 결과 — autoOptimizeRelationsV2() 우선순위 재설계

검사 일시: 2026-05-29
대상 파일: js/layout.js (전체 1084줄)

---

## 검증 1: `_v2NudgeWithCrossingCheck` 구현 정확성

| 검사 포인트 | 결과 | 근거 (라인) |
| --- | --- | --- |
| 함수 삽입 여부 | PASS | layout.js 405번째 줄에 정의 |
| bend null 시 `_v2CountCrossings` 0 반환 | PASS | `_v2CountCrossings`→`buildFullWpts`→`if (!bfw) return 0` 경로 (canvas.js 215). bend.wpts가 null이어도 buildFullWpts는 `rel.bend?.wpts \|\| []`로 빈 배열 처리(canvas.js 231) |
| 복원 깊은 복사 `b.map(p => [p[0], p[1]])` | PASS | layout.js 418: `b.map(p => [p[0], p[1]])` — 2D 점 배열 깊은 복사 올바름 |
| 반환값 `overlaps` 전달 | PASS | layout.js 421: `return overlaps;` — `_nudgeOverlapPass`의 반환값 그대로 반환 |

### 검증 1 결과: PASS

---

## 검증 2: V2 nudge 호출 2곳 교체 확인

| 호출 위치 | 예상값 | 실제값 | 결과 |
| --- | --- | --- | --- |
| `runRound` 내 (layout.js 473) | `_v2NudgeWithCrossingCheck(14, 2)` | `_v2NudgeWithCrossingCheck(14, 2)` | PASS |
| `nudgeIterate` 내 (layout.js 498) | `_v2NudgeWithCrossingCheck(14, 2)` | `_v2NudgeWithCrossingCheck(14, 2)` | PASS |
| V1 호출 (layout.js 305) | `_nudgeOverlapPass(NUDGE, TOL)` — 변경 없음 | `_nudgeOverlapPass(NUDGE, TOL)` | PASS |

### 검증 2 결과: PASS

---

## 검증 3: `_v2RouteWithFaceCycle` pct 확장 로직

| 검사 포인트 | 결과 | 근거 (라인) |
| --- | --- | --- |
| `bestCross > 0`일 때만 pct 확장 진입 | PASS | layout.js 732: `if (bestCross > 0) { ... }` |
| `cross === 0` 즉시 탈출 (16조합 루프) | PASS | layout.js 727: `if (cross === 0) break;` — 16조합 `for...of` 루프 탈출 |
| pct 확장 `break outer` 동작 | PASS | layout.js 744: `if (cross === 0) break outer;` — outer 레이블로 중첩 루프 완전 탈출 |
| pct 확장에서 `fromFace/toFace`를 bestFrom/bestTo로 설정 | PASS | layout.js 736: `rel.bend.fromFace = bestFrom; rel.bend.toFace = bestTo;` |
| 최종 복원 시 bestFrom/bestTo 적용 | PASS | layout.js 751: `rel.bend.fromFace = bestFrom; rel.bend.toFace = bestTo;` |

### 검증 3 결과: PASS

---

## 검증 4: `_v2BuildGrid` anchor 격자선 확장

| 검사 포인트 | 결과 | 근거 (라인) |
| --- | --- | --- |
| 0.25/0.5/0.75 pct × 4 face anchor 루프 존재 | PASS | layout.js 615-622: `for (const pct of [0.25, 0.5, 0.75])` + `['right','left','top','bottom'].forEach(face => ...)` |
| 포트 anchor 수집 루프와 중복/충돌 없음 | PASS | 포트 루프(606-613)는 현재 rel.bend 기반. pct 루프(615-622)는 모든 엔티티×면×pct. 동일 좌표가 Set에 중복 삽입되어도 Set 특성상 중복 제거됨. 충돌 없음 |
| `_V2_GRID_LIMIT=4000` 상한 적용 | PASS | layout.js 431: `const _V2_GRID_LIMIT = 4000;`. layout.js 653: `const maxDim = Math.ceil(Math.sqrt(_V2_GRID_LIMIT));` — thinArr로 X·Y 각 축 maxDim 이하로 제한 |

### 검증 4 결과: PASS

---

## 검증 5: 전체 V2 흐름 우선순위 1 보장

### 체인 확인

```text
autoOptimizeRelationsV2()
  └─ _runOptimizeV2()
       ├─ _v2BuildGrid()               ← 격자 구성
       └─ runRound() [반복]
            ├─ _v2RouteWithFaceCycle() ← 라우팅 (관통 hard-constraint: 16조합×pct 확장)
            ├─ _v2SimplifyWpts()
            └─ _v2NudgeWithCrossingCheck() ← nudge (관통 증가 시 롤백)

  수렴 실패 시 → _v2FinishUp()
       └─ nudgeIterate() [반복]
            ├─ _v2NudgeWithCrossingCheck()  ← nudge 롤백
            └─ _fixEntityCrossingsForRel()  ← 잔여 관통 보정
```

### 한 문장 요약

라우팅(`_v2RouteWithFaceCycle`)이 관통 hard-constraint를 최소화한 최적 경로를 확정하고, nudge(`_v2NudgeWithCrossingCheck`)는 겹침 분리를 시도하되 관통이 증가하면 롤백하며, finishUp(`_v2FinishUp`)은 nudge 롤백 + 잔여 관통 보정 보조 패스를 추가 수행함으로써, 전체 체인에서 관통 제거가 겹침 제거보다 항상 상위 우선순위로 보장된다.

### 검증 5 결과: PASS

---

## 최종 상태

| 검증 | 결과 |
| --- | --- |
| 검증 1: `_v2NudgeWithCrossingCheck` 구현 정확성 | PASS |
| 검증 2: V2 nudge 호출 2곳 교체 | PASS |
| 검증 3: `_v2RouteWithFaceCycle` pct 확장 로직 | PASS |
| 검증 4: `_v2BuildGrid` anchor 격자선 확장 | PASS |
| 검증 5: 전체 V2 흐름 우선순위 1 보장 | PASS |

## 최종 상태: PASS

수정 사항 없음 — 5개 검증 항목 모두 코드가 설계 의도와 일치함.
