# 01 Analyst Plan — 엔티티 우클릭 컨텍스트 메뉴에 "포워드 엔지니어링" 추가

## 요청 요약
- 엔티티 우클릭 컨텍스트 메뉴에 "포워드 엔지니어링" 항목 추가.
- 클릭 시 **해당 엔티티 1개만** 대상으로 포워드 엔지니어링 실행.
- 기존 `openForwardEngineerModal()`의 1단계(옵션) → 엔티티 선택 흐름을 건너뛰고, **해당 엔티티만 선택된 상태로 2단계(충돌처리 + 미리보기)에 바로 진입**.

---

## 탐색한 파일
- `index.html` (274~304): 컨텍스트 메뉴(`#ctxMenu`) HTML 구조 — 항목 추가 위치.
- `index.html` (119): 메뉴바의 기존 포워드엔지니어링 진입점 패턴.
- `index.html` (964~984): 스크립트 로드 순서 확인(canvas.js → ui.js → db_connect.js → forward_engineer.js).
- `js/canvas.js` (2406~2421): `contextmenu` 이벤트 핸들러, hitTest로 엔티티 판정 → `ctxTargetEntity` 세팅 후 `showCtxMenu(...,'entity')`.
- `js/ui.js` (1084~1120): `ctxTargetEntity` 선언, `CTX_VISIBILITY` 가시성 맵, `showCtxMenu()`.
- `js/ui.js` (1516~1558): `ctxFn()` 액션 디스패처.
- `js/ui.js` (1986~2001): `showCtxMenu`/`ctxFn` **래퍼 패턴**(`_showCtxMenuOrig`, `_ctxFnOrig`) — 포커스 모드 항목이 여기서 가시성·액션을 확장.
- `js/forward_engineer.js` (전체): 진입 흐름(`openForwardEngineerModal` → `_feRenderStep1Modal` → `_feNextStep` → `_feShowStep2` → `_feRun`), 모듈 스코프 상태.
- `js/db_connect.js` (6, 8, 17, 27): `MW_URL`, `_mwPing`, `_mwGetConfig`, `_showMwNotRunning`.
- `js/state.js` (204): `entDisplayName(e)`.

---

## 영향 분석
- **단축키 변경**: 없음. (컨텍스트 메뉴 항목만 추가, shortcuts.js 무관)
- **새 localStorage 키**: 없음.
- **새 데이터 배열/상태 변수**: 없음. 기존 모듈 스코프 상태(`_feSelectedEntities`, `_feConflicts`, `_feExistingTables`, `_feDialect`, `_feDetectedDialect`)와 `ctxTargetEntity` 재사용.
- **기타 파급 효과**:
  - 백업(export/import) 무관 — 데이터 구조 변경 없음.
  - `feature-dev` 통합 검사(단축키 동기화/백업)는 해당 없음.
  - 미들웨어(`middleware/README.md`) 무관 — 미들웨어 코드 변경 없음.

---

## 현재 구조 핵심 정리

### 1. 우클릭 컨텍스트 메뉴 (위치 확정)
- **이벤트 핸들러**: `js/canvas.js:2407` `canvas.addEventListener('contextmenu', ...)`.
  - `hitTest(w.x,w.y)` 성공 시 `ctxTargetEntity = hitEnt` 설정 후 `showCtxMenu(e.clientX, e.clientY, 'entity')` 호출 (line 2416).
- **HTML 구조**: `index.html:275` `<div id="ctxMenu">` 내부에 `<div class="ctx-item" id="..." onclick="ctxFn('액션')">` 항목 나열.
  - 엔티티 항목 예: `ctx-edit-ent`, `ctx-dup-ent`, `ctx-copy-diag`, `ctx-color-ent`, `ctx-sel-related`, `ctx-del-ent`.
