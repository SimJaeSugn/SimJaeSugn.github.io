"""v3 그래프 — V3-M2: Plan-and-Execute + ReAct 하이브리드(도구형).

토폴로지:
  START → prep → analyze ─answer──→ answer → END
                        ─clarify──→ clarify ⇄ analyze (되묻기→재분류, MAX_CLARIFY 상한)
                        ─act/mixed→ fetch_tools → react ⇄ {meta_exec | approve→(proxy_exec|client_exec) | proxy_exec | client_exec | clarify}
                                                    ─finish→ verify ─pass→ respond → END
                                                                      ─보완→ react (MAX_VERIFY 상한)
  · 쓰기/위험(write·external·danger) 툴은 approve(승인 interrupt)를 먼저 거친다. 거부 시 respond(취소).
  · finish 는 곧장 종료하지 않고 verify(준수 검증)를 거친다 — 목표 미충족이면 react 로 되돌려 보완.
  · clarify: 의도 불명확(analyze)·정보부족(react의 ask_user) 시 interrupt 로 사용자에게 되묻는다.
    답을 받으면 analyze 재분류(선행)·react 관찰 보강(루프 중)으로 질의를 완성한다. 건너뛰면 respond(취소).

핵심:
- react: [관찰 기록]을 보고 한 번에 툴 1개를 동적 선택(ReAct). loop_count 상한으로 발산 가드.
- 메타툴 plan/reflect(location="meta")는 부수효과 없는 '생각 도구' — meta_exec 가 LLM 추론으로 처리(승인·interrupt 면제).
- proxy 툴(fetch_db_schema·run_sql)은 서버 직접 실행, client 툴(create_entity 등)은 interrupt 위임.
- fetch_tools 는 v1 노드 읽기 재사용(수정 없음).
- answer/respond 는 v3 격리 복제(agent.v3.nodes.answer·respond) — 시스템 프롬프트에 [메모리] 주입. v1 무손상.
- analyze 는 v3 격리 복제(agent.v3.nodes.analyze) — json_schema 로 로컬 LLM(LM Studio) 호환 + [메모리] 주입. v1 analyze 무손상.

격리: agent.* (v1) 와 agent.v3.* 만 import. agent.v2.* 참조 금지.
"""
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent.v3.common.state import AgentState
# v1 노드 — 읽기 재사용 (수정 없음)
from agent.nodes.tools import fetch_tools_node
# v3 격리 복제 — answer·respond 에 [메모리] 주입(§9.1 복제). v1 answer·respond 무손상.
from agent.v3.nodes.answer import answer_node
from agent.v3.nodes.respond import respond_node
# v3 analyze — v1 격리 복제(json_schema, 로컬 LLM 호환). v1 analyze 무손상.
from agent.v3.nodes.analyze import analyze_node
# v3 전용 노드 (ReAct 루프)
from agent.v3.nodes.prep import prep_node
from agent.v3.nodes.react import react_node, react_route
from agent.v3.nodes.meta import meta_exec_node
from agent.v3.nodes.memory_exec import memory_exec_node
from agent.v3.nodes.act import proxy_exec_node, client_exec_node
from agent.v3.nodes.approve import approve_node, approve_route
from agent.v3.nodes.verify import verify_node, verify_route
from agent.v3.nodes.clarify import clarify_node, clarify_route
from agent.v3.common.schemas import MAX_CLARIFY


def _analyze_route(state: AgentState) -> str:
    """analyze 노드의 4분기 라우팅. act/mixed 는 ReAct 루프, clarify 는 되묻기로."""
    route = state.get("route") or "answer"
    if route in ("act", "mixed"):
        return "act"
    if route == "clarify":
        # 되묻기 상한 도달 시 더 묻지 않고 가용 정보로 최선 응답(answer)
        if int(state.get("clarify_count") or 0) >= MAX_CLARIFY:
            return "answer"
        return "clarify"
    return "answer"


def build_graph():
    g = StateGraph(AgentState)

    g.add_node("prep", prep_node)
    g.add_node("analyze", analyze_node)
    g.add_node("answer", answer_node)
    g.add_node("fetch_tools", fetch_tools_node)
    g.add_node("react", react_node)
    g.add_node("approve", approve_node)
    g.add_node("meta_exec", meta_exec_node)
    g.add_node("memory_exec", memory_exec_node)
    g.add_node("proxy_exec", proxy_exec_node)
    g.add_node("client_exec", client_exec_node)
    g.add_node("verify", verify_node)
    g.add_node("clarify", clarify_node)
    g.add_node("respond", respond_node)

    g.add_edge(START, "prep")
    g.add_edge("prep", "analyze")
    g.add_conditional_edges(
        "analyze", _analyze_route,
        {"answer": "answer", "act": "fetch_tools", "clarify": "clarify"},
    )
    g.add_edge("answer", END)
    g.add_edge("fetch_tools", "react")

    # ReAct 루프 — react 가 다음 행동의 location 으로 분기, 각 행동 후 다시 react 로.
    # 쓰기/위험(react_needs_approval)은 approve 를 먼저 거친다.
    # finish → verify(준수 검증). verify 가 통과면 respond, 보완 필요면 react 로 되돌림.
    g.add_conditional_edges(
        "react", react_route,
        {"finish": "verify", "meta": "meta_exec", "memory": "memory_exec", "approve": "approve",
         "proxy": "proxy_exec", "client": "client_exec", "clarify": "clarify"},
    )
    # approve: 승인 시 해당 location 실행, 거부 시 respond(취소)
    g.add_conditional_edges(
        "approve", approve_route,
        {"proxy": "proxy_exec", "client": "client_exec", "cancel": "respond"},
    )
    # verify: 목표 충족이면 respond, 보완 가능한 미충족이면 react 로(상한 MAX_VERIFY)
    g.add_conditional_edges(
        "verify", verify_route,
        {"respond": "respond", "continue": "react"},
    )
    # clarify: 답 받음 → 진입원으로 복귀(analyze 재분류 / react 보강), 건너뜀 → respond(취소)
    g.add_conditional_edges(
        "clarify", clarify_route,
        {"analyze": "analyze", "react": "react", "respond": "respond"},
    )
    g.add_edge("meta_exec", "react")
    g.add_edge("memory_exec", "react")
    g.add_edge("proxy_exec", "react")
    g.add_edge("client_exec", "react")

    g.add_edge("respond", END)

    # 독립 인메모리 체크포인터 — v1·v2 graph 인스턴스와 완전 분리(§9.1 불변식 ③)
    return g.compile(checkpointer=MemorySaver())


graph = build_graph()   # 모듈 전역 — routers/v3/agent.py 가 import
