import re
from fastapi import APIRouter, HTTPException
from db.connector import get_adapter
from routers.config import load_config

router = APIRouter()


def _pg_validate_schema(schema) -> str:
    v = str(schema or "public")
    if not re.match(r'^[A-Za-z0-9_.]+$', v):
        raise ValueError(f"잘못된 스키마 이름: {schema}")
    return v


# ── PostgreSQL 쿼리 ───────────────────────────────────────────────────────────

def _pg_columns(schema):
    return f"""
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
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '{schema}'
) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
WHERE c.table_schema = '{schema}'
ORDER BY c.table_name, c.ordinal_position
"""


def _pg_views(schema):
    return f"""
SELECT table_name AS view_name, pg_get_viewdef(table_name::regclass, true) AS view_def
FROM information_schema.views WHERE table_schema = '{schema}'
"""


def _pg_fks(schema):
    return f"""
SELECT kcu.table_name AS from_table, kcu.column_name AS from_col,
       ccu.table_name AS to_table, ccu.column_name AS to_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = '{schema}'
"""


def _pg_unique(schema):
    return f"""
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = '{schema}'
"""


def _pg_tables_list(schema):
    return f"""
SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM information_schema.tables WHERE table_schema = '{schema}'
ORDER BY table_type DESC, table_name
"""


# ── MySQL 쿼리 ────────────────────────────────────────────────────────────────

MY_COLUMNS = """
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
"""

MY_VIEWS = """
SELECT table_name AS view_name, view_definition AS view_def
FROM information_schema.views WHERE table_schema = DATABASE()
"""

MY_FKS = """
SELECT table_name AS from_table, column_name AS from_col,
       referenced_table_name AS to_table, referenced_column_name AS to_col
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
"""

MY_UNIQUE = """
SELECT table_name, column_name
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND non_unique = 0 AND index_name != 'PRIMARY'
"""

MY_TABLES_LIST = """
SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM information_schema.tables WHERE table_schema = DATABASE()
ORDER BY table_type DESC, table_name
"""

# ── MSSQL 쿼리 ────────────────────────────────────────────────────────────────

MS_COLUMNS = """
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
"""

MS_VIEWS = """
SELECT v.name AS view_name, m.definition AS view_def
FROM sys.views v JOIN sys.sql_modules m ON v.object_id = m.object_id
"""

MS_FKS = """
SELECT tp.name AS from_table, cp.name AS from_col, tr.name AS to_table, cr.name AS to_col
FROM sys.foreign_key_columns fkc
JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
"""

MS_UNIQUE = """
SELECT t.name AS table_name, c.name AS column_name
FROM sys.indexes i
JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
JOIN sys.tables t ON i.object_id = t.object_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE i.is_unique = 1 AND i.is_primary_key = 0
"""

MS_TABLES_LIST = """
SELECT name,
       CASE WHEN type_desc = 'VIEW' THEN 'view' ELSE 'table' END AS type
FROM (
  SELECT name, 'TABLE' AS type_desc FROM sys.tables
  UNION ALL SELECT name, 'VIEW' AS type_desc FROM sys.views
) t ORDER BY type_desc DESC, name
"""

# ── Oracle 쿼리 ───────────────────────────────────────────────────────────────

ORA_COLUMNS = """
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
"""

ORA_VIEWS = """
SELECT view_name, text AS view_def FROM user_views
"""

ORA_FKS = """
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
"""

ORA_UNIQUE = """
SELECT ac.table_name, acc.column_name
FROM user_constraints ac
JOIN user_cons_columns acc ON ac.constraint_name = acc.constraint_name
WHERE ac.constraint_type = 'U'
"""

ORA_TABLES_LIST = """
SELECT table_name AS name, 'table' AS type FROM user_tables
UNION ALL SELECT view_name AS name, 'view' AS type FROM user_views
ORDER BY 2 DESC, 1
"""


# ── 쿼리 선택 ─────────────────────────────────────────────────────────────────

def _get_queries(db_type: str, schema: str = "public") -> dict:
    if db_type == "postgres":
        sch = _pg_validate_schema(schema)
        return {"columns": _pg_columns(sch), "views": _pg_views(sch), "fks": _pg_fks(sch), "unique": _pg_unique(sch)}
    if db_type == "mysql":
        return {"columns": MY_COLUMNS, "views": MY_VIEWS, "fks": MY_FKS, "unique": MY_UNIQUE}
    if db_type == "mssql":
        return {"columns": MS_COLUMNS, "views": MS_VIEWS, "fks": MS_FKS, "unique": MS_UNIQUE}
    if db_type == "oracle":
        return {"columns": ORA_COLUMNS, "views": ORA_VIEWS, "fks": ORA_FKS, "unique": ORA_UNIQUE}
    raise ValueError(f"지원하지 않는 DB 타입: {db_type}")


