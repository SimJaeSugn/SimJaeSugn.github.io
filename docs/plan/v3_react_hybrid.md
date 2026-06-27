# Agent v3 — Plan-and-Execute + ReAct 하이브리드 (도구형)

> 상태: **V3-M1·M2 완료**(main 머지 b9f7523) · **M3 완료**(승인 게이트+verify, 2026-06-06) · **clarify 강화**(interrupt 기반 되묻기 — 의도불명+ReAct 루프 중 정보부족, 2026-06-06) — 다음 M4(eval) · 작성일 2026-06-05
> 격리 근거: `docs/ref/AI_ERD_v2_의도분석_계획준수_구현계획서.html` §9.1 격리 계약의 **진화형**
> (v3는 v1 베이스 위에 세운 독립 실험 레인이며, v2와도 분리한다.)

## 1. 목표 / 전략

v3는 **Plan-and-Execute + ReAct 하이브리드(도구형, option C)**를 적용한 실험 레인이다.

- **Plan-and-Execute**: 의도 분석(analyze) 후 목표를 분해한다.
- **ReAct(도구형)**: 계획을 특권 단계가 아니라 **모델이 호출하는 메타툴(`plan`/`reflect`)**로 두고,
  한 번에 툴 1개를 호출→관찰(observation)→다음 행동을 동적으로 결정하는 루프로 실행한다.

핵심 차이(v1·v2 대비): v1·v2는 "계획을 미리 다 짜고 일괄 실행"하는 Plan-and-Execute다.
v3는 실행을 **한 스텝씩 적응적**으로 바꾸고, 계획조차 루프 안에서 필요할 때 호출한다.

## 2. 툴 3분류 (도구형 ReAct의 핵심)

| location | 실행 위치 | 예시 | 승인 |
|----------|----------|------|------|
| `client` | 브라우저/Electron (interrupt 위임) | create_entity·create_relation·auto_layout | 위험 툴 게이트 |
| `proxy`  | Python 서버 (그래프 내 직접 실행) | fetch_db_schema·run_sql·db_doc_* | run_sql 등 위험 시 |
| `meta`   | Python 서버 (LLM 추론 호출, 부수효과 0) | **plan·reflect** (v3 신규) | **면제** |
| `ask`    | 사용자 (clarify interrupt 위임) | **ask_user** (v3 신규) | **면제**(부수효과 0) |

- `ask_user`(location="ask")는 ReAct 루프 중 정보·방향이 부족할 때 모델이 고르는 **되묻기 툴**이다.
  `clarify` 노드가 interrupt 로 사용자 답을 받아 scratchpad(관찰)에 남기고 react 로 되돌린다.
  읽기 툴로 자가 해소 가능한 것은 먼저 읽고, 정말 사람만 답할 수 있을 때만 쓰도록 프롬프트로 유도한다.

- 프록시 툴(`agent/tools_proxy.py`)·클라 툴(`js/agent_tools.js`)은 **버전 무관 공유**로 그대로 재사용한다.
- v3가 새로 만드는 것은 ① `plan`/`reflect` **메타툴** ② **ReAct 루프 컨트롤러**뿐이다.
- 메타툴은 카탈로그에선 다른 툴과 **동급 노출**(모델이 자유 선택), 핸들러에선 **전용 경로**(승인·interrupt 면제, LLM 호출).

## 3. 출구 전략 — 승급이 아니라 "진입점 교체(컷오버)"

v3는 토폴로지가 v1과 다르므로 v2→v1식 기계적 승급(`promote_v2_to_v1.py`)이 적용되지 않는다.
대신 격리 덕분에 **진입점 컷오버**로 교체한다(되돌리기도 진입점만 복귀).

- 프론트 진입점만 v3로 전환: `index.html`의 진입 버튼 + UI가 부르는 전역/URL.
- 백엔드는 `/agent/*`(v1)·`/agent/v3/*`(v3) 병렬 유지 → 무위험 롤백.
- 전제: **기능 패리티 + eval 검증** 충족 후에만 플립.

