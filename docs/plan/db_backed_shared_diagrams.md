# DB 저장·공유 다이어그램 (DB-backed Shared Diagrams)

> 상태: **계획 수립(설계 확정 전 검토용)** · 작성일 2026-06-29
> 결정 경로: 협업 동기화 아이디어 검토 중 CRDT 트랙(중앙 서버 필요)을 **중단**하고,
> **"DB를 다이어그램 저장·공유 백엔드로 사용"** 방향으로 전환(오너 결정).
> 적용 환경: **데스크톱(Electron) 전용** — 메타 R/W가 프록시(사이드카)를 거치므로 웹(GitHub Pages, 프록시 없음)은 대상 아님.

---

## 1. 배경 / 문제

기존 공유·협업 수단의 한계(조사 결과):

| 기능 | 파일 | 한계 |
|------|------|------|
| P2P 협업 | `js/webrtc.js` (PeerJS WebRTC) | 호스트 Peer ID가 매 세션 랜덤 → 매번 재참여. 양쪽 동시 온라인 필요. full-state-overwrite(충돌 시 손실). 데이터 영속 안 됨 |
| 공유 URL | `js/share.js` (LZ-String) | URL에 통째 인코딩(서버 저장 없음). 사실상 읽기 전용 스냅샷 |
| 탭 동기화 | `js/broadcast.js` (BroadcastChannel) | 같은 브라우저 탭 간만 |

핵심 결핍: **"진실의 원천을 보관할 상시 가동 서버"**. CRDT 트랙은 이를 별도 서버로 해결하려 했으나, 데스크톱 전용 환경에서 상시 서버를 두기 어려움.

**해법:** DB는 이미 ① 상시 가동 ② 다중 사용자 동시 접속 ③ 영속 ④ 권한 체계를 갖춘 공유 인프라다. **DB를 공유 동기화 백엔드로 그대로 쓴다.** 다이어그램 정의를 DB의 **격리된 메타 테이블**에 저장하고, 같은 DB에 붙은 사람은 동일 다이어그램을 보고·편집한다.

---

## 2. 목표 / 비목표

**목표**
- 다이어그램 생성 시 **로컬(local) / DB연결(db)** 유형을 선택할 수 있다.
- 다이어그램은 **각자 독립된 DB 연결 정보**를 가진다(다이어그램A=PostgreSQL, B=MySQL, C=로컬 동시 가능).
- DB 다이어그램의 정의(엔티티·관계·위치·논리명·메모 전부)는 그 DB의 **격리된 메타 테이블**에 저장된다. **업무 테이블과 전혀 무관**(FK·참조 없음).
- DB 접속 정보를 공유하면 = 다이어그램이 공유된다(별도 참여 절차 없이 같은 DB를 보는 모두가 동일 다이어그램).
- 편집은 **메타 테이블로 양방향 자동 반영**(공유 동기화). 새로고침/폴링으로 타인의 변경 수신.
- (선택·명시적) ERD 구조 변경을 **실제 업무 스키마**에 반영(포워드 엔지니어링)도 가능.

**비목표(이번 범위 밖)**
- 웹(프록시 없는 GitHub Pages) 지원.
- 실시간 즉시 푸시(WebSocket 푸시) — 1차는 폴링/수동 새로고침.
- 완전 CRDT 동시편집 — `version` 낙관적 잠금으로 단순 처리.
- 메타 테이블을 introspection(`/schema`, reverse engineer) 결과에서 숨기는 것은 옵션(권장이나 필수 아님).

---

## 3. 데이터 모델

### 3.1 클라이언트 다이어그램 모델 확장

현재 다이어그램 객체(`js/state.js`)에 필드 추가:

```js
{
  id, name, entities, relations, /* ...기존... */
  source: 'local' | 'db',          // 신규 — 생성 시 결정
  connection: {                     // 신규 — source==='db'일 때
    profileName: '운영DB',          // ~/.uxermanager/config.json 의 프로파일 참조
  },
  remoteVersion: 12,                // 신규 — 메타 테이블 version 동기화용(낙관적 잠금)
}
```

