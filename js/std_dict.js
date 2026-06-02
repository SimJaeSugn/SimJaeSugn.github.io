// ══════════════════════════════════════════════════════════════════
// 표준사전 관리 — 사이드카(Python)가 sqlite 파일을 직접 소유 (HTTP CRUD)
// word / domain / term 3테이블 CRUD · 검색 · 엑셀 업로드 · 시드 복원
// 데이터: 사이드카 시스템 DB aerm_storage(~/.uxermanager/aerm_storage.db) (브라우저 sql.js·IDB 미사용)
// ══════════════════════════════════════════════════════════════════

// ── 모듈 전용 전역 ────────────────────────────────────────────────
// 표준사전 데이터는 사이드카(Python)의 시스템 DB aerm_storage(~/.uxermanager/aerm_storage.db)에
// 저장된다. 프론트는 HTTP CRUD만 수행 (sql.js·IndexedDB 미사용).
const STD_BASE   = (typeof MW_URL !== 'undefined' ? MW_URL : 'http://127.0.0.1:3737') + '/stddict';
let   _stdReady    = false;   // 사이드카 사전 로드 완료 여부
let   _stdRowCache = {};      // 마지막 렌더 행 캐시 (id→row, 인라인 편집 현재값 조회용)

// ── 테이블 / 컬럼 화이트리스트 (SQL 인젝션 방지) ──────────────────
const STD_TABLES = { word: 1, domain: 1, term: 1 };

const STD_COLS = {
  word: [
    'name','abbr','full_name','descr','domain_class',
    'format_word','synonym','forbidden','revision','org',
    'approved','reg_user','reg_at','upd_user','upd_at'
  ],
  domain: [
    'class_name','name','group_name','descr','data_type',
    'len','scale','store_fmt','disp_fmt','unit','allowed',
    'revision','org','approved','reg_user','reg_at'
  ],
  term: [
    'name','abbr','descr','domain_name','allowed',
    'store_fmt','disp_fmt','gov_code_name','gov_org','synonym',
    'revision','org','approved','reg_user','reg_at'
  ]
};

// 감사 컬럼 (insert/update 자동 세팅, 폼 입력 제외)
const STD_AUDIT_COLS = new Set(['reg_user','reg_at','upd_user','upd_at']);

// 각 테이블의 주 검색 컬럼
const STD_SEARCH_COLS = {
  word:   ['name','abbr','descr'],
  domain: ['name','class_name','descr'],
  term:   ['name','abbr','descr']
};

// 테이블별 한글 레이블
const STD_TABLE_LABELS = {
  word:   '표준단어',
  domain: '표준도메인',
  term:   '표준용어'
};

// 컬럼 한글 레이블
const STD_COL_LABELS = {
  name:         '표준명',
  abbr:         '영문약어',
  full_name:    '영문전체명',
  descr:        '설명',
  domain_class: '도메인분류',
  format_word:  '형식단어',
  synonym:      '이음동의어',
  forbidden:    '금칙어',
  revision:     '개정구분',
  org:          '조직구분',
  approved:     '승인여부',
  reg_user:     '등록자',
  reg_at:       '등록일시',
  upd_user:     '수정자',
  upd_at:       '수정일시',
  class_name:   '도메인분류명',
  group_name:   '도메인그룹명',
  data_type:    '데이터타입',
  len:          '길이',
  scale:        '소수점',
  store_fmt:    '저장형식',
  disp_fmt:     '표현형식',
  unit:         '단위',
  allowed:      '허용값',
  domain_name:  '도메인명',
  gov_code_name:'행정표준코드명',
  gov_org:      '소관기관명'
};

// ── 사이드카 HTTP 헬퍼 ────────────────────────────────────────────
/** /stddict 엔드포인트 호출. 실패 시 detail 메시지를 담아 throw. */
async function _stdFetch(path, opts) {
  const res = await fetch(STD_BASE + path, opts);
  if (!res.ok) {
    let msg = res.statusText || ('HTTP ' + res.status);
    try {
      const j = await res.json();
      const d = j && j.detail;
      if (d) msg = (typeof d === 'string') ? d : (d.error || JSON.stringify(d));
    } catch (_) {}
    throw new Error(msg);
  }
  return res;
}

