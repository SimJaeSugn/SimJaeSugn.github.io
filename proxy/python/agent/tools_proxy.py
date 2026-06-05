"""프록시(서버) 측 툴 — DB 연계 (location="proxy").

클라이언트 ERD 상태가 아니라 실제 DB에 접근하므로 그래프 안에서 직접 실행한다
(클라 interrupt 위임 없음). 기존 db 어댑터·schema 로직을 재사용.
DB 미설정/오류 시 예외 대신 {ok:False, error} 를 반환해 그래프가 계속되게 한다.
"""
import asyncio

from db.connector import get_adapter
from routers.config import load_config
from agent.db_docs import DB_DOC_CATALOG, DOC_TOOLS, get_db_doc

# 플래너에 노출되는 프록시 툴 카탈로그 (클라 카탈로그와 합쳐 사용)
PROXY_TOOL_CATALOG = [
    {"name": "fetch_db_schema", "kind": "read", "location": "proxy", "danger": False,
     "desc": "연결된 DB의 실제 스키마(테이블·컬럼·FK) 조회", "params": "(없음)",
     "detail": "운영 DB에서 스키마를 읽는다. 이 결과를 보고 create_entity 로 ERD를 만들 수 있다(결과 확인 후 후속 계획)."},
    {"name": "run_sql", "kind": "external", "location": "proxy", "danger": True,
     "desc": "연결된 DB에 SQL 실행(상위 50행 반환)", "params": "sql",
     "detail": "SQL을 실행한다. SQL 작성 전 대상 DB의 db_doc_<유형> 으로 문법·자료형을 참고하라. "
               "DML/DDL은 되돌리기 어려우므로 신중히. 사용자 승인(approve)을 거친다."},
    # ── 세분화 introspection·조회 툴 (2026-06-06 추가, 모두 읽기 전용) ──
    {"name": "list_db_tables", "kind": "read", "location": "proxy", "danger": False,
     "desc": "연결된 DB의 테이블·뷰 이름 목록(경량)", "params": "(없음)",
     "detail": "테이블/뷰 이름과 컬럼 수만 반환한다. 대상을 모를 때 먼저 호출해 좁힌 뒤 describe_db_table 로 상세를 본다."},
    {"name": "describe_db_table", "kind": "read", "location": "proxy", "danger": False,
     "desc": "특정 DB 테이블의 컬럼·PK·FK 상세", "params": "table",
     "detail": "운영 DB의 한 테이블 구조만 핀포인트로 조회한다(전체 스키마 blob 대신). 특정 테이블 분석 시 fetch_db_schema 보다 이걸 쓴다."},
    {"name": "get_db_constraints", "kind": "read", "location": "proxy", "danger": False,
     "desc": "테이블의 PK·UNIQUE·FK 제약 조회", "params": "table?(생략 시 전체 FK)",
     "detail": "특정 테이블의 PK/UNIQUE/FK, 또는 전체 FK 목록을 반환한다(읽기 전용)."},
    {"name": "find_db_column", "kind": "read", "location": "proxy", "danger": False,
     "desc": "컬럼명 키워드로 전 테이블 검색", "params": "keyword",
     "detail": "DB 전체에서 컬럼명에 keyword 가 포함된 (table, column) 을 찾는다. '이 컬럼 어느 테이블에?' 해소용."},
    {"name": "count_db_rows", "kind": "read", "location": "proxy", "danger": False,
     "desc": "테이블 행 수 조회(데이터 볼륨)", "params": "table",
     "detail": "지정 테이블의 COUNT(*) 를 반환한다. table 은 introspection 으로 검증된 실제 테이블만 허용(안전)."},
    {"name": "sample_db_rows", "kind": "read", "location": "proxy", "danger": False,
     "desc": "테이블 상위 N행 미리보기", "params": "table, limit?(기본10, 최대50)",
     "detail": "지정 테이블의 상위 N행을 조회한다(유형별 LIMIT/TOP/ROWNUM). 값 패턴 파악용. 실제 테이블만 허용."},
    {"name": "run_select", "kind": "read", "location": "proxy", "danger": False,
     "desc": "SELECT 전용 안전 조회(쓰기 차단)", "params": "sql(SELECT/WITH)",
     "detail": "SELECT/WITH 단일 조회만 허용한다(상위 50행). 쓰기(DML/DDL)는 거부 — 안전한 읽기는 run_sql 대신 이걸 쓴다(승인 불필요)."},
    {"name": "explain_query", "kind": "read", "location": "proxy", "danger": False,
     "desc": "SELECT 실행계획 조회(EXPLAIN)", "params": "sql(SELECT)",
     "detail": "SELECT 의 실행계획을 반환한다(MySQL·PostgreSQL). 미실행. 느린 쿼리 진단용."},
    {"name": "compare_erd_to_db", "kind": "read", "location": "proxy", "danger": False,
     "desc": "현재 ERD ↔ 운영 DB 스키마 드리프트 비교", "params": "erd(엔티티 목록 [{physicalName, columns[]}])",
     "detail": "ERD 엔티티 목록과 운영 DB 스키마를 대조해 ERD-only/DB-only 테이블·컬럼 차이를 반환한다. 호출 측이 현재 ERD를 erd 인자로 전달."},
] + DB_DOC_CATALOG
PROXY_TOOL_NAMES = {t["name"] for t in PROXY_TOOL_CATALOG}


