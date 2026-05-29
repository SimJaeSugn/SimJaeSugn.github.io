// ── 섹션 함수 ──────────────────────────────────────────────────
function makeSectionId() {
  return 'sec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
}

function toggleSectionMode() {
  sectionMode = !sectionMode;
  syncToolDropdownLabels();
  canvas.style.cursor = sectionMode ? 'crosshair' : 'default';
  if (!sectionMode) { drawingSection = null; render(); }
}

function resizeCursor(dir) {
  return { n:'n-resize', s:'s-resize', e:'e-resize', w:'w-resize',
           nw:'nw-resize', ne:'ne-resize', sw:'sw-resize', se:'se-resize' }[dir] || 'default';
}

function showSectionNameInput(section) {
  document.getElementById('secNameInputWrap')?.remove();
  const sx = Math.round(section.x * scale + vx);
  const sy = Math.round(section.y * scale + vy);
  const sw = Math.max(100, Math.round(section.w * scale) - 60);
  const pal = SECTION_PALETTE[(section.colorIdx ?? 0) % SECTION_PALETTE.length];

  const wrap = document.createElement('div');
  wrap.id = 'secNameInputWrap';
  wrap.style.cssText = `position:fixed;z-index:2000;left:${sx+10}px;top:${sy+4}px;`;

  const inp = document.createElement('input');
  inp.style.cssText = `width:${sw}px;height:22px;background:#252535;color:${pal.border};` +
    `border:1.5px solid ${pal.border};border-radius:4px;padding:2px 8px;` +
    `font-size:12px;font-weight:bold;font-family:inherit;outline:none;`;
  inp.value = section.name || '';
  inp.placeholder = '섹션 이름';
  wrap.appendChild(inp);
  document.body.appendChild(wrap);
  inp.focus(); inp.select();

  const commit = () => {
    if (!section.name && !inp.value.trim()) section.name = '섹션';
    else if (inp.value.trim()) section.name = inp.value.trim();
    wrap.remove();
    render(); saveState();
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); wrap.remove(); render(); }
    e.stopPropagation();
  });
  inp.addEventListener('blur', commit);
}

function deleteSection(section) {
  const idx = SECTIONS.indexOf(section);
  if (idx >= 0) SECTIONS.splice(idx, 1);
  if (selectedSection === section) selectedSection = null;
  selectedSections.delete(section);
  render(); saveState();
}

// ── 연결 컴포넌트 탐색 ────────────────────────────────────────
function findComponents(entities, relations) {
  const adj = {};
  entities.forEach(e => adj[e.id] = []);
  relations.forEach(r => {
    if (adj[r.from]) adj[r.from].push(r.to);
    if (adj[r.to])   adj[r.to].push(r.from);
  });
  const visited = new Set(), comps = [];
  for (const e of entities) {
    if (visited.has(e.id)) continue;
    const comp = [], q = [e.id];
    visited.add(e.id);
    while (q.length) {
      const id = q.shift(); comp.push(id);
      (adj[id]||[]).forEach(nid => { if (!visited.has(nid)) { visited.add(nid); q.push(nid); } });
    }
    comps.push(comp.map(id => entities.find(x => x.id === id)).filter(Boolean));
  }
  return comps.sort((a, b) => b.length - a.length);
}

// ── 계층형 배치 (단일 컴포넌트) ─────────────────────────────
function placeHierarchical(ents, rels, ox, oy) {
  const PAD_X = 80, PAD_Y = 50;
  const children = {}, parents = {};
  ents.forEach(e => { children[e.id] = []; parents[e.id] = []; });
  rels.forEach(r => {
    if (children[r.from]) children[r.from].push(r.to);
    if (parents[r.to])    parents[r.to].push(r.from);
  });
  let roots = ents.filter(e => !parents[e.id].length).map(e => e.id);
  if (!roots.length) roots = [ents[0].id];
  const layer = {};
  const q = [...roots];
  roots.forEach(id => layer[id] = 0);
  for (let qi = 0; qi < q.length; qi++) {
    const id = q[qi];
    (children[id]||[]).forEach(cid => {
      if (layer[cid] === undefined) { layer[cid] = layer[id]+1; q.push(cid); }
    });
  }
  ents.forEach(e => { if (layer[e.id] === undefined) layer[e.id] = 0; });
  const groups = {};
  ents.forEach(e => { const l = layer[e.id]; (groups[l]=groups[l]||[]).push(e); });
  const layers = Object.keys(groups).map(Number).sort((a,b)=>a-b);

  // Barycenter 정렬: 이전 레이어 엔티티의 y 위치 평균 기준으로 순서 결정
  const posY = {};
  layers.forEach((l, li) => {
    if (li > 0) {
      groups[l].sort((a, b) => {
        const avg = e => {
          const ps = parents[e.id].filter(id => posY[id] !== undefined);
          return ps.length ? ps.reduce((s,id) => s+posY[id], 0)/ps.length : Infinity;
        };
        return avg(a) - avg(b);
      });
    }
    let ty = 0;
    groups[l].forEach(e => { posY[e.id] = ty; ty += entityHeight(e) + PAD_Y; });
  });

  // 컬럼 높이 계산 후 세로 중앙 정렬
  const colH = l => groups[l].reduce((s,e) => s+entityHeight(e)+PAD_Y, -PAD_Y);
  const maxH = Math.max(...layers.map(colH));
  let curX = ox;
  layers.forEach(l => {
    const ch = colH(l);
    let curY = oy + Math.max(0, (maxH - ch) / 2);
    groups[l].forEach(e => { e.x = curX; e.y = curY; curY += entityHeight(e) + PAD_Y; });
    curX += W + PAD_X;
  });
  return { w: curX - ox, h: maxH };
}

