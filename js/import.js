// ── 가져오기 ─────────────────────────────────────────────────────
function importData() {
  document.getElementById('importFileInput').click();
}

function importFullBackup() {
  document.getElementById('fullBackupImportInput').click();
}

function handleFullBackupImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.backupVersion || !data.main || !Array.isArray(data.main.diagrams)) {
        alert('전체 백업 파일 형식이 아닙니다.\n일반 JSON은 "JSON 불러오기"를 사용하세요.');
        e.target.value = '';
        return;
      }
      const diagCount = data.main.diagrams.length;
      const snapCount = (data.snapshots || []).length;
      const tmplCount = (data.templates || []).length;
      const hasSettings = !!data.settings;
      const exportedAt = data.exportedAt ? new Date(data.exportedAt).toLocaleString('ko-KR') : '알 수 없음';
      const settingsLine = hasSettings ? '\n테마 · 퀵바 설정 포함' : '';
      askConfirm(
        `전체 백업을 복원합니다.\n\n내보낸 일시: ${exportedAt}\n다이어그램 ${diagCount}개 · 스냅샷 ${snapCount}개 · 템플릿 ${tmplCount}개${settingsLine}\n\n현재의 모든 데이터와 설정이 교체됩니다.`,
        () => {
          try {
            const m = data.main;
            diagrams = (m.diagrams || []).map(d => {
              d.entities = (d.entities || []).map(migrateEntity); return d;
            });
            if (!diagrams.length) throw new Error('다이어그램 데이터가 없습니다.');
            viewMode      = m.viewMode      || 'logical';
            notationStyle = m.notationStyle || 'simple';
            gridSnap      = !!m.gridSnap;
            activeDiagramId = m.activeDiagramId && diagrams.find(d => d.id === m.activeDiagramId)
              ? m.activeDiagramId : diagrams[0].id;
            SNAPSHOTS = Array.isArray(data.snapshots) ? data.snapshots : [];
            persistSnapshots();
            if (Array.isArray(data.templates)) saveTemplates(data.templates);

            // ── 설정 복원 (backupVersion 2+) ──────────────────────
            if (hasSettings) {
              const s = data.settings;
              if (s.theme && typeof applyTheme === 'function') {
                try { localStorage.setItem(THEME_STORAGE, s.theme); } catch {}
                applyTheme(s.theme, false);
              }
              if (s.qbOpen !== undefined) {
                try { localStorage.setItem('_qbOpen', s.qbOpen); } catch {}
                _quickbarOpen = (s.qbOpen !== '0');
                _applyQuickbarState();
              }
              if (s.qbCustom) {
                try { localStorage.setItem('_qbCustom', s.qbCustom); } catch {}
                try {
                  _qbCustomItems = JSON.parse(s.qbCustom) || [];
                  _renderCustomQbItems();
                } catch {}
              }
              if (s.aiKey) {
                try { localStorage.setItem(AI_KEY_STORAGE, s.aiKey); } catch {}
              }
            }

            const mainSnap = JSON.stringify({ diagrams, activeDiagramId, viewMode, notationStyle, gridSnap });
            try { localStorage.setItem(STORAGE_KEY, mainSnap); } catch {}
            undoStack = [mainSnap]; redoStack = [];
            loadDiagramIntoWorkspace(getActiveDiagram());
            syncToolDropdownLabels();
            renderDiagramPanel();
            updateZoomLabel();
            setViewMode(viewMode);
            render();
            if (typeof renderEntityTree === 'function') renderEntityTree();
            showToast('전체 백업 복원 완료');
          } catch (err) {
            alert('복원 중 오류가 발생했습니다:\n' + err.message);
          }
        },
        '복원'
      );
    } catch {
      alert('파일을 읽는 중 오류가 발생했습니다.\n유효한 JSON 파일인지 확인하세요.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data.diagrams) && data.diagrams.length) {
        askConfirm('모든 다이어그램을 파일 내용으로 교체합니다. 계속할까요?', () => {
          diagrams = data.diagrams;
          activeDiagramId = data.activeDiagramId && diagrams.find(d => d.id === data.activeDiagramId)
            ? data.activeDiagramId : diagrams[0].id;
          loadDiagramIntoWorkspace(getActiveDiagram());
          renderDiagramPanel(); updateZoomLabel(); render(); saveState();
        }, '교체');
        return;
      }
      if (Array.isArray(data.entities)) {
        const name = file.name.replace(/\.json$/i, '') || '불러온 다이어그램';
        const d = createEmptyDiagram(name);
        d.entities = data.entities;
        d.relations = data.relations || [];
        if (data.viewport) { d.vx = data.viewport.vx ?? 40; d.vy = data.viewport.vy ?? 40; d.scale = data.viewport.scale ?? 1; }
        flushCurrentState();
        diagrams.push(d);
        activeDiagramId = d.id;
        loadDiagramIntoWorkspace(d);
        renderDiagramPanel(); updateZoomLabel(); render(); saveState();
        return;
      }
      alert('유효하지 않은 파일 형식입니다.');
    } catch {
      alert('파일을 읽는 중 오류가 발생했습니다.\n올바른 JSON 파일인지 확인하세요.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── DDL 역파싱 (SQL → ERD) ─────────────────────────────────────
let _ddlImportParsed = null;

function openDDLImportModal() {
  _ddlImportParsed = null;
  document.getElementById('ddlImportText').value = '';
  document.getElementById('ddlImportPreview').style.display = 'none';
  document.getElementById('ddlImportOverlay').classList.add('active');
  setTimeout(() => document.getElementById('ddlImportText').focus(), 50);
}
function closeDDLImportModal() {
  document.getElementById('ddlImportOverlay').classList.remove('active');
}

function unquoteIdent(s) {
  return s.replace(/^[`"\[]|[`"\]]$/g, '').trim();
}

function parseDDL(sql) {
  const entities = [];
  const relations = [];
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?\w+[`"\]]?)\s*\(([^;]*)\)/gis;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const tableName = unquoteIdent(m[1]);
    const body = m[2];
    const id = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const entity = {
      id,
      logicalName: tableName,
      physicalName: tableName.toUpperCase(),
      description: '',
      attrs: [],
      x: 60 + entities.length * 340,
      y: 80
    };

    const inlinePkRe = /^\s*(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/im;
    const inlinePkMatch = inlinePkRe.exec(body);
    const pkCols = new Set();
    if (inlinePkMatch) {
      inlinePkMatch[1].split(',').forEach(c => pkCols.add(unquoteIdent(c.trim()).toUpperCase()));
    }

    const fkRe = /FOREIGN\s+KEY\s*\(\s*([`"\[]?\w+[`"\]]?)\s*\)\s*REFERENCES\s+([`"\[]?\w+[`"\]]?)\s*\(\s*([`"\[]?\w+[`"\]]?)\s*\)/gis;
    let fkm;
    const fkMap = {};
    while ((fkm = fkRe.exec(body)) !== null) {
      const col = unquoteIdent(fkm[1]).toUpperCase();
      fkMap[col] = { refTable: unquoteIdent(fkm[2]), refCol: unquoteIdent(fkm[3]) };
    }

    const lines = body.split('\n');
    lines.forEach(line => {
      line = line.trim().replace(/,$/, '');
      if (!line) return;
      if (/^(PRIMARY|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK|FOREIGN)\s/i.test(line)) return;
      const colRe = /^([`"\[]?\w+[`"\]]?)\s+(\w[\w\s(),']*?)(?:\s+(NOT\s+NULL|NULL|DEFAULT\s+\S+|PRIMARY\s+KEY|UNIQUE|AUTO_INCREMENT|SERIAL|GENERATED).*)?$/i;
      const cm = colRe.exec(line);
      if (!cm) return;
      const colName = unquoteIdent(cm[1]);
      if (!colName || /^(PRIMARY|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK|FOREIGN)$/i.test(colName)) return;
      const typeRaw = cm[2].trim().replace(/\s+/g, ' ');
      const typeMatch = typeRaw.match(/^(\w+(?:\s*\([^)]*\))?(?:\s+\w+)*?)\s*(?:NOT\s+NULL|NULL|DEFAULT|PRIMARY|UNIQUE|AUTO|SERIAL|GENERATED|$)/i);
      const type = typeMatch ? typeMatch[1].trim() : typeRaw.split(/\s+/)[0];
      const rest = cm[0].toUpperCase();
      const isPk = pkCols.has(colName.toUpperCase()) || /PRIMARY\s+KEY/.test(rest);
      const colUp = colName.toUpperCase();
      const isFk = !!fkMap[colUp];
      const notNull = isPk || /NOT\s+NULL/.test(rest);
      let kind = isPk ? 'pk' : isFk ? 'fk' : 'normal';
      const attr = {
        logicalName: colName,
        physicalName: colName.toUpperCase(),
        type: type.toUpperCase(),
        kind,
        description: '',
        notNull,
        unique: false,
        defaultValue: '',
        ref: null
      };
      if (isFk) {
        const fk = fkMap[colUp];
        const refId = fk.refTable.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        attr.ref = { entity: refId, attr: fk.refCol.toUpperCase() };
        if (!relations.find(r => r.from === refId && r.to === id)) {
          relations.push({ from: refId, to: id, card: '1:N' });
        }
      }
      entity.attrs.push(attr);
    });

    if (entity.attrs.length > 0 || entity.physicalName) {
      entities.push(entity);
    }
  }
  return { entities, relations };
}

