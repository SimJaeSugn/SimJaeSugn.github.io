// ── 패널 열림 상태 ───────────────────────────────────────────────
let panelOpen = false;

// 마우스 위치 추적 (hover 강제 재평가용)
let _pmx = 0, _pmy = 0;
document.addEventListener('mousemove', e => { _pmx = e.clientX; _pmy = e.clientY; }, { passive: true, capture: true });
let expandedEntities = new Set();

// ── 다이어그램 패널 관리 ─────────────────────────────────────────
function showNewDiagModal() {
  const inp = document.getElementById('newDiagNameInput');
  inp.value = '';
  // 소스 선택 초기화
  const srcLocal = document.getElementById('newDiagSrcLocal');
  if (srcLocal) srcLocal.checked = true;
  _toggleNewDiagDbRow(false);
  document.getElementById('newDiagOverlay').classList.add('active');
  setTimeout(() => inp.focus(), 50);
  // 프로파일 목록 비동기 로드 (웹이면 실패해도 무방)
  if (typeof erdDbLoadProfileOptions === 'function') {
    erdDbLoadProfileOptions().then(profiles => _fillProfileSelect(profiles)).catch(() => {});
  }
}

function _toggleNewDiagDbRow(show) {
  const row = document.getElementById('newDiagDbRow');
  if (row) row.style.display = show ? '' : 'none';
  // M5: 초기 채움 옵션 행
  const fillRow = document.getElementById('newDiagInitFillRow');
  if (fillRow) fillRow.style.display = show ? '' : 'none';
  // M6: 경고 박스
  const warn = document.getElementById('newDiagDbWarning');
  if (warn) warn.style.display = show ? '' : 'none';
  // 로컬 선택 시 초기 채움 라디오 "빈 캔버스" 로 리셋
  if (!show) {
    const blank = document.getElementById('newDiagFillBlank');
    if (blank) blank.checked = true;
    // ▼ 신규: 기존 다이어그램 선택 행 숨김·리셋
    const existRow = document.getElementById('newDiagExistingRow');
    if (existRow) existRow.style.display = 'none';
    _resetExistingSelect();
    // 이름 입력란 readonly 해제·비움
    const inp = document.getElementById('newDiagNameInput');
    if (inp) { inp.readOnly = false; inp.value = ''; }
  }
}

function _fillProfileSelect(profiles) {
  const sel = document.getElementById('newDiagProfileSelect');
  if (!sel) return;
  // DOM 조작으로 XSS 방지 (value 와 textContent 를 분리 설정)
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  if (!profiles.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(프로파일 없음)';
    sel.appendChild(opt);
    return;
  }
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name + (p.dbType ? ' (' + p.dbType + ')' : '');
    sel.appendChild(opt);
  });
}

function closeNewDiagModal() {
  document.getElementById('newDiagOverlay').classList.remove('active');
}

// ── 기존 DB 다이어그램 열기 — 헬퍼·이벤트 핸들러 ──────────────────────────────

function _resetExistingSelect() {
  const sel = document.getElementById('newDiagExistingSelect');
  if (!sel) return;
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = '(프로파일을 먼저 선택하세요)';
  sel.appendChild(opt);
  sel.disabled = true;
  const hint = document.getElementById('newDiagExistingHint');
  if (hint) hint.textContent = '';
}

