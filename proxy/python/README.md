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

---

## 지원 DB

| DB | 드라이버 | 비고 |
|----|---------|------|
| PostgreSQL | asyncpg | 비동기 |
| MySQL | aiomysql | 비동기 |
| SQL Server | pyodbc | 동기 (run_in_executor 래핑) |
| Oracle | oracledb | 동기 (run_in_executor 래핑) |

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
| POST | /execute | SQL 실행 |
| POST | /execute/stream | SQL SSE 스트림 |
| GET | /schema/tables | 테이블·뷰 목록 |
| GET | /schema | 전체 스키마 (테이블·뷰·FK) |
| POST | /agent/stream | 자연어 질의 → 그래프 실행 SSE (meta·token·interrupt·done·error) — Python 프록시 전용 |
| POST | /agent/resume | interrupt 결과 회신 → 그래프 재개 SSE (툴 실행 위임 루프) |
| GET | /agent/key | OpenAI 키 설정 여부 |
| POST | /agent/key | OpenAI 키 저장 (AES-256-GCM 암호화) |
| GET | /agent/config | Agent 설정 조회 (provider/modelMain/modelFast/keyConfigured) |
| POST | /agent/config | Agent 설정 저장 (provider/modelMain/modelFast) |
| POST | /agent/v2/stream | v2 자연어 질의 → 그래프 실행 SSE (analyze→4분기→plan SSE 포함, 독립 인스턴스) |
| POST | /agent/v2/resume | v2 interrupt 결과 회신 → 그래프 재개 SSE |
| GET | /agent/v2/key | v2 OpenAI 키 설정 여부 확인 (공유 키스토어) |
| POST | /agent/v2/key | v2 OpenAI 키 저장 (공유 키스토어) |
| GET | /agent/v2/config | v2 Agent 설정 조회 (공유 키스토어) |
| POST | /agent/v2/config | v2 Agent 설정 저장 (공유 키스토어) |
| POST | /agent/v2/eval | v2 검증 오라클 — 픽스처 일괄 채점(analyze→plan dry-run, 실행 없음) → 스코어카드. body: path·reps·split(all/golden/holdout) |
| POST | /agent/v3/stream | v3(ReAct 하이브리드) 자연어 질의 → 그래프 실행 SSE (intent·thought·observation·token·interrupt 포함, 독립 인스턴스). react⇄act⇄observe 루프 |
| POST | /agent/v3/resume | v3 interrupt 결과 회신 → 그래프 재개 SSE |
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

> `/agent/*` 는 자연어 ERD 제어(LangGraph 기반) 엔드포인트로 **Python 프록시 전용**이다(Node.js 미들웨어에는 없음).
> `langgraph` · `langchain-openai` · `langchain-core` 의존성이 필요하며 `requirements.txt`에 포함된다.
> OpenAI 키는 DB 비밀번호와 동일한 마스터 키로 암호화되어 `~/.uxermanager/config.json` 의 `aiKey` 필드에 저장된다.

> `/stddict/*` 는 표준사전(word·domain·term)을 사이드카가 sqlite 로 직접 소유·CRUD하는 엔드포인트로 **Python 프록시 전용**이다(Electron 데스크탑 환경 전용). 엑셀 파싱에 `openpyxl` 의존성이 필요하며 `requirements.txt`에 포함된다.
> 데이터는 **시스템 DB `aerm_storage`**(`~/.uxermanager/aerm_storage.db`)의 테이블로 저장된다. 이 시스템 DB는 내부 sqlite 기능이 공유하는 고정 DB로, 접속정보가 하드코딩(`db/system_db.py`)되어 있으며 외부 DB 접속 프로파일(`/config/profiles`)에 노출되지 않는다. `restore`·`import-excel`은 시스템 DB의 다른 테이블을 보존한 채 표준사전 테이블만 교체한다.

> `/workspace` 는 PC앱(Electron) 전용으로, Ctrl+S 저장 시 모든 다이어그램 + 스냅샷을 단일 파일 `~/.uxermanager/aerm_workspace.json`에 저장하고 앱 시작 시 복원한다. 웹(github.io)에서는 사용하지 않고 기존 localStorage 방식을 유지한다.

---

## 파일 구조

```
proxy/python/
├── main.py                ← FastAPI 앱 진입점 (포트 3737)
├── requirements.txt       ← 의존성 목록
├── build.ps1              ← PyInstaller 빌드 스크립트
├── routers/
│   ├── config.py          ← /config 라우터 (프로파일 CRUD)
│   ├── execute.py         ← /execute, /execute/stream 라우터
│   ├── health.py          ← /health 라우터
│   ├── schema.py          ← /schema 라우터
│   ├── agent.py           ← /agent/stream, /agent/key 라우터 (자연어 ERD 제어)
│   ├── stddict.py         ← /stddict 라우터 (표준사전 sqlite 직접 CRUD·엑셀 import)
│   ├── workspace.py       ← /workspace 라우터 (PC앱 워크스페이스 단일 파일 저장/복원)
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
│   └── v3/                ← v3 에이전트 서브패키지 (ReAct 하이브리드 — V3-M2, v1 노드 읽기 재사용)
│       ├── graph.py       ← build_graph() — prep→analyze→fetch_tools→react⇄{meta_exec|proxy_exec|client_exec}→respond
│       ├── common/        ← state(AgentState — v1 필드+scratchpad·loop_count·react_*) · schemas(ReActStep·META_TOOL_CATALOG·MAX_LOOP) · prompts(REACT_SYSTEM·plan/reflect·render_scratchpad)
│       └── nodes/         ← prep(턴 리셋) · react(추론+라우팅) · meta(plan/reflect 메타툴) · act(proxy_exec·client_exec)
├── db/
│   ├── connector.py       ← dbType → 어댑터 라우팅 (외부 DB)
│   ├── system_db.py       ← 내부 시스템 DB(aerm_storage) 고정 접속·레거시 정리 — 프로파일 미노출
│   └── adapters/
│       ├── postgres.py    ← asyncpg 어댑터
│       ├── mysql.py       ← aiomysql 어댑터
│       ├── mssql.py       ← pyodbc 어댑터
│       └── oracle.py      ← oracledb 어댑터
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
