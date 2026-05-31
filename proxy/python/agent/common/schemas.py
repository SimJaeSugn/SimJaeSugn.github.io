"""LLM 구조화 출력 스키마."""
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


class RouteDecision(BaseModel):
    """의도 분기 결과 — 행동 필요(act) vs 단순 답변(answer)."""

    route: Literal["act", "answer"] = Field(
        description="ERD를 생성/수정/삭제/정렬하거나 DB를 조작해야 하면 'act', "
        "설명·정의·조언·조회성 질문 등 상태 변경이 불필요하면 'answer'."
    )
    reason: str = Field(default="", description="분류 근거 한 줄.")


class Step(BaseModel):
    """실행 계획의 한 스텝 = 툴 1회 호출."""

    id: str = Field(description="스텝 고유 id (snake_case). create_entity의 id는 이후 관계에서 참조됨")
    # 클라이언트가 제공한 카탈로그의 툴 이름 중 하나 (동적 — 카탈로그 밖 툴은 plan 노드가 걸러냄)
    tool: str = Field(description="실행할 툴 이름 (제공된 [사용 가능한 툴] 목록 중 하나)")
    args: Dict[str, Any] = Field(default_factory=dict, description="툴 인자(JSON)")


class Plan(BaseModel):
    """실행 계획 — 스텝 목록(의존 순서대로)."""

    steps: List[Step] = Field(default_factory=list)


class ReplanDecision(BaseModel):
    """실행 결과 평가 후 다음 행동 (적응형 재계획, §6.4)."""

    status: Literal["done", "continue", "escalate", "abort"] = Field(
        description="done=목표 달성·종료, continue=추가/대체 스텝 실행, "
        "escalate=사용자 확인 필요, abort=안전 종료"
    )
    steps: List[Step] = Field(default_factory=list, description="status=continue 일 때 다음 스텝")
    reason: str = Field(default="", description="판단 근거 한 줄")
