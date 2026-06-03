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


# === PROMOTED:BEGIN (v2→v1 승격 대상: AgentState 필드 — route 4분기 + intent/verdict) ===
class AgentState(TypedDict, total=False):
    """v2 전용 그래프 상태.

    v1 AgentState 필드를 전부 복제하고 route를 4종으로 확장,
    intent / verdict 필드를 추가한다.
    """
    # ── v1 AgentState 필드 전체 복제 ────────────────────────────────
    # 대화·툴 메시지 누적 (add_messages 리듀서)
    messages: Annotated[list, add_messages]
    # 클라이언트가 보낸 ERD 요약 {entities:[...], relations:[...], activeDiagram}
    erd_context: dict
    # route — v2는 4종으로 확장 (v1 "act"|"answer" 에서 "mixed"|"clarify" 추가)
    route: Optional[Literal["act", "answer", "mixed", "clarify"]]
    # 실행 계획 — 남은 스텝 목록 [{id, tool, args, ...}]
    plan: list
    # 계획 승인 여부 (approve 노드 — 사용자 승인 후 execute)
    approved: Optional[bool]
    # 클라이언트가 제공한 사용 가능한 툴 카탈로그
    tool_catalog: list
    # 실행 결과 [{step, result}] — 턴 단위 리셋(None)/누적
    # v1의 _add_or_reset 함수 객체를 그대로 사용해 리듀서 동일성 확보
    past_steps: Annotated[list, _add_or_reset]
    # 적응형 재계획 횟수·분기 결과·사유
    replan_count: int
    replan_route: Optional[str]
    replan_reason: Optional[str]
    # 최종 응답 텍스트 (스트리밍과 별개로 보관)
    response: Optional[str]

    # ── v2 전용 추가 필드 ──────────────────────────────────────────
    # analyze 노드 산출 — IntentSpec.model_dump() 저장 (검증 기준)
    intent: Optional[dict]
    # verify 노드 산출 — P0에서는 항상 None, M4에서 실제 사용
    verdict: Optional[dict]
# === PROMOTED:END ===


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