- **가시성 제어**: `js/ui.js:1090` `CTX_VISIBILITY` 맵. mode별로 표시할 항목 id를 1로 명시. `entity` 모드(line 1092)에 표시 항목 등록 필요.
  - `showCtxMenu()`(line 1100)는 line 1104~1110의 **하드코딩된 전체 id 배열**을 순회하며 `visible[id]`에 따라 display를 토글. → 새 항목 id를 **이 배열에도 추가**해야 hide/show가 정상 동작(미추가 시 display 토글 대상에서 누락되어 잔상 가능).
- **래퍼 패턴**: `js/ui.js:1987~2001`에서 `showCtxMenu`/`ctxFn`를 한 번 감싸 포커스 모드 항목(`ctx-focus-ent`/`ctx-unfocus-ent`)을 추가. 이 항목들은 `CTX_VISIBILITY`에 없고, 래퍼에서 직접 display 제어 + `ctxFn` 래퍼에서 액션 처리.
  - → **신규 항목도 동일하게 두 방식 중 하나를 택일.** 본 계획은 일관성과 단순성을 위해 **CTX_VISIBILITY/ctxFn 기본 경로**(포커스 모드가 아닌 일반 항목 방식)를 사용.

### 2. forward_engineer.js 진입 구조
- `_feStep`(0=미개방,1=옵션,2=엔티티선택)으로 단계 관리.
- `openForwardEngineerModal()` (line 21):
  1. `_mwPing()` 가드 (line 22) → 미실행 시 `_showMwNotRunning()`.
  2. `_mwGetConfig()` 가드 (line 27) → config 없으면 "DB 접속정보 없음" 모달.
  3. dialect 자동 감지 (line 52~55).
  4. 상태 초기화(`_feStep=1`, `_feSelectedEntities=[]`, `_feConflicts={}`, `_feExistingTables=[]`) (line 57~60).
  5. `_feRenderStep1Modal()` (line 62) — 모달 DOM 생성(없을 때만) 후 `_feResetToStep1()`.
- `_feShowStep2()` (line 202):
  - `MW_URL/schema/tables` 조회 → `_feExistingTables` 채움.
  - `#feEntityList`에 **ENTITIES 전체**를 체크박스 리스트로 렌더(`.feEntityChk`, `data-pname`, `data-idx`, 기본 `checked`).
  - `_feUpdateConflictUI()` 호출, step1 숨김/step2 표시, `_feStep=2`.
- `_fePreview()`(364)·`_feRun()`(407): `document.querySelectorAll('.feEntityChk:checked')`의 `data-idx`/`data-pname`로 대상 산출 → `buildDDL` + `_feGetPreDDL`.

> **핵심 관찰**: 2단계 진입 후 로직(`_fePreview`/`_feRun`/`_feUpdateConflictUI`)은 전부 **DOM 체크박스(`.feEntityChk`)** 를 단일 진실 소스로 사용. 따라서 단일 엔티티 진입은 "step2 모달을 띄우되 `#feEntityList`를 해당 엔티티 1개만으로 렌더하면" 기존 로직을 그대로 재사용 가능. 별도 상태 분기 불필요.

### 3. 미들웨어 ping/config 가드
- 단일 엔티티 진입도 결국 `MW_URL/schema/tables`(line 213) 호출과 `MW_URL/execute/stream` 실행을 수행하므로, **`_mwPing` + `_mwGetConfig` 가드가 동일하게 필요**.
- 또한 dialect 자동 감지(`_feDetectedDialect`)가 config에서 나오므로 config 로드는 필수.
- → 신규 진입 함수도 `openForwardEngineerModal()`과 **동일한 가드/감지/초기화 시퀀스**를 거친 뒤, step1을 건너뛰고 step2를 단일 엔티티로 렌더해야 한다.

---

## 구현 계획

### 파일: `js/forward_engineer.js`
**신규 함수 `openForwardEngineerForEntity(entityId)` 추가** (위치: `openForwardEngineerModal()` 정의 직후, 약 line 64 `}` 다음 / `closeForwardEngineerModal` 앞).

