// ── 하단 패널 (VSCode 스타일, 서브탭) ────────────────────────────
// 하단에 서브탭 기반 패널을 제공한다. 첫 탭은 "SQL 실행" — 연결된 DB(미들웨어)에
// SQL을 실행하고 결과를 표로 보여준다. 이후 탭(로그·콘솔 등)을 쉽게 추가할 수 있다.
// 좌측 #explorerPanel · 우측 #diagramPanel 과 독립적으로 동작한다.

let bottomOpen  = false;       // 패널 열림 상태 (캔버스 하단 오프셋 계산에 사용)
let BOTTOM_H    = 280;         // 패널 높이(px) — canvas.js _bottomOff()에서 참조
let _bottomTab  = 'sql';       // 현재 활성 서브탭

// 캔버스가 하단 패널을 피하도록 차감할 높이
function _bottomOff() { return bottomOpen ? BOTTOM_H : 0; }

// ── 패널 토글 ──────────────────────────────────────────────────
function toggleBottomPanel() {
  bottomOpen = !bottomOpen;
  _applyBottomState();
  try { localStorage.setItem('_bottomOpen', bottomOpen ? '1' : '0'); } catch {}
  if (typeof render === 'function') render();
}

// 현재 bottomOpen 값에 맞춰 DOM 표시·레이아웃·메뉴 체크를 적용한다.
function _applyBottomState() {
  const bp  = document.getElementById('bottomPanel');
  const tab = document.getElementById('bottomReopenTab');
  if (!bp) return;
  bp.style.height = BOTTOM_H + 'px';

  if (bottomOpen) {
    bp.style.visibility = '';
    bp.classList.remove('collapsed');
    bp.style.transform = '';
    if (_bottomTab === 'sql') _bpRefreshConn();
  } else {
    bp.classList.add('collapsed');
    bp.style.transform = 'translateY(100%)';
    bp.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'transform') return;
      bp.removeEventListener('transitionend', onEnd);
      if (!bottomOpen) bp.style.visibility = 'hidden';
    });
  }
  if (tab) tab.classList.toggle('visible', !bottomOpen);

  const mbi = document.getElementById('mbi-bottom');
  if (mbi) { const chk = mbi.querySelector('.mb-chk'); if (chk) chk.textContent = bottomOpen ? '✓' : ''; }
  _layoutBottomPanel();
  _syncLayoutButtons();
}

// ── 메뉴바 레이아웃 토글 버튼 활성 상태 동기화 (좌·하·우·전체 공통) ──
function _syncLayoutButtons() {
  const l = typeof explorerOpen !== 'undefined' && explorerOpen;
  const b = typeof bottomOpen   !== 'undefined' && bottomOpen;
  const r = typeof panelOpen    !== 'undefined' && panelOpen;
  const set = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('active', !!on); };
  set('layoutBtnLeft',   l);
  set('layoutBtnBottom', b);
  set('layoutBtnRight',  r);
  set('layoutBtnAll',    l && b && r);
  // "모든 패널" 메뉴 체크마크 동기화
  const mbiAll = document.getElementById('mbi-allpanels');
  if (mbiAll) { const chk = mbiAll.querySelector('.mb-chk'); if (chk) chk.textContent = (l && b && r) ? '✓' : ''; }
}

// ── 세 패널 일괄 토글 ──────────────────────────────────────────
// 하나라도 닫혀 있으면 모두 열고, 모두 열려 있으면 모두 닫는다.
function toggleAllPanels() {
  const l = typeof explorerOpen !== 'undefined' && explorerOpen;
  const b = typeof bottomOpen   !== 'undefined' && bottomOpen;
  const r = typeof panelOpen    !== 'undefined' && panelOpen;
  const open = !(l && b && r);   // 목표 상태: 하나라도 닫혀있으면 열기(true)
  if (l !== open && typeof toggleExplorerPanel === 'function') toggleExplorerPanel();
  if (b !== open && typeof toggleBottomPanel   === 'function') toggleBottomPanel();
  if (r !== open && typeof toggleDiagramPanel  === 'function') toggleDiagramPanel();
}

// 좌·우 패널 오프셋에 맞춰 하단 패널의 가로 범위를 정렬한다. (renderNow에서 매 프레임 호출)
function _layoutBottomPanel() {
  const bp  = document.getElementById('bottomPanel');
  const tab = document.getElementById('bottomReopenTab');
  const leftOff  = (typeof _qbLeftOff === 'function') ? _qbLeftOff() : 0;
  const rightOff = (typeof panelOpen !== 'undefined' && panelOpen && typeof PANEL_W !== 'undefined') ? PANEL_W : 0;
  if (bp)  { bp.style.left = leftOff + 'px'; bp.style.right = rightOff + 'px'; }
  if (tab) { tab.style.right = (rightOff + 14) + 'px'; }
  // 좌측 하단 범례·미니맵이 패널에 가리지 않도록 위로 올린다.
  const blp = document.getElementById('bottomLeftPanel');
  if (blp) blp.style.bottom = (bottomOpen ? (22 + BOTTOM_H + 8) : 28) + 'px';
}

