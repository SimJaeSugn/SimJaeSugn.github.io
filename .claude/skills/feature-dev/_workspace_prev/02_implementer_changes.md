# 02 Implementer Changes

## 변경 파일 목록

- **js/export.js**
  - `_fallbackDownload(filename, data, type='application/json')`: Blob 직접 전달 허용 + MIME type 인자 추가 (하위호환).
  - `_ddlEntityIds = new Set()` 모듈 변수 추가 (`_exportDiagIds` 인근, 비영속).
  - `downloadImage(includeSections, hiDPI)`: async화, `dpr`(2x) 도입, 캔버스 dpr배 확대 + `ctx.scale(dpr,dpr)`, `toBlob` 사용, `_writeExportFile` 연동 + 실패 토스트, blob null 시 안내 토스트. 전역(ctx/vx/vy/scale) 복원 및 `render()`는 toBlob 호출 이전에 동기 수행.
  - `downloadSVG()`: async화, 끝부분 `<a download>`→`_writeExportFile`+폴백(`image/svg+xml`).
  - `openDDLModal()`: 옵션 체크박스 3개 초기화(checked), 엔티티 모드 'all' 초기화, `ddlEntityListWrap` 숨김, `_ddlEntityIds` 전체로 초기화 후 generateDDL.
  - 신규 `renderDDLEntityList()`: `#ddlEntityList`에 엔티티 체크박스 생성(`openExportDiagSelectModal` 패턴), change 시 Set 갱신 + generateDDL.
  - 신규 `onDDLEntityModeChange()`: 전체/선택 라디오 토글 → 목록 표시/숨김 + 재렌더 + generateDDL.
  - `generateDDL(dialect)`: dialect 누락 시 DOM에서 읽음, 옵션 체크박스 상태로 `opts` 구성, 선택 모드 시 `_ddlEntityIds` 필터, 빈 선택 시 안내 메시지, `buildDDL(dialect, target, opts)` 호출.
  - `exportMarkdown()`: async화, 끝부분 `_writeExportFile`+폴백(`text/markdown`).
  - `exportHTML(asPdf)`: async화. `asPdf` 분기(window.open/print) 무변경, `else` 다운로드 분기만 `_writeExportFile`+폴백(`text/html`).

- **index.html**
  - DDL 모달(`ddlOverlay`): dialect select 줄 아래에 옵션 체크박스(FK/INDEX/COMMENT, onchange=generateDDL()) + 엔티티 모드 라디오(전체/선택, onchange=onDDLEntityModeChange()) + `#ddlEntityListWrap`/`#ddlEntityList` 컨테이너 삽입.
  - 메뉴바 내보내기 그룹: "이미지 내보내기 (고해상도 2x)" 항목 추가 → `downloadImage(true,true)`.
  - `imgMenu`: "고해상도 2x" 항목 추가 → `downloadImage(true,true)`.

## 주요 결정 사항

- **PNG 고해상도 방식**: 캔버스 픽셀 크기만 `imgW*dpr × imgH*dpr`로 키우고 `ctx.scale(dpr,dpr)`를 최상단에 적용. 이후 좌표/그리드/엔티티 그리기 로직은 모두 논리 크기(`imgW`/`imgH`) 기준 그대로 유지 → 그리드 잘림 없음, 기존 draw 함수 무수정. (analyst 확인필요 #3 해결)
- **`_writeExportFile`에 Blob 전달**: File System Access API `writable.write()`는 Blob을 허용하므로 PNG Blob을 동일 함수로 저장. 인자명이 `text`지만 기능상 문제 없음. (확인필요 #2)
- **전역 복원 타이밍**: toBlob 콜백은 비동기지만 offCanvas는 인코딩까지 독립 보존되므로, 전역 ctx/vx/vy/scale 복원과 render()를 toBlob 호출 전에 동기로 두어 화면 깨짐 방지. (확인필요 #4)
- **DDL 옵션/선택 상태는 비영속**: localStorage/백업 미연동(계획대로). 모달 열 때마다 기본값(전체 포함/전체 엔티티)으로 초기화.
- `node --check js/export.js` 통과(SYNTAX OK).

## 미완료 항목

- 없음. 계획의 모든 항목 구현 완료.