function previewDDLImport() {
  const sql = document.getElementById('ddlImportText').value;
  if (!sql.trim()) { showToast('SQL을 입력하세요.'); return; }
  _ddlImportParsed = parseDDL(sql);
  const { entities, relations } = _ddlImportParsed;
  const previewDiv = document.getElementById('ddlImportPreview');
  const contentDiv = document.getElementById('ddlImportPreviewContent');
  if (!entities.length) {
    contentDiv.innerHTML = '<span style="color:#f38ba8;">CREATE TABLE 구문을 찾을 수 없습니다.</span>';
    previewDiv.style.display = 'block';
    return;
  }
  let html = '';
  entities.forEach(e => {
    html += `<div style="color:#89b4fa;margin-bottom:2px;">📋 ${escHtml(e.physicalName)} <span style="color:#45475a;">(${e.attrs.length}개 컬럼)</span></div>`;
    e.attrs.forEach(a => {
      const badge = a.kind === 'pk' ? '<span style="color:#f38ba8;">[PK]</span> ' : a.kind === 'fk' ? '<span style="color:#fab387;">[FK]</span> ' : '';
      html += `<div style="padding-left:14px;">${badge}${escHtml(a.physicalName)} <span style="color:#6c7086;">${escHtml(a.type)}</span></div>`;
    });
  });
  if (relations.length) {
    html += `<div style="color:#a6e3a1;margin-top:6px;">⟷ 관계 ${relations.length}개 감지됨</div>`;
  }
  contentDiv.innerHTML = html;
  previewDiv.style.display = 'block';
}

