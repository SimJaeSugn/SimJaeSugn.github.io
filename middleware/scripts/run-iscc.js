const { execSync } = require('child_process');
const fs = require('fs');

const candidates = [
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
];

function findIscc() {
  // 1. PATH에서 탐색
  try {
    execSync('iscc /?', { stdio: 'ignore' });
    return 'iscc';
  } catch (_) {}

  // 2. 기본 설치 경로에서 탐색
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const iscc = findIscc();
if (!iscc) {
  console.error('[오류] Inno Setup이 설치되지 않았습니다.');
  console.error('  https://jrsoftware.org/isinfo.php 에서 설치 후 다시 실행하세요.');
  process.exit(1);
}

try {
  execSync(`"${iscc}" installer.iss`, { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}
