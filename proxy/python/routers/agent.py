"""에이전트 라우터 — 자연어 ERD 제어 (M1: 직접 응답 스트리밍).

엔드포인트
    POST /agent/stream  — 질의 → 그래프 실행 → SSE(meta·token·done·error)
    GET  /agent/key     — OpenAI 키 설정 여부
    POST /agent/key     — OpenAI 키 저장(암호화)
"""
import json
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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

    async def gen():
        yield _sse("meta", {"threadId": thread_id})
        try:
            async for msg, meta in graph.astream(inp, cfg, stream_mode="messages"):
                node = (meta or {}).get("langgraph_node")
                token = getattr(msg, "content", "") or ""
                # 답변 노드의 토큰만 흘린다 (gate 의 구조화 출력은 제외)
                if token and node == "answer":
                    yield _sse("token", {"t": token})
            write_audit_log("AGENT_ANSWER", body.query.strip(), {"thread": thread_id})
            yield _sse("done", {})
        except OpenAIKeyMissing as e:
            yield _sse("error", {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            write_audit_log("AGENT_ANSWER", body.query.strip(), {"error": str(e)})
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
