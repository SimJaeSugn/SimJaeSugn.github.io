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

> `/agent/*` 는 자연어 ERD 제어(LangGraph 기반) 엔드포인트로 **Python 프록시 전용**이다(Node.js 미들웨어에는 없음).
> `langgraph` · `langchain-openai` · `langchain-core` 의존성이 필요하며 `requirements.txt`에 포함된다.
> OpenAI 키는 DB 비밀번호와 동일한 마스터 키로 암호화되어 `~/.uxermanager/config.json` 의 `aiKey` 필드에 저장된다.

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
│   └── agent.py           ← /agent/stream, /agent/key 라우터 (자연어 ERD 제어)
├── agent/                 ← LangGraph 에이전트 패키지 (자연어 ERD 제어)
│   ├── graph.py           ← StateGraph (gate → answer | plan → approve → execute → replan → respond)
│   ├── nodes/             ← gate · answer · plan · approve(계획 승인) · execute(interrupt) · replan · respond
│   └── common/            ← state · schemas(Plan/Step) · prompts · llm · keys(OpenAI 키)
├── db/
│   ├── connector.py       ← dbType → 어댑터 라우팅
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
