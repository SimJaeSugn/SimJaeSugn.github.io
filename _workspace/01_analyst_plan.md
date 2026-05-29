# 01 analyst plan — profile_manager.js 인라인 onclick 인자 이스케이프 버그 수정

## 요청 요약

`js/profile_manager.js`의 인라인 `onclick` 핸들러에서, 사용자 입력(프로파일 이름/호스트/DB명/사용자명/클라이언트 경로)을
**double-quoted HTML 속성 안의 single-quoted JS 문자열 리터럴** 컨텍스트에 삽입할 때 텍스트용 HTML 엔티티 인코더
`_pmEsc`만 사용하고 있다. `_pmEsc`는 `'`를 `&#39;`로 바꾸는데, 브라우저가 HTML 속성을 디코드하는 단계에서
`&#39;`가 다시 `'`로 환원되어 JS 문자열 리터럴을 탈출시킨다 → SyntaxError(버튼 동작 실패) 및
`'),alert(1)//` 형태 이름으로 저장 XSS(스크립트 주입)가 가능하다.

수정 목표:
1. JS 문자열 리터럴 + double-quoted HTML 속성 **양쪽 모두 안전한** 새 이스케이프 헬퍼를 `_pmEsc` 정의 근처(238행 부근)에 추가한다.
2. **onclick 인자로 쓰이는 호출부만** 새 헬퍼로 교체한다. 표시용 텍스트(innerHTML 텍스트) 컨텍스트는 `_pmEsc` 그대로 유지한다.

추가 제약(자동 워크플로 보류 사유 해소): 원 제안 패치가 참조한 헬퍼 `_pmEscJsAttr`와 변수 `eJs`/`eNameJs`는
코드베이스에 존재하지 않아 그대로 적용하면 ReferenceError로 목록·편집 전체가 깨진다. 따라서 본 계획은
**(a) 헬퍼를 실제로 정의하고, (b) 호출부가 참조하는 변수가 실제로 존재하도록 자기완결적으로** 구성한다.

분석 근거: `docs/report/19-공유-DB프로파일.md` (오류 5건: e1 high, e2 medium, e3 low, e4 low(오류아님으로 분류했으나 호출부 e5와 함께 실재), e5 medium).

---

## 탐색한 파일

- `js/profile_manager.js`: 버그 본체. `_pmEsc` 정의(238-245행), `_renderProfileList` map 본문의 onclick 5종(304/316/319/325행), editArgs 구성(306-314행), `_renderRightPanel('edit')`의 저장 버튼(476/535행), `_pmSelectProfile`/`_openEditProfileForm`의 textContent 매칭 로직(140-143/347-352행), 호출 대상 함수 시그니처(`_activateProfile` 36행, `_deleteProfile` 48행, `_openEditProfileForm` 137행, `_submitEditProfile` 164행) 확인.
- `docs/report/19-공유-DB프로파일.md`: 오류 5건 상세 및 보류 사유(미정의 헬퍼/변수 참조) 확인. e5(54행)에 제안된 자가완결 형태(`String(p.name).replace(/\\/g,'\\\\').replace(/'/g,"\\'")`)도 확인.

---

## 영향 분석

- **단축키 변경**: 없음. `shortcuts.js`와 무관. 본 모듈은 단축키를 등록/소비하지 않음.
- **새 localStorage 키**: 없음. 프로파일 데이터는 미들웨어(MW_URL `/config/profiles`)에 저장되며 localStorage·diagrams 배열·snapshots와 무관(보고서 1절 명시).
- **새 데이터 배열/상태 변수**: 없음. 새 전역 상태 추가 없음. 추가되는 것은 순수 함수 헬퍼 1개와, 렌더 함수 내부 지역 변수(let/const) 몇 개뿐.
- **백업/undo·redo 영향**: 없음. 전체백업·undo/redo 대상 데이터(diagrams/ENTITIES 등)를 다루지 않음.
- **export/import 영향**: 없음. export.js/import.js와 무관.
- **표시·매칭 정합성(확인 필요 → 검토 결과 영향 없음)**:
  - `_pmSelectProfile`(347-352)과 `_openEditProfileForm`(140-143)은 `el.querySelector('.pm-item-name')?.textContent`(= 디코드된 **원본** 이름)와 onclick으로 전달된 `name` 인자를 `n === name`으로 비교한다.
  - 올바른 이스케이프 헬퍼는 "HTML 속성 디코드 → JS 파서 해석"을 거친 뒤 **원본 문자열을 그대로 복원**하므로, onclick으로 전달되는 `name`은 textContent와 동일한 원본 값이 된다 → 기존 매칭 로직 변경 불필요. (잘못된 `_pmEsc`로는 이 매칭이 깨지므로, 새 헬퍼 적용이 오히려 매칭을 정상화한다.)
