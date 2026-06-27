"""prep 노드 — 턴 시작 리셋 + 이번 턴 자동승인(승인 면제) 의도 감지.

멀티턴 thread 에서 Checkpointer 가 이전 턴의 ReAct 루프 상태(loop_count·scratchpad)를
보존하므로, 새 질의마다 이를 리셋해 이전 턴 관찰이 섞이지 않게 한다.
analyze 보다 먼저 실행한다. v1 노드는 수정하지 않으므로 v3 전용 리셋 노드로 둔다.

또한 사용자가 이번 질의에서 '승인 없이 진행해줘' 같은 의도를 자연어로 명시했는지 감지해
state['auto_approve'] 로 전달한다. react 가 이 플래그가 있으면 그 턴 한정으로 쓰기/위험 툴의
승인 게이트를 면제한다(기본은 승인 ON — 매 턴 prep 에서 재평가되므로 다음 턴엔 다시 ON).
"""
import re

from agent.v3.common.state import AgentState, last_user_text

# '승인 없이 진행' 류 자연어 의도 — 한국어/영어 흔한 표현을 폭넓게 매칭(과탐 방지 위해 '승인/확인/묻'에 결합).
_AUTO_APPROVE_RE = re.compile(
    r"승인\s*(없이|생략|면제|안\s*받|불필요|패스|스킵)"
    r"|확인\s*(없이|생략|안\s*받|불필요|패스|스킵)"
    r"|(묻지|물어보지|되묻지|물어보지도)\s*(말고|마)"
    r"|그냥\s*(진행|실행|해|처리)"
    r"|바로\s*(진행|실행|처리)"
    r"|자동\s*승인"
    r"|(no|skip|without|bypass)\s*approval"
    r"|don'?t\s*ask"
    r"|auto[\s-]*approve",
    re.IGNORECASE,
)


def _detect_auto_approve(state: AgentState) -> bool:
    """이번 턴 사용자 발화에서 '승인 없이 진행' 의도를 감지."""
    try:
        txt = last_user_text(state) or ""
    except Exception:  # noqa: BLE001
        txt = ""
    return bool(_AUTO_APPROVE_RE.search(str(txt)))


def prep_node(state: AgentState) -> dict:
    # scratchpad·past_steps 는 _add_or_reset 리듀서라 None → [] 리셋
    return {
        "loop_count": 0,
        "scratchpad": None,
        "past_steps": None,
        "react_tool": None,
        "react_args": None,
        "react_thought": None,
        "react_needs_approval": None,
        "react_approved": None,
        "verify_count": 0,
        "verdict": None,
        "clarify_count": 0,
        "clarify_cancelled": None,
        # 매 턴 질의에서 재평가 — 명시 안 하면 False(승인 게이트 정상)
        "auto_approve": _detect_auto_approve(state),
    }
