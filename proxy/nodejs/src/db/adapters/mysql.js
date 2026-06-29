'use strict';
const mysql = require('mysql2/promise');

const _pools = new Map();  // configKey -> Pool

function configKey(config) {
  return JSON.stringify({ host: config.host, port: config.port || 3306, database: config.database, user: config.username });
}

function getPool(config) {
  const key = configKey(config);
  if (_pools.has(key)) return _pools.get(key);
  const pool = mysql.createPool({
    host: config.host,
    port: config.port || 3306,
    database: config.database,
    user: config.username,
    password: config.password,
    connectTimeout: 10000,
    multipleStatements: false,
    connectionLimit: 10,
    idleTimeout: 30000
  });
  _pools.set(key, pool);
  return pool;
}

async function execute(config, sql) {
  const pool = getPool(config);
  const conn = await pool.getConnection();
  try {
    try { await conn.query('SET SESSION MAX_EXECUTION_TIME=30000'); } catch (_) {}
    const [rows, fields] = await conn.query(sql);
    const isArray = Array.isArray(rows);
    return {
      rows: isArray ? rows : [],
      rowCount: isArray ? rows.length : (rows.affectedRows || 0),
      fields: fields ? fields.map(f => f.name) : []
    };
  } finally {
    conn.release();
  }
}

async function executeParams(config, sql, params) {
  const pool = getPool(config);
  const conn = await pool.getConnection();
  try {
    const [rows, fields] = await conn.execute(sql, params);
    const isArray = Array.isArray(rows);
    return {
      rows: isArray ? rows : [],
      rowCount: isArray ? rows.length : (rows.affectedRows || 0),
      fields: Array.isArray(fields) ? fields.map(f => f.name) : []
    };
  } finally {
    conn.release();
  }
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