- `source==='local'`: 기존과 동일하게 localStorage/`~/.uxermanager/aerm_workspace.json`에 저장.
- `source==='db'`: 정의는 **메타 테이블**이 원본. 로컬에는 캐시 + 연결 참조만.

### 3.2 메타 테이블 (DB 측, 업무 테이블과 격리)

테이블명: `UXER_ERD_DIAGRAM` (접두 `UXER_`로 충돌 회피, FK 없음, 업무 스키마 무참조)

| 컬럼 | 타입(예) | 의미 |
|------|---------|------|
| `diagram_id` | VARCHAR(64) PK | 다이어그램 식별자(클라 생성 UUID류) |
| `name` | VARCHAR(255) | 다이어그램 이름 |
| `payload` | TEXT/CLOB/JSON | 다이어그램 정의 JSON 통째(entities·relations·위치·논리명·메모) |
| `version` | INTEGER | 낙관적 잠금용 단조 증가 |
| `updated_at` | TIMESTAMP | 마지막 수정 시각 |
| `updated_by` | VARCHAR(128) | 마지막 수정자(선택, 사용자명/디바이스) |

- DB 타입별 DDL 차이(JSON vs CLOB vs TEXT)는 어댑터가 흡수. `CREATE TABLE IF NOT EXISTS` 멱등 생성.
- 한 메타 테이블에 **여러 다이어그램(행 단위)** 저장 → 같은 DB에 다이어그램 여러 개 공유 가능.

---

## 4. 핵심 구조 변경 — 다이어그램별 연결 (최대 리스크)

**현재 제약(조사 확인):** 프록시는 **단일 활성 프로파일** 구조다.
- `load_config()`는 `store["active"]` 1개만 반환(`routers/config.py`).
- `/schema`·`/execute` 등 모든 SQL은 활성 프로파일로만 실행.
- 어댑터 pool이 **DB타입별 전역 1개**. 프로파일 전환 시 `close_all_pools()`로 재생성.

→ "다이어그램마다 다른 연결"을 쓰려면 **요청별 프로파일 선택 + 프로파일별 pool**로 확장해야 한다. 이것이 본 기능의 **가장 큰 인프라 변경**.

**변경 방향(Python·Node 동형):**
1. `load_config(profile_name=None)` — 인자로 특정 프로파일 로드(없으면 기존 active 폴백, **하위호환 유지**).
2. 어댑터 pool을 `dict[config_key] -> pool` 멀티풀로. 기존 전역 단일 → 키별 보관(LRU/상한 고려).
3. SQL 실행 엔드포인트가 `profileName`을 받도록 확장(쿼리스트링 또는 body). **미지정 시 기존 동작(active)** → 기존 호출부 무영향.
4. `close_all_pools()`는 유지하되 선택적 종료(특정 key) 옵션 추가.

> 하위호환 원칙: 기존 `/schema`·`/execute` 호출은 `profileName` 없이도 그대로 작동(active 폴백). 기존 에이전트 툴·SQL 실행기 무영향.

---

## 5. 신규 API — `erd-store` 라우터

신규 라우터 `proxy/python/routers/erd_store.py` (+ `proxy/nodejs/src/routes/erd_store.js` 대응). 모두 `profileName`으로 대상 연결 지정.

| 메서드 · 경로 | 역할 |
|---------------|------|
| `POST /erd-store/init?profileName=` | 메타 테이블 보장(`CREATE TABLE IF NOT EXISTS`). 멱등 |
| `GET /erd-store/list?profileName=` | 해당 DB의 다이어그램 목록(id·name·version·updated_at) |
| `GET /erd-store/{diagramId}?profileName=` | payload 로드 |
| `PUT /erd-store/{diagramId}?profileName=` | payload 저장. body에 `expectedVersion` 포함 → **버전 불일치 시 409**(낙관적 잠금) |
| `DELETE /erd-store/{diagramId}?profileName=` | 다이어그램 행 삭제 |

