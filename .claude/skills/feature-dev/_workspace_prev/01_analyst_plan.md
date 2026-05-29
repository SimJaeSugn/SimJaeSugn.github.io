# 01 — Analyst Plan

## 요청 요약
`docs/report/02-파일-가져오기.md` 보고서의 개선점 중 **아직 적용되지 않은 항목**을 구현한다.
- Section 2 버그 3건: 실제 코드 적용 여부 확인 후 미적용이면 구현
- Section 3 medium 1건(DDL 파서 취약점): 구현 대상 포함
- Section 3 low 5건: 미적용이면 구현 대상 포함
- Section 4 추천 4건: **이번 작업 범위 제외**

## 탐색한 파일
- `js/import.js` (전체): 모든 import 경로, parseDDL, applyDDLImport, runAISchemaGen, applyAISchema 확인
- `js/ui.js` (overlayClose): importDiagSelectOverlay 배경 클릭 분기 확인
- `js/state.js` (loadDiagramIntoWorkspace, saveState): selectedEntities 초기화 여부 확인
- `js/canvas.js`: selectedEntities/selectedEntity 선언(L29/L33), entityHeight(L56, collapsed → HEADER_H)
- `js/config.js`: HEADER_H=36, ROW_H=22 상수

## 적용 여부 확인 결과

### Section 2 — 버그 3건: 모두 이미 적용됨 (구현 불필요)
1. **레거시 JSON migrateEntity** — `import.js` L132 `d.entities = (data.entities || []).map(migrateEntity);` → **적용됨**
2. **importDiagSelectOverlay 배경 클릭** — `ui.js` L1663 `if (overlayId === 'importDiagSelectOverlay') closeImportDiagSelectModal();` → **적용됨**
3. **DDL ID 충돌 시 relations 재매핑** — `import.js` L366-399 `idRemap` 테이블로 FK ref(L379-383) 및 relations from/to(L385-388) 재매핑 → **적용됨**

→ Section 2는 보고서 "수정완료" 표기대로 실제 적용 확인. **구현 대상에서 제외.**

### Section 3 — 개선점: 전부 미적용 (구현 대상)
| # | 우선순위 | 항목 | 현재 상태 |
|---|----------|------|-----------|
| A | medium | parseDDL createRe `([^;]*)\)` 본문 매칭 취약(리터럴 내 `;`, 중첩 괄호) | 미적용 (L255) |
| B | low | FileReader onerror 핸들러 부재 | 미적용 (handleImportFile L118, handleFullBackupImport L13) |
| C | low | import 후 selectedEntities/selectedEntity 미초기화 | 미적용 (loadDiagramIntoWorkspace L77은 section만 초기화) |
| D | low | uiSettings 단독 복원 시 render() 미호출 | 미적용 (L89-97 panelW일 때만 render) |
| E | low | AI 스키마 fetch AbortController 미연결 | 미적용 (runAISchemaGen L436) |
| F | low | applyDDLImport/applyAISchema baseY collapsed 무시 | 미적용 (L389 entityHeight 사용) |

## 영향 분석
- **단축키 변경**: 없음
- **새 localStorage 키**: 없음
- **새 데이터 배열/상태 변수**: 없음 (기존 전역 `selectedEntities`/`selectedEntity` 활용, 신규 모듈 변수 `_aiAbortController` 1개 추가 — localStorage 무관, 백업 대상 아님)
- **백업 통합(export/import/_BK_GROUPS) 영향**: 없음 — 데이터 구조/키 변경 없음. integration-checker 백업 검사는 N/A 예상
- **기타 파급 효과**:
  - 항목 C는 `state.js`의 공용 함수 `loadDiagramIntoWorkspace` 수정 → import뿐 아니라 **다이어그램 전환·undo/redo·loadState 등 모든 호출 경로**에 영향. selectedEntities/selectedEntity는 다이어그램별 휘발성 선택 상태이므로 전환 시 초기화하는 것이 올바른 동작(L77 selectedSection 초기화와 동일 의도). 기존 L79-80 `_normActive`/`_normWarnings` 초기화 패턴과 일치 → 안전. **확인 필요 표시: reviewer는 다이어그램 전환 시 선택 해제가 의도대로인지 검토.**
  - 항목 A는 정규식→괄호 균형 파서 보강. parseDDL 반환 형식(`{entities, relations}`)은 불변 → previewDDLImport/applyDDLImport 호출부 무영향.
  - 항목 F는 배치 좌표만 변경 → 렌더 영향 없음, render()는 기존대로 호출.

