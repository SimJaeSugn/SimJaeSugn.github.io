## 리뷰 요약
- 전체 평가: PASS (주의사항 있음)

## 발견 사항

### 심각 (즉시 수정 필요)
- 없음

### 경미 (개선 권장)

1. **profile_manager.js:119 — `modal-header`/`modal-body`/`modal-close` 클래스 미정의 사용**
   - 초기 구현에서 CSS에 없는 클래스 사용 → `<h3>` 패턴으로 수정 완료.

2. **profile_manager.js:_renderProfileList — onclick 속성의 HTML 이스케이프된 이름 전달**
   - `_pmEsc()`로 `'` → `&#39;` 변환된 이름이 onclick 인자로 전달됨.
   - HTML 속성 파싱 시 `&#39;`가 `'`로 자동 디코딩되어 JS 함수에 정상 전달됨.
   - `encodeURIComponent`로 API 전달 시 처리됨 — 기능상 문제 없음.
   - 개선 권장: 프로파일 이름을 data-name 속성에 저장하고 JS에서 읽는 패턴이 더 안전하나, 현재 패턴도 동작에 문제 없음.

3. **profile_manager.js:openProfileManagerModal — 모달이 이미 있는 경우 폼 상태 미초기화**
   - 두 번째 열기 시 이전에 열었던 추가 폼이 열려 있으면 그 상태 유지.
   - 사용성 관점에서 재열기 시 폼을 닫는 것이 더 자연스러울 수 있으나, 요청 명세에 없는 사항.

4. **index.html:131 — DB 프로파일 관리 메뉴에 mb-ico/mb-text 구조 확인**
   - 기존 "DB 연결 설정" 항목과 동일한 구조로 추가됨 — 정상.

## 최종 권고

- 구현이 요청 명세를 완전히 충족함.
- XSS 방지(`_pmEsc`), 빈 목록 처리, 삭제 비활성화 조건, 폼 초기화 등 엣지 케이스 처리 적절.
- `MW_URL`, `_mwPing()`, `_showMwNotRunning()` 재선언 없이 db_connect.js 공유 전역 함수 활용 — 패턴 준수.
- 스크립트 로드 순서 (`db_connect.js` → `profile_manager.js`) 정확함.
