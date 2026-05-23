// ══════════════════════════════════════════════════════════════════
// OffscreenCanvas Worker — 미니맵 렌더링
// 메인 스레드로부터 직렬화된 상태를 받아 OffscreenCanvas에 그린 뒤
// ImageBitmap으로 전송 → 메인 스레드의 미니맵 canvas에 합성
// ══════════════════════════════════════════════════════════════════

self.onmessage = function (e) {
  if (e.data.type !== 'render') return;

  const {
    entities, relWaypoints,
    vx, vy, scale,
    canvasW, canvasH,
    W, HEADER_H, ROW_H,
    colors
  } = e.data;

  const MW = 196, MH = 120, MPAD = 10;
  const offscreen = new OffscreenCanvas(MW, MH);
  const ctx = offscreen.getContext('2d');
  ctx.clearRect(0, 0, MW, MH);

  if (!entities.length) {
    const bitmap = offscreen.transferToImageBitmap();
    self.postMessage({ type: 'frame', bitmap }, [bitmap]);
    return;
  }

  // 바운딩 박스 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  entities.forEach(ent => {
    const h = HEADER_H + (ent.collapsed ? 0 : ent.attrCount * ROW_H);
    minX = Math.min(minX, ent.x); minY = Math.min(minY, ent.y);
    maxX = Math.max(maxX, ent.x + W); maxY = Math.max(maxY, ent.y + h);
  });

  const pad    = 40;
  const bw     = maxX - minX + pad * 2;
  const bh     = maxY - minY + pad * 2;
  const mscale = Math.min((MW - MPAD * 2) / bw, (MH - MPAD * 2) / bh);
  const offX   = pad - minX;
  const offY   = pad - minY;
  const tx = x => (x + offX) * mscale + MPAD;
  const ty = y => (y + offY) * mscale + MPAD;

  // 관계선
  ctx.strokeStyle = colors.rel; ctx.lineWidth = 1;
  relWaypoints.forEach(wp => {
    if (!wp || wp.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(tx(wp[0][0]), ty(wp[0][1]));
    for (let i = 1; i < wp.length; i++) ctx.lineTo(tx(wp[i][0]), ty(wp[i][1]));
    ctx.stroke();
  });

  // 엔티티 박스
  entities.forEach(ent => {
    const h = HEADER_H + (ent.collapsed ? 0 : ent.attrCount * ROW_H);
    ctx.fillStyle = colors.body;
    ctx.fillRect(tx(ent.x), ty(ent.y), W * mscale, h * mscale);
    // 헤더
    ctx.fillStyle = colors.header;
    ctx.fillRect(tx(ent.x), ty(ent.y), W * mscale, HEADER_H * mscale);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 0.5;
    ctx.strokeRect(tx(ent.x), ty(ent.y), W * mscale, h * mscale);
  });

  // 현재 뷰포트
  const vpX = -vx / scale, vpY = -vy / scale;
  const vpW = canvasW / scale, vpH = canvasH / scale;
  ctx.strokeStyle = colors.viewport; ctx.lineWidth = 1.5;
  ctx.strokeRect(tx(vpX), ty(vpY), vpW * mscale, vpH * mscale);

  const bitmap = offscreen.transferToImageBitmap();
  self.postMessage({ type: 'frame', bitmap }, [bitmap]);
};