- **HTML escape 범위 메모**: `_pmEsc`는 `>`도 `&gt;`로 바꾸지만, double-quoted 속성값 안에서 `>`는 이스케이프가 불필요하다. 새 헬퍼는 `&`/`"`/`<`만 HTML-escape하면 안전하다(`<`는 속성값 내에서도 인코딩하는 것이 보수적으로 안전).

---

## 새 헬퍼 정의 (정확한 함수 본문 — replace 체인과 순서)

`_pmEsc` 정의(238-245행) **바로 아래**(즉 245행 닫는 `}` 다음 줄)에 아래 함수를 신규 추가한다.

```javascript
// XSS 방지: double-quoted HTML 속성 안의 single-quoted JS 문자열 리터럴 컨텍스트
// (예: onclick="fn('...')") 에 안전하게 삽입. 1) JS escape → 2) HTML-attr escape 순서.
//   브라우저는 HTML 속성을 먼저 디코드한 뒤 JS 파서에 넘기므로, JS escape를 먼저 적용해야
//   디코드 후 JS 파서가 올바른 문자열 리터럴을 받는다.
function _pmEscJsAttr(str) {
  return String(str)
    // 1) JS 문자열 리터럴 escape (이 순서가 중요: 백슬래시 먼저)
    .replace(/\\/g, '\\\\')   // \  → \\
    .replace(/'/g, "\\'")     // '  → \'
    .replace(/\r/g, '\\r')    // CR → \r
    .replace(/\n/g, '\\n')    // LF → \n
    // 2) HTML 속성(double-quoted) escape
    .replace(/&/g, '&amp;')   // &  → &amp;   (먼저 처리해 이중 인코딩 방지)
    .replace(/"/g, '&quot;')  // "  → &quot;  (속성 종료 방지)
    .replace(/</g, '&lt;');   // <  → &lt;    (보수적 안전)
}
```

