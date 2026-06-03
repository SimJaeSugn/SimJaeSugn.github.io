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
