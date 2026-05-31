const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSidecarPort: () => ipcRenderer.invoke('get-sidecar-port'),
});
