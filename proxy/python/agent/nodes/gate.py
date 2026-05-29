"""gate 노드 — 의도 분기 (act / answer)."""
from agent.common.llm import MODEL_FAST, get_llm
from agent.common.prompts import GATE_SYSTEM, context_brief
from agent.common.schemas import RouteDecision
from agent.common.state import AgentState, last_user_text


def gate_node(state: AgentState) -> dict:
    user_msg = last_user_text(state)
    llm = get_llm(MODEL_FAST)
    decider = llm.with_structured_output(RouteDecision)
    prompt = [
        ("system", GATE_SYSTEM),
        ("user", f"[현재 ERD]\n{context_brief(state.get('erd_context'))}\n\n[질의]\n{user_msg}"),
    ]
    try:
        decision = decider.invoke(prompt)
        return {"route": decision.route}
    except Exception:
        # 분류 실패 시 보수적으로 answer
        return {"route": "answer"}
