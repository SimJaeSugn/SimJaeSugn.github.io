# CLAUDE.md — UXERManager

## 하네스: UXERManager 기능 개발

**목표:** 기능 추가·버그 수정 시 단축키 동기화와 백업 통합을 자동 검증하여 누락을 방지한다.

**트리거:** UXERManager 코드 변경 요청 시 `feature-dev` 스킬을 사용하라. 단순 코드 설명·질문은 직접 응답 가능.

## 하네스: README 동기화

**목표:** 코드·구조 변경 시 세 README 파일이 항상 실제 상태와 일치하도록 유지한다.

**대상 README:**

| 파일 | 범위 |
|------|------|
| `README.md` | 섹션 25~28 (아키텍처·파일구조·개발환경·배포) |
| `proxy/nodejs/README.md` | 실행 방법·빌드·API·파일구조·트레이·지원 DB |
| `proxy/python/README.md` | 실행 방법·빌드·API·파일구조·지원 DB |

**트리거 → 검토 대상 매핑:**

| 변경 항목 | 검토할 README |
|----------|--------------|
| 디렉토리·파일 추가·이동·삭제 | README.md 섹션 26, 변경된 컴포넌트의 개별 README 파일구조 섹션 |
| 포트 번호 변경 | README.md 섹션 25·27·28, proxy/nodejs/README.md, proxy/python/README.md |
| 빌드 명령어·스크립트·설치파일명 변경 | README.md 섹션 27·28, 해당 컴포넌트 개별 README |
| 새 의존성·도구 추가 | README.md 섹션 27 사전 요구사항 표, 해당 개별 README |
| API 엔드포인트 추가·변경·삭제 | 해당 컴포넌트 개별 README API 섹션 |
| 지원 DB 추가·제거 | README.md 섹션 25, 해당 컴포넌트 개별 README 지원 DB 표 |
| 아키텍처 구조 변경 | README.md 섹션 25 |
| `proxy/nodejs/` 코드 변경 | proxy/nodejs/README.md |
| `proxy/python/` 코드 변경 | proxy/python/README.md |

**검토 절차:**

1. 변경 항목이 위 표의 어느 행에 해당하는지 판단한다.
2. 해당 README 파일을 Read로 읽어 실제 코드·구조와 대조한다.
3. 불일치가 있으면 즉시 수정한다.
4. 불일치가 없으면 완료 보고에 "README 검토 완료 — 변경 불필요"를 명시한다.

**규칙:** 트리거 항목에 해당하는 변경이 있음에도 README 검토 없이 작업 완료를 보고하지 않는다.

## 하네스: Agent v1/v2 격리

**목표:** Agent v2의 기능 추가·수정·삭제가 v1(현행 운영)에 어떠한 영향도 주지 않도록 격리를 강제한다. (설계 근거: `docs/AI_ERD_v2_의도분석_계획준수_구현계획서.html` §9.1 격리 계약)

**트리거:** 다음 경로 중 하나라도 건드리는 작업 시 본 하네스를 적용한다.
- 백엔드: `proxy/python/agent/v2/`, `proxy/python/routers/v2/`
- 프론트: `js/agent_v2/`
- 등록부: `proxy/python/main.py`(v2 가드 등록), `index.html`(v2 스크립트 로드)

**불변식 (반드시 유지):**

1. **단방향 의존** — 부모의 v1 모듈(`agent/__init__.py`·`agent/graph.py`·`agent/nodes/*`·`agent/common/*`·`agent/tools_proxy.py` 등)과 `routers/agent.py`·`js/agent_panel.js`·`js/agent_settings.js`·`js/agent_tools.js`는 `agent.v2`·`routers.v2`·`js/agent_v2`를 **절대 import·참조하지 않는다**. (v2 → v1 읽기 전용만 허용)
2. **실패 격리** — v2 라우터는 `main.py`에서 `try/except` 가드로 등록한다. v2가 import 실패·반쪽 삭제여도 앱·v1이 정상 기동해야 한다.
3. **런타임 자원 분리** — 경로(`/agent/v2/*`)·그래프 인스턴스·Checkpointer·`thread_id` 네임스페이스·프론트 전역(`_AGENT_V2_*`)·DOM 컨테이너(`#agentV2Panel`)를 v1과 분리한다. v1 전역(`_AGENT_URL`·`_agentThreadId` 등)을 재사용·재정의하지 않는다.
4. **수정해야 하면 복제** — 공유 frozen 모듈(키스토어·crypto·DB 어댑터·`agent/common/llm`·`agent/tools_proxy`·`agent_tools.js`)을 고쳐야 할 것 같으면, 고치지 말고 `agent/v2/`로 해당 부분만 복제해 v2 사본을 수정한다. 시그니처·반환·부수효과를 바꾸는 변경은 전면 금지.