// ── 격자형 배치 (단일 컴포넌트) ─────────────────────────────
function placeGrid(ents, rels, ox, oy) {
  const PAD_X = 80, PAD_Y = 50;
  // 연결이 많은 엔티티를 앞에 배치
  const deg = {};
  ents.forEach(e => deg[e.id] = 0);
  rels.forEach(r => {
    if (deg[r.from] !== undefined) deg[r.from]++;
    if (deg[r.to]   !== undefined) deg[r.to]++;
  });
  const sorted = [...ents].sort((a, b) => deg[b.id] - deg[a.id]);
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  const rows = Math.ceil(sorted.length / cols);
  const rowH = Array.from({ length: rows }, (_, row) => {
    let maxH = 0;
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (idx < sorted.length) maxH = Math.max(maxH, entityHeight(sorted[idx]));
    }
    return maxH;
  });
  sorted.forEach((e, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    e.x = ox + col * (W + PAD_X);
    e.y = oy + rowH.slice(0, row).reduce((s, h) => s + h + PAD_Y, 0);
  });
  const usedCols = Math.min(cols, sorted.length);
  return {
    w: usedCols * (W + PAD_X) - PAD_X,
    h: rowH.reduce((s, h) => s + h + PAD_Y, -PAD_Y)
  };
}

// ── 원형 배치 (단일 컴포넌트) ────────────────────────────────
function placeCircular(ents, rels, ox, oy) {
  if (ents.length === 1) {
    ents[0].x = ox; ents[0].y = oy;
    return { w: W, h: entityHeight(ents[0]) };
  }
  // 인접 엔티티를 원 위에서 이웃하게 배치 (탐욕적 순서 결정)
  const adj = {};
  ents.forEach(e => adj[e.id] = new Set());
  rels.forEach(r => {
    if (adj[r.from]) adj[r.from].add(r.to);
    if (adj[r.to])   adj[r.to].add(r.from);
  });
  const deg = {};
  ents.forEach(e => deg[e.id] = adj[e.id].size);
  const order = [], remaining = new Set(ents.map(e => e.id));
  let cur = [...remaining].reduce((a, b) => deg[a] > deg[b] ? a : b);
  order.push(cur); remaining.delete(cur);
  while (remaining.size > 0) {
    const nbrs = [...adj[cur]].filter(id => remaining.has(id));
    if (nbrs.length) {
      cur = nbrs.reduce((best, id) => {
        const sc = a => [...adj[a]].filter(n => !remaining.has(n)).length;
        return sc(id) > sc(best) ? id : best;
      });
    } else {
      cur = [...remaining].reduce((a, b) => deg[a] > deg[b] ? a : b);
    }
    order.push(cur); remaining.delete(cur);
  }
  const sorted = order.map(id => ents.find(e => e.id === id));
  const avgH = ents.reduce((s, e) => s+entityHeight(e), 0) / ents.length;
  const R = Math.max(260, sorted.length * (W + 60) / (2 * Math.PI));
  const cx = ox + R + W / 2, cy = oy + R + avgH / 2;
  sorted.forEach((e, i) => {
    const angle = (2 * Math.PI * i / sorted.length) - Math.PI / 2;
    e.x = Math.round(cx + R * Math.cos(angle) - W / 2);
    e.y = Math.round(cy + R * Math.sin(angle) - entityHeight(e) / 2);
  });
  return { w: (R + W / 2) * 2, h: (R + avgH / 2) * 2 };
}

// ── 자동 배치 ─────────────────────────────────────────────────
function autoLayout(type = 'hierarchical') {
  if (!ENTITIES.length) return;
  const COMP_PAD = 100;
  const comps = findComponents(ENTITIES, RELATIONS);
  const compRels = comps.map(comp => {
    const ids = new Set(comp.map(e => e.id));
    return RELATIONS.filter(r => ids.has(r.from) && ids.has(r.to));
  });

  if (type === 'circular') {
    let ox = 40;
    comps.forEach((comp, i) => { const { w } = placeCircular(comp, compRels[i], ox, 40); ox += w + COMP_PAD; });
  } else if (type === 'grid') {
    let oy = 40;
    comps.forEach((comp, i) => { const { h } = placeGrid(comp, compRels[i], 40, oy); oy += h + COMP_PAD; });
  } else {
    let oy = 40;
    comps.forEach((comp, i) => { const { h } = placeHierarchical(comp, compRels[i], 40, oy); oy += h + COMP_PAD; });
  }

  RELATIONS.forEach(r => { r.bend = null; });
  const label = { hierarchical: '계층형', grid: '격자형', circular: '원형' }[type] || type;
  autoOptimizeRelations(`${label} 배치 — 관계선 최적화 중...`);
}

// ── 진행 표시 UI ──────────────────────────────────────────────
function showLayoutProgress(msg) {
  document.getElementById('layoutProgress')?.remove();
  const el = document.createElement('div');
  el.id = 'layoutProgress';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,20,.72);display:flex;align-items:center;justify-content:center;z-index:9999;';
  el.innerHTML =
    '<div style="background:#1e1e2e;border:1px solid #313244;border-radius:12px;padding:28px 36px;min-width:300px;text-align:center;">' +
    '<div id="layoutTitle" style="color:#cdd6f4;font-size:14px;font-weight:600;margin-bottom:14px;"></div>' +
    '<div style="background:#313244;border-radius:6px;height:8px;overflow:hidden;">' +
    '<div id="layoutBar" style="background:#89b4fa;height:100%;width:0%;transition:width .12s;border-radius:6px;"></div>' +
    '</div>' +
    '<div id="layoutSub" style="color:#6c7086;font-size:12px;margin-top:10px;min-height:16px;"></div>' +
    '</div>';
  document.body.appendChild(el);
}

function updateLayoutProgress(pct, sub) {
  const bar = document.getElementById('layoutBar');
  const sub_el = document.getElementById('layoutSub');
  if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if (sub_el && sub != null) sub_el.textContent = sub;
}

function hideLayoutProgress() {
  document.getElementById('layoutProgress')?.remove();
}

// ── 관계선 겹침 해소 (비동기) ─────────────────────────────────
function autoOptimizeRelations(title = '자동 관계선 최적화 중...') {
  showLayoutProgress(title);
  document.getElementById('layoutTitle').textContent = title;
  setTimeout(_runAutoOptimizeRelations, 60);
}