**컷오버 1단계 적용(2026-06-06, 오너 결정) — 최종 형태:** v3 진입을 **우하단 플로팅 🧠 버튼**으로 단일화하고, 우측 도크의 **"🤖 Agent" 탭은 제거**했다(`index.html`).
- 경위: ① 먼저 도크 'Agent' 탭 `onclick` 을 v3(`toggleAgentV3Panel()`)로 컷오버 → ② 도크 탭이 플로팅 패널을 여는 형태가 어색해, 오너 결정으로 **도크 'Agent' 탭 자체를 삭제**. 이제 v3는 플로팅 패널(드래그 이동·자유 리사이즈·위치 기억 지원)로만 접근한다.
- **보존(무위험 롤백)**: v1 `#panelViewAgent`·`agent_panel.js`·백엔드 `/agent/*` 그대로. 롤백 = `data-ptab="agent"` 탭 버튼을 `#panelTabs` 에 복원.
- **유지**: v2(🤖)·v3(🧠) 플로팅 버튼·백엔드 `/agent/v2/*`·`/agent/v3/*` 병렬 그대로.
- **미전환**: 단축키 `toggleAgentPanel()`(Ctrl+Shift+A)은 여전히 v1 도크 채팅(`#panelViewAgent`)을 연다(탭은 없지만 뷰는 존재 — 필요 시 후속 전환/비활성).
- 전제(eval M4·M5)는 미충족 상태에서 오너 결정으로 선적용 — 완전 컷오버(M6)와는 별개의 부분 단계.

## 4. 로드맵

| 마일스톤 | 내용 | 상태 |
|----------|------|------|
| **V3-M1** | 격리 골격(작동 미러) + 격리 계약 확립 + 하네스 | **✅ 완료** (2026-06-05) |
| **V3-M2** | ReAct 루프 토폴로지(react⇄act⇄observe) + `plan`/`reflect` 메타툴 + 발산 가드(loop_count 상한) | **✅ 완료** (2026-06-05) |
| **V3-M3** | 준수 검증(verify) + ReAct 관찰 기반 종료조건 + **행동별 승인 모델** | **✅ 완료** (2026-06-06) — 승인 게이트 + verify 노드 |
| V3-M4 | eval 오라클(ReAct는 실행레벨 → 샌드박스 필요) | 예정 |
| V3-M5 | A/B/C 비교 + 진입점 컷오버 준비 | 예정 |
| V3-M6 | 진입점 교체(v3→기본) — 별도 오너 결정 | **부분 적용**(2026-06-06) — 우측 도크 'Agent' 탭 제거, v3 진입을 플로팅 🧠 버튼으로 단일화(§3). 단축키(Ctrl+Shift+A→v1)·완전 전환은 미정 |

### V3-M1 완료 내역 (2026-06-05)
- 격리 레인 골격: `agent/v3/`(graph·common/state·nodes) · `routers/v3/agent.py`(`/agent/v3/*`) · `js/agent_v3/`(panel·client·observe)
- 등록부 추가 2곳: `main.py`(try/except 가드) · `index.html`(🧠 버튼+패널+스크립트)
- v1 노드 읽기 재사용(작동 미러), 독립 Checkpointer·`thread_id=v3_*`·전역 `_AGENT_V3_*`·DOM `#agentV3Panel`
- 검증 통과: 그래프 빌드(노드 11) · diff 화이트리스트 비어있음 · v1·v2↔v3 상호 참조 grep 0건 · 라우터 등록 정상(v1·v2 무영향)
- 하네스 신설("Agent v3 격리", 주기적 갱신 규칙 포함) · README 2종 동기화

