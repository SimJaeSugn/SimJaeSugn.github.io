# 리버스 엔지니어링 기능 코드 리뷰

- 리뷰어: Claude Code (독립 리뷰)
- 리뷰 일자: 2026-05-27
- 대상 파일: reverse_engineer.js, middleware/src/routes/schema.js, canvas.js (VIEW 뱃지), state.js (migrateEntity)

---

## 1. 기능 정확성

### 1-1. DB 스키마 → ERD 자동 생성

**판정: PASS (경미 이슈 1건)**

- `runReverseEngineering()`이 `/schema` 엔드포인트를 호출하여 `{ tables, views, fks }`를 받아 `_buildEntitiesFromSchema`, `_buildRelationsFromFks`, `_buildViewNotes`를 순서대로 호출하는 흐름은 올바르다.
- `schema.js`는 PostgreSQL/MySQL/MSSQL 3종에 대해 information_schema 기반 쿼리를 작성하고, `buildResult()`에서 테이블/뷰/FK를 분리하여 반환한다.
- **경미 이슈**: `buildResult()`에서 `viewSet`(Set)을 선언하지만 이후 어디서도 사용하지 않는 미사용 변수다. 동작에는 영향 없다.

### 1-2. 새 다이어그램 / 덮어쓰기 선택

**판정: PASS (주의사항 1건)**

- 라디오 버튼 `reMode`에 따라 `new` 분기는 `createEmptyDiagram()` → `diagrams.push()` → `activeDiagramId` 교체 → `loadDiagramIntoWorkspace()` 순서가 정확하다.
- `overwrite` 분기는 `getActiveDiagram()`의 `entities/relations`를 교체한다.
- **주의사항**: `overwrite` 분기에서 `d.notesV2 = [...(d.notesV2 || []), ...viewNotes]`는 덮어쓰기를 반복 실행할 때마다 VIEW DDL 메모가 누적된다. 의도적인 설계인지 명확하지 않다. 동일 뷰의 메모가 중복 생성될 수 있으므로 실용 시 주의가 필요하다. 버그로 분류한다면 "덮어쓰기 전 기존 `tags: ['VIEW','DDL']` 메모를 필터링 후 병합"이 적절하다.
- `new` 분기에서 `flushCurrentState()` → `diagrams.push()` → `activeDiagramId` 설정 순서는 올바르다. `flushCurrentState()`로 현재 작업 내용을 기존 다이어그램에 먼저 저장하므로 데이터 손실 없다.

### 1-3. VIEW 색상 구분

**판정: PASS**

- `_buildEntitiesFromSchema()`에서 `colorTag: tbl.isView ? 'teal' : null`로 VIEW 엔티티에 'teal' 색상 태그를 부여한다.
- `config.js`의 `ENTITY_COLOR_PALETTE`에 `{ id: 'teal', bg: '#0e6878', ... }`가 정의되어 있으므로 헤더 색이 구분된다.
- `isView: true` 필드도 함께 설정되어 VIEW 뱃지 렌더링의 조건도 충족된다.

### 1-4. DDL 메모장 V2

**판정: PASS (경미 이슈 1건)**

- `_buildViewNotes()`가 DDL이 있는 뷰(`if (!v.ddl) return`)에 대해 `NoteV2` 객체를 생성한다. 필수 필드(`id, x, y, w, h, title, text, color, pinned, tags, createdAt`) 모두 존재하며 `makeNoteV2Id()`를 올바르게 사용한다.
- `color: 'ocean'`이 `NOTE_V2_THEMES`에 정의된 유효한 키다.
- **경미 이슈**: `_buildViewNotes(views, entities, entityIdMap)` 시그니처에서 `entities`와 `entityIdMap` 파라미터를 받지만 함수 본문에서 전혀 사용하지 않는다. 현재는 불필요한 파라미터이나, 향후 VIEW 엔티티 위치 옆에 메모를 배치하는 기능 확장을 위해 예약해 둔 것으로 보인다. 실제 배치는 `OFFSET_X = 60 + 5 * 220 + 60` 고정값으로 계산되므로 엔티티 개수가 5열을 초과하면 메모가 엔티티와 겹칠 수 있다.

