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
function _fallbackDownload(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── JSON 내보내기 ─────────────────────────────────────────────
async function exportData() {
  flushCurrentState();
  sessionModified = false;
  const badge = document.getElementById('sessionBadge');
  if (badge) badge.style.display = 'none';
  const data = { version: 2, diagrams, activeDiagramId };
  const text = JSON.stringify(data, null, 2);
  const filename = 'bsss_erd.json';

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
  const data = {
    backupVersion: 2,
    exportedAt: new Date().toISOString(),
    appVersion: 'bsss-erd',
    main: { diagrams, activeDiagramId, viewMode, notationStyle, gridSnap },
    snapshots: JSON.parse(JSON.stringify(SNAPSHOTS)),
    templates: loadTemplates(),
    settings: {
      theme:     localStorage.getItem(THEME_STORAGE) || null,
      qbOpen:    localStorage.getItem('_qbOpen') ?? '1',
      qbCustom:  localStorage.getItem('_qbCustom') || '[]',
      aiKey:     localStorage.getItem(AI_KEY_STORAGE) || ''
    }
  };
  const text = JSON.stringify(data, null, 2);
  const filename = 'bsss_erd_backup_' + new Date().toISOString().slice(0, 10) + '.json';

  const saved = await _writeExportFile(filename, text);
  if (saved) {
    showToast(`💾 ${filename} 저장 완료`);
  } else {
    _fallbackDownload(filename, text);
    showToast('전체 백업이 저장되었습니다.');
  }
}

// ── 이미지 저장 ──────────────────────────────────────────────
function downloadImage(includeSections = true) {
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

  const imgW = Math.max(800, maxX - minX + padding * 2);
  const imgH = Math.max(400, maxY - minY + padding * 2);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = imgW;
  offCanvas.height = imgH;

  const savedCtx = ctx, savedVx = vx, savedVy = vy, savedScale = scale;
  ctx = offCanvas.getContext('2d');
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

  const suffix = includeSections ? '' : '_no_section';
  const link = document.createElement('a');
  link.download = (getActiveDiagram()?.name || 'erd') + suffix + '.png';
  link.href = offCanvas.toDataURL('image/png');
  link.click();
}

// ── SVG 내보내기 ──────────────────────────────────────────────
function downloadSVG() {
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
    e.attrs.forEach((attr, i) => {
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
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (getActiveDiagram()?.name || 'erd') + '.svg'; a.click();
  URL.revokeObjectURL(url);
}

// ── DDL 생성 ─────────────────────────────────────────────────
function openDDLModal() {
  generateDDL(document.getElementById('ddlDialect').value);
  document.getElementById('ddlOverlay').classList.add('active');
}
function closeDDLModal() { document.getElementById('ddlOverlay').classList.remove('active'); }
function copyDDL() { navigator.clipboard.writeText(document.getElementById('ddlContent').textContent); showToast('DDL이 클립보드에 복사되었습니다.'); }

function generateDDL(dialect) {
  const esc = s => (s || '').replace(/'/g, "''");
  const isMssql = dialect === 'mssql';
  const lines = [];

  ENTITIES.forEach(ent => {
    const tbl = ent.physicalName || ent.id;
    const lname = ent.logicalName || ent.id;
    const desc = ent.description || '';
    const tblComment = [lname, desc].filter(Boolean).join(' - ');

    lines.push(`-- ${tblComment}`);
    lines.push(`CREATE TABLE ${tbl} (`);

    const pkCols = ent.attrs.filter(a => a.kind === 'pk').map(a => a.physicalName || a.logicalName || 'col');
    const isCompositePK = pkCols.length > 1;
    const colLines = [];
    const colCommentLines = [];
    ent.attrs.forEach(a => {
      const col = a.physicalName || a.logicalName || 'col';
      let type = a.type || 'VARCHAR';
      if (a.autoIncrement && dialect === 'postgresql') {
        type = type.match(/BIGINT/i) ? 'BIGSERIAL' : 'SERIAL';
      }
      let def = `  ${col} ${type}`;
      if (a.autoIncrement) {
        if (dialect === 'mysql')      def += ' AUTO_INCREMENT';
        else if (isMssql)             def += ' IDENTITY(1,1)';
        else if (dialect === 'oracle') def += ' GENERATED ALWAYS AS IDENTITY';
      }
      if (a.notNull || a.kind === 'pk') def += ' NOT NULL';
      if (a.unique) def += ' UNIQUE';
      if (a.defaultValue) def += ` DEFAULT '${esc(a.defaultValue)}'`;
      if (a.kind === 'pk' && !isCompositePK) def += ' PRIMARY KEY';

      const colComment = [a.logicalName, a.description].filter(Boolean).join(' - ');
      if (dialect === 'mysql') {
        if (colComment) def += ` COMMENT '${esc(colComment)}'`;
      } else if (!isMssql) {
        if (colComment) colCommentLines.push(`COMMENT ON COLUMN ${tbl}.${col} IS '${esc(colComment)}';`);
      }
      colLines.push(def);
    });
    if (isCompositePK) colLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);

    lines.push(colLines.join(',\n'));

    if (dialect === 'mysql') {
      lines.push(`) ENGINE=InnoDB CHARACTER SET utf8mb4${tblComment ? ` COMMENT='${esc(tblComment)}'` : ''};`);
    } else if (isMssql) {
      lines.push(`);`);
      lines.push(`GO`);
      if (tblComment) {
        lines.push(`EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${esc(tblComment)}', @level0type=N'Schema', @level0name=N'dbo', @level1type=N'Table', @level1name=N'${tbl}';`);
        lines.push(`GO`);
      }
      ent.attrs.forEach(a => {
        const col = a.physicalName || a.logicalName || 'col';
        const colComment = [a.logicalName, a.description].filter(Boolean).join(' - ');
        if (colComment) {
          lines.push(`EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${esc(colComment)}', @level0type=N'Schema', @level0name=N'dbo', @level1type=N'Table', @level1name=N'${tbl}', @level2type=N'Column', @level2name=N'${col}';`);
          lines.push(`GO`);
        }
      });
    } else {
      lines.push(`);`);
      if (tblComment) lines.push(`COMMENT ON TABLE ${tbl} IS '${esc(tblComment)}';`);
      colCommentLines.forEach(l => lines.push(l));
    }
    lines.push('');
  });

  const fkLines = [];
  ENTITIES.forEach(ent => {
    const tbl = ent.physicalName || ent.id;
    ent.attrs.filter(a => a.kind === 'fk' && a.ref?.entity).forEach(a => {
      const col = a.physicalName || a.logicalName || 'col';
      const refEnt = ENTITIES.find(e => e.id === a.ref.entity);
      if (!refEnt) return;
      const refTbl = refEnt.physicalName || refEnt.id;
      const refCol = a.ref.attr || col;
      fkLines.push(`ALTER TABLE ${tbl} ADD CONSTRAINT FK_${tbl}_${col} FOREIGN KEY (${col}) REFERENCES ${refTbl}(${refCol});`);
    });
  });
  if (fkLines.length) {
    lines.push('-- FK');
    fkLines.forEach(l => lines.push(l));
    lines.push('');
  }

  const idxLines = [];
  ENTITIES.forEach(ent => {
    const tbl = ent.physicalName || ent.id;
    (ent.indexes || []).forEach(idx => {
      if (!idx.columns || !idx.columns.length) return;
      const unique = idx.unique ? 'UNIQUE ' : '';
      const name = idx.name || `IDX_${tbl}_${idx.columns.join('_')}`;
      idxLines.push(`CREATE ${unique}INDEX ${name} ON ${tbl} (${idx.columns.join(', ')});`);
    });
  });
  if (idxLines.length) {
    lines.push('-- INDEX');
    idxLines.forEach(l => lines.push(l));
  }

  document.getElementById('ddlContent').textContent = lines.join('\n');
}

// ── Markdown 내보내기 ────────────────────────────────────────
function exportMarkdown() {
  if (!ENTITIES.length) { alert('다이어그램에 엔티티가 없습니다.'); return; }
  const diagName = getActiveDiagram()?.name || 'ERD';
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
      const def = a.defaultValue || '';
      const desc = a.description || '';
      lines.push(`| ${a.logicalName||''} | ${a.physicalName||''} | ${a.type||''} | ${kind} | ${nn} | ${uq} | ${def} | ${desc} |`);
    });
    if ((ent.indexes || []).length) {
      lines.push('', '**인덱스**', '');
      lines.push('| 인덱스명 | 컬럼 | UNIQUE |');
      lines.push('|----------|------|:------:|');
      ent.indexes.forEach(idx => {
        lines.push(`| ${idx.name||''} | ${(idx.columns||[]).join(', ')} | ${idx.unique?'✓':''} |`);
      });
    }
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (diagName || 'erd') + '.md';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Markdown 파일이 저장되었습니다.');
}

// ── HTML / PDF 내보내기 ──────────────────────────────────────
function exportPDF() { exportHTML(true); }
function exportHTML(asPdf = false) {
  if (!ENTITIES.length) { alert('다이어그램에 엔티티가 없습니다.'); return; }
  const diagName = getActiveDiagram()?.name || 'ERD';
  const kindLabel = k => k === 'pk' ? '<span style="color:#f38ba8;font-weight:bold">PK</span>' : k === 'fk' ? '<span style="color:#fab387;font-weight:bold">FK</span>' : '';
  const esc2 = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (diagName||'erd') + '.html'; a.click();
    URL.revokeObjectURL(url);
    showToast('HTML 문서가 저장되었습니다.');
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
