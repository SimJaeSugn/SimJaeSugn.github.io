# proxy/python/agent/v3/common/state.py
#
# AgentState: 독립 TypedDict — v1·v2 AgentState를 상속하지 않고 필드 전체를 직접 선언.
# TypedDict 상속 시 LangGraph가 Annotated 리듀서를 중복 등록해 "Channel already exists"
# 오류가 발생하므로 독립 선언 방식을 채택한다 (v2 state.py와 동일한 이유).
#
# 격리(§9.1 진화형): v1(agent/common/state.py)을 읽기 전용으로만 참조한다.
# v2(agent/v2/*)는 참조하지 않는다 — v3는 v1 베이스 위에 독립적으로 세운 실험 레인이다.
#
# v1 헬퍼 함수(recent_messages, last_user_text)는 읽기 전용 re-export.

from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages

# v1의 _add_or_reset 을 import해 동일 함수 객체 재사용 — 리듀서 동일성 보장
from agent.common.state import _add_or_reset                        # v1 읽기 전용
# v1 헬퍼 함수 re-export — v3 내부 모듈은 이 파일에서 import
from agent.common.state import recent_messages, last_user_text      # v1 읽기 전용 # noqa: F401

__all__ = ["AgentState", "recent_messages", "last_user_text"]


class AgentState(TypedDict, total=False):
    """v3 전용 그래프 상태 (ReAct 하이브리드 실험 레인).

    V3-M1: v1 AgentState 필드를 전부 복제해 v1 노드를 그대로 재사용한다.
    V3-M2+: ReAct 루프용 필드(scratchpad·loop_count)를 본격 사용한다.
    """
    # ── v1 AgentState 필드 전체 복제 (v1 노드 재사용을 위해 호환 유지) ──
    # 대화·툴 메시지 누적 (add_messages 리듀서)
    messages: Annotated[list, add_messages]
    # 클라이언트가 보낸 ERD 요약 {entities:[...], relations:[...], activeDiagram}
    erd_context: dict
    # route — analyze 4분기 (v1과 동일)
    route: Optional[Literal["act", "answer", "mixed", "clarify"]]
    # 실행 계획 — 남은 스텝 목록 [{id, tool, args, ...}]
    plan: list
    # 계획 승인 여부 (approve 노드)
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
    # 최종 응답 텍스트
    response: Optional[str]
    # analyze 노드 산출 — IntentSpec.model_dump() (v1 analyze 재사용 시 채워짐)
    intent: Optional[dict]
    verdict: Optional[dict]

    # ── v3 전용 추가 필드 (ReAct 루프 — V3-M2) ─────────────────────────
    # ReAct 관찰 누적: [{thought, tool, args, observation}] — 한 스텝씩 적응
    scratchpad: Annotated[list, _add_or_reset]
    # ReAct 루프 반복 횟수 (무한루프 가드용 상한 카운터)
    loop_count: int
    # react 노드가 정한 다음 행동 (exec/meta 노드가 소비) — 한 스텝의 펜딩 결정
    react_thought: Optional[str]   # 이번 스텝의 추론
    react_tool: Optional[str]      # 다음에 호출할 툴 이름 또는 "finish"
    react_args: Optional[dict]     # 그 툴의 인자
    react_needs_approval: Optional[bool]  # 이 행동이 쓰기/위험이라 승인이 필요한가
    react_approved: Optional[bool]        # approve 노드 결과(사용자 승인 여부)
    # verify 노드 — react 의 finish 가 의도를 충족했는지 구조적 판정
    verdict: Optional[dict]               # V3Verdict.model_dump()
    verify_count: int                     # verify→react 보완 횟수(무한 검증 가드)
    # clarify 노드 — 의도 불명확(analyze) 또는 ReAct 루프 중(ask_user) 사용자 되묻기
    clarify_count: int                    # 되묻기 횟수(무한 되묻기 가드, MAX_CLARIFY)
    clarify_cancelled: Optional[bool]     # 사용자가 답을 건너뜀 → respond(취소)로 분기
