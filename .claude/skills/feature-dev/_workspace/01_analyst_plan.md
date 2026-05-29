## 요청 요약

**요청 1 — 컨텍스트 메뉴 포워드 엔지니어링의 다중 선택 지원**
우클릭 컨텍스트 메뉴에서 "포워드 엔지니어링" 선택 시, 현재는 우클릭 대상(`ctxTargetEntity`) 단일 엔티티만 처리한다. `selectedEntities`(Set, 엔티티 ID 보관)에 2개 이상 선택돼 있으면 선택 집합 전체를 포워드 엔지니어링 대상으로 넘긴다. 우선순위: `selectedEntities.size > 1` 이면 선택 집합, 아니면 기존대로 `ctxTargetEntity`.

**요청 2 — SQL 미리보기 창의 이전 값 유지 버그 수정**
포워드 엔지니어링 모달을 다시 열 때, 이전에 생성한 SQL이 `#fePreviewSql`에 남아 보이는 경우가 있다. 모달 재오픈 시 미리보기 영역을 항상 초기화/숨김 처리하여, 새로 "미리보기" 또는 "실행"을 누를 때만 최신 SQL이 보이도록 한다.

## 탐색한 파일
- `js/forward_engineer.js`: 포워드 엔지니어링 전체 구현. `openForwardEngineerForEntity()`, `_feShowStep2(restrictEntityId)`, `_feResetToStep1()`, `_fePreview()` 등.
- `js/ui.js` (1531~1574 `ctxFn`): 컨텍스트 메뉴 액션 디스패치. line 1553에서 `forwardEng` → `openForwardEngineerForEntity(ctxTargetEntity.id)` 호출.
- `js/canvas.js` (line 29, 2450): `selectedEntities = new Set()` 전역 선언, contextmenu 핸들러가 `ctxTargetEntity` 세팅.
- `js/state.js`: `selectedEntities` 미정의(상태는 canvas.js에 위치). → state.js 변경 불필요.

## 영향 분석
- **단축키 변경**: 없음 — 컨텍스트 메뉴 동작만 변경. `index.html`의 `#shortcutsTableBody` 영향 없음.
- **새 localStorage 키**: 없음 — 영구 저장 데이터 구조 변경 없음.
- **새 데이터 배열/상태 변수**: 없음 — 기존 전역 `selectedEntities`(Set), `ENTITIES`, 모듈 스코프 `_fe*` 상태 재사용.
- **export/import 파급**: 없음 — 백업 직렬화 대상(엔티티/관계/다이어그램) 구조 미변경.
- **기타 파급 효과**:
  - 요청 1은 `_feShowStep2`가 받는 "대상 엔티티 한정" 인자를 단일 ID → 복수 ID 집합도 받도록 일반화해야 함. 기존 단일 진입(`openForwardEngineerForEntity`)과 호환 유지 필요.
  - `toggleForwardEngineerAll` 전체선택 버튼은 단일 제한 모드에서 숨겨져 있음(line 315). 다중 선택 모드에서는 표시해도 무방하나, 현재 "제한된 목록 내 전체 선택"이 자연스러우므로 버튼 표시 정책 결정 필요 — **구현 시 다중 모드에서는 버튼 표시 권장**(목록이 2개 이상이므로 의미 있음).

## 구현 계획

### 파일: js/forward_engineer.js

**1) `_feShowStep2(restrictEntityId = null)` 시그니처를 복수 대상 지원으로 일반화**
- 위치: line 254 `async function _feShowStep2(restrictEntityId = null)` 및 내부 line 284~286, 315.
- 변경 내용:
  - 인자를 `restrictEntityIds = null`(배열 또는 null)로 받도록 변경하되, 하위호환을 위해 단일 문자열도 허용: 함수 진입부에서 `const restrictIds = restrictEntityId == null ? null : (Array.isArray(restrictEntityId) ? restrictEntityId : [restrictEntityId]);` 형태로 정규화.
  - 엔티티 필터: `const entsToRender = restrictIds ? ENTITIES.filter(ent => restrictIds.includes(ent.id)) : ENTITIES;` (기존 line 284~286 대체).
  - 전체선택 버튼 가시성(line 315): 제한 대상이 2개 이상이면 표시, 1개면 숨김. 예: `feSelectAllBtn.style.display = (restrictIds && restrictIds.length <= 1) ? 'none' : '';`
- 이유: 단일/복수 제한 목록을 동일 경로로 처리해 코드 중복 방지, 기존 단일 진입 호환 유지.

**2) `openForwardEngineerForEntity(entityId)`를 복수 대상도 받도록 확장**
- 위치: line 67 `async function openForwardEngineerForEntity(entityId)` ~ line 116.
- 변경 내용:
  - 시그니처를 `openForwardEngineerForEntity(entityIdOrIds)`로 하고, 진입부에서 배열 정규화: `const ids = Array.isArray(entityIdOrIds) ? entityIdOrIds : [entityIdOrIds];` 후 `const targets = ids.map(id => ENTITIES.find(e => e.id === id)).filter(Boolean); if (!targets.length) return;` (기존 line 68~69 단일 `target` 가드 대체).
  - 마지막 호출(line 115)을 `await _feShowStep2(targets.map(t => t.id));`로 변경.