async function _fillExistingDiagSelect(profileName) {
  const sel = document.getElementById('newDiagExistingSelect');
  const hint = document.getElementById('newDiagExistingHint');
  if (!sel) return;

  // 비동기 경쟁 가드 — 프로파일 빠른 전환 시 stale 응답 무시
  const seq = String((Number(sel.dataset.reqSeq) || 0) + 1);
  sel.dataset.reqSeq = seq;

  // 로딩 중 상태
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  sel.disabled = true;
  const loadOpt = document.createElement('option');
  loadOpt.textContent = '(조회 중...)';
  sel.appendChild(loadOpt);
  if (hint) hint.textContent = '';

  if (!profileName) {
    loadOpt.textContent = '(프로파일을 먼저 선택하세요)';
    return;
  }

  const result = await erdDbList(profileName);

  // 이 응답이 도착하기 전 더 최신 요청이 시작됐으면 무시(stale)
  if (sel.dataset.reqSeq !== seq) return;

  while (sel.firstChild) sel.removeChild(sel.firstChild);

  if (!result) {
    // 네트워크/HTTP 오류
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(조회 실패 — 프록시 실행 여부 확인)';
    sel.appendChild(opt);
    sel.disabled = true;
    if (hint) hint.textContent = '사이드카가 실행 중인지 확인하세요.';
    return;
  }

  if (!result.items || result.items.length === 0) {
    // 저장된 다이어그램 없음
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(이 DB에 저장된 다이어그램 없음)';
    sel.appendChild(opt);
    sel.disabled = true;
    if (hint) hint.textContent = '새 다이어그램을 먼저 저장해야 합니다.';
    return;
  }

  // 정상: 목록 채우기
  result.items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.diagram_id;
    const dateStr = item.updated_at
      ? ' / ' + String(item.updated_at).slice(0, 16).replace('T', ' ')
      : '';
    opt.textContent = item.name + ' (v' + item.version + dateStr + ')';
    sel.appendChild(opt);
  });
  sel.disabled = false;
  if (hint) hint.textContent = result.items.length + '개 다이어그램';

  // 첫 항목 자동 선택 후 이름 입력란 자동 채움
  _onNewDiagExistingSelectChange();
}

function _onNewDiagInitFillChange(val) {
  const existRow = document.getElementById('newDiagExistingRow');
  const inp = document.getElementById('newDiagNameInput');
  if (val === 'existing') {
    if (existRow) existRow.style.display = 'flex';
    const profileName = document.getElementById('newDiagProfileSelect')?.value || '';
    _fillExistingDiagSelect(profileName);
  } else {
    if (existRow) existRow.style.display = 'none';
    _resetExistingSelect();
    if (inp) { inp.readOnly = false; /* value는 사용자가 이미 입력했을 수 있으므로 유지 */ }
  }
}

function _onNewDiagProfileChange() {
  const fillMode = document.querySelector('input[name="newDiagInitFill"]:checked')?.value;
  if (fillMode === 'existing') {
    const profileName = document.getElementById('newDiagProfileSelect')?.value || '';
    _fillExistingDiagSelect(profileName);
  }
}

function _onNewDiagExistingSelectChange() {
  const sel = document.getElementById('newDiagExistingSelect');
  const inp = document.getElementById('newDiagNameInput');
  if (!sel || !inp) return;
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.value) {
    // 옵션 텍스트에서 이름 부분만 추출 (괄호 전까지)
    const label = opt.textContent.replace(/ \(v[\s\S]*$/, '').trim();
    inp.value = label;
    inp.readOnly = true;
  } else {
    inp.value = '';
    inp.readOnly = false;
  }
}

// ── M5: DB 다이어그램 리버스 엔지니어링 초기 채움 헬퍼 ──────────────────────────
// reverse_engineer.js 의 전역 빌더를 그대로 재사용한다.
// 성공: { entities, relations, notesV2 } / 실패: null
async function _runDbDiagInitFill(profileName) {
  if (typeof _buildEntitiesFromSchema !== 'function') {
    showToast('리버스 엔지니어링 기능을 사용할 수 없습니다(reverse_engineer.js 미로드).');
    return null;
  }
  try {
    const res = await fetch(
      `${MW_URL}/schema?profileName=${encodeURIComponent(profileName)}`,
      { signal: AbortSignal.timeout(60000) }
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast('스키마 조회 실패: ' + (d.error || 'HTTP ' + res.status));
      return null;
    }
    let { tables, views, fks } = await res.json();
    tables = tables || []; views = views || []; fks = fks || [];
    if (!tables.length && !views.length) {
      return { entities: [], relations: [], notesV2: [] };
    }
    const { entities, entityIdMap } = _buildEntitiesFromSchema(tables, views, false);
    _markFkColumnsFromSchema(entities, entityIdMap, fks, false);
    const relations = _buildRelationsFromFks(fks, entityIdMap);
    const notesV2  = _buildViewNotes(views, entities, entityIdMap);
    return { entities, relations, notesV2 };
  } catch (e) {
    showToast('초기 채움 실패: ' + e.message);
    return null;
  }
}

