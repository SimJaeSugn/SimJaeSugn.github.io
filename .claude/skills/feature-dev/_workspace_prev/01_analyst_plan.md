## 요청 요약
리버스 엔지니어링 결과 적용 옵션에 세 번째 모드 "현재 다이어그램에 추가" 추가.
기존 "새 다이어그램 생성"(new) / "현재 다이어그램 덮어쓰기"(overwrite)에 더해, 파싱된
엔티티·관계선을 현재 활성 다이어그램의 기존 내용에 병합(append)하는 mode="append" 구현.

핵심 과제:
- 엔티티 id 충돌 회피 + 관계선 from/to id 재매핑
- 위치 충돌 회피 (기존 엔티티 아래쪽으로 오프셋 배치)
- VIEW DDL 메모도 함께 추가

## 탐색한 파일
- js/reverse_engineer.js: 리버스 엔지니어링 전체 구현 (모달 렌더링·실행·엔티티/관계/메모 빌드). 모든 변경이 이 파일에 집중됨.
- index.html: 리버스엔지니어링 진입점은 메뉴 버튼 한 줄(line 118)뿐, 모달 마크업은 reverse_engineer.js가 동적 생성 → index.html 변경 불필요.
- js/state.js: createEmptyDiagram / getActiveDiagram / loadDiagramIntoWorkspace / flushCurrentState / saveState 동작 확인. 엔티티/관계는 다이어그램 객체의 entities·relations 배열, relations는 entity.id를 from/to로 참조.
- js/import.js (applyDDLImport line 361-394, applyAISchema line 464-501): "현재 다이어그램에 추가" 패턴의 기존 레퍼런스. id 충돌 처리(`while(existingIds.has(newId)) newId = e.id+'_'+suffix++`)와 baseY 오프셋 배치 패턴 확인.
- js/canvas.js (entityHeight line 56): 엔티티 높이 계산 함수 — append 시 baseY 산출에 활용.
- js/entities.js: entity id 생성 패턴(`'entity_'+Date.now().toString(36)`) 확인.

## 영향 분석
- 단축키 변경: 없음 — 모달 내 라디오 옵션만 추가, 단축키 미사용.
- 새 localStorage 키: 없음 — 기존 saveState() 경로(STORAGE_KEY) 그대로 사용. 데이터 구조 변경 없음.
- 새 데이터 배열/상태 변수: 없음 — 엔티티/관계/notesV2 구조 동일, 기존 활성 다이어그램 배열에 push만 함.
- export/import 영향: 없음 — 생성되는 엔티티/관계/메모 객체 형태가 기존 new/overwrite 모드와 100% 동일하므로 export/import는 무영향.
- 협업(webrtc/broadcast) 영향: 확인 필요 — saveState() 후 다른 협업 동기화 트리거가 별도로 필요한지. 단, 기존 overwrite 모드도 saveState()만 호출하고 별도 broadcast를 하지 않으므로 동일 패턴 따르면 추가 영향 없음(현 구현 일관성 유지).
- 핵심 주의점(integration-checker용): 관계선 from/to는 _buildEntitiesFromSchema가 생성한 entityIdMap 기반 id를 가리킨다. append 시 id 충돌로 entity.id를 변경하면 relations·notesV2의 참조도 함께 갱신해야 한다. 단, 현재 entity id는 `Date.now()+random+idx`로 생성되어 기존 엔티티와 충돌 가능성이 사실상 0이지만, 안전을 위해 충돌 검사·재매핑 로직을 포함한다. → 확인 필요(재매핑 누락 시 관계선 끊김).

## 구현 계획

### 파일: js/reverse_engineer.js

#### 1) 모달에 세 번째 라디오 옵션 추가
- 위치: `_renderReverseEngineerModal()` 내부, 적용 방식 라디오 그룹 (line 90-100 div).
- 변경 내용: "현재 다이어그램 덮어쓰기" 라디오 다음에 세 번째 라디오 추가.
  ```html
  <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
    <input type="radio" name="reMode" value="append" id="reModeAppend">
    <span style="font-size:13px">현재 다이어그램에 추가</span>
  </label>
  ```
  세 옵션이 한 줄에 좁으면 flex-wrap 또는 gap 조정 검토(확인 필요 — 모달 width 480px에 3개 라디오 배치 시 줄바꿈 여부).
- 이유: 사용자가 append 모드를 선택할 UI 진입점.
- 참고: 기존 라디오 change 핸들러(line 134-139)는 value==='new'일 때만 reNewNameRow를 표시하므로 append 선택 시 자동으로 이름 행이 숨겨짐 → 별도 수정 불필요.