---

## 2. 엣지 케이스 처리

**판정: PASS (경미 이슈 2건)**

- `tables`/`views`/`fks`가 빈 배열일 경우: `forEach`/`for...of` 루프는 빈 배열에서 정상 동작하고, `entities = []`, `relations = []`, `viewNotes = []`를 반환한다. `loadDiagramIntoWorkspace()`도 빈 배열 처리가 state.js에 명확히 구현되어 있다.
- `fks`에서 `entityIdMap`에 없는 테이블 참조: `if (from && to)` 가드가 있어 안전하다.
- `v.ddl`이 null/빈문자열: `if (!v.ddl) return`으로 보호된다.
- `c.columns`가 없는 경우: `(tbl.columns || []).map(...)` 방어 코드가 있다.
- **경미 이슈 1**: `document.querySelector('input[name="reMode"]:checked')?.value`의 옵셔널 체이닝 결과가 `null`인 경우 `'new'`로 폴백하는 로직은 올바르나, 이는 HTML에 `checked` 기본값이 있어 실제로 null이 될 상황은 없다.
- **경미 이슈 2**: `_buildEntitiesFromSchema()`에서 엔티티 ID 생성 시 `Date.now().toString(36)`을 루프 내에서 반복 호출한다. 동일 밀리초 내에 루프가 수백 개를 처리하면 이론상 ID 충돌이 발생할 수 있다. 실용적으로는 `idx` 접미사로 충분히 방지되어 있으므로 실질 위험도는 낮다.

---

## 3. Canvas 렌더링 — VIEW 뱃지

**판정: PASS with 주의**

canvas.js 919~932행:

```js
if (e.isView) {
  ctx.save();
  ctx.font = 'bold 9px Segoe UI';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(137,220,235,0.25)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + 4, y + 3, 28, 13, 3) : ctx.rect(x + 4, y + 3, 28, 13);
  ctx.fill();
  ctx.fillStyle = '#89dceb';
  ctx.fillText('VIEW', x + 6, y + 5);
  ctx.restore();
}
```

- `ctx.save()`/`ctx.restore()`로 컨텍스트 상태를 올바르게 격리한다.
- `ctx.roundRect`의 존재 여부를 체크하여 구형 브라우저에서도 `ctx.rect`로 폴백한다.
- **잠재적 렌더링 이슈**: 뱃지 배경 박스 너비가 28px, 'VIEW' 텍스트 시작 X가 `x+6`(배경 시작 `x+4`에서 2px 안쪽)이다. 9px 폰트에서 'VIEW' 텍스트는 약 22~25px이므로 배경에서 오른쪽이 약 1~5px 잘릴 수 있다. 실용상 허용 범위이나 폰트 렌더링 환경에 따라 잘릴 수 있으므로 배경 너비를 32px로 늘리는 것을 권장한다.
- **오버랩 문제**: 볼륨 레이블(`if (vol.label)`) 뱃지도 동일 위치(`x+4, y+3`)에 그려지므로 `isView`이면서 볼륨 레이블이 있을 경우 두 뱃지가 겹친다. 리버스 엔지니어링으로 생성된 엔티티에는 볼륨 레이블이 없으므로 현재 사용 시나리오에서 문제없지만, 사용자가 나중에 rowCount를 설정하면 겹침이 발생할 수 있다.

---

## 4. 보안 — XSS 취약점

**판정: PASS**

