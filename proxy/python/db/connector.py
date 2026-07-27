from db.adapters import postgres, mysql, mssql, oracle, supabase

_adapters = {
    "postgres": postgres,
    "mysql": mysql,
    "mssql": mssql,
    "oracle": oracle,
    "supabase": supabase,
}

# dbType → SQL 방언. 프로토콜은 같고 연결 조건만 다른 유형을 정규화한다.
# (어댑터 조회는 항상 원본 dbType 으로 — 연결 옵션이 달라진다.)
_DIALECTS = {
    "supabase": "postgres",
}


def sql_dialect(db_type: str) -> str:
    """SQL 문법·스키마 조회용 방언 이름. 예: supabase → postgres."""
    return _DIALECTS.get(db_type, db_type)


def get_adapter(db_type: str):
    adapter = _adapters.get(db_type)
    if not adapter:
        raise ValueError(
            f"지원하지 않는 DB 타입: {db_type}. (postgres / mysql / mssql / oracle / supabase)")
    return adapter


async def close_all_pools(key: str = None) -> None:
    for adapter in _adapters.values():
        if hasattr(adapter, "close_pool"):
            await adapter.close_pool(key)
