"""clarify 노드 — 사용자에게 되묻고(interrupt) 답을 받아 질의를 완성한다.

두 진입 경로를 한 노드로 처리한다(진입원은 react_tool 로 식별):
  ① analyze(선행) — 의도가 불명확(kind="clarify")해 무엇을/어떻게 할지 모를 때.
     IntentSpec.ambiguities 를 질문으로 interrupt → 답을 새 user 메시지로 붙여 analyze 재분류.
  ② react(루프 중) — ReAct 실행 중 정보·방향이 부족해 ask_user 툴을 고른 경우.
     react_args.question 으로 interrupt → 답을 scratchpad(관찰)에 남겨 react 로 되돌림.

interrupt 패턴은 approve/client_exec 와 동일하다(동기 노드). 프론트(client_v3.js)는
type="clarify" interrupt 를 받아 질문 카드를 띄우고 {text} 로 resume 한다.
사용자가 답을 건너뛰면(빈 text) clarify_cancelled → respond(취소)로 분기한다.

격리: agent.* (v1) 와 agent.v3.* 만 참조. agent.v2.* 금지.
"""
from langgraph.types import interrupt

from agent.v3.common.schemas import ASK_USER
from agent.v3.common.state import AgentState


def _question_for(state: AgentState, from_react: bool) -> tuple[str, list]:
    """진입원에 맞는 질문 문구와 보기 목록을 만든다."""
    if from_react:
        args = state.get("react_args") or {}
        q = (args.get("question") or "").strip() or "진행에 필요한 정보를 알려주세요."
        opts = args.get("options") or []
        return q, (opts if isinstance(opts, list) else [])
    # analyze 진입 — IntentSpec.ambiguities / replan_reason 를 질문으로
    intent = state.get("intent") or {}
    ambs = intent.get("ambiguities") or []
    if ambs:
        q = "다음을 구체적으로 알려주세요: " + "; ".join(str(a) for a in ambs)
    else:
        q = (state.get("replan_reason") or "요청이 모호합니다. 무엇을 원하시는지 구체적으로 알려주세요.")
    return q, []


def clarify_node(state: AgentState) -> dict:
    from_react = state.get("react_tool") == ASK_USER
    question, options = _question_for(state, from_react)

    # 그래프 일시정지 → 프론트가 질문 카드를 띄우고 Command(resume={"text": ...}) 로 재개
    answer = interrupt({"type": "clarify", "question": question, "options": options})
    text = answer.get("text") if isinstance(answer, dict) else answer
    text = (text or "").strip() if isinstance(text, str) else ""

    out: dict = {"clarify_count": int(state.get("clarify_count") or 0) + 1}

    if not text:
        # 사용자가 답을 건너뜀 → 진행 불가, respond 가 안내(escalate)
        out["clarify_cancelled"] = True
        out["replan_route"] = "escalate"
        out["replan_reason"] = "사용자가 추가 정보를 제공하지 않아 진행할 수 없습니다."
        return out

    if from_react:
        # ReAct 관찰로 남겨 루프가 답을 반영해 이어가게 한다
        out["scratchpad"] = [{
            "thought": "정보가 부족해 사용자에게 되물었다.",
            "tool": ASK_USER,
            "args": {"question": question},
            "observation": "사용자 답변: " + text,
        }]
    else:
        # 새 대화 턴으로 붙여 analyze 가 완성된 의도로 재분류하게 한다
        out["messages"] = [("assistant", "확인이 필요합니다 — " + question), ("user", text)]

    return out


def clarify_route(state: AgentState) -> str:
    """되묻기 후 분기: 취소→respond, react 진입→react, analyze 진입→analyze."""
    if state.get("clarify_cancelled"):
        return "respond"
    return "react" if state.get("react_tool") == ASK_USER else "analyze"
