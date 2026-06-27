"""verify 노드 — v3 ReAct 루프의 준수 검증(확인 read 툴 1회 + 관찰 기반 종료조건).

react 가 finish 하면 곧장 종료(respond)하지 않고, [분석된 의도]의 goal 들이 [관찰 기록]의
실제 결과로 충족됐는지 구조적으로 판정한다(V3Verdict). 모델의 성급한 finish 를 잡는다.

판정 전 단계(2026-06-27): 결과를 **직접 확인**하기 위해 read 전용 proxy 툴 1개를 호출할 수 있다
(V3VerifyProbe). 운영 DB 쓰기/변경의 실제 반영을 SELECT/COUNT 등으로 1회 확인해 판정 정확도를
높인다. 읽기 전용만 허용(run_sql·쓰기/외부/위험 툴 제외) — 승인 게이트와 무관하게 부수효과 0.
확인이 불필요(ERD 전용·관찰만으로 충분)하거나 실패해도 판정은 그대로 진행한다.

- pass/fail/no-goals → respond(종료, 보고는 respond 가).
- partial + 보완 가능 + 검증 상한 미만 → react 로 되돌려 보완(미충족 내용을 관찰에 남김).
- 무한 검증-보완 루프는 MAX_VERIFY 로 차단.

SSE verdict 이벤트로 관측에 노출(프론트 observe_v3 가 렌더).
"""
import json

from agent.common.llm import get_main_llm
from agent.common.state import recent_messages
from agent.tools_proxy import PROXY_TOOL_CATALOG, run_proxy_tool

from agent.v3.common.memory import render_memory_section
from agent.v3.common.prompts import (
    VERIFY_PROBE_SYSTEM,
    VERIFY_SYSTEM,
    render_scratchpad,
)
from agent.v3.common.schemas import MAX_VERIFY, V3Verdict, V3VerifyProbe
from agent.v3.common.state import AgentState
from agent.v3.nodes.act import _obs_text  # v3 내부 재사용(툴-인지형 관찰 요약)

# 확인 probe 에 허용되는 proxy 툴 — 읽기 전용만(쓰기/외부/위험 제외). run_sql 도 external 이라 빠진다.
_READ_PROXY = [t for t in PROXY_TOOL_CATALOG if t.get("kind") == "read"]
_READ_PROXY_NAMES = {t["name"] for t in _READ_PROXY}


def _read_tools_text() -> str:
    """확인 가능한 read proxy 툴 목록을 프롬프트용 텍스트로."""
    return "\n".join(
        f"- {t['name']}({t.get('params', '')}) — {t.get('desc', '')}" for t in _READ_PROXY
    )


def _parse_args_json(raw) -> dict:
    """args_json(JSON 객체 문자열) → dict. 빈 값·파싱 실패·dict 응답 모두 방어."""
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


async def _run_probe(intent: dict, scratch_text: str, messages: list):
    """판정 전 확인용 read 툴 1회 실행 → 관찰 entry(dict) 또는 None.

    LLM 이 need_check=true 로 유효한 read proxy 툴을 고른 경우에만 실행한다.
    환각/쓰기 툴 선택, 호출 실패는 모두 None(판정은 그대로 진행).
    """
    try:
        prober = get_main_llm().with_structured_output(V3VerifyProbe, method="json_schema")
        system = (
            VERIFY_PROBE_SYSTEM
            + "\n\n[확인 가능한 read 툴]\n" + _read_tools_text()
            + f"\n\n[분석된 의도]\n{json.dumps(intent, ensure_ascii=False)}"
            + "\n\n[관찰 기록]\n" + scratch_text
        )
        probe: V3VerifyProbe = await prober.ainvoke([("system", system)] + messages)
        if not probe.need_check:
            return None
        tool = (probe.tool or "").strip()
        if tool not in _READ_PROXY_NAMES:   # 환각·쓰기 툴 차단(읽기 전용만)
            return None
        args = _parse_args_json(probe.args_json)
        result = await run_proxy_tool(tool, args)
        return {
            "thought": "확인: " + (probe.reason or "결과 검증"),
            "tool": tool,
            "args": args,
            "observation": _obs_text(tool, result),
        }
    except Exception:  # noqa: BLE001 — 확인 실패해도 판정은 진행
        return None


async def verify_node(state: AgentState) -> dict:
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

    messages = recent_messages(state)
    scratch = list(state.get("scratchpad") or [])
    scratch_text = render_scratchpad(scratch)

    # 판정 전 확인용 read 툴 1회 호출(읽기 전용) — 결과를 관찰에 반영해 더 정확히 판정
    probe_obs = await _run_probe(intent, scratch_text, messages)
    if probe_obs:
        scratch_text = render_scratchpad(scratch + [probe_obs])

    # json_schema: 강제 tool_choice 미사용 → 로컬 서버(LM Studio) 호환 (function_calling 은 400)
    verifier = get_main_llm().with_structured_output(V3Verdict, method="json_schema")
    system = (
        VERIFY_SYSTEM
        + f"\n\n[분석된 의도]\n{json.dumps(intent, ensure_ascii=False)}"
        + "\n\n[메모리]\n" + render_memory_section()
        + "\n\n[관찰 기록]\n" + scratch_text
    )
    verdict: V3Verdict = await verifier.ainvoke([("system", system)] + messages)
    vd = verdict.model_dump()

    out = {"verify_count": vcount, "verdict": vd}
    new_scratch = []
    if probe_obs:
        new_scratch.append(probe_obs)   # 확인 결과를 관찰 기록에 영구 누적(continue 시 react 가 봄)
    # 보완 필요 → react 가 보도록 미충족 내용을 관찰 기록에 남긴다
    if vd.get("next") == "continue":
        miss = "; ".join(vd.get("missing") or []) or "일부 목표 미충족"
        new_scratch.append({
            "thought": "준수 검증",
            "tool": "verify",
            "args": {},
            "observation": f"검증: {vd.get('adherence')} — 보완 필요: {miss}",
        })
    if new_scratch:
        out["scratchpad"] = new_scratch
    return out


def verify_route(state: AgentState) -> str:
    """검증 결과 분기: continue→react 보완, 그 외 respond. 상한 시 강제 respond."""
    if int(state.get("verify_count") or 0) >= MAX_VERIFY:
        return "respond"
    vd = state.get("verdict") or {}
    return "continue" if vd.get("next") == "continue" else "respond"
