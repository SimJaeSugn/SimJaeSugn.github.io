# 구현 계획서 — 미들웨어 기능 확장 (5-1 ~ 5-4)

> 작성일: 2026-05-27  
> 분석 대상: `middleware/src/` 전체  
> 작성자: 코드 분석 에이전트

---

## 요청 요약

기존 단일 프로파일 미들웨어에 4가지 기능을 추가한다.

1. **5-1** 다중 접속 프로파일 (프로파일 CRUD + 전환 API)
2. **5-2** `/health` 엔드포인트 (DB 실제 연결 포함)
3. **5-3** 감사 로그 (`~/.uxermanager/audit.log`)
4. **5-4** 자동 재시작 / Watchdog (Windows Task Scheduler 스크립트)

---

## 탐색한 파일

| 파일 | 탐색 이유 및 주요 발견사항 |
|------|--------------------------|
| `src/index.js` | 라우터 등록 구조 파악. `/ping`, `/config`, `/execute`, `/schema` 4개 라우트만 존재. `/health` 라우터 추가 위치 확인. |
| `src/routes/config.js` | `loadConfig` / `saveConfig` 패턴의 핵심. 단일 객체를 CONFIG_FILE에 직접 저장. 메모리 캐시(`_configCache`) 패턴 이미 구현. `loadConfig`가 `module.exports.loadConfig`로 외부 공개됨 → `execute.js`, `schema.js`가 이를 직접 import. |
| `src/routes/execute.js` | `loadConfig()` 호출 후 `adapter.execute()` 실행. 감사 로그 삽입 위치는 `execute()` 성공·실패 직후. `/stream`은 루프 내 각 SQL 성공·실패 직후. |
| `src/routes/schema.js` | `loadConfig()` 동일 패턴. 스키마 조회는 감사 로그 대상에서 제외해도 무방(분석용 읽기 전용). |
| `src/db/connector.js` | `getAdapter(dbType)` 단순 라우팅. `closeAllPools()` 이미 구현. health 체크 시 `adapter.test()` 호출 가능. |
| `src/db/adapters/postgres.js` | 커넥션 풀 이미 구현(`Pool`). `test(config)` 함수 존재 → `SELECT 1` 실행. `configKey()` 로 풀 재사용 판단. |
| `src/db/adapters/mysql.js` | 동일하게 `test(config)` 존재. `mysql2/promise` Pool 사용. |
| `src/db/adapters/mssql.js` | `ConnectionPool` 인스턴스 직접 관리. `test(config)` 존재. `_connecting` Promise로 동시 연결 경합 처리. |
| `src/utils/crypto.js` | `encrypt` / `decrypt` / `decryptLegacy` 공개. 비밀번호는 저장 시 암호화, 로드 시 복호화 후 메모리에만 평문 보관. |
| `src/utils/keystore.js` | `~/.uxermanager/key` 파일에서 AES-256 키 로드/생성. |
| `src/tray.js` | 트레이 아이콘. 기능 추가와 무관. |
| `middleware/package.json` | `node18` 대상 `pkg` 빌드. 의존성: `express`, `cors`, `pg`, `mysql2`, `mssql`, `systray2`. 신규 의존성 불필요(fs, os, path 모두 Node 내장). |
| `middleware/ref.md` | 개선 제안 원문. 5-1~5-4 요구사항 상세 기술. |

---

## 영향 분석

- **단축키 변경:** 없음 (미들웨어 서버 코드)
- **새 localStorage 키:** 없음 (미들웨어)
- **기타 파급 효과:**
  - `loadConfig()` 반환 구조가 변경되면 `execute.js`, `schema.js` 모두 영향받음 → **하위 호환 래퍼로 격리 필요**
  - `POST /config` 기존 바디 구조(`{dbType, host, ...}`)를 그대로 수신해야 UI 코드 무수정 가능
  - `GET /config` 응답 구조(`{configured, dbType, host, ...}`)도 동일하게 유지해야 함
  - 감사 로그 파일은 빌드된 `.exe` 환경에서도 `~/.uxermanager/` 경로 사용(이미 보장된 경로)
  - `audit.log` 로테이션 미구현 시 장기 운영 시 파일 무제한 증가

---

## 구현 계획

---

### 5-1. 다중 접속 프로파일

#### 신규/변경 API 설계

