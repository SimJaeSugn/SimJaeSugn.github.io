# Agent v3 — Plan-and-Execute + ReAct 하이브리드 (도구형)

> 상태: **V3-M1 착수(격리 골격)** · 작성일 2026-06-05
> 격리 근거: `docs/AI_ERD_v2_의도분석_계획준수_구현계획서.html` §9.1 격리 계약의 **진화형**
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

- 프록시 툴(`agent/tools_proxy.py`)·클라 툴(`js/agent_tools.js`)은 **버전 무관 공유**로 그대로 재사용한다.
- v3가 새로 만드는 것은 ① `plan`/`reflect` **메타툴** ② **ReAct 루프 컨트롤러**뿐이다.
- 메타툴은 카탈로그에선 다른 툴과 **동급 노출**(모델이 자유 선택), 핸들러에선 **전용 경로**(승인·interrupt 면제, LLM 호출).

## 3. 출구 전략 — 승급이 아니라 "진입점 교체(컷오버)"

v3는 토폴로지가 v1과 다르므로 v2→v1식 기계적 승급(`promote_v2_to_v1.py`)이 적용되지 않는다.
대신 격리 덕분에 **진입점 컷오버**로 교체한다(되돌리기도 진입점만 복귀).

- 프론트 진입점만 v3로 전환: `index.html`의 진입 버튼 + UI가 부르는 전역/URL.
- 백엔드는 `/agent/*`(v1)·`/agent/v3/*`(v3) 병렬 유지 → 무위험 롤백.
- 전제: **기능 패리티 + eval 검증** 충족 후에만 플립.

## 4. 로드맵

| 마일스톤 | 내용 | 상태 |
|----------|------|------|
| **V3-M1** | 격리 골격(작동 미러) + 격리 계약 확립 + 하네스 | **✅ 완료** (2026-06-05) |
| **V3-M2** | ReAct 루프 토폴로지(react⇄act⇄observe) + `plan`/`reflect` 메타툴 + 발산 가드(loop_count 상한) | **✅ 완료** (2026-06-05) |
| V3-M3 | 준수 검증(verify) + ReAct 관찰 기반 종료조건 + **행동별 승인 모델** | 예정(다음) |
| V3-M4 | eval 오라클(ReAct는 실행레벨 → 샌드박스 필요) | 예정 |
| V3-M5 | A/B/C 비교 + 진입점 컷오버 준비 | 예정 |
| V3-M6 | 진입점 교체(v3→기본) — 별도 오너 결정 | 선택 |

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
- **발산/반복 가드**: `loop_count` 상한 `MAX_LOOP=16` + ① 직전과 동일한 `(tool,args)` 반복 → finish · ② 메타툴(plan/reflect) 연속 호출 → finish · ③ 카탈로그 밖 툴 환각 → finish. (라이브 테스트에서 `reflect` 무한반복 버그 발견 → 가드 ①②와 프롬프트 보강으로 수정 2026-06-05.)
- **텍스트 결과물 처리**: 분석·진단·개선점 제안 등 '말로 하는 답변'은 툴이 아니라 `finish→respond` 가 [관찰 기록]을 근거로 생성한다는 점을 REACT_SYSTEM 에 명시(데이터 수집 후 분석하려고 메타툴을 더 부르지 않게).
- **관찰 요약(툴-인지형, `act.py` `_obs_text`)**: 라이브 테스트에서 대형 DB의 `fetch_db_schema` 결과를 raw JSON 으로 잘라(800자) 대상 테이블이 관찰에서 사라져 무한 재조회하는 버그 발견(2026-06-05). → `fetch_db_schema` 는 테이블 목록+컬럼을 컴팩트 요약(테이블 과다 시 목록+컬럼수 폴백+run_sql 유도), `run_sql` 은 행수+상위행 요약(상한 4000자). REACT_SYSTEM 에 "fetch_db_schema 는 전체를 한 번에 주니 재조회 말고, 특정 테이블 상세는 run_sql" 지침 추가. 재현 테스트: 1회 조회 후 finish + 전체 스키마 맥락 기반 분석(USER_ID→tb_user FK 제안 등) 생성 확인.
- **턴 리셋**: `prep` 노드가 `loop_count`/`scratchpad`/`past_steps`를 턴 시작에 리셋(멀티턴 누수 방지). v1 노드 미수정.
- **상태 필드 추가**(`common/state.py`): `react_thought`·`react_tool`·`react_args`(펜딩 결정), `scratchpad`·`loop_count` 본격 사용.
- **SSE 추가**: `thought`(react 추론·다음 행동)·`observation`(행동 결과). 프론트 `observe_v3.js`가 버블 안 ReAct 추적(trace)으로 렌더(🎯 의도·🧠 생각·👁 관찰).
- **재사용(v1 읽기 전용)**: `analyze`·`answer`·`fetch_tools`·`respond` 노드, `tools_proxy`·LLM·프롬프트 헬퍼.
- 검증 통과: 그래프 빌드(노드 11, ReAct 노드 전부) · diff 화이트리스트 비어있음 · v1·v2↔v3 상호 참조 0건.
- **알려진 갭(M3 이관)**: 행동별 승인 모델 없음 — 현재 write 는 프론트 드래프트에 누적 후 종료 시 커밋(드래프트 안전망). verify 노드·관찰 기반 종료조건도 M3.

## 5. 격리 불변식 (요약 — 강제 규칙은 CLAUDE.md "하네스: Agent v3 격리")

1. **단방향 의존** — v1·v2 모듈은 `agent.v3`·`routers.v3`·`js/agent_v3`를 절대 참조하지 않는다.
   v3는 v1(`agent.*`)을 읽기 전용으로만 참조하고, **v2(`agent.v2`)는 참조하지 않는다**.
2. **실패 격리** — v3 라우터는 `main.py`에서 try/except 가드로 등록. v3가 깨져도 앱·v1·v2 정상 기동.
3. **런타임 자원 분리** — `/agent/v3/*`·독립 그래프·Checkpointer·`thread_id`(`v3_*`)·
   프론트 전역(`_AGENT_V3_*`)·DOM(`#agentV3Panel`)을 v1·v2와 분리.
4. **수정해야 하면 복제** — 공유 frozen 모듈(`tools_proxy`·`llm`·키스토어·`agent_tools.js`)을
   고쳐야 하면 `agent/v3/`로 복제해 사본 수정. 프록시 툴은 동작 불변 시 읽기전용 공유 유지.
