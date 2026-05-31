# 분석 계획 — docs/report/03-편집-엔티티.md 미적용 개선점 구현

## 요청 요약
`docs/report/03-편집-엔티티.md` 보고서의 개선점 중 아직 적용되지 않은 항목을 구현한다. 대상은 `js/entities.js` 위주이며, `js/state.js`의 `collapsedEntities`를 함께 참조한다.

## 탐색한 파일
- `js/entities.js` — 전체. Section 2 버그 적용 여부, `saveEntity` FK 블록, `syncFKReferences`, `deleteEntity`, `buildTypeOptions`, `onDbTypeChange`, `populateRefEntitySelect`/`populateRefAttrSelect`, 엔티티 ID 검증 확인
- `js/state.js` — `collapsedEntities` 선언(line 34) 및 직렬화(`flushCurrentState` line 66, `loadDiagramIntoWorkspace` line 76)
- Grep `collapsedEntities|expandedEntities` — 두 Set의 사용 위치 전수 확인 (canvas.js, diagrams.js, export.js, ui.js)
- Grep `autoFK|card:` — RELATIONS 객체 구조 확인. **현재 RELATIONS에 `autoFK` 같은 플래그 필드는 존재하지 않음**. 관계 객체는 `{ from, to, card, label? }` 형태

## 현재 적용 여부 (실측)

### Section 2 버그 3건 — 모두 이미 적용됨 (구현 대상 제외)
1. `doExtractEntity` 후 `renderEntityTree()` — line 409에 호출 있음 ✅ 적용됨
2. `populateRefEntitySelect` 엔티티명 이스케이프 — line 201에서 `escHtml(...)` 사용 ✅ 적용됨
3. `populateRefAttrSelect` 속성명 이스케이프 — line 218에서 `escHtml(...)` 사용 ✅ 적용됨

→ Section 2는 **구현 불필요**. integration-checker가 회귀하지 않았는지만 확인.

### Section 3 — 미적용 (구현 대상)
- **medium 1) FK 삭제/대상 변경 시 RELATIONS 미정리**: line 317-323 블록은 추가만 함. 제거/갱신 로직 없음 → **미적용, 구현 대상**
- **medium 2) syncFKReferences 위치기반 + dead code**: line 226-258. `oldAttrs[i]↔newAttrs[i]` 인덱스 매핑 그대로, `let changed`(238)·`return changed`(256)가 dead code(forEach 콜백 반환은 무시됨) → **미적용, 구현 대상**
- **low 3) deleteEntity collapsedEntities 미정리**: line 331에 `expandedEntities.delete`만 있고 `collapsedEntities.delete` 없음 → **미적용, 구현 대상**
- **low 4) buildTypeOptions fallback 비이스케이프**: line 22에서 `selectedValue`를 escape 없이 삽입 → **미적용, 구현 대상**
- **low 5) onDbTypeChange saveState 미호출**: line 27-35에 `saveState()` 없음 → **미적용, 구현 대상**
- **low 6) 엔티티 ID 입력 검증 부족**: line 307-310은 중복 검사만. 공백·특수문자 검증 없음 → **미적용, 구현 대상**

### Section 4 — 제외

## 영향 분석
- **단축키 변경**: 없음
- **새 localStorage 키**: 없음
- **새 데이터 배열/상태 변수**: 없음. (medium 1에서 RELATIONS에 식별 필드를 추가할지가 쟁점 — 아래 "확인 필요" 참조)
- **기타 파급 효과**:
  - medium 1 RELATIONS 정리: `RELATIONS` 직렬화는 `flushCurrentState`(state.js)가 통째로 복사하므로 구조 보존만 하면 영향 없음. export.js/import.js의 관계 처리(import.js:543 `{ from, to, card, label }`)는 알려진 필드만 사용 → **새 필드 추가 시 import/export 영향 확인 필요**
  - syncFKReferences 변경: FK 컬럼의 `ref.attr`, `physicalName`, `type` 동기화 동작 변경. canvas 렌더링/SQL export(export.js)가 `ref`를 읽으므로 매핑 정확도 개선은 양(+)의 효과
  - **확인 필요**: medium 1 구현 시 "FK 기반 자동 관계선"과 "수동 관계선"을 구분할 식별자가 없음. 단순 from===entity.id 기준으로 제거하면 사용자가 수동으로 그린 관계선까지 삭제될 위험 → integration-checker 주의