### V3-M2 완료 내역 (2026-06-05)
- **토폴로지 교체**: `START → prep → analyze ─act/mixed→ fetch_tools → react ⇄ {meta_exec|proxy_exec|client_exec} ─finish→ respond`
- **react 노드**(`nodes/react.py`): `[관찰 기록]`을 보고 한 스텝에 툴 1개 동적 선택(`ReActStep` 구조화 출력). `react_route` 가 툴 location(meta/proxy/client/finish)으로 분기.
- **메타툴**(`common/schemas.py` `META_TOOL_CATALOG`): `plan`·`reflect`(location="meta"). `meta_exec` 노드가 `get_fast_llm` 추론으로 처리 — ERD/DB 무변경·승인/ interrupt 면제. scratchpad 에만 누적(past_steps 제외).
- **행동 노드**(`nodes/act.py`): `proxy_exec`(서버 직접, `run_proxy_tool`) · `client_exec`(단일 `tool_calls` interrupt 위임). 결과를 `scratchpad`+`past_steps`에 누적.
- **발산/반복 가드**: `loop_count` 상한 `MAX_LOOP=35`(2026-06-27 16→35 상향, 오너 요청) + ① 직전과 동일한 `(tool,args)` 반복 → finish · ② 메타툴(plan/reflect) 연속 호출 → finish · ③ 카탈로그 밖 툴 환각 → finish. (라이브 테스트에서 `reflect` 무한반복 버그 발견 → 가드 ①②와 프롬프트 보강으로 수정 2026-06-05.)
- **텍스트 결과물 처리**: 분석·진단·개선점 제안 등 '말로 하는 답변'은 툴이 아니라 `finish→respond` 가 [관찰 기록]을 근거로 생성한다는 점을 REACT_SYSTEM 에 명시(데이터 수집 후 분석하려고 메타툴을 더 부르지 않게).
- **관찰 요약(툴-인지형, `act.py` `_obs_text`)**: 라이브 테스트에서 대형 DB의 `fetch_db_schema` 결과를 raw JSON 으로 잘라(800자) 대상 테이블이 관찰에서 사라져 무한 재조회하는 버그 발견(2026-06-05). → `fetch_db_schema` 는 테이블 목록+컬럼을 컴팩트 요약(테이블 과다 시 목록+컬럼수 폴백+run_sql 유도), `run_sql` 은 행수+상위행 요약(상한 4000자). REACT_SYSTEM 에 "fetch_db_schema 는 전체를 한 번에 주니 재조회 말고, 특정 테이블 상세는 run_sql" 지침 추가. 재현 테스트: 1회 조회 후 finish + 전체 스키마 맥락 기반 분석(USER_ID→tb_user FK 제안 등) 생성 확인.
- **턴 리셋**: `prep` 노드가 `loop_count`/`scratchpad`/`past_steps`를 턴 시작에 리셋(멀티턴 누수 방지). v1 노드 미수정.
- **상태 필드 추가**(`common/state.py`): `react_thought`·`react_tool`·`react_args`(펜딩 결정), `scratchpad`·`loop_count` 본격 사용.
- **SSE 추가**: `thought`(react 추론·다음 행동)·`observation`(행동 결과). 프론트 `observe_v3.js`가 버블 안 ReAct 추적(trace)으로 렌더(🎯 의도·🧠 생각·👁 관찰).
- **재사용(v1 읽기 전용)**: `analyze`·`answer`·`fetch_tools`·`respond` 노드, `tools_proxy`·LLM·프롬프트 헬퍼.
- 검증 통과: 그래프 빌드(노드 11, ReAct 노드 전부) · diff 화이트리스트 비어있음 · v1·v2↔v3 상호 참조 0건.
- **승인 게이트(2026-06-06)**: ReAct 루프에 `approve` 노드 — write/external/danger 툴은 실행 전 `plan_approval` interrupt 로 승인(read/meta 면제). 승인 시 proxy_exec/client_exec, 거부 시 respond(취소). 운영 DB 쓰기(run_sql·apply_erd_to_db)·ERD 파괴(delete_* 등)가 확인 없이 실행되던 갭을 닫음. 프론트는 기존 `_agentV3AwaitApproval` 재사용 — 백엔드만 변경.
  - **질의 기반 승인 면제(2026-06-27, 오너 요청)**: 기본은 승인 ON. 사용자가 이번 질의에서 "승인 없이 진행해줘"·"묻지 말고 바로 실행"·"그냥 진행"·"without approval" 등을 **자연어로 명시**하면 그 턴 한정으로 승인 게이트를 면제한다. `prep` 노드가 질의 텍스트(`last_user_text`)를 정규식(`_AUTO_APPROVE_RE`)으로 감지해 `state['auto_approve']` 로 전달 → `react` 가 쓰기/위험 판정 후 `auto_approve` 면 `needs_approval=False`. **매 턴 prep 에서 재평가**되므로 다음 턴엔 다시 승인 ON(전역 비활성화 아님). 감지는 '승인/확인/묻' 등에 결합해 과탐 방지("승인 절차가 뭐야?"는 미감지).
