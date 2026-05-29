## 요청 요약
DDL 생성 모달(`ddlOverlay`)을 좌우 2단 레이아웃으로 재구성한다.
- 좌측 패널: 엔티티 목록 (기본 전체 체크). 항상 표시.
- 우측 패널: Dialect 선택, FK/INDEX/COMMENT 토글, DDL 미리보기(`ddlContent`), 복사 버튼.
- 모달 너비 680px → 약 960px.
- 전체/선택 라디오 버튼 제거. 체크된 엔티티만 DDL에 반영.

## 탐색한 파일
- `index.html` (478~504행): `ddlOverlay` 모달 HTML 전체 구조 파악.
- `js/export.js` (387~437행): `openDDLModal`, `closeDDLModal`, `renderDDLEntityList`, `onDDLEntityModeChange` 함수 파악.
- `js/export.js` (698~711행): `generateDDL` 함수 — 엔티티 필터 로직 파악.
- `js/export.js` (61행): `_ddlEntityIds` 전역 Set 선언 위치 확인.

## 영향 분석
- **단축키 변경**: 없음.
- **새 localStorage 키**: 없음.
- **새 데이터 배열/상태 변수**: 없음. 기존 `_ddlEntityIds`(Set) 그대로 사용.
- **유지 ID**: `#ddlEntityList`, `#ddlEntityListWrap`, `#ddlOptFK`, `#ddlOptIndex`, `#ddlOptComment`, `#ddlContent`, `#ddlDialect`, `#ddlOverlay` 모두 유지.
- **제거 요소**: `input[name="ddlEntMode"]` 라디오 2개, `onDDLEntityModeChange()` 함수.
- **핵심 파급 효과 (확인 필요 → 반드시 반영)**: `generateDDL`(705~707행)은 현재 `mode === 'sel'`일 때만 `_ddlEntityIds`로 필터한다. 라디오를 제거하면 `mode`가 항상 `'all'`로 떨어져 체크박스가 무시된다. **`generateDDL`을 항상 `_ddlEntityIds` 기준으로 필터하도록 수정해야 한다.** (요청서엔 export.js 3개 함수만 언급되었으나 generateDDL 수정이 필수다.)
- `_ddlEntityIds` 초기화는 `openDDLModal`에서 `new Set(ENTITIES.map(e=>e.id))`로 이미 전체 체크 상태를 만든다 → 유지.

## 구현 계획

### 파일: index.html
- **위치**: 479~503행 (`ddlOverlay` 내부 `.modal` div 전체).
- **변경 내용**: 모달 폭을 960px로 변경하고 내부를 2단 flex로 재구성. 라디오 제거. 좌측 패널에 `ddlEntityListWrap`/`ddlEntityList` 이동(인라인 `display:none` 제거하여 항상 표시), 우측 패널에 dialect/옵션/미리보기/복사 배치. 교체안:

```html
<div class="modal-overlay" id="ddlOverlay" onmousedown="overlayClose(event,'ddlOverlay')">
  <div class="modal" style="width:960px;max-height:80vh" onmousedown.stop>
    <h3>DDL 생성 (물리 모델 기준)</h3>
    <div style="display:flex;gap:16px;align-items:stretch">
      <!-- 좌측: 엔티티 목록 -->
      <div id="ddlEntityListWrap" style="width:240px;flex-shrink:0;display:flex;flex-direction:column">
        <div style="font-size:13px;color:#cdd6f4;margin-bottom:8px">엔티티 (체크된 항목만 생성)</div>
        <div id="ddlEntityList" style="display:flex;flex-direction:column;gap:5px;flex:1;overflow:auto;padding:8px;background:#181825;border:1px solid #313244;border-radius:8px;max-height:60vh"></div>
      </div>
      <!-- 우측: 옵션 + 미리보기 -->
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:8px">
          <select class="form-select" id="ddlDialect" style="width:160px" onchange="generateDDL(this.value)">
            <option value="mysql">MySQL / MariaDB</option>
            <option value="postgresql">PostgreSQL</option>
            <option value="oracle">Oracle</option>
            <option value="mssql">SQL Server</option>
          </select>
          <button class="btn" onclick="copyDDL()">&#x1F4CB; 복사</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;font-size:13px;color:#cdd6f4">
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="ddlOptFK" checked onchange="generateDDL()" style="accent-color:var(--ac,#89b4fa)"> FK 포함</label>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="ddlOptIndex" checked onchange="generateDDL()" style="accent-color:var(--ac,#89b4fa)"> INDEX 포함</label>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="ddlOptComment" checked onchange="generateDDL()" style="accent-color:var(--ac,#89b4fa)"> COMMENT 포함</label>
        </div>
        <pre id="ddlContent" style="background:#181825;border:1px solid #313244;border-radius:8px;padding:14px;color:#a6e3a1;font-family:Consolas,monospace;font-size:12px;overflow:auto;flex:1;max-height:60vh;white-space:pre;line-height:1.6"></pre>
      </div>
    </div>
    <div class="modal-actions"><button class="btn-cancel-m" onclick="closeDDLModal()">닫기</button></div>
  </div>
</div>
```
- **이유**: 2단 flex로 좌측 목록 고정폭(240px), 우측 가변폭. `ddlEntityListWrap`의 `display:none` 제거로 항상 표시. 라디오/구분선 제거.

