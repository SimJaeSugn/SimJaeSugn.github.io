# proxy/python/agent/v2/eval/scorer.py
#
# 픽스처 채점기 — analyze 산출 IntentSpec 과 plan 산출 StepV2[] 를
# 기대값(expect)과 대조해 계획서 §7.1 지표로 채점한다.
#
# 채점 항목
#   kind       : intent.kind == expect.kind                       (항상 검사)
#   scope      : goals[*].target_scope 집합 == expect.scope        (expect.scope 있을 때)
#   goals      : len(goals) 가 expect.goals(정수=정확/">=N") 충족   (expect.goals 있을 때)
#   tools      : 계획 tool 집합 ⊇ expect.tools                      (expect.tools 있을 때)
#   forbidden  : expect.forbidden ∩ 계획 tool == ∅                  (expect.forbidden 있을 때)
#
# 파생 신호
#   confusion  : 운영DB(scope=db) 요청에 ERD 쓰기 툴 사용 — v1 대표 결함(대상 혼동)
#
# v1 모듈을 import 하지 않는다(§9.1 단방향).

from typing import Optional

# ── 툴 분류 (대상 혼동 측정용) ────────────────────────────────────
# ERD 다이어그램을 변경하는 쓰기 툴 — 운영DB 요청에 쓰이면 "대상 혼동"
ERD_WRITE_TOOLS = {
    "create_entity", "delete_entity", "create_relation", "delete_relation",
    "add_attribute", "update_attribute", "remove_attribute", "update_entity",
}
# 운영 DB 접근 툴
DB_TOOLS = {"fetch_db_schema", "run_sql"}


def _planned_tools(plan: list) -> set:
    """계획 스텝들이 사용하는 tool 이름 집합."""
    return {s.get("tool") for s in (plan or []) if isinstance(s, dict) and s.get("tool")}


def _scopes(intent: dict) -> set:
    """intent.goals 의 target_scope 집합."""
    return {
        g.get("target_scope")
        for g in (intent.get("goals") or [])
        if isinstance(g, dict) and g.get("target_scope")
    }


def _check_goals(expect_goals, n: int) -> bool:
    """expect.goals 가 정수면 정확 일치, '>=N' 문자열이면 하한 비교."""
    if isinstance(expect_goals, int):
        return n == expect_goals
    if isinstance(expect_goals, str) and expect_goals.startswith(">="):
        try:
            return n >= int(expect_goals[2:])
        except ValueError:
            return False
    return True  # 알 수 없는 형식 → 검사 생략(통과)


def _expected_scope_set(expect_scope: str) -> set:
    """'erd' → {erd} · 'erd+db' → {erd, db}."""
    return {s for s in expect_scope.split("+") if s}


def score_case(expect: dict, intent: dict, plan: list) -> dict:
    """단일 (intent, plan) 을 expect 와 대조해 체크별 결과를 반환한다.

    반환 checks 의 값: True/False = 검사함, None = 해당 없음(미적용).
    passed = 적용된 모든 검사가 True.
    """
    intent = intent or {}
    checks: dict[str, Optional[bool]] = {
        "kind": None, "scope": None, "goals": None, "tools": None, "forbidden": None,
    }

    # 1) kind — 항상 검사. expect.kind 가 리스트면 허용 집합(예: ["act","mixed"]) 멤버십.
    expect_kind = expect.get("kind")
    got_kind = intent.get("kind")
    if isinstance(expect_kind, list):
        checks["kind"] = got_kind in expect_kind
    else:
        checks["kind"] = got_kind == expect_kind

    tools_used = _planned_tools(plan)

    # 2) scope — expect.scope 있을 때만 (goals 의 target_scope 집합과 정확 일치)
    if "scope" in expect:
        checks["scope"] = _scopes(intent) == _expected_scope_set(expect["scope"])

    # 3) goals 개수
    if "goals" in expect:
        checks["goals"] = _check_goals(expect["goals"], len(intent.get("goals") or []))

    # 4) tools — 계획이 기대 툴을 모두 포함(⊇)
    if "tools" in expect:
        checks["tools"] = set(expect["tools"]).issubset(tools_used)

    # 5) forbidden — 금지 툴 미사용(∅)
    if "forbidden" in expect:
        checks["forbidden"] = len(set(expect["forbidden"]) & tools_used) == 0

    # 파생: 대상 혼동 — db 요청인데 ERD 쓰기 툴 사용
    expects_db = "db" in _expected_scope_set(expect.get("scope", ""))
    confusion = bool(expects_db and (ERD_WRITE_TOOLS & tools_used))

    applied = [v for v in checks.values() if v is not None]
    passed = all(applied) if applied else False

    return {
        "checks": checks,
        "confusion": confusion,
        "passed": passed,
        "tools_used": sorted(tools_used),
    }


def _rate(num: int, den: int) -> float:
    return round(num / den, 4) if den else 0.0


def aggregate(rows: list) -> dict:
    """케이스별 결과(run_case 산출 row)를 split 별로 집계해 스코어카드를 만든다.

    각 row 는 다음 키를 가진다고 가정:
      id, split, expect, pass_rate(0~1), reps, passes,
      check_pass(dict: 항목→통과횟수), check_total(dict: 항목→적용횟수),
      confusion_count, clarify_expected(bool), clarify_hit(int)
    """
    splits: dict[str, list] = {}
    for r in rows:
        splits.setdefault(r.get("split", "?"), []).append(r)

    def _summarize(rs: list) -> dict:
        total_reps = sum(r["reps"] for r in rs)
        # 항목별 통과율(반복 단위)
        items = ("kind", "scope", "goals", "tools", "forbidden")
        item_acc = {}
        for it in items:
            p = sum(r["check_pass"].get(it, 0) for r in rs)
            t = sum(r["check_total"].get(it, 0) for r in rs)
            item_acc[it] = _rate(p, t)
        # 케이스 통과율(케이스가 전 반복 통과 시 1) 평균
        case_pass_mean = _rate(sum(1 for r in rs if r["pass_rate"] >= 1.0), len(rs))
        # 반복 단위 전체 통과율
        rep_pass = _rate(sum(r["passes"] for r in rs), total_reps)
        # 모호성 재현율(clarify): clarify 기대 케이스에서 clarify 적중 반복 비율
        clar = [r for r in rs if r.get("clarify_expected")]
        clar_recall = _rate(sum(r["clarify_hit"] for r in clar), sum(r["reps"] for r in clar)) if clar else None
        # 대상 혼동률: db 기대 케이스 반복 중 ERD 툴 사용 비율
        dbs = [r for r in rs if "db" in _expected_scope_set(r["expect"].get("scope", ""))]
        confusion_rate = _rate(sum(r["confusion_count"] for r in dbs), sum(r["reps"] for r in dbs)) if dbs else None
        return {
            "cases": len(rs),
            "reps": total_reps,
            "rep_pass_rate": rep_pass,             # 반복 단위 통과율
            "case_pass_rate": case_pass_mean,      # 전 반복 통과 케이스 비율
            "intent": {"kind": item_acc["kind"], "scope": item_acc["scope"], "goals": item_acc["goals"]},
            "plan": {"tools": item_acc["tools"], "forbidden": item_acc["forbidden"]},
            "clarify_recall": clar_recall,
            "confusion_rate": confusion_rate,
        }

    summary = {sp: _summarize(rs) for sp, rs in splits.items()}
    summary["overall"] = _summarize(rows)
    return summary
