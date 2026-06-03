// ── Agent v2 SSE 통신·phase 루프 — agent_panel.js의 agentSend 미러 ─
// V2-M1: v1 클라이언트 로직과 동일하게 동작. 엔드포인트만 /agent/v2/* 로 변경.
// 전역 _AGENT_V2_URL / _agentV2ThreadId / _agentV2Abort / _agentV2Draft / _agentV2IdRemap
// — v1 전역(_AGENT_URL·_agentThreadId 등) 재사용·재정의 금지(§9.1 불변식 ③).
// 공유 읽기 자원: AGENT_TOOL_CATALOG·_agentToolDef·_agentCloneState·_agentCommitDraft (agent_tools.js)

// ── v2 전용 전역 ──────────────────────────────────────────────────
const _AGENT_V2_URL = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
let _agentV2ThreadId = null;
let _agentV2Abort = null;
let _agentV2Draft = null;       // ACT 턴의 드래프트 ({entities,relations,layout})
let _agentV2IdRemap = {};       // 계획상 엔티티 id → 실제 생성 id 매핑

// ── fetch 기반 SSE 스트림 파서 ────────────────────────────────────
async function _agentV2ReadSSE(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let ev = 'message', data = '';
      frame.split('\n').forEach(line => {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      });
      let parsed = {};
      try { parsed = data ? JSON.parse(data) : {}; } catch {}
      onEvent(ev, parsed);
    }
  }
}

// ── 응답·계획 렌더 헬퍼 ──────────────────────────────────────────
function _agentV2SetReply(bubble, html) {
  if (!bubble) return;
  const reply = bubble.querySelector('.agent-reply');
  if (reply) reply.innerHTML = html;
  else bubble.innerHTML = html;
}

function _agentV2StepLabel(s) {
  const a = (s && s.args) || {};
  const tgt = a.entityId || a.id || a.name || '';
  if (s.tool === 'create_entity') return '테이블 생성: ' + (a.logicalName || a.physicalName || a.id || '');
  if (s.tool === 'create_relation') return '관계 생성: ' + a.from + ' → ' + a.to + ' (' + (a.card || '1:N') + ')';
  if (s.tool === 'auto_layout') return '자동 정렬: ' + (a.type || 'hierarchical');
  if (s.tool === 'delete_entity') return '⚠ 테이블 삭제: ' + tgt;
  if (s.tool === 'delete_relation') return '⚠ 관계 삭제: ' + a.from + ' → ' + a.to;
  if (s.tool === 'add_attribute') return '컬럼 추가: ' + tgt + '.' + ((a.attr && (a.attr.physicalName || a.attr.logicalName)) || a.physicalName || a.logicalName || '');
  if (s.tool === 'update_attribute') return '컬럼 수정: ' + tgt + '.' + (a.attrName || a.column || '');
  if (s.tool === 'remove_attribute') return '⚠ 컬럼 삭제: ' + tgt + '.' + (a.attrName || a.column || '');
  if (s.tool === 'update_entity') return '테이블 수정: ' + tgt;
  if (s.tool === 'describe_tool') return '툴 정보 조회: ' + (a.name || a.tool || '전체');
  if (s.tool === 'find_tables') return '테이블 검색: ' + (a.keyword || a.name || a.query || '전체');
  if (s.tool === 'describe_table') return '테이블 조회: ' + tgt;
  if (s.tool === 'list_relations') return '관계 조회: ' + (tgt || '전체');
  if (s.tool === 'get_selection') return '현재 선택/다이어그램 조회';
  if (s.tool === 'generate_ddl') return 'CREATE SQL 생성' + (a.dialect ? ' (' + a.dialect + ')' : '');
  if (s.tool === 'fetch_db_schema') return 'DB 스키마 조회(서버)';
  if (s.tool && s.tool.indexOf('db_doc_') === 0) return 'SQL 문법 참고: ' + s.tool.slice(7);
  if (s.tool === 'run_sql') return '⚠ SQL 실행(서버): ' + (a.sql ? String(a.sql).slice(0, 40) : '');
  // 폴백: 단일 소스 카탈로그의 설명을 사용(라벨 중복 정의 방지)
  const def = (typeof _agentToolDef === 'function') ? _agentToolDef(s && s.tool) : null;
  return (def && def.desc) || (s && s.tool) || '작업';
}

function _agentV2SetStepIcon(bubble, stepId, icon) {
  if (!bubble) return;
  const el = bubble.querySelector('.agent-step[data-sid="' + stepId + '"] .agent-step-ico');
  if (el) el.textContent = icon;
}

