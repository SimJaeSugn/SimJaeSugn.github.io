// ══════════════════════════════════════════════════════════════════
// Feature 1: 공유 URL 생성
// ERD 상태를 LZ-String으로 압축 → ?erd= 파라미터로 공유
// ══════════════════════════════════════════════════════════════════

function generateShareUrl() {
  flushCurrentState();
  const state = { diagrams, activeDiagramId, viewMode, notationStyle, gridSnap };
  let compressed;
  try {
    compressed = LZString.compressToEncodedURIComponent(JSON.stringify(state));
  } catch(e) {
    showToast('❌ 압축 실패 — LZ-String 라이브러리를 확인하세요.');
    return;
  }
  const url = `${location.origin}${location.pathname}?erd=${compressed}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => showToast('🔗 공유 URL이 클립보드에 복사되었습니다.'))
      .catch(() => _showShareDialog(url));
  } else {
    _showShareDialog(url);
  }
}

function _showShareDialog(url) {
  let modal = document.getElementById('shareUrlOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'shareUrlOverlay';
    modal.innerHTML = `
      <div class="modal" style="width:580px" onmousedown.stop>
        <h3>🔗 공유 URL</h3>
        <p style="color:var(--tx-sub);font-size:12px;margin-bottom:10px">
          아래 URL을 복사해 공유하세요. 열면 현재 ERD 상태가 그대로 복원됩니다.
        </p>
        <textarea class="form-input" id="shareUrlText" rows="4" readonly
          style="font-family:Consolas,monospace;font-size:11px;resize:none;word-break:break-all"></textarea>
        <div class="modal-actions">
          <button class="btn-save-m" onclick="
            const t=document.getElementById('shareUrlText');
            t.select(); document.execCommand('copy');
            showToast('복사됨');
          ">📋 복사</button>
          <button class="btn-cancel-m" onclick="document.getElementById('shareUrlOverlay').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('shareUrlText').value = url;
  modal.classList.add('active');
}

/** 페이지 로드 시 ?erd= 파라미터가 있으면 복원. 성공 시 true 반환 */
function tryRestoreFromUrl() {
  if (typeof LZString === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  const encoded = params.get('erd');
  if (!encoded) return false;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return false;
    const state = JSON.parse(json);
    // 복원 가능한 스냅샷인지 먼저 검증 (비어있거나 구버전 포맷이면 복원하지 않고 실패 처리)
    if (!state || !Array.isArray(state.diagrams) || !state.diagrams.length) {
      console.warn('[share] 공유 URL에 복원 가능한 다이어그램이 없습니다.');
      return false;
    }
    restoreFromSnapshot(state);
    saveState();
    // URL 정리 (?erd= 제거)
    const clean = location.href.replace(/([?&])erd=[^&#]*/g, '$1').replace(/[?&]$/, '');
    history.replaceState(null, '', clean || location.pathname);
    showToast('🔗 공유 URL에서 ERD를 불러왔습니다.');
    return true;
  } catch(e) {
    console.warn('[share] URL 복원 실패:', e);
    return false;
  }
}
