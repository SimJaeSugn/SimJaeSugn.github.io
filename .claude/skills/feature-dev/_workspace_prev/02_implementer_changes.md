# 02 — Implementer Changes

## 적용 범위
Section 2 버그 3건은 분석 결과 **이미 코드에 적용됨** → 구현 제외.
Section 3 개선점 6건(medium 1 + low 5)을 모두 구현. Section 4 추천은 범위 제외.

## 변경 파일 목록
- `js/state.js`: `loadDiagramIntoWorkspace`에서 `selectedEntities.clear()` / `selectedEntity = null` 추가 (항목 C)
- `js/import.js`:
  - `handleFullBackupImport`·`handleImportFile` FileReader에 `onerror` 핸들러 추가 (항목 B)
  - `_doImportWithGroups` uiSettings 분기 말미에 diagrams 미포함 시 `render()` 호출 (항목 D)
  - AI 스키마: `_aiAbortController` 모듈 변수 + fetch `signal` 연결 + `closeAISchemaModal` abort + AbortError 무시 + finally 정리 (항목 E)
  - `applyDDLImport` baseY를 collapsed 무시(펼친 높이) 기준으로 계산 (항목 F)
  - `applyAISchema` add 모드에서 기존 엔티티 아래에 collapsed 무시 baseY로 배치 (항목 F)
  - `parseDDL`: 괄호 균형 기반 본문 추출(`_extractBalancedBody`) 도입, `createRe`를 여는 괄호까지만 매칭 (항목 A)

## 항목별 상세

### A (medium) parseDDL 괄호 균형 파서
- 신규 헬퍼 `_extractBalancedBody(sql, openIdx)`: 문자열 리터럴(`'"\``) 내부의 괄호/세미콜론·중첩 괄호를 건너뛰고 균형 맞는 닫는 괄호까지 본문 추출. 따옴표 이스케이프(`\` 및 연속 2개 `''`/`""`) 처리.
- `createRe`를 `...\(([^;]*)\)` → `...\(`로 단순화하고 본문은 헬퍼로 추출. `createRe.lastIndex = extracted.end`로 다음 CREATE 탐색 위치 보정.
- 반환 구조 `{ entities, relations }` 불변 → previewDDLImport/applyDDLImport 무영향.
- **검증**: `DEFAULT 'a;b'`(리터럴 내 세미콜론), `DECIMAL(10,2)`(중첩 괄호) 포함 DDL 2-table 샘플 파싱 성공, FK 관계 정상 감지 확인.

### B (low) FileReader onerror
- 두 핸들러 모두 `reader.onerror`에서 alert + `e.target.value = ''` 처리. 기존 catch alert 톤과 일치.

### C (low) selectedEntities 초기화
- `state.js` `loadDiagramIntoWorkspace` L77 직후 추가. `typeof` 가드로 canvas.js 미로드 상황 방어. 기존 `_normActive`/`selectedSection` 초기화 패턴과 동일 의도(다이어그램별 휘발성 선택 상태).
- 공용 함수이므로 import 외 다이어그램 전환·undo/redo·loadState에도 적용됨(의도된 동작).

### D (low) uiSettings render
- diagrams 그룹이 함께 처리되면 해당 분기가 이미 render() 호출하므로, `!groups.includes('diagrams')`일 때만 추가 render() 호출하여 중복 방지.

### E (low) AbortController
- `_aiAbortController` 모듈 변수. `runAISchemaGen`에서 fetch 전 `new AbortController()` 생성·`signal` 연결, `catch`에서 `AbortError`는 조용히 return, `finally`에서 null 정리.
- `closeAISchemaModal`(배경 클릭 `overlayCloseExtra` 포함)에서 진행 중 요청 abort.

### F (low) baseY collapsed 보정
- `_expandedH = e => HEADER_H + (e.attrs?e.attrs.length:0)*ROW_H` (config.js 전역 상수 사용).
- applyDDLImport: `entityHeight` → `_expandedH`로 baseY 계산.
- applyAISchema: 기존 `add` 모드의 고정 +20 오프셋(기존 엔티티와 겹침)을 제거하고, 기존 엔티티 최대 하단 + 80 기준 `addBaseY`로 신규 엔티티를 아래에 배치. `e.y`에 이미 포함된 base 60을 상쇄하기 위해 `addBaseY = max(bottom)+80-60`.

## 주요 결정 사항
- 항목 F의 applyAISchema: 보고서는 DDL만 명시했으나 동일 결함(add 모드 +20 오프셋이 collapsed/기존 엔티티와 겹침)이 있어 함께 보정. 기존 add 동작을 "겹침 회피 아래 배치"로 개선 — 사소한 UX 변경이므로 reviewer 확인 요청.
- `_expandedH` 헬퍼를 두 함수에 각각 인라인 선언(공유 유틸 신설 시 범위 확대 우려 → 최소 변경 유지).

## 미완료 항목
- 없음. 계획된 6개 항목 모두 구현.

## 영향 분석 (integration-checker 전달)
- 단축키 변경 없음, 새 localStorage 키/데이터 배열 없음 → 백업 통합 N/A.
- 신규 모듈 변수 `_aiAbortController`는 휘발성(localStorage·백업 무관).
- node --check 통과 (import.js, state.js).
