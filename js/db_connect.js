// ══════════════════════════════════════════════════════════════════
// DB 연결 설정 — UXERManager 미들웨어 연동
// 미들웨어: http://127.0.0.1:3737
// ══════════════════════════════════════════════════════════════════

const MW_URL = 'http://127.0.0.1:3737';

async function openDbConnectModal() {
  // 미들웨어 실행 여부 확인
  const running = await _mwPing();
  if (!running) {
    _showMwNotRunning();
    return;
  }
  // 기존 설정 로드
  const existing = await _mwGetConfig();
  _renderDbConnectModal(existing);
  document.getElementById('dbConnectOverlay').classList.add('active');
}

function closeDbConnectModal() {
  document.getElementById('dbConnectOverlay').classList.remove('active');
}

async function saveDbConfig() {
  const btn = document.getElementById('dbConnectSaveBtn');
  const errEl = document.getElementById('dbConnectErr');
  _errClear(errEl);

  const payload = {
    dbType:   document.getElementById('dbConnType').value,
    host:     document.getElementById('dbConnHost').value.trim(),
    port:     parseInt(document.getElementById('dbConnPort').value, 10) || null,
    database: document.getElementById('dbConnDatabase').value.trim(),
    username: document.getElementById('dbConnUsername').value.trim(),
    password: document.getElementById('dbConnPassword').value
  };

  if (!payload.host || !payload.database || !payload.username || !payload.password) {
    _errShow(errEl, '필수 항목을 모두 입력하세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    const res = await fetch(`${MW_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장 실패');
    showToast('DB 접속정보가 저장되었습니다.');
    closeDbConnectModal();
  } catch (e) {
    _errShow(errEl, e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '저장';
  }
}

async function testDbConfig() {
  const btn = document.getElementById('dbConnTestBtn');
  const errEl = document.getElementById('dbConnectErr');
  _errClear(errEl);

  const payload = {
    dbType:   document.getElementById('dbConnType').value,
    host:     document.getElementById('dbConnHost').value.trim(),
    port:     parseInt(document.getElementById('dbConnPort').value, 10) || null,
    database: document.getElementById('dbConnDatabase').value.trim(),
    username: document.getElementById('dbConnUsername').value.trim(),
    password: document.getElementById('dbConnPassword').value
  };

  if (!payload.host || !payload.database || !payload.username || !payload.password) {
    _errShow(errEl, '필수 항목을 모두 입력하세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '테스트 중...';
  try {
    const res = await fetch(`${MW_URL}/config/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '연결 실패');
    _errShow(errEl, '연결 성공', 'ok');
    setTimeout(() => _errClear(errEl), 3000);
  } catch (e) {
    _errShow(errEl, e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '연결 테스트';
  }
}

function _onDbTypeChange() {
  const type = document.getElementById('dbConnType').value;
  const defaults = { postgres: 5432, mysql: 3306, mssql: 1433 };
  const portEl = document.getElementById('dbConnPort');
  if (!portEl.dataset.userEdited) portEl.value = defaults[type] || 5432;
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────

async function _mwPing() {
  try {
    const res = await fetch(`${MW_URL}/ping`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function _mwGetConfig() {
  try {
    const res = await fetch(`${MW_URL}/config`);
    const data = await res.json();
    return data.configured ? data : null;
  } catch {
    return null;
  }
}

function _showMwNotRunning() {
  let el = document.getElementById('mwNotRunningOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'mwNotRunningOverlay';
    el.innerHTML = `
      <div class="modal" style="width:400px" onmousedown.stop>
        <h3>미들웨어 미실행</h3>
        <p style="color:var(--tx-sub);font-size:13px;line-height:1.6;margin-bottom:16px">
          DB 연결 기능을 사용하려면 UXERManager 미들웨어가 실행 중이어야 합니다.<br><br>
          <strong>uxermanager.exe</strong> 를 먼저 실행한 후 다시 시도하세요.
        </p>
        <div class="modal-actions">
          <button class="btn-cancel-m" onclick="document.getElementById('mwNotRunningOverlay').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  }
  el.classList.add('active');
}

function _renderDbConnectModal(existing) {
  let overlay = document.getElementById('dbConnectOverlay');
  if (overlay) {
    // 기존 값 채우기
    if (existing) _fillForm(existing);
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dbConnectOverlay';
  overlay.setAttribute('onmousedown', "overlayClose(event,'dbConnectOverlay')");
  overlay.innerHTML = `
    <div class="modal" style="width:440px" onmousedown.stop>
      <h3>DB 연결 설정</h3>

      <div class="form-row">
        <label class="form-label">DB 종류</label>
        <select class="form-input" id="dbConnType" onchange="_onDbTypeChange()">
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mssql">SQL Server</option>
        </select>
      </div>

      <div class="form-row" style="display:flex;gap:8px">
        <div style="flex:1">
          <label class="form-label">호스트</label>
          <input class="form-input" id="dbConnHost" type="text" placeholder="localhost">
        </div>
        <div style="width:90px">
          <label class="form-label">포트</label>
          <input class="form-input" id="dbConnPort" type="number" placeholder="5432"
            oninput="this.dataset.userEdited='1'">
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">데이터베이스</label>
        <input class="form-input" id="dbConnDatabase" type="text" placeholder="mydb">
      </div>

      <div class="form-row">
        <label class="form-label">사용자명</label>
        <input class="form-input" id="dbConnUsername" type="text" placeholder="postgres">
      </div>

      <div class="form-row">
        <label class="form-label">비밀번호</label>
        <input class="form-input" id="dbConnPassword" type="password" placeholder="••••••••">
      </div>

      <div class="form-err" id="dbConnectErr" style="margin-bottom:8px"></div>

      <div class="modal-actions">
        <button class="btn" id="dbConnTestBtn" onclick="testDbConfig()">연결 테스트</button>
        <button class="btn-cancel-m" onclick="closeDbConnectModal()">취소</button>
        <button class="btn-save-m" id="dbConnectSaveBtn" onclick="saveDbConfig()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  if (existing) _fillForm(existing);
  else _onDbTypeChange();
}

function _fillForm(cfg) {
  if (cfg.dbType) document.getElementById('dbConnType').value = cfg.dbType;
  if (cfg.host) document.getElementById('dbConnHost').value = cfg.host;
  if (cfg.port) { document.getElementById('dbConnPort').value = cfg.port; document.getElementById('dbConnPort').dataset.userEdited = '1'; }
  if (cfg.database) document.getElementById('dbConnDatabase').value = cfg.database;
  if (cfg.username) document.getElementById('dbConnUsername').value = cfg.username;
}

function _errShow(el, msg, type) {
  el.textContent = msg;
  el.style.color = type === 'ok' ? 'var(--green, #22c55e)' : '';
  el.classList.add('show');
}

function _errClear(el) {
  el.textContent = '';
  el.style.color = '';
  el.classList.remove('show');
}
