const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEY_DIR  = path.join(os.homedir(), '.uxermanager');
const KEY_FILE = path.join(KEY_DIR, 'key');

function loadOrCreateKey() {
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  return key;
}

module.exports = { loadOrCreateKey };
