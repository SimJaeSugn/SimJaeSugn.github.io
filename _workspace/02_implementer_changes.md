# 구현 변경 내역

## 변경 파일 목록

- js/forward_engineer.js: `_feShowStep2(restrictEntityId = null)` 인자 추가, 단일 엔티티 렌더링 분기 및 전체 선택 버튼 숨기기 처리, `openForwardEngineerForEntity(entityId)` 신규 함수 추가
- index.html: `#ctxMenu` 내 ctx-sel-related 다음에 ctx-fe-ent 항목 추가
- js/ui.js: CTX_VISIBILITY entity 모드에 ctx-fe-ent 추가, showCtxMenu 전체 id 배열에 ctx-fe-ent 추가, ctxFn 디스패처에 forwardEng 분기 추가

## 주요 결정 사항

- `_feShowStep2`의 렌더링 분기 시 `data-idx`는 `ENTITIES.indexOf(ent)`로 설정 — 부분 배열 인덱스 사용 안 함
- `openForwardEngineerForEntity`는 `openForwardEngineerModal`의 가드/초기화 로직을 그대로 복사하고 마지막에 `_feShowStep2(entityId)` 호출

## 미완료 항목

없음
