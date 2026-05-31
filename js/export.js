// ══════════════════════════════════════════════════════════════════
// 내보내기 폴더 관리 (File System Access API)
// 처음 내보내기 시 폴더를 한 번 선택 → 세션 동안 기억
// ══════════════════════════════════════════════════════════════════
let _exportDirHandle = null;

/** 내보내기 폴더 핸들 반환. 미설정이면 폴더 선택 다이얼로그 열기 */
async function _getExportDir() {
  if (_exportDirHandle) {
    try {
      const perm = await _exportDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return _exportDirHandle;
      const req = await _exportDirHandle.requestPermission({ mode: 'readwrite' });
      if (req === 'granted') return _exportDirHandle;
    } catch { /* 핸들 만료 — 재선택 */ }
    _exportDirHandle = null;
  }
  if (typeof window.showDirectoryPicker !== 'function') return null;
  try {
    _exportDirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
    showToast('📁 내보내기 폴더 설정 완료 — 이후 자동 저장됩니다.');
    return _exportDirHandle;
  } catch {
    return null; // 사용자 취소
  }
}

/** 내보내기 폴더에 파일 쓰기. 성공 시 true 반환 */
async function _writeExportFile(filename, text) {
  const dir = await _getExportDir();
  if (!dir) return false;
  try {
    const fh = await dir.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch (err) {
    showToast('❌ 파일 저장 실패: ' + err.message);
    return false;
  }
}

/** 내보내기 폴더 초기화 (다음 내보내기 시 재선택) */
function resetExportDir() {
  _exportDirHandle = null;
  showToast('📁 내보내기 폴더가 초기화되었습니다. 다음 저장 시 폴더를 다시 선택합니다.');
}

/** 폴백: 구형 브라우저용 <a download> 방식 */
function _fallbackDownload(filename, data, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── JSON 내보내기 ─────────────────────────────────────────────
let _exportDiagIds = new Set();
let _ddlEntityIds = new Set();

function exportData() {
  flushCurrentState();
  openExportDiagSelectModal();
}

function openExportDiagSelectModal() {
  const list = document.getElementById('exportDiagList');
  if (!list) return;
  list.innerHTML = '';
  _exportDiagIds = new Set([activeDiagramId]);
  diagrams.forEach(d => {
    const isActive = d.id === activeDiagramId;
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;background:#313244;user-select:none;';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.value = d.id; chk.checked = isActive;
    chk.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--ac,#89b4fa);flex-shrink:0;';
    chk.addEventListener('change', () => {
      if (chk.checked) _exportDiagIds.add(d.id); else _exportDiagIds.delete(d.id);
    });
    const nameSpan = document.createElement('span');
    nameSpan.textContent = d.name || '(이름 없음)';
    nameSpan.style.cssText = 'color:#cdd6f4;font-size:13px;flex:1;';
    label.appendChild(chk); label.appendChild(nameSpan);
    if (isActive) {
      const badge = document.createElement('span');
      badge.textContent = '현재';
      badge.style.cssText = 'font-size:10px;color:#89b4fa;padding:1px 5px;border:1px solid #89b4fa;border-radius:3px;';
      label.appendChild(badge);
    }
    list.appendChild(label);
  });
  document.getElementById('exportDiagSelectOverlay').classList.add('active');
}

function closeExportDiagSelectModal() {
  document.getElementById('exportDiagSelectOverlay').classList.remove('active');
}

async function doExportSelectedDiag() {
  if (_exportDiagIds.size === 0) { showToast('내보낼 다이어그램을 선택하세요.'); return; }
  closeExportDiagSelectModal();
  const selected = diagrams.filter(d => _exportDiagIds.has(d.id));
  if (!selected.length) { showToast('선택한 다이어그램을 찾을 수 없습니다.'); return; }
  const exportActiveId = _exportDiagIds.has(activeDiagramId) ? activeDiagramId : selected[0].id;
  const data = { version: 2, diagrams: selected, activeDiagramId: exportActiveId };
  const text = JSON.stringify(data, null, 2);
  const _n = new Date();
  const _ts = [_n.getFullYear(), _n.getMonth()+1, _n.getDate()].map(v => String(v).padStart(2,'0')).join('')
            + '_' + [_n.getHours(), _n.getMinutes(), _n.getSeconds()].map(v => String(v).padStart(2,'0')).join('');
  const filename = selected.length === 1
    ? (selected[0].name || 'diagram').replace(/[<>:"/\\|?*]/g, '_') + '_' + _ts + '.json'
    : 'uxerd_' + _ts + '.json';
  const saved = await _writeExportFile(filename, text);
  if (saved) {
    showToast(`💾 ${filename} 저장 완료`);
  } else {
    _fallbackDownload(filename, text);
  }
}

// ── 전체 백업 내보내기 ───────────────────────────────────────
async function exportFullBackup() {
  flushCurrentState();
  openBackupConfigModal('export', null);
}

async function _doExportWithGroups(groups) {
  const data = {
    backupVersion: 3,
    exportedAt: new Date().toISOString(),
    appVersion: 'uxerd',
  };
  if (groups.includes('diagrams')) {
    data.main = { diagrams, activeDiagramId, viewMode, notationStyle, gridSnap };
  }
  if (groups.includes('snapshots')) {
    data.snapshots = JSON.parse(JSON.stringify(SNAPSHOTS));
  }
  if (groups.includes('templates')) {
    data.templates = loadTemplates();
  }
  const needSettings = groups.includes('uiSettings') || groups.includes('aiKey');
  if (needSettings) {
    data.settings = {};
    if (groups.includes('uiSettings')) {
      data.settings.theme     = localStorage.getItem(THEME_STORAGE) || null;
      data.settings.qbOpen    = localStorage.getItem('_qbOpen') ?? '1';
      data.settings.qbLarge   = localStorage.getItem('_qbLarge') || '0';
      data.settings.qbDock    = localStorage.getItem('_qbDock')  || 'top';
      data.settings.qbCustom  = localStorage.getItem('_qbCustom') || '[]';
      data.settings.panelW    = localStorage.getItem('_panelW') || null;
      data.settings.shortcuts = localStorage.getItem('_shortcuts') || '{}';
    }
    if (groups.includes('aiKey')) {
      data.settings.aiKey = localStorage.getItem(AI_KEY_STORAGE) || '';
    }
  }

  const text = JSON.stringify(data, null, 2);
  const _bn = new Date();
  const _bts = [_bn.getFullYear(), _bn.getMonth()+1, _bn.getDate()].map(v => String(v).padStart(2,'0')).join('')
             + '_' + [_bn.getHours(), _bn.getMinutes(), _bn.getSeconds()].map(v => String(v).padStart(2,'0')).join('');
  const filename = 'erd_all_backup_' + _bts + '.json';
  const saved = await _writeExportFile(filename, text);
  if (saved) {
    showToast(`💾 ${filename} 저장 완료`);
  } else {
    _fallbackDownload(filename, text);
    showToast('전체 백업이 저장되었습니다.');
  }
}

// ── 이미지 저장 ──────────────────────────────────────────────
async function downloadImage(includeSections = true, hiDPI = false) {
  document.getElementById('imgMenu').style.display = 'none';
  if (!ENTITIES.length) { alert('다이어그램에 엔티티가 없습니다.'); return; }

  const padding = 60;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + W);
    maxY = Math.max(maxY, e.y + h);
  });
  if (includeSections) {
    SECTIONS.forEach(s => {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w);
      maxY = Math.max(maxY, s.y + s.h);
    });
  }

  const dpr = hiDPI ? 2 : 1;
  const imgW = Math.max(800, maxX - minX + padding * 2);
  const imgH = Math.max(400, maxY - minY + padding * 2);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = imgW * dpr;
  offCanvas.height = imgH * dpr;

  const savedCtx = ctx, savedVx = vx, savedVy = vy, savedScale = scale;
  ctx = offCanvas.getContext('2d');
  // 고해상도: 캔버스를 dpr배로 키우고 전체 컨텍스트를 dpr배 스케일 → 좌표 로직은 논리 크기 기준 유지
  ctx.scale(dpr, dpr);
  vx = padding - minX; vy = padding - minY; scale = 1;

  ctx.fillStyle = '#1e1e2e';
  ctx.fillRect(0, 0, imgW, imgH);

  ctx.save();
  ctx.strokeStyle = '#2a2a3d'; ctx.lineWidth = 0.5;
  const gridSize = 40;
  const offX2 = (vx % gridSize + gridSize) % gridSize;
  const offY2 = (vy % gridSize + gridSize) % gridSize;
  for (let gx = offX2; gx < imgW; gx += gridSize) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, imgH); ctx.stroke();
  }
  for (let gy = offY2; gy < imgH; gy += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(imgW, gy); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(vx, vy);
  ctx.scale(scale, scale);
  if (includeSections) drawSections();
  drawRelations();
  ENTITIES.forEach(drawEntity);
  ctx.restore();

  ctx = savedCtx; vx = savedVx; vy = savedVy; scale = savedScale;
  render();

  const suffix = (includeSections ? '' : '_no_section') + (hiDPI ? '@2x' : '');
  const filename = (getActiveDiagram()?.name || 'erd') + suffix + '.png';
  offCanvas.toBlob(async (blob) => {
    if (!blob) { showToast('❌ 이미지 생성 실패 (다이어그램이 너무 큽니다)'); return; }
    const saved = await _writeExportFile(filename, blob);
    if (saved) showToast(`💾 ${filename} 저장 완료`);
    else _fallbackDownload(filename, blob, 'image/png');
  }, 'image/png');
}

