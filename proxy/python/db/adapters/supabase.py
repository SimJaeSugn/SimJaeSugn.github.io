"""Supabase 어댑터 — PostgreSQL 프로토콜 위의 Supabase 전용 연결 처리.

Supabase 는 PostgreSQL 이므로 SQL 방언·스키마 조회는 postgres 와 동일하다
(`db.connector.sql_dialect` 가 supabase → postgres 로 정규화).
다른 것은 **연결 조건**뿐이라 이 어댑터는 postgres 어댑터에 다음을 주입해 위임한다.

  1. TLS 필수      — Supabase 는 평문 연결을 받지 않는다 (ssl="require").
  2. 준비문 캐시 끔 — 트랜잭션 풀러(포트 6543, PgBouncer)는 prepared statement 를
                     지원하지 않아 asyncpg 기본 캐시가 켜져 있으면 실패한다.
                     세션 풀러·직접 연결에서도 동작에는 영향이 없어 항상 끈다.
  3. 기본값 보정    — port 5432, database/username 미입력 시 'postgres'.

연결 실패 시에는 Supabase 특유의 원인(IPv6 전용 직접 연결·풀러 사용자명 형식)을
안내 문구로 덧붙인다.
"""

from db.adapters import postgres

DEFAULT_PORT = 5432
DEFAULT_DATABASE = "postgres"
DEFAULT_USERNAME = "postgres"


def _sb_config(config: dict) -> dict:
    """Supabase 접속에 필요한 연결 옵션을 채운 config 사본을 반환한다."""
    cfg = dict(config)
    cfg["port"] = cfg.get("port") or DEFAULT_PORT
    cfg["database"] = cfg.get("database") or DEFAULT_DATABASE
    cfg["username"] = cfg.get("username") or DEFAULT_USERNAME
    # postgres 어댑터가 asyncpg 로 그대로 넘기는 연결 옵션
    cfg["ssl"] = cfg.get("ssl") or "require"
    cfg["statementCacheSize"] = 0
    return cfg


def _hint(err: Exception, config: dict) -> str:
    """Supabase 연결 실패 시 흔한 원인을 안내 문구로 덧붙인다."""
    msg = str(err)
    host = str(config.get("host") or "")
    user = str(config.get("username") or "")
    hints = []
    low = msg.lower()
    net_fail = any(k in low for k in (
        "network is unreachable", "connect call failed", "timeout", "timed out",
        "getaddrinfo", "name or service not known", "no route to host", "refused",
    ))
    if net_fail and host.startswith("db.") and host.endswith(".supabase.co"):
        hints.append(
            "직접 연결(db.<ref>.supabase.co)은 IPv6 전용입니다. IPv4 환경이면 "
            "Supabase 대시보드의 Connection Pooler 호스트"
            "(aws-…-<region>.pooler.supabase.com, 세션 5432 / 트랜잭션 6543)를 사용하세요."
        )
    if "password authentication failed" in low or "invalid" in low and "password" in low:
        if ".pooler.supabase.com" in host and "." not in user:
            hints.append(
                "풀러 접속의 사용자명은 'postgres.<project-ref>' 형식이어야 합니다."
            )
        else:
            hints.append("비밀번호는 프로젝트 생성 시 지정한 데이터베이스 비밀번호입니다.")
    if not hints:
        return msg
    return msg + " — " + " ".join(hints)


def _reraise(e: Exception, cfg: dict):
    hinted = _hint(e, cfg)
    if hinted == str(e):
        raise e
    raise RuntimeError(hinted) from e


async def execute(config: dict, sql: str) -> dict:
    cfg = _sb_config(config)
    try:
        return await postgres.execute(cfg, sql)
    except Exception as e:
        _reraise(e, cfg)


async def execute_params(config: dict, sql: str, params: list) -> dict:
    cfg = _sb_config(config)
    try:
        return await postgres.execute_params(cfg, sql, params)
    except Exception as e:
        _reraise(e, cfg)


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool(key: str = None) -> None:
    # 풀은 postgres 어댑터가 소유한다(같은 asyncpg 풀 맵). 여기선 위임만.
    await postgres.close_pool(key)
