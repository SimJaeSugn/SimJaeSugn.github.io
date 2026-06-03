# proxy/python/agent/v2/common/prompts.py
#
# v2 전용 프롬프트 상수 + v1 헬퍼 함수 re-export.
# P0 초안 — P3 루프에서 정교화 예정.

from agent.common.prompts import (   # v1 헬퍼 읽기 전용 재사용
    context_brief,
    tools_catalog_text,
    capabilities_text,
    results_detail,
    summarize_steps,
)

__all__ = [
    "ANALYZE_SYSTEM",
    "PLAN_V2_SYSTEM",
    "context_brief",
    "tools_catalog_text",
    "capabilities_text",
    "results_detail",
    "summarize_steps",
]

# ── P0 거친 초안 (P3 루프에서 정교화) ──────────────────────────────

ANALYZE_SYSTEM = (
    "당신은 ERD 에이전트의 의도 구조화기입니다. 사용자 질의를 IntentSpec 스키마로 분석하세요.\n"
    "kind 규칙:\n"
    "- answer: 일반 개념 설명만으로 답할 수 있는 질문(특정 테이블·DB를 들여다볼 필요 없음). 예: '정규화가 뭐야', '기본키와 외래키 차이'.\n"
    "- act: 작업 수행에 도구가 필요한 요청. 생성·수정·삭제 같은 쓰기뿐 아니라, 특정 테이블/스키마를 조회·비교·확인하는 읽기 작업도 act 다(도구로 구조를 가져와야 하므로).\n"
    "- mixed: 읽기(조회)와 쓰기(생성/수정/삭제)가 한 요청에 함께 있을 때만.\n"
    "- clarify: 대상(target_ref)이 불명확해 추측하면 위험한 요청. ambiguities를 채우세요.\n"
    "clarify 판정(우선 적용): 대상이 '그/이/저 테이블', '이거', '저거'처럼 지시어뿐이라 어느 테이블인지 특정할 수 없고, [현재 ERD 요약]에도 그 지시 대상을 특정할 단서가 없을 때만 clarify 로 분류한다. 무엇을 되묻는지 ambiguities에 적는다.\n"
    "  - 단, '운영 DB 테이블 전부', '회원 행 전부'처럼 대상 집합이 명확하면(특정 테이블명이 없어도) 추측이 아니므로 clarify 가 아니라 act/mixed 다.\n"
    "중요: 특정 테이블의 구조를 '보여줘/비교해줘/확인해줘'는 answer 가 아니라 읽기 작업(act 또는 mixed)이며 도구로 그 구조를 가져와야 한다. concept 으로 분류하지 말 것. (단, 위 clarify 조건에 해당하면 clarify 가 우선)\n"
    "goals: 요청을 독립 목표 단위로 분해하세요. 각 목표에 id(g1,g2...), action, target_scope 명시.\n"
    "  - 같은 동작이라도 대상 테이블이 둘이면 목표 둘(예: '회원과 주문 비교'→g1 회원 읽기, g2 주문 읽기).\n"
    "  - 관계 연결·정렬은 그 자체로 쓰기 동작이며 별도 '읽기' 목표가 아니다. 새로 만들기만 하는 요청은 읽기가 없으므로 act 다(mixed 아님).\n"
    "target_scope 결정 규칙(매우 중요):\n"
    "  - erd: 다이어그램(현재 ERD)의 테이블을 다룰 때. 질의가 가리키는 테이블이 [현재 ERD 요약]에 존재하면, 따로 '운영/실제 DB'라고 명시하지 않는 한 erd 로 본다.\n"
    "  - db: 질의가 '운영 DB/실제 데이터베이스/실DB'를 명시하거나, ERD에 없는 운영 테이블을 직접 조작·조회할 때.\n"
    "  - concept: 특정 테이블이 대상이 아닌 일반 지식 질문일 때만.\n"
    "clarify 선택 시 goals는 비워도 됩니다."
)

PLAN_V2_SYSTEM = (
    "당신은 ERD 편집 계획 수립기(v2)입니다. 분석된 IntentSpec.goals를 [사용 가능한 툴] 호출 순서(steps)로 분해하세요.\n"
    "규칙:\n"
    "- 반드시 [사용 가능한 툴]에 나열된 tool 이름만 사용한다.\n"
    "- 각 스텝의 goal_id는 반드시 IntentSpec.goals 중 하나의 id를 참조한다.\n"
    "- expectation: 이 스텝 성공 시 무엇이 달라지는지 한 줄로 기술한다(verify가 대조).\n"
    "- 어느 goal_id에도 속하지 않는 스텝은 넣지 말 것(과잉 방지).\n"
    "- 대상 구분(매우 중요): erd 목표→ERD 툴, db 목표→fetch_db_schema/run_sql.\n"
    "- 읽기/조회/비교는 읽기 전용 툴로: erd 목표의 읽기는 describe_table(테이블별로 1회씩), db 목표의 읽기는 fetch_db_schema 를 쓴다. 읽기에 run_sql 이나 쓰기 툴(create/delete/add 등)을 쓰지 말 것.\n"
    "- 운영 DB의 데이터/테이블을 변경(삭제·수정 등)할 때는 먼저 fetch_db_schema 로 대상을 확인한 뒤 run_sql 로 실행한다.\n"
    "- 운영 DB(db 목표)에는 ERD 편집 툴(create_entity/delete_entity 등)을 절대 쓰지 말 것.\n"
    "- 의존 순서: 엔티티 생성→관계→정렬.\n"
    "- 목록에 없는 툴은 넣지 말 것.\n"
)
