// ══════════════════════════════════════════════════════════════════
// Feature 4: 타임라인 슬라이더 — 화면 하단 HUD 패널
// 모달 없이 캔버스 위에 떠 있는 컨트롤 바 — 드래그하며 ERD 변화를 직접 확인
// ══════════════════════════════════════════════════════════════════

let _tlSelectedIdx  = 0;
let _tlPreviewMode  = false;   // HUD가 열려 있는 동안 미리보기 중
let _tlSavedE       = null;    // 미리보기 전 원본 entities
let _tlSavedR       = null;    // 미리보기 전 원본 relations

// ── HUD 주입 (최초 1회) ───────────────────────────────────────────
function _ensureTimelineHud() {
  if (document.getElementById('tlHud')) return;

  const hud = document.createElement('div');
  hud.id = 'tlHud';
  hud.style.cssText = `
    display:none;
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    z-index:1200;
    width:min(780px, 92vw);
    background:var(--bg-modal, rgba(24,24,36,0.92));
    backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
    border:1px solid var(--bd2,rgba(255,255,255,.12));
    border-radius:16px;
    box-shadow:0 8px 40px rgba(0,0,0,.55);
    padding:14px 20px 12px;
    user-select:none;
    transition:opacity .2s, transform .2s;
  `;
  hud.innerHTML = `
    <!-- 상단 헤더 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:12px;font-weight:700;color:var(--ac,#89b4fa);letter-spacing:.5px">
        ⏱ 타임라인 슬라이더
      </span>
      <div style="display:flex;align-items:center;gap:8px">
        <span id="tlInfo"
          style="font-size:11px;color:var(--tx-sub);max-width:420px;
                 overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
        <button id="tlRestoreBtn" class="btn-save-m"
          style="display:none;padding:3px 12px;font-size:11px"
          onclick="restoreTimelineSnapshot()">↩ 복원</button>
        <button class="btn-cancel-m"
          style="padding:3px 10px;font-size:11px;line-height:1"
          onclick="closeTimeline()" title="닫기 (Esc)">✕</button>
      </div>
    </div>

    <!-- 타임라인 도트 트랙 -->
    <div id="tlTrack"
      style="position:relative;height:52px;margin-bottom:4px;overflow:hidden"></div>

    <!-- 슬라이더 -->
    <input type="range" id="tlSlider" min="0" step="1" value="0"
      style="width:100%;accent-color:var(--ac,#89b4fa);cursor:pointer;
             height:4px;margin:0"
      oninput="onTimelineSlide(this.value)"
      onchange="onTimelineCommit()">

    <!-- 키보드 힌트 -->
    <div style="text-align:right;font-size:9px;color:var(--tx-muted);margin-top:5px;
                letter-spacing:.3px">
      ← → 이동 &nbsp;·&nbsp; Enter 복원 &nbsp;·&nbsp; Esc 닫기
    </div>
  `;
  document.body.appendChild(hud);

  // 키보드 단축키
  hud._keyHandler = (e) => {
    if (!_tlPreviewMode) return;
    if (e.key === 'Escape') { closeTimeline(); return; }
    const slider = document.getElementById('tlSlider');
    if (!slider) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const v = Math.max(0, parseInt(slider.value) - 1);
      slider.value = v; onTimelineSlide(v); onTimelineCommit();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const v = Math.min(parseInt(slider.max), parseInt(slider.value) + 1);
      slider.value = v; onTimelineSlide(v); onTimelineCommit();
    } else if (e.key === 'Enter') {
      restoreTimelineSnapshot();
    }
  };
  document.addEventListener('keydown', hud._keyHandler);
}

// ── 열기 ─────────────────────────────────────────────────────────
function openTimelineModal() {
  if (!SNAPSHOTS.length) {
    showToast('저장된 스냅샷이 없습니다. 먼저 스냅샷을 저장하세요.');
    return;
  }

  _ensureTimelineHud();
  const hud    = document.getElementById('tlHud');
  const slider = document.getElementById('tlSlider');

  // 현재 상태 백업 (미리보기 복구용)
  _tlSavedE = ENTITIES.slice();
  _tlSavedR = RELATIONS.slice();
  _tlPreviewMode = true;

  _tlSelectedIdx = 0;
  slider.max   = Math.max(0, SNAPSHOTS.length - 1);
  slider.value = 0;

  document.getElementById('tlRestoreBtn').style.display = 'none';

  // HUD 표시 (애니메이션)
  hud.style.display = '';
  hud.style.opacity = '0';
  hud.style.transform = 'translateX(-50%) translateY(20px)';
  requestAnimationFrame(() => {
    hud.style.transition = 'opacity .22s, transform .22s';
    hud.style.opacity    = '1';
    hud.style.transform  = 'translateX(-50%) translateY(0)';
  });

  _renderTimelineDots();
  onTimelineSlide(0);
}

