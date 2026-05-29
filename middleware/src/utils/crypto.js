const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const { loadOrCreateKey } = require('./keystore');
let KEY;
try {
  KEY = loadOrCreateKey();
} catch (err) {
  throw new Error(`[UXERManager] 암호화 키 초기화 실패: ${err.message}`);
}
const LEGACY_KEY = Buffer.from('uxermanager-local-secret-key-32b', 'utf8');

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  });
}

function decrypt(encryptedJson) {
  const { iv, tag, data } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
}

function decryptLegacy(encryptedJson) {
  const { iv, tag, data } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv('aes-256-gcm', LEGACY_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt, decryptLegacy };