// ── M5-2: DB 다이어그램 전용 포워드 엔지니어링 진입점 ────────────────────────────
// 다이어그램의 profileName 과 활성 프로파일이 다를 경우 경고를 표시한다.
async function _openFEForDbDiagram(diagOrId) {
  // id 문자열(인라인 핸들러 경유) 또는 다이어그램 객체 모두 허용.
  const diag = (typeof diagOrId === 'string')
    ? diagrams.find(x => x.id === diagOrId)
    : diagOrId;
  if (!diag || diag.source !== 'db') {
    if (typeof openForwardEngineerModal === 'function') openForwardEngineerModal();
    return;
  }
  const diagProfile = diag.connection?.profileName || '';

  // 활성 프로파일 이름 조회 (비교용)
  // _mwGetConfig() → GET /config 는 profileName 미포함.
  // GET /config/profiles 의 active 필드를 사용해야 한다.
  let activeProfile = '';
  try {
    const pr = await fetch(`${MW_URL}/config/profiles`, { signal: AbortSignal.timeout(5000) });
    if (pr.ok) { const pd = await pr.json(); activeProfile = pd.active || ''; }
  } catch {}

  const mismatch = diagProfile && activeProfile && (diagProfile !== activeProfile);
  if (mismatch) {
    const proceed = confirm(
      `이 다이어그램은 "${diagProfile}" DB에 연결되어 있습니다.\n` +
      `포워드 엔지니어링은 현재 활성 연결("${activeProfile}")에 DDL을 실행합니다.\n` +
      `대상이 맞는지 확인 후 진행하세요. 계속하시겠습니까?`
    );
    if (!proceed) return;
  }
  if (typeof openForwardEngineerModal === 'function') openForwardEngineerModal();
}