function _runAutoOptimizeRelations() {
  const NUDGE = 12, TOL = 2, MAX_PASS = 80, MAX_ITER = 12;

  // Phase 1: 모든 bend 초기화
  RELATIONS.forEach(rel => { rel.bend = null; });

  // Phase 2: 면 분산 — 같은 면에 연결된 선을 균등 배분, 수렴까지 반복
  updateLayoutProgress(5, '면 분산 중...');
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const before = RELATIONS.map(r => JSON.stringify(r.bend));
    _runFaceSpacingPass();
    const after = RELATIONS.map(r => JSON.stringify(r.bend));
    if (before.every((s, i) => s === after[i])) break;
  }

  // Phase 3: 엔티티 관통 보정 — 관계선이 엔티티를 가로지르지 않도록, 수렴까지 반복
  updateLayoutProgress(18, '엔티티 관통 보정 중...');
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const before = RELATIONS.map(r => JSON.stringify(r.bend));
    RELATIONS.forEach(rel => _fixEntityCrossingsForRel(rel));
    const after = RELATIONS.map(r => JSON.stringify(r.bend));
    if (before.every((s, i) => s === after[i])) break;
  }

  updateLayoutProgress(32, '겹침 탐색 중...');
  render();

  // Phase 4: 선 겹침 nudge — 겹치는 세그먼트를 밀어내는 애니메이션 루프
  let pass = 0;
  function iterate() {
    pass++;
    const overlaps = _nudgeOverlapPass(NUDGE, TOL);
    const pct = 32 + Math.round(pass / MAX_PASS * 66);
    updateLayoutProgress(pct, `패스 ${pass} / ${MAX_PASS}  —  겹치는 선 ${overlaps}개`);
    render();

    if (overlaps === 0 || pass >= MAX_PASS) {
      hideLayoutProgress();
      centerOnEntities();
      saveState();
      showToast(overlaps === 0
        ? `관계선 최적화 완료 (${pass}패스)`
        : `최적화 완료 (잔여 겹침 ${overlaps}개)`);
    } else {
      requestAnimationFrame(iterate);
    }
  }
  requestAnimationFrame(iterate);
}

// 포트 위치(fromPct / toPct) 변경 후 wpts 재계산
function _recomputeRelWpts(rel, em) {
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b || !rel.bend?.fromFace || !rel.bend?.toFace) return;
  const fp = faceAnchor(a, rel.bend.fromFace, rel.bend.fromPct ?? 0.5);
  const tp = faceAnchor(b, rel.bend.toFace,   rel.bend.toPct   ?? 0.5);
  const { wps } = routeFacePath(fp, rel.bend.fromFace, tp, rel.bend.toFace, null);
  rel.bend.wpts = wps.slice(1, wps.length - 1).map(p => [...p]);
}

// 한 패스에서 겹치는 중간 세그먼트를 모두 탐지하고 그룹별 오프셋 적용
function _nudgeOverlapPass(NUDGE, TOL) {
  // 모든 관계의 중간 세그먼트 수집 (양 끝 세그먼트 제외)
  const segs = [];
  RELATIONS.forEach((rel, ri) => {
    const bfw = buildFullWpts(rel);
    if (!bfw || bfw.full.length < 4) return;
    const full = bfw.full;
    for (let si = 1; si <= full.length - 3; si++) {
      const p1 = full[si], p2 = full[si + 1];
      const adx = Math.abs(p1[0] - p2[0]), ady = Math.abs(p1[1] - p2[1]);
      if (adx < TOL && ady > TOL)
        segs.push({ ri, rel, si, dir: 'V', pos: (p1[0] + p2[0]) / 2, lo: Math.min(p1[1], p2[1]), hi: Math.max(p1[1], p2[1]) });
      else if (ady < TOL && adx > TOL)
        segs.push({ ri, rel, si, dir: 'H', pos: (p1[1] + p2[1]) / 2, lo: Math.min(p1[0], p2[0]), hi: Math.max(p1[0], p2[0]) });
    }
  });

  if (!segs.length) return 0;

  // Union-Find로 겹치는 세그먼트를 하나의 그룹으로 묶음
  const parent = segs.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const pi = find(i), pj = find(j); if (pi !== pj) parent[pi] = pj; };

  let overlapCount = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (a.dir !== b.dir) continue;
      if (Math.abs(a.pos - b.pos) > TOL) continue;
      if (a.hi <= b.lo + TOL || b.hi <= a.lo + TOL) continue;
      union(i, j);
      overlapCount++;
    }
  }
  if (overlapCount === 0) return 0;

  // 그룹별로 중앙 정렬 오프셋 할당
  const groups = {};
  segs.forEach((_, i) => { const r = find(i); (groups[r] = groups[r] || []).push(i); });
  Object.values(groups).forEach(grp => {
    if (grp.length <= 1) return;
    const items = grp.map(i => segs[i]).sort((a, b) => a.ri - b.ri);
    const mid = (items.length - 1) / 2;
    items.forEach((seg, k) => {
      const offset = Math.round((k - mid) * NUDGE);
      if (Math.abs(offset) < 0.5) return;
      _applySegNudge(seg.rel, seg.si, seg.dir, offset);
    });
  });

  return overlapCount;
}

// 특정 세그먼트(si)를 수직 방향으로 offset 이동
function _applySegNudge(rel, si, dir, offset) {
  const wpts = rel.bend?.wpts;
  if (!wpts) return;
  // full[si] = wpts[si-1], full[si+1] = wpts[si]
  const wi1 = si - 1, wi2 = si;
  if (dir === 'V') {
    if (wi1 >= 0 && wi1 < wpts.length) wpts[wi1][0] += offset;
    if (wi2 >= 0 && wi2 < wpts.length) wpts[wi2][0] += offset;
  } else {
    if (wi1 >= 0 && wi1 < wpts.length) wpts[wi1][1] += offset;
    if (wi2 >= 0 && wi2 < wpts.length) wpts[wi2][1] += offset;
  }
}

// ── V2 전용: nudge 적용 시 관통 증가 시 롤백 ─────────────────────
function _v2NudgeWithCrossingCheck(NUDGE, TOL) {
  const backup = new Map();
  const before = new Map();
  RELATIONS.forEach(rel => {
    const w = rel.bend?.wpts;
    backup.set(rel, w ? w.map(p => [p[0], p[1]]) : null);
    before.set(rel, _v2CountCrossings(rel, [rel.from, rel.to]));
  });
  const overlaps = _nudgeOverlapPass(NUDGE, TOL);
  RELATIONS.forEach(rel => {
    const after = _v2CountCrossings(rel, [rel.from, rel.to]);
    if (after > (before.get(rel) ?? 0)) {
      const b = backup.get(rel);
      if (rel.bend) rel.bend.wpts = b ? b.map(p => [p[0], p[1]]) : null;
    }
  });
  return overlaps;
}

