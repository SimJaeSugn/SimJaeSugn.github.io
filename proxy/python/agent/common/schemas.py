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

# === PROMOTED:BEGIN (v2→v1 승격 대상: 의도·계획·검증 스키마. Step 은 v1 공유라 블록 밖) ===
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
# === PROMOTED:END ===