## 구현 계획

### 파일: js/entities.js

#### 1) deleteEntity — collapsedEntities 정리 (low 3, 가장 단순)
- 위치: line 331 (`expandedEntities.delete(entity.id);` 다음 줄)
- 변경: `collapsedEntities.delete(entity.id);` 추가
- 이유: 삭제된 엔티티 id가 `collapsedEntities`에 잔존하면 state.js line 66에서 stale id가 직렬화됨

#### 2) buildTypeOptions — fallback 이스케이프 (low 4)
- 위치: line 21-23
- 변경: fallback `<option>` 생성 시 `selectedValue`를 escape. 파일에 전역 `escHtml`이 이미 사용되고 있으므로(line 201 등) 동일 헬퍼 사용
  ```
  if (!found && selectedValue) {
    const sv = escHtml(selectedValue);
    html = `<option value="${sv}" selected>${sv}</option>` + html;
  }
  ```
- 이유: 목록에 없는 사용자 입력 타입명이 innerHTML로 비이스케이프 삽입되어 XSS/렌더깨짐 위험
- 확인 필요: line 16의 정상 옵션(`<option value="${t}">${t}</option>`)도 비이스케이프이나 `t`는 DB_TYPES 상수에서 옴(신뢰 입력). fallback만 사용자 입력이므로 fallback만 수정하면 충분. (정상 옵션 일괄 이스케이프는 보고서 범위 밖)

#### 3) onDbTypeChange — saveState 호출 (low 5)
- 위치: line 27-35
- 변경: 함수 끝(또는 `d.dbType = dbType;` 직후)에 `saveState()` 추가
- 이유: DB 유형 변경이 활성 다이어그램(`d.dbType`)에만 반영되고 직렬화되지 않아 새로고침 시 유실 가능
- 확인 필요: `onDbTypeChange`가 모달 select onchange로 호출됨(index.html `#entDbType`). 모달 편집 중 매 변경마다 saveState가 호출되어도 무방한지(undo 스냅샷 누적 등) — saveState 구현(state.js line 87~)이 단순 localStorage 저장이면 안전. integration-checker 확인 권장

#### 4) 엔티티 ID 검증 강화 (low 6)
- 위치: line 307-310 (신규 분기 `idRaw` 사용 시)
- 변경: `idRaw`가 비어있지 않을 때 패턴 검증 추가. 기존 자동생성 id 패턴(`entity_xxx`)과 호환되는 식별자 규칙 권장:
  ```
  if (idRaw && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(idRaw)) {
    showErr('entIdErr', 'ID는 영문/숫자/밑줄만 사용하며 숫자로 시작할 수 없습니다.'); return;
  }
  ```
  중복 검사(line 308) 전에 배치
- 이유: 공백·특수문자 id는 export(SQL 식별자), share/URL, DOM id 등에서 문제 유발 가능
- 확인 필요: `entIdErr` 요소가 index.html에 존재하는지 확인(line 309에서 이미 사용 중이므로 존재). 기존 다이어그램의 한글/특수문자 id 데이터가 있으면 편집 시 id 필드가 disabled(line 75)라 검증 미적용 → 신규 추가에만 영향, 안전

#### 5) syncFKReferences — dead code 제거 + 매핑 개선 (medium 2)
- 위치: line 226-258
- 변경:
  - `let changed`(238), `changed = true`(247,253), `return changed`(256) 제거 — forEach 콜백 반환값은 무시되므로 완전한 dead code
  - 위치기반 renameMap 개선: oldAttrs와 newAttrs를 매칭할 안정 키 필요. **권장 방식**: 속성에 고유 id가 없으므로, (a) 1차로 물리명 불변 매칭(old.physicalName === new.physicalName인 것은 rename 아님), (b) 나머지 중 인덱스가 보존된 경우만 rename으로 간주하는 보수적 매핑. 단순·안전하게 하려면 "old/new 길이가 같고 동일 인덱스에서 physicalName만 바뀐 경우"만 rename 매핑에 넣고, 삽입/삭제로 길이가 다르면 rename 매핑을 만들지 않음(타입 동기화만 수행)