// ── SVG 내보내기 ──────────────────────────────────────────────
async function downloadSVG() {
  document.getElementById('imgMenu').style.display = 'none';
  if (!ENTITIES.length) { alert('다이어그램에 엔티티가 없습니다.'); return; }
  const pad = 100;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + W); maxY = Math.max(maxY, e.y + h);
  });
  SECTIONS.forEach(s => {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
  });
  NOTES.forEach(n => {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NOTE_W); maxY = Math.max(maxY, n.y + NOTE_H);
  });
  const svgW = maxX - minX + pad * 2, svgH = maxY - minY + pad * 2;
  const ox = pad - minX, oy = pad - minY;
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const svgCrowsFoot = (x, y, angle, isMany) => {
    const L = 14, W2 = 8;
    const deg = (angle + Math.PI) * 180 / Math.PI;
    let s = `<g transform="translate(${x+ox},${y+oy}) rotate(${deg})" stroke="#89b4fa" stroke-width="1.5" fill="none">`;
    s += `<line x1="${L}" y1="${-W2}" x2="${L}" y2="${W2}"/>`;
    s += `<line x1="${L+5}" y1="${-W2}" x2="${L+5}" y2="${W2}"/>`;
    if (isMany) {
      s += `<line x1="0" y1="0" x2="${L}" y2="${-W2}"/>`;
      s += `<line x1="0" y1="0" x2="${L}" y2="0"/>`;
      s += `<line x1="0" y1="0" x2="${L}" y2="${W2}"/>`;
    } else {
      s += `<line x1="0" y1="${-W2}" x2="0" y2="${W2}"/>`;
    }
    return s + '</g>';
  };

  const svgOne = (x, y, angle) => {
    const perp = angle + Math.PI / 2, d = 6;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const cp = Math.cos(perp), sp = Math.sin(perp);
    const bx = x + ox, by = y + oy;
    return `<g stroke="#89b4fa" stroke-width="1.5" fill="none">` +
      `<line x1="${bx+6*cp}" y1="${by+6*sp}" x2="${bx-6*cp}" y2="${by-6*sp}"/>` +
      `<line x1="${bx-d*ca+6*cp}" y1="${by-d*sa+6*sp}" x2="${bx-d*ca-6*cp}" y2="${by-d*sa-6*sp}"/>` +
      `</g>`;
  };

  const svgMany = (x, y, angle) => {
    const toeLen = 14, barDist = 22, spread = 7;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const cp = Math.cos(angle + Math.PI / 2), sp = Math.sin(angle + Math.PI / 2);
    const tx = x + ox - toeLen * ca, ty = y + oy - toeLen * sa;
    const bx = x + ox - barDist * ca, by = y + oy - barDist * sa;
    const ex = x + ox, ey = y + oy;
    return `<g stroke="#89b4fa" stroke-width="1.5" fill="none">` +
      `<line x1="${tx}" y1="${ty}" x2="${ex+spread*cp}" y2="${ey+spread*sp}"/>` +
      `<line x1="${tx}" y1="${ty}" x2="${ex}" y2="${ey}"/>` +
      `<line x1="${tx}" y1="${ty}" x2="${ex-spread*cp}" y2="${ey-spread*sp}"/>` +
      `<line x1="${bx+6*cp}" y1="${by+6*sp}" x2="${bx-6*cp}" y2="${by-6*sp}"/>` +
      `</g>`;
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="background:#1e1e2e">`;

  NOTES.forEach(n => {
    const nx = n.x + ox, ny = n.y + oy;
    svg += `<rect x="${nx}" y="${ny}" width="${NOTE_W}" height="${NOTE_H}" rx="5" fill="${esc(n.color||'#f9e2af')}" opacity="0.9"/>`;
    const lines = (n.text||'').split('\n').slice(0,4);
    lines.forEach((line, i) => {
      svg += `<text x="${nx+8}" y="${ny+20+i*17}" fill="#11111b" font-size="12" font-family="Segoe UI,sans-serif">${esc(line)}</text>`;
    });
  });

  RELATIONS.forEach(rel => {
    const path = getRelationPath(rel);
    if (!path) return;
    const { waypoints: wp, angleA, angleB } = path;
    const n = wp.length;
    const [fromCard, toCard] = rel.card.split(':');
    const pts = wp.map(p => `${p[0]+ox},${p[1]+oy}`).join(' ');
    const dash = rel.lineStyle === 'dashed' ? ' stroke-dasharray="7,4"' : '';
    svg += `<polyline points="${pts}" fill="none" stroke="#89b4fa" stroke-width="1.5"${dash}/>`;

    if (notationStyle === 'crowsfoot') {
      svg += svgCrowsFoot(wp[0][0], wp[0][1], angleA, fromCard === 'N');
      svg += svgCrowsFoot(wp[n-1][0], wp[n-1][1], angleB, toCard === 'N');
    } else {
      svg += (fromCard === 'N' ? svgMany : svgOne)(wp[0][0], wp[0][1], angleA);
      svg += (toCard === 'N' ? svgMany : svgOne)(wp[n-1][0], wp[n-1][1], angleB);
    }

    const lpos = getRelLabelPositions(rel);
    if (lpos) {
      const [cardX, cardY] = lpos.card;
      svg += `<text x="${cardX+ox}" y="${cardY+oy}" fill="#cba6f7" font-size="11" font-family="Segoe UI,sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(rel.card)}</text>`;
      if (rel.label) {
        const [lblX, lblY] = lpos.label;
        svg += `<text x="${lblX+ox}" y="${lblY+oy}" fill="#a6adc8" font-size="11" font-family="Segoe UI,sans-serif" text-anchor="middle" dominant-baseline="middle">${esc(rel.label)}</text>`;
      }
    }
  });

  ENTITIES.forEach(e => {
    const h = entityHeight(e);
    const ex = e.x + ox, ey = e.y + oy;
    svg += `<rect x="${ex}" y="${ey}" width="${W}" height="${h}" rx="8" fill="#1e1e2e" stroke="#45475a" stroke-width="1.5"/>`;
    const _svgEc = ENTITY_COLOR_PALETTE.find(c => c.id === (e.colorTag || null)) || ENTITY_COLOR_PALETTE[0];
    svg += `<rect x="${ex}" y="${ey}" width="${W}" height="${HEADER_H}" rx="8" fill="${_svgEc.bg}"/>`;
    svg += `<rect x="${ex}" y="${ey+HEADER_H-8}" width="${W}" height="8" fill="#313244"/>`;
    const dname = entDisplayName(e);
    svg += `<text x="${ex+W/2}" y="${ey+HEADER_H/2+1}" fill="#cdd6f4" font-size="13" font-family="Segoe UI,sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(dname)}</text>`;
    if (!collapsedEntities.has(e.id)) e.attrs.forEach((attr, i) => {
      const ry = ey + HEADER_H + i * ROW_H;
      const bg = attr.kind==='pk' ? '#3d1f28' : attr.kind==='fk' ? '#2d2013' : 'transparent';
      if (bg !== 'transparent') svg += `<rect x="${ex+1}" y="${ry}" width="${W-2}" height="${ROW_H}" fill="${bg}"/>`;
      const badge = attr.kind==='pk'?'PK':attr.kind==='fk'?'FK':'';
      const badgeColor = attr.kind==='pk'?'#f38ba8':'#fab387';
      if (badge) svg += `<text x="${ex+8}" y="${ry+ROW_H/2+1}" fill="${badgeColor}" font-size="9" font-family="Segoe UI,sans-serif" font-weight="bold" dominant-baseline="middle">${badge}</text>`;
      const aname = esc(attrDisplayName(attr));
      const acolor = attr.kind==='pk'?'#f38ba8':attr.kind==='fk'?'#fab387':'#a6e3a1';
      svg += `<text x="${ex+28}" y="${ry+ROW_H/2+1}" fill="${acolor}" font-size="11" font-family="Consolas,monospace" dominant-baseline="middle">${aname}</text>`;
      svg += `<text x="${ex+W-8}" y="${ry+ROW_H/2+1}" fill="#6c7086" font-size="10" font-family="Consolas,monospace" text-anchor="end" dominant-baseline="middle">${esc(attr.type||'')}</text>`;
      if (i > 0) svg += `<line x1="${ex+1}" y1="${ry}" x2="${ex+W-1}" y2="${ry}" stroke="#2a2a3d" stroke-width="0.5"/>`;
    });
  });

  svg += '</svg>';
  const filename = (getActiveDiagram()?.name || 'erd') + '.svg';
  const saved = await _writeExportFile(filename, svg);
  if (saved) showToast(`💾 ${filename} 저장 완료`);
  else _fallbackDownload(filename, svg, 'image/svg+xml');
}

