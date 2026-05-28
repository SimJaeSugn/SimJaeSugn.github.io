# 01_analyst_plan.md — Profile Manager 2단 레이아웃 개편

## 요청 요약

`js/profile_manager.js`의 DB 접속 프로파일 관리 모달을 현재 단일 컬럼 구조(520px)에서
좌우 2단 분할 구조(800~900px)로 전면 개편한다.

- 좌측: 프로파일 목록 + "새 프로파일 추가" 버튼
- 우측: 기본 안내 / 선택된 프로파일 상세(읽기전용) / 추가·편집 폼 (3-state 패널)
- 편집 폼은 기존 인라인(프로파일 행 아래 펼침) 방식에서 우측 패널로 이동
- Oracle Instant Client 안내 섹션은 우측 패널 폼에 포함

---

## 탐색한 파일

| 파일 | 탐색 이유 |
|------|----------|
| `js/profile_manager.js` | 전체 구조, 함수들, 렌더링 패턴 파악 |
| `css/modal.css` | `.modal`, `.form-row`, `.form-label`, `.form-input`, `.btn-save-m`, `.btn-cancel-m`, `.btn-del-m`, `.form-err`, `.modal-actions` 클래스 정의 확인; `.sc-grid`(2단 grid 패턴) 존재 확인 |
| `css/toolbar.css` | `.btn`, `.btn-primary` 클래스 정의 확인 |
| `css/components.css` | `theme-grid`(grid 2단 패턴), 기타 flex 패턴 확인 |
| `css/base.css` | CSS 변수명(--bg-surface, --bd2, --ac, --tx-sub 등) 확인 |
| `js/db_connect.js` | `MW_URL`, `_mwPing`, `_showMwNotRunning` 의존 관계 확인 |
| `index.html` | `openProfileManagerModal()` 호출 위치 확인 (메뉴바, reverse_engineer.js) |

---

## 영향 분석

- **단축키 변경**: 없음
- **새 localStorage 키**: 없음
- **새 데이터 배열/상태 변수**: 있음
  - `_pmSelectedName` — 좌측 목록에서 현재 선택된 프로파일 이름 (null | string)
  - 기존 `_pmEditingName` 유지
- **CSS 추가**: `css/modal.css`에 `.pm-layout`, `.pm-left`, `.pm-right`, `.pm-profile-item`, `.pm-profile-item.active`, `.pm-detail-*`, `.pm-empty-hint` 클래스 추가 필요
- **기타 파급 효과**:
  - `_renderProfileManagerModal()` — 모달 골격 HTML 전면 재작성 (너비, 2단 구조)
  - `_renderProfileList()` — 좌측 패널용으로 재작성; 편집 인라인 폼 제거, 클릭 시 우측 패널 갱신
  - `_openAddProfileForm()` / `_closeAddProfileForm()` — 우측 패널 상태 전환으로 변경
  - `_openEditProfileForm()` — 우측 패널에 폼을 렌더링하도록 변경 (DOM id 기반 inplace 방식 폐기)
  - `_closeEditForms()` — 우측 패널 초기화로 변경
  - `_submitAddProfile()` / `_submitEditProfile()` — element 탐색 방식 변경 (우측 패널 고정 ID로)
  - `_refreshProfileList()` — 우측 패널 상태 유지 여부 판단 필요 (선택된 프로파일이 여전히 존재하면 상세 유지, 삭제된 경우 기본 안내로 초기화)
  - `index.html` 변경 없음 (호출 인터페이스 동일)

---

## 현재 코드 패턴 요약 (implementer 참고)

### 상태 변수
```js
let _pmEditingName = null;   // 현재 편집 중인 프로파일 이름
```

### 기존 모달 골격 (변경 전)
```
modal(520px, flex-column)
  └─ h3
  └─ #pmProfileList  (overflow-y:auto, flex:1)
        └─ 각 프로파일 행 + pmEditForm_XXX (인라인 펼침)
  └─ hr
  └─ #pmAddToggleBtn
  └─ #pmAddForm (display:none)
  └─ .modal-actions (닫기 버튼)
```

