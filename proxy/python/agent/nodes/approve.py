"""approve 노드 — 실행 전 계획을 사용자에게 보여주고 승인을 받는다 (HITL, §6.5).

interrupt 로 계획을 클라이언트에 전달 → 사용자가 [실행]/[취소] 선택 →
Command(resume={approved: bool}) 로 재개. 승인되면 execute, 아니면 END.
"""
from langgraph.types import interrupt

from agent.common.state import AgentState
from agent.tools_proxy import PROXY_TOOL_CATALOG


def _all_read_only(plan: list, state: AgentState) -> bool:
    """계획의 모든 스텝이 읽기 전용(kind=read, 비위험)인지 — 카탈로그 기준."""
    catalog = {t.get("name"): t for t in ((state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG)}
    for s in plan:
        t = catalog.get(s.get("tool"))
        if not t:
            return False  # 모르는 툴은 보수적으로 승인 요구
        if t.get("kind") != "read" or t.get("danger"):
            return False
    return True


def approve_node(state: AgentState) -> dict:
    plan = state.get("plan") or []
    if not plan:
        return {"approved": False}
    # 읽기 전용(조회) 계획은 승인 없이 자동 실행 (상태/DB 변경 없음)
    if _all_read_only(plan, state):
        return {"approved": True}
    decision = interrupt({"type": "plan_approval", "plan": plan})
    return {"approved": bool(decision and decision.get("approved"))}


def approved_route(state: AgentState) -> str:
    return "yes" if state.get("approved") else "no"
