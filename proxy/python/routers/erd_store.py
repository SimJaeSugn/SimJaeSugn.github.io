from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from db.connector import get_adapter
from routers.config import load_config

router = APIRouter()


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _now_expr(db_type: str) -> str:
    """DB타입별 현재시각 SQL 표현식 (인라인 사용, 바인딩 불필요)."""
    if db_type == "mssql":
        return "GETUTCDATE()"
    if db_type == "oracle":
        return "SYSTIMESTAMP"
    return "NOW()"


def _ph(db_type: str, n: int) -> str:
    """DB타입별 n번째(1-based) 파라미터 플레이스홀더."""
    if db_type == "postgres":
        return f"${n}"
    if db_type == "mysql":
        return "%s"
    if db_type == "mssql":
        return "?"
    if db_type == "oracle":
        return f":{n}"
    return "?"


def _init_ddl(db_type: str) -> str:
    """DB타입별 UXER_ERD_DIAGRAM 멱등 생성 DDL."""
    if db_type == "postgres":
        return """CREATE TABLE IF NOT EXISTS UXER_ERD_DIAGRAM (
  diagram_id  VARCHAR(64)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  payload     TEXT         NOT NULL,
  version     INTEGER      NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(128),
  CONSTRAINT pk_uxer_erd_diagram PRIMARY KEY (diagram_id)
)"""
    if db_type == "mysql":
        return """CREATE TABLE IF NOT EXISTS UXER_ERD_DIAGRAM (
  diagram_id  VARCHAR(64)   NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  payload     LONGTEXT       NOT NULL,
  version     INT            NOT NULL DEFAULT 1,
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                             ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by  VARCHAR(128),
  PRIMARY KEY (diagram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""
    if db_type == "mssql":
        return """IF OBJECT_ID(N'UXER_ERD_DIAGRAM', N'U') IS NULL
  CREATE TABLE UXER_ERD_DIAGRAM (
    diagram_id  VARCHAR(64)    NOT NULL,
    name        NVARCHAR(255)  NOT NULL,
    payload     NVARCHAR(MAX)   NOT NULL,
    version     INT             NOT NULL DEFAULT 1,
    updated_at  DATETIME2(3)    NOT NULL DEFAULT GETUTCDATE(),
    updated_by  NVARCHAR(128),
    CONSTRAINT pk_uxer_erd_diagram PRIMARY KEY (diagram_id)
  )"""
    if db_type == "oracle":
        return """DECLARE
  v_cnt NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_cnt
    FROM user_tables WHERE table_name = 'UXER_ERD_DIAGRAM';
  IF v_cnt = 0 THEN
    EXECUTE IMMEDIATE 'CREATE TABLE UXER_ERD_DIAGRAM (
      diagram_id  VARCHAR2(64)   NOT NULL,
      name        VARCHAR2(255)  NOT NULL,
      payload     CLOB           NOT NULL,
      version     NUMBER(10,0)   DEFAULT 1 NOT NULL,
      updated_at  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
      updated_by  VARCHAR2(128),
      CONSTRAINT pk_uxer_erd_diagram PRIMARY KEY (diagram_id)
    )';
  END IF;
