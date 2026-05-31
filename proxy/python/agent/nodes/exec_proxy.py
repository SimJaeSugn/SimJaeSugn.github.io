"""exec_proxy 노드 — location="proxy" 툴을 서버에서 직접 실행 (interrupt 없음).

interrupt 가 없으므로 resume 시 재실행 문제 없음(클라 위임은 별도 execute 노드).
proxy 스텝을 실행해 past_steps 에 기록하고, plan 에서 제거(나머지 client 스텝만 남김).
"""
from agent.common.state import AgentState
from agent.tools_proxy import PROXY_TOOL_NAMES, run_proxy_tool


async def exec_proxy_node(state: AgentState) -> dict:
    steps = state.get("plan") or []
    proxy_steps = [s for s in steps if s.get("tool") in PROXY_TOOL_NAMES]
    if not proxy_steps:
        return {}  # 프록시 스텝 없음 → 그대로 execute(client) 로
    past = []
    for s in proxy_steps:
        result = await run_proxy_tool(s.get("tool"), s.get("args", {}))
        past.append({"step": s, "result": result})
    remaining = [s for s in steps if s.get("tool") not in PROXY_TOOL_NAMES]
    return {"past_steps": past, "plan": remaining}
