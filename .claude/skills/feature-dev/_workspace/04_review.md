## 리뷰 요약
- 전체 평가: PASS (주의사항 있음)

## 발견 사항

### 심각 (즉시 수정 필요)
- 없음

### 경미 (개선 권장)
- js/ui.js:662 — `newScale` 하한 클램핑 없음. `Math.min(scaleX, scaleY, scale)` 결과가 0.3 미만이 될 수 있음. `zoom()` 및 휠 줌은 모두 `Math.max(0.3, ...)` 로 하한을 보장하는데, `centerOnEntities`는 그렇지 않다. 엔티티 수가 매우 많거나 극단적으로 퍼져 있는 다이어그램에서 scale이 0.3 아래로 내려갈 수 있음. 수정 방안: `newScale = Math.max(0.1, Math.min(scaleX, scaleY, scale))` (또는 0.3) 로 하한 추가.
- js/ui.js:644 — `centerOnEntities`는 `ENTITIES`만 bounding box에 포함하고 `SECTIONS`, `NOTES`는 제외함. `fitAll`과 달리 오직 엔티티 기준으로만 중앙 정렬한다. autoLayout 후에는 엔티티만 재배치되므로 의도적 설계로 보이나, 노트/섹션이 엔티티와 크게 떨어져 있을 경우 노트/섹션이 잘릴 수 있음. 현재 요청 범위(autoLayout 후 엔티티 centering)에는 적절함.

## 기능 정확성
- `centerOnEntities()` 함수의 vx 계산식 `vx = _qlo + cw/2 - cx * scale` 은 수학적으로 정확함. quickbar 오프셋을 올바르게 반영하여 엔티티 bounding box 중심이 유효 캔버스 중앙에 오도록 함.
- layout.js 두 곳 모두 `centerOnEntities()` + `saveState()` 순서로 교체됨. `fitAll` 잔존 호출 없음.
- `_qbLeftOff`의 typeof 가드는 함수 미정의 환경에서도 안전하게 0을 반환함.

## 엣지 케이스
- `ENTITIES.length === 0` 시 early return 처리됨 (line 645).
- `_qbLeftOff` 미정의 시 fallback 0 처리됨 (line 653).
- scale 유지 조건: 콘텐츠가 화면에 들어올 때는 현재 scale 유지, 넘칠 때만 축소. 의도된 동작.

## Canvas 렌더링
- `render()` 호출 후 반환. layout.js 쪽에서 render()가 이미 한 번 호출된 뒤 `centerOnEntities`가 호출되는 구조이므로 render가 중복 호출되나, 이는 `fitAll`과 동일한 패턴이며 성능상 무시 가능한 수준.

## LocalStorage
- `centerOnEntities`는 `saveState()` 미호출. 호출자(layout.js)에서 직후 `saveState()` 호출. 올바른 패턴.

## 이벤트 리스너
- 새 리스너 등록 없음. 누수 없음.

## 보안
- innerHTML 사용 없음. XSS 취약점 없음.

## 코드 패턴
- 기존 `fitAll` 함수 바로 다음에 위치. 주석 스타일, 변수명, 코드 구조 모두 기존 패턴을 따름.

## 불필요한 변경
- `fitAll` 자체는 수정되지 않음. 요청 범위 내 변경만 포함.

## 최종 권고
구현은 요청 기능을 정확하게 구현했으며 심각한 결함은 없다. scale 하한 클램핑 누락이 유일한 경미 이슈로, 매우 많은 엔티티를 가진 다이어그램에서 scale이 과도하게 축소될 수 있다. 필요 시 line 662를 `newScale = Math.max(0.1, Math.min(scaleX, scaleY, scale))` 로 수정 권장.