- 이유: 드래그 재정렬·삽입/삭제 시 인덱스 대응이 깨져 엉뚱한 FK ref가 갱신됨
- 확인 필요: 속성에 안정적 식별자(id)가 없어 rename과 reorder를 100% 구분 불가. 완벽 해결은 Section 4 범위. 이번엔 (1) dead code 제거 (2) 길이 불일치 시 rename 매핑 비활성화로 오작동 축소 — 이 보수적 범위가 적절한지 implementer/integration-checker 합의 필요

#### 6) saveEntity FK 자동관계 RELATIONS 재동기화 (medium 1)
- 위치: line 317-323
- 핵심 쟁점: 현재 RELATIONS에 자동/수동 구분 플래그가 **없음**. 단순 제거-후-추가는 수동 관계선 손실 위험
- **권장 구현 방향 A (필드 추가 없이, 가장 안전)**:
  현재 FK attrs가 참조하는 (from=ref.entity, to=targetEntityId) 쌍 집합을 계산하고, "이 엔티티가 to(자식)인 관계 중, 더 이상 어떤 FK도 가리키지 않는 from"에 대해서만 정리. 단, 그 관계가 자동 생성인지 수동인지 모르므로 **무조건 삭제는 위험** → 보수적으로는 "추가만 유지" + 별도 정리 보류.
- **권장 구현 방향 B (식별 필드 추가)**:
  자동 생성 관계에 `autoFK: true` 마킹 추가. line 322 push에 `{ from, to, card: '1:N', autoFK: true }`. 저장 시 `RELATIONS`에서 `to === targetEntityId && autoFK`인 항목 제거 후, 현재 FK attrs 기준으로 재생성. 수동 관계선(autoFK 미설정)은 보존.
  - 영향: `autoFK`는 신규 필드 → import.js:543/export.js의 관계 직렬화가 알려진 필드만 복사하면 round-trip 시 유실될 수 있음. flushCurrentState(state.js:62)는 `JSON.parse(JSON.stringify(r))`로 통째 복사하므로 LocalStorage round-trip은 보존됨. **import/export(.json) round-trip만 확인 필요**
- **분석가 권장**: 방향 B를 채택하되, 기존 데이터(autoFK 없는 기존 자동관계)는 마킹이 없어 정리 대상에서 빠짐 → 신규/재저장분부터 점진 적용. 무손실. 단 implementer는 방향 A vs B를 integration-checker와 합의 후 진행할 것.
- 이유: FK 제거·대상 변경 후 stale 관계선이 남는 문제 해결

## 구현 우선순위 (단순→복잡)
1. deleteEntity collapsedEntities 정리 (low 3) — 1줄
2. buildTypeOptions 이스케이프 (low 4)
3. onDbTypeChange saveState (low 5)
4. 엔티티 ID 검증 (low 6)
5. syncFKReferences dead code 제거 + 보수적 매핑 (medium 2)
6. saveEntity FK 관계 재동기화 (medium 1) — 가장 신중히, 방향 합의 필요

## integration-checker 주의(확인 필요) 요약
- medium 1: `autoFK` 신규 필드 채택 시 JSON import/export round-trip 보존 여부
- medium 1: 자동/수동 관계 구분 식별자 부재 — 수동 관계선 손실 방지 설계가 핵심
- medium 2: 속성 안정 식별자 부재로 rename vs reorder 완전 구분 불가 — 보수적 범위 한정
- low 5: 모달 select 변경마다 saveState 호출의 부수효과(스냅샷/성능) 확인
- Section 2 3건: 이미 적용됨 — 회귀 없는지만 확인
