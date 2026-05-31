import time
from fastapi import APIRouter
from db.connector import get_adapter
from routers.config import load_config

router = APIRouter()


@router.get("")
@router.get("/")
async def health():
    config = load_config()
    if not config:
        return {"ok": False, "db": {"connected": False, "error": "접속정보 없음"}}
    try:
        adapter = get_adapter(config["dbType"])
        start = time.time()
        await adapter.test(config)
        latency_ms = int((time.time() - start) * 1000)
        return {"ok": True, "db": {"connected": True, "latencyMs": latency_ms}}
    except Exception as e:
        return {"ok": False, "db": {"connected": False, "error": str(e)}}
