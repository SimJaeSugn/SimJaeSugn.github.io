'use strict';
const { Pool } = require('pg');

let _pool = null;
let _poolConfig = null;

function configKey(config) {
  return JSON.stringify({ host: config.host, port: config.port || 5432, database: config.database, user: config.username });
}

function getPool(config) {
  const key = configKey(config);
  if (_pool && _poolConfig === key) return _pool;
  if (_pool) { _pool.end().catch(() => {}); }
  _pool = new Pool({
    host: config.host,
    port: config.port || 5432,
    database: config.database,
    user: config.username,
    password: config.password,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    max: 10,
    idleTimeoutMillis: 30000
  });
  _poolConfig = key;
  return _pool;
}

async function execute(config, sql) {
  const pool = getPool(config);
  const result = await pool.query(sql);
  return {
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
    fields: result.fields ? result.fields.map(f => f.name) : []
  };
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok');
  return result.rows.length > 0;
}

async function closePool() {
  if (_pool) {
    try { await _pool.end(); } catch (_) {}
    _pool = null;
    _poolConfig = null;
  }
}

module.exports = { execute, test, closePool };