- **준수 검증 verify(2026-06-06)**: `react`의 `finish`가 곧장 종료하지 않고 `verify` 노드를 거친다 — `[분석된 의도]`의 goal 이 `[관찰 기록]`으로 충족됐는지 `V3Verdict`(adherence pass/partial/fail, missing, next)로 구조 판정. 충족(pass)/판정불가 → respond, 보완 가능(partial+continue) → 미충족 내용을 관찰에 남기고 `react`로 되돌림(무한 검증은 `MAX_VERIFY=2`로 차단). 모델의 성급한 finish·목표 누락을 잡는다. SSE `verdict` 이벤트로 관측 노출(observe_v3 렌더). **이로써 M3 완료** — verify·관찰 기반 종료조건·승인 모델 모두 구현.
  - **확인 probe(2026-06-27, 오너 요청)**: 판정 **전**에 결과를 직접 확인하는 read 툴 1회 호출 단계 추가(`V3VerifyProbe`·`VERIFY_PROBE_SYSTEM`). LLM 이 `need_check=true` 면 **proxy read 툴 1개**(목록 제시)와 인자를 골라 서버 실행 → 관찰 기록에 반영 후 `V3Verdict` 판정. 운영 DB 쓰기의 실제 반영을 `run_select`(SELECT/COUNT)로 확인하는 용도. **읽기 전용만 허용**(catalog `kind=="read"` — `run_sql`·쓰기/외부/위험 제외)이라 부수효과 0(승인 게이트와 무관히 안전), 환각/쓰기 툴 선택·호출 실패는 무시하고 판정 진행. `verify_node` 가 `async`로 전환(graph 는 이미 `astream` 구동). 확인 결과는 scratchpad 에 누적돼 continue 시 react 도 본다.
