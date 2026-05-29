// ══════════════════════════════════════════════════════════════════
// 포워드 엔지니어링 — ERD → DB DDL 실행
// 의존: db_connect.js (MW_URL, _mwPing, _mwGetConfig, _showMwNotRunning)
//       export.js (buildDDL)
//       ui.js (showToast, escHtml, overlayClose)
//       state.js (ENTITIES, getActiveDiagram)
// ══════════════════════════════════════════════════════════════════

// ── 모듈 스코프 상태 ──────────────────────────────────────────────
let _feStep = 0;                // 0=미개방, 1=옵션, 2=엔티티선택
let _feSelectedEntities = [];   // 선택된 엔티티 배열
let _feDialect = 'mysql';       // 현재 선택 dialect
let _feConflicts = {};          // physicalName → 'drop'|'rename'|'skip'
let _feExistingTables = [];     // GET /schema/tables 결과 [{name,type}]
let _feDetectedDialect = 'mysql'; // 미들웨어 설정에서 감지한 dialect

// dbType(미들웨어) → dialect(DDL) 매핑
const _feDialectMap = { mysql: 'mysql', postgres: 'postgresql', oracle: 'oracle', mssql: 'mssql' };

// ── 모달 열기 ─────────────────────────────────────────────────────
async function openForwardEngineerModal() {
  const running = await _mwPing();
  if (!running) {
    _showMwNotRunning();
    return;
  }
  const config = await _mwGetConfig();
  if (!config) {
    let errOverlay = document.getElementById('feDbCfgNotice');
    if (!errOverlay) {
      errOverlay = document.createElement('div');
      errOverlay.className = 'modal-overlay';
      errOverlay.id = 'feDbCfgNotice';
      errOverlay.setAttribute('onmousedown', "overlayClose(event,'feDbCfgNotice')");
      errOverlay.innerHTML = `
        <div class="modal" style="width:380px" onmousedown.stop>
          <h3>DB 접속정보 없음</h3>
          <p style="color:var(--tx-sub);font-size:13px;line-height:1.6;margin-bottom:16px">
            DB 연결 설정을 먼저 완료하세요.
          </p>
          <div class="modal-actions">
            <button class="btn-cancel-m" onclick="document.getElementById('feDbCfgNotice').classList.remove('active')">닫기</button>
            <button class="btn-primary" onclick="document.getElementById('feDbCfgNotice').classList.remove('active');openProfileManagerModal()">DB 연결 설정</button>
          </div>
        </div>`;
      document.body.appendChild(errOverlay);
    }
    errOverlay.classList.add('active');
    return;
  }

  // dialect 자동 감지
  const dbType = config.dbType || 'mysql';
  _feDetectedDialect = _feDialectMap[dbType] || 'mysql';
  _feDialect = _feDetectedDialect;

  _feStep = 1;
  _feSelectedEntities = [];
  _feConflicts = {};
  _feExistingTables = [];

  _feRenderStep1Modal();
  document.getElementById('feOverlay').classList.add('active');
}

// ── 단일 엔티티 포워드 엔지니어링 (컨텍스트 메뉴 진입) ────────────
async function openForwardEngineerForEntity(entityId) {
  const target = ENTITIES.find(e => e.id === entityId);
  if (!target) return;

  const running = await _mwPing();
  if (!running) {
    _showMwNotRunning();
    return;
  }
  const config = await _mwGetConfig();
  if (!config) {
    let errOverlay = document.getElementById('feDbCfgNotice');
    if (!errOverlay) {
      errOverlay = document.createElement('div');
      errOverlay.className = 'modal-overlay';
      errOverlay.id = 'feDbCfgNotice';
      errOverlay.setAttribute('onmousedown', "overlayClose(event,'feDbCfgNotice')");
      errOverlay.innerHTML = `
        <div class="modal" style="width:380px" onmousedown.stop>
          <h3>DB 접속정보 없음</h3>
          <p style="color:var(--tx-sub);font-size:13px;line-height:1.6;margin-bottom:16px">
            DB 연결 설정을 먼저 완료하세요.
          </p>
          <div class="modal-actions">
            <button class="btn-cancel-m" onclick="document.getElementById('feDbCfgNotice').classList.remove('active')">닫기</button>
            <button class="btn-primary" onclick="document.getElementById('feDbCfgNotice').classList.remove('active');openProfileManagerModal()">DB 연결 설정</button>
          </div>
        </div>`;
      document.body.appendChild(errOverlay);
    }
    errOverlay.classList.add('active');
    return;
  }

  // dialect 자동 감지
  const dbType = config.dbType || 'mysql';
  _feDetectedDialect = _feDialectMap[dbType] || 'mysql';
  _feDialect = _feDetectedDialect;

  // 상태 초기화
  _feStep = 1;
  _feSelectedEntities = [];
  _feConflicts = {};
  _feExistingTables = [];

  _feRenderStep1Modal();
  document.getElementById('feOverlay').classList.add('active');
  // 엔티티 선택 단계 건너뜀: 해당 엔티티만 표시
  await _feShowStep2(entityId);
}