```
# 기존 API — 완전 하위 호환 유지
GET  /config          → 활성 프로파일 정보 반환 (기존 응답 구조 동일)
POST /config          → 활성 프로파일 덮어쓰기 저장 (기존 요청 구조 동일)
POST /config/test     → 임시 자격증명으로 연결 테스트 (변경 없음)

# 신규 프로파일 관리 API
GET  /config/profiles              → 전체 프로파일 목록 (비밀번호 마스킹)
POST /config/profiles              → 새 프로파일 추가
DELETE /config/profiles/:name      → 프로파일 삭제 (활성 중이면 거부)
POST /config/profiles/:name/activate → 프로파일 전환 (활성 변경 후 풀 재생성)
```

**GET /config/profiles 응답 예시:**
```json
{
  "profiles": [
    { "name": "개발", "dbType": "postgres", "host": "localhost", "port": 5432, "database": "dev", "username": "postgres", "password": "••••••••", "active": true },
    { "name": "운영", "dbType": "mssql",    "host": "10.0.0.1",  "port": 1433, "database": "prod", "username": "sa", "password": "••••••••", "active": false }
  ],
  "active": "개발"
}
```

**POST /config/profiles 요청 바디:**
```json
{ "name": "스테이징", "dbType": "mysql", "host": "...", "port": 3306, "database": "stage", "username": "root", "password": "..." }
```

**하위 호환 전략:**
- 기존 단일 config.json 파일을 읽을 때 `profiles` 키가 없으면 → 자동 마이그레이션 실행
- 마이그레이션: `{ profiles: [{ name: "기본", ...existing }], active: "기본" }` 형태로 변환 후 재저장
- `loadConfig()` 내부에서 마이그레이션 후 항상 활성 프로파일의 평문 객체를 반환 → `execute.js`, `schema.js` 코드 변경 없음

#### 파일별 변경 계획

**`src/routes/config.js` — 주요 변경 파일**

```
변경 전:
  - CONFIG_FILE에 단일 프로파일 객체 저장
  - loadConfig(): 단일 객체 로드 및 복호화 후 반환

변경 후:
  - CONFIG_FILE 구조: { profiles: [...], active: "이름" }
  - loadRawStore(): 파일 읽기 + 마이그레이션 처리 (내부 전용)
  - saveStore(store): 전체 store 저장 (내부 전용)
  - loadConfig(): 기존 시그니처 유지. 활성 프로파일을 평문으로 반환
  - 신규: loadActiveProfile() — loadConfig()의 내부 구현체 (리팩터 후 동일)
  - 신규: listProfiles() — 전체 프로파일 목록 마스킹 반환
  - 신규: addProfile(data) — 중복 이름 검사 후 추가
  - 신규: deleteProfile(name) — 활성 프로파일 삭제 거부
  - 신규: activateProfile(name) — active 변경 + 풀 재생성

  라우터 추가:
  - GET  /profiles           → listProfiles()
  - POST /profiles           → addProfile()
  - DELETE /profiles/:name   → deleteProfile()
  - POST /profiles/:name/activate → activateProfile()
```

**마이그레이션 로직 (loadRawStore 내부):**
```js
function loadRawStore() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  // 구버전 단일 프로파일 형식 감지
  if (!raw.profiles) {
    const migrated = {
      profiles: [{ name: '기본', ...raw }],
      active: '기본'
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2), 'utf8');
    return migrated;
  }
  return raw;
}
```

**캐시 전략:**
- `_storeCache`: 전체 store 객체 캐시
- `_activeConfigCache`: 활성 프로파일 평문 객체 캐시 (기존 `_configCache`를 이름만 변경)
- 저장/전환 시 두 캐시 모두 무효화

---

### 5-2. /health 엔드포인트

#### 파일별 변경 계획

**신규 `src/routes/health.js` 생성**

```js
// GET /health
// 응답: { ok: true, db: { connected: true, latencyMs: 4 } }
// DB 연결 실패 시: { ok: false, db: { connected: false, error: "..." } }
// 서버 자체는 항상 200 반환

router.get('/', async (req, res) => {
  const config = loadConfig();   // config.js에서 import
  if (!config) {
    return res.json({ ok: false, db: { connected: false, error: '접속정보 없음' } });
  }
  try {
    const adapter = getAdapter(config.dbType);
    const start = Date.now();
    await adapter.test(config);    // 각 어댑터의 test() 재사용
    const latencyMs = Date.now() - start;
    res.json({ ok: true, db: { connected: true, latencyMs } });
  } catch (err) {
    res.json({ ok: false, db: { connected: false, error: err.message } });
  }
});
```

**`src/index.js` 변경:**
```js
const healthRouter = require('./routes/health');
// ...
app.use('/health', healthRouter);
```

