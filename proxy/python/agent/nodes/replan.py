"""replan 노드 — 실행 결과를 평가해 다음 행동을 결정 (적응형 재계획, §6.4).

- 남은 plan 이 있으면 continue.
- plan 이 비었으면 LLM 으로 평가: 목표 달성(done) / 추가·대체 스텝(continue+steps) /
  사용자 확인(escalate) / 안전 종료(abort).
- replan_count 상한으로 무한 루프 방지.
- 이미 성공 실행된 동일 작업(tool+args)을 다시 제시하면 제거(중복 승인·왕복 방지).
"""
import json

from agent.common.llm import get_main_llm
from agent.common.prompts import (
    REPLAN_SYSTEM,
    context_brief,
    results_detail,
    tools_catalog_text,
)
from agent.common.schemas import ReplanDecision
from agent.common.state import AgentState, recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG, PROXY_TOOL_NAMES

MAX_REPLAN = 4


def _known_names(state: AgentState) -> set:
    names = {t.get("name") for t in (state.get("tool_catalog") or []) if t.get("name")}
    return names | PROXY_TOOL_NAMES


def _step_identity(tool, args) -> tuple:
    """스텝의 '정체성' 키 — 같은 대상에 대한 같은 작업이면 동일(인자 세부·생성 id 변동 무시).

    create_entity 는 테이블 이름(논리/물리/id)으로, create_relation 은 from/to 로 식별한다.
    그 외는 (tool, 정규화 args). 이로써 LLM 이 id 만 바꿔 같은 테이블을 재생성하는 것을 잡는다.
    """
    a = args or {}

    def _n(*vals):
        for v in vals:
            if v:
                return str(v).strip().lower()
        return ""

    if tool == "create_entity":
        return ("create_entity", _n(a.get("logicalName"), a.get("physicalName"), a.get("name"), a.get("id")))
    if tool == "create_relation":
        return ("create_relation", _n(a.get("from")), _n(a.get("to")))
    if tool == "delete_entity":
        return ("delete_entity", _n(a.get("entityId"), a.get("id"), a.get("name")))
    return (tool, json.dumps(a, sort_keys=True, ensure_ascii=False))


def _done_identities(state: AgentState) -> set:
    """이미 충족된 작업 정체성 집합 — 재발행 시 제거 대상.

    ① 현재 ERD 에 이미 존재하는 엔티티(→ create_entity 중복 생성 방지)
    ② 이번 턴 성공 실행된 스텝(실패는 재시도 허용 위해 제외)
    """
    keys = set()
    for e in ((state.get("erd_context") or {}).get("entities") or []):
        for n in (e.get("name"), e.get("logicalName"), e.get("physicalName"), e.get("id")):
            if n:
                keys.add(("create_entity", str(n).strip().lower()))
    for entry in (state.get("past_steps") or []):
        st = entry.get("step") or {}
        res = entry.get("result") or {}
        if res.get("error") or not st.get("tool"):
            continue
        keys.add(_step_identity(st.get("tool"), st.get("args")))
    return keys


def replan_node(state: AgentState) -> dict:
    # 아직 실행하지 않은 스텝이 남아 있으면 계속 진행
    if state.get("plan"):
        return {"replan_route": "continue"}

    rounds = state.get("replan_count", 0)
    if rounds >= MAX_REPLAN:
        return {"replan_route": "escalate", "replan_reason": "재계획 시도 횟수를 초과했습니다."}

    catalog = (state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG
    llm = get_main_llm()
    decider = llm.with_structured_output(ReplanDecision, method="function_calling")
    system = (
        REPLAN_SYSTEM
        + "\n[사용 가능한 툴]\n" + tools_catalog_text(catalog)
        + "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
        + "\n\n[지금까지 실행 결과]\n" + results_detail(state.get("past_steps") or [])
    )
    try:
        d = decider.invoke([("system", system)] + recent_messages(state))
    except Exception:
        return {"replan_route": "done"}

    if d.status == "continue" and d.steps:
        known = _known_names(state)
        done = _done_identities(state)
        steps = [
            s.model_dump() for s in d.steps
            if s.tool in known and _step_identity(s.tool, s.args) not in done  # 이미 충족된 작업(동일 대상) 제외
        ]
        if steps:
            return {"plan": steps, "replan_count": rounds + 1, "replan_route": "continue"}
        # 새로 할 작업이 없음(전부 이미 실행됨) → 완료
        return {"replan_route": "done"}
    return {"replan_route": d.status, "replan_reason": d.reason}


def should_continue(state: AgentState) -> str:
    if state.get("plan"):
        return "continue"
    return state.get("replan_route") or "done"
