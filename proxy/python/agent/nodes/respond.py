"""respond 노드 — 수행 결과를 사용자에게 보고 (토큰 스트리밍).

클라이언트는 그래프가 respond 까지 도달(=done)하면 드래프트를 커밋한다.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import RESPOND_SYSTEM, results_detail
from agent.common.state import AgentState, recent_messages


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
    # 사용자 원 요청(대화 히스토리)을 함께 전달해야 '30자 요약', '표로' 같은 구체 지시를 지킨다
    msgs = [("system", RESPOND_SYSTEM)] + recent_messages(state) + [
        ("user", f"[수행 결과]\n{summary}{hint}\n\n위 [수행 결과]를 바탕으로 방금 사용자의 요청에 "
                 f"정확히 답하세요(요청한 형식·길이·언어를 반드시 지킬 것).")
    ]
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰 중계
    return {"messages": [resp], "response": resp.content}
