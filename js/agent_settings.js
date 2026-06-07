// ══════════════════════════════════════════════════════════════════
// Agent 설정 모달 — 벤더(provider) · 엔드포인트(baseUrl) · 모델(MAIN/FAST) · API Key
// 의존: agent_panel.js (_AGENT_URL), ui.js (overlayClose, showToast)
// ══════════════════════════════════════════════════════════════════

async function openAgentSettingsModal() {
  _renderAgentSettingsModal();
  document.getElementById('agentSettingsOverlay').classList.add('active');
  const testStatusEl = document.getElementById('asTestStatus');
  if (testStatusEl) testStatusEl.textContent = '';   // 이전 테스트 결과 초기화

  // GET /agent/config 로 현재 설정 채우기
  try {
    const res = await fetch(`${_AGENT_URL}/agent/config`);
    if (!res.ok) throw new Error('설정 로드 실패');
    const data = await res.json();
    const providerEl = document.getElementById('asProvider');
    const mainEl     = document.getElementById('asModelMain');
    const fastEl     = document.getElementById('asModelFast');
    const baseUrlEl  = document.getElementById('asBaseUrl');
    if (providerEl) providerEl.value = data.provider || 'openai';
    if (mainEl)     mainEl.value     = data.modelMain || '';
    if (fastEl)     fastEl.value     = data.modelFast || '';
    if (baseUrlEl)  baseUrlEl.value  = data.baseUrl  || '';
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
  const baseUrl   = (document.getElementById('asBaseUrl')?.value   || '').trim();
  const apiKey    = (document.getElementById('asApiKey')?.value    || '').trim();

  const saveBtn = document.getElementById('asSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  try {
    // 1) 모델 설정 저장
    const cfgRes = await fetch(`${_AGENT_URL}/agent/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, modelMain, modelFast, baseUrl }),
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

// ── 연결 테스트 ───────────────────────────────────────────────────
// 입력 중인 값(baseUrl·MAIN 모델·키)으로 실제 최소 호출을 보내 검증.
// 키 필드가 비어 있으면 저장된 키로 폴백(백엔드 처리).
async function _testAgentConnection() {
  const baseUrl   = (document.getElementById('asBaseUrl')?.value   || '').trim();
  const modelMain = (document.getElementById('asModelMain')?.value || '').trim();
  const apiKey    = (document.getElementById('asApiKey')?.value    || '').trim();

  const btn    = document.getElementById('asTestBtn');
  const status = document.getElementById('asTestStatus');
  const setStatus = (msg, color) => {
    if (status) { status.textContent = msg; status.style.color = color || 'var(--tx-sub)'; }
  };

  if (btn) { btn.disabled = true; btn.textContent = '테스트 중...'; }
  setStatus('⏳ 연결 확인 중...', 'var(--tx-sub)');

  try {
    const res = await fetch(`${_AGENT_URL}/agent/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, modelMain, apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `요청 실패 (HTTP ${res.status})`);

    if (data.ok) {
      setStatus(`✅ 연결 성공 — 모델: ${data.model} · 엔드포인트: ${data.baseUrl}`,
                'var(--ok,#3ba55d)');
    } else {
      setStatus('❌ 연결 실패 — ' + (data.detail || '알 수 없는 오류'),
                'var(--danger,#e03e3e)');
    }
  } catch (e) {
    setStatus('❌ 연결 실패 — ' + e.message, 'var(--danger,#e03e3e)');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '연결 테스트'; }
  }
}

// ── 모델 호환성 검사 ──────────────────────────────────────────────
// 입력(또는 저장) 설정 모델로 4단계 배터리(content·tool_calls·구조화·정확도)를
// 실제 실행해 에이전트 사용 적합성을 판정. 저장 전에도 확인 가능.
async function _diagnoseAgentModel() {
  const baseUrl   = (document.getElementById('asBaseUrl')?.value   || '').trim();
  const modelMain = (document.getElementById('asModelMain')?.value || '').trim();
  const apiKey    = (document.getElementById('asApiKey')?.value    || '').trim();

  const btn    = document.getElementById('asDiagBtn');
  const status = document.getElementById('asTestStatus');
  if (btn) { btn.disabled = true; btn.textContent = '검사 중...'; }
  if (status) {
    status.style.color = 'var(--tx-sub)';
    status.textContent = '⏳ 모델 호환성 검사 중… (툴 호출·구조화 출력 등 4단계, 수 초~수십 초 소요)';
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const VMAP = {
    ok:      { ico: '✅', label: '사용 가능',  color: 'var(--ok,#3ba55d)' },
    limited: { ico: '⚠️', label: '제한적',     color: '#d8a200' },
    unfit:   { ico: '❌', label: '부적합',     color: 'var(--danger,#e03e3e)' },
  };

  try {
    const res = await fetch(`${_AGENT_URL}/agent/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, modelMain, apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `요청 실패 (HTTP ${res.status})`);

    const v = VMAP[data.verdict] || VMAP.unfit;
    const stagesHtml = (data.stages || []).map(s =>
      `<div style="margin:2px 0">${s.ok ? '✅' : '❌'} <b>${esc(s.label)}</b>` +
      `<span style="color:var(--tx-sub)"> — ${esc(s.detail)}</span></div>`
    ).join('');
    if (status) {
      status.style.color = '';
      status.innerHTML =
        `<div style="font-weight:600;color:${v.color};margin-bottom:4px">${v.ico} ${v.label}` +
        ` — <span style="font-weight:400">${esc(data.summary || '')}</span></div>` +
        `<div style="font-size:11px;color:var(--tx-sub);margin-bottom:4px">모델: ${esc(data.model)} · ${esc(data.baseUrl)}</div>` +
        stagesHtml;
    }
  } catch (e) {
    if (status) { status.style.color = 'var(--danger,#e03e3e)'; status.textContent = '❌ 검사 실패 — ' + e.message; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '호환성 검사'; }
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
          <option value="custom">자체 서빙 / OpenAI 호환 서버</option>
          <option value="anthropic" disabled>Anthropic (준비중)</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">엔드포인트 Base URL
          <span style="font-size:11px;color:var(--tx-sub)">(자체 서빙 시 입력 · 비우면 OpenAI 공식)</span>
        </label>
        <input class="form-input" id="asBaseUrl" type="text" placeholder="http://localhost:8000/v1">
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
        <label class="form-label">API Key
          <span style="font-size:11px;color:var(--tx-sub)">(변경 시만 입력 · 자체 서버는 불필요할 수 있음)</span>
          <span id="asKeyStatus" style="font-size:11px;margin-left:4px"></span>
        </label>
        <input class="form-input" id="asApiKey" type="password" placeholder="sk-...">
      </div>
      <div id="asTestStatus" style="font-size:12px;margin-top:10px;min-height:16px;white-space:pre-wrap;word-break:break-word"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <button class="btn" id="asTestBtn" onclick="_testAgentConnection()">연결 테스트</button>
        <button class="btn" id="asDiagBtn" onclick="_diagnoseAgentModel()" title="툴 호출·구조화 출력·인자 정확도를 실제로 검사해 에이전트 사용 적합성을 판정">호환성 검사</button>
        <span style="flex:1"></span>
        <button class="btn-cancel-m" onclick="closeAgentSettingsModal()">취소</button>
        <button class="btn-save-m" id="asSaveBtn" onclick="_submitAgentSettings()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
