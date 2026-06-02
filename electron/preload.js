const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSidecarPort: () => ipcRenderer.invoke('get-sidecar-port'),
  isElectron: true,
  platform: process.platform,   // 'win32' | 'darwin' | 'linux'
  setTitleBarOverlay: (opts) => ipcRenderer.send('set-title-bar-overlay', opts),
});
