# agent/v2/eval — v2 검증 오라클

자연어 ERD 제어 **v2의 의도·계획 품질을 픽스처로 채점**하는 오프라인 하네스.
`analyze → plan` 까지만 **dry-run**(실행 없음)으로 돌려 의도 분류·대상(scope)·툴 선택의
정확도를 수치화한다. 실제 ERD/DB 를 건드리지 않으므로 안전하고 반복 가능하다.

> 계획서 근거: `docs/ref/AI_ERD_v2_의도분석_계획준수_구현계획서.html` §7(검증 하네스) · §10.1 P1(=루프 성숙도 L0).
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

---

## 자동 최적화 루프 (P3) — 단계별 실행 런북

eval 점수를 잣대 삼아 **v2 프롬프트/노드를 자동으로 개선**하는 자기수정 루프다(계획서 §12~15).
`계획→구현→게이트→검증`을 정지 조건까지 반복하며, **오라클 점수가 오르는 변경만** 채택한다.
사람이 매 수정을 지시하지 않아도 `agent/v2/` 코드가 목표 통과율까지 수렴한다.

### 구성 요소

| 파일/자산 | 역할 |
|----------|------|
| `runner.py` | VERIFY — 매 라운드 점수 측정(잣대) |
| `gate.py` | GATE — v1 무손상·테스트자산(eval/) 동결을 매 라운드 강제(점수 위조·격리위반 차단) |
| `docs/plan/agentv2_autoloop.workflow.js` | 루프 오케스트레이션(driver B, loop-until-pass) |
| `git tag autoloop-base` | 게이트 비교 기준점(루프 시작 시점) |
| 브랜치 `feature/agentv2-autoloop` | 작업 격리(main 미오염) |

### 안전장치 (자동 강제)

- **하드 게이트**(`gate.py`): 매 라운드 v1 파일·`eval/`(픽스처·scorer·runner·gate) 변경 0 검사 → 위반 시 그 변경 롤백.
- **홀드아웃 게이트**: 골든만 오르고 홀드아웃이 떨어지면(과적합) 채택 거부.
- **정지 조건**: `골든≥목표 AND 홀드아웃≥목표`(성공) · 무진전 K회 · `max_rounds` · 토큰 예산 → 에스컬레이트.
- **성공 판정은 오직 `runner` 점수**로(LLM 자기판단 배제).
- 루프는 `agent/v2/`(단 `eval/` 제외)만 수정. `eval/`·v1·`fixtures`는 절대 못 건드린다.

---

### 🔁 시나리오: **새 테스트 케이스로 다시 최적화하기** (가장 흔한 경로)

향후 새 결함·질의 유형을 발견하면, 픽스처에 케이스를 추가하고 루프를 다시 돌려
v2를 그 케이스까지 통과하도록 재수렴시킨다. 아래 순서를 그대로 따른다.

> ⚠️ **핵심 함정**: 게이트는 `eval/`(픽스처 포함)의 변경을 "점수 위조"로 보고 차단한다.
> 따라서 **새 픽스처를 먼저 커밋하고, 그 커밋 시점으로 기준점 태그(`autoloop-base`)를 옮긴 뒤** 루프를 돌려야 한다.
> 안 그러면 새로 추가한 픽스처가 게이트에 "변조"로 걸려 매 라운드 롤백된다.

#### 1단계 — 새 케이스 추가

`fixtures.jsonl` 에 줄을 추가한다(위 "픽스처 작성 규칙" 준수: 참조형엔 `context`, 실재 툴명만, answer/clarify는 `kind`만).
골든/홀드아웃을 짝지어 넣으면 과적합 탐지가 된다.

#### 2단계 — 베이스라인 점수 측정 (현재 v2가 새 케이스를 얼마나 푸나)

```powershell
cd proxy/python
python -X utf8 -m agent.v2.eval.runner --reps 5
```
새 케이스가 실패로 잡히는지 확인한다. (전부 통과면 최적화할 게 없다.)

#### 3단계 — 작업 브랜치 + 픽스처 커밋

