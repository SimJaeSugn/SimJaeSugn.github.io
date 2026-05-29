import argparse
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import config, execute, health, schema

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

@app.get("/ping")
def ping():
    return {"ok": True, "version": "1.0.0", "port": PORT}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