- **쓰기 후 자가검증(2026-06-06)**: 운영 DB 쓰기(`run_sql` INSERT/UPDATE/DELETE) 직후 드라이버 보고 영향행수만 믿고 finish 하지 않고, 다음 스텝에서 `SELECT`(예: COUNT(*))로 **실제 반영을 1회 확인**한 뒤 그 결과로 보고하도록 `REACT_SYSTEM`에 규칙 추가. `act.py`의 DML 관찰을 "드라이버 보고값(미확정) — SELECT로 확인 요망"으로 표기. (배경: MySQL multi-statement 미반영 버그 — 공유 어댑터 `db/adapters/mysql.py`·`mssql.py`에서 모든 결과셋 소진 후 1회 커밋으로 수정. rowcount 맹신·"이미 완료" 뒷북도 차단.)
- **INSERT 중복 누적 가드 ③(2026-06-06)**: 어댑터 커밋 수정으로 쓰기가 실제 반영되자, react 가 INSERT 를 반복 선택해 **100행씩 무한 누적**되는 문제가 드러남(임의 데이터라 매 스텝 args가 달라 '동일 행동 반복' 가드①을 빠져나감). `react.py`에 가드 ③ 추가 — 이번 턴에 **INSERT/REPLACE 가 한 번 성공했으면 다음 INSERT는 강제 finish**(검증 SELECT·DELETE/UPDATE는 허용, ERD create_entity 등 클라 툴 무관). `REACT_SYSTEM`에 "쓰기는 한 번만 · 검증은 SELECT로만, 확인하겠다고 INSERT 재실행 금지" 규칙 명시. 단위검증(INSERT 판별·성공/실패/SELECT 구분) 통과.
- **clarify 강화 — interrupt 기반 되묻기(2026-06-06)**: 기존 clarify(의도불명)는 `analyze→respond`로 "되묻고 턴 종료"였다(같은 질의 재개 불가). 이를 **interrupt 기반 HITL**로 바꿔, 답을 받아 질의를 그 자리에서 완성한다. 새 `clarify` 노드(`nodes/clarify.py`)가 `interrupt({type:'clarify', question, options})`로 일시정지하고 `{text}` 로 재개한다. **두 진입 경로**: ① **analyze(선행)** — 의도 불명확(`kind=clarify`) 시 `IntentSpec.ambiguities`를 질문으로 되묻고, 답을 새 user 메시지로 붙여 `analyze` 재분류(`MAX_CLARIFY=3` 상한, 초과 시 가용 정보로 answer). ② **react(루프 중)** — 정보·방향 부족 시 모델이 `ask_user`(location="ask") 툴을 골라 되묻고, 답을 scratchpad(관찰)에 남겨 루프를 이어간다. 건너뛰면(빈 답) `respond`(취소). 토폴로지: `analyze ─clarify→ clarify ⇄ analyze`, `react ─ask_user→ clarify → react`. SSE는 기존 `interrupt` 이벤트 재사용(type=clarify, 라우터 무변경). 프론트(`client_v3.js`·`observe_v3.js`)는 질문 카드(보기 버튼+자유 입력)로 답을 받아 `resume({text})`. v1 `analyze_node` 무수정(격리 — v3 그래프 라우팅으로만 처리). 라우팅·interrupt/resume 단위검증 통과(react/analyze/skip 3경로).

- **약한 모델 가드 — 산출물 질의 narration 방지(2026-06-07)**: 로컬 소형 모델(LM Studio Qwen3.5-9b 등)이 `ReActStep` 메타함수 패턴에서 특정 산출물 질의('ERD 종합 명세서 만들어줘' 등)에 **빈 args(`{}`)·잘못된 args**를 내며 `tool`을 비우는 문제. 그러면 react가 '알 수 없는 툴 → finish'로 처리하고 respond가 `generate_erd_report: …하겠습니다` 식 **narration만 생성**(툴 미실행, 새 창 안 열림)했다. ① `REACT_SYSTEM`에 "산출물 생성('명세서/보고서/데이터 사전/DDL/문서 만들어줘')은 `generate_*`·`export_*`·`save_content` **생성 툴을 직접 호출**해 만든다 — describe_table로 먼저 읽지 말고 곧장 호출, finish로 떠넘기지 말 것" 규칙 추가. ② `react.py`에 **강제 툴 1회 재시도 가드**(`_retry_force_tool`) — act/mixed 의도인데 첫 행동 자리에서 tool이 비었거나(파싱 실패) 성급히 finish하면, 유효 툴 이름을 명시하고 빈 tool·finish를 금지한 교정 메시지로 한 번 더 invoke. 유효 툴이 나오면 채택, 아니면 기존대로 finish(무한루프 없음). 라이브 LM Studio 재현: 1차 빈 출력 → 재시도 시 `generate_erd_report` 정확 선택 확인. v3 전용(`agent/v3/common/prompts.py`·`nodes/react.py`)·격리 유지. **사이드카 재빌드 필요**.

