// ── 캔버스 초기화 ───────────────────────────────────────────────
const canvas = document.getElementById('erd');
let ctx = canvas.getContext('2d');

// ── 색상 유틸 ─────────────────────────────────────────────────
/** hex 색상을 rgba(r,g,b,a) 문자열로 변환 */
function hexAlpha(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── 인터랙션 상태 ────────────────────────────────────────────────
let draggingEntity = null;
let panStart = null;
let dragOffset = { x: 0, y: 0 };
let hoveredEntity = null;
let draggingSegment = null;
let hoveredRelSeg   = null;
let draggingLabel   = null; // { rel, type:'card'|'label', startWorld, origOffset }
let hoveredLabel    = null; // { rel, type:'card'|'label' }
let draggingRelPort = null; // { entity, x, y, curX, curY, targetEntity }
let hoveredPort     = null; // { entity, side, x, y }

// ── 다중 선택 ────────────────────────────────────────────────────
let selectedEntities = new Set();
let selectionBox = null; // {x, y, x2, y2} 드래그 박스

// ── 엔티티 선택 ─────────────────────────────────────────────────
let selectedEntity = null;

// ── 섹션 상태 ────────────────────────────────────────────────────
let sectionMode = false;
let drawingSection = null;
let hoveredSection = null;
let selectedSection = null;
let selectedSections = new Set();
let draggingSection = null;
let sectionDragOffset = { x: 0, y: 0 };
let resizingSection = null;
let resizeDir = null;
let resizeStart = null;
let _didMove = false; // 실제 이동이 발생했는지 추적 (단순 클릭 제외)
let nextSectionColorIdx = 0;

// ── 메모 상태 ────────────────────────────────────────────────────
let draggingNote = null, noteDragOffset = { x: 0, y: 0 };
let hoveredNote = null, ctxTargetNote = null;
let _noteColorIdx = 0;
let resizingNote = null, noteResizeStart = null;

// ── 엔티티 높이 / 맵 ────────────────────────────────────────────
function entityHeight(e) {
  if (collapsedEntities.has(e.id)) return HEADER_H;
  return HEADER_H + e.attrs.length * ROW_H;
}
function entityMap() {
  const m = {};
  ENTITIES.forEach(e => m[e.id] = e);
  return m;
}

// ── 직교 경로 라우팅 ────────────────────────────────────────────
function computeOrthogonalPath(a, b) {
  const ah = entityHeight(a), bh = entityHeight(b);
  const dx = (b.x + W / 2) - (a.x + W / 2);
  const dy = (b.y + bh / 2) - (a.y + ah / 2);
  const xGap = dx > 0 ? b.x - (a.x + W) : a.x - (b.x + W);
  const yGap = dy > 0 ? b.y - (a.y + ah) : a.y - (b.y + bh);
  const xOvlp = xGap < 0;
  const yOvlp = yGap < 0;

  let path;
  if (!xOvlp && (yOvlp || Math.abs(dx) >= Math.abs(dy))) {
    path = makeHPath(a, b, ah, bh, dx);
  } else if (!yOvlp) {
    path = makeVPath(a, b, ah, bh, dy);
  } else {
    path = Math.abs(dx) >= Math.abs(dy)
      ? makeHPath(a, b, ah, bh, dx)
      : makeVPath(a, b, ah, bh, dy);
  }
  return shiftForObstacle(path, a.id, b.id);
}

function makeHPath(a, b, ah, bh, dx) {
  const acy = a.y + ah / 2, bcy = b.y + bh / 2;
  let ax, bx, angleA, angleB;
  if (dx >= 0) { ax = a.x + W; bx = b.x; angleA = Math.PI; angleB = 0; }
  else         { ax = a.x;     bx = b.x + W; angleA = 0; angleB = Math.PI; }
  const midX = (ax + bx) / 2;
  return { waypoints: [[ax, acy], [midX, acy], [midX, bcy], [bx, bcy]], angleA, angleB };
}

function makeVPath(a, b, ah, bh, dy) {
  const acx = a.x + W / 2, bcx = b.x + W / 2;
  let ay, by, angleA, angleB;
  if (dy >= 0) { ay = a.y + ah; by = b.y;      angleA = -Math.PI / 2; angleB = Math.PI / 2; }
  else         { ay = a.y;      by = b.y + bh;  angleA = Math.PI / 2;  angleB = -Math.PI / 2; }
  const midY = (ay + by) / 2;
  return { waypoints: [[acx, ay], [acx, midY], [bcx, midY], [bcx, by]], angleA, angleB };
}

function shiftForObstacle(path, aId, bId) {
  const { waypoints: wp, angleA, angleB } = path;
  if (wp.length < 4) return path;
  const [p0, , , p3] = wp;
  const isVertMid = Math.abs(wp[1][0] - wp[2][0]) < 0.5;

  if (isVertMid) {
    let midX = wp[1][0];
    const lo = Math.min(p0[0], p3[0]), hi = Math.max(p0[0], p3[0]);
    for (let i = 0; i < 8; i++) {
      const obs = obstacleOnSeg(midX, Math.min(p0[1], p3[1]), midX, Math.max(p0[1], p3[1]), [aId, bId]);
      if (!obs) break;
      const left = obs.x - GAP, right = obs.x + W + GAP;
      const opts = [left, right].filter(x => x >= lo && x <= hi);
      if (!opts.length) break;
      const next = opts.reduce((a, b) => Math.abs(a - midX) < Math.abs(b - midX) ? a : b);
      if (next === midX) break;
      midX = next;
    }
    return { waypoints: [[p0[0], p0[1]], [midX, p0[1]], [midX, p3[1]], [p3[0], p3[1]]], angleA, angleB };
  } else {
    let midY = wp[1][1];
    const lo = Math.min(p0[1], p3[1]), hi = Math.max(p0[1], p3[1]);
    for (let i = 0; i < 8; i++) {
      const obs = obstacleOnSeg(Math.min(p0[0], p3[0]), midY, Math.max(p0[0], p3[0]), midY, [aId, bId]);
      if (!obs) break;
      const eh = entityHeight(obs);
      const above = obs.y - GAP, below = obs.y + eh + GAP;
      const opts = [above, below].filter(y => y >= lo && y <= hi);
      if (!opts.length) break;
      const next = opts.reduce((a, b) => Math.abs(a - midY) < Math.abs(b - midY) ? a : b);
      if (next === midY) break;
      midY = next;
    }
    return { waypoints: [[p0[0], p0[1]], [p0[0], midY], [p3[0], midY], [p3[0], p3[1]]], angleA, angleB };
  }
}

function obstacleOnSeg(x1, y1, x2, y2, excludeIds) {
  const mnX = Math.min(x1, x2) - 1, mxX = Math.max(x1, x2) + 1;
  const mnY = Math.min(y1, y2) - 1, mxY = Math.max(y1, y2) + 1;
  for (const e of ENTITIES) {
    if (excludeIds.includes(e.id)) continue;
    const eh = entityHeight(e);
    if (e.x < mxX && e.x + W > mnX && e.y < mxY && e.y + eh > mnY) return e;
  }
  return null;
}

// ── 관계선 앵커 헬퍼 ───────────────────────────────────────────
function faceAngle(face) {
  return face === 'right' ? Math.PI : face === 'left' ? 0 : face === 'top' ? Math.PI / 2 : -Math.PI / 2;
}
function faceAnchor(ent, face, pct) {
  const eh = entityHeight(ent);
  const p = Math.max(0.05, Math.min(0.95, pct ?? 0.5));
  if (face === 'left')   return [ent.x,        ent.y + p * eh];
  if (face === 'right')  return [ent.x + W,    ent.y + p * eh];
  if (face === 'top')    return [ent.x + p * W, ent.y];
  return                        [ent.x + p * W, ent.y + eh];
}
function detFace(ent, pt, eh) {
  const dl = Math.abs(pt[0] - ent.x), dr = Math.abs(pt[0] - ent.x - W);
  const dt = Math.abs(pt[1] - ent.y), db = Math.abs(pt[1] - ent.y - eh);
  const mn = Math.min(dl, dr, dt, db);
  if (mn === dl) return 'left';
  if (mn === dr) return 'right';
  if (mn === dt) return 'top';
  return 'bottom';
}
function facePct(ent, face, pt, eh) {
  return (face === 'left' || face === 'right') ? (pt[1] - ent.y) / eh : (pt[0] - ent.x) / W;
}
function snapToEntityFace(ent, wx, wy) {
  const eh = entityHeight(ent);
  const cy = Math.max(ent.y, Math.min(ent.y + eh, wy));
  const cx = Math.max(ent.x, Math.min(ent.x + W,  wx));
  const d = { left: Math.abs(wx - ent.x), right: Math.abs(wx - ent.x - W),
               top:  Math.abs(wy - ent.y), bottom: Math.abs(wy - ent.y - eh) };
  const face = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
  const pct = (face === 'left' || face === 'right') ? (cy - ent.y) / eh : (cx - ent.x) / W;
  return { face, pct };
}
function routeFacePath(fromPt, fromFace, toPt, toFace, bend) {
  const fromH = fromFace === 'left' || fromFace === 'right';
  const toH   = toFace   === 'left' || toFace   === 'right';
  if (fromH && toH) {
    const lo = Math.min(fromPt[0], toPt[0]) + 10, hi = Math.max(fromPt[0], toPt[0]) - 10;
    const midX = bend?.midX != null ? Math.max(lo, Math.min(hi, bend.midX)) : (fromPt[0] + toPt[0]) / 2;
    return { wps: [fromPt, [midX, fromPt[1]], [midX, toPt[1]], toPt], lshape: false };
  }
  if (!fromH && !toH) {
    const lo = Math.min(fromPt[1], toPt[1]) + 10, hi = Math.max(fromPt[1], toPt[1]) - 10;
    const midY = bend?.midY != null ? Math.max(lo, Math.min(hi, bend.midY)) : (fromPt[1] + toPt[1]) / 2;
    return { wps: [fromPt, [fromPt[0], midY], [toPt[0], midY], toPt], lshape: false };
  }
  // L-shape (혼합: 수평 출구 + 수직 출구)
  if (fromH) {
    return { wps: [fromPt, [toPt[0], fromPt[1]], toPt, toPt], lshape: true };
  } else {
    return { wps: [fromPt, [fromPt[0], toPt[1]], toPt, toPt], lshape: true };
  }
}

// ── 다중 세그먼트 wpts 헬퍼 ────────────────────────────────────
function buildFullWpts(rel) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b) return null;
  let fromFace, fromPt, toFace, toPt;
  if (rel.bend?.fromFace) {
    fromFace = rel.bend.fromFace;
    fromPt   = faceAnchor(a, fromFace, rel.bend.fromPct);
  } else {
    const base = computeOrthogonalPath(a, b);
    fromPt = base.waypoints[0]; fromFace = detFace(a, fromPt, entityHeight(a));
  }
  if (rel.bend?.toFace) {
    toFace = rel.bend.toFace;
    toPt   = faceAnchor(b, toFace, rel.bend.toPct);
  } else {
    const base = computeOrthogonalPath(a, b);
    toPt = base.waypoints[3]; toFace = detFace(b, toPt, entityHeight(b));
  }
  const wpts = rel.bend?.wpts || [];
  return { full: [fromPt, ...wpts.map(p=>[...p]), toPt], fromFace, toFace };
}

