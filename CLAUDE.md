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

**목표:** Agent v2의 기능 추가·수정·삭제가 v1(현행 운영)에 어떠한 영향도 주지 않도록 격리를 강제한다. (설계 근거: `docs/ref/AI_ERD_v2_의도분석_계획준수_구현계획서.html` §9.1 격리 계약)

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

**대상 문서:** `docs/ref/AI_ERD_v2_의도분석_계획준수_구현계획서.html`

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
| 2026-06-06 | 에이전트 툴 대량 추가 (클라 30 + 프록시 9, 공유) | js/agent_tools.js, proxy/python/agent/tools_proxy.py, docs/ref/클라이언트_툴_추가계획.html, docs/plan/클라이언트_툴_현황.html | 클라: 선택·일괄·분석·내보내기·다이어그램·섹션·메모·버전(총 49툴). 프록시: DB introspection(describe_db_table·list_db_tables·count/sample/constraints/find_column/run_select/explain/compare 9개, 총 15툴). §9.1 격리의 **의도적 공유 추가** — agent_tools.js·tools_proxy.py 공유라 v1·v2·v3 자동 적용. 계획서·현황 문서 작성·동기화. 인앱 E2E 검증은 사용자 몫 |
| 2026-06-06 | DB 어댑터 DML 커밋 버그수정 (공유) | proxy/python/db/adapters/mysql.py·mssql.py·oracle.py, proxy/python/agent/v3/nodes/act.py | mysql(aiomysql)·mssql(pyodbc)·oracle(oracledb) 어댑터가 기본 autocommit=False인데 **commit() 없어** INSERT/UPDATE/DELETE가 롤백되던 버그(run_sql·연결DB SQL실행 전반 영향, postgres는 asyncpg autocommit이라 정상). 결과셋 없는 문(DML/DDL)에 commit 추가. v3 _summarize_sql도 DML을 "N행 반영됨"으로 렌더(이전엔 "행 없음"→모델이 실패로 오해해 재시도 루프). **사이드카 재빌드 필요** |
| 2026-06-06 | 산출물: 테이블 정의서 툴 (HTML+엑셀) | js/agent_tools.js, proxy/python/routers/export.py, proxy/python/main.py(라우터 등록), docs/plan/클라이언트_툴_현황.html | generate_table_spec(클라, 인쇄용 HTML 새 창) + export_table_spec_xlsx(사이드카 openpyxl .xlsx). 새 엔드포인트 POST /export/table-spec(routers/export.py). 클라 총 51툴. "채팅 표" 아닌 정식 문서 산출물. 엑셀은 데스크탑 전용·사이드카 재빌드 필요 |
| 2026-06-06 | 분석·산출물 심화 툴 11개 (클라 6 + 프록시 5) | js/agent_tools.js, proxy/python/agent/tools_proxy.py, proxy/python/routers/export.py, docs/plan/클라이언트_툴_현황.html | 클라: analyze_erd_metrics·suggest_normalization·generate_data_dictionary·generate_erd_report·generate_term_compliance(표준사전)·export_data_dictionary_xlsx(총 57툴). 프록시: profile_table·check_referential_integrity·measure_cardinality·find_data_anomalies·suggest_indexes(데이터 기반, 총 20). +엔드포인트 POST /export/data-dictionary. 현황 문서 현행화+§8 검증 질의문 추가. 프록시·엑셀·DML은 사이드카 재빌드 필요 |
| 2026-06-06 | 현황 문서 미적용 항목 일괄 적용 | proxy/python/agent/tools_proxy.py, proxy/python/agent/common/prompts.py, README.md, docs/plan/클라이언트_툴_현황.html | apply_erd_to_db 프록시 툴 구현(external·danger 포워드엔지니어링, 프록시 21). REPLAN_SYSTEM 읽기-툴 가이드에 신규 read 툴 반영(§9.1 공유 추가). README agent_tools 설명 57종 갱신. 인앱E2E=사용자 검증. 현황 문서 §7·§9 현행화 |
| 2026-06-06 | 스텝 라벨 친화 문구 적용 | js/agent_tools.js(_agentToolLabel), js/agent_panel.js, js/agent_v2/client_v2.js, js/agent_v3/client_v3.js | 신규 53툴(클라38·프록시15)에 인자 반영 친화 라벨을 공유 _agentToolLabel()로 한 곳에 정의(DRY)하고, v1·v2·v3 StepLabel 폴백에서 호출. desc 폴백 대신 "테이블 선택: 주문"·"DB 테이블 구조(서버): X" 식 라벨. 클라만이라 앱 새로고침이면 적용 |
| 2026-06-06 | 버그수정 — 운영 DB 논리명↔물리명 해소 | agent/v3/common/prompts.py(REACT), agent/common/prompts.py(PLAN_V2·context_brief), agent/v2/common/prompts.py(PLAN_V2), js/agent_panel.js·panel_v2.js·panel_v3.js | "공통모델 테이블에서 Test Model 삭제" 질의에 에이전트가 한글 논리명을 SQL에 그대로 써 'Table 공통모델 doesn't exist' 실패. ① 프롬프트(REACT·PLAN_V2)에 "운영 DB는 물리명만 — describe_table/fetch_db_schema로 물리 테이블·컬럼명 확인 후 SQL" 규칙 ② 프론트 컨텍스트에 physical 필드 추가 + context_brief가 "논리명 [물리명]" 렌더 → 에이전트가 매핑을 본다. 승격 dry-run 동기화 OK. 사이드카 재빌드+앱 새로고침 필요 |
| 2026-06-06 | V3-M3(부분) — v3 쓰기/위험 작업 승인 게이트 | agent/v3/nodes/approve.py(신규), agent/v3/nodes/react.py, agent/v3/graph.py, agent/v3/common/state.py, docs/plan/v3_react_hybrid.md·클라이언트_툴_현황.html | v3는 run_sql(DELETE 등)·엔티티 CRUD를 승인 없이 즉시 실행하던 갭. ReAct 루프에 approve 노드 추가 — write/external/danger 툴은 실행 전 plan_approval interrupt(read/meta 면제), 승인→exec·거부→respond(취소). 프론트 _agentV3AwaitApproval 기존 핸들러 재사용(백엔드만 변경). v3 격리 유지. 사이드카 재빌드 필요 |
| 2026-06-06 | v3 처리 단계(ReAct 추적) 응답 완료 시 접기 | js/agent_v3/observe_v3.js, js/agent_v3/client_v3.js | 처리 단계 추적(🎯🧠👁✓)을 헤더 토글(▾/▸ 처리 단계 N단계) + 본문 구조로 바꾸고, 턴 종료(finally)에 _agentV3CollapseTrace로 자동 접음. 헤더 클릭으로 재펼침. 클라 v3만 — 앱 새로고침 |
| 2026-06-06 | 버그수정 — create_entity id↔물리명 혼동 | js/agent_tools.js (_agentToolCreateEntity·카탈로그 detail) | 엔티티 추가 시 LLM이 id/physicalName/logicalName을 헷갈려 교체되던 문제. ① 코드: id가 비거나 한글이면 물리명(영문)→임의 순으로 파생, 물리명 없으면 id 대문자형(혼동 정규화) ② 카탈로그 detail에 import.js와 동일 규칙 명시(id=소문자 snake_case, physicalName=UPPER_SNAKE_CASE, logicalName=한글, 예시 포함). 공유(v1·v2·v3). 클라만 — 앱 새로고침 |
| 2026-06-06 | V3-M3 완료 — verify 노드(준수 검증·관찰 기반 종료조건) | agent/v3/nodes/verify.py(신규), agent/v3/graph.py, agent/v3/common/schemas.py(V3Verdict·MAX_VERIFY)·prompts.py(VERIFY_SYSTEM)·state.py, agent/v3/nodes/prep.py, routers/v3/agent.py(verdict SSE), js/agent_v3/observe_v3.js, docs/plan/v3_react_hybrid.md | react의 finish가 곧장 종료하지 않고 verify를 거쳐 [의도]의 goal 충족을 V3Verdict로 판정. pass→respond, partial+continue→미충족을 관찰에 남기고 react 보완(MAX_VERIFY=2 가드). 실LLM 검증: 충족→pass/respond, 미충족→partial/continue+missing. 성급한 finish 차단. SSE verdict 렌더. M3(승인+verify) 완료. 사이드카 재빌드 필요 |
| 2026-06-06 | v3 clarify 강화 — interrupt 기반 되묻기(의도불명 + ReAct 루프 중 정보부족) | agent/v3/nodes/clarify.py(신규), agent/v3/graph.py, agent/v3/nodes/react.py·prep.py, agent/v3/common/schemas.py(ASK_USER·MAX_CLARIFY)·state.py(clarify_count·clarify_cancelled)·prompts.py(REACT ask_user 지침), routers/v3/agent.py(SSE 문서), js/agent_v3/client_v3.js·observe_v3.js, docs/plan/v3_react_hybrid.md, proxy/python/README.md | 기존 clarify(analyze→respond, "묻고 끝")를 interrupt HITL로 전환 — 답을 받아 질의를 그 자리에서 완성. 진입①analyze 불명확→ambiguities 되묻기→messages로 analyze 재분류(MAX_CLARIFY=3). 진입②react ask_user(location="ask") 툴→되묻기→scratchpad 관찰로 루프 지속. 건너뜀→respond(취소). interrupt SSE/resume 재사용(라우터 무변경). v1 analyze 무수정(격리 — 그래프 라우팅으로만). 격리 검증(diff 화이트리스트 빔·상호참조 0)·라우팅/interrupt 단위검증 통과. 사이드카 재빌드+앱 새로고침 필요 |
| 2026-06-06 | 버그수정 — DB DML multi-statement 미반영(공유) + v3 쓰기 후 자가검증 | proxy/python/db/adapters/mysql.py·mssql.py(공유), agent/v3/common/prompts.py·nodes/act.py(v3) | 증상: MySQL에서 LLM이 만든 INSERT가 "100행 반영" 보고되나 실제 미반영. 원인: pymysql/aiomysql MULTI_STATEMENTS 기본활성 — 한 execute로 여러 INSERT가 서버 실행되는데 어댑터가 **첫 결과셋만 읽고 커밋 후 연결 반납** → 뒤 문장이 미커밋 롤백/연결 오염. 수정: **모든 결과셋 nextset()로 소진하며 영향행 누적 → DML이 있으면 마지막에 1회 커밋**(mysql·mssql, 모의커서 4케이스 검증). 단일 multi-row INSERT는 기존대로 동작. (B) v3 REACT_SYSTEM에 "쓰기 직후 SELECT로 실제 반영 1회 검증 후 finish" 규칙 + act.py 관찰을 "드라이버 보고값(미확정)"으로 표기 → rowcount 맹신·"이미 완료" 뒷북 차단. db/는 에이전트 격리 범위 밖 공유 인프라(v1·v2·v3 공통 적용). **사이드카 재빌드 필요** |
| 2026-06-06 | 버그수정 — v3 INSERT 무한 누적 가드 ③ | agent/v3/nodes/react.py, agent/v3/common/prompts.py | 위 커밋 수정으로 쓰기가 실제 반영되자, react가 INSERT를 반복 선택해 100행씩 무한 누적되는 문제 표면화(임의 데이터라 매 스텝 args가 달라 동일행동 가드①을 빠져나감). react.py에 가드③ — 이번 턴에 INSERT/REPLACE가 1회 성공했으면 다음 INSERT는 강제 finish(검증 SELECT·DELETE/UPDATE·클라 create_entity는 허용). REACT_SYSTEM에 "쓰기는 한 번만·검증은 SELECT로만, INSERT 재실행 금지" 명시. 가드 단위검증 통과. v3 격리 유지(화이트리스트 빔). 사이드카 재빌드 필요 |
| 2026-06-06 | 진입점 컷오버 1단계(오너 결정) — 우측 도크 'Agent' 탭 → v3 | index.html(Agent 탭 onclick 1줄), docs/plan/v3_react_hybrid.md §3·§4 | 계획서 §3 "진입점 교체(컷오버)" 적용. 'Agent' 탭 onclick 을 switchPanelTab('agent')(v1 도크 채팅)→toggleAgentV3Panel()(v3 패널)로 변경. v1 #panelViewAgent·agent_panel.js·백엔드 /agent/* 보존(무위험 롤백=onclick 복원), v2·v3 플로팅 버튼 등 나머지 진입점 유지(오너 지시 "v1 탭에만"). index.html 은 §9.1 격리의 컷오버 surface — 이 수정은 하네스가 명시한 "교체는 §3 컷오버 시점·오너 결정으로" 예외에 해당(격리 위반 아님). diff 화이트리스트 빔(v1·v2 JS·백엔드 무변경). 단축키(Ctrl+Shift+A)·완전 전환(M6)은 미정. 앱 새로고침이면 적용 |
| 2026-06-06 | v3 플로팅 패널 드래그 이동 + 자유 리사이즈 + 위치/크기 기억 | js/agent_v3/panel_v3.js | #agentV3Panel 헤더 드래그로 이동·우하단 그립으로 리사이즈, mouseup 시 localStorage(agentV3PanelBox) 저장·다음 로드 복원(뷰포트 클램프). 최초 상호작용 시 도크 앵커(bottom/right)→left/top/width/height px 고정. v3 전용(전역 _AGENT_V3_*·DOM #agentV3Panel 접두 유지, 불변식③ 그대로). 격리 화이트리스트 빔·구문검사 통과. 클라만 — 앱 새로고침이면 적용 |
| 2026-06-06 | 우측 도크 'Agent' 탭 제거 — v3 진입 플로팅 단일화 | index.html(#panelTabs Agent 버튼 삭제), docs/plan/v3_react_hybrid.md §3·§4, README.md | 앞선 탭→v3 컷오버를 정리: 도크 'Agent' 탭(data-ptab="agent") 자체를 #panelTabs에서 삭제. v3는 우하단 플로팅 🧠 버튼으로만 접근(드래그·리사이즈 지원). v1 #panelViewAgent·agent_panel.js·백엔드 /agent/* 보존(롤백=탭 버튼 복원). 단축키 Ctrl+Shift+A는 여전히 v1 도크 뷰를 엶(미전환). index.html=컷오버 surface(격리 위반 아님), diff 화이트리스트 빔. 앱 새로고침이면 적용 |
| 2026-06-06 | 버그수정 — 최종 보고가 list_db_tables 결과를 환각(공유) | proxy/python/agent/common/prompts.py(results_detail) | 증상: "연결된 DB 테이블 목록 조회" 시 ReAct가 list_db_tables를 정상 호출·관찰(실제 17개)하고 verify도 pass하는데, 최종 respond가 가짜 목록(고객·주문·제품…)을 지어냄. 원인: 최종 보고용 results_detail에 2026-06-06 추가된 프록시 introspection 툴(list_db_tables·describe_db_table·count_db_rows 등) 핸들러가 없어 전부 generic else로 떨어져 데이터 없이 "성공"만 전달 → respond LLM이 데이터 부재로 환각. 수정: list_db_tables·describe_db_table 전용 핸들러 추가 + else를 'ok 외 페이로드 노출'(상한2000자)로 개선해 데이터 반환 read 툴 전반 커버. 쓰기 툴(entityId/note)은 동작 불변. 시뮬레이션 검증 통과. results_detail은 v1 respond_node 공유라 v1·v2·v3 공통 적용(§9.1 의도적 공유 수정 — 버그가 전 레인 동일, v3 복제 시 v1·v2 미수정 잔존). **사이드카 재빌드 필요** |
| 2026-06-06 | ERD 툴 사용자 출력에서 엔티티ID→논리/물리명 라벨(공유) | js/agent_tools.js(_agentEntLabel 신규·_agentResolveEntityId·generate_erd_report·suggest_normalization·normalize_check·describe_table·list_relations) | 오너 지시 — 엔티티ID는 내부값이므로 사용자/LLM 노출 출력은 ID가 아닌 논리명·물리명을 써야 하며 **모든 ERD 툴 공통**. 관계 from/to·정규화 대상·FK ref.entity가 엔티티ID를 그대로 노출하던 것을 _agentEntLabel(view,id)="논리명 [물리명]" 라벨로 치환. 라벨이 후속 툴 호출에서 다시 ID로 해소되도록 _agentResolveEntityId namePart가 괄호뿐 아니라 대괄호도 제거. junction 제안명만 유효 식별자라 물리명 기반 유지. 라벨생성·resolver 왕복 단위검증 통과. §9.1 공유 변경(agent_tools.js 공유라 v1·v2·v3 자동 적용, v3 경로 무수정). 클라만 — **앱 새로고침이면 적용**(사이드카 무관) |
| 2026-06-06 | agent(v3) 패널 최초 도움말 칩 문구 변경 | index.html(#agentV3Empty 추천 칩 3개) | 오너 요청 — 초기 추천 질의를 "ERD 종합 명세서 만들어줘"·"데이터 사전 만들어줘"·"정규화 위반 찾아서 고칠 방법도 알려줘"로 교체(기존 테이블 생성·PK 점검·정렬 → 산출물·진단 중심). #agentV3Empty 는 v3 전용 DOM(불변식③) — v1·v2 마크업·백엔드 무변경, 격리 유지. 클라만 — 앱 새로고침이면 적용 |
| 2026-06-06 | 신규 툴 save_content — LLM 생성 콘텐츠 파일 저장(공유) | js/agent_tools.js(_agentToolSaveContent 신규·등록·라벨), README.md(58종) | 오너 요청 — "위 내용을 HTML 보고서로 만들어 저장해줘"처럼 LLM이 완성한 본문(content)을 받아 파일로 저장(다운로드)하는 자유형 산출물 툴. format/fileName 확장자로 포맷 결정(html·md·csv·json·txt·svg·xml·sql, 기본 txt), HTML 단편은 인쇄용 문서로 자동 래핑, 객체 content는 JSON 직렬화, 금지문자 파일명 정리. kind=read(승인 면제), Blob 다운로드라 웹·데스크탑 공통. 클라 총 58종. 7케이스 단위검증 통과. §9.1 의도적 공유 추가(agent_tools.js 공유라 v1·v2·v3 자동, v3 경로 무수정). 클라만 — **앱 새로고침이면 적용**(사이드카 무관) |
| 2026-06-06 | 신규 프록시 툴 get_db_connection_info — DB 접속 프로파일 정보(공유) | proxy/python/agent/tools_proxy.py(카탈로그·디스패치), js/agent_tools.js(라벨), README.md(22종), docs/plan/클라이언트_툴_현황.html | 오너 요청 — 현재 연결된 DB 접속 프로파일(유형·host·port·database·username·schema, Oracle clientLibDir·profileName)을 반환하는 read 프록시 툴. **비밀번호는 보안상 절대 미포함**(검증). DB 쿼리·어댑터 불필요(드라이버 오류와 무관하게 접속 진단)하도록 try 밖 조기 반환. 미설정 시 graceful error. PROXY_TOOL_CATALOG 21→22(신규 16). tools_proxy.py 공유 frozen이라 v1·v2·v3 자동 적용(§9.1 의도적 공유 추가, 동작 변경 없는 추가). mock config 3케이스 단위검증 통과. 프록시라 **사이드카 재빌드 필요**(+클라 라벨은 새로고침) |
| 2026-06-06 | ref.md 작업지시 일괄 구현 — 클라 툴 5 + 프록시 툴 2(공유) | js/agent_tools.js(_agentLiveIds all·copy_entities_to_diagram·list_themes·list_shortcuts·list_menus·manage_column_template+라벨), proxy/python/agent/tools_proxy.py(list_db_profiles·manage_db_profile+핸들러), README.md, docs/plan/클라이언트_툴_현황.html | 오너 지시(docs/ref/ref.md) 자율 진행. **클라 5**: copy_entities_to_diagram(전체/선택 엔티티를 타 다이어그램 복사, 관계·FK 이식, _agentLiveIds에 all 추가), list_themes(THEMES), list_shortcuts(_scMap), list_menus(CMD_LIST 사이트맵), manage_column_template(loadTemplates/saveTemplates add·list·delete). **프록시 2**: list_db_profiles(read, 비번 제외)·manage_db_profile(write·danger, add/update/delete/activate; 비번 encrypt, 활성·마지막 삭제 차단, activate 시 close_all_pools). 클라 58→63·프록시 22→24. node --check·run매칭(63)·프로파일 7케이스 단위검증 통과. §9.1 의도적 공유 추가(agent_tools.js·tools_proxy.py 공유, v1·v2·v3 자동, v3 경로 무수정). **사이드카 재빌드 필요**(프록시) |
| 2026-06-06 | ref.md — agent(v3) 패널 8방향 리사이즈 + 컨텍스트 초기화 | js/agent_v3/panel_v3.js(_agentV3InitDragResize 8핸들·agentV3ResetContext·환영HTML 캡처), index.html(#agentV3Panel 헤더 🗑 버튼) | 오너 지시(docs/ref/ref.md). #2 패널을 우하단 단일 그립→**8방향(n·s·e·w·4코너) 리사이즈**(좌/상 방향은 left/top 보정해 반대 모서리 고정). #3 헤더에 🗑 버튼+agentV3ResetContext() — 진행요청 중단+_agentV3ThreadId=null(백엔드 thread 재시작)+메시지/환영화면 복원. v3 전용 DOM·전역(#agentV3*·_agentV3*)만 수정(불변식③ 유지), v1·v2 무변경. node --check 통과. 클라만 — 앱 새로고침이면 적용 |
| 2026-06-06 | ref.md — 메뉴의 SQL 실행기 진입점 제거 | index.html(메뉴바 항목), js/ui.js(CMD_LIST 항목) | 오너 지시(docs/ref/ref.md) — 하단 패널에 SQL 실행 기능이 있어 중복인 '도구>SQL 실행기' 메뉴·명령팔레트 항목 삭제. sql_runner.js 기능 자체·openSqlRunner 함수는 보존(다른 진입점 없음). 앱 새로고침이면 적용 |
| 2026-06-06 | Agent v3 브랜드 아이콘 🧠→💬 | index.html(v3 플로팅 버튼·패널 헤더·환영 ico·주석) | 오너 지시 — v3 진입 아이콘을 말풍선(💬)으로 변경. ReAct 추적의 "생각" 단계 마커(🧠, observe_v3.js)는 의미가 달라 유지. 클라(HTML)만 — 앱 새로고침이면 적용 |
| 2026-06-06 | Agent v2 진입 버튼 숨김 | index.html(#agentV2ToggleBtn style display:flex→none) | 오너 지시 — 우하단 v2 플로팅 🤖 버튼 비표시. v2 패널(#agentV2Panel)·toggleAgentV2Panel·routers/v2·agent/v2 백엔드는 모두 보존(진입점만 숨김, 롤백=display none→flex). v3(🧠)가 기본 진입. index.html=진입 surface(격리 위반 아님), v2 JS·백엔드 무변경. 앱 새로고침이면 적용 |
| 2026-06-06 | v3 동작 — 별도 요청 없으면 자동 정렬 안 함 | agent/v3/common/prompts.py(REACT_SYSTEM) | 오너 지시 — "별도 요청 없으면 정렬 불필요". 의존순서에서 자동 "→ 정렬" 제거 + "auto_layout·align_entities는 사용자가 명시 요청할 때만, 생성·복사·수정 후 임의 정렬 금지(위치 그대로)" 규칙 추가. v3 전용(REACT_SYSTEM)·v1·v2 프롬프트 무변경(격리). 구문·규칙 포함 검증. **사이드카 재빌드 필요** |
| 2026-06-06 | 버그수정 — "다이어그램 만들고 복사"가 재정렬되던 문제 | js/agent_tools.js(_agentToolCopyEntitiesToDiagram·카탈로그 detail), docs/plan/클라이언트_툴_현황.html | 증상: "AA 다이어그램 만들고 모든 엔티티 복사"에 에이전트가 create_diagram(→빈 AA로 전환) 후 auto_layout(재정렬)을 호출. 원인: "만들고"를 create_diagram으로 분해 + REACT의 "생성→관계→정렬" 패턴. 수정: copy_entities_to_diagram이 생성+복사+**대상으로 전환**까지 한 번에(activate 기본 true, 위치 보존), 카탈로그 detail에 "create_diagram 선행·auto_layout 후행 금지" 명시. vm 샌드박스 E2E 검증(생성·복사2·관계1·전환·위치보존·FK재매핑·원본보존). 공유 클라(v1·v2·v3). 앱 새로고침이면 적용 |
| 2026-06-06 | 툴 현황 문서 리팩토링 — 기능 유형별 카탈로그로 재편 | docs/plan/클라이언트_툴_현황.html | 오너 지시 — "기존/신규/이력" 누적 구조를 제거하고 **순수 기능 유형별**로 재편(클라 7분류 A~G·프록시 5분류). 각 툴을 종류(kind)·설명(강화)·검증 질의문 3열로 통일, 전 툴 ✅ 열·날짜태그·§9 변경로그성 항목·중복 §검증질의문 제거. 제목 "에이전트 툴 카탈로그"로 변경. 코드 대조 검증: 클라 63·프록시 24 전부 문서 반영(누락 0), HTML 태그 균형 OK. 문서만 — 코드 무변경 |
| 2026-06-07 | 모델 호환성 검사 stage③ json_schema 정렬 (브랜치 feature/agent-json-schema) | proxy/python/agent/common/llm.py(diagnose_model) | v3가 json_schema로 전환됐으므로 호환성 검사 ③구조화 출력도 function_calling→json_schema로 변경(에이전트 실제 방식과 일치). 이전엔 function_calling으로 검사해 json_schema 호환 모델을 unfit 오판하던 것을 교정. 라이브 검증: exaone-3.5-7.8b → verdict=ok(4단계 전부 통과). struct 실패 사유·verdict 메시지도 json_schema 미지원 기준으로 갱신. **사이드카 재빌드 필요** |
| 2026-06-07 | V3 구조화 출력 json_schema 전환 — 로컬 LLM 호환 (브랜치 feature/agent-json-schema) | agent/v3/nodes/analyze.py(신규 격리 복제), agent/v3/graph.py(복제본 사용), agent/v3/nodes/react.py·verify.py(method 전환), docs/plan/v3_react_hybrid.md | 근본수정 — function_calling이 강제 tool_choice(object)를 보내 LM Studio가 거부(400)→analyze answer 폴백→narration. v3 세 구조화 노드를 json_schema로 전환(LM Studio·OpenAI 동작). analyze는 §9.1 따라 v3로 복제(v1 무손상), react(ReActStep)·verify(V3Verdict) method 변경. 라이브 검증: 3스키마 모두 json_schema OK, v3 analyze 복제본 'ERD 종합 명세서'→route=act(폴백 탈출). 그래프 빌드·격리(편집 agent/v3 내부만, 소스 v2참조 0) 통과. 별도 브랜치서 관리(main 기준점). **사이드카 재빌드 필요**. v1·v2 적용·머지는 별도 결정 |
| 2026-06-07 | Agent 설정 — 모델 호환성 검사 기능(공유) | proxy/python/agent/common/llm.py(diagnose_model 4단계 배터리), proxy/python/routers/agent.py(/agent/diagnose), js/agent_settings.js(호환성 검사 버튼·판정 렌더), proxy/python/README.md, docs/로컬LLM_서빙_트러블슈팅.md | 오너 요청 — "모델 변경"이 무분별해지지 않게, 저장 전 적합성을 실제 probe로 판정. 4단계: ①content 채널(thinking 누수) ②tool_calls ③구조화 출력(에이전트 실제 방식) ④툴 인자 정확도 → verdict ok/limited/unfit + 사유. 라이브 검증 중 **근본 발견**: 에이전트의 with_structured_output(method='function_calling')이 강제 tool_choice(object)를 보내는데 **LM Studio가 거부(none/auto/required만)** → analyze 등 구조화 노드 전부 실패→answer 폴백→narration. method='json_schema'는 LM Studio·OpenAI 모두 동작 확인(후속 수정 후보). 공유(agent/common·routers/agent·agent_settings) — v1·v2·v3 자동. 라이브 end-to-end 검증·구문 통과. **사이드카 재빌드 필요** |
| 2026-06-07 | agent(v3) 패널 — 질의 중단 버튼 추가 | js/agent_v3/client_v3.js(_agentV3Busy 전역·_agentV3SetSendBtnMode·agentV3Stop·agentV3SendOrStop), index.html(#agentV3SendBtn onclick) | 오너 요청 — 응답이 늦을 때 중단 가능하게. 기존 `_agentV3Abort`(AbortController)·AbortError 처리 재사용, 전송 버튼을 진행 중 **중단(■)** 버튼으로 토글(클릭→abort→catch가 '(중단됨)' 표기·finally 복원). _agentV3Busy 로 재진입(Enter 연타) 방지. v3 전용(전역 _agentV3*·#agentV3SendBtn)·격리 유지(편집 js/agent_v3+index.html v3 마크업만). node --check 통과. 클라만 — 앱 새로고침이면 적용 |
| 2026-06-07 | V3 버그수정 — 약한 모델(로컬 LLM) 산출물 질의 narration 방지 | agent/v3/common/prompts.py(REACT_SYSTEM 산출물 규칙), agent/v3/nodes/react.py(_retry_force_tool 강제 재시도 가드), docs/plan/v3_react_hybrid.md | LM Studio Qwen3.5-9b 등이 'ERD 종합 명세서 만들어줘'에 generate_erd_report를 호출 안 하고 "생성하겠습니다" **서술만** 함(빈 ReActStep→tool=""→finish→respond narration, 새 창 미개방). ① REACT_SYSTEM: 산출물('명세서/보고서/DDL 등 만들어줘')은 generate_*·export_*·save_content 생성 툴을 **직접 호출**(describe_table 선행·finish 금지). ② react.py: act/mixed인데 첫 스텝서 tool 빔/성급한 finish면 유효툴 명시·finish금지 교정으로 **1회 강제 재시도**(무한루프 없음). 라이브 LM Studio 재현·교정 확인. v3 전용·격리 검증(구문·상호참조0·편집 agent/v3 내부만) 통과. **사이드카 재빌드 필요** |
| 2026-06-07 | 하네스·스킬 참조 문서 docs/ref/ 로 정리 | docs/ref/(이동 4건), CLAUDE.md, .claude/agents/4, .claude/skills/feature-dev/(SKILL.md·assets/report_template.html), docs/plan/v3_react_hybrid.md, proxy/python/agent/v2/eval/README.md, docs/eval/2차_최적화_결과보고서.html | 오너 지시 — docs/ 루트에 흩어진 평면 참조문서 4개(`AI_ERD_v2_의도분석_계획준수_구현계획서.html`·`클라이언트_툴_추가계획.html`·`ref.md`·`계획서_샘플양식.html`)를 `docs/ref/` 로 git mv(히스토리 보존). 참조처 10개 파일 경로 일괄 갱신, 구 경로 잔존 0·깨진 상대링크 0 검증. docs/plan/ 의 3개(v2_to_v1_promotion·v3_react_hybrid·클라이언트_툴_현황)는 이미 정리돼 있어 유지(오너 선택). 문서·참조만 — 코드 무변경 |
| 2026-06-08 | V3 버그수정 — ReActStep.args 자유형 dict → args_json(strict json_schema 호환) | agent/v3/common/schemas.py(ReActStep.args→args_json:str), agent/v3/nodes/react.py(_parse_args 헬퍼+소비처 2곳+corrective), agent/v3/common/prompts.py(REACT_SYSTEM args→args_json 4곳), docs/plan/v3_react_hybrid.md | 증상: v3 질의 시 `400 Invalid schema for response_format 'ReActStep': ('properties','args') additionalProperties is required to be false`. 원인: langchain-openai 1.2.2가 Pydantic 클래스를 json_schema 구조화 출력에 넘기면 payload 빌드서 **strict=True 강제** → 모든 object에 additionalProperties:false 요구 → 임의 키 받는 자유형 `args:dict`는 표현 불가라 거부(strict=False 무효, IntentSpec·V3Verdict는 자유형 dict 없어 통과 → react만 에러). 수정: `args:dict`→`args_json:str`(JSON 객체 문자열, OpenAI 함수호출 native 방식, strict 서버·LM Studio 공통 호환). react.py에 `_parse_args`(문자열→dict, 빈값·파싱실패·dict응답 방어) 추가·소비처 2곳 교체 → **react_args(dict) 계약 유지로 다운스트림(act·approve·meta·clarify) 무변경**. 검증: 스키마 자유형object 0·langchain strict변환 ReActStep·V3Verdict 통과·_parse_args 6케이스·그래프빌드·격리(diff 화이트리스트 빔·상호참조0) 통과. v3 전용·격리 유지. **사이드카 재빌드 필요** |
| 2026-06-08 | 신규 툴 reverse_engineer_db — 리버스 엔지니어링 단일 툴(공유) | js/agent_tools.js(_agentToolReverseEngineerDb 신규·등록·라벨, copy_entities detail 보강), README.md(64종), docs/plan/클라이언트_툴_현황.html | 증상: "'HR' 다이어그램 만들고 리버스 엔지니어링" 질의에 에이전트가 스키마(15테이블)는 fetch 했으나 엔티티 생성 단계에서 **copy_entities_to_diagram(다이어그램 간 복사)** 을 골라 "복사할 엔티티가 없습니다" 실패. 원인: 리버스 엔지니어링을 한 번에 수행하는 에이전트 툴 부재(create_diagram+fetch_db_schema+create_entity 조합을 약한 모델이 못 풂). 수정: UI 리버스 엔지니어링(reverse_engineer.js)의 빌더(_buildEntitiesFromSchema·_buildRelationsFromFks·_buildViewNotes)를 재사용하는 단일 클라 툴 추가 — /schema 조회→엔티티·관계·뷰메모 빌드→새 다이어그램 생성·채움(name 기존이면 채움)·전환을 한 번에. mode=new(기본)/append, tables·keyword 필터, toUpper. copy_entities detail에 "DB→ERD는 reverse_engineer_db" 안내. §9.1 의도적 공유 추가(agent_tools.js 공유라 v1·v2·v3 자동, v3 경로 무수정). node --check·run매칭(64) 통과. 데스크탑 전용·인앱E2E=사용자 검증. 클라만 — **앱 새로고침이면 적용**(사이드카 무관) |
| 2026-06-08 | 신규 툴 standardize_attribute_names + 표준용어 워크플로우 정립·등록 반복 가드(공유+v3) | js/agent_tools.js(_agentToolStandardizeAttributeNames 신규·등록·라벨, register_std_term·generate_term_compliance desc 명확화), agent/v3/common/prompts.py(REACT 표준용어·재생성금지 규칙), agent/v3/nodes/react.py(가드④), README.md(65종), docs/plan/(클라이언트_툴_현황·v3_react_hybrid) | 증상: "'HR2' 만들고 리버스+표준용어 점검·어긋난 부분 직접 수정" 질의에 react가 **엔티티 추가 반복**+**register_std_term 무한 시도**. 원인: ①"직접 수정"용 결정적 툴 부재 → 점검 결과 미등록 컬럼을 register_std_term으로 무차별 등록(매번 용어명 달라 동일args 가드① 우회, INSERT누적과 동형) ②루프 미수렴→verify continue로 리버스·엔티티 생성 재시도. 수정(3중): (A)공유 클라 툴 standardize_attribute_names(write·async) — 컬럼 논리명→표준 abbr 조회해 물리명≠abbr이면 1회 호출에 일괄 수정(미등록은 보고만·자동등록X). generate_term_compliance(점검)→standardize(수정) 2스텝으로 수렴 (B)REACT_SYSTEM에 표준용어 워크플로우+register_std_term은 사전변경이지 ERD수정 아님·미등록 대량등록 금지+재생성 금지 규칙 (C)react.py 가드④(register_std_term ≥2회면 finish). react는 카탈로그 desc만 보므로(detail 미노출) 관련 desc 자기설명화. node --check·py_compile·격리(화이트리스트=agent_tools.js 공유추가만·상호참조0) 통과. (A)§9.1 의도적 공유(v1·v2·v3 자동, v3경로 무수정), (B)(C)v3 전용. **사이드카 재빌드 필요**(+클라 새로고침). 인앱E2E=사용자 검증 |
| 2026-06-11 | 버그수정 — 관계선 'FK 자동 추가' FK 컬럼명이 부모 PK 컬럼명 아닌 테이블명 기반(공유) | js/entities.js(autoAddFkColumn 재작성), js/agent_tools.js(_agentDraftAddFk 동기화) | 관계 추가 모달에서 'FK 자동 추가' 체크 시 생성 FK 컬럼명이 부모 PK 컬럼(예 MBR_NO)이 아니라 부모 테이블명 기반(MEMBER_ID)으로 만들어지던 버그. pkAttr을 찾고도 type·ref.attr에만 쓰고 컬럼명은 테이블명을 씀이 원인. 부모 PK 컬럼의 physicalName/logicalName/type을 FK 컬럼에 상속(복합 PK는 PK 컬럼 전부 각각 FK로 — 오너 결정), PK 없으면 테이블명_ID 폴백. 중복검사 양변 toUpperCase 정규화 + ref.entity→ref.entity+ref.attr 쌍 비교(복합 PK 둘째 컬럼 부당 스킵 방지·멱등). agent_tools.js의 복제 함수 _agentDraftAddFk(create_relation 에이전트 경로)도 동일 규칙 동기화(§9.1 의도적 공유 — 두 함수 동등성 vm 검증). 클라만 — **앱 새로고침이면 적용**. 기존 생성분 마이그레이션 범위 밖 |
| 2026-06-11 | 버그수정 — 리버스 엔지니어링 관계 방향 반전 + FK 마킹·dedup·자기참조(공유) | js/reverse_engineer.js(_buildRelationsFromFks 스왑·dedup·self-skip, _markFkColumnsFromSchema 신규, append ref 재매핑), js/agent_tools.js(reverse_engineer_db에 마킹 호출 +1줄) | 사이드카 fks payload(fromTable=FK보유 자식·toTable=참조 부모)를 앱 규약(rel.from=부모·rel.to=자식)에 거꾸로 매핑해 리버스 ERD 관계가 전부 반전되던 버그. ①방향 스왑(card 1:N/1:1 의미 유지) ②FK 컬럼 kind:'fk'+ref 마킹(PK 우선, toUpper 변환 일치) ③복합 FK(컬럼당 1행) 같은 쌍 dedup ④자기참조는 관계 배제·attr ref 유지 ⑤append id 재매핑 시 ref.entity 동반 재매핑. 빌더 공유라 UI 메뉴·에이전트 툴(reverse_engineer_db) 동시 수정(agent_tools.js는 가드 호출 1줄 — §9.1 공유 frozen 시그니처·부수효과 불변). vm mock 스키마 검증(단일·복합·자기참조·1:1·PK+FK·toUpper)·격리 diff 0 통과. 클라만 — **앱 새로고침이면 적용**(사이드카 무관). 기존 반전 생성분은 리버스 재실행으로 교정 |
| 2026-06-11 | 신규 툴 apply_db_comments — DB 코멘트→논리명·설명 일괄 적용(공유) + /schema/comments | js/agent_tools.js(_agentToolApplyDbComments 신규·등록·라벨, 66종), proxy/python/routers/schema.py(GET /schema/comments — 4 DB 코멘트 쿼리 순수 추가), agent/v3/common/prompts.py(REACT 규칙 1항목), proxy/python/README.md, README.md, docs/plan/클라이언트_툴_현황.html | 증상: "선택 엔티티의 DB 컬럼 코멘트를 논리명·description으로 적용" 질의가 컬럼당 1 write(update_attribute)로 쪼개져 **매 컬럼 승인 interrupt + MAX_LOOP(16) 초과**로 사용 불가(오너: "행위가 아니라 목표 단위로 묶어 1회 승인"). 해법 = standardize_attribute_names 선례의 **결정적 배치 툴**: apply_db_comments(async·write) 1회 호출 = 승인 1회 = GET /schema/comments 1회 fetch 후 컬럼 코멘트 첫줄→logicalName·전문→description(테이블 코멘트→엔티티 동일) 일괄 적용·요약 반환. onlyEmpty(논리명=물리명도 '빈'으로 간주)·target 옵션, 코멘트 없는 항목 보존, MySQL 뷰의 리터럴 'VIEW' 코멘트 제외(BASE TABLE 필터), PG obj_description 2인자형. 승인 모델 일반화(턴당 묶음 승인)는 보안 위험으로 보류(별도 결정). §9.1 의도적 공유 추가(agent_tools.js — v1·v2·v3 자동)+공유 인프라 routers/schema.py 순수 추가+REACT 규칙은 v3 전용. 격리 화이트리스트 빔·상호참조 0·vm/py 단위검증 통과. **사이드카 재빌드 필요**(+앱 새로고침). 인앱 E2E(승인 1회·undo 1회)=사용자 검증 |
| 2026-06-11 | 빌드 버전 single source 통일 — electron/package.json 한 곳만 수정하면 전 산출물 파생 | electron/installer.iss(#ifndef 가드+GetVersionComponents 폴백), build-desktop.ps1(iscc /DAppVersion 주입·완료문구 동적화·UTF-8 BOM), proxy/python/build.ps1(_version.py 생성), proxy/python/main.py(/ping VERSION import, 폴백 "dev"), .gitignore(_version.py), README.md 섹션27·28, proxy/python/README.md | 버전이 4곳 분산·불일치(electron 1.2.0 vs iss·/ping·nodejs 1.0.0)하던 것을 electron/package.json version 단일 원천으로: ①exe 메타=electron-builder 네이티브 ②설치파일명 AgenticERM_Desktop_Setup_{버전}.exe=build-desktop.ps1이 버전 읽어 iscc /D 주입(직접 iscc 실행 시 win-unpacked exe 버전 3자리 폴백·exe 부재 시 pragma error) ③사이드카 /ping=빌드 시 _version.py 생성(Ascii)→import(미빌드 dev 폴백). nodejs 레인은 자체 single source(index.js가 package.json require)라 범위 제외. 부수: BOM 없는 ps1+한글이 PS5.1 CP949 디코드서 파스 깨지는 함정 발견→BOM 추가. ISPP 3경로 프로브·E2E 흐름·gitignore 실측 통과. 에이전트·웹 클라 무영향(main.py 수정은 /ping 1줄·v2/v3 가드 무접촉). **사이드카·설치본 재빌드 시 적용** |
| 2026-06-23 | git release 자동 배포 워크플로 추가(v* 태그 → windows-latest 빌드·게시) | .github/workflows/release.yml(신규), README.md 섹션28 | electron/package.json 버전을 올리고 동일 v* 태그를 push하면 GitHub Actions가 사이드카+Electron을 빌드해 Release 자산으로 게시. 버전 단일 원천 강제(태그≠package.json이면 실패). 초기 push 시 PAT workflow 스코프 부재로 거부→gh auth setup-git으로 gh 토큰(workflow 스코프 보유) 전환. 라이브 검증: v1.4.0 빌드·게시 성공. 부수: proxy/python/build.ps1·electron/installer.iss UTF-8 BOM 추가(러너 PS5.1/iscc 한글 파스 깨짐 수정 — 2026-06-11 함정의 잔여분) |
| 2026-06-23 | 설치본 자동 업데이트 — Inno Setup→electron-builder NSIS + electron-updater(오너 결정) | electron/package.json(target dir→nsis·nsis/publish 블록·electron-updater dep·files node_modules·scripts release·author), electron/main.js(autoUpdater 통합), build-desktop.ps1(3단계 iscc→2단계 NSIS), .github/workflows/release.yml(--publish always·Inno 단계 제거), README.md 섹션24·27·28 | "git release로 자동 업데이트" 요구 — electron-updater는 Inno Setup 미지원이라 설치기를 NSIS로 교체. CI는 npm run release(electron-builder --publish always, GH_TOKEN)로 exe·latest.yml·blockmap을 정식 릴리스(releaseType:release)에 게시, 설치본 main.js가 checkForUpdates→백그라운드 다운로드→"재시작하여 설치"(차등=blockmap). perMachine 유지(UAC). 로컬 검증: NSIS 빌드·latest.yml 생성·electron-updater app.asar 번들 확인. installer.iss는 롤백용 보존(미사용). 라이브 검증: v1.5.0 CI 게시 성공(정식·자산3). E2E 자동업데이트(N→N+1)=2릴리스 후 사용자 검증 |
| 2026-06-23 | 로컬 직접 릴리스 스크립트 추가(release-desktop.ps1) | release-desktop.ps1(신규), README.md 섹션28(2-2) | 오너 요청 — 태그 push(CI) 없이 내 PC에서 "package.json 버전 수정 → npm run release"로 바로 게시하는 경로. build-desktop.ps1(미게시)에 게시를 더해 사이드카 빌드+NSIS+electron-builder --publish always를 한 번에. GH_TOKEN 없으면 gh auth token 자동 재활용. 태그 불필요(electron-builder가 버전으로 릴리스·태그 생성). UTF-8 BOM 추가(PS5.1 한글 파스). PS 파서 검증 통과. CI 경로와 결과·동작 동일(빌드 위치만 로컬↔러너) |
