# proxy/python/agent/v3/common/schemas.py
#
# v3 ReAct 하이브리드 스키마. v1 읽기 전용 import 만 사용(agent.v2 참조 금지).

from typing import Literal

from pydantic import BaseModel, Field


# ── react 노드 출력 — 한 스텝의 결정 (Thought + 단일 Action) ──────────
class ReActStep(BaseModel):
    """ReAct 한 스텝: 추론(thought) → 단일 행동(tool, args).

    한 번에 툴 1개만 고른다. 모든 목표가 충족되면 tool='finish'.
    """
    thought: str = Field(
        description="지금까지의 [관찰 기록]을 바탕으로 한 추론. 무엇을 왜 할지 한국어로 간결히."
    )
    tool: str = Field(
        description="다음 행동으로 호출할 툴 이름 1개. 모든 목표가 끝났으면 'finish'."
    )
    args_json: str = Field(
        default="{}",
        description="그 툴의 호출 인자를 담은 JSON 객체 **문자열**. 예: '{\"name\": \"주문\"}'. 인자가 없거나 finish면 '{}'.",
    )


# ── 메타툴 카탈로그 (location='meta') — 부수효과 0, 승인 면제 ──────────
# 모델에겐 다른 툴과 동급으로 노출되지만, 핸들러(meta_exec)는 LLM 추론 호출로 처리한다.
META_TOOL_CATALOG = [
    {
        "name": "plan", "kind": "meta", "location": "meta", "danger": False,
        "desc": "지금까지의 관찰을 바탕으로 남은 작업을 subgoal 목록으로 분해/재정비한다(복잡하거나 길을 잃었을 때).",
        "params": "focus(선택: 집중할 부분 설명)",
    },
    {
        "name": "reflect", "kind": "meta", "location": "meta", "danger": False,
        "desc": "진행 상황을 자가점검한다 — 목표 충족·누락·다음 행동을 판단(막혔거나 마무리 직전 점검).",
        "params": "(없음)",
    },
]
META_TOOL_NAMES = {t["name"] for t in META_TOOL_CATALOG}

# ── 되묻기 툴 (location='ask') — 정보/방향이 부족할 때 사용자에게 질문 ──────
# 부수효과 0(승인 면제). react 가 고르면 clarify 노드가 interrupt 로 사용자 답을 받아
# scratchpad(관찰)에 기록하고 react 로 되돌린다. ReAct 루프 중 HITL 되묻기.
ASK_USER = "ask_user"
ASK_USER_TOOL = {
    "name": ASK_USER, "kind": "ask", "location": "ask", "danger": False,
    "desc": "정보가 부족하거나 방향(여러 선택지 중 무엇)을 사용자가 정해야 진행 가능할 때, "
            "추측하지 말고 사용자에게 되묻는다. 읽기 툴로 확인 가능한 것은 먼저 읽고, 정말 막혔을 때만 사용.",
    "params": "question(필수: 사용자에게 할 질문), options(선택: 보기 목록 string[])",
}

# ── 메모리 툴 카탈로그 (location='memory') — 영구 기억 저장/조회/삭제 ──────
# 로컬 md 파일(~/.uxermanager/agent_v3_memory.md)만 다루는 저위험 작업이라 승인 면제.
# memory_exec 노드가 처리하며 react_route 가 approve 보다 먼저 'memory' 로 분기한다.
MEMORY_TOOL_CATALOG = [
    {
        "name": "remember", "kind": "write", "location": "memory", "danger": False,
        "desc": "사용자가 영구히 기억하라고 지시한 내용을 메모리에 저장한다. "
                "'이건 기억해'·'앞으로 항상 ~해'·'잊지 마' 류일 때 사용(이후 모든 턴의 시스템 프롬프트 [메모리]에 로드됨).",
        "params": "content(필수: 기억할 내용. 한 항목 = 한 문장으로 간결히)",
    },
    {
        "name": "recall", "kind": "read", "location": "memory", "danger": False,
        "desc": "저장된 에이전트 메모리를 조회한다(이미 [메모리] 섹션에 로드돼 있어 보통 불필요).",
        "params": "(없음)",
    },
    {
        "name": "forget", "kind": "write", "location": "memory", "danger": False,
        "desc": "메모리에서 항목을 삭제한다. '~는 잊어줘'면 match, '메모리 전부 지워'면 all=true.",
        "params": "match?(지울 항목에 포함된 텍스트) | all?(true 면 전체 삭제)",
    },
]
MEMORY_TOOL_NAMES = {t["name"] for t in MEMORY_TOOL_CATALOG}


# 루프 종료 신호 토큰
FINISH = "finish"

# 무한루프 가드 — 한 턴의 ReAct 반복 상한
MAX_LOOP = 35

# analyze↔clarify 되묻기 상한(무한 되묻기 방지) — 도달 시 가용 정보로 최선 응답
MAX_CLARIFY = 3


# ── 준수 검증 (verify 노드 출력) — react 의 finish 가 진짜 충족인지 판정 ──
class V3Verdict(BaseModel):
    """[분석된 의도]의 goal 이 [관찰 기록] 결과로 충족됐는지 구조적 판정."""
    adherence: Literal["pass", "partial", "fail"] = Field(
        description="pass=모든 목표 충족, partial=일부 미충족(보완 가능), fail=충족 불가/이탈"
    )
    fulfilled: bool = Field(default=False, description="모든 goal 이 충족되면 true")
    missing: list[str] = Field(default_factory=list, description="아직 충족 안 된 목표/누락 설명")
    next: Literal["respond", "continue"] = Field(
        description="respond=종료(보고), continue=보완할 행동이 명확히 남아 react 로 되돌림"
    )
    note: str = Field(default="")


# verify 가 react 로 되돌리는 최대 횟수(무한 검증-보완 루프 방지)
MAX_VERIFY = 2


# ── verify 의 확인 probe (판정 전 read 툴 1회 호출 결정) ──────────────
class V3VerifyProbe(BaseModel):
    """verify 가 판정 전에 결과를 직접 확인하기 위한 단일 read 툴 호출 결정.

    DB에 쓰기/변경이 있었으면 그 반영을 SELECT/COUNT 등으로 1회 확인하면 판정이 정확해진다.
    ERD 전용(=DB 무관) 작업이거나 관찰 기록만으로 충분하면 need_check=False.
    """
    need_check: bool = Field(
        default=False,
        description="결과를 read 툴로 직접 확인하는 게 판정에 도움이 되면 true. DB 무관(ERD 전용)이거나 관찰만으로 충분하면 false.",
    )
    tool: str = Field(
        default="",
        description="확인에 쓸 proxy read 툴 이름 1개(제시된 목록 중에서). need_check=false면 빈 문자열.",
    )
    args_json: str = Field(
        default="{}",
        description="그 툴의 인자 JSON 객체 **문자열**. 예: '{\"sql\": \"SELECT COUNT(*) FROM ORDERS\"}'. 없으면 '{}'.",
    )
    reason: str = Field(default="", description="무엇을 왜 확인하는지 한 줄.")
