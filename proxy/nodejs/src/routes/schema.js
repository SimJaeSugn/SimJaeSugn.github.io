const express = require('express');
const router = express.Router();
const { getAdapter } = require('../db/connector');
const { loadConfig } = require('./config');

// ── PostgreSQL 스키마 화이트리스트 검증 ─────────────────────────────
// PG adapter가 파라미터 바인딩을 지원하지 않으므로 알파뉴메릭+언더스코어+점만 허용한 후 문자열 치환
function pgValidateSchema(schema) {
  const v = String(schema || 'public');
  if (!/^[A-Za-z0-9_.]+$/.test(v)) {
    throw new Error(`잘못된 스키마 이름: ${schema}`);
  }
  return v;
}

// ── PostgreSQL 쿼리 (schema 치환) ───────────────────────────────────
const PG_COLUMNS = (schema) => `
SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length,
       c.is_nullable, c.column_default,
       CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk,
       t.table_type,
       CASE WHEN c.column_default LIKE 'nextval%' THEN true ELSE false END AS is_auto_increment,
       false AS is_unique
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_name = t.table_name AND c.table_schema = t.table_schema
LEFT JOIN (
  SELECT kcu.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '${schema}'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
WHERE c.table_schema = '${schema}'
ORDER BY c.table_name, c.ordinal_position
`;

const PG_VIEWS = (schema) => `
SELECT table_name AS view_name, pg_get_viewdef(table_name::regclass, true) AS view_def
FROM information_schema.views WHERE table_schema = '${schema}'
`;

const PG_FKS = (schema) => `
SELECT kcu.table_name AS from_table, kcu.column_name AS from_col,
       ccu.table_name AS to_table, ccu.column_name AS to_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = '${schema}'
`;

// ── MySQL 쿼리 ─────────────────────────────────────────────────────
const MY_COLUMNS = `
SELECT c.table_name, c.column_name, c.column_type AS data_type,
       c.is_nullable, c.column_default,
       IF(c.column_key='PRI', true, false) AS is_pk,
       t.table_type,
       IF(c.column_key = 'UNI', true, false) AS is_unique,
       IF(c.extra = 'auto_increment', true, false) AS is_auto_increment
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
       CASE WHEN tv.object_id IS NOT NULL THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type,
       c.is_identity AS is_auto_increment,
       0 AS is_unique
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

// ── Oracle 쿼리 ───────────────────────────────────────────────────
const ORA_COLUMNS = `
SELECT t.table_name,
       c.column_name,
       c.data_type,
       c.char_length AS character_maximum_length,
       c.nullable     AS is_nullable,
       c.data_default AS column_default,
       CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk,
       CASE WHEN v.view_name IS NOT NULL THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type,
       CASE WHEN c.identity_column = 'YES' THEN 1 ELSE 0 END AS is_auto_increment,
       0 AS is_unique
