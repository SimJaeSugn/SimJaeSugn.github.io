# proxy/python/agent/v2/common/schemas.py
from typing import Literal, Optional

from pydantic import BaseModel, Field

from agent.common.schemas import Step  # v1 읽기 전용 import

# ── 의도 분석 (analyze 노드 출력) ──────────────────────────────────


class Goal(BaseModel):
    id: str = Field(description="목표 식별자. g1, g2 형태")
    description: str = Field(description="목표 설명. '회원 테이블 생성'")
    action: Literal["read", "create", "update", "delete", "layout", "sql", "explain"]
    target_scope: Literal["erd", "db", "concept"] = Field(
        description="erd=다이어그램 편집, db=운영DB 접근, concept=일반지식"
    )
    target_ref: str = Field(default="", description="대상 테이블·컬럼명 (모호하면 빈 문자열)")


class IntentSpec(BaseModel):
    kind: Literal["answer", "act", "mixed", "clarify"] = Field(
        description="answer=읽기전용, act=툴실행, mixed=읽기+쓰기, clarify=모호성"
    )
    summary: str = Field(description="한 줄 의도 요약")
    goals: list[Goal] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list, description="모호한 점 (있으면 kind=clarify)")
    confidence: float = Field(default=1.0)


# ── 계획 수립 (plan 노드 출력) ────────────────────────────────────


class StepV2(Step):           # v1 Step{id, tool, args} 확장
    goal_id: str = Field(default="", description="이 스텝이 기여하는 Goal.id")
    expectation: str = Field(default="", description="성공조건(postcondition) — verify가 대조")


class PlanV2(BaseModel):
    steps: list[StepV2] = Field(default_factory=list)


# ── 준수 검증 (verify 노드 출력) — P0: 스키마만, M4에서 노드 구현 ─


class GoalVerdict(BaseModel):
    goal_id: str
    fulfilled: bool
    evidence: str = Field(default="")


class Verdict(BaseModel):
    adherence: Literal["pass", "partial", "fail"]
    goals: list[GoalVerdict] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    extra: list[str] = Field(default_factory=list)
    score: float = Field(default=0.0)
    next: Literal["respond", "replan", "escalate"]
    note: str = Field(default="")
