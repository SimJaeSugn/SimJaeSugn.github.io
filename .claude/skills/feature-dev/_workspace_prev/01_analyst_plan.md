# 01 Analyst Plan — DDL 옵션 UI / 내보내기 폴더 통일 / PNG 고해상도

## 요청 요약

1. **기능 1 — DDL 모달 옵션·엔티티 선택 UI**: `buildDDL(dialect, entities, opts)`는 이미 `opts.includeFK/includeIndex/includeComment`와 `entities` 인자를 지원하나, `generateDDL(dialect)`는 항상 `ENTITIES` 전체 + 모든 옵션 true로만 호출한다. DDL 모달(`ddlOverlay`)에 FK/INDEX/COMMENT 토글 체크박스 + 엔티티 전체/선택 UI를 추가하고, 변경 시 미리보기를 실시간 갱신한다.
2. **기능 2 — SVG/Markdown/HTML 내보내기 폴더 통일**: `downloadSVG`, `exportMarkdown`, `exportHTML`을 async로 바꾸고 `<a download>` 대신 `_writeExportFile` + 폴백 구조로 통일한다.
3. **기능 3 — PNG `toBlob` + 고해상도(2x)**: `downloadImage(includeSections)`을 async + `toBlob`으로 전환, 2x 스케일 옵션 추가, `_writeExportFile` 연동, 실패 시 토스트.

## 탐색한 파일

- `js/export.js` (전체) — 내보내기 전 함수의 현재 구현 패턴 파악
  - `_writeExportFile(filename, text)` (L28-42): 폴더 저장 핵심. 텍스트 기반(`writable.write(text)`). Blob도 그대로 write 가능.
  - `_fallbackDownload(filename, text)` (L50-57): **type이 `application/json`으로 하드코딩** — SVG/MD/HTML/PNG에 그대로 쓰면 MIME이 부정확. 확인 필요.
  - `doExportSelectedDiag` (L101-121), `_doExportWithGroups` (L129-173): `_writeExportFile` 성공 시 토스트, 실패 시 `_fallbackDownload` 호출하는 표준 패턴. **이 패턴을 그대로 따른다.**
  - `openExportDiagSelectModal` (L67-95): 체크박스 목록 생성 + Set 기반 선택 관리 패턴. **기능 1 엔티티 선택 UI의 참고 패턴.**
  - `downloadImage` (L176-241): `scale=1` 고정, `offCanvas.toDataURL('image/png')` → `<a>` 즉시 다운로드. ctx/vx/vy/scale 전역을 임시 교체 후 render()로 복원하는 구조.
  - `downloadSVG` (L244-378): 끝부분(L373-377)에서 Blob + `<a download>`.
  - `openDDLModal/closeDDLModal/copyDDL/generateDDL` (L381-400, 646-649): DDL 모달 제어. `generateDDL`이 미리보기 textContent 설정.
  - `exportMarkdown` (L652-692): 끝부분 Blob + `<a download>`.
  - `exportHTML(asPdf)` (L696-788): `asPdf=true`는 `window.open`/print (변경 없음), `else` 분기(L780-787)만 Blob + `<a download>`.
- `index.html`
  - 메뉴바 내보내기 그룹 (L28-38): DDL 생성/이미지/SVG/MD/HTML/PDF 항목.
  - `imgMenu` (L466-472): 섹션 포함/제외/SVG 빠른 메뉴.
  - DDL 모달 `ddlOverlay` (L475-490): dialect select + 복사 버튼 + `<pre id="ddlContent">` + 닫기.

## 영향 분석

- **단축키 변경: 없음** — 새 단축키 추가 없음. (integration-checker가 `#shortcutsTableBody`·shortcuts.js 동기화 점검 불필요. 단 기능 3에서 메뉴 항목만 추가됨)
- **새 localStorage 키: 없음** — DDL 옵션/엔티티 선택은 모달 세션 상태로만 유지(영속 저장 불필요). PNG 고해상도 옵션도 영속 저장 불필요.
- **새 데이터 배열/상태 변수: 있음 (모듈 스코프, 비영속)**
  - `_ddlEntityIds` (Set) — DDL 엔티티 선택 상태. `_exportDiagIds` 패턴 모방. **localStorage·백업 비포함이므로 export.js/import.js 백업 통합 불필요.**
- **기타 파급 효과**:
  - `_fallbackDownload`의 type이 `application/json` 하드코딩 → SVG/MD/HTML/PNG 폴백 시 MIME 부정확. **`type` 인자를 추가(기본값 `application/json`으로 하위호환)하는 것을 권장.** Blob([text]) 대신 text가 Blob일 수도 있게 처리 필요(PNG).
  - `_writeExportFile`은 `writable.write(text)` — text가 string이든 Blob이든 File System Access API가 처리 가능하므로 PNG Blob도 동일 함수 사용 가능. **확인 필요: 인자명만 text라 혼동 가능 — Blob 전달 시 정상 동작 확인.**
  - PNG는 `_fallbackDownload`가 string Blob 가정이라 그대로 못 씀 → PNG 전용 폴백(`URL.createObjectURL(blob)` + `<a>`) 인라인 처리 또는 `_fallbackDownload`를 Blob 허용으로 확장. **확인 필요.**
  - `downloadImage`/`downloadSVG`가 async가 되면 `imgMenu`·메뉴바 onclick은 await 없이 호출해도 동작(파이어앤포겟). 단 함수 시작부 `imgMenu.style.display='none'`은 유지.
  - 기능 1에서 dialect select의 `onchange="generateDDL(this.value)"`는 유지하되, 옵션/엔티티 변경도 동일 갱신 함수를 호출하도록 통일 필요.

