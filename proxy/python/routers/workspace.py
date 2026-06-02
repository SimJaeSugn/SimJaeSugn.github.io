# routers/workspace.py
# PC앱(Electron) 전용 워크스페이스 영속화 — 모든 다이어그램 + 스냅샷을
# ~/.uxermanager/aerm_workspace.json 단일 파일로 저장/복원한다.
# (웹 환경은 사용하지 않으며 기존 localStorage 방식 유지)
import json

from fastapi import APIRouter, Body, HTTPException

from db.system_db import DATA_DIR

router = APIRouter()

WORKSPACE_FILE = DATA_DIR / "aerm_workspace.json"


# ── GET /workspace ───────────────────────────────────────────────────────────
@router.get("")
@router.get("/")
def get_workspace():
    if not WORKSPACE_FILE.exists():
        return {"exists": False}
    try:
        data = json.loads(WORKSPACE_FILE.read_text(encoding="utf-8"))
        return {"exists": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"워크스페이스 읽기 실패: {e}")


# ── PUT /workspace ───────────────────────────────────────────────────────────
@router.put("")
@router.put("/")
def save_workspace(payload: dict = Body(...)):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        # 원자적 쓰기: 임시 파일에 쓴 뒤 교체 (저장 중 중단 시 원본 보존)
        tmp = WORKSPACE_FILE.with_name(WORKSPACE_FILE.name + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(WORKSPACE_FILE)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"워크스페이스 저장 실패: {e}")
