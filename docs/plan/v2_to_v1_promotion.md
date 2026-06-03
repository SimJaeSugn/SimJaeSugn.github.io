# Agent v2 → v1 승격 파이프라인 설계

> v2 = 실험 레인, v1 = 운영. v2에서 eval/자율루프로 검증된 상태를 v1으로 **반복 승격**한다.
> 목표: 승격을 **거의 기계적**(통째 복사 + 마커블록 치환 + import/심볼 정규화)으로.

## 1. 레이어 분리

| 레이어 | 파일 | 승격 시 |
|--------|------|---------|
| **안정 코어**(공유, 거의 불변) | answer·approve·exec_proxy·execute·replan·respond·tools·tools_proxy·llm·keys | 손대지 않음 (v2가 v1 것을 읽어 씀) |
| **승격 레이어 — REPLACE** | `nodes/analyze.py`·`nodes/plan.py`·`graph.py` | v2 파일을 v1으로 **통째 복사** |
| **승격 레이어 — MERGE(마커)** | `common/schemas.py`·`common/prompts.py`·`common/state.py` | v2의 **promoted 블록**만 v1 동일 블록에 치환 |

## 2. 승격 단위 매핑

| v2 (source) | v1 (target) | 모드 |
|-------------|-------------|------|
| `agent/v2/nodes/analyze.py` | `agent/nodes/analyze.py` | REPLACE (gate.py 은퇴) |
| `agent/v2/nodes/plan.py` | `agent/nodes/plan.py` | REPLACE |
| `agent/v2/graph.py` | `agent/graph.py` | REPLACE |
| `agent/v2/common/schemas.py` (promoted 블록) | `agent/common/schemas.py` (promoted 블록) | MERGE |
| `agent/v2/common/prompts.py` (promoted 블록) | `agent/common/prompts.py` (promoted 블록) | MERGE |
| `agent/v2/common/state.py` (promoted 블록) | `agent/common/state.py` (promoted 블록) | MERGE |

## 3. 변환 규칙 (복사·치환 시)

1. **import 경로**: `agent.v2.` → `agent.` (예: `from agent.v2.common.schemas import IntentSpec` → `from agent.common.schemas import IntentSpec`)
2. **심볼 정규화**(양 레인 동일 이름화 — 1회 셋업): `AgentStateV2`→`AgentState`, `plan_node_v2`→`plan_node`, `build_graph_v2`→`build_graph`. 이후엔 이름이 같아 치환 불필요.
3. **자기참조 회피**: schemas의 `StepV2(Step)`에서 `Step`은 v1 동일 파일에 이미 있으므로, MERGE 블록은 `from agent.common.schemas import Step` 줄을 포함하지 않는다(같은 파일 내 참조).

## 4. 마커 블록 규약 (MERGE 파일)

`schemas.py`·`prompts.py`·`state.py` 의 **승격 대상 영역**을 양 레인에서 마커로 감싼다:

```python
# === PROMOTED:BEGIN (v2→v1 승격 대상) ===
class Goal(BaseModel): ...
class IntentSpec(BaseModel): ...
class StepV2(Step): ...
class PlanV2(BaseModel): ...
# === PROMOTED:END ===
```
- 승격 = v1 파일의 `PROMOTED:BEGIN…END` 사이를 v2 파일의 동일 구간으로 **치환**.
- 베이스(마커 밖)는 보존 → 공유 노드가 쓰는 Step·REPLAN_SYSTEM·헬퍼·AgentState 기존 필드 안전.
- state.py: `route` Literal 확장(act/answer/mixed/clarify)과 `intent` 필드를 마커 블록에 둔다.

## 5. 승격 스크립트 (`tools/promote_v2_to_v1.py`) 동작

```
1. REPLACE 파일: v2 → v1 복사, import 치환(agent.v2→agent)
2. MERGE 파일:   v2의 PROMOTED 블록 추출 → v1의 PROMOTED 블록 치환(import 치환 적용)
3. gate.py 은퇴: 첫 승격에서만 — graph가 analyze를 쓰므로 gate_node 미사용(파일은 남기되 미참조)
4. 검증:
   - python -c "import agent.graph"  (임포트 성공)
   - python -m agent.v2.eval.gate    (격리·자산 동결 — 단 v1 변경은 승격이므로 별도 기준)
   - 변경 파일 diff 요약 출력
5. 사람 확인: 앱 테스트 체크리스트 출력(아래) 후 커밋은 사람이.
```
> 스크립트는 **dry-run 기본**(`--apply` 로 실제 쓰기). 항상 새 브랜치에서.

## 6. 첫 승격 = 일회성 셋업 포함

1. v2에 **심볼 정규화** 적용(AgentStateV2→AgentState 등) + **PROMOTED 마커** 삽입(schemas/prompts/state)
2. v1에도 동일 위치에 **PROMOTED 마커 골격** 삽입(빈 블록 또는 기존 gate 기반 → analyze 기반 전환)
3. 스크립트 1회 실행 → v1이 v2 미러로 정렬 + 현재 품질 반영
4. **앱 테스트**(아래) → 통과 시 머지
5. 이후 승격부턴 스크립트 1회 = 끝

## 7. 앱 테스트 체크리스트 (승격 후 필수 — eval 미검증 영역)

- [ ] answer: "정규화가 뭐야" → 툴 없이 응답
- [ ] act/erd: "회원·주문 만들고 1:N 연결 후 정렬" → 생성·연결·정렬 실행, 드래프트 커밋, undo 1회 롤백
- [ ] act/db: "운영 DB 스키마 보여줘" → fetch_db_schema, ERD 툴 미사용
- [ ] mixed: "회원 보여주고 이메일 추가" → 읽기+쓰기
- [ ] clarify: "그 테이블 지워" → 되묻고 종료(삭제 안 함)
- [ ] approve 게이트·interrupt·resume 정상
- [ ] 새 툴: set_cardinality·normalize_check 동작
- [ ] v1 프론트(agent_panel.js)가 4분기·clarify에서 깨지지 않음

## 8. 격리 하네스 진화

첫 승격 후 v1이 analyze/plan을 보유 → CLAUDE.md "Agent v1/v2 격리"의 의미가
"**v2 실험이 v1을 깨지 않게**(단방향) + **승격은 sanctioned 복사**"로 갱신된다.
v2→v1 의존은 여전히 금지(승격은 코드 복사이지 런타임 import 아님).
