"""v3 에이전트 영구 메모리 — md 파일 저장/로드(mtime 자동 재로드).

사용자가 "이건 기억해줘"·"앞으로 ~해" 처럼 영구 기억을 자연어로 지시하면, react 가 remember
툴을 호출해 이 모듈이 md 파일(~/.uxermanager/agent_v3_memory.md)에 한 줄씩 누적한다.
에이전트 실행(턴)마다 load_memory() 로 로드해 시스템 프롬프트의 [메모리] 섹션에 주입한다.

자동 재로드: load_memory() 는 파일 mtime 을 캐시한다. 파일이 (툴로든 사용자가 직접 편집하든)
바뀌면 mtime 이 달라져 다시 읽는다. 안 바뀌었으면 캐시를 반환(불필요한 디스크 IO 방지).

격리(§9.1): v1·v2 무관한 v3 전용 모듈. 저장 경로 상수(DATA_DIR)만 공유 인프라에서 읽기 재사용.
"""
import datetime
import re
from pathlib import Path

from db.system_db import DATA_DIR   # ~/.uxermanager (공유 인프라 — 경로 상수만 재사용)

MEMORY_FILE: Path = DATA_DIR / "agent_v3_memory.md"

# mtime 기반 로드 캐시: (mtime, content). 파일이 바뀌면 갱신.
_cache: tuple[float, str] | None = None


def _read_raw() -> str:
    try:
        return MEMORY_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
    except Exception:  # noqa: BLE001
        return ""


def load_memory() -> str:
    """저장된 메모리 md 전문을 반환. 파일 mtime 이 바뀌면 다시 읽는다(없으면 빈 문자열)."""
    global _cache
    try:
        mtime = MEMORY_FILE.stat().st_mtime
    except FileNotFoundError:
        _cache = None
        return ""
    except Exception:  # noqa: BLE001
        mtime = -1.0
    if _cache is not None and _cache[0] == mtime:
        return _cache[1]
    content = _read_raw()
    _cache = (mtime, content)
    return content


_COMMENT_RE = re.compile(r"\s*<!--.*?-->\s*$")


def memory_items() -> list[str]:
    """메모리 항목(- 불릿) 텍스트 목록. 표시용 날짜 주석(<!-- ... -->)은 제거."""
    items = []
    for line in load_memory().splitlines():
        s = line.strip()
        if s.startswith("- "):
            item = _COMMENT_RE.sub("", s[2:].strip()).strip()
            if item:
                items.append(item)
    return items


def render_memory_section() -> str:
    """시스템 프롬프트 [메모리] 섹션용 텍스트. 없으면 '(없음)'."""
    items = memory_items()
    if not items:
        return "(없음)"
    return "\n".join(f"- {it}" for it in items)


def _write_raw(text: str) -> None:
    global _cache
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MEMORY_FILE.write_text(text, encoding="utf-8")
    _cache = None   # 다음 load 에서 강제 재읽기


def append_memory(content: str) -> dict:
    """메모리에 한 항목 추가. 동일 내용이 이미 있으면 중복 추가하지 않는다."""
    text = (content or "").strip()
    if not text:
        return {"ok": False, "error": "기억할 내용(content)이 비어 있습니다."}
    # 여러 줄이면 공백 1칸으로 접어 한 항목으로(불릿 1줄 = 1기억)
    text = re.sub(r"\s+", " ", text)
    items = memory_items()
    if any(text == it for it in items):
        return {"ok": True, "skipped": "이미 기억된 내용", "count": len(items)}

    raw = load_memory()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d")
    if not raw.strip():
        body = "# 에이전트 메모리\n\n"
    else:
        body = raw if raw.endswith("\n") else raw + "\n"
    body += f"- {text}  <!-- {stamp} -->\n"   # 날짜 주석은 표시용 — memory_items() 가 파싱 시 제거
    _write_raw(body)
    return {"ok": True, "remembered": text, "count": len(memory_items())}


def forget_memory(match: str | None = None, all_: bool = False) -> dict:
    """메모리 항목 삭제. all_=True 면 전체 비움, 아니면 match 를 포함하는 항목 제거."""
    if all_:
        _write_raw("")
        try:
            MEMORY_FILE.unlink()
        except Exception:  # noqa: BLE001
            pass
        global _cache
        _cache = None
        return {"ok": True, "cleared": True, "count": 0}

    m = (match or "").strip()
    if not m:
        return {"ok": False, "error": "삭제할 항목(match) 또는 all=true 가 필요합니다."}
    items = memory_items()
    kept = [it for it in items if m.lower() not in it.lower()]
    removed = len(items) - len(kept)
    if removed == 0:
        return {"ok": True, "removed": 0, "note": "일치하는 항목 없음", "count": len(items)}
    body = "# 에이전트 메모리\n\n" + "".join(f"- {it}\n" for it in kept)
    _write_raw(body)
    return {"ok": True, "removed": removed, "count": len(kept)}
