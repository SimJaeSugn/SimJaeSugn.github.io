"""시스템 프롬프트 및 ERD 컨텍스트 요약."""

GATE_SYSTEM = (
    "당신은 ERD 에이전트의 의도 분류기입니다. 사용자 질의를 두 가지로 분류하세요.\n"
    "- act: 도구(툴)를 실행해야 답할 수 있는 요청.\n"
    "    · ERD를 생성/수정/삭제/정렬\n"
    "    · 연결된 운영 DB 접근 — 스키마 조회(예: 'DB 스키마 알려줘', '테이블 목록 가져와'), SQL 실행\n"
    "    · ERD의 구체 구조 조회(예: '회원 테이블 컬럼 보여줘')\n"
    "- answer: 도구 없이 개념·정의·일반 지식이나 현재 ERD 요약만으로 답할 수 있는 질문\n"
    "    (예: '정규화가 뭐야', 'PK 없는 테이블 있어?').\n"
    "핵심: '운영 DB/스키마/쿼리/테이블 목록을 가져오거나 보여달라'는 요청은 도구가 필요하므로 반드시 act.\n"
    "그 외 모호하면 answer(불필요한 변경 방지)."
)

ANSWER_SYSTEM = (
    "당신은 UXERManager의 ERD 에이전트입니다.\n"
    "데이터베이스 모델링·정규화·SQL·ERD 표기법에 대해 한국어로 간결하고 정확하게 답하세요.\n"
    "아래에 현재 ERD 컨텍스트가 주어지면 그것을 근거로 답하세요.\n"
    "SQL/DDL 문법을 물으면, 사용자가 메시지에서 명시한 DB 유형(오라클·MySQL·PostgreSQL·SQL Server)의 방언으로 답하세요. "
    "명시가 없으면 [현재 ERD]의 'DB 유형'을 따르세요.\n"
    "중요: 사용자가 '툴/도구/기능/무엇을 할 수 있는지'를 물으면, 일반적인 ERD 소프트웨어의 기능이 아니라 "
    "아래 [내가 수행할 수 있는 작업] 목록(당신이 직접 실행 가능한 작업)을 근거로 답하세요. "
    "목록에 없는 작업은 '아직 지원하지 않는다'고 솔직히 말하세요. 당신은 답변만 하며 상태를 직접 바꾸지는 않습니다."
)


def capabilities_text(erd: dict) -> str:
    """클라이언트가 보낸 에이전트 툴 카탈로그를 '내가 할 수 있는 작업' 텍스트로."""
    tools = (erd or {}).get("tools") or []
    if not tools:
        return ""
    lines = ["[내가 수행할 수 있는 작업]"]
    for t in tools:
        danger = " (되돌리기 주의)" if t.get("danger") else ""
        lines.append(f"- {t.get('name')}: {t.get('desc', '')}{danger}")
    return "\n".join(lines)

# M1: 행동(act) 경로는 아직 구현되지 않았으므로 답변 노드가 안내를 덧붙인다.
# (M2부터 act 는 plan 노드로 라우팅되므로 answer 의 act 분기는 사실상 미사용)
ANSWER_ACT_NOTE = (
    "\n\n주의: 현재 버전은 ERD를 직접 편집하지 못합니다(편집 실행 기능은 준비 중). "
    "사용자가 편집을 요청하면, 무엇을 하려는지 확인하고 수동으로 어떻게 하면 되는지 안내하세요."
)

