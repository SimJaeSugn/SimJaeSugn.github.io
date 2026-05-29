## 변경 파일 목록
- js/profile_manager.js: _pmEscJsAttr 헬퍼 추가, _renderProfileList/edit 블록의 onclick 인자를 _pmEsc → _pmEscJsAttr 결과 변수(jName 등)로 교체

## 주요 결정 사항
- 계획대로 구현함. 파일이 CRLF 줄바꿈이라 Edit 도구 대신 Node.js 스크립트로 직접 문자열 교체를 수행함(Edit 도구가 CRLF 포함 old_string을 찾지 못하는 문제 우회).
- 계획의 (A)~(D) 모두 계획과 동일하게 구현.
- node --check 문법 검사 통과, eJs/eNameJs 미정의 참조 없음, onclick 컨텍스트의 eName 잔존 없음 확인.

## 미완료 항목
- 없음
