# 로컬/자체 서빙 LLM 연동 트러블슈팅

> 대상: UXERManager 에이전트(v1·v2·v3)를 **OpenAI 공식 대신 자체 서빙 모델**(LM Studio·vLLM·Ollama·llama.cpp·TGI 등 OpenAI 호환 엔드포인트)에 연결할 때 발생하는 문제.
> 설정 위치: **설정 > Agent 설정** — Provider/Base URL/MAIN·FAST 모델/API Key. 백엔드는 공유 `proxy/python/agent/common/llm.py`(`ChatOpenAI` + `base_url`)·`keys.py`(`aiBaseUrl`)·`routers/agent.py`(`/agent/config`, `/agent/test`).
> 최초 기록: 2026-06-07 (LM Studio + Qwen3.5-9b 사례). 이후 동일 유형 문제 시 이 문서 먼저 확인.

---

## 0. 가장 중요한 전제 (이걸 모르면 헤맨다)

에이전트는 모델 응답에서 **딱 두 군데만** 읽는다:

| 노드 | 사용 방식 | 읽는 필드 |
|------|----------|-----------|
| analyze · plan · react · verify · replan · gate | `with_structured_output(method="function_calling")` | 응답의 **`tool_calls`** |
| answer · respond | 토큰 스트리밍 | 응답의 **`content`** |

→ **"최종 결과물이 `content` 또는 `tool_calls`에 담겨야"** 에이전트가 동작한다.
모델이 아무리 똑똑하고 정답을 생성해도, 그 출력이 **`reasoning_content`(사고 채널) 등 다른 곳**으로 가고 `content`/`tool_calls`가 비면 **전 노드가 빈손**이 되어 실패한다. "추론/비추론 모델"의 문제가 아니라 **"서빙 프레임워크가 최종 답을 표준 필드에 싣느냐"**의 문제다.

---

## 1. 증상 → 원인 → 해결 (빠른 표)

| 증상 | 원인 | 해결 |
|------|------|------|
| 에이전트가 툴을 **안 부르고** "~하겠습니다"라고 **서술만** 하고 끝남 / 가짜 SQL 지어냄 | 서버가 모델 출력을 `reasoning_content`로 보내 **`content`/`tool_calls`가 빔**(예: LM Studio thinking 모드) | **§2-A** — 서버에서 thinking/reasoning 분리 끄기 |
| `tool_calls`가 빈 배열인데 `reasoning_content`에 `<tool_call>…</tool_call>` 텍스트가 보임 | 서버의 **tool-call 파서가 모델 형식을 못 잡음** | **§2-B** — 서버 tool-call 파서 설정/모델 교체 |
| 모델이 한글을 `???`로 받았다고 함 | **요청 본문 인코딩**(테스트 도구가 UTF-8 미적용) | **§2-C** — UTF-8로 전송(앱 자체는 정상) |
| `404 model not found` / 엉뚱한 모델 응답 | **모델명 불일치** | **§2-D** — `/v1/models`의 정확한 id 사용 |
| 연결 테스트는 ✅인데 에이전트 행동이 깨짐 | 단순 chat은 되지만 **function calling/구조화 출력**이 안 됨 | **§2-A/B** — tool_calls 경로를 따로 검증 |

---

> **★★ 가장 중요(2026-06-07 발견): 강제 tool_choice 비호환**
> 에이전트의 모든 구조화 노드(analyze·plan·react·verify)는 `with_structured_output(method="function_calling")`을 쓴다. 이 방식은 langchain이 **특정 함수를 강제하려고 `tool_choice={"type":"function",...}`(object)** 를 보내는데, **LM Studio는 `tool_choice` 로 none/auto/required(문자열)만 지원**하고 object 는 `400 Invalid tool_choice type: 'object'` 로 거부한다. → analyze 가 예외를 잡아 **answer 폴백** → 모든 질의가 **툴 실행 없이 곧장 답(narration)** 으로 빠진다. **모델·thinking·크기와 무관하게** LM Studio면 발생. (수동 curl 테스트는 `tool_choice="required"` 를 써서 통과하므로 이 문제를 못 본다 — langchain 경로와 다름에 주의.)
> **검증된 해결:** 구조화 출력 method 를 **`json_schema`** 로 바꾸면 LM Studio·OpenAI 모두 동작(`json_mode`는 LM Studio가 거부). `설정>Agent 설정`의 **호환성 검사**(③ 구조화 출력 단계)가 이 비호환을 바로 잡아낸다.

