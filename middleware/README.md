# UXERManager 미들웨어

ERD 도구(브라우저)와 운영 DB를 연결하는 로컬 프록시 서버.  
실행하면 `http://127.0.0.1:3737` 에서 대기하며 시스템 트레이에 아이콘이 등록된다.

---

## 실행

### 배포용 — 인스톨러 (권장)
```bash
npm run build:installer
```
빌드 결과물: `dist/UXERManager_Setup_{version}.exe`  
인스톨러를 실행하면 `C:\Program Files\UXERManager\`에 파일이 설치되고 시작 메뉴에 등록된다.  
언인스톨러 포함. **Inno Setup 6** 이 개발 PC에 설치되어 있어야 한다.

> Inno Setup 다운로드: https://jrsoftware.org/isinfo.php

### 배포용 — exe 단독 (인스톨러 없이 배포 시)
```bash
npm run build:win
```
빌드 결과물: `dist/uxermanager.exe`  
`uxermanager.exe`와 `start.vbs`를 같은 폴더에 두고 `start.vbs`를 더블클릭한다.  
시스템 트레이에 아이콘이 등록되며, 우클릭 → **종료**로 미들웨어를 종료한다.

### 개발용 (콘솔 직접 실행)
```bash
npm install
npm start
```

---

## 트레이 메뉴

| 항목 | 설명 |
|------|------|
| UXERManager v{버전} | 버전 정보 — package.json 기준 동적 표시 (클릭 불가) |
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
{ "ok": true, "version": "1.2.0", "port": 3737 }
```
> `version` 값은 `package.json`의 버전을 그대로 반환한다.

---

### POST /config
DB 접속정보 저장. 비밀번호는 AES-256-GCM으로 암호화 후 `~/.uxermanager/config.json`에 저장.  
저장 시 기존 DB 커넥션 풀을 모두 닫고 설정 캐시를 초기화한다.

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

### GET /health
DB 연결 상태를 실시간으로 확인. 접속정보가 없거나 DB 연결에 실패해도 200으로 응답하며 `ok` 필드로 구분한다.

**응답 (연결 성공)**
```json
{ "ok": true, "db": { "connected": true, "latencyMs": 3 } }
```

**응답 (접속정보 없음)**
```json
{ "ok": false, "db": { "connected": false, "error": "접속정보 없음" } }
```

**응답 (DB 연결 실패)**
```json
{ "ok": false, "db": { "connected": false, "error": "Connection refused" } }
```

---

### GET /config/profiles
저장된 전체 프로파일 목록 조회. 비밀번호는 `••••••••`로 마스킹.

**응답**
```json
{
  "active": "기본",
  "profiles": [
    {
      "name": "기본",
      "dbType": "postgres",
      "host": "localhost",
      "port": 5432,
      "database": "mydb",
      "username": "postgres",
      "password": "••••••••",
      "updatedAt": "2026-05-27T00:00:00.000Z"
    }
  ]
}
```

---

### POST /config/profiles
새 프로파일 추가. 중복 이름은 거부(409).

**요청 Body** — `/config` POST와 동일하며 `name` 필드 추가
```json
{
  "name":     "운영서버",
  "dbType":   "postgres",
  "host":     "db.example.com",
  "port":     5432,
  "database": "prod",
  "username": "admin",
  "password": "secret"
}
```

**응답**
```json
{ "ok": true, "message": "프로파일 '운영서버'이 추가되었습니다." }
```

---

### PUT /config/profiles/:name
프로파일 접속정보 수정. `password` 미입력 시 기존 비밀번호 유지. 활성 프로파일 수정 시 DB 커넥션 풀을 닫는다.

**요청 바디** (`application/json`)
```json
{
  "dbType": "postgres",
  "host": "db.example.com",
  "port": 5432,
  "database": "mydb",
  "username": "admin",
  "password": ""
}
```

**응답**
```json
{ "ok": true, "message": "프로파일 '운영서버'이 수정되었습니다." }
```

---

### DELETE /config/profiles/:name
프로파일 삭제. 활성 프로파일이거나 마지막 프로파일이면 거부(400).

**응답**
```json
{ "ok": true, "message": "프로파일 '운영서버'이 삭제되었습니다." }
```

---

### POST /config/profiles/:name/activate
다른 프로파일로 전환. 전환 시 기존 DB 커넥션 풀을 모두 닫고 설정 캐시를 초기화한다.

