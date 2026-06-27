"""memory_exec 노드 — 메모리 툴(remember·recall·forget) 실행.

location="memory" 툴은 로컬 md 파일(~/.uxermanager/agent_v3_memory.md)만 다룬다.
승인·interrupt 없음(react_route 가 approve 보다 먼저 'memory' 로 분기). 결과를 관찰로 남기고
past_steps 에도 기록한다(실제 수행이므로 — 최종 보고에 반영).
"""
from agent.v3.common.memory import append_memory, forget_memory, render_memory_section
from agent.v3.common.state import AgentState


def _obs(name: str, result: dict) -> str:
    if not result.get("ok"):
        return "실패: " + str(result.get("error") or result)
    if name == "remember":
        if result.get("skipped"):
            return f"이미 기억된 내용이라 건너뜀(현재 {result.get('count')}개)"
        return f"기억함: {result.get('remembered')} (현재 {result.get('count')}개)"
    if name == "forget":
        if result.get("cleared"):
            return "메모리를 모두 비웠습니다."
        return f"{result.get('removed', 0)}개 삭제(현재 {result.get('count')}개)"
    if name == "recall":
        return "현재 메모리:\n" + render_memory_section()
    return "성공"


def memory_exec_node(state: AgentState) -> dict:
    name = state.get("react_tool")
    args = state.get("react_args") or {}
    thought = state.get("react_thought") or ""

    if name == "remember":
        result = append_memory(args.get("content") or args.get("text") or "")
    elif name == "forget":
        all_ = bool(args.get("all") or args.get("all_") or args.get("clear"))
        result = forget_memory(match=args.get("match") or args.get("content"), all_=all_)
    elif name == "recall":
        result = {"ok": True, "memory": render_memory_section()}
    else:
        result = {"ok": False, "error": f"알 수 없는 메모리 툴: {name}"}

    entry = {"thought": thought, "tool": name, "args": args, "observation": _obs(name, result)}
    return {
        "scratchpad": [entry],
        "past_steps": [{"step": {"tool": name, "args": args}, "result": result}],
    }
