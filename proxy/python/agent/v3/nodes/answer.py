"""answer 노드 — v1 answer 의 격리 복제본(§9.1 "수정해야 하면 복제").

차이점: 시스템 프롬프트에 [메모리] 섹션을 주입해, 답변(answer) 모드에서도 사용자가
기억시킨 영구 지침을 참조한다. 그 외 동작(역량 목록·현재 ERD·토큰 스트리밍)은 v1 과 동일.
v1 공유 모듈(ANSWER_SYSTEM·capabilities_text·context_brief 등)은 읽기 전용 재사용.
"""
from agent.common.llm import get_main_llm
from agent.common.prompts import (
    ANSWER_ACT_NOTE,
    ANSWER_SYSTEM,
    capabilities_text,
    context_brief,
)
from agent.common.state import recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG

from agent.v3.common.memory import render_memory_section
from agent.v3.common.state import AgentState


def answer_node(state: AgentState) -> dict:
    system = ANSWER_SYSTEM
    if state.get("route") == "act":
        system += ANSWER_ACT_NOTE
    ctx_tools = list((state.get("erd_context") or {}).get("tools") or []) + PROXY_TOOL_CATALOG
    caps = capabilities_text({"tools": ctx_tools})
    if caps:
        system += "\n\n" + caps
    # v3 추가: 사용자가 기억시킨 영구 지침 — 답변 모드에서도 항상 참조
    system += "\n\n[메모리(사용자가 기억시킨 영구 지침)]\n" + render_memory_section()
    system += "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
    llm = get_main_llm()
    msgs = [("system", system)] + recent_messages(state)
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰 중계
    return {"messages": [resp], "response": resp.content}
