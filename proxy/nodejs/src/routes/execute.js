const express = require('express');
const router = express.Router();
const { getAdapter } = require('../db/connector');
const { loadConfig } = require('./config');
const { writeAuditLog } = require('../utils/auditLogger');

function splitSql(sql) {
  const results = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      current += ch;
      if (ch === stringChar && sql[i - 1] !== '\\') inString = false;
    } else if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
    } else if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) results.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) results.push(trimmed);
  return results;
}

function parseSqls(body) {
  if (Array.isArray(body.sqls)) return body.sqls.filter(s => s && s.trim());
  if (typeof body.sql === 'string') return splitSql(body.sql);
  return [];
}

// POST /execute - 단일 SQL 실행
router.post('/', async (req, res) => {
  const config = loadConfig();
  if (!config) return res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });

  const sql = req.body.sql;
  if (!sql || !sql.trim()) return res.status(400).json({ error: 'SQL이 비어있습니다.' });

  try {
    const adapter = getAdapter(config.dbType);
    const start = Date.now();
    const result = await adapter.execute(config, sql.trim());
    const duration = Date.now() - start;
    writeAuditLog('EXECUTE', sql.trim(), { durationMs: duration, rowCount: result.rowCount });
    res.json({ ok: true, ...result, duration });
  } catch (err) {
    writeAuditLog('EXECUTE', sql.trim(), { error: err.message });
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /execute/stream - 다중 SQL SSE 스트리밍
router.post('/stream', async (req, res) => {
  const config = loadConfig();
  if (!config) {
    res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });
    return;
  }

  const sqls = parseSqls(req.body);
  if (sqls.length === 0) {
    res.status(400).json({ error: '실행할 SQL이 없습니다.' });
    return;
  }

  const stopOnError = req.body.stopOnError === true;

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const adapter = getAdapter(config.dbType);
  const total = sqls.length;
  let success = 0;
  let failed = 0;
  const startAll = Date.now();

  for (let i = 0; i < sqls.length; i++) {
    const sql = sqls[i];
    const step = i + 1;

    send('progress', { step, total, sql, status: 'running' });

    try {
      const start = Date.now();
      const result = await adapter.execute(config, sql);
      success++;
      const duration = Date.now() - start;
      writeAuditLog('STREAM', sql, { durationMs: duration, rowCount: result.rowCount });
      send('progress', {
        step, total, sql, status: 'ok',
        rowCount: result.rowCount,
        duration
      });
    } catch (err) {
      failed++;
      writeAuditLog('STREAM', sql, { error: err.message });
      send('error', { step, total, sql, error: err.message });
      if (stopOnError) break;
    }
  }

  send('done', { success, failed, total, duration: Date.now() - startAll });
  res.end();
});

module.exports = router;
