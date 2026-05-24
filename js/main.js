// ── 초기화 ────────────────────────────────────────────────────────
loadSnapshots();
loadSavedTheme();
loadToolboxState();

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

// ── DOMContentLoaded ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('newDiagNameInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); confirmNewDiag(); }
    if (ev.key === 'Escape') { ev.preventDefault(); closeNewDiagModal(); }
  });
});

// ── 메인 키보드 단축키 ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('searchPanel').style.display !== 'none') { closeSearch(); return; }
    if (sectionMode) { toggleSectionMode(); return; }
    selectedEntities.clear();
    hideCtxMenu(); closeEntModal(); closeRelModal(); closeConfirm();
    closeDDLModal(); closeCopyDiagModal();
    render();
    return;
  }
  // 입력 필드 포커스 중에는 무시
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'f') { e.preventDefault(); openSearch(); return; }
  if (ctrl && e.key === 'c') { e.preventDefault(); copyEntity(); }
  if (ctrl && e.key === 'v') {
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
            if (attrs.length > 0) {
              openAddEntityModalWithAttrs(attrs);
              return;
            }
          }
          pasteEntity();   // 콤마 없으면 일반 붙여넣기
        })
        .catch(() => pasteEntity());
    } else {
      pasteEntity();
    }
    return;
  }
  if (!ctrl && !e.altKey) {
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddEntityModal(); }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); openAddRelationModal(); }
    if (e.key === 'Home')               { e.preventDefault(); fitAll(); return; }
  }
  if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (ctrl && e.key === 's' && !e.shiftKey) { e.preventDefault(); exportData(); return; }
  if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); exportFullBackup(); return; }
  if (ctrl && e.key === 'd') {
    e.preventDefault();
    const targets = selectedEntities.size > 0
      ? [...selectedEntities].map(id => ENTITIES.find(en => en.id === id)).filter(Boolean)
      : selectedEntity ? [selectedEntity] : [];
    if (targets.length) {
      selectedEntities.clear();
      targets.forEach(en => {
        const copy = JSON.parse(JSON.stringify(en));
        copy.id = 'entity_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
        copy.logicalName = en.logicalName ? en.logicalName + ' (복사)' : en.logicalName;
        copy.x = en.x + 30; copy.y = en.y + 30;
        ENTITIES.push(copy);
        selectedEntities.add(copy.id);
      });
      render(); saveState();
    }
    return;
  }
  if (ctrl && e.key === 'a') {
    e.preventDefault();
    selectedEntities.clear();
    ENTITIES.forEach(en => selectedEntities.add(en.id));
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
  if (e.key === 'Delete' && !document.querySelector('.modal-overlay.active')) {
    if (selectedEntities.size > 0) {
      const ids = [...selectedEntities];
      ids.forEach(id => { const ent = ENTITIES.find(en => en.id === id); if (ent) deleteEntity(ent); });
      selectedEntities.clear(); render(); saveState(); return;
    }
    if (selectedEntity) {
      const ent = selectedEntity; selectedEntity = null;
      deleteEntity(ent); render(); saveState(); return;
    }
    if (selectedSections.size > 0) {
      [...selectedSections].forEach(s => deleteSection(s));
      selectedSections.clear(); render(); saveState(); return;
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
