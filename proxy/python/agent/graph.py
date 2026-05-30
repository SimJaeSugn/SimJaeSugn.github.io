"""LangGraph StateGraph 조립.

토폴로지:
    START → gate ─answer→ answer → END
                 └─act──→ plan → execute → replan ─continue→ execute (loop)
                                                    └─done──→ respond → END

M2: act 경로(plan-execute-replan-respond) 구현. execute 는 interrupt 로
클라이언트에 툴 실행을 위임하고, replan 은 계획 소진 시 respond 로 보낸다.
적응형 재계획(§6.4)·병렬 배치(§6.2)·SqliteSaver(§9)는 이후 단계.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.common.state import AgentState
from agent.nodes.answer import answer_node
from agent.nodes.execute import execute_node
from agent.nodes.gate import gate_node
from agent.nodes.plan import plan_node
from agent.nodes.replan import replan_node, should_continue
from agent.nodes.respond import respond_node


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("gate", gate_node)
    g.add_node("answer", answer_node)
    g.add_node("plan", plan_node)
    g.add_node("execute", execute_node)
    g.add_node("replan", replan_node)
    g.add_node("respond", respond_node)

    g.add_edge(START, "gate")
    g.add_conditional_edges(
        "gate",
        lambda s: s.get("route") or "answer",
        {"answer": "answer", "act": "plan"},
    )
    g.add_edge("answer", END)
    g.add_edge("plan", "execute")
    g.add_edge("execute", "replan")
    g.add_conditional_edges(
        "replan",
        should_continue,
        {"continue": "execute", "done": "respond"},
    )
    g.add_edge("respond", END)

    # M2: 인메모리 체크포인터 (M5에서 SqliteSaver 로 전환)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph()
