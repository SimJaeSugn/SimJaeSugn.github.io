"""replan 노드 — 실행 결과 평가 후 다음 행동 결정.

M2: execute 가 계획을 모두 소진(plan 비움)하므로 곧바로 done 으로 분기한다.
적응형 재계획(revise/alternative/escalate/abort, §6.4)은 M4 에서 확장한다.
"""
from agent.common.state import AgentState


def replan_node(state: AgentState) -> dict:
    # M2: 상태 보정 없음 (다음 단계는 should_continue 가 결정)
    return {}


def should_continue(state: AgentState) -> str:
    return "continue" if (state.get("plan")) else "done"
