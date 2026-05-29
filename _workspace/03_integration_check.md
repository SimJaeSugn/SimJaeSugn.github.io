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
## 단축키 동기화
- 상태: N/A
- 근거: `profile_manager.js`에 `localStorage`, `keydown`, `shortcuts` 관련 코드 없음. 단축키 추가 없음.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js(_BK_GROUPS): N/A
- 근거: 새 localStorage 키, 새 데이터 배열, 새 UI 설정값 추가 없음. 변경 표면은 순수 함수 1개(`_pmEscJsAttr`) + 렌더 함수 내부 지역 변수/문자열 보간 교체뿐.

## 상태 저장/로드
- 상태: N/A
- 근거: `state.js`에 새 상태 변수 추가 없음. `profile_manager.js` 변경은 렌더 함수 내부 지역 변수 변경만 포함.

## 렌더링 연동
- 상태: N/A
- 근거: 새 시각 요소(캔버스 요소) 추가 없음. `canvas.js` render()와 무관한 모달 내부 HTML 문자열 변경뿐.

## 자기완결성 검증 (보류 사유 해소)
- `_pmEscJsAttr` 정의 존재: OK — 251행에 함수 정의 확인.
- `eJs`/`eNameJs` 미정의 참조 부재: OK — grep 결과 0건, 잔존 참조 없음.
- `node --check` 문법 검증: OK — 종료코드 0, 문법 오류 없음.
- onclick 인자 교체 범위:
  - `_renderProfileList`: 315행 `eName`(_pmEsc 유지), 316-321행 `jName`/`jDbType`/`jHost`/`jDatabase`/`jUsername`/`jLibDir`(신규, _pmEscJsAttr) 확인.
  - 전환 버튼(327행), editArgs(330-337행), 삭제 버튼(342행), 선택 onclick(348행): jName/jDbType 등 교체 확인.
  - 표시용 텍스트(350-351행): `eName`/_pmEsc 유지 확인.
  - `_renderRightPanel('edit')`: 499행 `eName`(_pmEsc 유지), 500행 `jName`(_pmEscJsAttr 신규), 559행 저장 버튼 onclick → `jName` 교체 확인.

## 최종 상태: PASS

