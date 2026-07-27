# UXERManager Python Proxy

**Electron 데스크탑 앱 전용 프록시** — UXERManager.exe 실행 시 자동으로 시작되며, 앱 종료 시 함께 종료된다.  
FastAPI + uvicorn 기반. 포트 3737에서 대기하며 Node.js 미들웨어와 동일한 API를 제공한다.

> 웹 브라우저에서 UXERManager를 사용하는 경우 Node.js 미들웨어(`proxy/nodejs/`)를 설치하세요.

---

## 개발 실행

실행 위치: `proxy/python/`

```powershell
# 가상환경 생성 (최초 1회)
python -m venv venv
.\venv\Scripts\Activate.ps1

# 의존성 설치
pip install -r requirements.txt

# 개발 서버 실행
python main.py --port 3737
```

---

## 빌드 (PyInstaller)

실행 위치: `proxy/python/`

```powershell
.\build.ps1
```

결과: `dist\uxer-sidecar.exe`

> Electron 빌드 시 `electron/package.json`의 `extraResources`가 이 파일을 자동으로 번들합니다.

> `build.ps1`이 `electron/package.json`(버전 단일 원천)의 `version`으로 `_version.py`를 생성해 exe에 번들합니다 — `/ping` 응답의 `version`이 여기서 파생됩니다. 미생성 상태의 dev 실행(`python main.py`)에서는 `/ping`이 `"dev"`를 반환합니다.

---

## 지원 DB

| dbType 값 | DB | 드라이버 | 비고 |
|-----------|----|---------|------|
| `postgres` | PostgreSQL | asyncpg | 비동기 |
| `mysql` | MySQL | aiomysql | 비동기 |
| `mssql` | SQL Server | pyodbc | 동기 (run_in_executor 래핑) |
| `oracle` | Oracle | oracledb | 동기 (run_in_executor 래핑) |
| `supabase` | Supabase (PostgreSQL) | asyncpg | 비동기 · TLS 필수 + 준비문 캐시 off (풀러 호환) |

> **Supabase** — PostgreSQL 이므로 SQL 방언·스키마 조회(리버스)·DDL 실행(포워드)은 `postgres` 와 동일하다
> (`db/connector.py` 의 `sql_dialect()` 가 `supabase → postgres` 로 정규화). 다른 것은 연결 조건뿐이라
> `db/adapters/supabase.py` 가 다음을 주입해 `postgres` 어댑터에 위임한다.
> - `ssl="require"` — Supabase 는 평문 연결을 받지 않는다.
> - `statement_cache_size=0` — 트랜잭션 풀러(포트 **6543**, PgBouncer)는 prepared statement 미지원.
> - 기본값 보정 — 포트 5432, `database`/`username` 미입력 시 `postgres`.
>
> 호스트는 대시보드 **Connect** 의 값을 쓴다. 직접 연결 `db.<ref>.supabase.co` 는 **IPv6 전용**이라
> IPv4 환경에서는 풀러(`aws-…-<region>.pooler.supabase.com`, 세션 5432 / 트랜잭션 6543)를 사용하고,
> 이때 사용자명은 `postgres.<project-ref>` 형식이다. 연결 실패 시 이 원인들을 오류 메시지에 덧붙여 안내한다.

---

## 엔드포인트

