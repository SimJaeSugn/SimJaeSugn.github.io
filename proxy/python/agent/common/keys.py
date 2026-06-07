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


# ── Agent 설정 (provider / 모델명) ────────────────────────────────

_DEFAULT_PROVIDER = "openai"
_DEFAULT_MODEL_MAIN = "gpt-4o"
_DEFAULT_MODEL_FAST = "gpt-4o-mini"
_DEFAULT_BASE_URL = ""   # 빈 값 = OpenAI 공식 엔드포인트


def get_agent_config() -> dict:
    """config.json 최상위에서 aiProvider/aiModelMain/aiModelFast/aiBaseUrl 읽기.
    미설정 시 기본값으로 폴백. baseUrl 이 채워져 있으면 자체 서빙 등
    OpenAI 호환 엔드포인트로 동작한다."""
    store = _load_raw_store()
    if not store:
        return {
            "provider": _DEFAULT_PROVIDER,
            "modelMain": _DEFAULT_MODEL_MAIN,
            "modelFast": _DEFAULT_MODEL_FAST,
            "baseUrl": _DEFAULT_BASE_URL,
        }
    return {
        "provider": store.get("aiProvider") or _DEFAULT_PROVIDER,
        "modelMain": store.get("aiModelMain") or _DEFAULT_MODEL_MAIN,
        "modelFast": store.get("aiModelFast") or _DEFAULT_MODEL_FAST,
        "baseUrl": store.get("aiBaseUrl") or _DEFAULT_BASE_URL,
    }


def set_agent_config(provider: str, model_main: str, model_fast: str,
                     base_url: Optional[str] = None) -> None:
    """config.json 최상위에 aiProvider/aiModelMain/aiModelFast/aiBaseUrl 저장.
    빈 문자열 모델·provider 는 무시하고 기존 값을 유지한다.
    base_url 은 None 이면 미변경, 빈 문자열("")이면 명시적으로 비워(공식 OpenAI 복귀)
    저장한다 — 사용자가 자체 서버 → 공식 엔드포인트로 되돌릴 수 있도록.
    _save_store 가 내부적으로 _invalidate_cache 를 호출한다."""
    store = _load_raw_store() or {"profiles": [], "active": None}
    if provider and provider.strip():
        store["aiProvider"] = provider.strip()
    if model_main and model_main.strip():
        store["aiModelMain"] = model_main.strip()
    if model_fast and model_fast.strip():
        store["aiModelFast"] = model_fast.strip()
    if base_url is not None:
        store["aiBaseUrl"] = base_url.strip()
    _save_store(store)