FROM user_tab_columns c
JOIN (
  SELECT table_name FROM user_tables
  UNION ALL
  SELECT view_name AS table_name FROM user_views
) t ON c.table_name = t.table_name
LEFT JOIN user_views v ON v.view_name = c.table_name
LEFT JOIN (
  SELECT ac.table_name, acc.column_name
  FROM user_constraints ac
  JOIN user_cons_columns acc ON ac.constraint_name = acc.constraint_name
  WHERE ac.constraint_type = 'P'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
ORDER BY c.table_name, c.column_id
`;

const ORA_VIEWS = `
SELECT view_name, text AS view_def FROM user_views
`;

const ORA_FKS = `
SELECT ac.table_name AS from_table,
       acc.column_name AS from_col,
       rc.table_name AS to_table,
       rcc.column_name AS to_col
FROM user_constraints ac
JOIN user_cons_columns acc ON ac.constraint_name = acc.constraint_name
JOIN user_constraints rc ON ac.r_constraint_name = rc.constraint_name
JOIN user_cons_columns rcc ON rc.constraint_name = rcc.constraint_name
  AND acc.position = rcc.position
WHERE ac.constraint_type = 'R'
`;

// ── UNIQUE 컬럼 조회 쿼리 ──────────────────────────────────────────
const PG_UNIQUE = (schema) => `
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = '${schema}'
`;

const MY_UNIQUE = `
SELECT table_name, column_name
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND non_unique = 0 AND index_name != 'PRIMARY'
`;

const MS_UNIQUE = `
SELECT t.name AS table_name, c.name AS column_name
FROM sys.indexes i
JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
JOIN sys.tables t ON i.object_id = t.object_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE i.is_unique = 1 AND i.is_primary_key = 0
`;

const ORA_UNIQUE = `
SELECT ac.table_name, acc.column_name
FROM user_constraints ac
JOIN user_cons_columns acc ON ac.constraint_name = acc.constraint_name
WHERE ac.constraint_type = 'U'
`;

function getQueries(dbType, schema = 'public') {
  switch (dbType) {
    case 'postgres': {
      const sch = pgValidateSchema(schema);
      return { columns: PG_COLUMNS(sch), views: PG_VIEWS(sch), fks: PG_FKS(sch), unique: PG_UNIQUE(sch) };
    }
    case 'mysql':    return { columns: MY_COLUMNS, views: MY_VIEWS, fks: MY_FKS, unique: MY_UNIQUE };
    case 'mssql':    return { columns: MS_COLUMNS, views: MS_VIEWS, fks: MS_FKS, unique: MS_UNIQUE };
    case 'oracle':   return { columns: ORA_COLUMNS, views: ORA_VIEWS, fks: ORA_FKS, unique: ORA_UNIQUE };
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

function buildResult(colRows, viewRows, fkRows, uniqueRows = []) {
  // uniqueSet 구성: "table.column" 형식
  const uniqueSet = new Set();
  for (const raw of uniqueRows) {
    const r = norm(raw);
    uniqueSet.add(`${s(r.table_name)}.${s(r.column_name)}`);
  }

  // 테이블/뷰별 컬럼 그룹화
  const tableMap = {};
  const viewSet = new Set();

  for (const rawRow of colRows) {
    const row = norm(rawRow);
    const name = s(row.table_name);
    const colName = s(row.column_name);
    const isView = (s(row.table_type) || '').toUpperCase().includes('VIEW');
    if (isView) viewSet.add(name);
    if (!tableMap[name]) tableMap[name] = { tableName: name, isView, columns: [] };
    tableMap[name].columns.push({
      columnName:      colName,
      dataType:        s(row.data_type) || '',
      isPk:            !!row.is_pk,
      isNullable:      s(row.is_nullable) === 'YES' || s(row.is_nullable) === 'Y' || row.is_nullable === true || row.is_nullable === 1,
      defaultValue:    row.column_default != null ? s(row.column_default) : null,
      isUnique:        !!row.is_unique || uniqueSet.has(`${name}.${colName}`),
      isAutoIncrement: !!(row.is_auto_increment || s(row.is_auto_increment) === 'true')
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

  const fks = fkRows.map(raw => {
    const r = norm(raw);
    const fromTable = s(r.from_table);
    const fromCol   = s(r.from_col);
    const isUniqFrom = uniqueSet.has(`${fromTable}.${fromCol}`);
    return {
      fromTable,
      fromCol,
      toTable: s(r.to_table),
      toCol:   s(r.to_col),
      card:    isUniqFrom ? '1:1' : '1:N'
    };
  });

  return { tables, views, fks };
}

// ── 테이블 목록 쿼리 ──────────────────────────────────────────────
const PG_TABLES_LIST = (schema) => `
SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM information_schema.tables WHERE table_schema = '${schema}'
ORDER BY table_type DESC, table_name
`;

const MY_TABLES_LIST = `
SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM information_schema.tables WHERE table_schema = DATABASE()
ORDER BY table_type DESC, table_name
`;

const MS_TABLES_LIST = `
SELECT name,
       CASE WHEN type_desc = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM (
  SELECT name, 'TABLE' AS type_desc FROM sys.tables
  UNION ALL SELECT name, 'VIEW' AS type_desc FROM sys.views
) t ORDER BY type_desc DESC, name
`;

const ORA_TABLES_LIST = `
SELECT table_name AS name, 'table' AS type FROM user_tables
UNION ALL SELECT view_name AS name, 'view' AS type FROM user_views
ORDER BY 2 DESC, 1
`;

// GET /schema/tables — 테이블·뷰 이름 목록만 반환 (2단계 선택용)
router.get('/tables', async (req, res) => {
  const config = loadConfig();
  if (!config) return res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });
  try {
    const adapter = getAdapter(config.dbType);
    let query;
    switch (config.dbType) {
      case 'postgres': query = PG_TABLES_LIST(pgValidateSchema(config.schema || 'public')); break;
      case 'mysql':    query = MY_TABLES_LIST; break;
      case 'mssql':    query = MS_TABLES_LIST; break;
      case 'oracle':   query = ORA_TABLES_LIST; break;
      default: throw new Error(`지원하지 않는 DB 타입: ${config.dbType}`);
    }
    const result = await adapter.execute(config, query);
    const items = (result.rows || []).map(r => {
      const row = norm(r);
      return { name: s(row.name), type: s(row.type) };
    });
    res.json({ items });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /schema
router.get('/', async (req, res) => {
  const config = loadConfig();
  if (!config) return res.status(400).json({ error: '접속정보가 설정되지 않았습니다.' });

  try {
    const queries = getQueries(config.dbType, config.schema || 'public');
    const adapter = getAdapter(config.dbType);

    const [colResult, viewResult, fkResult, uqResult] = await Promise.all([
      adapter.execute(config, queries.columns),
      adapter.execute(config, queries.views),
      adapter.execute(config, queries.fks),
      adapter.execute(config, queries.unique)
    ]);

    const result = buildResult(
      colResult.rows  || [],
      viewResult.rows || [],
      fkResult.rows   || [],
      uqResult.rows   || []
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