// ── 시드 bytes 로드 (fetch → XHR 폴백, Electron file:// 대응) ────
async function _loadSeedBytes() {
  // 1차: fetch
  try {
    const res = await fetch('vendor/std.sqlite');
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch(e) {
    console.info('[std_dict] fetch 실패, XHR 폴백:', e.message);
  }

  // 2차: XHR arraybuffer 폴백 (Electron file:// 환경)
  return new Promise((res, rej) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'vendor/std.sqlite', true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status === 0 || xhr.status === 200) {   // file:// → status=0
        res(new Uint8Array(xhr.response));
      } else {
        rej(new Error(`XHR status ${xhr.status}`));
      }
    };
    xhr.onerror = () => rej(new Error('XHR 오류'));
    xhr.send();
  });
}

// ── 생명주기 ──────────────────────────────────────────────────────

/** 표준사전 로드 — 사이드카 상태 확인, 미초기화면 시드(vendor/std.sqlite) 주입 */
async function stdDictLoad() {
  // 사이드카 동작 여부 확인 (db_connect.js 의 _mwPing 재사용)
  const alive = (typeof _mwPing === 'function') ? await _mwPing() : true;
  if (!alive) {
    if (typeof _showMwNotRunning === 'function') _showMwNotRunning();
    showToast('❌ 표준사전은 사이드카(Python)가 실행 중일 때만 사용할 수 있습니다.');
    return false;
  }
  try {
    const st = await (await _stdFetch('/status')).json();
    if (!st.initialized) {
      const seeded = await _stdSeedFromVendor();
      if (!seeded) return false;
    }
    _stdReady = true;
    return true;
  } catch(e) {
    showToast('❌ 표준사전 상태 확인 실패: ' + e.message);
    console.error('[std_dict] status 실패:', e);
    return false;
  }
}

/** 시드(vendor/std.sqlite) bytes 를 사이드카에 주입 → 작업본 전체 교체 */
async function _stdSeedFromVendor() {
  try {
    const bytes = await _loadSeedBytes();
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'std.sqlite');
    await _stdFetch('/restore', { method: 'POST', body: fd });
    return true;
  } catch(e) {
    showToast('❌ 시드 주입 실패: ' + e.message);
    console.error('[std_dict] seed 주입 실패:', e);
    return false;
  }
}

/** 닫기 버튼 (모든 변경은 즉시 사이드카에 반영되므로 flush 불필요) */
function _stdDictClose() {
  const ov = document.getElementById('stdDictOverlay');
  if (ov) ov.classList.remove('active');
}

/** 오버레이 바깥 클릭 닫기 */
function _stdOverlayDown(e) {
  overlayCloseExtra(e, 'stdDictOverlay');
}

/** 시드로 복원 — 시드(vendor/std.sqlite)를 사이드카 작업본에 재주입 */
async function stdDictReset() {
  return await _stdSeedFromVendor();
}

// ── CRUD 함수 ─────────────────────────────────────────────────────

/**
 * 행 삽입 (감사 컬럼은 사이드카가 자동 설정)
 * @returns {Promise<number|null>} 삽입된 id 또는 null
 */
async function stdInsert(table, obj) {
  try {
    const r = await (await _stdFetch('/row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, values: obj }),
    })).json();
    return r.id ?? null;
  } catch(e) {
    showToast('❌ 삽입 오류: ' + e.message);
    return null;
  }
}

/**
 * 행 수정 (reg_* 보존·upd_* 자동 세팅은 사이드카가 처리)
 * @returns {Promise<boolean>}
 */
async function stdUpdate(table, id, obj) {
  try {
    await _stdFetch('/row/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, values: obj }),
    });
    return true;
  } catch(e) {
    showToast('❌ 수정 오류: ' + e.message);
    return false;
  }
}

/**
 * 행 삭제 (물리 삭제)
 * @returns {Promise<boolean>}
 */
async function stdDelete(table, id) {
  try {
    await _stdFetch('/row/' + id + '?table=' + encodeURIComponent(table), { method: 'DELETE' });
    return true;
  } catch(e) {
    showToast('❌ 삭제 오류: ' + e.message);
    return false;
  }
}