- **구조화 출력 json_schema 전환 — 로컬 LLM(LM Studio) 호환(2026-06-07, 브랜치 `feature/agent-json-schema`)**: 근본 발견 — 에이전트의 `with_structured_output(method="function_calling")`은 langchain이 강제 tool_choice(object)를 보내는데 **LM Studio가 거부(400)** → analyze 예외→answer 폴백 → 모든 질의가 툴 실행 없이 **narration**(그동안 로컬 모델이 "~하겠습니다"만 한 진짜 원인). 해결: v3의 세 구조화 노드를 **json_schema** 로 전환(LM Studio·OpenAI 모두 동작, `json_mode`는 LM Studio 거부). ① **analyze 를 v3로 격리 복제**(`agent/v3/nodes/analyze.py`, §9.1 "수정해야 하면 복제") — v1 analyze 무손상, 그래프가 복제본 사용 ② `react.py`(ReActStep)·`verify.py`(V3Verdict) method 전환. 라이브 검증: IntentSpec·ReActStep·V3Verdict 모두 json_schema OK(LM Studio 기준), v3 analyze 복제본이 'ERD 종합 명세서 만들어줘'→**route=act**(이전 answer 폴백 탈출). ⚠️ 단, `ReActStep.args`의 자유형 dict 는 **strict json_schema 를 강제하는 OpenAI 호환 서버에서 거부**됨이 후속 발견 → 2026-06-08 `args_json: str` 전환으로 수정(아래 항목 참조). PlanV2(자유형 args list)는 타임아웃 이슈 있으나 v3 미사용이라 무관. v3 전용·격리 유지(편집 agent/v3 내부만, v1·v2 무손상). **사이드카 재빌드 필요**. (출구: 검증 후 브랜치 머지 + v1·v2 적용은 별도 결정.)

- **버그수정 — `ReActStep.args` 자유형 dict → `args_json: str`(strict json_schema 호환, 2026-06-08)**: 증상 — v3 질의 시 `400 Invalid schema for response_format 'ReActStep': In context=('properties','args'), 'additionalProperties' is required to be supplied and to be false`. 근본원인: langchain-openai 1.2.2 가 Pydantic 클래스를 `with_structured_output(method="json_schema")` 로 넘기면 payload 빌드 단계에서 **strict=True 를 강제**(base.py: Pydantic 그대로 반환 후 `text_format`/`strict=True`)하는데, strict 모드는 모든 object 에 `additionalProperties:false` 를 요구한다 → 임의 키를 받는 **자유형 `args: dict`(`{"type":"object"}`)는 표현 불가**라 거부. (`strict=False` 를 넘겨도 무효 — payload 빌드에서 재강제. `IntentSpec`·`V3Verdict`는 자유형 dict 가 없어 통과 → react 노드에서만 에러.) **수정**: `ReActStep.args: dict` → `args_json: str`(JSON 객체 문자열, 기본 `"{}"`). OpenAI 함수호출이 args 를 JSON 문자열로 직렬화하는 방식과 동일 — strict 서버·LM Studio 모두 호환. `react.py`에 `_parse_args(step)` 헬퍼(JSON 문자열→dict, 빈값·파싱실패·관대한 서버의 dict 응답 모두 `{}`·passthrough 방어) 추가, 소비처 2곳(메인 invoke·`_retry_force_tool` 재시도) 교체 → **`react_args`(dict) 계약 유지로 다운스트림(act·approve·meta·clarify) 전부 무변경**. `REACT_SYSTEM`·corrective 텍스트의 args 언급을 args_json(JSON 문자열, 예시 포함)으로 갱신. 검증: 스키마에 자유형 object 0개·langchain strict=True 변환이 ReActStep·V3Verdict 둘 다 통과·`_parse_args` 6케이스·그래프 빌드·격리(diff 화이트리스트 빔·상호참조 0) 모두 통과. v3 전용(편집 `agent/v3/{common/schemas.py,common/prompts.py,nodes/react.py}`)·격리 유지. **사이드카 재빌드 필요**.

