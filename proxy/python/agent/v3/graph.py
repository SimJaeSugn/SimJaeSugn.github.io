"""v3 그래프 — V3-M2: Plan-and-Execute + ReAct 하이브리드(도구형).

토폴로지:
  START → prep → analyze ─answer──→ answer → END
                        ─clarify──→ respond → END
                        ─act/mixed→ fetch_tools → react ⇄ {meta_exec | proxy_exec | client_exec}
                                                    ─finish→ respond → END

핵심:
- react: [관찰 기록]을 보고 한 번에 툴 1개를 동적 선택(ReAct). loop_count 상한으로 발산 가드.
- 메타툴 plan/reflect(location="meta")는 부수효과 없는 '생각 도구' — meta_exec 가 LLM 추론으로 처리(승인·interrupt 면제).
- proxy 툴(fetch_db_schema·run_sql)은 서버 직접 실행, client 툴(create_entity 등)은 interrupt 위임.
- analyze/answer/fetch_tools/respond 는 v1 노드 읽기 재사용(수정 없음).

격리: agent.* (v1) 와 agent.v3.* 만 import. agent.v2.* 참조 금지.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.v3.common.state import AgentState
# v1 노드 — 읽기 재사용 (수정 없음)
from agent.nodes.analyze import analyze_node
from agent.nodes.answer import answer_node
from agent.nodes.respond import respond_node
from agent.nodes.tools import fetch_tools_node
# v3 전용 노드 (ReAct 루프)
from agent.v3.nodes.prep import prep_node
from agent.v3.nodes.react import react_node, react_route
from agent.v3.nodes.meta import meta_exec_node
from agent.v3.nodes.act import proxy_exec_node, client_exec_node


def _analyze_route(state: AgentState) -> str:
    """analyze 노드의 4분기 라우팅 (v1과 동일). act/mixed 는 ReAct 루프로."""
    route = state.get("route") or "answer"
    if route in ("act", "mixed"):
        return "act"
    if route == "clarify":
        return "clarify"
    return "answer"


def build_graph():
    g = StateGraph(AgentState)

    g.add_node("prep", prep_node)
    g.add_node("analyze", analyze_node)
    g.add_node("answer", answer_node)
    g.add_node("fetch_tools", fetch_tools_node)
    g.add_node("react", react_node)
    g.add_node("meta_exec", meta_exec_node)
    g.add_node("proxy_exec", proxy_exec_node)
    g.add_node("client_exec", client_exec_node)
    g.add_node("respond", respond_node)

    g.add_edge(START, "prep")
    g.add_edge("prep", "analyze")
    g.add_conditional_edges(
        "analyze", _analyze_route,
        {"answer": "answer", "act": "fetch_tools", "clarify": "respond"},
    )
    g.add_edge("answer", END)
    g.add_edge("fetch_tools", "react")

    # ReAct 루프 — react 가 다음 행동의 location 으로 분기, 각 행동 후 다시 react 로
    g.add_conditional_edges(
        "react", react_route,
        {"finish": "respond", "meta": "meta_exec", "proxy": "proxy_exec", "client": "client_exec"},
    )
    g.add_edge("meta_exec", "react")
    g.add_edge("proxy_exec", "react")
    g.add_edge("client_exec", "react")

    g.add_edge("respond", END)

    # 독립 인메모리 체크포인터 — v1·v2 graph 인스턴스와 완전 분리(§9.1 불변식 ③)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph()   # 모듈 전역 — routers/v3/agent.py 가 import
