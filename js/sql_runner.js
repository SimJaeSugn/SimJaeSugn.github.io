// ══════════════════════════════════════════════════════════════════
// SQL 실행기 — sql.js (SQLite compiled to WASM)
// ERD 스키마를 브라우저 내 SQLite DB로 로드 → 즉시 쿼리 실행
// ══════════════════════════════════════════════════════════════════

let _sqlJs      = null;   // sql.js 라이브러리 인스턴스
let _sqlDb      = null;   // 현재 열린 DB
let _sqlSamples = [];     // 샘플 쿼리 배열 (버튼 onclick 인덱스 참조용)

/** 샘플 버튼 클릭 → 해당 SQL을 입력창에 설정 */
function _sqlSetInput(i) {
  const el = document.getElementById('sqlInput');
  if (el && _sqlSamples[i] != null) el.value = _sqlSamples[i];
}

// ── sql.js 초기화 (CDN WASM 로드) ─────────────────────────────
async function _initSqlJs() {
  if (_sqlJs) return _sqlJs;
  if (typeof initSqlJs === 'undefined') {
    showToast('❌ SQL.js 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.');
    return null;
  }
  try {
    _sqlJs = await initSqlJs({
      locateFile: f => `https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/${f}`
    });
    return _sqlJs;
  } catch(e) {
    showToast('❌ SQL.js 초기화 실패: ' + e.message);
    return null;
  }
}

