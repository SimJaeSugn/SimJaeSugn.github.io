#!/usr/bin/env python
"""promote_v2_to_v1.py — Agent v2 → v1 승격 자동화.

v2(실험 레인)에서 eval/자율루프로 검증된 상태를 v1(운영)으로 옮긴다.
설계: docs/plan/v2_to_v1_promotion.md

동작:
  REPLACE  v2 파일을 v1으로 통째 복사 + import 치환(agent.v2 → agent)
  MERGE    v2의 # PROMOTED 블록만 v1 동일 파일에 치환(없으면 append)

사용:
  python tools/promote_v2_to_v1.py            # dry-run (변경 미리보기만)
  python tools/promote_v2_to_v1.py --apply    # 실제 적용
  python tools/promote_v2_to_v1.py --diff      # 변경될 unified diff 출력

커밋·머지는 사람이. 항상 새 브랜치에서 실행하고, 적용 후 앱 테스트 체크리스트(§7)를 따른다.
"""
import argparse
import difflib
import py_compile
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # tools/ → repo root
PYROOT = ROOT / "proxy" / "python"

# (v2 source, v1 target) — 레포 루트 기준 상대경로 아님, PYROOT 기준
REPLACE = [
    ("agent/v2/nodes/analyze.py", "agent/nodes/analyze.py"),
    ("agent/v2/nodes/plan.py",    "agent/nodes/plan.py"),
    ("agent/v2/graph.py",         "agent/graph.py"),
]
MERGE = [
    ("agent/v2/common/schemas.py", "agent/common/schemas.py"),
    ("agent/v2/common/prompts.py", "agent/common/prompts.py"),
    ("agent/v2/common/state.py",   "agent/common/state.py"),
]

BEGIN = "# === PROMOTED:BEGIN"
END = "# === PROMOTED:END ==="


def rewrite_imports(text: str) -> str:
    """v2 네임스페이스를 v1으로 치환 (from/import agent.v2.x → agent.x)."""
    return text.replace("agent.v2.", "agent.")


def _find_block(lines):
    bi = next((i for i, l in enumerate(lines) if l.startswith(BEGIN)), None)
    ei = next((i for i, l in enumerate(lines) if l.rstrip() == END), None)
    return bi, ei


def extract_block(text: str, label: str) -> str:
    lines = text.splitlines(keepends=True)
    bi, ei = _find_block(lines)
    if bi is None or ei is None or ei < bi:
        raise SystemExit(f"❌ {label}: PROMOTED 블록을 찾지 못했습니다.")
    return "".join(lines[bi:ei + 1])


def replace_or_append_block(target: str, new_block: str) -> str:
    if not new_block.endswith("\n"):
        new_block += "\n"
    lines = target.splitlines(keepends=True)
    bi, ei = _find_block(lines)
    if bi is not None and ei is not None and ei >= bi:
        return "".join(lines[:bi]) + new_block + "".join(lines[ei + 1:])   # 치환
    sep = "" if target.endswith("\n") else "\n"
    return target + sep + "\n" + new_block                                 # append


def build_changes():
    """[(target_rel, new_text, mode)] 산출 (쓰지 않음)."""
    out = []
    for src_rel, tgt_rel in REPLACE:
        src = (PYROOT / src_rel).read_text(encoding="utf-8")
        out.append((tgt_rel, rewrite_imports(src), "REPLACE"))
    for src_rel, tgt_rel in MERGE:
        block = rewrite_imports(extract_block((PYROOT / src_rel).read_text(encoding="utf-8"), src_rel))
        cur = (PYROOT / tgt_rel).read_text(encoding="utf-8") if (PYROOT / tgt_rel).exists() else ""
        out.append((tgt_rel, replace_or_append_block(cur, block), "MERGE"))
    return out


def _compile_ok(text: str, name: str) -> bool:
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(text)
        tmp = f.name
    try:
        py_compile.compile(tmp, doraise=True)
        return True
    except py_compile.PyCompileError as e:
        print(f"  ⚠️ {name} 구문 오류: {e.msg.splitlines()[-1] if e.msg else e}", file=sys.stderr)
        return False
    finally:
        Path(tmp).unlink(missing_ok=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Agent v2 → v1 승격")
    ap.add_argument("--apply", action="store_true", help="실제 파일에 적용(미지정 시 dry-run)")
    ap.add_argument("--diff", action="store_true", help="unified diff 출력")
    args = ap.parse_args(argv)
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    changes = build_changes()
    any_changed = False
    syntax_ok = True
    print(f"=== v2 → v1 승격 {'(APPLY)' if args.apply else '(DRY-RUN)'} ===")
    for tgt_rel, new_text, mode in changes:
        tgt = PYROOT / tgt_rel
        cur = tgt.read_text(encoding="utf-8") if tgt.exists() else ""
        changed = cur != new_text
        any_changed |= changed
        ok = _compile_ok(new_text, tgt_rel)
        syntax_ok &= ok
        flag = "변경" if changed else "동일"
        print(f"  [{mode:7}] {tgt_rel}: {flag} · 구문 {'OK' if ok else 'FAIL'}")
        if args.diff and changed:
            for line in difflib.unified_diff(
                cur.splitlines(), new_text.splitlines(),
                fromfile=f"a/{tgt_rel}", tofile=f"b/{tgt_rel}", lineterm="",
            ):
                print("    " + line)

    if not syntax_ok:
        print("\n❌ 구문 오류가 있어 적용을 중단합니다. v2 소스/마커를 확인하세요.", file=sys.stderr)
        return 1

    if args.apply:
        for tgt_rel, new_text, _ in changes:
            (PYROOT / tgt_rel).write_text(new_text, encoding="utf-8")
        print("\n✅ 적용 완료.")
    else:
        print("\n[DRY-RUN] --apply 로 실제 적용. (--diff 로 상세 확인)")

    print("\n다음을 직접 검증하세요(스크립트는 커밋/머지하지 않음):")
    print("  1) cd proxy/python && python -c \"import agent.graph\"   # v1 임포트 성공")
    print("  2) 앱 테스트 체크리스트 — docs/plan/v2_to_v1_promotion.md §7")
    print("     (answer·act/erd·act/db·mixed·clarify·approve·interrupt·undo·set_cardinality·normalize_check)")
    print("  3) v1 프론트(agent_panel.js)가 4분기·clarify에서 정상인지 확인")
    return 0 if syntax_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
