## 요청 요약

ERD UI에서 미들웨어의 다중 프로파일 API(`/config/profiles`)를 연동하여
사용자가 저장된 DB 접속 프로파일 목록 확인, 활성 프로파일 전환, 새 프로파일 추가,
프로파일 삭제를 할 수 있는 UI를 구현한다.

---

## 탐색한 파일

| 파일 | 탐색 이유 및 주요 발견사항 |
|---|---|
| `js/db_connect.js` | 미들웨어 연결 설정 UI 전체 구현 파일. `MW_URL = 'http://127.0.0.1:3737'` 상수, `_mwPing()` / `_mwGetConfig()` 헬퍼, `_renderDbConnectModal()` 패턴(JS로 DOM 동적 생성 후 `document.body.appendChild`)을 파악함. `form-row` / `form-label` 클래스는 CSS 파일에 없이 클래스명만 사용(스타일 없음) — 실제 레이아웃은 `style=""` 인라인으로 처리. 버튼 클래스는 `btn`, `btn-cancel-m`, `btn-save-m`, `btn-del-m`, `btn-primary`를 사용. |
| `js/reverse_engineer.js` | 미들웨어 의존 기능의 또 다른 예시. `_mwPing()` / `_mwGetConfig()` 를 db_connect.js에서 그대로 공유 사용. 모달 동적 생성 패턴 동일. |
| `index.html` | 스크립트 로드 순서 확인: `db_connect.js` → `reverse_engineer.js` → `main.js` 순서. 공유 메뉴(공유 메뉴 드롭다운)에 `openDbConnectModal()` 진입점이 있음. 도구 메뉴에 `openReverseEngineerModal()` 진입점이 있음. 새 파일 추가 시 `index.html` 스크립트 태그도 추가 필요. |
| `middleware/src/routes/config.js` | 프로파일 API 4개 엔드포인트 구현 확인. `GET /config/profiles` 응답: `{ active: string, profiles: [ { name, dbType, host, port, database, username, password:"••••••••" } ] }`. `POST /config/profiles` 바디: `{ name, dbType, host, port, database, username, password }`. `DELETE /config/profiles/:name` — 활성 프로파일 삭제 불가, 마지막 프로파일 삭제 불가. `POST /config/profiles/:name/activate` — 전환 후 DB 풀 닫힘. 구버전 단일 config 자동 마이그레이션 내장. |
| `js/config.js` | localStorage 키: `uxerd_v3`, `erd_snapshots`, `erd_theme`, `uxerd_col_templates`, `erd_ai_key` 확인. 프로파일 관련 키 없음 — 새로 추가 불필요. |
| `css/modal.css` | `.modal-overlay`, `.modal`, `.form-input`, `.form-err`, `.btn-cancel-m`, `.btn-save-m`, `.btn-del-m`, `.modal-actions` 등 기존 스타일 확인. 프로파일 UI에 그대로 재사용 가능. |

---

## 영향 분석

- **단축키 변경**: 없음. 새 모달은 키보드 단축키를 새로 바인딩하지 않는다.
- **새 localStorage 키**: 없음. 프로파일 데이터는 미들웨어 서버(파일시스템)에 저장되므로 프론트엔드 localStorage 변경 없음.
- **기타 파급 효과**:
  - `db_connect.js`의 `_mwGetConfig()` 함수가 `GET /config`(활성 프로파일만 반환)를 호출한다. 프로파일 관리 모달은 `GET /config/profiles`(전체 목록)를 별도 호출하므로 기존 함수와 충돌 없음.
  - `reverse_engineer.js`의 `openReverseEngineerModal()`은 `_mwGetConfig()`로 활성 프로파일 유무만 확인하므로, 프로파일 전환 후에도 정상 동작.
  - `index.html`에 `<script src="js/profile_manager.js">` 1줄 추가 필요.
  - 메뉴바 "공유" 드롭다운에 새 메뉴 항목 1개 추가 필요.

---

## 구현 계획

### 파일 1: `js/profile_manager.js` (신규 생성)

- **변경 위치**: 신규 파일 — `db_connect.js`와 같은 디렉터리
- **변경 내용**: 프로파일 관리 모달 전체 로직

#### 함수 구조

```
openProfileManagerModal()         — 진입점. _mwPing() 확인 → 프로파일 목록 로드 → 모달 렌더/표시
closeProfileManagerModal()        — 모달 닫기
_loadProfiles()                   — GET /config/profiles 호출, { active, profiles } 반환
_renderProfileManagerModal(data)  — 모달 DOM 생성 또는 업데이트
_renderProfileList(data)          — #pmProfileList 내부 HTML 재생성
_activateProfile(name)            — POST /config/profiles/:name/activate 호출 → _refreshProfileList()
_deleteProfile(name)              — POST confirm → DELETE /config/profiles/:name → _refreshProfileList()
_refreshProfileList()             — _loadProfiles() 후 _renderProfileList() 갱신 (모달 닫지 않음)
_openAddProfileForm()             — 모달 하단 폼 표시 (인라인 토글)
_closeAddProfileForm()            — 폼 숨기기
_submitAddProfile()               — POST /config/profiles 호출 → _refreshProfileList() → 폼 초기화
_pmErrShow(msg) / _pmErrClear()   — 폼 오류 표시 헬퍼
```