/**
 * 검색 + 총건수 (사이드카 /list)
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function stdList(table, keyword, opts = {}) {
  const { onlyApproved = false, limit = 50, offset = 0 } = opts;
  const qs = new URLSearchParams({
    table,
    q: keyword || '',
    onlyApproved: onlyApproved ? 'true' : 'false',
    limit: String(limit),
    offset: String(offset),
  });
  try {
    return await (await _stdFetch('/list?' + qs.toString())).json();
  } catch(e) {
    showToast('❌ 조회 오류: ' + e.message);
    return { rows: [], total: 0 };
  }
}

/** 단건 조회 — 마지막 렌더 행 캐시에서 (인라인 편집 현재값용) */
function stdGet(table, id) {
  return _stdRowCache[id] || null;
}

/** 엑셀(.xlsx) 업로드 → 사이드카가 파싱·전체 재구성 → { counts } */
async function _stdImportExcel(file) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  return await (await _stdFetch('/import-excel', { method: 'POST', body: fd })).json();
}

// ── .sqlite 내보내기 (사이드카 작업본 다운로드) ───────────────────
function _stdExportSqlite() {
  if (!_stdReady) { showToast('사전이 로드되지 않았습니다.'); return; }
  const a    = document.createElement('a');
  a.href     = STD_BASE + '/export';
  a.download = `std_dict_${new Date().toISOString().slice(0,10)}.sqlite`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('📥 사전 내보내기');
}

// ══════════════════════════════════════════════════════════════════
// UI — 표준사전 관리 모달 (lazy 생성)
// ══════════════════════════════════════════════════════════════════

// 현재 모달 상태
const _stdUi = {
  table:       'word',    // 현재 탭
  keyword:     '',        // 검색어
  onlyApproved: false,    // 승인만 보기
  page:        0,         // 현재 페이지 (0-based)
  pageSize:    50,        // 페이지당 행 수
  loading:     false      // 로딩 중 여부
};

/** 표준사전 관리 모달 열기 (진입 함수) */
async function openStdDict() {
  _stdEnsureModal();
  document.getElementById('stdDictOverlay').classList.add('active');
  await _stdDictOpen();
}