// ── 관계선최적화 V2 (A* 격자 라우터 + 통합 수렴 루프) ─────────

// V2 상수
const _V2_TURN_COST  = 80;   // 꺾임 페널티 (직교 우회 억제)
const _V2_USAGE_COST = 40;   // 간선 재사용 소프트 페널티
const _V2_MAX_ROUND  = 8;    // 수렴 루프 최대 라운드
const _V2_MAX_NUDGE  = 60;   // nudge 보조 패스 상한
const _V2_GRID_LIMIT = 4000; // 격자 노드 폭발 방지 (X*Y 상한)

function autoOptimizeRelationsV2() {
  showLayoutProgress('관계선최적화 V2 실행 중...');
  document.getElementById('layoutTitle').textContent = '관계선최적화 V2';
  setTimeout(_runOptimizeV2, 60);
}

function _runOptimizeV2() {
  // 1. 전체 초기화
  RELATIONS.forEach(rel => { rel.bend = null; });
  updateLayoutProgress(4, '포트 배정 중...');

  // 2. 결정적 포트 배정 (무작위성 제거)
  _v2AssignPorts();
  updateLayoutProgress(12, 'A* 격자 구성 중...');

  // 3. Hanan 격자 구성
  const grid = _v2BuildGrid();
  updateLayoutProgress(20, 'A* 경로 탐색 중...');

  // 4. 사용 비용 맵 (간선 키 → 사용 횟수)
  const usage = new Map();

  // 5. 통합 수렴 루프
  let round = 0;
  let crossings = Infinity, overlaps = Infinity;

  function runRound() {
    round++;
    // 이번 라운드에 재라우팅할 관계 목록 (첫 라운드는 전체)
    const toRoute = round === 1
      ? RELATIONS.slice()
      : RELATIONS.filter(rel => _v2CountCrossings(rel, [rel.from, rel.to]) > 0);

    toRoute.forEach(rel => {
      _v2RouteWithFaceCycle(rel, grid, usage);
      _v2SimplifyWpts(rel);
    });

    // 검증
    crossings = RELATIONS.reduce((s, rel) => s + _v2CountCrossings(rel, [rel.from, rel.to]), 0);
    overlaps  = _v2NudgeWithCrossingCheck(14, 2);

    const pct = 20 + Math.round(round / _V2_MAX_ROUND * 55);
    updateLayoutProgress(pct, `라운드 ${round}/${_V2_MAX_ROUND}  —  관통 ${crossings} · 겹침 ${overlaps}`);
    render();

    if ((crossings === 0 && overlaps === 0) || round >= _V2_MAX_ROUND) {
      _v2FinishUp(crossings, overlaps, round);
    } else {
      // usage 맵 갱신 (해결된 선의 사용 비용 반영)
      _v2UpdateUsage(usage, RELATIONS, grid);
      requestAnimationFrame(runRound);
    }
  }

  requestAnimationFrame(runRound);
}

// 보조 nudge + 마무리 단계
function _v2FinishUp(crossings, overlaps, round) {
  updateLayoutProgress(78, '겹침 보조 분리 중...');
  let nudgePass = 0;

  function nudgeIterate() {
    nudgePass++;
    const ov = _v2NudgeWithCrossingCheck(14, 2);
    // 남은 관통 세그먼트도 보정 시도
    if (crossings > 0) {
      RELATIONS.forEach(rel => {
        if (_v2CountCrossings(rel, [rel.from, rel.to]) > 0) {
          _fixEntityCrossingsForRel(rel);
          _v2SimplifyWpts(rel);
        }
      });
      crossings = RELATIONS.reduce((s, r) => s + _v2CountCrossings(r, [r.from, r.to]), 0);
    }
    const pct = 78 + Math.round(nudgePass / _V2_MAX_NUDGE * 18);
    updateLayoutProgress(pct, `보조 패스 ${nudgePass}  —  겹침 ${ov} · 관통 ${crossings}`);
    render();

    if ((ov === 0 && crossings === 0) || nudgePass >= _V2_MAX_NUDGE) {
      RELATIONS.forEach(rel => _v2SimplifyWpts(rel));
      render();
      hideLayoutProgress();
      centerOnEntities();
      saveState();
      const ok = crossings === 0 && ov === 0;
      showToast(ok
        ? `V2 최적화 완료 (${round}라운드 · ${nudgePass}보조패스)`
        : `V2 완료 — 잔여 관통 ${crossings} · 겹침 ${ov}`);
    } else {
      requestAnimationFrame(nudgeIterate);
    }
  }

  requestAnimationFrame(nudgeIterate);
}

// ── _v2AssignPorts: 결정적 면 배정 (무작위 제거) ──────────────────
function _v2AssignPorts() {
  const em = entityMap();

  RELATIONS.forEach(rel => {
    const a = em[rel.from], b = em[rel.to];
    if (!a || !b) return;
    const ah = entityHeight(a), bh = entityHeight(b);

    // 자기참조 처리
    if (rel.from === rel.to) {
      if (!rel.bend) rel.bend = {};
      rel.bend.fromFace = 'right'; rel.bend.toFace = 'bottom';
      rel.bend.fromPct  = 0.25;   rel.bend.toPct  = 0.25;
      rel.bend.wpts     = null;
      return;
    }

    const dx = (b.x + W / 2) - (a.x + W / 2);
    const dy = (b.y + bh / 2) - (a.y + ah / 2);
    const adx = Math.abs(dx), ady = Math.abs(dy);

    if (!rel.bend) rel.bend = {};

    // 결정적 면 선택: 더 강한 축 우선, 동률이면 수평 우선
    if (adx >= ady) {
      rel.bend.fromFace = dx >= 0 ? 'right' : 'left';
      rel.bend.toFace   = dx >= 0 ? 'left'  : 'right';
    } else {
      rel.bend.fromFace = dy >= 0 ? 'bottom' : 'top';
      rel.bend.toFace   = dy >= 0 ? 'top'    : 'bottom';
    }
    rel.bend.fromPct = 0.5;
    rel.bend.toPct   = 0.5;
    rel.bend.wpts    = null;
  });

  // 같은 면 다중 포트: 상대 엔티티 위치 기준 결정적 정렬 (노이즈 제거)
  ENTITIES.forEach(ent => {
    ['left', 'right', 'top', 'bottom'].forEach(face => {
      const items = [];
      RELATIONS.forEach(rel => {
        if (rel.from === ent.id && rel.bend?.fromFace === face) items.push({ rel, isFrom: true });
        if (rel.to   === ent.id && rel.bend?.toFace   === face) items.push({ rel, isFrom: false });
      });
      if (items.length < 2) return;
      const isH = face === 'left' || face === 'right';
      items.sort((x, y) => {
        const axis = ({ rel, isFrom }) => {
          const other = em[isFrom ? rel.to : rel.from];
          if (!other) return 0;
          return isH ? other.y + entityHeight(other) / 2 : other.x + W / 2;
        };
        return axis(x) - axis(y);
      });
      items.forEach(({ rel, isFrom }, i) => {
        const pct = (i + 1) / (items.length + 1);
        if (isFrom) rel.bend.fromPct = pct; else rel.bend.toPct = pct;
      });
    });
  });
}

