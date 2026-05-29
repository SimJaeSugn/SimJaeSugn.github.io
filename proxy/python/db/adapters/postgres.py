import asyncio
import asyncpg

_pool = None
_pool_config_key = None


def _config_key(config: dict) -> str:
    return f"{config['host']}:{config.get('port', 5432)}:{config['database']}:{config['username']}"


async def _get_pool(config: dict):
    global _pool, _pool_config_key
    key = _config_key(config)
    if _pool and _pool_config_key == key:
        return _pool
    if _pool:
        try:
            await _pool.close()
        except Exception:
            pass
    _pool = await asyncpg.create_pool(
        host=config["host"],
        port=config.get("port", 5432),
        database=config["database"],
        user=config["username"],
        password=config["password"],
        min_size=1,
        max_size=10,
        command_timeout=30,
    )
    _pool_config_key = key
    return _pool


async def execute(config: dict, sql: str) -> dict:
    pool = await _get_pool(config)
    async with pool.acquire() as conn:
        result = await conn.fetch(sql)
        rows = [dict(r) for r in result]
        fields = list(rows[0].keys()) if rows else []
        return {"rows": rows, "rowCount": len(rows), "fields": fields}


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool() -> None:
    global _pool, _pool_config_key
    if _pool:
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
        _pool_config_key = None