# ── 헬퍼 ──────────────────────────────────────────────────────────
async def _load_full_schema(adapter, config) -> dict:
    """연결 DB의 전체 스키마({tables, views, fks})를 introspection 으로 적재."""
    from routers.schema import _build_result, _get_queries
    q = _get_queries(config["dbType"], config.get("schema") or "public")
    cols, views, fks, uq = await asyncio.gather(
        adapter.execute(config, q["columns"]),
        adapter.execute(config, q["views"]),
        adapter.execute(config, q["fks"]),
        adapter.execute(config, q["unique"]),
    )
    return _build_result(
        cols.get("rows") or [], views.get("rows") or [],
        fks.get("rows") or [], uq.get("rows") or [],
    )


def _all_tables(schema: dict) -> list:
    """테이블 + 뷰를 {tableName, isView, columns} 통일 형태로."""
    out = list(schema.get("tables") or [])
    for v in (schema.get("views") or []):
        out.append({"tableName": v.get("viewName"), "isView": True, "columns": v.get("columns") or []})
    return out


def _find_table(schema: dict, target: str):
    t = (target or "").strip().lower()
    if not t:
        return None
    # 'schema.table' 로 와도 끝 토큰으로 매칭
    short = t.split(".")[-1]
    for x in _all_tables(schema):
        nm = (x.get("tableName") or "").lower()
        if nm == t or nm == short:
            return x
    return None


def _quote_ident(db_type: str, name: str) -> str:
    n = str(name).replace('"', '').replace("`", "").replace("[", "").replace("]", "")
    if db_type == "mysql":
        return "`" + n + "`"
    if db_type == "mssql":
        return "[" + n + "]"
    return '"' + n + '"'   # postgres / oracle


def _select_limit(db_type: str, qid: str, n: int) -> str:
    if db_type == "mssql":
        return f"SELECT TOP {n} * FROM {qid}"
    if db_type == "oracle":
        return f"SELECT * FROM {qid} WHERE ROWNUM <= {n}"
    return f"SELECT * FROM {qid} LIMIT {n}"   # mysql / postgres


def _is_read_sql(sql: str) -> bool:
    low = sql.lower().lstrip("(").strip()
    if not (low.startswith("select") or low.startswith("with")):
        return False
    # 세미콜론으로 끝나는 단일 문만 허용(다중 문 차단)
    if ";" in sql.strip().rstrip(";"):
        return False
    return True


def _first_scalar(rows):
    if not rows:
        return None
    r0 = rows[0]
    if isinstance(r0, dict):
        for k in ("cnt", "CNT", "count", "COUNT"):
            if k in r0:
                return r0[k]
        return next(iter(r0.values()), None)
    if isinstance(r0, (list, tuple)):
        return r0[0] if r0 else None
    return r0


