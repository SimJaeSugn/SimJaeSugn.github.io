// ── 초기화 ────────────────────────────────────────────────────────
loadSnapshots();
loadSavedTheme();
loadToolboxState();
loadQuickbarState();

// 공유 URL(?erd=) 복원 — 성공하면 loadState를 건너뜀
let _restoredFromUrl = false;
if (typeof tryRestoreFromUrl === 'function' && tryRestoreFromUrl()) {
  // URL에서 복원 성공 — 이후 render() 호출로 처리됨
  _restoredFromUrl = true;
} else if (!loadState()) {
  const d = createDefaultDiagram('기본 ERD');
  diagrams.push(d);
  activeDiagramId = d.id;
  loadDiagramIntoWorkspace(d);
}
renderDiagramPanel();
updateZoomLabel();
setViewMode(viewMode);
syncToolDropdownLabels();
render();
// 실행취소 기준 상태 — 로드 직후 빈 스택이면 현재 상태를 baseline으로 확보
if (!undoStack.length) undoStack.push(JSON.stringify({ diagrams, activeDiagramId, viewMode, notationStyle, gridSnap }));

// PC앱(Electron): 영속 파일(aerm_workspace.json)에서 복원 — 공유 URL 복원 시엔 건너뜀.
// localStorage 로 1차 렌더 후, 파일이 있으면 그 내용으로 덮어쓴다(파일=데스크탑 영속 저장소).
// 복원이 끝날 때까지 로딩 오버레이로 ERD를 덮어 사용자 입력을 차단한다.
if (!_restoredFromUrl && typeof isPcApp === 'function' && isPcApp() && typeof loadWorkspacePC === 'function') {
  _pcShowLoading();
  loadWorkspacePC().then(ok => {
    if (ok) {
      renderDiagramPanel();
      setViewMode(viewMode);
      render();
      if (typeof renderEntityTree === 'function') renderEntityTree();
      // 실행취소 baseline 을 파일 복원 상태로 재설정
      undoStack.length = 0;
      undoStack.push(JSON.stringify({ diagrams, activeDiagramId, viewMode, notationStyle, gridSnap }));
    }
  }).finally(() => {
    _pcHideLoading();
    // 영속 파일 복원까지 끝났으니 스플래시 '시작하기' 활성화
    if (typeof splashMarkDataLoaded === 'function') splashMarkDataLoaded();
  });
} else {
  // 웹/공유URL 복원 — 데이터는 위에서 동기 로드 완료 → 스플래시 닫기 활성화
  if (typeof splashMarkDataLoaded === 'function') splashMarkDataLoaded();
}

// ── DOMContentLoaded ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('newDiagNameInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); confirmNewDiag(); }
    if (ev.key === 'Escape') { ev.preventDefault(); closeNewDiagModal(); }
  });
  document.getElementById('promptInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); ev.stopPropagation(); doPrompt(); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePromptModal(); }
  });
  if (typeof updateStatusBar === 'function') updateStatusBar();
  if (typeof _initPropDividerDrag === 'function') _initPropDividerDrag();
  if (typeof _renderEmptyPropPanel === 'function') _renderEmptyPropPanel();
});

