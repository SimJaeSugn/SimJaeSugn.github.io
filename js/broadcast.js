// ══════════════════════════════════════════════════════════════════
// BroadcastChannel — 같은 PC 탭 간 실시간 ERD 동기화
// 서버 없이 탭끼리 직접 통신 — 변경사항이 모든 탭에 즉시 반영
// ══════════════════════════════════════════════════════════════════

const _BC_CHANNEL  = 'uxer_erd_sync';
const _bcTabId     = Math.random().toString(36).slice(2, 8); // 탭 고유 ID
let   _bc          = null;
let   _bcEnabled   = true;   // 동기화 ON/OFF
let   _bcReceiving = false;  // 수신 중 플래그 (무한루프 방지)
let   _bcLastSent  = 0;      // 마지막 송신 타임스탬프 (오래된 수신 무시)
let   _bcPeers     = new Set(); // 현재 연결된 탭 ID

// ── 초기화 ────────────────────────────────────────────────────────
function _initBroadcast() {
  if (typeof BroadcastChannel === 'undefined') {
    console.info('[BroadcastChannel] 미지원 브라우저 — 탭 동기화 비활성');
    return;
  }
  try {
    _bc = new BroadcastChannel(_BC_CHANNEL);
  } catch(e) {
    console.warn('[BroadcastChannel] 채널 생성 실패:', e);
    return;
  }

  _bc.onmessage = _onBcMessage;

  // 이 탭이 열렸음을 다른 탭에 알림
  _bcPost({ type: 'hello' });

  // 탭 닫힐 때 알림
  window.addEventListener('beforeunload', () => _bcPost({ type: 'bye' }));

  _updateBcUI();
}

// ── 메시지 수신 핸들러 ────────────────────────────────────────────
function _onBcMessage(e) {
  const msg = e.data;
  if (!msg || msg.tabId === _bcTabId) return; // 자신이 보낸 메시지 무시

  switch (msg.type) {
    case 'hello':
      _bcPeers.add(msg.tabId);
      _updateBcUI();
      // 새 탭에게 현재 상태 전송
      _bcSendState();
      break;

    case 'bye':
      _bcPeers.delete(msg.tabId);
      _updateBcUI();
      break;

    case 'ping':
      // 연결 확인 요청 → pong 응답
      _bcPost({ type: 'pong' });
      break;

    case 'pong':
      _bcPeers.add(msg.tabId);
      _updateBcUI();
      break;

    case 'state':
      if (!_bcEnabled) break;
      // 자신이 마지막으로 보낸 것보다 오래된 메시지는 무시
      if (msg.ts < _bcLastSent - 500) break;
      _bcReceiving = true;
      try {
        restoreFromSnapshot(msg.state);
        renderDiagramPanel?.();
        updateZoomLabel?.();
        setViewMode?.(viewMode);
        syncToolDropdownLabels?.();
        render();
        _showBcIndicator(msg.tabId);
      } catch(err) {
        console.warn('[BroadcastChannel] 상태 복원 실패:', err);
      }
      _bcReceiving = false;
      break;
  }
}

// ── 상태 전송 ─────────────────────────────────────────────────────
function _bcSendState() {
  if (!_bc || _bcReceiving || !_bcEnabled) return;
  if (!_bcPeers.size) return; // 연결된 탭 없으면 불필요
  try {
    flushCurrentState();
    const state = { diagrams, activeDiagramId, viewMode, notationStyle, gridSnap };
    const ts = Date.now();
    _bcLastSent = ts;
    _bcPost({ type: 'state', ts, state });
  } catch(e) {
    console.warn('[BroadcastChannel] 전송 실패:', e);
  }
}

function _bcPost(data) {
  try { _bc?.postMessage({ ...data, tabId: _bcTabId }); } catch {}
}

// ── UI 업데이트 ───────────────────────────────────────────────────
function _showBcIndicator(fromTabId) {
  const badge = document.getElementById('bcSyncBadge');
  if (!badge) return;
  badge.textContent = '📡 동기화됨';
  badge.style.opacity = '1';
  clearTimeout(badge._fadeTimer);
  badge._fadeTimer = setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => { if (badge) badge.textContent = _bcBadgeLabel(); }, 400);
  }, 2000);
}

function _bcBadgeLabel() {
  const n = _bcPeers.size;
  return n > 0 ? `📡 ${n}탭 연결` : '📡';
}

function _updateBcUI() {
  const badge = document.getElementById('bcSyncBadge');
  if (!badge) return;
  const n = _bcPeers.size;
  badge.style.display  = (_bc && _bcEnabled) ? '' : 'none';
  badge.style.opacity  = '1';
  badge.title          = n > 0
    ? `${n}개 탭과 실시간 동기화 중 (탭ID: ${_bcTabId})`
    : '탭 동기화 활성 — 다른 탭을 열면 자동 연결';
  badge.textContent    = _bcBadgeLabel();

  // 도구 메뉴 토글 버튼 텍스트 업데이트
  const toggleItem = document.getElementById('ddItemBcSync');
  if (toggleItem) {
    toggleItem.textContent = _bcEnabled ? '📡 탭 동기화 끄기' : '📡 탭 동기화 켜기';
  }
}

// ── 동기화 ON/OFF 토글 ────────────────────────────────────────────
function toggleBcSync() {
  _bcEnabled = !_bcEnabled;
  showToast(_bcEnabled ? '📡 탭 동기화 활성화' : '📡 탭 동기화 비활성화');
  _updateBcUI();
  const badge = document.getElementById('bcSyncBadge');
  if (badge) badge.style.display = _bcEnabled ? '' : 'none';
}

// ── saveState 래핑 — 저장할 때마다 다른 탭으로 브로드캐스트 ────────
(function _wrapSaveState() {
  const _orig = window.saveState;
  if (typeof _orig !== 'function') return;
  window.saveState = function () {
    _orig.apply(this, arguments);
    // 수신 중이거나 연결 탭 없으면 브로드캐스트 스킵
    if (!_bcReceiving && _bcPeers.size > 0) {
      // 디바운스: 연속 변경 시 마지막 것만 전송 (16ms)
      clearTimeout(window._bcSendTimer);
      window._bcSendTimer = setTimeout(_bcSendState, 16);
    }
  };
})();

// ── 배지 DOM 주입 ─────────────────────────────────────────────────
(function _injectBcBadge() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectBcBadge);
    return;
  }
  if (document.getElementById('bcSyncBadge')) return;
  const badge = document.createElement('span');
  badge.id = 'bcSyncBadge';
  badge.style.cssText = `
    display:none; font-size:11px; font-weight:600; padding:2px 8px;
    border-radius:10px; background:var(--ac-p,#7c3aed22);
    color:var(--ac,#89b4fa); border:1px solid var(--ac,#89b4fa44);
    cursor:pointer; transition:opacity 0.3s; white-space:nowrap;
    user-select:none;
  `;
  badge.title   = '탭 동기화';
  badge.onclick = toggleBcSync;
  // 툴바 sessionBadge 앞에 삽입
  const anchor = document.getElementById('sessionBadge');
  if (anchor) anchor.parentNode.insertBefore(badge, anchor);
})();

// ── 연결 감지 (ping) ──────────────────────────────────────────────
// 페이지 로드 시 기존에 열린 탭이 있는지 확인
setTimeout(() => {
  if (_bc) _bcPost({ type: 'ping' });
}, 300);

// ── 초기화 실행 ───────────────────────────────────────────────────
_initBroadcast();
