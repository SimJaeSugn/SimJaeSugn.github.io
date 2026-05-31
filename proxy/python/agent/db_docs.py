"""DB 유형별 SQL 문법·자료형 참고 문서 (정적).

SQL/DDL 을 생성·수정할 때 올바른 방언을 쓰도록 참고하는 읽기 전용 문서.
유형별 document 툴(db_doc_mysql 등)이 이 내용을 반환한다(DB 연결 불필요).
"""

DB_DOCS = {
    "mysql": {
        "title": "MySQL",
        "dataTypes": (
            "정수: TINYINT, SMALLINT, INT, BIGINT · 실수: DECIMAL(p,s), FLOAT, DOUBLE · "
            "문자: CHAR(n), VARCHAR(n), TEXT · 날짜: DATE, DATETIME, TIMESTAMP, TIME · "
            "기타: JSON, ENUM(...), BOOLEAN(=TINYINT(1))"
        ),
        "syntax": (
            "식별자: 백틱 `tbl` · 자동증가: AUTO_INCREMENT · "
            "PK: PRIMARY KEY(col) · FK: FOREIGN KEY(col) REFERENCES t(col) · "
            "테이블 생성: CREATE TABLE t (...) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 · "
            "페이징: LIMIT n OFFSET m · 문자열: 작은따옴표 'x' · 주석: -- 또는 #"
        ),
    },
    "postgres": {
        "title": "PostgreSQL",
        "dataTypes": (
            "정수: SMALLINT, INTEGER, BIGINT · 자동증가: SERIAL, BIGSERIAL (또는 GENERATED AS IDENTITY) · "
            "실수: NUMERIC(p,s), REAL, DOUBLE PRECISION · 문자: VARCHAR(n), CHAR(n), TEXT · "
            "불리언: BOOLEAN · 날짜: DATE, TIMESTAMP, TIMESTAMPTZ · 기타: UUID, JSONB, BYTEA"
        ),
        "syntax": (
            "식별자: 큰따옴표 \"tbl\"(미지정 시 소문자 폴딩) · 스키마 한정: schema.table · "
            "자동증가: SERIAL 또는 GENERATED ALWAYS AS IDENTITY · "
            "페이징: LIMIT n OFFSET m · 삽입 후 반환: RETURNING · 문자열: 작은따옴표(이스케이프 '') · 주석: --"
        ),
    },
    "oracle": {
        "title": "Oracle",
        "dataTypes": (
            "숫자: NUMBER(p,s), INTEGER · 문자: VARCHAR2(n)(권장), CHAR(n), NVARCHAR2(n), CLOB · "
            "날짜: DATE, TIMESTAMP · 기타: BLOB, FLOAT · "
            "불리언 타입 없음 → NUMBER(1) 또는 CHAR(1) 'Y'/'N' 관습"
        ),
        "syntax": (
            "식별자: 대문자 관습(큰따옴표 시 대소문자 구분) · "
            "자동증가: SEQUENCE + 트리거 또는 12c+ GENERATED AS IDENTITY · "
            "페이징: 12c+ OFFSET n ROWS FETCH NEXT m ROWS ONLY (구버전 ROWNUM) · "
            "더미 테이블 DUAL · VARCHAR 대신 VARCHAR2 사용 · 문자열: 작은따옴표"
        ),
    },
    "mssql": {
        "title": "SQL Server",
        "dataTypes": (
            "정수: TINYINT, SMALLINT, INT, BIGINT · 실수: DECIMAL/NUMERIC(p,s), FLOAT, REAL, MONEY · "
            "문자: CHAR(n), VARCHAR(n), NVARCHAR(n)(유니코드) · 불리언: BIT · "
            "날짜: DATE, DATETIME2, DATETIME · 기타: UNIQUEIDENTIFIER"
        ),
        "syntax": (
            "식별자: 대괄호 [tbl] · 스키마 한정: dbo.table · 자동증가: IDENTITY(1,1) · "
            "페이징: OFFSET n ROWS FETCH NEXT m ROWS ONLY (또는 TOP n) · "
            "유니코드 문자열: N'...' · 배치 구분: GO · 문자열: 작은따옴표"
        ),
    },
}

# 툴 이름 → DB 유형
DOC_TOOLS = {f"db_doc_{k}": k for k in DB_DOCS}

# 플래너에 노출되는 문서 툴 카탈로그 (프록시·읽기·DB 불필요)
DB_DOC_CATALOG = [
    {
        "name": f"db_doc_{k}", "kind": "read", "location": "proxy", "danger": False,
        "desc": f"{v['title']} SQL 문법·자료형 참고",
        "params": "(없음)",
        "detail": f"{v['title']}의 자료형과 SQL/DDL 문법 규칙을 반환한다(읽기 전용, DB 연결 불필요). "
                  f"해당 DB용 SQL을 생성·수정하기 전에 참고하라.",
    }
    for k, v in DB_DOCS.items()
]


def get_db_doc(tool_name: str) -> dict:
    k = DOC_TOOLS.get(tool_name)
    if not k:
        return {"ok": False, "error": "알 수 없는 문서 툴: " + tool_name}
    d = DB_DOCS[k]
    return {"ok": True, "dbType": k, "title": d["title"],
            "dataTypes": d["dataTypes"], "syntax": d["syntax"]}