// ── DDL 생성 ─────────────────────────────────────────────────
function openDDLModal() {
  // 옵션 초기화: FK/INDEX/COMMENT 모두 포함, 엔티티 전체 선택
  ['ddlOptFK', 'ddlOptIndex', 'ddlOptComment'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = true;
  });
  _ddlEntityIds = new Set(ENTITIES.map(e => e.id));
  renderDDLEntityList();
  generateDDL(document.getElementById('ddlDialect').value);
  document.getElementById('ddlOverlay').classList.add('active');
}
function closeDDLModal() { document.getElementById('ddlOverlay').classList.remove('active'); }

/** DDL 엔티티 선택 목록 렌더링 (export 다이어그램 선택 UI 패턴 모방) */
function renderDDLEntityList() {
  const list = document.getElementById('ddlEntityList');
  if (!list) return;
  list.innerHTML = '';
  ENTITIES.forEach(e => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;cursor:pointer;background:#313244;user-select:none;';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.value = e.id; chk.checked = _ddlEntityIds.has(e.id);
    chk.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--ac,#89b4fa);flex-shrink:0;';
    chk.addEventListener('change', () => {
      if (chk.checked) _ddlEntityIds.add(e.id); else _ddlEntityIds.delete(e.id);
      generateDDL();
    });
    const nameSpan = document.createElement('span');
    nameSpan.textContent = entDisplayName(e) || e.id;
    nameSpan.style.cssText = 'color:#cdd6f4;font-size:13px;flex:1;';
    label.appendChild(chk); label.appendChild(nameSpan);
    list.appendChild(label);
  });
}