### 기존 렌더 패턴
- `_renderProfileManagerModal(data)`: overlay가 없으면 innerHTML로 전체 골격 생성 후 `_renderProfileList(data)` 호출
- `_renderProfileList(data)`: `#pmProfileList` 내부 innerHTML 교체
- 편집 폼: `_renderProfileList()`에서 각 프로파일 행과 함께 `pmEditForm_${eid}` DOM을 한꺼번에 생성, `_openEditProfileForm()`이 해당 DOM을 찾아 값 채우고 `display:block`
- 추가 폼: `#pmAddForm`은 모달 골격에 정적으로 포함, `display` 토글로 제어

### 기존 CSS 변수 (재사용)
`--bg-base`, `--bg-surface`, `--bg-surface2`, `--bd`, `--bd2`, `--ac`, `--ac-o`, `--ac-r`, `--tx-main`, `--tx-sub`, `--tx-muted`, `--border`

### 기존 2단 grid 패턴 (`.sc-grid` in modal.css)
```css
.sc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
```

---

## 구현 계획

### 파일 1: `css/modal.css`

**위치**: 파일 말미 `.bk-footer` 블록 이후에 추가

**변경 내용: `.pm-*` 전용 클래스 추가**

```css
/* ── Profile Manager 2단 레이아웃 ─────────────────────────── */
.pm-layout {
  display: flex; gap: 0; overflow: hidden;
  flex: 1; min-height: 0;
}
.pm-left {
  width: 280px; flex-shrink: 0;
  border-right: 1px solid var(--bd);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.pm-right {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  min-width: 0;
}
.pm-list-body {
  flex: 1; overflow-y: auto; padding: 8px 0;
}
.pm-list-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--bd);
  flex-shrink: 0;
}
.pm-profile-item {
  display: flex; flex-direction: column;
  padding: 9px 14px; cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s, border-color 0.1s;
  position: relative;
}
.pm-profile-item:hover { background: var(--bg-surface2); }
.pm-profile-item.pm-selected {
  background: var(--bg-surface);
  border-left-color: var(--ac);
}
.pm-profile-item .pm-item-name {
  font-size: 13px; font-weight: 500; color: var(--tx-main);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pm-profile-item .pm-item-info {
  font-size: 11px; color: var(--tx-sub); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pm-item-badges {
  display: flex; align-items: center; gap: 5px; margin-bottom: 3px;
}
.pm-active-badge {
  font-size: 10px; color: var(--green, #22c55e); font-weight: 600;
  background: rgba(34,197,94,0.12); padding: 1px 6px;
  border-radius: 8px; flex-shrink: 0;
}
.pm-item-actions {
  display: flex; gap: 4px; margin-top: 6px;
}
.pm-item-actions .btn {
  font-size: 11px; padding: 2px 8px;
}
.pm-empty-hint {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--tx-muted); font-size: 13px; text-align: center;
  gap: 8px; padding: 32px 16px;
}
.pm-empty-hint .pm-hint-ico { font-size: 32px; opacity: 0.4; }
.pm-detail-section { margin-bottom: 18px; }
.pm-detail-label {
  font-size: 11px; color: var(--tx-sub); margin-bottom: 4px; display: block;
}
.pm-detail-value {
  font-size: 13px; color: var(--tx-main);
  background: var(--bg-surface); border: 1px solid var(--bd2);
  border-radius: 6px; padding: 7px 11px;
}
.pm-section-title {
  font-size: 13px; font-weight: 600; color: var(--ac);
  margin: 0 0 14px; padding-bottom: 8px;
  border-bottom: 1px solid var(--bd);
}
.pm-right::-webkit-scrollbar { width: 5px; }
.pm-right::-webkit-scrollbar-track { background: transparent; }
.pm-right::-webkit-scrollbar-thumb { background: var(--bd2); border-radius: 3px; }
.pm-list-body::-webkit-scrollbar { width: 4px; }
.pm-list-body::-webkit-scrollbar-track { background: transparent; }
.pm-list-body::-webkit-scrollbar-thumb { background: var(--bd2); border-radius: 3px; }
```

