## 변경 파일 목록
- `css/modal.css`: 파일 말미 `.bk-footer` 블록 뒤에 `.pm-layout`, `.pm-left`, `.pm-right`, `.pm-list-body`, `.pm-list-footer`, `.pm-profile-item`, `.pm-active-badge`, `.pm-item-actions`, `.pm-empty-hint`, `.pm-detail-*`, `.pm-section-title`, 스크롤바 스타일 등 Profile Manager 전용 CSS 클래스 추가
- `js/profile_manager.js`: 2단 레이아웃으로 전면 개편 — 모달 골격(880px), 상태 변수, 신규 함수 3개, 기존 함수 6개 재작성, `_pmEditId()` 제거

## 주요 결정 사항
- 계획과 동일하게 구현. 특이 사항 없음.
- `_submitAddProfile()`의 `finally` 블록(버튼 복원)은 계획에서 변경 없음으로 명시되어 기존 코드 그대로 유지.
- `_openAddProfileForm()` 내 `_pmErrClear('pmAddErr')` 호출은 계획 코드에 포함되어 있으나, 이 시점에 `pmAddErr` 엘리먼트가 아직 DOM에 없으므로 `_pmErrClear`의 null 가드(`if (el)`)에 의해 무해하게 처리됨.

## 미완료 항목
- 없음. 계획의 모든 항목 완료.