- 모든 SQL은 §4의 멀티풀 경로로 해당 프로파일에 실행.
- DDL/DML 커밋은 기존 어댑터 커밋 로직(multi-statement nextset 소진 후 1회 커밋) 재사용.

---

## 6. 양방향 반영 — 2층 분리(안전 핵심)

| 대상 | 트리거 | 동작 | 위험 |
|------|--------|------|------|
| **메타 테이블** (공유 동기화) | 편집 시 자동(디바운스 `PUT /erd-store/{id}`) | 우리 테이블만 갱신 → 타인이 새로고침/폴링으로 수신 | 낮음 |
| **실제 업무 스키마** (포워드 엔지니어링) | 사용자가 "DB에 적용" 명시 실행 | `apply_erd_to_db`(기존 위험 툴) 재사용, 승인 필수 | 높음 |

→ **공유용 양방향 = 메타 테이블 자동**, **실제 테이블 변경 = 명시적·승인제.** 이 분리를 흐리지 않는다(실수로 업무 스키마가 바뀌면 안 됨).

---

## 7. 동기화 · 충돌 처리

- **로드**: 다이어그램 열 때 `GET /erd-store/{id}` → payload·version 적재(`remoteVersion`).
- **저장**: 편집 → 디바운스 후 `PUT`(body에 `expectedVersion = remoteVersion`).
  - 성공 → `version+1`, `remoteVersion` 갱신.
  - **409(타인이 먼저 수정)** → 최신 payload 재로드 후 사용자에게 알림(또는 단순 LWW 재시도, 1차는 재로드 권장).
- **수신(타인 변경)**: 폴링(`GET /erd-store/list`로 version 비교, 주기 예: 5~10s) 또는 수동 새로고침 버튼. 1차는 **수동 새로고침 + 가벼운 폴링**으로 시작.
- 완전 동시편집(필드 단위 머지)은 비목표 — 필요 시 후속에 CRDT 검토.

---

## 8. 프론트엔드 변경

| 영역 | 작업 |
|------|------|
| 생성 UI | 다이어그램 생성 다이얼로그에 **로컬 / DB연결** 선택 + 프로파일 선택 드롭다운(`list_db_profiles` 재사용). DB연결 시 "빈 캔버스 / 기존 스키마에서 reverse engineer 초기 채움" 옵션 |
| 상태 모델 | `js/state.js` — `source`·`connection`·`remoteVersion` 필드, 저장 분기(local=기존, db=erd-store) |
| 신규 모듈 | `js/erd_db_store.js` — load/save(디바운스)/list/poll, 409 처리 |
| 표시 | 다이어그램 탭/목록에 DB연결 배지(어느 프로파일인지) |
| 초기 채움(선택) | 기존 `reverse_engineer.js` 빌더 재사용 가능 |

---

## 9. 로드맵

> 상태: **M1~M6 구현 완료** (2026-06-29, 브랜치 `feature/db-backed-shared-diagrams`). feature-dev 파이프라인 3패스(analyst→implementer→integration-checker→reviewer) 통과. 인앱 E2E·사이드카 재빌드는 사용자 검증 몫.

