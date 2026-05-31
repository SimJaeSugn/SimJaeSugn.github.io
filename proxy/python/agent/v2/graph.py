"""v2 그래프 — V2-M1은 v1 토폴로지 미러.
독립 compile + 독립 MemorySaver 로 런타임 자원만 분리(§9.1 불변식 ③).
노드 구현은 v1을 읽기 전용 import 재사용(§9.1 불변식 ② "v2 → v1 읽기만").
V2-M2 이후 analyze/plan/verify 노드를 agent/v2/nodes/ 에 독립 구현하며 점진 분기.

토폴로지(V2-M1 미러):
    START → gate ─answer→ answer → END
                 └─act──→ fetch_tools → plan → approve ─yes→ exec_proxy → execute → replan
                                              └─no(취소)→ END    (서버 DB)    (클라)    │
                          replan ─continue→ approve (재계획 단계도 승인) · done/escalate/abort → respond → END
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.common.state import AgentState           # 읽기 재사용
from agent.nodes.answer import answer_node           # 읽기 재사용 (v1 노드)
from agent.nodes.approve import approve_node, approved_route  # 읽기 재사용
from agent.nodes.exec_proxy import exec_proxy_node   # 읽기 재사용
from agent.nodes.execute import execute_node         # 읽기 재사용
from agent.nodes.gate import gate_node               # 읽기 재사용
from agent.nodes.plan import plan_node               # 읽기 재사용
from agent.nodes.replan import replan_node, should_continue  # 읽기 재사용
from agent.nodes.respond import respond_node         # 읽기 재사용
from agent.nodes.tools import fetch_tools_node       # 읽기 재사용


def build_graph_v2():
    """v1 build_graph() 토폴로지 미러 — 독립 인스턴스로 컴파일."""
    g = StateGraph(AgentState)
    g.add_node("gate", gate_node)
    g.add_node("answer", answer_node)
    g.add_node("fetch_tools", fetch_tools_node)
    g.add_node("plan", plan_node)
    g.add_node("approve", approve_node)
    g.add_node("exec_proxy", exec_proxy_node)
    g.add_node("execute", execute_node)
    g.add_node("replan", replan_node)
    g.add_node("respond", respond_node)

    g.add_edge(START, "gate")
    g.add_conditional_edges(
        "gate",
        lambda s: s.get("route") or "answer",
        {"answer": "answer", "act": "fetch_tools"},
    )
    g.add_edge("answer", END)
    # fetch_tools(클라 툴 카탈로그 조회) → plan(카탈로그로 계획) → approve → ...
    g.add_edge("fetch_tools", "plan")
    # plan → approve(사용자 승인) → exec_proxy(서버 DB 툴) → execute(클라 툴) / END(취소 시)
    g.add_edge("plan", "approve")
    g.add_conditional_edges("approve", approved_route, {"yes": "exec_proxy", "no": END})
    g.add_edge("exec_proxy", "execute")
    g.add_edge("execute", "replan")
    # 적응형 재계획(§6.4): continue→approve(재계획된 단계도 승인 게이트 통과), 그 외 respond
    g.add_conditional_edges(
        "replan",
        should_continue,
        {"continue": "approve", "done": "respond", "escalate": "respond", "abort": "respond"},
    )
    g.add_edge("respond", END)

    # V2-M1: 독립 인메모리 체크포인터 — v1 graph 인스턴스와 완전 분리(§9.1 불변식 ③)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph_v2()   # 모듈 전역 — routers/v2/agent.py 가 import
