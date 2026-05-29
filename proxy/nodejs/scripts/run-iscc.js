const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ISCC_PATHS = [
  'iscc',
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files (x86)\\Inno Setup 7\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 7\\ISCC.exe',
];

const iss = path.join(__dirname, '..', 'installer.iss');

let iscc = null;
for (const p of ISCC_PATHS) {
  try {
    execSync(`"${p}" /?`, { stdio: 'ignore' });
    iscc = p;
    break;
  } catch (_) {
    if (p !== 'iscc' && fs.existsSync(p)) { iscc = p; break; }
  }
}

if (!iscc) {
  console.error('Inno Setup(iscc)를 찾을 수 없습니다. 설치 후 재시도하세요.');
  process.exit(1);
}

console.log(`iscc: ${iscc}`);
execSync(`"${iscc}" "${iss}"`, { stdio: 'inherit' });
