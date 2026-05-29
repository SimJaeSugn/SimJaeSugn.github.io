'use strict';
const mysql = require('mysql2/promise');

let _pool = null;
let _poolConfig = null;

function configKey(config) {
  return JSON.stringify({ host: config.host, port: config.port || 3306, database: config.database, user: config.username });
}

function getPool(config) {
  const key = configKey(config);
  if (_pool && _poolConfig === key) return _pool;
  if (_pool) { _pool.end().catch(() => {}); }
  _pool = mysql.createPool({
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
  _poolConfig = key;
  return _pool;
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
