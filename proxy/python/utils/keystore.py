import os
import secrets
from pathlib import Path

KEY_DIR = Path.home() / ".uxermanager"
KEY_FILE = KEY_DIR / "key"


def load_or_create_key() -> bytes:
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists():
        hex_key = KEY_FILE.read_text(encoding="utf-8").strip()
        return bytes.fromhex(hex_key)
    key = secrets.token_bytes(32)
    KEY_FILE.write_text(key.hex(), encoding="utf-8")
    try:
        KEY_FILE.chmod(0o600)
    except Exception:
        pass
    return key
