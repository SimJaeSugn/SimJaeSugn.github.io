# 04_review.md — Reviewer 독립 리뷰

## 리뷰 요약
- **전체 평가: PASS (주의사항 있음)**

주의사항은 보안 취약점이 아니라 방어 심도 측면에서 `>` 미이스케이프 언급이며, 현재 컨텍스트에서는 실제 위험이 없음. 핵심 버그(onClick 인자 XSS/깨짐)는 올바르게 수정됨.

---

## 검증 항목별 결과

### 1. `_pmEscJsAttr` replace 체인 순서 — HTML 속성 디코드 → JS 파서 파이프라인

**결과: 정확함**

코드(251–262행):
```
replace(/\\/g, '\\\\')   // 1) 백슬래시 먼저 → \\
replace(/'/g, "\\'")     // 2) 따옴표 → \'
replace(/\r/g, '\\r')    // 3) CR
replace(/\n/g, '\\n')    // 4) LF
replace(/&/g, '&amp;')   // 5) & HTML escape (먼저 — 이중 인코딩 방지)
replace(/"/g, '&quot;')  // 6) " 속성 종료 차단
replace(/</g, '&lt;');   // 7) < 보수적 차단
```

파이프라인 시뮬레이션 직접 실행 결과 (15가지 케이스 전부 PASS):

| 입력 | escaped | HTML decode | JS parse | 원본 복원 |
|------|---------|-------------|----------|---------|
| `O'Brien` | `O\'Brien` | `O\'Brien` | `O'Brien` | OK |
| `a\b` | `a\\b` | `a\\b` | `a\b` | OK |
| `O\'Brien` | `O\\\'Brien` | `O\\\'Brien` | `O\'Brien` | OK |
| `'),alert(1)//` | `\'),alert(1)//` | `\'),alert(1)//` | `'),alert(1)//` | OK(주입 차단) |
| `say "hello"` | `say &quot;hello&quot;` | `say "hello"` | `say "hello"` | OK |
| `<script>alert(1)</script>` | `&lt;script>alert(1)&lt;/script>` | `<script>…` | 문자열 인자 | OK |
| `a&b` | `a&amp;b` | `a&b` | `a&b` | OK |
| `line1\nline2` | `line1\\nline2` | `line1\\nline2` | `line1\nline2` | OK |

**백슬래시 순서 근거 확인**: `replace(/\\/g, '\\\\')` 가 `replace(/'/g, "\\'")` 보다 앞에 있어, JS escape 단계에서 추가한 `\` 가 HTML escape 단계에서 재처리되지 않음. 순서 역전 버그(`_pmEscJsAttrBroken`) 와 비교 시 `O'Brien` 에서 `O\\\'Brien` vs `O\'Brien` 차이 확인됨 — 현재 구현이 올바름.

**`&` HTML escape 우선 처리**: replace 5번째 단계에서 `&`를 `&amp;`로 처리함으로써, 이후 단계들(`&quot;`, `&lt;`)에서 추가된 `&`가 이중 인코딩되지 않음. 올바름.

---

### 2. 표시용 텍스트 vs onclick 인자 컨텍스트 혼용 여부

**결과: 정확히 구분됨. 혼용 없음.**

- `_renderProfileList` 내 표시 컨텍스트(350–351행): `${eName}`, `${_pmEsc(p.dbType)}`, `${_pmEsc(p.host)}` — 모두 `_pmEsc` 유지.
- `_renderProfileList` 내 onclick 컨텍스트(327, 330–336, 342, 348행): `${jName}`, `${jDbType}`, `${jHost}`, `${jDatabase}`, `${jUsername}`, `${jLibDir}` — 모두 `_pmEscJsAttr` 결과.
- `_renderRightPanel('detail')` (398–424행): 전부 `_pmEsc` — 변경 없음, 올바름.
- `_renderRightPanel('edit')` 폼 제목 (502행): `'${eName}' 편집` — `_pmEsc` 유지, 올바름.
- `_renderRightPanel('edit')` 저장 버튼(559행): `'${jName}'` — `_pmEscJsAttr` 결과, 올바름.

`eJs`/`eNameJs` 미정의 변수 잔존 여부 grep: 0건. 올바름.
onclick 컨텍스트에 `_pmEsc` 결과(`eName`) 잔존 여부 grep: 0건. 올바름.
표시 컨텍스트에 `_pmEscJsAttr` 직접 삽입 여부 grep: 0건. 올바름.

---

### 3. 호출 함수들의 인자 사용 흐름 추적

**결과: 기존 동작 깨짐 없음. 오히려 정상화됨.**

**`_pmSelectProfile(name)`** (370–380행):
- `n = el.querySelector('.pm-item-name')?.textContent` — `_pmEsc(p.name)`을 innerHTML에 삽입한 요소의 textContent이므로 브라우저가 HTML decode → 원본 `p.name`.
- `name` 인자 = `jName`이 JS 파서에 의해 복원된 원본 `p.name`.
- `n === name` 매칭: 양쪽 모두 원본 값 → 성립.
- 15가지 케이스 시뮬레이션에서 전부 일치 확인.

