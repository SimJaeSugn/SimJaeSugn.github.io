## 단축키 동기화
- 상태: N/A
- 상세: 신규 단축키 없음 (모달 내 라디오 옵션 변경만 해당)

## 백업 통합 (export/import/ui)
- export.js: N/A
- import.js: N/A
- ui.js (_BK_GROUPS): N/A
- 상세: 새 localStorage 키 없음. 엔티티/관계/notesV2 구조 동일하며 기존 saveState() 경로 그대로 사용.

## 상태 저장/로드
- 상태: N/A
- 상세: 새 상태 변수 없음.

## 렌더링 연동
- 상태: N/A
- 상세: 캔버스에 신규 시각 요소 없음. append 분기에서 loadDiagramIntoWorkspace(d) → render() 순서로 기존 render 경로 그대로 호출.

## 코드 정확성 검사

### a) 모달 라디오 옵션 (value="append")
- 상태: OK
- 상세: reverse_engineer.js line 99-102에 value="append" id="reModeAppend" 라디오가 overwrite 다음에 정상 추가됨.

### b) append/overwrite 분기 구조
- 상태: OK
- 상세: line 260 `else if (mode === 'append')`, line 295 `else`(overwrite fallback). overwrite가 기본 else로 유지됨.

### c) relations from/to id 재매핑
- 상태: OK
- 상세: line 272-275에서 idRemap 기반으로 r.from, r.to를 갱신. 관계선 끊김 없음.

### d) baseY 계산 기준 (기존 엔티티 d.entities)
- 상태: OK
- 상세: line 277-279에서 `d.entities.map(e => e.y + entityHeight(e))`로 append 전 기존 엔티티 기준 계산. 신규 entities 배열 혼용 없음.

### e) viewNotes Y 오프셋 적용
- 상태: OK
- 상세: line 282 `viewNotes.forEach(n => { n.y += baseY; })` 존재. VIEW DDL 메모도 기존 다이어그램 아래로 내려감.

### f) 관계선 중복 방지
- 상태: OK
- 상세: line 287-290에서 from+to 기준 find 후 미존재 시만 push. 중복 관계선 방지됨.

## 최종 상태: PASS
