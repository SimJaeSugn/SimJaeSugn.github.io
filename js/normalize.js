// ══════════════════════════════════════════════════════════════════
// Feature 5: 정규화 진단
// 속성 이름 패턴 분석 → 반복 컬럼 / N:M 직접 연결 감지 → 경고 배지 표시
// ══════════════════════════════════════════════════════════════════

let _normWarnings = {};   // entityId → string[]
let _normActive   = false;

function runNormalizeDiagnosis() {
  _normWarnings = {};
  let issueCount = 0;

  // ── 검사 1: 반복 컬럼 패턴 (addr1, addr2, addr3 등) ──────────
  ENTITIES.forEach(e => {
    const patternMap = {};
    (e.attrs || []).forEach(a => {
      const name = (a.logicalName || a.physicalName || '').trim();
      const m    = name.match(/^(.+?)(\d+)$/);
      if (m) patternMap[m[1]] = (patternMap[m[1]] || 0) + 1;
    });
    Object.entries(patternMap).forEach(([base, cnt]) => {
      if (cnt >= 2) {
        if (!_normWarnings[e.id]) _normWarnings[e.id] = [];
        _normWarnings[e.id].push(`반복 컬럼 패턴: ${base}1 ~ ${base}${cnt} (${cnt}개)`);
        issueCount++;
      }
    });
  });

  // ── 검사 2: N:M 직접 연결 (중간 테이블 없이) ─────────────────
  RELATIONS.forEach(r => {
    if (r.card === 'N:M') {
      [r.from, r.to].forEach(id => {
        if (!_normWarnings[id]) _normWarnings[id] = [];
        if (!_normWarnings[id].some(w => w.includes('N:M'))) {
          _normWarnings[id].push('N:M 직접 연결 — 중간(교차) 테이블 설계 검토 필요');
          issueCount++;
        }
      });
    }
  });

  _normActive = true;
  render();

  const entCount = Object.keys(_normWarnings).length;
  if (entCount === 0) {
    showToast('✅ 정규화 진단 완료 — 이상 없음');
  } else {
    showToast(`⚠ ${entCount}개 엔티티, ${issueCount}개 문제 감지`);
    openNormResultModal();
  }
}

function clearNormDiagnosis() {
  _normWarnings = {};
  _normActive   = false;
  render();
}

function openNormResultModal() {
  let modal = document.getElementById('normOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'normOverlay';
    modal.setAttribute('onmousedown', "overlayCloseExtra(event,'normOverlay')");
    modal.innerHTML = `
      <div class="modal" style="width:520px" onmousedown.stop>
        <h3>⚠ 정규화 진단 결과</h3>
        <div id="normResultContent" style="max-height:420px;overflow-y:auto;margin-bottom:4px"></div>
        <div class="modal-actions">
          <button class="btn-del-m"
            onclick="clearNormDiagnosis();document.getElementById('normOverlay').classList.remove('active')">
            배지 지우기
          </button>
          <button class="btn-cancel-m"
            onclick="document.getElementById('normOverlay').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  const entMap = {};
  ENTITIES.forEach(e => entMap[e.id] = e);
  const html = Object.entries(_normWarnings).map(([id, warnings]) => {
    const e    = entMap[id];
    const name = e ? escHtml(e.logicalName || e.physicalName || id) : escHtml(id);
    return `<div style="margin-bottom:10px;padding:10px 12px;background:var(--bg-surface);
        border-radius:6px;border-left:3px solid var(--ac-y)">
      <div style="font-weight:bold;color:var(--tx-main);margin-bottom:5px">${name}</div>
      ${warnings.map(w =>
        `<div style="color:var(--tx-sub);font-size:12px;padding:1px 0">⚠ ${escHtml(w)}</div>`
      ).join('')}
    </div>`;
  }).join('');
  document.getElementById('normResultContent').innerHTML = html || '<p style="color:var(--tx-sub)">이상 없음</p>';
  modal.classList.add('active');
}
