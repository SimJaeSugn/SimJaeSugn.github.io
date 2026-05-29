# 공유 ▸ 공유 URL — 분석 보고서

## 1. 개요

`js/share.js`는 활성 ERD 상태(`diagrams`, `activeDiagramId`, `viewMode`, `notationStyle`, `gridSnap`)를 `flushCurrentState` 후 LZ-String으로 압축해 `?erd=` URL을 만들고, `navigator.clipboard`로 복사하거나 실패 시 폴백 다이얼로그(`_showShareDialog`)를 띄운다. 페이지 로드 시 `tryRestoreFromUrl`이 `?erd=`를 해제·복원(`restoreFromSnapshot`)하고 `saveState` 후 URL을 정리한다. 전반적인 구조는 단순하고 압축/클립보드 예외 처리도 `try/catch`와 폴백으로 대체로 견고하나, `tryRestoreFromUrl`이 `restoreFromSnapshot`의 성공 여부를 확인하지 않아 비어있거나 구버전 스냅샷일 때 복원이 사실상 실패했음에도 성공으로 간주하고 `saveState`로 빈 상태를 localStorage에 덮어써 기존 작업을 유실시키고 빈 화면을 만드는 실제 버그가 존재한다. 그 외 공유 시 뷰포트(pan/zoom) 미복원, 폴백 다이얼로그의 배경/ESC 닫기 누락, README 메뉴 경로 불일치는 개선 항목으로 분류된다.

## 2. 발견된 오류 및 수정 결과

### [High] 복원 실패(빈/구버전 스냅샷)인데도 성공 처리 → 기존 localStorage 작업 유실·빈 화면

- **상태**: 수정완료
- **증상**: `?erd=`가 비어있는 다이어그램 스냅샷이거나 구버전 포맷(최상위 `entities`만 있고 `diagrams` 배열이 없는 v1 형태)을 담고 있으면, `restoreFromSnapshot`(`js/state.js:125`)은 `if (!Array.isArray(s.diagrams) || !s.diagrams.length) return;`으로 아무 것도 하지 않고 조용히 빠져나온다(반환값 없음). 그러나 `tryRestoreFromUrl`은 이 결과를 확인하지 않고 즉시 `saveState()`를 호출한다. 이 시점 `diagrams`는 여전히 `[]`이므로 `flushCurrentState`는 빈 상태를 만들고, `saveState`가 `{diagrams:[],activeDiagramId:null,...}`을 `STORAGE_KEY`에 기록하여 사용자가 이전에 저장해 둔 ERD를 덮어쓴다. 게다가 함수가 `true`를 반환하므로 `js/main.js:10`의 `loadState()`/기본 다이어그램 생성 분기가 건너뛰어져 `diagrams`가 0개인 빈 앱 상태가 되고, '🔗 공유 URL에서 ERD를 불러왔습니다.' 토스트로 성공을 거짓 보고한다. 재현: 빈 다이어그램 또는 구버전에서 만든 공유 URL로 접속하거나, `?erd=`에 `diagrams`가 없는 페이로드가 들어온 경우. 영향: 영속 상태 유실 + 앱 사용 불가(빈 화면).
- **원인**: `tryRestoreFromUrl`이 `restoreFromSnapshot`의 성공/실패를 검증하지 않고(반환값도 없음) 무조건 `saveState`·`history.replaceState`·성공 토스트·`return true`를 실행한다. 복원이 적용됐는지(다이어그램이 실제로 채워졌는지)를 확인하는 가드가 없다.
- **수정 내용**: `tryRestoreFromUrl()`에서 복원 전 `state.diagrams` 배열 존재 여부를 검증하는 가드를 추가하여 빈/구버전 스냅샷으로 인한 기존 localStorage 데이터 유실 및 빈 화면 문제를 수정함.
- **파일**: `js/share.js`

## 3. 개선점 (자동수정 안 함 — 권장)

