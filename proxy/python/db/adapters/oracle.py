import asyncio
import oracledb

_pools: dict = {}  # config_key -> oracledb.ConnectionPool
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
    _init_thick_mode(config.get("clientLibDir"))
    key = _config_key(config)
    pool = _pools.get(key)
    if pool:
        return pool
    connect_string = f"{config['host']}:{config.get('port', 1521)}/{config['database']}"
    pool = oracledb.create_pool(
        user=config["username"],
        password=config["password"],
        dsn=connect_string,
        min=0,
        max=10,
        increment=1,
        timeout=30,
    )
    _pools[key] = pool
    return pool


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
        # 결과셋 없음(INSERT/UPDATE/DELETE/DDL) → 커밋. oracledb 기본 autocommit=False.
        conn.commit()
        return {"rows": [], "rowCount": cursor.rowcount or 0, "fields": []}
    finally:
        pool.release(conn)


def _execute_params_sync(config: dict, sql: str, params) -> dict:
    """파라미터 바인딩 실행 (:1, :2, ... 플레이스홀더). SELECT는 rows 반환, DML은 rowCount 반환 + 커밋."""
    pool = _get_pool(config)
    conn = pool.acquire()
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        if cursor.description:
            fields = [col[0].lower() for col in cursor.description]
            rows = [dict(zip(fields, row)) for row in cursor.fetchall()]
            return {"rows": rows, "rowCount": len(rows), "fields": fields}
        # DML — 항상 커밋 (oracledb 기본 autocommit=False)
        conn.commit()
        return {"rows": [], "rowCount": cursor.rowcount or 0, "fields": []}
    finally:
        pool.release(conn)


async def execute_params(config: dict, sql: str, params) -> dict:
    """파라미터 바인딩 비동기 실행 (executor 래핑)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _execute_params_sync, config, sql, params)


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok FROM DUAL")
    return len(result["rows"]) > 0


async def close_pool(key: str = None) -> None:
    global _pools
    if key:
        pool = _pools.pop(key, None)
        if pool:
            try:
                pool.close()
            except Exception:
                pass
    else:
        for p in list(_pools.values()):
            try:
                p.close()
            except Exception:
                pass
        _pools = {}