// ── 서브탭 전환 ────────────────────────────────────────────────
function switchBottomTab(name) {
  _bottomTab = name;
  document.querySelectorAll('.bp-tab').forEach(b => b.classList.toggle('active', b.dataset.bptab === name));
  document.querySelectorAll('.bp-view').forEach(v => v.classList.toggle('active', v.dataset.bpview === name));
  if (name === 'sql') _bpRefreshConn();
}

// ── SQL 실행 (연결된 DB / 미들웨어 POST /execute) ────────────────
function bpSqlKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); bpRunSql(); }
}

async function bpRunSql() {
  const input = document.getElementById('bpSqlInput');
  const out   = document.getElementById('bpSqlResult');
  if (!input || !out) return;
  const sql = (input.value || '').trim();
  if (!sql) return;

  out.innerHTML = '<div class="bp-sql-msg">실행 중…</div>';
  const base = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
  let res;
  try {
    const r = await fetch(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(60000),
    });
    res = await r.json();
  } catch (e) {
    out.innerHTML = '<div class="bp-sql-err">미들웨어에 연결할 수 없습니다. AgenticERM 미들웨어가 실행 중인지, DB 프로파일이 설정되어 있는지 확인하세요.</div>';
    return;
  }
  if (!res || res.ok === false) {
    out.innerHTML = `<div class="bp-sql-err">${escHtml((res && res.error) || '실행 실패')}</div>`;
    return;
  }
  _bpRenderResult(res, out);
}

function _bpRenderResult(res, out) {
  const rows = res.rows || [];
  const rowCount = (res.rowCount != null) ? res.rowCount : rows.length;
  const dur  = (res.duration != null) ? `${res.duration}ms` : '';
  const meta = `<div class="bp-sql-meta">✅ 실행 완료 · <b>${rowCount}</b>행${dur ? ' · ' + dur : ''}</div>`;

  if (!rows.length) {
    out.innerHTML = meta + '<div class="bp-sql-msg">반환된 행이 없습니다.</div>';
    return;
  }
  const cols = (res.fields && res.fields.length) ? res.fields : Object.keys(rows[0]);
  let html = meta + '<div class="bp-sql-table-wrap"><table class="bp-sql-table"><thead><tr>';
  cols.forEach(c => { html += `<th>${escHtml(String(c))}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    cols.forEach(c => {
      const v = row[c];
      const isNull = v === null || v === undefined;
      html += `<td>${isNull ? '<span class="bp-null">NULL</span>' : escHtml(String(v))}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  out.innerHTML = html;
}

// ── 연결 상태 표시 ─────────────────────────────────────────────
async function _bpRefreshConn() {
  const el = document.getElementById('bpSqlConn');
  if (!el) return;
  el.className = 'bp-sql-conn';
  el.textContent = 'DB: 확인 중…';
  try {
    const cfg = (typeof _mwGetConfig === 'function') ? await _mwGetConfig() : null;
    if (cfg && cfg.configured) {
      el.textContent = `DB: ${cfg.dbType || '?'}${cfg.database ? ' · ' + cfg.database : ''}`;
      el.classList.add('connected');
    } else {
      el.textContent = 'DB: 미연결 — DB 프로파일을 설정하세요';
      el.classList.add('disconnected');
    }
  } catch {
    el.textContent = 'DB: 미들웨어 미실행';
    el.classList.add('disconnected');
  }
}

// ── 높이 드래그 조절 ───────────────────────────────────────────
(function initBottomResize() {
  let dragging = false, startY = 0, startH = 0;
  window.addEventListener('DOMContentLoaded', () => {
    const handle = document.getElementById('bottomPanelResize');
    const bp     = document.getElementById('bottomPanel');
    if (!handle || !bp) return;
    const saved = parseInt(localStorage.getItem('_bottomH') || '0');
    if (saved >= 120 && saved <= 800) BOTTOM_H = saved;
    bp.style.height = BOTTOM_H + 'px';
    handle.addEventListener('mousedown', e => {
      dragging = true; startY = e.clientY; startH = bp.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newH = Math.max(120, Math.min(window.innerHeight - 120, startH - (e.clientY - startY)));
      BOTTOM_H = newH; bp.style.height = newH + 'px';
      _layoutBottomPanel();
      if (typeof render === 'function') render();
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false; document.body.style.cursor = '';
      try { localStorage.setItem('_bottomH', BOTTOM_H); } catch {}
    });
  });
})();

// ── 초기화 ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  let saved = '0';
  try { saved = localStorage.getItem('_bottomOpen'); } catch {}
  bottomOpen = (saved === '1');   // 기본값: 닫힘
  _applyBottomState();
  if (bottomOpen && typeof render === 'function') render();
});