# ── M2/M3: 계획 수립 ──────────────────────────────────────────────
# 툴 목록은 클라이언트가 제공한 카탈로그(state.tool_catalog)에서 주입한다(단일 소스).
PLAN_SYSTEM = (
    "당신은 ERD 편집 계획 수립기입니다. 사용자의 요청을 [사용 가능한 툴] 목록의 호출 순서(steps)로 분해하세요.\n"
    "\n"
    "규칙:\n"
    "- 반드시 [사용 가능한 툴] 에 나열된 tool 이름만 사용한다.\n"
    "- ★대상 구분(매우 중요): 작업 대상이 'ERD(다이어그램, 그림)'인지 '운영 DB(실제 데이터베이스)'인지 반드시 구분하라.\n"
    "    · ERD(다이어그램) 편집 → create_entity·delete_entity·create_relation·add_attribute 등 (그림만 변경, 실제 DB 무관)\n"
    "    · 운영 DB 편집 → run_sql 로 DROP/CREATE/ALTER/INSERT/DELETE 실행 (실제 데이터베이스가 변경됨)\n"
    "    · 'DB/데이터베이스/실제/운영 테이블' 을 지우거나 만들라는 요청 = 운영 DB 작업(run_sql). 이때 delete_entity/create_entity 같은 ERD 툴을 쓰지 말 것!\n"
    "    · '포워드 엔지니어링' 또는 'ERD로 DB 에 생성' = ERD 정보로 CREATE 문을 만들어 run_sql 로 실제 DB 에 실행하는 것.\n"
    "  예) 'DB의 모든 테이블 지우고 ERD 내용으로 다시 생성':\n"
    "    1) fetch_db_schema 로 현재 DB 테이블 파악 → 2) run_sql 로 각 테이블 DROP →\n"
    "    3) ERD 정보(현재 ERD / describe_table / generate_ddl)로 CREATE 문 작성 → 4) run_sql 로 CREATE 실행.\n"
    "- 새 엔티티는 create_entity 의 id 로 참조한다(런타임 id 를 지어내지 말 것).\n"
    "- 기존 엔티티는 [현재 ERD] 에 표시된 id(또는 이름)로 참조한다.\n"
    "- 의존 순서를 지켜라: 엔티티 생성 → 관계 생성 → (요청 시) 정렬.\n"
    "- 사용자가 정렬/배치를 원하면 마지막에 auto_layout 을 추가한다(있을 경우).\n"
    "- SQL/DDL 생성·수정의 '대상(소스)'은 문맥으로 스스로 판단하라:\n"
    "    · ERD(현재 다이어그램)의 테이블이 대상이면 → generate_ddl, 또는 get_selection/describe_table 로 정보를 얻어 작성.\n"
    "    · 운영 DB의 실제 테이블이 대상이면 → fetch_db_schema 로 실제 스키마를 조회한 뒤 작성.\n"
    "    (사용자가 '운영 DB', '실제 DB', '연결된 DB' 등을 언급하면 후자, '선택한/이 테이블', 'ERD' 등이면 전자)\n"
    "- SQL/DDL 작성 시 먼저 대상 DB 유형의 db_doc_<유형> 툴로 문법·자료형을 참고하라. "
    "대상 유형은 사용자가 메시지에서 명시하면 그것을 우선, 없으면 [현재 ERD]의 'DB 유형'을 사용한다.\n"
    "- 목록에 없는 작업은 계획에 넣지 말 것.\n"
)

# 클라이언트 카탈로그 조회 실패 시 사용할 기본 툴 설명(폴백)
FALLBACK_TOOLS_TEXT = (
    "- create_entity(id, logicalName, physicalName, attrs[]) — 새 테이블 생성(각 엔티티 PK 1개 이상)\n"
    "- create_relation(from, to, card, addFk) — 관계 생성. card: 1:1|1:N|N:M\n"
    "- auto_layout(type) — 자동 배치. type: hierarchical|grid|circular\n"
    "- delete_entity(entityId) — 테이블 삭제(연결 관계 포함)\n"
    "- delete_relation(from, to) — 관계 삭제\n"
    "- add_attribute(entityId, attr) — 컬럼 추가\n"
    "- update_attribute(entityId, attrName, {...}) — 기존 컬럼 수정\n"
    "- remove_attribute(entityId, attrName) — 컬럼 삭제\n"
    "- update_entity(entityId, logicalName?, physicalName?, description?) — 테이블 수정\n"
    "- describe_tool(name?) — 툴 상세정보 제공(읽기 전용)\n"
)


def tools_catalog_text(catalog: list) -> str:
    """클라이언트가 보낸 툴 카탈로그를 계획 프롬프트용 텍스트로 변환."""
    if not catalog:
        return FALLBACK_TOOLS_TEXT
    lines = []
    for t in catalog:
        name = t.get("name", "")
        params = t.get("params", "")
        desc = t.get("desc", "")
        danger = " [위험·되돌리기 주의]" if t.get("danger") else ""
        lines.append(f"- {name}({params}) — {desc}{danger}")
    return "\n".join(lines)

