# proxy/python/agent/v3/nodes/analyze.py
#
# v3 analyze 노드 — v1 analyze 의 격리 복제본(§9.1 "수정해야 하면 복제").
#
# 차이점 단 하나: 구조화 출력 method 를 function_calling → **json_schema** 로 사용한다.
#   v1 의 function_calling 은 langchain 이 강제 tool_choice(object)를 보내는데,
#   LM Studio 등 로컬 서버는 이를 거부(400 Invalid tool_choice type)한다. 그러면 analyze 가
#   예외→answer 폴백되어 모든 질의가 툴 실행 없이 곧장 답(narration)으로 빠진다.
#   json_schema 는 LM Studio·OpenAI 모두 동작하므로, v3 가 로컬 모델에서 정상 동작하도록 분리한다.
#
# v1 공유 모듈(IntentSpec·ANALYZE_SYSTEM·context_brief·recent_messages·get_fast_llm)은
# 읽기 전용 재사용. agent.v2 참조 금지.

import logging

from agent.common.llm import get_fast_llm                       # v1 읽기 전용 공유
from agent.common.prompts import ANALYZE_SYSTEM, context_brief  # v1 읽기 전용 공유
from agent.common.schemas import IntentSpec                      # v1 읽기 전용 공유
from agent.common.state import recent_messages                   # v1 읽기 전용 공유
from agent.v3.common.state import AgentState


def analyze_node(state: AgentState) -> dict:
    """v1 analyze 격리 복제 — IntentSpec 으로 의도를 구조화한다(json_schema).

    반환 형태·route 분기는 v1 과 동일(answer/act/mixed/clarify). v3 그래프의
    _analyze_route 가 route 로 분기한다.
    """
    llm = get_fast_llm()
    # json_schema: 강제 tool_choice 미사용 → 로컬 서버(LM Studio) 호환
    analyzer = llm.with_structured_output(IntentSpec, method="json_schema")
    system = ANALYZE_SYSTEM + "\n\n[현재 ERD 요약]\n" + context_brief(state.get("erd_context"))
    prompt = [("system", system)] + recent_messages(state)
    try:
        intent: IntentSpec = analyzer.invoke(prompt)
    except Exception:
        # 실패 시 answer 폴백 — v1 analyze 와 동일 보수 전략
        logging.getLogger(__name__).warning("v3 analyze_node invoke 실패 — answer 폴백")
        return {"route": "answer", "intent": None, "past_steps": None}

    route = intent.kind  # "answer" | "act" | "mixed" | "clarify"
    result = {
        "route": route,
        "intent": intent.model_dump(),
        "past_steps": None,   # 새 턴 시작 — v1 과 동일 리셋
    }
    if route == "clarify":
        amb = "; ".join(intent.ambiguities) if intent.ambiguities else "대상이 불명확합니다"
        result["replan_route"] = "escalate"
        result["replan_reason"] = f"모호성: {amb}"
    return result