- 내용:
  1. `entityId`로 `ENTITIES`에서 대상 엔티티 조회. 없으면 `showToast('엔티티를 찾을 수 없습니다.')` 후 return.
  2. `await _mwPing()` 가드 → 실패 시 `_showMwNotRunning(); return;`.
  3. `await _mwGetConfig()` 가드 → 실패 시 `openForwardEngineerModal()`과 동일한 "DB 접속정보 없음" 모달 표시 후 return.
     - 코드 중복 회피를 위해 가드+config 모달 부분을 `_feEnsureMwReady()` 같은 내부 헬퍼로 추출하여 `openForwardEngineerModal()`과 공유하는 것을 권장(implementer가 중복 최소화). 단, 위험을 줄이려면 최소 변경으로 동일 블록 복제도 허용.
  4. dialect 감지: `const dbType = config.dbType || 'mysql'; _feDetectedDialect = _feDialectMap[dbType] || 'mysql'; _feDialect = _feDetectedDialect;` (line 52~55와 동일).
  5. 상태 초기화: `_feSelectedEntities = []; _feConflicts = {}; _feExistingTables = [];` (line 58~60와 동일). `_feStep`는 `_feShowStep2`에서 2로 설정되므로 임시로 1 불필요하나, 안전하게 `_feStep = 1;` 설정 후 진행.
  6. `_feRenderStep1Modal()` 호출하여 모달 DOM 보장(`feOverlay` 생성/리셋). 단 step1 UI는 노출하지 않을 것이므로, 이어서 곧바로 step2를 단일 엔티티로 렌더.
  7. `document.getElementById('feOverlay').classList.add('active');`.
  8. **단일 엔티티 step2 렌더**: 새 옵션 인자를 받는 방식으로 `_feShowStep2(restrictEntityId)`를 확장하거나, 단일 엔티티용 렌더 분기를 둔다(아래 `_feShowStep2` 변경 참조).
  9. dialect 셀렉트(`#feDialectSel`)는 step1에 있고 step2에서 숨겨지므로, 단일 엔티티 진입 시 `_feDialect`는 자동 감지값으로 고정됨(사용자가 dialect를 못 고름). → 허용. (요청이 "엔티티 선택 단계만 건너뛰고 2단계로 바로 진입"이므로 dialect는 감지값 사용이 자연스러움.)

**기존 함수 `_feShowStep2()` 변경** (line 202): **선택적 인자 `restrictEntityId`** 추가.
- 시그니처: `async function _feShowStep2(restrictEntityId = null)`.
- line 233 `ENTITIES.map(...)` 렌더 대상을 분기:
  - `restrictEntityId`가 있으면 해당 엔티티만 리스트에 렌더. 단, **`data-idx`는 반드시 `ENTITIES` 원본 인덱스(`ENTITIES.indexOf(ent)`)** 로 유지 — `_fePreview`/`_feRun`이 `data-idx`로 `ENTITIES.filter((ent,i)=>selectedIdxs.includes(i))`(line 378, 421) 처리하기 때문. 부분 배열의 0 인덱스를 쓰면 잘못된 엔티티가 선택됨. **버그 주의(확인 필요)**.
  - 구현 예: `const renderList = restrictEntityId ? ENTITIES.filter(e => e.id === restrictEntityId) : ENTITIES;` 후 `renderList.map(ent => { const i = ENTITIES.indexOf(ent); ... data-idx="${i}" ... })`.
- 단일 엔티티 모드에서는 `#feSelectAllBtn`(전체 선택 버튼)을 숨기는 것이 UX상 자연스러움: line 259 `feSelectAllBtn.style.display=''` 를 `restrictEntityId ? 'none' : ''` 로 조정(선택 사항, 권장).
- 나머지(충돌 UI, step1 숨김/step2 표시, 버튼 상태, `_feStep=2`)는 기존 그대로.

