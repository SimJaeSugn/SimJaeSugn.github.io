"""ChatOpenAI 팩토리 + OpenAI 키 로딩."""
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from agent.common.keys import get_agent_config, get_openai_key

# 기본값 상수 — 폴백 및 하위 호환용(기존 import 호환 유지)
DEFAULT_MODEL_MAIN = "gpt-4o"
DEFAULT_MODEL_FAST = "gpt-4o-mini"
MODEL_MAIN = DEFAULT_MODEL_MAIN   # 하위 호환 별칭
MODEL_FAST = DEFAULT_MODEL_FAST   # 하위 호환 별칭


class OpenAIKeyMissing(Exception):
    """OpenAI 키가 설정되지 않음."""


def get_llm(model: str = DEFAULT_MODEL_MAIN, **kwargs) -> ChatOpenAI:
    """OpenAI 호환 ChatOpenAI 팩토리.
    base_url 이 설정돼 있으면 자체 서빙(vLLM·Ollama·LM Studio·llama.cpp 등)
    OpenAI 호환 엔드포인트로 보낸다. model 인자가 DEFAULT_MAIN/FAST 상수이면
    config 동적 값으로 대체한다."""
    cfg = get_agent_config()
    # 상수 별칭으로 호출된 경우 config 동적 값으로 교체
    if model == DEFAULT_MODEL_MAIN:
        model = cfg["modelMain"]
    elif model == DEFAULT_MODEL_FAST:
        model = cfg["modelFast"]

    base_url = (cfg.get("baseUrl") or "").strip()
    key = get_openai_key()
    if not key:
        # 자체 서버는 인증이 없거나 임의 키를 허용하는 경우가 많다 →
        # base_url 이 설정돼 있으면 더미 키로 진행, 아니면 공식 OpenAI 라
        # 키가 필수이므로 예외.
        if base_url:
            key = "sk-no-key-required"
        else:
            raise OpenAIKeyMissing("OpenAI 키가 설정되지 않았습니다.")

    if base_url:
        kwargs.setdefault("base_url", base_url)
    return ChatOpenAI(model=model, api_key=key, temperature=0, **kwargs)


def get_main_llm(**kwargs) -> ChatOpenAI:
    """MAIN 역할 LLM — config 에서 모델명을 동적으로 읽는다."""
    cfg = get_agent_config()
    return get_llm(model=cfg["modelMain"], **kwargs)


def get_fast_llm(**kwargs) -> ChatOpenAI:
    """FAST 역할 LLM — config 에서 모델명을 동적으로 읽는다."""
    cfg = get_agent_config()
    return get_llm(model=cfg["modelFast"], **kwargs)


def test_connection(base_url=None, model=None, api_key=None) -> dict:
    """입력(또는 저장된) 설정으로 실제 최소 호출을 보내 연결을 검증한다.

    설정 모달의 '연결 테스트'용 — 저장 전 값으로도 확인할 수 있도록 인자를
    받되, 비어 있으면 저장된 config·키로 폴백한다.
      - base_url: None=저장값 사용, ""=공식 OpenAI, 그 외=해당 엔드포인트
      - model:    빈 값이면 config 의 modelMain
      - api_key:  빈 값이면 저장된 키(자체 서버는 더미 키 허용)
    성공 시 {ok:True, model, baseUrl}. 실패는 예외를 그대로 올린다(라우터가 처리).
    """
    cfg = get_agent_config()
    if base_url is None:
        base_url = cfg.get("baseUrl") or ""
    base_url = (base_url or "").strip()
    model = (model or "").strip() or cfg["modelMain"]

    key = (api_key or "").strip() or (get_openai_key() or "")
    if not key:
        if base_url:
            key = "sk-no-key-required"
        else:
            raise OpenAIKeyMissing("OpenAI 키가 설정되지 않았습니다.")

    kwargs = {"model": model, "api_key": key, "temperature": 0,
              "max_tokens": 1, "max_retries": 0, "timeout": 20}
    if base_url:
        kwargs["base_url"] = base_url
    llm = ChatOpenAI(**kwargs)
    llm.invoke("ping")   # 실패 시 인증/모델/네트워크 예외 발생
    return {"ok": True, "model": model, "baseUrl": base_url or "OpenAI 공식 엔드포인트"}


# ── 모델 호환성 검사(에이전트 사용 적합성 진단) ─────────────────────────
# 에이전트는 모델에게 (1) content 채널 출력 (2) tool_calls (3) 구조화 출력
# (4) 정확한 툴·인자 를 요구한다. 이 4단계를 실제로 probe 해 적합성을 판정한다.
# (설정 > Agent 설정의 '호환성 검사' 버튼이 /agent/diagnose 로 호출)