#### 모달 UI 구조

```
[모달 헤더] "DB 접속 프로파일 관리"

[프로파일 목록 영역] #pmProfileList
  각 프로파일 행 (flex):
    ┌─────────────────────────────────────────────────────┐
    │ [활성 뱃지 or 빈 공간] 프로파일명  dbType·host:port  │
    │                               [전환] [삭제]         │
    └─────────────────────────────────────────────────────┘
  - 활성 프로파일 행: 녹색 "✔ 활성" 뱃지 표시, [전환] 버튼 비활성화(disabled)
  - 비활성 프로파일 행: [전환 btn-primary] [삭제 btn-del-m 스타일 inline]
  - 삭제 버튼: 활성 프로파일이거나 프로파일이 1개이면 disabled

[구분선]

[+ 새 프로파일 추가] 버튼 (btn-add-attr 스타일) → 클릭 시 폼 토글

[추가 폼 (기본 숨김)] #pmAddForm
  - 프로파일 이름 (text)
  - DB 종류 (select: postgres/mysql/mssql) → 포트 자동 설정
  - 호스트 (text) + 포트 (number) — flex row
  - 데이터베이스 (text)
  - 사용자명 (text)
  - 비밀번호 (password)
  - [오류 메시지] #pmAddErr
  - [취소] [저장] 버튼

[modal-actions]
  [닫기 btn-cancel-m]
```

#### 핵심 코드 패턴 (db_connect.js 준수)

```javascript
const MW_URL = 'http://127.0.0.1:3737';   // 이미 db_connect.js에 선언됨 → 재선언 금지
// MW_URL은 db_connect.js 로드 이후 전역에서 사용 가능

async function openProfileManagerModal() {
  const running = await _mwPing();          // db_connect.js 공유 함수
  if (!running) { _showMwNotRunning(); return; }  // db_connect.js 공유 함수

  const data = await _loadProfiles();
  _renderProfileManagerModal(data);
  document.getElementById('pmOverlay').classList.add('active');
}
```

- `_mwPing()`, `_showMwNotRunning()` 는 `db_connect.js`에서 전역 선언된 함수를 그대로 사용
- `MW_URL` 상수는 `db_connect.js`에서 이미 전역 선언 → 재선언하지 않음
- 모달 ID: `pmOverlay` (기존 ID와 충돌 없음)

---

### 파일 2: `index.html`

#### 변경 위치 A: 메뉴바 "공유" 드롭다운

- **변경 내용**: `openDbConnectModal()` 메뉴 항목 아래에 프로파일 관리 항목 추가

```html
<!-- 기존 -->
<div class="mb-item" onclick="mbClose();openDbConnectModal()">
  <span class="mb-ico">🔌</span><span class="mb-text">DB 연결 설정</span>
</div>

<!-- 추가 (기존 항목 바로 아래) -->
<div class="mb-item" onclick="mbClose();openProfileManagerModal()">
  <span class="mb-ico">🗂</span><span class="mb-text">DB 프로파일 관리</span>
</div>
```

- **이유**: 기존 "DB 연결 설정"과 동일한 위치 계층에 배치하여 사용자가 자연스럽게 발견

#### 변경 위치 B: 스크립트 로드 태그

- **변경 내용**: `db_connect.js` 로드 직후에 추가

```html
<!-- 기존 -->
<script src="js/db_connect.js"></script>
<script src="js/reverse_engineer.js"></script>

<!-- 변경 후 -->
<script src="js/db_connect.js"></script>
<script src="js/profile_manager.js"></script>   <!-- 추가 -->
<script src="js/reverse_engineer.js"></script>
```

- **이유**: `profile_manager.js`가 `MW_URL`, `_mwPing()`, `_showMwNotRunning()` 을 사용하므로 `db_connect.js` 이후에 로드해야 함

---

## 기존 코드 변경 없음 확인

| 파일 | 변경 여부 | 근거 |
|---|---|---|
| `js/db_connect.js` | **변경 없음** | `MW_URL`, `_mwPing()` 등이 이미 전역 함수로 선언되어 있어 `profile_manager.js`에서 직접 사용 가능 |
| `js/reverse_engineer.js` | **변경 없음** | 활성 프로파일 확인 로직(`_mwGetConfig()`)은 영향 없음 |
| `css/` 전체 | **변경 없음** | 기존 `.modal`, `.form-input`, `.btn-*` 클래스로 충분히 스타일링 가능 |
| `js/config.js` | **변경 없음** | 새 localStorage 키 불필요 |
