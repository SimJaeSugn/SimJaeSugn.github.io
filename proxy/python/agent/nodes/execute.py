"""execute 노드 — 클라이언트에 툴 실행 위임 (interrupt).

M2: 남은 계획 전체를 한 번의 interrupt 로 클라이언트에 보내 순차 실행시키고,
결과를 past_steps 에 기록한 뒤 plan 을 비운다(→ replan 이 done 으로 분기).
클라이언트 툴(create_entity·create_relation·auto_layout)은 location="client"
이므로 interrupt 로 위임한다(§7 이중 런타임). 병렬 배치는 M3.
"""
from langgraph.types import interrupt

from agent.common.state import AgentState


def execute_node(state: AgentState) -> dict:
    steps = state.get("plan") or []
    if not steps:
        return {}
    calls = [
        {"id": s.get("id"), "tool": s.get("tool"), "args": s.get("args", {})}
        for s in steps
    ]
    # 그래프 일시정지 → 클라이언트가 실행 후 Command(resume=results) 로 재개
    results = interrupt({"type": "tool_calls", "calls": calls})
    results = results or []
    paired = [
        {"step": steps[i], "result": results[i] if i < len(results) else {"error": "결과 없음"}}
        for i in range(len(steps))
    ]
    return {"past_steps": paired, "plan": []}
