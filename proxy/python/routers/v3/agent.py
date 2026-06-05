"""에이전트 v3 라우터 (ReAct 하이브리드 실험 레인).

V3-M1: v1/v2와 동일 토폴로지·동작 미러로 시작. 엔드포인트만 /agent/v3/* 로 분리.
thread_id 는 'v3_' 접두(§9.1 불변식 ③ 네임스페이스 분리).
audit 로그는 AGENT_V3 / AGENT_V3_RESUME 로 식별 분리.

격리: agent.v3.graph 만 import 한다(routers/agent.py·routers.v2 참조 금지).

엔드포인트
    POST /agent/v3/stream  — 질의 → 그래프 실행 → SSE(meta·intent·plan·token·interrupt·done·error)
    POST /agent/v3/resume  — interrupt 결과 회신 → 그래프 재개 → SSE 계속
    GET  /agent/v3/key     — OpenAI 키 설정 여부
    POST /agent/v3/key     — OpenAI 키 저장(암호화)
    GET  /agent/v3/config  — Agent 설정 조회
    POST /agent/v3/config  — Agent 설정 저장

SSE 이벤트
    meta        {threadId}
    intent      {kind,summary,goals,...}  analyze 노드 산출 IntentSpec
    thought     {thought,tool,args}       react 노드 — 이번 스텝 추론·다음 행동
    observation {tool,observation}        meta/proxy/client 실행 결과 관찰
    token       {t}            answer/respond 노드의 토큰
    interrupt   {type, calls}  클라이언트 툴 실행 위임 (이후 /resume 필요)
    done        {}             그래프 종료
    error       {error}
"""
import json
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel

from agent.common.keys import get_agent_config, has_openai_key, set_agent_config, set_openai_key
from agent.common.llm import OpenAIKeyMissing
from agent.v3.graph import graph          # v1·v2와 달리 agent.v3.graph (§9.1 불변식 ①)
from utils.audit_logger import write_audit_log

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _new_thread_id_v3() -> str:
    """v3 전용 thread_id — 'v3_' 접두로 네임스페이스 분리(§9.1 불변식 ③)."""
    return "v3_" + uuid.uuid4().hex[:12]


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
            if not isinstance(chunk, dict):
                continue

            # analyze 노드 → intent SSE 이벤트
            if "analyze" in chunk:
                intent = chunk["analyze"].get("intent")
                if intent:
                    yield _sse("intent", intent)

            # react 노드 → thought SSE 이벤트 (이번 스텝의 추론·다음 행동)
            if "react" in chunk:
                rc = chunk["react"]
                if rc.get("react_tool"):
                    yield _sse("thought", {
                        "thought": rc.get("react_thought") or "",
                        "tool": rc.get("react_tool"),
                        "args": rc.get("react_args") or {},
                    })

            # 행동 실행 노드 → observation SSE 이벤트 (scratchpad 마지막 항목)
            for _nd in ("meta_exec", "proxy_exec", "client_exec"):
                if _nd in chunk:
                    sp = chunk[_nd].get("scratchpad") or []
                    if sp:
                        e = sp[-1]
                        yield _sse("observation", {
                            "tool": e.get("tool"),
                            "observation": e.get("observation", ""),
                            "thought": e.get("thought", ""),
                        })

            # interrupt 처리 — 독립 if (다른 분기와 한 청크에 공존해도 누락 방지)
            if "__interrupt__" in chunk:
                intr = chunk["__interrupt__"]
                value = intr[0].value if isinstance(intr, (list, tuple)) else getattr(intr, "value", {})
                yield _sse("interrupt", value)
                return   # 클라이언트 resume 대기

    yield _sse("done", {})


# ── POST /agent/v3/stream ─────────────────────────────────────────────────────

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
            detail="OpenAI 키가 설정되지 않았습니다. 설정 ▸ Agent설정에서 키를 입력하세요.",
        )

    thread_id = body.threadId or _new_thread_id_v3()
    cfg = {"configurable": {"thread_id": thread_id}}
    inp = {"messages": [("user", body.query.strip())], "erd_context": body.context or {}}
    write_audit_log("AGENT_V3", body.query.strip(), {"thread": thread_id})

    async def gen():
        yield _sse("meta", {"threadId": thread_id})
        try:
            async for frame in _run(inp, cfg):
                yield frame
        except OpenAIKeyMissing as e:
            yield _sse("error", {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            write_audit_log("AGENT_V3", body.query.strip(), {"error": str(e)})
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── POST /agent/v3/resume ─────────────────────────────────────────────────────

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
            write_audit_log("AGENT_V3_RESUME", body.threadId, {"error": str(e)})
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── /agent/v3/key ─────────────────────────────────────────────────────────────

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


# ── /agent/v3/config ──────────────────────────────────────────────────────────

class AgentConfigBody(BaseModel):
    provider: Optional[str] = None
    modelMain: Optional[str] = None
    modelFast: Optional[str] = None


@router.get("/config")
def get_config():
    cfg = get_agent_config()
    return {
        "provider": cfg["provider"],
        "modelMain": cfg["modelMain"],
        "modelFast": cfg["modelFast"],
        "keyConfigured": has_openai_key(),
    }


@router.post("/config")
def post_config(body: AgentConfigBody):
    set_agent_config(
        provider=body.provider or "",
        model_main=body.modelMain or "",
        model_fast=body.modelFast or "",
    )
    return {"ok": True}