- `reverse_engineer.js`의 모달 HTML은 하드코딩된 UI 요소로 구성되며, 사용자 입력을 `innerHTML`에 직접 삽입하는 코드가 없다.
- `errEl.textContent = e.message`로 에러 메시지를 `textContent`로 설정하여 XSS 위험이 없다.
- 토스트 메시지 `showToast(...)`에 사용되는 문자열은 서버 응답의 `tables.length`, `views.length`, `relations.length` (숫자 값)와 하드코딩 문자열만 포함하여 위험하지 않다.
- NoteV2 카드 렌더링(`_createNoteV2Card`, `_updateNoteV2Card`)이 `textContent`를 사용하므로 VIEW DDL이 스크립트를 포함해도 실행되지 않는다.
- `schema.js` 서버 사이드: SQL 쿼리는 사용자 입력을 파라미터화하지 않지만, 입력값 없이 `information_schema` 시스템 테이블만 직접 조회하는 정적 쿼리이므로 SQL Injection 위험이 없다.

---

## 5. 코드 패턴 일치

**판정: PASS**

- 모달 패턴: `_render*Modal()` → `document.getElementById`로 중복 생성 방지 → `classList.add('active')`는 `db_connect.js`, `join_explorer.js`, `normalize.js`와 동일한 패턴이다.
- 오버레이 닫기: `overlayClose(event, id)` 함수 사용, `onmousedown.stop` HTML 속성 사용이 기존 패턴과 일치한다.
- 엔티티/관계 객체 구조: `{ from, to, card: '1:N' }`이 `entities.js`, `import.js`의 기존 패턴과 일치한다.
- `AbortSignal.timeout(30000)`: `db_connect.js`의 2000ms와 대비하여 30초 타임아웃은 대형 DB 스키마 처리에 합리적이다.
- `makeNoteV2Id()` 함수를 직접 재사용하여 ID 생성 방식이 일관적이다.

---

## 6. 불필요한 변경 포함 여부

**판정: PASS**

- `state.js`의 `migrateEntity()`에 `if (e.isView === undefined) e.isView = false;` (185행)가 추가되어 리버스 엔지니어링으로 생성된 `isView` 필드가 구버전 엔티티 로드 시에도 올바르게 기본값 처리된다. 이 변경은 필요하고 적절하다.
- `canvas.js`의 VIEW 뱃지 코드(919~932행)는 신규 추가이며 기존 렌더링 흐름에 미치는 영향이 최소화되어 있다.
- `reverse_engineer.js`, `schema.js`는 신규 파일로 기존 코드에 부수효과가 없다.

---

## 종합 이슈 목록

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 버그 (중) | reverse_engineer.js L142 | 덮어쓰기 반복 실행 시 VIEW DDL 메모 중복 누적 |
| 경미 | schema.js L111 | `viewSet` 미사용 변수 |
| 경미 | reverse_engineer.js L227 | `_buildViewNotes` 파라미터 `entities`, `entityIdMap` 미사용 |
| 경미 | canvas.js L927 | VIEW 뱃지 배경 너비 28px가 텍스트에 비해 약간 부족할 수 있음 (32px 권장) |
| 경미 | canvas.js L919~949 | `isView`+볼륨레이블 동시 존재 시 뱃지 오버랩 가능성 |
| 정보 | schema.js L121 | MSSQL `is_nullable`은 bit(0/1)로 `==='YES'` 분기 불일치, `===1` 분기로 정상 처리됨 |

---

## 최종 평가: PASS (조건부)

핵심 기능(ERD 자동생성, 새다이어그램/덮어쓰기, VIEW 색상구분, DDL 메모장V2) 모두 올바르게 구현되었다. XSS 보안 이슈 없음. 기존 코드 패턴 준수. 불필요한 변경 없음.

단, **"덮어쓰기 반복 실행 시 VIEW DDL 메모 중복 누적" 버그**가 실사용 시 사용자 혼란을 유발할 수 있어 배포 전 수정을 권장한다. 나머지 경미 이슈는 운영 중 개선 가능한 수준이다.
