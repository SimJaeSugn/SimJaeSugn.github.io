// ══════════════════════════════════════════════════════════════════
// Feature 2: JOIN 경로 탐색기
// 두 엔티티를 선택하면 FK 관계를 따라 경로를 탐색하고 JOIN SQL 생성
// ══════════════════════════════════════════════════════════════════

function openJoinExplorer() {
  if (ENTITIES.length < 2) {
    showToast('엔티티가 2개 이상 있어야 합니다.');
    return;
  }
  let modal = document.getElementById('joinExplorerOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'joinExplorerOverlay';
    modal.setAttribute('onmousedown', "overlayCloseExtra(event,'joinExplorerOverlay')");
    modal.innerHTML = `
      <div class="modal" style="width:640px" onmousedown.stop>
        <h3>🔗 JOIN 경로 탐색기</h3>
        <p style="color:var(--tx-sub);font-size:12px;margin-bottom:14px">
          두 엔티티 사이의 FK 관계 경로를 탐색하고 JOIN SQL을 자동 생성합니다.
        </p>
        <div style="display:grid;grid-template-columns:1fr 28px 1fr;gap:8px;align-items:end;margin-bottom:14px">
          <div class="form-group" style="margin:0">
            <label>시작 엔티티</label>
            <select class="form-select" id="joinFrom"></select>
          </div>
          <div style="padding-bottom:6px;color:var(--tx-sub);text-align:center;font-size:18px">→</div>
          <div class="form-group" style="margin:0">
            <label>도착 엔티티</label>
            <select class="form-select" id="joinTo"></select>
          </div>
        </div>
        <div style="text-align:center;margin-bottom:16px">
          <button class="btn-save-m" onclick="runJoinExplorer()">경로 탐색</button>
        </div>
        <div id="joinResult"></div>
        <div class="modal-actions">
          <button class="btn-cancel-m" onclick="document.getElementById('joinExplorerOverlay').classList.remove('active')">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  const opts = ENTITIES.map(e =>
    `<option value="${e.id}">${escHtml(e.logicalName || e.physicalName || e.id)}</option>`
  ).join('');
  document.getElementById('joinFrom').innerHTML = opts;
  document.getElementById('joinTo').innerHTML   = opts;
  if (ENTITIES.length > 1) document.getElementById('joinTo').selectedIndex = 1;
  document.getElementById('joinResult').innerHTML = '';
  modal.classList.add('active');
}

function runJoinExplorer() {
  const fromId = document.getElementById('joinFrom').value;
  const toId   = document.getElementById('joinTo').value;
  const result = document.getElementById('joinResult');

  if (fromId === toId) {
    result.innerHTML = '<p style="color:var(--ac-r)">시작과 도착 엔티티가 같습니다.</p>';
    return;
  }
  const path = _bfsJoinPath(fromId, toId);
  if (!path) {
    result.innerHTML = '<p style="color:var(--ac-r)">FK 관계로 연결된 경로를 찾을 수 없습니다.</p>';
    return;
  }

  const entMap = {};
  ENTITIES.forEach(e => entMap[e.id] = e);
  const pathHtml = path.map(id => {
    const e = entMap[id];
    return `<span style="background:var(--bg-surface);border:1px solid var(--bd2);border-radius:5px;
      padding:3px 10px;font-size:12px;white-space:nowrap">${escHtml(e?.logicalName || id)}</span>`;
  }).join(`<span style="color:var(--tx-sub);margin:0 4px">→</span>`);

  const sql = _buildJoinSQL(path, entMap);

  result.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--tx-sub);margin-bottom:6px">경로 — ${path.length}개 테이블</div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px">${pathHtml}</div>
    </div>
    <div>
      <div style="font-size:11px;color:var(--tx-sub);margin-bottom:6px">JOIN SQL</div>
      <pre id="joinSqlPre" style="background:var(--bg-surface);border:1px solid var(--bd2);border-radius:6px;
        padding:10px 14px;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;
        word-break:break-all;max-height:200px;overflow-y:auto;margin:0;color:var(--tx-main)">${escHtml(sql)}</pre>
      <div style="text-align:right;margin-top:6px">
        <button class="btn" style="font-size:12px;padding:4px 12px"
          onclick="navigator.clipboard?.writeText(document.getElementById('joinSqlPre').textContent).then(()=>showToast('SQL 복사됨'))">
          📋 SQL 복사
        </button>
      </div>
    </div>`;
}

function _bfsJoinPath(fromId, toId) {
  const adj = {};
  ENTITIES.forEach(e => adj[e.id] = []);
  RELATIONS.forEach(r => {
    if (!adj[r.from]) adj[r.from] = [];
    if (!adj[r.to])   adj[r.to]   = [];
    if (!adj[r.from].includes(r.to)) adj[r.from].push(r.to);
    if (!adj[r.to].includes(r.from)) adj[r.to].push(r.from);
  });
  const visited = new Set([fromId]);
  const queue   = [[fromId]];
  while (queue.length) {
    const path = queue.shift();
    const cur  = path[path.length - 1];
    for (const next of (adj[cur] || [])) {
      if (next === toId) return [...path, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return null;
}

function _buildJoinSQL(path, entMap) {
  const tbl = id => {
    const e = entMap[id];
    return e?.physicalName || e?.logicalName || id;
  };
  const joinCond = (aId, bId) => {
    const a = entMap[aId], b = entMap[bId];
    if (!a || !b) return `/* 조인 조건 확인 필요 */`;
    // FK: a→b
    const fkAB = (a.attrs || []).find(at => at.kind === 'fk' && at.ref?.entity === bId);
    if (fkAB) {
      const fkCol = fkAB.physicalName || fkAB.logicalName;
      const pkB   = (b.attrs || []).find(at => at.kind === 'pk');
      const pkCol = pkB ? (pkB.physicalName || pkB.logicalName) : 'id';
      return `${tbl(aId)}.${fkCol} = ${tbl(bId)}.${pkCol}`;
    }
    // FK: b→a
    const fkBA = (b.attrs || []).find(at => at.kind === 'fk' && at.ref?.entity === aId);
    if (fkBA) {
      const fkCol = fkBA.physicalName || fkBA.logicalName;
      const pkA   = (a.attrs || []).find(at => at.kind === 'pk');
      const pkCol = pkA ? (pkA.physicalName || pkA.logicalName) : 'id';
      return `${tbl(bId)}.${fkCol} = ${tbl(aId)}.${pkCol}`;
    }
    return `${tbl(aId)}.id = ${tbl(bId)}.id /* 조인 조건 확인 필요 */`;
  };

  let sql = `SELECT *\nFROM ${tbl(path[0])}`;
  for (let i = 1; i < path.length; i++) {
    sql += `\n  JOIN ${tbl(path[i])} ON ${joinCond(path[i - 1], path[i])}`;
  }
  return sql + ';';
}
