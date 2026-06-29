'use strict';
const mssql = require('mssql');

const _pools = new Map();       // configKey -> ConnectionPool
const _connecting = new Map();  // configKey -> Promise (연결 중 mutex)

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
  const existing = _pools.get(key);
  if (existing && existing.connected) return existing;
  if (_connecting.has(key)) return _connecting.get(key);
  const p = (async () => {
    const prev = _pools.get(key);
    if (prev) { try { await prev.close(); } catch (_) {} }
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
    _pools.set(key, pool);
    _connecting.delete(key);
    return pool;
  })();
  _connecting.set(key, p);
  return p;
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

async function executeParams(config, sql, params) {
  const pool = await getPool(config);
  const request = pool.request();
  // @p1, @p2, ... 플레이스홀더로 positional 바인딩
  // null/undefined 는 타입 추론이 실패할 수 있어 NVarChar 로 명시한다.
  params.forEach((p, i) => {
    const name = `p${i + 1}`;
    if (p === null || p === undefined) request.input(name, mssql.NVarChar, null);
    else request.input(name, p);
  });
  const result = await request.query(sql);
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

async function closePool(key = null) {
  if (key) {
    const pool = _pools.get(key);
    if (pool) { try { await pool.close(); } catch (_) {} _pools.delete(key); }
    _connecting.delete(key);
  } else {
    for (const pool of _pools.values()) { try { await pool.close(); } catch (_) {} }
    _pools.clear();
    _connecting.clear();
  }
}

module.exports = { execute, executeParams, test, closePool };
