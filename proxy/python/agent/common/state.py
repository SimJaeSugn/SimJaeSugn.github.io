"""에이전트 그래프 공유 상태 (LangGraph AgentState).

M1: gate → answer (직접 응답)
M2: gate → plan → execute(interrupt) → replan → respond (ACT 경로)
M3: 멀티턴 — messages 가 thread 별로 누적되고, 노드가 최근 k턴을 LLM에 전달.
"""
from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages

# LLM 에 전달할 최근 대화 메시지 수 (토큰 비용 상한)
HISTORY_WINDOW = 8


def _add_or_reset(left, right):
    """past_steps 리듀서: right 가 None 이면 리셋(턴 시작), 아니면 누적.

    한 턴 안에서는 execute 가 여러 배치를 누적할 수 있어야 하고(M3 병렬),
    턴 사이에는 이전 턴의 결과가 섞이지 않도록 리셋해야 한다.
    """
    if right is None:
        return []
    return (left or []) + (right or [])


class AgentState(TypedDict, total=False):
    # 대화·툴 메시지 누적 (add_messages 리듀서가 BaseMessage 로 코어싱) — 멀티턴 히스토리
    messages: Annotated[list, add_messages]
    # 클라이언트가 보낸 ERD 요약 {entities:[...], relations:[...], activeDiagram}
    erd_context: dict
    # gate 판정 결과
    route: Optional[Literal["act", "answer"]]
    # 실행 계획 — 남은 스텝 목록 [{id, tool, args}]
    plan: list
    # 실행 결과 [{step, result}] — 턴 단위(gate 가 None 으로 리셋, execute 가 누적)
    past_steps: Annotated[list, _add_or_reset]
    # 최종 응답 텍스트 (스트리밍과 별개로 보관)
    response: Optional[str]


def recent_messages(state: AgentState, k: int = HISTORY_WINDOW) -> list:
    """최근 k개 대화 메시지(BaseMessage) 반환 — LLM 프롬프트에 히스토리로 전달."""
    msgs = state.get("messages") or []
    return list(msgs[-k:])


def last_user_text(state: AgentState) -> str:
    """state.messages 의 마지막 사용자 발화 텍스트를 추출한다."""
    msgs = state.get("messages") or []
    if not msgs:
        return ""
    last = msgs[-1]
    content = getattr(last, "content", None)
    if content is not None:
        return content
    if isinstance(last, (list, tuple)) and len(last) == 2:
        return last[1]
    return str(last)
