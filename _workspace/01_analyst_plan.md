## 요청 요약
엔티티 우클릭 컨텍스트 메뉴에 "포워드 엔지니어링" 항목을 추가한다.
항목 클릭 시 해당 엔티티 1개만 선택된 상태로 포워드 엔지니어링 모달의 2단계(엔티티 선택 화면)를 직접 열어야 한다.

## 탐색한 파일
- js/forward_engineer.js: _feShowStep2, openForwardEngineerModal, closeForwardEngineerModal 패턴 확인
- js/ui.js: CTX_VISIBILITY, showCtxMenu 전체 id 토글 배열, ctxFn 디스패처 확인
- index.html: #ctxMenu 내 ctx-sel-related 위치 확인 (line 281)

## 영향 분석
- 단축키 변경: 없음 — 컨텍스트 메뉴 항목이므로 단축키 없음
- 새 localStorage 키: 없음
- 새 데이터 배열/상태 변수: 없음
- 기타 파급 효과: 없음 — 기존 openForwardEngineerModal 로직을 재사용

## 구현 계획

### 파일: js/forward_engineer.js
- `_feShowStep2()` → `_feShowStep2(restrictEntityId = null)` 인자 추가
- ENTITIES.map 렌더링 분기: restrictEntityId가 있으면 해당 엔티티만 렌더, data-idx는 ENTITIES.indexOf(ent) 사용
- 단일 엔티티 모드에서 feSelectAllBtn 숨기기
- closeForwardEngineerModal 앞에 `openForwardEngineerForEntity(entityId)` 신규 함수 추가

### 파일: index.html
- ctx-sel-related 항목(line 281) 다음에 ctx-fe-ent 항목 추가

### 파일: js/ui.js
- CTX_VISIBILITY entity 모드에 'ctx-fe-ent': 1 추가
- showCtxMenu 내 전체 id 토글 배열에 'ctx-fe-ent' 추가
- ctxFn 디스패처 끝부분에 forwardEng 분기 추가
