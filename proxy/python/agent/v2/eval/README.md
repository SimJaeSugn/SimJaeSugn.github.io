# agent/v2/eval — v2 검증 오라클

자연어 ERD 제어 **v2의 의도·계획 품질을 픽스처로 채점**하는 오프라인 하네스.
`analyze → plan` 까지만 **dry-run**(실행 없음)으로 돌려 의도 분류·대상(scope)·툴 선택의
정확도를 수치화한다. 실제 ERD/DB 를 건드리지 않으므로 안전하고 반복 가능하다.

> 계획서 근거: `docs/AI_ERD_v2_의도분석_계획준수_구현계획서.html` §7(검증 하네스) · §10.1 P1(=루프 성숙도 L0).
> v2 전용 모듈 — v1(`agent/*`·`routers/agent.py`)을 일절 import 하지 않는다(§9.1 단방향 격리).

---

## 구성

| 파일 | 역할 |
|------|------|
| `fixtures.jsonl` | 테스트 케이스 (한 줄 = 한 케이스, JSON Lines·UTF-8) |
| `scorer.py` | 채점 — `score_case(expect, intent, plan)` / `aggregate(rows)` |
| `runner.py` | 구동 — `analyze→plan` dry-run, N회 반복, 집계, CLI |
| `__init__.py` | 공개 API: `load_fixtures` · `run_fixtures` · `score_case` · `aggregate` |

---

## 실행 방법

### 1) CLI (프록시 미기동 상태에서도 가능 · CI용)

`proxy/python/` 디렉토리에서 모듈로 실행한다(패키지 경로 해석을 위해).

```powershell
cd proxy/python

# 전체 픽스처를 케이스당 5회 반복 채점 → 스코어카드 출력
python -m agent.v2.eval.runner --reps 5

# 골든셋만 / 홀드아웃셋만
python -m agent.v2.eval.runner --split golden --reps 5
python -m agent.v2.eval.runner --split holdout --reps 5

# 케이스별 실제 산출(intent·plan·checks)까지 JSON 으로 덤프 — 디버깅·보정(P2)용
python -m agent.v2.eval.runner --json

# CI 게이트 — overall 통과율이 임계 미달이면 종료코드 1
python -m agent.v2.eval.runner --reps 5 --min-pass 0.8

# 다른 픽스처 파일 사용
python -m agent.v2.eval.runner --fixtures path/to/other.jsonl
```

**옵션**

| 플래그 | 기본 | 설명 |
|--------|------|------|
| `--fixtures PATH` | 내장 `fixtures.jsonl` | 채점할 픽스처 파일 |
| `--reps N` | `5` | 케이스당 반복 횟수(비결정성 대비, pass@k) |
| `--split` | `all` | `all` \| `golden` \| `holdout` |
| `--min-pass R` | 없음 | overall 통과율 임계 — 미달 시 종료코드 1 |
| `--json` | off | 스코어카드 대신 전체 결과 JSON 출력 |

**종료코드** — `0` 정상 · `1` 채점 오류 발생 또는 `--min-pass` 미달 · `2` OpenAI 키 미설정

> 모델 호출에는 OpenAI 키가 필요하다(`설정 ▸ Agent설정`에서 저장된 키스토어 사용).
> 키가 없으면 종료코드 2 로 친절히 안내한다. `temperature=0` 으로 결정성을 최대화한다.

### 2) HTTP 엔드포인트 (앱/프록시 기동 중)

```
POST /agent/v2/eval
{ "path": null, "reps": 5, "split": "all" }   # path 미지정 시 내장 픽스처, reps 1~20
→ { "summary": { golden/holdout/overall 지표 }, "rows": [ 케이스별 결과 ] }
```

### 3) 파이썬 직접 호출

```python
from agent.v2.eval.runner import run_fixtures
result = run_fixtures(reps=5, split="golden")
print(result["summary"]["overall"])
```

---

## 픽스처 작성 규칙 (`fixtures.jsonl`)

한 줄에 **유효한 JSON 객체 하나**. 케이스를 추가하려면 줄을 추가하고 다시 실행하면 된다
(코드 수정 불필요).

