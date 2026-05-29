<<<<<<< HEAD
# Implementer: Note V2 변경 내역

## 수정 파일 (7개)

### 1. js/config.js
- `NOTE_COLORS` 아래에 V2 상수 추가: `NOTE_V2_W`, `NOTE_V2_H`, `NOTE_V2_MIN_W`, `NOTE_V2_MIN_H`, `NOTE_V2_THEMES` (8가지 테마)

### 2. js/state.js
- `NOTES_V2 = []` 전역 배열 추가
- `flushCurrentState()`: `d.notesV2` 직렬화 추가
- `loadDiagramIntoWorkspace()`: `NOTES_V2` 복원 로직 추가

### 3. css/components.css
- `.note-v2-card` 카드 스타일 (border-radius 12px, box-shadow, flex column)
- `.note-v2-header` / `.nv2-title` (인라인 제목 편집, contentEditable)
- `.note-v2-actions` 버튼 (핀/색상/삭제)
- `.note-v2-body` (인라인 본문 편집)
- `.note-v2-footer` + `.nv2-tag` (태그 pill UI)
- `.note-v2-resize` (우하단 리사이즈 핸들)
- 8가지 테마별 gradient background + header 색상
- `.nv2-color-picker` / `.nv2-color-swatch` (색상 선택 팝업)

### 4. index.html
- 컨텍스트 메뉴 항목 4개 추가: `ctx-add-note-v2`, `ctx-del-note-v2`, `ctx-pin-note-v2`, `ctx-color-note-v2`
- `#noteV2Layer` div 추가 (z-index:10, pointer-events:none 오버레이)

### 5. js/ui.js
- `CTX_VISIBILITY`에 `noteV2` 모드 추가, `canvas` 모드에 V2 메뉴 항목 포함
- `showCtxMenu` ID 배열에 V2 항목 5개 추가
- `ctxFn`에 V2 액션 4개 추가 (addNoteV2, delNoteV2, pinNoteV2, colorNoteV2)
- V2 함수 전체 구현:
  - `addNoteV2At()` / `deleteNoteV2()` / `toggleNoteV2Pin()`
  - `renderNoteV2Overlays()` (DOM 카드 생성/위치/업데이트)
  - `_createNoteV2Card()` (카드 DOM 빌더)
  - `_positionNoteV2Card()` / `_updateNoteV2Card()` / `_noteV2WorldToScreen()`
  - `showNoteV2ColorPicker()` (8색 팝업)
  - mousemove/mouseup 이벤트 (드래그 + 리사이즈)
- `_BK_GROUPS` descFn에 'V2메모' 추가

### 6. js/canvas.js
- `render()` 함수 끝에 `renderNoteV2Overlays()` 호출 추가

### 7. js/import.js
- `_applyImportDiagram()`: `notesV2` 필드 처리 추가
- `_addImportDiagramAsNew()`: `notesV2` 필드 처리 추가

## 데이터 저장
- NOTES_V2는 diagram 객체의 `notesV2` 필드로 LocalStorage에 자동 저장됨 (기존 저장 흐름 활용)
- 전체 백업(export/import)에도 diagrams 그룹 내에 자동 포함됨
=======
# 구현 변경 내역

## 변경 파일 목록

- js/forward_engineer.js: `_feShowStep2(restrictEntityId = null)` 인자 추가, 단일 엔티티 렌더링 분기 및 전체 선택 버튼 숨기기 처리, `openForwardEngineerForEntity(entityId)` 신규 함수 추가
- index.html: `#ctxMenu` 내 ctx-sel-related 다음에 ctx-fe-ent 항목 추가
- js/ui.js: CTX_VISIBILITY entity 모드에 ctx-fe-ent 추가, showCtxMenu 전체 id 배열에 ctx-fe-ent 추가, ctxFn 디스패처에 forwardEng 분기 추가

## 주요 결정 사항

- `_feShowStep2`의 렌더링 분기 시 `data-idx`는 `ENTITIES.indexOf(ent)`로 설정 — 부분 배열 인덱스 사용 안 함
- `openForwardEngineerForEntity`는 `openForwardEngineerModal`의 가드/초기화 로직을 그대로 복사하고 마지막에 `_feShowStep2(entityId)` 호출

## 미완료 항목

없음
>>>>>>> f8e4e4d566b333a81829bc390ad2940d6a23acd4
