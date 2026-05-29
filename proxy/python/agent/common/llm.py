"""ChatOpenAI 팩토리 + OpenAI 키 로딩."""
from langchain_openai import ChatOpenAI

from agent.common.keys import get_openai_key

MODEL_MAIN = "gpt-4o"        # 답변·계획 등 주 모델
MODEL_FAST = "gpt-4o-mini"   # 의도 분기 등 경량 분류


class OpenAIKeyMissing(Exception):
    """OpenAI 키가 설정되지 않음."""


def get_llm(model: str = MODEL_MAIN, **kwargs) -> ChatOpenAI:
    key = get_openai_key()
    if not key:
        raise OpenAIKeyMissing("OpenAI 키가 설정되지 않았습니다.")
    return ChatOpenAI(model=model, api_key=key, temperature=0, **kwargs)