// ── _v2BuildGrid: Hanan 격자 구성 ────────────────────────────────
function _v2BuildGrid() {
  const xs = new Set(), ys = new Set();
  const em = entityMap();

  ENTITIES.forEach(e => {
    const eh = entityHeight(e);
    xs.add(e.x - GAP);   xs.add(e.x);   xs.add(e.x + W);   xs.add(e.x + W + GAP);
    ys.add(e.y - GAP);   ys.add(e.y);   ys.add(e.y + eh);  ys.add(e.y + eh + GAP);
  });

  // 포트 anchor 좌표 추가 (현재 pct + 0.25/0.5/0.75 pct 격자선 포함)
  RELATIONS.forEach(rel => {
    const a = em[rel.from], b = em[rel.to];
    if (!a || !b || !rel.bend?.fromFace) return;
    const fp = faceAnchor(a, rel.bend.fromFace, rel.bend.fromPct);
    const tp = faceAnchor(b, rel.bend.toFace,   rel.bend.toPct);
    xs.add(fp[0]); ys.add(fp[1]);
    xs.add(tp[0]); ys.add(tp[1]);
  });
  // 0.25/0.5/0.75 pct anchor를 모든 엔티티·면에 대해 격자선에 추가
  ENTITIES.forEach(ent => {
    for (const pct of [0.25, 0.5, 0.75]) {
      ['right', 'left', 'top', 'bottom'].forEach(face => {
        const pt = faceAnchor(ent, face, pct);
        if (pt) { xs.add(pt[0]); ys.add(pt[1]); }
      });
    }
  });

  const xArr = Array.from(xs).sort((a, b) => a - b);
  const yArr = Array.from(ys).sort((a, b) => a - b);

  // 노드 수 상한 초과 시 간소화: 엔티티 경계·포트 anchor는 반드시 유지
  const mustKeepX = new Set(), mustKeepY = new Set();
  ENTITIES.forEach(e => {
    const eh = entityHeight(e);
    [e.x - GAP, e.x, e.x + W, e.x + W + GAP].forEach(v => mustKeepX.add(v));
    [e.y - GAP, e.y, e.y + eh, e.y + eh + GAP].forEach(v => mustKeepY.add(v));
  });
  RELATIONS.forEach(rel => {
    const a = em[rel.from], b = em[rel.to];
    if (!a || !b || !rel.bend?.fromFace) return;
    const fp = faceAnchor(a, rel.bend.fromFace, rel.bend.fromPct);
    const tp = faceAnchor(b, rel.bend.toFace,   rel.bend.toPct);
    mustKeepX.add(fp[0]); mustKeepY.add(fp[1]);
    mustKeepX.add(tp[0]); mustKeepY.add(tp[1]);
  });

  function thinArr(arr, limit, mustKeep) {
    if (arr.length <= limit) return arr;
    const step = arr.length / limit;
    return arr.filter((v, i) =>
      mustKeep.has(v) ||
      Math.round(i / step) * step === i ||
      i === 0 ||
      i === arr.length - 1
    );
  }
  const maxDim = Math.ceil(Math.sqrt(_V2_GRID_LIMIT));
  const xFinal = thinArr(xArr, maxDim, mustKeepX);
  const yFinal = thinArr(yArr, maxDim, mustKeepY);

  // 엔티티 내부 노드 blocked 표시
  const blocked = new Set();
  for (let yi = 0; yi < yFinal.length; yi++) {
    for (let xi = 0; xi < xFinal.length; xi++) {
      const px = xFinal[xi], py = yFinal[yi];
      for (const e of ENTITIES) {
        const eh = entityHeight(e);
        if (px > e.x && px < e.x + W && py > e.y && py < e.y + eh) {
          blocked.add(yi * xFinal.length + xi);
          break;
        }
      }
    }
  }

  return { xs: xFinal, ys: yFinal, blocked };
}

