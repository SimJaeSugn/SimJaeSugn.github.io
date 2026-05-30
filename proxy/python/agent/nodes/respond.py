"""respond 노드 — 수행 결과를 사용자에게 보고 (토큰 스트리밍).

클라이언트는 그래프가 respond 까지 도달(=done)하면 드래프트를 커밋한다.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import RESPOND_SYSTEM, results_detail
from agent.common.state import AgentState


def respond_node(state: AgentState) -> dict:
    summary = results_detail(state.get("past_steps") or [])
    route = state.get("replan_route")
    reason = state.get("replan_reason") or ""
    hint = ""
    if route == "escalate":
        hint = ("\n[상태] 다음 이유로 사용자 확인이 필요합니다: " + reason
                + " — 사용자에게 그 점을 구체적으로 되물으세요(어떤 정보/결정이 필요한지 명확히)."
                ) if reason else "\n[상태] 사용자 확인이 필요 — 무엇이 필요한지 구체적으로 되물으세요."
    elif route == "abort":
        hint = "\n[상태] 회복 불가하여 안전하게 종료됨" + (f" (사유: {reason})" if reason else "") + " — 사유를 간단히 설명하세요."
    llm = get_llm(MODEL_MAIN)
    msgs = [
        ("system", RESPOND_SYSTEM),
        ("user", f"수행 결과:\n{summary}{hint}"),
    ]
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰 중계
    return {"messages": [resp], "response": resp.content}
