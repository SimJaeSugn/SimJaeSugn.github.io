---
name: feature-dev
description: >
  UXERManager 기능 추가·버그 수정·리팩터링·개선 요청 시 반드시 이 스킬을 사용하라.
  엔티티·관계·캔버스·레이아웃·내보내기·가져오기·단축키·타임라인·SQL실행기·협업·공유URL·섹션·메모·테마 등
  코드 변경이 필요한 모든 UXERManager 작업에 적용된다.
  '추가해줘', '수정해줘', '고쳐줘', '개선해줘', '다시 해줘', '변경해줘', '구현해줘', '만들어줘',
  '버그 수정', '기능 구현', '이전 작업 보완', '재실행', '다시 작업' 등 구현 요청이 있으면 이 스킬을 사용할 것.
  단순 코드 설명·동작 원리 질문은 스킬 없이 직접 응답 가능.
---

# UXERManager 기능 개발 오케스트레이터

## 실행 모드: 서브 에이전트 (순차 파이프라인)

analyst → implementer → integration-checker → reviewer 순서로 각 에이전트를 순차 호출한다.
각 에이전트의 출력이 다음 에이전트의 입력이 된다.

---

## Phase 0: 컨텍스트 확인

`_workspace/` 디렉토리 존재 여부로 실행 모드를 결정한다.

- **`_workspace/` 미존재** → **초기 실행**: Phase 1부터 전체 실행
- **`_workspace/` 존재** + 사용자가 새 기능/버그 요청 → **새 실행**: `_workspace/`를 `_workspace_prev/`로 이동(Bash) 후 Phase 1 실행
- **`_workspace/` 존재** + 사용자가 이전 작업 보완/수정 요청 → **부분 재실행**: 관련 Phase만 재실행

---

## Phase 1: 분석

`.claude/agents/analyst.md`를 Read로 읽고, Agent 도구로 analyst를 호출한다.

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "UXERManager 기능 분석 및 계획 수립",
  prompt: "[analyst.md의 전체 내용] + 아래가 사용자 요청입니다:\n\n[사용자 요청]"
)
```

완료 후 `_workspace/01_analyst_plan.md`를 읽어 계획을 확인한다.

---

## Phase 2: 구현

`.claude/agents/implementer.md`를 Read로 읽고, Agent 도구로 implementer를 호출한다.

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "UXERManager 코드 구현",
  prompt: "[implementer.md의 전체 내용]\n\n[_workspace/01_analyst_plan.md의 전체 내용]"
)
```

완료 후 `_workspace/02_implementer_changes.md`를 읽어 변경 내역을 확인한다.

---

## Phase 3: 통합 검사

`.claude/agents/integration-checker.md`를 Read로 읽고, Agent 도구로 integration-checker를 호출한다.

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "단축키 동기화·백업 통합 검증 및 수정",
  prompt: "[integration-checker.md의 전체 내용]\n\n[_workspace/01_analyst_plan.md 내용]\n\n[_workspace/02_implementer_changes.md 내용]"
)
```

완료 후 `_workspace/03_integration_check.md`를 읽어 결과를 확인한다.

통합 검사 최종 상태가 **FAIL**이면 미해결 이슈를 직접 수정한 후 Phase 3을 재실행한다.

---

## Phase 4: 리뷰

`.claude/agents/reviewer.md`를 Read로 읽고, Agent 도구로 reviewer를 호출한다.

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "최종 코드 품질 리뷰",
  prompt: "[reviewer.md의 전체 내용]\n\n[_workspace/01_analyst_plan.md 내용]\n\n[_workspace/02_implementer_changes.md 내용]\n\n[_workspace/03_integration_check.md 내용]"
)
```

완료 후 `_workspace/04_review.md`를 읽어 결과를 확인한다.

리뷰 평가가 **FAIL** (심각 이슈 있음)이면 해당 이슈를 직접 수정한다.

---

## Phase 5: 완료 보고

사용자에게 다음을 보고한다:

1. 구현된 기능/수정 내용 요약
2. 변경된 파일 목록
3. 통합 검사 결과 (단축키 동기화, 백업 통합 상태)
4. 리뷰 주요 발견사항 (있다면)

---

## 데이터 흐름

```
[사용자 요청]
      ↓
  [analyst]  →  _workspace/01_analyst_plan.md
      ↓
[implementer]  →  코드 변경 + _workspace/02_implementer_changes.md
      ↓
[integration-checker]  →  수정 + _workspace/03_integration_check.md
      ↓
  [reviewer]  →  _workspace/04_review.md
      ↓
[완료 보고]
```

중간 파일(`_workspace/`)은 보존한다. 이후 부분 재실행·감사 추적에 활용된다.

---

## 에러 핸들링

| 실패 지점 | 대응 |
|----------|------|
| Phase 1 (분석) 실패 | 직접 분석 수행 후 Phase 2 진행 |
| Phase 2 (구현) 실패 | 해당 파일을 직접 수정 |
| Phase 3 FAIL | 미해결 이슈 직접 수정 후 Phase 3 재실행 |
| Phase 4 FAIL | 심각 이슈 직접 수정 후 사용자 보고 |

---

## 테스트 시나리오

### 정상 흐름
1. 사용자: "엔티티 더블클릭 모달에 비고 필드 추가해줘"
2. analyst: entities.js·index.html 탐색 → 계획 수립
3. implementer: 모달 HTML과 저장 로직 수정
4. integration-checker: 비고 필드가 exportFullBackup에 포함되는지 확인 → 누락 시 export.js/import.js 수정
5. reviewer: 최종 검토 → PASS

### 에러 흐름
1. integration-checker: "새 shortcut_templates 키가 export.js에 없음" 발견
2. integration-checker가 직접 export.js 수정
3. integration-checker 재검사 → PASS
4. reviewer: PASS (주의사항: import.js 재검토 권장)
5. 오케스트레이터: import.js 직접 확인 후 완료 보고
