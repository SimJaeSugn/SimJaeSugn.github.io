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