# ── M4: 적응형 재계획 ──────────────────────────────────────────────
REPLAN_SYSTEM = (
    "당신은 실행 결과를 평가하고 다음 행동을 정하는 재계획기입니다.\n"
    "원래 사용자 목표와 [지금까지 실행 결과]를 비교해 다음 중 하나를 고르세요.\n"
    "- done: 목표가 달성됨(또는 더 할 일이 없음).\n"
    "    · 특히 조회/설명이 목표였고 필요한 읽기 툴(get_selection·describe_table·find_tables·list_relations·"
    "fetch_db_schema·describe_tool)이 이미 실행되어 [지금까지 실행 결과]에 정보가 있으면 반드시 done.\n"
    "    · 최종 답변(정보 정리)은 respond 단계가 그 결과로 생성하므로, '정보를 전달하기 위한' 추가 스텝은 필요 없다.\n"
    "- continue: 추가/대체 '작업'이 필요함 → [사용 가능한 툴]로 다음 steps 를 제시.\n"
    "  (예: DB 스키마를 받았으면 그 테이블들을 create_entity 로 만든다; 실패한 스텝은 다른 방식으로 대체)\n"
    "- escalate: 진짜로 모호하거나 사람의 선택/추가 입력이 꼭 필요할 때만.\n"
    "    · 사용자 요청이 명확하면(삭제·생성·수정 등) escalate 하지 말고 그 작업을 수행할 steps 를 제시하라.\n"
    "    · 위험·비가역 작업(DROP/DELETE 등)도 escalate 가 아니라 steps 로 제시하라 — approve 게이트가 사용자 승인을 받는다.\n"
    "    · escalate 를 고를 때는 reason 에 '무엇이 왜 필요한지' 구체적으로 적어라.\n"
    "    · 정보가 이미 조회됐고 더 할 작업이 없으면 done.\n"
    "- abort: 회복 불가하여 안전하게 종료.\n"
    "steps 의 tool 은 반드시 [사용 가능한 툴] 목록에 있는 이름만 사용하세요.\n"
)


# ── M2: 최종 보고 ──────────────────────────────────────────────────
RESPOND_SYSTEM = (
    "당신은 UXERManager ERD 에이전트입니다. 방금 수행/조회한 결과를 사용자에게 한국어로 보고하세요.\n"
    "- 사용자가 요청한 형식·길이·언어(예: '30자로 요약', '표로 정리', '한 줄로')를 반드시 지키세요.\n"
    "- 조회·설명 요청이었으면 [수행 결과]에 담긴 실제 정보(테이블·컬럼·타입·관계·선택된 항목 등)를 "
    "사용자가 보기 좋게 정리해 알려주세요. 단순히 '완료'라고만 하지 마세요.\n"
    "- 변경 작업이었으면 무엇을 했는지 1~2문장으로 요약하세요.\n"
    "- SQL/DDL 생성을 요청받았으면, 수행 결과의 정보(ERD 정보 또는 조회한 DB 스키마)를 바탕으로 "
    "해당 DB 방언의 CREATE/SQL 문을 작성해 ```sql 코드블록```으로 제시하세요. (generate_ddl 결과가 있으면 그것을 사용)\n"
    "- 실패한 스텝이 있으면 무엇이 왜 실패했는지 알리세요.\n"
    "- 테이블/엔티티를 언급할 때는 내부 id(예: member)가 아니라 논리명(예: 회원) 또는 물리명(예: MEMBER)을 "
    "사용하세요. id 는 사용자에게 노출하지 마세요."
)


def _ent_label(logical, physical, eid) -> str:
    """테이블 표시 라벨 — 내부 id 대신 논리명(물리명)."""
    if logical and physical and logical != physical:
        return f"{logical}({physical})"
    return logical or physical or eid or ""