Node.js 미들웨어와 동일한 API 구조 및 포트(3737)를 사용합니다.  
암호화 방식(AES-256-GCM)과 `~/.uxermanager/config.json` 저장 경로도 동일하여 두 프록시 간 설정 공유가 가능합니다.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /ping | 상태 확인 |
| GET | /health | DB 연결 상태 |
| GET | /config | 접속정보 조회 (비밀번호 마스킹) |
| POST | /config | 접속정보 저장 |
| POST | /config/test | 연결 테스트 |
| GET | /config/profiles | 프로파일 목록 |
| POST | /config/profiles | 프로파일 추가 |
| PUT | /config/profiles/:name | 프로파일 수정 |
| DELETE | /config/profiles/:name | 프로파일 삭제 |
| POST | /config/profiles/:name/activate | 프로파일 전환 |
| POST | /config/profiles/:name/reveal | 저장된 비밀번호 복호화 확인 |
| POST | /execute | SQL 실행 (body: sql, profileName?) |
| POST | /execute/stream | SQL SSE 스트림 (body: sql/sqls, profileName?) |
| GET | /schema/tables | 테이블·뷰 목록 (query: profileName?). UXER_ERD_DIAGRAM 내부 메타테이블은 자동 제외 |
| GET | /schema | 전체 스키마 (테이블·뷰·FK) (query: profileName?). UXER_ERD_DIAGRAM 내부 메타테이블 자동 제외 |
| GET | /schema/comments | 테이블·컬럼 코멘트 (에이전트 apply_db_comments 용) |
| POST | /agent/stream | 자연어 질의 → 그래프 실행 SSE (meta·token·interrupt·done·error) — Python 프록시 전용 |
| POST | /agent/resume | interrupt 결과 회신 → 그래프 재개 SSE (툴 실행 위임 루프) |
| GET | /agent/key | OpenAI 키 설정 여부 |
| POST | /agent/key | OpenAI 키 저장 (AES-256-GCM 암호화) |
| GET | /agent/config | Agent 설정 조회 (provider/modelMain/modelFast/baseUrl/keyConfigured) |
| POST | /agent/config | Agent 설정 저장 (provider/modelMain/modelFast/baseUrl) — baseUrl 설정 시 자체 서빙 등 OpenAI 호환 엔드포인트로 동작 |
| POST | /agent/test | 연결 테스트 — 입력(또는 저장) 설정(baseUrl/modelMain/apiKey)으로 최소 호출을 보내 검증. 성공 {ok:true, model, baseUrl} / 실패 {ok:false, detail} |
| POST | /agent/diagnose | 모델 호환성 검사 — 4단계 배터리(① content 채널 ② tool_calls ③ 구조화 출력 ④ 툴 인자 정확도)를 실제 실행해 에이전트 적합성 판정. {model, baseUrl, stages:[{key,label,ok,detail}], verdict:'ok\|limited\|unfit', summary} 반환 |
| POST | /agent/v2/stream | v2 자연어 질의 → 그래프 실행 SSE (analyze→4분기→plan SSE 포함, 독립 인스턴스) |
| POST | /agent/v2/resume | v2 interrupt 결과 회신 → 그래프 재개 SSE |
| GET | /agent/v2/key | v2 OpenAI 키 설정 여부 확인 (공유 키스토어) |
| POST | /agent/v2/key | v2 OpenAI 키 저장 (공유 키스토어) |
| GET | /agent/v2/config | v2 Agent 설정 조회 (공유 키스토어) |
| POST | /agent/v2/config | v2 Agent 설정 저장 (공유 키스토어) |
| POST | /agent/v2/eval | v2 검증 오라클 — 픽스처 일괄 채점(analyze→plan dry-run, 실행 없음) → 스코어카드. body: path·reps·split(all/golden/holdout) |
| POST | /agent/v3/stream | v3(ReAct 하이브리드) 자연어 질의 → 그래프 실행 SSE (intent·thought·observation·verdict·token·interrupt 포함, 독립 인스턴스). react⇄act⇄observe 루프. interrupt type: tool_calls(클라 툴)·plan_approval(승인)·clarify(의도불명·정보부족 시 사용자 되묻기 {question,options}) |
| POST | /agent/v3/resume | v3 interrupt 결과 회신 → 그래프 재개 SSE (clarify는 {text}로 답을 회신) |
| GET | /agent/v3/key | v3 OpenAI 키 설정 여부 확인 (공유 키스토어) |
| POST | /agent/v3/key | v3 OpenAI 키 저장 (공유 키스토어) |
| GET | /agent/v3/config | v3 Agent 설정 조회 (공유 키스토어) |
| POST | /agent/v3/config | v3 Agent 설정 저장 (공유 키스토어) |
| GET | /stddict/status | 표준사전 초기화 여부 + 테이블별 건수 |
| GET | /stddict/list | 표준사전 검색 결과 행 + 총건수 (table·q·onlyApproved·limit·offset) |
| GET | /stddict/index | 자동완성용 경량 인덱스 — 한 테이블의 (name, abbr) 전체 (프론트가 1회 로드해 클라이언트 필터) |
| POST | /stddict/row | 표준사전 행 삽입 (감사 컬럼 자동 세팅) |
| PUT | /stddict/row/:id | 표준사전 행 수정 (upd_* 자동, reg_* 보존) |
| DELETE | /stddict/row/:id | 표준사전 행 삭제 (table 쿼리) |
| POST | /stddict/import-excel | 엑셀(.xlsx) 업로드 → 3시트 파싱 후 전체 재구성 |
| POST | /stddict/restore | sqlite 업로드 → 작업본 전체 교체 (시드 초기화·복원) |
| GET | /stddict/export | 표준사전 작업본 sqlite 다운로드 |
| GET | /workspace | PC앱 워크스페이스(모든 다이어그램+스냅샷) 조회 |
| PUT | /workspace | PC앱 워크스페이스 저장 (단일 파일 `aerm_workspace.json`) |
| POST | /export/table-spec | ERD 테이블 목록(JSON) → 엑셀 테이블 정의서(.xlsx) 생성·반환 (openpyxl, 목차+테이블정의서 2시트). 에이전트 export_table_spec_xlsx 툴이 호출 |
| POST | /export/data-dictionary | ERD 전 컬럼(JSON) → 엑셀 데이터 사전(.xlsx) 생성·반환 (openpyxl, 평면 컬럼 목록). 에이전트 export_data_dictionary_xlsx 툴이 호출 |
| POST | /erd-store/init | 연결 DB에 UXER_ERD_DIAGRAM 테이블 멱등 생성 (query: profileName?) |
| GET | /erd-store/list | 저장된 다이어그램 목록 조회 (payload 제외, 최신순) (query: profileName?) |
| GET | /erd-store/:diagramId | 단건 다이어그램 조회 (payload 포함) (query: profileName?) |
| PUT | /erd-store/:diagramId | 다이어그램 저장 — expectedVersion=0이면 INSERT, >0이면 UPDATE+낙관적 잠금(충돌 시 409) (body: name, payload, expectedVersion, updatedBy?, profileName?) |
| DELETE | /erd-store/:diagramId | 다이어그램 삭제 (없으면 404) (query: profileName?) |

