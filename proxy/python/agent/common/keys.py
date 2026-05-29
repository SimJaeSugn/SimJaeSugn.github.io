"""OpenAI API 키 보관 — 기존 keystore/crypto 재사용.

키는 ~/.uxermanager/config.json 의 최상위 `aiKey` 필드에
AES-256-GCM 으로 암호화 저장한다(프로파일과 동일한 마스터 키).
DB 접속정보(profiles)와 같은 스토어를 공유하므로 routers.config 의
스토어 입출력 함수를 재사용한다.
"""
from typing import Optional

from routers.config import _load_raw_store, _save_store
from utils.crypto import decrypt, encrypt


def get_openai_key() -> Optional[str]:
    store = _load_raw_store()
    if not store or not store.get("aiKey"):
        return None
    try:
        return decrypt(store["aiKey"])
    except Exception:
        return None


def set_openai_key(key: str) -> None:
    store = _load_raw_store() or {"profiles": [], "active": None}
    store["aiKey"] = encrypt(key)
    _save_store(store)


def has_openai_key() -> bool:
    return bool(get_openai_key())
