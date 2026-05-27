// ══════════════════════════════════════════════════════════════════
// 리버스 엔지니어링 — DB 스키마 → ERD 자동 생성
// ══════════════════════════════════════════════════════════════════

// ── 모듈 스코프 상태 ──────────────────────────────────────────────
let _reverseEngineerStep = 1;            // 1 = 옵션, 2 = 테이블 선택
let _reverseEngineerTables = [];         // [{name, type}]

// ── 모달 열기 ─────────────────────────────────────────────────────
async function openReverseEngineerModal() {
  // 미들웨어 실행 확인
  const running = await _mwPing();
  if (!running) {
    _showMwNotRunning();
    return;
  }
  // DB 설정 확인
  const config = await _mwGetConfig();
  if (!config) {
    let errOverlay = document.getElementById('reDbCfgNotice');
    if (!errOverlay) {
      errOverlay = document.createElement('div');
      errOverlay.className = 'modal-overlay';
      errOverlay.id = 'reDbCfgNotice';
      errOverlay.setAttribute('onmousedown', "overlayClose(event,'reDbCfgNotice')");
      errOverlay.innerHTML = `
        <div class="modal" style="width:380px" onmousedown.stop>
          <h3>DB 접속정보 없음</h3>
          <p style="color:var(--tx-sub);font-size:13px;line-height:1.6;margin-bottom:16px">
            DB 연결 설정을 먼저 완료하세요.
          </p>
          <div class="modal-actions">
            <button class="btn-cancel-m" onclick="document.getElementById('reDbCfgNotice').classList.remove('active')">닫기</button>
            <button class="btn-primary" onclick="document.getElementById('reDbCfgNotice').classList.remove('active');openDbConnectModal()">DB 연결 설정</button>
          </div>
        </div>`;
      document.body.appendChild(errOverlay);
    }
    errOverlay.classList.add('active');
    return;
  }

  _renderReverseEngineerModal();
  // 매번 1단계 상태로 초기화
  _reverseEngineerStep = 1;
  _reverseEngineerTables = [];
  _resetReverseEngineerUI();
  document.getElementById('reverseEngineerOverlay').classList.add('active');
}

function closeReverseEngineerModal() {
  const ov = document.getElementById('reverseEngineerOverlay');
  if (ov) ov.classList.remove('active');
  _reverseEngineerStep = 1;
  _reverseEngineerTables = [];
  _resetReverseEngineerUI();
}

