"""LangGraph StateGraph 조립.

토폴로지:
    START → gate ─answer→ answer → END
                 └─act──→ fetch_tools → plan → approve ─yes→ exec_proxy → execute → replan
                                              └─no(취소)→ END    (서버 DB)    (클라)    │
                          replan ─continue→ approve (재계획 단계도 승인) · done/escalate/abort → respond → END

M2: plan-execute-replan-respond. M3: approve(HITL) + 멀티턴 + fetch_tools.
M4: exec_proxy(서버 DB 툴 run_sql·fetch_db_schema, ToolNode 대체) + 적응형 재계획(replan 4분기, §6.4)
    + 데이터 해소 읽기 툴(클라). 병렬(Send)·SqliteSaver(§9)는 이후.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.common.state import AgentState
from agent.nodes.answer import answer_node
from agent.nodes.approve import approve_node, approved_route
from agent.nodes.exec_proxy import exec_proxy_node
from agent.nodes.execute import execute_node
from agent.nodes.gate import gate_node
from agent.nodes.plan import plan_node
from agent.nodes.replan import replan_node, should_continue
from agent.nodes.respond import respond_node
from agent.nodes.tools import fetch_tools_node


def build_graph():
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

    # M2: 인메모리 체크포인터 (M5에서 SqliteSaver 로 전환)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph()