**`_openEditProfileForm(name, dbType, host, port, ...)`** (137–146행):
- `name`을 `_pmEditingName`, `_pmSelectedName`에 저장하고, `_renderRightPanel('edit', {...})`에 전달.
- textContent 매칭 로직(141–142행)도 동일하게 원본 비교. 성립.
- `dbType`, `host`, `database`, `username`, `clientLibDir` 모두 `_pmEscJsAttr` 결과가 JS 파서를 거쳐 원본으로 복원된 후 폼 `value`에 직접 할당(561–568행). `value` 할당은 텍스트이므로 추가 이스케이프 불필요. 올바름.

**`_activateProfile(name)`** (36–46행):
- `encodeURIComponent(name)` — 원본 `name` 필요. `_pmEscJsAttr` 복원 후 원본 전달 → 올바름.
- `showToast("'${name}'...")` — 템플릿 리터럴 텍스트 컨텍스트, 이스케이프 불필요.

**`_deleteProfile(name)`** (48–58행):
- `encodeURIComponent(name)` URL 구성 — 원본 복원 필요. 올바름.
- `confirm("'${name}'...")` — 텍스트 컨텍스트, 안전.

**`_submitEditProfile(name)`** (164–203행):
- `encodeURIComponent(name)` URL 구성 — 원본 복원 필요. 올바름.
- `showToast("'${name}'...")` — 텍스트 컨텍스트, 안전.

---

### 4. 요청 범위 초과 변경 여부

**결과: 범위 초과 없음.**

git diff 확인:
- 추가: `_pmEscJsAttr` 함수 정의 18행 (247–262행)
- 수정: `_renderProfileList` 내 변수 추가 6행 + onclick 보간 교체 7곳
- 수정: `_renderRightPanel('edit')` 내 변수 추가 1행 + onclick 교체 1곳

변경되지 않은 영역:
- `_pmEsc` 함수 본체: 변경 없음
- `_renderRightPanel('detail')` 전체: 변경 없음
- `_renderRightPanel('add')` 전체: 변경 없음
- `_renderRightPanel('edit')` 폼 제목 `${eName}`: 변경 없음 (올바르게 유지)
- API 헬퍼 함수들 본체: 변경 없음
- 추가 폼 / 편집 폼 submit 함수: 변경 없음
- 공통 헬퍼 함수들: 변경 없음

---

### 5. 엣지 케이스 및 방어 코드

**결과: 양호. 하나의 경미한 주의사항 있음.**

- `_pmEscJsAttr(p.clientLibDir || '')`: `undefined` 방어 적용됨. 올바름.
- `_pmEscJsAttr(str)` 내 `String(str)`: null/undefined/숫자 등 비문자열 입력 방어됨.
- `profiles.length === 0` 분기 처리: 변경 없음, 기존대로 안전.
- `p.port || 'null'`: 숫자값, 이스케이프 불필요. 올바름.

---

## 발견 사항

### 심각 (즉시 수정 필요)
없음.

---

### 경미 (개선 권장)

**profile_manager.js:261 — `>` 미이스케이프**

`_pmEscJsAttr`에서 `>` 를 이스케이프하지 않는다.

```javascript
.replace(/</g, '&lt;');   // < 만 이스케이프, > 미처리
```

**현재 컨텍스트에서 실제 위험 여부**: 없음.
- HTML 스펙상 double-quoted 속성값(`onclick="..."`) 내에서 `>` 는 속성 또는 태그 종료 문자가 아님.
- `>` 가 onclick 속성 내에 있어도 브라우저는 속성 파싱을 정상 완료한 뒤 JS 파서에 넘김.
- `<script>alert(1)</script>` 입력 시 `<` 가 `&lt;`로 차단되어 HTML 파서 레벨 주입 불가. `>` 가 남더라도 JS 문자열 인자 내 일반 문자로 처리됨.
- 직접 시뮬레이션으로도 원본 복원 및 주입 차단 확인됨.

**개선 이유**: 방어 심도(defense in depth) 관점에서, 향후 컨텍스트 변경(예: single-quoted 속성으로 전환 등)에 대비한 보수적 처리로 `>` → `&gt;` 추가를 권장한다. 실제 버그는 아니며 기능에 영향 없음.

```javascript
// 권장 개선 (선택적):
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;');
```

---

**profile_manager.js:502 — `pm-section-title` 내 단일따옴표 하드코딩**

```html
<div class="pm-section-title">'${eName}' 편집</div>
```

이미 `_pmEsc` 결과인 `eName` 주변에 하드코딩된 `'` 가 있어 시각적으로 `'O&amp;B' 편집` 형태가 표시될 수 있음. 이는 이번 변경에서 발생한 문제가 아니라 기존 코드이며, 보안 위험 없음. 기능 동작에도 영향 없음.

---

## 최종 권고

구현은 요청 사양을 정확히 충족하며, 보안 취약점(XSS/SyntaxError)을 올바르게 수정하였다. replace 체인 순서, 컨텍스트 구분, 원본 복원, textContent 매칭, URL 인코딩 흐름 모두 검증 완료.

`>` 미이스케이프는 현재 컨텍스트에서 실제 위험이 없으나, 방어 심도 관점에서 `&gt;` 추가를 선택적으로 고려할 수 있다. 필수 수정 사항은 아님.

**병합 가능(Merge-ready).**
