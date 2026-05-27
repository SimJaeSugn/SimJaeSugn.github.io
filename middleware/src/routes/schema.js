const express = require('express');
const router = express.Router();
const { getAdapter } = require('../db/connector');
const { loadConfig } = require('./config');

// ── PostgreSQL 쿼리 ────────────────────────────────────────────────
const PG_COLUMNS = `
SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length,
       c.is_nullable, c.column_default,
       CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk,
       t.table_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_name = t.table_name AND c.table_schema = t.table_schema
LEFT JOIN (
  SELECT kcu.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position
`;

const PG_VIEWS = `
SELECT table_name AS view_name, pg_get_viewdef(table_name::regclass, true) AS view_def
FROM information_schema.views WHERE table_schema = 'public'
`;

const PG_FKS = `
SELECT kcu.table_name AS from_table, kcu.column_name AS from_col,
       ccu.table_name AS to_table, ccu.column_name AS to_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
`;

// ── MySQL 쿼리 ─────────────────────────────────────────────────────
const MY_COLUMNS = `
SELECT c.table_name, c.column_name, c.column_type AS data_type,
       c.is_nullable, c.column_default,
       IF(c.column_key='PRI', true, false) AS is_pk,
       t.table_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_name = t.table_name AND c.table_schema = t.table_schema
WHERE c.table_schema = DATABASE()
ORDER BY c.table_name, c.ordinal_position
`;

const MY_VIEWS = `
SELECT table_name AS view_name, view_definition AS view_def
FROM information_schema.views WHERE table_schema = DATABASE()
`;

const MY_FKS = `
SELECT table_name AS from_table, column_name AS from_col,
       referenced_table_name AS to_table, referenced_column_name AS to_col
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
`;

// ── MSSQL 쿼리 ────────────────────────────────────────────────────
const MS_COLUMNS = `
SELECT t.name AS table_name, c.name AS column_name,
       tp.name AS data_type, c.max_length, c.is_nullable,
       CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk,
       CASE WHEN tv.object_id IS NOT NULL THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type
FROM (SELECT object_id, name FROM sys.tables UNION ALL SELECT object_id, name FROM sys.views) t
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.types tp ON c.user_type_id = tp.user_type_id
LEFT JOIN sys.views tv ON t.object_id = tv.object_id
LEFT JOIN (
  SELECT ic.object_id, ic.column_id FROM sys.index_columns ic
  JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  WHERE i.is_primary_key = 1
) pk ON t.object_id = pk.object_id AND c.column_id = pk.column_id
ORDER BY t.name, c.column_id
`;

const MS_VIEWS = `
SELECT v.name AS view_name, m.definition AS view_def
FROM sys.views v JOIN sys.sql_modules m ON v.object_id = m.object_id
`;

const MS_FKS = `
SELECT tp.name AS from_table, cp.name AS from_col, tr.name AS to_table, cr.name AS to_col
FROM sys.foreign_key_columns fkc
JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
`;

function getQueries(dbType) {
  switch (dbType) {
    case 'postgres': return { columns: PG_COLUMNS, views: PG_VIEWS, fks: PG_FKS };
    case 'mysql':    return { columns: MY_COLUMNS, views: MY_VIEWS, fks: MY_FKS };
    case 'mssql':    return { columns: MS_COLUMNS, views: MS_VIEWS, fks: MS_FKS };
    default: throw new Error(`지원하지 않는 DB 타입: ${dbType}`);
  }
}

// mysql2가 information_schema 컬럼을 Buffer로 반환하거나 대문자 키로 반환하는 경우 정규화
function s(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val)) return val.toString('utf8');
  return String(val);
}

// MySQL 서버에 따라 컬럼명이 대문자로 반환될 수 있으므로 키를 소문자로 정규화
function norm(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.toLowerCase()] = v;
  return out;
}

function buildResult(colRows, viewRows, fkRows) {
  // 테이블/뷰별 컬럼 그룹화
  const tableMap = {};
  const viewSet = new Set();

  for (const rawRow of colRows) {
    const row = norm(rawRow);
    const name = s(row.table_name);
    const isView = (s(row.table_type) || '').toUpperCase().includes('VIEW');
    if (isView) viewSet.add(name);
    if (!tableMap[name]) tableMap[name] = { tableName: name, isView, columns: [] };
    tableMap[name].columns.push({
      columnName:   s(row.column_name),
      dataType:     s(row.data_type) || '',
      isPk:         !!row.is_pk,
      isNullable:   s(row.is_nullable) === 'YES' || row.is_nullable === true || row.is_nullable === 1,
      defaultValue: row.column_default != null ? s(row.column_default) : null
    });
  }

  const tables = Object.values(tableMap).filter(t => !t.isView);
  const viewMeta = Object.values(tableMap).filter(t => t.isView);

  // 뷰 DDL 병합
  const viewDdlMap = {};
  for (const raw of viewRows) { const v = norm(raw); viewDdlMap[s(v.view_name)] = s(v.view_def) || ''; }

  const views = viewMeta.map(v => ({
    viewName: v.tableName,
    columns: v.columns,
    ddl: viewDdlMap[v.tableName] || ''
  }));

  const fks = fkRows.map(raw => { const r = norm(raw); return {
    fromTable: s(r.from_table),
    fromCol:   s(r.from_col),
    toTable:   s(r.to_table),
    toCol:     s(r.to_col)
  }; });

  return { tables, views, fks };
}

// GET /schema
router.get('/', async (req, res) => {
  const config = loadConfig();
  if (!config) return res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });

  try {
    const queries = getQueries(config.dbType);
    const adapter = getAdapter(config.dbType);

    const [colResult, viewResult, fkResult] = await Promise.all([
      adapter.execute(config, queries.columns),
      adapter.execute(config, queries.views),
      adapter.execute(config, queries.fks)
    ]);

    const result = buildResult(
      colResult.rows  || [],
      viewResult.rows || [],
      fkResult.rows   || []
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
