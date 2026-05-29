# Help ▸ 단축키 시스템 — 분석 보고서

## 1. 개요

`js/shortcuts.js`는 단축키 정의(`SC_DEFAULTS`)·로드/저장(`localStorage '_shortcuts'`)·리바인딩 녹화(`scStartRecord`/`_scOnKey`)·충돌검사·행 갱신(`scRefreshRows`)·개별/전체 초기화를 담당한다. `matchSC`는 `main.js`의 전역 `keydown`과, `_renderRowKeys`/`scRefreshRows`는 `index.html`의 `.sc-row[data-sc-id]` 행과 연동된다. 전반적인 구조는 견고하며, 영속성 무결성(전체 백업 `export.js:156`, 복원 `import.js:98-101`, `loadShortcuts` 재호출)도 정상이고, undo/redo 대상이 아닌 설계도 타당하다. 다만 redo 행의 이중 단축키 표시 회귀, 하드코딩 단축키의 충돌검사 누락, README 스펙과 실제 바인딩 불일치 등 세 가지 문제가 확인된다.

## 2. 발견된 오류 및 수정 결과

### [medium] redo 행의 이중 단축키 표시가 모달 열 때 단일 표시로 덮어써짐 (Ctrl+Shift+Z 안내 소실)

- **상태**: 수정완료
- **증상**: `index.html`의 redo 행(`data-sc-id="redo"`)은 `.sc-keys` 안에 `Ctrl+Y / Ctrl+Shift+Z` 두 가지 단축키를 정적 HTML로 표시한다. 그러나 단축키 모달을 열면 `openShortcutsModal()`→`scRefreshRows()`→`_renderRowKeys(row,'redo')`가 실행되어 `keysEl.innerHTML`을 `_scParts('redo')`의 결과(`['Ctrl','Y']`)로 완전히 덮어쓴다. 결과적으로 모달을 한 번 열면 `Ctrl+Shift+Z` 대체 단축키 안내가 영구히 사라진다(닫았다 다시 열어도 정적 HTML은 이미 교체됨). `main.js:89`에서 `Ctrl+Shift+Z`는 여전히 redo로 동작하므로, 실제 동작과 모달 표시가 어긋난다(단축키 모달 동기화 위반).
- **원인**: `_renderRowKeys`가 모든 `data-sc-id` 행의 `.sc-keys` innerHTML을 `_scParts` 단일 바인딩 결과로 무조건 교체하는데, redo는 두 개의 바인딩(rebindable `Ctrl+Y` + 하드코딩 `Ctrl+Shift+Z`)을 가지는 특수 행이라는 점을 고려하지 않음.
- **수정 내용**: `_renderRowKeys` 함수에서 redo ID일 때 `Ctrl+Shift+Z` 보조 단축키를 함께 표시하도록 `keysEl.innerHTML` 할당 로직을 분기 처리함.
- **파일**: `E:\04.개발환경\python\98.ETC\SimJaeSugn.github.io\js\shortcuts.js`

## 3. 개선점 (자동수정 안 함 — 권장)

| 우선순위 | 제목 | 대상 파일 |
|---------|------|----------|
| high | 하드코딩 단축키가 충돌검사·리바인딩에서 누락되어 무음 충돌 발생 | `js/shortcuts.js` |
| medium | README 스펙과 실제 단축키 바인딩 불일치 (전체 맞춤 F vs Home, 삭제 Backspace 미동작) | `README.md` |
| low | 리바인딩 녹화 시 비ASCII/예약 단일키 검증 부재 | `js/shortcuts.js` |
| low | `_scParts` 수식어 표기 순서(Ctrl→Alt→Shift)가 관용 표기(Ctrl→Shift→Alt)와 다름 | `js/shortcuts.js` |

**[high] 하드코딩 단축키가 충돌검사·리바인딩에서 누락되어 무음 충돌 발생**

`main.js`에는 `_scMap`에 없는 하드코딩 단축키가 다수 있다: `Ctrl+K`(커맨드 팔레트, `main.js:51`), `Ctrl+Shift+Z`(redo 보조, `main.js:89`), 화살표키 엔티티 이동(`main.js:130`), `Esc`/`Enter`/`Ctrl+Enter`(타임라인/SQL). `_scOnKey`의 충돌검사는 `_scMap` 항목끼리만 비교하므로, 사용자가 예컨대 save를 `Ctrl+K`로 리바인딩하면 충돌 경고 없이 저장되고 같은 키에서 두 동작(저장+팔레트)이 동시에 발생한다. 또 redo를 다른 키로 리바인딩해도 `Ctrl+Shift+Z`가 하드코딩으로 계속 redo를 트리거해 모달 표시와 실제 동작이 영구히 불일치한다. 예약 키 목록(`RESERVED_SC`)을 도입해 `_scOnKey` 충돌검사에 포함하고, 가능하면 `Ctrl+K`·화살표·`Ctrl+Shift+Z`도 `matchSC` 기반으로 통합 관리할 것을 권장한다.