// ── 메인 키보드 단축키 ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // 커맨드 팔레트가 열려 있으면 먼저 닫기
    const cp = document.getElementById('cmdPalette');
    if (cp && cp.style.display !== 'none') { closeCmdPalette(); return; }
    if (document.getElementById('searchPanel').style.display !== 'none') { closeSearch(); return; }
    if (sectionMode) { toggleSectionMode(); return; }
    selectedEntities.clear();
    hideCtxMenu(); closeEntModal(); closeRelModal(); closeConfirm();
    closeDDLModal(); closeCopyDiagModal();
    if (typeof hidePropPanel === 'function') hidePropPanel();
    render();
    return;
  }
  // Ctrl+K: 메뉴 전체 검색 (커맨드 팔레트) — 입력 필드 포커스 중에도 동작
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (typeof openCmdPalette === 'function') openCmdPalette();
    return;
  }
  // Agent 패널 토글 (기본 Ctrl+Shift+A) — 입력 필드 포커스 중에도 동작
  if (typeof matchSC === 'function' && matchSC(e, 'toggleAgent')) {
    e.preventDefault();
    if (typeof toggleAgentPanel === 'function') toggleAgentPanel();
    return;
  }
  // 패널 토글 (좌측 Ctrl+B · 하단 Ctrl+J · 우측 Ctrl+Alt+B) — 입력 필드 포커스 중에도 동작
  if (typeof matchSC === 'function' && matchSC(e, 'toggleExplorer')) {
    e.preventDefault();
    if (typeof toggleExplorerPanel === 'function') toggleExplorerPanel();
    return;
  }
  if (typeof matchSC === 'function' && matchSC(e, 'toggleBottom')) {
    e.preventDefault();
    if (typeof toggleBottomPanel === 'function') toggleBottomPanel();
    return;
  }
  if (typeof matchSC === 'function' && matchSC(e, 'toggleRight')) {
    e.preventDefault();
    if (typeof toggleDiagramPanel === 'function') toggleDiagramPanel();
    return;
  }
  if (typeof matchSC === 'function' && matchSC(e, 'toggleAllPanels')) {
    e.preventDefault();
    if (typeof toggleAllPanels === 'function') toggleAllPanels();
    return;
  }
  // 입력 필드·편집 영역(메모장 textarea, 메모장v2 contenteditable) 포커스 중에는
  // 이하 단축키(복사·붙여넣기·전체선택 등)를 무시하고 기본 입력 동작에 맡긴다.
  const _ae = document.activeElement;
  const tag = _ae?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || _ae?.isContentEditable) return;
  // 타임라인 미리보기 중에는 ENTITIES/RELATIONS가 임시(비영속) 상태이므로
  // 데이터를 변경/영속화하는 전역 단축키를 차단한다(HUD의 ←/→/Enter/Esc는 HUD 핸들러가 처리).
  if (typeof _tlPreviewMode !== 'undefined' && _tlPreviewMode) return;

  const ctrl = e.ctrlKey || e.metaKey;
  if (matchSC(e, 'search'))  { e.preventDefault(); openSearch(); return; }
  if (matchSC(e, 'copy'))    {
    // 렌더된 텍스트(예: Agent 채팅 말풍선)가 선택돼 있으면
    // 엔티티 복사 대신 선택 텍스트를 클립보드에 복사한다.
    const _sel = (window.getSelection && window.getSelection().toString()) || '';
    if (_sel.trim()) {
      e.preventDefault();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(_sel).catch(() => { try { document.execCommand('copy'); } catch {} });
      } else { try { document.execCommand('copy'); } catch {} }
      return;
    }
    e.preventDefault(); copyEntity();
  }
  if (matchSC(e, 'paste'))   {
    e.preventDefault();
    // 아무것도 선택되지 않은 상태: 클립보드 텍스트가 콤마 구분 항목이면
    // 속성 논리명을 자동 입력한 채로 엔티티 추가 팝업 열기
    const nothingSelected = !selectedEntity && selectedEntities.size === 0;
    if (nothingSelected && navigator.clipboard) {
      navigator.clipboard.readText()
        .then(text => {
          const raw = (text || '').trim();
          // 콤마가 하나 이상 포함된 텍스트 → CSV 속성 입력 모드
          if (raw.includes(',')) {
            const attrs = raw.split(',').map(s => s.trim()).filter(Boolean);
            if (attrs.length > 0) { openAddEntityModalWithAttrs(attrs); return; }
          }
          pasteEntity();
        })
        .catch(() => pasteEntity());
    } else {
      pasteEntity();
    }
    return;
  }
  if (matchSC(e, 'addEnt'))  { e.preventDefault(); openAddEntityModal(); }
  if (matchSC(e, 'addRel'))  { e.preventDefault(); openAddRelationModal(); }
  if (matchSC(e, 'fitAll'))  { e.preventDefault(); fitAll(); return; }
  if (matchSC(e, 'undo'))    { e.preventDefault(); undo(); return; }
  if (matchSC(e, 'redo') || (ctrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); redo(); return;
  }
  if (matchSC(e, 'save'))    {
    e.preventDefault();
    // PC앱: 모든 다이어그램을 단일 파일에 저장 + 스냅샷 자동 생성 / 웹: 기존 다이어그램 내보내기
    if (typeof isPcApp === 'function' && isPcApp()) saveWorkspacePC();
    else exportData();
    return;
  }
  if (matchSC(e, 'saveAll')) { e.preventDefault(); exportFullBackup(); return; }
  if (matchSC(e, 'dup')) {
    e.preventDefault();
    const entTargets = selectedEntities.size > 0
      ? [...selectedEntities].map(id => ENTITIES.find(en => en.id === id)).filter(Boolean)
      : selectedEntity ? [selectedEntity] : [];
    const sectTargets = [...selectedSections];
    if (!entTargets.length && !sectTargets.length) return;
    selectedEntities.clear();
    selectedSections.clear();
    entTargets.forEach(en => {
      const copy = JSON.parse(JSON.stringify(en));
      copy.id = 'entity_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
      copy.logicalName = en.logicalName ? en.logicalName + ' (복사)' : en.logicalName;
      copy.x = en.x + 30; copy.y = en.y + 30;
      ENTITIES.push(copy);
      selectedEntities.add(copy.id);
    });
    sectTargets.forEach(s => {
      const copy = JSON.parse(JSON.stringify(s));
      copy.id = makeSectionId();
      copy.x = s.x + 30; copy.y = s.y + 30;
      SECTIONS.push(copy);
      selectedSections.add(copy);
    });
    render(); saveState();
    return;
  }
  if (matchSC(e, 'selAll')) {
    e.preventDefault();
    selectedEntities.clear();
    ENTITIES.forEach(en => selectedEntities.add(en.id));
    selectedSections.clear();
    SECTIONS.forEach(s => selectedSections.add(s));
    render(); return;
  }
  // 화살표 키: 선택 엔티티 이동
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    const targets = selectedEntities.size > 0
      ? [...selectedEntities].map(id => ENTITIES.find(en => en.id === id)).filter(Boolean)
      : selectedEntity ? [selectedEntity] : [];
    if (targets.length) {
      e.preventDefault();
      const step = gridSnap ? GRID : (e.shiftKey ? 10 : 1);
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
      targets.forEach(en => { en.x += dx; en.y += dy; });
      render(); saveState(); return;
    }
  }
  if (matchSC(e, 'del') && !document.querySelector('.modal-overlay.active')) {
    if (selectedEntities.size > 0) {
      const ids = [...selectedEntities];
      ids.forEach(id => { const ent = ENTITIES.find(en => en.id === id); if (ent) deleteEntity(ent, false); });
      selectedEntities.clear(); render(); saveState(); renderEntityTree(); return;
    }
    if (selectedEntity) {
      const ent = selectedEntity; selectedEntity = null;
      deleteEntity(ent); return;
    }
    if (selectedSections.size > 0) {
      [...selectedSections].forEach(s => {
        const i = SECTIONS.indexOf(s); if (i >= 0) SECTIONS.splice(i, 1);
      });
      selectedSections.clear(); selectedSection = null;
      render(); saveState(); return;
    }
  }
});

// ── Click on empty canvas clears focus mode ───────────────────────
canvas.addEventListener('click', e => {
  if (!focusEntityId) return;
  const w = toWorld(e.clientX, e.clientY);
  const hit = hitTest(w.x, w.y);
  if (!hit) clearFocusMode();
});
