"""act 노드들 — ReAct 루프의 행동(Action) 실행 + 관찰(Observation) 기록.

proxy_exec : location="proxy" 툴(fetch_db_schema·run_sql 등)을 서버에서 직접 실행(interrupt 없음).
client_exec: location="client" 툴(create_entity 등)을 interrupt 로 프론트(드래프트)에 위임.

관찰(_obs_text)은 **툴-인지형 요약**이다. 특히 fetch_db_schema 처럼 큰 결과는 raw JSON 을
그대로 자르면 대상 테이블이 잘려 모델이 못 보고 무한 재조회하므로(버그 2026-06-05),
테이블 목록·컬럼을 컴팩트하게 요약해 모델이 진행할 수 있게 한다.
"""
import json

from langgraph.types import interrupt

from agent.tools_proxy import run_proxy_tool

from agent.v3.common.state import AgentState

_MAX_OBS = 4000   # 관찰 텍스트 상한 (scratchpad 에 매 루프 누적되므로 과대 방지)


def _summarize_schema(result: dict) -> str:
    """fetch_db_schema 결과를 테이블 목록 + 컬럼 요약으로 컴팩트 렌더."""
    schema = result.get("schema") or {}
    tables = schema.get("tables") or []
    if not tables:
        return "성공: DB에 조회된 테이블이 없습니다."
    names = [t.get("tableName") or t.get("name") or "?" for t in tables]
    header = f"성공: DB 테이블 {len(names)}개 — " + ", ".join(names)

    def _cols(t):
        out = []
        for c in (t.get("columns") or []):
            cn = c.get("columnName") or c.get("name") or "?"
            dt = c.get("dataType") or c.get("type") or ""
            pk = "PK" if (c.get("isPk") or c.get("isPrimaryKey")) else ""
            nn = "" if (c.get("isNullable", True) in (True, None)) else "NN"
            tag = cn + (f":{dt}" if dt else "") + (f" {pk}" if pk else "") + (f" {nn}" if nn else "")
            out.append(tag.strip())
        return out

    # 1차: 전 테이블 컬럼 포함 (보통 DB는 여기서 끝)
    detailed = [header, "[테이블별 컬럼]"]
    for t in tables:
        tn = t.get("tableName") or t.get("name") or "?"
        detailed.append(f"- {tn}({', '.join(_cols(t))})")
    text = "\n".join(detailed)
    if len(text) <= _MAX_OBS:
        return text

    # 2차(테이블 과다): 목록 + 컬럼 수만. 특정 테이블 상세는 run_sql 유도.
    brief = [header,
             "[테이블이 많아 컬럼 요약 생략 — 특정 테이블 상세는 run_sql(예: SHOW COLUMNS FROM <테이블> / DESCRIBE <테이블>)로 조회]"]
    for t in tables:
        tn = t.get("tableName") or t.get("name") or "?"
        brief.append(f"- {tn} ({len(t.get('columns') or [])}컬럼)")
    return "\n".join(brief)[:_MAX_OBS]


def _summarize_sql(result: dict) -> str:
    """run_sql 결과를 행 수 + 상위 몇 행으로 컴팩트 렌더."""
    rows = result.get("rows") or []
    rc = result.get("rowCount")
    head = f"성공: {rc if rc is not None else len(rows)}행 반환"
    if not rows:
        return head + " (행 없음)"
    shown = rows[:12]
    try:
        body = "\n".join("  " + json.dumps(r, ensure_ascii=False) for r in shown)
    except Exception:  # noqa: BLE001
        body = str(shown)
    text = head + ":\n" + body
    if len(rows) > len(shown):
        text += f"\n  … 외 {len(rows) - len(shown)}행"
    return text[:_MAX_OBS]


def _obs_text(name: str, result) -> str:
    """툴 결과를 관찰 텍스트로 변환(툴-인지형 요약 + 길이 상한)."""
    if not isinstance(result, dict):
        return str(result)[:800]
    if result.get("ok") is False or result.get("error"):
        return "실패: " + str(result.get("error") or result)[:600]
    if name == "fetch_db_schema":
        return _summarize_schema(result)
    if name == "run_sql":
        return _summarize_sql(result)
    try:
        s = json.dumps(result, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        s = str(result)
    return ("성공: " + s)[:1500]


async def proxy_exec_node(state: AgentState) -> dict:
    name = state.get("react_tool")
    args = state.get("react_args") or {}
    thought = state.get("react_thought") or ""
    result = await run_proxy_tool(name, args)
    entry = {"thought": thought, "tool": name, "args": args, "observation": _obs_text(name, result)}
    return {
        "scratchpad": [entry],
        "past_steps": [{"step": {"tool": name, "args": args}, "result": result}],
    }


def client_exec_node(state: AgentState) -> dict:
    name = state.get("react_tool")
    args = state.get("react_args") or {}
    thought = state.get("react_thought") or ""
    n = state.get("loop_count") or 0
    call = {"id": f"r{n}", "tool": name, "args": args}
    # 그래프 일시정지 → 프론트가 드래프트에 실행 후 Command(resume=results) 로 재개
    results = interrupt({"type": "tool_calls", "calls": [call]})
    results = results or []
    result = results[0] if results else {"error": "결과 없음"}
    entry = {"thought": thought, "tool": name, "args": args, "observation": _obs_text(name, result)}
    return {
        "scratchpad": [entry],
        "past_steps": [{"step": call, "result": result}],
    }
