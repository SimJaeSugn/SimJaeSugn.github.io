# UXERManager 미들웨어

ERD 도구(브라우저)와 운영 DB를 연결하는 로컬 프록시 서버.  
실행하면 `http://127.0.0.1:3737` 에서 대기하며 시스템 트레이에 아이콘이 등록된다.

---

## 실행

### 배포용 (트레이 백그라운드 실행 — 콘솔 창 없음)
```
start.vbs 더블클릭
```
`uxermanager.exe`와 `start.vbs`를 같은 폴더에 두고 `start.vbs`를 실행한다.  
시스템 트레이에 아이콘이 등록되며, 우클릭 → **종료**로 미들웨어를 종료한다.

### 개발용 (콘솔 직접 실행)
```bash
npm install
npm start
```

### exe 빌드
```bash
npm run build:win
```

빌드 결과물: `dist/uxermanager.exe`  
배포 시 `start.vbs`와 함께 제공한다.

---

## 트레이 메뉴

| 항목 | 설명 |
|------|------|
| UXERManager v1.0.0 | 버전 정보 (클릭 불가) |
| 포트 3737에서 실행 중 | 실행 상태 (클릭 불가) |
| 종료 | 미들웨어 프로세스 종료 |

---

## 지원 DB

| dbType 값  | DB            | 기본 포트 |
|------------|---------------|-----------|
| `postgres` | PostgreSQL    | 5432      |
| `mysql`    | MySQL         | 3306      |
| `mssql`    | SQL Server    | 1433      |

---

## API 레퍼런스

### GET /ping
미들웨어 실행 여부 확인.

**응답**
```json
{ "ok": true, "version": "1.0.0", "port": 3737 }
```

---

### POST /config
DB 접속정보 저장. 비밀번호는 AES-256-GCM으로 암호화 후 `~/.uxermanager/config.json`에 저장.

**요청 Body**
```json
{
  "dbType":   "postgres",
  "host":     "localhost",
  "port":     5432,
  "database": "mydb",
  "username": "postgres",
  "password": "secret"
}
```

**응답**
```json
{ "ok": true, "message": "접속정보가 저장되었습니다." }
```

---

### GET /config
저장된 접속정보 조회. 비밀번호는 `••••••••`로 마스킹.

**응답 (설정 있음)**
```json
{
  "configured": true,
  "dbType":     "postgres",
  "host":       "localhost",
  "port":       5432,
  "database":   "mydb",
  "username":   "postgres",
  "password":   "••••••••"
}
```

**응답 (설정 없음)**
```json
{ "configured": false }
```

---

### POST /config/test
저장하지 않고 접속정보로 연결만 테스트.

**요청 Body** — `/config` POST와 동일  
**응답 (성공)**
```json
{ "ok": true, "message": "연결 성공" }
```
**응답 (실패)**
```json
{ "ok": false, "error": "Connection refused" }
```

---

### GET /schema
저장된 접속정보로 DB 스키마(테이블·뷰·FK)를 한 번에 조회. 리버스 엔지니어링 기능에서 사용.

**응답**
```json
{
  "tables": [
    {
      "tableName": "users",
      "isView": false,
      "columns": [
        {
          "columnName":   "id",
          "dataType":     "integer",
          "isPk":         true,
          "isNullable":   false,
          "defaultValue": "nextval('users_id_seq'::regclass)"
        },
        {
          "columnName":   "name",
          "dataType":     "text",
          "isPk":         false,
          "isNullable":   true,
          "defaultValue": null
        }
      ]
    }
  ],
  "views": [
    {
      "viewName": "active_users",
      "columns":  [ /* 컬럼 목록 */ ],
      "ddl":      "SELECT id, name FROM users WHERE active = true"
    }
  ],
  "fks": [
    {
      "fromTable": "orders",
      "fromCol":   "user_id",
      "toTable":   "users",
      "toCol":     "id"
    }
  ]
}
```

**오류 응답**
```json
{ "error": "접속정보가 설정되지 않았습니다." }
```

---

### POST /execute
저장된 접속정보로 단일 SQL 실행. 결과를 JSON으로 반환.

