// ══════════════════════════════════════════════════════════════════
// DB 접속 프로파일 관리 — UXERManager 미들웨어 연동
// 의존: db_connect.js (MW_URL, _mwPing, _showMwNotRunning)
// ══════════════════════════════════════════════════════════════════

async function openProfileManagerModal() {
  const running = await _mwPing();
  if (!running) { _showMwNotRunning(); return; }

  const data = await _loadProfiles();
  _renderProfileManagerModal(data);
  document.getElementById('pmOverlay').classList.add('active');
}

function closeProfileManagerModal() {
  const overlay = document.getElementById('pmOverlay');
  if (overlay) overlay.classList.remove('active');
  _pmEditingName = null;
  _pmSelectedName = null;
  const btn = document.getElementById('pmAddToggleBtn');
  if (btn) btn.style.display = '';
}

// ── API 헬퍼 ──────────────────────────────────────────────────────

async function _loadProfiles() {
  try {
    const res = await fetch(`${MW_URL}/config/profiles`);
    if (!res.ok) throw new Error('프로파일 목록 로드 실패');
    return await res.json();
  } catch {
    return { active: null, profiles: [] };
  }
}

async function _activateProfile(name) {
  try {
    const res = await fetch(`${MW_URL}/config/profiles/${encodeURIComponent(name)}/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '전환 실패');
    showToast(`'${name}' 프로파일로 전환되었습니다.`);
    await _refreshProfileList();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function _deleteProfile(name) {
  if (!confirm(`'${name}' 프로파일을 삭제하시겠습니까?`)) return;
  try {
    const res = await fetch(`${MW_URL}/config/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '삭제 실패');
    showToast(`'${name}' 프로파일이 삭제되었습니다.`);
    await _refreshProfileList();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function _refreshProfileList() {
  const data = await _loadProfiles();
  _renderProfileList(data);
}

// ── 추가 폼 ───────────────────────────────────────────────────────

async function _submitAddProfile() {
  const payload = {
    name:     document.getElementById('pmAddName').value.trim(),
    dbType:   document.getElementById('pmAddType').value,
    host:     document.getElementById('pmAddHost').value.trim(),
    port:     parseInt(document.getElementById('pmAddPort').value, 10) || null,
    database: document.getElementById('pmAddDatabase').value.trim(),
    username: document.getElementById('pmAddUsername').value.trim(),
    password: document.getElementById('pmAddPassword').value
  };
  if (payload.dbType === 'oracle') {
    const libDir = document.getElementById('pmAddClientLibDir').value.trim();
    if (libDir) payload.clientLibDir = libDir;
  }

  _pmErrClear('pmAddErr');
  if (!payload.name || !payload.host || !payload.database || !payload.username || !payload.password) {
    _pmErrShow('pmAddErr', '필수 항목을 모두 입력하세요.');
    return;
  }

  const saveBtn = document.getElementById('pmAddSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';
  try {
    const res = await fetch(`${MW_URL}/config/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장 실패');
    showToast(`'${payload.name}' 프로파일이 추가되었습니다.`);
    _closeAddProfileForm();
    await _refreshProfileList();
  } catch (e) {
    _pmErrShow('pmAddErr', e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '저장';
  }
}

function _openAddProfileForm() {
  _pmEditingName = null;
  _renderRightPanel('add');
  document.getElementById('pmAddToggleBtn').style.display = 'none';
  _pmErrClear('pmAddErr');
}

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

// ── 편집 폼 ───────────────────────────────────────────────────────

// 현재 열려있는 편집 폼의 프로파일 이름
let _pmEditingName = null;
let _pmSelectedName = null;  // 좌측 목록에서 선택된 프로파일 이름

function _openEditProfileForm(name, dbType, host, port, database, username, clientLibDir) {
  _pmEditingName = name;
  _pmSelectedName = name;
  document.querySelectorAll('.pm-profile-item').forEach(el => {
    const n = el.querySelector('.pm-item-name')?.textContent;
    el.classList.toggle('pm-selected', n === name);
  });
  document.getElementById('pmAddToggleBtn').style.display = '';
  _renderRightPanel('edit', { name, dbType, host, port, database, username, clientLibDir });
}

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

// ── 공통 헬퍼 ─────────────────────────────────────────────────────

function _pmAutoPort(typeId, portId) {
  const type = document.getElementById(typeId).value;
  const defaults = { postgres: 5432, mysql: 3306, mssql: 1433, oracle: 1521 };
  const portEl = document.getElementById(portId);
  if (!portEl.dataset.userEdited) portEl.value = defaults[type] || 5432;
}

function _pmToggleOracle(typeEl, sectionEl) {
  if (sectionEl) sectionEl.style.display = typeEl.value === 'oracle' ? '' : 'none';
}

function _pmUpdateOracleCmd(inputEl, cmdId) {
  const path = inputEl.value.trim();
  const cmdEl = document.getElementById(cmdId);
  if (!cmdEl) return;
  cmdEl.textContent = path
    ? `setx PATH "%PATH%;${path}" /M`
    : 'setx PATH "%PATH%;<경로>" /M';
}

function _pmErrShow(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function _pmErrClear(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.remove('show'); }
}

// XSS 방지: 서버 데이터를 innerHTML에 삽입 시 이스케이프
function _pmEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── DOM 렌더 ──────────────────────────────────────────────────────

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
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  _renderProfileList(data);
}

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

  const stillExists = profiles.some(p => p.name === _pmSelectedName);
  if (_pmEditingName) {
    // 편집 중이면 우측 패널 상태 그대로 유지
  } else if (stillExists && _pmSelectedName) {
    const selProfile = profiles.find(p => p.name === _pmSelectedName);
    _renderRightPanel('detail', selProfile);
  } else {
    _pmSelectedName = null;
    _renderRightPanel('hint');
  }
}

function _pmSelectProfile(name) {
  _pmSelectedName = name;
  document.querySelectorAll('.pm-profile-item').forEach(el => {
    const n = el.querySelector('.pm-item-name')?.textContent;
    el.classList.toggle('pm-selected', n === name);
  });
  _loadProfiles().then(data => {
    const p = data.profiles.find(p => p.name === name);
    if (p) _renderRightPanel('detail', p);
  });
}

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
          <p style="margin:0 0 8px;font-size:12px;color:var(--tx-sub);line-height:1.6">
            <strong>Oracle Instant Client 안내</strong><br>
            node-oracledb 기본 모드(Thin)는 Oracle DB 12.1 이상만 지원합니다.
            구버전 DB(예: Oracle 11g)에 연결하려면 Instant Client를 설치하고
            <strong>시스템 PATH</strong>에 등록해야 합니다.<br>
            <a href="https://www.oracle.com/database/technologies/instant-client/downloads.html"
               target="_blank" style="color:var(--ac)">Instant Client 다운로드 (Basic 패키지)</a>
          </p>
          <label class="form-label">Instant Client 경로</label>
          <input class="form-input" id="pmAddClientLibDir" type="text"
            placeholder="예: D:\\instantclient_23_0"
            oninput="_pmUpdateOracleCmd(this,'pmAddOracleCmd')">
          <p style="margin:8px 0 4px;font-size:12px;color:var(--tx-sub)">
            아래 명령어를 <strong>관리자 권한 CMD</strong>에서 실행한 후 미들웨어를 재시작하세요:
          </p>
          <code id="pmAddOracleCmd" style="display:block;padding:6px 10px;background:var(--bg-code,#1a1a2e);color:var(--tx-code,#e0e0e0);border-radius:4px;font-size:12px;font-family:monospace;word-break:break-all;user-select:all">setx PATH "%PATH%;&lt;경로&gt;" /M</code>
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
          <p style="margin:0 0 8px;font-size:12px;color:var(--tx-sub);line-height:1.6">
            <strong>Oracle Instant Client 안내</strong><br>
            node-oracledb 기본 모드(Thin)는 Oracle DB 12.1 이상만 지원합니다.
            구버전 DB(예: Oracle 11g)에 연결하려면 Instant Client를 설치하고
            <strong>시스템 PATH</strong>에 등록해야 합니다.<br>
            <a href="https://www.oracle.com/database/technologies/instant-client/downloads.html"
               target="_blank" style="color:var(--ac)">Instant Client 다운로드 (Basic 패키지)</a>
          </p>
          <label class="form-label">Instant Client 경로</label>
          <input class="form-input" id="pmEditClientLibDir" type="text"
            placeholder="예: D:\\instantclient_23_0"
            oninput="_pmUpdateOracleCmd(this,'pmEditOracleCmd')">
          <p style="margin:8px 0 4px;font-size:12px;color:var(--tx-sub)">
            아래 명령어를 <strong>관리자 권한 CMD</strong>에서 실행한 후 미들웨어를 재시작하세요:
          </p>
          <code id="pmEditOracleCmd" style="display:block;padding:6px 10px;background:var(--bg-code,#1a1a2e);color:var(--tx-code,#e0e0e0);border-radius:4px;font-size:12px;font-family:monospace;word-break:break-all;user-select:all">setx PATH "%PATH%;&lt;경로&gt;" /M</code>
        </div>
      </div>
      <div class="form-err" id="pmEditErr" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn-cancel-m" onclick="_closeEditForms()">취소</button>
        <button class="btn-save-m" id="pmEditSaveBtn" onclick="_submitEditProfile('${eName}')">저장</button>
      </div>`;
    document.getElementById('pmEditType').value     = p.dbType || 'postgres';
    document.getElementById('pmEditHost').value     = p.host || '';
    document.getElementById('pmEditPort').value     = p.port || '';
    document.getElementById('pmEditDatabase').value = p.database || '';
    document.getElementById('pmEditUsername').value = p.username || '';
    const editLibDirEl = document.getElementById('pmEditClientLibDir');
    if (editLibDirEl) {
      editLibDirEl.value = p.clientLibDir || '';
      _pmUpdateOracleCmd(editLibDirEl, 'pmEditOracleCmd');
    }
    _pmToggleOracle(
      document.getElementById('pmEditType'),
      document.getElementById('pmEditOracleSection')
    );
  }
}
