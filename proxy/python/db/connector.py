from db.adapters import postgres, mysql, mssql, oracle

_adapters = {
    "postgres": postgres,
    "mysql": mysql,
    "mssql": mssql,
    "oracle": oracle,
}


def get_adapter(db_type: str):
    adapter = _adapters.get(db_type)
    if not adapter:
        raise ValueError(f"지원하지 않는 DB 타입: {db_type}. (postgres / mysql / mssql / oracle)")
    return adapter


async def close_all_pools() -> None:
    for adapter in _adapters.values():
        if hasattr(adapter, "close_pool"):
            await adapter.close_pool()
