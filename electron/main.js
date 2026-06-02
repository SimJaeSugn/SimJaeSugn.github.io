const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SIDECAR_PORT = 3737;
let sidecarProcess = null;
let mainWindow = null;

function getSidecarPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python-sidecar.exe');
  }
  return path.join(__dirname, '..', 'proxy', 'python', 'dist', 'uxer-sidecar.exe');
}

function getIndexPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getAppPath()), '..', 'index.html');
  }
  return path.join(__dirname, '..', 'index.html');
}

function startSidecar() {
  const sidecarPath = getSidecarPath();
  if (!fs.existsSync(sidecarPath)) {
    console.warn('[Sidecar] exe not found — running without sidecar');
    return;
  }
  sidecarProcess = spawn(sidecarPath, ['--port', String(SIDECAR_PORT)], {
    stdio: 'pipe',
    windowsHide: true,
  });
  sidecarProcess.stdout.on('data', d => console.log('[Sidecar]', d.toString().trim()));
  sidecarProcess.stderr.on('data', d => console.error('[Sidecar ERR]', d.toString().trim()));
  sidecarProcess.on('exit', code => console.log('[Sidecar] exited, code:', code));
}

function stopSidecar() {
  if (sidecarProcess && !sidecarProcess.killed) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(sidecarProcess.pid)], { stdio: 'ignore' });
    } else {
      sidecarProcess.kill('SIGTERM');
    }
    sidecarProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    // frame: false 제거 — WCO 방식에서는 titleBarStyle로 대체
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#1e1e2e',       // 다크 테마 기준 초기값 (--bg-base)
      symbolColor: '#cdd6f4', // 다크 테마 기준 (--tx-main)
      height: 32,
    } : false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(getIndexPath());
  mainWindow.on('closed', () => { mainWindow = null; });
  // maximize/unmaximize 이벤트 리스너 불필요 (WCO가 OS에서 직접 처리)
}

ipcMain.handle('get-sidecar-port', () => SIDECAR_PORT);

// 신규: 테마 변경 시 WCO 색상 업데이트 (Windows 전용)
ipcMain.on('set-title-bar-overlay', (_e, opts) => {
  if (mainWindow && process.platform === 'win32') {
    try { mainWindow.setTitleBarOverlay(opts); } catch (_) {}
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startSidecar();
  createWindow();
});

app.on('window-all-closed', () => {
  stopSidecar();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopSidecar);
