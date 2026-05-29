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
ANSWER_ACT_NOTE = (
    "\n\n주의: 현재 버전은 ERD를 직접 편집하지 못합니다(편집 실행 기능은 준비 중). "
    "사용자가 편집을 요청하면, 무엇을 하려는지 확인하고 수동으로 어떻게 하면 되는지 안내하세요."
)


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
