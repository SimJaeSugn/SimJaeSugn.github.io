// ── DB 다이어그램 저장소 (erd-store API 클라이언트) ──────────────────
// 의존: db_connect.js (MW_URL, _mwPing, _showMwNotRunning)
//       profile_manager.js (_loadProfiles)
//       state.js (diagrams, activeDiagramId, getActiveDiagram,
//                 loadDiagramIntoWorkspace, flushCurrentState,
//                 serializeWorkspace, STORAGE_KEY)
//       ui.js (showToast, render, updateZoomLabel, renderDiagramPanel)
// 환경: 데스크탑(Electron) 전용 — 웹은 _mwPing 실패로 자동 비활성화

const _erdDbBase = () => `${MW_URL}/erd-store`;

// ── 디바운스 저장 타이머 (다이어그램별) ──────────────────────────────
const _erdDbSaveTimers = {};

// ── 폴링 타이머 ──────────────────────────────────────────────────────
let _erdDbPollTimer = null;
let _erdDbPollRunning = false; // 느린 네트워크에서 틱 중첩 방지
const _erdDbPollInterval = 8000; // ms

// ── echo 루프 방지 플래그 ─────────────────────────────────────────────
// erdDbSwitchLoad / 폴링이 원격 payload 적용 중에
// saveState 훅이 erdDbScheduleSave 를 예약하지 않도록 잠근다.
let _erdDbApplying = false;

// ── erdDbInit ────────────────────────────────────────────────────────
// erd_store 메타 테이블이 없으면 생성 (프로파일별 1회)
async function erdDbInit(profileName) {
  const running = await _mwPing();
  if (!running) { _showMwNotRunning(); return false; }
  try {
    const res = await fetch(
      `${_erdDbBase()}/init?profileName=${encodeURIComponent(profileName)}`,
      { method: 'POST' }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message || j.error || 'HTTP ' + res.status);
    }
    return true;
  } catch (e) {
    if (typeof showToast === 'function') showToast('DB 초기화 실패: ' + e.message);
    return false;
  }
}

