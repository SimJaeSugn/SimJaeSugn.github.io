import argparse
import logging
import os
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import agent, config, execute, export, health, schema, stddict, workspace

# PyInstaller --noconsole(windowed) 빌드 또는 stdout 미연결 환경에서는
# sys.stdout/stderr 가 None 이라, uvicorn 기본 로깅 포매터의 stdout.isatty()
# 호출이 죽는다(AttributeError → Unable to configure formatter). 더미 스트림으로 대체.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

ALLOWED_ORIGINS = [
    "https://simjaesugn.github.io",
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "null",
]

# --port 인자를 __main__ 블록 외부에서 파싱한다.
# PyInstaller로 패키징된 exe도 sys.argv를 통해 인자를 받으므로
# __name__ 값에 관계없이 동작한다.
_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--port", type=int, default=3737)
_known, _ = _parser.parse_known_args()
PORT = _known.port

app = FastAPI(title="UXERManager Python Sidecar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(config.router, prefix="/config")
app.include_router(execute.router, prefix="/execute")
app.include_router(health.router, prefix="/health")
app.include_router(schema.router, prefix="/schema")
app.include_router(agent.router, prefix="/agent")
app.include_router(stddict.router, prefix="/stddict")
app.include_router(workspace.router, prefix="/workspace")
app.include_router(export.router, prefix="/export")

# ── Agent v2 (병렬·격리) — try/except 가드. v2가 깨져도 앱·v1 정상 기동(§9.1 불변식 ②) ──
try:
    from routers.v2 import agent as agent_v2
    app.include_router(agent_v2.router, prefix="/agent/v2")
except Exception as e:  # import 실패·반쪽 삭제 등
    logging.warning("v2 agent router disabled: %s", e)

# ── Agent v3 (병렬·격리, ReAct 하이브리드 실험 레인) — try/except 가드.
#    v3가 깨져도 앱·v1·v2 정상 기동(§9.1 불변식 ② 진화형) ──
try:
    from routers.v3 import agent as agent_v3
    app.include_router(agent_v3.router, prefix="/agent/v3")
except Exception as e:  # import 실패·반쪽 삭제 등
    logging.warning("v3 agent router disabled: %s", e)

@app.get("/ping")
def ping():
    return {"ok": True, "version": "1.0.0", "port": PORT}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