**이유**: 기존 `.modal`, `.form-row` 등 공용 클래스는 그대로 재사용하고, 2단 레이아웃 전용 구조 클래스만 신규 추가하여 다른 모달에 영향 없이 격리한다.

---

### 파일 2: `js/profile_manager.js`

#### 2-1. 상태 변수 추가

**위치**: `let _pmEditingName = null;` (129번 줄) 아래

```js
let _pmSelectedName = null;  // 좌측 목록에서 선택된 프로파일 이름
```

#### 2-2. `_renderProfileManagerModal(data)` 전면 재작성

**위치**: 244번 줄 함수 전체

**변경 내용**: 모달 골격 HTML을 2단 구조로 교체

```js
function _renderProfileManagerModal(data) {
  let overlay = document.getElementById('pmOverlay');
  if (overlay) {
    _renderProfileList(data);
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'pmOverlay';
  overlay.setAttribute('onmousedown', "overlayClose(event,'pmOverlay')");
  overlay.innerHTML = `
    <div class="modal" style="width:min(880px,96vw);max-height:82vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onmousedown.stop>
      <div style="padding:20px 24px 14px;border-bottom:1px solid var(--bd);flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
        <h3 style="margin:0">DB 접속 프로파일 관리</h3>
        <button class="btn" style="font-size:18px;padding:2px 8px;line-height:1"
          onclick="closeProfileManagerModal()">×</button>
      </div>
      <div class="pm-layout">
        <div class="pm-left">
          <div class="pm-list-body" id="pmProfileList"></div>
          <div class="pm-list-footer">
            <button id="pmAddToggleBtn" class="btn" style="width:100%;text-align:center"
              onclick="_openAddProfileForm()">+ 새 프로파일 추가</button>
          </div>
        </div>
        <div class="pm-right" id="pmRightPanel">
          <!-- 상태에 따라 _renderRightPanel()이 내용을 교체 -->
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  _renderProfileList(data);
}
```

**이유**:
- 너비를 `min(880px, 96vw)`로 지정하여 작은 화면에서도 깨지지 않게 함
- 헤더에 닫기 버튼(×) 추가 — 기존 하단 modal-actions의 닫기 버튼 대체
- padding을 `0`으로 설정하고 내부 영역에서 개별 padding 적용하여 레이아웃 정밀 제어
- `#pmAddForm`은 더 이상 골격에 포함하지 않고 `#pmRightPanel`에 동적 렌더링

#### 2-3. `_renderProfileList(data)` 재작성

**위치**: 333번 줄 함수 전체

**변경 내용**: 인라인 편집 폼 제거, 클릭 이벤트로 우측 패널 연동

