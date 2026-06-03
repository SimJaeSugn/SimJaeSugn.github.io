"""에이전트 v2 라우터.

V2-M1: v1과 동일 토폴로지·동작 미러로 시작.
P0: analyze→4분기→plan 골격 배선 + intent·plan 관측 SSE 이벤트 추가(기존 이벤트 불변).
thread_id 는 'v2_' 접두(§9.1 불변식 ③ 네임스페이스 분리).
audit 로그는 AGENT_V2 / AGENT_V2_RESUME 로 식별 분리.

엔드포인트
    POST /agent/v2/stream  — 질의 → 그래프 실행 → SSE(meta·intent·plan·token·interrupt·done·error)
    POST /agent/v2/resume  — interrupt 결과 회신 → 그래프 재개 → SSE 계속
    GET  /agent/v2/key     — OpenAI 키 설정 여부
    POST /agent/v2/key     — OpenAI 키 저장(암호화)
    GET  /agent/v2/config  — Agent 설정 조회
    POST /agent/v2/config  — Agent 설정 저장
    POST /agent/v2/eval    — 픽스처 일괄 채점(dry-run) → 스코어카드(§7)

SSE 이벤트
    meta      {threadId}
    intent    {kind,summary,goals,...}  analyze 노드 산출 IntentSpec (P0 신규)
    plan      {steps}        plan 노드 산출 StepV2[] (P0 신규)
    token     {t}            answer/respond 노드의 토큰
    interrupt {type, calls}  클라이언트 툴 실행 위임 (이후 /resume 필요)
    done      {}             그래프 종료
    error     {error}
"""
import json
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel

from agent.common.keys import get_agent_config, has_openai_key, set_agent_config, set_openai_key
from agent.common.llm import OpenAIKeyMissing
from agent.v2.eval.runner import DEFAULT_FIXTURES, run_fixtures   # v2 검증 오라클(§7)
from agent.v2.graph import graph          # v1과 달리 agent.v2.graph (§9.1 불변식 ①)
from utils.audit_logger import write_audit_log

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _new_thread_id_v2() -> str:
    """v2 전용 thread_id — 'v2_' 접두로 네임스페이스 분리(§9.1 불변식 ③)."""
    return "v2_" + uuid.uuid4().hex[:12]


async def _run(graph_input, cfg):
    """그래프를 astream 으로 구동하며 SSE 프레임을 yield.

    intent·plan SSE 이벤트가 추가됨 (기존 이벤트 불변).
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

            # 신규: analyze 노드 → intent SSE 이벤트
            if "analyze" in chunk:
                intent = chunk["analyze"].get("intent")
                if intent:
                    yield _sse("intent", intent)

            # 신규: plan 노드 → plan SSE 이벤트
            elif "plan" in chunk:
                steps = chunk["plan"].get("plan") or []
                if steps:
                    yield _sse("plan", {"steps": steps})

            # 기존: interrupt 처리 — 독립 if (intent/plan 분기와 한 청크에 공존해도 누락되지 않도록)
            if "__interrupt__" in chunk:
                intr = chunk["__interrupt__"]
                value = intr[0].value if isinstance(intr, (list, tuple)) else getattr(intr, "value", {})
                yield _sse("interrupt", value)
                return   # 클라이언트 resume 대기

    yield _sse("done", {})


# ── POST /agent/v2/stream ─────────────────────────────────────────────────────

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

    thread_id = body.threadId or _new_thread_id_v2()
    cfg = {"configurable": {"thread_id": thread_id}}
    inp = {"messages": [("user", body.query.strip())], "erd_context": body.context or {}}
    write_audit_log("AGENT_V2", body.query.strip(), {"thread": thread_id})

    async def gen():
        yield _sse("meta", {"threadId": thread_id})
        try:
            async for frame in _run(inp, cfg):
                yield frame
        except OpenAIKeyMissing as e:
            yield _sse("error", {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            write_audit_log("AGENT_V2", body.query.strip(), {"error": str(e)})
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── POST /agent/v2/resume ─────────────────────────────────────────────────────

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
            write_audit_log("AGENT_V2_RESUME", body.threadId, {"error": str(e)})
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── POST /agent/v2/eval ───────────────────────────────────────────────────────
# 픽스처 일괄 채점(dry-run) — analyze→plan 까지만 돌려 의도·계획 품질을 수치화한다.
# 실제 ERD/DB 를 건드리지 않는다(execute 미경유, §7.2). 동기 LLM 호출은 threadpool 로 위임.

class EvalBody(BaseModel):
    path: Optional[str] = None                    # 미지정 시 기본 픽스처
    reps: int = 5                                 # 케이스당 반복(비결정성 대비)
    split: str = "all"                            # all|golden|holdout


@router.post("/eval")
async def eval_run(body: EvalBody):
    if not has_openai_key():
        raise HTTPException(
            status_code=400,
            detail="OpenAI 키가 설정되지 않았습니다. 설정 ▸ Agent설정에서 키를 입력하세요.",
        )
    if body.split not in ("all", "golden", "holdout"):
        raise HTTPException(status_code=400, detail="split 은 all|golden|holdout 중 하나여야 합니다.")
    reps = max(1, min(int(body.reps or 1), 20))   # 1~20 제한
    write_audit_log("AGENT_V2_EVAL", body.path or DEFAULT_FIXTURES, {"reps": reps, "split": body.split})
    try:
        # 동기(blocking) 노드 호출 → 이벤트 루프 비차단 위해 threadpool 위임
        return await run_in_threadpool(run_fixtures, body.path or DEFAULT_FIXTURES, reps, body.split)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="픽스처 파일을 찾을 수 없습니다.")
    except OpenAIKeyMissing as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── /agent/v2/key ─────────────────────────────────────────────────────────────

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


# ── /agent/v2/config ──────────────────────────────────────────────────────────

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
