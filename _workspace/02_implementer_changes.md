# 구현 변경 내역 — autoOptimizeRelationsV2() 우선순위 재설계

## 변경 파일
- `js/layout.js`

---

## 수정 1 (필수): `_v2NudgeWithCrossingCheck` 신설

- **위치**: `_applySegNudge` 함수(라인 390~402) 직후, V2 섹션 주석 직전 (삽입 후 라인 405)
- **내용**: nudge 적용 전 각 관계의 wpts 백업 및 crossing 수 기록 → `_nudgeOverlapPass` 호출 → nudge 후 crossing이 증가한 관계만 wpts 롤백
- **목적**: nudge가 겹침을 줄이는 대신 관통을 새로 만드는 부작용 방지

## 수정 2 (필수): V2 내부 nudge 호출 2곳 래퍼로 교체

- **위치 1**: `_runOptimizeV2` > `runRound` 내부 (기존 `overlaps = _nudgeOverlapPass(14, 2)`)
  - 변경: `overlaps = _v2NudgeWithCrossingCheck(14, 2);`
- **위치 2**: `_v2FinishUp` > `nudgeIterate` 내부 (기존 `const ov = _nudgeOverlapPass(14, 2)`)
  - 변경: `const ov = _v2NudgeWithCrossingCheck(14, 2);`
- **V1 호출(라인 305) 변경 없음**: `const overlaps = _nudgeOverlapPass(NUDGE, TOL);` 유지

## 수정 3 (선택): `_v2RouteWithFaceCycle`에 pct 단계적 확장

- **위치**: `_v2RouteWithFaceCycle` 함수 내 16조합 루프 종료 후, 최적 결과 복원 직전
- **내용**: `bestCross > 0`인 경우 `fromPct ∈ {0.25, 0.75}`, `toPct ∈ {0.25, 0.75}` 4가지 조합을 bestFrom/bestTo 면 조합에 대해 추가 시도. cross < bestCross이면 갱신, cross === 0이면 즉시 종료.
- **목적**: 기본 16조합 순환으로 관통을 제거하지 못한 경우 포트 위치 변경으로 추가 개선

## 수정 4 (선택, 수정 3 전제): `_v2BuildGrid`에 pct 0.25/0.75 anchor 격자선 추가

- **위치**: `_v2BuildGrid` 내 기존 포트 anchor 수집 루프(RELATIONS.forEach) 직후
- **내용**: 모든 엔티티 × 모든 면(right/left/top/bottom) × pct(0.25/0.5/0.75) 조합의 anchor 좌표를 xs/ys Set에 추가
- **목적**: 수정 3에서 pct 0.25/0.75 포트를 시도할 때 해당 좌표가 격자에 포함되어 A*가 정확한 경로를 탐색할 수 있도록 보장

---

## 검증

- V1 호출 라인 305 `_nudgeOverlapPass(NUDGE, TOL)` 변경 없음 확인
- `_v2NudgeWithCrossingCheck` 내부에서 `_nudgeOverlapPass` 1회 호출 (래퍼 구조)
- `_v2CountCrossings` 함수 라인 903에 존재 확인
