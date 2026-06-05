"""verify 노드 — v3 ReAct 루프의 준수 검증(관찰 기반 종료조건).

react 가 finish 하면 곧장 종료(respond)하지 않고, [분석된 의도]의 goal 들이 [관찰 기록]의
실제 결과로 충족됐는지 구조적으로 판정한다(V3Verdict). 모델의 성급한 finish 를 잡는다.

- pass/fail/no-goals → respond(종료, 보고는 respond 가).
- partial + 보완 가능 + 검증 상한 미만 → react 로 되돌려 보완(미충족 내용을 관찰에 남김).
- 무한 검증-보완 루프는 MAX_VERIFY 로 차단.

SSE verdict 이벤트로 관측에 노출(프론트 observe_v3 가 렌더).
"""
import json

from agent.common.llm import get_main_llm
from agent.common.state import recent_messages

from agent.v3.common.prompts import VERIFY_SYSTEM, render_scratchpad
from agent.v3.common.schemas import MAX_VERIFY, V3Verdict
from agent.v3.common.state import AgentState


def verify_node(state: AgentState) -> dict:
    intent = state.get("intent") or {}
    goals = intent.get("goals") or []
    vcount = int(state.get("verify_count") or 0) + 1

    # 목표가 없으면(또는 분석되지 않았으면) 검증 생략 — 통과
    if not goals:
        return {"verify_count": vcount,
                "verdict": {"adherence": "pass", "fulfilled": True, "missing": [], "next": "respond", "note": "검증할 목표 없음"}}

    # 검증 상한 도달 → 더 보완 시도하지 않고 종료(보고)
    if vcount > MAX_VERIFY:
        return {"verify_count": vcount,
                "verdict": {"adherence": "partial", "fulfilled": False, "missing": [], "next": "respond", "note": f"검증 상한({MAX_VERIFY}) 도달 — 현재까지 결과로 보고"}}

    llm = get_main_llm()
    verifier = llm.with_structured_output(V3Verdict, method="function_calling")
    system = (
        VERIFY_SYSTEM
        + f"\n\n[분석된 의도]\n{json.dumps(intent, ensure_ascii=False)}"
        + "\n\n[관찰 기록]\n" + render_scratchpad(state.get("scratchpad"))
    )
    verdict: V3Verdict = verifier.invoke([("system", system)] + recent_messages(state))
    vd = verdict.model_dump()

    out = {"verify_count": vcount, "verdict": vd}
    # 보완 필요 → react 가 보도록 미충족 내용을 관찰 기록에 남긴다
    if vd.get("next") == "continue":
        miss = "; ".join(vd.get("missing") or []) or "일부 목표 미충족"
        out["scratchpad"] = [{
            "thought": "준수 검증",
            "tool": "verify",
            "args": {},
            "observation": f"검증: {vd.get('adherence')} — 보완 필요: {miss}",
        }]
    return out


def verify_route(state: AgentState) -> str:
    """검증 결과 분기: continue→react 보완, 그 외 respond. 상한 시 강제 respond."""
    if int(state.get("verify_count") or 0) >= MAX_VERIFY:
        return "respond"
    vd = state.get("verdict") or {}
    return "continue" if vd.get("next") == "continue" else "respond"
