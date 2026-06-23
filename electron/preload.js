const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSidecarPort: () => ipcRenderer.invoke('get-sidecar-port'),
  isElectron: true,
  platform: process.platform,   // 'win32' | 'darwin' | 'linux'
  setTitleBarOverlay: (opts) => ipcRenderer.send('set-title-bar-overlay', opts),

  // ── About / 업데이트 ──────────────────────────────────────────────
  getAppInfo:      () => ipcRenderer.invoke('app:get-info'),
  updaterCheck:    () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall:  () => ipcRenderer.invoke('updater:install'),
  // 이벤트 구독: type ∈ checking|available|not-available|progress|downloaded|error
  // 반환값: 리스너 해제 함수 (모달 닫을 때 호출하여 누수 방지)
  onUpdaterEvent: (cb) => {
    const map = {};
    ['checking', 'available', 'not-available', 'progress', 'downloaded', 'error'].forEach(t => {
      const h = (_e, payload) => cb(t, payload);
      ipcRenderer.on('updater:' + t, h);
      map[t] = h;
    });
    return () => Object.keys(map).forEach(t => ipcRenderer.removeListener('updater:' + t, map[t]));
  },
});
