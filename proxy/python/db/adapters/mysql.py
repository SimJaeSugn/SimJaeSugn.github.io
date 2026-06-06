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