```js
function _renderProfileList(data) {
  const el = document.getElementById('pmProfileList');
  if (!el) return;

  const { active, profiles } = data;

  if (!profiles || profiles.length === 0) {
    el.innerHTML = '<p style="color:var(--tx-sub);font-size:12px;padding:16px 14px">저장된 프로파일이 없습니다.</p>';
    _renderRightPanel('hint');
    return;
  }

  el.innerHTML = profiles.map(p => {
    const isActive = p.name === active;
    const isOnly   = profiles.length === 1;
    const eName    = _pmEsc(p.name);

    const activeBadge = isActive
      ? `<span class="pm-active-badge">활성</span>` : '';

    const switchBtn = `<button class="btn" style="font-size:11px;padding:2px 8px"
      ${isActive ? 'disabled' : `onclick="event.stopPropagation();_activateProfile('${eName}')"`}>전환</button>`;

    const editArgs = [
      `'${eName}'`,
      `'${_pmEsc(p.dbType)}'`,
      `'${_pmEsc(p.host)}'`,
      p.port || 'null',
      `'${_pmEsc(p.database)}'`,
      `'${_pmEsc(p.username)}'`,
      `'${_pmEsc(p.clientLibDir || '')}'`
    ].join(',');
    const editBtn = `<button class="btn" style="font-size:11px;padding:2px 8px"
      onclick="event.stopPropagation();_openEditProfileForm(${editArgs})">편집</button>`;

    const deleteBtn = `<button class="btn-del-m" style="font-size:11px;padding:2px 6px;border-radius:5px"
      ${(isActive || isOnly) ? 'disabled' : `onclick="event.stopPropagation();_deleteProfile('${eName}')"`}>삭제</button>`;

    const isSelected = p.name === _pmSelectedName;

    return `
      <div class="pm-profile-item${isSelected ? ' pm-selected' : ''}"
           onclick="_pmSelectProfile('${eName}')">
        <div class="pm-item-badges">${activeBadge}</div>
        <div class="pm-item-name">${eName}</div>
        <div class="pm-item-info">${_pmEsc(p.dbType)} · ${_pmEsc(p.host)}:${p.port || '-'}</div>
        <div class="pm-item-actions">
          ${switchBtn}${editBtn}${deleteBtn}
        </div>
      </div>`;
  }).join('');

  // 우측 패널 상태 유지: 선택된 프로파일이 여전히 존재하면 상세 유지
  const stillExists = profiles.some(p => p.name === _pmSelectedName);
  if (_pmEditingName) {
    // 편집 중이면 우측 패널은 편집 폼 상태 그대로 유지 (재렌더 불필요)
  } else if (stillExists && _pmSelectedName) {
    const selProfile = profiles.find(p => p.name === _pmSelectedName);
    _renderRightPanel('detail', selProfile);
  } else {
    _pmSelectedName = null;
    _renderRightPanel('hint');
  }
}
```

**이유**: 행 클릭 시 `_pmSelectProfile()`를 호출하여 우측 패널을 상세 뷰로 전환. 버튼 클릭 이벤트는 `event.stopPropagation()`으로 행 선택과 분리.

#### 2-4. 새 함수 `_pmSelectProfile(name)` 추가

**위치**: `_renderProfileList()` 직후

```js
function _pmSelectProfile(name) {
  _pmSelectedName = name;
  // 선택 표시 갱신
  document.querySelectorAll('.pm-profile-item').forEach(el => {
    const n = el.querySelector('.pm-item-name')?.textContent;
    el.classList.toggle('pm-selected', n === name);
  });
  // 우측 패널: 상세 뷰로 전환
  // 프로파일 데이터를 다시 fetch하거나 캐시에서 가져와야 하므로 _loadProfiles 재호출
  _loadProfiles().then(data => {
    const p = data.profiles.find(p => p.name === name);
    if (p) _renderRightPanel('detail', p);
  });
}
```

**이유**: 목록 재렌더 없이 선택 상태만 변경하고, 우측 패널만 업데이트하여 성능 최적화.

#### 2-5. 새 함수 `_renderRightPanel(mode, data)` 추가

**위치**: `_pmSelectProfile()` 직후

`mode` 값: `'hint'` | `'detail'` | `'add'` | `'edit'`

