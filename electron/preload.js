const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSidecarPort: () => ipcRenderer.invoke('get-sidecar-port'),
  isElectron: true,
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    toggleMaximize: () => ipcRenderer.send('window-maximize-toggle'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onMaximizeChange: (cb) => ipcRenderer.on('window-maximized', (_e, val) => cb(val)),
  },
});
