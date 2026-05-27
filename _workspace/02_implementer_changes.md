## 변경 파일 목록
- js/profile_manager.js: 신규 생성 — DB 접속 프로파일 관리 모달 전체 로직 (openProfileManagerModal, closeProfileManagerModal, _loadProfiles, _renderProfileManagerModal, _renderProfileList, _activateProfile, _deleteProfile, _refreshProfileList, _openAddProfileForm, _closeAddProfileForm, _submitAddProfile, _pmErrShow, _pmErrClear, _pmOnDbTypeChange, _pmEsc)
- index.html: 공유 메뉴에 "DB 프로파일 관리" 항목 추가, db_connect.js 다음에 profile_manager.js 스크립트 태그 추가

## 주요 결정 사항

1. **`MW_URL` 재선언 없음**: `db_connect.js`에서 이미 전역 선언된 `MW_URL`, `_mwPing()`, `_showMwNotRunning()`를 그대로 사용. 파일 최상단 주석에 의존 명시.
2. **`<h3>` 패턴 사용**: 초기에 `modal-header`/`modal-body`/`modal-close` 클래스를 사용했으나 해당 클래스가 CSS에 미정의임을 확인 후 `db_connect.js` 패턴인 `<h3>` 태그로 수정.
3. **`overlayClose(event,'pmOverlay')` 연동**: 기존 overlay 닫기 패턴(배경 클릭 시 닫기)을 그대로 사용.
4. **XSS 방지**: 프로파일 이름/호스트 등 사용자 입력이 innerHTML에 삽입되므로 `_pmEsc()` 헬퍼로 이스케이프. onclick 속성에도 이스케이프된 값 사용.
5. **폼 토글 버튼 숨김**: `_openAddProfileForm()` 시 토글 버튼을 숨기고, `_closeAddProfileForm()` 시 복원. 폼 닫기 시 입력값 초기화.
6. **삭제 버튼 비활성화 조건**: 활성 프로파일이거나, 프로파일이 1개(마지막)인 경우 `disabled`. 미들웨어 서버도 동일 규칙 적용.

## 미완료 항목
- 없음
