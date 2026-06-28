// ── 스플래시(시작) 화면 컨트롤러 — splash.js ────────────────────────────────
// 시작 시 두 모드 중 하나를 무작위로 보여준다(head 인라인 가드가 모드 결정):
//   · lite  — AgenticERM 홍보영상의 브랜드를 경량 재현(로고·캡션·표준화 카운터). 의존성 0.
//   · promo — 원본 홍보영상(splash/promo/promo.html)을 iframe 으로 재생(로컬 React, 오프라인).
// 공통: 모든 데이터 로드(splashMarkDataLoaded) 시 '시작하기'(닫기) 활성.
//       '다음에 표시 안 함' 또는 소프트웨어 정보(About) 토글로 영구 비활성(localStorage).
// promo 렌더 실패(타임아웃/오류) 시 자동으로 lite 로 폴백.

(function () {
  'use strict';

  var LS_KEY = 'aerm_splash_disabled';
  var docEl = document.documentElement;

  // ── 영구 표시 여부 ──────────────────────────────────────────────
  function splashGetEnabled() {
    try { return localStorage.getItem(LS_KEY) !== '1'; } catch (e) { return true; }
  }
  function splashSetEnabled(on) {
    try {
      if (on) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, '1');
    } catch (e) { /* noop */ }
    var ab = document.getElementById('aboutSplashChk');
    if (ab) ab.checked = on;
    if (!on && document.getElementById('splashOverlay')) splashClose(true);
  }
  window.splashGetEnabled = splashGetEnabled;
  window.splashSetEnabled = splashSetEnabled;

  var overlay = document.getElementById('splashOverlay');

  if (!overlay || !splashGetEnabled()) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    window.splashMarkDataLoaded = function () {};
    return;
  }

  // 모드 결정(head 인라인 가드가 붙인 클래스). 기본은 lite.
  var mode = docEl.classList.contains('splash-mode-promo') ? 'promo' : 'lite';
  if (!docEl.classList.contains('splash-mode-promo') && !docEl.classList.contains('splash-mode-lite')) {
    docEl.classList.add('splash-mode-lite');
  }

  var loaded = false, closed = false;
  var rafId = null, capTimer = null, capIdx = -1, startTs = null;

  // 공통 컨트롤(두 모드 모두에 존재 — 클래스로 일괄 제어)
  function statusEls() { return overlay.querySelectorAll('.js-sp-status'); }
  function startEls()  { return overlay.querySelectorAll('.js-sp-start'); }
  function anySkipChecked() {
    var ck = overlay.querySelectorAll('.js-sp-skip');
    for (var i = 0; i < ck.length; i++) if (ck[i].checked) return true;
    return false;
  }

  // ── 데이터 로딩 완료 → 닫기 활성 ───────────────────────────────
  function markLoaded() {
    if (loaded) return;
    loaded = true;
    statusEls().forEach(function (el) {
      el.classList.add('ready');
      el.innerHTML = '<span class="splash-dot"></span> 준비 완료';
    });
    var btns = startEls(), focused = false;
    btns.forEach(function (b) {
      b.disabled = false;
      b.classList.add('ready');
      if (!focused && b.offsetParent !== null) { try { b.focus(); } catch (e) {} focused = true; }
    });
  }
  window.splashMarkDataLoaded = markLoaded;

  // 안전장치 — 12초 내 로딩 신호가 없어도 닫을 수 있게
  var failsafe = setTimeout(markLoaded, 12000);

  // ── 닫기 ───────────────────────────────────────────────────────
  function splashClose(force) {
    if (closed) return;
    if (!force && !loaded) return;
    closed = true;
    clearTimeout(failsafe);
    if (capTimer) clearInterval(capTimer);
    if (rafId) cancelAnimationFrame(rafId);
    if (anySkipChecked()) splashSetEnabled(false);
    var ov = document.getElementById('splashOverlay');
    if (!ov) return;
    ov.classList.add('splash-closing');
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 420);
  }
  window.splashClose = splashClose;

  // ── 와이어업(공통) ─────────────────────────────────────────────
  startEls().forEach(function (b) { b.addEventListener('click', function () { splashClose(false); }); });
  document.addEventListener('keydown', function (e) {
    if (closed) return;
    if (e.key === 'Escape' && loaded) { e.preventDefault(); e.stopPropagation(); splashClose(false); }
  }, true);

  // ── 모드 A: lite 애니메이션(캡션 회전 + 표준화 카운터) ─────────
  function startLite() {
    var CAPS = [
      ['복잡한 스키마 작업', '테이블 15 · 컬럼 112 · 관계 10 — 모두 손으로 할 일'],
      ['말 한마디로 지시', 'ReAct 에이전트가 스스로 도구를 호출해 추론'],
      ['표준용어사전으로 일괄 표준화', '112개 컬럼 논리명을 한 번에 한글 표준어로'],
      ['표준 준수율을 즉시 측정', '다이어그램 품질을 정량 지표로 확인'],
      ['DB와 비교해 Gap 분석서 자동 작성', '누락·불일치를 한눈에, 보고서까지 손쉽게'],
    ];
    var capEl    = document.getElementById('splashCaption');
    var capTitle = document.getElementById('splashCapTitle');
    var capDesc  = document.getElementById('splashCapDesc');
    var stdNum   = document.getElementById('splashStdNum');
    var stdFill  = document.getElementById('splashStdFill');

    function showCap(i) {
      if (!capEl || !capTitle || !capDesc) return;
      capEl.classList.add('cap-out');
      setTimeout(function () {
        if (closed) return;
        capTitle.textContent = CAPS[i][0];
        capDesc.textContent  = CAPS[i][1];
        capEl.classList.remove('cap-out');
      }, 380);
    }
    function nextCap() { capIdx = (capIdx + 1) % CAPS.length; showCap(capIdx); }

    var FILL_MS = 4400, HOLD_MS = 1100, CYCLE = FILL_MS + HOLD_MS;
    function tick(ts) {
      if (closed) return;
      if (startTs == null) startTs = ts;
      var p = ((ts - startTs) % CYCLE) / FILL_MS;
      if (p > 1) p = 1;
      if (stdNum)  stdNum.textContent = Math.round(p * 112);
      if (stdFill) stdFill.style.width = (p * 100) + '%';
      rafId = requestAnimationFrame(tick);
    }
    nextCap();
    capTimer = setInterval(nextCap, 3200);
    rafId = requestAnimationFrame(tick);
  }

  // promo → lite 폴백
  function fallbackToLite() {
    if (closed || mode === 'lite') return;
    mode = 'lite';
    docEl.classList.remove('splash-mode-promo');
    docEl.classList.add('splash-mode-lite');
    startLite();
  }

  // ── 모드 B: promo iframe 로드(실패 시 lite 폴백) ────────────────
  function startPromo() {
    var frame = overlay.querySelector('.splash-promo-frame');
    if (!frame) { fallbackToLite(); return; }
    var settled = false;
    function onMsg(ev) {
      if (!ev || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'agenticerm-promo-ready')  { settled = true; window.removeEventListener('message', onMsg); }
      if (ev.data.type === 'agenticerm-promo-error')  { window.removeEventListener('message', onMsg); fallbackToLite(); }
    }
    window.addEventListener('message', onMsg);
    frame.addEventListener('error', function () { if (!settled) fallbackToLite(); });
    // 7초 내 'ready' 가 없으면(React/스크립트 로드 실패 등) lite 로 폴백
    setTimeout(function () { if (!settled && !closed) fallbackToLite(); }, 7000);
    frame.src = 'splash/promo/promo.html';
  }

  // 시작
  if (mode === 'promo') startPromo();
  else startLite();
})();
