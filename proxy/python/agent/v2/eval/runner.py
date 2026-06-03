# proxy/python/agent/v2/eval/runner.py
#
# 검증 오라클 러너 — analyze→plan 까지만 dry-run 으로 돌려 픽스처를 채점한다.
# 실제 ERD/DB 를 건드리지 않는다(execute 노드 미경유). 안전·반복 가능(§7.2).
#
# 비결정성 대비: 케이스당 reps 회(기본 5) 반복해 pass@k·통과율로 기록한다.
# 모델 호출은 get_fast_llm/get_main_llm 이 temperature=0 으로 생성한다.
#
# CLI:  python -m agent.v2.eval.runner [--fixtures PATH] [--reps N] [--split all|golden|holdout] [--min-pass R]
#   종료코드: 0 정상 · 1 임계(min-pass) 미달 또는 케이스 오류 · 2 OpenAI 키 없음
#
# v2 전용 — analyze_node/plan_node_v2(agent.v2.nodes)만 호출, v1 import 없음(§9.1).

import argparse
import json
import os
import sys

from agent.v2.nodes.analyze import analyze_node
from agent.v2.nodes.plan import plan_node_v2
from agent.v2.eval.scorer import score_case, aggregate

DEFAULT_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures.jsonl")

# plan 을 돌리는 kind — answer/clarify 는 계획 단계가 없다(§7.2)
_PLAN_KINDS = ("act", "mixed")

# 기본 클라이언트 툴 카탈로그 — 실제 앱은 js/agent_tools.js 카탈로그를 보내지만
# eval 은 프록시 없이 도므로, 클라(ERD) 툴이 plan 카탈로그 필터에서 누락되지 않도록
# 대표 카탈로그를 공급한다(없으면 create_entity 등 ERD 툴이 전부 제거돼 거짓 실패).
# 픽스처가 "tool_catalog" 를 직접 주면 그것을 우선한다.
DEFAULT_CLIENT_CATALOG = [
    {"name": "create_entity", "params": "id, logicalName, physicalName, attrs[]", "desc": "새 테이블 생성"},
    {"name": "create_relation", "params": "from, to, card, addFk", "desc": "관계 생성(1:1|1:N|N:M)"},
    {"name": "auto_layout", "params": "type", "desc": "자동 배치(hierarchical|grid|circular)"},
    {"name": "delete_entity", "params": "entityId", "desc": "테이블 삭제", "danger": True},
    {"name": "delete_relation", "params": "from, to", "desc": "관계 삭제"},
    {"name": "add_attribute", "params": "entityId, attr", "desc": "컬럼 추가"},
    {"name": "update_attribute", "params": "entityId, attrName, {...}", "desc": "컬럼 수정"},
    {"name": "remove_attribute", "params": "entityId, attrName", "desc": "컬럼 삭제"},
    {"name": "update_entity", "params": "entityId, logicalName?, physicalName?", "desc": "테이블 수정"},
    {"name": "find_tables", "params": "query?", "desc": "테이블 검색(읽기)"},
    {"name": "describe_table", "params": "entityId", "desc": "테이블 상세 조회(읽기)"},
    {"name": "list_relations", "params": "entityId?", "desc": "관계 목록 조회(읽기)"},
    {"name": "get_selection", "params": "", "desc": "현재 선택 조회(읽기)"},
    {"name": "generate_ddl", "params": "dialect?", "desc": "ERD→DDL 생성(읽기)"},
    {"name": "describe_tool", "params": "name?", "desc": "툴 상세 설명(읽기)"},
]


def load_fixtures(path: str = DEFAULT_FIXTURES, split: str = "all") -> list:
    """fixtures.jsonl 을 로드한다. split='golden'|'holdout' 이면 해당만 반환."""
    cases = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cases.append(json.loads(line))
    if split and split != "all":
        cases = [c for c in cases if c.get("split") == split]
    return cases


def analyze_only(query: str, context: dict | None) -> dict:
    """analyze 노드만 호출해 IntentSpec(dict)을 반환. 실패 시 route 기반 폴백."""
    state = {"messages": [("user", query)], "erd_context": context or {}}
    result = analyze_node(state)
    intent = result.get("intent")
    if intent:
        return intent
    # analyze_node 가 invoke 실패 시 intent=None, route='answer' 폴백을 반환
    return {"kind": result.get("route") or "answer", "goals": []}


def plan_only(query: str, intent: dict, context: dict | None, catalog: list | None) -> list:
    """plan 노드만 호출해 StepV2[](dict 리스트)을 반환한다.

    catalog 미지정 시 DEFAULT_CLIENT_CATALOG 를 공급한다 — 그렇지 않으면
    plan_node 의 카탈로그 필터가 클라(ERD) 툴을 전부 제거해 거짓 실패가 난다.
    """
    state = {
        "messages": [("user", query)],
        "erd_context": context or {},
        "intent": intent,
        "tool_catalog": catalog if catalog else DEFAULT_CLIENT_CATALOG,
    }
    return plan_node_v2(state).get("plan") or []


