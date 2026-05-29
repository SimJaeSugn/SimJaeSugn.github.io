## 요청 요약

DB 연결 설정 모달(`js/db_connect.js`)에서 `dbType`이 `oracle`일 때:
1. Oracle Instant Client 설치 안내 문구 표시
2. `clientLibDir` 경로 입력 필드 표시

미들웨어 백엔드(`oracle.js`)는 `config.clientLibDir`을 이미 지원하지만, 라우트(`routes/config.js`)와 프론트엔드(`db_connect.js`) 모두에서 이 필드가 빠져 있습니다.

---

## 탐색한 파일

- `js/db_connect.js`: DB 연결 설정 모달 전체 구현. `_renderDbConnectModal`, `_fillForm`, `saveDbConfig`, `testDbConfig`, `_onDbTypeChange` 함수 포함
- `middleware/src/routes/config.js`: POST /config, POST /config/profiles, PUT /config/profiles/:name 라우트. `schema` 필드는 처리하지만 `clientLibDir`은 미처리
- `middleware/src/db/adapters/oracle.js`: `getPool(config)`이 `config.clientLibDir`을 `initThickMode()`에 전달 — 백엔드 지원 완료
- `middleware/src/db/connector.js`: 어댑터 라우팅만 담당, 변경 불필요
- `middleware/README.md`: `clientLibDir` 필드 언급 있음(지원 DB 섹션), 하지만 API 레퍼런스 요청 Body 예시에는 누락

---

## 영향 분석

- **단축키 변경**: 없음
- **새 localStorage 키**: 없음 (모달은 서버 저장, LocalStorage 미사용)
- **새 데이터 구조**: `clientLibDir` 필드가 프로파일 객체에 추가됨 (선택 필드, Oracle 전용)
- **기타 파급 효과**:
  - `middleware/src/routes/config.js`의 POST /config, POST /config/profiles, PUT /config/profiles/:name, GET /config 응답에 `clientLibDir` 포함 필요
  - `middleware/README.md` API 레퍼런스 요청 Body 예시에 `clientLibDir` 추가 필요 (CLAUDE.md 미들웨어 README 동기화 규칙)

---

## 구현 계획

### 파일 1: `js/db_connect.js`

**변경 위치 1: `_onDbTypeChange` 함수**

Oracle 선택 시 `#dbConnOracleSection` 행을 표시하고, 다른 DB 선택 시 숨기도록 확장:

```javascript
function _onDbTypeChange() {
  const type = document.getElementById('dbConnType').value;
  const defaults = { postgres: 5432, mysql: 3306, mssql: 1433, oracle: 1521 };
  const portEl = document.getElementById('dbConnPort');
  if (!portEl.dataset.userEdited) portEl.value = defaults[type] || 5432;

  // Oracle 전용 섹션 토글
  const oracleSection = document.getElementById('dbConnOracleSection');
  if (oracleSection) oracleSection.style.display = type === 'oracle' ? '' : 'none';
}
```

**변경 위치 2: `_renderDbConnectModal` 함수 내 HTML**

비밀번호 입력 행 다음, `form-err` div 앞에 Oracle 전용 섹션 추가:

```html
<div id="dbConnOracleSection" style="display:none">
  <div class="form-row" style="background:var(--bg-surface);border:1px solid var(--bd2);
    border-radius:6px;padding:10px 12px;margin-bottom:4px">
    <p style="margin:0 0 6px;font-size:12px;color:var(--tx-sub);line-height:1.6">
      <strong>Oracle Instant Client 안내</strong><br>
      node-oracledb 기본 모드(Thin)는 Oracle DB 12.1 이상만 지원합니다.
      구버전 DB에 연결하려면 Oracle Instant Client를 설치하고 아래에 경로를 입력하세요.<br>
      <a href="https://www.oracle.com/database/technologies/instant-client/downloads.html"
         target="_blank" style="color:var(--ac)">Instant Client 다운로드</a>
    </p>
    <label class="form-label">Instant Client 경로 <span style="color:var(--tx-muted)">(선택)</span></label>
    <input class="form-input" id="dbConnClientLibDir" type="text"
      placeholder="예: C:\oracle\instantclient_21_3">
  </div>
</div>
```

**변경 위치 3: `saveDbConfig` 함수 — payload 구성**

Oracle 선택 시 `clientLibDir`을 payload에 포함:

```javascript
if (payload.dbType === 'oracle') {
  const libDir = document.getElementById('dbConnClientLibDir').value.trim();
  if (libDir) payload.clientLibDir = libDir;
}
```

**변경 위치 4: `testDbConfig` 함수 — payload 구성**

`saveDbConfig`와 동일하게 Oracle 전용 `clientLibDir` 포함.

**변경 위치 5: `_fillForm` 함수**

기존 config 로드 시 `clientLibDir` 값 복원 및 `_onDbTypeChange()` 호출로 섹션 표시:

```javascript
_onDbTypeChange(); // 섹션 표시/숨김 적용
const libDirEl = document.getElementById('dbConnClientLibDir');
if (libDirEl && cfg.clientLibDir) libDirEl.value = cfg.clientLibDir;
```

---

### 파일 2: `middleware/src/routes/config.js`

**변경 위치 1: GET /config 응답**

응답에 `clientLibDir: config.clientLibDir || ''` 추가

**변경 위치 2: POST /config — 디스트럭처링 및 저장**

`clientLibDir`을 req.body에서 추출하고 저장 객체에 포함:
- `const { ..., clientLibDir } = req.body;`
- 저장 시: `clientLibDir: (dbType === 'oracle' && clientLibDir) ? clientLibDir : ''`

**변경 위치 3: POST /config/test**

`clientLibDir`을 테스트 어댑터 호출 시 전달

**변경 위치 4: POST /config/profiles**

신규 프로파일 저장 시 `clientLibDir` 포함

**변경 위치 5: PUT /config/profiles/:name**

프로파일 수정 시 `clientLibDir` 반영 (미지정 시 기존 값 유지)

---

### 파일 3: `middleware/README.md`

CLAUDE.md 미들웨어 README 동기화 규칙에 따라:
- POST /config 요청 Body 예시에 `clientLibDir` 선택 필드 및 설명 추가
- POST /config/profiles 요청 Body 예시에 `clientLibDir` 선택 필드 추가
- PUT /config/profiles/:name 요청 바디에 `clientLibDir` 선택 필드 추가
- GET /config 응답 예시에 `clientLibDir` 필드 추가

---

## 구현 시 주의사항

1. **`_fillForm` 내 `_onDbTypeChange()` 호출 순서**: `_fillForm` 내에서 dbType을 select에 채운 직후 `_onDbTypeChange()`를 호출하면 Oracle 섹션 표시/숨김이 정확히 동작함
2. **`initThickMode`는 프로세스당 1회만 호출 가능**: 이미 `_thickInitDone` 플래그로 보호되어 있음. 프로파일 전환 시 `clientLibDir`이 달라도 이미 초기화된 경우 재적용 불가 — 알려진 제약, UI 안내 불필요
3. **기존 저장된 프로파일 마이그레이션**: `clientLibDir`이 없는 기존 프로파일은 `|| ''` 처리로 안전하게 처리됨
