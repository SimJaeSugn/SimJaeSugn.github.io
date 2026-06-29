'use strict';
const oracledb = require('oracledb');

const _pools = new Map();  // configKey -> Pool
let _thickInitDone = false;

// Thick 모드 초기화 (Oracle Instant Client 필요).
// Thin 모드는 Oracle DB 12.1+ 만 지원하므로, 구버전 DB 연결 시 Thick 모드가 필요하다.
// initOracleClient 는 프로세스당 한 번만 호출 가능하므로 플래그로 보호한다.
// Windows에서 libDir 파라미터는 DLL 로딩 방식 차이로 불안정하므로 시스템 PATH에 등록된 경로를 사용한다.
function initThickMode() {
  if (_thickInitDone) return;
  _thickInitDone = true;
  try {
    oracledb.initOracleClient();
  } catch (_) {
    // Oracle Instant Client가 시스템 PATH에 없음 → Thin 모드 유지 (Oracle DB 12.1+ 만 가능)
  }
}

function configKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port || 1521,
    database: config.database,
    user: config.username
  });
}

async function getPool(config) {
  initThickMode();
  const key = configKey(config);
  if (_pools.has(key)) return _pools.get(key);

  const connectString = `${config.host}:${config.port || 1521}/${config.database}`;
  const pool = await oracledb.createPool({
    user:          config.username,
    password:      config.password,
    connectString,
    poolMin:       0,
    poolMax:       10,
    poolTimeout:   30,
    queueTimeout:  10000
  });
  _pools.set(key, pool);
  return pool;
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

async function executeParams(config, sql, params) {
  const pool = await getPool(config);
  let conn;
  try {
    conn = await pool.getConnection();
    // oracledb positional 바인딩: :1, :2, ... 형식
    const binds = params.map(v => v);
    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 100,
      autoCommit: true
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

async function closePool(key = null) {
  if (key) {
    const pool = _pools.get(key);
    if (pool) { try { await pool.close(0); } catch (_) {} _pools.delete(key); }
  } else {
    for (const pool of _pools.values()) { try { await pool.close(0); } catch (_) {} }
    _pools.clear();
  }
}

module.exports = { execute, executeParams, test, closePool };
