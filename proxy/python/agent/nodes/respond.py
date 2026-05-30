"""respond 노드 — 수행 결과를 사용자에게 보고 (토큰 스트리밍).

클라이언트는 그래프가 respond 까지 도달(=done)하면 드래프트를 커밋한다.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import RESPOND_SYSTEM, summarize_steps
from agent.common.state import AgentState


def respond_node(state: AgentState) -> dict:
    summary = summarize_steps(state.get("past_steps") or [])
    llm = get_llm(MODEL_MAIN)
    msgs = [
        ("system", RESPOND_SYSTEM),
        ("user", f"수행 결과:\n{summary}"),
    ]
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰 중계
    return {"messages": [resp], "response": resp.content}
