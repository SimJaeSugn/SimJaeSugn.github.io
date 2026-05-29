"""LangGraph StateGraph 조립.

M1 토폴로지:
    START → gate → (answer | act) → answer → END

M1에서는 act 경로도 answer 노드로 보낸다(답변 노드가 안내를 덧붙임).
M2에서 act → plan → execute → replan → respond 로 확장한다.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.common.state import AgentState
from agent.nodes.answer import answer_node
from agent.nodes.gate import gate_node


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("gate", gate_node)
    g.add_node("answer", answer_node)

    g.add_edge(START, "gate")
    g.add_conditional_edges(
        "gate",
        lambda s: s.get("route") or "answer",
        # M1: act 도 answer 로 (M2에서 "act": "plan" 으로 교체)
        {"answer": "answer", "act": "answer"},
    )
    g.add_edge("answer", END)

    # M1: 인메모리 체크포인터 (M5에서 SqliteSaver 로 전환)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph()