function initWpts(rel) {
  if (rel.bend?.wpts != null) return;
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b) return;
  const path = getRelationPath(rel);
  if (!path) return;
  const wp = path.waypoints;
  if (!rel.bend) rel.bend = {};
  const ah = entityHeight(a), bh = entityHeight(b);
  if (!rel.bend.fromFace) { rel.bend.fromFace = detFace(a, wp[0], ah); rel.bend.fromPct = facePct(a, rel.bend.fromFace, wp[0], ah); }
  if (!rel.bend.toFace)   { rel.bend.toFace   = detFace(b, wp[wp.length-1], bh); rel.bend.toPct = facePct(b, rel.bend.toFace, wp[wp.length-1], bh); }
  rel.bend.wpts = wp.slice(1, wp.length - 1).map(p => [...p]);
  delete rel.bend.midX; delete rel.bend.midY; delete rel.bend.fromOff; delete rel.bend.toOff;
}

function segDir(p1, p2) { return Math.abs(p1[1] - p2[1]) < 1 ? 'H' : 'V'; }

function insertBump(rel, segIdx) {
  initWpts(rel);
  const bfw = buildFullWpts(rel);
  if (!bfw) return;
  const { full } = bfw;
  if (segIdx < 0 || segIdx >= full.length - 1) return;
  const p1 = full[segIdx], p2 = full[segIdx + 1];
  const dir = segDir(p1, p2);
  const BUMP = 50;
  const b1 = dir === 'H' ? [p1[0], p1[1] + BUMP] : [p1[0] + BUMP, p1[1]];
  const b2 = dir === 'H' ? [p2[0], p1[1] + BUMP] : [p1[0] + BUMP, p2[1]];
  rel.bend.wpts.splice(segIdx, 0, b1, b2);
}

function applyRelSegDrag(rel, segIdx, origBend, dx, dy) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b) return;
  rel.bend.wpts    = origBend.wpts ? origBend.wpts.map(p => [...p]) : null;
  rel.bend.fromPct = origBend.fromPct; rel.bend.toPct = origBend.toPct;
  rel.bend.fromFace = origBend.fromFace; rel.bend.toFace = origBend.toFace;
  const bfw = buildFullWpts(rel);
  if (!bfw) return;
  const { full } = bfw;
  const n = full.length;
  const p1 = full[segIdx];
  const dir = segDir(full[segIdx], full[segIdx + 1]);
  const ah = entityHeight(a), bh = entityHeight(b);
  const setCoord = (idx, coord, val) => {
    if (idx === 0) {
      rel.bend.fromPct = Math.max(0.05, Math.min(0.95, coord === 'y' ? (val - a.y) / ah : (val - a.x) / W));
    } else if (idx === n - 1) {
      rel.bend.toPct = Math.max(0.05, Math.min(0.95, coord === 'y' ? (val - b.y) / bh : (val - b.x) / W));
    } else {
      rel.bend.wpts[idx - 1][coord === 'y' ? 1 : 0] = val;
    }
  };
  if (dir === 'H') {
    const nv = p1[1] + dy;
    setCoord(segIdx, 'y', nv); setCoord(segIdx + 1, 'y', nv);
  } else {
    const nv = p1[0] + dx;
    setCoord(segIdx, 'x', nv); setCoord(segIdx + 1, 'x', nv);
  }
}

function applyRelWptDrag(rel, fullIdx, origBend, dx, dy) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b) return;
  rel.bend.wpts    = origBend.wpts ? origBend.wpts.map(p => [...p]) : null;
  rel.bend.fromPct = origBend.fromPct; rel.bend.toPct = origBend.toPct;
  rel.bend.fromFace = origBend.fromFace; rel.bend.toFace = origBend.toFace;
  const bfw = buildFullWpts(rel);
  if (!bfw) return;
  const { full } = bfw;
  const n = full.length;
  const i = fullIdx;
  if (i <= 0 || i >= n - 1) return;
  const ah = entityHeight(a), bh = entityHeight(b);
  const setCoord = (idx, coord, val) => {
    if (idx === 0) {
      rel.bend.fromPct = Math.max(0.05, Math.min(0.95, coord === 'y' ? (val - a.y) / ah : (val - a.x) / W));
    } else if (idx === n - 1) {
      rel.bend.toPct = Math.max(0.05, Math.min(0.95, coord === 'y' ? (val - b.y) / bh : (val - b.x) / W));
    } else {
      rel.bend.wpts[idx - 1][coord === 'y' ? 1 : 0] = val;
    }
  };
  const leftDir  = segDir(full[i - 1], full[i]);
  const rightDir = segDir(full[i], full[i + 1]);
  const newX = full[i][0] + dx, newY = full[i][1] + dy;
  if (leftDir === 'H' && rightDir === 'V') {
    setCoord(i, 'x', newX); setCoord(i + 1, 'x', newX);
    setCoord(i, 'y', newY); setCoord(i - 1, 'y', newY);
  } else if (leftDir === 'V' && rightDir === 'H') {
    setCoord(i, 'x', newX); setCoord(i - 1, 'x', newX);
    setCoord(i, 'y', newY); setCoord(i + 1, 'y', newY);
  } else {
    setCoord(i, 'x', newX); setCoord(i, 'y', newY);
  }
}

function straightenWpts(rel) {
  if (!rel.bend?.wpts) return false;
  const SNAP = 8;
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b) return false;
  const bfw = buildFullWpts(rel);
  if (!bfw) return false;
  const full = bfw.full.map(p => [...p]);
  const n = full.length;
  if (n < 3) return false;
  let changed = false;

  const setInterior = (fullIdx, axis, val) => {
    if (fullIdx <= 0 || fullIdx >= n - 1) return;
    rel.bend.wpts[fullIdx - 1][axis] = val;
    full[fullIdx][axis] = val;
  };

  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = full[i];
    const [x2, y2] = full[i + 1];
    const adx = Math.abs(x2 - x1);
    const ady = Math.abs(y2 - y1);
    if (adx < 1 && ady < 1) continue;

    if (adx < ady) {
      if (adx > 0 && adx <= SNAP) {
        const rightInterior = i + 1 < n - 1;
        const leftInterior  = i > 0;
        if (rightInterior)     { setInterior(i + 1, 0, x1); changed = true; }
        else if (leftInterior) { setInterior(i,     0, x2); changed = true; }
      }
    } else {
      if (ady > 0 && ady <= SNAP) {
        const rightInterior = i + 1 < n - 1;
        const leftInterior  = i > 0;
        if (rightInterior)     { setInterior(i + 1, 1, y1); changed = true; }
        else if (leftInterior) { setInterior(i,     1, y2); changed = true; }
      }
    }
  }
  return changed;
}

function collapseCollinearWpts(rel) {
  if (!rel.bend?.wpts) return false;
  const bfw = buildFullWpts(rel);
  if (!bfw) return false;
  const { full } = bfw;
  const n = full.length;
  if (n < 4) return false;

  const newWpts = [];
  let changed = false;
  for (let i = 1; i <= n - 2; i++) {
    const leftDir  = segDir(full[i - 1], full[i]);
    const rightDir = segDir(full[i], full[i + 1]);
    if (leftDir === rightDir) {
      changed = true;
    } else {
      newWpts.push([...full[i]]);
    }
  }
  if (changed) rel.bend.wpts = newWpts;
  return changed;
}

function getRelationPath(rel) {
  const em = entityMap();
  const a = em[rel.from], b = em[rel.to];
  if (!a || !b) return null;

  if (rel.bend?.wpts != null) {
    const bfw = buildFullWpts(rel);
    if (!bfw) return null;
    const { full, fromFace, toFace } = bfw;
    return { waypoints: full, angleA: faceAngle(fromFace), angleB: faceAngle(toFace), lshape: false };
  }

  if (rel.bend?.fromFace || rel.bend?.toFace) {
    const ah = entityHeight(a), bh = entityHeight(b);
    const base = (!rel.bend.fromFace || !rel.bend.toFace) ? computeOrthogonalPath(a, b) : null;
    let fromFace, fromPt;
    if (rel.bend.fromFace) {
      fromFace = rel.bend.fromFace;
      fromPt   = faceAnchor(a, fromFace, rel.bend.fromPct);
    } else {
      const wp0 = base.waypoints[0];
      fromFace  = detFace(a, wp0, ah);
      fromPt    = wp0;
    }
    let toFace, toPt;
    if (rel.bend.toFace) {
      toFace = rel.bend.toFace;
      toPt   = faceAnchor(b, toFace, rel.bend.toPct);
    } else {
      const wp3 = base.waypoints[3];
      toFace    = detFace(b, wp3, bh);
      toPt      = wp3;
    }
    const { wps, lshape } = routeFacePath(fromPt, fromFace, toPt, toFace, rel.bend);
    return { waypoints: wps, angleA: faceAngle(fromFace), angleB: faceAngle(toFace), lshape };
  }

  const base = computeOrthogonalPath(a, b);
  if (!rel.bend) return base;
  const { waypoints: wp, angleA, angleB } = base;
  const ah = entityHeight(a), bh = entityHeight(b);
  const fromOff = rel.bend.fromOff ?? 0;
  const toOff   = rel.bend.toOff   ?? 0;
  const isMidVert = Math.abs(wp[1][0] - wp[2][0]) < 0.5;
  if (isMidVert) {
    const fy = Math.max(a.y + HEADER_H + ROW_H * 0.5, Math.min(a.y + ah - ROW_H * 0.5, a.y + ah / 2 + fromOff));
    const ty = Math.max(b.y + HEADER_H + ROW_H * 0.5, Math.min(b.y + bh - ROW_H * 0.5, b.y + bh / 2 + toOff));
    const lo = Math.min(wp[0][0], wp[3][0]) + 10, hi = Math.max(wp[0][0], wp[3][0]) - 10;
    const mx = (rel.bend.midX != null) ? Math.max(lo, Math.min(hi, rel.bend.midX)) : wp[1][0];
    return { waypoints: [[wp[0][0], fy], [mx, fy], [mx, ty], [wp[3][0], ty]], angleA, angleB };
  } else {
    const fx = Math.max(a.x + 10, Math.min(a.x + W - 10, a.x + W / 2 + fromOff));
    const tx = Math.max(b.x + 10, Math.min(b.x + W - 10, b.x + W / 2 + toOff));
    const lo = Math.min(wp[0][1], wp[3][1]) + 10, hi = Math.max(wp[0][1], wp[3][1]) - 10;
    const my = (rel.bend.midY != null) ? Math.max(lo, Math.min(hi, rel.bend.midY)) : wp[1][1];
    return { waypoints: [[fx, wp[0][1]], [fx, my], [tx, my], [tx, wp[3][1]]], angleA, angleB };
  }
}

// ── 관계 레이블 위치 계산 ──────────────────────────────────────
function getRelLabelPositions(rel) {
  const path = getRelationPath(rel);
  if (!path) return null;
  const wp = path.waypoints;
  const n = wp.length;
  if (n < 2) return null;
  const mi = Math.floor((n - 1) / 2);
  const lx = (wp[mi][0] + wp[mi+1][0]) / 2;
  const ly = (wp[mi][1] + wp[mi+1][1]) / 2;
  const sdx = wp[mi+1][0] - wp[mi][0];
  const sdy = wp[mi+1][1] - wp[mi][1];
  const slen = Math.sqrt(sdx*sdx + sdy*sdy) || 1;
  const co = rel.cardOffset  || { dx: 0, dy: 0 };
  const lo = rel.labelOffset || { dx: 0, dy: 0 };
  return {
    card:  [lx - sdy/slen*14 + co.dx, ly + sdx/slen*14 + co.dy],
    label: [lx - sdy/slen*26 + lo.dx, ly + sdx/slen*26 + lo.dy],
  };
}

