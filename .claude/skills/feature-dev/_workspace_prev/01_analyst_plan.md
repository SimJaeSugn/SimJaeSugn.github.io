## 요청 요약

1. `db_connect.js`(DB 연결 설정 모달)와 `profile_manager.js`(DB 접속 프로파일 관리 모달)의 글자가 테마와 맞지 않아 잘 보이지 않는다.
2. 두 파일의 "데이터베이스" 라벨을 "데이터베이스(서비스명)"으로 변경한다.

---

## 탐색한 파일

- `js/db_connect.js`: DB 연결 설정 모달 렌더링 코드 — label/input 클래스 패턴 파악
- `js/profile_manager.js`: DB 접속 프로파일 관리 모달 렌더링 코드 — label/input 클래스 패턴 파악
- `css/modal.css`: 모달 공통 CSS — `.form-group label` 정의, `.form-label` 미정의 확인
- `css/base.css`: 테마 CSS 변수 정의 확인

---

## 영향 분석

- 단축키 변경: 없음
- 새 localStorage 키: 없음
- 새 데이터 배열/상태 변수: 없음
- 기타 파급 효과: `reverse_engineer.js`도 동일한 `form-label`/`form-row` 패턴 사용 — CSS 수정으로 함께 혜택 받음

---

## 근본 원인

`css/modal.css`에는 `.form-group label` 규칙이 있어 `color: var(--tx-sub)` 등이 적용되지만, `.form-label` 클래스는 CSS에 전혀 정의되지 않았다. 결과적으로 `db_connect.js`, `profile_manager.js`에서 사용하는 `<label class="form-label">`은 브라우저 기본 스타일로 렌더링되어 테마 변수를 따르지 않는다.

---

## 구현 계획

### 파일: `css/modal.css`
- 위치: 기존 `.form-group label { ... }` 규칙 바로 아래
- 변경 내용: `.form-row`와 `.form-label` CSS 규칙 추가

```css
.form-row   { margin-bottom: 12px; }
.form-label {
  display: block;
  color: var(--tx-sub);
  font-size: 12px;
  margin-bottom: 5px;
}
```

- 이유: `.form-label`이 CSS에 없어서 label 텍스트 색상이 테마를 따르지 않음. `color: var(--tx-sub)` 지정으로 다크/라이트 모든 테마에서 올바르게 렌더링

### 파일: `js/db_connect.js`
- 위치: `_renderDbConnectModal` 함수 내 "데이터베이스" 라벨
- 변경 내용: `데이터베이스` → `데이터베이스(서비스명)`

### 파일: `js/profile_manager.js`
- 위치 1: `_renderProfileManagerModal` 함수 내 추가 폼의 "데이터베이스" 라벨
- 위치 2: `_renderProfileList` 함수 내 편집 인라인 폼의 "데이터베이스" 라벨
- 변경 내용: 두 곳 모두 `데이터베이스` → `데이터베이스(서비스명)`
