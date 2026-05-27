'use strict';
const oracledb = require('oracledb');

let _pool = null;
let _poolConfig = null;

function configKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port || 1521,
    database: config.database,
    user: config.username
  });
}

async function getPool(config) {
  const key = configKey(config);
  if (_pool && _poolConfig === key) return _pool;
  if (_pool) { try { await _pool.close(0); } catch (_) {} }

  const connectString = `${config.host}:${config.port || 1521}/${config.database}`;
  _pool = await oracledb.createPool({
    user:          config.username,
    password:      config.password,
    connectString,
    poolMin:       0,
    poolMax:       10,
    poolTimeout:   30,
    queueTimeout:  10000
  });
  _poolConfig = key;
  return _pool;
}

async function execute(config, sql) {
  const pool = await getPool(config);
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 100
    });
    const rows = result.rows || [];
    const fields = result.metaData ? result.metaData.map(m => m.name.toLowerCase()) : [];
    return {
      rows: rows.map(row => {
        const out = {};
        for (const [k, v] of Object.entries(row)) out[k.toLowerCase()] = v;
        return out;
      }),
      rowCount: result.rowsAffected != null ? result.rowsAffected : rows.length,
      fields
    };
  } finally {
    if (conn) { try { await conn.close(); } catch (_) {} }
  }
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok FROM DUAL');
  return result.rows.length > 0;
}

async function closePool() {
  if (_pool) {
    try { await _pool.close(0); } catch (_) {}
    _pool = null;
    _poolConfig = null;
  }
}

module.exports = { execute, test, closePool };