### 파일: js/export.js
#### (1) openDDLModal — 392~395행 제거
- **위치**: `openDDLModal` 함수 본문.
- **변경 내용**: 라디오 초기화 및 wrap 숨김 코드 제거 후 항상 목록 렌더하도록 변경.
```js
function openDDLModal() {
  ['ddlOptFK', 'ddlOptIndex', 'ddlOptComment'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = true;
  });
  _ddlEntityIds = new Set(ENTITIES.map(e => e.id)); // 기본 전체 체크
  renderDDLEntityList();                            // 좌측 패널 항상 렌더
  generateDDL(document.getElementById('ddlDialect').value);
  document.getElementById('ddlOverlay').classList.add('active');
}
```
- **이유**: 라디오(`allRadio`)와 `wrap.style.display='none'` 제거. 목록을 항상 렌더.

#### (2) onDDLEntityModeChange — 425~437행 전체 삭제
- **위치**: 함수 정의 + index.html 내 호출부(라디오 onchange)는 위 HTML 교체로 이미 제거됨.
- **변경 내용**: `onDDLEntityModeChange` 함수 완전 삭제.
- **이유**: 모드 개념 제거. 호출처 없음.

#### (3) renderDDLEntityList — 403~423행 (수정 최소)
- **위치**: `renderDDLEntityList` 함수.
- **변경 내용**: 로직 변경 불필요. 기존 그대로 동작(체크박스 toggle → `_ddlEntityIds` 갱신 → `generateDDL()`). 함수 내부는 유지.
- **이유**: ID 유지 방침에 따라 그대로 재사용.

#### (4) generateDDL — 705~707행 (필수 수정)
- **위치**: `generateDDL` 함수 내 mode 분기.
- **변경 내용**: mode 판별 제거하고 항상 `_ddlEntityIds`로 필터.
```js
// 기존
const mode = document.querySelector('input[name="ddlEntMode"]:checked')?.value || 'all';
let target = ENTITIES;
if (mode === 'sel') target = ENTITIES.filter(e => _ddlEntityIds.has(e.id));
// 변경
let target = ENTITIES.filter(e => _ddlEntityIds.has(e.id));
```
- **이유**: 라디오 제거 후 체크된 엔티티만 반영하려면 항상 `_ddlEntityIds` 필터가 필요. 이 수정 없으면 좌측 체크박스가 DDL에 반영되지 않음.

## integration-checker 주의 사항
- `generateDDL`의 `_ddlEntityIds` 필터 전환이 누락되면 체크박스가 무동작한다 → 반드시 확인.
- `onDDLEntityModeChange` 호출부가 HTML 외 다른 곳에 없는지 재확인 (현재 grep상 index.html 라디오 onchange만 존재 → HTML 교체로 해소).
- 모달 폭 960px가 좁은 화면에서 넘치지 않는지 확인 필요 (`max-width` 또는 반응형은 요청 범위 밖, 필요 시 확인).
