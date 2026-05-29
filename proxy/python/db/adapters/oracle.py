import asyncio
import oracledb

_pool = None
_pool_config_key = None
_thick_init_done = False


def _init_thick_mode(client_lib_dir: str = None) -> None:
    global _thick_init_done
    if _thick_init_done:
        return
    _thick_init_done = True
    try:
        oracledb.init_oracle_client(lib_dir=client_lib_dir or None)
    except Exception:
        pass


def _config_key(config: dict) -> str:
    return f"{config['host']}:{config.get('port', 1521)}:{config['database']}:{config['username']}"


def _get_pool(config: dict):
    global _pool, _pool_config_key
    _init_thick_mode(config.get("clientLibDir"))
    key = _config_key(config)
    if _pool and _pool_config_key == key:
        return _pool
    if _pool:
        try:
            _pool.close()
        except Exception:
            pass
    connect_string = f"{config['host']}:{config.get('port', 1521)}/{config['database']}"
    _pool = oracledb.create_pool(
        user=config["username"],
        password=config["password"],
        dsn=connect_string,
        min=0,
        max=10,
        increment=1,
        timeout=30,
    )
    _pool_config_key = key
    return _pool


async def execute(config: dict, sql: str) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _execute_sync, config, sql)


def _execute_sync(config: dict, sql: str) -> dict:
    pool = _get_pool(config)
    conn = pool.acquire()
    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        if cursor.description:
            fields = [col[0].lower() for col in cursor.description]
            rows = [dict(zip(fields, row)) for row in cursor.fetchall()]
            return {"rows": rows, "rowCount": len(rows), "fields": fields}
        return {"rows": [], "rowCount": cursor.rowcount or 0, "fields": []}
    finally:
        pool.release(conn)


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok FROM DUAL")
    return len(result["rows"]) > 0


async def close_pool() -> None:
    global _pool, _pool_config_key
    if _pool:
        try:
            _pool.close()
        except Exception:
            pass
        _pool = None
        _pool_config_key = None
