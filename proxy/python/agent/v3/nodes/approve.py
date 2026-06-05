"""approve 노드 — v3 ReAct 루프의 쓰기/위험 행동 승인 게이트.

react 가 write/external/danger 툴을 고르면(react_needs_approval=True) 실행 전에
plan_approval interrupt 로 사용자 승인을 받는다. 프론트(client_v3.js)는 이 interrupt
타입을 이미 처리한다(_agentV3AwaitApproval → resume {approved}).

승인 시 해당 툴의 location(proxy/client)으로, 거부 시 respond(취소)로 분기한다.
운영 DB 쓰기(run_sql·apply_erd_to_db)·ERD 파괴 작업(delete_* 등)이 확인 없이
실행되던 문제(M3 승인 모델)를 닫는다.
"""
from langgraph.types import interrupt

from agent.tools_proxy import PROXY_TOOL_NAMES

from agent.v3.common.state import AgentState


def approve_node(state: AgentState) -> dict:
    tool = state.get("react_tool")
    args = state.get("react_args") or {}
    n = state.get("loop_count") or 0
    # 프론트는 plan(스텝 목록)을 카드로 보여주고 실행/취소 → {approved} 로 재개
    plan = [{"id": f"r{n}", "tool": tool, "args": args}]
    result = interrupt({"type": "plan_approval", "plan": plan})
    approved = bool(result.get("approved")) if isinstance(result, dict) else bool(result)

    out = {"react_approved": approved}
    if not approved:
        # 취소 → respond 가 요약하도록 past_steps 에 취소 사실을 남긴다
        out["past_steps"] = [{
            "step": {"tool": tool, "args": args},
            "result": {"ok": False, "cancelled": True, "note": "사용자가 이 작업을 취소했습니다."},
        }]
    return out


def approve_route(state: AgentState) -> str:
    if not state.get("react_approved"):
        return "cancel"
    tool = state.get("react_tool")
    return "proxy" if tool in PROXY_TOOL_NAMES else "client"
