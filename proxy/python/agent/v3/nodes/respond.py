"""respond 노드 — v1 respond 의 격리 복제본(§9.1 "수정해야 하면 복제").

차이점: 시스템 프롬프트에 [메모리] 섹션을 주입해, 최종 응답 생성 시에도 사용자가
기억시킨 영구 지침을 참조한다. 그 외 동작(수행 결과 요약·상태 힌트·토큰 스트리밍)은 v1 과 동일.
v1 공유 모듈(RESPOND_SYSTEM·results_detail)은 읽기 전용 재사용.
"""
from agent.common.llm import get_main_llm
from agent.common.prompts import RESPOND_SYSTEM, results_detail
from agent.common.state import recent_messages

from agent.v3.common.memory import render_memory_section
from agent.v3.common.state import AgentState


def respond_node(state: AgentState) -> dict:
    summary = results_detail(state.get("past_steps") or [])
    route = state.get("replan_route")
    reason = state.get("replan_reason") or ""
    hint = ""
    if route == "escalate":
        hint = ("\n[상태] 다음 이유로 사용자 확인이 필요합니다: " + reason
                + " — 사용자에게 그 점을 구체적으로 되물으세요(어떤 정보/결정이 필요한지 명확히)."
                ) if reason else "\n[상태] 사용자 확인이 필요 — 무엇이 필요한지 구체적으로 되물으세요."
    elif route == "abort":
        hint = "\n[상태] 회복 불가하여 안전하게 종료됨" + (f" (사유: {reason})" if reason else "") + " — 사유를 간단히 설명하세요."
    # v3 추가: 사용자가 기억시킨 영구 지침 — 최종 응답에서도 항상 참조
    system = RESPOND_SYSTEM + "\n\n[메모리(사용자가 기억시킨 영구 지침)]\n" + render_memory_section()
    llm = get_main_llm()
    msgs = [("system", system)] + recent_messages(state) + [
        ("user", f"[수행 결과]\n{summary}{hint}\n\n위 [수행 결과]를 바탕으로 방금 사용자의 요청에 "
                 f"정확히 답하세요(요청한 형식·길이·언어를 반드시 지킬 것).")
    ]
    resp = llm.invoke(msgs)  # stream_mode="messages" 로 토큰 중계
    return {"messages": [resp], "response": resp.content}