**응답**
```json
{ "ok": true, "message": "'운영서버' 프로파일로 전환되었습니다." }
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
  ],
  "stopOnError": true
}
```

> `stopOnError: true` 를 설정하면 SQL 실행 중 오류 발생 시 즉시 중단하고 `done` 이벤트를 전송한다. 기본값은 `false` (오류 무시 후 계속 실행).

**요청 Body — 문자열 방식 (세미콜론+줄바꿈으로 분리)**
```json
{
  "sql": "CREATE TABLE users (...);\nCREATE TABLE orders (...);",
  "stopOnError": false
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
'null' 문자열  (file:// 또는 Electron 로컬 실행 시 브라우저가 origin을 'null'로 전달)
```

---

## 파일 구조

```
middleware/
├── src/
│   ├── index.js              Express 서버 진입점 (port 3737)
│   ├── tray.js               시스템 트레이 아이콘 등록
│   ├── tray_win_bin.js       tray 헬퍼 바이너리 (base64 임베드)
│   ├── routes/
│   │   ├── config.js         GET/POST /config, POST /config/test, 프로파일 CRUD
│   │   ├── execute.js        POST /execute, POST /execute/stream (감사 로그 포함)
│   │   ├── health.js         GET /health (DB 연결 상태 확인)
│   │   └── schema.js         GET /schema (리버스 엔지니어링)
│   ├── db/
│   │   ├── connector.js      dbType → 어댑터 라우팅, 전체 풀 종료
│   │   └── adapters/
│   │       ├── postgres.js   pg Pool 드라이버 (커넥션 풀링)
│   │       ├── mysql.js      mysql2 Pool 드라이버 (커넥션 풀링)
│   │       └── mssql.js      mssql ConnectionPool 드라이버 (커넥션 풀링)
│   └── utils/
│       ├── crypto.js         AES-256-GCM 암호화/복호화 (레거시 마이그레이션 포함)
│       ├── keystore.js       ~/.uxermanager/key 기반 암호화 키 생성·로드
│       └── auditLogger.js    SQL 실행 감사 로그 기록 (로테이션 10 MB)
├── scripts/
│   ├── run-iscc.js           Inno Setup 경로 탐색 헬퍼
│   ├── install-watchdog.ps1  Windows Task Scheduler Watchdog 등록
│   └── uninstall-watchdog.ps1 Watchdog 작업 제거
├── dist/
│   ├── uxermanager.exe               배포용 단일 실행파일
│   └── UXERManager_Setup_{ver}.exe   인스톨러
├── installer.iss             Inno Setup 인스톨러 스크립트
├── start.vbs                 콘솔 창 없이 exe 실행하는 런처
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

암호화 키는 `~/.uxermanager/key` 파일에 hex로 저장되며, 최초 실행 시 자동 생성된다.  
기존 고정 키(`uxermanager-local-secret-key-32b`)로 암호화된 설정은 최초 로드 시 자동으로 새 키로 마이그레이션된다.

### 감사 로그 (audit.log)

SQL 실행 이력은 `~/.uxermanager/audit.log`에 기록된다.

| OS      | 경로                                         |
|---------|----------------------------------------------|
| Windows | `C:\Users\{username}\.uxermanager\audit.log` |
| macOS   | `/Users/{username}/.uxermanager/audit.log`   |
| Linux   | `/home/{username}/.uxermanager/audit.log`    |

- 파일 크기가 10 MB를 초과하면 `audit.log.1`로 롤오버(기존 `.1` 삭제 후 이름 변경).
- 로그 형식: `{ISO timestamp} [{태그}] {SQL 최대 200자} ({소요시간}ms, {행 수} rows | ERROR: {오류})`

---

## Watchdog 설치 (Windows)

미들웨어 exe를 로그온 시 자동 실행하고, 비정상 종료 시 최대 3회 재시작하도록 Windows 작업 스케줄러에 등록한다.

### 등록

관리자 권한 PowerShell에서 실행:

```powershell
.\scripts\install-watchdog.ps1 -ExePath "C:\Program Files\UXERManager\uxermanager.exe"
```

등록 후 즉시 시작:

```powershell
Start-ScheduledTask -TaskName "UXERManager-Middleware"
```

### 제거

```powershell
.\scripts\uninstall-watchdog.ps1
```

> 작업 이름: `UXERManager-Middleware` / 트리거: 로그온 시 / 재시작: 실패 후 1분 간격으로 최대 3회