**검증 절차 (작업 완료 전 필수):**

1. 기존 파일 변경이 다음 2곳의 **추가만**인지 확인한다 — `proxy/python/main.py`(가드 등록 블록), `index.html`(v2 스크립트 로드·마크업).
2. diff 화이트리스트 검사 결과가 **비어 있어야** 한다:
   ```
   git diff main -- proxy/python/routers/agent.py ':!proxy/python/agent/v2' \
     proxy/python/agent/ js/agent_panel.js js/agent_settings.js js/agent_tools.js
   ```
3. v1 모듈에서 `agent.v2`·`routers.v2` 참조 grep 결과가 **0건**인지 확인한다.

**규칙:** 위 트리거에 해당하는 작업에서 검증 절차(diff 화이트리스트·단방향 grep)를 거치지 않고 완료를 보고하지 않는다. v1 파일이 화이트리스트(추가 2곳) 밖에서 한 줄이라도 변경되면 격리 위반으로 되돌린다. (격리 해제는 §9.1 "승격" 시점에만, 별도 결정으로.)

## 하네스: v2 계획서·로드맵 동기화

**목표:** v2 구현이 진행될 때마다 계획서가 실제 구현 상태와 일치하도록 유지하고, 로드맵의 마일스톤 적용 상태를 갱신한다.

**대상 문서:** `docs/AI_ERD_v2_의도분석_계획준수_구현계획서.html`

**트리거:** V2 마일스톤(V2-M1~M6) 관련 작업(`agent/v2/`·`routers/v2/`·`js/agent_v2/`·v2 등록부 코드 추가·수정·삭제)을 완료할 때.

**트리거 → 계획서 검토 섹션 매핑:**

| 변경 항목 | 검토할 계획서 섹션 |
|----------|------------------|
| 마일스톤 착수/완료 | §10 로드맵 표 — 해당 V2-M행 상태 갱신(예정→진행중→완료) + §11 검증 시나리오 충족 표시 |
| 디렉토리·파일 구조 변경 | §9 디렉토리·배포 트리 |
| 그래프 토폴로지 변경(노드·엣지 추가/교체) | §3 아키텍처(토폴로지·그림) |
| 스키마 추가·변경(IntentSpec·Goal·StepV2·Verdict 등) | §4(의도)·§5(계획)·§6(검증) 해당 스키마 정의 |
| SSE 이벤트 추가·변경 | §8 SSE 프로토콜 |
| 격리 방식 변경 | §9.1 격리 계약 |

**검토 절차:**

1. 완료한 작업이 위 표의 어느 행에 해당하는지 판단한다.
2. 계획서 해당 섹션을 Read로 읽어 실제 구현과 대조한다.
3. 불일치가 있으면 즉시 수정한다. **특히 §10 로드맵의 마일스톤 상태는 항상 갱신한다.**
4. 불일치가 없으면 완료 보고에 "계획서 동기화 완료 — 변경 불필요"를 명시한다.

**규칙:** V2 마일스톤 작업 완료 시 §10 로드맵 상태 갱신 없이 완료를 보고하지 않는다.

## 하네스: v2→v1 승격 스크립트 동기화

**목표:** v2(실험 레인)의 **승격 레이어**가 바뀔 때, 승격 도구 `tools/promote_v2_to_v1.py`(파일 매핑·PROMOTED 마커·import/심볼 규칙)와 v1↔v2 구조 정합이 깨지지 않도록 강제한다. (설계 근거: `docs/plan/v2_to_v1_promotion.md`)

