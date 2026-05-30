"""replan 노드 — 실행 결과를 평가해 다음 행동을 결정 (적응형 재계획, §6.4).

- 남은 plan 이 있으면 continue.
- plan 이 비었으면 LLM 으로 평가: 목표 달성(done) / 추가·대체 스텝(continue+steps) /
  사용자 확인(escalate) / 안전 종료(abort).
- replan_count 상한으로 무한 루프 방지.
"""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import (
    REPLAN_SYSTEM,
    context_brief,
    results_detail,
    tools_catalog_text,
)
from agent.common.schemas import ReplanDecision
from agent.common.state import AgentState, recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG, PROXY_TOOL_NAMES

MAX_REPLAN = 4


def _known_names(state: AgentState) -> set:
    names = {t.get("name") for t in (state.get("tool_catalog") or []) if t.get("name")}
    return names | PROXY_TOOL_NAMES


def replan_node(state: AgentState) -> dict:
    # 아직 실행하지 않은 스텝이 남아 있으면 계속 진행
    if state.get("plan"):
        return {"replan_route": "continue"}

    rounds = state.get("replan_count", 0)
    if rounds >= MAX_REPLAN:
        return {"replan_route": "escalate", "replan_reason": "재계획 시도 횟수를 초과했습니다."}

    catalog = (state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG
    llm = get_llm(MODEL_MAIN)
    decider = llm.with_structured_output(ReplanDecision, method="function_calling")
    system = (
        REPLAN_SYSTEM
        + "\n[사용 가능한 툴]\n" + tools_catalog_text(catalog)
        + "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
        + "\n\n[지금까지 실행 결과]\n" + results_detail(state.get("past_steps") or [])
    )
    try:
        d = decider.invoke([("system", system)] + recent_messages(state))
    except Exception:
        return {"replan_route": "done"}

    if d.status == "continue" and d.steps:
        known = _known_names(state)
        steps = [s.model_dump() for s in d.steps if s.tool in known]
        if steps:
            return {"plan": steps, "replan_count": rounds + 1, "replan_route": "continue"}
        return {"replan_route": "done"}
    return {"replan_route": d.status, "replan_reason": d.reason}


def should_continue(state: AgentState) -> str:
    if state.get("plan"):
        return "continue"
    return state.get("replan_route") or "done"
