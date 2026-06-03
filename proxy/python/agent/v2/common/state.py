# proxy/python/agent/v2/common/state.py
#
# AgentState: 독립 TypedDict — v1 AgentState를 상속하지 않고 필드 전체를 직접 선언.
# TypedDict 상속 시 LangGraph가 Annotated 리듀서를 중복 등록해 "Channel already exists"
# 오류가 발생하므로 독립 선언 방식을 채택한다 (계획서 T-1 대비).
# v1 state.py 는 수정하지 않는다.
#
# v1 헬퍼 함수(recent_messages, last_user_text)는 읽기 전용 re-export.

from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages

# v1의 _add_or_reset 을 import해 동일 함수 객체 재사용 — 리듀서 동일성 보장
from agent.common.state import _add_or_reset                        # v1 읽기 전용
# v1 헬퍼 함수 re-export — v2 내부 모듈은 이 파일에서 import
from agent.common.state import recent_messages, last_user_text      # v1 읽기 전용 # noqa: F401

__all__ = ["AgentState", "recent_messages", "last_user_text"]


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