```js
function _renderRightPanel(mode, data) {
  const panel = document.getElementById('pmRightPanel');
  if (!panel) return;

  if (mode === 'hint') {
    panel.innerHTML = `
      <div class="pm-empty-hint">
        <div class="pm-hint-ico">🗄</div>
        <div>프로파일을 선택하면 접속 정보를 확인할 수 있습니다.</div>
        <div style="font-size:12px;color:var(--tx-muted)">좌측 목록에서 항목을 클릭하거나<br>"+ 새 프로파일 추가"를 눌러 시작하세요.</div>
      </div>`;
    return;
  }

  if (mode === 'detail') {
    const p = data;
    panel.innerHTML = `
      <div class="pm-section-title">접속 정보</div>
      <div class="pm-detail-section">
        <span class="pm-detail-label">프로파일 이름</span>
        <div class="pm-detail-value">${_pmEsc(p.name)}</div>
      </div>
      <div class="pm-detail-section">
        <span class="pm-detail-label">DB 종류</span>
        <div class="pm-detail-value">${_pmEsc(p.dbType)}</div>
      </div>
      <div class="pm-detail-section">
        <span class="pm-detail-label">호스트 / 포트</span>
        <div class="pm-detail-value">${_pmEsc(p.host)} : ${p.port || '-'}</div>
      </div>
      <div class="pm-detail-section">
        <span class="pm-detail-label">데이터베이스 (서비스명)</span>
        <div class="pm-detail-value">${_pmEsc(p.database)}</div>
      </div>
      <div class="pm-detail-section">
        <span class="pm-detail-label">사용자명</span>
        <div class="pm-detail-value">${_pmEsc(p.username)}</div>
      </div>
      ${p.clientLibDir ? `
      <div class="pm-detail-section">
        <span class="pm-detail-label">Instant Client 경로</span>
        <div class="pm-detail-value">${_pmEsc(p.clientLibDir)}</div>
      </div>` : ''}`;
    return;
  }

  if (mode === 'add') {
    panel.innerHTML = `
      <div class="pm-section-title">새 프로파일 추가</div>
      <div class="form-row">
        <label class="form-label">프로파일 이름</label>
        <input class="form-input" id="pmAddName" type="text" placeholder="예: 개발 서버">
      </div>
      <div class="form-row">
        <label class="form-label">DB 종류</label>
        <select class="form-input" id="pmAddType"
          onchange="_pmAutoPort('pmAddType','pmAddPort');_pmToggleOracle(this,document.getElementById('pmAddOracleSection'))">
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mssql">SQL Server</option>
          <option value="oracle">Oracle</option>
        </select>
      </div>
      <div class="form-row" style="display:flex;gap:8px">
        <div style="flex:1">
          <label class="form-label">호스트</label>
          <input class="form-input" id="pmAddHost" type="text" placeholder="localhost">
        </div>
        <div style="width:90px">
          <label class="form-label">포트</label>
          <input class="form-input" id="pmAddPort" type="number" placeholder="5432"
            oninput="this.dataset.userEdited='1'">
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">데이터베이스 (서비스명)</label>
        <input class="form-input" id="pmAddDatabase" type="text" placeholder="mydb">
      </div>
      <div class="form-row">
        <label class="form-label">사용자명</label>
        <input class="form-input" id="pmAddUsername" type="text" placeholder="postgres">
      </div>
      <div class="form-row">
        <label class="form-label">비밀번호</label>
        <input class="form-input" id="pmAddPassword" type="password" placeholder="••••••••">
      </div>
      <div id="pmAddOracleSection" style="display:none">
        <div class="form-row" style="background:var(--bg-surface);border:1px solid var(--bd2);border-radius:6px;padding:10px 12px;margin-bottom:4px">
          <p style="margin:0 0 6px;font-size:12px;color:var(--tx-sub);line-height:1.6">
            <strong>Oracle Instant Client 안내</strong><br>
            node-oracledb 기본 모드(Thin)는 Oracle DB 12.1 이상만 지원합니다.
            구버전 DB에 연결하려면 Oracle Instant Client를 설치하고 아래에 경로를 입력하세요.<br>
            <a href="https://www.oracle.com/database/technologies/instant-client/downloads.html"
               target="_blank" style="color:var(--ac)">Instant Client 다운로드</a>
          </p>
          <label class="form-label">Instant Client 경로 <span style="color:var(--tx-muted)">(선택)</span></label>
          <input class="form-input" id="pmAddClientLibDir" type="text"
            placeholder="예: C:\\oracle\\instantclient_21_3">
        </div>
      </div>
      <div class="form-err" id="pmAddErr" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn-cancel-m" onclick="_closeAddProfileForm()">취소</button>
        <button class="btn-save-m" id="pmAddSaveBtn" onclick="_submitAddProfile()">저장</button>
      </div>`;
    _pmAutoPort('pmAddType', 'pmAddPort');
    return;
  }

  if (mode === 'edit') {
    const p = data;
    const eName = _pmEsc(p.name);
    panel.innerHTML = `
      <div class="pm-section-title">'${eName}' 편집</div>
      <div class="form-row">
        <label class="form-label">DB 종류</label>
        <select class="form-input" id="pmEditType"
          onchange="_pmToggleOracle(this,document.getElementById('pmEditOracleSection'))">
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mssql">SQL Server</option>
          <option value="oracle">Oracle</option>
        </select>
      </div>
      <div class="form-row" style="display:flex;gap:8px">
        <div style="flex:1">
          <label class="form-label">호스트</label>
          <input class="form-input" id="pmEditHost" type="text">
        </div>
        <div style="width:90px">
          <label class="form-label">포트</label>
          <input class="form-input" id="pmEditPort" type="number">
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">데이터베이스 (서비스명)</label>
        <input class="form-input" id="pmEditDatabase" type="text">
      </div>
      <div class="form-row">
        <label class="form-label">사용자명</label>
        <input class="form-input" id="pmEditUsername" type="text">
      </div>
      <div class="form-row">
        <label class="form-label">비밀번호</label>
        <input class="form-input" id="pmEditPassword" type="password"
          placeholder="변경 시 입력 (미입력 시 유지)">
      </div>
      <div id="pmEditOracleSection" style="display:none">
        <div class="form-row" style="background:var(--bg-surface);border:1px solid var(--bd2);border-radius:6px;padding:10px 12px;margin-bottom:4px">
          <p style="margin:0 0 6px;font-size:12px;color:var(--tx-sub);line-height:1.6">
            <strong>Oracle Instant Client 안내</strong><br>
            node-oracledb 기본 모드(Thin)는 Oracle DB 12.1 이상만 지원합니다.
            구버전 DB에 연결하려면 Oracle Instant Client를 설치하고 아래에 경로를 입력하세요.<br>
            <a href="https://www.oracle.com/database/technologies/instant-client/downloads.html"
               target="_blank" style="color:var(--ac)">Instant Client 다운로드</a>
          </p>
          <label class="form-label">Instant Client 경로 <span style="color:var(--tx-muted)">(선택)</span></label>
          <input class="form-input" id="pmEditClientLibDir" type="text"
            placeholder="예: C:\\oracle\\instantclient_21_3">
        </div>
      </div>
      <div class="form-err" id="pmEditErr" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn-cancel-m" onclick="_closeEditForms()">취소</button>
        <button class="btn-save-m" id="pmEditSaveBtn" onclick="_submitEditProfile('${eName}')">저장</button>
      </div>`;
    // 값 채우기
    document.getElementById('pmEditType').value    = p.dbType || 'postgres';
    document.getElementById('pmEditHost').value    = p.host || '';
    document.getElementById('pmEditPort').value    = p.port || '';
    document.getElementById('pmEditDatabase').value = p.database || '';
    document.getElementById('pmEditUsername').value = p.username || '';
    document.getElementById('pmEditClientLibDir') && (document.getElementById('pmEditClientLibDir').value = p.clientLibDir || '');
    _pmToggleOracle(
      document.getElementById('pmEditType'),
      document.getElementById('pmEditOracleSection')
    );
  }
}
```

