# proxy/python/agent/v2/eval/gate.py
#
# 자율 개발 루프(P3) 하드 게이트 — 계획서 §13.1·§14.2.
# 매 라운드 다음 두 불변식을 검사하고, 하나라도 위반이면 비-0 종료코드를 낸다.
#
#   ① v1 무손상 (§9.1)        — v1 파일(routers/agent.py·agent/** 중 v2 제외·agent_*.js)이
#                               기준점 대비 변경 0
#   ② 테스트 자산 동결         — agent/v2/eval/**(fixtures·scorer·runner·gate 자신)가
#                               기준점 대비 변경 0 (점수 위조 차단)
#
# 기준점(--base)은 루프 시작 시 찍는 ref(기본 'autoloop-base').
# 이 시점엔 v1 == main 이므로, base 대비 v1 무변경 ⟺ main 대비 v1 무변경.
#
# 사용: python -m agent.v2.eval.gate [--base autoloop-base]
#   종료코드 0 = 통과(루프 변경 채택 가능) · 1 = 위반(롤백 필요) · 2 = git 오류
#
# v2 전용 — v1 모듈 import 없음(§9.1). git 외 의존성 없음.

import argparse
import subprocess
import sys

# v1 무손상 검사 대상 (agent/ 에서 v2 만 제외)
V1_WHITELIST = [
    "proxy/python/routers/agent.py",
    "proxy/python/agent/",
    ":(exclude)proxy/python/agent/v2",
    "js/agent_panel.js",
    "js/agent_settings.js",
    "js/agent_tools.js",
]
# 동결할 테스트 자산
FROZEN_EVAL = ["proxy/python/agent/v2/eval/"]


def _repo_root() -> str:
    """레포 최상위 경로 — git pathspec 을 cwd 무관하게 해석하기 위해 필요."""
    r = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "git rev-parse 실패")
    return r.stdout.strip()


def _changed(base: str, paths: list, root: str) -> list:
    """base 대비 working tree 에서 변경된(추적/스테이징/미스테이징) 파일 목록.

    git 을 레포 루트에서 실행해 pathspec 을 루트 기준으로 해석한다
    (proxy/python 등 하위 디렉토리에서 호출돼도 정확히 검사).
    """
    r = subprocess.run(
        ["git", "diff", "--name-only", base, "--", *paths],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=root,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "git diff 실패")
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def check(base: str = "autoloop-base") -> tuple[bool, dict]:
    """게이트 검사. (통과여부, {v1:[...], eval:[...]}) 반환."""
    root = _repo_root()
    v1 = _changed(base, V1_WHITELIST, root)
    ev = _changed(base, FROZEN_EVAL, root)
    return (not v1 and not ev), {"v1": v1, "eval": ev}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="P3 자율 루프 하드 게이트 (v1 무손상·테스트자산 동결)")
    ap.add_argument("--base", default="autoloop-base", help="기준 ref (루프 시작 태그)")
    args = ap.parse_args(argv)

    # Windows 콘솔(cp949)에서도 한글·기호가 깨지지 않도록 UTF-8 재설정(가능 시)
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    try:
        ok, viol = check(args.base)
    except RuntimeError as e:
        print(f"GATE ERROR - {e}", file=sys.stderr)
        return 2

    if ok:
        print("GATE PASS - v1 무손상·테스트자산 동결 확인")
        return 0

    if viol["v1"]:
        print("GATE FAIL - v1 파일 변경(격리 위반 §9.1):", file=sys.stderr)
        for f in viol["v1"]:
            print(f"  - {f}", file=sys.stderr)
    if viol["eval"]:
        print("GATE FAIL - 테스트 자산 변경(점수 위조 차단):", file=sys.stderr)
        for f in viol["eval"]:
            print(f"  - {f}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
