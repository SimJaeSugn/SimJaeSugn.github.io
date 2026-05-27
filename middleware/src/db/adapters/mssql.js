'use strict';
const mssql = require('mssql');

let _pool = null;
let _poolConfig = null;
let _connecting = null;

function configKey(config) {
  return JSON.stringify({
    server: config.host,
    port: config.port || 1433,
    database: config.database,
    user: config.username
  });
}

async function getPool(config) {
  const key = configKey(config);
  if (_pool && _poolConfig === key && _pool.connected) return _pool;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    if (_pool) { try { await _pool.close(); } catch (_) {} }
    const pool = new mssql.ConnectionPool({
      server: config.host,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate !== false,
        connectTimeout: 10000
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 30000
    });
    await pool.connect();
    _pool = pool;
    _poolConfig = key;
    _connecting = null;
    return pool;
  })();
  return _connecting;
}

async function execute(config, sql) {
  const pool = await getPool(config);
  const result = await pool.request().query(sql);
  const recordset = result.recordset || [];
  return {
    rows: recordset,
    rowCount: result.rowsAffected ? result.rowsAffected[0] : recordset.length,
    fields: recordset.length > 0 ? Object.keys(recordset[0]) : []
  };
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok');
  return result.rows.length > 0;
}

async function closePool() {
  if (_pool) {
    try { await _pool.close(); } catch (_) {}
    _pool = null;
    _poolConfig = null;
  }
}

module.exports = { execute, test, closePool };
