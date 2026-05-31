// ── 초기화 ────────────────────────────────────────────────────────
loadSnapshots();
loadSavedTheme();
loadToolboxState();
loadQuickbarState();

// 공유 URL(?erd=) 복원 — 성공하면 loadState를 건너뜀
if (typeof tryRestoreFromUrl === 'function' && tryRestoreFromUrl()) {
  // URL에서 복원 성공 — 이후 render() 호출로 처리됨
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

// ── DOMContentLoaded ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('newDiagNameInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); confirmNewDiag(); }
    if (ev.key === 'Escape') { ev.preventDefault(); closeNewDiagModal(); }
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
  // 입력 필드 포커스 중에는 이하 단축키 무시
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
  if (matchSC(e, 'save'))    { e.preventDefault(); exportData(); return; }
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
