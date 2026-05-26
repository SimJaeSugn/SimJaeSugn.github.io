const mssql = require('mssql');

async function execute(config, sql) {
  const pool = await mssql.connect({
    server: config.host,
    port: config.port || 1433,
    database: config.database,
    user: config.username,
    password: config.password,
    options: {
      encrypt: config.encrypt !== false,
      trustServerCertificate: config.trustServerCertificate !== false,
      connectTimeout: 10000
    }
  });
  try {
    const result = await pool.request().query(sql);
    const recordset = result.recordset || [];
    return {
      rows: recordset,
      rowCount: result.rowsAffected ? result.rowsAffected[0] : recordset.length,
      fields: recordset.length > 0 ? Object.keys(recordset[0]) : []
    };
  } finally {
    await mssql.close();
  }
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok');
  return result.rows.length > 0;
}

module.exports = { execute, test };
