## 요청 요약

다이어그램 간 엔티티 복사 개선 — 두 가지 작업:

1. **다중 선택 다이어그램 간 복사**: 현재 `openCopyDiagModal(entity)`는 엔티티 1개만 받아 다른 다이어그램으로 복사한다. `selectedEntities`(Set)에 담긴 여러 엔티티를 한 번에 다른 다이어그램으로 복사할 수 있도록 변경.
2. **다이어그램 전환 후 붙여넣기 유지**: Ctrl+C 후 다이어그램을 전환해도 `_clipboard`가 유지되어 Ctrl+V로 붙여넣기 가능해야 한다.

---

## 탐색한 파일

- `js/entities.js`: `_clipboard`(450행), `copyEntity`/`pasteEntity`(453~511행), 다이어그램 간 복사 로직 `openCopyDiagModal`/`closeCopyDiagModal`/`confirmCopyToDiag`(513~539행) 정의 위치.
- `js/ui.js`: 컨텍스트 메뉴 액션 디스패치 — `copyToDiag` → `openCopyDiagModal(ctxTargetEntity)` 호출 지점(1550행). 유일한 진입점 확인.
- `js/main.js`: 메인 키보드 단축키 — Ctrl+C(`copy`, 62행) → `copyEntity()`, Ctrl+V(`paste`, 63~84행) → `pasteEntity()`. `_clipboard` 초기화 코드 없음 확인.
- `js/diagrams.js`: `switchDiagram`(33~42행), `confirmNewDiag`(19~31행). 전환 시 `flushCurrentState` + `loadDiagramIntoWorkspace`만 호출, `_clipboard` 미접근 확인.
- `js/state.js`: `flushCurrentState`(58행), `loadDiagramIntoWorkspace`(70~80행). 전역 작업배열(ENTITIES/RELATIONS/SECTIONS/NOTES/NOTES_V2)만 교체, `_clipboard` 미접근 확인.
- `index.html`: 컨텍스트 메뉴 항목 `#ctx-copy-diag`(279행), `copyDiagOverlay` 모달/`#copyDiagList`(493~500행) 마크업 확인.

진입점 결론: **다이어그램 간 복사의 유일한 진입점은 우클릭 컨텍스트 메뉴 항목 `다이어그램으로 복사`(index.html 279행 → ui.js 1550행)**. 별도 툴바 버튼/커맨드 팔레트 항목 없음.

---

## 영향 분석

- **단축키 변경**: 없음.
  - 작업(1) 다이어그램 간 복사는 컨텍스트 메뉴 전용으로 단축키 없음.
  - 작업(2)는 기존 Ctrl+C/Ctrl+V 동작 보강이며 키 조합 추가 없음. 단, index.html `#shortcutsTableBody`에 "Ctrl+C/V로 다이어그램 간 복사·붙여넣기" 설명을 보강할지는 **확인 필요**(integration-checker: 단축키 표 동기화 규칙 검토). 신규 키가 없으므로 표 변경은 선택 사항.
- **새 localStorage 키**: 없음. `_clipboard`는 의도적으로 in-memory(세션 한정)이며 영속화 대상 아님. STORAGE_KEY 스냅샷 구조 변경 없음.
- **새 데이터 배열/상태 변수**: 없음. 기존 `_clipboard`, `_copyDiagEntity` 재사용. 작업(1)에서 `_copyDiagEntity`(단일) → `_copyDiagEntities`(배열)로 의미 확장 권장.
- **export/import 영향**: 없음. `_clipboard`는 백업/내보내기 대상이 아니며 `flushCurrentState`/`saveState`에 포함되지 않음.
- **기타 파급 효과**:
  - 작업(2) **핵심 발견**: `_clipboard`는 이미 다이어그램 전환 시 초기화되지 않는다(switchDiagram/confirmNewDiag/loadDiagramIntoWorkspace 어디서도 미접근). 따라서 "전환 후 Ctrl+V 붙여넣기"는 **현재 코드에서도 대부분 동작**한다. `pasteEntity`는 전역 `ENTITIES`(전환 후 활성 다이어그램의 배열)에 push하므로 대상도 올바르다.
    - 단, `pasteCount`(붙여넣기 누적 오프셋)는 다이어그램 전환과 무관하게 유지되어, 다른 다이어그램에서 첫 붙여넣기 시 오프셋이 과도하게 커질 수 있음 → **확인 필요/개선 포인트**.
    - 따라서 작업(2)는 "신규 구현"보다 **동작 검증 + 미세 보정**(전환 시 `pasteCount` 리셋) 성격. verify 단계에서 실제 전환 후 Ctrl+V 동작을 반드시 확인.
  - `confirmCopyToDiag`의 id 충돌 처리(`copy.id += '_copy'`)는 다중 복사 시 동일 id가 여러 개일 경우 충돌 가능 → 다중 처리 시 고유 id 재발급 방식으로 보강 필요(아래 구현 계획 참조).

---

## 구현 계획

### 파일: js/entities.js — 작업(1) 다이어그램 간 다중 복사