async function confirmNewDiag() {
  const name = document.getElementById('newDiagNameInput').value.trim() || '새 다이어그램';
  const isDb = document.getElementById('newDiagSrcDb')?.checked;
  const profileName = document.getElementById('newDiagProfileSelect')?.value;

  if (isDb) {
    // ── DB 다이어그램 생성 ──────────────────────────────────────────
    if (!profileName) {
      if (typeof showToast === 'function') showToast('프로파일을 선택하세요.');
      return;
    }
    const ping = await _mwPing();
    if (!ping) { _showMwNotRunning(); return; }

    // ── ▼ 신규: 기존 DB 다이어그램 열기 분기 ────────────────────────────────────
    const fillMode = document.querySelector('input[name="newDiagInitFill"]:checked')?.value || 'blank';
    if (fillMode === 'existing') {
      const selectedId = document.getElementById('newDiagExistingSelect')?.value;
      if (!selectedId) {
        if (typeof showToast === 'function') showToast('열 다이어그램을 선택하세요.');
        return;
      }

      // 중복 방지: 이미 로컬에 같은 diagram_id 가 있으면 전환만
      const existing = diagrams.find(x => x.id === selectedId);
      if (existing) {
        closeNewDiagModal();
        switchDiagram(selectedId);
        showToast('이미 열려 있는 다이어그램으로 전환했습니다.');
        return;
      }

      // 원격에서 로드
      showToast('다이어그램을 불러오는 중...');
      const loaded = await erdDbLoad(selectedId, profileName);
      if (!loaded) {
        showToast('다이어그램 로드 실패. 프록시 연결을 확인하세요.');
        return;
      }

      // payload 파싱
      let p;
      try {
        p = typeof loaded.payload === 'string'
          ? JSON.parse(loaded.payload)
          : loaded.payload;
      } catch {
        if (typeof showToast === 'function') showToast('다이어그램 데이터 파싱 실패.');
        return;
      }
      // payload 가 null/비객체여도 빈 다이어그램으로 안전하게 진행(TypeError 방어)
      if (!p || typeof p !== 'object') p = {};

      // 다이어그램 객체 구성 — createEmptyDiagram 대신 리터럴 직접 사용
      // (기존 diagram_id 를 그대로 보존해야 하므로 makeDiagramId() 우회)
      const d = {
        id:            loaded.diagram_id,
        name:          loaded.name,
        entities:      p.entities  || [],
        relations:     p.relations || [],
        sections:      p.sections  || [],
        notes:         p.notes     || [],
        notesV2:       p.notesV2   || [],
        collapsed:     p.collapsed || [],
        vx:            p.vx    ?? 40,
        vy:            p.vy    ?? 40,
        scale:         p.scale ?? 1,
        source:        'db',
        connection:    { profileName },
        remoteVersion: loaded.version,
      };

      closeNewDiagModal();
      _applyNewDiag(d);
      // 로드 직후 타이머 정리 — 이미 최신 상태이므로 echo PUT 방지 (blank/re 분기와 동일)
      if (typeof _erdDbSaveTimers !== 'undefined') {
        clearTimeout(_erdDbSaveTimers[d.id]);
        delete _erdDbSaveTimers[d.id];
      }
      if (typeof erdDbStartPoll === 'function') erdDbStartPoll();
      showToast('"' + loaded.name + '" 다이어그램을 불러왔습니다.');
      return;
    }
    // ── ▲ 신규 분기 끝 ──────────────────────────────────────────────────────────

    closeNewDiagModal();
    const ok = await erdDbInit(profileName);
    if (!ok) return;
    const d = createEmptyDiagram(name);
    d.source = 'db';
    d.connection = { profileName };
    d.remoteVersion = 0;

    // ── M5: 초기 채움 분기 ────────────────────────────────────────────────────
    // fillMode 는 위 existing 분기에서 이미 선언됨 (blank / re 중 하나)
    let initEntities = [], initRelations = [], initNotesV2 = [];
    if (fillMode === 're') {
      showToast('DB 스키마를 읽는 중...');
      const fill = await _runDbDiagInitFill(profileName);
      if (fill) {
        initEntities  = fill.entities;
        initRelations = fill.relations;
        initNotesV2   = fill.notesV2;
      }
      // fill=null 이면 실패 토스트는 _runDbDiagInitFill 내부에서 출력됨
      // 실패해도 빈 캔버스 다이어그램으로 진행 (UX 단절 방지)
    }

    const payload = JSON.stringify({
      entities:  initEntities,
      relations: initRelations,
      sections:  [],
      notes:     [],
      notesV2:   initNotesV2,
      vx: 40, vy: 40, scale: 1,
    });
    const savedVersion = await erdDbSave(d.id, d.name, payload, profileName, 0);
    d.remoteVersion = savedVersion != null ? savedVersion : 1;
    // 초기 채움 내용을 다이어그램 객체에도 반영 (loadDiagramIntoWorkspace 가 읽음)
    if (initEntities.length) {
      d.entities  = initEntities;
      d.relations = initRelations;
      d.notesV2   = initNotesV2;
    }
    _applyNewDiag(d);
    // 생성 직후 타이머 정리 (초기 저장 완료, 즉각 재저장 불필요)
    if (typeof _erdDbSaveTimers !== 'undefined') {
      clearTimeout(_erdDbSaveTimers[d.id]);
      delete _erdDbSaveTimers[d.id];
    }
    if (typeof erdDbStartPoll === 'function') erdDbStartPoll();
    if (initEntities.length)
      showToast(`리버스 엔지니어링 초기 채움 완료 (테이블 ${initEntities.length}개, 관계 ${initRelations.length}개)`);
  } else {
    // ── 로컬 다이어그램 생성 (기존 로직) ────────────────────────────
    closeNewDiagModal();
    const d = createEmptyDiagram(name);
    _applyNewDiag(d);
  }
}

function _applyNewDiag(d) {
  flushCurrentState();
  diagrams.push(d);
  activeDiagramId = d.id;
  loadDiagramIntoWorkspace(d);
  pasteCount = 0;
  selectedEntity = null;
  if (typeof selectedEntities !== 'undefined') selectedEntities.clear();
  if (typeof hidePropPanel === 'function') hidePropPanel();
  renderDiagramPanel();
  updateZoomLabel();
  render();
  saveState();
}

