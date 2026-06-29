import asyncio
import pyodbc

_conns: dict = {}  # config_key -> pyodbc.Connection


def _config_key(config: dict) -> str:
    return f"{config['host']}:{config.get('port', 1433)}:{config['database']}:{config['username']}"


def _get_conn(config: dict):
    key = _config_key(config)
    conn = _conns.get(key)
    if conn:
        try:
            conn.execute("SELECT 1")
            return conn
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            del _conns[key]
    port = config.get("port", 1433)
    trust_cert = "yes" if config.get("trustServerCertificate", True) else "no"
    encrypt = "yes" if config.get("encrypt", True) else "no"
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={config['host']},{port};"
        f"DATABASE={config['database']};"
        f"UID={config['username']};"
        f"PWD={config['password']};"
        f"Encrypt={encrypt};"
        f"TrustServerCertificate={trust_cert};"
        f"Connection Timeout=10;"
    )
    conn = pyodbc.connect(conn_str, timeout=10)
    conn.timeout = 30
    _conns[key] = conn
    return conn


async def execute(config: dict, sql: str) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _execute_sync, config, sql)


def _execute_sync(config: dict, sql: str) -> dict:
    conn = _get_conn(config)
    cursor = conn.cursor()
    cursor.execute(sql)
    # multi-statement(배치) 대응 — 모든 결과셋을 소진하며 영향 행을 누적하고,
    # DML 이 하나라도 있었으면 마지막에 한 번만 커밋한다(일부만 반영/롤백되던 버그 방지).
    result_rows: list = []
    total_affected = 0
    saw_dml = False
    while True:
        if cursor.description:                         # SELECT 등 결과셋 있는 문장
            fields = [col[0] for col in cursor.description]
            fetched = cursor.fetchall()
            if fetched:
                result_rows = [dict(zip(fields, row)) for row in fetched]
        else:                                          # INSERT/UPDATE/DELETE/DDL — 결과셋 없음
            saw_dml = True
            if cursor.rowcount and cursor.rowcount > 0:
                total_affected += cursor.rowcount
        if not cursor.nextset():
            break
    # 결과셋 없는 DML → 커밋. pyodbc 기본 autocommit=False.
    if saw_dml:
        conn.commit()
    fields = list(result_rows[0].keys()) if result_rows else []
    row_count = len(result_rows) if result_rows else total_affected
    return {"rows": result_rows, "rowCount": row_count, "fields": fields}


def _execute_params_sync(config: dict, sql: str, params: list) -> dict:
    """파라미터 바인딩 실행 (? 플레이스홀더). SELECT는 rows 반환, DML은 rowCount 반환 + 커밋."""
    conn = _get_conn(config)
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
        if cursor.description:
            fields = [col[0] for col in cursor.description]
            rows = [dict(zip(fields, row)) for row in cursor.fetchall()]
            return {"rows": rows, "rowCount": len(rows), "fields": fields}
        # DML — 항상 커밋 (pyodbc 기본 autocommit=False)
        conn.commit()
        return {"rows": [], "rowCount": cursor.rowcount or 0, "fields": []}
    finally:
        try:
            cursor.close()
        except Exception:
            pass


async def execute_params(config: dict, sql: str, params: list) -> dict:
    """파라미터 바인딩 비동기 실행 (executor 래핑)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _execute_params_sync, config, sql, params)


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool(key: str = None) -> None:
    global _conns
    if key:
        conn = _conns.pop(key, None)
        if conn:
            try:
                conn.close()
            except Exception:
                pass
    else:
        for c in list(_conns.values()):
            try:
                c.close()
            except Exception:
                pass
        _conns = {}
