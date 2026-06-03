# proxy/python/agent/v2/nodes/plan.py
#
# plan_node — v1 plan_node 대체.
# IntentSpec.goals를 소비해 StepV2[] 계획을 생성한다.
# 카탈로그 필터링 로직은 v1 plan_node 패턴 그대로 복제.

import json
import logging

from agent.common.llm import get_main_llm                      # v1 읽기 전용
from agent.tools_proxy import PROXY_TOOL_CATALOG               # v1 읽기 전용
from agent.common.schemas import PlanV2, StepV2
from agent.common.state import AgentState, recent_messages
from agent.common.prompts import PLAN_V2_SYSTEM, context_brief, tools_catalog_text

# 카탈로그 조회 실패 시 허용할 기본 툴 이름(폴백) — v1 plan_node와 동일
_FALLBACK_TOOL_NAMES = {
    "create_entity", "create_relation", "auto_layout",
    "delete_entity", "delete_relation",
    "add_attribute", "update_attribute", "remove_attribute", "update_entity",
    "find_tables", "describe_table", "list_relations", "get_selection",
    "generate_ddl", "describe_tool",
}


def plan_node(state: AgentState) -> dict:
    """IntentSpec.goals를 소비해 StepV2[] 계획을 생성한다."""
    catalog = (state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG
    known = {t.get("name") for t in catalog if t.get("name")} or _FALLBACK_TOOL_NAMES

    intent_dict = state.get("intent") or {}
    intent_json = json.dumps(intent_dict, ensure_ascii=False)

    llm = get_main_llm()
    # StepV2.args 가 자유형 Dict → function_calling (v1 plan_node와 동일)
    planner = llm.with_structured_output(PlanV2, method="function_calling")

    system = (
        PLAN_V2_SYSTEM
        + f"\n\n[분석된 의도(IntentSpec)]\n{intent_json}"
        + "\n\n[사용 가능한 툴]\n" + tools_catalog_text(catalog)
        + "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
    )
    prompt = [("system", system)] + recent_messages(state)
    try:
        plan: PlanV2 = planner.invoke(prompt)
    except Exception:
        # 계획 수립 실패 시 빈 계획 폴백 — 그래프 전체 중단 방지(analyze_node와 동일 보수 전략)
        logging.getLogger(__name__).warning("plan_node invoke 실패 — 빈 계획 폴백")
        return {"plan": []}

    # 카탈로그 밖 툴 제거 — v1 plan_node와 동일 패턴
    steps = [s.model_dump() for s in plan.steps if s.tool in known]
    return {"plan": steps}
