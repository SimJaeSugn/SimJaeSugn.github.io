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
## 변경 파일 목록
- js/profile_manager.js: _pmEscJsAttr 헬퍼 추가, _renderProfileList/edit 블록의 onclick 인자를 _pmEsc → _pmEscJsAttr 결과 변수(jName 등)로 교체

## 주요 결정 사항
- 계획대로 구현함. 파일이 CRLF 줄바꿈이라 Edit 도구 대신 Node.js 스크립트로 직접 문자열 교체를 수행함(Edit 도구가 CRLF 포함 old_string을 찾지 못하는 문제 우회).
- 계획의 (A)~(D) 모두 계획과 동일하게 구현.
- node --check 문법 검사 통과, eJs/eNameJs 미정의 참조 없음, onclick 컨텍스트의 eName 잔존 없음 확인.

## 미완료 항목
- 없음
