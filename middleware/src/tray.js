const zlib = require('zlib');
const path = require('path');
const os = require('os');
const fs = require('fs');

// pkg 번들 실행 시 base64 임베드 바이너리를 tmpdir로 추출
// (pkg 가상 FS는 실행 불가 → 실제 FS에 써야 spawn 가능)
function _prepTrayBin() {
  if (!process.pkg || process.platform !== 'win32') return;

  const binName = 'tray_windows_release.exe';
  const dstDir = path.join(os.tmpdir(), 'traybin');
  const dstBin = path.join(dstDir, binName);

  if (!fs.existsSync(dstBin)) {
    fs.mkdirSync(dstDir, { recursive: true });
    const b64 = require('./tray_win_bin'); // base64-encoded exe
    fs.writeFileSync(dstBin, Buffer.from(b64, 'base64'));
  }

  // copyDir:true 시 systray2가 fse.copy로 snapshot→tmpdir 복사 시도하는 것을 차단
  try {
    const fse = require('fs-extra');
    const orig = fse.copy.bind(fse);
    fse.copy = (src, dst, opts) => {
      if (src.includes('systray2') && src.includes('traybin')) return Promise.resolve();
      return orig(src, dst, opts);
    };
  } catch (_) {}
}

_prepTrayBin();
const SysTray = require('systray2').default;

// 16x16 PNG 아이콘을 zlib(내장)으로 생성 — 외부 의존성 없음
function _createIconBuffer() {
  const W = 16, H = 16;

  function crc32(buf) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }

  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    for (let x = 0; x < W; x++) {
      // 파란색 #1e6bc8
      row[1 + x * 3] = 30; row[1 + x * 3 + 1] = 107; row[1 + x * 3 + 2] = 200;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG sig
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function setupTray(port) {
  const iconPath = path.join(os.tmpdir(), 'uxermanager_icon.png');
  try { fs.writeFileSync(iconPath, _createIconBuffer()); } catch (_) {}

  const tray = new SysTray({
    menu: {
      icon: iconPath,
      title: '',
      tooltip: `UXERManager 미들웨어`,
      items: [
        { title: `UXERManager v1.0.0`, tooltip: '', enabled: false, name: 'info' },
        { title: `포트 ${port}에서 실행 중`, tooltip: '', enabled: false, name: 'port' },
        SysTray.separator,
        { title: '종료', tooltip: '미들웨어를 종료합니다', enabled: true, name: 'quit' }
      ]
    },
    debug: false,
    copyDir: true  // pkg 호환: 트레이 헬퍼 바이너리를 임시 디렉토리로 추출
  });

  tray.onClick(action => {
    if (action.item.name === 'quit') {
      tray.kill();
      process.exit(0);
    }
  });

  return tray;
}

module.exports = { setupTray };
