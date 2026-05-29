"""LLM 구조화 출력 스키마."""
from typing import Literal

from pydantic import BaseModel, Field


class RouteDecision(BaseModel):
    """의도 분기 결과 — 행동 필요(act) vs 단순 답변(answer)."""

    route: Literal["act", "answer"] = Field(
        description="ERD를 생성/수정/삭제/정렬하거나 DB를 조작해야 하면 'act', "
        "설명·정의·조언·조회성 질문 등 상태 변경이 불필요하면 'answer'."
    )
    reason: str = Field(default="", description="분류 근거 한 줄.")