**요청 Body**
```json
{ "sql": "SELECT * FROM users LIMIT 10" }
```

**응답 (성공)**
```json
{
  "ok":       true,
  "rows":     [{ "id": 1, "name": "홍길동" }],
  "rowCount": 1,
  "fields":   ["id", "name"],
  "duration": 42
}
```

**응답 (실패)**
```json
{ "ok": false, "error": "relation \"users\" does not exist" }
```

---

### POST /execute/stream
다중 SQL을 순차 실행하며 SSE(Server-Sent Events)로 실시간 진행률 전송.

**요청 Body — 배열 방식 (권장)**
```json
{
  "sqls": [
    "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)",
    "CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INT)",
    "ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)"
  ]
}
```

**요청 Body — 문자열 방식 (세미콜론+줄바꿈으로 분리)**
```json
{
  "sql": "CREATE TABLE users (...);\nCREATE TABLE orders (...);"
}
```

**SSE 응답 스트림**

헤더: `Content-Type: text/event-stream`

```
event: progress
data: {"step":1,"total":3,"sql":"CREATE TABLE users...","status":"running"}

event: progress
data: {"step":1,"total":3,"sql":"CREATE TABLE users...","status":"ok","rowCount":0,"duration":15}

event: progress
data: {"step":2,"total":3,"sql":"CREATE TABLE orders...","status":"running"}

event: progress
data: {"step":2,"total":3,"status":"ok","rowCount":0,"duration":8}

event: error
data: {"step":3,"total":3,"sql":"ALTER TABLE orders...","error":"table \"users\" does not exist"}

event: done
data: {"success":2,"failed":1,"total":3,"duration":312}
```

**SSE 이벤트 타입 요약**

| event      | 발생 시점              | 주요 필드                                      |
|------------|------------------------|------------------------------------------------|
| `progress` | 각 SQL 실행 전/후      | `step`, `total`, `sql`, `status` (running/ok)  |
| `error`    | SQL 실행 실패 시       | `step`, `sql`, `error`                         |
| `done`     | 전체 완료 후 (1회)     | `success`, `failed`, `total`, `duration`       |

---

## 브라우저에서 SSE 연동 예시

```javascript
async function executeWithStream(sqls, onProgress, onError, onDone) {
  const res = await fetch('http://127.0.0.1:3737/execute/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sqls })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();

    for (const part of parts) {
      const eventLine = part.match(/^event: (.+)$/m)?.[1];
      const dataLine  = part.match(/^data: (.+)$/m)?.[1];
      if (!dataLine) continue;

      const data = JSON.parse(dataLine);
      if (eventLine === 'progress') onProgress(data);
      else if (eventLine === 'error') onError(data);
      else if (eventLine === 'done')  onDone(data);
    }
  }
}
```

---

## CORS 허용 Origin

```
https://simjaesugn.github.io
http://localhost (모든 포트)
http://127.0.0.1
null  (file:// 로컬 실행)
```

---

## 파일 구조

```
middleware/
├── src/
│   ├── index.js              Express 서버 진입점 (port 3737)
│   ├── routes/
│   │   ├── config.js         POST/GET /config, POST /config/test
│   │   ├── execute.js        POST /execute, POST /execute/stream
│   │   └── schema.js         GET /schema (리버스 엔지니어링)
│   ├── db/
│   │   ├── connector.js      dbType → 어댑터 라우팅
│   │   └── adapters/
│   │       ├── postgres.js   pg 드라이버
│   │       ├── mysql.js      mysql2 드라이버
│   │       └── mssql.js      mssql(tedious) 드라이버
│   └── utils/
│       └── crypto.js         AES-256-GCM 암호화/복호화
├── dist/
│   └── uxermanager.exe       배포용 단일 실행파일
├── package.json
└── .gitignore
```

---

## 접속정보 저장 위치

| OS      | 경로                                      |
|---------|-------------------------------------------|
| Windows | `C:\Users\{username}\.uxermanager\config.json` |
| macOS   | `/Users/{username}/.uxermanager/config.json`   |
| Linux   | `/home/{username}/.uxermanager/config.json`    |

비밀번호는 AES-256-GCM으로 암호화 저장. 평문 노출 없음.