- 이유: 컨텍스트 메뉴에서 단일/복수 모두 이 함수로 진입하도록 단일화.
- **확인 필요**: line 78~98의 `feDbCfgNotice` 오버레이 생성 블록은 `openForwardEngineerModal`(line 29~49)과 완전 중복임. reviewer가 이전 run에서 지적(`_workspace/04_review.md` 항목 1). 이번 변경 범위 밖이나, 가능하면 헬퍼(`_feEnsureMwReady()`)로 추출 권장 — 미적용 시 중복 유지.

**3) SQL 미리보기 초기화 (요청 2)**
- 위치: `_feResetToStep1()` (line 224~241). 이 함수는 신규 오픈(`_feRenderStep1Modal` 끝, line 221)과 재오픈(line 128)에서 모두 호출됨 → 미리보기 초기화의 단일 지점으로 적합.
- 변경 내용: `_feResetToStep1()` 내부에 아래 초기화 추가.
  - `const previewWrap = document.getElementById('fePreviewWrap'); if (previewWrap) previewWrap.style.display = 'none';`
  - `const previewSql = document.getElementById('fePreviewSql'); if (previewSql) previewSql.textContent = '';`
  - (선택) 진행률 바도 함께 초기화 권장: `feProgress` display 'none', `feProgressBar` width '0%'. 이전 실행 후 재오픈 시 잔상 방지.
- 이유: 모달을 다시 열 때(`_feRenderStep1Modal`이 기존 오버레이를 재사용하는 경로 포함) 항상 미리보기를 비우고 숨겨, 이전 SQL 잔상 제거. `_fePreview()`/`_feRun()` 시점에만 `fePreviewWrap`을 다시 표시하고 `textContent`를 새로 채우므로 항상 최신값 보장.
- **확인 필요**: `_feShowStep2`도 진입 시 미리보기 영역을 명시적으로 숨기는지 점검. 현재는 step2 진입 시 `fePreviewWrap`을 건드리지 않음 — `_feResetToStep1`이 항상 step2보다 먼저 호출되므로(오픈 경로상) 충분하나, 방어적으로 `_feShowStep2` 진입부에서도 `fePreviewWrap` 숨김을 추가해도 좋음(integration-checker 판단).

### 파일: js/ui.js

**4) `ctxFn`의 `forwardEng` 분기에서 다중 선택 우선 처리 (요청 1)**
- 위치: line 1553.
- 변경 전: `if (action === 'forwardEng') { if (ctxTargetEntity) openForwardEngineerForEntity(ctxTargetEntity.id); return; }`
- 변경 후(권장 로직):
  ```js
  if (action === 'forwardEng') {
    if (typeof selectedEntities !== 'undefined' && selectedEntities.size > 1) {
      openForwardEngineerForEntity([...selectedEntities]);
    } else if (ctxTargetEntity) {
      openForwardEngineerForEntity(ctxTargetEntity.id);
    }
    return;
  }
  ```
- 이유: `selectedEntities`는 canvas.js 전역이므로 ui.js에서 직접 접근 가능. `size > 1` 이면 선택 집합(ID 배열) 전달, 아니면 기존 단일 동작 유지. `typeof` 가드는 다른 모듈(ui.js line 17에서도 동일 패턴 사용)과 일관.
- **확인 필요**: 우클릭 시 canvas.js의 contextmenu 핸들러(line 2450)는 `ctxTargetEntity`만 세팅하고 `selectedEntities`를 변경하지 않음. 즉 다중 선택 상태에서 선택된 엔티티 중 하나를 우클릭하면 `selectedEntities`가 유지됨 → 의도대로 동작. 단, 선택되지 않은 다른 엔티티를 우클릭한 경우에도 `selectedEntities.size > 1`이면 선택 집합이 우선됨(우클릭 대상이 집합에 없을 수 있음). 요청 우선순위 정의("size>1이면 선택집합")에 부합하므로 그대로 진행하되, reviewer가 UX 관점에서 재확인 권장.

### 파일: js/state.js
- 변경 없음. `selectedEntities`는 canvas.js 소유.

## 구현 순서 요약
1. `js/forward_engineer.js`: `_feShowStep2` 인자 일반화(배열/단일) → `openForwardEngineerForEntity` 복수 대상 확장 → `_feResetToStep1`에 미리보기/진행률 초기화 추가.
2. `js/ui.js`: `ctxFn`의 `forwardEng` 분기에 `selectedEntities.size > 1` 우선 분기 추가.
3. 통합 점검: 단축키/localStorage/export 영향 없음 확인. 단일 진입 호환성, 미리보기 초기화 단일 지점 확인.