**핵심 특성:**
- 항상 HTTP 200 반환 (서버 생존 자체가 ok, DB 상태는 `db.connected`로 구분)
- `adapter.test(config)` 재사용 → 어댑터별 중복 코드 없음
- 연결 풀이 이미 열려 있으면 풀에서 커넥션 재사용 → 레이턴시 정확도 높음

---

### 5-3. 감사 로그

#### 파일별 변경 계획

**신규 `src/utils/auditLogger.js` 생성**

```js
// 책임: audit.log 파일 기록 + 로테이션
// 경로: ~/.uxermanager/audit.log
// 포맷: 2026-05-27T10:23:11Z [EXECUTE] SELECT * FROM users (12ms, 42 rows)
//       2026-05-27T10:23:15Z [EXECUTE] DROP TABLE sessions (ERROR: permission denied)

const AUDIT_FILE = path.join(os.homedir(), '.uxermanager', 'audit.log');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function writeAuditLog(tag, sql, result) {
  // result: { durationMs, rowCount } | { error: string }
  ensureDir();
  rotatIfNeeded();
  const ts = new Date().toISOString();
  const shortSql = sql.length > 200 ? sql.slice(0, 200) + '...' : sql;
  let line;
  if (result.error) {
    line = `${ts} [${tag}] ${shortSql} (ERROR: ${result.error})\n`;
  } else {
    line = `${ts} [${tag}] ${shortSql} (${result.durationMs}ms, ${result.rowCount} rows)\n`;
  }
  fs.appendFileSync(AUDIT_FILE, line, 'utf8');
}

function rotateIfNeeded() {
  if (!fs.existsSync(AUDIT_FILE)) return;
  const stat = fs.statSync(AUDIT_FILE);
  if (stat.size >= MAX_SIZE_BYTES) {
    // audit.log → audit.log.1 (단순 1단계 로테이션)
    const backupFile = AUDIT_FILE + '.1';
    if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
    fs.renameSync(AUDIT_FILE, backupFile);
  }
}

module.exports = { writeAuditLog };
```

**로테이션 정책:**
- 10MB 초과 시 `audit.log` → `audit.log.1`로 이름 변경
- 기존 `audit.log.1`이 있으면 덮어씀 (최대 2개 파일 유지 = 최대 20MB)
- `appendFileSync` 사용: 동기 쓰기로 순서 보장, 로컬 도구 특성상 성능 영향 미미

**`src/routes/execute.js` 변경:**

```js
const { writeAuditLog } = require('../utils/auditLogger');

// POST /execute 내부 — 성공/실패 직후 추가
try {
  const start = Date.now();
  const result = await adapter.execute(config, sql.trim());
  const durationMs = Date.now() - start;
  writeAuditLog('EXECUTE', sql.trim(), { durationMs, rowCount: result.rowCount });
  res.json({ ok: true, ...result, duration: durationMs });
} catch (err) {
  writeAuditLog('EXECUTE', sql.trim(), { error: err.message });
  res.status(400).json({ ok: false, error: err.message });
}

// POST /execute/stream 내부 루프 — 각 SQL 성공/실패 직후 추가
try {
  const start = Date.now();
  const result = await adapter.execute(config, sql);
  const durationMs = Date.now() - start;
  success++;
  writeAuditLog('STREAM', sql, { durationMs, rowCount: result.rowCount });
  send('progress', { step, total, sql, status: 'ok', rowCount: result.rowCount, duration: durationMs });
} catch (err) {
  failed++;
  writeAuditLog('STREAM', sql, { error: err.message });
  send('error', { step, total, sql, error: err.message });
  if (stopOnError) break;
}
```

**태그 구분:**
- `[EXECUTE]` — `POST /execute` 단건 실행
- `[STREAM]` — `POST /execute/stream` 스트리밍 실행
- `[HEALTH]` — 필요 시 추가 (현재는 생략)

---

### 5-4. 자동 재시작 / Watchdog

#### 구현 방법

**접근: Windows Task Scheduler 등록 스크립트 (코드 변경 최소)**

기존 `scripts/` 디렉토리에 PowerShell 스크립트 추가.

**신규 `middleware/scripts/install-watchdog.ps1`:**

```powershell
# UXERManager 미들웨어 — Windows Task Scheduler Watchdog 등록
# 실행 방법: PowerShell에서 관리자 권한으로 실행
# .\scripts\install-watchdog.ps1 -ExePath "C:\path\to\uxermanager.exe"

param(
  [Parameter(Mandatory=$true)]
  [string]$ExePath
)

$TaskName = "UXERManager-Middleware"
$Description = "UXERManager 미들웨어 자동 재시작 (Watchdog)"

# 기존 태스크 제거
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 태스크 액션: exe 실행
$Action = New-ScheduledTaskAction -Execute $ExePath

# 트리거: 로그인 시 + 3분마다 반복 (프로세스 없으면 실행)
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$RepTrigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 3) -Once -At (Get-Date)

# 설정: 이미 실행 중이면 중복 실행 안 함
$Settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)  # 무제한

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description $Description `
  -RunLevel Highest

