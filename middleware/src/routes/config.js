const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { encrypt, decrypt } = require('../utils/crypto');
const { getAdapter } = require('../db/connector');

const CONFIG_DIR = path.join(os.homedir(), '.uxermanager');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!raw.password) return raw;
  return { ...raw, password: decrypt(raw.password) };
}

// GET /config - 접속정보 조회 (비밀번호 마스킹)
router.get('/', (req, res) => {
  const config = loadConfig();
  if (!config) return res.json({ configured: false });
  res.json({
    configured: true,
    dbType: config.dbType,
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: '••••••••'
  });
});

// POST /config - 접속정보 저장
router.post('/', (req, res) => {
  const { dbType, host, port, database, username, password } = req.body;
  if (!dbType || !host || !database || !username || !password) {
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  }
  ensureConfigDir();
  const config = {
    dbType,
    host,
    port: port || getDefaultPort(dbType),
    database,
    username,
    password: encrypt(password),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  res.json({ ok: true, message: '접속정보가 저장되었습니다.' });
});

// POST /config/test - 접속 테스트
router.post('/test', async (req, res) => {
  const { dbType, host, port, database, username, password } = req.body;
  if (!dbType || !host || !database || !username || !password) {
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  }
  try {
    const adapter = getAdapter(dbType);
    await adapter.test({ dbType, host, port: port || getDefaultPort(dbType), database, username, password });
    res.json({ ok: true, message: '연결 성공' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

function getDefaultPort(dbType) {
  return { postgres: 5432, mysql: 3306, mssql: 1433 }[dbType] || 5432;
}

module.exports = router;
module.exports.loadConfig = loadConfig;