// ── _v2RouteWithFaceCycle: 포트 면 조합 순환으로 관통 최소 경로 ───
function _v2RouteWithFaceCycle(rel, grid, usage) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b || !rel.bend?.fromFace) {
    _v2AStarRoute(rel, grid, usage, [rel.from, rel.to]);
    return;
  }

  const faces = ['right', 'left', 'bottom', 'top'];
  const exIds = [rel.from, rel.to];

  // 상대 방향 기준으로 1순위 면 결정 (정렬 기준)
  const ah = entityHeight(a), bh = entityHeight(b);
  const dx = (b.x + W / 2) - (a.x + W / 2);
  const dy = (b.y + bh / 2) - (a.y + ah / 2);
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const prefFrom = adx >= ady ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  const prefTo   = adx >= ady ? (dx >= 0 ? 'left'  : 'right') : (dy >= 0 ? 'top'    : 'bottom');

  // 16조합 생성: 현재 면이 0번, 선호 조합 우선 정렬
  const origFrom = rel.bend.fromFace, origTo = rel.bend.toFace;
  const combos = [];
  for (const ff of faces) {
    for (const tf of faces) {
      const score = (ff === origFrom && tf === origTo ? 0 : 1)
                  + (ff === prefFrom ? 0 : 2)
                  + (tf === prefTo   ? 0 : 2);
      combos.push({ ff, tf, score });
    }
  }
  combos.sort((x, y) => x.score - y.score);

  let bestCross = Infinity;
  let bestWpts  = null, bestFrom = origFrom, bestTo = origTo;
  let bestFromPct = rel.bend.fromPct, bestToPct = rel.bend.toPct;

  for (const { ff, tf } of combos) {
    rel.bend.fromFace = ff;
    rel.bend.toFace   = tf;
    // pct는 중앙 유지 (포트 배정 이후이므로 현재값 보존 or 0.5)
    if (ff !== origFrom) { rel.bend.fromPct = 0.5; }
    if (tf !== origTo)   { rel.bend.toPct   = 0.5; }

    _v2AStarRoute(rel, grid, usage, exIds);
    const cross = _v2CountCrossings(rel, exIds);

    if (cross < bestCross) {
      bestCross   = cross;
      bestWpts    = rel.bend.wpts ? rel.bend.wpts.map(p => [p[0], p[1]]) : null;
      bestFrom    = ff; bestTo = tf;
      bestFromPct = rel.bend.fromPct; bestToPct = rel.bend.toPct;
      if (cross === 0) break;
    }
  }

  // pct 단계적 확장: 16조합으로 관통=0을 못 찾은 경우 추가 시도
  if (bestCross > 0) {
    const pctCandidates = [0.25, 0.75];
    outer: for (const fp of pctCandidates) {
      for (const tp of pctCandidates) {
        rel.bend.fromFace = bestFrom; rel.bend.toFace = bestTo;
        rel.bend.fromPct  = fp;       rel.bend.toPct  = tp;
        _v2AStarRoute(rel, grid, usage, exIds);
        const cross = _v2CountCrossings(rel, exIds);
        if (cross < bestCross) {
          bestCross   = cross;
          bestWpts    = rel.bend.wpts ? rel.bend.wpts.map(p => [p[0], p[1]]) : null;
          bestFromPct = fp; bestToPct = tp;
          if (cross === 0) break outer;
        }
      }
    }
  }

  // 최적 결과 복원
  rel.bend.fromFace = bestFrom; rel.bend.toFace = bestTo;
  rel.bend.fromPct  = bestFromPct; rel.bend.toPct = bestToPct;
  rel.bend.wpts = bestWpts;
}

// ── _v2AStarRoute: A* 직교 최단경로 + 폴백 ───────────────────────
function _v2AStarRoute(rel, grid, usage, exIds) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b || !rel.bend?.fromFace) return;

  // 자기참조 관계: 작은 사각 루프
  if (rel.from === rel.to) {
    const fp = faceAnchor(a, rel.bend.fromFace, rel.bend.fromPct);
    const tp = faceAnchor(a, rel.bend.toFace,   rel.bend.toPct);
    const off = W / 3;
    rel.bend.wpts = [
      [fp[0] + off, fp[1]],
      [fp[0] + off, tp[1]]
    ];
    return;
  }

  const fromPt = faceAnchor(a, rel.bend.fromFace, rel.bend.fromPct);
  const toPt   = faceAnchor(b, rel.bend.toFace,   rel.bend.toPct);
  const { xs, ys, blocked } = grid;
  const W2 = xs.length;

  // 격자 좌표 snap (가장 가까운 격자선)
  function snapX(v) { return xs.reduce((bi, x, i) => Math.abs(x - v) < Math.abs(xs[bi] - v) ? i : bi, 0); }
  function snapY(v) { return ys.reduce((bi, y, i) => Math.abs(y - v) < Math.abs(ys[bi] - v) ? i : bi, 0); }

  const si = snapX(fromPt[0]), sj = snapY(fromPt[1]);
  const ei = snapX(toPt[0]),   ej = snapY(toPt[1]);
  const startKey = sj * W2 + si, goalKey = ej * W2 + ei;

  if (startKey === goalKey) {
    rel.bend.wpts = [];
    return;
  }

  // 출발 면 → 초기 이동 방향 강제
  // fromFace: 'right'→+x, 'left'→-x, 'bottom'→+y, 'top'→-y
  const faceDirMap = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1] };
  const startDir = faceDirMap[rel.bend.fromFace] || null;

  // A* 우선순위 큐 (간이 min-heap: 정렬 배열)
  // node: { key, xi, yi, g, f, prevKey, prevDir }
  const open   = [];
  const gScore = new Map();
  const cameFrom = new Map();
  const dirFrom  = new Map();

  function heur(xi, yi) {
    return Math.abs(xs[xi] - toPt[0]) + Math.abs(ys[yi] - toPt[1]);
  }
  function usageKey(xi1, yi1, xi2, yi2) {
    const k1 = yi1 * W2 + xi1, k2 = yi2 * W2 + xi2;
    return k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
  }

  const startNode = { key: startKey, xi: si, yi: sj, g: 0, f: heur(si, sj), prevKey: -1, prevDir: startDir };
  open.push(startNode);
  gScore.set(startKey, 0);

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;
  let iters = 0;
  const MAX_ITER = Math.min(xs.length * ys.length * 4, 8000);

  while (open.length > 0 && iters < MAX_ITER) {
    iters++;
    // pop min-f
    let minIdx = 0;
    for (let k = 1; k < open.length; k++) {
      if (open[k].f < open[minIdx].f) minIdx = k;
    }
    const cur = open.splice(minIdx, 1)[0];

    if (cur.key === goalKey) { found = true; break; }

    for (const [dx, dy] of dirs) {
      const nxi = cur.xi + dx, nyi = cur.yi + dy;
      if (nxi < 0 || nxi >= xs.length || nyi < 0 || nyi >= ys.length) continue;
      const nKey = nyi * W2 + nxi;
      if (blocked.has(nKey) && nKey !== startKey && nKey !== goalKey) continue;

      // 출발 노드에서는 startDir과 일치하는 방향만 확장
      if (cur.key === startKey && startDir && (dx !== startDir[0] || dy !== startDir[1])) continue;

      // hard constraint: 세그먼트가 exIds 외 엔티티를 관통하면 불가
      if (obstacleOnSeg(xs[cur.xi], ys[cur.yi], xs[nxi], ys[nyi], exIds)) continue;

      // 비용 계산
      const dist = Math.abs(xs[nxi] - xs[cur.xi]) + Math.abs(ys[nyi] - ys[cur.yi]);
      const turnPenalty = (cur.prevDir && (cur.prevDir[0] !== dx || cur.prevDir[1] !== dy)) ? _V2_TURN_COST : 0;
      const uKey   = usageKey(cur.xi, cur.yi, nxi, nyi);
      const uCost  = (usage.get(uKey) || 0) * _V2_USAGE_COST;
      const tentG  = cur.g + dist + turnPenalty + uCost;

      if (tentG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentG);
        cameFrom.set(nKey, cur.key);
        dirFrom.set(nKey, [dx, dy]);
        open.push({ key: nKey, xi: nxi, yi: nyi, g: tentG, f: tentG + heur(nxi, nyi), prevDir: [dx, dy] });
      }
    }
  }

  if (!found) {
    // 폴백: 기존 스파인 라우팅
    _v2SpineRoute(rel);
    return;
  }

  // 경로 역추적
  const pathKeys = [];
  let backKey = goalKey;
  while (backKey !== -1) {
    pathKeys.unshift(backKey);
    backKey = cameFrom.has(backKey) ? cameFrom.get(backKey) : -1;
  }

  // usage 맵 갱신 (사용한 간선 기록)
  for (let k = 0; k < pathKeys.length - 1; k++) {
    const k1 = pathKeys[k], k2 = pathKeys[k + 1];
    const xi1 = k1 % W2, yi1 = Math.floor(k1 / W2);
    const xi2 = k2 % W2, yi2 = Math.floor(k2 / W2);
    const uk = usageKey(xi1, yi1, xi2, yi2);
    usage.set(uk, (usage.get(uk) || 0) + 1);
  }

  // 격자 노드 → 월드 좌표 → 꺾임점만 추출
  const worldPath = pathKeys.map(k => [xs[k % W2], ys[Math.floor(k / W2)]]);
  rel.bend.wpts = _v2GridPathToWpts(worldPath);
}