**[medium] README 스펙과 실제 단축키 바인딩 불일치 (전체 맞춤 F vs Home, 삭제 Backspace 미동작)**

`README.md:549`는 전체 맞춤을 `F`로, 178행도 `F`로 명시하지만 `SC_DEFAULTS.fitAll.key`는 `Home`이고 `index.html` 모달도 `Home`으로 표시한다(코드 내부는 Home으로 일관). 또 `README.md:548`은 삭제를 `Delete / Backspace`로 명시하지만 `SC_DEFAULTS.del.key`는 `Delete` 단일이며 `main.js`·`matchSC` 어디에도 Backspace 처리가 없어 Backspace 삭제는 동작하지 않는다. 모달(의도 UI)과 코드가 일치하므로 README가 stale일 가능성이 높다. README를 `Home`/`Delete`로 수정하거나, 의도가 `F`/`Backspace`였다면 `SC_DEFAULTS`와 `main.js`를 맞춰 동기화할 것.

**[low] 리바인딩 녹화 시 비ASCII/예약 단일키 검증 부재**

`_scOnKey`는 `Control`/`Shift`/`Alt`/`Meta`와 `Escape`만 거르고 그 외 모든 `e.key`를 그대로 바인딩으로 저장한다. 사용자가 `Tab`, `Enter`, `Space`, `F1~F12`, IME 조합키(예: 한글 `ㄴ`) 등을 녹화하면 의도치 않은 바인딩이 저장될 수 있고, 특히 `Tab`/`Enter`는 모달 내 포커스 이동·확정과 충돌한다. 허용 키 화이트리스트 또는 최소한 인쇄가능 문자/기능키만 허용하는 검증을 추가하는 것이 견고하다.

**[low] `_scParts` 수식어 표기 순서(Ctrl→Alt→Shift)가 관용 표기(Ctrl→Shift→Alt)와 다름**

`_scParts`는 `Ctrl`, `Alt`, `Shift` 순으로 push하여 `Alt+Shift` 조합 시 `Ctrl+Alt+Shift`로 표시된다. 일반적 관용은 `Ctrl+Shift+Alt`이며, `index.html`의 정적 표기(`saveAll: Ctrl+Shift+S`)와도 순서 일관성을 위해 `Ctrl→Shift→Alt` 순으로 맞추는 편이 자연스럽다. 동작에는 영향 없는 표기 일관성 개선.

## 4. 추천 사항

- **단축키를 단일 소스(`_scMap`)로 통합하고 `main.js`는 `matchSC`만 사용**: 현재 `main.js`·`ui.js`에 흩어진 하드코딩 단축키(`Ctrl+K`, `Ctrl+Shift+Z`, 화살표, `Esc`, `Ctrl+Enter`)를 `SC_DEFAULTS`/`_scMap`에 편입하거나 최소한 '예약(reserved, 비편집)' 항목으로 등록해, `matchSC`·충돌검사·모달 표시가 모두 한 소스를 참조하도록 통합하면 동기화 누락 클래스를 구조적으로 제거할 수 있다.

- **리바인딩 후 사용자에게 적용 피드백(토스트) 제공**: `_scOnKey` 성공 시 `_renderRowKeys`만 갱신되고 별도 피드백이 없다. `showToast`로 '단축키가 변경되었습니다' 같은 안내를 주면 변경이 저장됐다는 확신을 준다. `scResetAll`/`scResetOne`에도 동일 적용을 권장한다.

- **단축키 모달에 검색/필터 및 키 캡처 미리보기 추가**: 현재 모달은 슬라이드 3개로 구성되지만 항목이 많다. 기능명 검색 필터와, 녹화 중 누른 조합을 실시간 미리보기로 보여주면 발견성과 사용성이 개선된다.

- **충돌 시 '기존 항목 해제 후 덮어쓰기' 옵션 제공**: 현재 충돌 시 2초간 경고만 띄우고 무조건 취소된다. 사용자가 의도적으로 기존 바인딩을 교체하려는 경우를 위해 확인 후 기존 항목을 default로 되돌리고 새로 할당하는 옵션을 제공하면 유연하다.
