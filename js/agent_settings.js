// ══════════════════════════════════════════════════════════════════
// Agent 설정 모달 — 벤더(provider) · 모델(MAIN/FAST) · API Key
// 의존: agent_panel.js (_AGENT_URL), ui.js (overlayClose, showToast)
// ══════════════════════════════════════════════════════════════════

async function openAgentSettingsModal() {
  _renderAgentSettingsModal();
  document.getElementById('agentSettingsOverlay').classList.add('active');

  // GET /agent/config 로 현재 설정 채우기
  try {
    const res = await fetch(`${_AGENT_URL}/agent/config`);
    if (!res.ok) throw new Error('설정 로드 실패');
    const data = await res.json();
    const providerEl = document.getElementById('asProvider');
    const mainEl     = document.getElementById('asModelMain');
    const fastEl     = document.getElementById('asModelFast');
    if (providerEl) providerEl.value = data.provider || 'openai';
    if (mainEl)     mainEl.value     = data.modelMain || '';
    if (fastEl)     fastEl.value     = data.modelFast || '';
    const keyStatusEl = document.getElementById('asKeyStatus');
    if (keyStatusEl) {
      keyStatusEl.textContent = data.keyConfigured ? '· 키 설정됨' : '· 키 미설정';
      keyStatusEl.style.color = data.keyConfigured ? 'var(--ok,#3ba55d)' : 'var(--tx-sub)';
    }
  } catch (e) {
    showToast('Agent 설정을 불러오지 못했습니다: ' + e.message, 'error');
  }
}

function closeAgentSettingsModal() {
  const overlay = document.getElementById('agentSettingsOverlay');
  if (overlay) overlay.classList.remove('active');
}

async function _submitAgentSettings() {
  const provider  = (document.getElementById('asProvider')?.value  || '').trim();
  const modelMain = (document.getElementById('asModelMain')?.value || '').trim();
  const modelFast = (document.getElementById('asModelFast')?.value || '').trim();
  const apiKey    = (document.getElementById('asApiKey')?.value    || '').trim();

  const saveBtn = document.getElementById('asSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  try {
    // 1) 모델 설정 저장
    const cfgRes = await fetch(`${_AGENT_URL}/agent/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, modelMain, modelFast }),
    });
    if (!cfgRes.ok) {
      const err = await cfgRes.json().catch(() => ({}));
      throw new Error(err.detail || 'Agent 설정 저장 실패');
    }

    // 2) API Key 입력 시에만 저장
    if (apiKey) {
      const keyRes = await fetch(`${_AGENT_URL}/agent/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!keyRes.ok) {
        const err = await keyRes.json().catch(() => ({}));
        throw new Error(err.detail || 'API Key 저장 실패');
      }
      // 키 입력 필드 초기화
      const keyEl = document.getElementById('asApiKey');
      if (keyEl) keyEl.value = '';
    }

    showToast('Agent 설정이 저장되었습니다.');
    closeAgentSettingsModal();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  }
}

// ── DOM 렌더 ──────────────────────────────────────────────────────

function _renderAgentSettingsModal() {
  if (document.getElementById('agentSettingsOverlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'agentSettingsOverlay';
  overlay.setAttribute('onmousedown', "overlayClose(event,'agentSettingsOverlay')");
  overlay.innerHTML = `
    <div class="modal" style="width:min(420px,96vw)" onmousedown.stop>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3 style="margin:0">Agent 설정</h3>
        <button class="btn" style="font-size:18px;padding:2px 8px;line-height:1"
          onclick="closeAgentSettingsModal()">×</button>
      </div>
      <div class="form-row">
        <label class="form-label">벤더 (Provider)</label>
        <select class="form-input" id="asProvider">
          <option value="openai">OpenAI</option>
          <option value="anthropic" disabled>Anthropic (준비중)</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">MAIN 모델 (답변·계획)</label>
        <input class="form-input" id="asModelMain" type="text" placeholder="gpt-4o">
      </div>
      <div class="form-row">
        <label class="form-label">FAST 모델 (의도 분기)</label>
        <input class="form-input" id="asModelFast" type="text" placeholder="gpt-4o-mini">
      </div>
      <div class="form-row">
        <label class="form-label">OpenAI API Key
          <span style="font-size:11px;color:var(--tx-sub)">(변경 시만 입력)</span>
          <span id="asKeyStatus" style="font-size:11px;margin-left:4px"></span>
        </label>
        <input class="form-input" id="asApiKey" type="password" placeholder="sk-...">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button class="btn-cancel-m" onclick="closeAgentSettingsModal()">취소</button>
        <button class="btn-save-m" id="asSaveBtn" onclick="_submitAgentSettings()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
