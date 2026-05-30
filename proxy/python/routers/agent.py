"""에이전트 라우터 — 자연어 ERD 제어.

M1: 직접 응답 스트리밍(ANSWER)
M2: plan-execute 루프 + interrupt/resume (ACT)

엔드포인트
    POST /agent/stream  — 질의 → 그래프 실행 → SSE(meta·token·interrupt·done·error)
    POST /agent/resume  — interrupt 결과 회신 → 그래프 재개 → SSE 계속
    GET  /agent/key     — OpenAI 키 설정 여부
    POST /agent/key     — OpenAI 키 저장(암호화)

SSE 이벤트
    meta      {threadId}
    token     {t}            answer/respond 노드의 토큰
    interrupt {type, calls}  클라이언트 툴 실행 위임 (이후 /resume 필요)
    done      {}             그래프 종료
    error     {error}
"""
import json
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel

from agent.common.keys import has_openai_key, set_openai_key
from agent.common.llm import OpenAIKeyMissing
from agent.graph import graph
from utils.audit_logger import write_audit_log

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _new_thread_id() -> str:
    return "t_" + uuid.uuid4().hex[:12]


async def _run(graph_input, cfg):
    """그래프를 astream 으로 구동하며 SSE 프레임을 yield.

    interrupt 를 만나면 'interrupt' 이벤트를 내고 즉시 종료한다(클라가 /resume).
    끝까지 가면 'done' 을 낸다.
    """
    async for mode, chunk in graph.astream(
        graph_input, cfg, stream_mode=["messages", "updates"]
    ):
        if mode == "messages":
            msg, meta = chunk
            node = (meta or {}).get("langgraph_node")
            token = getattr(msg, "content", "") or ""
            if token and node in ("answer", "respond"):
                yield _sse("token", {"t": token})
        elif mode == "updates":
            if isinstance(chunk, dict) and "__interrupt__" in chunk:
                intr = chunk["__interrupt__"]
                value = intr[0].value if isinstance(intr, (list, tuple)) else getattr(intr, "value", {})
                yield _sse("interrupt", value)
                return  # 클라이언트 resume 대기
    yield _sse("done", {})


# ── POST /agent/stream ────────────────────────────────────────────────────────

class StreamBody(BaseModel):
    query: str
    context: Optional[dict] = None
    threadId: Optional[str] = None


@router.post("/stream")
async def stream(body: StreamBody):
    if not body.query or not body.query.strip():
        raise HTTPException(status_code=400, detail="질의가 비어 있습니다.")
    if not has_openai_key():
        raise HTTPException(
            status_code=400,
            detail="OpenAI 키가 설정되지 않았습니다. Agent 패널에서 키를 입력하세요.",
        )

    thread_id = body.threadId or _new_thread_id()
    cfg = {"configurable": {"thread_id": thread_id}}
    inp = {"messages": [("user", body.query.strip())], "erd_context": body.context or {}}
    write_audit_log("AGENT", body.query.strip(), {"thread": thread_id})

    async def gen():
        yield _sse("meta", {"threadId": thread_id})
        try:
            async for frame in _run(inp, cfg):
                yield frame
        except OpenAIKeyMissing as e:
            yield _sse("error", {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            write_audit_log("AGENT", body.query.strip(), {"error": str(e)})
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── POST /agent/resume ────────────────────────────────────────────────────────

class ResumeBody(BaseModel):
    threadId: str
    resume: Any  # 클라이언트가 실행한 툴 결과 목록


@router.post("/resume")
async def resume(body: ResumeBody):
    if not body.threadId:
        raise HTTPException(status_code=400, detail="threadId 가 필요합니다.")
    cfg = {"configurable": {"thread_id": body.threadId}}

    async def gen():
        yield _sse("meta", {"threadId": body.threadId})
        try:
            async for frame in _run(Command(resume=body.resume), cfg):
                yield frame
        except OpenAIKeyMissing as e:
            yield _sse("error", {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            write_audit_log("AGENT_RESUME", body.threadId, {"error": str(e)})
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── /agent/key ────────────────────────────────────────────────────────────────

class KeyBody(BaseModel):
    apiKey: str


@router.get("/key")
def get_key():
    return {"configured": has_openai_key()}


@router.post("/key")
def post_key(body: KeyBody):
    key = (body.apiKey or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="API 키가 비어 있습니다.")
    set_openai_key(key)
    return {"ok": True, "configured": True}
