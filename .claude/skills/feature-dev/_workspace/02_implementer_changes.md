## 변경 파일 목록
- js/ui.js: `fitAll` 함수 바로 다음에 `centerOnEntities()` 함수 추가 (배율 유지 + quickbar 오프셋 반영)
- js/layout.js: `_runAutoOptimizeRelations` 및 `_v2FinishUp` 내 `fitAll()` 호출 2곳을 `centerOnEntities()`로 교체

## 주요 결정 사항
- 계획과 동일하게 구현함. `fitAll()` 자체는 변경하지 않고 새 함수만 추가.

## 미완료 항목
- 없음