> `/agent/*` 는 자연어 ERD 제어(LangGraph 기반) 엔드포인트로 **Python 프록시 전용**이다(Node.js 미들웨어에는 없음).
> `langgraph` · `langchain-openai` · `langchain-core` 의존성이 필요하며 `requirements.txt`에 포함된다.
> OpenAI 키는 DB 비밀번호와 동일한 마스터 키로 암호화되어 `~/.uxermanager/config.json` 의 `aiKey` 필드에 저장된다.
> **자체 서빙 모델(LM Studio·vLLM·Ollama 등) 연결**은 `aiBaseUrl`(설정 > Agent 설정의 Base URL)로 OpenAI 호환 엔드포인트를 지정한다. 연결·tool calling이 깨질 때(빈 응답·툴 미실행 등) 진단은 **`docs/로컬LLM_서빙_트러블슈팅.md`** 참고.

> `/stddict/*` 는 표준사전(word·domain·term)을 사이드카가 sqlite 로 직접 소유·CRUD하는 엔드포인트로 **Python 프록시 전용**이다(Electron 데스크탑 환경 전용). 엑셀 파싱에 `openpyxl` 의존성이 필요하며 `requirements.txt`에 포함된다.
> 데이터는 **시스템 DB `aerm_storage`**(`~/.uxermanager/aerm_storage.db`)의 테이블로 저장된다. 이 시스템 DB는 내부 sqlite 기능이 공유하는 고정 DB로, 접속정보가 하드코딩(`db/system_db.py`)되어 있으며 외부 DB 접속 프로파일(`/config/profiles`)에 노출되지 않는다. `restore`·`import-excel`은 시스템 DB의 다른 테이블을 보존한 채 표준사전 테이블만 교체한다.