## 구현 계획

### 파일: js/state.js
**항목 C — import/다이어그램 전환 후 엔티티 선택 상태 초기화**
- 위치: `loadDiagramIntoWorkspace(d)` L77 (`selectedSection = null; selectedSections = new Set();` 라인 직후)
- 변경 내용: 다음 줄 추가
  ```js
  selectedEntities.clear(); selectedEntity = null;
  ```
- 이유: 이전 다이어그램의 선택 엔티티 id 잔상으로 인한 렌더/툴바 오표시 방지. selectedSection 초기화와 동일 위치·의도. `selectedEntities`는 canvas.js의 전역 `Set`이므로 `.clear()` 사용.

### 파일: js/import.js

**항목 A — parseDDL 괄호 균형 기반 본문 추출 (medium)**
- 위치: `parseDDL(sql)` L255 `const createRe = /.../;` 및 L257 while 루프
- 변경 내용:
  - `createRe`를 테이블명까지만 매칭하고 여는 괄호 위치를 잡도록 분리:
    ```js
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?\w+[`"\]]?)\s*\(/gis;
    ```
  - while 루프 내부에서 `m.index + m[0].length`(여는 괄호 다음)부터 괄호 균형(depth)을 세며 문자열 리터럴(`'`,`"`,backtick) 내부의 괄호/세미콜론을 무시하고 매칭되는 닫는 괄호까지를 `body`로 추출. 추출 후 `createRe.lastIndex`를 닫는 괄호 다음으로 설정해 다음 CREATE 탐색 지속.
  - 본문 추출 헬퍼(예: `_extractBalancedBody(sql, openParenIdx)`)를 parseDDL 위에 추가하거나 인라인 구현. 문자열 리터럴 상태(`inStr`, `strCh`)와 백슬래시 이스케이프, depth 카운팅 처리.
- 이유: `DEFAULT 'a;b'`의 세미콜론이나 `DECIMAL(10,2)`/중첩 괄호로 본문이 조기 종료되는 문제 해결. 기존 라인 단위 컬럼 파싱(L286~)은 그대로 유지하되 더 정확한 body를 받음.
- 패턴 주의: 기존 `unquoteIdent`, fkRe, inlinePkRe 로직은 변경 없이 재사용. 반환 구조 불변.

**항목 B — FileReader onerror 핸들러 추가 (low)**
- 위치 1: `handleFullBackupImport` L13-29 reader
- 위치 2: `handleImportFile` L118-146 reader
- 변경 내용: 각 `reader.onload` 정의 뒤(또는 `reader.readAsText` 앞)에 추가:
  ```js
  reader.onerror = () => {
    alert('파일을 읽는 중 오류가 발생했습니다.\n파일을 다시 선택해 주세요.');
    e.target.value = '';
  };
  ```
- 이유: 파일 읽기 자체 실패(권한/IO) 시 사용자 피드백 및 input value 초기화로 동일 파일 재선택 가능. 기존 catch의 alert 문구 톤 유지.

**항목 D — uiSettings 단독 복원 시 화면 갱신 (low)**
- 위치: `_doImportWithGroups` L64-102 `if (groups.includes('uiSettings') && data.settings)` 분기 말미 (L101 `}` 직전, 닫는 중괄호 앞)
- 변경 내용: 분기 끝에서 diagrams 그룹이 함께 처리되지 않은 경우에만 render 호출:
  ```js
  if (!groups.includes('diagrams') && typeof render === 'function') render();
  ```
- 이유: diagrams 그룹은 이미 자체적으로 render() 호출(L54). uiSettings만 복원할 때 panelW 분기를 안 타면 화면 미갱신 → 중복 render 방지하면서 일관 갱신.
- 확인 필요: `render` 외에 테마/퀵바는 각 apply 함수가 이미 즉시 반영하므로 추가 갱신 불필요. render만으로 충분한지 reviewer 확인.

**항목 E — AI 스키마 fetch AbortController 연결 (low)**
- 위치 1: 모듈 스코프 (예: L405 `// ── AI 스키마` 섹션 상단 또는 `_ddlImportParsed` 근처)에 `let _aiAbortController = null;` 선언
- 위치 2: `closeAISchemaModal()` L417-419 — 모달 닫을 때 진행 중 요청 취소:
  ```js
  function closeAISchemaModal() {
    if (_aiAbortController) { _aiAbortController.abort(); _aiAbortController = null; }
    document.getElementById('aiSchemaOverlay').classList.remove('active');
  }
  ```
