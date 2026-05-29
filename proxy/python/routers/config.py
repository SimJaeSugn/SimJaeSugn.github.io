import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db.connector import close_all_pools
from utils.crypto import encrypt, decrypt, decrypt_legacy

router = APIRouter()

CONFIG_DIR = Path.home() / ".uxermanager"
CONFIG_FILE = CONFIG_DIR / "config.json"

_store_cache = None
_active_config_cache = None

DEFAULT_PORTS = {"postgres": 5432, "mysql": 3306, "mssql": 1433, "oracle": 1521}


def _get_default_port(db_type: str) -> Optional[int]:
    return DEFAULT_PORTS.get(db_type)


def _invalidate_cache():
    global _store_cache, _active_config_cache
    _store_cache = None
    _active_config_cache = None


def _load_raw_store() -> Optional[dict]:
    global _store_cache
    if _store_cache:
        return _store_cache
    if not CONFIG_FILE.exists():
        return None
    raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    if "profiles" not in raw:
        migrated = {"profiles": [{"name": "기본", **raw}], "active": "기본"}
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(migrated, ensure_ascii=False, indent=2), encoding="utf-8")
        _store_cache = migrated
        return migrated
    _store_cache = raw
    return raw


def _save_store(store: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    _invalidate_cache()


def load_config() -> Optional[dict]:
    global _active_config_cache
    if _active_config_cache:
        return _active_config_cache
    store = _load_raw_store()
    if not store:
        return None
    profile = next((p for p in store["profiles"] if p["name"] == store["active"]), None)
    if not profile:
        return None
    if not profile.get("password"):
        _active_config_cache = dict(profile)
        return _active_config_cache
    password = None
    try:
        password = decrypt(profile["password"])
    except Exception:
        try:
            password = decrypt_legacy(profile["password"])
            idx = next((i for i, p in enumerate(store["profiles"]) if p["name"] == store["active"]), -1)
            if idx != -1:
                store["profiles"][idx] = {
                    **store["profiles"][idx],
                    "password": encrypt(password),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
                _save_store(store)
        except Exception:
            return None
    _active_config_cache = {**profile, "password": password}
    return _active_config_cache


# ── GET /config ──────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
def get_config():
    config = load_config()
    if not config:
        return {"configured": False}
    return {
        "configured": True,
        "dbType": config.get("dbType"),
        "host": config.get("host"),
        "port": config.get("port"),
        "database": config.get("database"),
        "username": config.get("username"),
        "schema": config.get("schema", ""),
        "clientLibDir": config.get("clientLibDir", ""),
        "password": "••••••••",
    }


# ── POST /config ─────────────────────────────────────────────────────────────

class ConfigBody(BaseModel):
    model_config = {"populate_by_name": True}
    dbType: str
    host: str
    port: Optional[int] = None
    database: str
    username: str
    password: str
    schema_: Optional[str] = Field(None, alias="schema")
    clientLibDir: Optional[str] = None


@router.post("")
@router.post("/")
async def save_config(body: ConfigBody):
    store = _load_raw_store()
    if not store:
        store = {"profiles": [], "active": "기본"}
    active_name = store.get("active", "기본")
    idx = next((i for i, p in enumerate(store["profiles"]) if p["name"] == active_name), -1)
    updated = {
        "name": active_name,
        "dbType": body.dbType,
        "host": body.host,
        "port": body.port or _get_default_port(body.dbType),
        "database": body.database,
        "username": body.username,
        "password": encrypt(body.password),
        "schema": body.schema_ or "",
        "clientLibDir": (body.clientLibDir if body.dbType == "oracle" and body.clientLibDir else ""),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    if idx != -1:
        store["profiles"][idx] = updated
    else:
        store["profiles"].append(updated)
    _save_store(store)
    await close_all_pools()
    return {"ok": True, "message": "접속정보가 저장되었습니다."}


# ── POST /config/test ─────────────────────────────────────────────────────────

class TestBody(BaseModel):
    dbType: str
    host: str
    port: Optional[int] = None
    database: str
    username: str
    password: str
    clientLibDir: Optional[str] = None


@router.post("/test")
async def test_config(body: TestBody):
    from db.connector import get_adapter
    config_dict = {
        "dbType": body.dbType,
        "host": body.host,
        "port": body.port or _get_default_port(body.dbType),
        "database": body.database,
        "username": body.username,
        "password": body.password,
        "clientLibDir": (body.clientLibDir if body.dbType == "oracle" and body.clientLibDir else None),
    }
    try:
        adapter = get_adapter(body.dbType)
        await adapter.test(config_dict)
        return {"ok": True, "message": "연결 성공"}
    except Exception as e:
        raise HTTPException(status_code=400, detail={"ok": False, "error": str(e)})


# ── GET /config/profiles ──────────────────────────────────────────────────────

@router.get("/profiles")
def get_profiles():
    store = _load_raw_store()
    if not store:
        return {"active": None, "profiles": []}
    masked = [{**p, "password": "••••••••" if p.get("password") else ""} for p in store["profiles"]]
    return {"active": store.get("active"), "profiles": masked}


# ── POST /config/profiles ─────────────────────────────────────────────────────

class ProfileBody(BaseModel):
    model_config = {"populate_by_name": True}
    name: str
    dbType: str
    host: str
    port: Optional[int] = None
    database: str
    username: str
    password: str
    schema_: Optional[str] = Field(None, alias="schema")
    clientLibDir: Optional[str] = None


@router.post("/profiles")
def add_profile(body: ProfileBody):
    store = _load_raw_store()
    if not store:
        store = {"profiles": [], "active": body.name}
    if any(p["name"] == body.name for p in store["profiles"]):
        raise HTTPException(status_code=409, detail=f"'{body.name}' 이름의 프로파일이 이미 존재합니다.")
    store["profiles"].append({
        "name": body.name,
        "dbType": body.dbType,
        "host": body.host,
        "port": body.port or _get_default_port(body.dbType),
        "database": body.database,
        "username": body.username,
        "password": encrypt(body.password),
        "schema": body.schema_ or "",
        "clientLibDir": (body.clientLibDir if body.dbType == "oracle" and body.clientLibDir else ""),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    })
    _save_store(store)
    return {"ok": True, "message": f"프로파일 '{body.name}'이 추가되었습니다."}


# ── DELETE /config/profiles/{name} ───────────────────────────────────────────

@router.delete("/profiles/{name}")
def delete_profile(name: str):
    store = _load_raw_store()
    if not store:
        raise HTTPException(status_code=404, detail="프로파일이 없습니다.")
    if store.get("active") == name:
        raise HTTPException(status_code=400, detail="활성 프로파일은 삭제할 수 없습니다.")
    if len(store["profiles"]) <= 1:
        raise HTTPException(status_code=400, detail="마지막 프로파일은 삭제할 수 없습니다.")
    before = len(store["profiles"])
    store["profiles"] = [p for p in store["profiles"] if p["name"] != name]
    if len(store["profiles"]) == before:
        raise HTTPException(status_code=404, detail=f"'{name}' 프로파일을 찾을 수 없습니다.")
    _save_store(store)
    return {"ok": True, "message": f"프로파일 '{name}'이 삭제되었습니다."}


# ── PUT /config/profiles/{name} ──────────────────────────────────────────────

class ProfileUpdateBody(BaseModel):
    model_config = {"populate_by_name": True}
    dbType: str
    host: str
    port: Optional[int] = None
    database: str
    username: str
    password: Optional[str] = None
    schema_: Optional[str] = Field(None, alias="schema")
    clientLibDir: Optional[str] = None


@router.put("/profiles/{name}")
async def update_profile(name: str, body: ProfileUpdateBody):
    store = _load_raw_store()
    if not store:
        raise HTTPException(status_code=404, detail="프로파일이 없습니다.")
    idx = next((i for i, p in enumerate(store["profiles"]) if p["name"] == name), -1)
    if idx == -1:
        raise HTTPException(status_code=404, detail=f"'{name}' 프로파일을 찾을 수 없습니다.")
    existing = store["profiles"][idx]
    client_lib = existing.get("clientLibDir", "")
    if body.clientLibDir is not None:
        client_lib = body.clientLibDir if body.dbType == "oracle" and body.clientLibDir else ""
    updated = {
        **existing,
        "dbType": body.dbType,
        "host": body.host,
        "port": body.port or _get_default_port(body.dbType),
        "database": body.database,
        "username": body.username,
        "schema": body.schema_ if body.schema_ is not None else existing.get("schema", ""),
        "clientLibDir": client_lib,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    if body.password:
        updated["password"] = encrypt(body.password)
    store["profiles"][idx] = updated
    _save_store(store)
    if store.get("active") == name:
        await close_all_pools()
    return {"ok": True, "message": f"프로파일 '{name}'이 수정되었습니다."}


# ── POST /config/profiles/{name}/activate ────────────────────────────────────

@router.post("/profiles/{name}/activate")
async def activate_profile(name: str):
    store = _load_raw_store()
    if not store:
        raise HTTPException(status_code=404, detail="프로파일이 없습니다.")
    if not any(p["name"] == name for p in store["profiles"]):
        raise HTTPException(status_code=404, detail=f"'{name}' 프로파일을 찾을 수 없습니다.")
    store["active"] = name
    _save_store(store)
    await close_all_pools()
    return {"ok": True, "message": f"'{name}' 프로파일로 전환되었습니다."}