// ── erdDbList ────────────────────────────────────────────────────────
// GET /erd-store/list?profileName=
// → { ok, items:[{diagram_id, name, version, updated_at, updated_by}] }
async function erdDbList(profileName) {
  try {
    const res = await fetch(
      `${_erdDbBase()}/list?profileName=${encodeURIComponent(profileName)}`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch {
    return null;
  }
}

// ── erdDbLoad ────────────────────────────────────────────────────────
// GET /erd-store/{id}?profileName=
// → { ok, diagram_id, name, payload(JSON문자열), version, ... }
// payload 파싱·적용은 호출자(erdDbSwitchLoad) 책임
async function erdDbLoad(diagramId, profileName) {
  try {
    const res = await fetch(
      `${_erdDbBase()}/${encodeURIComponent(diagramId)}?profileName=${encodeURIComponent(profileName)}`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j.ok) throw new Error(j.message || '로드 실패');
    return j;
  } catch {
    return null;
  }
}

// ── erdDbSave ────────────────────────────────────────────────────────
// PUT /erd-store/{id} — 낙관적 잠금 (expectedVersion)
// 성공: d.remoteVersion 갱신 + localStorage 직접 동기화, 새 version 반환
// 409: 최신 재로드 + 토스트
// 기타 오류: 토스트만, null 반환
async function erdDbSave(diagramId, name, payload, profileName, expectedVersion) {
  const running = await _mwPing();
  if (!running) return null;
  try {
    let updatedBy = 'web';
    if (typeof electronAPI !== 'undefined' && electronAPI && electronAPI.hostname) {
      updatedBy = electronAPI.hostname;
    }
    const res = await fetch(`${_erdDbBase()}/${encodeURIComponent(diagramId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, payload, expectedVersion, updatedBy, profileName }),
    });
    if (res.status === 409) {
      const d = diagrams.find(x => x.id === diagramId);
      if (d) await erdDbSwitchLoad(d);
      if (typeof showToast === 'function') showToast('타인이 변경했습니다. 최신 내용으로 갱신됨.');
      return null;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    // diagrams 배열에서 찾아 version 갱신 (이미 push된 경우)
    const d = diagrams.find(x => x.id === diagramId);
    if (d) d.remoteVersion = j.version;
    // localStorage 직접 갱신 (saveState 우회 → echo 루프 방지)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace())); } catch {}
    return j.version;
  } catch (e) {
    if (typeof showToast === 'function') showToast('DB 저장 실패: ' + e.message);
    return null;
  }
}

// ── erdDbDelete ──────────────────────────────────────────────────────
// DELETE /erd-store/{id}?profileName=
async function erdDbDelete(diagramId, profileName) {
  const running = await _mwPing();
  if (!running) return;
  try {
    const res = await fetch(
      `${_erdDbBase()}/${encodeURIComponent(diagramId)}?profileName=${encodeURIComponent(profileName)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (e) {
    if (typeof showToast === 'function') showToast('DB 항목 삭제 실패: ' + e.message);
  }
}

// ── erdDbScheduleSave ────────────────────────────────────────────────
// 다이어그램별 디바운스(1.5s) 자동저장
// _erdDbApplying 중이면 즉시 반환 (echo 루프 방지)
function erdDbScheduleSave(diag, delay = 1500) {
  if (!diag || diag.source !== 'db' || !diag.connection?.profileName) return;
  if (_erdDbApplying) return;
  clearTimeout(_erdDbSaveTimers[diag.id]);
  _erdDbSaveTimers[diag.id] = setTimeout(async () => {
    delete _erdDbSaveTimers[diag.id];
    flushCurrentState(); // 작업 배열 → diag 동기화
    const payload = JSON.stringify({
      entities:  diag.entities,
      relations: diag.relations,
      sections:  diag.sections,
      notes:     diag.notes,
      notesV2:   diag.notesV2,
      collapsed: diag.collapsed,
      vx: diag.vx, vy: diag.vy, scale: diag.scale,
    });
    await erdDbSave(diag.id, diag.name, payload,
      diag.connection.profileName, diag.remoteVersion);
  }, delay);
}

// ── erdDbCancelSave ──────────────────────────────────────────────────
// 보류 중인 디바운스 자동저장을 취소(삭제/전환 시 좀비 PUT 방지)
function erdDbCancelSave(diagramId) {
  if (_erdDbSaveTimers[diagramId]) {
    clearTimeout(_erdDbSaveTimers[diagramId]);
    delete _erdDbSaveTimers[diagramId];
  }
}

// ── erdDbSwitchLoad ──────────────────────────────────────────────────
// DB 다이어그램 전환 시 최신 payload 를 diag 에 적용하고 캔버스를 갱신한다.
// 캐시(기존 데이터)는 호출 전에 이미 표시됨 → 로드 완료 후 최신으로 덮어씀.
// _erdDbApplying 플래그로 saveState 훅 재귀 방지.
async function erdDbSwitchLoad(diag) {
  if (!diag || diag.source !== 'db' || !diag.connection?.profileName) return;

  // 전환 직후 예약된 스테일 캐시 자동저장 타이머 취소
  clearTimeout(_erdDbSaveTimers[diag.id]);
  delete _erdDbSaveTimers[diag.id];

  // 적용 락을 네트워크 await 전체로 확장 — 로드 도중 발생한 편집이
  // erdDbScheduleSave 로 스테일 저장을 예약하는 것을 차단(echo/유실 방지).
  _erdDbApplying = true;
  try {
    const running = await _mwPing();
    if (!running) return;

    const j = await erdDbLoad(diag.id, diag.connection.profileName);
    if (!j) return;

    // payload 파싱 + diag 객체에 적용
    let p;
    try {
      p = typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload;
    } catch {
      return;
    }
    diag.entities  = p.entities  || [];
    diag.relations = p.relations || [];
    diag.sections  = p.sections  || [];
    diag.notes     = p.notes     || [];
    diag.notesV2   = p.notesV2   || [];
    diag.collapsed = p.collapsed || [];
    if (p.vx    != null) diag.vx    = p.vx;
    if (p.vy    != null) diag.vy    = p.vy;
    if (p.scale != null) diag.scale = p.scale;
    diag.remoteVersion = j.version;

    // 로드 도중(await 사이) 생긴 스테일 자동저장 예약 제거
    clearTimeout(_erdDbSaveTimers[diag.id]);
    delete _erdDbSaveTimers[diag.id];

    // 활성 다이어그램일 때만 작업 배열 + 캔버스 갱신
    if (diag.id !== activeDiagramId) {
      // 비활성 다이어그램: 객체만 갱신, localStorage 동기화
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace())); } catch {}
      return;
    }

    loadDiagramIntoWorkspace(diag);
    if (typeof updateZoomLabel === 'function') updateZoomLabel();
    if (typeof render          === 'function') render();
    if (typeof renderDiagramPanel === 'function') renderDiagramPanel();
    // localStorage 직접 갱신 (saveState 우회)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace())); } catch {}
  } finally {
    _erdDbApplying = false;
  }
}

// ── erdDbStartPoll / erdDbStopPoll / _erdDbPollTick ─────────────────
// M4: 8s 주기로 서버 version 을 비교해 타인 변경 감지 → 자동 재로드
function erdDbStartPoll() {
  erdDbStopPoll();
  _erdDbPollTimer = setInterval(_erdDbPollTick, _erdDbPollInterval);
}

function erdDbStopPoll() {
  if (_erdDbPollTimer != null) {
    clearInterval(_erdDbPollTimer);
    _erdDbPollTimer = null;
  }
}

async function _erdDbPollTick() {
  if (_erdDbPollRunning) return; // 이전 틱이 아직 진행 중이면 중첩 방지
  _erdDbPollRunning = true;
  try {
    const diag = (typeof getActiveDiagram === 'function') ? getActiveDiagram() : null;
    if (!diag || diag.source !== 'db' || !diag.connection?.profileName) {
      erdDbStopPoll();
      return;
    }

    // 저장 대기 중(편집 진행 중)이면 스킵 — 사용자 편집 덮어쓰기 방지
    if (_erdDbSaveTimers[diag.id]) return;

    const j = await erdDbList(diag.connection.profileName);
    if (!j || !j.items) return;

    const remote = j.items.find(x => x.diagram_id === diag.id);
    if (!remote) return;

    // version 은 문자열/숫자 혼재 가능 → 숫자 비교
    if (Number(remote.version) > Number(diag.remoteVersion ?? -1)) {
      await erdDbSwitchLoad(diag);
      if (typeof showToast === 'function') showToast('다른 사용자가 변경했습니다. 최신 내용으로 갱신됨.');
    }
  } finally {
    _erdDbPollRunning = false;
  }
}

// ── erdDbLoadProfileOptions ──────────────────────────────────────────
// 생성 모달 드롭다운용 — _loadProfiles 결과의 profiles 배열 반환
async function erdDbLoadProfileOptions() {
  try {
    const data = await _loadProfiles();
    return data.profiles || [];
  } catch {
    return [];
  }
}
