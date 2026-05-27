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

async function _submitAddProfile() {
  const nameEl = document.getElementById('pmAddName');
  const typeEl = document.getElementById('pmAddType');
  const hostEl = document.getElementById('pmAddHost');
  const portEl = document.getElementById('pmAddPort');
  const dbEl   = document.getElementById('pmAddDatabase');
  const userEl = document.getElementById('pmAddUsername');
  const pwEl   = document.getElementById('pmAddPassword');

  _pmErrClear();

  const payload = {
    name:     nameEl.value.trim(),
    dbType:   typeEl.value,
    host:     hostEl.value.trim(),
    port:     parseInt(portEl.value, 10) || null,
    database: dbEl.value.trim(),
    username: userEl.value.trim(),
    password: pwEl.value
  };

  if (!payload.name || !payload.host || !payload.database || !payload.username || !payload.password) {
    _pmErrShow('필수 항목을 모두 입력하세요.');
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
    _pmErrShow(e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '저장';
  }
}

// ── 폼 토글 ───────────────────────────────────────────────────────

function _openAddProfileForm() {
  document.getElementById('pmAddForm').style.display = 'block';
  document.getElementById('pmAddToggleBtn').style.display = 'none';
  _pmErrClear();
  _pmOnDbTypeChange();
}

function _closeAddProfileForm() {
  document.getElementById('pmAddForm').style.display = 'none';
  document.getElementById('pmAddToggleBtn').style.display = '';
  ['pmAddName','pmAddHost','pmAddPort','pmAddDatabase','pmAddUsername','pmAddPassword']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pmAddType').value = 'postgres';
  _pmErrClear();
}

function _pmOnDbTypeChange() {
  const type = document.getElementById('pmAddType').value;
  const defaults = { postgres: 5432, mysql: 3306, mssql: 1433 };
  const portEl = document.getElementById('pmAddPort');
  if (!portEl.dataset.userEdited) portEl.value = defaults[type] || 5432;
}

// ── 오류 헬퍼 ─────────────────────────────────────────────────────

function _pmErrShow(msg) {
  const el = document.getElementById('pmAddErr');
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function _pmErrClear() {
  const el = document.getElementById('pmAddErr');
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
    <div class="modal" style="width:500px;max-height:80vh;display:flex;flex-direction:column" onmousedown.stop>
      <h3>DB 접속 프로파일 관리</h3>

      <div id="pmProfileList" style="overflow-y:auto;flex:1;margin-bottom:12px"></div>

      <hr style="border:none;border-top:1px solid var(--border,#e0e0e0);margin:0 0 12px">

      <button id="pmAddToggleBtn" class="btn" style="align-self:flex-start;margin-bottom:12px"
        onclick="_openAddProfileForm()">+ 새 프로파일 추가</button>

      <div id="pmAddForm" style="display:none">
        <div class="form-row">
          <label class="form-label">프로파일 이름</label>
          <input class="form-input" id="pmAddName" type="text" placeholder="예: 개발 서버">
        </div>
        <div class="form-row">
          <label class="form-label">DB 종류</label>
          <select class="form-input" id="pmAddType" onchange="_pmOnDbTypeChange()">
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="mssql">SQL Server</option>
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
          <label class="form-label">데이터베이스</label>
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
        <div class="form-err" id="pmAddErr" style="margin-bottom:8px"></div>
        <div class="modal-actions" style="justify-content:flex-end;margin-bottom:12px">
          <button class="btn-cancel-m" onclick="_closeAddProfileForm()">취소</button>
          <button class="btn-save-m" id="pmAddSaveBtn" onclick="_submitAddProfile()">저장</button>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-cancel-m" onclick="closeProfileManagerModal()">닫기</button>
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
    el.innerHTML = '<p style="color:var(--tx-sub);font-size:13px;padding:8px 0">저장된 프로파일이 없습니다.</p>';
    return;
  }

  el.innerHTML = profiles.map(p => {
    const isActive = p.name === active;
    const isOnly   = profiles.length === 1;
    const eName    = _pmEsc(p.name);
    const eInfo    = _pmEsc(`${p.dbType} · ${p.host}:${p.port || '-'}`);

    const activeBadge = isActive
      ? `<span style="font-size:11px;color:var(--green,#22c55e);font-weight:600;margin-right:6px;flex-shrink:0">✔ 활성</span>`
      : `<span style="width:48px;display:inline-block;flex-shrink:0"></span>`;

    const switchBtn = `<button class="btn" style="font-size:12px;padding:2px 8px"
      ${isActive ? 'disabled' : `onclick="_activateProfile('${eName}')"`}>전환</button>`;

    const deleteBtn = `<button class="btn-del-m" style="font-size:12px;padding:2px 8px"
      ${(isActive || isOnly) ? 'disabled' : `onclick="_deleteProfile('${eName}')"`}>삭제</button>`;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:8px 4px;border-bottom:1px solid var(--border,#e0e0e0)">
        <div style="display:flex;align-items:center;flex:1;min-width:0">
          ${activeBadge}
          <span style="font-weight:500;margin-right:8px;white-space:nowrap">${eName}</span>
          <span style="font-size:12px;color:var(--tx-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${eInfo}</span>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px">
          ${switchBtn}
          ${deleteBtn}
        </div>
      </div>`;
  }).join('');
}
