const express = require('express');
const router = express.Router();
const { getAdapter } = require('../db/connector');
const { loadConfig } = require('./config');

router.get('/', async (req, res) => {
  const config = loadConfig();
  if (!config) {
    return res.json({ ok: false, db: { connected: false, error: '접속정보 없음' } });
  }
  try {
    const adapter = getAdapter(config.dbType);
    const start = Date.now();
    await adapter.test(config);
    res.json({ ok: true, db: { connected: true, latencyMs: Date.now() - start } });
  } catch (err) {
    res.json({ ok: false, db: { connected: false, error: err.message } });
  }
});

module.exports = router;
