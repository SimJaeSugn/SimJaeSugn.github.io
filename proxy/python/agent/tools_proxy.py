"""프록시(서버) 측 툴 — DB 연계 (location="proxy").

클라이언트 ERD 상태가 아니라 실제 DB에 접근하므로 그래프 안에서 직접 실행한다
(클라 interrupt 위임 없음). 기존 db 어댑터·schema 로직을 재사용.
DB 미설정/오류 시 예외 대신 {ok:False, error} 를 반환해 그래프가 계속되게 한다.
"""
import asyncio

from db.connector import get_adapter, close_all_pools
from routers.config import load_config, _load_raw_store, _save_store, _get_default_port
from utils.crypto import encrypt
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
    {"name": "get_db_connection_info", "kind": "read", "location": "proxy", "danger": False,
     "desc": "현재 연결된 DB 접속 프로파일 정보(비밀번호 제외)", "params": "(없음)",
     "detail": "현재 설정된 DB 접속 정보(유형·host·port·database·사용자·스키마, Oracle은 clientLibDir)를 반환한다. "
               "비밀번호는 보안상 절대 포함하지 않는다. '어느 DB에 붙어 있어?'·접속 환경 확인·SQL 작성 전 대상 DB 유형 파악용. DB 쿼리 없이 설정만 읽는다."},
    {"name": "list_db_profiles", "kind": "read", "location": "proxy", "danger": False,
     "desc": "저장된 DB 접속 프로파일 목록(활성 표시, 비밀번호 제외)", "params": "(없음)",
     "detail": "등록된 모든 DB 접속 프로파일(이름·유형·host·database·사용자·활성여부)과 현재 활성 프로파일을 반환한다. 비밀번호는 제외. 추가·수정·삭제·전환은 manage_db_profile."},
    {"name": "manage_db_profile", "kind": "write", "location": "proxy", "danger": True,
     "desc": "DB 접속 프로파일 추가·수정·삭제·활성화", "params": "action(add|update|delete|activate), name, [dbType,host,port,database,username,password,schema,clientLibDir]",
     "detail": "DB 접속 프로파일을 관리한다. action=add(신규 등록 — dbType·host·database·username·password 필요), update(부분 수정), delete(활성·마지막 프로파일은 불가), activate(활성 전환 — 연결 풀 재설정). "
               "접속정보를 바꾸는 작업이라 사용자 승인(approve)을 거친다. 어느 프로파일이 있는지 모르면 먼저 list_db_profiles."},
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
    # ── 데이터 기반 분석 툴 (2026-06-06 추가, 읽기 전용) ──
    {"name": "profile_table", "kind": "read", "location": "proxy", "danger": False,
     "desc": "테이블 컬럼 프로파일(NULL율·distinct)", "params": "table",
     "detail": "지정 테이블의 각 컬럼(상위 20개)에 대해 총행수·NULL 수·NULL율·distinct 수를 한 번의 집계 쿼리로 반환한다. 데이터 품질·분포 파악용."},
    {"name": "check_referential_integrity", "kind": "read", "location": "proxy", "danger": False,
     "desc": "FK 참조 무결성 실측(고아 참조)", "params": "table?(생략 시 전체 FK)",
     "detail": "스키마 FK 별로 부모에 없는 자식 값(고아 참조) 수를 LEFT JOIN 으로 실측한다. '실제 데이터가 FK를 지키는가'."},
    {"name": "measure_cardinality", "kind": "read", "location": "proxy", "danger": False,
     "desc": "관계 카디널리티 실측(1:1/1:N)", "params": "from, to",
     "detail": "두 테이블 사이 FK 의 부모당 자식 최대수를 측정해 1:1/1:N 을 추론한다(데이터 기반)."},
    {"name": "find_data_anomalies", "kind": "read", "location": "proxy", "danger": False,
     "desc": "데이터 이상 탐지(빈 테이블·NN위반·중복PK)", "params": "table?(생략 시 상위 10개)",
     "detail": "빈 테이블, NOT NULL 컬럼의 NULL 값, 단일 PK 중복을 실측해 보고한다(테이블당 쿼리 다수 — 범위 제한)."},
    {"name": "suggest_indexes", "kind": "read", "location": "proxy", "danger": False,
     "desc": "인덱스 추천(인덱스 없는 FK 등)", "params": "(없음)",
     "detail": "PK/UNIQUE 가 아닌 FK 컬럼을 인덱스 후보로 추천한다(스키마 분석, DB 쿼리 없음)."},
    {"name": "apply_erd_to_db", "kind": "external", "location": "proxy", "danger": True,
     "desc": "ERD DDL을 운영 DB에 실행(포워드 엔지니어링)", "params": "ddl(CREATE/ALTER 문, 세미콜론 구분)",
     "detail": "ddl 인자의 SQL(여러 문)을 운영 DB에 순차 실행한다. 되돌리기 어려움 — 사용자 승인(approve) 필수. "
               "보통 generate_ddl 로 만든 DDL을 ddl 인자로 전달한다."},
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


