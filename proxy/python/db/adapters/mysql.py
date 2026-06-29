import aiomysql

_pools: dict = {}  # config_key -> aiomysql.Pool


def _config_key(config: dict) -> str:
    return f"{config['host']}:{config.get('port', 3306)}:{config['database']}:{config['username']}"


async def _get_pool(config: dict):
    key = _config_key(config)
    pool = _pools.get(key)
    if pool:
        return pool
    pool = await aiomysql.create_pool(
        host=config["host"],
        port=config.get("port", 3306),
        db=config["database"],
        user=config["username"],
        password=config["password"],
        connect_timeout=10,
        minsize=1,
        maxsize=10,
    )
    _pools[key] = pool
    return pool


async def execute(config: dict, sql: str) -> dict:
    pool = await _get_pool(config)
    async with pool.acquire() as conn:
        try:
            await conn.execute("SET SESSION MAX_EXECUTION_TIME=30000")
        except Exception:
            pass
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql)
            # multi-statement(예: LLM이 만든 여러 INSERT) 대응 — 모든 결과셋을 끝까지 소진한다.
            # pymysql/aiomysql 은 MULTI_STATEMENTS 가 기본 활성이라 한 번의 execute 로
            # 여러 문장이 서버에서 실행되는데, 첫 결과셋만 읽고 곧바로 commit 후 연결을 반납하면
            # ① 뒤 문장들이 커밋되지 않은 채 롤백되고 ② 연결이 'Commands out of sync' 로 오염된다.
            # → 모든 결과셋을 소진하며 영향 행을 누적하고, DML 이 하나라도 있었으면 마지막에 한 번만 커밋한다.
            result_rows: list = []
            total_affected = 0
            saw_dml = False
            while True:
                if cur.description is not None:           # SELECT 등 결과셋 있는 문장
                    fetched = await cur.fetchall()
                    if fetched:
                        result_rows = [dict(r) for r in fetched]
                else:                                      # INSERT/UPDATE/DELETE/DDL — 결과셋 없음
                    saw_dml = True
                    total_affected += (cur.rowcount or 0)
                if not await cur.nextset():
                    break
            # DML 이 하나라도 실행됐으면 커밋(aiomysql 기본 autocommit=False — 미커밋 시 롤백).
            # 모든 문장 소진 후 1회 커밋 → 멀티문장 일부만 반영/롤백되던 버그 방지.
            if saw_dml:
                await conn.commit()
            fields = list(result_rows[0].keys()) if result_rows else []
            row_count = len(result_rows) if result_rows else total_affected
            return {"rows": result_rows, "rowCount": row_count, "fields": fields}


async def execute_params(config: dict, sql: str, params: list) -> dict:
    """파라미터 바인딩 실행 (%s 플레이스홀더). SELECT는 rows 반환, DML은 rowCount 반환 + 커밋."""
    pool = await _get_pool(config)
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, params)
            if cur.description is not None:
                rows = [dict(r) for r in await cur.fetchall()]
                return {"rows": rows, "rowCount": len(rows), "fields": list(rows[0].keys()) if rows else []}
            # DML — 항상 커밋 (aiomysql 기본 autocommit=False)
            await conn.commit()
            return {"rows": [], "rowCount": cur.rowcount or 0, "fields": []}


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool(key: str = None) -> None:
    global _pools
    if key:
        pool = _pools.pop(key, None)
        if pool:
            pool.close()
            try:
                await pool.wait_closed()
            except Exception:
                pass
    else:
        for p in list(_pools.values()):
            p.close()
            try:
                await p.wait_closed()
            except Exception:
                pass
        _pools = {}