**이유**:
- 4가지 상태를 단일 함수로 관리하여 상태 전환 코드를 단순화
- 편집 폼은 고정 ID(`pmEditType`, `pmEditHost` 등)를 사용하므로 `_submitEditProfile()`의 DOM 탐색이 단순해짐
- Oracle 섹션은 추가/편집 모두 우측 패널 폼에 포함

#### 2-6. `_openAddProfileForm()` 재작성

**위치**: 107번 줄 함수 전체

```js
function _openAddProfileForm() {
  _pmEditingName = null;
  _renderRightPanel('add');
  document.getElementById('pmAddToggleBtn').style.display = 'none';
  _pmErrClear('pmAddErr');
}
```

#### 2-7. `_closeAddProfileForm()` 재작성

**위치**: 115번 줄 함수 전체

```js
function _closeAddProfileForm() {
  _pmEditingName = null;
  document.getElementById('pmAddToggleBtn').style.display = '';
  if (_pmSelectedName) {
    _loadProfiles().then(data => {
      const p = data.profiles.find(p => p.name === _pmSelectedName);
      _renderRightPanel(p ? 'detail' : 'hint', p);
    });
  } else {
    _renderRightPanel('hint');
  }
}
```

#### 2-8. `_openEditProfileForm()` 재작성

