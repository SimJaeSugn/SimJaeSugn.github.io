const { Client } = require('pg');

async function execute(config, sql) {
  const client = new Client({
    host: config.host,
    port: config.port || 5432,
    database: config.database,
    user: config.username,
    password: config.password,
    connectionTimeoutMillis: 10000
  });
  await client.connect();
  try {
    const result = await client.query(sql);
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      fields: result.fields ? result.fields.map(f => f.name) : []
    };
  } finally {
    await client.end();
  }
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok');
  return result.rows.length > 0;
}

module.exports = { execute, test };