Write-Host "등록 완료: $TaskName"
Write-Host "시작: Start-ScheduledTask -TaskName '$TaskName'"
```

**신규 `middleware/scripts/uninstall-watchdog.ps1`:**

```powershell
# UXERManager Watchdog 제거
Unregister-ScheduledTask -TaskName "UXERManager-Middleware" -Confirm:$false
Write-Host "제거 완료"
```

**대안 방법 (pm2, node 환경 보유 시):**

```
# 설치
npm install -g pm2
pm2 start uxermanager.exe --name uxermanager
pm2 save
pm2 startup

# 제거
pm2 delete uxermanager
```

**코드 변경 없이 구현 가능한 이유:**
- Task Scheduler의 `MultipleInstances: IgnoreNew` 설정으로 이미 실행 중인 프로세스는 중복 실행 안 함
- 프로세스 비정상 종료 시 `RestartCount 3`, `RestartInterval 1분` 설정으로 자동 재시작
- 미들웨어 코드 자체는 무변경 (단, `pkg` 빌드 exe 경로가 고정 경로여야 함)

---

## 구현 순서

```
1단계 — 핵심 인프라 (다른 기능의 기반)
  1. src/routes/config.js 수정
     - loadRawStore() / saveStore() 내부 함수 구현
     - 구버전 단일 프로파일 자동 마이그레이션 로직
     - loadConfig() 하위 호환 유지 (외부 시그니처 불변)
     - 신규 프로파일 CRUD API 라우터 추가 (GET/POST /profiles, DELETE/POST /profiles/:name/activate)

2단계 — 감사 로그 (독립적, execute.js만 수정)
  2. src/utils/auditLogger.js 신규 생성
  3. src/routes/execute.js 수정 — writeAuditLog 호출 삽입

3단계 — 헬스 엔드포인트 (독립적)
  4. src/routes/health.js 신규 생성
  5. src/index.js 수정 — healthRouter 등록 (app.use('/health', healthRouter))

4단계 — Watchdog 스크립트 (코드 변경 없음)
  6. middleware/scripts/install-watchdog.ps1 신규 생성
  7. middleware/scripts/uninstall-watchdog.ps1 신규 생성

5단계 — 문서 업데이트
  8. middleware/README.md 업데이트
     - 신규 API 엔드포인트 반영 (/health, /config/profiles 등)
     - config.json 다중 프로파일 구조 설명
     - audit.log 경로 및 로테이션 정책
     - Watchdog 설치 방법
```

---

## 파일별 변경 요약

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `src/routes/config.js` | 수정 | 다중 프로파일 구조 전환 + 마이그레이션 + 신규 라우터 4개 |
| `src/routes/execute.js` | 수정 | writeAuditLog 호출 2곳 삽입 |
| `src/routes/health.js` | 신규 | GET /health 라우터 |
| `src/index.js` | 수정 | healthRouter 등록 1줄 추가 |
| `src/utils/auditLogger.js` | 신규 | 감사 로그 작성 + 로테이션 |
| `scripts/install-watchdog.ps1` | 신규 | Task Scheduler 등록 스크립트 |
| `scripts/uninstall-watchdog.ps1` | 신규 | Task Scheduler 제거 스크립트 |
| `middleware/README.md` | 수정 | 신규 API·구조·운영 문서 반영 |

---

## 주요 설계 결정 근거

| 결정 | 근거 |
|------|------|
| `loadConfig()` 시그니처 불변 | `execute.js`, `schema.js`가 import 중 — 변경 시 2개 파일 추가 수정 필요 |
| 마이그레이션을 `loadRawStore()`에서 자동 처리 | 사용자 개입 없이 기존 config.json 보존 |
| `audit.log` 동기 쓰기 (`appendFileSync`) | 로컬 단일 사용자 도구이므로 성능 영향 없음, 순서 보장 단순 |
| health 엔드포인트에서 `adapter.test()` 재사용 | 어댑터별 `SELECT 1` 로직 중복 없음 |
| Watchdog은 스크립트 전용, 코드 변경 없음 | 미들웨어 자체는 단순 Express 서버로 유지 |
| HTTP 200 고정 (ok: false 포함) | 클라이언트가 4xx/5xx로 오류 처리하지 않고 `db.connected`로 판단 |