**위치**: 131번 줄 함수 전체

기존: 인라인 `pmEditForm_${eid}` DOM을 `display:block`하는 방식
신규: `_renderRightPanel('edit', profileObj)`를 호출하는 방식

```js
function _openEditProfileForm(name, dbType, host, port, database, username, clientLibDir) {
  _pmEditingName = name;
  _pmSelectedName = name;  // 선택 상태도 동기화
  // 좌측 목록 선택 표시 갱신
  document.querySelectorAll('.pm-profile-item').forEach(el => {
    const n = el.querySelector('.pm-item-name')?.textContent;
    el.classList.toggle('pm-selected', n === name);
  });
  document.getElementById('pmAddToggleBtn').style.display = '';
  _renderRightPanel('edit', { name, dbType, host, port, database, username, clientLibDir });
}
```

#### 2-9. `_closeEditForms()` 재작성

**위치**: 154번 줄 함수 전체

```js
function _closeEditForms() {
  const wasEditing = _pmEditingName;
  _pmEditingName = null;
  document.getElementById('pmAddToggleBtn') &&
    (document.getElementById('pmAddToggleBtn').style.display = '');
  if (wasEditing) {
    _pmSelectedName = wasEditing;
    _loadProfiles().then(data => {
      const p = data.profiles.find(p => p.name === wasEditing);
      _renderRightPanel(p ? 'detail' : 'hint', p);
    });
  } else {
    _renderRightPanel('hint');
  }
}
```

#### 2-10. `_submitAddProfile()` — element 탐색 방식 유지, 오류 표시 ID 확인

- `pmAddName`, `pmAddType`, `pmAddHost`, `pmAddPort`, `pmAddDatabase`, `pmAddUsername`, `pmAddPassword`, `pmAddClientLibDir` — 우측 패널에 동일 ID로 렌더링되므로 **변경 없음**
- `_pmErrShow('pmAddErr', ...)` — ID 동일하므로 **변경 없음**

**확인 필요**: `_closeAddProfileForm()` 호출 후 `_refreshProfileList()`가 실행되므로 `pmAddToggleBtn`이 복원되는지 타이밍 체크 필요

#### 2-11. `_submitEditProfile(name)` 재작성

**위치**: 159번 줄 함수 전체

기존: `document.getElementById('pmEditForm_${eid}')` 및 `form.querySelector('[data-field="..."]')` 패턴
신규: 고정 ID(`pmEditType` 등) 직접 참조