function closeForwardEngineerModal() {
  const ov = document.getElementById('feOverlay');
  if (ov) ov.classList.remove('active');
  _feStep = 0;
}

// ── 1단계: 옵션 모달 렌더링 ───────────────────────────────────────
function _feRenderStep1Modal() {
  if (document.getElementById('feOverlay')) {
    _feResetToStep1();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'feOverlay';
  overlay.setAttribute('onmousedown', "overlayClose(event,'feOverlay')");
  overlay.innerHTML = `
    <div class="modal" style="width:520px" onmousedown.stop>
      <h3>포워드 엔지니어링</h3>
      <p style="color:var(--tx-sub);font-size:13px;margin-bottom:16px">
        ERD 엔티티를 선택하여 DB에 테이블을 생성합니다.
      </p>

      <!-- 1단계: 옵션 -->
      <div id="feStep1Wrap">
        <div class="form-row">
          <label class="form-label">대상 DB (Dialect)</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
            <select class="form-input" id="feDialectSel" style="width:160px" onchange="_feDialect=this.value">
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="oracle">Oracle</option>
              <option value="mssql">MSSQL</option>
            </select>
            <span style="font-size:12px;color:var(--tx-sub)" id="feDialectHint"></span>
          </div>
        </div>

        <div class="form-row">
          <label class="form-label">옵션</label>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="feOptFK" checked>
              <span style="font-size:13px">FK 제약 포함</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="feOptIndex" checked>
              <span style="font-size:13px">인덱스 포함</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="feOptComment" checked>
              <span style="font-size:13px">컬럼 주석 포함</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="feOptDryRun">
              <span style="font-size:13px">Dry-run (SQL 미리보기만, 실행 안 함)</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 2단계: 엔티티 선택 + 미리보기 -->
      <div id="feStep2Wrap" style="display:none">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label class="form-label" style="margin:0">대상 엔티티 선택</label>
          <button type="button" class="btn-cancel-m" id="feSelectAllBtn" style="padding:2px 8px;font-size:12px" onclick="toggleForwardEngineerAll()">전체 선택</button>
        </div>
        <div id="feEntityList" style="max-height:200px;overflow:auto;border:1px solid var(--brd,#444);border-radius:4px;padding:8px;font-size:13px;margin-bottom:10px"></div>

        <!-- 충돌 처리 영역 -->
        <div id="feConflictWrap" style="display:none;margin-bottom:10px">
          <label class="form-label" style="color:#f38ba8;margin-bottom:4px">⚠ 기존 테이블 충돌 — 처리 방법 선택</label>
          <div id="feConflictList" style="max-height:160px;overflow:auto;border:1px solid #f38ba8;border-radius:4px;padding:8px;font-size:12px"></div>
        </div>

        <!-- SQL 미리보기 -->
        <div id="fePreviewWrap" style="display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label class="form-label" style="margin:0">SQL 미리보기</label>
            <button type="button" class="btn-cancel-m" style="padding:2px 8px;font-size:12px" onclick="_feCopySql()">복사</button>
          </div>
          <pre id="fePreviewSql" style="background:var(--bg2,#181825);border:1px solid var(--brd,#444);border-radius:4px;padding:10px;max-height:160px;overflow:auto;font-size:11px;font-family:Consolas,monospace;white-space:pre-wrap;color:#a6e3a1;margin:0 0 10px 0"></pre>
        </div>

        <!-- 진행률 바 -->
        <div id="feProgress" style="display:none;margin-bottom:8px">
          <div style="font-size:12px;color:var(--tx-sub);margin-bottom:4px" id="feProgressLabel">실행 중...</div>
          <div style="background:var(--bg2,#181825);border-radius:4px;height:8px;overflow:hidden">
            <div id="feProgressBar" style="height:100%;width:0%;background:#89b4fa;transition:width 0.2s"></div>
          </div>
        </div>

        <div id="feErrMsg" style="display:none;color:var(--err,#f38ba8);font-size:12px;margin-bottom:8px"></div>
      </div>

      <div class="modal-actions">
        <button class="btn-cancel-m" onclick="closeForwardEngineerModal()">취소</button>
        <button class="btn-cancel-m" id="fePreviewBtn" style="display:none" onclick="_fePreview()">미리보기</button>
        <button class="btn-primary" id="feNextBtn" onclick="_feNextStep()">다음</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  _feResetToStep1();
}

function _feResetToStep1() {
  // dialect 선택값 설정
  const sel = document.getElementById('feDialectSel');
  if (sel) {
    sel.value = _feDialect;
  }
  const hint = document.getElementById('feDialectHint');
  if (hint) hint.textContent = `자동 감지: ${_feDetectedDialect}`;

  document.getElementById('feStep1Wrap').style.display = '';
  document.getElementById('feStep2Wrap').style.display = 'none';
  document.getElementById('fePreviewBtn').style.display = 'none';
  document.getElementById('feNextBtn').textContent = '다음';
  document.getElementById('feNextBtn').onclick = _feNextStep;
  const errEl = document.getElementById('feErrMsg');
  if (errEl) errEl.style.display = 'none';
  _feStep = 1;
}

// ── 단계 전환 ─────────────────────────────────────────────────────
async function _feNextStep() {
  if (_feStep === 1) {
    _feDialect = document.getElementById('feDialectSel').value;
    await _feShowStep2();
  } else if (_feStep === 2) {
    await _feRun();
  }
}

// ── 2단계: 엔티티 선택 + 충돌 확인 ───────────────────────────────
async function _feShowStep2(restrictEntityId = null) {
  if (!ENTITIES || !ENTITIES.length) {
    showToast('엔티티가 없습니다. 먼저 ERD를 작성하세요.');
    return;
  }

  const nextBtn = document.getElementById('feNextBtn');
  nextBtn.disabled = true;
  nextBtn.textContent = '기존 테이블 확인 중...';

  try {
    const res = await fetch(`${MW_URL}/schema/tables`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const { items } = await res.json();
    _feExistingTables = items || [];
  } catch (e) {
    const errEl = document.getElementById('feErrMsg');
    errEl.textContent = '기존 테이블 목록 조회 실패: ' + e.message;
    errEl.style.display = 'block';
    nextBtn.disabled = false;
    nextBtn.textContent = '다음';
    return;
  }

  const existingNames = new Set(_feExistingTables.map(t => t.name.toLowerCase()));

  // 엔티티 체크리스트 렌더링 (단일 엔티티 모드 지원)
  const entsToRender = restrictEntityId
    ? ENTITIES.filter(ent => ent.id === restrictEntityId)
    : ENTITIES;
  const listEl = document.getElementById('feEntityList');
  listEl.innerHTML = entsToRender.map(ent => {
    const i = ENTITIES.indexOf(ent);
    const pname = ent.physicalName || ent.id;
    const lname = ent.logicalName || ent.id;
    const hasConflict = existingNames.has(pname.toLowerCase());
    const conflictBadge = hasConflict
      ? '<span style="display:inline-block;background:#f38ba8;color:#11111b;border-radius:2px;padding:1px 5px;font-size:10px;margin-left:6px">⚠ 충돌</span>'
      : '';
    return `
      <label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
        <input type="checkbox" class="feEntityChk" data-pname="${escHtml(pname)}" data-idx="${i}" checked>
        <span>${escHtml(pname)}</span>
        <span style="color:var(--tx-sub);font-size:11px">(${escHtml(lname)})</span>
        ${conflictBadge}
      </label>`;
  }).join('');

  // 초기 충돌 처리 UI
  _feUpdateConflictUI(existingNames);

  // 체크 변경 시 충돌 UI 갱신
  listEl.querySelectorAll('.feEntityChk').forEach(chk => {
    chk.addEventListener('change', () => _feUpdateConflictUI(existingNames));
  });

  document.getElementById('feStep1Wrap').style.display = 'none';
  document.getElementById('feStep2Wrap').style.display = '';
  document.getElementById('feSelectAllBtn').style.display = restrictEntityId ? 'none' : '';
  document.getElementById('fePreviewBtn').style.display = '';
  nextBtn.disabled = false;
  nextBtn.textContent = '실행';
  nextBtn.onclick = _feNextStep;
  document.getElementById('feErrMsg').style.display = 'none';
  _feStep = 2;
}

// ── 충돌 처리 UI 업데이트 ─────────────────────────────────────────
function _feUpdateConflictUI(existingNames) {
  const checked = Array.from(document.querySelectorAll('.feEntityChk:checked'))
    .map(el => el.getAttribute('data-pname'));
  const conflicts = checked.filter(pname => existingNames.has(pname.toLowerCase()));

  const conflictWrap = document.getElementById('feConflictWrap');
  const conflictList = document.getElementById('feConflictList');

  if (!conflicts.length) {
    conflictWrap.style.display = 'none';
    return;
  }

  conflictWrap.style.display = '';

  // 기본값 설정 (처음 충돌 감지 시)
  conflicts.forEach(pname => {
    if (!_feConflicts[pname]) _feConflicts[pname] = 'rename';
  });

  conflictList.innerHTML = conflicts.map((pname, ci) => {
    const cur = _feConflicts[pname] || 'rename';
    const gname = `feConflict_${ci}`;
    return `
      <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--brd,#444)">
        <div style="font-weight:bold;margin-bottom:4px;color:#f38ba8">${escHtml(pname)}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap" class="feConflictGroup" data-pname="${escHtml(pname)}">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px">
            <input type="radio" name="${gname}" value="rename" ${cur==='rename'?'checked':''}>
            RENAME 후 생성
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px">
            <input type="radio" name="${gname}" value="drop" ${cur==='drop'?'checked':''}>
            DROP 후 생성
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px">
            <input type="radio" name="${gname}" value="skip" ${cur==='skip'?'checked':''}>
            건너뛰기
          </label>
        </div>
      </div>`;
  }).join('');

  // 라디오 이벤트 — data-pname 속성으로 안전하게 키 추출
  conflictList.querySelectorAll('.feConflictGroup').forEach(group => {
    const pname = group.getAttribute('data-pname');
    group.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        _feConflicts[pname] = radio.value;
      });
    });
  });
}

// ── 충돌 사전 DDL 생성 (DROP/RENAME) ─────────────────────────────
function _feGetPreDDL(selectedPnames) {
  const preSqls = [];
  const existingNames = new Set(_feExistingTables.map(t => t.name.toLowerCase()));
  const ts = Date.now();

  selectedPnames.forEach(pname => {
    if (!existingNames.has(pname.toLowerCase())) return;
    const action = _feConflicts[pname] || 'rename';
    if (action === 'drop') {
      if (_feDialect === 'mssql') {
        preSqls.push(`IF OBJECT_ID('${pname}', 'U') IS NOT NULL DROP TABLE ${pname};`);
      } else if (_feDialect === 'oracle') {
        preSqls.push(`BEGIN EXECUTE IMMEDIATE 'DROP TABLE ${pname}'; EXCEPTION WHEN OTHERS THEN NULL; END;`);
      } else {
        preSqls.push(`DROP TABLE IF EXISTS ${pname};`);
      }
    } else if (action === 'rename') {
      // Oracle 12.1 이하는 식별자 최대 30자, MySQL은 64자
      const suffix = `_bak_${ts.toString(36)}`; // base36으로 접미사 단축 (최대 ~8자)
      const maxLen = _feDialect === 'oracle' ? 30 : 64;
      const newName = pname.length + suffix.length > maxLen
        ? pname.slice(0, maxLen - suffix.length) + suffix
        : pname + suffix;
      if (_feDialect === 'mysql') {
        preSqls.push(`RENAME TABLE ${pname} TO ${newName};`);
      } else if (_feDialect === 'postgresql') {
        preSqls.push(`ALTER TABLE ${pname} RENAME TO ${newName};`);
      } else if (_feDialect === 'mssql') {
        preSqls.push(`EXEC sp_rename '${pname}', '${newName}';`);
      } else if (_feDialect === 'oracle') {
        preSqls.push(`ALTER TABLE ${pname} RENAME TO ${newName};`);
      }
    }
    // skip: 아무것도 추가 안 함 (CREATE도 건너뜀)
  });

  return preSqls;
}

// ── SQL 미리보기 ──────────────────────────────────────────────────
function _fePreview() {
  const checkedEls = Array.from(document.querySelectorAll('.feEntityChk:checked'));
  if (!checkedEls.length) {
    const errEl = document.getElementById('feErrMsg');
    errEl.textContent = '최소 한 개 이상의 엔티티를 선택하세요.';
    errEl.style.display = 'block';
    return;
  }

  const selectedIdxs = checkedEls.map(el => parseInt(el.getAttribute('data-idx'), 10));
  const selectedPnames = checkedEls.map(el => el.getAttribute('data-pname'));
  const existingNames = new Set(_feExistingTables.map(t => t.name.toLowerCase()));

  // skip 처리된 엔티티 제외
  const filteredEntities = ENTITIES.filter((ent, i) => {
    if (!selectedIdxs.includes(i)) return false;
    const pname = ent.physicalName || ent.id;
    if (existingNames.has(pname.toLowerCase()) && (_feConflicts[pname] || 'rename') === 'skip') return false;
    return true;
  });

  const opts = {
    includeFK:      document.getElementById('feOptFK').checked,
    includeIndex:   document.getElementById('feOptIndex').checked,
    includeComment: document.getElementById('feOptComment').checked,
  };

  const { text } = buildDDL(_feDialect, filteredEntities, opts);
  const preSqls = _feGetPreDDL(selectedPnames);
  const preText = preSqls.length ? preSqls.join('\n') + '\n\n' : '';

  const previewEl = document.getElementById('fePreviewSql');
  previewEl.textContent = preText + text;
  document.getElementById('fePreviewWrap').style.display = '';
  document.getElementById('feErrMsg').style.display = 'none';
}

function _feCopySql() {
  const text = document.getElementById('fePreviewSql').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('SQL이 클립보드에 복사되었습니다.'));
}

// ── 실행 ──────────────────────────────────────────────────────────
async function _feRun() {
  const checkedEls = Array.from(document.querySelectorAll('.feEntityChk:checked'));
  if (!checkedEls.length) {
    const errEl = document.getElementById('feErrMsg');
    errEl.textContent = '최소 한 개 이상의 엔티티를 선택하세요.';
    errEl.style.display = 'block';
    return;
  }

  const selectedIdxs = checkedEls.map(el => parseInt(el.getAttribute('data-idx'), 10));
  const selectedPnames = checkedEls.map(el => el.getAttribute('data-pname'));
  const existingNames = new Set(_feExistingTables.map(t => t.name.toLowerCase()));

  // skip 처리된 엔티티 제외
  const filteredEntities = ENTITIES.filter((ent, i) => {
    if (!selectedIdxs.includes(i)) return false;
    const pname = ent.physicalName || ent.id;
    if (existingNames.has(pname.toLowerCase()) && (_feConflicts[pname] || 'rename') === 'skip') return false;
    return true;
  });

  const opts = {
    includeFK:      document.getElementById('feOptFK').checked,
    includeIndex:   document.getElementById('feOptIndex').checked,
    includeComment: document.getElementById('feOptComment').checked,
  };

  const { sqls } = buildDDL(_feDialect, filteredEntities, opts);
  const preSqls = _feGetPreDDL(selectedPnames);
  const allSqls = [...preSqls, ...sqls].filter(s => s && s.trim());

  if (!allSqls.length) {
    showToast('실행할 SQL이 없습니다.');
    return;
  }

  const isDryRun = document.getElementById('feOptDryRun').checked;
  if (isDryRun) {
    _fePreview();
    showToast('Dry-run: SQL 미리보기만 표시합니다. 실제 실행되지 않습니다.');
    return;
  }

  // 미리보기 표시 후 실행
  _fePreview();

  const nextBtn = document.getElementById('feNextBtn');
  const previewBtn = document.getElementById('fePreviewBtn');
  nextBtn.disabled = true;
  previewBtn.disabled = true;
  document.getElementById('feErrMsg').style.display = 'none';

  const progressWrap = document.getElementById('feProgress');
  const progressBar  = document.getElementById('feProgressBar');
  const progressLabel = document.getElementById('feProgressLabel');
  progressWrap.style.display = '';
  progressBar.style.width = '0%';

  let successCount = 0;
  let failedCount  = 0;
  let doneCalled   = false;

  try {
    await _feExecuteWithStream(
      allSqls,
      true, // stopOnError
      (data) => {
        // progress
        const pct = data.total > 0 ? Math.round((data.step / data.total) * 100) : 0;
        progressBar.style.width = pct + '%';
        progressLabel.textContent = `실행 중... (${data.step}/${data.total}) ${data.sql ? data.sql.slice(0, 60) + '...' : ''}`;
      },
      (data) => {
        // error
        failedCount++;
        const errEl = document.getElementById('feErrMsg');
        errEl.textContent = `오류 (${data.step}/${data.total}): ${data.error}`;
        errEl.style.display = 'block';
      },
      (data) => {
        // done
        doneCalled    = true;
        successCount  = data.success || 0;
        failedCount   = data.failed  || 0;
        progressBar.style.width = '100%';
        progressLabel.textContent = `완료: 성공 ${successCount}개, 실패 ${failedCount}개`;
        showToast(`포워드 엔지니어링 완료 — 성공 ${successCount}개, 실패 ${failedCount}개`);
        nextBtn.disabled = false;
        previewBtn.disabled = false;
        nextBtn.textContent = '닫기';
        nextBtn.onclick = closeForwardEngineerModal;
      }
    );

    // done 이벤트 없이 스트림이 종료된 경우 (서버 크래시 / 네트워크 강제 종료)
    if (!doneCalled) {
      const errEl = document.getElementById('feErrMsg');
      errEl.textContent = 'SSE 스트림이 완료 이벤트 없이 종료되었습니다. 미들웨어 상태를 확인하세요.';
      errEl.style.display = 'block';
      progressLabel.textContent = '비정상 종료';
      nextBtn.disabled = false;
      previewBtn.disabled = false;
    }
  } catch (e) {
    const errEl = document.getElementById('feErrMsg');
    errEl.textContent = 'SSE 연결 오류: ' + e.message;
    errEl.style.display = 'block';
    nextBtn.disabled = false;
    previewBtn.disabled = false;
  }
}

// ── SSE 스트림 실행 ───────────────────────────────────────────────
async function _feExecuteWithStream(sqls, stopOnError, onProgress, onError, onDone) {
  const res = await fetch(`${MW_URL}/execute/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sqls, stopOnError: !!stopOnError })
  });

  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();

    for (const part of parts) {
      const eventLine = part.match(/^event: (.+)$/m)?.[1];
      const dataLine  = part.match(/^data: (.+)$/m)?.[1];
      if (!dataLine) continue;

      let data;
      try { data = JSON.parse(dataLine); } catch { continue; }

      if (eventLine === 'progress') onProgress(data);
      else if (eventLine === 'error') onError(data);
      else if (eventLine === 'done')  onDone(data);
    }
  }
}

// ── 전체 선택/해제 토글 ───────────────────────────────────────────
function toggleForwardEngineerAll() {
  const chks = document.querySelectorAll('.feEntityChk');
  const allChecked = Array.from(chks).every(c => c.checked);
  chks.forEach(c => { c.checked = !allChecked; });
  const btn = document.getElementById('feSelectAllBtn');
  if (btn) btn.textContent = allChecked ? '전체 선택' : '전체 해제';

  // 충돌 UI 갱신
  const existingNames = new Set(_feExistingTables.map(t => t.name.toLowerCase()));
  _feUpdateConflictUI(existingNames);
}
