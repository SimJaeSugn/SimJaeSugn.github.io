## 리뷰 요약
- 전체 평가: PASS (주의사항 있음)

---

## 발견 사항

### 심각 (즉시 수정 필요)
없음.

---

### 경미 (개선 권장)

**1. buildTypeOptions — escHtml 미완전 적용 (line 16)**
- `escHtml`은 `<`, `>`, `&`만 이스케이프하며 `"`(큰따옴표)를 이스케이프하지 않는다.
  (`ui.js:3`: `replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')` — `&quot;` 없음)
- line 23의 fallback: `<option value="${sv}" selected>` 에서 `sv`가 `"`를 포함하면 attribute 경계가 깨진다.
  예시: `selectedValue = 'X"Y'` → `value="X"Y"` → value 속성 파싱 오류
- DB_TYPES 목록에 없는 타입명은 사용자가 직접 입력하거나 외부 파일에서 임포트한 값이므로 `"`가 들어올 수 있다.
- 수정 방안: `escHtml`에 `.replace(/"/g,'&quot;')` 추가(전역 함수이므로 사이드이펙트 없음), 또는 fallback 구성만 별도 이스케이프 헬퍼 사용.
- **단, 이 문제는 기존 코드(`addAttrRow` line 111의 로컬 `esc`)가 `&quot;`를 포함한 것과 대비되어 경미 수준. 실제 공격보다는 렌더링 깨짐 위험.**

**2. syncFKReferences — 길이 같을 때 불변 컬럼도 renameMap에 등록 (line 232–239)**
- oldKey === newKey(이름이 같은 컬럼)인 경우도 `renameMap[oldKey] = newKey`로 등록된다.
- 동작상 문제는 없다(`newRef === oldRef`이면 갱신 미발생, line 248). 단, 불필요한 map 항목이 생성되어 가독성 저하.
- 개선: `if (oldKey && oldKey !== newKey) renameMap[oldKey] = newKey;` — 실제 이름이 바뀐 경우만 등록.
- 현 동작에는 영향 없음.

**3. saveEntity autoFK — editingEntity 경로에서 syncFKReferences 이후 autoFK 제거 순서 (line 306, 322)**
- `syncFKReferences`는 다른 엔티티의 FK ref.attr을 갱신하는 함수다(타 엔티티 → 현재 엔티티 참조 동기화). autoFK 재동기화(line 322~331)는 현재 엔티티의 FK attrs가 가리키는 관계선을 다룬다. 두 로직의 대상이 다르므로 순서 의존성 없음. 올바르다.

**4. onDbTypeChange — 모달 열린 상태에서 saveState 호출 (line 36)**
- 모달이 열린 채로 saveState가 호출되면 `flushCurrentState` → `d.entities = ENTITIES.map(...)` 가 실행된다.
- 이 시점에 `editingEntity.attrs`는 아직 모달 DOM의 내용으로 갱신되지 않은 상태이므로, DB 유형 변경만 저장되고 편집 중인 속성은 저장 전 스냅샷 기준으로 undo 스택에 쌓인다.
- 실제 피해는 없다(속성은 "저장" 버튼 클릭 시 최종 반영). 단, undo 스택에 중간 스냅샷이 쌓여 Ctrl+Z 이력이 늘어날 수 있다.
- 계획 분석가 주의사항으로 이미 인식된 항목. 허용 가능한 수준.

---

## 항목별 검증 결과

### 1. deleteEntity — collapsedEntities.delete (line 340)
- 구현 위치: `expandedEntities.delete(entity.id)` 직후.
- 올바름. `collapsedEntities`는 `state.js:34`에서 `new Set()`으로 선언되고 `flushCurrentState`(state.js:66)에서 `d.collapsed = [...collapsedEntities]`로 직렬화된다. 삭제 후 stale id 잔존 방지 완료.

### 2. buildTypeOptions — fallback escHtml (line 22–23)
- `const sv = escHtml(selectedValue)`로 이스케이프 후 value와 텍스트 양쪽에 모두 `sv` 적용.
- `<option value="${sv}" selected>${sv}</option>` — value와 content 모두 동일 변수 사용. 올바름.
- 단, `escHtml`이 `"`를 이스케이프하지 않아 attribute 경계 파싱 위험 잔존(경미 항목 1 참조).