// ── _v2GridPathToWpts: 격자 경로 → 꺾임점 wpts ───────────────────
function _v2GridPathToWpts(worldPath) {
  if (worldPath.length <= 2) return [];
  const wpts = [];
  // 첫 점(출발 anchor)·마지막 점(도착 anchor) 제외, 방향 전환점만 추출
  for (let i = 1; i < worldPath.length - 1; i++) {
    const prev = worldPath[i - 1], cur = worldPath[i], next = worldPath[i + 1];
    const dx1 = Math.sign(cur[0] - prev[0]), dy1 = Math.sign(cur[1] - prev[1]);
    const dx2 = Math.sign(next[0] - cur[0]),  dy2 = Math.sign(next[1] - cur[1]);
    if (dx1 !== dx2 || dy1 !== dy2) wpts.push([cur[0], cur[1]]);
  }
  return wpts;
}

// ── _v2CountCrossings: 관계선의 관통 세그먼트 수 ─────────────────
function _v2CountCrossings(rel, exIds) {
  const bfw = buildFullWpts(rel);
  if (!bfw) return 0;
  let count = 0;
  const f = bfw.full;
  for (let i = 0; i < f.length - 1; i++) {
    if (obstacleOnSeg(f[i][0], f[i][1], f[i + 1][0], f[i + 1][1], exIds)) count++;
  }
  return count;
}

// ── _v2UpdateUsage: usage 맵 갱신 (라운드 간 재사용 반영) ─────────
// grid를 받아 _v2AStarRoute와 동일한 격자 인덱스 기반 키를 사용한다.
function _v2UpdateUsage(usage, relations, grid) {
  usage.clear();
  const { xs, ys } = grid;
  const W2 = xs.length;
  function snapX(v) { return xs.reduce((bi, x, i) => Math.abs(x - v) < Math.abs(xs[bi] - v) ? i : bi, 0); }
  function snapY(v) { return ys.reduce((bi, y, i) => Math.abs(y - v) < Math.abs(ys[bi] - v) ? i : bi, 0); }
  function usageKey(xi1, yi1, xi2, yi2) {
    const k1 = yi1 * W2 + xi1, k2 = yi2 * W2 + xi2;
    return k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
  }
  relations.forEach(rel => {
    const bfw = buildFullWpts(rel);
    if (!bfw) return;
    const f = bfw.full;
    for (let i = 0; i < f.length - 1; i++) {
      const xi1 = snapX(f[i][0]),   yi1 = snapY(f[i][1]);
      const xi2 = snapX(f[i+1][0]), yi2 = snapY(f[i+1][1]);
      const k = usageKey(xi1, yi1, xi2, yi2);
      usage.set(k, (usage.get(k) || 0) + 1);
    }
  });
}

// ── _v2SpineRoute: 폴백 스파인 라우팅 (A* 실패 시 사용) ──────────
function _v2SpineRoute(rel) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b || !rel.bend?.fromFace || !rel.bend?.toFace) return;

  const fromPt   = faceAnchor(a, rel.bend.fromFace, rel.bend.fromPct);
  const toPt     = faceAnchor(b, rel.bend.toFace,   rel.bend.toPct);
  const fromFace = rel.bend.fromFace;
  const toFace   = rel.bend.toFace;
  const exIds    = [rel.from, rel.to];
  const fromH    = fromFace === 'left' || fromFace === 'right';
  const toH      = toFace   === 'left' || toFace   === 'right';

  if (fromH === toH) {
    if (fromH) {
      const spX = _v2ClearSpineX(fromPt, toPt, exIds);
      rel.bend.wpts = [[spX, fromPt[1]], [spX, toPt[1]]];
    } else {
      const spY = _v2ClearSpineY(fromPt, toPt, exIds);
      rel.bend.wpts = [[fromPt[0], spY], [toPt[0], spY]];
    }
  } else {
    const corner = fromH ? [toPt[0], fromPt[1]] : [fromPt[0], toPt[1]];
    const ok1 = !obstacleOnSeg(fromPt[0], fromPt[1], corner[0], corner[1], exIds);
    const ok2 = !obstacleOnSeg(corner[0],  corner[1], toPt[0],  toPt[1],  exIds);
    if (ok1 && ok2) {
      rel.bend.wpts = [corner];
    } else if (fromH) {
      const spX = _v2ClearSpineX(fromPt, toPt, exIds);
      rel.bend.wpts = [[spX, fromPt[1]], [spX, toPt[1]]];
    } else {
      const spY = _v2ClearSpineY(fromPt, toPt, exIds);
      rel.bend.wpts = [[fromPt[0], spY], [toPt[0], spY]];
    }
  }
}

// 수직 스파인 X: 장애물 회피 (폴백용)
function _v2ClearSpineX(fromPt, toPt, exIds) {
  const lo = Math.min(fromPt[0], toPt[0]) - W / 2;
  const hi = Math.max(fromPt[0], toPt[0]) + W / 2;
  let x = (lo + hi) / 2;
  let bestX = x, bestCross = Infinity;
  for (let t = 0; t < 12; t++) {
    const obs = obstacleOnSeg(fromPt[0], fromPt[1], x,         fromPt[1], exIds)
             || obstacleOnSeg(x,         fromPt[1], x,         toPt[1],   exIds)
             || obstacleOnSeg(x,         toPt[1],   toPt[0],   toPt[1],   exIds);
    const crossCount = [
      obstacleOnSeg(fromPt[0], fromPt[1], x,       fromPt[1], exIds),
      obstacleOnSeg(x,         fromPt[1], x,        toPt[1],   exIds),
      obstacleOnSeg(x,         toPt[1],   toPt[0],  toPt[1],   exIds)
    ].filter(Boolean).length;
    if (crossCount < bestCross) { bestCross = crossCount; bestX = x; }
    if (!obs) break;
    const candL = obs.x - GAP, candR = obs.x + W + GAP;
    x = Math.abs(candL - x) <= Math.abs(candR - x) ? candL : candR;
  }
  return bestX;
}

// 수평 스파인 Y: 장애물 회피 (폴백용)
function _v2ClearSpineY(fromPt, toPt, exIds) {
  const lo = Math.min(fromPt[1], toPt[1]) - 80;
  const hi = Math.max(fromPt[1], toPt[1]) + 80;
  let y = (lo + hi) / 2;
  let bestY = y, bestCross = Infinity;
  for (let t = 0; t < 12; t++) {
    const obs = obstacleOnSeg(fromPt[0], fromPt[1], fromPt[0], y,         exIds)
             || obstacleOnSeg(fromPt[0], y,          toPt[0],  y,         exIds)
             || obstacleOnSeg(toPt[0],   y,          toPt[0],  toPt[1],   exIds);
    const crossCount = [
      obstacleOnSeg(fromPt[0], fromPt[1], fromPt[0], y,        exIds),
      obstacleOnSeg(fromPt[0], y,         toPt[0],   y,        exIds),
      obstacleOnSeg(toPt[0],   y,         toPt[0],   toPt[1],  exIds)
    ].filter(Boolean).length;
    if (crossCount < bestCross) { bestCross = crossCount; bestY = y; }
    if (!obs) break;
    const oh = entityHeight(obs);
    const candA = obs.y - GAP, candB = obs.y + oh + GAP;
    y = Math.abs(candA - y) <= Math.abs(candB - y) ? candA : candB;
  }
  return bestY;
}

// 직교 경로에서 동일선상(collinear) 중간 점 반복 제거 — 직선 가능 구간 정리
function _v2SimplifyWpts(rel) {
  if (!rel.bend?.wpts) return;
  const TOL = 0.5;
  let changed = true;
  while (changed) {
    changed = false;
    const bfw = buildFullWpts(rel);
    if (!bfw || bfw.full.length < 3) break;
    const f = bfw.full;
    for (let i = 1; i < f.length - 1; i++) {
      const p = f[i - 1], c = f[i], n = f[i + 1];
      const colH = Math.abs(p[1] - c[1]) < TOL && Math.abs(c[1] - n[1]) < TOL;
      const colV = Math.abs(p[0] - c[0]) < TOL && Math.abs(c[0] - n[0]) < TOL;
      if (colH || colV) {
        const wi = i - 1;
        if (wi >= 0 && wi < rel.bend.wpts.length) {
          rel.bend.wpts.splice(wi, 1);
          changed = true;
          break;
        }
      }
    }
  }
}

// ── 정렬 도구 ────────────────────────────────────────────────
function alignEntities(type) {
  const ids = selectedEntities.size > 1 ? [...selectedEntities]
            : selectedEntity ? [selectedEntity.id] : [];
  if (ids.length < 2) { showToast('2개 이상의 엔티티를 선택하세요 (Shift+클릭)'); return; }
  const ents = ids.map(id => ENTITIES.find(e => e.id === id)).filter(Boolean);
  switch (type) {
    case 'left':   { const v = Math.min(...ents.map(e => e.x)); ents.forEach(e => e.x = v); break; }
    case 'right':  { const v = Math.max(...ents.map(e => e.x + W)); ents.forEach(e => e.x = v - W); break; }
    case 'top':    { const v = Math.min(...ents.map(e => e.y)); ents.forEach(e => e.y = v); break; }
    case 'bottom': { const v = Math.max(...ents.map(e => e.y + entityHeight(e))); ents.forEach(e => e.y = v - entityHeight(e)); break; }
    case 'hcenter':{ const v = (Math.min(...ents.map(e=>e.x)) + Math.max(...ents.map(e=>e.x+W))) / 2; ents.forEach(e => e.x = v - W/2); break; }
    case 'vcenter':{ const v = (Math.min(...ents.map(e=>e.y)) + Math.max(...ents.map(e=>e.y+entityHeight(e)))) / 2; ents.forEach(e => e.y = v - entityHeight(e)/2); break; }
    case 'hdist': {
      if (ents.length < 3) { showToast('수평 균등 배분은 3개 이상 필요합니다'); return; }
      ents.sort((a,b) => a.x - b.x);
      const span = ents[ents.length-1].x + W - ents[0].x;
      const gap  = (span - ents.length * W) / (ents.length - 1);
      let cx = ents[0].x;
      ents.forEach(e => { e.x = cx; cx += W + gap; });
      break;
    }
    case 'vdist': {
      if (ents.length < 3) { showToast('수직 균등 배분은 3개 이상 필요합니다'); return; }
      ents.sort((a,b) => a.y - b.y);
      const totalH = ents.reduce((s,e) => s + entityHeight(e), 0);
      const span   = ents[ents.length-1].y + entityHeight(ents[ents.length-1]) - ents[0].y;
      const gap    = (span - totalH) / (ents.length - 1);
      let cy = ents[0].y;
      ents.forEach(e => { e.y = cy; cy += entityHeight(e) + gap; });
      break;
    }
  }
  render(); saveState();
}
