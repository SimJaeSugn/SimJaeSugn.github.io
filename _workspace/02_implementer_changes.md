## 변경 파일 목록

- middleware/src/routes/schema.js: GET /schema 엔드포인트 신규 생성 (PG/MySQL/MSSQL 스키마 조회)
- middleware/src/index.js: schemaRouter import 및 app.use('/schema') 등록
- js/reverse_engineer.js: 리버스 엔지니어링 모달·ERD 생성 함수 신규 생성
- js/state.js: migrateEntity()에 `if (e.isView === undefined) e.isView = false;` 추가
- js/canvas.js: drawEntity() 헤더 렌더링에 isView 'VIEW' 뱃지 표시 추가
- index.html: 리버스엔지니어링 메뉴 항목 disabled 제거 + onclick 연결, reverse_engineer.js 스크립트 태그 추가
- middleware/README.md: GET /schema 엔드포인트 문서 추가, 파일 구조 업데이트

## 주요 결정 사항

- 계획에서 엔티티 ID 생성 시 `Date.now().toString(36) + '_' + Math.random()...` 형식 사용했으나, 루프 내에서 같은 밀리초에 동일한 Date.now()가 발생할 수 있어 `_${idx}` suffix를 추가해 중복 방지
- VIEW DDL 메모를 엔티티 격자 오른쪽 영역(x=1240~)에 배치해 엔티티와 시각적으로 분리
- `overlayClose(event,'reDbCfgNotice')` 패턴 사용 — 기존 모달과 동일한 배경 클릭 닫기 패턴 적용
- `_buildViewNotes`에서 ddl이 빈 문자열인 뷰는 건너뜀(메모 생성 스킵)
- `makeNoteV2Id()`는 ui.js에 정의되어 있으므로 재정의 없이 직접 호출

## 미완료 항목

- 없음 (계획의 모든 항목 구현 완료)