# ── 결과 정규화 헬퍼 ──────────────────────────────────────────────────────────

def _s(val) -> str:
    if val is None:
        return None
    if isinstance(val, bytes):
        return val.decode("utf-8")
    return str(val)


def _norm(row: dict) -> dict:
    return {k.lower(): v for k, v in row.items()}


def _build_result(col_rows, view_rows, fk_rows, unique_rows=None) -> dict:
    if unique_rows is None:
        unique_rows = []
    unique_set = set()
    for raw in unique_rows:
        r = _norm(raw)
        unique_set.add(f"{_s(r.get('table_name'))}.{_s(r.get('column_name'))}")

    table_map = {}
    for raw_row in col_rows:
        row = _norm(raw_row)
        name = _s(row.get("table_name"))
        col_name = _s(row.get("column_name"))
        table_type = (_s(row.get("table_type")) or "").upper()
        is_view = "VIEW" in table_type
        if name not in table_map:
            table_map[name] = {"tableName": name, "isView": is_view, "columns": []}
        is_nullable_val = row.get("is_nullable")
        is_nullable = (
            _s(is_nullable_val) == "YES"
            or _s(is_nullable_val) == "Y"
            or is_nullable_val is True
            or is_nullable_val == 1
        )
        is_auto_inc_val = row.get("is_auto_increment")
        is_auto_inc = bool(is_auto_inc_val) or _s(is_auto_inc_val) == "true"
        table_map[name]["columns"].append({
            "columnName": col_name,
            "dataType": _s(row.get("data_type")) or "",
            "isPk": bool(row.get("is_pk")),
            "isNullable": is_nullable,
            "defaultValue": _s(row.get("column_default")) if row.get("column_default") is not None else None,
            "isUnique": bool(row.get("is_unique")) or f"{name}.{col_name}" in unique_set,
            "isAutoIncrement": is_auto_inc,
        })

    tables = [v for v in table_map.values() if not v["isView"]]
    view_meta = [v for v in table_map.values() if v["isView"]]

    view_ddl_map = {}
    for raw in view_rows:
        v = _norm(raw)
        view_ddl_map[_s(v.get("view_name"))] = _s(v.get("view_def")) or ""

    views = [
        {"viewName": v["tableName"], "columns": v["columns"], "ddl": view_ddl_map.get(v["tableName"], "")}
        for v in view_meta
    ]

    fks = []
    for raw in fk_rows:
        r = _norm(raw)
        from_table = _s(r.get("from_table"))
        from_col = _s(r.get("from_col"))
        is_uniq_from = f"{from_table}.{from_col}" in unique_set
        fks.append({
            "fromTable": from_table,
            "fromCol": from_col,
            "toTable": _s(r.get("to_table")),
            "toCol": _s(r.get("to_col")),
            "card": "1:1" if is_uniq_from else "1:N",
        })

    return {"tables": tables, "views": views, "fks": fks}


# ── GET /schema/tables ────────────────────────────────────────────────────────

@router.get("/tables")
async def get_tables():
    config = load_config()
    if not config:
        raise HTTPException(status_code=400, detail="접속정보가 설정되지 않았습니다.")
    try:
        adapter = get_adapter(config["dbType"])
        db_type = config["dbType"]
        schema = config.get("schema") or "public"
        if db_type == "postgres":
            query = _pg_tables_list(_pg_validate_schema(schema))
        elif db_type == "mysql":
            query = MY_TABLES_LIST
        elif db_type == "mssql":
            query = MS_TABLES_LIST
        elif db_type == "oracle":
            query = ORA_TABLES_LIST
        else:
            raise ValueError(f"지원하지 않는 DB 타입: {db_type}")
        result = await adapter.execute(config, query)
        items = [{"name": _s(_norm(r).get("name")), "type": _s(_norm(r).get("type"))} for r in (result.get("rows") or [])]
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── GET /schema ───────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
async def get_schema():
    config = load_config()
    if not config:
        raise HTTPException(status_code=400, detail="접속정보가 설정되지 않았습니다.")
    try:
        queries = _get_queries(config["dbType"], config.get("schema") or "public")
        adapter = get_adapter(config["dbType"])
        import asyncio
        col_result, view_result, fk_result, uq_result = await asyncio.gather(
            adapter.execute(config, queries["columns"]),
            adapter.execute(config, queries["views"]),
            adapter.execute(config, queries["fks"]),
            adapter.execute(config, queries["unique"]),
        )
        result = _build_result(
            col_result.get("rows") or [],
            view_result.get("rows") or [],
            fk_result.get("rows") or [],
            uq_result.get("rows") or [],
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
