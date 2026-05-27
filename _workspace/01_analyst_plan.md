# 리버스 엔지니어링 기능 구현 계획

## 개요
DB 스키마를 읽어 ERD를 자동 생성하는 리버스 엔지니어링 기능을 구현한다.

## 변경 파일 목록

### 1. middleware/src/routes/schema.js (신규 생성)
GET /schema 엔드포인트 — DB 타입별 테이블·뷰·FK 정보를 한 번에 반환
- loadConfig()로 접속정보 가져오기
- PostgreSQL / MySQL / MSSQL 별 SQL 실행
- 응답 형식: { tables: [{tableName, columns:[{columnName,dataType,isPk,isNullable,defaultValue}]}], views: [{viewName, ddl}], fks: [{fromTable,fromCol,toTable,toCol}] }

### 2. middleware/src/index.js 수정
schemaRouter 등록:
```js
const schemaRouter = require('./routes/schema');
app.use('/schema', schemaRouter);
```

### 3. js/reverse_engineer.js (신규 생성)
주요 함수:
- `openReverseEngineerModal()`: _mwPing() 확인, _mwGetConfig() 확인, 모달 표시
- 모달: 새 다이어그램명 입력, "새 다이어그램" vs "현재 덮어쓰기" 라디오
- `runReverseEngineering()`: GET /schema 호출, ERD 구성, 다이어그램 적용
- `_buildEntitiesFromSchema(tables, views)`: 엔티티 객체 배열 생성 (격자 배치)
- `_buildRelationsFromFks(fks, entityIdMap)`: 관계 객체 배열 생성

### 4. js/state.js 수정
migrateEntity() 함수에서 `if (e.isView === undefined) e.isView = false;` 추가

### 5. js/canvas.js 수정
엔티티 헤더 렌더링 부분에서 isView 뱃지 표시

### 6. index.html 수정
- 리버스엔지니어링 메뉴 항목 disabled 제거, onclick 추가
- reverse_engineer.js 스크립트 태그 추가

### 7. middleware/README.md 수정
GET /schema 엔드포인트 섹션 추가
