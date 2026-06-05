"""meta_exec 노드 — 메타툴(plan·reflect) 실행.

location="meta" 툴은 ERD/DB 를 건드리지 않는 '생각 도구'다. LLM 추론을 한 번 더 돌려
관찰 텍스트를 만들고 scratchpad 에만 누적한다(past_steps 에는 기록하지 않음 — 수행 결과 아님).
승인·interrupt 없음.
"""
import json

from agent.common.llm import get_fast_llm

from agent.v3.common.prompts import (
    PLAN_META_SYSTEM,
    REFLECT_SYSTEM,
    render_scratchpad,
)
from agent.v3.common.state import AgentState


def meta_exec_node(state: AgentState) -> dict:
    name = state.get("react_tool")
    args = state.get("react_args") or {}
    thought = state.get("react_thought") or ""
    intent_json = json.dumps(state.get("intent") or {}, ensure_ascii=False)

    system = PLAN_META_SYSTEM if name == "plan" else REFLECT_SYSTEM
    user = (
        f"[분석된 의도]\n{intent_json}\n\n"
        "[관찰 기록]\n" + render_scratchpad(state.get("scratchpad"))
    )
    focus = (args or {}).get("focus")
    if focus:
        user += f"\n\n[집중할 부분]\n{focus}"

    llm = get_fast_llm()
    resp = llm.invoke([("system", system), ("user", user)])
    obs = (getattr(resp, "content", "") or "").strip() or "(빈 결과)"

    entry = {"thought": thought, "tool": name, "args": args, "observation": obs}
    return {"scratchpad": [entry]}