## 구현 계획

### 파일: js/export.js

#### (공통) `_fallbackDownload` 확장 — L50-57
- 변경: 시그니처를 `_fallbackDownload(filename, data, type='application/json')`으로 변경. `const blob = data instanceof Blob ? data : new Blob([data], { type });`로 처리.
- 이유: SVG(`image/svg+xml`), MD(`text/markdown`), HTML(`text/html`), PNG(Blob 직접) 폴백을 단일 함수로 처리. 기본값 유지로 기존 JSON 호출부 무수정.

#### 기능 1 — DDL 옵션·엔티티 선택

- **`generateDDL(dialect)` 재작성 — L646-649**
  - 변경: 모달 UI의 체크박스 상태(`#ddlOptFK/#ddlOptIndex/#ddlOptComment` checked)와 엔티티 모드(전체/선택)를 읽어 `opts`와 대상 `entities`를 구성한 뒤 `buildDDL(dialect, targetEntities, opts)` 호출. 선택 모드면 `ENTITIES.filter(e => _ddlEntityIds.has(e.id))`.
  - dialect 인자 누락 시 `document.getElementById('ddlDialect').value`로 폴백(옵션 체크박스 onchange에서 인자 없이 호출 대비).
  - 이유: 기존 `buildDDL` 유연성을 UI와 연결.
- **신규 모듈 스코프 변수**: `let _ddlEntityIds = new Set();` (export.js 상단, `_exportDiagIds` 인근)
- **신규 함수 `renderDDLEntityList()`**: `openExportDiagSelectModal` 패턴을 모방해 `#ddlEntityList`에 `ENTITIES` 체크박스 생성. 각 체크박스 change → Set 갱신 + `generateDDL()` 재호출. 기본 전체 선택.
- **신규 함수 `onDDLEntityModeChange()`**: 전체/선택 라디오 변경 시 `#ddlEntityListWrap` 표시/숨김 토글 + (선택 모드 진입 시) `renderDDLEntityList()` + `generateDDL()`.
- **`openDDLModal()` 수정 — L381-384**: 모달 열 때 옵션 체크박스 3개 모두 checked=true, 엔티티 모드 '전체'로 초기화, `_ddlEntityIds = new Set(ENTITIES.map(e=>e.id))`, 엔티티 목록 영역 숨김 후 `generateDDL(dialect)` 호출.

#### 기능 2 — SVG/MD/HTML 폴더 통일

- **`downloadSVG()` async화 — L244-378**
  - `function downloadSVG()` → `async function downloadSVG()`.
  - 끝부분 L373-377의 Blob+`<a>` 블록을 다음으로 교체:
    ```
    const filename = (getActiveDiagram()?.name || 'erd') + '.svg';
    const saved = await _writeExportFile(filename, svg);
    if (saved) showToast(`💾 ${filename} 저장 완료`);
    else _fallbackDownload(filename, svg, 'image/svg+xml');
    ```
- **`exportMarkdown()` async화 — L652-692**
  - `async function exportMarkdown()`. 끝부분 L684-691 교체:
    ```
    const text = lines.join('\n');
    const filename = (diagName || 'erd') + '.md';
    const saved = await _writeExportFile(filename, text);
    if (saved) showToast(`💾 ${filename} 저장 완료`);
    else { _fallbackDownload(filename, text, 'text/markdown'); showToast('Markdown 파일이 저장되었습니다.'); }
    ```
- **`exportHTML(asPdf)` async화 — L696-788**
  - `async function exportHTML(asPdf = false)`. `asPdf` 분기(L773-779)는 그대로 유지(window.open/print). `else` 분기(L780-787)만 교체:
    ```
    const filename = (diagName||'erd') + '.html';
    const saved = await _writeExportFile(filename, html);
    if (saved) showToast(`💾 ${filename} 저장 완료`);
    else { _fallbackDownload(filename, html, 'text/html'); showToast('HTML 문서가 저장되었습니다.'); }
    ```
  - `exportPDF()` (L695)는 변경 없음(여전히 `exportHTML(true)`; await 불필요하나 무방).

#### 기능 3 — PNG toBlob + 고해상도

