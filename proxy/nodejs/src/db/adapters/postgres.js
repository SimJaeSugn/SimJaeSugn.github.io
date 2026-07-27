'use strict';
const { Pool } = require('pg');

const _pools = new Map();  // configKey -> Pool

function configKey(config) {
  // dbType 포함 — 같은 호스트라도 연결 옵션(예: supabase 의 TLS)이 다르면 풀을 분리한다.
  return JSON.stringify({ dbType: config.dbType || 'postgres', host: config.host, port: config.port || 5432, database: config.database, user: config.username });
}

function getPool(config) {
  const key = configKey(config);
  if (_pools.has(key)) return _pools.get(key);
  const pool = new Pool({
    host: config.host,
    port: config.port || 5432,
    database: config.database,
    user: config.username,
    password: config.password,
    // 선택적 TLS 옵션 — 미지정 시 기존 동작 그대로(평문)
    ...(config.ssl ? { ssl: config.ssl } : {}),
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    max: 10,
    idleTimeoutMillis: 30000
  });
  _pools.set(key, pool);
  return pool;
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

async function executeParams(config, sql, params) {
  const pool = getPool(config);
  const result = await pool.query(sql, params);
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

async function closePool(key = null) {
  if (key) {
    const pool = _pools.get(key);
    if (pool) { try { await pool.end(); } catch (_) {} _pools.delete(key); }
  } else {
    for (const pool of _pools.values()) { try { await pool.end(); } catch (_) {} }
    _pools.clear();
  }
}

module.exports = { execute, executeParams, test, closePool };