## 2. 원인별 상세

### 2-A. 출력이 `content`/`tool_calls`에 안 실림 (★ 가장 흔함 — reasoning 모드)

**확정 사례(2026-06-07):** LM Studio + `qwen/qwen3.5-9b`. 단순 `"안녕?"`조차 `content`길이=0, `reasoning_content`만 채워짐. `max_tokens`를 4000으로 키워도 `finish=stop`인데 `content` 빔 → **잘림이 아니라 파서가 출력 전체를 reasoning으로 분류**. `/no_think` 토큰·`chat_template_kwargs.enable_thinking=false` 둘 다 그 빌드에선 효과 없음.

**핵심 판별:** `content`가 비고 `reasoning_content`만 차면 이 케이스다.

**해결(서빙 계층에서):**
1. **LM Studio: 모델의 thinking/reasoning 분리를 끈다** → 일반 채팅에서 `content`가 차고 `reasoning`이 비면 성공. (이 사례는 이것으로 완전 해결됨 — 86개 전체 카탈로그 react도 정상.)
2. **다른 서버로 같은 모델 서빙** — vLLM·Ollama·llama.cpp 서버는 `content`/`tool_calls`를 표준대로 채우는 경우가 많다. (추론 모델 유지 가능)
3. **비추론 instruct 모델로 교체** — Qwen2.5-7B/14B-Instruct 등은 출력이 `content`로 직행(가장 단순한 우회).
4. 서버/런타임 **버전 업데이트** — 추론 파싱이 개선됐을 수 있음.

> **코드 폴백은 권장하지 않음:** `content`가 비면 `reasoning_content`를 읽게 만들 수도 있으나, 그 채널엔 **장황한 사고 과정**이 섞여 텍스트 답변(answer·respond) 노드가 망가진다. 서빙 계층에서 고치는 게 정답.

### 2-B. tool-call 파서 미지원

모델이 tool call을 **`<tool_call>{…}</tool_call>` 같은 자체 형식**으로 내는데 서버가 OpenAI `tool_calls` 배열로 변환하지 못하는 경우. (2026-06-07 `zai-org/glm-4.7-flash`가 LM Studio에서 이 증상 — 모델은 올바른 call을 냈으나 `tool_calls` 빔.)

**해결:** 서버에 모델용 tool-call 파서를 지정하거나(예: vLLM `--enable-auto-tool-choice --tool-call-parser hermes|qwen|…`), tool calling이 검증된 모델/서버 조합으로 교체. LM Studio면 버전 업데이트·다른 GGUF 시도.

### 2-C. 한글 인코딩 (주로 진단 테스트에서)

PowerShell `Invoke-RestMethod -Body $string`은 본문을 Latin1로 보내 한글이 `???`로 깨진다. **앱 자체(브라우저→FastAPI→httpx)는 UTF-8 정상**이므로 이건 테스트 도구 한정 함정.

**테스트 시 반드시:**
```powershell
$bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 12))
Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes
```

### 2-D. 모델명 불일치

서버에 따라 `model` 필드 검증이 다르다:
- **검증함(vLLM·Ollama·LM Studio)** → `/v1/models`의 `id`와 **정확히 일치**해야 함(예: `qwen/qwen3.5-9b`). 기본값 `gpt-4o`로 두면 404.
- **무시함(llama.cpp `llama-server` 등 단일모델)** → 아무 문자열이나 통과.

`llm.py`는 MAIN/FAST가 비면 `gpt-4o`/`gpt-4o-mini`로 폴백하므로, **검증형 서버에선 실제 모델명을 반드시 입력**.

---

## 3. 진단 절차 (순서대로)

LM Studio 기준 포트 1234, Base URL `http://localhost:1234/v1`. 다른 서버는 포트만 바꾸면 됨.

**① 서버·모델 식별자 확인**
```powershell
Invoke-RestMethod "http://localhost:1234/v1/models" | % { $_.data.id }
```
→ 여기 나온 `id`를 MAIN/FAST에 그대로 사용.