// ── hit test 함수들 ───────────────────────────────────────────
function hitTestRelHandle(wx, wy) {
  const threshold = 8 / scale;
  const epRadius  = 8 / scale;
  const addRadius = 6 / scale;
  const wptRadius = 7 / scale;
  for (let i = RELATIONS.length - 1; i >= 0; i--) {
    const rel = RELATIONS[i];
    const path = getRelationPath(rel);
    if (!path) continue;
    const { waypoints: wp } = path;
    const n = wp.length;
    if (Math.hypot(wx - wp[0][0], wy - wp[0][1]) < epRadius)     return { rel, type: 'from' };
    if (Math.hypot(wx - wp[n-1][0], wy - wp[n-1][1]) < epRadius) return { rel, type: 'to' };
    if (rel.bend?.wpts?.length) {
      for (let j = 1; j < n - 1; j++) {
        if (Math.hypot(wx - wp[j][0], wy - wp[j][1]) < wptRadius)
          return { rel, type: 'wpt', wptFullIdx: j };
      }
    }
    for (let j = 0; j < n - 1; j++) {
      if (pointToSegDist(wx, wy, wp[j][0], wp[j][1], wp[j+1][0], wp[j+1][1]) < threshold) {
        const mx = (wp[j][0] + wp[j+1][0]) / 2, my = (wp[j][1] + wp[j+1][1]) / 2;
        if (Math.hypot(wx - mx, wy - my) < addRadius) return { rel, type: 'add', segIdx: j };
        return { rel, type: 'seg', segIdx: j };
      }
    }
  }
  return null;
}

function hitTestRelLabel(wx, wy) {
  const HW = 18 / scale, HH = 10 / scale;
  for (let i = RELATIONS.length - 1; i >= 0; i--) {
    const rel = RELATIONS[i];
    const pos = getRelLabelPositions(rel);
    if (!pos) continue;
    const [cx, cy] = pos.card;
    if (Math.abs(wx - cx) <= HW && Math.abs(wy - cy) <= HH)
      return { rel, type: 'card' };
    if (rel.label) {
      const [lx, ly] = pos.label;
      if (Math.abs(wx - lx) <= HW && Math.abs(wy - ly) <= HH)
        return { rel, type: 'label' };
    }
  }
  return null;
}

function hitTestSectionLabel(wx, wy) {
  const d = SEC_RESIZE_HIT / scale;
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    const s = SECTIONS[i];
    if (wx >= s.x + d && wx <= s.x + s.w - d && wy >= s.y + d && wy <= s.y + SECTION_LABEL_H) return s;
  }
  return null;
}

function hitTestSectionResize(wx, wy) {
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    const s = SECTIONS[i];
    const { x, y, w, h } = s;
    const d = SEC_RESIZE_HIT / scale;
    if (wx < x - d || wx > x + w + d || wy < y - d || wy > y + h + d) continue;
    const nearL = wx >= x - d && wx <= x + d;
    const nearR = wx >= x + w - d && wx <= x + w + d;
    const nearT = wy >= y - d && wy <= y + d;
    const nearB = wy >= y + h - d && wy <= y + h + d;
    const inW   = wx >= x - d && wx <= x + w + d;
    const inH   = wy >= y - d && wy <= y + h + d;
    if (!nearL && !nearR && !nearT && !nearB) continue;
    if (nearL && nearT) return { section: s, dir: 'nw' };
    if (nearR && nearT) return { section: s, dir: 'ne' };
    if (nearL && nearB) return { section: s, dir: 'sw' };
    if (nearR && nearB) return { section: s, dir: 'se' };
    if (nearL && inH)   return { section: s, dir: 'w' };
    if (nearR && inH)   return { section: s, dir: 'e' };
    if (nearT && inW)   return { section: s, dir: 'n' };
    if (nearB && inW)   return { section: s, dir: 's' };
  }
  return null;
}

function hitTest(wx, wy) {
  for (let i = ENTITIES.length - 1; i >= 0; i--) {
    const e = ENTITIES[i];
    if (wx >= e.x && wx <= e.x + W && wy >= e.y && wy <= e.y + entityHeight(e)) return e;
  }
  return null;
}

function hitTestRelation(wx, wy) {
  const threshold = 8 / scale;
  for (let i = RELATIONS.length - 1; i >= 0; i--) {
    const rel = RELATIONS[i];
    const path = getRelationPath(rel);
    if (!path) continue;
    const { waypoints: wp } = path;
    for (let j = 1; j < wp.length; j++) {
      if (pointToSegDist(wx, wy, wp[j-1][0], wp[j-1][1], wp[j][0], wp[j][1]) < threshold) return rel;
    }
  }
  return null;
}

function hitTestNote(wx, wy) {
  for (let i = NOTES.length - 1; i >= 0; i--) {
    const n = NOTES[i];
    const nw = n.w || NOTE_W, nh = n.h || NOTE_H;
    if (wx >= n.x && wx <= n.x + nw && wy >= n.y && wy <= n.y + nh) return n;
  }
  return null;
}

// 메모 우하단 리사이즈 핸들 충돌 검사
function hitTestNoteResize(wx, wy) {
  const HANDLE = 12 / scale;   // 핸들 감지 범위 (월드 단위)
  for (let i = NOTES.length - 1; i >= 0; i--) {
    const n = NOTES[i];
    const nw = n.w || NOTE_W, nh = n.h || NOTE_H;
    const rx = n.x + nw, ry = n.y + nh;
    if (wx >= rx - HANDLE && wx <= rx + HANDLE * 0.3 &&
        wy >= ry - HANDLE && wy <= ry + HANDLE * 0.3) {
      return n;
    }
  }
  return null;
}

// 메모 탭 바 영역 클릭 감지 → { note, mode:'text'|'markdown' }
function hitTestNoteTab(wx, wy) {
  const TAB_H = NOTE_TAB_H;
  for (let i = NOTES.length - 1; i >= 0; i--) {
    const n = NOTES[i];
    const nw = n.w || NOTE_W;
    if (wx >= n.x && wx <= n.x + nw && wy >= n.y && wy <= n.y + TAB_H) {
      return { note: n, mode: wx < n.x + nw / 2 ? 'text' : 'markdown' };
    }
  }
  return null;
}

// ── 포트 ──────────────────────────────────────────────────────
function entityPorts(e) {
  const h = entityHeight(e);
  return [
    { side: 'left',   x: e.x,         y: e.y + HEADER_H / 2 },
    { side: 'right',  x: e.x + W,     y: e.y + HEADER_H / 2 },
    { side: 'top',    x: e.x + W / 2, y: e.y },
    { side: 'bottom', x: e.x + W / 2, y: e.y + h },
  ];
}
function hitTestPort(wx, wy, skipEntity) {
  for (let i = ENTITIES.length - 1; i >= 0; i--) {
    const e = ENTITIES[i];
    if (e === skipEntity) continue;
    for (const p of entityPorts(e)) {
      if (Math.hypot(wx - p.x, wy - p.y) <= PORT_HIT) return { entity: e, ...p };
    }
  }
  return null;
}
function drawEntityPorts(e) {
  for (const p of entityPorts(e)) {
    const isHov = hoveredPort && hoveredPort.entity === e && hoveredPort.side === p.side;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, isHov ? PORT_R + 2 : PORT_R, 0, Math.PI * 2);
    ctx.fillStyle = isHov ? COLOR.lineCard : COLOR.line;
    ctx.fill();
    ctx.strokeStyle = COLOR.bodyBg;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// ── 그리기 함수들 ────────────────────────────────────────────
function drawRoundRect(x, y, w, h, r, fill, stroke, lw = 1.5) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** 볼륨 테두리: rowCount에 따라 border 두께와 레이블 결정 */
function _volumeBorder(e) {
  const n = parseInt(e.rowCount);
  if (!n || n <= 0)      return { lw: 1.5, label: null, color: null };
  if (n < 10_000)        return { lw: 2.5, label: null,   color: COLOR.normalText };
  if (n < 100_000)       return { lw: 3.5, label: '1만+', color: COLOR.ac_y };
  if (n < 1_000_000)     return { lw: 5,   label: '10만+',color: COLOR.ac_y };
  return                        { lw: 7,   label: '100만+',color: COLOR.pkText };
}

function drawEntity(e) {
  const h = entityHeight(e);
  const { x, y } = e;
  const isHovered  = e === hoveredEntity;
  const isSelected = e === selectedEntity;
  const isMultiSel = selectedEntities.has(e.id);
  const vol = _volumeBorder(e);

  ctx.shadowColor    = isSelected ? COLOR.selGlow : COLOR.shadow;
  ctx.shadowBlur     = isSelected ? 30 : isHovered ? 22 : 14;
  ctx.shadowOffsetX  = 3; ctx.shadowOffsetY = 4;

  const borderColor = isSelected ? COLOR.line : isHovered ? COLOR.hover
    : (vol.lw > 1.5 ? vol.color : COLOR.border);
  drawRoundRect(x, y, W, h, RADIUS, COLOR.bodyBg, borderColor, vol.lw);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  ctx.beginPath();
  ctx.moveTo(x + RADIUS, y);
  ctx.lineTo(x + W - RADIUS, y);
  ctx.quadraticCurveTo(x + W, y, x + W, y + RADIUS);
  ctx.lineTo(x + W, y + HEADER_H);
  ctx.lineTo(x, y + HEADER_H);
  ctx.lineTo(x, y + RADIUS);
  ctx.quadraticCurveTo(x, y, x + RADIUS, y);
  ctx.closePath();
  const _ec = ENTITY_COLOR_PALETTE.find(c => c.id === (e.colorTag || null)) || ENTITY_COLOR_PALETTE[0];
  ctx.fillStyle = isSelected ? COLOR.selHdr : isHovered ? COLOR.hovHdr : _ec.bg;
  ctx.fill();

  ctx.fillStyle = COLOR.headerText;
  ctx.font = 'bold 13px Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(entDisplayName(e), x + W / 2, y + HEADER_H / 2);

  // ── 볼륨 레이블 (우상단 헤더) ──
  if (vol.label) {
    ctx.save();
    ctx.font = 'bold 9px Segoe UI';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const vw = ctx.measureText(vol.label).width + 6;
    ctx.fillStyle = hexAlpha(vol.color || COLOR.ac_y, 0.25);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + 4, y + 3, vw, 13, 3)
                  : ctx.rect(x + 4, y + 3, vw, 13);
    ctx.fill();
    ctx.fillStyle = vol.color || COLOR.ac_y;
    ctx.fillText(vol.label, x + 7, y + 5);
    ctx.restore();
  }

  // ── 정규화 경고 배지 (좌하단 헤더 모서리) ──
  if (typeof _normActive !== 'undefined' && _normActive && _normWarnings[e.id]) {
    ctx.save();
    ctx.font = 'bold 11px Segoe UI';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOR.ac_y;
    ctx.fillText('⚠', x + W - 22, y + HEADER_H / 2);
    ctx.restore();
  }

  const isCollapsed = collapsedEntities.has(e.id);
  ctx.font = '10px Segoe UI';
  ctx.textAlign = 'right';
  ctx.fillStyle = isHovered ? COLOR.line : COLOR.typeText;
  ctx.fillText(isCollapsed ? '▶' : '▼', x + W - 8, y + HEADER_H / 2);

  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_H);
  ctx.lineTo(x + W, y + HEADER_H);
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (isCollapsed) {
    drawRoundRect(x, y, W, HEADER_H, RADIUS, null,
      isSelected ? COLOR.line : isHovered ? COLOR.hover : (vol.lw > 1.5 ? vol.color : COLOR.border),
      vol.lw);
    if (isSelected) { ctx.save(); ctx.strokeStyle=COLOR.line; ctx.lineWidth=1.5; ctx.globalAlpha=0.45; ctx.setLineDash([5,4]); const p=4,rr=RADIUS+p; ctx.beginPath(); ctx.moveTo(x-p+rr,y-p); ctx.lineTo(x+W+p-rr,y-p); ctx.quadraticCurveTo(x+W+p,y-p,x+W+p,y-p+rr); ctx.lineTo(x+W+p,y+HEADER_H+p-rr); ctx.quadraticCurveTo(x+W+p,y+HEADER_H+p,x+W+p-rr,y+HEADER_H+p); ctx.lineTo(x-p+rr,y+HEADER_H+p); ctx.quadraticCurveTo(x-p,y+HEADER_H+p,x-p,y+HEADER_H+p-rr); ctx.lineTo(x-p,y-p+rr); ctx.quadraticCurveTo(x-p,y-p,x-p+rr,y-p); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    if (isMultiSel) { ctx.save(); ctx.strokeStyle=COLOR.line; ctx.lineWidth=2; ctx.globalAlpha=0.7; ctx.strokeRect(x-3,y-3,W+6,HEADER_H+6); ctx.restore(); }
    if (isHovered || hoveredPort?.entity === e || draggingRelPort?.entity === e) drawEntityPorts(e);
    return;
  }

  e.attrs.forEach((attr, i) => {
    const ry = y + HEADER_H + i * ROW_H;
    if (attr.kind === 'pk') {
      ctx.fillStyle = COLOR.pkBg; ctx.fillRect(x + 1, ry, W - 2, ROW_H);
    } else if (attr.kind === 'fk') {
      ctx.fillStyle = COLOR.fkBg; ctx.fillRect(x + 1, ry, W - 2, ROW_H);
    }
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(x + 1, ry); ctx.lineTo(x + W - 1, ry);
      ctx.strokeStyle = COLOR.gridColor; ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.font = 'bold 9px Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const badge = attr.kind === 'pk' ? 'PK' : attr.kind === 'fk' ? 'FK' : '';
    if (badge) {
      ctx.fillStyle = attr.kind === 'pk' ? COLOR.pkText : COLOR.fkText;
      ctx.fillText(badge, x + 6, ry + ROW_H / 2);
    } else {
      let cx2 = x + 6;
      if (attr.notNull) {
        ctx.fillStyle = COLOR.ac_y;
        ctx.fillText('N', cx2, ry + ROW_H / 2); cx2 += 11;
      }
      if (attr.unique) {
        ctx.fillStyle = COLOR.lineCard;
        ctx.fillText('U', cx2, ry + ROW_H / 2);
      }
    }
    ctx.font = attr.kind === 'pk' ? 'bold 11px Consolas, monospace'
             : attr.kind === 'fk' ? 'italic 11px Consolas, monospace'
             : '11px Consolas, monospace';
    ctx.fillStyle = attr.kind === 'pk' ? COLOR.pkText
                  : attr.kind === 'fk' ? COLOR.fkText : COLOR.normalText;
    ctx.textAlign = 'left';
    ctx.fillText(attrDisplayName(attr), x + 28, ry + ROW_H / 2);
    ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'right';
    if (attr.kind === 'fk' && attr.ref) {
      const refEnt = entityMap()[attr.ref.entity];
      ctx.fillStyle = refEnt ? COLOR.fkText : COLOR.pkText;
      ctx.fillText('→ ' + attr.ref.entity + '.' + attr.ref.attr, x + W - 8, ry + ROW_H / 2);
    } else {
      ctx.fillStyle = COLOR.typeText;
      ctx.fillText(attr.type, x + W - 8, ry + ROW_H / 2);
    }
  });

  drawRoundRect(x, y, W, h, RADIUS, null,
    isSelected ? COLOR.line : isHovered ? COLOR.hover : (vol.lw > 1.5 ? vol.color : COLOR.border),
    vol.lw);

  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = COLOR.line; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.45; ctx.setLineDash([5, 4]);
    const p = 4, rr = RADIUS + p;
    ctx.beginPath();
    ctx.moveTo(x - p + rr, y - p); ctx.lineTo(x + W + p - rr, y - p);
    ctx.quadraticCurveTo(x + W + p, y - p, x + W + p, y - p + rr);
    ctx.lineTo(x + W + p, y + h + p - rr);
    ctx.quadraticCurveTo(x + W + p, y + h + p, x + W + p - rr, y + h + p);
    ctx.lineTo(x - p + rr, y + h + p);
    ctx.quadraticCurveTo(x - p, y + h + p, x - p, y + h + p - rr);
    ctx.lineTo(x - p, y - p + rr);
    ctx.quadraticCurveTo(x - p, y - p, x - p + rr, y - p);
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  if (isMultiSel) {
    ctx.save();
    ctx.strokeStyle = COLOR.line; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(x - 3, y - 3, W + 6, h + 6);
    ctx.restore();
  }
  if (isHovered || hoveredPort?.entity === e || draggingRelPort?.entity === e) drawEntityPorts(e);
}