# ── M6: 메타테이블 숨김 헬퍼 ─────────────────────────────────────────────────────
# 에이전트 introspection 결과에서 UXERManager 내부 메타테이블을 제외한다.
_UXER_META_TABLES_P = {"UXER_ERD_DIAGRAM"}  # 대문자 비교용


def _is_not_meta_p(name: str) -> bool:
    return (name or "").upper() not in _UXER_META_TABLES_P


def _filter_meta_schema(schema: dict) -> dict:
    """tables/views/fks 에서 메타테이블을 제거한 새 dict 반환. 원본 불변."""
    return {
        "tables": [t for t in schema.get("tables", [])
                   if _is_not_meta_p(t.get("tableName"))],
        "views":  [v for v in schema.get("views", [])
                   if _is_not_meta_p(v.get("viewName"))],
        "fks":    [f for f in schema.get("fks", [])
                   if _is_not_meta_p(f.get("fromTable"))
                   and _is_not_meta_p(f.get("toTable"))],
    }


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


async def _handle_profile_tool(name: str, args: dict) -> dict:
    """DB 접속 프로파일 CRUD·활성화 — routers.config 저장소 헬퍼 직접 사용(활성 연결 불요).

    비밀번호는 목록 응답에 절대 포함하지 않으며, 저장 시 encrypt() 한다.
    """
    store = _load_raw_store() or {"profiles": [], "active": None}
    profiles = store.get("profiles", [])

    if name == "list_db_profiles":
        active = store.get("active")
        return {"ok": True, "active": active, "count": len(profiles),
                "profiles": [{"name": p.get("name"), "dbType": p.get("dbType"), "host": p.get("host"),
                              "port": p.get("port"), "database": p.get("database"),
                              "username": p.get("username"), "schema": p.get("schema", ""),
                              "active": p.get("name") == active} for p in profiles]}

    # manage_db_profile
    action = str(args.get("action") or "").strip().lower()
    pname = str(args.get("name") or "").strip()
    if action not in ("add", "update", "delete", "activate"):
        return {"ok": False, "error": "action 은 add·update·delete·activate 중 하나여야 합니다."}
    if not pname:
        return {"ok": False, "error": "name(프로파일 이름)이 필요합니다."}

    def _idx(n):
        return next((i for i, p in enumerate(profiles) if p.get("name") == n), -1)

    if action == "add":
        if _idx(pname) != -1:
            return {"ok": False, "error": f"'{pname}' 프로파일이 이미 존재합니다."}
        db_type = str(args.get("dbType") or "").strip()
        if not (db_type and args.get("host") and args.get("database") and args.get("username")):
            return {"ok": False, "error": "add 에는 dbType·host·database·username(과 password)이 필요합니다."}
        profiles.append({
            "name": pname, "dbType": db_type, "host": args.get("host"),
            "port": args.get("port") or _get_default_port(db_type),
            "database": args.get("database"), "username": args.get("username"),
            "password": encrypt(str(args.get("password") or "")),
            "schema": args.get("schema") or "",
            "clientLibDir": (args.get("clientLibDir") if db_type == "oracle" and args.get("clientLibDir") else ""),
        })
        if not store.get("active"):
            store["active"] = pname
        store["profiles"] = profiles
        _save_store(store)
        return {"ok": True, "note": f"프로파일 '{pname}' 추가됨." + ("" if store.get("active") != pname else " (활성)")}

    if action == "update":
        i = _idx(pname)
        if i == -1:
            return {"ok": False, "error": f"'{pname}' 프로파일을 찾을 수 없습니다."}
        ex = profiles[i]
        db_type = str(args.get("dbType") or ex.get("dbType"))
        upd = {**ex, "dbType": db_type,
               "host": args.get("host", ex.get("host")),
               "port": args.get("port") or ex.get("port") or _get_default_port(db_type),
               "database": args.get("database", ex.get("database")),
               "username": args.get("username", ex.get("username")),
               "schema": args.get("schema") if args.get("schema") is not None else ex.get("schema", "")}
        if args.get("password"):
            upd["password"] = encrypt(str(args.get("password")))
        if args.get("clientLibDir") is not None:
            upd["clientLibDir"] = args.get("clientLibDir") if db_type == "oracle" and args.get("clientLibDir") else ""
        profiles[i] = upd
        store["profiles"] = profiles
        _save_store(store)
        if store.get("active") == pname:
            await close_all_pools()
        return {"ok": True, "note": f"프로파일 '{pname}' 수정됨."}

    if action == "delete":
        i = _idx(pname)
        if i == -1:
            return {"ok": False, "error": f"'{pname}' 프로파일을 찾을 수 없습니다."}
        if store.get("active") == pname:
            return {"ok": False, "error": "활성 프로파일은 삭제할 수 없습니다(먼저 다른 프로파일을 활성화하세요)."}
        if len(profiles) <= 1:
            return {"ok": False, "error": "마지막 프로파일은 삭제할 수 없습니다."}
        profiles.pop(i)
        store["profiles"] = profiles
        _save_store(store)
        return {"ok": True, "note": f"프로파일 '{pname}' 삭제됨."}

    # activate
    if _idx(pname) == -1:
        return {"ok": False, "error": f"'{pname}' 프로파일을 찾을 수 없습니다."}
    store["active"] = pname
    _save_store(store)
    await close_all_pools()
    return {"ok": True, "note": f"'{pname}' 프로파일로 전환됨(연결 풀 재설정)."}


