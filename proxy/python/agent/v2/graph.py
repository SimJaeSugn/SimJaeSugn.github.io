"""v2 그래프 — P0 골격.

토폴로지:
  START → analyze ─answer──→ answer → END
                 ─clarify──→ respond → END  (replan_route=escalate)
                 ─act/mixed→ fetch_tools → plan → approve
                               ─yes→ exec_proxy → execute → replan → respond → END
                               ─no─→ END (취소)

V2-M2·M3 구조 페이즈: gate → analyze 교체, AgentStateV2 전환, 4분기 엣지 배선.
v1 노드들(answer/approve/exec_proxy/execute/replan/respond/fetch_tools)은
읽기 전용 import 재사용 (§9.1 불변식 ②).
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.v2.common.state import AgentStateV2
from agent.v2.nodes.analyze import analyze_node
from agent.v2.nodes.plan import plan_node_v2
# v1 노드들 — 읽기 재사용 (수정 없음)
from agent.nodes.answer import answer_node
from agent.nodes.approve import approve_node, approved_route
from agent.nodes.exec_proxy import exec_proxy_node
from agent.nodes.execute import execute_node
from agent.nodes.replan import replan_node, should_continue
from agent.nodes.respond import respond_node
from agent.nodes.tools import fetch_tools_node


def _analyze_route(state: AgentStateV2) -> str:
    """analyze 노드의 4분기 라우팅 함수."""
    route = state.get("route") or "answer"
    if route in ("act", "mixed"):
        return "act"       # fetch_tools → plan_v2
    if route == "clarify":
        return "clarify"   # respond (모호성 되묻기)
    return "answer"        # answer → END


def build_graph_v2():
    g = StateGraph(AgentStateV2)

    g.add_node("analyze", analyze_node)
    g.add_node("plan", plan_node_v2)
    g.add_node("answer", answer_node)
    g.add_node("fetch_tools", fetch_tools_node)
    g.add_node("approve", approve_node)
    g.add_node("exec_proxy", exec_proxy_node)
    g.add_node("execute", execute_node)
    g.add_node("replan", replan_node)
    g.add_node("respond", respond_node)

    g.add_edge(START, "analyze")
    g.add_conditional_edges(
        "analyze", _analyze_route,
        {"answer": "answer", "act": "fetch_tools", "clarify": "respond"},
    )
    g.add_edge("answer", END)
    g.add_edge("fetch_tools", "plan")
    g.add_edge("plan", "approve")
    g.add_conditional_edges("approve", approved_route, {"yes": "exec_proxy", "no": END})
    g.add_edge("exec_proxy", "execute")
    g.add_edge("execute", "replan")
    # 적응형 재계획(§6.4): continue→approve(재계획 단계도 승인), 그 외 respond
    g.add_conditional_edges(
        "replan",
        should_continue,
        {"continue": "approve", "done": "respond", "escalate": "respond", "abort": "respond"},
    )
    g.add_edge("respond", END)

    # 독립 인메모리 체크포인터 — v1 graph 인스턴스와 완전 분리(§9.1 불변식 ③)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph_v2()   # 모듈 전역 — routers/v2/agent.py 가 import