**순서 근거(반드시 이 순서):**
1. JS escape를 **먼저** 한다. 이때 백슬래시(`\` → `\\`)를 가장 먼저 처리해야, 이후 `'` → `\'`로 추가한 백슬래시가 다시 escape되지 않는다.
2. 개행(`\r`/`\n`)은 인라인 속성 내 JS 문자열을 깨뜨리므로 `\r`/`\n`으로 escape(제거가 아닌 escape).
3. 그 다음 HTML 속성 escape를 한다. `&`를 먼저 처리해 1단계에서 생성된 백슬래시 시퀀스와 무관하게 이중 인코딩을 막는다. `"`는 double-quoted 속성을 조기 종료시키므로 `&quot;`로, `<`는 보수적으로 `&lt;`로 인코딩한다.
4. `'`는 HTML 단계에서 인코딩하지 **않는다**(1단계에서 이미 `\'`로 JS escape됨, 속성은 double-quote이므로 `'`가 속성을 종료시키지 않음). `_pmEsc`처럼 `'`를 `&#39;`로 바꾸면 디코드 후 `'`로 환원되어 다시 버그가 재발하므로 절대 하지 않는다.

**복원 검증(예시 `O'Brien`):**
- `_pmEscJsAttr("O'Brien")` → `O\'Brien`
- HTML 디코드: `&`/`"`/`<` 없으므로 그대로 `O\'Brien`
- JS 파서가 `'O\'Brien'`을 해석 → 원본 `O'Brien` 복원 → textContent 매칭 정상.

**주입 차단 검증(예시 `'),alert(1)//`):**
- `_pmEscJsAttr("'),alert(1)//")` → `\'),alert(1)//` (`'`만 `\'`로 escape)
- onclick에 삽입 시 `fn('\'),alert(1)//')` → 인자 문자열은 `'),alert(1)//` 리터럴로만 해석되어 주입 불가.

---

## 구현 계획

표시용 텍스트 컨텍스트(`_pmEsc` **유지**)와 onclick 인자 컨텍스트(`_pmEscJsAttr` **교체**)를 명확히 구분한다.

### 파일: js/profile_manager.js

#### (A) 헬퍼 추가
- 위치: `_pmEsc` 정의 종료 직후(245행 `}` 다음 줄, 247행 `// ── DOM 렌더 ──` 주석 위).
- 변경 내용: 위 "새 헬퍼 정의" 블록의 `_pmEscJsAttr` 함수를 그대로 추가.
- 이유: onclick 인자 컨텍스트 전용 안전 이스케이프 제공. (a) 보류 사유였던 "미정의 헬퍼"를 실제 정의.

#### (B) `_renderProfileList` map 본문 — onclick 인자 변수 분리 및 교체 (295-333행)

- 위치: 298행 `const eName = _pmEsc(p.name);` 아래.
- 변경 내용: onclick 전용 변수들을 신규 추가(표시용 `eName`은 유지). 예:
  ```javascript
  const eName     = _pmEsc(p.name);                       // (유지) 표시용 텍스트
  const jName     = _pmEscJsAttr(p.name);                 // (신규) onclick 인자용
  const jDbType   = _pmEscJsAttr(p.dbType);               // (신규)
  const jHost     = _pmEscJsAttr(p.host);                 // (신규)
  const jDatabase = _pmEscJsAttr(p.database);             // (신규)
  const jUsername = _pmEscJsAttr(p.username);             // (신규)
  const jLibDir   = _pmEscJsAttr(p.clientLibDir || '');   // (신규)
  ```
- 이유: 보류 사유였던 "미정의 변수 `eJs`/`eNameJs` 참조"를 해소 — 호출부가 참조할 변수를 실제로 정의해 자기완결화.

##### (B-1) 전환 버튼 onclick — 304행
- 변경 전: `... onclick="event.stopPropagation();_activateProfile('${eName}')"`
- 변경 후: `... onclick="event.stopPropagation();_activateProfile('${jName}')"`
- 이유: e2. JS 문자열 리터럴 컨텍스트 → `_pmEsc` 대신 `_pmEscJsAttr` 결과 사용. `_activateProfile(name)`은 디코드된 원본 이름을 받아 `encodeURIComponent(name)`로 URL 구성(38행)하므로 원본 복원이 정확해야 함.

##### (B-2) editArgs 구성 — 306-314행
- 변경 전:
  ```javascript
  const editArgs = [
    `'${eName}'`,
    `'${_pmEsc(p.dbType)}'`,
    `'${_pmEsc(p.host)}'`,
    p.port || 'null',
    `'${_pmEsc(p.database)}'`,
    `'${_pmEsc(p.username)}'`,
    `'${_pmEsc(p.clientLibDir || '')}'`
  ].join(',');
  ```
- 변경 후:
  ```javascript
  const editArgs = [
    `'${jName}'`,
    `'${jDbType}'`,
    `'${jHost}'`,
    p.port || 'null',
    `'${jDatabase}'`,
    `'${jUsername}'`,
    `'${jLibDir}'`
  ].join(',');
  ```
- 이유: e2. 편집 버튼은 name/dbType/host/database/username/clientLibDir 6개를 JS 문자열 인자로 전달(316행 `_openEditProfileForm(${editArgs})`). 하나라도 `'` 포함 시 편집 버튼 전체가 깨지므로 6개 모두 `_pmEscJsAttr`로 교체. `port`는 숫자/`null`이라 이스케이프 불필요(현행 유지). `_openEditProfileForm`(137행)은 받은 값을 `_renderRightPanel('edit', {...})`로 전달하므로 원본 복원 필요.

##### (B-3) 삭제 버튼 onclick — 319행
- 변경 전: `... onclick="event.stopPropagation();_deleteProfile('${eName}')"`
- 변경 후: `... onclick="event.stopPropagation();_deleteProfile('${jName}')"`
- 이유: e2. `_deleteProfile(name)`도 `encodeURIComponent(name)`로 DELETE URL 구성(51행), confirm 메시지 표시(49행). 원본 복원 필요.

##### (B-4) 항목 선택 onclick — 325행
- 변경 전: `onclick="_pmSelectProfile('${eName}')">`
- 변경 후: `onclick="_pmSelectProfile('${jName}')">`
- 이유: e3. `_pmSelectProfile(name)`은 textContent(원본)와 `n === name` 매칭(350-351행). `_pmEscJsAttr`가 원본을 복원하므로 매칭 정상화.

##### (B-5) 표시용 텍스트 — 327, 328행 (변경 없음 / 유지 명시)
- 327행 `<div class="pm-item-name">${eName}</div>` → **유지** (`_pmEsc`).
- 328행 `<div class="pm-item-info">${_pmEsc(p.dbType)} · ${_pmEsc(p.host)}:${p.port || '-'}</div>` → **유지** (`_pmEsc`).
- 이유: innerHTML 텍스트 컨텍스트이므로 HTML 엔티티 인코딩(`_pmEsc`)이 정확하다. 여기서 `_pmEscJsAttr`를 쓰면 안 됨(백슬래시가 텍스트로 노출됨).

#### (C) 상세 패널 `_renderRightPanel('detail')` — 373-402행 (변경 없음 / 유지 명시)
- 379/383/387/391/395/400행의 모든 `${_pmEsc(...)}` → **유지**.
- 이유: 전부 `.pm-detail-value` innerHTML 텍스트 컨텍스트. onclick 인자 아님.

#### (D) 편집 폼 `_renderRightPanel('edit')` — 474-536행

##### (D-1) onclick 전용 변수 추가 — 476행 아래
- 위치: 476행 `const eName = _pmEsc(p.name);` 아래.
- 변경 내용: onclick 전용 변수 신규 추가(표시용 `eName` 유지):
  ```javascript
  const eName  = _pmEsc(p.name);        // (유지) 478행 폼 제목 텍스트용
  const jName  = _pmEscJsAttr(p.name);  // (신규) 535행 저장 버튼 onclick 인자용
  ```
- 이유: e5. 보류 사유였던 미정의 변수 `eNameJs` 대신 실제 변수 `jName`을 정의해 자기완결화.

##### (D-2) 폼 제목 텍스트 — 478행 (변경 없음 / 유지 명시)
- 478행 `<div class="pm-section-title">'${eName}' 편집</div>` → **유지** (`_pmEsc`).
- 이유: innerHTML 텍스트 컨텍스트.

##### (D-3) 저장 버튼 onclick — 535행
- 변경 전: `<button class="btn-save-m" id="pmEditSaveBtn" onclick="_submitEditProfile('${eName}')">저장</button>`
- 변경 후: `<button class="btn-save-m" id="pmEditSaveBtn" onclick="_submitEditProfile('${jName}')">저장</button>`
- 이유: e4/e5. JS 문자열 리터럴 컨텍스트. `_submitEditProfile(name)`(164행)은 받은 name으로 PUT URL을 구성하므로 원본 복원 필요.

#### (E) 변경하지 않는 onclick (인자가 사용자 입력 아님 — 유지 명시)
- 265, 272, 415, 430, 458, 467, 468, 482, 525, 534행의 `onclick`/`oninput`/`onchange`: 모두 정적 문자열 또는 `this`/DOM 참조만 사용하고 사용자 입력 문자열을 인라인 인자로 끼워넣지 않으므로 **변경 불필요**.

---

## 검토 체크리스트 (integration-checker 용)

- [ ] `_pmEscJsAttr` 함수가 245행 직후에 실제로 정의되어 있는가 (보류 사유 (a) 해소).
- [ ] 교체된 onclick이 참조하는 변수(`jName`/`jDbType`/`jHost`/`jDatabase`/`jUsername`/`jLibDir`)가 모두 같은 스코프에 실제 선언되어 있는가 (보류 사유 (b) 해소). `eJs`/`eNameJs`/`_pmEscJsAttr` 미정의 참조가 남아있지 않은지 grep 재확인.
- [ ] 표시용 텍스트(327/328/379/383/387/391/395/400/478행)는 `_pmEsc` 유지, onclick 인자(304/308-313/319/325/535행)만 `_pmEscJsAttr`/신규 변수로 교체되었는가.
- [ ] `'`/`\`/개행/`"`/`<`/`&` 포함 이름으로 전환·편집·삭제·선택·저장 5개 동작 수동 회귀 (예: `O'Brien`, `a\b`, `'),alert(1)//`, `"x"`).
- [ ] `_pmSelectProfile`/`_openEditProfileForm`의 textContent `n === name` 매칭이 새 헬퍼 적용 후에도 성립하는가(원본 복원 확인).
- [ ] 단축키/localStorage/백업/export·import 영향 없음 재확인(본 계획 영향 분석 참조).

## 영향 없음 확인 (요약)
- 단축키: 없음 / localStorage 새 키: 없음 / 새 데이터 배열·상태 변수: 없음 / 백업·undo·redo: 영향 없음 / export·import: 영향 없음.
- 변경 표면: 순수 함수 1개 추가 + 렌더 함수 내부 지역 변수/문자열 보간 교체뿐. 외부 API·데이터 모델 변경 없음.