def results_detail(past_steps: list) -> str:
    """재계획·최종 보고용 — 결과를 상세히 렌더(조회 툴의 실제 데이터 포함)."""
    if not past_steps:
        return "(결과 없음)"
    lines = []
    for entry in past_steps:
        step = entry.get("step", {})
        res = entry.get("result", {}) or {}
        tool = step.get("tool")
        if res.get("error"):
            lines.append(f"- {tool}: 실패 — {res['error']}")
            continue
        if tool == "fetch_db_schema":
            sch = res.get("schema", {}) or {}
            tbls = sch.get("tables", [])
            lines.append(f"- fetch_db_schema: 테이블 {len(tbls)}개")
            for t in tbls[:40]:
                cols = ", ".join(c.get("columnName", "") for c in t.get("columns", [])[:30])
                pks = ", ".join(c.get("columnName", "") for c in t.get("columns", []) if c.get("isPk"))
                lines.append(f"  · {t.get('tableName')}: PK[{pks}] cols[{cols}]")
            fks = sch.get("fks", [])
            if fks:
                lines.append("  FK: " + "; ".join(
                    f"{f.get('fromTable')}.{f.get('fromCol')}→{f.get('toTable')}.{f.get('toCol')}" for f in fks[:30]))
        elif tool == "run_sql":
            lines.append(f"- run_sql: {res.get('rowCount')}행")
        elif tool == "generate_ddl":
            lines.append(f"- generate_ddl ({res.get('dialect')}, {res.get('count')}개 테이블):\n```sql\n{res.get('ddl', '')}\n```")
        elif tool == "get_selection":
            d = res.get("diagram") or {}
            sel = res.get("selectedEntities") or []
            lines.append(f"- get_selection: 다이어그램 '{d.get('name')}' (엔티티 {d.get('entityCount')}, 관계 {d.get('relationCount')}), 선택 {len(sel)}개")
            for e in sel:
                cols = ", ".join(
                    f"{a.get('physicalName') or a.get('logicalName')}({a.get('type')},{a.get('kind')})"
                    for a in e.get("attrs", []))
                lines.append(f"  · {_ent_label(e.get('logicalName'), e.get('physicalName'), e.get('id'))}: {cols}")
        elif tool == "describe_table":
            t = res.get("table", {}) or {}
            cols = ", ".join(
                f"{a.get('physicalName') or a.get('logicalName')}({a.get('type')},{a.get('kind')})"
                for a in t.get("attrs", []))
            rels = ", ".join(f"{r.get('from')}→{r.get('to')}({r.get('card')})" for r in t.get("relations", []))
            label = _ent_label(t.get("logicalName"), t.get("physicalName"), t.get("id"))
            lines.append(f"- describe_table {label}: cols[{cols}]" + (f" rels[{rels}]" if rels else ""))
        elif tool == "find_tables":
            m = res.get("matches") or []
            lines.append("- find_tables: " + ", ".join((x.get("name") or x.get("id") or "") for x in m))
        elif tool == "list_relations":
            r = res.get("relations") or []
            lines.append("- list_relations: " + ", ".join(f"{x.get('from')}→{x.get('to')}({x.get('card')})" for x in r))
        elif tool == "describe_tool":
            if res.get("tool"):
                lines.append(f"- describe_tool: {res['tool'].get('name')} — {res['tool'].get('desc')}")
            else:
                lines.append(f"- describe_tool: 툴 {len(res.get('tools') or [])}개")
        else:
            lines.append(f"- {tool}: {res.get('entityId') or res.get('note') or '성공'}")
    return "\n".join(lines)


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
    if erd.get("dbType"):
        lines.append(f"DB 유형: {erd.get('dbType')}")
    sel_ids = (erd.get("selection") or {}).get("entityIds") or []
    if sel_ids:
        name_by_id = {e.get("id"): e.get("name") for e in ents}
        lines.append("현재 선택된 테이블: " + ", ".join(f"{name_by_id.get(i, i)}({i})" for i in sel_ids))
    for e in ents[:60]:
        pk = ", ".join(e.get("pk") or []) or "없음"
        lines.append(f"- {e.get('name')}({e.get('id')}): PK={pk}, 컬럼 {e.get('cols', 0)}개")
    if len(ents) > 60:
        lines.append(f"... 외 {len(ents) - 60}개")
    return "\n".join(lines)
