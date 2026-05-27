const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { encrypt, decrypt, decryptLegacy } = require('../utils/crypto');
const { getAdapter, closeAllPools } = require('../db/connector');

const CONFIG_DIR = path.join(os.homedir(), '.uxermanager');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// ---- 스토어 캐시 (전체 store 객체) ----
let _storeCache = null;
// ---- 활성 프로파일 평문 캐시 ----
let _activeConfigCache = null;

function invalidateCache() {
  _storeCache = null;
  _activeConfigCache = null;
}

// ---- store I/O ----

function loadRawStore() {
  if (_storeCache) return _storeCache;
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  // 구버전 단일 객체 자동 마이그레이션
  if (!raw.profiles) {
    const migrated = {
      profiles: [{ name: '기본', ...raw }],
      active: '기본'
    };
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2), 'utf8');
    _storeCache = migrated;
    return migrated;
  }

  _storeCache = raw;
  return raw;
}

function saveStore(store) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2), 'utf8');
  invalidateCache();
}

// ---- 활성 프로파일 평문 반환 (기존 loadConfig 시그니처 유지) ----

function loadConfig() {
  if (_activeConfigCache) return _activeConfigCache;
  const store = loadRawStore();
  if (!store) return null;

  const profile = store.profiles.find(p => p.name === store.active);
  if (!profile) return null;

  if (!profile.password) {
    _activeConfigCache = { ...profile };
    return _activeConfigCache;
  }

  let password;
  try {
    password = decrypt(profile.password);
  } catch (_) {
    try {
      password = decryptLegacy(profile.password);
      // 레거시 키 마이그레이션: 해당 프로파일의 암호화 갱신
      const idx = store.profiles.findIndex(p => p.name === store.active);
      if (idx !== -1) {
        store.profiles[idx] = {
          ...store.profiles[idx],
          password: encrypt(password),
          updatedAt: new Date().toISOString()
        };
        saveStore(store);
      }
    } catch (_2) {
      return null;
    }
  }

  _activeConfigCache = { ...profile, password };
  return _activeConfigCache;
}

function getDefaultPort(dbType) {
  const PORTS = { postgres: 5432, mysql: 3306, mssql: 1433, oracle: 1521 };
  return PORTS[dbType] ?? null;
}

// ---- GET /config — 기존 응답 구조 유지 ----
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

// ---- POST /config — 활성 프로파일 덮어쓰기 (기존 요청 구조 유지) ----
router.post('/', async (req, res) => {
  const { dbType, host, port, database, username, password } = req.body;
  if (!dbType || !host || !database || !username || !password) {
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  }

  let store = loadRawStore();
  if (!store) {
    store = { profiles: [], active: '기본' };
  }

  const activeName = store.active;
  const idx = store.profiles.findIndex(p => p.name === activeName);
  const updated = {
    name: activeName,
    dbType,
    host,
    port: port || getDefaultPort(dbType),
    database,
    username,
    password: encrypt(password),
    updatedAt: new Date().toISOString()
  };

  if (idx !== -1) {
    store.profiles[idx] = updated;
  } else {
    store.profiles.push(updated);
  }

  saveStore(store);
  await closeAllPools();
  res.json({ ok: true, message: '접속정보가 저장되었습니다.' });
});

// ---- POST /config/test — 변경 없음 ----
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

// ---- GET /config/profiles — 전체 목록 (비밀번호 마스킹) ----
router.get('/profiles', (req, res) => {
  const store = loadRawStore();
  if (!store) return res.json({ active: null, profiles: [] });

  const masked = store.profiles.map(p => ({
    ...p,
    password: p.password ? '••••••••' : ''
  }));

  res.json({ active: store.active, profiles: masked });
});

// ---- POST /config/profiles — 새 프로파일 추가 ----
router.post('/profiles', (req, res) => {
  const { name, dbType, host, port, database, username, password } = req.body;
  if (!name || !dbType || !host || !database || !username || !password) {
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  }

  let store = loadRawStore();
  if (!store) {
    store = { profiles: [], active: name };
  }

  if (store.profiles.find(p => p.name === name)) {
    return res.status(409).json({ error: `'${name}' 이름의 프로파일이 이미 존재합니다.` });
  }

  store.profiles.push({
    name,
    dbType,
    host,
    port: port || getDefaultPort(dbType),
    database,
    username,
    password: encrypt(password),
    updatedAt: new Date().toISOString()
  });

  saveStore(store);
  res.json({ ok: true, message: `프로파일 '${name}'이 추가되었습니다.` });
});

// ---- DELETE /config/profiles/:name — 프로파일 삭제 ----
router.delete('/profiles/:name', (req, res) => {
  const { name } = req.params;
  let store = loadRawStore();
  if (!store) return res.status(404).json({ error: '프로파일이 없습니다.' });

  if (store.active === name) {
    return res.status(400).json({ error: '활성 프로파일은 삭제할 수 없습니다.' });
  }
  if (store.profiles.length <= 1) {
    return res.status(400).json({ error: '마지막 프로파일은 삭제할 수 없습니다.' });
  }

  const before = store.profiles.length;
  store.profiles = store.profiles.filter(p => p.name !== name);
  if (store.profiles.length === before) {
    return res.status(404).json({ error: `'${name}' 프로파일을 찾을 수 없습니다.` });
  }

  saveStore(store);
  res.json({ ok: true, message: `프로파일 '${name}'이 삭제되었습니다.` });
});

// ---- PUT /config/profiles/:name — 프로파일 수정 ----
router.put('/profiles/:name', async (req, res) => {
  const { name } = req.params;
  const { dbType, host, port, database, username, password } = req.body;

  if (!dbType || !host || !database || !username) {
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  }

  let store = loadRawStore();
  if (!store) return res.status(404).json({ error: '프로파일이 없습니다.' });

  const idx = store.profiles.findIndex(p => p.name === name);
  if (idx === -1) return res.status(404).json({ error: `'${name}' 프로파일을 찾을 수 없습니다.` });

  const existing = store.profiles[idx];
  const updated = {
    ...existing,
    dbType,
    host,
    port: port || getDefaultPort(dbType),
    database,
    username,
    updatedAt: new Date().toISOString()
  };
  if (password) updated.password = encrypt(password);

  store.profiles[idx] = updated;
  saveStore(store);

  if (store.active === name) await closeAllPools();
  res.json({ ok: true, message: `프로파일 '${name}'이 수정되었습니다.` });
});

// ---- POST /config/profiles/:name/activate — 프로파일 전환 ----
router.post('/profiles/:name/activate', async (req, res) => {
  const { name } = req.params;
  let store = loadRawStore();
  if (!store) return res.status(404).json({ error: '프로파일이 없습니다.' });

  if (!store.profiles.find(p => p.name === name)) {
    return res.status(404).json({ error: `'${name}' 프로파일을 찾을 수 없습니다.` });
  }

  store.active = name;
  saveStore(store);
  await closeAllPools();
  res.json({ ok: true, message: `'${name}' 프로파일로 전환되었습니다.` });
});

module.exports = router;
module.exports.loadConfig = loadConfig;
