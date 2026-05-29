import asyncio
import pyodbc

_conn = None
_conn_config_key = None


def _config_key(config: dict) -> str:
    return f"{config['host']}:{config.get('port', 1433)}:{config['database']}:{config['username']}"


def _get_conn(config: dict):
    global _conn, _conn_config_key
    key = _config_key(config)
    if _conn and _conn_config_key == key:
        try:
            _conn.execute("SELECT 1")
            return _conn
        except Exception:
            pass
    if _conn:
        try:
            _conn.close()
        except Exception:
            pass
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
    _conn = pyodbc.connect(conn_str, timeout=10)
    _conn.timeout = 30
    _conn_config_key = key
    return _conn


async def execute(config: dict, sql: str) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _execute_sync, config, sql)


def _execute_sync(config: dict, sql: str) -> dict:
    conn = _get_conn(config)
    cursor = conn.cursor()
    cursor.execute(sql)
    if cursor.description:
        fields = [col[0] for col in cursor.description]
        rows = [dict(zip(fields, row)) for row in cursor.fetchall()]
        return {"rows": rows, "rowCount": len(rows), "fields": fields}
    return {"rows": [], "rowCount": cursor.rowcount or 0, "fields": []}


async def test(config: dict) -> bool:
    result = await execute(config, "SELECT 1 AS ok")
    return len(result["rows"]) > 0


async def close_pool() -> None:
    global _conn, _conn_config_key
    if _conn:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = None
        _conn_config_key = None