**② 일반 채팅 — `content`가 차는가 (★ 2-A 판별)**
```powershell
$o=@{model="<모델id>";messages=@(@{role="user";content="안녕? 한 문장으로 답해."});max_tokens=200}
$b=[Text.Encoding]::UTF8.GetBytes(($o|ConvertTo-Json -Depth 8))
$r=Invoke-RestMethod "http://localhost:1234/v1/chat/completions" -Method Post -ContentType "application/json; charset=utf-8" -Body $b
"content길이=$($r.choices[0].message.content.Length) reasoning길이=$($r.choices[0].message.reasoning_content.Length)"
```
→ `content길이>0`이어야 정상. `content=0, reasoning>0`이면 **2-A**.

**③ function calling — `tool_calls`가 차는가 (★ 2-B 판별)**
```powershell
$o=@{model="<모델id>";messages=@(@{role="user";content="주문 테이블의 논리명을 주문, 물리명을 ORDERS로 설정"});
  tools=@(@{type="function";function=@{name="set_entity";description="set names";
    parameters=@{type="object";properties=@{logical=@{type="string"};physical=@{type="string"}};required=@("logical","physical")}}});
  tool_choice="auto";max_tokens=200}
$b=[Text.Encoding]::UTF8.GetBytes(($o|ConvertTo-Json -Depth 10))
$r=Invoke-RestMethod "http://localhost:1234/v1/chat/completions" -Method Post -ContentType "application/json; charset=utf-8" -Body $b
$r.choices[0].message.tool_calls[0].function.arguments   # 비면 2-B (reasoning_content도 확인)
```
→ `{"logical":"주문","physical":"ORDERS"}` 형태가 나와야 정상.

**④ (선택) 대형 카탈로그 react 재현** — ②③ 통과 후에도 실제 앱이 깨지면, 80여 개 툴 카탈로그를 system에 넣고 `ReActStep` 함수(`{thought, tool, args}`)로 `tool_choice="required"` 호출해 올바른 툴을 고르는지 본다. (이 저장소 git 이력 2026-06-07 커밋의 검증 스니펫 참고.)

> **②③이 통과하면 에이전트도 동작한다.** 통과하는데 앱이 깨지면 모델명·Base URL 등 설정값을 다시 확인.

---

## 4. 서버별 메모

| 서버 | 핵심 주의 |
|------|----------|
| **LM Studio** | 추론 모델은 **thinking/reasoning 분리를 끄지 않으면 `content`가 빈다(§2-A)**. 모델명=`/v1/models`의 id. 키 불필요. tool-call 파서가 모델 형식을 못 잡는 경우 있음(§2-B). |
| **vLLM** | tool calling은 `--enable-auto-tool-choice --tool-call-parser <hermes\|qwen\|…>` 필요(안 켜면 `tools` 무시). 모델명=served-model-name. |
| **Ollama** | OpenAI 호환 `/v1`. 모델명=pull한 태그(`qwen2.5:14b`). 일부 버전 tool calling 제한. |
| **llama.cpp(`llama-server`)** | 단일 모델, `model` 무시. tool calling 지원은 빌드/모델 의존. |

---

## 5. 결론 체크리스트

자체 서빙 모델로 에이전트를 쓰기 전 확인:

- [ ] `/v1/models`로 **정확한 모델 id** 확인 → MAIN/FAST에 입력
- [ ] **§3-② 일반 채팅에서 `content`가 찬다** (안 차면 §2-A — 서버 reasoning 분리 끄기)
- [ ] **§3-③ function calling에서 `tool_calls`가 찬다** (안 차면 §2-B)
- [ ] 설정 > Agent 설정: Base URL·모델·**연결 테스트 ✅** 후 저장
- [ ] 자체 서빙 기능을 쓰려면 **사이드카 재빌드**(Base URL 지원은 사이드카 Python 코드에 있음)
- [ ] 앱 새로고침 후 에이전트에서 행동형 질의 → "처리 단계"에 👁(툴 실행)이 뜨는지 확인

---

### 부록: 2026-06-07 사례 요약
LM Studio + `qwen/qwen3.5-9b`. 증상: "선택한 엔티티 정보" 질의에 에이전트가 `describe_table`을 실행하지 않고 "조회하겠습니다 + 가짜 SQL" **서술만** 하고 종료. 진단 결과 **모델·에이전트코드·컨텍스트길이 전부 정상**, 원인은 **LM Studio thinking 모드가 출력 전체를 `reasoning_content`로 보내 `content`/`tool_calls`를 비운 것**. LM Studio에서 thinking을 끄자 일반 채팅 `content` 정상화 + 86개 전체 카탈로그 react에서 `tool_calls`로 `describe_table` 정확히 선택 → 완전 해결.