function switchDiagram(id) {
  if (id === activeDiagramId) return;
  flushCurrentState();
  activeDiagramId = id;
  loadDiagramIntoWorkspace(getActiveDiagram());
  pasteCount = 0;
  selectedEntity = null;
  if (typeof selectedEntities !== 'undefined') selectedEntities.clear();
  if (typeof hidePropPanel === 'function') hidePropPanel();
  renderDiagramPanel();
  updateZoomLabel();
  render();
  saveState();
  // ▼ 신규: DB 다이어그램 전환 시 최신 데이터 재로드 + 폴링 관리
  const _sw = getActiveDiagram();
  if (_sw && _sw.source === 'db' && typeof erdDbSwitchLoad === 'function') {
    erdDbSwitchLoad(_sw).catch(() => {});
    if (typeof erdDbStartPoll === 'function') erdDbStartPoll();
  } else if (typeof erdDbStopPoll === 'function') {
    erdDbStopPoll(); // 로컬 다이어그램으로 전환 시 폴링 중단
  }
}

function renameDiagram(id, e) {
  e.stopPropagation();
  const d = diagrams.find(x => x.id === id);
  if (!d) return;
  const item = document.querySelector(`.ex-diag-item[data-id="${id}"]`);
  if (!item) return;
  const nameEl = item.querySelector('.ex-diag-name');
  const oldName = d.name;
  const input = document.createElement('input');
  input.className = 'diag-rename-input';
  input.value = oldName;
  nameEl.replaceWith(input);
  input.focus(); input.select();
  const commit = () => {
    const newName = input.value.trim() || oldName;
    d.name = newName;
    renderDiagramPanel();
    saveState();
    // ▼ 신규: DB 다이어그램이면 이름 변경도 즉시 저장 예약
    if (d.source === 'db' && typeof erdDbScheduleSave === 'function') {
      erdDbScheduleSave(d);
    }
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
  });
}

function deleteDiagram(id, e) {
  e.stopPropagation();
  if (diagrams.length <= 1) { alert('마지막 다이어그램은 삭제할 수 없습니다.'); return; }
  const d = diagrams.find(x => x.id === id);
  if (!d) return;

  // ▼ DB 연결 다이어그램: 로컬에서만 삭제 / DB 원본까지 삭제 선택을 묻는다
  if (d.source === 'db' && d.connection?.profileName) {
    _pendingDbDelId = id;
    const msg = document.getElementById('dbDelChoiceMsg');
    if (msg) msg.textContent = `'${d.name}' 은(는) DB 연결 다이어그램입니다. 어떻게 삭제할까요?`;
    const ov = document.getElementById('dbDelChoiceOverlay');
    if (ov) ov.classList.add('active');
    else { // 모달 부재 시 폴백: 로컬 삭제만
      askConfirm(`'${d.name}' 다이어그램을 삭제합니다.`, () => _removeDiagramLocal(d), '삭제');
    }
    return;
  }

  // 로컬 다이어그램: 기존 동작
  askConfirm(`'${d.name}' 다이어그램을 삭제합니다.`, () => _removeDiagramLocal(d), '삭제');
}

// DB 삭제 선택 대기 중인 다이어그램 id
let _pendingDbDelId = null;

function closeDbDelChoice() {
  const ov = document.getElementById('dbDelChoiceOverlay');
  if (ov) ov.classList.remove('active');
  _pendingDbDelId = null;
}

// mode: 'local' = 로컬에서만 삭제(DB 원본 보존), 'remote' = DB 원본까지 삭제
function confirmDbDelChoice(mode) {
  const ov = document.getElementById('dbDelChoiceOverlay');
  if (ov) ov.classList.remove('active');
  const id = _pendingDbDelId;
  _pendingDbDelId = null;
  if (!id) return;
  const d = diagrams.find(x => x.id === id);
  if (!d) return;

  if (mode === 'remote' && d.connection?.profileName && typeof erdDbDelete === 'function') {
    if (typeof erdDbCancelSave === 'function') erdDbCancelSave(d.id);
    erdDbDelete(d.id, d.connection.profileName).catch(() => {});
    if (typeof showToast === 'function') showToast('DB 원본까지 삭제했습니다.');
  } else if (typeof showToast === 'function') {
    showToast('로컬에서만 삭제했습니다 (DB 원본 보존).');
  }
  _removeDiagramLocal(d);
}

