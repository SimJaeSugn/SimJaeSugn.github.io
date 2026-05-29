## 리뷰 요약
- 전체 평가: PASS

## 발견 사항

### 심각 (즉시 수정 필요)
- 없음

### 경미 (개선 권장)
- canvas.js:1140 — drawRelations() 시작 시 `_viewportBounds()`를 호출하지만, renderNow()의 1790에서도 한 번 더 호출한다. 현재 구조상 문제는 없으나(동기 실행 내이므로 값이 동일), 나중에 리팩터링 시 renderNow() 레벨에서 한 번만 계산해 drawRelations()에 인자로 넘기는 방식으로 통합하면 더 명확해진다. 기능상 버그는 아님.
- canvas.js:598 — getRelationPath() 내부에서도 entityMap()을 매 rel마다 독립 호출한다(line 599). drawRelations()에서 미리 만든 `_relEM`이 컬링에는 재사용되지만 실제 경로 계산에는 재사용되지 않는다. 구현 주석(02_implementer_changes.md)에서 이미 이를 인지하고 있으나, 향후 개선 여지로 남는다.

## 검토 항목별 판정

1. **기능 정확성 (뷰포트 컬링 수학)**: PASS
   - `_viewportBounds()` 계산: x1=(0-vx)/scale, y1=(0-vy)/scale, x2=(cw-vx)/scale, y2=(ch-vy)/scale — 스크린 좌표 → 월드 좌표 역변환으로 수학적으로 올바름.
   - `cw` 계산이 `canvas.width` 계산과 완전히 동일(line 1733 vs 1752).

2. **엣지 케이스**: PASS
   - scale=0 불가: scale은 `Math.max(0.3, ...)` 로 항상 0.3 이상(line 1869, 2462). 나눗셈 안전.
   - 엔티티 0개: `ENTITIES.forEach` / `RELATIONS.forEach` 루프가 빈 배열에도 정상 동작.
   - 삭제된 엔티티 참조: `if (ea && eb)` 가드(line 1153)로 보호됨. 한쪽이라도 없으면 컬링을 건너뛰고 getRelationPath()가 null을 반환해 자연스럽게 처리.

3. **렌더링 정확성 (팝인/팝아웃)**: PASS
   - MARGIN=20 픽셀(월드 좌표) 여유 적용으로 화면 경계에서 갑작스러운 소멸 없음.
   - AND 조건(`aOut && bOut`): 양 끝 엔티티가 모두 밖에 있을 때만 스킵. 한쪽이라도 화면 안에 있으면 관계선이 그려짐 — 사선/장거리 관계선의 중간 구간 소멸 방지.
   - 활성/연결 관계선 완전 면제(line 1151): isActive, isConnected 조건 시 컬링 블록 진입 자체를 건너뜀.

4. **성능**: PASS (개선 여지 있음)
   - drawRelations() 내에서 `entityMap()`은 한 번만 호출(line 1141, `_relEM`으로 재사용).
   - `_viewportBounds()`는 drawRelations()에서 1회(line 1140), renderNow()에서 1회(line 1790) 총 2회 호출. 렌더 프레임당 2회이므로 성능 영향은 무시 가능.
   - getRelationPath() 내부의 entityMap() 중복 호출은 기존 코드 구조로 이번 변경 범위 밖.

5. **코드 패턴**: PASS
   - 기존 파일의 변수 명명 규칙(`_` 접두사 = 로컬 임시 변수), 주석 스타일, 로직 구조를 그대로 따름.

6. **불필요한 변경**: PASS
   - 컬링 구현과 `_viewportBounds()` 헬퍼 추가에만 국한. 기존 로직 변경 없음.

## 최종 권고
구현이 요청 범위를 정확히 충족하며 엣지 케이스 처리도 적절하다. 경미 항목들은 향후 리팩터링 기회가 생길 때 개선하면 충분하며 지금 당장 수정을 요구하지 않는다.
