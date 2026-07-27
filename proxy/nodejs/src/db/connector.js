const postgres = require('./adapters/postgres');
const mysql = require('./adapters/mysql');
const mssql = require('./adapters/mssql');
const oracle = require('./adapters/oracle');
const supabase = require('./adapters/supabase');

const adapters = { postgres, mysql, mssql, oracle, supabase };

// dbType → SQL 방언. 프로토콜은 같고 연결 조건만 다른 유형을 정규화한다.
// (어댑터 조회는 항상 원본 dbType 으로 — 연결 옵션이 달라진다.)
const DIALECTS = { supabase: 'postgres' };

function sqlDialect(dbType) {
  return DIALECTS[dbType] || dbType;
}

function getAdapter(dbType) {
  const adapter = adapters[dbType];
  if (!adapter) throw new Error(`지원하지 않는 DB 타입: ${dbType}. (postgres / mysql / mssql / oracle / supabase)`);
  return adapter;
}

async function closeAllPools(key = null) {
  for (const adapter of Object.values(adapters)) {
    if (typeof adapter.closePool === 'function') await adapter.closePool(key);
  }
}

module.exports = { getAdapter, closeAllPools, sqlDialect };
