## 변경 파일 목록
- js/entities.js: 6개 항목 수정 (deleteEntity 정리, buildTypeOptions 이스케이프, onDbTypeChange saveState, ID 검증, syncFKReferences 개선, saveEntity autoFK 재동기화)

## 주요 결정 사항
- 계획과 동일하게 구현함. 추가 판단 없음.
- `syncFKReferences` dead code 제거: `let changed`, `changed = true` 두 곳, `return changed` 제거. forEach 콜백 반환값은 무시되므로 동작 변화 없음.
- `saveEntity` autoFK 재동기화: 신규 엔티티 추가 시에도 `targetEntityId`가 설정된 이후에 autoFK 정리 블록이 실행되므로 신규/편집 모두 정상 동작.
- 기존 데이터(autoFK 필드 없는 구 자동관계)는 정리 조건(`RELATIONS[i].autoFK`)에 해당하지 않아 보존됨.

## 미완료 항목
- 없음. 계획의 6개 항목 전부 완료.
