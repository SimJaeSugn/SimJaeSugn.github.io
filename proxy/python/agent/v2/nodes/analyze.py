# proxy/python/agent/v2/nodes/analyze.py
#
# analyze_node — v1 gate_node 대체.
# IntentSpec 구조화 출력으로 의도를 4종(answer/act/mixed/clarify)으로 분류한다.
# clarify 시 respond_node가 되묻도록 replan_route="escalate"를 함께 반환한다.

import logging

from agent.common.llm import get_fast_llm                      # v1 읽기 전용
from agent.v2.common.schemas import IntentSpec
from agent.v2.common.state import AgentStateV2, recent_messages
from agent.v2.common.prompts import ANALYZE_SYSTEM, context_brief


def analyze_node(state: AgentStateV2) -> dict:
    """v1 gate_node 대체 — IntentSpec으로 의도를 구조화한다."""
    llm = get_fast_llm()
    # nested Pydantic은 function_calling이 안전 (v1 plan_node와 동일 패턴)
    analyzer = llm.with_structured_output(IntentSpec, method="function_calling")
    system = ANALYZE_SYSTEM + "\n\n[현재 ERD 요약]\n" + context_brief(state.get("erd_context"))
    prompt = [("system", system)] + recent_messages(state)
    try:
        intent: IntentSpec = analyzer.invoke(prompt)
    except Exception:
        # 실패 시 answer 폴백 — v1 gate와 동일 보수 전략
        logging.getLogger(__name__).warning("analyze_node invoke 실패 — answer 폴백")
        return {"route": "answer", "intent": None, "past_steps": None}

    route = intent.kind  # "answer" | "act" | "mixed" | "clarify"
    result = {
        "route": route,
        "intent": intent.model_dump(),
        "past_steps": None,   # 새 턴 시작 — v1 gate와 동일 리셋
    }
    if route == "clarify":
        # respond_node가 escalate 분기를 타도록 설정 → 사용자에게 되묻기
        amb = "; ".join(intent.ambiguities) if intent.ambiguities else "대상이 불명확합니다"
        result["replan_route"] = "escalate"
        result["replan_reason"] = f"모호성: {amb}"
    return result
