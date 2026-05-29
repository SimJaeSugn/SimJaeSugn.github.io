## 단축키 동기화
- 상태: N/A
- 근거: `profile_manager.js`에 `localStorage`, `keydown`, `shortcuts` 관련 코드 없음. 단축키 추가 없음.

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js(_BK_GROUPS): N/A
- 근거: 새 localStorage 키, 새 데이터 배열, 새 UI 설정값 추가 없음. 변경 표면은 순수 함수 1개(`_pmEscJsAttr`) + 렌더 함수 내부 지역 변수/문자열 보간 교체뿐.

## 상태 저장/로드
- 상태: N/A
- 근거: `state.js`에 새 상태 변수 추가 없음. `profile_manager.js` 변경은 렌더 함수 내부 지역 변수 변경만 포함.

## 렌더링 연동
- 상태: N/A
- 근거: 새 시각 요소(캔버스 요소) 추가 없음. `canvas.js` render()와 무관한 모달 내부 HTML 문자열 변경뿐.

## 자기완결성 검증 (보류 사유 해소)
- `_pmEscJsAttr` 정의 존재: OK — 251행에 함수 정의 확인.
- `eJs`/`eNameJs` 미정의 참조 부재: OK — grep 결과 0건, 잔존 참조 없음.
- `node --check` 문법 검증: OK — 종료코드 0, 문법 오류 없음.
- onclick 인자 교체 범위:
  - `_renderProfileList`: 315행 `eName`(_pmEsc 유지), 316-321행 `jName`/`jDbType`/`jHost`/`jDatabase`/`jUsername`/`jLibDir`(신규, _pmEscJsAttr) 확인.
  - 전환 버튼(327행), editArgs(330-337행), 삭제 버튼(342행), 선택 onclick(348행): jName/jDbType 등 교체 확인.
  - 표시용 텍스트(350-351행): `eName`/_pmEsc 유지 확인.
  - `_renderRightPanel('edit')`: 499행 `eName`(_pmEsc 유지), 500행 `jName`(_pmEscJsAttr 신규), 559행 저장 버튼 onclick → `jName` 교체 확인.

## 최종 상태: PASS