### 3. onDbTypeChange — saveState 호출 (line 36)
- 함수 마지막 줄에 `saveState()` 추가 확인. 올바름.
- `getActiveDiagram()` null 가드(`if (d)`)가 이미 있어 안전.

### 4. 신규 엔티티 ID 검증 (line 308–310)
- `else` 분기(신규 추가 경로)에만 패턴 검증 배치 확인.
- `editingEntity` 경로(편집)는 `entId`가 disabled(openEditEntityModal line 77)로 읽기 전용이므로 `idRaw`가 기존 id를 반환해도 검증 코드에 도달하지 않음. 올바름.
- 패턴 검증 → 중복 검사 순서 확인(line 308 → line 312). 올바름.
- `entIdErr` 요소 존재 확인: `index.html:318`에서 `id="entIdErr"` 확인. 올바름.

### 5. syncFKReferences — dead code 제거 + 길이 불일치 시 renameMap 비활성화 (line 228–259)
- `let changed`, `changed = true`, `return changed` 완전 제거 확인.
- `if (oldAttrs.length === newAttrs.length)` 가드로 삽입/삭제 시 renameMap 구성 건너뜀. 길이 불일치 시 `renameMap = {}` 그대로 유지 → `renameMap[oldRef] ?? oldRef`에서 항상 `oldRef` fallback. 올바름.
- 타입 동기화(`refAttr.type`)는 길이와 무관하게 항상 수행됨. 의도된 동작.

### 6. saveEntity FK 재동기화 — entity.id vs targetEntityId 혼동 검사 (line 321–331)
- `targetEntityId`는 편집 경로에서 `editingEntity.id`(line 305), 신규 경로에서 `newId`(line 318)로 설정.
- 제거 조건: `RELATIONS[i].to === targetEntityId && RELATIONS[i].autoFK` — 현재 엔티티가 자식(FK 보유 측)인 autoFK 관계만 제거. `entity.id` 변수가 재사용되지 않아 혼동 없음.
- 재생성: `from = attr.ref.entity`(참조 대상 엔티티), `to = targetEntityId`(현재 엔티티). FK 관계 방향이 `참조대상 → 현재엔티티`(1:N에서 1쪽이 from). 올바름.
- 중복 방지: `from === from && to === to` OR `from === to && to === from` 양방향 체크. 이미 수동으로 역방향 관계가 있을 때도 autoFK 추가를 막음. 올바름.
- `autoFK`가 없는 기존 자동 관계는 제거 조건(`RELATIONS[i].autoFK`)에 해당하지 않아 보존됨. 의도된 점진 적용.

---

## import/export round-trip 영향 확인

- **LocalStorage**: `flushCurrentState`가 `JSON.parse(JSON.stringify(r))`로 RELATIONS를 통째 복사하므로 `autoFK: true`가 보존됨. 안전.
- **JSON export**: `doExportSelectedDiag`(export.js:108)가 `diagrams` 배열을 `JSON.stringify`로 직렬화하므로 `autoFK`가 보존됨. export 후 import 시에도 보존.
- **AI JSON import** (import.js:542–544): `(parsed.relations || []).map(r => ({ from: r.from, to: r.to, card: r.card || '1:N', label: r.name || undefined }))` — `autoFK`가 명시적으로 제외됨. AI가 생성한 JSON을 import할 때 autoFK가 사라지므로, 해당 관계는 이후 saveEntity 시 수동 관계로 취급되어 제거 대상에서 빠진다.
  - 이는 기존 자동 관계에도 동일하게 적용되던 동작이며, import 후 재편집 시 autoFK 재동기화가 일어나므로 실질 손실은 없음. 허용 가능.
- **백업 export/import**: `_doExportWithGroups`가 `diagrams` 배열 전체를 JSON.stringify하므로 autoFK 보존.

---

## 최종 권고

6개 항목 모두 기능적으로 올바르게 구현됨. 즉시 수정이 필요한 심각 결함 없음.

경미 항목 1(escHtml의 `"`미처리)은 DB_TYPES에 없는 타입명을 attribute value에 직접 삽입하는 구조적 위험이므로, 다음 작업 시 `ui.js`의 `escHtml` 함수에 `replace(/"/g,'&quot;')` 추가를 권장함.

경미 항목 2(renameMap 불필요한 항목)는 동작 무관, 선택적 개선.