def run_case(case: dict, reps: int = 5) -> dict:
    """한 케이스를 reps 회 반복해 채점 결과를 집계한 row 를 만든다."""
    expect = case.get("expect", {})
    context = case.get("context")            # 픽스처가 ERD 컨텍스트를 줄 수도 있음(현재 비움)
    catalog = case.get("tool_catalog")       # 미지정 시 plan 노드 폴백 카탈로그 사용
    clarify_expected = expect.get("kind") == "clarify"

    items = ("kind", "scope", "goals", "tools", "forbidden")
    check_pass = {it: 0 for it in items}
    check_total = {it: 0 for it in items}
    passes = 0
    confusion_count = 0
    clarify_hit = 0
    errors = 0
    last = None

    for _ in range(reps):
        try:
            intent = analyze_only(case["query"], context)
            plan = (
                plan_only(case["query"], intent, context, catalog)
                if intent.get("kind") in _PLAN_KINDS
                else []
            )
            row = score_case(expect, intent, plan)
        except Exception as e:  # noqa: BLE001 — 한 반복 실패가 전체를 막지 않도록
            errors += 1
            last = {"error": str(e)}
            continue

        if row["passed"]:
            passes += 1
        if row["confusion"]:
            confusion_count += 1
        if clarify_expected and intent.get("kind") == "clarify":
            clarify_hit += 1
        for it in items:
            v = row["checks"].get(it)
            if v is not None:
                check_total[it] += 1
                if v:
                    check_pass[it] += 1
        last = {"intent": intent, "plan": plan, "checks": row["checks"], "tools_used": row["tools_used"]}

    scored = reps - errors
    return {
        "id": case.get("id"),
        "split": case.get("split", "?"),
        "query": case.get("query"),
        "expect": expect,
        "reps": reps,
        "scored": scored,
        "errors": errors,
        "passes": passes,
        "pass_rate": round(passes / reps, 4) if reps else 0.0,
        "check_pass": check_pass,
        "check_total": check_total,
        "confusion_count": confusion_count,
        "clarify_expected": clarify_expected,
        "clarify_hit": clarify_hit,
        "sample": last,
    }


def run_fixtures(path: str = DEFAULT_FIXTURES, reps: int = 5, split: str = "all") -> dict:
    """픽스처 일괄 채점 → {"summary", "rows"}. dry-run(실행 없음)."""
    cases = load_fixtures(path, split)
    rows = [run_case(c, reps) for c in cases]
    return {"summary": aggregate(rows), "rows": rows}


# ── CLI ───────────────────────────────────────────────────────────

def _fmt_pct(v) -> str:
    return "  n/a " if v is None else f"{v * 100:5.1f}%"


def _print_scorecard(result: dict) -> None:
    print("\n=== v2 eval 스코어카드 (dry-run) ===")
    print(f"{'ID':<6}{'split':<9}{'pass':>7}  query")
    for r in result["rows"]:
        flag = "" if r["errors"] == 0 else f" !{r['errors']}err"
        print(f"{r['id']:<6}{r['split']:<9}{r['pass_rate'] * 100:6.0f}%  {r['query']}{flag}")
    print("\n--- 집계 (split별) ---")
    s = result["summary"]
    hdr = f"{'split':<9}{'cases':>6}{'rep통과':>9}{'kind':>8}{'scope':>8}{'goals':>8}{'tools':>8}{'forbid':>8}{'clarify':>9}{'혼동':>7}"
    print(hdr)
    for sp in ("golden", "holdout", "overall"):
        if sp not in s:
            continue
        m = s[sp]
        print(
            f"{sp:<9}{m['cases']:>6}{_fmt_pct(m['rep_pass_rate'])}"
            f"{_fmt_pct(m['intent']['kind'])}{_fmt_pct(m['intent']['scope'])}{_fmt_pct(m['intent']['goals'])}"
            f"{_fmt_pct(m['plan']['tools'])}{_fmt_pct(m['plan']['forbidden'])}"
            f"{_fmt_pct(m['clarify_recall'])}{_fmt_pct(m['confusion_rate'])}"
        )
    print()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="v2 검증 오라클 — analyze→plan dry-run 채점")
    ap.add_argument("--fixtures", default=DEFAULT_FIXTURES)
    ap.add_argument("--reps", type=int, default=5)
    ap.add_argument("--split", default="all", choices=["all", "golden", "holdout"])
    ap.add_argument("--min-pass", type=float, default=None,
                    help="overall rep 통과율 임계 — 미달 시 종료코드 1")
    ap.add_argument("--json", action="store_true", help="스코어카드 대신 JSON 출력")
    args = ap.parse_args(argv)

    # Windows 콘솔(cp949 등)에서도 한글·기호가 깨지지 않도록 UTF-8 재설정(가능 시)
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    # OpenAI 키 부재를 친절히 처리 (CLI/CI에서 키 없이 실행될 수 있음)
    from agent.common.keys import has_openai_key  # 지연 import — 모듈 로드 자체는 키 불필요
    if not has_openai_key():
        print("OpenAI 키가 설정되지 않았습니다. 설정 ▸ Agent설정에서 키를 입력하세요.", file=sys.stderr)
        return 2

    result = run_fixtures(args.fixtures, args.reps, args.split)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        _print_scorecard(result)

    # 종료코드 결정
    total_errors = sum(r["errors"] for r in result["rows"])
    if total_errors:
        print(f"⚠️ 채점 중 {total_errors}건 오류 발생", file=sys.stderr)
        return 1
    if args.min_pass is not None:
        overall = result["summary"]["overall"]["rep_pass_rate"]
        if overall < args.min_pass:
            print(f"⚠️ overall 통과율 {overall:.2%} < 임계 {args.min_pass:.2%}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
