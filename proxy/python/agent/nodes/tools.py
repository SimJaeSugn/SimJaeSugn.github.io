"""fetch_tools 노드 — 계획 수립 전 클라이언트로부터 사용 가능한 툴 카탈로그를 받아온다.

클라이언트(AGENT_TOOL_CATALOG)가 툴의 단일 소스. interrupt 로 요청하고,
멀티턴 thread 에서는 한 번 받으면 재사용(캐시)한다.
"""
from langgraph.types import interrupt

from agent.common.state import AgentState


def fetch_tools_node(state: AgentState) -> dict:
    if state.get("tool_catalog"):
        return {}  # 이미 보유 (같은 thread 의 이전 턴에서 조회됨)
    catalog = interrupt({"type": "tools_request"})
    return {"tool_catalog": catalog or []}
