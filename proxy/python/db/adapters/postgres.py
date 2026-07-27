import asyncio
import asyncpg

_pools: dict = {}  # config_key -> asyncpg.Pool


def _config_key(config: dict) -> str:
    # dbType 포함 — 같은 호스트라도 연결 옵션(예: supabase 의 TLS·준비문 캐시)이 다르면 풀을 분리한다.
    return (f"{config.get('dbType', 'postgres')}:{config['host']}:{config.get('port', 5432)}"
            f":{config['database']}:{config['username']}")


async def _get_pool(config: dict):
    key = _config_key(config)
    pool = _pools.get(key)
    if pool:
        return pool
    # 선택적 연결 옵션 — 미지정 시 기존 동작 그대로(asyncpg 기본값)
    kwargs = {}
    if config.get("ssl"):
        kwargs["ssl"] = config["ssl"]                       # 예: "require" (Supabase)
    if config.get("statementCacheSize") is not None:
        # 0 = 준비문 캐시 비활성 — PgBouncer 트랜잭션 풀링 호환 (Supabase 포트 6543)
        kwargs["statement_cache_size"] = int(config["statementCacheSize"])
    pool = await asyncpg.create_pool(
        host=config["host"],
        port=config.get("port", 5432),
        database=config["database"],
        user=config["username"],
        password=config["password"],
        min_size=1,
        max_size=10,
        command_timeout=30,
        **kwargs,
    )
    _pools[key] = pool
    return pool


async def execute(config: dict, sql: str) -> dict:
    pool = await _get_pool(config)
    async with pool.acquire() as conn:
        result = await conn.fetch(sql)
        rows = [dict(r) for r in result]
        fields = list(rows[0].keys()) if rows else []
        return {"rows": rows, "rowCount": len(rows), "fields": fields}


async def execute_params(config: dict, sql: str, params: list) -> dict:
    """파라미터 바인딩 실행 ($1, $2, ... 플레이스홀더). SELECT는 rows 반환, DML은 rowCount 반환."""
    pool = await _get_pool(config)
    async with pool.acquire() as conn:
        sql_upper = sql.strip().upper()
        if sql_upper.startswith(("SELECT", "WITH")):
            result = await conn.fetch(sql, *params)
            rows = [dict(r) for r in result]
            fields = list(rows[0].keys()) if rows else []
            return {"rows": rows, "rowCount": len(rows), "fields": fields}
        # DML — execute returns status string like "INSERT 0 1"
        status = await conn.execute(sql, *params)
        try:
            rc = int(status.split()[-1])
        except Exception:
            rc = 0
        return {"rows": [], "rowCount": rc, "fields": []}


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool(key: str = None) -> None:
    global _pools
    if key:
        pool = _pools.pop(key, None)
        if pool:
            try:
                await pool.close()
            except Exception:
                pass
    else:
        for p in list(_pools.values()):
            try:
                await p.close()
            except Exception:
                pass
        _pools = {}