> 배경: v2에서 검증된 개선을 v1(운영)으로 **반복 승격**한다. 승격이 거의 기계적 복사가 되려면 양 레인의 승격 레이어 구조·심볼이 정렬돼 있어야 한다.

**트리거:** 다음 **승격 레이어** 파일을 추가·수정·삭제할 때.
- `proxy/python/agent/v2/nodes/analyze.py`·`plan.py` (REPLACE 대상)
- `proxy/python/agent/v2/graph.py` (REPLACE 대상)
- `proxy/python/agent/v2/common/schemas.py`·`prompts.py`·`state.py` (MERGE 대상 — `# === PROMOTED:BEGIN…END ===` 블록)
- 또는 **새 승격 대상 파일·심볼**(노드/스키마/프롬프트 상수)을 추가할 때

**검토 항목:**
1. **매핑** — 새 승격 대상 파일이면 `promote_v2_to_v1.py` 의 `REPLACE`/`MERGE` 목록에 추가했는가.
2. **마커** — MERGE 파일의 새 promoted 심볼(클래스/상수/필드)이 `PROMOTED:BEGIN…END` **블록 안**에 있는가. 블록 밖이면 승격되지 않는다.
3. **심볼 정규화** — 승격 레이어 심볼명이 v1↔v2 **동일**한가(`AgentState`·`plan_node`·`analyze_node`·`build_graph`·`IntentSpec`·`StepV2`·`ANALYZE_SYSTEM`·`PLAN_V2_SYSTEM` 등). 한쪽만 개명하면 순수 복사가 깨진다.
4. **import** — 새 import가 `agent.v2.*` 형태라 치환(`agent.v2.`→`agent.`)으로 v1에서 해소되는가. v1 베이스에 없는 외부 심볼을 새로 쓰면 v1 import 추가가 필요한지 확인.
5. **마커 균형** — 각 MERGE 파일의 BEGIN/END 개수가 1쌍으로 일치하는가.

**검증 절차 (승격 레이어 변경 작업 완료 전 필수):**
1. `python tools/promote_v2_to_v1.py` (dry-run) 실행 → 6파일 모두 **구문 OK**·PROMOTED 블록 **발견**됨을 확인.
2. 새 승격 대상이 매핑/마커에 반영됐는지 대조한다.
3. 미반영이면 `promote_v2_to_v1.py`(매핑) 또는 마커를 즉시 갱신한다.

**규칙:** v2 승격 레이어를 변경한 작업에서, `promote_v2_to_v1.py` dry-run이 실패하거나 새 승격 대상이 매핑·마커에서 누락된 채로 완료를 보고하지 않는다. (이 하네스는 §9.1 격리의 진화형 — "v2 실험이 v1을 깨지 않게 + 승격은 sanctioned 복사"를 보조한다.)

## 하네스: Agent v3 격리 (ReAct 하이브리드 실험 레인)

**목표:** Agent v3(Plan-and-Execute + ReAct 하이브리드, 도구형)의 기능 추가·수정·삭제가 **v1(현행 운영)과 v2(기존 실험 레인) 어디에도 영향을 주지 않도록** 격리를 강제한다. (설계 근거: `docs/plan/v3_react_hybrid.md`, §9.1 격리 계약의 진화형)

> 배경: v3는 v1 베이스 위에 세운 **독립 실험 레인**이다. 토폴로지가 v1과 달라 v2→v1식 기계적 승급이 아니라 **진입점 컷오버**로 교체한다(`docs/plan/v3_react_hybrid.md` §3). 격리가 그 무위험 컷오버·롤백의 전제다.

**트리거:** 다음 경로 중 하나라도 건드리는 작업 시 본 하네스를 적용한다.
- 백엔드: `proxy/python/agent/v3/`, `proxy/python/routers/v3/`
- 프론트: `js/agent_v3/`
- 등록부: `proxy/python/main.py`(v3 가드 등록), `index.html`(v3 스크립트 로드·마크업)

**불변식 (반드시 유지):**