/** 모달 DOM 지연 생성 */
function _stdEnsureModal() {
  if (document.getElementById('stdDictOverlay')) return;

  // 인라인 편집 셀 호버/입력 스타일 (1회 주입)
  if (!document.getElementById('stdDictInlineStyle')) {
    const st = document.createElement('style');
    st.id = 'stdDictInlineStyle';
    st.textContent =
      '.std-cell-edit{cursor:text}' +
      '.std-cell-edit:hover{background:var(--bg-hover,rgba(91,157,255,.12))!important;box-shadow:inset 0 0 0 1px var(--ac,#5b9dff)}' +
      '.std-inline-input{width:100%;box-sizing:border-box;font-size:12px;padding:2px 4px;' +
        'border:1px solid var(--ac,#5b9dff);border-radius:3px;' +
        'background:var(--bg-base,#11141a);color:var(--tx-main,#e6e9ef)}' +
      '.std-inline-input:focus{outline:none}' +
      // ── 양축 스크롤 + 테마 연동 스크롤바 ──
      '#stdDictList{scrollbar-width:thin;scrollbar-color:var(--bd2) var(--bg-panel,transparent)}' +
      '#stdDictList::-webkit-scrollbar{width:11px;height:11px}' +
      '#stdDictList::-webkit-scrollbar-track{background:var(--bg-panel,transparent)}' +
      '#stdDictList::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:6px;' +
        'border:2px solid var(--bg-panel,transparent);background-clip:padding-box}' +
      '#stdDictList::-webkit-scrollbar-thumb:hover{background:var(--ac,#5b9dff);background-clip:padding-box}' +
      '#stdDictList::-webkit-scrollbar-corner{background:var(--bg-panel,transparent)}';
    document.head.appendChild(st);
  }

  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.id = 'stdDictOverlay';
  el.setAttribute('onmousedown', "_stdOverlayDown(event)");

  el.innerHTML = `
    <div class="modal" style="width:980px;max-width:97vw;max-height:92vh;display:flex;flex-direction:column" onmousedown.stop>
      <h3 style="margin:0 0 12px;flex-shrink:0">
        📚 표준사전 관리
        <span style="font-size:11px;font-weight:normal;color:var(--tx-sub)">word · domain · term · 셀 클릭 시 바로 편집 (Enter 저장 · Esc 취소)</span>
      </h3>

      <!-- 탭 -->
      <div id="stdDictTabs" style="display:flex;gap:4px;margin-bottom:12px;flex-shrink:0">
        <button class="btn-std-tab active" data-tab="word"   onclick="_stdSwitchTab('word')">표준단어</button>
        <button class="btn-std-tab"        data-tab="domain" onclick="_stdSwitchTab('domain')">표준도메인</button>
        <button class="btn-std-tab"        data-tab="term"   onclick="_stdSwitchTab('term')">표준용어</button>
      </div>

      <!-- 검색바 -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;flex-shrink:0">
        <input id="stdDictSearch" class="form-input" type="text"
          placeholder="검색어 입력 (표준명·약어·설명)"
          style="flex:1;min-width:160px;max-width:360px">
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:var(--tx-sub);white-space:nowrap">
          <input type="checkbox" id="stdApprovedToggle" onchange="_stdToggleApproved(this.checked)">
          승인만 보기
        </label>
        <span id="stdDictCount" style="font-size:11px;color:var(--tx-sub);margin-left:4px"></span>
        <div style="flex:1"></div>
        <button class="btn-save-m" onclick="_stdOpenAddForm()">+ 추가</button>
        <button class="btn" onclick="_stdConfirmExcelUpload()" title="엑셀(.xlsx)로 전체 교체">⬆ 엑셀 업로드</button>
        <input type="file" id="stdExcelInput" accept=".xlsx" style="display:none" onchange="_stdHandleExcelFile(this)">
        <button class="btn" onclick="_stdConfirmReset()" title="시드로 복원">↺ 시드 복원</button>
        <button class="btn" onclick="_stdExportSqlite()" title=".sqlite 내보내기">⬇ 내보내기</button>
      </div>

      <!-- 목록 -->
      <div id="stdDictList" style="flex:1;overflow:auto;min-height:200px;border:1px solid var(--bd2);border-radius:6px">
        <div id="stdDictListBody">
          <div style="padding:24px;text-align:center;color:var(--tx-sub);font-size:13px" id="stdDictLoadMsg">
            사전 준비 중...
          </div>
        </div>
      </div>

      <!-- 페이지네이션 -->
      <div id="stdDictPaging" style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px;flex-shrink:0;font-size:13px">
        <button class="btn" id="stdPrevBtn" onclick="_stdPrevPage()">◀ 이전</button>
        <span id="stdPageInfo" style="color:var(--tx-sub)"></span>
        <button class="btn" id="stdNextBtn" onclick="_stdNextPage()">다음 ▶</button>
      </div>

      <div class="modal-actions" style="flex-shrink:0">
        <button class="btn-cancel-m" onclick="_stdDictClose()">닫기</button>
      </div>
    </div>`;

  document.body.appendChild(el);

  // 검색 디바운스 타이머 (키워드·페이지 리셋 + 리프레시를 단일 핸들러로 통합)
  let _searchTimer = null;
  document.getElementById('stdDictSearch').addEventListener('input', (e) => {
    _stdUi.keyword = e.target.value;
    _stdUi.page    = 0;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => _stdRefreshList(), 350);
  });

}