- **표준용어 점검·수정 워크플로우 정립 + 등록 반복 가드 ④(2026-06-08)**: 증상 — "'HR2' 다이어그램 만들고 리버스 엔지니어링하고 추가 엔티티 표준용어 점검·어긋난 부분 직접 수정" 질의에서 react 가 **엔티티 추가를 반복**하고 **표준용어 사전 등록(`register_std_term`)을 무한 시도**. 원인: ① "어긋난 부분 직접 수정"을 한 번에 해주는 **결정적 툴이 없어** 모델이 점검 결과의 미등록 컬럼을 `register_std_term`으로 무차별 등록(매번 용어명이 달라 '동일 args' 가드①을 빠져나감 — INSERT 누적과 동형) ② 루프가 수렴하지 않아 verify→continue 로 리버스 엔지니어링·엔티티 생성까지 재시도. **수정(3중)**: (A) **공유 클라 툴 `standardize_attribute_names`**(write·async, `agent_tools.js`) 추가 — 대상(또는 전체) 엔티티 컬럼 논리명을 표준사전에서 찾아 물리명≠abbr 이면 물리명을 abbr 로 **1회 호출에 일괄 수정**(미등록 컬럼은 손대지 않고 보고만, 자동 등록 안 함). `generate_term_compliance`(점검)→`standardize_attribute_names`(수정) 2스텝으로 "직접 수정"이 결정적으로 끝나 루프가 수렴. (B) `REACT_SYSTEM`에 표준용어 워크플로우 규칙 + "register_std_term 은 사전(DB) 변경이지 ERD 컬럼 수정이 아님 — 미등록 자동 대량 등록 금지" + **재생성 금지**(리버스/엔티티 생성이 관찰에 있으면 재호출 금지) 규칙 추가. (C) `react.py` **가드 ④** — `register_std_term` 이 이번 턴에 2회 이상이면 강제 finish(명시 요청 소수 등록은 통과). 또한 react 가 보는 카탈로그는 `desc`만 노출(`detail` 미노출)이라, `register_std_term`·`generate_term_compliance`·신규 툴의 **`desc` 자체를 자기설명적으로** 명확화. 검증: `node --check`·`py_compile`·격리(diff 화이트리스트 = `agent_tools.js` 공유 추가만, v1/v2 전용 0·상호참조 0) 통과. (A)는 §9.1 의도적 공유 추가(v1·v2·v3 자동, v3 경로 무수정), (B)(C)는 v3 전용. **사이드카 재빌드 필요**(+클라 새로고침).

## 5. 격리 불변식 (요약 — 강제 규칙은 CLAUDE.md "하네스: Agent v3 격리")

1. **단방향 의존** — v1·v2 모듈은 `agent.v3`·`routers.v3`·`js/agent_v3`를 절대 참조하지 않는다.
   v3는 v1(`agent.*`)을 읽기 전용으로만 참조하고, **v2(`agent.v2`)는 참조하지 않는다**.
2. **실패 격리** — v3 라우터는 `main.py`에서 try/except 가드로 등록. v3가 깨져도 앱·v1·v2 정상 기동.
3. **런타임 자원 분리** — `/agent/v3/*`·독립 그래프·Checkpointer·`thread_id`(`v3_*`)·
   프론트 전역(`_AGENT_V3_*`)·DOM(`#agentV3Panel`)을 v1·v2와 분리.
4. **수정해야 하면 복제** — 공유 frozen 모듈(`tools_proxy`·`llm`·키스토어·`agent_tools.js`)을
   고쳐야 하면 `agent/v3/`로 복제해 사본 수정. 프록시 툴은 동작 불변 시 읽기전용 공유 유지.