function copyDDL() {
  const text = document.getElementById('ddlContent').textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => {
    showToast('DDL이 클립보드에 복사되었습니다.');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); showToast('DDL이 클립보드에 복사되었습니다.'); }
    catch(e) { showToast('복사 실패: 직접 선택해 복사하세요.'); }
    document.body.removeChild(ta);
  });
}

/**
 * DDL 순수 생성 함수 (DOM 비의존)
 * @param {string} dialect - 'mysql' | 'postgresql' | 'oracle' | 'mssql'
 * @param {Array}  entities - 엔티티 배열 (기본: 전역 ENTITIES)
 * @param {Object} opts - { includeFK: true, includeIndex: true, includeComment: true }
 * @returns {{ sqls: string[], text: string }}
 */
// ── 크로스-DB 타입 정규화 ─────────────────────────────────────────
function _normalizeColType(rawType, dialect) {
  if (!rawType) return dialect === 'oracle' ? 'VARCHAR2(255)' : 'VARCHAR(255)';

  // 타입 파라미터 분리: "character varying(100)" → base="character varying", param="(100)"
  const m = rawType.trim().match(/^([a-zA-Z][a-zA-Z0-9 _]*)(\(.*\))?/);
  if (!m) return rawType;
  const base = m[1].trim().toLowerCase();
  const param = m[2] || '';

  // 정규화 테이블: [PostgreSQL 계열] → {mysql, postgresql, oracle, mssql}
  const map = {
    // 문자형
    'character varying':   { mysql:`VARCHAR${param||'(255)'}`, postgresql:`CHARACTER VARYING${param||'(255)'}`, oracle:`VARCHAR2${param||'(255)'}`, mssql:`NVARCHAR${param||'(255)'}` },
    'varchar':             { mysql:`VARCHAR${param||'(255)'}`, postgresql:`VARCHAR${param||'(255)'}`,           oracle:`VARCHAR2${param||'(255)'}`, mssql:`NVARCHAR${param||'(255)'}` },
    'char':                { mysql:`CHAR${param||'(1)'}`,     postgresql:`CHAR${param||'(1)'}`,                oracle:`CHAR${param||'(1)'}`,        mssql:`NCHAR${param||'(1)'}` },
    'character':           { mysql:`CHAR${param||'(1)'}`,     postgresql:`CHAR${param||'(1)'}`,                oracle:`CHAR${param||'(1)'}`,        mssql:`NCHAR${param||'(1)'}` },
    'bpchar':              { mysql:'CHAR(1)',                  postgresql:'CHAR(1)',                            oracle:'CHAR(1)',                     mssql:'NCHAR(1)' },
    'text':                { mysql:'TEXT',                     postgresql:'TEXT',                              oracle:'CLOB',                        mssql:'NVARCHAR(MAX)' },
    'clob':                { mysql:'LONGTEXT',                 postgresql:'TEXT',                              oracle:'CLOB',                        mssql:'NVARCHAR(MAX)' },
    'nvarchar':            { mysql:`VARCHAR${param||'(255)'}`, postgresql:`VARCHAR${param||'(255)'}`,          oracle:`NVARCHAR2${param||'(255)'}`,  mssql:`NVARCHAR${param||'(255)'}` },
    'nvarchar2':           { mysql:`VARCHAR${param||'(255)'}`, postgresql:`VARCHAR${param||'(255)'}`,          oracle:`NVARCHAR2${param||'(255)'}`,  mssql:`NVARCHAR${param||'(255)'}` },
    'varchar2':            { mysql:`VARCHAR${param||'(255)'}`, postgresql:`VARCHAR${param||'(255)'}`,          oracle:`VARCHAR2${param||'(255)'}`,   mssql:`NVARCHAR${param||'(255)'}` },
    // 정수형
    'integer':             { mysql:'INT',                      postgresql:'INTEGER',                           oracle:'NUMBER(10)',                  mssql:'INT' },
    'int':                 { mysql:'INT',                      postgresql:'INTEGER',                           oracle:'NUMBER(10)',                  mssql:'INT' },
    'int4':                { mysql:'INT',                      postgresql:'INTEGER',                           oracle:'NUMBER(10)',                  mssql:'INT' },
    'bigint':              { mysql:'BIGINT',                   postgresql:'BIGINT',                            oracle:'NUMBER(19)',                  mssql:'BIGINT' },
    'int8':                { mysql:'BIGINT',                   postgresql:'BIGINT',                            oracle:'NUMBER(19)',                  mssql:'BIGINT' },
    'smallint':            { mysql:'SMALLINT',                 postgresql:'SMALLINT',                          oracle:'NUMBER(5)',                   mssql:'SMALLINT' },
    'int2':                { mysql:'SMALLINT',                 postgresql:'SMALLINT',                          oracle:'NUMBER(5)',                   mssql:'SMALLINT' },
    'tinyint':             { mysql:'TINYINT',                  postgresql:'SMALLINT',                          oracle:'NUMBER(3)',                   mssql:'TINYINT' },
    'serial':              { mysql:'INT',                      postgresql:'SERIAL',                            oracle:'NUMBER(10)',                  mssql:'INT' },
    'bigserial':           { mysql:'BIGINT',                   postgresql:'BIGSERIAL',                         oracle:'NUMBER(19)',                  mssql:'BIGINT' },
    // 소수형
    'numeric':             { mysql:`DECIMAL${param||'(18,4)'}`,postgresql:`NUMERIC${param||'(18,4)'}`,        oracle:`NUMBER${param||'(18,4)'}`,   mssql:`DECIMAL${param||'(18,4)'}` },
    'decimal':             { mysql:`DECIMAL${param||'(18,4)'}`,postgresql:`NUMERIC${param||'(18,4)'}`,        oracle:`NUMBER${param||'(18,4)'}`,   mssql:`DECIMAL${param||'(18,4)'}` },
    'number':              { mysql:`DECIMAL${param||'(18,4)'}`,postgresql:`NUMERIC${param||'(18,4)'}`,        oracle:`NUMBER${param||''}`,         mssql:`DECIMAL${param||'(18,4)'}` },
    'real':                { mysql:'FLOAT',                    postgresql:'REAL',                              oracle:'BINARY_FLOAT',               mssql:'REAL' },
    'float':               { mysql:`FLOAT${param}`,            postgresql:`FLOAT${param}`,                    oracle:'BINARY_FLOAT',               mssql:`FLOAT${param}` },
    'float4':              { mysql:'FLOAT',                    postgresql:'REAL',                              oracle:'BINARY_FLOAT',               mssql:'REAL' },
    'float8':              { mysql:'DOUBLE',                   postgresql:'DOUBLE PRECISION',                  oracle:'BINARY_DOUBLE',              mssql:'FLOAT' },
    'double precision':    { mysql:'DOUBLE',                   postgresql:'DOUBLE PRECISION',                  oracle:'BINARY_DOUBLE',              mssql:'FLOAT' },
    'double':              { mysql:'DOUBLE',                   postgresql:'DOUBLE PRECISION',                  oracle:'BINARY_DOUBLE',              mssql:'FLOAT' },
    // 날짜/시간
    'date':                { mysql:'DATE',                     postgresql:'DATE',                              oracle:'DATE',                       mssql:'DATE' },
    'time':                { mysql:'TIME',                     postgresql:'TIME',                              oracle:'TIMESTAMP',                  mssql:'TIME' },
    'timestamp':           { mysql:'DATETIME',                 postgresql:'TIMESTAMP',                         oracle:'TIMESTAMP',                  mssql:'DATETIME2' },
    'timestamp without time zone': { mysql:'DATETIME',         postgresql:'TIMESTAMP',                         oracle:'TIMESTAMP',                  mssql:'DATETIME2' },
    'timestamp with time zone':    { mysql:'DATETIME',         postgresql:'TIMESTAMPTZ',                       oracle:'TIMESTAMP WITH TIME ZONE',   mssql:'DATETIMEOFFSET' },
    'timestamptz':         { mysql:'DATETIME',                 postgresql:'TIMESTAMPTZ',                       oracle:'TIMESTAMP WITH TIME ZONE',   mssql:'DATETIMEOFFSET' },
    'datetime':            { mysql:'DATETIME',                 postgresql:'TIMESTAMP',                         oracle:'TIMESTAMP',                  mssql:'DATETIME2' },
    'datetime2':           { mysql:'DATETIME',                 postgresql:'TIMESTAMP',                         oracle:'TIMESTAMP',                  mssql:'DATETIME2' },
    // 불리언
    'boolean':             { mysql:'TINYINT(1)',               postgresql:'BOOLEAN',                           oracle:'NUMBER(1)',                  mssql:'BIT' },
    'bool':                { mysql:'TINYINT(1)',               postgresql:'BOOLEAN',                           oracle:'NUMBER(1)',                  mssql:'BIT' },
    'bit':                 { mysql:`BIT${param}`,              postgresql:'BOOLEAN',                           oracle:'NUMBER(1)',                  mssql:`BIT${param}` },
    // 바이너리/LOB
    'bytea':               { mysql:'BLOB',                     postgresql:'BYTEA',                             oracle:'BLOB',                       mssql:'VARBINARY(MAX)' },
    'blob':                { mysql:'BLOB',                     postgresql:'BYTEA',                             oracle:'BLOB',                       mssql:'VARBINARY(MAX)' },
    'binary':              { mysql:`BINARY${param}`,           postgresql:'BYTEA',                             oracle:'RAW(2000)',                  mssql:`BINARY${param}` },
    'varbinary':           { mysql:`VARBINARY${param||'(255)'}`,postgresql:'BYTEA',                           oracle:'RAW(2000)',                  mssql:`VARBINARY${param||'(255)'}` },
    // JSON/기타
    'json':                { mysql:'JSON',                     postgresql:'JSON',                              oracle:'CLOB',                       mssql:'NVARCHAR(MAX)' },
    'jsonb':               { mysql:'JSON',                     postgresql:'JSONB',                             oracle:'CLOB',                       mssql:'NVARCHAR(MAX)' },
    'xml':                 { mysql:'TEXT',                     postgresql:'XML',                               oracle:'XMLTYPE',                    mssql:'XML' },
    'uuid':                { mysql:'VARCHAR(36)',               postgresql:'UUID',                              oracle:'VARCHAR2(36)',               mssql:'UNIQUEIDENTIFIER' },
  };

  const entry = map[base];
  if (entry) return entry[dialect] || entry.mysql;

  // 매핑 없으면 원본 그대로 (대문자화)
  return (m[1].toUpperCase() + param);
}

