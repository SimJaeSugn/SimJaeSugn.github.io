"""answer 노드 — 툴 없이 직접 응답 (토큰 스트리밍). 멀티턴 히스토리 반영.

LLM 호출이 노드 안에서 일어나므로, 라우터가 graph.astream(stream_mode="messages")
로 구동하면 이 노드의 토큰이 실시간으로 흘러나간다.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import (
    ANSWER_ACT_NOTE,
    ANSWER_SYSTEM,
    capabilities_text,
    context_brief,
)
from agent.common.state import AgentState, recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG


def answer_node(state: AgentState) -> dict:
    system = ANSWER_SYSTEM
    if state.get("route") == "act":
        # M1 잔재: 행동 경로가 answer 로 온 경우 안내(M2부터 act 는 plan 으로 감)
        system += ANSWER_ACT_NOTE
    # 역량 목록 = 클라 툴(컨텍스트) + 프록시 DB 툴 → "DB 스키마 조회 같은 건 못 한다"는 오답 방지
    ctx_tools = list((state.get("erd_context") or {}).get("tools") or []) + PROXY_TOOL_CATALOG
    caps = capabilities_text({"tools": ctx_tools})
    if caps:
        system += "\n\n" + caps
    system += "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
    llm = get_llm(MODEL_MAIN)
    # 시스템(현재 ERD) + 최근 대화 히스토리(마지막이 현재 질문)
    msgs = [("system", system)] + recent_messages(state)
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰 중계
    return {"messages": [resp], "response": resp.content}
