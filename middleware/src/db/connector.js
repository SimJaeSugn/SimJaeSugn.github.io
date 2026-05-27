const postgres = require('./adapters/postgres');
const mysql = require('./adapters/mysql');
const mssql = require('./adapters/mssql');

const adapters = { postgres, mysql, mssql };

function getAdapter(dbType) {
  const adapter = adapters[dbType];
  if (!adapter) throw new Error(`지원하지 않는 DB 타입: ${dbType}. (postgres / mysql / mssql)`);
  return adapter;
}

async function closeAllPools() {
  for (const adapter of Object.values(adapters)) {
    if (typeof adapter.closePool === 'function') await adapter.closePool();
  }
}

module.exports = { getAdapter, closeAllPools };