async def run_proxy_tool(name: str, args: dict) -> dict:
    # DB 유형별 참고 문서 — DB 연결 불필요 (config 체크보다 먼저)
    if name in DOC_TOOLS:
        return get_db_doc(name)
    config = load_config()
    if not config:
        return {"ok": False, "error": "DB 접속정보가 설정되지 않았습니다. (DB 연결 후 사용하세요)"}
    args = args or {}
    db_type = config["dbType"]
    try:
        adapter = get_adapter(db_type)

        if name == "run_sql":
            sql = (args.get("sql") or "").strip()
            if not sql:
                return {"ok": False, "error": "sql 이 비어 있습니다."}
            res = await adapter.execute(config, sql)
            rows = res.get("rows") or []
            return {"ok": True, "rowCount": res.get("rowCount"), "rows": rows[:50]}

        if name == "run_select":
            sql = (args.get("sql") or "").strip()
            if not sql:
                return {"ok": False, "error": "sql 이 비어 있습니다."}
            if not _is_read_sql(sql):
                return {"ok": False, "error": "run_select 는 단일 SELECT/WITH 조회만 허용합니다(쓰기는 run_sql)."}
            res = await adapter.execute(config, sql)
            rows = res.get("rows") or []
            return {"ok": True, "rowCount": res.get("rowCount"), "rows": rows[:50]}

        if name == "explain_query":
            sql = (args.get("sql") or "").strip()
            if not sql:
                return {"ok": False, "error": "sql 이 비어 있습니다."}
            if not _is_read_sql(sql):
                return {"ok": False, "error": "explain_query 는 SELECT 만 지원합니다."}
            if db_type not in ("mysql", "postgres"):
                return {"ok": False, "error": f"{db_type} 실행계획은 아직 미지원입니다(MySQL·PostgreSQL만)."}
            res = await adapter.execute(config, "EXPLAIN " + sql)
            return {"ok": True, "plan": (res.get("rows") or [])[:50]}

        if name == "fetch_db_schema":
            schema = await _load_full_schema(adapter, config)
            return {"ok": True, "schema": schema, "tableCount": len(schema.get("tables", []))}

        if name == "list_db_tables":
            schema = await _load_full_schema(adapter, config)
            tables = [{"tableName": t.get("tableName"), "isView": False, "columnCount": len(t.get("columns") or [])}
                      for t in schema.get("tables", [])]
            views = [{"tableName": v.get("viewName"), "isView": True, "columnCount": len(v.get("columns") or [])}
                     for v in schema.get("views", [])]
            allt = tables + views
            return {"ok": True, "tableCount": len(allt), "tables": allt}

        if name == "describe_db_table":
            target = (args.get("table") or args.get("tableName") or args.get("name") or "").strip()
            if not target:
                return {"ok": False, "error": "table 인자가 필요합니다."}
            schema = await _load_full_schema(adapter, config)
            t = _find_table(schema, target)
            if not t:
                return {"ok": False, "error": "테이블을 찾을 수 없습니다: " + target,
                        "available": [x.get("tableName") for x in _all_tables(schema)][:50]}
            tn = t.get("tableName")
            fks = [f for f in (schema.get("fks") or [])
                   if (f.get("fromTable") or "").lower() == (tn or "").lower()
                   or (f.get("toTable") or "").lower() == (tn or "").lower()]
            return {"ok": True, "table": {"tableName": tn, "isView": t.get("isView", False),
                                          "columns": t.get("columns") or [], "foreignKeys": fks}}

        if name == "get_db_constraints":
            schema = await _load_full_schema(adapter, config)
            target = (args.get("table") or args.get("tableName") or "").strip()
            if target:
                t = _find_table(schema, target)
                if not t:
                    return {"ok": False, "error": "테이블을 찾을 수 없습니다: " + target}
                tn = t.get("tableName")
                cols = t.get("columns") or []
                return {"ok": True, "table": tn,
                        "primaryKey": [c.get("columnName") for c in cols if c.get("isPk")],
                        "unique": [c.get("columnName") for c in cols if c.get("isUnique")],
                        "foreignKeys": [f for f in (schema.get("fks") or []) if (f.get("fromTable") or "").lower() == (tn or "").lower()]}
            return {"ok": True, "foreignKeys": schema.get("fks") or [], "tableCount": len(schema.get("tables", []))}

        if name == "find_db_column":
            kw = (args.get("keyword") or args.get("name") or args.get("column") or "").strip().lower()
            if not kw:
                return {"ok": False, "error": "keyword 가 필요합니다."}
            schema = await _load_full_schema(adapter, config)
            hits = []
            for t in _all_tables(schema):
                for c in (t.get("columns") or []):
                    if kw in (c.get("columnName") or "").lower():
                        hits.append({"table": t.get("tableName"), "column": c.get("columnName"),
                                     "dataType": c.get("dataType") or "", "isPk": c.get("isPk", False)})
            return {"ok": True, "matchCount": len(hits), "matches": hits[:100]}

        if name == "count_db_rows":
            target = (args.get("table") or args.get("tableName") or "").strip()
            if not target:
                return {"ok": False, "error": "table 인자가 필요합니다."}
            schema = await _load_full_schema(adapter, config)
            t = _find_table(schema, target)
            if not t:
                return {"ok": False, "error": "테이블을 찾을 수 없습니다: " + target,
                        "available": [x.get("tableName") for x in _all_tables(schema)][:50]}
            qid = _quote_ident(db_type, t.get("tableName"))
            res = await adapter.execute(config, f"SELECT COUNT(*) AS cnt FROM {qid}")
            return {"ok": True, "table": t.get("tableName"), "rowCount": _first_scalar(res.get("rows") or [])}

        if name == "sample_db_rows":
            target = (args.get("table") or args.get("tableName") or "").strip()
            if not target:
                return {"ok": False, "error": "table 인자가 필요합니다."}
            try:
                n = int(args.get("limit") or args.get("n") or 10)
            except (TypeError, ValueError):
                n = 10
            n = max(1, min(n, 50))
            schema = await _load_full_schema(adapter, config)
            t = _find_table(schema, target)
            if not t:
                return {"ok": False, "error": "테이블을 찾을 수 없습니다: " + target,
                        "available": [x.get("tableName") for x in _all_tables(schema)][:50]}
            qid = _quote_ident(db_type, t.get("tableName"))
            res = await adapter.execute(config, _select_limit(db_type, qid, n))
            rows = (res.get("rows") or [])[:n]
            return {"ok": True, "table": t.get("tableName"), "rowCount": len(rows), "rows": rows}

        if name == "compare_erd_to_db":
            erd = args.get("erd") or args.get("entities") or []
            if not isinstance(erd, list):
                return {"ok": False, "error": "erd(엔티티 목록)이 필요합니다."}
            schema = await _load_full_schema(adapter, config)
            db_tables = {(t.get("tableName") or "").lower(): t for t in schema.get("tables", [])}
            erd_map = {}
            for e in erd:
                nm = str(e.get("physicalName") or e.get("name") or e.get("tableName") or "").strip()
                if nm:
                    erd_map[nm.lower()] = e
            only_erd = [erd_map[k].get("physicalName") or erd_map[k].get("name") for k in erd_map if k not in db_tables]
            only_db = [db_tables[k].get("tableName") for k in db_tables if k not in erd_map]
            col_diffs = []
            for k in erd_map:
                if k not in db_tables:
                    continue
                e = erd_map[k]
                erd_cols = set()
                for c in (e.get("columns") or e.get("attrs") or []):
                    cn = c.get("physicalName") or c.get("name") if isinstance(c, dict) else c
                    if cn:
                        erd_cols.add(str(cn).lower())
                db_cols = {(c.get("columnName") or "").lower() for c in (db_tables[k].get("columns") or [])}
                in_db = sorted(db_cols - erd_cols)
                in_erd = sorted(erd_cols - db_cols)
                if in_db or in_erd:
                    col_diffs.append({"table": db_tables[k].get("tableName"),
                                      "inDbNotErd": in_db[:20], "inErdNotDb": in_erd[:20]})
            return {"ok": True, "tablesOnlyInErd": only_erd, "tablesOnlyInDb": only_db, "columnDiffs": col_diffs}

        return {"ok": False, "error": "알 수 없는 프록시 툴: " + name}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
