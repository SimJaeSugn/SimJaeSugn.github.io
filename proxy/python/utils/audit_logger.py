import os
from datetime import datetime, timezone
from pathlib import Path

AUDIT_DIR = Path.home() / ".uxermanager"
AUDIT_FILE = AUDIT_DIR / "audit.log"
MAX_BYTES = 10 * 1024 * 1024


def _rotate_if_needed() -> None:
    if not AUDIT_FILE.exists():
        return
    if AUDIT_FILE.stat().st_size >= MAX_BYTES:
        backup = Path(str(AUDIT_FILE) + ".1")
        if backup.exists():
            backup.unlink()
        AUDIT_FILE.rename(backup)


def write_audit_log(tag: str, sql: str, result: dict) -> None:
    try:
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
        _rotate_if_needed()
        ts = datetime.now(timezone.utc).isoformat()
        short_sql = sql[:200] + "..." if len(sql) > 200 else sql
        if result.get("error"):
            detail = f"ERROR: {result['error']}"
        else:
            row_count = result.get("rowCount", 0) or 0
            detail = f"{result.get('durationMs', 0)}ms, {row_count} rows"
        line = f"{ts} [{tag}] {short_sql} ({detail})\n"
        with open(AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass
