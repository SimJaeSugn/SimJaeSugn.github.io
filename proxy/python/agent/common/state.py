"""에이전트 그래프 공유 상태 (LangGraph AgentState).

M1 범위: gate(의도 분기) → answer(직접 응답) 까지만 사용한다.
plan/execute/past_steps 등은 M2 이후 확장된다.
"""
from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict, total=False):
    # 대화·툴 메시지 누적 (add_messages 리듀서가 BaseMessage 로 코어싱)
    messages: Annotated[list, add_messages]
    # 클라이언트가 보낸 ERD 요약 {entities:[...], relations:[...], activeDiagram}
    erd_context: dict
    # gate 판정 결과
    route: Optional[Literal["act", "answer"]]
    # 최종 응답 텍스트 (스트리밍과 별개로 보관)
    response: Optional[str]


def last_user_text(state: AgentState) -> str:
    """state.messages 의 마지막 사용자 발화 텍스트를 추출한다."""
    msgs = state.get("messages") or []
    if not msgs:
        return ""
    last = msgs[-1]
    content = getattr(last, "content", None)
    if content is not None:
        return content
    # ("user", "텍스트") 튜플 형태 방어
    if isinstance(last, (list, tuple)) and len(last) == 2:
        return last[1]
    return str(last)
