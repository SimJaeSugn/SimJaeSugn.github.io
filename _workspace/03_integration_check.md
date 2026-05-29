<<<<<<< HEAD
# Integration Check Report - Note V2

## 1. 단축키 동기화
- **결과: PASS (해당없음)**
- js/main.js, js/shortcuts.js에 V2 메모 전용 단축키 없음
- V2 메모는 컨텍스트 메뉴를 통해서만 진입하므로 #shortcutsTableBody 동기화 불필요

## 2. 백업 통합
- **결과: PASS**
- `_doExportWithGroups`: diagrams 그룹이 `diagrams` 배열 전체를 내보내며, `flushCurrentState()`에서 `d.notesV2`를 설정하므로 자동 포함 (export.js:137-139)
- `_doImportWithGroups`: `loadDiagramIntoWorkspace()` 호출로 notesV2 처리됨 (import.js:49)
- `_BK_GROUPS` descFn: `V2메모` 명시 포함 (ui.js:1834)

## 3. 상태 저장/로드 일관성
- **결과: PASS**
- `flushCurrentState()`: `d.notesV2 = NOTES_V2.map(...)` 포함 (state.js:65)
- `loadDiagramIntoWorkspace()`: `NOTES_V2.length = 0; (d.notesV2 || []).forEach(...)` 포함 (state.js:75)

## 4. 렌더링 연동
- **결과: PASS**
- `canvas.js` render(): `renderNoteV2Overlays()` 호출 (canvas.js:1790)
- `index.html`: `#noteV2Layer` div 존재 (index.html:948)

## 5. 컨텍스트 메뉴 연동
- **결과: PASS**
- `CTX_VISIBILITY.noteV2` 모드 정의됨 (ui.js:1078)
- canvas 모드에 `ctx-sep-note-v2`, `ctx-add-note-v2` 포함 (ui.js:1072)
- showCtxMenu 전체 ID 배열에 5개 V2 ID 모두 포함 (ui.js:1090)
- ctxFn에 addNoteV2, delNoteV2, pinNoteV2, colorNoteV2 핸들러 존재 (ui.js:1535-1538)
- index.html에 ctx-sep-note-v2, ctx-add-note-v2, ctx-del-note-v2, ctx-pin-note-v2, ctx-color-note-v2 요소 존재

## 6. JSON 가져오기 연동
- **결과: PASS**
- `_applyImportDiagram`: `active.notesV2 = src.notesV2 || []` (import.js:196)
- `_addImportDiagramAsNew`: `d.notesV2 = src.notesV2 || []` (import.js:215)

## 7. 알려진 제한사항 (수정 불필요)
- SVG/PNG 내보내기: V2 메모는 DOM 오버레이 방식이라 캔버스 기반 이미지/SVG 내보내기에 포함되지 않음
  - V1 메모는 캔버스에 직접 그리므로 SVG/PNG에 포함됨
  - V2 메모를 이미지 내보내기에 포함하려면 별도 기능 개선 필요 (향후 과제)

## 수정 사항
- 없음. 모든 cross-cutting 항목이 정상 통합되어 있음.

## 최종 판정: PASS
=======
# Integration Check — 포워드 엔지니어링 엔티티 우클릭 기능
## 재검사일: 2026-05-29 (직접 코드 확인)

---

## 검증 1: data-idx 정합성

- 상태: **OK**
- 근거: `js/forward_engineer.js` line 289  
  `const i = ENTITIES.indexOf(ent);`  
  `entsToRender`가 `ENTITIES.filter(ent => ent.id === restrictEntityId)`로 걸러진 부분 배열이더라도, `data-idx` 값은 항상 원본 ENTITIES 배열 기준 인덱스를 사용함.  
  → `_feRun` / `_fePreview`의 `selectedIdxs.includes(i)` 필터가 정확한 엔티티를 선택함.

## 검증 2: showCtxMenu 전체 id 토글 배열에 ctx-fe-ent 포함

- 상태: **OK**
- 근거: `js/ui.js` line 1104  
  `['ctx-add-ent','ctx-edit-ent','ctx-dup-ent','ctx-copy-diag','ctx-color-ent','ctx-sel-related','ctx-fe-ent', ...]`  
  → 배열 첫 줄에 `ctx-fe-ent` 포함. 다른 컨텍스트(캔버스, 관계, 섹션 등)에서는 CTX_VISIBILITY에 없으므로 `visible[id]`가 undefined → `display:none` 처리됨. 잔상 없음.

## 검증 3: CTX_VISIBILITY entity 모드에 ctx-fe-ent: 1 등록

- 상태: **OK**
- 근거: `js/ui.js` line 1092  
  `entity: { 'ctx-edit-ent':1, ..., 'ctx-sel-related':1, 'ctx-fe-ent':1, 'ctx-sep-ent':1, ... }`  
  → entity 모드에서 정상 표시됨.

## 검증 4: ctxFn 래퍼 경유 동작

- 상태: **OK**
- 근거:
  - `window.ctxFn` 래퍼 (`js/ui.js` line 1998–2002):  
    `focusEnt`, `unfocusEnt` 두 액션만 가로챔. `forwardEng`는 가로채지 않음.
  - → `window._ctxFnOrig(action)` 경로로 원본 `ctxFn`에 정상 도달.
  - 원본 `ctxFn` line 1538:  
    `if (action === 'forwardEng') { if (ctxTargetEntity) openForwardEngineerForEntity(ctxTargetEntity.id); return; }`  
    → `ctxTargetEntity` 존재 여부 확인 후 호출. null 안전.

## 검증 5: openForwardEngineerForEntity 내 _feShowStep2(entityId) 호출

- 상태: **OK**
- 근거: `js/forward_engineer.js` line 68–116  
  - line 68: `ENTITIES.find(e => e.id === entityId)` — 없는 엔티티 사전 가드  
  - line 115: `await _feShowStep2(entityId)` — restrictEntityId를 올바르게 전달  
  - `_feShowStep2` line 284–286: `restrictEntityId`가 있으면 `ENTITIES.filter(ent => ent.id === restrictEntityId)` 사용

## 단축키 동기화

- 상태: N/A
- 상세: 새 단축키 없음 — 컨텍스트 메뉴 항목만 추가

## 백업 통합 (export/import/ui)

- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: 새 localStorage 키, 데이터 배열, UI 설정값 없음

## 상태 저장/로드

- 상태: N/A
- 상세: state.js에 새 변수 없음

## 렌더링 연동

- 상태: N/A
- 상세: 캔버스에 새 시각 요소 없음

---

## 최종 상태: PASS

모든 5개 검증 항목 이상 없음. 수정 불필요.
>>>>>>> f8e4e4d566b333a81829bc390ad2940d6a23acd4
