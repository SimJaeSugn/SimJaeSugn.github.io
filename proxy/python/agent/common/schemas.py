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
    tool: Literal["create_entity", "create_relation", "auto_layout"] = Field(
        description="실행할 툴 이름"
    )
    args: Dict[str, Any] = Field(default_factory=dict, description="툴 인자(JSON)")


class Plan(BaseModel):
    """실행 계획 — 스텝 목록(의존 순서대로)."""

    steps: List[Step] = Field(default_factory=list)