- 위치 3: `runAISchemaGen` L435-450 fetch — controller 생성 및 signal 연결:
  ```js
  _aiAbortController = new AbortController();
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: _aiAbortController.signal,
    headers: { ... },
    body: ...
  });
  ```
- 위치 4: `catch (err)` L465 — abort 시 에러 토스트 억제:
  ```js
  } catch (err) {
    if (err.name === 'AbortError') return;
    errorEl.textContent = '오류: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    _aiAbortController = null;
    loadingEl.style.display = 'none'; genBtn.disabled = false;
  }
  ```
- 이유: 모달 닫은 뒤 늦게 오는 응답이 적용되거나 유령 토스트가 뜨는 경쟁 상태 방지. AbortError는 사용자 취소이므로 무시.
- 확인 필요: `closeAISchemaModal`이 `overlayCloseExtra`(ui.js L1673)에서도 호출되므로 배경 클릭 닫기에도 abort 적용됨 — 정상. finally에서 abort된 경우에도 controller를 null로 정리.

**항목 F — applyDDLImport/applyAISchema baseY collapsed 보정 (low)**
- 위치 1: `applyDDLImport` L389 `const baseY = ENTITIES.length ? Math.max(...ENTITIES.map(e => e.y + entityHeight(e))) + 80 : 80;`
- 위치 2: `applyAISchema` L487-489 신규 엔티티 y 초기값 `y: 60 + Math.floor(i / 4) * 320` (add 모드 시 기존과 겹칠 수 있음 — L506 add 모드 분기에서 offset만 더함)
- 변경 내용: 펼친 높이 기준으로 baseY 계산하도록 collapsed 무시 높이 사용. 인라인 식 도입:
  ```js
  const expandedH = e => HEADER_H + (e.attrs ? e.attrs.length : 0) * ROW_H;
  const baseY = ENTITIES.length ? Math.max(...ENTITIES.map(e => e.y + expandedH(e))) + 80 : 80;
  ```
  - applyDDLImport: L389 교체.
  - applyAISchema: `mode==='add'`일 때 신규 엔티티 y가 기존 entity들과 겹치지 않도록, add 모드 분기(L500-508 루프 진입 전)에서 동일한 `baseY`를 계산해 `e.y = baseY + Math.floor(i/4)*320` 적용 검토. **단, applyAISchema의 기존 add 오프셋(+20) 동작 변경은 영향 범위 있으므로 보수적 적용**: DDL과 동일하게 collapsed 무시 높이 헬퍼만 도입하고 baseY 기반 배치로 정리. 정확한 적용은 implementer가 기존 동작을 최소 변경하는 선에서 결정하고 미결 시 기록.
- 이유: collapsedEntities에 든 엔티티가 entityHeight로 HEADER_H만 반환해 baseY가 과소 계산 → 신규 테이블이 기존 접힌 엔티티와 겹침. 펼친 높이 기준으로 배치해 충돌 방지.
- 확인 필요: HEADER_H/ROW_H는 config.js 전역 상수(36/22)로 import.js에서 접근 가능. reviewer는 applyAISchema add 모드 좌표 변경이 기존 UX 회귀를 일으키지 않는지 검토.

## integration-checker 전달 사항
- 단축키: N/A (변경 없음)
- 백업 통합(export.js/import.js _doImportWithGroups/ui.js _BK_GROUPS): N/A — 새 localStorage 키·데이터 배열 없음
- 상태 저장/로드: `loadDiagramIntoWorkspace`만 수정, 신규 state 변수 없음 → loadState/saveState 변경 불필요. 단 selectedEntities 초기화가 전 호출 경로에 미치는 영향만 확인
- 렌더링: 신규 캔버스 요소 없음

## reviewer 확인 필요 항목 (요약)
1. 항목 C: 다이어그램 전환 시 엔티티 선택 해제가 의도된 동작인지 (undo/redo 포함)
2. 항목 D: uiSettings 단독 복원 시 render()만으로 충분한지
3. 항목 E: AbortError 처리 및 finally 정리 정확성
4. 항목 F: applyAISchema add 모드 좌표 변경의 회귀 가능성
5. 항목 A: 괄호 균형 파서가 기존 단순 DDL을 기존과 동일하게 파싱하는지(회귀 없음)
