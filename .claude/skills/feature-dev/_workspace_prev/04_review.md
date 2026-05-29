# 04 Review

## 리뷰 요약
- 전체 평가: PASS (주의사항 있음)

## 발견 사항

### 심각 (즉시 수정 필요)
- 없음.

### 경미 (개선 권장)
- **js/export.js:242-247 (downloadImage toBlob 콜백)** — `_writeExportFile` → `_getExportDir`는 최초 사용 시 `showDirectoryPicker()`를 호출하는데, 이 호출이 `toBlob` 비동기 콜백 내부에 있어 일부 브라우저에서 "user gesture 만료"로 폴더 선택 다이얼로그가 차단될 수 있다. 다만 (1) 폴더는 보통 이전 내보내기에서 이미 설정되어 캐시되고, (2) 차단 시 catch→`_fallbackDownload`로 안전하게 다운로드되므로 기능 손실 없음. 기존 JSON/SVG/MD/HTML 경로도 동일 함수를 쓰므로 패턴 일관성 차원에서 현 구현 유지 타당. 추후 picker를 toBlob 이전으로 끌어올리는 개선 여지 있음.
- **js/export.js:710-712 (generateDDL 빈 선택 처리)** — 선택 모드에서 엔티티 0개일 때 `-- 선택된 엔티티가 없습니다.` 메시지를 표시하여 빈 DDL/오류를 방지. 엣지 케이스 처리 양호.
- **고해상도 PNG 스케일** — `offCanvas.width=imgW*dpr` + 컨텍스트 최상단 `ctx.scale(dpr,dpr)` 적용 후 좌표/그리드/엔티티 로직을 논리 크기(imgW/imgH) 기준 유지. 그리드 루프 한계도 imgW/imgH 기준이므로 잘림 없음. 전역 ctx/vx/vy/scale 복원과 render()를 toBlob 호출 전 동기 수행 → 화면 깨짐 없음. 정확.

## 항목별 점검
1. 기능 정확성: DDL 옵션(FK/INDEX/COMMENT) 및 엔티티 전체/선택이 `buildDDL(dialect, target, opts)`로 정확히 전달됨. SVG/MD/HTML/PNG 모두 `_writeExportFile`+폴백 경로로 통일. 고해상도 2x 정상. — OK
2. 엣지 케이스: 빈 ENTITIES alert, 빈 선택 메시지, toBlob null 토스트, optional chaining(`?.`)·`?? true` 기본값 처리 — OK
3. Canvas 렌더링: off-canvas 임시 사용 후 전역 복원 + render() 1회 — 불필요한 재렌더 없음 — OK
4. LocalStorage: 변경 없음(신규 영속 상태 없음) — OK
5. 이벤트 리스너: renderDDLEntityList는 매 렌더 시 list.innerHTML='' 로 기존 노드(및 리스너) 제거 후 재생성 → 누수 없음 (openExportDiagSelectModal 패턴 동일) — OK
6. 보안: 엔티티명은 `textContent`로 삽입(innerHTML 아님), 체크박스 value=e.id → XSS 없음 — OK
7. 코드 패턴: `_exportDiagIds`/`openExportDiagSelectModal` 패턴 충실히 모방, 주석 스타일·인라인 스타일 컨벤션 일치 — OK
8. 불필요한 변경: ui.js 명령 팔레트 고해상도 항목 추가는 메뉴/imgMenu와의 일관성 유지를 위한 범위 내 변경 — OK

## 최종 권고
즉시 수정 필요한 심각 이슈 없음. 배포 가능(PASS). 경미 항목(toBlob 콜백 내 picker 호출)은 폴백으로 안전하게 처리되므로 후속 개선 과제로 남겨도 무방.
