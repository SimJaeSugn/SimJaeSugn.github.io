// ── Agent v2 관측 핸들러 골격 — observe_v2.js ────────────────────
// V2-M2~M4에서 백엔드가 보낼 관측 이벤트(intent·plan·verdict)의 수신 핸들러 골격.
// V2-M1에는 이벤트가 오지 않으므로 호출돼도 안전(미수신 시 아무 일 없음 — 점진적 향상).
// client_v2.js의 _agentV2ReadSSE onEvent 스위치에서 이 함수들을 호출한다.

// V2-M2: IntentSpec 카드 — 의도 분석 결과 표시
function _agentV2RenderIntent(data, bubble) { /* M2 구현 예정 */ }

// V2-M3: 목표연결 계획 카드
function _agentV2RenderPlan(data, bubble)   { /* M3 구현 예정 */ }

// V2-M4: 준수 리포트 카드
function _agentV2RenderVerdict(data, bubble){ /* M4 구현 예정 */ }