1. **단방향 의존** — v1 모듈(`agent/__init__.py`·`agent/graph.py`·`agent/nodes/*`·`agent/common/*`·`agent/tools_proxy.py` 등)·`routers/agent.py`·`js/agent_panel.js`·`js/agent_settings.js`·`js/agent_tools.js`, 그리고 **v2 모듈(`agent/v2/*`·`routers/v2/*`·`js/agent_v2/*`)**은 `agent.v3`·`routers.v3`·`js/agent_v3`를 **절대 import·참조하지 않는다**. v3는 v1(`agent.*`)을 **읽기 전용**으로만 참조하고, **v2(`agent.v2`·`routers.v2`)는 참조하지 않는다**(두 실험 레인 상호 격리).
2. **실패 격리** — v3 라우터는 `main.py`에서 `try/except` 가드로 등록한다. v3가 import 실패·반쪽 삭제여도 앱·v1·v2가 정상 기동해야 한다.
3. **런타임 자원 분리** — 경로(`/agent/v3/*`)·그래프 인스턴스·Checkpointer·`thread_id` 네임스페이스(`v3_*`)·프론트 전역(`_AGENT_V3_*`)·DOM 컨테이너(`#agentV3Panel`)를 v1·v2와 분리한다. v1 전역(`_AGENT_URL`·`_agentThreadId`)·v2 전역(`_AGENT_V2_*`)을 재사용·재정의하지 않는다.
4. **수정해야 하면 복제** — 공유 frozen 모듈(키스토어·crypto·DB 어댑터·`agent/common/llm`·`agent/tools_proxy`·`agent_tools.js`)을 고쳐야 할 것 같으면, 고치지 말고 `agent/v3/`로 해당 부분만 복제해 v3 사본을 수정한다. 프록시 툴(`tools_proxy.py`)은 **동작(시그니처·반환·부수효과)을 바꾸지 않는 한 읽기 전용 공유**로 그대로 재사용한다.

**검증 절차 (작업 완료 전 필수):**

1. 기존 파일 변경이 다음 2곳의 **추가만**인지 확인한다 — `proxy/python/main.py`(v3 가드 등록 블록), `index.html`(v3 스크립트 로드·마크업).
2. diff 화이트리스트 검사 결과가 **비어 있어야** 한다 (v1+v2 코어가 v3 작업으로 바뀌지 않았는지):
   ```
   git diff main -- proxy/python/routers/agent.py proxy/python/routers/v2/ \
     ':!proxy/python/agent/v3' proxy/python/agent/ proxy/python/agent/v2/ \
     js/agent_panel.js js/agent_settings.js js/agent_tools.js js/agent_v2/
   ```
3. v1·v2 모듈에서 `agent.v3`·`routers.v3`·`agent_v3` 참조 grep 결과가 **0건**인지 확인한다. 역으로 v3 모듈에서 `agent.v2`·`routers.v2`·`agent_v2` 참조도 **0건**이어야 한다.

**규칙:** 위 트리거에 해당하는 작업에서 검증 절차(diff 화이트리스트·상호 격리 grep)를 거치지 않고 완료를 보고하지 않는다. v1·v2 파일이 화이트리스트(추가 2곳) 밖에서 한 줄이라도 변경되면 격리 위반으로 되돌린다. (격리 해제·교체는 §3 "진입점 컷오버" 시점에만, 별도 오너 결정으로.)

**유지보수(주기적 갱신):** v3 마일스톤(V3-M1~M6)이 진행될 때마다 본 하네스를 실제 구조와 동기화한다 — 새 v3 디렉토리·전역·DOM·`thread_id` 접두가 생기면 불변식 3의 목록에 추가하고, `docs/plan/v3_react_hybrid.md` §4 로드맵 상태를 갱신한다. (구체 문서 반영 규칙은 아래 "하네스: v3 문서 동기화" 참조.)

## 하네스: v3 문서 동기화

**목표:** v3 관련 코드·구조·전략이 바뀌면 **반드시 관련 문서에 즉시 반영**하여, 문서가 항상 실제 v3 상태와 일치하도록 한다. (오너 지시 2026-06-05 — "v3 관련 내용 변경 시 반드시 관련 문서에 반영")