// defaultValue 정규화: ::type 캐스트 제거 + 이미 따옴표로 감싸진 값 반환
function _sanitizeDefault(dv) {
  if (!dv) return dv;
  // ::type 캐스트 제거 (모든 DB — PostgreSQL도 없어도 동작)
  dv = dv.replace(/::[a-zA-Z0-9_[\] ]+/g, '').trim();
  return dv;
}

function buildDDL(dialect, entities, opts) {
  entities = entities || ENTITIES;
  opts = Object.assign({ includeFK: true, includeIndex: true, includeComment: true }, opts);

  const esc = s => (s || '').replace(/'/g, "''");
  const isMssql = dialect === 'mssql';
  const lines = [];
  const sqls = [];

  entities.forEach(ent => {
    const tbl = ent.physicalName || ent.id;
    const lname = ent.logicalName || ent.id;
    const desc = ent.description || '';
    const tblComment = [lname, desc].filter(Boolean).join(' - ');

    const createLines = [];
    createLines.push(`-- ${tblComment}`);
    createLines.push(`CREATE TABLE ${tbl} (`);

    const pkCols = ent.attrs.filter(a => a.kind === 'pk').map(a => a.physicalName || a.logicalName || 'col');
    const isCompositePK = pkCols.length > 1;
    const colLines = [];
    const colCommentLines = [];
    ent.attrs.forEach(a => {
      const col = a.physicalName || a.logicalName || 'col';
      // DB별 타입 정규화
      let type = _normalizeColType(a.type, dialect);
      // autoIncrement: SERIAL/BIGSERIAL은 이미 _normalizeColType에서 처리되므로 추가 체크
      if (a.autoIncrement) {
        if (dialect === 'postgresql') {
          type = /BIGINT/i.test(a.type || '') || /bigserial/i.test(type) ? 'BIGSERIAL' : 'SERIAL';
        } else if (dialect === 'oracle') {
          // oracle은 GENERATED ALWAYS AS IDENTITY를 컬럼 정의 뒤에 추가
          type = _normalizeColType(a.type, dialect);
        }
      }
      let def = `  ${col} ${type}`;
      if (a.autoIncrement) {
        if (dialect === 'mysql')       def += ' AUTO_INCREMENT';
        else if (isMssql)              def += ' IDENTITY(1,1)';
        else if (dialect === 'oracle') def += ' GENERATED ALWAYS AS IDENTITY';
      }
      if (a.notNull || a.kind === 'pk') def += ' NOT NULL';
      if (a.unique) def += ' UNIQUE';
      if (a.defaultValue && !a.autoIncrement) {
        let dv = _sanitizeDefault(a.defaultValue);
        // nextval(...) → 시퀀스 참조 기본값: PostgreSQL은 SERIAL이 처리, 다른 DB는 생략
        if (/^nextval\s*\(/i.test(dv)) {
          if (dialect === 'postgresql') {
            // SERIAL로 타입을 교체해 시퀀스 자동 생성
            def = def.replace(/^(\s*\S+\s+)\S+/, `$1SERIAL`);
          }
          // 다른 DB: nextval 기본값 생략 (시퀀스 없음)
        } else if (/^'.*'$/.test(dv)) {
          // 이미 따옴표로 감싸진 SQL 문자열 리터럴 → 그대로 사용
          def += ` DEFAULT ${dv}`;
        } else {
          // SQL 표현식(함수호출, 키워드, 숫자)은 따옴표 없이, 평범한 값은 따옴표로
          const isSqlExpr = /\(/.test(dv) || /^(true|false|null|current_|now|sysdate|getdate|sys)/i.test(dv) || /^\d/.test(dv);
          def += isSqlExpr ? ` DEFAULT ${dv}` : ` DEFAULT '${esc(dv)}'`;
        }
      }
      if (a.kind === 'pk' && !isCompositePK) def += ' PRIMARY KEY';

      if (opts.includeComment) {
        const colComment = [a.logicalName, a.description].filter(Boolean).join(' - ');
        if (dialect === 'mysql') {
          if (colComment) def += ` COMMENT '${esc(colComment)}'`;
        } else if (!isMssql) {
          if (colComment) colCommentLines.push(`COMMENT ON COLUMN ${tbl}.${col} IS '${esc(colComment)}';`);
        }
      }
      colLines.push(def);
    });
    if (isCompositePK) colLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);

    createLines.push(colLines.join(',\n'));

    if (dialect === 'mysql') {
      createLines.push(`) ENGINE=InnoDB CHARACTER SET utf8mb4${(opts.includeComment && tblComment) ? ` COMMENT='${esc(tblComment)}'` : ''};`);
    } else if (isMssql) {
      createLines.push(`);`);
      createLines.push(`GO`);
      if (opts.includeComment && tblComment) {
        createLines.push(`EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${esc(tblComment)}', @level0type=N'Schema', @level0name=N'dbo', @level1type=N'Table', @level1name=N'${tbl}';`);
        createLines.push(`GO`);
      }
      if (opts.includeComment) {
        ent.attrs.forEach(a => {
          const col = a.physicalName || a.logicalName || 'col';
          const colComment = [a.logicalName, a.description].filter(Boolean).join(' - ');
          if (colComment) {
            createLines.push(`EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${esc(colComment)}', @level0type=N'Schema', @level0name=N'dbo', @level1type=N'Table', @level1name=N'${tbl}', @level2type=N'Column', @level2name=N'${col}';`);
            createLines.push(`GO`);
          }
        });
      }
    } else {
      createLines.push(`);`);
      if (opts.includeComment && tblComment) createLines.push(`COMMENT ON TABLE ${tbl} IS '${esc(tblComment)}';`);
      colCommentLines.forEach(l => createLines.push(l));
    }
    createLines.push('');

    sqls.push(createLines.join('\n'));
    createLines.forEach(l => lines.push(l));
  });

  if (opts.includeFK) {
    const fkLines = [];
    entities.forEach(ent => {
      const tbl = ent.physicalName || ent.id;
      ent.attrs.filter(a => a.kind === 'fk' && a.ref?.entity).forEach(a => {
        const col = a.physicalName || a.logicalName || 'col';
        const refEnt = entities.find(e => e.id === a.ref.entity);
        if (!refEnt) return;
        const refTbl = refEnt.physicalName || refEnt.id;
        const refCol = a.ref.attr || col;
        const fkSql = `ALTER TABLE ${tbl} ADD CONSTRAINT FK_${tbl}_${col} FOREIGN KEY (${col}) REFERENCES ${refTbl}(${refCol});`;
        fkLines.push(fkSql);
        sqls.push(fkSql);
      });
    });
    if (fkLines.length) {
      lines.push('-- FK');
      fkLines.forEach(l => lines.push(l));
      lines.push('');
    }
  }

  if (opts.includeIndex) {
    const idxLines = [];
    entities.forEach(ent => {
      const tbl = ent.physicalName || ent.id;
      (ent.indexes || []).forEach(idx => {
        if (!idx.columns || !idx.columns.length) return;
        const unique = idx.unique ? 'UNIQUE ' : '';
        const name = idx.name || `IDX_${tbl}_${idx.columns.join('_')}`;
        const idxSql = `CREATE ${unique}INDEX ${name} ON ${tbl} (${idx.columns.join(', ')});`;
        idxLines.push(idxSql);
        sqls.push(idxSql);
      });
    });
    if (idxLines.length) {
      lines.push('-- INDEX');
      idxLines.forEach(l => lines.push(l));
    }
  }

  return { sqls, text: lines.join('\n') };
}
window.buildDDL = buildDDL;

function generateDDL(dialect) {
  if (!dialect) dialect = document.getElementById('ddlDialect').value;
  const opts = {
    includeFK:      document.getElementById('ddlOptFK')?.checked      ?? true,
    includeIndex:   document.getElementById('ddlOptIndex')?.checked   ?? true,
    includeComment: document.getElementById('ddlOptComment')?.checked ?? true,
  };
  let target = ENTITIES.filter(e => _ddlEntityIds.has(e.id));
  if (!target.length) { document.getElementById('ddlContent').textContent = '-- 선택된 엔티티가 없습니다.'; return; }
  const { text } = buildDDL(dialect, target, opts);
  document.getElementById('ddlContent').textContent = text;
}

// ── Markdown 내보내기 ────────────────────────────────────────
async function exportMarkdown() {
  if (!ENTITIES.length) { alert('다이어그램에 엔티티가 없습니다.'); return; }
  const diagName = getActiveDiagram()?.name || 'ERD';
  const escapeMdCell = v => String(v||'').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const lines = [`# ${diagName}`, ''];

  ENTITIES.forEach(ent => {
    const lname = ent.logicalName || ent.id;
    const pname = ent.physicalName || '';
    lines.push(`## ${lname}${pname ? ` (${pname})` : ''}`);
    if (ent.description) lines.push(`> ${ent.description}`, '');
    lines.push('| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |');
    lines.push('|--------|--------|------|------|:--:|:--:|--------|------|');
    (ent.attrs || []).forEach(a => {
      const kind = a.kind === 'pk' ? 'PK' : a.kind === 'fk' ? 'FK' : '';
      const nn = (a.notNull || a.kind === 'pk') ? '✓' : '';
      const uq = a.unique ? '✓' : '';
      const def = escapeMdCell(a.defaultValue || '');
      const desc = escapeMdCell(a.description || '');
      lines.push(`| ${escapeMdCell(a.logicalName||'')} | ${escapeMdCell(a.physicalName||'')} | ${escapeMdCell(a.type||'')} | ${kind} | ${nn} | ${uq} | ${def} | ${desc} |`);
    });
    if ((ent.indexes || []).length) {
      lines.push('', '**인덱스**', '');
      lines.push('| 인덱스명 | 컬럼 | UNIQUE |');
      lines.push('|----------|------|:------:|');
      ent.indexes.forEach(idx => {
        lines.push(`| ${escapeMdCell(idx.name||'')} | ${escapeMdCell((idx.columns||[]).join(', '))} | ${idx.unique?'✓':''} |`);
      });
    }
    lines.push('');
  });

  const text = lines.join('\n');
  const filename = (diagName || 'erd') + '.md';
  const saved = await _writeExportFile(filename, text);
  if (saved) showToast(`💾 ${filename} 저장 완료`);
  else { _fallbackDownload(filename, text, 'text/markdown'); showToast('Markdown 파일이 저장되었습니다.'); }
}

// ── HTML / PDF 내보내기 ──────────────────────────────────────
function exportPDF() { exportHTML(true); }
async function exportHTML(asPdf = false) {
  if (!ENTITIES.length) { alert('다이어그램에 엔티티가 없습니다.'); return; }
  const diagName = getActiveDiagram()?.name || 'ERD';
  const kindLabel = k => k === 'pk' ? '<span style="color:#f38ba8;font-weight:bold">PK</span>' : k === 'fk' ? '<span style="color:#fab387;font-weight:bold">FK</span>' : '';
  const esc2 = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const toc = ENTITIES.map(e =>
    `<li><a href="#ent_${esc2(e.id)}">${esc2(e.logicalName||e.id)}${e.physicalName?` <span class="pname">(${esc2(e.physicalName)})</span>`:''}</a></li>`
  ).join('');

  const sections = ENTITIES.map(e => {
    const rows = (e.attrs||[]).map(a => {
      const nn  = (a.notNull||a.kind==='pk') ? '✓' : '';
      const uq  = a.unique ? '✓' : '';
      const ai  = a.autoIncrement ? '✓' : '';
      const def = esc2(a.defaultValue||'');
      const desc = esc2(a.description||'');
      return `<tr>
        <td>${kindLabel(a.kind)}</td>
        <td>${esc2(a.logicalName||'')}</td>
        <td class="mono">${esc2(a.physicalName||'')}</td>
        <td class="mono">${esc2(a.type||'')}</td>
        <td class="center">${nn}</td>
        <td class="center">${uq}</td>
        <td class="center">${ai}</td>
        <td class="mono">${def}</td>
        <td>${desc}</td>
      </tr>`;
    }).join('');
    const idxRows = (e.indexes||[]).map(idx =>
      `<tr><td class="mono">${esc2(idx.name||'')}</td><td class="mono">${esc2((idx.columns||[]).join(', '))}</td><td class="center">${idx.unique?'✓':''}</td></tr>`
    ).join('');
    const idxTable = idxRows ? `<h4 style="margin:14px 0 6px;color:#89b4fa;font-size:13px">인덱스</h4>
      <table><thead><tr><th>인덱스명</th><th>컬럼</th><th>UNIQUE</th></tr></thead><tbody>${idxRows}</tbody></table>` : '';
    return `<section id="ent_${esc2(e.id)}">
      <h2>${esc2(e.logicalName||e.id)}${e.physicalName?` <span class="pname">(${esc2(e.physicalName)})</span>`:''}</h2>
      ${e.description?`<p class="desc">${esc2(e.description)}</p>`:''}
      <table>
        <thead><tr><th style="width:36px"></th><th>논리명</th><th>물리명</th><th>타입</th><th>NN</th><th>UQ</th><th>AI</th><th>기본값</th><th>설명</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>${idxTable}
    </section>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>${esc2(diagName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#1e1e2e;color:#cdd6f4;font-family:'Segoe UI',sans-serif;padding:32px 40px;line-height:1.6}
  h1{color:#89b4fa;font-size:22px;margin-bottom:6px}
  h2{color:#cdd6f4;font-size:16px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #313244}
  h2 .pname,h1 .pname{color:#6c7086;font-size:13px;font-weight:normal}
  section{margin-bottom:36px}
  .desc{color:#a6adc8;font-size:13px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px}
  th{background:#313244;color:#89b4fa;padding:7px 10px;text-align:left;font-size:12px;white-space:nowrap}
  td{padding:6px 10px;border-bottom:1px solid #252535;vertical-align:top}
  tr:hover td{background:rgba(255,255,255,0.03)}
  .mono{font-family:Consolas,monospace;font-size:12px;color:#a6e3a1}
  .center{text-align:center}
  .pname{color:#6c7086;font-weight:normal}
  nav{background:#252535;border-radius:8px;padding:16px 20px;margin-bottom:32px;display:inline-block;min-width:220px}
  nav h3{color:#89b4fa;font-size:13px;margin-bottom:10px}
  nav ul{list-style:none;padding:0}
  nav li{margin-bottom:4px}
  nav a{color:#cdd6f4;text-decoration:none;font-size:13px}
  nav a:hover{color:#89b4fa}
  .gen-info{color:#45475a;font-size:11px;margin-bottom:24px}
</style>
</head><body>
<h1>${esc2(diagName)}</h1>
<p class="gen-info">생성일시: ${new Date().toLocaleString('ko-KR')} · 엔티티 ${ENTITIES.length}개</p>
<nav><h3>목차</h3><ul>${toc}</ul></nav>
${sections}
</body></html>`;

  if (asPdf) {
    const printHtml = html.replace('</style>\n</head>',
      `  @page { size: A4; margin: 15mm; }\n  @media print { nav { display:none; } body { background:#fff; color:#000; } h2 { color:#000; } th { background:#eee; color:#000; } .mono { color:#333; } }\n</style>\n</head>`)
      .replace('</body></html>', `<script>window.onload=function(){window.print();}<\/script></body></html>`);
    const win = window.open('', '_blank');
    if (win) { win.document.write(printHtml); win.document.close(); }
    else showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.');
  } else {
    const filename = (diagName||'erd') + '.html';
    const saved = await _writeExportFile(filename, html);
    if (saved) showToast(`💾 ${filename} 저장 완료`);
    else { _fallbackDownload(filename, html, 'text/html'); showToast('HTML 문서가 저장되었습니다.'); }
  }
}

// ── imgMenu 토글 ─────────────────────────────────────────────
function toggleImgMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('imgMenu');
  const rect = e.currentTarget.getBoundingClientRect();
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    menu.style.left = rect.left + 'px';
    menu.style.top  = (rect.bottom + 4) + 'px';
  }
}
document.addEventListener('click', e => {
  if (!document.getElementById('imgMenu').contains(e.target)) {
    document.getElementById('imgMenu').style.display = 'none';
  }
});