// 계획 미리보기 카드 + 승인 대기 (HITL) → Promise<bool>
function _agentV2AwaitApproval(plan, bubble) {
  return new Promise(resolve => {
    const rows = (plan || []).map(s =>
      '<div class="agent-step" data-sid="' + _agentV2Esc(s.id || '') + '">'
      + '<span class="agent-step-ico">○</span><span>' + _agentV2Esc(_agentV2StepLabel(s)) + '</span></div>'
    ).join('');
    bubble.innerHTML =
      '<div class="agent-plan">'
      + '<div class="agent-plan-title" onclick="this.parentElement.classList.toggle(\'collapsed\')" title="계획 펼치기/접기">실행 계획 · ' + ((plan || []).length) + '단계</div>'
      + rows
      + '<div class="agent-plan-actions">'
      + '<button class="agent-btn agent-btn-ok">실행</button>'
      + '<button class="agent-btn agent-btn-cancel">취소</button>'
      + '</div></div>'
      + '<div class="agent-reply"></div>';
    _agentV2ScrollBottom();
    const finish = v => {
      const act = bubble.querySelector('.agent-plan-actions');
      if (act) act.remove();
      resolve(v);
    };
    const ok = bubble.querySelector('.agent-btn-ok');
    const cancel = bubble.querySelector('.agent-btn-cancel');
    if (ok) ok.addEventListener('click', () => finish(true));
    if (cancel) cancel.addEventListener('click', () => finish(false));
  });
}

// interrupt 로 위임된 툴들을 드래프트에 실행 → 결과 목록 반환
// 공유 읽기 자원: _agentToolDef·_agentCloneState(agent_tools.js) — V2-M1 읽기 재사용
async function _agentV2ExecTools(calls, bubble) {
  const results = [];
  for (const c of (calls || [])) {
    _agentV2SetStepIcon(bubble, c.id, '⏳');
    const def = (typeof _agentToolDef === 'function') ? _agentToolDef(c.tool) : null;
    let r;
    if (!def) r = { id: c.id, ok: false, error: '알 수 없는 툴: ' + c.tool };
    else {
      if (def.kind === 'write' && !_agentV2Draft) _agentV2Draft = _agentCloneState();
      if (typeof _agentStandardizeAttrs === 'function') await _agentStandardizeAttrs(c.tool, c.args || {});  // 속성명 표준용어사전 표준화
      try { r = { id: c.id, ...(await def.run(_agentV2Draft, c.args || {}, _agentV2IdRemap)) }; }  // async 툴(표준사전 등) 지원
      catch (e) { r = { id: c.id, ok: false, error: e.message }; }
    }
    _agentV2SetStepIcon(bubble, c.id, r.ok === false ? '❌' : '✅');
    results.push(r);
  }
  return results;
}