**대상 문서:**

| 문서 | v3 관련 범위 |
|------|-------------|
| `docs/plan/v3_react_hybrid.md` | §1 전략·토폴로지 · §2 툴 3분류 · §3 출구(컷오버) · §4 로드맵 상태·완료내역 · §5 격리 불변식 |
| `CLAUDE.md` | "하네스: Agent v3 격리" 불변식3 자원 목록 · 변경 이력 표 |
| `README.md` | 섹션 26 파일구조 (`js/agent_v3` · `agent/v3` · `routers/v3`) |
| `proxy/python/README.md` | API 표(`/agent/v3/*`) · 파일구조 (`routers/v3` · `agent/v3`) |

**트리거 → 반영할 문서 매핑:**

| 변경 항목 | 반영할 문서 |
|----------|------------|
| 마일스톤 착수/완료 | `docs/plan/v3_react_hybrid.md` §4 로드맵 상태(예정→진행중→완료) + 완료 내역 |
| 그래프 토폴로지 변경(노드·엣지·ReAct 루프) | `docs/plan/v3_react_hybrid.md` §1·§4, `proxy/python/README.md` `agent/v3` 구조 |
| 툴 분류·메타툴(`plan`/`reflect`) 추가·변경 | `docs/plan/v3_react_hybrid.md` §2 툴 3분류 |
| 스키마·상태 필드(`scratchpad`·`loop_count` 등) 추가·변경 | `docs/plan/v3_react_hybrid.md` §1, `proxy/python/README.md` `agent/v3/common` |
| SSE 이벤트(intent·plan·verdict·observe 등) 추가·변경 | `proxy/python/README.md` API 표(해당 엔드포인트 설명) |
| API 엔드포인트(`/agent/v3/*`) 추가·변경·삭제 | `proxy/python/README.md` API 표 |
| 디렉토리·파일 추가·이동·삭제 | `README.md` 섹션 26, `proxy/python/README.md` 파일구조 |
| 격리 자원(전역·DOM·`thread_id` 접두·경로) 추가·변경 | `CLAUDE.md` "하네스: Agent v3 격리" 불변식3, `docs/plan/v3_react_hybrid.md` §5 |
| 격리 방식·출구 전략 변경 | `docs/plan/v3_react_hybrid.md` §3·§5, `CLAUDE.md` 하네스 |
| **v3 작업 완료(모든 트리거 공통)** | `CLAUDE.md` 변경 이력 표에 행 추가 |

**검토 절차:**

1. 완료한 v3 작업이 위 매핑의 어느 행에 해당하는지 판단한다(복수 가능).
2. 해당 문서를 Read로 읽어 실제 코드·구조와 대조한다.
3. 불일치가 있으면 즉시 수정한다. **특히 §4 로드맵 상태와 변경 이력 행은 항상 갱신한다.**
4. 불일치가 없으면 완료 보고에 "v3 문서 동기화 완료 — 변경 불필요"를 명시한다.

**규칙:** v3 관련 변경(`agent/v3/`·`routers/v3/`·`js/agent_v3/`·v3 등록부) 작업을 위 매핑에 따른 문서 반영 없이 완료로 보고하지 않는다. (이 하네스는 "README 동기화"·"v2 계획서·로드맵 동기화" 하네스의 v3 대응판이다.)

---