# 툴 호출 probe 용 — OpenAI 형식 tool 정의
_PROBE_SET_ENTITY_TOOL = {
    "type": "function",
    "function": {
        "name": "set_entity",
        "description": "ERD 엔티티의 논리명·물리명을 설정한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "logical": {"type": "string", "description": "논리명(한글, 예: 주문)"},
                "physical": {"type": "string", "description": "물리명(영문 대문자, 예: ORDERS)"},
            },
            "required": ["logical", "physical"],
        },
    },
}


class _ProbeIntent(BaseModel):
    """질의 의도 분류 결과(구조화 출력 probe)."""
    kind: str = Field(description="answer, act, mixed, clarify 중 하나")
    summary: str = Field(default="", description="한 줄 요약")


def _diag_err(e: Exception) -> str:
    """진단 단계 예외를 사용자용 한 줄 메시지로 정규화."""
    msg = str(e)
    low = msg.lower()
    if "safe" in low and "filter" in low:
        return ("서버 템플릿 렌더 오류(Jinja 'safe' 필터 미지원) — LM Studio에서 모델 "
                "프롬프트 템플릿을 tool 지원판으로 교체하거나 다른 런타임 사용 필요.")
    if "model_not_found" in low or "invalid model" in low:
        return "모델 식별자 오류 — 서버에 로드된 정확한 모델명(/v1/models)을 입력하세요."
    if "tool_choice" in low:
        return ("서버가 강제 tool_choice(특정 함수 지정)를 거부함 — LM Studio 등은 "
                "none/auto/required 만 지원. 에이전트의 구조화 출력이 이 때문에 실패할 수 있음.")
    if "tool" in low and ("not support" in low or "template" in low):
        return "서버/모델이 tool calling 을 지원하지 않거나 템플릿이 처리 못 함."
    return "오류: " + msg[:160]