- **위치**: `openCopyDiagModal`(515행), `confirmCopyToDiag`(528행), 모듈 변수 `_copyDiagEntity`(514행).
- **변경 내용**:
  1. `let _copyDiagEntity = null;` → `let _copyDiagEntities = [];`로 교체(배열로 보관).
  2. `openCopyDiagModal(entity)` 시그니처를 인자 없이 또는 선택적 인자로 변경하여 **선택 집합 우선** 로직 적용. `copyEntity`(455~457행)의 우선순위 패턴을 그대로 따른다:
     ```
     const entIds = selectedEntities.size > 0
       ? [...selectedEntities]
       : (entity ? [entity.id] : (selectedEntity ? [selectedEntity.id] : []));
     _copyDiagEntities = entIds.map(id => ENTITIES.find(e => e.id === id)).filter(Boolean);
     if (!_copyDiagEntities.length) { showToast('복사할 엔티티가 없습니다.'); return; }
     ```
     (ctxTargetEntity가 다중 선택에 포함되지 않은 단일 우클릭 케이스도 보존하기 위해 entity 인자는 fallback으로 유지.)
  3. 모달 헤더/리스트의 엔티티 개수 표기를 다중 기준으로 갱신(예: `${_copyDiagEntities.length}개 엔티티를 복사`).
  4. `confirmCopyToDiag(diagId)`를 다중 처리로 변경:
     - `_copyDiagEntities`를 순회하며 deep copy, `attrs`의 `ref:null` 처리, `x/y += 30` 오프셋 적용.
     - **id 충돌 회피**: 기존 `_copy` 접미사 대신 `pasteEntity` 패턴(`'entity_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5)`)으로 신규 id 재발급 — 다중 복사 시 중복 방지. (관계선은 미복사이므로 ref 정합성 영향 없음.)
     - `target.entities.push(copy)`를 각 엔티티에 대해 수행.
     - 완료 토스트를 다중 기준으로: `${n}개 엔티티 → '${target.name}' 복사 완료`.
     - `closeCopyDiagModal(); saveState();`는 기존대로 유지.
- **이유**: `copyEntity`/`pasteEntity`의 다중 선택 처리 패턴과 일관성 유지. 신규 id 재발급로 다중 복사 시 충돌 제거.

### 파일: js/ui.js — 작업(1) 컨텍스트 메뉴 호출부

- **위치**: 1550행 `if (action === 'copyToDiag') { if (ctxTargetEntity) openCopyDiagModal(ctxTargetEntity); }`.
- **변경 내용**: 그대로 `openCopyDiagModal(ctxTargetEntity)` 호출 유지 가능(엔티티 인자는 fallback). 다중 선택 상태에서 우클릭 시 selectedEntities가 우선되도록 entities.js 로직이 처리하므로 호출부 수정 불필요. (선택) 다중 선택 시 메뉴 라벨을 "N개 다이어그램으로 복사"로 동적 표기하려면 ui.js의 컨텍스트 메뉴 표시 시점에서 라벨 갱신 추가 — 선택 사항.
- **이유**: 진입점은 단일하며 호출 시그니처 호환을 유지해 회귀 최소화.

### 파일: index.html — 작업(1) 모달 텍스트(선택)

- **위치**: 495~497행 `copyDiagOverlay` 모달 제목/설명.
- **변경 내용**: 설명 문구를 다중 복사 의미로 다듬기(예: "선택한 엔티티를 복사할 대상 다이어그램을 선택하세요."). 기능 동작에는 영향 없는 문구 개선.
- **이유**: 다중 복사 UX 명확화.

### 파일: js/diagrams.js — 작업(2) 전환 시 클립보드 유지 보정

- **위치**: `switchDiagram`(33~42행), `confirmNewDiag`(19~31행).
- **변경 내용**:
  - `_clipboard` 유지는 이미 보장됨(코드 추가 불필요). **추가 초기화 코드를 넣지 말 것**이 핵심(회귀 방지).
  - **보정**: 다이어그램 전환 시 `pasteEntity`의 누적 오프셋이 새 다이어그램에서 과도해지지 않도록, `switchDiagram` 내 `loadDiagramIntoWorkspace` 호출 직후 `pasteCount = 0;`으로 리셋. (단, `_clipboard`는 절대 건드리지 않음.)
    - 주의: `pasteCount`는 entities.js의 모듈 스코프 변수. diagrams.js에서 직접 접근 가능 여부(스크립트 로드 순서/전역 스코프)를 **확인 필요**. 동일 전역(window) 스코프라면 직접 대입 가능. 불가 시 entities.js에 `function resetPasteCount(){ pasteCount = 0; }`를 추가하고 switchDiagram에서 호출.
- **이유**: 클립보드는 세션 유지(요구사항), 오프셋만 다이어그램 경계에서 초기화하여 붙여넣기 위치가 자연스럽게 유지.

### 검증 포인트 (verify / integration-checker 전달)

- 다중 엔티티 선택 → 우클릭 → 다이어그램으로 복사 → 대상 다이어그램에 모든 선택 엔티티가 복제되는지(개수, id 중복 없음).
- 단일 우클릭(선택 없음)도 기존처럼 동작하는지(회귀).
- Ctrl+C → 다이어그램 전환 → Ctrl+V 시 활성(전환된) 다이어그램에 붙여넣어지는지, `_clipboard`가 유지되는지.
- `pasteCount` 접근 스코프(전역 vs 모듈) — **확인 필요**.
- index.html `#shortcutsTableBody` 단축키 표: 신규 키 없음 → 표 변경 불필요하나, 동기화 규칙상 검토 대상.
