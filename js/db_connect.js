// ══════════════════════════════════════════════════════════════════
// DB 연결 공통 — UXERManager 미들웨어 연동
// profile_manager.js, reverse_engineer.js 등에서 의존
// ══════════════════════════════════════════════════════════════════

const MW_URL = 'http://127.0.0.1:3737';

async function _mwPing() {
  try {
    const res = await fetch(`${MW_URL}/ping`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function _mwGetConfig() {
  try {
    const res = await fetch(`${MW_URL}/config`);
    const data = await res.json();
    return data.configured ? data : null;
  } catch {
    return null;
  }
}

function _showMwNotRunning() {
  let el = document.getElementById('mwNotRunningOverlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'mwNotRunningOverlay';
    el.innerHTML = `
      <div class="modal" style="width:400px" onmousedown.stop>
        <h3>미들웨어 미실행</h3>
        <p style="color:var(--tx-sub);font-size:13px;line-height:1.6;margin-bottom:16px">
          DB 연결 기능을 사용하려면 미들웨어가 실행 중이어야 합니다.<br><br>
          데스크탑 앱: <strong>UXERManager.exe</strong> 를 실행하면 자동으로 시작됩니다.<br>
          브라우저: <strong>uxermanager.exe</strong> 를 먼저 실행하세요.
        </p>
        <div class="modal-actions">
          <button class="btn-cancel-m" onclick="document.getElementById('mwNotRunningOverlay').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  }
  el.classList.add('active');
}
