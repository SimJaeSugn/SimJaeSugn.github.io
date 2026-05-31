"""ChatOpenAI 팩토리 + OpenAI 키 로딩."""
from langchain_openai import ChatOpenAI

from agent.common.keys import get_agent_config, get_openai_key

# 기본값 상수 — 폴백 및 하위 호환용(기존 import 호환 유지)
DEFAULT_MODEL_MAIN = "gpt-4o"
DEFAULT_MODEL_FAST = "gpt-4o-mini"
MODEL_MAIN = DEFAULT_MODEL_MAIN   # 하위 호환 별칭
MODEL_FAST = DEFAULT_MODEL_FAST   # 하위 호환 별칭


class OpenAIKeyMissing(Exception):
    """OpenAI 키가 설정되지 않음."""


def get_llm(model: str = DEFAULT_MODEL_MAIN, **kwargs) -> ChatOpenAI:
    """provider 무관하게 항상 OpenAI로 동작(현재 OpenAI 전용).
    model 인자가 DEFAULT_MAIN/FAST 상수이면 config 동적 값으로 대체한다."""
    cfg = get_agent_config()
    # 상수 별칭으로 호출된 경우 config 동적 값으로 교체
    if model == DEFAULT_MODEL_MAIN:
        model = cfg["modelMain"]
    elif model == DEFAULT_MODEL_FAST:
        model = cfg["modelFast"]
    key = get_openai_key()
    if not key:
        raise OpenAIKeyMissing("OpenAI 키가 설정되지 않았습니다.")
    return ChatOpenAI(model=model, api_key=key, temperature=0, **kwargs)


def get_main_llm(**kwargs) -> ChatOpenAI:
    """MAIN 역할 LLM — config 에서 모델명을 동적으로 읽는다."""
    cfg = get_agent_config()
    return get_llm(model=cfg["modelMain"], **kwargs)


def get_fast_llm(**kwargs) -> ChatOpenAI:
    """FAST 역할 LLM — config 에서 모델명을 동적으로 읽는다."""
    cfg = get_agent_config()
    return get_llm(model=cfg["modelFast"], **kwargs)