```jsonc
{
  "id": "F-12",                 // 고유 ID (필수)
  "split": "golden",            // golden=루프 노출 / holdout=일반화 검증 (필수)
  "query": "고객 테이블 만들어",  // 질의 (필수)
  "note": "설명용 메모",          // 채점에 영향 없음 (선택)
  "context": {                  // ERD 스냅샷 — 참조형 질의에 권장 (선택)
    "entities": [{"id":"member","name":"회원","pk":["member_id"],"cols":3}],
    "relations": [], "dbType": "MySQL"
  },
  "tool_catalog": [ ... ],      // 기본 카탈로그 대신 직접 지정 (거의 불필요, 선택)
  "expect": {
    "kind": "act",              // answer|act|mixed|clarify · 리스트 가능 예: ["act","mixed"] (필수)
    "scope": "erd",             // erd|db|concept|"erd+db" — goals 의 target_scope 집합과 정확 일치 (선택)
    "goals": ">=1",             // 정수=정확 / ">=N"=하한 (선택)
    "tools": ["create_entity"], // 계획이 모두 포함(⊇)해야 (선택)
    "forbidden": ["run_sql"]    // 계획에 하나도 없어야(∅) (선택)
  }
}
```

### 작성 시 주의 (P2 보정에서 얻은 교훈)

1. **참조형 질의("그 테이블 비교/삭제/조회")엔 `context` 를 붙인다.** 빈 컨텍스트면 모델이 무엇을
   가리키는지 알 수 없어 채점이 불가능해진다. 대상 테이블을 `context.entities` 에 넣어 의도를 확정한다.
2. **`scope` 는 "정확히 일치"(엄격)** — goals 의 `target_scope` 집합이 expect.scope 와 **완전히 같아야**
   통과. 모델이 군더더기 목표를 하나 더 뱉으면 실패한다. 불확실하면 `scope` 를 생략하고 `tools` 로 검사.
3. **`answer`·`clarify` 케이스는 `kind` 만 적는다.** 이 둘은 `plan` 을 돌리지 않으므로(§7.2)
   `tools`·`scope`·`forbidden` 검사는 적용되지 않는다(자동 통과).
4. **`tools` 에는 실재하는 툴 이름만** 쓴다. 클라(`create_entity`·`describe_table`·`auto_layout`·
   `delete_entity`·`add_attribute`·`generate_ddl` 등)나 프록시(`fetch_db_schema`·`run_sql`)에 없는
   이름은 plan 의 카탈로그 필터가 제거해 항상 실패한다.

### 골든 vs 홀드아웃

- **골든** — 루프(P3)가 보고 학습할, 대표적이고 명확한 케이스.
- **홀드아웃** — 같은 결함을 **다른 표현**으로 노린 일반화 검증용(루프 미노출). 과적합 탐지의 핵심.
- 성공 판정은 **"골든 통과율 ↑ AND 홀드아웃 통과율 ↑"** 일 때만 — 한쪽만 높으면 과적합 의심(§7.1).

---

## 채점 지표 (`scorer.py` · 계획서 §7.1)

`run_fixtures` 가 반환하는 `summary[split]` 의 항목:

| 지표 | 의미 |
|------|------|
| `rep_pass_rate` | 반복 단위 전체 통과율 (적용된 모든 검사를 통과한 비율) |
| `case_pass_rate` | 전 반복을 통과한 케이스의 비율 |
| `intent.kind` / `intent.scope` / `intent.goals` | 의도 분류·대상·목표개수 정확도 |
| `plan.tools` / `plan.forbidden` | 계획이 기대 툴 포함 / 금지 툴 미사용 비율 |
| `clarify_recall` | 모호 케이스에서 `clarify` 로 되묻은 비율(추측 방지) |
| `confusion_rate` | **대상 혼동률** — 운영DB 요청에 ERD 쓰기 툴을 쓴 비율(v1 대표 결함) |

### dry-run 동작

- `kind ∈ {act, mixed}` 일 때만 `plan` 을 돌린다. `answer`·`clarify` 는 계획 단계가 없다.
- `plan` 노드에 클라이언트 ERD 툴 카탈로그가 필요하므로, 픽스처가 `tool_catalog` 를 주지 않으면
  `runner.DEFAULT_CLIENT_CATALOG` 를 공급한다(없으면 ERD 툴이 필터링돼 거짓 실패).
- 어떤 경우에도 `approve`·`execute` 노드를 거치지 않아 실제 변경이 발생하지 않는다.