def diagnose_model(base_url=None, model=None, api_key=None) -> dict:
    """입력(또는 저장) 설정 모델로 4단계 호환성 배터리를 실행해 적합성을 판정한다.

    단계: ① content 채널(thinking 누수 감지) ② 툴 호출(tool_calls)
          ③ 구조화 출력(의도 분류) ④ 툴 인자 정확도.
    반환: {model, baseUrl, stages:[{key,label,ok,detail}], verdict:'ok|limited|unfit', summary}
    """
    cfg = get_agent_config()
    if base_url is None:
        base_url = cfg.get("baseUrl") or ""
    base_url = (base_url or "").strip()
    model = (model or "").strip() or cfg["modelMain"]
    key = (api_key or "").strip() or (get_openai_key() or "")
    if not key:
        if base_url:
            key = "sk-no-key-required"
        else:
            raise OpenAIKeyMissing("OpenAI 키가 설정되지 않았습니다.")

    def _llm(**kw):
        kwargs = {"model": model, "api_key": key, "temperature": 0,
                  "max_retries": 0, "timeout": 40}
        if base_url:
            kwargs["base_url"] = base_url
        kwargs.update(kw)
        return ChatOpenAI(**kwargs)

    stages = []

    # ① 응답 채널(content) — thinking 누수·빈 응답 감지
    content_ok = False
    try:
        resp = _llm(max_tokens=64).invoke("정확히 'OK' 라고만 답하라.")
        content = (getattr(resp, "content", "") or "").strip()
        content_ok = bool(content)
        stages.append({"key": "content", "label": "응답 채널(content)", "ok": content_ok,
                       "detail": ("응답: " + content[:40]) if content_ok else
                       "content 가 비어 있음 — 출력이 reasoning 채널로 빠지거나(thinking 모드) 응답을 안 냄. thinking 을 끄세요."})
    except Exception as e:  # noqa: BLE001
        stages.append({"key": "content", "label": "응답 채널(content)", "ok": False, "detail": _diag_err(e)})

    # ② 툴 호출(tool_calls) + ④ 정확도 측정
    tool_ok = False
    acc_ok = False
    try:
        # tool_choice="required" — 약한 모델이 '안 부르고 텍스트로 답'하는 위양성 제거
        # (required 는 LM Studio 도 지원하는 문자열 값)
        resp = _llm(max_tokens=200).bind_tools(
            [_PROBE_SET_ENTITY_TOOL], tool_choice="required").invoke(
            "set_entity 툴로 논리명 '주문', 물리명 'ORDERS' 를 설정해줘.")
        calls = getattr(resp, "tool_calls", None) or []
        if calls:
            tool_ok = True
            c0 = calls[0]
            name = c0.get("name", "")
            a = c0.get("args") or {}
            name_ok = (name == "set_entity")
            phys = str(a.get("physical", "")).upper()
            acc_ok = name_ok and ("ORDER" in phys)
            detail = f"호출: {name}({a})"
            if not name_ok:
                detail += " — 제공한 set_entity 가 아닌 다른 툴 호출(환각)"
        else:
            detail = "tool_calls 없음 — 모델이 툴을 호출하지 않음(서버 tool 파싱 실패·미지원·환각 가능)."
        stages.append({"key": "toolcall", "label": "툴 호출(tool_calls)", "ok": tool_ok, "detail": detail})
    except Exception as e:  # noqa: BLE001
        stages.append({"key": "toolcall", "label": "툴 호출(tool_calls)", "ok": False, "detail": _diag_err(e)})

    # ③ 구조화 출력(다중필드 스키마 = 의도 분류) — 에이전트 analyze·plan·react·verify 가
    #    실제로 쓰는 with_structured_output(method="function_calling") 그대로 검사한다.
    #    이 방식은 강제 tool_choice 를 보내므로, 서버가 그걸 거부하면(LM Studio) 여기서 걸린다.
    struct_ok = False
    struct_blocked = False
    try:
        out = _llm(max_tokens=200).with_structured_output(_ProbeIntent, method="function_calling").invoke(
            [("system", "질의 의도를 분류하라. kind 는 answer/act/mixed/clarify 중 하나."),
             ("user", "주문 테이블 만들어줘")])
        kind = getattr(out, "kind", None)
        struct_ok = isinstance(kind, str) and kind.strip() != ""
        stages.append({"key": "structured", "label": "구조화 출력(분류)", "ok": struct_ok,
                       "detail": ("kind=" + str(kind)) if struct_ok else "구조화 출력 실패(스키마를 못 채움)."})
    except Exception as e:  # noqa: BLE001
        if "tool_choice" in str(e).lower():
            struct_blocked = True
        stages.append({"key": "structured", "label": "구조화 출력(분류)", "ok": False, "detail": _diag_err(e)})

    # ④ 툴 인자 정확도(②에서 측정)
    stages.append({"key": "accuracy", "label": "툴 인자 정확도", "ok": acc_ok,
                   "detail": "논리명·물리명을 올바르게 채움" if acc_ok else
                   "툴 인자 값이 부정확하거나 툴 호출 자체가 실패(소형 모델일수록 흔함)."})

    # 판정
    if not content_ok:
        verdict, summary = "unfit", "응답이 비어 있습니다(thinking 누수 등) — 에이전트 사용 불가. thinking 을 끄세요."
    elif struct_blocked:
        # 서버가 강제 tool_choice 거부 → 에이전트 구조화 노드 전부 실패 → answer 폴백·narration
        verdict, summary = "unfit", ("서버가 에이전트의 구조화 출력(강제 tool_choice)을 거부합니다(LM Studio 한계). "
                                     "이 때문에 의도분류·계획 노드가 실패해 답변이 곧장 생성되고 툴 실행이 안 됩니다. "
                                     "모델 자체는 괜찮을 수 있으나 현 서버 구성으론 에이전트 동작 불가.")
    elif not tool_ok:
        verdict, summary = "unfit", ("툴 호출이 안 됩니다 — 서버 tool 파싱·모델 템플릿 문제이거나 tool calling 미지원. "
                                     "에이전트 사용 불가.")
    elif tool_ok and struct_ok and acc_ok:
        verdict, summary = "ok", "에이전트 사용에 적합합니다. 툴 호출·구조화 출력·인자 정확도 모두 통과."
    elif tool_ok and struct_ok:
        verdict, summary = "limited", ("툴 호출·분류는 되나 인자 정확도가 낮습니다(소형 모델 가능성). "
                                       "단순 작업은 가능하나 복잡·모호한 질의는 불안정할 수 있습니다.")
    else:
        verdict, summary = "limited", "툴 호출은 되나 구조화 출력(의도 분류)이 불안정합니다 — 분류 오류로 작업이 안 될 수 있습니다."

    return {"model": model, "baseUrl": base_url or "OpenAI 공식 엔드포인트",
            "stages": stages, "verdict": verdict, "summary": summary}