// 로컬 워크스페이스에서 다이어그램 제거(원격 삭제와 무관한 공통 로직)
function _removeDiagramLocal(d) {
  if (!d) return;
  const id = d.id;
  // 보류 중인 디바운스 저장 취소(좀비 PUT 방지)
  if (typeof erdDbCancelSave === 'function') erdDbCancelSave(id);
  const idx = diagrams.indexOf(d);
  if (idx < 0) return;
  diagrams.splice(idx, 1);
  if (activeDiagramId === id) {
    const next = diagrams[Math.max(0, idx - 1)];
    activeDiagramId = next.id;
    loadDiagramIntoWorkspace(next);
    updateZoomLabel();
    render();
    // 삭제 후 새 활성 다이어그램이 로컬이면 폴링 중단
    if (typeof erdDbStopPoll === 'function' && next.source !== 'db') erdDbStopPoll();
  }
  renderDiagramPanel();
  saveState();
}

const DIAG_TAB_COLORS = [
  { id: null,     bg: '#585b70', label: '기본' },
  { id: 'blue',   bg: '#89b4fa', label: '파랑' },
  { id: 'green',  bg: '#a6e3a1', label: '초록' },
  { id: 'orange', bg: '#fab387', label: '주황' },
  { id: 'red',    bg: '#f38ba8', label: '빨강' },
  { id: 'purple', bg: '#cba6f7', label: '보라' },
  { id: 'yellow', bg: '#f9e2af', label: '노랑' },
  { id: 'teal',   bg: '#89dceb', label: '하늘' },
];

// 다이어그램·엔티티 목록은 좌측 탐색기(explorer.js)로 이관되었다.
// 이 함수는 호환을 위해 유지하되, 좌측 탐색기 렌더를 위임 호출한다.
function renderDiagramPanel() {
  if (typeof renderExplorerDiagrams === 'function') renderExplorerDiagrams();
  renderEntityTree();
}

// ── 다이어그램 탭 색상 피커 ────────────────────────────────────────
let _diagColorTargetId = null;

function openDiagColorPicker(diagId, e) {
  e.stopPropagation();
  _diagColorTargetId = diagId;
  let picker = document.getElementById('diagColorPicker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'diagColorPicker';
    document.body.appendChild(picker);
  }
  const d = diagrams.find(x => x.id === diagId);
  picker.innerHTML = DIAG_TAB_COLORS.map(c => {
    const active = (c.id === (d?.tabColor || null)) ? ' active' : '';
    return `<div class="ctx-color-swatch${active}" title="${c.label}"
      style="background:${c.bg};"
      onclick="applyDiagTabColor(${c.id === null ? 'null' : `'${c.id}'`})"></div>`;
  }).join('');
  const rect = e.target.getBoundingClientRect();
  picker.style.left = rect.left + 'px';
  picker.style.top  = (rect.bottom + 4) + 'px';
  picker.classList.add('open');
  setTimeout(() => {
    document.addEventListener('click', function _close(ev) {
      if (!picker.contains(ev.target)) { picker.classList.remove('open'); document.removeEventListener('click', _close); }
    });
  }, 0);
}

function applyDiagTabColor(colorId) {
  const d = diagrams.find(x => x.id === _diagColorTargetId);
  if (!d) return;
  d.tabColor = (colorId === 'null' || colorId === null) ? null : colorId;
  document.getElementById('diagColorPicker')?.classList.remove('open');
  renderDiagramPanel();
  saveState();
}

// ── 엔티티 트리 렌더링 ──────────────────────────────────────────
// 엔티티 목록도 좌측 탐색기(explorer.js)로 이관되었다. 호환을 위해 함수명을 유지하되
// 좌측 탐색기 엔티티 렌더로 위임한다. (여러 모듈이 renderEntityTree()를 호출함)
function renderEntityTree() {
  if (typeof renderExplorerEntities === 'function') renderExplorerEntities();
}