// 모달 UI를 1단계 상태로 초기화
function _resetReverseEngineerUI() {
  const listWrap = document.getElementById('reTableListWrap');
  if (listWrap) listWrap.style.display = 'none';
  const optWrap = document.getElementById('reOptionsWrap');
  if (optWrap) optWrap.style.display = '';
  const btn = document.getElementById('reRunBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'ERD 생성'; }
  const selectAllBtn = document.getElementById('reSelectAllBtn');
  if (selectAllBtn) selectAllBtn.style.display = 'none';
  const errEl = document.getElementById('reErrMsg');
  if (errEl) errEl.style.display = 'none';
}

function _renderReverseEngineerModal() {
  if (document.getElementById('reverseEngineerOverlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'reverseEngineerOverlay';
  overlay.setAttribute('onmousedown', "overlayClose(event,'reverseEngineerOverlay')");
  overlay.innerHTML = `
    <div class="modal" style="width:480px" onmousedown.stop>
      <h3>리버스 엔지니어링</h3>
      <p style="color:var(--tx-sub);font-size:13px;margin-bottom:16px">
        DB 스키마를 읽어 ERD를 자동으로 생성합니다.
      </p>

      <div id="reOptionsWrap">
        <div class="form-row">
          <label class="form-label">적용 방식</label>
          <div style="display:flex;gap:16px;margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="reMode" value="new" checked id="reModeNew">
              <span style="font-size:13px">새 다이어그램 생성</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="reMode" value="overwrite" id="reModeOverwrite">
              <span style="font-size:13px">현재 다이어그램 덮어쓰기</span>
            </label>
          </div>
        </div>

        <div class="form-row">
          <label class="form-label">명칭 대문자 변환</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px">
            <input type="checkbox" id="reToUpper">
            <span style="font-size:13px">테이블명·컬럼명을 모두 대문자로 변환</span>
          </label>
        </div>

        <div class="form-row" id="reNewNameRow">
          <label class="form-label">다이어그램 이름</label>
          <input class="form-input" id="reNewDiagName" type="text" placeholder="DB 스키마 ERD" value="DB 스키마 ERD">
        </div>
      </div>

      <div id="reTableListWrap" style="display:none">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label class="form-label" style="margin:0">대상 테이블 선택</label>
          <button type="button" class="btn-cancel-m" id="reSelectAllBtn" style="padding:2px 8px;font-size:12px" onclick="toggleReverseEngineerAll()">전체 선택</button>
        </div>
        <div id="reTableList" style="max-height:260px;overflow:auto;border:1px solid var(--brd,#444);border-radius:4px;padding:8px;font-size:13px"></div>
      </div>

      <div id="reErrMsg" style="display:none;color:var(--err,#f38ba8);font-size:12px;margin-bottom:8px"></div>

      <div class="modal-actions">
        <button class="btn-cancel-m" onclick="closeReverseEngineerModal()">취소</button>
        <button class="btn-primary" id="reRunBtn" onclick="runReverseEngineering()">ERD 생성</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // 라디오 토글 시 이름 행 표시/숨김
  overlay.querySelectorAll('input[name="reMode"]').forEach(r => {
    r.addEventListener('change', () => {
      const nameRow = document.getElementById('reNewNameRow');
      nameRow.style.display = r.value === 'new' ? '' : 'none';
    });
  });
}

// ── ERD 생성 실행 (2단계) ─────────────────────────────────────────
async function runReverseEngineering() {
  if (_reverseEngineerStep === 1) {
    await _runReverseEngineerStep1();
  } else {
    await _runReverseEngineerStep2();
  }
}

// 1단계: 테이블 목록 조회 → 체크리스트 표시
async function _runReverseEngineerStep1() {
  const btn = document.getElementById('reRunBtn');
  const errEl = document.getElementById('reErrMsg');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '테이블 목록 조회 중...';

  try {
    const res = await fetch(`${MW_URL}/schema/tables`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const { items } = await res.json();
    _reverseEngineerTables = items || [];

    // 체크리스트 렌더링
    const listEl = document.getElementById('reTableList');
    if (!_reverseEngineerTables.length) {
      listEl.innerHTML = '<div style="color:var(--tx-sub);font-size:12px">조회된 테이블·뷰가 없습니다.</div>';
    } else {
      listEl.innerHTML = _reverseEngineerTables.map((it, i) => {
        const badge = it.type === 'view'
          ? '<span style="display:inline-block;background:#2e8b8b;color:#fff;border-radius:2px;padding:1px 5px;font-size:10px;margin-left:6px">VIEW</span>'
          : '';
        return `
          <label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
            <input type="checkbox" class="reTableChk" data-name="${it.name}" data-type="${it.type}" checked>
            <span>${it.name}</span>${badge}
          </label>`;
      }).join('');
    }

    // UI 전환
    document.getElementById('reOptionsWrap').style.display = 'none';
    document.getElementById('reTableListWrap').style.display = '';
    document.getElementById('reSelectAllBtn').style.display = '';
    _reverseEngineerStep = 2;
    btn.textContent = '선택한 테이블로 ERD 생성';
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.textContent = 'ERD 생성';
  } finally {
    btn.disabled = false;
  }
}

// 2단계: 선택된 테이블만 필터링하여 ERD 생성
async function _runReverseEngineerStep2() {
  const btn = document.getElementById('reRunBtn');
  const errEl = document.getElementById('reErrMsg');
  errEl.style.display = 'none';

  // 선택된 테이블 수집
  const checked = Array.from(document.querySelectorAll('.reTableChk:checked'))
    .map(el => el.getAttribute('data-name'));
  if (!checked.length) {
    errEl.textContent = '최소 한 개 이상의 테이블을 선택하세요.';
    errEl.style.display = 'block';
    return;
  }
  const selectedSet = new Set(checked);

  btn.disabled = true;
  btn.textContent = '스키마 읽는 중...';

  try {
    const res = await fetch(`${MW_URL}/schema`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    let { tables, views, fks } = await res.json();

    // 클라이언트 측 필터링 — 선택한 테이블·뷰만 유지
    tables = (tables || []).filter(t => selectedSet.has(t.tableName));
    views  = (views  || []).filter(v => selectedSet.has(v.viewName));
    // FK는 양쪽 테이블이 모두 선택된 경우만 유지
    fks    = (fks    || []).filter(fk => selectedSet.has(fk.fromTable) && selectedSet.has(fk.toTable));

    const toUpper = document.getElementById('reToUpper')?.checked ?? false;
    const { entities, entityIdMap } = _buildEntitiesFromSchema(tables, views, toUpper);
    const relations = _buildRelationsFromFks(fks, entityIdMap);
    const viewNotes = _buildViewNotes(views, entities, entityIdMap);

    const mode = document.querySelector('input[name="reMode"]:checked')?.value || 'new';
    if (mode === 'new') {
      const name = (document.getElementById('reNewDiagName')?.value || '').trim() || 'DB 스키마 ERD';
      const d = createEmptyDiagram(name);
      d.entities = entities;
      d.relations = relations;
      d.notesV2 = viewNotes;
      d.sections = [];
      d.notes = [];
      d.collapsed = [];
      flushCurrentState();
      diagrams.push(d);
      activeDiagramId = d.id;
      loadDiagramIntoWorkspace(d);
      renderDiagramPanel();
      updateZoomLabel();
      render();
      saveState();
    } else {
      const d = getActiveDiagram();
      // 기존 엔티티 위치 보존 (physicalName 기준 매칭)
      const posMap = {};
      (d.entities || []).forEach(e => {
        posMap[e.physicalName.toLowerCase()] = { x: e.x, y: e.y };
      });
      entities.forEach(e => {
        const key = e.physicalName.toLowerCase();
        if (posMap[key]) { e.x = posMap[key].x; e.y = posMap[key].y; }
      });
      d.entities = entities;
      d.relations = relations;
      // 기존 VIEW DDL 메모 제거 후 새로 추가 (반복 실행 시 중복 방지)
      const prevNotes = (d.notesV2 || []).filter(n => !(n.tags && n.tags.includes('VIEW') && n.tags.includes('DDL')));
      d.notesV2 = [...prevNotes, ...viewNotes];
      loadDiagramIntoWorkspace(d);
      render();
      saveState();
    }

    closeReverseEngineerModal();
    showToast(`ERD 생성 완료 (테이블 ${tables.length}개, 뷰 ${views.length}개, 관계 ${relations.length}개)`);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '선택한 테이블로 ERD 생성';
  }
}

// 전체 선택/해제 토글
function toggleReverseEngineerAll() {
  const chks = document.querySelectorAll('.reTableChk');
  const allChecked = Array.from(chks).every(c => c.checked);
  chks.forEach(c => { c.checked = !allChecked; });
  const btn = document.getElementById('reSelectAllBtn');
  if (btn) btn.textContent = allChecked ? '전체 선택' : '전체 해제';
}

// ── 엔티티 객체 배열 생성 ─────────────────────────────────────────
function _buildEntitiesFromSchema(tables, views, toUpper = false) {
  const n = s => toUpper ? s.toUpperCase() : s;
  const all = [
    ...tables.map(t => ({ ...t, isView: false })),
    ...views.map(v => ({ tableName: v.viewName, columns: v.columns, isView: true }))
  ];

  const HEADER_H = 50;
  const COL_ROW_H = 28;
  const PADDING_H = 20;
  const GAP_Y = 30;
  const COL_W = 240;
  const GAP_X = 30;
  const COLS = 5;
  const OFFSET_X = 60;
  const OFFSET_Y = 60;

  // 1-pass: 행별 최대 높이 계산
  const rowCount = Math.ceil(all.length / COLS);
  const rowMaxH = Array(rowCount).fill(0);
  all.forEach((tbl, idx) => {
    const row = Math.floor(idx / COLS);
    const h = HEADER_H + (tbl.columns || []).length * COL_ROW_H + PADDING_H;
    if (h > rowMaxH[row]) rowMaxH[row] = h;
  });

  // rowOffsets 누적
  const rowOffsets = [OFFSET_Y];
  for (let r = 0; r < rowCount - 1; r++) {
    rowOffsets.push(rowOffsets[r] + rowMaxH[r] + GAP_Y);
  }

  const entities = [];
  const entityIdMap = {}; // tableName → entity id

  all.forEach((tbl, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const id = 'entity_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5) + '_' + idx;

    const attrs = (tbl.columns || []).map(c => ({
      logicalName:   n(c.columnName),
      physicalName:  n(c.columnName),
      type:          c.dataType || '',
      kind:          c.isPk ? 'pk' : 'normal',
      notNull:       !c.isNullable,
      unique:        c.isUnique ?? false,
      autoIncrement: c.isAutoIncrement ?? false,
      defaultValue:  c.defaultValue || '',
      description:   '',
      ref:           null
    }));

    entities.push({
      id,
      logicalName:  n(tbl.tableName),
      physicalName: n(tbl.tableName),
      description:  '',
      colorTag:     tbl.isView ? 'teal' : null,
      isView:       tbl.isView,
      rowCount:     undefined,
      x: OFFSET_X + col * (COL_W + GAP_X),
      y: rowOffsets[row],
      attrs,
      indexes: []
    });

    entityIdMap[tbl.tableName] = id;
  });

  return { entities, entityIdMap };
}

// ── 관계 객체 배열 생성 ───────────────────────────────────────────
function _buildRelationsFromFks(fks, entityIdMap) {
  const relations = [];
  for (const fk of fks) {
    const from = entityIdMap[fk.fromTable];
    const to   = entityIdMap[fk.toTable];
    if (from && to) {
      relations.push({ from, to, card: fk.card || '1:N' });
    }
  }
  return relations;
}

// ── VIEW DDL 메모 생성 ────────────────────────────────────────────
function _buildViewNotes(views, entities, entityIdMap) {
  const notes = [];
  const NOTE_W = 220;
  const NOTE_H = 160;
  const COLS = 3;
  const OFFSET_X = 60 + 5 * 220 + 60; // 엔티티 격자 오른쪽 배치

  views.forEach((v, idx) => {
    if (!v.ddl) return;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    notes.push({
      id:        makeNoteV2Id(),
      x:         OFFSET_X + col * (NOTE_W + 20),
      y:         60 + row * (NOTE_H + 20),
      w:         NOTE_W,
      h:         NOTE_H,
      title:     'VIEW: ' + v.viewName,
      text:      v.ddl,
      color:     'ocean',
      pinned:    false,
      tags:      ['VIEW', 'DDL'],
      createdAt: new Date().toISOString()
    });
  });
  return notes;
}
