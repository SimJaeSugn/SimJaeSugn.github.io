import aiomysql

_pool = None
_pool_config_key = None


def _config_key(config: dict) -> str:
    return f"{config['host']}:{config.get('port', 3306)}:{config['database']}:{config['username']}"


async def _get_pool(config: dict):
    global _pool, _pool_config_key
    key = _config_key(config)
    if _pool and _pool_config_key == key:
        return _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
    _pool = await aiomysql.create_pool(
        host=config["host"],
        port=config.get("port", 3306),
        db=config["database"],
        user=config["username"],
        password=config["password"],
        connect_timeout=10,
        minsize=1,
        maxsize=10,
    )
    _pool_config_key = key
    return _pool


async def execute(config: dict, sql: str) -> dict:
    pool = await _get_pool(config)
    async with pool.acquire() as conn:
        try:
            await conn.execute("SET SESSION MAX_EXECUTION_TIME=30000")
        except Exception:
            pass
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql)
            rows = await cur.fetchall()
            if rows is None:
                rows = []
            rows = [dict(r) for r in rows]
            fields = list(rows[0].keys()) if rows else []
            row_count = len(rows) if rows else (cur.rowcount or 0)
            return {"rows": rows, "rowCount": row_count, "fields": fields}


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool() -> None:
    global _pool, _pool_config_key
    if _pool:
        _pool.close()
        try:
            await _pool.wait_closed()
        except Exception:
            pass
        _pool = None
        _pool_config_key = None