| 우선순위 | 항목 | 대상 파일 |
|---------|------|----------|
| Medium | **공유 URL 복원 시 뷰포트(pan/zoom)가 복원되지 않음** — `generateShareUrl`은 `flushCurrentState`로 `vx/vy/scale`을 페이로드에 담지만, 복원에 쓰이는 `restoreFromSnapshot`은 undo/redo 용도로 설계되어 스냅샷의 뷰포트를 버리고 현재 `vx/vy/scale`(기본값 0,0,1)을 강제로 유지한다. 공유 복원 경로 전용으로 뷰포트까지 적용하는 별도 처리(복원 후 `active.vx/vy/scale` 및 전역 `vx/vy/scale`을 state 값으로 세팅하고 `updateZoomLabel`/`render` 재호출)를 권장한다. | `js/share.js` |
| Low | **폴백 공유 다이얼로그를 배경 클릭/ESC로 닫을 수 없음** — `_showShareDialog`가 만드는 `shareUrlOverlay`의 `.modal-overlay` div에는 다른 모든 모달과 달리 `onmousedown="overlayClose(event,'shareUrlOverlay')"` 가 없고, `js/main.js`의 전역 Escape 핸들러도 이 오버레이를 닫지 않아 '닫기' 버튼으로만 종료 가능하다. 오버레이에 `overlayClose` 핸들러 추가 및 ESC 처리에 포함할 것을 권장한다. | `js/share.js` |
| Low | **URL 정리 정규식의 ?& 잔여 엣지케이스** — `tryRestoreFromUrl`의 정규식은 `erd`가 마지막 파라미터가 아닐 때(예: `?erd=X&foo=1`) `?&foo=1` 같은 잘못된 쿼리스트링을 남길 수 있다. `URLSearchParams`로 `erd`만 삭제 후 재조립하는 방식이 더 견고하다. | `js/share.js` |
| Low | **`generateShareUrl`에 LZString 존재 여부 명시적 가드 없음** — `tryRestoreFromUrl`은 `typeof LZString === 'undefined'` 가드를 두지만 `generateShareUrl`은 `try/catch`의 `ReferenceError` 포착에만 의존한다. 대칭적으로 사전 가드를 두면 CDN 로드 실패 시 더 명확한 안내가 가능하다. | `js/share.js` |
| Low | **README 메뉴 경로 불일치** — `README.md:478`은 '내보내기' → '🔗 공유 URL 생성'으로 안내하지만 실제로는 `index.html:130`의 '공유' 메뉴 하위에 있다. 문서 또는 메뉴 배치 중 하나를 정정해야 한다. | `README.md` |

## 4. 추천 사항

- **기존 작업이 있을 때 공유 URL 복원 전 확인 프롬프트**: 공유 URL 접속은 현재 localStorage의 작업을 `saveState`로 덮어쓴다. 기존 다이어그램이 비어있지 않다면 '공유 ERD로 현재 작업을 대체할까요?'를 `askConfirm`으로 물어 의도치 않은 덮어쓰기로 인한 데이터 유실을 방지하는 것이 안전하다.
- **공유 URL 길이 가드 및 안내**: 엔티티가 많으면 `?erd=` URL이 브라우저/메신저 한계를 넘을 수 있다(README도 경고). 생성 시 `url.length`를 측정해 임계치(예: 8000자) 초과 시 '전체 백업 JSON 공유 권장' 안내 토스트나 다이얼로그를 표시하면 UX가 개선된다.
- **CDN 무결성/오프라인 폴백**: `lz-string`·`sql.js`·`peerjs`를 외부 CDN에서 무결성 검증 없이 로드한다. SRI(`integrity` 속성) 추가와 로컬 번들 폴백을 두면 오프라인/CDN 장애 시 공유 URL 생성·복원 기능 가용성이 향상된다.
- **deprecated `execCommand` 대체**: 폴백 다이얼로그의 '복사'는 `document.execCommand('copy')`에 의존한다. 가능하면 `navigator.clipboard.writeText` 재시도(보안 컨텍스트 한정)와 실패 안내를 우선 적용하고 `execCommand`는 최후 폴백으로만 유지하는 것을 권장한다.