// ── 탭 전환 ──────────────────────────────────────────────────────
function _stdSwitchTab(tab) {
  _stdUi.table   = tab;
  _stdUi.keyword = '';
  _stdUi.page    = 0;

  // 탭 버튼 active 전환
  document.querySelectorAll('.btn-std-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // 검색어 초기화
  const inp = document.getElementById('stdDictSearch');
  if (inp) inp.value = '';

  _stdRefreshList();
}

// ── 검색 ─────────────────────────────────────────────────────────
function _stdToggleApproved(checked) {
  _stdUi.onlyApproved = checked;
  _stdUi.page = 0;
  _stdRefreshList();
}

// ── 페이지네이션 ─────────────────────────────────────────────────
function _stdPrevPage() {
  if (_stdUi.page > 0) { _stdUi.page--; _stdRefreshList(); }
}
function _stdNextPage() {
  _stdUi.page++;
  _stdRefreshList();
}

// ── 목록 렌더링 ──────────────────────────────────────────────────
async function _stdRefreshList() {
  if (!_stdReady) return;
  const { table, keyword, onlyApproved, page, pageSize } = _stdUi;
  const offset = page * pageSize;

  const { rows, total } = await stdList(table, keyword, { onlyApproved, limit: pageSize, offset });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page >= totalPages && totalPages > 0) {
    _stdUi.page = totalPages - 1;
    return _stdRefreshList();
  }

  // 인라인 편집 현재값 조회용 캐시 갱신
  _stdRowCache = {};
  rows.forEach(r => { _stdRowCache[r.id] = r; });

  // 카운트 표시
  const countEl = document.getElementById('stdDictCount');
  if (countEl) countEl.textContent = `총 ${total.toLocaleString()}건`;

  // 페이지 정보
  const pageInfoEl = document.getElementById('stdPageInfo');
  if (pageInfoEl) pageInfoEl.textContent = `${page + 1} / ${totalPages}`;

  const prevBtn = document.getElementById('stdPrevBtn');
  const nextBtn = document.getElementById('stdNextBtn');
  if (prevBtn) prevBtn.disabled = page === 0;
  if (nextBtn) nextBtn.disabled = page + 1 >= totalPages;

  // 테이블 렌더
  const cols = STD_COLS[table];
  // 목록에서 감사컬럼 중 일부 축약 표시 (모든 컬럼 표시 시 너무 넓음)
  const displayCols = cols.filter(c => !['reg_user','upd_user','upd_at'].includes(c));

  let html = `<table style="width:max-content;min-width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="background:var(--bg-surface,#1e2130);position:sticky;top:0;z-index:1">
        ${displayCols.map(c => `<th style="padding:6px 8px;border:1px solid var(--bd2);text-align:left;white-space:nowrap;font-weight:600;color:var(--tx-sub)">${STD_COL_LABELS[c]||c}</th>`).join('')}
        <th style="padding:6px 8px;border:1px solid var(--bd2);width:60px;position:sticky;right:0;z-index:3;background:var(--bg-surface,#1e2130);border-left:2px solid var(--bd2);box-shadow:-4px 0 6px -4px rgba(0,0,0,.45)">작업</th>
      </tr>
    </thead>
    <tbody>`;

  if (!rows.length) {
    html += `<tr><td colspan="${displayCols.length + 1}" style="padding:20px;text-align:center;color:var(--tx-sub)">검색 결과 없음</td></tr>`;
  } else {
    const baseTd = 'padding:5px 8px;border:1px solid var(--bd2);vertical-align:middle;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    rows.forEach(row => {
      html += `<tr>
        ${displayCols.map(c => {
          const v = row[c];
          let cell = v == null ? '' : String(v);
          if (cell.length > 30) cell = cell.slice(0, 28) + '…';
          const titleAttr = (v == null ? '' : String(v)).replace(/"/g, '&quot;');
          // 감사 컬럼(등록일시 등)은 편집 불가, 그 외는 셀 인라인 편집
          if (STD_AUDIT_COLS.has(c)) {
            return `<td style="${baseTd};color:var(--tx-sub)" title="${titleAttr}">${_stdEsc(cell)}</td>`;
          }
          return `<td class="std-cell-edit" style="${baseTd}" title="${titleAttr}"
            onclick="_stdBeginInlineEdit(this,'${table}',${row.id},'${c}')">${_stdEsc(cell)}</td>`;
        }).join('')}
        <td style="padding:5px 8px;border:1px solid var(--bd2);text-align:center;white-space:nowrap;position:sticky;right:0;z-index:1;background:var(--bg-surface,#1e2130);border-left:2px solid var(--bd2);box-shadow:-4px 0 6px -4px rgba(0,0,0,.45)">
          <button class="btn" style="padding:2px 8px;font-size:11px" onclick="_stdConfirmDelete('${table}',${row.id})">삭제</button>
        </td>
      </tr>`;
    });
  }

  html += '</tbody></table>';

  const body = document.getElementById('stdDictListBody');
  if (body) body.innerHTML = html;
}

