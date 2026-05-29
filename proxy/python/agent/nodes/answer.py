"""answer 노드 — 툴 없이 직접 응답 (토큰 스트리밍).

LLM 호출이 노드 안에서 일어나므로, 라우터가 graph.astream(stream_mode="messages")
로 구동하면 이 노드의 토큰이 실시간으로 흘러나간다.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import ANSWER_ACT_NOTE, ANSWER_SYSTEM, context_brief
from agent.common.state import AgentState, last_user_text


def answer_node(state: AgentState) -> dict:
    user_msg = last_user_text(state)
    system = ANSWER_SYSTEM
    if state.get("route") == "act":
        # M1: 행동 경로 미구현 — 안내를 덧붙인다 (M2에서 plan 노드로 대체)
        system += ANSWER_ACT_NOTE
    llm = get_llm(MODEL_MAIN)
    msgs = [
        ("system", system),
        ("user", f"[현재 ERD]\n{context_brief(state.get('erd_context'))}\n\n[질문]\n{user_msg}"),
    ]
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰이 중계됨
    return {"messages": [resp], "response": resp.content}
