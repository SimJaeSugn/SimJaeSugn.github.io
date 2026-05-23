// ══════════════════════════════════════════════════════════════════
// Feature 4: 타임라인 슬라이더
// 스냅샷을 가로 타임라인으로 표시 — 슬라이더 드래그 시 캔버스 실시간 미리보기
// ══════════════════════════════════════════════════════════════════

let _tlSelectedIdx = 0;

function openTimelineModal() {
  if (!SNAPSHOTS.length) {
    showToast('저장된 스냅샷이 없습니다. 먼저 스냅샷을 저장하세요.');
    return;
  }
  let modal = document.getElementById('timelineOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'timelineOverlay';
    modal.setAttribute('onmousedown', "overlayCloseExtra(event,'timelineOverlay')");
    modal.innerHTML = `
      <div class="modal" style="width:720px" onmousedown.stop>
        <h3>⏱ 타임라인 슬라이더</h3>
        <p style="color:var(--tx-sub);font-size:12px;margin-bottom:16px">
          슬라이더를 드래그하면 해당 시점의 ERD가 캔버스에 미리보기됩니다.
        </p>
        <!-- 타임라인 트랙 -->
        <div id="tlTrack" style="position:relative;height:60px;margin:0 0 6px;user-select:none"></div>
        <!-- 슬라이더 -->
        <input type="range" id="tlSlider" min="0" step="1" value="0"
          style="width:100%;accent-color:var(--ac);cursor:pointer;margin-bottom:8px"
          oninput="onTimelineSlide(this.value)">
        <!-- 정보 -->
        <div id="tlInfo" style="text-align:center;font-size:12px;color:var(--tx-sub);min-height:20px;margin-bottom:16px"></div>
        <div class="modal-actions">
          <button class="btn-save-m" id="tlRestoreBtn" onclick="restoreTimelineSnapshot()" style="display:none">
            이 시점으로 복원
          </button>
          <button class="btn-cancel-m" onclick="closeTimelineModal()">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('tlSlider').addEventListener('change', () => {
      document.getElementById('tlRestoreBtn').style.display = '';
    });
  }

  _tlSelectedIdx = 0;
  const slider = document.getElementById('tlSlider');
  slider.max   = Math.max(0, SNAPSHOTS.length - 1);
  slider.value = 0;
  document.getElementById('tlRestoreBtn').style.display = 'none';
  _renderTimelineDots();
  onTimelineSlide(0);
  modal.classList.add('active');
}

function _renderTimelineDots() {
  const track = document.getElementById('tlTrack');
  if (!track) return;
  const n = SNAPSHOTS.length;
  let html = `<div style="position:absolute;top:28px;left:0;right:0;height:2px;
    background:var(--bd2);border-radius:1px"></div>`;
  SNAPSHOTS.forEach((snap, i) => {
    const pct  = n <= 1 ? 50 : (i / (n - 1)) * 100;
    const dt   = new Date(snap.ts);
    const time = `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const lbl  = snap.name.length > 10 ? snap.name.slice(0, 9) + '…' : snap.name;
    html += `<div style="position:absolute;left:${pct}%;transform:translateX(-50%);
      text-align:center;width:72px;top:0">
      <div style="font-size:9px;color:var(--tx-sub);line-height:1.2;margin-bottom:2px">${escHtml(lbl)}</div>
      <div style="width:10px;height:10px;border-radius:50%;background:var(--ac);
        margin:0 auto;border:2px solid var(--bg-base)"></div>
      <div style="font-size:8px;color:var(--tx-muted);margin-top:2px">${time}</div>
    </div>`;
  });
  track.innerHTML = html;
}

function onTimelineSlide(idx) {
  _tlSelectedIdx = parseInt(idx);
  const snap = SNAPSHOTS[_tlSelectedIdx];
  if (!snap) return;
  const dt = new Date(snap.ts);
  const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} `
    + `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  const infoEl = document.getElementById('tlInfo');
  if (infoEl) infoEl.innerHTML =
    `<b style="color:var(--tx-main)">${escHtml(snap.name)}</b> &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; `
    + `<span style="color:var(--tx-muted)">${_tlSelectedIdx + 1} / ${SNAPSHOTS.length}</span>`;

  // 캔버스 실시간 미리보기 (현재 데이터 임시 교체 후 렌더, 즉시 복구)
  try {
    const state = JSON.parse(snap.state);
    const diag  = state.diagrams?.find(d => d.id === activeDiagramId) || state.diagrams?.[0];
    if (!diag) return;
    const savedE = ENTITIES.slice();
    const savedR = RELATIONS.slice();
    ENTITIES.length = 0; (diag.entities  || []).forEach(e => ENTITIES.push(e));
    RELATIONS.length= 0; (diag.relations || []).forEach(r => RELATIONS.push(r));
    renderNow();  // 즉시 렌더 (RAF 지연 없이 — 상태 복구 전에 그려야 함)
    ENTITIES.length = 0; savedE.forEach(e => ENTITIES.push(e));
    RELATIONS.length= 0; savedR.forEach(r => RELATIONS.push(r));
  } catch(e) { /* 미리보기 실패 무시 */ }
}

function restoreTimelineSnapshot() {
  const snap = SNAPSHOTS[_tlSelectedIdx];
  if (!snap) return;
  askConfirm(
    `"${snap.name}" 시점으로 복원하시겠습니까?\n현재 작업은 실행취소(Ctrl+Z)로 되돌릴 수 있습니다.`,
    () => {
      restoreFromSnapshot(JSON.parse(snap.state));
      saveState();
      closeTimelineModal();
      render();
      showToast('⏱ 복원 완료');
    },
    '복원'
  );
}

function closeTimelineModal() {
  document.getElementById('timelineOverlay')?.classList.remove('active');
  renderNow(); // 현재 상태로 캔버스 즉시 복구
}