> `/workspace` 는 PC앱(Electron) 전용으로, Ctrl+S 저장 시 모든 다이어그램 + 스냅샷을 단일 파일 `~/.uxermanager/aerm_workspace.json`에 저장하고 앱 시작 시 복원한다. 웹(github.io)에서는 사용하지 않고 기존 localStorage 방식을 유지한다.

---

## 파일 구조

```
proxy/python/
├── main.py                ← FastAPI 앱 진입점 (포트 3737)
├── _version.py            ← 빌드 시 build.ps1 이 생성(.gitignore) — /ping 버전 원천(electron/package.json 파생)
├── requirements.txt       ← 의존성 목록
├── build.ps1              ← PyInstaller 빌드 스크립트 (_version.py 생성 → onefile exe)
├── routers/
│   ├── config.py          ← /config 라우터 (프로파일 CRUD)
│   ├── execute.py         ← /execute, /execute/stream 라우터
│   ├── health.py          ← /health 라우터
│   ├── schema.py          ← /schema 라우터
│   ├── agent.py           ← /agent/stream, /agent/key 라우터 (자연어 ERD 제어)
│   ├── stddict.py         ← /stddict 라우터 (표준사전 sqlite 직접 CRUD·엑셀 import)
│   ├── workspace.py       ← /workspace 라우터 (PC앱 워크스페이스 단일 파일 저장/복원)
│   ├── export.py          ← /export 라우터 (ERD → 엑셀 테이블 정의서 .xlsx, openpyxl)
│   ├── erd_store.py       ← /erd-store 라우터 (연결 DB에 ERD 다이어그램 저장·공유, 낙관적 잠금)
│   ├── v2/                ← v2 라우터 패키지 (agent v1 격리 미러)
│   │   └── agent.py       ← /agent/v2/stream·/resume·/key·/config·/eval 라우터
│   └── v3/                ← v3 라우터 패키지 (ReAct 하이브리드 격리 미러)
│       └── agent.py       ← /agent/v3/stream·/resume·/key·/config 라우터
├── agent/                 ← LangGraph 에이전트 패키지 (자연어 ERD 제어)
│   ├── graph.py           ← StateGraph (gate → answer | fetch_tools → plan → approve → exec_proxy → execute → replan → respond)
│   ├── db_docs.py         ← DB 유형별 SQL 문법·자료형 참고 문서 (정적, db_doc_* 툴이 반환)
│   ├── tools_proxy.py     ← 프록시(서버) 측 DB 툴 카탈로그·실행 (fetch_db_schema·run_sql, location="proxy")
│   ├── nodes/             ← gate · answer · fetch_tools(클라 툴 카탈로그) · plan · approve(계획 승인) · exec_proxy(서버 DB 툴) · execute(클라 interrupt) · replan · respond
│   ├── common/            ← state · schemas(Plan/Step) · prompts · llm · keys(OpenAI 키)
│   ├── v2/                ← v2 에이전트 서브패키지 (P0 골격 — analyze/plan 노드 독립 구현)
│   │   ├── graph.py       ← build_graph_v2() — AgentStateV2, analyze→4분기→fetch_tools→plan→approve→…
│   │   ├── common/        ← schemas(IntentSpec·Goal·StepV2·PlanV2·Verdict) · state(AgentStateV2) · prompts(ANALYZE_SYSTEM·PLAN_V2_SYSTEM)
│   │   ├── nodes/         ← analyze(v1 gate 대체, 4분기 route) · plan(plan_node_v2, StepV2 생성)
│   │   └── eval/          ← 검증 오라클(P1)+자동최적화 게이트(P3) — fixtures.jsonl(골든11+홀드아웃6) · scorer(§7.1 지표) · runner(analyze→plan dry-run) · gate(v1무손상·테스트자산 동결 검사) · README.md(구동법·픽스처 규칙·P3 자동최적화 런북)
│   └── v3/                ← v3 에이전트 서브패키지 (ReAct 하이브리드 — V3-M3, v1 노드 읽기 재사용)
│       ├── graph.py       ← build_graph() — prep→analyze→{answer|clarify⇄analyze|fetch_tools→react⇄{meta_exec|memory_exec|approve→exec|proxy_exec|client_exec|clarify}→verify→respond}
│       ├── common/        ← state(AgentState — v1 필드+scratchpad·loop_count·react_*·verify_count·clarify_count·auto_approve) · schemas(ReActStep·META_TOOL_CATALOG·MEMORY_TOOL_CATALOG·ASK_USER·V3Verdict·V3VerifyProbe·MAX_LOOP·MAX_VERIFY·MAX_CLARIFY) · prompts(REACT_SYSTEM·plan/reflect·VERIFY_SYSTEM·VERIFY_PROBE_SYSTEM·render_scratchpad) · memory(영구 메모리 md R/W — ~/.uxermanager/agent_v3_memory.md, mtime 자동 재로드)
│       └── nodes/         ← prep(턴 리셋+자동승인 감지) · analyze(격리복제+[메모리]) · answer(격리복제+[메모리]) · react(추론+라우팅) · meta(plan/reflect 메타툴) · memory_exec(remember/recall/forget) · act(proxy_exec·client_exec) · approve(쓰기/위험 승인) · verify(준수 검증+확인 probe) · clarify(되묻기 interrupt) · respond(격리복제+[메모리])
├── db/
│   ├── connector.py       ← dbType → 어댑터 라우팅 (외부 DB) · sql_dialect(supabase→postgres 방언 정규화)
│   ├── system_db.py       ← 내부 시스템 DB(aerm_storage) 고정 접속·레거시 정리 — 프로파일 미노출
│   └── adapters/
│       ├── postgres.py    ← asyncpg 어댑터 (선택 연결옵션 ssl·statementCacheSize)
│       ├── mysql.py       ← aiomysql 어댑터
│       ├── mssql.py       ← pyodbc 어댑터
│       ├── oracle.py      ← oracledb 어댑터
│       └── supabase.py    ← Supabase 어댑터 (TLS·준비문캐시off 주입 후 postgres 위임, 연결오류 안내)
└── utils/
    ├── crypto.py          ← AES-256-GCM 암호화 (Node.js 미들웨어와 호환)
    ├── keystore.py        ← ~/.uxermanager/key 관리
    └── audit_logger.py    ← SQL 감사 로그 (10MB 롤오버)
```