## 변경 이력
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-26 | 초기 구성 | 전체 | - |
| 2026-05-27 | 미들웨어 README 동기화 규칙 추가 | CLAUDE.md | 미들웨어 변경 시 문서 누락 방지 |
| 2026-05-30 | middleware/ → proxy/nodejs/, python-sidecar/ → proxy/python/ 재편 | CLAUDE.md, electron/, README.md 등 | 디렉토리 구조 정비 |
| 2026-05-30 | README 동기화 검토 하네스 추가 | CLAUDE.md | 코드 변경 시 README 누락 방지 |
| 2026-05-30 | 미들웨어·README 동기화 하네스 2개를 단일 하네스로 통합 | CLAUDE.md | 관리 단순화 |
| 2026-05-30 | README.md 메뉴별 기능 업데이트 (섹션 25~28로 재번호, 새 기능 4개 추가) | README.md, CLAUDE.md | 구 툴박스→신 메뉴바 구조 반영 |
| 2026-05-31 | Agent v1/v2 격리 하네스 추가 | CLAUDE.md | v2 작업이 v1(현행 운영)에 영향 주지 않도록 강제 (계획서 §9.1 근거) |
| 2026-05-31 | v2 계획서·로드맵 동기화 하네스 추가 | CLAUDE.md | v2 구현 진행 시 계획서 동기화·로드맵 상태 갱신 누락 방지 |
| 2026-06-03 | `set_cardinality`·`normalize_check` 툴을 공유 `agent_tools.js`로 승격(v1+v2 공용) | js/agent_tools.js, CLAUDE.md | 2차 최적화에서 추가한 가상 툴의 실구현. §9.1 격리의 **의도적 부분 해제**(오너 결정) — 두 툴은 v1·v2가 공유한다. (reverse_engineer는 fetch_db_schema+create_entity 조합으로 대체, 단일 툴 미구현) |
| 2026-06-03 | v2→v1 승격 파이프라인(정규화·마커·스크립트) + 동기화 하네스 추가 | tools/promote_v2_to_v1.py, agent/(v1·v2), CLAUDE.md, docs/plan | v2 검증분을 v1으로 반복 승격하기 위한 구조 정렬·기계적 복사 도구화. 첫 승격으로 v1이 analyze(4분기)+plan_v2+최적화 프롬프트 채택 |
| 2026-06-03 | 에이전트 속성명 표준용어사전 연동(공유) | js/agent_tools.js, js/agent_panel.js(v1), js/agent_v2/client_v2.js(v2) | 툴 실행 직전 속성 논리명을 표준용어 abbr로 물리명 자동 표준화. 공유 기능이라 v1·v2 프론트 양쪽 execTools 수정(§9.1 격리의 의도적 공유 적용, Electron 사이드카 stddict 사용·웹은 graceful skip) |
| 2026-06-03 | 표준용어 조회·등록 에이전트 툴 추가(공유) | js/agent_tools.js, agent/common/prompts.py, js/agent_panel.js·client_v2.js | lookup_std_term(read)·register_std_term(write) 추가. async 툴이라 execTools가 def.run 을 await. REPLAN done-목록에 lookup_std_term 추가. Electron 사이드카 전용 |
| 2026-06-05 | Agent v3(ReAct 하이브리드, 도구형) 격리 레인 골격(V3-M1) + 격리 하네스 추가 | agent/v3/, routers/v3/, js/agent_v3/, main.py(가드 추가), index.html(로드·마크업 추가), CLAUDE.md, docs/plan/v3_react_hybrid.md | v3는 v1 베이스 위 독립 실험 레인. M1은 v2-M1처럼 작동 미러로 시작(v1 노드 읽기 재사용)·격리 계약 증명. 출구는 승급 아닌 진입점 컷오버. v1·v2 상호 격리 강제 하네스 신설(주기적 갱신 규칙 포함) |
| 2026-06-05 | "하네스: v3 문서 동기화" 추가 | CLAUDE.md | 오너 지시 — v3 관련 변경 시 관련 문서(계획서·README·CLAUDE.md 이력) 반영 누락 방지. 변경 항목→반영 문서 매핑 명시 |
| 2026-06-05 | V3-M2 — ReAct 루프 구현(도구형 하이브리드) | agent/v3/(graph·common/schemas·prompts·state·nodes prep/react/meta/act), routers/v3/agent.py(thought·observation SSE), js/agent_v3/(client·observe ReAct 추적), docs/plan/v3_react_hybrid.md, README 2종 | prep→analyze→fetch_tools→react⇄{meta_exec\|proxy_exec\|client_exec}→respond. plan/reflect 메타툴(location=meta·승인면제), loop_count 상한16 발산가드. v1 노드(analyze·answer·fetch_tools·respond) 읽기 재사용. 격리·빌드 검증 통과. 승인모델·verify는 M3 |
| 2026-06-05 | V3-M2 버그수정 — reflect 무한반복 가드 | agent/v3/nodes/react.py, agent/v3/common/prompts.py, docs/plan/v3_react_hybrid.md | 라이브 테스트서 '분석/설명' 류 질의가 reflect를 14회 반복(텍스트 결과물을 툴 행동으로 착각). 가드 ①동일(tool,args)반복→finish ②메타툴 연속→finish + REACT_SYSTEM에 "텍스트 답변은 finish→respond가 생성" 명시. 가드 단위검증·시나리오 재현 통과 |
| 2026-06-05 | V3-M2 버그수정 — 관찰 요약(툴-인지형) | agent/v3/nodes/act.py, agent/v3/common/prompts.py, docs/plan/v3_react_hybrid.md | 대형 DB fetch_db_schema 결과를 raw JSON 800자로 잘라 대상 테이블이 관찰에서 사라져 무한 재조회하던 버그. _obs_text를 툴-인지형 요약으로 교체(schema=테이블목록+컬럼 컴팩트, 과다 시 폴백; sql=행수+상위행; 상한4000). 프롬프트에 재조회 금지·run_sql 유도. 재현테스트: 1회 조회 후 finish+전체스키마 맥락 분석 생성 |
| 2026-06-06 | 에이전트 툴 대량 추가 (클라 30 + 프록시 9, 공유) | js/agent_tools.js, proxy/python/agent/tools_proxy.py, docs/클라이언트_툴_추가계획.html, docs/plan/클라이언트_툴_현황.html | 클라: 선택·일괄·분석·내보내기·다이어그램·섹션·메모·버전(총 49툴). 프록시: DB introspection(describe_db_table·list_db_tables·count/sample/constraints/find_column/run_select/explain/compare 9개, 총 15툴). §9.1 격리의 **의도적 공유 추가** — agent_tools.js·tools_proxy.py 공유라 v1·v2·v3 자동 적용. 계획서·현황 문서 작성·동기화. 인앱 E2E 검증은 사용자 몫 |
| 2026-06-06 | DB 어댑터 DML 커밋 버그수정 (공유) | proxy/python/db/adapters/mysql.py·mssql.py·oracle.py, proxy/python/agent/v3/nodes/act.py | mysql(aiomysql)·mssql(pyodbc)·oracle(oracledb) 어댑터가 기본 autocommit=False인데 **commit() 없어** INSERT/UPDATE/DELETE가 롤백되던 버그(run_sql·연결DB SQL실행 전반 영향, postgres는 asyncpg autocommit이라 정상). 결과셋 없는 문(DML/DDL)에 commit 추가. v3 _summarize_sql도 DML을 "N행 반영됨"으로 렌더(이전엔 "행 없음"→모델이 실패로 오해해 재시도 루프). **사이드카 재빌드 필요** |
| 2026-06-06 | 산출물: 테이블 정의서 툴 (HTML+엑셀) | js/agent_tools.js, proxy/python/routers/export.py, proxy/python/main.py(라우터 등록), docs/plan/클라이언트_툴_현황.html | generate_table_spec(클라, 인쇄용 HTML 새 창) + export_table_spec_xlsx(사이드카 openpyxl .xlsx). 새 엔드포인트 POST /export/table-spec(routers/export.py). 클라 총 51툴. "채팅 표" 아닌 정식 문서 산출물. 엑셀은 데스크탑 전용·사이드카 재빌드 필요 |
| 2026-06-06 | 분석·산출물 심화 툴 11개 (클라 6 + 프록시 5) | js/agent_tools.js, proxy/python/agent/tools_proxy.py, proxy/python/routers/export.py, docs/plan/클라이언트_툴_현황.html | 클라: analyze_erd_metrics·suggest_normalization·generate_data_dictionary·generate_erd_report·generate_term_compliance(표준사전)·export_data_dictionary_xlsx(총 57툴). 프록시: profile_table·check_referential_integrity·measure_cardinality·find_data_anomalies·suggest_indexes(데이터 기반, 총 20). +엔드포인트 POST /export/data-dictionary. 현황 문서 현행화+§8 검증 질의문 추가. 프록시·엑셀·DML은 사이드카 재빌드 필요 |
