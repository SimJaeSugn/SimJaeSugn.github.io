// ── 우측 패널: 목록 / Agent 탭 전환 ──────────────────────────────
function switchPanelTab(tab) {
  document.querySelectorAll('#panelTabs .panel-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.ptab === tab);
  });
  const list  = document.getElementById('panelViewList');
  const agent = document.getElementById('panelViewAgent');
  if (list)  list.classList.toggle('active', tab === 'list');
  if (agent) agent.classList.toggle('active', tab === 'agent');
  if (tab === 'agent') {
    setTimeout(() => { const i = document.getElementById('agentInput'); if (i) i.focus(); }, 60);
  } else if (_agentAbort) {
    // Agent 탭을 떠나면 진행 중인 스트림 중단
    _agentAbort.abort();
  }
}

// 단축키(기본 Ctrl+Shift+A)용 — 패널 열고 Agent 탭으로, 이미 Agent면 패널 닫기
function toggleAgentPanel() {
  const onAgent = !!document.querySelector('#panelTabs .panel-tab[data-ptab="agent"].active');
  const isOpen = (typeof panelOpen !== 'undefined') && panelOpen;
  if (isOpen && onAgent) {
    if (typeof toggleDiagramPanel === 'function') toggleDiagramPanel();   // 닫기
    return;
  }
  if (!isOpen && typeof toggleDiagramPanel === 'function') toggleDiagramPanel();  // 열기
  switchPanelTab('agent');
}

// ── Agent 채팅 — 프록시 /agent/stream (LangGraph) 연동 (M1) ───────
// M1: 직접 응답(ANSWER) 토큰 스트리밍. 행동(ACT) 실행은 M2+ 에서 추가.
const _AGENT_URL = (typeof MW_URL !== 'undefined') ? MW_URL : 'http://127.0.0.1:3737';
let _agentThreadId = null;
let _agentAbort = null;
let _agentDraft = null;       // ACT 턴의 드래프트 ({entities,relations,layout})
let _agentIdRemap = {};       // 계획상 엔티티 id → 실제 생성 id 매핑

function agentAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  // 최대 높이(120px)를 넘을 때만 스크롤바 표시 — 한 줄일 땐 숨김
  el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
}

function agentFillInput(text) {
  const i = document.getElementById('agentInput');
  if (!i) return;
  i.value = text;
  agentAutoGrow(i);
  i.focus();
}

function agentInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    agentSend();
  }
}

function _agentEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _agentAppendMsg(role, html) {
  const empty = document.getElementById('agentEmpty');
  if (empty) empty.remove();
  const wrap = document.getElementById('agentMessages');
  const msg = document.createElement('div');
  msg.className = 'agent-msg ' + role;
  const ava = role === 'user' ? '🧑' : '🤖';
  msg.innerHTML = `<div class="agent-msg-ava">${ava}</div><div class="agent-msg-bubble">${html}</div>`;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
  return msg;
}

// Agent 응답 렌더 — marked 로 markdown 파싱(있으면), 없으면 이스케이프+<br>
function _agentRender(t) {
  const text = String(t == null ? '' : t);
  if (typeof marked !== 'undefined' && marked.parse) {
    try { return marked.parse(text, { breaks: true, gfm: true }); } catch (e) { /* fallback */ }
  }
  return _agentEsc(text).replace(/\n/g, '<br>');
}