// ── agentV2Send — 메인 전송 함수 ─────────────────────────────────
async function agentV2Send() {
  const input = document.getElementById('agentV2Input');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;

  _agentV2AppendMsg('user', _agentV2Esc(text));
  input.value = '';
  agentV2AutoGrow(input);

  const sendBtn = document.getElementById('agentV2SendBtn');
  if (sendBtn) sendBtn.disabled = true;
  const thinking = _agentV2AppendMsg('agent', '<span class="agent-typing"><i></i><i></i><i></i></span>');
  const bubble = thinking ? thinking.querySelector('.agent-msg-bubble') : null;
  let acc = '';

  // 턴 단위 초기화
  _agentV2Draft = null;
  _agentV2IdRemap = {};
  let turnHadError = false;
  let turnError = false;
  let cancelled = false;
  let phase = 'stream';
  let resumePayload = null;

  try {
    _agentV2Abort = new AbortController();
    for (;;) {
      const url = phase === 'stream' ? '/agent/v2/stream' : '/agent/v2/resume';
      const body = phase === 'stream'
        ? { query: text, context: agentV2BuildContext(), threadId: _agentV2ThreadId }
        : { threadId: _agentV2ThreadId, resume: resumePayload };
      const res = await fetch(`${_AGENT_V2_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: _agentV2Abort.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      let interruptData = null;
      await _agentV2ReadSSE(res, (ev, data) => {
        if (ev === 'meta' && data.threadId) {
          _agentV2ThreadId = data.threadId;
        } else if (ev === 'token') {
          acc += (data.t || '');
          _agentV2SetReply(bubble, _agentV2Render(acc));
          _agentV2ScrollBottom();
        } else if (ev === 'interrupt') {
          interruptData = data || {};
        } else if (ev === 'error') {
          _agentV2SetReply(bubble, '⚠ ' + _agentV2Esc(data.error || '오류'));
          turnError = true;
        } else if (ev === 'intent') {
          _agentV2RenderIntent(data, bubble);
        } else if (ev === 'plan') {
          _agentV2RenderPlan(data, bubble);
        } else if (ev === 'verdict') {
          _agentV2RenderVerdict(data, bubble);
        }
      });

      if (interruptData) {
        if (interruptData.type === 'tools_request') {
          resumePayload = (typeof AGENT_TOOL_CATALOG !== 'undefined') ? AGENT_TOOL_CATALOG : [];
          phase = 'resume';
          continue;
        }
        if (interruptData.type === 'plan_approval') {
          const approved = await _agentV2AwaitApproval(interruptData.plan || [], bubble);
          if (!approved) cancelled = true;
          resumePayload = { approved };
          phase = 'resume';
          continue;
        }
        // tool_calls — 클라 툴 실행(드래프트) + 진행 표시
        const results = await _agentV2ExecTools(interruptData.calls || [], bubble);
        if (results.some(r => r.ok === false)) turnHadError = true;
        resumePayload = results;
        phase = 'resume';
        continue;
      }
      break; // 그래프 종료(done)
    }

    // 결과 처리: 취소 / 오류 / 부분실패 / 정상 커밋
    if (cancelled) {
      _agentV2SetReply(bubble, '취소되었습니다. (변경 없음)');
    } else if (turnError) {
      // 백엔드 오류 메시지를 그대로 유지 (드래프트 폐기)
    } else if (_agentV2Draft) {
      if (turnHadError) {
        _agentV2SetReply(bubble, (acc ? _agentV2Render(acc) + '<br>' : '')
          + '<span style="opacity:.75">⚠ 일부 작업이 실패하여 변경을 적용하지 않았습니다.</span>');
      } else {
        _agentCommitDraft(_agentV2Draft);   // 공유 읽기 자원 _agentCommitDraft (agent_tools.js)
        if (!acc) _agentV2SetReply(bubble, '✅ 완료되었습니다.');
      }
    } else if (!acc) {
      _agentV2SetReply(bubble, '(응답 없음)');
    }
  } catch (e) {
    _agentV2ThreadId = null;
    if (e.name === 'AbortError') {
      if (bubble) bubble.innerHTML = acc ? _agentV2Render(acc) + '<br><span style="opacity:.6">(중단됨)</span>' : '(중단됨)';
    } else if (e instanceof TypeError) {
      if (bubble) bubble.innerHTML = '⚠ 프록시(127.0.0.1:3737)에 연결할 수 없습니다.<br>AgenticERM 데스크탑 앱 또는 프록시를 실행하세요.';
    } else {
      if (bubble) bubble.innerHTML = '⚠ ' + _agentV2Esc(e.message);
      if (/키|key/i.test(e.message)) agentV2ShowKeyPrompt();
    }
  } finally {
    _agentV2Draft = null;
    _agentV2IdRemap = {};
    _agentV2Abort = null;
    if (sendBtn) sendBtn.disabled = false;
    const _plan = bubble ? bubble.querySelector('.agent-plan') : null;
    if (_plan) _plan.classList.add('collapsed');
    _agentV2ScrollBottom();
  }
}

// ── OpenAI 키 입력 안내 ───────────────────────────────────────────
// v2 자체 키 안내 카드. v1 openAgentSettingsModal을 안내하여 공유 키스토어 사용(단방향 허용).
function agentV2ShowKeyPrompt() {
  if (document.getElementById('agentV2KeyCard')) return;
  const wrap = document.getElementById('agentV2Messages');
  if (!wrap) return;
  const card = document.createElement('div');
  card.className = 'agent-msg agent';
  card.id = 'agentV2KeyCard';
  card.innerHTML =
    '<div class="agent-msg-ava">🔑</div>' +
    '<div class="agent-msg-bubble">OpenAI API 키가 필요합니다.' +
    '<div style="margin-top:8px">' +
    '<button class="agent-send" onclick="document.getElementById(\'agentV2KeyCard\').remove();openAgentSettingsModal()" style="width:100%">⚙ Agent설정에서 키 입력</button>' +
    '</div></div>';
  wrap.appendChild(card);
  _agentV2ScrollBottom();
}
