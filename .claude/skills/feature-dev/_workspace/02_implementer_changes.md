# 02 · Implementer Changes — V2-M1 골격 + 격리 계약 구현

## 변경/신규 파일 목록

### 신규 파일 (격리 영역)
| 파일 | 요약 |
|------|------|
| `proxy/python/agent/v2/__init__.py` | v2 서브패키지 마커 (빈 파일) |
| `proxy/python/agent/v2/graph.py` | v1 build_graph() 토폴로지 미러 — 독립 build_graph_v2() + 독립 MemorySaver |
| `proxy/python/routers/v2/__init__.py` | v2 라우터 패키지 마커 (빈 파일) |
| `proxy/python/routers/v2/agent.py` | v1 routers/agent.py 미러 — graph import 한 줄만 agent.v2.graph로 교체, thread_id v2_ 접두, audit AGENT_V2/AGENT_V2_RESUME |
| `js/agent_v2/panel_v2.js` | v2 패널 셸 — toggleAgentV2Panel/closeAgentV2Panel, agentV2AutoGrow/FillInput/InputKey, _agentV2AppendMsg/Render/ScrollBottom/Esc, agentV2BuildContext |
| `js/agent_v2/client_v2.js` | v2 SSE 통신·phase 루프 — _AGENT_V2_URL, _agentV2ReadSSE, agentV2Send, _agentV2AwaitApproval, _agentV2ExecTools, agentV2ShowKeyPrompt |
| `js/agent_v2/observe_v2.js` | 관측 핸들러 골격 — _agentV2RenderIntent/Plan/Verdict 빈 함수 (V2-M2~M4용) |

### 수정 파일 (추가만 — v1 줄 변경 없음)
| 파일 | 변경 내용 |
|------|---------|
| `proxy/python/main.py` | L2: `import logging` 추가, L40~45: v2 라우터 try/except 가드 블록 추가 |
| `index.html` | L1047~1049: 스크립트 3줄 추가, L284~314: #agentV2ToggleBtn FAB + #agentV2Panel 독립 마크업 추가 |

---

## 주요 결정 사항

### 계획과 다르게 구현한 부분

1. **v2 패널 진입 UX (계획서 §6 확인 필요 #1)**
   - 계획서: "v2 자체 토글 버튼(예: #agentV2Panel 내 닫기 버튼 + 별도 진입 트리거)을 권장. implementer 재량."
   - 구현: `#agentV2ToggleBtn` FAB 버튼(우측 하단 fixed, z-index:199)을 독립 진입 트리거로 추가. 패널 내부에 × 닫기 버튼 포함. v1 toggleAgentPanel/switchPanelTab 완전 미접촉.

2. **v2 키 안내 (계획서 §6 확인 필요 #2)**
   - 계획서 권장: "V2-M1은 v1 설정 모달 호출(공유 키 사용)"
   - 구현: `agentV2ShowKeyPrompt()`는 v2 자체 카드를 렌더하되, 버튼 클릭 시 `openAgentSettingsModal()`을 호출(v2→v1 단방향 허용 방향 — v1이 v2를 부르는 방향이 아님). 공유 키스토어 활용.

3. **observe_v2.js 함수 위치**
   - `_agentV2RenderIntent/Plan/Verdict` 세 함수를 observe_v2.js에 정의하고, client_v2.js의 `_agentV2ReadSSE` onEvent 스위치에서 직접 호출하는 구조. 계획서 §3.3과 동일.

4. **_agentV2Esc 중복 정의**
   - panel_v2.js와 client_v2.js 모두에서 `_agentV2Esc`를 사용하므로 panel_v2.js에 정의. client_v2.js는 panel_v2.js가 먼저 로드되므로 그대로 참조 가능(스크립트 순서: panel_v2 → client_v2 → observe_v2).

---

## 격리 검증 결과

### ① 화이트리스트 — v1 파일 diff 0 확인
```
git diff -- proxy/python/routers/agent.py proxy/python/agent/ js/agent_panel.js js/agent_settings.js js/agent_tools.js
```
**결과: (출력 없음) — 통과**

### ② 단방향 grep — 0건 확인
```
grep -rn "agent\.v2|routers\.v2|agent_v2" proxy/python/agent --include=*.py | grep -v "/v2/"
```
**결과: (출력 없음) — 통과**

```
grep -rn "agent\.v2|routers\.v2|agent_v2" proxy/python/routers/agent.py js/agent_panel.js js/agent_settings.js js/agent_tools.js
```
**결과: (출력 없음) — 통과**

### ③ Python 구문 점검
```
python -m py_compile agent/v2/graph.py routers/v2/agent.py main.py
EXIT:0
```
**결과: 오류 없음 — 통과**

---

## 미완료 항목

- **없음.** V2-M1 계획서 §1~§5 체크리스트 전항목 구현 완료.
- observe_v2.js 핸들러 본문은 의도적 빈 골격(V2-M2~M4에서 채울 예정 — 점진적 향상).

---

## 후속 전달 (integration-checker 처리 항목)

### README 동기화 필요 — proxy/python/README.md

새 API 엔드포인트 6개가 추가되었으므로 `proxy/python/README.md` API 섹션에 아래를 추가해야 함:

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/agent/v2/stream` | POST | v2 질의 → 그래프 실행 → SSE 스트리밍 |
| `/agent/v2/resume` | POST | v2 interrupt 결과 회신 → 그래프 재개 |
| `/agent/v2/key` | GET | v2 OpenAI 키 설정 여부 확인 |
| `/agent/v2/key` | POST | v2 OpenAI 키 저장 (공유 키스토어) |
| `/agent/v2/config` | GET | v2 Agent 설정 조회 |
| `/agent/v2/config` | POST | v2 Agent 설정 저장 |

> CLAUDE.md "하네스: README 동기화" — API 엔드포인트 추가·변경 트리거에 해당.
> integration-checker가 proxy/python/README.md API 섹션을 업데이트할 것.
