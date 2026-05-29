# 리뷰 결과 — 포워드 엔지니어링 엔티티 우클릭 기능

## 재검사일: 2026-05-29 (직접 코드 확인)

---

## 리뷰 요약

- 전체 평가: **PASS**

---

## 발견 사항

### 심각 (즉시 수정 필요)

없음

### 경미 (개선 권장)

1. **`js/forward_engineer.js` lines 36–45, 84–95 — `openForwardEngineerModal`과 `openForwardEngineerForEntity`가 동일한 `feDbCfgNotice` 오버레이 생성 코드를 중복**
   - 기능 버그는 아니나, 두 함수가 동일한 블록을 50줄 가량 중복 보유.
   - 개선 방안: `_feShowDbCfgError()` 헬퍼 함수로 추출하면 유지보수성 향상.

2. **`js/forward_engineer.js` lines 389–392 — `_feGetPreDDL` 내 SQL 인젝션 위험 존재 (low severity)**
   - `pname`은 `ent.physicalName || ent.id`에서 유래하며 사용자가 직접 입력한 ERD 데이터임.
   - MSSQL 분기: `` `IF OBJECT_ID('${pname}', 'U') IS NOT NULL DROP TABLE ${pname};` ``
   - Oracle 분기: `` `BEGIN EXECUTE IMMEDIATE 'DROP TABLE ${pname}'; ... END;` ``
   - 물리명에 `'; DROP TABLE users; --` 같은 값을 입력하면 의도치 않은 SQL이 실행될 수 있음.
   - 단, 이 SQL은 미들웨어 서버로 전송되어 실행되므로 영향 범위는 연결된 DB에 한정됨.
   - 개선 방안: 물리명 저장/렌더링 시점에 영문자·숫자·언더스코어만 허용하는 검증을 추가하거나, DDL 빌드를 서버 측으로 이관하는 것을 권장.

---

## 검증 항목 별 결과

| # | 항목 | 결과 |
| --- | --- | --- |
| 1 | data-idx 정합성 (`ENTITIES.indexOf(ent)`) | OK |
| 2 | showCtxMenu 배열에 `ctx-fe-ent` 포함 | OK |
| 3 | CTX_VISIBILITY entity에 `ctx-fe-ent:1` 등록 | OK |
| 4 | `ctxFn` 래퍼가 `forwardEng` 미가로챔 → 원본 경유 | OK |
| 5 | `openForwardEngineerForEntity` → `_feShowStep2(entityId)` | OK |
| 6 | XSS — `innerHTML` 삽입 시 `escHtml()` 사용 | OK |
| 7 | null 역참조 — `ctxTargetEntity` 및 `ENTITIES.find` 가드 존재 | OK |
| 8 | 무한루프 — SSE 스트림 `while(true)`는 `done` 조건으로 탈출 보장 | OK |
| 9 | 이벤트 리스너 — `_feShowStep2` 재호출 시 `listEl.innerHTML` 재할당으로 이전 리스너 자동 제거 | OK |
| 10 | 단일 엔티티 모드에서 전체선택 버튼 숨김 처리 | OK |

---

## 최종 권고

심각 이슈 없음. 코드 중복(경미 1번)은 향후 리팩터링 시 정리 권장.
SQL 인젝션(경미 2번)은 미들웨어 연결 환경에서만 동작하는 내부 도구 성격상 즉각 차단이 필수는 아니나,
물리명 입력 검증 강화를 중기 과제로 검토할 것을 권장.
