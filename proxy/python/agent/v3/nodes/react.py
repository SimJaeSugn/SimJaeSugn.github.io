"""react 노드 — ReAct 루프의 추론 스텝.

[관찰 기록]을 보고 다음 행동(툴 1개) 또는 종료(finish)를 동적으로 결정한다.

발산/반복 가드(중요):
- loop_count 상한(MAX_LOOP) 도달 → 강제 finish.
- 직전과 완전히 동일한 (tool, args) 반복 → 무의미하므로 강제 finish.
- 메타툴(plan/reflect) 연속 호출 → '생각만 반복' 방지 위해 강제 finish.
- 카탈로그 밖 툴 환각 → 강제 finish.

react_route 가 결정된 react_tool 의 location 으로 분기한다:
  finish → respond / meta → meta_exec / proxy → proxy_exec / client → client_exec
"""
import json

from agent.common.llm import get_main_llm
from agent.common.state import recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG, PROXY_TOOL_NAMES

from agent.v3.common.prompts import (
    REACT_SYSTEM,
    context_brief,
    render_scratchpad,
    tools_catalog_text,
)
from agent.v3.common.schemas import (
    FINISH,
    MAX_LOOP,
    META_TOOL_CATALOG,
    META_TOOL_NAMES,
    ReActStep,
)
from agent.v3.common.state import AgentState


def _finish(loop: int, thought: str) -> dict:
    return {"loop_count": loop, "react_tool": FINISH, "react_args": {}, "react_thought": thought,
            "react_needs_approval": False}


def _tail_meta_streak(scratchpad: list) -> int:
    """scratchpad 끝에서 연속된 메타툴 호출 수 (행동/관찰이 끼면 0으로 리셋)."""
    n = 0
    for e in reversed(scratchpad or []):
        if e.get("tool") in META_TOOL_NAMES:
            n += 1
        else:
            break
    return n


def react_node(state: AgentState) -> dict:
    loop = int(state.get("loop_count") or 0) + 1

    # 발산 가드 — 상한 도달 시 강제 종료
    if loop > MAX_LOOP:
        return _finish(loop, f"반복 상한({MAX_LOOP}회) 도달 — 현재까지 결과로 종료합니다.")

    catalog = (state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG + META_TOOL_CATALOG
    known = {t.get("name") for t in catalog if t.get("name")}
    intent_json = json.dumps(state.get("intent") or {}, ensure_ascii=False)

    system = (
        REACT_SYSTEM
        + f"\n\n[분석된 의도]\n{intent_json}"
        + "\n\n[사용 가능한 툴]\n" + tools_catalog_text(catalog)
        + "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
        + "\n\n[관찰 기록]\n" + render_scratchpad(state.get("scratchpad"))
    )
    llm = get_main_llm()
    reactor = llm.with_structured_output(ReActStep, method="function_calling")
    step: ReActStep = reactor.invoke([("system", system)] + recent_messages(state))

    tool = (step.tool or "").strip()
    args = step.args or {}
    thought = step.thought or ""

    if tool == FINISH:
        return _finish(loop, thought)

    # 카탈로그 밖 툴 → 환각 반복 방지
    if tool not in known:
        return _finish(loop, thought + f" (알 수 없는 툴 '{tool}' — 종료)")

    scratch = state.get("scratchpad") or []
    last = scratch[-1] if scratch else None

    # 가드 ①: 직전과 완전 동일한 (tool, args) → 새 정보 없음 → finish
    if last and tool == last.get("tool") and args == (last.get("args") or {}):
        return _finish(loop, thought + f" (동일 행동 '{tool}' 반복 감지 — 결과를 정리해 종료)")

    # 가드 ②: 메타툴 연속 호출 → 생각만 반복 방지 (한 번 점검했으면 행동하거나 finish)
    if tool in META_TOOL_NAMES and _tail_meta_streak(scratch) >= 1:
        return _finish(loop, thought + " (점검 완료 — 분석을 마치고 종료)")

    # 승인 필요 판정: write/external/danger 툴은 실행 전 사용자 승인을 받는다(read/meta 면제)
    tdef = next((t for t in catalog if t.get("name") == tool), None)
    needs_approval = bool(tdef) and ((tdef.get("kind") in ("write", "external")) or bool(tdef.get("danger")))
    return {
        "loop_count": loop,
        "react_tool": tool,
        "react_args": args,
        "react_thought": thought,
        "react_needs_approval": needs_approval,
    }


def react_route(state: AgentState) -> str:
    """react_tool 의 location 으로 분기. 쓰기/위험 툴은 approve 를 먼저 거친다."""
    tool = state.get("react_tool")
    if not tool or tool == FINISH:
        return "finish"
    if tool in META_TOOL_NAMES:
        return "meta"
    if state.get("react_needs_approval"):
        return "approve"   # 쓰기/위험 → 실행 전 승인
    if tool in PROXY_TOOL_NAMES:
        return "proxy"
    return "client"   # 그 외는 클라이언트 ERD 툴 (interrupt 위임)