| 마일스톤 | 내용 | 상태 |
|----------|------|------|
| **M1** | 프록시 연결 구조 확장 — `load_config(profile_name)` + 어댑터 멀티풀(`_pools`/`_conns` dict) + 엔드포인트 `profileName` 수용(하위호환 active 폴백). 기존 동작 회귀 0 | ✅ 완료 |
| **M2** | `erd-store` 라우터(init·list·get·put·delete) + 메타 테이블 멱등 생성(4 DB 타입). **값은 전부 드라이버 네이티브 파라미터 바인딩**(`execute_params`/`executeParams` — 문자열 이스케이프 폐기, MySQL 백슬래시 결함 회피). 409 낙관적 잠금. Python·Node 동형 | ✅ 완료 |
| **M3** | 프론트 — 생성 UI(로컬/DB연결·프로파일 선택), `js/state.js` 분기(`source`·`connection`·`remoteVersion`), 신규 `js/erd_db_store.js` 로드/저장(디바운스), Explorer DB 배지, 백업 자동포함 | ✅ 완료 |
| **M4** | 동기화 — version 낙관적 잠금(409 재로드+토스트), 8s 폴링(중첩 가드·저장중 스킵), 에코 루프 가드(`_erdDbApplying`), undo/redo stale version 보정 | ✅ 완료 |
| **M5** | reverse engineer 초기 채움(생성 시 "빈 캔버스/리버스 엔지니어링" 선택, `reverse_engineer.js` 빌더 재사용) + 포워드 엔지니어링 진입점(기존 `forward_engineer.js` 재사용 + 프로파일 불일치 경고) | ✅ 완료(`/execute/stream?profileName=` 인지 FE는 별도 단계로 분리) |
| **M6** | 보안·UX — 생성 모달 자격증명 공유 경고 박스, 메타테이블 introspection 숨김(`schema.py` `_filter_meta` + `tools_proxy.py` `_filter_meta_schema`, 대소문자 무관 정확매칭) | ✅ 완료 |

권장 순서: **M1(인프라) → M2(저장소) → M3(생성·로드) 까지가 MVP**(공유·로드·저장 성립). M4부터 동시편집 견고화.

### 후속 분리 항목(미완)
- **profileName 인지 포워드 엔지니어링** — `/execute/stream?profileName=` 연동(현재 FE는 활성 프로파일 기준 + 불일치 경고로 완화). 별도 단계.
- **멀티풀 상한(LRU)** — 다이어그램이 여러 DB를 열면 pool 증가. 현재 상한 미설정(리스크 §10.2).
- **메타필터 상수 중복** — `_UXER_META_TABLES`가 `schema.py`·`tools_proxy.py` 양쪽 정의(메타테이블 추가 시 동기화 필요).

---

## 10. 리스크 / 미결정

1. **자격증명 공유 = 보안 노출** — DB 접속 정보를 받은 사람은 DB 전체 접근 가능. 읽기전용 계정 권장 안내 + 공유 시 경고 필요(M6). 메타 쓰기는 INSERT/UPDATE 권한 필요 → 읽기전용 계정이면 편집 불가(보기 전용 공유로는 적합).
2. **멀티풀 자원** — 다이어그램이 여러 DB를 동시에 열면 pool이 늘어남. 상한·idle 종료 정책 필요.
3. **메타 테이블 권한** — 공유 DB에 `CREATE TABLE` 권한이 없을 수 있음 → init 실패 시 명확한 안내(관리자 사전 생성 경로 제공).
4. **DB별 payload 타입** — JSON 타입 지원(PG/MySQL 최신) vs TEXT/CLOB(Oracle/구버전). 어댑터가 흡수하되 길이 한계 주의(대형 다이어그램).
5. **폴링 부하** — 주기·대상 최소화. 1차는 수동 새로고침 우선.
6. **양방향 경계 오용** — 메타 자동저장과 업무 스키마 포워드엔지니어링을 UI에서 명확히 분리(실수 방지).
7. **Node multi-statement 미지원** — 조사상 Node 어댑터는 단일 문장. erd-store SQL은 단일 문장 위주로 설계(문제 없음).

---

## 11. 격리·영향 범위 메모

- 본 기능은 신규 라우터(`erd-store`)·신규 프론트 모듈(`erd_db_store.js`) 추가가 주. 기존 `/schema`·`/execute`·`config`는 **하위호환 확장(profileName 옵션)** 만.
- 에이전트 v1/v2/v3 격리와 무관(에이전트 경로 미수정). 다만 §4 멀티풀은 공유 인프라(`db/`)라 에이전트 SQL에도 영향 가능 → **하위호환(active 폴백) 필수**로 회귀 방지.
- 양쪽 프록시(Python·Node) 동형 구현 + README 동기화(섹션 25·27, `proxy/*/README.md` API·파일구조) 필요.