function applyDDLImport() {
  if (!_ddlImportParsed) { previewDDLImport(); if (!_ddlImportParsed?.entities?.length) return; }
  const { entities, relations } = _ddlImportParsed;
  if (!entities.length) { showToast('파싱된 테이블이 없습니다.'); return; }

  const existingIds = new Set(ENTITIES.map(e => e.id));
  entities.forEach(e => {
    let newId = e.id;
    let suffix = 2;
    while (existingIds.has(newId)) { newId = e.id + '_' + suffix++; }
    e.id = newId;
    existingIds.add(newId);
    e.attrs.forEach(a => {
      if (a.ref) {
        const refEnt = entities.find(x => x.logicalName.toLowerCase().replace(/[^a-z0-9_]/g,'_') === a.ref.entity || x.id === a.ref.entity);
        if (refEnt) a.ref.entity = refEnt.id;
      }
    });
  });
  const baseY = ENTITIES.length ? Math.max(...ENTITIES.map(e => e.y + entityHeight(e))) + 80 : 80;
  entities.forEach((e, i) => {
    e.x = 60 + (i % 4) * 340;
    e.y = baseY + Math.floor(i / 4) * 320;
    ENTITIES.push(e);
  });
  relations.forEach(r => {
    if (!RELATIONS.find(x => x.from === r.from && x.to === r.to)) {
      RELATIONS.push(r);
    }
  });
  closeDDLImportModal();
  render(); saveState(); renderEntityTree();
  showToast(`${entities.length}개 테이블, ${relations.length}개 관계 추가됨`);
}