---

## 접속정보 저장 위치

Node.js 미들웨어와 동일한 경로를 사용합니다.

| OS | 경로 |
|----|------|
| Windows | `C:\Users\{username}\.uxermanager\config.json` |
| macOS | `/Users/{username}/.uxermanager/config.json` |
| Linux | `/home/{username}/.uxermanager/config.json` |

비밀번호는 AES-256-GCM으로 암호화 저장되며, 암호화 키는 `~/.uxermanager/key`에 자동 생성됩니다.

내부 시스템 DB는 `~/.uxermanager/aerm_storage.db`(db name: `aerm_storage`)에 저장됩니다. 표준사전 등 시스템 내부에서 sqlite 를 쓰는 기능이 이 단일 DB를 공유하며, 접속정보는 `db/system_db.py`에 고정되어 외부 DB 접속 프로파일에 노출되지 않습니다. 표준사전은 최초 사용·시드 복원 시 프론트가 `vendor/std.sqlite`(시드) bytes를 `/stddict/restore`로 전송해 초기화합니다.

PC앱(Electron) 워크스페이스는 `~/.uxermanager/aerm_workspace.json` 단일 파일에 저장됩니다. Ctrl+S 저장 시 모든 다이어그램 + 스냅샷이 이 파일에 기록되고, 앱 시작 시 복원됩니다(웹은 localStorage 유지).
