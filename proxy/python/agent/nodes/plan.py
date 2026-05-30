"""plan 노드 — 요청을 툴 호출 계획(steps)으로 분해.

툴 목록은 fetch_tools 가 클라이언트에서 받아온 state.tool_catalog 를 사용한다(단일 소스).
멀티턴 히스토리도 반영한다.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import PLAN_SYSTEM, context_brief, tools_catalog_text
from agent.common.schemas import Plan
from agent.common.state import AgentState, recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG

# 카탈로그 조회 실패 시 허용할 기본 툴 이름(폴백)
_FALLBACK_TOOL_NAMES = {
    "create_entity", "create_relation", "auto_layout",
    "delete_entity", "delete_relation",
    "add_attribute", "update_attribute", "remove_attribute", "update_entity",
    "find_tables", "describe_table", "list_relations", "get_selection",
    "generate_ddl", "describe_tool",
}


def plan_node(state: AgentState) -> dict:
    # 클라 카탈로그(fetch_tools) + 프록시 DB 툴 카탈로그를 합쳐 계획에 노출
    catalog = (state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG
    known = {t.get("name") for t in catalog if t.get("name")} or _FALLBACK_TOOL_NAMES

    llm = get_llm(MODEL_MAIN)
    # Step.args 가 자유형 Dict 라서 strict json_schema 불가 → function_calling(비-strict)
    planner = llm.with_structured_output(Plan, method="function_calling")
    system = (
        PLAN_SYSTEM
        + "\n[사용 가능한 툴]\n" + tools_catalog_text(catalog)
        + "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
    )
    prompt = [("system", system)] + recent_messages(state)
    plan = planner.invoke(prompt)
    # 카탈로그 밖 툴은 제거(클라가 실행 못 함)
    steps = [s.model_dump() for s in plan.steps if s.tool in known]
    return {"plan": steps}