// ── AI 스키마 자동 생성 ──────────────────────────────────────
function openAISchemaModal() {
  const saved = localStorage.getItem(AI_KEY_STORAGE) || '';
  document.getElementById('aiApiKey').value = saved;
  document.getElementById('aiPromptText').value = '';
  document.getElementById('aiErrorMsg').style.display = 'none';
  document.getElementById('aiLoadingRow').style.display = 'none';
  document.getElementById('aiGenBtn').disabled = false;
  document.getElementById('aiSchemaOverlay').classList.add('active');
  setTimeout(() => document.getElementById('aiPromptText').focus(), 50);
}

function closeAISchemaModal() {
  document.getElementById('aiSchemaOverlay').classList.remove('active');
}

async function runAISchemaGen() {
  const apiKey = document.getElementById('aiApiKey').value.trim();
  const prompt = document.getElementById('aiPromptText').value.trim();
  const errorEl = document.getElementById('aiErrorMsg');
  const loadingEl = document.getElementById('aiLoadingRow');
  const genBtn = document.getElementById('aiGenBtn');
  errorEl.style.display = 'none';
  if (!apiKey) { errorEl.textContent = 'API Key를 입력하세요.'; errorEl.style.display = 'block'; return; }
  if (!prompt) { errorEl.textContent = '비즈니스 설명을 입력하세요.'; errorEl.style.display = 'block'; return; }
  localStorage.setItem(AI_KEY_STORAGE, apiKey);
  loadingEl.style.display = 'flex'; genBtn.disabled = true;
  const systemPrompt = `Respond with valid JSON only (no markdown, no explanation):
{"entities":[{"id":"snake_case_id","logicalName":"한글명","physicalName":"TABLE_NAME","attrs":[{"logicalName":"한글명","physicalName":"COL_NAME","type":"VARCHAR(100)","kind":"pk|fk|normal","notNull":true}]}],"relations":[{"from":"entity_id","to":"entity_id","name":"관계명","card":"1:N"}]}
Rules: id must be snake_case English. physicalName must be UPPER_SNAKE_CASE. logicalName must be Korean. kind is exactly one of: pk, fk, normal. card is one of: 1:1, 1:N, N:M. Include at least one pk attr per entity. Generate realistic Korean ERD schema.`;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const text = data?.content?.[0]?.text || '';
    let parsed;
    try {
      const clean = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(clean);
    } catch { throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다: ' + text.slice(0, 100)); }
    applyAISchema(parsed);
    closeAISchemaModal();
    showToast(`AI 스키마 적용 완료 (${(parsed.entities||[]).length}개 엔티티)`);
  } catch (err) {
    errorEl.textContent = '오류: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    loadingEl.style.display = 'none'; genBtn.disabled = false;
  }
}

function applyAISchema(parsed) {
  const entities = (parsed.entities || []).map((e, i) => ({
    id: e.id || ('ai_ent_' + i),
    logicalName: e.logicalName || e.id || '',
    physicalName: e.physicalName || (e.id || '').toUpperCase(),
    description: e.description || '',
    attrs: (e.attrs || []).map(a => ({
      logicalName: a.logicalName || a.physicalName || '',
      physicalName: a.physicalName || (a.logicalName || '').toUpperCase(),
      type: a.type || 'VARCHAR(100)',
      kind: ['pk','fk','normal'].includes(a.kind) ? a.kind : 'normal',
      notNull: !!a.notNull,
      unique: false, defaultValue: '', description: '', ref: null
    })),
    x: 60 + (i % 4) * 340,
    y: 60 + Math.floor(i / 4) * 320
  }));
  const relations = (parsed.relations || []).map(r => ({
    from: r.from, to: r.to, card: r.card || '1:N', label: r.name || undefined
  })).filter(r => r.from && r.to && r.from !== r.to);

  const mode = document.getElementById('aiApplyMode').value;
  if (mode === 'replace') {
    ENTITIES.length = 0; RELATIONS.length = 0;
  }
  const existingIds = new Set(ENTITIES.map(e => e.id));
  entities.forEach(e => {
    let newId = e.id, suffix = 2;
    while (existingIds.has(newId)) { newId = e.id + '_' + suffix++; }
    e.id = newId; existingIds.add(newId);
    if (mode === 'add') { e.x += ENTITIES.length ? 20 : 0; e.y += ENTITIES.length ? 20 : 0; }
    ENTITIES.push(e);
  });
  relations.forEach(r => {
    if (!RELATIONS.find(x => x.from === r.from && x.to === r.to)) RELATIONS.push(r);
  });
  render(); saveState(); renderEntityTree();
}
