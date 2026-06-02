// ── PC앱(Electron) 워크스페이스 영속화 ────────────────────────────
// PC앱에서 Ctrl+S 저장 시: 모든 다이어그램 정보를 사이드카를 통해
// ~/.uxermanager/aerm_workspace.json 단일 파일에 저장하고, 동시에 스냅샷을
// 자동 생성한다. 앱 시작 시 이 파일이 있으면 워크스페이스+스냅샷을 복원한다.
// 웹(github.io) 환경에서는 사용하지 않으며 기존 localStorage 방식을 그대로 둔다.

const _PC_WS_URL = (typeof MW_URL !== 'undefined' ? MW_URL : 'http://127.0.0.1:3737') + '/workspace';

/** Electron PC앱 여부 (preload 의 electronAPI.isElectron) */
function isPcApp() {
  return !!(window.electronAPI && window.electronAPI.isElectron);
}

// ── 로딩 오버레이 ─────────────────────────────────────────────────
// 파일 복원 동안 ERD 전체를 덮어 사용자 입력을 차단한다.
// (localStorage 가 먼저 렌더되므로, 파일 로드 전에 사용자가 손대는 것을 방지)
function _pcShowLoading() {
  if (document.getElementById('pcLoadingOverlay')) return;
  if (!document.getElementById('pcLoadingStyle')) {
    const st = document.createElement('style');
    st.id = 'pcLoadingStyle';
    st.textContent =
      '.pc-spinner{width:38px;height:38px;border:4px solid var(--bd2,#2a2f3a);' +
      'border-top-color:var(--ac,#5b9dff);border-radius:50%;animation:pcspin .8s linear infinite}' +
      '@keyframes pcspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'pcLoadingOverlay';
  el.style.cssText =
    'position:fixed;inset:0;z-index:9500;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:16px;' +
    'background:var(--bg-base,#11141a);color:var(--tx-main,#e6e9ef);' +
    'font-size:14px;user-select:none';
  el.innerHTML = '<div class="pc-spinner"></div><div>저장된 작업을 불러오는 중...</div>';
  document.body.appendChild(el);
}

function _pcHideLoading() {
  document.getElementById('pcLoadingOverlay')?.remove();
}

let _pcSaving = false;

/** Ctrl+S (PC앱 전용) — 모든 다이어그램 저장 + 스냅샷 자동 생성 */
async function saveWorkspacePC() {
  if (!isPcApp()) { if (typeof exportData === 'function') exportData(); return; }
  if (_pcSaving) return;
  _pcSaving = true;
  try {
    // 1) 스냅샷 자동 생성 (프롬프트 없음, flushCurrentState 포함)
    autoSnapshot('💾 저장');
    // 2) 단일 파일에 모든 다이어그램 + 스냅샷 저장
    const payload = {
      workspace: serializeWorkspace(),   // diagrams 전체 + 뷰 설정
      snapshots: SNAPSHOTS,
      savedAt: new Date().toISOString(),
    };
    const res = await fetch(_PC_WS_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    showToast('💾 저장됨 · 스냅샷 자동 생성');
  } catch (e) {
    showToast('❌ 저장 실패: ' + (e.message || e) + ' (사이드카 실행 확인)');
    console.error('[pc_store] 저장 실패:', e);
  } finally {
    _pcSaving = false;
  }
}

/** 앱 시작 시 (PC앱) 파일에서 워크스페이스+스냅샷 복원. 복원 성공 시 true */
async function loadWorkspacePC() {
  if (!isPcApp()) return false;
  // 사이드카(onefile exe) 부팅이 수 초 걸릴 수 있다. 시작 직후 단발 ping 은 실패하므로
  // 준비될 때까지 폴링한다(최대 ~20s). 그래야 저장 파일을 놓치지 않는다.
  let alive = (typeof _mwPing !== 'function');
  for (let i = 0; i < 40 && !alive; i++) {
    alive = await _mwPing();
    if (!alive) await new Promise(r => setTimeout(r, 500));
  }
  if (!alive) {
    console.warn('[pc_store] 사이드카 미기동 — 워크스페이스 파일 복원 건너뜀');
    return false;
  }
  try {
    const res = await fetch(_PC_WS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const j = await res.json();
    if (!j.exists || !j.data || !j.data.workspace) return false;

    // 모든 다이어그램 복원 (restoreFromSnapshot 은 diagrams 배열 전체를 복원)
    restoreFromSnapshot(j.data.workspace);
    if (Array.isArray(j.data.snapshots)) {
      SNAPSHOTS = j.data.snapshots;
      persistSnapshots();   // localStorage 캐시도 동기화
    }
    saveState();            // localStorage 라이브 상태를 파일 기준으로 맞춤
    return true;
  } catch (e) {
    console.warn('[pc_store] 복원 실패, localStorage 폴백:', e);
    return false;
  }
}
