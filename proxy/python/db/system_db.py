# db/system_db.py
# AERM 내부 시스템 SQLite DB — db name: aerm_storage
#
# 시스템 내부에서 sqlite 를 사용하는 모든 기능(표준사전 등)이 이 단일 DB 를 공유한다.
# 접속정보는 아래 경로로 고정(하드코딩)되며, 외부 DB 접속 프로파일(/config/profiles)에
# 노출되지 않는다 — 프로파일 매니저는 사용자 외부 DB(postgres/mysql/mssql/oracle) 전용이다.
import sqlite3
from pathlib import Path

DATA_DIR = Path.home() / ".uxermanager"

# 시스템 DB 이름·파일 (고정)
SYSTEM_DB_NAME = "aerm_storage"
SYSTEM_DB_FILE = DATA_DIR / (SYSTEM_DB_NAME + ".db")

# aerm_storage 로 통합되며 더 이상 쓰지 않는 구버전 내부 sqlite 파일 — 발견 시 삭제
_LEGACY_DB_FILES = ["std_dict.sqlite"]

_cleaned = False


def _cleanup_legacy():
    """구버전 내부 sqlite 파일 제거 (프로세스당 1회)."""
    for name in _LEGACY_DB_FILES:
        p = DATA_DIR / name
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass


def connect() -> sqlite3.Connection:
    """시스템 DB(aerm_storage) 커넥션. row_factory=Row."""
    global _cleaned
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _cleaned:
        _cleanup_legacy()
        _cleaned = True
    con = sqlite3.connect(str(SYSTEM_DB_FILE))
    con.row_factory = sqlite3.Row
    return con