function drawOne(x, y, angle) {
  const perp = angle + Math.PI / 2;
  const d = 6;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cp = Math.cos(perp), sp = Math.sin(perp);
  ctx.beginPath();
  ctx.moveTo(x + 6*cp, y + 6*sp);
  ctx.lineTo(x - 6*cp, y - 6*sp);
  ctx.moveTo(x - d*ca + 6*cp, y - d*sa + 6*sp);
  ctx.lineTo(x - d*ca - 6*cp, y - d*sa - 6*sp);
  ctx.lineWidth = 1.5; ctx.stroke();
}

function drawMany(x, y, angle) {
  const toeLen = 14;
  const barDist = 22;
  const spread = 7;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cp = Math.cos(angle + Math.PI / 2), sp = Math.sin(angle + Math.PI / 2);
  const tx = x - toeLen * ca, ty = y - toeLen * sa;

  ctx.beginPath();
  ctx.moveTo(tx, ty); ctx.lineTo(x + spread * cp, y + spread * sp);
  ctx.moveTo(tx, ty); ctx.lineTo(x, y);
  ctx.moveTo(tx, ty); ctx.lineTo(x - spread * cp, y - spread * sp);
  const bx = x - barDist * ca, by = y - barDist * sa;
  ctx.moveTo(bx + 6 * cp, by + 6 * sp);
  ctx.lineTo(bx - 6 * cp, by - 6 * sp);
  ctx.lineWidth = 1.5; ctx.stroke();
}