// ── 패널 토글 ──────────────────────────────────────────────────
function toggleDiagramPanel() {
  panelOpen = !panelOpen;
  const panel = document.getElementById('diagramPanel');

  if (panelOpen) {
    panel.style.visibility = '';
    panel.classList.remove('collapsed');
    panel.style.transform = '';
  } else {
    panel.classList.add('collapsed');
    panel.style.transform = `translateX(${PANEL_W}px)`;
    panel.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'transform') return;
      panel.removeEventListener('transitionend', onEnd);
      if (!panelOpen) panel.style.visibility = 'hidden';
    });
    // transform 적용 직후 현재 마우스 위치에서 hit-test 재실행 → stale :hover 소거
    requestAnimationFrame(() => {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, view: window,
        clientX: _pmx, clientY: _pmy
      }));
    });
  }

  document.getElementById('panelReopenTab').classList.toggle('visible', !panelOpen);
  const rOff = panelOpen ? PANEL_W + 12 : 12;
  const _zp = document.getElementById('zoomPanel');
  if (_zp) _zp.style.right = rOff + 'px';
  const _mbiR = document.getElementById('mbi-right');
  if (_mbiR) { const chk = _mbiR.querySelector('.mb-chk'); if (chk) chk.textContent = panelOpen ? '✓' : ''; }
  if (typeof _syncLayoutButtons === 'function') _syncLayoutButtons();
  render();
}

// ── 패널 폭 드래그 조절 ──────────────────────────────────────────
(function initPanelWidthResize() {
  let dragging = false, startX = 0, startW = 0;
  window.addEventListener('DOMContentLoaded', () => {
    const handle = document.getElementById('panelWidthHandle');
    const panel  = document.getElementById('diagramPanel');
    if (!handle || !panel) return;
    const saved = parseInt(localStorage.getItem('_panelW') || '0');
    if (saved >= 160 && saved !== 240) {
      panel.style.width = saved + 'px';
      PANEL_W = saved;
    }
    if (!panelOpen) { panel.style.transform = `translateX(${PANEL_W}px)`; panel.style.visibility = 'hidden'; }
    handle.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = panel.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newW = Math.max(160, Math.min(480, startW - (e.clientX - startX)));
      panel.style.width = newW + 'px';
      PANEL_W = newW;
      render();
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      try { localStorage.setItem('_panelW', PANEL_W); } catch {}
    });
  });
})();

