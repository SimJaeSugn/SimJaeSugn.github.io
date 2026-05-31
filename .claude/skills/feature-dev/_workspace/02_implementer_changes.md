## 요청 요약
관계선 최적화(autoOptimizeRelations / autoOptimizeRelationsV2) 후 엔티티를 드래그해도 관계선의 출발/도착 면(앵커)이 위치에 따라 자동 재계산되지 않는 버그 수정.

## 근본 원인 (analyst 분석 채택)
`canvas.js getRelationPath`는 3단계 분기:
1. `rel.bend.wpts` 있음 → wpts 그대로 (동적 재계산 없음)
2. `rel.bend.fromFace || toFace` 있음 → 고정 면 (자동 전환 없음)
3. 그 외 → `computeOrthogonalPath`로 dx/dy 기반 면 매번 재계산 (= 동적 앵커)

최적화 함수가 모든 관계선에 `fromFace/toFace(+wpts)`를 채워 넣어 1·2단계로 빠지므로 3단계(동적)에 진입 불가 → 드래그해도 면 고정.

## [수정 2차] 사용자 피드백 반영 — 옵션 A로 전환
사용자 피드백: "수동으로 선을 조작하고 나면 그때부터 자동 앵커가 안 됨. 우클릭 '경로 초기화'(ui.js resetRel: `rel.bend=null`)를 하면 다시 됨."
→ 1차에서 보존하려 했던 "수동 편집 선(`rel.bend.manual`)"이 바로 사용자가 자동 복귀를 원하는 대상이었음. 따라서:
- 엔티티 드래그 종료 블록의 `if (rel.bend && rel.bend.manual) return;` **가드 제거** → 최적화·수동 라우팅 구분 없이 한쪽 끝만 이동한 모든 관계선을 `rel.bend=null`로 복귀. (= '경로 초기화'를 드래그 시 자동 수행)
- 더 이상 쓰이지 않는 `rel.bend.manual` 설정 코드 2곳(세그먼트/웨이포인트 블록, 엔드포인트 블록) 원복(제거).
- 트레이드오프: 엔티티를 드래그하면 그 선의 커스텀 라우팅은 자동 경로로 초기화됨(사용자 의도와 일치). 커스텀 라우팅을 유지하려면 엔티티 배치를 먼저 끝낸 뒤 선을 손보면 됨.
- 검증: 엔티티 드래그 mousemove 경로(canvas.js L2077)가 `_didMove=true`(L2114) 설정 → reset 블록(L2388 `if(_didMove && draggingEntity)`) 확실히 실행. `getRelationPath`에서 `rel.bend=null` → 3단계 `computeOrthogonalPath` 동적 재계산 복귀 확인.

## (1차 시도) 옵션 B — 폐기
엔티티 드래그 종료(mouseup) 시점에, **한쪽 끝만 이동한** 관계선의 `rel.bend`를 무효화(`null`)하여 동적 재계산으로 복귀. 단 **사용자가 수동 편집한 선(`rel.bend.manual===true`)과 양끝이 함께 이동한 선은 보존**.
- 옵션 A(무조건 초기화) 대비, 수동 라우팅 선이 드래그로 사라지는 회귀를 방지. 수동 선은 본래도 동적 재계산 대상이 아니었으므로 보존이 기존 동작과 일관됨.

## 변경 파일
### js/canvas.js (3곳)
1. **mouseup 핸들러** (`draggingEntity=null` 이전, 약 L2389~2407): 엔티티 드래그 종료 시 이동 엔티티 집합 산출 후, 한쪽 끝만 이동(`fromMoved !== toMoved`)했고 수동 표시가 없는 관계선의 `rel.bend = null` 처리. 단일·다중선택 드래그 모두 처리.
2. **세그먼트/웨이포인트 드래그 종료** (L2351~2356): `straightenWpts/collapse` 후 `_didMove`면 `rel.bend.manual = true` (수동 라우팅 표시).
3. **엔드포인트(from/to) 드래그 종료** (L2373~2376): 재연결이 아닌 면/위치 직접 이동이면 `rel.bend.manual = true`.

## 통합 검증
- **단축키 동기화**: 신규 단축키 없음 → shortcuts.js / 단축키 테이블 영향 없음.
- **백업 통합**: `rel.bend.manual`은 `rel.bend` 하위 boolean. state.js의 saveState/loadDiagram이 relations를 `JSON.parse(JSON.stringify(r))`로 깊은 복제하므로 자동 직렬화됨. export.js/import.js 별도 수정 불필요. 구버전 데이터(manual 부재→undefined→비수동 취급)와 하위 호환.
- **최적화 재실행 일관성**: 최적화 함수가 `rel.bend=null`로 초기화 후 재구성하므로 manual 플래그도 자연히 리셋됨 → 재최적화 후 다시 자동 복귀 대상이 됨(일관적).

## 회귀 검증 포인트
1. 최적화 미적용 선: 기존처럼 드래그 시 면 자동 전환(변화 없음).
2. autoOptimizeRelations / V2 적용 후 단일 엔티티 드래그: 면이 위치에 따라 재계산.
3. 다중 선택으로 양끝 엔티티 동시 이동: 라우팅 유지(평행 이동), 무효화 안 됨.
4. 사용자가 수동으로 꺾은 선: 단일 엔티티 드래그에도 보존.

## README 동기화 (CLAUDE.md 하네스)
- js/canvas.js(프런트엔드)만 수정. 디렉토리/포트/빌드/의존성/API/지원DB/아키텍처 변경 없음. proxy/* 무관.
- → README 검토 완료 — 변경 불필요.
