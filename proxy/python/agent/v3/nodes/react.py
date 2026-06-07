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
import re

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
    ASK_USER,
    ASK_USER_TOOL,
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


def _retry_force_tool(reactor, system: str, state: AgentState, known: set):
    """약한 모델 가드 — react 가 빈/무효 tool 또는 성급한 finish 를 냈을 때 1회 강제 교정 재시도.

    배경: 로컬 소형 모델(예: LM Studio Qwen3.5-9b)은 ReActStep 메타함수 패턴에서
    특정 산출물 질의('ERD 종합 명세서 만들어줘' 등)에 빈 args(`{}`)·잘못된 args 를 내며
    tool 을 비운다. 그러면 react 가 '알 수 없는 툴 → finish' 로 처리하고, respond 가
    'generate_erd_report: …하겠습니다' 식 narration 만 생성한다(툴 미실행).
    유효 툴 이름을 명시하고 빈 tool·finish 를 금지한 교정 메시지로 한 번 더 시도한다.
    실패하면 None.
    """
    names = ", ".join(sorted(n for n in known if n))
    corrective = (
        "[중요·재지시] 직전 출력에서 실행할 tool 을 제대로 지정하지 못했다(빈 값 또는 finish). "
        "하지만 아직 아무 행동도 하지 않았고 사용자 요청은 실제 작업이 필요하다. "
        "지금은 finish·빈 tool 이 허용되지 않는다 — [사용 가능한 툴] 중 의도를 달성할 실제 툴 하나를 골라 "
        "tool 에 정확한 이름을 넣어 ReActStep(thought, tool, args)을 출력하라. "
        f"유효한 tool 이름: {names}. "
        "'명세서/보고서/데이터 사전/DDL 만들어줘'면 describe_table 로 먼저 읽지 말고 "
        "generate_erd_report·generate_data_dictionary·generate_ddl 같은 생성 툴을 바로 호출하라."
    )
    try:
        return reactor.invoke(
            [("system", system)] + recent_messages(state) + [("user", corrective)]
        )
    except Exception:  # noqa: BLE001
        return None


def _tail_meta_streak(scratchpad: list) -> int:
    """scratchpad 끝에서 연속된 메타툴 호출 수 (행동/관찰이 끼면 0으로 리셋)."""
    n = 0
    for e in reversed(scratchpad or []):
        if e.get("tool") in META_TOOL_NAMES:
            n += 1
        else:
            break
    return n


# INSERT/REPLACE(=행을 새로 추가하는 DML) 판별 — 중복 누적 방지용
_INSERT_RE = re.compile(r"^\s*(INSERT|REPLACE)\b", re.IGNORECASE)


def _prior_insert_succeeded(scratchpad: list) -> bool:
    """이번 턴에 이미 성공한 INSERT/REPLACE run_sql 이 있는지.

    임의 데이터 INSERT 는 매 스텝 args(값)가 달라 '동일 행동 반복' 가드(①)를 빠져나가
    react 가 INSERT 를 계속 재선택 → 100행씩 무한 누적되는 문제를 막기 위한 판별.
    (검증용 SELECT 는 INSERT 가 아니므로 허용 — INSERT→SELECT→finish 흐름은 유지된다.)
    """
    for e in (scratchpad or []):
        if e.get("tool") == "run_sql":
            sql = (e.get("args") or {}).get("sql") or ""
            obs = e.get("observation") or ""
            if _INSERT_RE.match(sql) and not obs.startswith("실패"):
                return True
    return False


def react_node(state: AgentState) -> dict:
    loop = int(state.get("loop_count") or 0) + 1

    # 발산 가드 — 상한 도달 시 강제 종료
    if loop > MAX_LOOP:
        return _finish(loop, f"반복 상한({MAX_LOOP}회) 도달 — 현재까지 결과로 종료합니다.")

    catalog = (state.get("tool_catalog") or []) + PROXY_TOOL_CATALOG + META_TOOL_CATALOG + [ASK_USER_TOOL]
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

    # ── 약한 모델 가드(강제 툴 1회 재시도) ──────────────────────────────
    # act/mixed 의도인데 첫 행동 자리에서 tool 을 비우거나(파싱 실패) 성급히 finish 하면
    # respond 가 'X 하겠습니다' narration 만 낸다(툴 미실행). 한 번 강제 교정해 구제한다.
    intent_kind = (state.get("intent") or {}).get("kind")
    actionable = intent_kind in ("act", "mixed")
    scratch_now = state.get("scratchpad") or []
    malformed = tool != FINISH and (not tool or tool not in known)
    premature_finish = tool == FINISH and actionable and not scratch_now
    if (malformed and actionable) or premature_finish:
        retried = _retry_force_tool(reactor, system, state, known)
        if retried is not None:
            t2 = (retried.tool or "").strip()
            if t2 and t2 != FINISH and t2 in known:
                tool, args, thought = t2, (retried.args or {}), (retried.thought or thought)

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

    # 가드 ③: INSERT 중복 누적 방지 — 이미 INSERT/REPLACE 가 성공했는데 또 INSERT면
    # (임의 데이터라 args가 달라 가드①을 빠져나감) 100행씩 무한 삽입된다 → 종료.
    # 검증은 SELECT 로(이 가드는 INSERT만 차단), 추가 삽입이 필요하면 사용자가 다시 요청.
    if tool == "run_sql" and _INSERT_RE.match(args.get("sql") or "") and _prior_insert_succeeded(scratch):
        return _finish(loop, thought + " (이미 INSERT가 적용됨 — 중복 누적 삽입 방지로 종료. 검증은 SELECT로 수행)")

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
    if tool == ASK_USER:
        return "clarify"   # 정보/방향 부족 → 사용자에게 되묻기(interrupt)
    if tool in META_TOOL_NAMES:
        return "meta"
    if state.get("react_needs_approval"):
        return "approve"   # 쓰기/위험 → 실행 전 승인
    if tool in PROXY_TOOL_NAMES:
        return "proxy"
    return "client"   # 그 외는 클라이언트 ERD 툴 (interrupt 위임)
