# CLAUDE.md — UXERManager

## 하네스: UXERManager 기능 개발

**목표:** 기능 추가·버그 수정 시 단축키 동기화와 백업 통합을 자동 검증하여 누락을 방지한다.

**트리거:** UXERManager 코드 변경 요청 시 `feature-dev` 스킬을 사용하라. 단순 코드 설명·질문은 직접 응답 가능.

## 하네스: README 동기화

**목표:** 코드·구조 변경 시 세 README 파일이 항상 실제 상태와 일치하도록 유지한다.

**대상 README:**

| 파일 | 범위 |
|------|------|
| `README.md` | 섹션 25~28 (아키텍처·파일구조·개발환경·배포) |
| `proxy/nodejs/README.md` | 실행 방법·빌드·API·파일구조·트레이·지원 DB |
| `proxy/python/README.md` | 실행 방법·빌드·API·파일구조·지원 DB |

**트리거 → 검토 대상 매핑:**

| 변경 항목 | 검토할 README |
|----------|--------------|
| 디렉토리·파일 추가·이동·삭제 | README.md 섹션 26, 변경된 컴포넌트의 개별 README 파일구조 섹션 |
| 포트 번호 변경 | README.md 섹션 25·27·28, proxy/nodejs/README.md, proxy/python/README.md |
| 빌드 명령어·스크립트·설치파일명 변경 | README.md 섹션 27·28, 해당 컴포넌트 개별 README |
| 새 의존성·도구 추가 | README.md 섹션 27 사전 요구사항 표, 해당 개별 README |
| API 엔드포인트 추가·변경·삭제 | 해당 컴포넌트 개별 README API 섹션 |
| 지원 DB 추가·제거 | README.md 섹션 25, 해당 컴포넌트 개별 README 지원 DB 표 |
| 아키텍처 구조 변경 | README.md 섹션 25 |
| `proxy/nodejs/` 코드 변경 | proxy/nodejs/README.md |
| `proxy/python/` 코드 변경 | proxy/python/README.md |

**검토 절차:**

1. 변경 항목이 위 표의 어느 행에 해당하는지 판단한다.
2. 해당 README 파일을 Read로 읽어 실제 코드·구조와 대조한다.
3. 불일치가 있으면 즉시 수정한다.
4. 불일치가 없으면 완료 보고에 "README 검토 완료 — 변경 불필요"를 명시한다.

**규칙:** 트리거 항목에 해당하는 변경이 있음에도 README 검토 없이 작업 완료를 보고하지 않는다.

---

## 변경 이력
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-26 | 초기 구성 | 전체 | - |
| 2026-05-27 | 미들웨어 README 동기화 규칙 추가 | CLAUDE.md | 미들웨어 변경 시 문서 누락 방지 |
| 2026-05-30 | middleware/ → proxy/nodejs/, python-sidecar/ → proxy/python/ 재편 | CLAUDE.md, electron/, README.md 등 | 디렉토리 구조 정비 |
| 2026-05-30 | README 동기화 검토 하네스 추가 | CLAUDE.md | 코드 변경 시 README 누락 방지 |
| 2026-05-30 | 미들웨어·README 동기화 하네스 2개를 단일 하네스로 통합 | CLAUDE.md | 관리 단순화 |
| 2026-05-30 | README.md 메뉴별 기능 업데이트 (섹션 25~28로 재번호, 새 기능 4개 추가) | README.md, CLAUDE.md | 구 툴박스→신 메뉴바 구조 반영 |
