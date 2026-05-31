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
] + DB_DOC_CATALOG
PROXY_TOOL_NAMES = {t["name"] for t in PROXY_TOOL_CATALOG}


async def run_proxy_tool(name: str, args: dict) -> dict:
    # DB 유형별 참고 문서 — DB 연결 불필요 (config 체크보다 먼저)
    if name in DOC_TOOLS:
        return get_db_doc(name)
    config = load_config()
    if not config:
        return {"ok": False, "error": "DB 접속정보가 설정되지 않았습니다. (DB 연결 후 사용하세요)"}
    try:
        adapter = get_adapter(config["dbType"])
        if name == "run_sql":
            sql = ((args or {}).get("sql") or "").strip()
            if not sql:
                return {"ok": False, "error": "sql 이 비어 있습니다."}
            res = await adapter.execute(config, sql)
            rows = res.get("rows") or []
            return {"ok": True, "rowCount": res.get("rowCount"), "rows": rows[:50]}
        if name == "fetch_db_schema":
            from routers.schema import _build_result, _get_queries
            q = _get_queries(config["dbType"], config.get("schema") or "public")
            cols, views, fks, uq = await asyncio.gather(
                adapter.execute(config, q["columns"]),
                adapter.execute(config, q["views"]),
                adapter.execute(config, q["fks"]),
                adapter.execute(config, q["unique"]),
            )
            schema = _build_result(
                cols.get("rows") or [], views.get("rows") or [],
                fks.get("rows") or [], uq.get("rows") or [],
            )
            return {"ok": True, "schema": schema, "tableCount": len(schema.get("tables", []))}
        return {"ok": False, "error": "알 수 없는 프록시 툴: " + name}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
