# UXERManager 미들웨어 — 코드 리뷰 & 개선 제안

> 작성일: 2026-05-27  
> 대상 버전: 1.0.0  
> 검토 범위: `src/` 전체 (index, routes, db/adapters, utils)

## 6. 리버스 엔지니어링 개선 제안

> 검토 파일: `js/reverse_engineer.js`, `proxy/nodejs/src/routes/schema.js`  
> 작성일: 2026-05-27

---

### 6-1. 엔티티 배치 겹침 (High)
**파일:** `js/reverse_engineer.js:178-179`

```js
const COL_W = 220;
const COL_H = 200;
```

열 높이가 200px로 고정되어 있어 컬럼 수가 많은 테이블(20개 이상)은 아래 테이블과 겹친다.

**개선 방안:** 각 엔티티의 예상 높이를 컬럼 수 기반으로 계산해 동적으로 y 좌표를 산출한다.

```js
// 헤더 50px + 컬럼당 28px 기준으로 예상 높이 계산
function estimateEntityHeight(cols) {
  return 50 + cols.length * 28 + 20; // 여유 20px
}

// y 좌표를 행별 최대 높이 누적값으로 설정
const rowMaxH = [];
all.forEach((tbl, idx) => {
  const row = Math.floor(idx / COLS);
  const h = estimateEntityHeight(tbl.columns || []);
  rowMaxH[row] = Math.max(rowMaxH[row] || 0, h);
});
const rowOffsets = rowMaxH.reduce((acc, h, i) => {
  acc.push((acc[i - 1] || OFFSET_Y) + (i === 0 ? 0 : rowMaxH[i - 1]) + 20);
  return acc;
}, []);
```

---

### 6-2. 테이블 선택 없이 전체 스키마 일괄 생성 (Medium)
**파일:** `js/reverse_engineer.js:116`, `proxy/nodejs/src/routes/schema.js:228`

수백 개 테이블이 있는 DB에서 전체를 한 번에 ERD로 만들면 다이어그램이 너무 복잡해진다. 사용자가 원하는 테이블만 선택할 수 없다.

**개선 방안 (2단계 흐름):**
1. "ERD 생성" 클릭 시 먼저 테이블 목록만 빠르게 조회해 체크리스트 표시
2. 사용자가 포함할 테이블을 선택한 후 실제 스키마(컬럼·FK) 조회

미들웨어에 `/schema/tables` 엔드포인트(테이블·뷰 이름 목록만 반환)를 추가하고, 프론트엔드에서 선택된 테이블 목록을 `/schema?tables=t1,t2,...` 형태로 전달한다.

---

### 6-3. 덮어쓰기 시 기존 엔티티 위치 유실 (Medium)
**파일:** `js/reverse_engineer.js:147-155`

```js
} else {
  const d = getActiveDiagram();
  d.entities = entities;   // 기존 위치 정보 전부 교체
  d.relations = relations;
  ...
}
```

"현재 다이어그램 덮어쓰기" 모드에서 기존에 수동으로 배치한 엔티티 위치가 모두 초기화된다.

**개선 방안:** 기존 엔티티 id 또는 physicalName 기준으로 매칭해 위치(x, y)를 보존한다.

```js
const existingPosMap = {};
(d.entities || []).forEach(e => { existingPosMap[e.physicalName] = { x: e.x, y: e.y }; });

const mergedEntities = entities.map(e => {
  const prev = existingPosMap[e.physicalName];
  return prev ? { ...e, x: prev.x, y: prev.y } : e;
});
d.entities = mergedEntities;
```

---

### 6-4. FK 카디널리티 1:N 고정 (Low)
**파일:** `js/reverse_engineer.js:231`

```js
relations.push({ from, to, card: '1:N' });
```

모든 외래키 관계가 `1:N`으로 고정된다. 참조 컬럼에 UNIQUE 제약이 있으면 실제로는 `1:1`이다.

**개선 방안:** schema.js에서 UNIQUE 제약 컬럼 목록을 함께 반환하고, FK의 `from_col`이 UNIQUE인 경우 `1:1`로 설정한다.

---

### 6-5. UNIQUE·AUTO_INCREMENT 정보 미추출 (Low)
**파일:** `proxy/nodejs/src/routes/schema.js` (각 DB 쿼리 상수)

현재 스키마 쿼리에서 UNIQUE 제약과 자동 증가(AUTO_INCREMENT / SERIAL / IDENTITY) 정보를 가져오지 않아 프론트엔드에서 `unique: false`, `autoIncrement: false`로 하드코딩된다.

**개선 방안:**

- **MySQL**: `EXTRA = 'auto_increment'`, `column_key IN ('UNI','PRI')` 추가
- **PostgreSQL**: `column_default LIKE 'nextval%'`로 SERIAL 감지, UNIQUE 인덱스는 `information_schema.table_constraints + key_column_usage`
- **MSSQL**: `is_identity` 컬럼, `is_unique_constraint`
- **Oracle**: `identity_column = 'YES'`, `constraint_type = 'U'`

---

### 6-6. PostgreSQL 스키마 'public' 하드코딩 (Medium)
**파일:** `proxy/nodejs/src/routes/schema.js:20-22, 39`

```sql
WHERE tc.table_schema = 'public'
```

`search_path`가 다르거나 `public`이 아닌 스키마를 사용하는 경우 테이블이 조회되지 않는다.

**개선 방안:** 프로파일 설정에 `schema` 필드(선택, 기본값 `public`)를 추가하고 쿼리에 파라미터로 전달한다. MySQL은 `DATABASE()`, Oracle은 `CURRENT_SCHEMA`로 이미 동적 처리 중이므로 PostgreSQL/MSSQL만 해당.

---

### 6-7. Oracle `all_` 시스템 뷰 성능 (Low)
**파일:** `proxy/nodejs/src/routes/schema.js:109-126`

`all_tab_columns`, `all_constraints` 등 `all_` 뷰는 현재 사용자가 접근 가능한 모든 스키마 객체를 포함한다. `WHERE owner = CURRENT_SCHEMA` 조건으로 필터링하지만 `all_` 뷰 자체가 크기 때문에 `user_` 뷰보다 느리다.

**개선 방안:** `user_tab_columns`, `user_constraints`, `user_cons_columns`, `user_views`로 교체하면 WHERE owner 조건도 불필요하고 쿼리가 단순해진다.

```sql
-- 변경 전
FROM all_tab_columns c ... WHERE c.owner = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
-- 변경 후
FROM user_tab_columns c ...  -- owner 조건 불필요
```

---

### 리버스 엔지니어링 개선 우선순위

| 우선순위 | 항목 | 파일 | 이유 |
|---------|------|------|------|
| 🔴 High | 엔티티 배치 겹침 | `reverse_engineer.js` | 기본 사용성 |
| 🟡 Medium | 덮어쓰기 시 위치 보존 | `reverse_engineer.js` | 반복 사용 시 작업 손실 |
| 🟡 Medium | 테이블 선택 기능 | `reverse_engineer.js` + `schema.js` | 대형 DB 대응 |
| 🟡 Medium | PostgreSQL 스키마 파라미터화 | `schema.js` | 비-public 스키마 지원 |
| 🟢 Low | UNIQUE·AUTO_INCREMENT 추출 | `schema.js` | ERD 정확도 |
| 🟢 Low | FK 카디널리티 동적 설정 | `reverse_engineer.js` + `schema.js` | ERD 정확도 |
| 🟢 Low | Oracle `user_` 뷰 전환 | `schema.js` | 성능 |

---