- **`downloadImage(includeSections, hiDPI)` async화 — L176-241**
  - 시그니처: `async function downloadImage(includeSections = true, hiDPI = false)`.
  - `const scale2 = hiDPI ? 2 : 1;` 도입. offCanvas 크기를 `imgW*scale2 × imgH*scale2`로 설정, 렌더링 시 전역 `scale`을 `scale2`로 설정(기존 `vx/vy`는 padding 기반이므로 hiDPI에서는 `vx=(padding-minX)*scale2` 형태로 스케일 반영 필요 — **확인 필요: 좌표/그리드 오프셋 계산이 scale에 곱해지는지 검증**). 단순·안전한 방법으로는 `ctx.scale(scale2, scale2)` 한 번 적용 후 기존 vx/vy/scale=1 로직 유지(그리드 루프 한계는 `imgW`(논리크기)로 두고 캔버스만 2배). **구현자는 그리드가 잘리지 않도록 lu프 한계를 `offCanvas.width/scale2` 기준으로 유지할 것.**
  - `toDataURL` 즉시 다운로드(L236-240)를 다음으로 교체:
    ```
    const suffix = (includeSections ? '' : '_no_section') + (hiDPI ? '@2x' : '');
    const filename = (getActiveDiagram()?.name || 'erd') + suffix + '.png';
    offCanvas.toBlob(async (blob) => {
      if (!blob) { showToast('❌ 이미지 생성 실패 (다이어그램이 너무 큽니다)'); return; }
      const saved = await _writeExportFile(filename, blob);
      if (saved) showToast(`💾 ${filename} 저장 완료`);
      else _fallbackDownload(filename, blob, 'image/png');
    }, 'image/png');
    ```
  - **중요(확인 필요)**: ctx/vx/vy/scale 전역 복원(L233 `ctx=savedCtx...`)과 `render()`는 `toBlob` 콜백 **이전**(동기 구간)에서 수행해야 화면이 깨지지 않음. toBlob은 offCanvas에 대해 비동기로 인코딩하므로, 전역 복원은 콜백 밖(현재 위치)에 두고 toBlob 호출만 그 뒤에 배치한다.

### 파일: index.html

#### 기능 1 — DDL 모달 옵션·엔티티 UI (L478-486 영역 보강)
- L478-486 `<div style="display:flex...">` (dialect select + 복사 버튼) **아래**, `<pre id="ddlContent">`(L487) **위**에 옵션/엔티티 선택 영역 삽입:
  - 옵션 체크박스 3개: `#ddlOptFK`, `#ddlOptIndex`, `#ddlOptComment` (checked, `onchange="generateDDL()"`).
  - 엔티티 모드 라디오: `name="ddlEntMode"` 값 `all`/`sel`, `onchange="onDDLEntityModeChange()"`. 기본 `all` checked.
  - `<div id="ddlEntityListWrap" style="display:none;...">` 안에 `<div id="ddlEntityList">` (스크롤 가능한 체크박스 컨테이너). `openExportDiagSelectModal`의 label/checkbox 인라인 스타일 재사용.
- 이유: 기존 모달 폭 680px 내에서 옵션·선택 UI 수용. `generateDDL()` 인자 없이 호출 시 dialect를 DOM에서 읽도록 export.js에서 처리.

#### 기능 3 — PNG 고해상도 메뉴 항목
- **메뉴바**(L32-33 사이/아래): 기존 두 PNG 항목 유지하고, 고해상도 항목 2개 추가하거나, 간결하게 한 항목 추가:
  - 예: `<div class="mb-item" onclick="mbClose();downloadImage(true,true)"><span class="mb-ico">🖼</span><span class="mb-text">이미지 내보내기 (고해상도 2x)</span></div>` 를 L33 다음에 삽입.
- **`imgMenu`**(L466-472): SVG 항목(L471) 위 또는 아래에 고해상도 항목 추가:
  - `<div class="img-menu-sep"></div>` + `<div class="img-menu-item" onclick="downloadImage(true,true)">🖼&nbsp; 고해상도 2x</div>`
- 이유: 기존 PNG 호출부와 시그니처 하위호환(`downloadImage(true)` 그대로 동작), 신규 인자 `hiDPI=true`로 고해상도 호출.

## 확인 필요 항목 (integration-checker / implementer 주의)

1. `_fallbackDownload` 시그니처 확장 시 기존 JSON 호출부(`doExportSelectedDiag`, `_doExportWithGroups`)가 2-인자 호출이므로 기본값 `application/json` 유지로 무수정 보장.
2. `_writeExportFile`에 Blob 전달 시 `writable.write(blob)` 정상 동작(File System Access API는 Blob 허용) — 동작 검증 권장.
3. PNG 고해상도 시 그리드/좌표 스케일 정합성 — 캔버스만 2배로 키우고 `ctx.scale(2,2)` 적용, 그리드 루프 한계를 논리 크기 기준으로 유지하여 잘림 방지.
4. `downloadImage` 전역(ctx/vx/vy/scale) 복원은 toBlob 콜백 이전에 동기적으로 수행.
5. 단축키·localStorage·백업 통합 영향 없음 — 신규 영속 키/배열 없음. integration-checker의 백업 통합 점검은 본 작업에서 추가 작업 불필요(확인만).