#### 2) _runReverseEngineerStep2()에 append 분기 추가
- 위치: line 238-275, `const mode = ...` 이후의 if(new)/else(overwrite) 분기.
- 변경 내용: `else if (mode === 'append')` 분기를 overwrite 분기 앞 또는 사이에 추가. 로직:
  1. `const d = getActiveDiagram();`
  2. id 충돌 회피 + 재매핑:
     ```js
     const existingIds = new Set((d.entities || []).map(e => e.id));
     const idRemap = {};               // oldId → newId
     entities.forEach(e => {
       let newId = e.id, suffix = 2;
       while (existingIds.has(newId)) { newId = e.id + '_' + suffix++; }
       if (newId !== e.id) idRemap[e.id] = newId;
       e.id = newId;
       existingIds.add(newId);
     });
     // 관계선 from/to 재매핑
     relations.forEach(r => {
       if (idRemap[r.from]) r.from = idRemap[r.from];
       if (idRemap[r.to])   r.to   = idRemap[r.to];
     });
     ```
     (viewNotes는 entity.id를 참조하지 않으므로 재매핑 불필요 — _buildViewNotes 확인 결과 id 미참조.)
  3. 위치 충돌 회피 — 기존 엔티티 최하단 아래로 전체 오프셋:
     ```js
     const baseY = (d.entities && d.entities.length)
       ? Math.max(...d.entities.map(e => e.y + entityHeight(e))) + 80
       : 0;
     if (baseY) entities.forEach(e => { e.y += baseY; });
     ```
     import.js의 baseY 패턴 재사용. _buildEntitiesFromSchema가 이미 격자(OFFSET_Y=60 기준) 배치를 해 두므로, 전체 y에 baseY를 더해 기존 다이어그램 아래로 통째로 내림. (개별 좌표 겹침 대신 블록 단위 오프셋 — 신규 엔티티끼리의 격자 레이아웃 보존)
     viewNotes의 y도 동일 baseY만큼 이동 권장:
     ```js
     if (baseY) viewNotes.forEach(n => { n.y += baseY; });
     ```
     주의: entityHeight(e)는 attrs 기반 계산 함수(canvas.js). reverse_engineer가 만드는 엔티티에 attrs가 있으므로 호출 가능. 단 collapsed 상태 등 의존성은 확인 필요 — 기존 import.js가 동일 호출을 쓰므로 안전.
  4. 병합:
     ```js
     d.entities = [...(d.entities || []), ...entities];
     // 관계선 중복 방지(import.js 패턴)
     const merged = [...(d.relations || [])];
     relations.forEach(r => {
       if (!merged.find(x => x.from === r.from && x.to === r.to)) merged.push(r);
     });
     d.relations = merged;
     // VIEW 메모 추가 (덮어쓰기와 달리 기존 메모 보존)
     d.notesV2 = [...(d.notesV2 || []), ...viewNotes];
     ```
  5. 워크스페이스 반영(overwrite 분기와 동일):
     ```js
     loadDiagramIntoWorkspace(d);
     render();
     saveState();
     ```
- 이유: 파싱 결과를 기존 다이어그램에 비파괴적으로 병합. id/위치 충돌을 모두 처리.

#### 3) (선택) 토스트 메시지 mode별 문구
- 위치: line 278 showToast 호출.
- 변경 내용: append 시 "ERD 추가 완료 (...)" 등 문구 분기 — 선택 사항, 기능엔 영향 없음.

## 구현 시 implementer 주의사항
- overwrite 분기는 `posMap`으로 physicalName 기준 기존 위치를 보존하는데, append는 그와 달리 "기존+신규 공존"이므로 위치 보존이 아니라 신규 블록을 아래로 내리는 방식이 맞다(같은 테이블이 중복 생성될 수 있음은 의도된 동작 — 사용자가 "추가"를 선택했으므로). 중복 테이블 dedup은 이번 범위에서 제외(요청에 없음).
- relations 재매핑은 entityIdMap이 아니라 entities 배열의 실제 e.id 변경을 추적해야 한다(_buildRelationsFromFks가 이미 entityIdMap 기반으로 from/to를 채워 두므로, 그 값과 idRemap을 매칭). → 위 코드의 idRemap 방식이 정확.
- 현재 코드 기준 id 충돌 가능성은 극히 낮지만(타임스탬프+random), 동일 세션 내 빠른 연속 실행 시 Date.now() 동일 가능 → 충돌 검사 유지 권장.
