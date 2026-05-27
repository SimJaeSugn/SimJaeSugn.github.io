const mysql = require('mysql2/promise');

async function execute(config, sql) {
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port || 3306,
    database: config.database,
    user: config.username,
    password: config.password,
    connectTimeout: 10000,
    multipleStatements: false
  });
  try {
    const [rows, fields] = await conn.query(sql);
    const isArray = Array.isArray(rows);
    return {
      rows: isArray ? rows : [],
      rowCount: isArray ? rows.length : (rows.affectedRows || 0),
      fields: fields ? fields.map(f => f.name) : []
    };
  } finally {
    await conn.end();
  }
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok');
  return result.rows.length > 0;
}

module.exports = { execute, test };
