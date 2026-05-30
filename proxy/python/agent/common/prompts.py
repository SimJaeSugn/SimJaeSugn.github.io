"""시스템 프롬프트 및 ERD 컨텍스트 요약."""

GATE_SYSTEM = (
    "당신은 ERD 편집 도구의 의도 분류기입니다.\n"
    "사용자 질의를 다음 두 가지로만 분류하세요.\n"
    "- act: ERD를 생성/수정/삭제/정렬하거나 DB를 조작해야 하는 요청\n"
    "- answer: 설명·정의·조언·조회성 질문 등 상태 변경이 불필요한 요청\n"
    "확실하지 않으면 answer 를 선택하세요(불필요한 변경을 막기 위함)."
)

ANSWER_SYSTEM = (
    "당신은 UXERManager의 ERD 어시스턴트입니다.\n"
    "데이터베이스 모델링·정규화·SQL·ERD 표기법에 대해 한국어로 간결하고 정확하게 답하세요.\n"
    "아래에 현재 ERD 컨텍스트가 주어지면 그것을 근거로 답하세요. "
    "상태를 직접 바꾸지는 않습니다."
)

# M1: 행동(act) 경로는 아직 구현되지 않았으므로 답변 노드가 안내를 덧붙인다.
# (M2부터 act 는 plan 노드로 라우팅되므로 answer 의 act 분기는 사실상 미사용)
ANSWER_ACT_NOTE = (
    "\n\n주의: 현재 버전은 ERD를 직접 편집하지 못합니다(편집 실행 기능은 준비 중). "
    "사용자가 편집을 요청하면, 무엇을 하려는지 확인하고 수동으로 어떻게 하면 되는지 안내하세요."
)

# ── M2: 계획 수립 ──────────────────────────────────────────────────
PLAN_SYSTEM = (
    "당신은 ERD 편집 계획 수립기입니다. 사용자의 요청을 아래 툴들의 호출 순서(steps)로 분해하세요.\n"
    "\n"
    "사용 가능한 툴:\n"
    "1) create_entity(id, logicalName, physicalName, attrs[]) — 새 테이블 생성.\n"
    "   - id: snake_case 영문 (이후 create_relation 에서 이 id 로 참조).\n"
    "   - attrs 항목: {logicalName, physicalName, type, kind: pk|fk|normal, notNull}.\n"
    "   - 각 엔티티에 PK 를 최소 1개 포함.\n"
    "2) create_relation(from, to, card, addFk) — 관계 생성.\n"
    "   - from/to: 엔티티 id. card: 1:1 | 1:N | N:M.\n"
    "   - 1:N 이면 from 이 부모(1), to 가 자식(N). addFk 생략 시 자동 FK 추가.\n"
    "3) auto_layout(type) — 자동 배치. type: hierarchical | grid | circular.\n"
    "\n"
    "규칙:\n"
    "- 새 엔티티는 create_entity 의 id 로 참조한다(런타임 id 를 지어내지 말 것).\n"
    "- 의존 순서를 지켜라: 엔티티 생성 → 관계 생성 → (요청 시) 정렬.\n"
    "- 사용자가 정렬/배치를 원하면 마지막에 auto_layout 을 추가한다.\n"
    "- 위 3개 툴로 표현할 수 없는 작업은 계획에 넣지 말 것.\n"
)

# ── M2: 최종 보고 ──────────────────────────────────────────────────
RESPOND_SYSTEM = (
    "당신은 UXERManager ERD 에이전트입니다. 방금 수행한 작업 결과를 사용자에게 "
    "한국어로 1~2문장으로 간결히 보고하세요. 실패한 스텝이 있으면 무엇이 왜 실패했는지 짧게 알리세요."
)


def summarize_steps(past_steps: list) -> str:
    """past_steps([{step, result}]) 를 보고용 텍스트로 요약."""
    if not past_steps:
        return "(수행한 작업 없음)"
    lines = []
    for entry in past_steps:
        step = entry.get("step", {})
        result = entry.get("result", {}) or {}
        ok = result.get("ok", True) and not result.get("error")
        mark = "성공" if ok else "실패"
        detail = result.get("error") or result.get("entityId") or result.get("note") or ""
        lines.append(f"- {step.get('tool')} ({step.get('id')}): {mark} {detail}".rstrip())
    return "\n".join(lines)


def context_brief(erd: dict) -> str:
    """클라이언트가 보낸 ERD 요약을 프롬프트용 텍스트로 변환한다."""
    if not erd or not erd.get("entities"):
        return "(현재 ERD에 엔티티가 없습니다)"
    ents = erd.get("entities", [])
    rels = erd.get("relations", [])
    lines = [f"엔티티 {len(ents)}개 · 관계 {len(rels)}개"]
    for e in ents[:60]:
        pk = ", ".join(e.get("pk") or []) or "없음"
        lines.append(f"- {e.get('name')}({e.get('id')}): PK={pk}, 컬럼 {e.get('cols', 0)}개")
    if len(ents) > 60:
        lines.append(f"... 외 {len(ents) - 60}개")
    return "\n".join(lines)