**`_feNextStep()` 영향 검토** (line 192): 단일 엔티티 진입은 step1을 거치지 않고 바로 step2 상태가 되며, `feNextBtn.onclick`은 `_feShowStep2` 내부에서 `_feNextStep`으로 설정됨(line 263). `_feStep===2`이므로 "실행" 버튼 클릭 시 `_feRun()` 정상 동작. → 변경 불필요.

### 파일: `index.html`
**컨텍스트 메뉴 항목 추가** (위치: `#ctxMenu` 내 엔티티 그룹, line 281 `ctx-sel-related` 다음 또는 line 278 `ctx-dup-ent` 부근 — 엔티티 액션 묶음 내).
- 추가:
  `<div class="ctx-item" id="ctx-fe-ent" onclick="ctxFn('forwardEng')"><span class="ctx-ico">📤</span>포워드 엔지니어링</div>`
- (메뉴바 항목 line 119와 동일 아이콘 📤 사용으로 일관성 유지.)

### 파일: `js/ui.js`
**(a) CTX_VISIBILITY entity 모드에 신규 id 등록** (line 1092):
- `entity: { ..., 'ctx-sel-related':1, 'ctx-fe-ent':1, 'ctx-sep-ent':1, ... }` — `ctx-fe-ent`:1 추가.

**(b) showCtxMenu 토글 id 배열에 신규 id 추가** (line 1104~1110):
- 하드코딩된 id 배열에 `'ctx-fe-ent'` 추가(엔티티 그룹 라인 근처). 누락 시 display 토글 대상에서 빠져 다른 모드에서 잔상으로 보일 수 있음. **반드시 추가.**

**(c) ctxFn 디스패처에 액션 추가** (line 1516~1558, `ctxFn` 본문):
- `if (action === 'forwardEng') { if (ctxTargetEntity) openForwardEngineerForEntity(ctxTargetEntity.id); return; }` 추가.
- 주의: `ctxFn` 최상단(line 1517)에서 `hideCtxMenu()` 호출되므로 메뉴는 자동으로 닫힘. `forwardEng` 분기는 그 이후 어디서든 배치 가능(단 `ctxTargetEntity` 참조 시점이 hideCtxMenu 이후여도 변수는 유효).
- **래퍼(`window.ctxFn`, line 1997) 경유 확인 필요**: `index.html`의 `onclick="ctxFn(...)"`은 전역 `ctxFn`(= 래퍼)을 호출. 래퍼는 `focusEnt`/`unfocusEnt`만 가로채고 나머지는 `_ctxFnOrig(action)`(원본)로 위임(line 2000). → `forwardEng`를 **원본 `ctxFn`(line 1516)에 추가하면 래퍼 통해 정상 도달**. 별도 래퍼 수정 불필요.

---

## 구현 순서 권장
1. `js/forward_engineer.js`: `_feShowStep2(restrictEntityId)` 인자화 + `openForwardEngineerForEntity(entityId)` 신설 (+ 선택적 `_feEnsureMwReady()` 추출).
2. `index.html`: `#ctxMenu`에 `ctx-fe-ent` 항목 추가.
3. `js/ui.js`: `CTX_VISIBILITY.entity`에 `ctx-fe-ent` 등록 + `showCtxMenu` 토글 배열에 추가 + `ctxFn`에 `forwardEng` 분기 추가.

## 검증 포인트 (integration-checker / reviewer 주의)
- **data-idx 정합성**: 단일 엔티티 모드에서 `data-idx`가 `ENTITIES` 원본 인덱스여야 `_fePreview`/`_feRun`의 `includes(i)` 필터가 올바른 엔티티를 집음. (가장 큰 회귀 위험 지점)
- **showCtxMenu 토글 배열 누락 금지**: 신규 id를 line 1104~1110 배열에 반드시 포함.
- **가드 동작**: 미들웨어 미실행/Config 없음 시 단일 진입에서도 동일하게 차단되는지.
- **dialect**: 단일 진입 시 자동 감지값 고정(사용자 변경 UI 없음) — 의도된 동작으로 간주.
- 백업/단축키/미들웨어 README: 영향 없음(변경 불필요).
