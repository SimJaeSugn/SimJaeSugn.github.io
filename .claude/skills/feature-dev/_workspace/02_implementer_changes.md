## 구현 변경 내역

### 요청 1 — 컨텍스트 메뉴 포워드 엔지니어링 다중 선택 지원

**js/forward_engineer.js**
- `openForwardEngineerForEntity(entityId)` → `openForwardEngineerForEntity(entityIdOrIds)`:
  - 진입부에서 배열 정규화: `const ids = Array.isArray(entityIdOrIds) ? entityIdOrIds : [entityIdOrIds];`
  - `const targets = ids.map(id => ENTITIES.find(e => e.id === id)).filter(Boolean); if (!targets.length) return;`
  - 마지막 호출을 `await _feShowStep2(targets.map(t => t.id));`로 변경.
- `_feShowStep2(restrictEntityId = null)` 일반화:
  - 진입부에 `restrictIds` 정규화 추가(null | 단일 문자열 | 배열 모두 허용).
  - 렌더 필터: `ENTITIES.filter(ent => restrictIds.includes(ent.id))`.
  - 전체선택 버튼 가시성: `(restrictIds && restrictIds.length <= 1) ? 'none' : ''` — 다중 모드(2개 이상)에서는 표시.

**js/ui.js**
- `ctxFn`의 `forwardEng` 분기:
  - `selectedEntities.size > 1` → `openForwardEngineerForEntity([...selectedEntities])` (선택 집합 전체, ID 배열 전달).
  - 아니면 기존대로 `ctxTargetEntity.id` 단일 전달.
  - `typeof selectedEntities !== 'undefined'` 가드(canvas.js 전역, ui.js line 17과 동일 패턴).

### 요청 2 — SQL 미리보기 이전 값 유지 버그 수정

**js/forward_engineer.js**
- `_feResetToStep1()` 내부에 초기화 추가(이 함수는 신규 오픈/재오픈 양쪽에서 호출되는 단일 지점):
  - `fePreviewWrap` → `display:none`
  - `fePreviewSql` → `textContent = ''`
  - `feProgress` → `display:none`, `feProgressBar` → `width:0%` (실행 후 재오픈 시 진행률 잔상도 제거)
- 효과: 모달을 다시 열면 미리보기/진행률이 항상 초기화되며, `_fePreview()`/`_feRun()` 시점에만 `fePreviewWrap`이 다시 표시되고 `textContent`가 새로 채워지므로 항상 최신 SQL만 노출.

### 변경 파일 목록
- js/forward_engineer.js
- js/ui.js

### 영향 없음 확인
- 단축키: 변경 없음 (index.html #shortcutsTableBody 무관)
- localStorage: 신규 키 없음
- export/import: 직렬화 구조 변경 없음
- state.js: 변경 없음 (selectedEntities는 canvas.js 소유)

### 미적용(범위 외) 사항
- `openForwardEngineerModal`/`openForwardEngineerForEntity`의 `feDbCfgNotice` 오버레이 생성 코드 중복은 이전 review에서 지적됐으나 이번 요청 범위 밖이라 리팩터링하지 않음(기능 영향 없음).