// ── 패널 디바이더 드래그 ──────────────────────────────────────────
(function initPanelDivider() {
  let dragging = false, startY = 0, startH = 0;
  window.addEventListener('DOMContentLoaded', () => {
    const divider = document.getElementById('panelDivider');
    const panelTop = document.getElementById('panelTop');
    if (!divider || !panelTop) return;
    divider.addEventListener('mousedown', e => {
      dragging = true;
      startY = e.clientY;
      startH = panelTop.offsetHeight;
      divider.classList.add('dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const panel = document.getElementById('diagramPanel');
      const panelH = panel ? panel.offsetHeight : window.innerHeight;
      const minH = 64, maxH = panelH - 64 - 6;
      let newH = Math.min(maxH, Math.max(minH, startH + (e.clientY - startY)));
      panelTop.style.height = newH + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.getElementById('panelDivider')?.classList.remove('dragging');
    });
  });
})();

// ── 다이어그램 비교(diff) ────────────────────────────────────────
function openDiffModal(snapId) {
  const snap = SNAPSHOTS.find(s => s.id === snapId);
  if (!snap) return;
  flushCurrentState();
  const curDiag  = getActiveDiagram();
  const snapState = JSON.parse(snap.state);
  const snapDiag  = snapState.diagrams?.find(d => d.id === curDiag.id) || snapState.diagrams?.[0];
  if (!snapDiag) { showToast('스냅샷에 비교할 다이어그램이 없습니다.'); return; }
  const curE  = curDiag.entities  || [];
  const snapE = snapDiag.entities || [];
  const curR  = curDiag.relations  || [];
  const snapR = snapDiag.relations || [];
  const curMap = {}; curE.forEach(e => curMap[e.id] = e);
  const snapMap= {}; snapE.forEach(e => snapMap[e.id] = e);
  const added    = curE.filter(e => !snapMap[e.id]);
  const removed  = snapE.filter(e => !curMap[e.id]);
  const modified = curE.filter(e => {
    const s = snapMap[e.id]; if (!s) return false;
    return JSON.stringify(e.attrs) !== JSON.stringify(s.attrs) ||
           e.logicalName !== s.logicalName || e.physicalName !== s.physicalName;
  });
  const addedRels   = curR.filter(r => !snapR.some(sr => sr.from===r.from && sr.to===r.to));
  const removedRels = snapR.filter(r => !curR.some(cr => cr.from===r.from && cr.to===r.to));
  const allEntMap = {}; [...curE, ...snapE].forEach(e => allEntMap[e.id] = e);
  const entLabel = id => escHtml(allEntMap[id]?.logicalName || id);
  let html = `<p style="color:#6c7086;font-size:12px;margin-bottom:14px">스냅샷: <b style="color:#cdd6f4">${escHtml(snap.name)}</b></p>`;
  if (!added.length && !removed.length && !modified.length && !addedRels.length && !removedRels.length) {
    html += '<p style="color:#a6e3a1;text-align:center;padding:24px">변경사항이 없습니다.</p>';
  }
  const section = (title, cls, items, renderFn) => {
    if (!items.length) return '';
    return `<div class="diff-section"><div class="diff-section-title" style="color:${cls==='diff-added'?'#a6e3a1':cls==='diff-removed'?'#f38ba8':'#fab387'}">${title} (${items.length})</div>
      ${items.map(renderFn).join('')}</div>`;
  };
  html += section('+ 추가된 엔티티', 'diff-added', added, e =>
    `<div class="diff-row diff-added">${escHtml(e.logicalName||'')}${e.physicalName?` <span style="color:#45475a;font-size:11px">(${escHtml(e.physicalName)})</span>`:''} <span style="color:#45475a;font-size:11px">${e.attrs?.length||0}개 속성</span></div>`);
  html += section('- 삭제된 엔티티', 'diff-removed', removed, e =>
    `<div class="diff-row diff-removed">${escHtml(e.logicalName||'')}${e.physicalName?` <span style="color:#45475a;font-size:11px">(${escHtml(e.physicalName)})</span>`:''}</div>`);
  html += section('~ 변경된 엔티티', 'diff-modified', modified, e => {
    const s = snapMap[e.id];
    const curNames  = (e.attrs||[]).map(a => a.physicalName||a.logicalName);
    const snapNames = (s.attrs||[]).map(a => a.physicalName||a.logicalName);
    const addedA    = curNames.filter(n => !snapNames.includes(n));
    const removedA  = snapNames.filter(n => !curNames.includes(n));
    const nameChg   = (e.logicalName!==s.logicalName||e.physicalName!==s.physicalName)
      ? `<span style="color:#45475a;font-size:11px"> 이름 변경</span>` : '';
    return `<div class="diff-row diff-modified">${escHtml(e.logicalName||'')}${nameChg}
      ${addedA.length||removedA.length ? `<div class="diff-attr">${addedA.map(n=>`<span style="color:#a6e3a1;margin-right:6px">+${escHtml(n)}</span>`).join('')}${removedA.map(n=>`<span style="color:#f38ba8;margin-right:6px">-${escHtml(n)}</span>`).join('')}</div>` : ''}</div>`;
  });
  if (addedRels.length || removedRels.length) {
    html += `<div class="diff-section"><div class="diff-section-title" style="color:#89b4fa">관계 변경</div>
      ${addedRels.map(r=>`<div class="diff-row diff-added" style="font-size:12px">+ ${entLabel(r.from)} → ${entLabel(r.to)} (${escHtml(r.card)})</div>`).join('')}
      ${removedRels.map(r=>`<div class="diff-row diff-removed" style="font-size:12px">- ${entLabel(r.from)} → ${entLabel(r.to)} (${escHtml(r.card)})</div>`).join('')}
    </div>`;
  }
  document.getElementById('diffContent').innerHTML = html;
  closeSnapshotModal();
  document.getElementById('diffOverlay').classList.add('active');
}
function closeDiffModal() {
  document.getElementById('diffOverlay').classList.remove('active');
}