function _stdEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── 인라인 셀 편집 ────────────────────────────────────────────────
/** 셀 표시 내용 갱신 (편집 커밋 후) */
function _stdSetCellDisplay(td, val) {
  const s = val == null ? '' : String(val);
  let cell = s;
  if (cell.length > 30) cell = cell.slice(0, 28) + '…';
  td.innerHTML = _stdEsc(cell);
  td.setAttribute('title', s);   // setAttribute는 raw 문자열 (브라우저가 이스케이프)
}

/** 셀 클릭 → 그 자리에서 input으로 편집. Enter/blur 저장, Esc 취소 */
function _stdBeginInlineEdit(td, table, id, col) {
  if (!_stdReady || _stdUi.loading) return;
  if (td.querySelector('input')) return;   // 이미 편집 중

  const row = stdGet(table, id);
  if (!row) { showToast('행을 찾을 수 없습니다.'); _stdRefreshList(); return; }
  const cur = row[col] == null ? '' : String(row[col]);

  const prevHtml  = td.innerHTML;
  const prevTitle = td.getAttribute('title') || '';

  // 테이블이 width:max-content 자동 레이아웃이라, 셀 내용을 input(width:100%)으로
  // 바꾸면 컬럼 폭이 재계산되어 셀이 점프한다. 편집 진입 직전 셀의 현재 렌더 폭을
  // 측정해 고정(box-sizing:border-box)하면 텍스트양에 맞는 폭이 그대로 유지된다.
  const pinW = Math.round(td.getBoundingClientRect().width);
  const prevInline = {
    width: td.style.width, minWidth: td.style.minWidth,
    maxWidth: td.style.maxWidth, boxSizing: td.style.boxSizing,
  };
  td.style.boxSizing = 'border-box';
  td.style.width = td.style.minWidth = td.style.maxWidth = pinW + 'px';
  const _unpin = () => {
    td.style.width     = prevInline.width;
    td.style.minWidth  = prevInline.minWidth;
    td.style.maxWidth  = prevInline.maxWidth;
    td.style.boxSizing = prevInline.boxSizing;
  };

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'std-inline-input';
  input.value = cur;
  td.innerHTML = '';
  td.removeAttribute('title');
  td.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    _unpin();   // 편집 종료 → 셀 폭 고정 해제 (다시 내용 기반 자동 폭)
    const newVal = input.value;
    if (commit && newVal !== cur) {
      const ok = await stdUpdate(table, id, { [col]: newVal });
      if (ok) {
        _stdSetCellDisplay(td, newVal);
        if (_stdRowCache[id]) _stdRowCache[id][col] = newVal;   // 캐시 동기화
        showToast(`✓ ${STD_COL_LABELS[col] || col} 수정됨`);
        return;
      }
      // 실패 시 원복 (stdUpdate가 오류 토스트 표시)
    }
    // 취소 / 변경 없음 / 실패 → 원래 표시 복원
    td.innerHTML = prevHtml;
    if (prevTitle) td.setAttribute('title', prevTitle);
  };

  input.addEventListener('keydown', (e) => {
    // 한글 등 IME 조합 중에는 Enter/Esc를 가로채지 않음 (조합 확정 키를 편집완료로 오인 방지)
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter')       { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

// ── 최초 모달 오픈 시 DB 로드 ────────────────────────────────────
async function _stdDictOpen() {
  if (_stdReady) {
    // 이미 로드됨
    _stdRefreshList();
    return;
  }

  const body = document.getElementById('stdDictListBody');
  if (body) body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--tx-sub);font-size:13px">📚 사전 준비 중... (최초 로드는 수초 소요될 수 있습니다)</div>`;

  // 버튼 비활성
  _stdUi.loading = true;
  _stdSetButtons(false);

  const ok = await stdDictLoad();

  _stdUi.loading = false;
  _stdSetButtons(true);

  if (!ok) {
    if (body) body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger,#ff6b6b);font-size:13px">❌ 사전 로드 실패. 콘솔을 확인하세요.</div>`;
    return;
  }

  _stdRefreshList();
}

function _stdSetButtons(enabled) {
  const overlay = document.getElementById('stdDictOverlay');
  if (!overlay) return;
  overlay.querySelectorAll('button').forEach(btn => { btn.disabled = !enabled; });
}

// ── 추가 폼 ──────────────────────────────────────────────────────
function _stdOpenAddForm() {
  _stdOpenForm(_stdUi.table, null);
}

/** 추가 폼 모달 (수정은 목록 셀 인라인 편집 사용) */
function _stdOpenForm(table, row) {
  const isEdit = !!row;
  const cols   = STD_COLS[table];
  const editCols = cols.filter(c => !STD_AUDIT_COLS.has(c));

  // 기존 폼 제거
  const existing = document.getElementById('stdDictFormOverlay');
  if (existing) existing.remove();

  const formEl = document.createElement('div');
  formEl.className = 'modal-overlay active';
  formEl.id = 'stdDictFormOverlay';
  formEl.setAttribute('onmousedown', "overlayCloseExtra(event,'stdDictFormOverlay')");

  const fields = editCols.map(c => {
    const label = STD_COL_LABELS[c] || c;
    const val   = row ? (_stdEsc(row[c] ?? '')) : '';
    if (c === 'approved') {
      const ySel = (row?.approved === 'Y') ? 'selected' : '';
      const nSel = (!row || row.approved === '미승인' || row.approved === 'N') ? 'selected' : '';
      return `<div style="margin-bottom:8px">
        <label style="display:block;font-size:12px;color:var(--tx-sub);margin-bottom:3px">${label}</label>
        <select id="stdForm_${c}" class="form-input" style="font-size:13px">
          <option value="Y" ${ySel}>Y (승인)</option>
          <option value="미승인" ${nSel}>미승인</option>
          <option value="N">N</option>
        </select>
      </div>`;
    }
    return `<div style="margin-bottom:8px">
      <label style="display:block;font-size:12px;color:var(--tx-sub);margin-bottom:3px">${label}</label>
      <input id="stdForm_${c}" class="form-input" type="text" value="${val}" style="font-size:13px">
    </div>`;
  }).join('');

  // 감사 컬럼 읽기전용 표시 (수정 시)
  const auditDisplay = isEdit ? cols.filter(c => STD_AUDIT_COLS.has(c)).map(c => {
    const v = row[c] ?? '';
    return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;font-size:12px">
      <span style="color:var(--tx-sub);width:80px;flex-shrink:0">${STD_COL_LABELS[c]||c}</span>
      <span style="color:var(--tx-sub)">${_stdEsc(String(v))}</span>
    </div>`;
  }).join('') : '';

  formEl.innerHTML = `
    <div class="modal" style="width:600px;max-width:97vw;max-height:90vh;overflow-y:auto" onmousedown.stop>
      <h3>${isEdit ? '✏️ 수정' : '➕ 추가'} — ${STD_TABLE_LABELS[table]}</h3>
      <div style="column-count:2;column-gap:16px;margin-bottom:12px">
        ${fields}
      </div>
      ${auditDisplay ? `<div style="padding:8px 10px;background:var(--bg-surface,#1e2130);border-radius:6px;margin-bottom:12px">${auditDisplay}</div>` : ''}
      <div class="modal-actions">
        <button class="btn-save-m" onclick="_stdFormSubmit('${table}', ${isEdit ? row.id : 'null'})">
          ${isEdit ? '저장' : '추가'}
        </button>
        <button class="btn-cancel-m" onclick="document.getElementById('stdDictFormOverlay').remove()">취소</button>
      </div>
    </div>`;

  document.body.appendChild(formEl);
}

async function _stdFormSubmit(table, id) {
  const cols    = STD_COLS[table];
  const editCols = cols.filter(c => !STD_AUDIT_COLS.has(c));
  const obj     = {};

  for (const c of editCols) {
    const el = document.getElementById('stdForm_' + c);
    if (el) obj[c] = el.value.trim() || null;
  }

  const isEdit = id !== null && id !== 'null';
  let ok;
  if (isEdit) {
    ok = await stdUpdate(table, Number(id), obj);
    if (ok) showToast('✅ 수정 완료');
  } else {
    const newId = await stdInsert(table, obj);
    ok = newId !== null;
    if (ok) showToast('✅ 추가 완료');
  }

  if (ok) {
    document.getElementById('stdDictFormOverlay')?.remove();
    _stdRefreshList();
  }
}

// ── 삭제 확인 ────────────────────────────────────────────────────
// 네이티브 confirm()은 Electron(Windows)에서 닫힌 뒤 webContents가 키보드
// 포커스를 잃어, 창 밖으로 포커스를 옮겼다 와야 입력이 되는 문제가 있다.
// 인앱 모달(askConfirm)로 대체해 포커스 손실을 원천 차단한다.
function _stdConfirmDelete(table, id) {
  askConfirm(`[${STD_TABLE_LABELS[table]}] ID ${id} 행을 삭제하시겠습니까?`, async () => {
    const ok = await stdDelete(table, id);
    if (ok) {
      showToast('🗑 삭제 완료');
      _stdRefreshList();
    }
  }, '삭제');
}

// ── 시드 복원 확인 ───────────────────────────────────────────────
function _stdConfirmReset() {
  askConfirm('표준사전을 시드(초기 데이터)로 복원하시겠습니까? 현재 추가·수정·삭제한 내용이 모두 사라집니다.', async () => {
    _stdSetButtons(false);
    const body = document.getElementById('stdDictListBody');
    if (body) body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--tx-sub);font-size:13px">시드로 복원 중...</div>`;

    const ok = await stdDictReset();

    _stdSetButtons(true);
    if (ok) {
      showToast('✅ 시드로 복원 완료');
      _stdRefreshList();
    } else {
      showToast('❌ 복원 실패');
    }
  }, '복원');
}

// ── 엑셀 업로드 (전체 교체) ──────────────────────────────────────
/** 업로드 버튼 → 파일 선택기 열기 */
function _stdConfirmExcelUpload() {
  const input = document.getElementById('stdExcelInput');
  if (input) { input.value = ''; input.click(); }
}

/** 파일 선택됨 → 확인 후 사이드카로 업로드·전체 교체 */
function _stdHandleExcelFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  askConfirm(
    `엑셀 "${file.name}" 의 내용으로 표준사전(단어·도메인·용어)을 전체 교체하시겠습니까? 현재 데이터가 모두 대체됩니다.`,
    async () => {
      _stdSetButtons(false);
      const body = document.getElementById('stdDictListBody');
      if (body) body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--tx-sub);font-size:13px">엑셀 가져오는 중...</div>`;
      try {
        const r = await _stdImportExcel(file);
        const c = r.counts || {};
        showToast(`✅ 엑셀 가져오기 완료 (단어 ${c.word ?? 0} · 도메인 ${c.domain ?? 0} · 용어 ${c.term ?? 0})`);
        _stdUi.page = 0;
        _stdRefreshList();
      } catch(e) {
        showToast('❌ 엑셀 가져오기 실패: ' + e.message);
        _stdRefreshList();
      } finally {
        _stdSetButtons(true);
      }
    },
    '교체'
  );
}

// ── CSS 주입 (탭 버튼 스타일) ──────────────────────────────────────
(function _injectStdDictCss() {
  if (document.getElementById('stdDictStyle')) return;
  const style = document.createElement('style');
  style.id = 'stdDictStyle';
  style.textContent = `
    .btn-std-tab {
      padding: 5px 14px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid var(--bd2, #2a2f3a);
      border-radius: 6px;
      background: transparent;
      color: var(--tx-sub, #9aa3b2);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .btn-std-tab:hover {
      background: var(--bg-surface, #1e2130);
      color: var(--tx-main, #e6e9ef);
    }
    .btn-std-tab.active {
      background: var(--ac, #5b9dff22);
      color: var(--ac, #5b9dff);
      border-color: var(--ac, #5b9dff);
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
})();