// ── SQLite 호환 DDL 생성 ───────────────────────────────────────
function _buildSqliteDDL() {
  const esc  = s => (s || '').replace(/'/g, "''");
  const quot = s => `"${s}"`;
  const lines = [];

  ENTITIES.forEach(ent => {
    const tbl   = ent.physicalName || ent.id;
    const attrs = ent.attrs || [];
    const pkCols = attrs.filter(a => a.kind === 'pk').map(a => a.physicalName || a.logicalName || 'col');
    const isCompositePK = pkCols.length > 1;
    const colLines = [];

    attrs.forEach(a => {
      const col = a.physicalName || a.logicalName || 'col';
      // SQLite type affinity
      let type = (a.type || 'TEXT').toUpperCase();
      if (/INT/.test(type))              type = 'INTEGER';
      else if (/CHAR|CLOB|TEXT/.test(type)) type = 'TEXT';
      else if (/REAL|FLOAT|DOUBLE/.test(type)) type = 'REAL';
      else if (/BLOB/.test(type))        type = 'BLOB';
      else if (/DEC|NUM/.test(type))     type = 'NUMERIC';
      else                               type = 'TEXT';

      let def = `  ${quot(col)} ${type}`;
      if (a.kind === 'pk' && !isCompositePK) {
        def += ' PRIMARY KEY';
        if (a.autoIncrement && type === 'INTEGER') def += ' AUTOINCREMENT';
      }
      if ((a.notNull || a.kind === 'pk') && !(a.kind === 'pk' && !isCompositePK)) def += ' NOT NULL';
      if (a.unique && a.kind !== 'pk') def += ' UNIQUE';
      if (a.defaultValue) def += ` DEFAULT '${esc(a.defaultValue)}'`;
      colLines.push(def);
    });

    if (isCompositePK) colLines.push(`  PRIMARY KEY (${pkCols.map(quot).join(', ')})`);

    lines.push(`CREATE TABLE IF NOT EXISTS ${quot(tbl)} (`);
    lines.push(colLines.join(',\n'));
    lines.push(');');
    lines.push('');
  });

  return lines.join('\n');
}

// ── 모달 열기 ─────────────────────────────────────────────────
async function openSqlRunner() {
  if (!document.getElementById('sqlRunnerOverlay')) {
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'sqlRunnerOverlay';
    el.setAttribute('onmousedown', "overlayCloseExtra(event,'sqlRunnerOverlay')");
    el.innerHTML = `
      <div class="modal" style="width:900px;max-width:97vw" onmousedown.stop>
        <h3>🗄 SQL 실행기
          <span style="font-size:11px;font-weight:normal;color:var(--tx-sub)">SQLite · in-browser</span>
        </h3>

        <!-- 툴바 -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <button class="btn-save-m" onclick="loadSqlSchema()">📋 스키마 불러오기</button>
          <button class="btn" onclick="resetSqlDb()">↺ DB 초기화</button>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:var(--tx-sub)">
            <input type="checkbox" id="sqlShowDdl" onchange="toggleSqlDdlPreview()"> DDL 보기
          </label>
          <span id="sqlDbStatus" style="font-size:11px;color:var(--tx-sub);margin-left:4px">스키마 미로드</span>
        </div>

        <!-- DDL 미리보기 -->
        <pre id="sqlSchemaPreview"
          style="display:none;background:var(--bg-surface);border:1px solid var(--bd2);
            border-radius:6px;padding:8px 12px;font-size:11px;font-family:Consolas,monospace;
            max-height:130px;overflow-y:auto;margin-bottom:10px;color:var(--tx-sub);white-space:pre;
            line-height:1.5"></pre>

        <!-- 샘플 쿼리 버튼 -->
        <div id="sqlSampleBtns" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>

        <!-- 쿼리 입력 -->
        <div style="position:relative">
          <textarea id="sqlInput" class="form-input" rows="4"
            style="font-family:Consolas,monospace;font-size:13px;resize:vertical;
              min-height:90px;padding-right:90px;line-height:1.6"
            placeholder="SELECT * FROM &quot;테이블명&quot; LIMIT 10;&#10;&#10;-- Ctrl+Enter 로 실행"></textarea>
          <button class="btn-save-m" onclick="runSqlQuery()"
            style="position:absolute;right:8px;bottom:8px;padding:5px 14px">▶ 실행</button>
        </div>

        <!-- 결과 -->
        <div id="sqlResults" style="margin-top:10px;max-height:320px;overflow:auto"></div>

        <div class="modal-actions">
          <button class="btn-cancel-m"
            onclick="document.getElementById('sqlRunnerOverlay').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    // Ctrl+Enter 단축키
    document.getElementById('sqlInput').addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault(); runSqlQuery();
      }
    });
  }

  document.getElementById('sqlRunnerOverlay').classList.add('active');

  if (!_sqlJs) {
    document.getElementById('sqlDbStatus').textContent = 'SQL.js 로딩 중…';
    const SQL = await _initSqlJs();
    if (!SQL) { document.getElementById('sqlDbStatus').textContent = '❌ 로드 실패'; return; }
    document.getElementById('sqlDbStatus').textContent = '준비됨 — 스키마를 불러오세요';
  }
}

// ── 스키마 로드 ────────────────────────────────────────────────
async function loadSqlSchema() {
  const SQL = await _initSqlJs();
  if (!SQL) return;

  if (!ENTITIES.length) { showToast('엔티티가 없습니다.'); return; }

  if (_sqlDb) { _sqlDb.close(); _sqlDb = null; }
  _sqlDb = new SQL.Database();

  const ddl = _buildSqliteDDL();
  try {
    _sqlDb.run(ddl);
  } catch(e) {
    showToast('❌ DDL 오류: ' + e.message);
    document.getElementById('sqlDbStatus').textContent = '❌ ' + e.message;
    return;
  }

  // DDL 미리보기 업데이트
  document.getElementById('sqlSchemaPreview').textContent = ddl;
  document.getElementById('sqlDbStatus').textContent =
    `✅ ${ENTITIES.length}개 테이블 로드됨`;

  _renderSampleButtons();
  document.getElementById('sqlResults').innerHTML = '';
  showToast(`✅ ${ENTITIES.length}개 테이블 스키마 로드 완료`);
}

// ── 샘플 쿼리 버튼 ────────────────────────────────────────────
function _renderSampleButtons() {
  const el = document.getElementById('sqlSampleBtns');
  if (!el) return;

  const samples = [];

  // 테이블별 SELECT
  ENTITIES.slice(0, 4).forEach(e => {
    const tbl = e.physicalName || e.id;
    samples.push({ label: tbl, sql: `SELECT * FROM "${tbl}" LIMIT 20;` });
  });

  // JOIN 샘플 (첫 번째 관계)
  if (RELATIONS.length) {
    const r = RELATIONS[0];
    const fe = ENTITIES.find(e => e.id === r.from);
    const te = ENTITIES.find(e => e.id === r.to);
    if (fe && te) {
      const ft = fe.physicalName || fe.id;
      const tt = te.physicalName || te.id;
      const fkAttr = fe.attrs.find(a => a.kind === 'fk' && a.ref?.entity === te.id)
                  || te.attrs.find(a => a.kind === 'fk' && a.ref?.entity === fe.id);
      const pkFt = fe.attrs.find(a => a.kind === 'pk');
      const pkTt = te.attrs.find(a => a.kind === 'pk');
      const cond = fkAttr
        ? (fkAttr.ref?.entity === te.id
          ? `"${ft}"."${fkAttr.physicalName||fkAttr.logicalName}" = "${tt}"."${pkTt?.physicalName||pkTt?.logicalName||'id'}"`
          : `"${tt}"."${fkAttr.physicalName||fkAttr.logicalName}" = "${ft}"."${pkFt?.physicalName||pkFt?.logicalName||'id'}"`)
        : `"${ft}".id = "${tt}".id`;
      samples.push({ label: 'JOIN', sql: `SELECT *\nFROM "${ft}"\nJOIN "${tt}" ON ${cond}\nLIMIT 20;` });
    }
  }

  // 테이블 목록
  samples.push({ label: '테이블 목록', sql: `SELECT name FROM sqlite_master WHERE type='table';` });

  // 전역 배열에 저장 → onclick 에서 인덱스로 참조 (따옴표 이스케이프 문제 회피)
  _sqlSamples = samples.map(s => s.sql);

  el.innerHTML = samples.map((s, i) =>
    `<button class="btn" style="font-size:11px;padding:3px 9px"
      onclick="_sqlSetInput(${i})"
      >${escHtml(s.label)}</button>`
  ).join('');
}

// ── DDL 미리보기 토글 ─────────────────────────────────────────
function toggleSqlDdlPreview() {
  const show = document.getElementById('sqlShowDdl').checked;
  document.getElementById('sqlSchemaPreview').style.display = show ? 'block' : 'none';
}

// ── 쿼리 실행 ─────────────────────────────────────────────────
function runSqlQuery() {
  const sql    = document.getElementById('sqlInput').value.trim();
  const result = document.getElementById('sqlResults');
  if (!sql) return;

  if (!_sqlDb) {
    result.innerHTML = '<p style="color:var(--ac-r);font-size:12px">먼저 「📋 스키마 불러오기」를 실행하세요.</p>';
    return;
  }

  try {
    const t0      = performance.now();
    const results = _sqlDb.exec(sql);
    const elapsed = (performance.now() - t0).toFixed(1);
    const modified = _sqlDb.getRowsModified();

    if (!results.length) {
      result.innerHTML =
        `<p style="color:var(--tx-sub);font-size:12px;padding:6px 0">
          ✅ 실행 완료 &nbsp;·&nbsp; 영향받은 행: <b>${modified}</b>개 &nbsp;·&nbsp; ${elapsed}ms
        </p>`;
      return;
    }

    let html = '';
    results.forEach((res, qi) => {
      const rowCount = res.values.length;
      html += `<div style="margin-bottom:14px">`;
      html += `<div style="font-size:11px;color:var(--tx-sub);margin-bottom:5px">
        ${rowCount}행 반환 &nbsp;·&nbsp; ${elapsed}ms
        ${results.length > 1 ? ` &nbsp;·&nbsp; 결과 ${qi+1}` : ''}
      </div>`;
      html += `<div style="overflow-x:auto">`;
      html += `<table style="border-collapse:collapse;font-size:12px;font-family:Consolas,monospace;min-width:100%">`;
      // 헤더
      html += `<thead><tr>`;
      res.columns.forEach(col => {
        html += `<th style="padding:5px 12px;background:var(--bg-surface);border:1px solid var(--bd2);
          text-align:left;color:var(--ac);font-weight:600;white-space:nowrap">${escHtml(col)}</th>`;
      });
      html += `</tr></thead><tbody>`;
      // 데이터
      res.values.forEach((row, ri) => {
        html += `<tr style="${ri%2===1 ? 'background:var(--bg-surface)' : ''}">`;
        row.forEach(cell => {
          const isNull = cell === null || cell === undefined;
          const disp   = isNull
            ? `<span style="color:var(--tx-muted);font-style:italic">NULL</span>`
            : escHtml(String(cell));
          html += `<td style="padding:4px 12px;border:1px solid var(--bd2);
            color:var(--tx-main);white-space:nowrap;max-width:320px;overflow:hidden;
            text-overflow:ellipsis">${disp}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div></div>`;
    });

    result.innerHTML = html;
  } catch(e) {
    result.innerHTML =
      `<div style="color:var(--ac-r);background:var(--bg-surface);padding:10px 14px;
        border-radius:6px;font-family:Consolas,monospace;font-size:12px;
        border-left:3px solid var(--ac-r)">❌ ${escHtml(e.message)}</div>`;
  }
}

// ── DB 초기화 ─────────────────────────────────────────────────
function resetSqlDb() {
  if (_sqlDb) { _sqlDb.close(); _sqlDb = null; }
  const statusEl  = document.getElementById('sqlDbStatus');
  const resultEl  = document.getElementById('sqlResults');
  const previewEl = document.getElementById('sqlSchemaPreview');
  const sampleEl  = document.getElementById('sqlSampleBtns');
  if (statusEl)  statusEl.textContent = '스키마 미로드';
  if (resultEl)  resultEl.innerHTML   = '';
  if (previewEl) { previewEl.textContent = ''; previewEl.style.display = 'none'; }
  if (sampleEl)  sampleEl.innerHTML   = '';
  const cb = document.getElementById('sqlShowDdl');
  if (cb) cb.checked = false;
  showToast('DB 초기화 완료');
}