END;"""
    raise ValueError(f"지원하지 않는 DB 타입: {db_type}")


async def _get_ctx(profile_name: Optional[str]):
    """profileName으로 config+adapter를 로드. 없으면 400."""
    config = load_config(profile_name=profile_name)
    if not config:
        msg = (f"프로파일 '{profile_name}'을 찾을 수 없습니다."
               if profile_name else "접속정보가 설정되지 않았습니다.")
        raise HTTPException(status_code=400, detail=msg)
    adapter = get_adapter(config["dbType"])
    return config, adapter


def _norm_row(row: dict) -> dict:
    """행 키 소문자화 + 값 변환. 숫자(version 등)는 타입 보존, 그 외(날짜 등)는 직렬화 위해 문자열화."""
    return {
        k.lower(): (None if v is None
                    else (v if isinstance(v, (int, float, bool)) else str(v)))
        for k, v in row.items()
    }


# ── POST /erd-store/init ──────────────────────────────────────────────────────

@router.post("/init")
async def erd_store_init(profileName: Optional[str] = None):
    """UXER_ERD_DIAGRAM 테이블 멱등 생성. DDL은 바인딩 불필요."""
    config, adapter = await _get_ctx(profileName)
    ddl = _init_ddl(config["dbType"])
    try:
        await adapter.execute(config, ddl)
        return {"ok": True, "message": "UXER_ERD_DIAGRAM 테이블이 준비됐습니다."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── GET /erd-store/list ───────────────────────────────────────────────────────

@router.get("/list")
async def erd_store_list(profileName: Optional[str] = None):
    """다이어그램 목록 조회 (payload 제외, 최신순)."""
    config, adapter = await _get_ctx(profileName)
    sql = ("SELECT diagram_id, name, version, updated_at, updated_by "
           "FROM UXER_ERD_DIAGRAM ORDER BY updated_at DESC")
    try:
        result = await adapter.execute(config, sql)
        items = [_norm_row(row) for row in (result.get("rows") or [])]
        return {"ok": True, "items": items}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── GET /erd-store/{diagramId} ───────────────────────────────────────────────

@router.get("/{diagramId}")
async def erd_store_get(diagramId: str, profileName: Optional[str] = None):
    """단건 다이어그램 조회 (payload 포함)."""
    config, adapter = await _get_ctx(profileName)
    db_type = config["dbType"]
    p1 = _ph(db_type, 1)
    sql = f"SELECT * FROM UXER_ERD_DIAGRAM WHERE diagram_id = {p1}"
    try:
        result = await adapter.execute_params(config, sql, [diagramId])
        rows = result.get("rows") or []
        if not rows:
            raise HTTPException(status_code=404,
                                detail=f"다이어그램 '{diagramId}'를 찾을 수 없습니다.")
        return {"ok": True, **_norm_row(rows[0])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── PUT /erd-store/{diagramId} ───────────────────────────────────────────────

class ErdPutBody(BaseModel):
    name: str
    payload: str               # JSON 직렬화 문자열
    expectedVersion: int = 0   # 0 = 신규 INSERT, >0 = UPDATE + 낙관적 잠금
    updatedBy: Optional[str] = None
    profileName: Optional[str] = None


@router.put("/{diagramId}")
async def erd_store_put(diagramId: str, body: ErdPutBody):
    """다이어그램 저장. expectedVersion=0이면 INSERT, >0이면 UPDATE(낙관적 잠금 — 충돌 시 409)."""
    config, adapter = await _get_ctx(body.profileName)
    db_type = config["dbType"]
    now_expr = _now_expr(db_type)

    if body.expectedVersion == 0:
        # ── INSERT ──
        p = lambda n: _ph(db_type, n)
        sql = (
            f"INSERT INTO UXER_ERD_DIAGRAM"
            f" (diagram_id, name, payload, version, updated_at, updated_by)"
            f" VALUES ({p(1)}, {p(2)}, {p(3)}, 1, {now_expr}, {p(4)})"
        )
        try:
            await adapter.execute_params(
                config, sql,
                [diagramId, body.name, body.payload, body.updatedBy]
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"ok": True, "version": 1}

    else:
        # ── UPDATE + 낙관적 잠금 ──
        p = lambda n: _ph(db_type, n)
        sql = (
            f"UPDATE UXER_ERD_DIAGRAM SET"
            f" name={p(1)}, payload={p(2)},"
            f" version=version+1, updated_at={now_expr}, updated_by={p(3)}"
            f" WHERE diagram_id={p(4)} AND version={p(5)}"
        )
        try:
            result = await adapter.execute_params(
                config, sql,
                [body.name, body.payload, body.updatedBy, diagramId, body.expectedVersion]
            )
            rc = result.get("rowCount", 0)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        if rc == 0:
            return JSONResponse(
                status_code=409,
                content={
                    "ok": False,
                    "reason": "conflict",
                    "message": "다른 사용자가 수정했습니다. 최신 버전을 다시 로드하세요.",
                },
            )
        return {"ok": True, "version": body.expectedVersion + 1}


# ── DELETE /erd-store/{diagramId} ────────────────────────────────────────────

@router.delete("/{diagramId}")
async def erd_store_delete(diagramId: str, profileName: Optional[str] = None):
    """다이어그램 삭제. 없으면 404."""
    config, adapter = await _get_ctx(profileName)
    db_type = config["dbType"]
    p1 = _ph(db_type, 1)
    sql = f"DELETE FROM UXER_ERD_DIAGRAM WHERE diagram_id = {p1}"
    try:
        result = await adapter.execute_params(config, sql, [diagramId])
        rc = result.get("rowCount", 0)
        if rc == 0:
            raise HTTPException(status_code=404,
                                detail=f"다이어그램 '{diagramId}'를 찾을 수 없습니다.")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
