import json
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db.connector import get_adapter
from routers.config import load_config
from utils.audit_logger import write_audit_log

router = APIRouter()


def _split_sql(sql: str) -> List[str]:
    results = []
    current = ""
    in_string = False
    string_char = ""
    for i, ch in enumerate(sql):
        if in_string:
            current += ch
            if ch == string_char and (i == 0 or sql[i - 1] != "\\"):
                in_string = False
        elif ch in ("'", '"'):
            in_string = True
            string_char = ch
            current += ch
        elif ch == ";":
            trimmed = current.strip()
            if trimmed:
                results.append(trimmed)
            current = ""
        else:
            current += ch
    trimmed = current.strip()
    if trimmed:
        results.append(trimmed)
    return results


def _parse_sqls(body_sqls, body_sql) -> List[str]:
    if body_sqls is not None:
        return [s for s in body_sqls if s and s.strip()]
    if body_sql is not None:
        return _split_sql(body_sql)
    return []


# ── POST /execute ─────────────────────────────────────────────────────────────

class ExecuteBody(BaseModel):
    sql: str


@router.post("")
@router.post("/")
async def execute_sql(body: ExecuteBody):
    config = load_config()
    if not config:
        raise HTTPException(status_code=400, detail="접속정보가 설정되지 않았습니다.")
    if not body.sql or not body.sql.strip():
        raise HTTPException(status_code=400, detail="SQL이 비어있습니다.")
    try:
        adapter = get_adapter(config["dbType"])
        start = time.time()
        result = await adapter.execute(config, body.sql.strip())
        duration = int((time.time() - start) * 1000)
        write_audit_log("EXECUTE", body.sql.strip(), {"durationMs": duration, "rowCount": result.get("rowCount", 0)})
        return {"ok": True, **result, "duration": duration}
    except Exception as e:
        write_audit_log("EXECUTE", body.sql.strip(), {"error": str(e)})
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail={"ok": False, "error": str(e)})


# ── POST /execute/stream ──────────────────────────────────────────────────────

class StreamBody(BaseModel):
    sqls: Optional[List[str]] = None
    sql: Optional[str] = None
    stopOnError: Optional[bool] = False


@router.post("/stream")
async def execute_stream(body: StreamBody):
    config = load_config()
    if not config:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="접속정보가 설정되지 않았습니다.")
    sqls = _parse_sqls(body.sqls, body.sql)
    if not sqls:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="실행할 SQL이 없습니다.")
    stop_on_error = body.stopOnError or False

    async def event_generator():
        adapter = get_adapter(config["dbType"])
        total = len(sqls)
        success = 0
        failed = 0
        start_all = time.time()

        for i, sql in enumerate(sqls):
            step = i + 1
            yield f"event: progress\ndata: {json.dumps({'step': step, 'total': total, 'sql': sql, 'status': 'running'}, ensure_ascii=False)}\n\n"
            try:
                start = time.time()
                result = await adapter.execute(config, sql)
                success += 1
                duration = int((time.time() - start) * 1000)
                write_audit_log("STREAM", sql, {"durationMs": duration, "rowCount": result.get("rowCount", 0)})
                yield f"event: progress\ndata: {json.dumps({'step': step, 'total': total, 'sql': sql, 'status': 'ok', 'rowCount': result.get('rowCount', 0), 'duration': duration}, ensure_ascii=False)}\n\n"
            except Exception as e:
                failed += 1
                write_audit_log("STREAM", sql, {"error": str(e)})
                yield f"event: error\ndata: {json.dumps({'step': step, 'total': total, 'sql': sql, 'error': str(e)}, ensure_ascii=False)}\n\n"
                if stop_on_error:
                    break

        total_duration = int((time.time() - start_all) * 1000)
        yield f"event: done\ndata: {json.dumps({'success': success, 'failed': failed, 'total': total, 'duration': total_duration}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