// ── 도트 트랙 렌더 ────────────────────────────────────────────────
function _renderTimelineDots() {
  const track = document.getElementById('tlTrack');
  if (!track) return;
  const n = SNAPSHOTS.length;

  // 가로 라인
  let html = `<div style="position:absolute;top:26px;left:0;right:0;height:2px;
    background:var(--bd2,rgba(255,255,255,.12));border-radius:1px;z-index:0"></div>`;

  SNAPSHOTS.forEach((snap, i) => {
    const pct = n <= 1 ? 50 : (i / (n - 1)) * 100;
    const dt  = new Date(snap.ts);
    const time = `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} `
               + `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    // 라벨이 너무 많으면 짧게
    const lbl = snap.name.length > 8 ? snap.name.slice(0, 7) + '…' : snap.name;
    const isActive = i === _tlSelectedIdx;

    html += `
      <div data-tl-idx="${i}"
        style="position:absolute;left:${pct}%;transform:translateX(-50%);
               text-align:center;width:64px;top:0;cursor:pointer;z-index:1"
        onclick="onTlDotClick(${i})">
        <div style="font-size:8px;color:var(--tx-muted);line-height:1.3;
                    margin-bottom:2px;pointer-events:none">${escHtml(lbl)}</div>
        <div style="width:${isActive ? 12 : 8}px;height:${isActive ? 12 : 8}px;
                    border-radius:50%;
                    background:${isActive ? 'var(--ac,#89b4fa)' : 'var(--bd2,#444)'};
                    margin:0 auto;border:2px solid var(--bg-base,#1e1e2e);
                    transition:all .15s;pointer-events:none"></div>
        <div style="font-size:7px;color:var(--tx-muted);margin-top:2px;
                    pointer-events:none">${time}</div>
      </div>`;
  });
  track.innerHTML = html;
}

// ── 도트 클릭 ────────────────────────────────────────────────────
function onTlDotClick(idx) {
  const slider = document.getElementById('tlSlider');
  if (slider) slider.value = idx;
  onTimelineSlide(idx);
  onTimelineCommit();
}

// ── 슬라이더 이동 (실시간 미리보기) ──────────────────────────────
function onTimelineSlide(idx) {
  _tlSelectedIdx = parseInt(idx);
  const snap = SNAPSHOTS[_tlSelectedIdx];
  if (!snap) return;

  // 정보 텍스트 업데이트
  const dt = new Date(snap.ts);
  const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} `
    + `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  const infoEl = document.getElementById('tlInfo');
  if (infoEl) infoEl.innerHTML =
    `<b style="color:var(--tx-main)">${escHtml(snap.name)}</b>`
    + ` &nbsp;·&nbsp; ${dateStr}`
    + ` &nbsp;·&nbsp; <span style="color:var(--tx-muted)">${_tlSelectedIdx + 1} / ${SNAPSHOTS.length}</span>`;

  // 활성 도트 스타일 갱신
  document.querySelectorAll('[data-tl-idx]').forEach(el => {
    const dot = el.querySelector('div:nth-child(2)');
    if (!dot) return;
    const active = parseInt(el.dataset.tlIdx) === _tlSelectedIdx;
    dot.style.width      = active ? '12px' : '8px';
    dot.style.height     = active ? '12px' : '8px';
    dot.style.background = active ? 'var(--ac,#89b4fa)' : 'var(--bd2,#444)';
  });

  // 캔버스 실시간 미리보기
  try {
    const state = JSON.parse(snap.state);
    const diag  = state.diagrams?.find(d => d.id === activeDiagramId) || state.diagrams?.[0];
    if (!diag) return;
    ENTITIES.length  = 0; (diag.entities  || []).forEach(e => ENTITIES.push(e));
    RELATIONS.length = 0; (diag.relations || []).forEach(r => RELATIONS.push(r));
    renderNow();
  } catch(e) { /* 미리보기 실패 무시 */ }
}

// ── 슬라이더 확정 (mouseup / 도트 클릭) — 복원 버튼 표시 ─────────
function onTimelineCommit() {
  const btn = document.getElementById('tlRestoreBtn');
  if (btn) btn.style.display = '';
}

// ── 복원 ─────────────────────────────────────────────────────────
function restoreTimelineSnapshot() {
  const snap = SNAPSHOTS[_tlSelectedIdx];
  if (!snap) return;
  askConfirm(
    `"${snap.name}" 시점으로 복원하시겠습니까?\n현재 작업은 실행취소(Ctrl+Z)로 되돌릴 수 있습니다.`,
    () => {
      try {
        const s = JSON.parse(snap.state);
        _tlPreviewMode = false;
        _tlSavedE = null;
        _tlSavedR = null;
        restoreFromSnapshot(s);
        saveState();
        _hideTimelineHud();
        render();
        showToast('⏱ 복원 완료');
      } catch (err) {
        showToast('복원 중 오류가 발생했습니다.');
      }
    },
    '복원'
  );
}

// ── 닫기 ─────────────────────────────────────────────────────────
function closeTimeline() {
  // 원본 데이터 복구
  if (_tlSavedE) {
    ENTITIES.length  = 0; _tlSavedE.forEach(e => ENTITIES.push(e));
    RELATIONS.length = 0; _tlSavedR.forEach(r => RELATIONS.push(r));
    _tlSavedE = null;
    _tlSavedR = null;
  }
  _tlPreviewMode = false;
  _hideTimelineHud();
  renderNow();
}

// 하위 호환 alias
function closeTimelineModal() { closeTimeline(); }

let _tlHideTimer = null;
function _hideTimelineHud() {
  const hud = document.getElementById('tlHud');
  if (!hud) return;
  hud.style.transition = 'opacity .18s, transform .18s';
  hud.style.opacity    = '0';
  hud.style.transform  = 'translateX(-50%) translateY(16px)';
  if (_tlHideTimer) clearTimeout(_tlHideTimer);
  _tlHideTimer = setTimeout(() => {
    // 그 사이 다시 열렸으면(미리보기 모드) 숨기지 않는다
    if (hud && !_tlPreviewMode) hud.style.display = 'none';
    _tlHideTimer = null;
  }, 200);
}