function _agentScrollBottom() {
  const wrap = document.getElementById('agentMessages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// 현재 ERD 요약을 프록시에 전달 (읽기성 질문·맥락용)
function agentBuildContext() {
  try {
    const ents = (typeof ENTITIES !== 'undefined' ? ENTITIES : []) || [];
    const rels = (typeof RELATIONS !== 'undefined' ? RELATIONS : []) || [];
    return {
      entities: ents.map(e => {
        const attrs = e.attrs || [];
        return {
          id: e.id,
          name: (typeof entDisplayName === 'function') ? entDisplayName(e) : (e.logicalName || e.physicalName || e.id),
          pk: attrs.filter(a => a.kind === 'pk').map(a => a.physicalName || a.logicalName),
          cols: attrs.length,
        };
      }),
      relations: rels.map(r => ({ from: r.from, to: r.to, card: r.card })),
      activeDiagram: (typeof getActiveDiagram === 'function' && getActiveDiagram()) ? getActiveDiagram().name : null,
      // 대상 DB 유형 — SQL/DDL 생성 시 db_doc_<type> 참고 결정에 사용
      dbType: (typeof getActiveDiagram === 'function' && getActiveDiagram() && getActiveDiagram().dbType) || 'mysql',
      // 현재 선택 — "이 테이블", "현재 선택한 것" 참조 해소용
      selection: (function () {
        const ids = new Set();
        if (typeof selectedEntities !== 'undefined' && selectedEntities) selectedEntities.forEach(id => ids.add(id));
        if (typeof selectedEntity !== 'undefined' && selectedEntity && selectedEntity.id) ids.add(selectedEntity.id);
        return { entityIds: [...ids] };
      })(),
      // 에이전트 자신의 역량(툴 카탈로그) — "툴/도구/뭐 할 수 있어?" 질문에 일반 SW가 아닌 자기 툴로 답하게 함
      tools: (typeof AGENT_TOOL_CATALOG !== 'undefined') ? AGENT_TOOL_CATALOG : [],
    };
  } catch {
    return {};
  }
}

// fetch 기반 SSE 스트림 파서 (POST 라서 EventSource 대신 직접 파싱)
async function _agentReadSSE(res, onEvent) {
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

// 응답 텍스트 영역에 렌더 — 계획 카드(.agent-reply)가 있으면 그 안에, 없으면 버블 전체
function _agentSetReply(bubble, html) {
  if (!bubble) return;
  const reply = bubble.querySelector('.agent-reply');
  if (reply) reply.innerHTML = html;
  else bubble.innerHTML = html;
}

// 계획 스텝을 사람이 읽기 쉬운 라벨로
function _agentStepLabel(s) {
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

function _agentSetStepIcon(bubble, stepId, icon) {
  if (!bubble) return;
  const el = bubble.querySelector('.agent-step[data-sid="' + stepId + '"] .agent-step-ico');
  if (el) el.textContent = icon;
}

// 계획 미리보기 카드 + 승인 대기 (HITL) → Promise<bool>
function _agentAwaitApproval(plan, bubble) {
  return new Promise(resolve => {
    const rows = (plan || []).map(s =>
      '<div class="agent-step" data-sid="' + _agentEsc(s.id || '') + '">'
      + '<span class="agent-step-ico">○</span><span>' + _agentEsc(_agentStepLabel(s)) + '</span></div>'
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
    _agentScrollBottom();
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

// interrupt 로 위임된 툴들을 드래프트에 실행 → 결과 목록 반환 (진행 아이콘 갱신)
// 단일 소스 AGENT_TOOL_DEFS 를 참조. 쓰기 툴 실행 직전에만 드래프트 생성(읽기 전용은 상태 변경 없음).
async function _agentExecTools(calls, bubble) {
  const results = [];
  for (const c of (calls || [])) {
    _agentSetStepIcon(bubble, c.id, '⏳');
    const def = (typeof _agentToolDef === 'function') ? _agentToolDef(c.tool) : null;
    let r;
    if (!def) r = { id: c.id, ok: false, error: '알 수 없는 툴: ' + c.tool };
    else {
      if (def.kind === 'write' && !_agentDraft) _agentDraft = _agentCloneState();
      try { r = { id: c.id, ...def.run(_agentDraft, c.args || {}, _agentIdRemap) }; }
      catch (e) { r = { id: c.id, ok: false, error: e.message }; }
    }
    _agentSetStepIcon(bubble, c.id, r.ok === false ? '❌' : '✅');
    results.push(r);
  }
  return results;
}

async function agentSend() {
  const input = document.getElementById('agentInput');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;

  _agentAppendMsg('user', _agentEsc(text));
  input.value = '';
  agentAutoGrow(input);

  const sendBtn = document.getElementById('agentSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  const thinking = _agentAppendMsg('agent', '<span class="agent-typing"><i></i><i></i><i></i></span>');
  const bubble = thinking.querySelector('.agent-msg-bubble');
  let acc = '';

  // 턴 단위 초기화
  _agentDraft = null;
  _agentIdRemap = {};
  let turnHadError = false;
  let turnError = false;       // 백엔드 error 이벤트 수신 여부
  let cancelled = false;       // 사용자가 계획을 취소
  let phase = 'stream';        // 'stream' → (interrupt) → 'resume' …
  let resumePayload = null;

  try {
    _agentAbort = new AbortController();
    for (;;) {
      const url = phase === 'stream' ? '/agent/stream' : '/agent/resume';
      const body = phase === 'stream'
        ? { query: text, context: agentBuildContext(), threadId: _agentThreadId }
        : { threadId: _agentThreadId, resume: resumePayload };
      const res = await fetch(`${_AGENT_URL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: _agentAbort.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      let interruptData = null;
      await _agentReadSSE(res, (ev, data) => {
        if (ev === 'meta' && data.threadId) {
          _agentThreadId = data.threadId;
        } else if (ev === 'token') {
          acc += (data.t || '');
          _agentSetReply(bubble, _agentRender(acc));
          _agentScrollBottom();
        } else if (ev === 'interrupt') {
          interruptData = data || {};
        } else if (ev === 'error') {
          _agentSetReply(bubble, '⚠ ' + _agentEsc(data.error || '오류'));
          turnError = true;
        }
      });

      if (interruptData) {
        if (interruptData.type === 'tools_request') {
          // 계획 수립 전 — 사용 가능한 툴 카탈로그를 프록시에 제공 (클라가 단일 소스)
          resumePayload = (typeof AGENT_TOOL_CATALOG !== 'undefined') ? AGENT_TOOL_CATALOG : [];
          phase = 'resume';
          continue;
        }
        if (interruptData.type === 'plan_approval') {
          // 계획 미리보기 → 사용자 승인 대기 (HITL)
          const approved = await _agentAwaitApproval(interruptData.plan || [], bubble);
          if (!approved) cancelled = true;
          resumePayload = { approved };
          phase = 'resume';
          continue;
        }
        // tool_calls — 클라 툴 실행(드래프트) + 진행 표시
        const results = await _agentExecTools(interruptData.calls || [], bubble);
        if (results.some(r => r.ok === false)) turnHadError = true;
        resumePayload = results;
        phase = 'resume';
        continue;
      }
      break; // 그래프 종료(done)
    }

    // 결과 처리: 취소 / 오류 / 부분실패 / 정상 커밋
    if (cancelled) {
      _agentSetReply(bubble, '취소되었습니다. (변경 없음)');
    } else if (turnError) {
      // 백엔드 오류 메시지를 그대로 유지 (드래프트 폐기)
    } else if (_agentDraft) {
      if (turnHadError) {
        _agentSetReply(bubble, (acc ? _agentRender(acc) + '<br>' : '')
          + '<span style="opacity:.75">⚠ 일부 작업이 실패하여 변경을 적용하지 않았습니다.</span>');
      } else {
        _agentCommitDraft(_agentDraft);
        if (!acc) _agentSetReply(bubble, '✅ 완료되었습니다.');
      }
    } else if (!acc) {
      _agentSetReply(bubble, '(응답 없음)');
    }
  } catch (e) {
    // 예외 시 드래프트 폐기 — 실제 ENTITIES/RELATIONS 는 변경되지 않음
    // 스레드를 리셋: 중단/오류로 미해소 interrupt 가 남았을 수 있으므로 다음 턴은 새 대화로 시작
    _agentThreadId = null;
    if (e.name === 'AbortError') {
      bubble.innerHTML = acc ? _agentRender(acc) + '<br><span style="opacity:.6">(중단됨)</span>' : '(중단됨)';
    } else if (e instanceof TypeError) {
      bubble.innerHTML = '⚠ 프록시(127.0.0.1:3737)에 연결할 수 없습니다.<br>UXERManager 데스크탑 앱 또는 프록시를 실행하세요.';
    } else {
      bubble.innerHTML = '⚠ ' + _agentEsc(e.message);
      if (/키|key/i.test(e.message)) agentShowKeyPrompt();
    }
  } finally {
    _agentDraft = null;
    _agentIdRemap = {};
    _agentAbort = null;
    if (sendBtn) sendBtn.disabled = false;
    // 턴 종료 → 실행 계획/체크리스트는 접어서 숨김(제목 클릭 시 다시 펼침)
    const _plan = bubble.querySelector('.agent-plan');
    if (_plan) _plan.classList.add('collapsed');
    _agentScrollBottom();
  }
}

// ── OpenAI 키 입력 (미설정 시) ───────────────────────────────────
function agentShowKeyPrompt() {
  if (document.getElementById('agentKeyCard')) return;
  const wrap = document.getElementById('agentMessages');
  if (!wrap) return;
  const card = document.createElement('div');
  card.className = 'agent-msg agent';
  card.id = 'agentKeyCard';
  card.innerHTML =
    '<div class="agent-msg-ava">🔑</div>' +
    '<div class="agent-msg-bubble">OpenAI API 키를 입력하세요. (프록시에 암호화 저장)' +
    '<div style="display:flex;gap:6px;margin-top:8px">' +
    '<input id="agentKeyInput" type="password" class="agent-input" style="flex:1;max-height:none;overflow:hidden" placeholder="sk-..." />' +
    '<button class="agent-send" onclick="agentSaveKey()" title="저장">저장</button>' +
    '</div></div>';
  wrap.appendChild(card);
  _agentScrollBottom();
  setTimeout(() => { const i = document.getElementById('agentKeyInput'); if (i) i.focus(); }, 50);
}

async function agentSaveKey() {
  const inp = document.getElementById('agentKeyInput');
  const key = (inp && inp.value || '').trim();
  if (!key) return;
  try {
    const res = await fetch(`${_AGENT_URL}/agent/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    });
    if (!res.ok) throw new Error('저장 실패');
    const card = document.getElementById('agentKeyCard');
    if (card) card.remove();
    _agentAppendMsg('agent', '✅ 키가 저장되었습니다. 다시 질문해 주세요.');
  } catch (e) {
    _agentAppendMsg('agent', '⚠ 키 저장 실패: ' + _agentEsc(e.message));
  }
}