async def run_proxy_tool(name: str, args: dict) -> dict:
    # DB 유형별 참고 문서 — DB 연결 불필요 (config 체크보다 먼저)
    if name in DOC_TOOLS:
        return get_db_doc(name)
    # 프로파일 관리 — 활성 연결과 무관(첫 프로파일 추가도 가능)하므로 config 체크 이전에 처리
    if name in ("list_db_profiles", "manage_db_profile"):
        return await _handle_profile_tool(name, args or {})
    config = load_config()
    if not config:
        return {"ok": False, "error": "DB 접속정보가 설정되지 않았습니다. (DB 연결 후 사용하세요)"}
    args = args or {}
    db_type = config["dbType"]

    # 접속 프로파일 정보 — DB 쿼리/어댑터 불필요(드라이버 오류와 무관하게 진단 가능)하므로 try 밖에서 처리.
    # 비밀번호는 보안상 절대 포함하지 않는다.
    if name == "get_db_connection_info":
        info = {
            "dbType": config.get("dbType"),
            "host": config.get("host"),
            "port": config.get("port"),
            "database": config.get("database"),
            "username": config.get("username"),
            "schema": config.get("schema") or "",
        }
        if config.get("name"):
            info["profileName"] = config.get("name")
        if config.get("dbType") == "oracle" and config.get("clientLibDir"):
            info["clientLibDir"] = config.get("clientLibDir")
        return {"ok": True, "connection": info}

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
            schema = _filter_meta_schema(schema)  # M6: 메타테이블 제외
            return {"ok": True, "schema": schema, "tableCount": len(schema.get("tables", []))}

        if name == "list_db_tables":
            schema = await _load_full_schema(adapter, config)
            schema = _filter_meta_schema(schema)  # M6: 메타테이블 제외
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
            schema = _filter_meta_schema(schema)  # M6: 메타테이블 제외
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

        if name == "profile_table":
            target = (args.get("table") or args.get("tableName") or "").strip()
            if not target:
                return {"ok": False, "error": "table 인자가 필요합니다."}
            schema = await _load_full_schema(adapter, config)
            t = _find_table(schema, target)
            if not t:
                return {"ok": False, "error": "테이블을 찾을 수 없습니다: " + target}
            cols = (t.get("columns") or [])[:20]
            if not cols:
                return {"ok": False, "error": "컬럼이 없습니다."}
            qt = _quote_ident(db_type, t.get("tableName"))
            parts = ["COUNT(*) AS _total"]
            for i, c in enumerate(cols):
                qc = _quote_ident(db_type, c.get("columnName"))
                parts.append(f"COUNT({qc}) AS c{i}_nn")
                parts.append(f"COUNT(DISTINCT {qc}) AS c{i}_d")
            res = await adapter.execute(config, "SELECT " + ", ".join(parts) + f" FROM {qt}")
            row = (res.get("rows") or [{}])[0] if (res.get("rows")) else {}

            def _g(k):
                if isinstance(row, dict):
                    for kk in (k, k.upper(), k.lower()):
                        if kk in row:
                            return row[kk]
                return None
            total = _g("_total") or 0
            profile = []
            for i, c in enumerate(cols):
                nn = _g(f"c{i}_nn") or 0
                d = _g(f"c{i}_d") or 0
                nulls = (total or 0) - (nn or 0)
                profile.append({"column": c.get("columnName"), "type": c.get("dataType") or "",
                                "nullCount": nulls, "nullRate": round(nulls / total, 3) if total else 0,
                                "distinct": d})
            return {"ok": True, "table": t.get("tableName"), "rowCount": total, "columns": profile}

        if name == "check_referential_integrity":
            schema = await _load_full_schema(adapter, config)
            target = (args.get("table") or "").strip().lower()
            checked = []
            for fk in (schema.get("fks") or [])[:40]:
                ft, fc, tt, tc = fk.get("fromTable"), fk.get("fromCol"), fk.get("toTable"), fk.get("toCol")
                if not (ft and fc and tt and tc):
                    continue
                if target and target not in (ft.lower(), tt.lower()):
                    continue
                qft, qtt = _quote_ident(db_type, ft), _quote_ident(db_type, tt)
                qfc, qtc = _quote_ident(db_type, fc), _quote_ident(db_type, tc)
                sql = (f"SELECT COUNT(*) AS cnt FROM {qft} f LEFT JOIN {qtt} t "
                       f"ON f.{qfc} = t.{qtc} WHERE f.{qfc} IS NOT NULL AND t.{qtc} IS NULL")
                try:
                    res = await adapter.execute(config, sql)
                    orphan = _first_scalar(res.get("rows") or [])
                except Exception as e:  # noqa: BLE001
                    orphan = None
                checked.append({"fk": f"{ft}.{fc} -> {tt}.{tc}", "orphanCount": orphan})
            bad = [c for c in checked if c["orphanCount"]]
            return {"ok": True, "checkedFks": len(checked), "allOk": len(bad) == 0, "violations": bad, "detail": checked}

        if name == "measure_cardinality":
            fr = (args.get("from") or args.get("fromTable") or "").strip()
            to = (args.get("to") or args.get("toTable") or "").strip()
            if not fr or not to:
                return {"ok": False, "error": "from·to 두 테이블이 필요합니다."}
            schema = await _load_full_schema(adapter, config)
            fk = None
            for f in (schema.get("fks") or []):
                if {(f.get("fromTable") or "").lower(), (f.get("toTable") or "").lower()} == {fr.lower(), to.lower()}:
                    fk = f
                    break
            if not fk:
                return {"ok": False, "error": "두 테이블 사이 FK를 스키마에서 찾지 못했습니다."}
            child, cfc = fk.get("fromTable"), fk.get("fromCol")
            qc, qcc = _quote_ident(db_type, child), _quote_ident(db_type, cfc)
            sql = (f"SELECT MAX(cnt) AS mx FROM (SELECT {qcc} AS k, COUNT(*) AS cnt "
                   f"FROM {qc} WHERE {qcc} IS NOT NULL GROUP BY {qcc}) x")
            res = await adapter.execute(config, sql)
            mx = _first_scalar(res.get("rows") or [])
            card = "1:1" if (mx is not None and mx <= 1) else "1:N"
            return {"ok": True, "fk": f"{fk.get('fromTable')}.{cfc} -> {fk.get('toTable')}.{fk.get('toCol')}",
                    "maxChildrenPerParent": mx, "inferredCardinality": card}

        if name == "find_data_anomalies":
            schema = await _load_full_schema(adapter, config)
            target = (args.get("table") or "").strip()
            if target:
                tt = _find_table(schema, target)
                tables = [tt] if tt else []
            else:
                tables = list(schema.get("tables") or [])[:10]
            anomalies = []
            for t in tables:
                tn = t.get("tableName")
                qt = _quote_ident(db_type, tn)
                try:
                    res = await adapter.execute(config, f"SELECT COUNT(*) AS cnt FROM {qt}")
                    total = _first_scalar(res.get("rows") or []) or 0
                except Exception:  # noqa: BLE001
                    continue
                if not total:
                    anomalies.append({"table": tn, "type": "empty", "note": "데이터 없음"})
                    continue
                nn_checked = 0
                for c in (t.get("columns") or []):
                    if c.get("isNullable") is False and nn_checked < 8:
                        nn_checked += 1
                        qc = _quote_ident(db_type, c.get("columnName"))
                        try:
                            res = await adapter.execute(config, f"SELECT COUNT(*) AS cnt FROM {qt} WHERE {qc} IS NULL")
                            nulls = _first_scalar(res.get("rows") or []) or 0
                            if nulls:
                                anomalies.append({"table": tn, "column": c.get("columnName"), "type": "null_in_notnull", "count": nulls})
                        except Exception:  # noqa: BLE001
                            pass
                pks = [c.get("columnName") for c in (t.get("columns") or []) if c.get("isPk")]
                if len(pks) == 1:
                    qp = _quote_ident(db_type, pks[0])
                    try:
                        res = await adapter.execute(config, f"SELECT COUNT(*) AS total, COUNT(DISTINCT {qp}) AS d FROM {qt}")
                        r0 = (res.get("rows") or [{}])[0]
                        tot = r0.get("total") if isinstance(r0, dict) else None
                        dis = r0.get("d") if isinstance(r0, dict) else None
                        if tot is not None and dis is not None and tot > dis:
                            anomalies.append({"table": tn, "column": pks[0], "type": "duplicate_pk", "count": tot - dis})
                    except Exception:  # noqa: BLE001
                        pass
            return {"ok": True, "anomalyCount": len(anomalies), "anomalies": anomalies[:50]}

        if name == "suggest_indexes":
            schema = await _load_full_schema(adapter, config)
            tmap = {(t.get("tableName") or "").lower(): t for t in schema.get("tables", [])}
            suggestions = []
            for fk in (schema.get("fks") or []):
                ft, fc = fk.get("fromTable"), fk.get("fromCol")
                t = tmap.get((ft or "").lower())
                col = None
                if t:
                    col = next((c for c in (t.get("columns") or []) if (c.get("columnName") or "").lower() == (fc or "").lower()), None)
                if col and not col.get("isPk") and not col.get("isUnique"):
                    suggestions.append({"table": ft, "column": fc, "reason": "FK 컬럼 — 조인 성능을 위해 인덱스 권장"})
            return {"ok": True, "count": len(suggestions), "suggestions": suggestions[:50]}

        if name == "apply_erd_to_db":
            ddl = (args.get("ddl") or args.get("sql") or "").strip()
            if not ddl:
                return {"ok": False, "error": "ddl 이 비어 있습니다."}
            stmts = [s.strip() for s in ddl.split(";") if s.strip()]
            if not stmts:
                return {"ok": False, "error": "실행할 DDL 문이 없습니다."}
            results = []
            ok_count = 0
            for st in stmts:
                try:
                    await adapter.execute(config, st)
                    results.append({"sql": st[:100], "ok": True})
                    ok_count += 1
                except Exception as e:  # noqa: BLE001
                    results.append({"sql": st[:100], "ok": False, "error": str(e)})
            return {"ok": True, "executed": ok_count, "total": len(stmts), "results": results}

        return {"ok": False, "error": "알 수 없는 프록시 툴: " + name}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
