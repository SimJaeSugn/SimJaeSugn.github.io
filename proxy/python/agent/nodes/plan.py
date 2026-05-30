"""plan 노드 — 사용자 요청을 툴 호출 계획(steps)으로 분해. 멀티턴 히스토리 반영."""
from agent.common.llm import MODEL_MAIN, get_llm
from agent.common.prompts import PLAN_SYSTEM, context_brief
from agent.common.schemas import Plan
from agent.common.state import AgentState, recent_messages


def plan_node(state: AgentState) -> dict:
    llm = get_llm(MODEL_MAIN)
    # Step.args 가 자유형 Dict[str, Any] 라서 strict json_schema 모드를 쓸 수 없다
    # (strict 는 모든 객체에 additionalProperties:false 를 요구). function_calling
    # 방식(비-strict)으로 자유형 객체를 허용한다.
    planner = llm.with_structured_output(Plan, method="function_calling")
    system = PLAN_SYSTEM + "\n\n[현재 ERD]\n" + context_brief(state.get("erd_context"))
    # 시스템(현재 ERD) + 최근 대화 히스토리 → "아까 만든 회원 테이블" 같은 참조 해소
    prompt = [("system", system)] + recent_messages(state)
    plan = planner.invoke(prompt)
    return {"plan": [s.model_dump() for s in plan.steps]}
