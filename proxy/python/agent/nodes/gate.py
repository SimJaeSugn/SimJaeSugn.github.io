"""gate 노드 — 의도 분기 (act / answer). 멀티턴 히스토리 반영."""
from agent.common.llm import MODEL_FAST, get_llm
from agent.common.prompts import GATE_SYSTEM, context_brief
from agent.common.schemas import RouteDecision
from agent.common.state import AgentState, recent_messages


def gate_node(state: AgentState) -> dict:
    llm = get_llm(MODEL_FAST)
    decider = llm.with_structured_output(RouteDecision)
    system = GATE_SYSTEM + "\n\n[현재 ERD 요약]\n" + context_brief(state.get("erd_context"))
    prompt = [("system", system)] + recent_messages(state)
    try:
        decision = decider.invoke(prompt)
        # past_steps=None → 새 턴 시작 시 이전 턴 결과 리셋 (스레드 재사용 대비)
        return {"route": decision.route, "past_steps": None}
    except Exception:
        return {"route": "answer", "past_steps": None}
