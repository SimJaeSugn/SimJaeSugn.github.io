"""prep 노드 — 턴 시작 리셋.

멀티턴 thread 에서 Checkpointer 가 이전 턴의 ReAct 루프 상태(loop_count·scratchpad)를
보존하므로, 새 질의마다 이를 리셋해 이전 턴 관찰이 섞이지 않게 한다.
analyze 보다 먼저 실행한다. v1 노드는 수정하지 않으므로 v3 전용 리셋 노드로 둔다.
"""
from agent.v3.common.state import AgentState


def prep_node(state: AgentState) -> dict:
    # scratchpad·past_steps 는 _add_or_reset 리듀서라 None → [] 리셋
    return {
        "loop_count": 0,
        "scratchpad": None,
        "past_steps": None,
        "react_tool": None,
        "react_args": None,
        "react_thought": None,
    }