```powershell
# 저장소 루트에서
git checkout -b feature/agentv2-autoloop   # 이미 있으면 git checkout feature/agentv2-autoloop
git add proxy/python/agent/v2/eval/fixtures.jsonl
git commit -m "autoloop: 새 테스트 케이스 추가"
```

#### 4단계 — 기준점 태그를 "픽스처 커밋 시점"으로 이동 (함정 회피)

```powershell
git tag -f autoloop-base        # 새 픽스처를 포함한 현재 HEAD를 기준점으로
```

#### 5단계 — 게이트가 깨끗한지 확인 (반드시 PASS)

```powershell
cd proxy/python
python -m agent.v2.eval.gate --base autoloop-base
# → "GATE PASS" / exit 0 이어야 함. FAIL이면 4단계 태그 이동을 다시 확인.
```

#### 6단계 — 루프 실행

**(B) 자동 — Claude Code Workflow** (권장):
Claude Code에서 `docs/plan/agentv2_autoloop.workflow.js` 를 Workflow로 실행한다.
대량 토큰을 쓰므로 명시적 실행이 필요하다. 토큰 예산을 주면(예 `+300k`) 한도 내에서 자동 중단한다.

**(A) 반자동 — 사람이 라운드 확인**:
매 라운드 `runner`로 실패 케이스 확인 → 프롬프트 1곳 수정 → `gate` → `runner` 재측정 →
점수 오르면 커밋, 내리면 `git restore`. 점수 신뢰가 쌓이면 (B)로 승격.

#### 7단계 — 결과 해석

루프 반환값(`outcome`)으로 판단한다.

| outcome | 의미 | 다음 행동 |
|---------|------|----------|
| `success` | 골든·홀드아웃 모두 목표 도달 | 8단계 머지 |
| `noprogress` | K회 연속 점수 정체 | 가설 한계 — 픽스처/프롬프트 수동 점검 |
| `max_rounds` | 라운드 상한 도달 | 진전 있었으면 라운드 늘려 재실행 |
| `budget` | 토큰 예산 소진 | 예산 늘려 이어서 실행 |

각 라운드의 `{가설, golden, holdout, 채택여부}` 이력이 함께 반환된다.

#### 8단계 — 머지

```powershell
python -X utf8 -m agent.v2.eval.runner --reps 5   # 최종 점수 재확인(reps=5)
git checkout main
git merge feature/agentv2-autoloop
```
머지 전, 누적 변경이 `agent/v2/`(eval 제외)에만 있는지 확인:
```powershell
git diff main feature/agentv2-autoloop --name-only
```

---

### 파라미터 조정

`docs/plan/agentv2_autoloop.workflow.js` 상단 상수:

| 상수 | 기본 | 의미 |
|------|------|------|
| `GOLDEN_TARGET` / `HOLDOUT_TARGET` | 0.90 / 0.90 | 성공(정지) 통과율 |
| `HOLDOUT_FLOOR` | 0.85 | 이 밑으로 떨어지면 과적합으로 보고 채택 거부 |
| `MAX_ROUNDS` | 12 | 라운드 상한 |
| `K_NOPROGRESS` | 3 | 연속 무진전 정지 횟수 |
| `REPS_ITER` / `REPS_FINAL` | 3 / 5 | 반복 중 / 확정 시 채점 반복 횟수 |

### 트러블슈팅

- **게이트가 계속 FAIL** — `git diff autoloop-base --name-only` 로 무엇이 걸렸는지 확인. v1 파일이면 그 변경을 되돌리고, 새 픽스처면 4단계(태그 이동)를 안 한 것.
- **골든↑ 홀드아웃↓(과적합)** — 하드코딩/특수분기 의심. 해당 변경을 되돌리고 더 일반적인 가설로.
- **점수가 라운드마다 출렁** — 비결정성. `REPS_ITER`를 5로 올려 안정화.
- **OpenAI 키 없음(exit 2)** — `설정 ▸ Agent설정`에서 키 저장 후 재실행.