```js
async function _submitEditProfile(name) {
  const payload = {
    dbType:   document.getElementById('pmEditType').value,
    host:     document.getElementById('pmEditHost').value.trim(),
    port:     parseInt(document.getElementById('pmEditPort').value, 10) || null,
    database: document.getElementById('pmEditDatabase').value.trim(),
    username: document.getElementById('pmEditUsername').value.trim(),
    password: document.getElementById('pmEditPassword').value
  };
  if (payload.dbType === 'oracle') {
    const libDir = (document.getElementById('pmEditClientLibDir')?.value || '').trim();
    if (libDir) payload.clientLibDir = libDir;
  }

  _pmErrClear('pmEditErr');
  if (!payload.host || !payload.database || !payload.username) {
    _pmErrShow('pmEditErr', '필수 항목을 모두 입력하세요.');
    return;
  }

  const saveBtn = document.getElementById('pmEditSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';
  try {
    const res = await fetch(`${MW_URL}/config/profiles/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '수정 실패');
    showToast(`'${name}' 프로파일이 수정되었습니다.`);
    _closeEditForms();
    await _refreshProfileList();
  } catch (e) {
    _pmErrShow('pmEditErr', e.message);
    saveBtn.disabled = false;
    saveBtn.textContent = '저장';
  }
}
```

**이유**: `data-field` 속성 기반 탐색 패턴을 고정 ID 패턴으로 변경하여 코드 단순화. `finally` 블록 대신 `catch`에서 버튼 복원하는 이유: 성공 시 패널이 상세 뷰로 전환되므로 버튼 복원 불필요.

#### 2-12. `_refreshProfileList()` — 변경 없음

현재 구현이 `_loadProfiles()` 후 `_renderProfileList(data)` 호출하며, `_renderProfileList`에서 `_pmSelectedName` 기반으로 우측 패널 상태를 처리하므로 변경 불필요.

#### 2-13. 삭제할 코드

- `_pmEditId(name)` 함수 — 더 이상 DOM id 생성에 사용하지 않으므로 제거 가능 (단, 혹시 모를 외부 참조 여부 확인 필요)
- 기존 `_pmAutoPort()` 함수 — 시그니처 유지, 내용 변경 없음
- 인라인 편집 폼 HTML 생성 코드 (`const editForm = ...` 블록) — `_renderProfileList` 재작성으로 자동 제거

---

## 주의 사항 / 확인 필요 항목

1. **`_pmEditId()` 외부 참조**: `grep 'pmEditId'` 결과 `profile_manager.js` 내부에서만 사용됨을 확인했으므로 안전하게 제거 가능. 단, implementer가 최종 확인 권장.

2. **`overlayClose()` 함수**: `onmousedown="overlayClose(event,'pmOverlay')"` — 2단 레이아웃에서 `onmousedown.stop`이 내부 패널에 있어야 외부 클릭 닫기가 정상 동작함. `<div class="modal" ... onmousedown.stop>`으로 이벤트 버블링 차단 유지.

3. **모달 열린 상태에서 새로고침**: 기존 `if (overlay) { _renderProfileList(data); return; }` 패턴 유지 — 이미 생성된 overlay가 있으면 목록만 재렌더. 우측 패널 상태는 `_pmSelectedName`, `_pmEditingName` 변수 기반으로 유지됨.

4. **`pmAddToggleBtn` display 제어**: `_openAddProfileForm()`에서 `display:none`, `_closeAddProfileForm()`에서 `display:''`. 버튼이 `.pm-list-footer`로 이동했으므로 스타일 영향 없음.

5. **`.btn-del-m` 패딩**: 기존 `padding:9px 20px`이 목록 내 작은 버튼에 과도하게 크므로 인라인 스타일로 `padding:2px 6px` 오버라이드 적용.

6. **반응형 대응**: `min(880px, 96vw)` 사용으로 좁은 화면에서 모달 너비 자동 축소. `pm-left` 너비 `280px`이 고정이므로 화면이 매우 좁을 경우 우측 패널이 압박받을 수 있음 — 최소 너비는 `280+280=560px` 기준으로 수용 가능 수준.
