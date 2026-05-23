// ══════════════════════════════════════════════════════════════════
// WebRTC P2P 실시간 협업 — PeerJS
// 초대 코드 하나로 다른 PC와 직접 연결 — 서버 불필요
// PeerJS 클라우드가 시그널링(연결 중개)만 담당, 데이터는 P2P 직전송
// ══════════════════════════════════════════════════════════════════

let _peer         = null;   // PeerJS Peer 인스턴스
let _rtcConn      = null;   // 활성 DataConnection
let _rtcReceiving = false;  // 수신 중 플래그 (무한루프 방지)
let _rtcSendTimer = null;   // 디바운스 타이머

// ── 모달 열기 ─────────────────────────────────────────────────────
function openRtcModal() {
  if (!document.getElementById('rtcOverlay')) _buildRtcModal();
  document.getElementById('rtcOverlay').classList.add('active');
  _rtcUpdateUI();
}

function _buildRtcModal() {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.id = 'rtcOverlay';
  el.setAttribute('onmousedown', "overlayCloseExtra(event,'rtcOverlay')");
  el.innerHTML = `
    <div class="modal" style="width:480px" onmousedown.stop>
      <h3>🔗 P2P 실시간 협업
        <span style="font-size:11px;font-weight:normal;color:var(--tx-sub)">
          WebRTC · 서버 불필요
        </span>
      </h3>

      <!-- ① 역할 선택 -->
      <div id="rtcPanelRole">
        <p style="color:var(--tx-sub);font-size:12px;margin-bottom:14px">
          한 쪽이 <b>호스트</b>로 초대 코드를 생성하고,<br>
          상대방이 코드를 입력해 <b>참가</b>하면 즉시 연결됩니다.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="btn-save-m" style="padding:14px 10px;flex-direction:column"
            onclick="rtcStartHost()">
            📤 호스트로 시작<br>
            <span style="font-size:11px;font-weight:normal;opacity:.8">초대 코드 생성</span>
          </button>
          <button class="btn" style="padding:14px 10px"
            onclick="_rtcShowPanel('guest')">
            📥 참가하기<br>
            <span style="font-size:11px;font-weight:normal;opacity:.8">코드 입력 후 연결</span>
          </button>
        </div>
      </div>

      <!-- ② 호스트 패널 -->
      <div id="rtcPanelHost" style="display:none">
        <div class="form-group">
          <label>내 초대 코드
            <span style="font-weight:normal;color:var(--tx-sub)">(상대에게 전달)</span>
          </label>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="rtcMyCode" readonly
              style="font-family:Consolas,monospace;font-size:18px;font-weight:bold;
                letter-spacing:3px;text-align:center;cursor:pointer;flex:1"
              onclick="this.select()" />
            <button class="btn" onclick="_rtcCopyCode()" title="클립보드에 복사">📋</button>
          </div>
        </div>
        <div id="rtcHostStatus"
          style="text-align:center;padding:12px;background:var(--bg-surface);
            border-radius:8px;font-size:13px;color:var(--tx-sub);margin-top:6px">
          ⏳ 상대방 연결 대기 중…
        </div>
      </div>

      <!-- ③ 게스트 패널 -->
      <div id="rtcPanelGuest" style="display:none">
        <div class="form-group">
          <label>호스트 초대 코드 입력</label>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="rtcPeerCode"
              placeholder="호스트에게 받은 코드"
              style="font-family:Consolas,monospace;font-size:15px;
                letter-spacing:2px;text-align:center;flex:1"
              onkeydown="if(event.key==='Enter') rtcConnectAsGuest()" />
            <button class="btn-save-m" onclick="rtcConnectAsGuest()">연결</button>
          </div>
        </div>
        <div id="rtcGuestStatus"
          style="display:none;text-align:center;padding:10px;background:var(--bg-surface);
            border-radius:8px;font-size:13px;color:var(--tx-sub);margin-top:6px">
        </div>
      </div>

      <!-- ④ 연결됨 패널 -->
      <div id="rtcPanelConnected" style="display:none">
        <div style="text-align:center;padding:16px 10px;background:var(--bg-surface);
          border-radius:8px;border-left:3px solid #a6e3a1">
          <div style="font-size:28px;margin-bottom:8px">🟢</div>
          <div style="font-weight:bold;font-size:15px;color:var(--tx-main);margin-bottom:4px">
            실시간 연결됨
          </div>
          <div id="rtcConnPeerInfo"
            style="font-size:11px;color:var(--tx-sub);font-family:Consolas,monospace"></div>
        </div>
        <p style="text-align:center;font-size:12px;color:var(--tx-sub);margin:10px 0 0">
          어느 쪽에서 편집해도 상대방 화면에 즉시 반영됩니다.
        </p>
      </div>

      <div class="modal-actions">
        <button class="btn-del-m" id="rtcBtnDisconnect"
          onclick="rtcDisconnect()" style="display:none">
          🔌 연결 종료
        </button>
        <button class="btn" id="rtcBtnBack"
          onclick="_rtcShowPanel('role')" style="display:none">
          ← 뒤로
        </button>
        <button class="btn-cancel-m"
          onclick="document.getElementById('rtcOverlay').classList.remove('active')">
          닫기
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

// ── 패널 전환 헬퍼 ────────────────────────────────────────────────
function _rtcShowPanel(name) {
  ['role','host','guest','connected'].forEach(p => {
    const el = document.getElementById(`rtcPanel${p.charAt(0).toUpperCase()+p.slice(1)}`);
    if (el) el.style.display = p === name ? '' : 'none';
  });
  const backBtn = document.getElementById('rtcBtnBack');
  if (backBtn) backBtn.style.display = name === 'host' || name === 'guest' ? '' : 'none';
}

// ── 호스트 시작 ────────────────────────────────────────────────────
function rtcStartHost() {
  if (!_checkPeerJS()) return;
  _rtcDestroyPeer();

  _rtcShowPanel('host');
  document.getElementById('rtcHostStatus').textContent = '⏳ 초대 코드 생성 중…';
  document.getElementById('rtcBtnBack').style.display  = '';

  _peer = new Peer({ debug: 0 });

  _peer.on('open', id => {
    document.getElementById('rtcMyCode').value = id;
    document.getElementById('rtcHostStatus').innerHTML =
      '⏳ 상대방이 코드를 입력하면 자동 연결됩니다.<br>' +
      '<span style="font-size:11px">연결 후 현재 ERD가 자동으로 공유됩니다.</span>';
  });

  _peer.on('connection', conn => {
    _rtcConn = conn;
    _rtcSetupConn('host');
  });

  _peer.on('error', err => {
    document.getElementById('rtcHostStatus').textContent = '❌ ' + err.type;
    showToast('❌ PeerJS 오류: ' + err.type);
  });
}

// ── 게스트 연결 ────────────────────────────────────────────────────
function rtcConnectAsGuest() {
  if (!_checkPeerJS()) return;
  const hostId = (document.getElementById('rtcPeerCode')?.value || '').trim();
  if (!hostId) { showToast('코드를 입력하세요.'); return; }

  _rtcDestroyPeer();

  const statusEl = document.getElementById('rtcGuestStatus');
  statusEl.style.display = '';
  statusEl.textContent   = '⏳ 연결 중…';
  document.getElementById('rtcBtnBack').style.display = 'none';

  _peer = new Peer({ debug: 0 });

  _peer.on('open', () => {
    _rtcConn = _peer.connect(hostId, { reliable: true });
    _rtcSetupConn('guest');
  });

  _peer.on('error', err => {
    statusEl.textContent = '❌ 연결 실패 (' + err.type + ') — 코드를 확인하세요.';
    document.getElementById('rtcBtnBack').style.display = '';
    showToast('❌ 연결 실패: ' + err.type);
  });
}

// ── DataConnection 공통 설정 ──────────────────────────────────────
function _rtcSetupConn(role) {
  _rtcConn.on('open', () => {
    showToast('🔗 P2P 연결 성공!');
    _rtcUpdateUI();
    // 호스트: 현재 ERD 상태 즉시 전송
    if (role === 'host') _rtcSendState();
  });

  _rtcConn.on('data', msg => {
    if (msg?.type !== 'state') return;
    _rtcReceiving = true;
    try {
      restoreFromSnapshot(msg.state);
      renderDiagramPanel?.();
      updateZoomLabel?.();
      setViewMode?.(viewMode);
      syncToolDropdownLabels?.();
      render();
    } catch(e) {
      console.warn('[WebRTC] 상태 복원 실패:', e);
    }
    _rtcReceiving = false;
  });

  _rtcConn.on('close', () => {
    showToast('🔌 P2P 연결이 종료됐습니다.');
    _rtcConn = null;
    _rtcUpdateUI();
  });

  _rtcConn.on('error', err => {
    showToast('❌ DataChannel 오류: ' + err.message);
  });
}

// ── 상태 전송 (디바운스) ──────────────────────────────────────────
function _rtcSendState() {
  if (!_rtcConn?.open || _rtcReceiving) return;
  try {
    flushCurrentState();
    _rtcConn.send({
      type:  'state',
      ts:    Date.now(),
      state: { diagrams, activeDiagramId, viewMode, notationStyle, gridSnap }
    });
  } catch(e) {
    console.warn('[WebRTC] 전송 실패:', e);
  }
}

// ── 연결 종료 ─────────────────────────────────────────────────────
function rtcDisconnect() {
  _rtcConn?.close();
  _rtcDestroyPeer();
  _rtcConn = null;
  _rtcUpdateUI();
  showToast('🔌 P2P 연결을 종료했습니다.');
}

function _rtcDestroyPeer() {
  try { _peer?.destroy(); } catch {}
  _peer = null;
}

// ── UI 동기화 ────────────────────────────────────────────────────
function _rtcUpdateUI() {
  const connected = !!_rtcConn?.open;

  // 모달 패널
  if (document.getElementById('rtcPanelConnected')) {
    if (connected) {
      _rtcShowPanel('connected');
      const info = document.getElementById('rtcConnPeerInfo');
      if (info) info.textContent = '피어: ' + (_rtcConn?.peer || '');
    } else {
      _rtcShowPanel('role');
    }
    const discBtn = document.getElementById('rtcBtnDisconnect');
    if (discBtn) discBtn.style.display = connected ? '' : 'none';
  }

  // 툴바 배지
  const badge = document.getElementById('rtcBadge');
  if (badge) {
    badge.style.display = connected ? '' : 'none';
    badge.textContent   = '🔗 협업 중';
    badge.title         = '클릭: 협업 모달 열기 | 피어: ' + (_rtcConn?.peer || '');
  }
}

// ── saveState 래핑 ────────────────────────────────────────────────
(function() {
  const _orig = window.saveState;
  if (typeof _orig !== 'function') return;
  window.saveState = function() {
    _orig.apply(this, arguments);
    if (!_rtcReceiving && _rtcConn?.open) {
      clearTimeout(_rtcSendTimer);
      _rtcSendTimer = setTimeout(_rtcSendState, 16);
    }
  };
})();

// ── 툴바 배지 DOM 주입 ────────────────────────────────────────────
(function() {
  const inject = () => {
    if (document.getElementById('rtcBadge')) return;
    const badge = document.createElement('span');
    badge.id = 'rtcBadge';
    badge.style.cssText = [
      'display:none', 'font-size:11px', 'font-weight:600',
      'padding:2px 8px', 'border-radius:10px',
      'background:rgba(166,227,161,.15)', 'color:#a6e3a1',
      'border:1px solid rgba(166,227,161,.35)',
      'cursor:pointer', 'white-space:nowrap', 'user-select:none'
    ].join(';');
    badge.onclick = openRtcModal;
    const anchor = document.getElementById('bcSyncBadge')
                || document.getElementById('sessionBadge');
    if (anchor) anchor.parentNode.insertBefore(badge, anchor);
  };
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', inject)
    : inject();
})();

// ── PeerJS 로드 확인 ─────────────────────────────────────────────
function _checkPeerJS() {
  if (typeof Peer !== 'undefined') return true;
  showToast('❌ PeerJS 라이브러리가 아직 로드되지 않았습니다. 네트워크 연결을 확인하세요.');
  return false;
}

function _rtcCopyCode() {
  const code = document.getElementById('rtcMyCode')?.value;
  if (!code) return;
  navigator.clipboard?.writeText(code)
    .then(() => showToast('📋 초대 코드 복사됨'))
    .catch(() => {
      document.getElementById('rtcMyCode').select();
      document.execCommand('copy');
      showToast('📋 복사됨');
    });
}