function drawCrowsFoot(x, y, angle, isMany, isMandatory) {
  const L = 14, W2 = 8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI);
  ctx.strokeStyle = COLOR.line; ctx.lineWidth = 1.5;
  if (isMandatory) {
    ctx.beginPath(); ctx.moveTo(L, -W2); ctx.lineTo(L, W2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L+5, -W2); ctx.lineTo(L+5, W2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(L+3, 0, 4, 0, Math.PI*2); ctx.stroke();
  }
  if (isMany) {
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(L,-W2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(L, 0);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(L, W2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(0,-W2); ctx.lineTo(0, W2); ctx.stroke();
  }
  ctx.restore();
}

function drawRelations() {
  RELATIONS.forEach(rel => {
    const path = getRelationPath(rel);
    if (!path) return;
    const { waypoints: wp, angleA, angleB } = path;
    const n = wp.length;
    const [fromCard, toCard] = rel.card.split(':');
    const isActive = hoveredRelSeg?.rel === rel || draggingSegment?.rel === rel;
    const lineColor = isActive ? COLOR.lineHover : COLOR.line;
    const labelColor = COLOR.lineCard;
    const dash = rel.lineStyle === 'dashed' ? [7, 4] : [];
    ctx.setLineDash(dash);

    for (let j = 0; j < n - 1; j++) {
      const isHov = isActive && hoveredRelSeg?.type === 'seg' && hoveredRelSeg?.segIdx === j;
      ctx.strokeStyle = isHov ? COLOR.lineCard : lineColor;
      ctx.lineWidth = isHov ? 2.5 : (isActive ? 2 : 1.5);
      ctx.beginPath(); ctx.moveTo(wp[j][0], wp[j][1]); ctx.lineTo(wp[j+1][0], wp[j+1][1]); ctx.stroke();
    }
    ctx.setLineDash([]);

    if (isActive) {
      const hovType = hoveredRelSeg?.rel === rel ? hoveredRelSeg.type : null;
      const drgType = draggingSegment?.rel === rel ? draggingSegment.type : null;

      for (let j = 0; j < n - 1; j++) {
        const mx = (wp[j][0] + wp[j+1][0]) / 2, my = (wp[j][1] + wp[j+1][1]) / 2;
        const hi = hovType === 'add' && hoveredRelSeg.segIdx === j;
        ctx.fillStyle = hi ? COLOR.normalText : COLOR.lineFill;
        ctx.strokeStyle = hi ? COLOR.normalText : COLOR.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = COLOR.bodyBg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(mx-3,my); ctx.lineTo(mx+3,my); ctx.moveTo(mx,my-3); ctx.lineTo(mx,my+3); ctx.stroke();
      }

      for (let j = 1; j < n - 1; j++) {
        const hi = (hovType === 'wpt' && hoveredRelSeg.wptFullIdx === j) || (drgType === 'wpt' && draggingSegment.wptFullIdx === j);
        ctx.fillStyle = hi ? COLOR.pkText : COLOR.lineCard;
        ctx.strokeStyle = COLOR.bodyBg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(wp[j][0], wp[j][1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      const drawEp = (ex, ey, hi) => {
        const hs = 5; ctx.fillStyle = hi ? COLOR.pkText : COLOR.line;
        ctx.strokeStyle = COLOR.bodyBg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(ex-hs, ey-hs, hs*2, hs*2); ctx.fill(); ctx.stroke();
      };
      drawEp(wp[0][0], wp[0][1], hovType==='from' || drgType==='from');
      drawEp(wp[n-1][0], wp[n-1][1], hovType==='to' || drgType==='to');
    }

    ctx.strokeStyle = lineColor;
    const last = wp[n-1];
    if (notationStyle === 'crowsfoot') {
      drawCrowsFoot(wp[0][0], wp[0][1], angleA, fromCard === 'N', true);
      drawCrowsFoot(last[0], last[1], angleB, toCard === 'N', true);
    } else {
      if (fromCard === 'N') drawMany(wp[0][0], wp[0][1], angleA); else drawOne(wp[0][0], wp[0][1], angleA);
      if (toCard === 'N') drawMany(last[0], last[1], angleB); else drawOne(last[0], last[1], angleB);
    }

    const lpos = getRelLabelPositions(rel);
    if (lpos) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const isCardDrag  = draggingLabel?.rel === rel && draggingLabel.type === 'card';
      const isCardHov   = hoveredLabel?.rel  === rel && hoveredLabel.type  === 'card';
      const isLabelDrag = draggingLabel?.rel === rel && draggingLabel.type === 'label';
      const isLabelHov  = hoveredLabel?.rel  === rel && hoveredLabel.type  === 'label';
      const [cardX, cardY] = lpos.card;
      if (isCardHov || isCardDrag) {
        ctx.fillStyle = hexAlpha(COLOR.lineCard, 0.2);
        ctx.fillRect(cardX-14, cardY-8, 28, 16);
      }
      ctx.font = 'bold 11px Segoe UI';
      ctx.fillStyle = (isCardHov || isCardDrag) ? COLOR.lineCard : labelColor;
      ctx.fillText(rel.card, cardX, cardY);
      if (rel.label) {
        const [lblX, lblY] = lpos.label;
        if (isLabelHov || isLabelDrag) {
          ctx.fillStyle = hexAlpha(COLOR.typeText, 0.2);
          ctx.fillRect(lblX-18, lblY-8, 36, 16);
        }
        ctx.font = '11px Segoe UI';
        ctx.fillStyle = (isLabelHov || isLabelDrag) ? COLOR.headerText : COLOR.typeText;
        ctx.fillText(rel.label, lblX, lblY);
      }
    }
  });
}

function drawNotes() {
  const TAB_H = NOTE_TAB_H;
  NOTES.forEach(n => {
    const nw = n.w || NOTE_W, nh = n.h || NOTE_H;
    const mode = n.mode || 'text';
    const color = n.color || '#f9e2af';
    // 편집 패널이 열린 노트는 이미 패널 border가 테두리 역할 → 캔버스 선 생략
    const isEditing = (typeof _editingNote !== 'undefined') && _editingNote === n;
    const isActive = !isEditing && (n === ctxTargetNote || hoveredNote === n || resizingNote === n);
    const r = 5;

    ctx.save();

    // ─ 그림자 + 노트 전체 도형 채우기 ─
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;

    // 노트 모양 path (모든 그리기의 clip 기준)
    ctx.beginPath();
    ctx.moveTo(n.x + r, n.y);
    ctx.lineTo(n.x + nw - r, n.y);
    ctx.quadraticCurveTo(n.x + nw, n.y,      n.x + nw, n.y + r);
    ctx.lineTo(n.x + nw, n.y + nh - r);
    ctx.quadraticCurveTo(n.x + nw, n.y + nh, n.x + nw - r, n.y + nh);
    ctx.lineTo(n.x + r, n.y + nh);
    ctx.quadraticCurveTo(n.x, n.y + nh,      n.x, n.y + nh - r);
    ctx.lineTo(n.x, n.y + r);
    ctx.quadraticCurveTo(n.x, n.y,            n.x + r, n.y);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    // clip to note shape
    ctx.clip();

    // ─ 탭 바 배경 ─
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(n.x, n.y, nw, TAB_H);

    // 활성 탭 하이라이트
    const halfW = nw / 2;
    const activeTabX = mode === 'text' ? n.x : n.x + halfW;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(activeTabX, n.y, halfW, TAB_H);

    // 탭 구분선 (수직)
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(n.x + halfW, n.y); ctx.lineTo(n.x + halfW, n.y + TAB_H);
    ctx.stroke();

    // 탭 바 하단 구분선 (수평)
    ctx.beginPath();
    ctx.moveTo(n.x, n.y + TAB_H); ctx.lineTo(n.x + nw, n.y + TAB_H);
    ctx.stroke();

    // 탭 라벨
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tLabels = ['Text', 'MD'];
    const tModes  = ['text', 'markdown'];
    tLabels.forEach((lbl, idx) => {
      const isAct = mode === tModes[idx];
      ctx.font = `${isAct ? 'bold ' : ''}${Math.max(9, 10)}px 'Segoe UI', sans-serif`;
      ctx.fillStyle = isAct ? '#11111b' : 'rgba(17,17,27,0.40)';
      ctx.fillText(lbl, n.x + halfW * (idx * 2 + 1) / 2, n.y + TAB_H / 2);
    });

    // ─ 컨텐츠 영역 ─
    // markdown 모드: DOM 오버레이(syncMarkdownOverlays)가 렌더링 담당 → 캔버스는 생략
    if (mode !== 'markdown') {
      const PAD = 8;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#11111b';
      ctx.font = '12px "Segoe UI", sans-serif';
      const displayText = n.text && n.text.trim() ? n.text : '(메모 없음)';
      const tlines = wrapNoteText(ctx, displayText, nw - PAD * 2, null);
      const lineH = 17;
      tlines.forEach((tl, i) => {
        const ly = n.y + TAB_H + PAD + i * lineH;
        if (ly + lineH > n.y + nh) return;
        ctx.fillText(tl, n.x + PAD, ly);
      });
    }

    ctx.restore();   // clip 해제

    // ─ 활성 테두리 ─
    if (isActive) {
      ctx.strokeStyle = COLOR.line; ctx.lineWidth = 2;
      drawRoundRect(n.x, n.y, nw, nh, r, null, COLOR.line);
    }

    // ─ 우하단 리사이즈 핸들 삼각형 ─
    if (isActive) {
      const hx = n.x + nw, hy = n.y + nh, hs = 10;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(hx - hs, hy); ctx.lineTo(hx, hy - hs); ctx.lineTo(hx, hy);
      ctx.closePath(); ctx.fill();
    }
  });
}

function wrapNoteText(c, text, maxW, maxLines) {
  const limit = maxLines != null ? Math.max(1, maxLines) : 999;
  const result = [];

  // ① 줄 내림 먼저 분리, ② 각 줄을 너비 기준으로 워드랩
  for (const inputLine of text.split('\n')) {
    if (result.length >= limit) break;

    if (inputLine === '') {          // 빈 줄 그대로 보존
      result.push(''); continue;
    }

    const words = inputLine.split(' ');
    let cur = '';
    for (const w of words) {
      if (result.length >= limit) break;
      const test = cur ? cur + ' ' + w : w;
      if (c.measureText(test).width > maxW && cur) {
        result.push(cur); cur = w;
      } else {
        cur = test;
      }
    }
    if (cur && result.length < limit) result.push(cur);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// MARKDOWN 엔진
// ══════════════════════════════════════════════════════════════

// 인라인 마크다운 → [{text, bold, italic, code, strike}]
function parseInlineMd(raw) {
  const segs = [];
  let i = 0;
  while (i < raw.length) {
    // ~~strike~~
    if (raw.startsWith('~~', i)) {
      const e = raw.indexOf('~~', i + 2);
      if (e !== -1) { segs.push({ text: raw.slice(i+2, e), strike:true }); i = e+2; continue; }
    }
    // **bold**
    if (raw.startsWith('**', i)) {
      const e = raw.indexOf('**', i + 2);
      if (e !== -1) { segs.push({ text: raw.slice(i+2, e), bold:true }); i = e+2; continue; }
    }
    // *italic*
    if (raw[i] === '*') {
      const e = raw.indexOf('*', i + 1);
      if (e !== -1) { segs.push({ text: raw.slice(i+1, e), italic:true }); i = e+1; continue; }
    }
    // `code`
    if (raw[i] === '`') {
      const e = raw.indexOf('`', i + 1);
      if (e !== -1) { segs.push({ text: raw.slice(i+1, e), code:true }); i = e+1; continue; }
    }
    // 일반 텍스트 누적
    let j = i + 1;
    while (j < raw.length && !raw.startsWith('~~',j) && !raw.startsWith('**',j) && raw[j] !== '*' && raw[j] !== '`') j++;
    const chunk = raw.slice(i, j);
    if (segs.length && !segs[segs.length-1].bold && !segs[segs.length-1].italic &&
        !segs[segs.length-1].code && !segs[segs.length-1].strike) {
      segs[segs.length-1].text += chunk;
    } else if (chunk) {
      segs.push({ text: chunk });
    }
    i = j;
  }
  return segs.length ? segs : [{ text: raw }];
}

// 세그먼트용 ctx.font 문자열
function _segFont(seg, baseSize, baseBold) {
  const b = seg.bold || baseBold;
  const it = seg.italic;
  const fam = seg.code ? 'Consolas, monospace' : "'Segoe UI', sans-serif";
  return `${it?'italic ':''}${b?'bold ':''}${baseSize}px ${fam}`;
}

// 세그먼트 배열을 maxW 안에서 토큰 단위 줄 바꿈
// 반환: [[seg,...], [seg,...], ...]
function wrapSegs(c, segs, baseSize, baseBold, maxW) {
  const tokens = [];
  segs.forEach(seg => {
    seg.text.split(/(\s+)/).forEach(part => {
      if (part !== '') tokens.push({ ...seg, text: part, _sp: /^\s+$/.test(part) });
    });
  });
  const lines = [];
  let cur = [], curW = 0;
  tokens.forEach(tok => {
    c.font = _segFont(tok, baseSize, baseBold);
    const tw = c.measureText(tok.text).width;
    if (!tok._sp && curW > 0 && curW + tw > maxW) {
      while (cur.length && cur[cur.length-1]._sp) cur.pop();
      if (cur.length) lines.push(cur);
      cur = tok._sp ? [] : [tok];
      curW = tok._sp ? 0 : tw;
    } else {
      cur.push(tok); curW += tw;
    }
  });
  while (cur.length && cur[cur.length-1]._sp) cur.pop();
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [[]];
}

// 세그먼트 배열을 캔버스에 그리기
function drawSegs(segs, x, y, baseSize, baseBold, color) {
  let cx = x;
  segs.forEach(seg => {
    ctx.font = _segFont(seg, baseSize, baseBold);
    ctx.fillStyle = seg.code ? '#905' : color;
    ctx.fillText(seg.text, cx, y);
    const tw = ctx.measureText(seg.text).width;
    if (seg.strike) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y + baseSize * 0.42); ctx.lineTo(cx + tw, y + baseSize * 0.42);
      ctx.stroke(); ctx.restore();
    }
    cx += tw;
  });
}

// 마크다운 블록 렌더링 (canvas clip 컨텍스트 안에서 호출)
function drawMarkdownContent(n, nw, nh) {
  const PAD = 8, TAB_H = NOTE_TAB_H;
  const maxW = nw - PAD * 2;
  const maxY = n.y + nh - PAD;

  ctx.save();
  ctx.beginPath();
  ctx.rect(n.x + 1, n.y + TAB_H + 1, nw - 2, nh - TAB_H - 2);
  ctx.clip();

  let cy = n.y + TAB_H + PAD;
  const rawLines = (n.text || '').split('\n');

  for (let li = 0; li < rawLines.length; li++) {
    if (cy >= maxY) break;
    const line = rawLines[li];

    // 빈 줄
    if (line.trim() === '') { cy += 7; continue; }

    // HR: --- 또는 ***
    if (/^[-*_]{3,}\s*$/.test(line)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(n.x+PAD, cy+5); ctx.lineTo(n.x+nw-PAD, cy+5); ctx.stroke();
      ctx.restore();
      cy += 13; continue;
    }

    // 블록 타입 파싱
    let content = line, fs = 12, bb = false, lh = 18, indent = 0, bulletDot = false;
    const mH1 = line.match(/^# (.+)/);
    const mH2 = line.match(/^## (.+)/);
    const mH3 = line.match(/^### (.+)/);
    const mBul = line.match(/^[-*+] (.+)/);
    const mOrd = line.match(/^(\d+)\. (.+)/);
    if      (mH1)  { content = mH1[1]; fs = 15; bb = true; lh = 21; }
    else if (mH2)  { content = mH2[1]; fs = 13; bb = true; lh = 19; }
    else if (mH3)  { content = mH3[1]; fs = 12; bb = true; lh = 18; }
    else if (mBul) { content = mBul[1]; bulletDot = '•'; indent = 12; lh = 17; }
    else if (mOrd) { content = mOrd[2]; bulletDot = mOrd[1]+'.'; indent = 16; lh = 17; }

    const segs = parseInlineMd(content);
    const wrappedLines = wrapSegs(ctx, segs, fs, bb, maxW - indent);

    wrappedLines.forEach((lineSegs, wi) => {
      if (cy >= maxY) return;
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      // 불릿/번호 첫 줄만
      if (wi === 0 && bulletDot) {
        ctx.font = `${fs}px 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#11111b';
        ctx.fillText(bulletDot, n.x + PAD, cy);
      }
      if (lineSegs.length > 0) {
        drawSegs(lineSegs, n.x + PAD + indent, cy, fs, bb, '#11111b');
      } else if (wi === 0) {
        // 빈 줄이지만 블록 타입 확인 후 렌더
        ctx.font = _segFont({}, fs, bb);
        ctx.fillStyle = '#11111b';
        ctx.fillText('', n.x + PAD + indent, cy);
      }
      cy += lh;
    });
  }
  ctx.restore();
}

function drawSectionShape(s, highlighted, isDrawing) {
  const pal = SECTION_PALETTE[(s.colorIdx ?? 0) % SECTION_PALETTE.length];
  const { x, y, w, h, name } = s;
  const r = 8;
  ctx.save();
  if (isDrawing) ctx.globalAlpha = 0.55;

  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = highlighted ? pal.bg.replace('0.07', '0.15') : pal.bg;
  ctx.fill();

  ctx.strokeStyle = pal.border;
  ctx.lineWidth = highlighted ? 2 : 1.5;
  ctx.setLineDash(isDrawing ? [8, 5] : []);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + SECTION_LABEL_H);
  ctx.lineTo(x, y + SECTION_LABEL_H);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = COLOR.sectionLabelBg;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y + SECTION_LABEL_H); ctx.lineTo(x + w, y + SECTION_LABEL_H);
  ctx.strokeStyle = pal.border + '55'; ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = pal.border;
  ctx.font = 'bold 12px Segoe UI, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const maxTxtW = w - 20;
  let txt = name || '새 섹션';
  while (txt.length > 1 && ctx.measureText(txt).width > maxTxtW) txt = txt.slice(0, -1);
  if (txt !== (name || '새 섹션')) txt += '…';
  ctx.fillText(txt, x + 10, y + SECTION_LABEL_H / 2);

  if (highlighted && !isDrawing) {
    const hs = 4;
    const pts = [
      [x, y],       [x + w / 2, y],  [x + w, y],
      [x, y + h / 2],                  [x + w, y + h / 2],
      [x, y + h],   [x + w / 2, y + h], [x + w, y + h],
    ];
    ctx.fillStyle = pal.border;
    ctx.strokeStyle = COLOR.bodyBg;
    ctx.lineWidth = 1;
    pts.forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.fill(); ctx.stroke();
    });
  }
  ctx.restore();
}

function drawSections() {
  SECTIONS.forEach(s => {
    drawSectionShape(s, s === hoveredSection || selectedSections.has(s), false);
  });
  if (drawingSection) {
    const { x, y, x2, y2 } = drawingSection;
    const sx = Math.min(x, x2), sy = Math.min(y, y2);
    const sw = Math.abs(x2 - x), sh = Math.abs(y2 - y);
    if (sw > 10 && sh > 10) {
      drawSectionShape({ x: sx, y: sy, w: sw, h: sh, name: '새 섹션', colorIdx: nextSectionColorIdx }, true, true);
    }
  }
}

// ── 마크다운 노트 DOM 오버레이 동기화 ──────────────────────────
// render() 끝에서 호출. marked.js 가 로드되면 full markdown, 아니면 placeholder.
function syncMarkdownOverlays() {
  const layer = document.getElementById('noteMarkdownLayer');
  if (!layer) return;

  // 기존 오버레이를 id 맵으로 수집
  const existing = {};
  Array.from(layer.children).forEach(el => { existing[el.dataset.noteId] = el; });

  const TAB_H = NOTE_TAB_H;
  const PAD   = 8;
  const activeIds = new Set();

  NOTES.forEach(n => {
    if ((n.mode || 'text') !== 'markdown') return;
    // 현재 편집 중인 노트는 편집 패널이 덮고 있으므로 오버레이 숨김
    if (typeof _editingNote !== 'undefined' && _editingNote === n) return;

    activeIds.add(n.id);

    const nw = n.w || NOTE_W, nh = n.h || NOTE_H;
    const sx  = Math.round(n.x  * scale + vx) + _qbLeftOff(); // 좌측 도킹 뷰포트 보정
    const sy  = Math.round(n.y  * scale + vy);
    const pw  = Math.round(nw   * scale);
    const ph  = Math.round(nh   * scale);
    const tbH = Math.round(TAB_H * scale);
    const pad = Math.round(PAD   * scale);
    const fs  = Math.round(12    * scale);

    let el = existing[n.id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'note-md-overlay';
      el.dataset.noteId = n.id;
      layer.appendChild(el);
    }

    // 캔버스 노트 컨텐츠 영역에 정확히 겹치도록 배치
    el.style.left   = (sx + 1)        + 'px';
    el.style.top    = (sy + tbH)       + 'px';
    el.style.width  = (pw - 2)         + 'px';
    el.style.height = (ph - tbH - 1)   + 'px';
    el.style.padding    = pad + 'px';
    el.style.fontSize   = fs  + 'px';
    el.style.borderRadius = '0 0 5px 5px';

    // 내용이 바뀐 경우에만 innerHTML 갱신 (성능)
    const raw = n.text || '';
    if (el.dataset.raw !== raw) {
      el.dataset.raw = raw;
      if (raw.trim()) {
        el.innerHTML = (typeof marked !== 'undefined')
          ? marked.parse(raw, { breaks: true, gfm: true })
          : `<pre style="white-space:pre-wrap;margin:0">${raw.replace(/</g,'&lt;')}</pre>`;
      } else {
        el.innerHTML = '<span class="md-placeholder">(메모 없음)</span>';
      }
    }
  });

  // 더 이상 markdown 모드가 아니거나 삭제된 노트의 오버레이 제거
  Object.keys(existing).forEach(id => {
    if (!activeIds.has(id)) layer.removeChild(existing[id]);
  });
}

// ── RAF 스케줄링 ─────────────────────────────────────────────────
// render()  : 다음 애니메이션 프레임에 실행 (중복 호출 자동 병합)
// renderNow(): 즉시 동기 실행 (타임라인 미리보기 등 즉각 반영 필요 시)
let _renderPending = false;
function render() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(() => { _renderPending = false; renderNow(); });
}

function renderNow() {
  const _qlOff = _qbLeftOff();
  canvas.style.marginLeft = _qlOff > 0 ? _qlOff + 'px' : '';
  canvas.width  = window.innerWidth - _qlOff - (panelOpen ? PANEL_W : 0);
  canvas.height = window.innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.strokeStyle = COLOR.gridColor; ctx.lineWidth = 0.5;
  const gridSize = 40 * scale;
  const offX = (vx % gridSize + gridSize) % gridSize;
  const offY = (vy % gridSize + gridSize) % gridSize;
  for (let gx = offX; gx < canvas.width; gx += gridSize) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
  }
  for (let gy = offY; gy < canvas.height; gy += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
  }
  ctx.restore();

  if (gridSnap) {
    ctx.save();
    ctx.strokeStyle = COLOR.snapGrid; ctx.lineWidth = 0.5;
    const gs = GRID * scale;
    const sox = (vx % gs + gs) % gs;
    const soy = (vy % gs + gs) % gs;
    for (let gx = sox; gx < canvas.width; gx += gs) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
    }
    for (let gy = soy; gy < canvas.height; gy += gs) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(vx, vy);
  ctx.scale(scale, scale);
  drawSections();
  drawNotes();
  drawRelations();
  ENTITIES.forEach(drawEntity);
  if (draggingRelPort) {
    const { x, y, curX, curY, targetEntity } = draggingRelPort;
    ctx.save();
    ctx.strokeStyle = COLOR.line; ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(curX, curY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.line; ctx.globalAlpha = 0.7; ctx.fill();
    if (targetEntity) {
      ctx.strokeStyle = COLOR.normalText; ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.55; ctx.setLineDash([]);
      ctx.strokeRect(targetEntity.x - 3, targetEntity.y - 3, W + 6, entityHeight(targetEntity) + 6);
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
  if (selectionBox) {
    const { x, y, x2, y2 } = selectionBox;
    const sx = Math.min(x, x2), sy = Math.min(y, y2);
    const sw = Math.abs(x2 - x), sh = Math.abs(y2 - y);
    ctx.fillStyle = COLOR.selFill;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = COLOR.line; ctx.lineWidth = 1; ctx.setLineDash([5,3]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);
  }
  ctx.restore();
  renderMinimap();
  syncMarkdownOverlays();   // 마크다운 노트 DOM 오버레이 위치/내용 동기화
  if (typeof updateStatusBar === 'function') updateStatusBar();
}

// ── 퀵바 좌측 도킹 시 캔버스 left 오프셋 ─────────────────────
function _qbLeftOff() {
  if (typeof _quickbarOpen === 'undefined' || !_quickbarOpen) return 0;
  if (typeof _qbDock === 'undefined' || _qbDock !== 'left')  return 0;
  return typeof _qbBarW === 'function' ? _qbBarW() : 42;
}

// ── 좌표 변환 / 거리 계산 ──────────────────────────────────────
function toWorld(cx, cy) {
  return { x: (cx - _qbLeftOff() - vx) / scale, y: (cy - vy) / scale };
}
function pointToSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── 뷰 제어 ────────────────────────────────────────────────────
function updateZoomLabel() {
  document.getElementById('zoomLabel').textContent = Math.round(scale * 100) + '%';
}
function zoom(factor) {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const wx = (cx - vx) / scale, wy = (cy - vy) / scale;
  scale = Math.max(0.3, Math.min(3, scale * factor));
  vx = cx - wx * scale; vy = cy - wy * scale;
  updateZoomLabel(); render();
}
function resetView() { scale = 1; vx = 40; vy = 40; updateZoomLabel(); render(); }
window.addEventListener('resize', render);

// ── 캔버스 이벤트 리스너 ─────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const w = toWorld(e.clientX, e.clientY);

  if (sectionMode) {
    drawingSection = { x: w.x, y: w.y, x2: w.x, y2: w.y };
    return;
  }

  selectedSection = null;
  const _prevSec = new Set(selectedSections);
  selectedSections.clear();
  // ① 메모 탭 바 클릭 → 탭 전환 (드래그/리사이즈보다 우선)
  const hitNtTab = !sectionMode ? hitTestNoteTab(w.x, w.y) : null;
  if (hitNtTab) {
    hitNtTab.note.mode = hitNtTab.mode;
    render(); saveState(); return;
  }
  // ② 메모 리사이즈 핸들
  const hitNtResize = hitTestNoteResize(w.x, w.y);
  if (hitNtResize && !sectionMode) {
    const nw = hitNtResize.w || NOTE_W, nh = hitNtResize.h || NOTE_H;
    resizingNote = hitNtResize;
    noteResizeStart = { wx: w.x, wy: w.y, w: nw, h: nh };
    canvas.style.cursor = 'nwse-resize';
    canvas.classList.add('dragging');
    render(); return;
  }
  // ③ 메모 본문 드래그
  const hitNt = hitTestNote(w.x, w.y);
  if (hitNt && !sectionMode) {
    draggingNote = hitNt;
    noteDragOffset = { x: w.x - hitNt.x, y: w.y - hitNt.y };
    canvas.classList.add('dragging');
    render(); return;
  }
  if (!e.shiftKey) {
    const hitPort = hitTestPort(w.x, w.y, null);
    if (hitPort) {
      hoveredPort = null;
      draggingRelPort = { entity: hitPort.entity, x: hitPort.x, y: hitPort.y, curX: w.x, curY: w.y, targetEntity: null };
      canvas.style.cursor = 'crosshair';
      canvas.classList.add('dragging');
      render(); return;
    }
  }

  const hitEnt = hitTest(w.x, w.y);
  if (hitEnt) {
    if (e.shiftKey) {
      if (selectedEntities.has(hitEnt.id)) selectedEntities.delete(hitEnt.id);
      else selectedEntities.add(hitEnt.id);
      render(); return;
    }
    if (selectedEntities.size > 1 && selectedEntities.has(hitEnt.id)) {
      _prevSec.forEach(s => selectedSections.add(s));
      selectedEntity = hitEnt;
      draggingEntity = hitEnt;
      dragOffset = { x: w.x - hitEnt.x, y: w.y - hitEnt.y };
      _didMove = false;
      canvas.classList.add('dragging');
      const idx = ENTITIES.indexOf(hitEnt);
      ENTITIES.splice(idx, 1); ENTITIES.push(hitEnt);
      render(); return;
    }
    selectedEntities.clear();
    selectedEntity = hitEnt;
    draggingEntity = hitEnt;
    dragOffset = { x: w.x - hitEnt.x, y: w.y - hitEnt.y };
    _didMove = false;
    canvas.classList.add('dragging');
    const idx = ENTITIES.indexOf(hitEnt);
    ENTITIES.splice(idx, 1); ENTITIES.push(hitEnt);
    render(); return;
  }
  const hitLbl = hitTestRelLabel(w.x, w.y);
  if (hitLbl) {
    const { rel, type } = hitLbl;
    const origOffset = type === 'card'
      ? { ...(rel.cardOffset  || { dx: 0, dy: 0 }) }
      : { ...(rel.labelOffset || { dx: 0, dy: 0 }) };
    draggingLabel = { rel, type, startWorld: { x: w.x, y: w.y }, origOffset };
    canvas.classList.add('dragging');
    canvas.style.cursor = 'move';
    render(); return;
  }
  const hitSeg = hitTestRelHandle(w.x, w.y);
  if (hitSeg) {
    const { rel, type, segIdx, wptFullIdx } = hitSeg;
    if (type === 'add') {
      insertBump(rel, segIdx); render(); saveState(); return;
    }
    if (type === 'seg' || type === 'wpt') initWpts(rel);
    draggingSegment = {
      rel, type, segIdx, wptFullIdx,
      origBend: rel.bend ? {
        wpts: rel.bend.wpts ? rel.bend.wpts.map(p=>[...p]) : null,
        fromFace: rel.bend.fromFace, fromPct: rel.bend.fromPct,
        toFace: rel.bend.toFace, toPct: rel.bend.toPct
      } : {},
      startWorld: { x: w.x, y: w.y }
    };
    _didMove = false;
    if (type === 'seg') {
      const path = getRelationPath(rel);
      if (path && path.waypoints[segIdx]) {
        const d = segDir(path.waypoints[segIdx], path.waypoints[segIdx+1]);
        canvas.style.cursor = d === 'H' ? 'ns-resize' : 'ew-resize';
      }
    } else if (type === 'wpt') { canvas.style.cursor = 'move'; }
    else { canvas.style.cursor = 'crosshair'; }
    return;
  }
  const hitSecResize = hitTestSectionResize(w.x, w.y);
  if (hitSecResize) {
    const { section, dir } = hitSecResize;
    selectedSection = section; selectedSections = new Set([section]);
    resizingSection = section;
    resizeDir = dir;
    resizeStart = { wx: w.x, wy: w.y, x: section.x, y: section.y, w: section.w, h: section.h };
    _didMove = false;
    canvas.style.cursor = resizeCursor(dir);
    render(); return;
  }
  const hitSec = hitTestSectionLabel(w.x, w.y);
  if (hitSec) {
    if (_prevSec.has(hitSec)) { _prevSec.forEach(s => selectedSections.add(s)); }
    else { selectedSections.add(hitSec); }
    selectedSection = hitSec;
    draggingSection = hitSec;
    sectionDragOffset = { x: w.x - hitSec.x, y: w.y - hitSec.y };
    _didMove = false;
    canvas.classList.add('dragging');
    render(); return;
  }
  selectedEntity = null;
  if (!e.shiftKey && !e.ctrlKey) selectedEntities.clear();
  if (e.shiftKey) {
    selectionBox = { x: w.x, y: w.y, x2: w.x, y2: w.y };
    canvas.style.cursor = 'crosshair';
  } else if (e.ctrlKey) {
    drawingSection = { x: w.x, y: w.y, x2: w.x, y2: w.y };
    canvas.style.cursor = 'crosshair';
  } else {
    panStart = { x: e.clientX - _qbLeftOff() - vx, y: e.clientY - vy };
  }
  canvas.classList.add('dragging');
});

canvas.addEventListener('mousemove', e => {
  const w = toWorld(e.clientX, e.clientY);

  if (drawingSection) {
    drawingSection.x2 = w.x; drawingSection.y2 = w.y;
    render(); return;
  }
  if (draggingRelPort) {
    draggingRelPort.curX = w.x; draggingRelPort.curY = w.y;
    const tgt = hitTest(w.x, w.y);
    draggingRelPort.targetEntity = (tgt && tgt !== draggingRelPort.entity) ? tgt : null;
    canvas.style.cursor = draggingRelPort.targetEntity ? 'copy' : 'crosshair';
    const tt = document.getElementById('erdTooltip');
    if (tt) tt.style.display = 'none';
    render(); return;
  }
  if (resizingSection) {
    const dx = w.x - resizeStart.wx, dy = w.y - resizeStart.wy;
    const MIN_W = 100, MIN_H = SECTION_LABEL_H + 20;
    let { x: rx, y: ry, w: rw, h: rh } = resizeStart;
    if (resizeDir.includes('e')) rw = Math.max(MIN_W, rw + dx);
    if (resizeDir.includes('s')) rh = Math.max(MIN_H, rh + dy);
    if (resizeDir.includes('w')) { const nw = Math.max(MIN_W, rw - dx); rx = rx + rw - nw; rw = nw; }
    if (resizeDir.includes('n')) { const nh = Math.max(MIN_H, rh - dy); ry = ry + rh - nh; rh = nh; }
    resizingSection.x = rx; resizingSection.y = ry;
    resizingSection.w = rw; resizingSection.h = rh;
    _didMove = true;
    canvas.style.cursor = resizeCursor(resizeDir);
    render(); return;
  }
  if (draggingSection) {
    const newX = w.x - sectionDragOffset.x;
    const newY = w.y - sectionDragOffset.y;
    const dx = newX - draggingSection.x, dy = newY - draggingSection.y;
    selectedSections.forEach(s => { s.x += dx; s.y += dy; });
    if (!selectedSections.has(draggingSection)) { draggingSection.x = newX; draggingSection.y = newY; }
    selectedEntities.forEach(id => {
      const ent = ENTITIES.find(en => en.id === id);
      if (ent) { ent.x += dx; ent.y += dy; }
    });
    // 양쪽 엔티티가 모두 선택된 관계선의 중간 포인트도 함께 이동
    RELATIONS.forEach(rel => {
      if (selectedEntities.has(rel.from) && selectedEntities.has(rel.to) && rel.bend?.wpts?.length) {
        rel.bend.wpts.forEach(p => { p[0] += dx; p[1] += dy; });
      }
    });
    _didMove = true;
    render(); return;
  }
  if (draggingEntity) {
    const newX = w.x - dragOffset.x;
    const newY = w.y - dragOffset.y;
    if (selectedEntities.size > 1 && selectedEntities.has(draggingEntity.id)) {
      const dx = newX - draggingEntity.x, dy = newY - draggingEntity.y;
      selectedEntities.forEach(id => {
        const ent = ENTITIES.find(en => en.id === id);
        if (ent) { ent.x += dx; ent.y += dy; }
      });
      selectedSections.forEach(s => { s.x += dx; s.y += dy; });
      // 양쪽 엔티티가 모두 선택된 관계선의 중간 포인트도 함께 이동
      RELATIONS.forEach(rel => {
        if (selectedEntities.has(rel.from) && selectedEntities.has(rel.to) && rel.bend?.wpts?.length) {
          rel.bend.wpts.forEach(p => { p[0] += dx; p[1] += dy; });
        }
      });
    } else {
      draggingEntity.x = newX;
      draggingEntity.y = newY;
    }
    _didMove = true;
    render(); return;
  }
  if (draggingSegment) {
    const { rel, type, segIdx, wptFullIdx, origBend, startWorld } = draggingSegment;
    const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
    if (!rel.bend) rel.bend = {};
    if (type === 'seg') {
      applyRelSegDrag(rel, segIdx, origBend, dx, dy);
    } else if (type === 'wpt') {
      applyRelWptDrag(rel, wptFullIdx, origBend, dx, dy);
    } else if (type === 'from') {
      const em = entityMap();
      const entA = em[rel.from], entB = em[rel.to];
      if (entA) {
        const snap = snapToEntityFace(entA, w.x, w.y);
        if (!rel.bend) rel.bend = {};
        rel.bend.fromFace = snap.face; rel.bend.fromPct = snap.pct;
        if (!rel.bend.toFace && entB) {
          const base = computeOrthogonalPath(entA, entB);
          const bh = entityHeight(entB); const wp3 = base.waypoints[3];
          rel.bend.toFace = detFace(entB, wp3, bh); rel.bend.toPct = facePct(entB, rel.bend.toFace, wp3, bh);
        }
        delete rel.bend.fromOff;
      }
    } else if (type === 'to') {
      const em = entityMap();
      const entA = em[rel.from], entB = em[rel.to];
      if (entB) {
        const snap = snapToEntityFace(entB, w.x, w.y);
        if (!rel.bend) rel.bend = {};
        rel.bend.toFace = snap.face; rel.bend.toPct = snap.pct;
        if (!rel.bend.fromFace && entA) {
          const base = computeOrthogonalPath(entA, entB);
          const ah = entityHeight(entA); const wp0 = base.waypoints[0];
          rel.bend.fromFace = detFace(entA, wp0, ah); rel.bend.fromPct = facePct(entA, rel.bend.fromFace, wp0, ah);
        }
        delete rel.bend.toOff;
      }
    }
    _didMove = true;
    render(); return;
  }
  if (resizingNote) {
    const dx = w.x - noteResizeStart.wx, dy = w.y - noteResizeStart.wy;
    resizingNote.w = Math.max(80, noteResizeStart.w + dx);
    resizingNote.h = Math.max(50, noteResizeStart.h + dy);
    canvas.style.cursor = 'nwse-resize';
    render(); return;
  }
  if (draggingNote) {
    draggingNote.x = w.x - noteDragOffset.x;
    draggingNote.y = w.y - noteDragOffset.y;
    render(); return;
  }
  if (draggingLabel) {
    const { rel, type, startWorld, origOffset } = draggingLabel;
    const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
    if (type === 'card') rel.cardOffset  = { dx: origOffset.dx + dx, dy: origOffset.dy + dy };
    else                 rel.labelOffset = { dx: origOffset.dx + dx, dy: origOffset.dy + dy };
    render(); return;
  }
  if (selectionBox) {
    selectionBox.x2 = w.x; selectionBox.y2 = w.y;
    render(); return;
  }
  if (panStart) {
    vx = e.clientX - _qbLeftOff() - panStart.x;
    vy = e.clientY - panStart.y;
    render(); return;
  }

  const hitEnt = hitTest(w.x, w.y);
  const hitPort = hitEnt ? hitTestPort(w.x, w.y, null) : null;
  const hitSeg = hitEnt ? null : hitTestRelHandle(w.x, w.y);
  const noEntRel = !hitEnt && !hitSeg;
  const hitSecResize = noEntRel ? hitTestSectionResize(w.x, w.y) : null;
  const hitSec = (noEntRel && !hitSecResize) ? hitTestSectionLabel(w.x, w.y) : null;
  const hitLblHov = (!hitEnt && !hitSeg) ? hitTestRelLabel(w.x, w.y) : null;
  const hitNtResize = noEntRel ? hitTestNoteResize(w.x, w.y) : null;

  if (sectionMode)        canvas.style.cursor = 'crosshair';
  else if (hitPort)       canvas.style.cursor = 'crosshair';
  else if (hitEnt)        canvas.style.cursor = 'grab';
  else if (hitLblHov)     canvas.style.cursor = 'move';
  else if (hitSeg) {
    if (hitSeg.type === 'add') canvas.style.cursor = 'cell';
    else if (hitSeg.type === 'seg') {
      const path = getRelationPath(hitSeg.rel);
      if (path && path.waypoints[hitSeg.segIdx]) {
        canvas.style.cursor = segDir(path.waypoints[hitSeg.segIdx], path.waypoints[hitSeg.segIdx+1]) === 'H' ? 'ns-resize' : 'ew-resize';
      } else canvas.style.cursor = 'default';
    } else if (hitSeg.type === 'wpt') canvas.style.cursor = 'move';
    else canvas.style.cursor = 'crosshair';
  }
  else if (hitNtResize)                             canvas.style.cursor = 'nwse-resize';
  else if (hitTestNoteTab(w.x, w.y))                canvas.style.cursor = 'pointer';
  else if (hitSecResize)                             canvas.style.cursor = resizeCursor(hitSecResize.dir);
  else if (hitSec)                                   canvas.style.cursor = 'grab';
  else                                               canvas.style.cursor = 'default';

  const prevEnt = hoveredEntity, prevRelRef = hoveredRelSeg?.rel ?? null, prevSec = hoveredSection;
  const prevLbl = hoveredLabel;
  const prevNote = hoveredNote;
  const prevPort = hoveredPort;
  hoveredEntity  = hitEnt;
  hoveredRelSeg  = hitSeg;
  hoveredSection = hitSec || (hitSecResize?.section ?? null);
  hoveredLabel   = hitLblHov;
  hoveredNote    = (!hitEnt && !hitSeg) ? hitTestNote(w.x, w.y) : null;
  hoveredPort    = hitPort || null;
  updateTooltip(e.clientX, e.clientY, w.x, w.y, hitPort ? null : hitEnt);
  const sbCoords = document.getElementById('sb-coords');
  if (sbCoords) sbCoords.textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
  if (hoveredEntity !== prevEnt || (hoveredRelSeg?.rel ?? null) !== prevRelRef || hoveredSection !== prevSec || hoveredLabel !== prevLbl || hoveredNote !== prevNote || hoveredPort !== prevPort) render();
});

canvas.addEventListener('mouseleave', () => {
  const tt = document.getElementById('erdTooltip');
  if (tt) tt.style.display = 'none';
});

canvas.addEventListener('dblclick', e => {
  const w = toWorld(e.clientX, e.clientY);

  // 메모 본문 더블클릭 → 편집 (탭 바 영역 제외)
  const hitNt = hitTestNote(w.x, w.y);
  if (hitNt && w.y > hitNt.y + NOTE_TAB_H) {
    e.stopImmediatePropagation();
    showNoteEdit(hitNt);
    return;
  }

  const hitEnt = hitTest(w.x, w.y);
  if (!hitEnt) return;
  if (w.y >= hitEnt.y && w.y <= hitEnt.y + HEADER_H) {
    e.stopImmediatePropagation();
    if (collapsedEntities.has(hitEnt.id)) collapsedEntities.delete(hitEnt.id);
    else collapsedEntities.add(hitEnt.id);
    flushCurrentState();
    render();
  }
});

canvas.addEventListener('mouseup', e => {
  if (draggingRelPort) {
    const { entity: fromEnt, targetEntity } = draggingRelPort;
    draggingRelPort = null; hoveredPort = null;
    canvas.style.cursor = ''; canvas.classList.remove('dragging');
    render();
    if (targetEntity) openAddRelationModal(fromEnt.id, targetEntity.id);
    return;
  }
  if (drawingSection) {
    const { x, y, x2, y2 } = drawingSection;
    drawingSection = null;
    const sx = Math.min(x, x2), sy = Math.min(y, y2);
    const sw = Math.abs(x2 - x), sh = Math.abs(y2 - y);
    if (sw > 60 && sh > 40) {
      const sec = { id: makeSectionId(), name: '', x: sx, y: sy, w: sw, h: sh, colorIdx: nextSectionColorIdx };
      nextSectionColorIdx = (nextSectionColorIdx + 1) % SECTION_PALETTE.length;
      SECTIONS.push(sec);
      render();
      showSectionNameInput(sec);
    } else {
      render();
    }
    return;
  }
  if (draggingLabel) {
    draggingLabel = null;
    canvas.style.cursor = '';
    canvas.classList.remove('dragging');
    saveState(); return;
  }
  if (resizingNote) { resizingNote = null; noteResizeStart = null; canvas.style.cursor = ''; canvas.classList.remove('dragging'); saveState(); return; }
  if (draggingNote) { draggingNote = null; canvas.classList.remove('dragging'); saveState(); return; }
  const wasDragging = _didMove && (draggingEntity || draggingSegment || draggingSection || resizingSection);
  if (gridSnap && draggingEntity) {
    draggingEntity.x = Math.round(draggingEntity.x / GRID) * GRID;
    draggingEntity.y = Math.round(draggingEntity.y / GRID) * GRID;
  }
  if (gridSnap && selectedEntities.size > 1) {
    selectedEntities.forEach(id => {
      const ent = ENTITIES.find(en => en.id === id);
      if (ent) { ent.x = Math.round(ent.x / GRID) * GRID; ent.y = Math.round(ent.y / GRID) * GRID; }
    });
  }
  if (selectionBox) {
    const { x, y, x2, y2 } = selectionBox;
    const sx = Math.min(x, x2), sy = Math.min(y, y2);
    const ex2 = Math.max(x, x2), ey2 = Math.max(y, y2);
    const boxW = ex2 - sx, boxH = ey2 - sy;
    if (boxW > 10 && boxH > 10) {
      ENTITIES.forEach(ent => {
        const eh = entityHeight(ent);
        if (ent.x >= sx && ent.x + W <= ex2 && ent.y >= sy && ent.y + eh <= ey2) {
          selectedEntities.add(ent.id);
        }
      });
      SECTIONS.forEach(s => {
        if (s.x >= sx && s.x + s.w <= ex2 && s.y >= sy && s.y + s.h <= ey2) {
          selectedSections.add(s);
        }
      });
      selectedSection = selectedSections.size === 1 ? [...selectedSections][0] : null;
    }
    selectionBox = null;
  }
  if (draggingSegment && (draggingSegment.type === 'seg' || draggingSegment.type === 'wpt')) {
    straightenWpts(draggingSegment.rel);
    collapseCollinearWpts(draggingSegment.rel);
  }
  draggingEntity = null; draggingSegment = null; draggingSection = null;
  resizingSection = null; resizeDir = null; resizeStart = null;
  panStart = null;
  canvas.classList.remove('dragging');
  render();
  if (wasDragging) setTimeout(saveState, 0);
});

canvas.addEventListener('mouseleave', () => {
  if (drawingSection) { drawingSection = null; render(); }
  draggingEntity = null; draggingSegment = null; draggingSection = null;
  draggingNote = null; hoveredNote = null;
  resizingNote = null; noteResizeStart = null;
  draggingLabel = null; hoveredLabel = null;
  draggingRelPort = null; hoveredPort = null;
  resizingSection = null; resizeDir = null; resizeStart = null;
  panStart = null; selectionBox = null;
  canvas.classList.remove('dragging');
  hoveredEntity = null; hoveredRelSeg = null; hoveredSection = null;
  canvas.style.cursor = sectionMode ? 'crosshair' : 'default'; render();
});

canvas.addEventListener('dblclick', e => {
  const w = toWorld(e.clientX, e.clientY);
  const hitEnt = hitTest(w.x, w.y);
  if (hitEnt) { selectedEntity = hitEnt; openEditEntityModal(hitEnt); return; }
  const hitLbl = hitTestRelLabel(w.x, w.y);
  if (hitLbl) {
    if (hitLbl.type === 'card') { delete hitLbl.rel.cardOffset; render(); saveState(); return; }
    showRelLabelInlineEdit(hitLbl.rel); return;
  }
  const hitNt2 = hitTestNote(w.x, w.y);
  if (hitNt2) { showNoteEdit(hitNt2); return; }
  const hitSeg = hitTestRelHandle(w.x, w.y);
  if (hitSeg?.type === 'wpt') {
    const { rel, wptFullIdx } = hitSeg;
    if (rel.bend?.wpts) {
      rel.bend.wpts.splice(wptFullIdx - 1, 1);
      if (rel.bend.wpts.length === 0) rel.bend.wpts = null;
      render(); saveState(); return;
    }
  }
  if (hitSeg) {
    if (hitSeg.rel.bend) { hitSeg.rel.bend = null; render(); saveState(); return; }
    openEditRelationModal(hitSeg.rel); return;
  }
  const hitRel = hitTestRelation(w.x, w.y);
  if (hitRel) { openEditRelationModal(hitRel); return; }
  const hitSec = hitTestSectionLabel(w.x, w.y);
  if (hitSec) { showSectionNameInput(hitSec); return; }
  if (!sectionMode) openAddEntityModal();
});

let ctxLastWorld = { x: 0, y: 0 };
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const w = toWorld(e.clientX, e.clientY);
  ctxLastWorld = { x: w.x, y: w.y };
  const hitEnt = hitTest(w.x, w.y);
  const hitRel = !hitEnt ? hitTestRelation(w.x, w.y) : null;
  const hitSec = !hitEnt && !hitRel ? hitTestSectionLabel(w.x, w.y) : null;
  const hitNt  = !hitEnt && !hitRel && !hitSec ? hitTestNote(w.x, w.y) : null;
  ctxTargetSection = null; ctxTargetNote = null;
  if (hitEnt)      { ctxTargetEntity = hitEnt;  ctxTargetRelation = null; showCtxMenu(e.clientX, e.clientY, 'entity'); }
  else if (hitRel) { ctxTargetEntity = null; ctxTargetRelation = hitRel; showCtxMenu(e.clientX, e.clientY, 'relation'); }
  else if (hitSec) { ctxTargetEntity = null; ctxTargetRelation = null; ctxTargetSection = hitSec; selectedSection = hitSec; selectedSections = new Set([hitSec]); render(); showCtxMenu(e.clientX, e.clientY, 'section'); }
  else if (hitNt)  { ctxTargetEntity = null; ctxTargetRelation = null; ctxTargetNote = hitNt; showCtxMenu(e.clientX, e.clientY, 'note'); }
  else             { ctxTargetEntity = null; ctxTargetRelation = null; showCtxMenu(e.clientX, e.clientY, 'canvas'); }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta  = e.deltaY > 0 ? 0.9 : 1.1;
  const qbOff  = _qbLeftOff();
  const wx = (e.clientX - qbOff - vx) / scale, wy = (e.clientY - vy) / scale;
  scale = Math.max(0.3, Math.min(3, scale * delta));
  vx = (e.clientX - qbOff) - wx * scale; vy = e.clientY - wy * scale;
  updateZoomLabel();
  render();
}, { passive: false });

let lastTouch = null;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const w = toWorld(t.clientX, t.clientY);
    const hit = hitTest(w.x, w.y);
    if (hit) { draggingEntity = hit; dragOffset = { x: w.x - hit.x, y: w.y - hit.y }; }
    else     { const qo = _qbLeftOff(); panStart = { x: t.clientX - qo - vx, y: t.clientY - vy }; }
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const w = toWorld(t.clientX, t.clientY);
    if (draggingEntity) { draggingEntity.x = w.x - dragOffset.x; draggingEntity.y = w.y - dragOffset.y; }
    else if (panStart)  { vx = (t.clientX - _qbLeftOff()) - panStart.x; vy = t.clientY - panStart.y; }
    render();
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => { draggingEntity = null; panStart = null; });
