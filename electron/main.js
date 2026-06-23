const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
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

// ── 업데이트 (electron-updater + GitHub Releases) ────────────────────
// 수동 모드: 시작 시 자동 확인·다운로드 없음. 모든 업데이트는 About 모달에서 IPC로 트리거.
// 이벤트(checking/available/not-available/progress/downloaded/error)를 렌더러로 forward.
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;           // 자동 다운로드 끔
  autoUpdater.autoInstallOnAppQuit = false;   // 종료 시 자동 설치 끔

  const send = (ch, payload) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send(ch, payload);
  };
  autoUpdater.on('checking-for-update',  ()   => send('updater:checking'));
  autoUpdater.on('update-available',     info => send('updater:available',     { version: info.version }));
  autoUpdater.on('update-not-available', info => send('updater:not-available', { version: info && info.version }));
  autoUpdater.on('download-progress',    p    => send('updater:progress', {
    percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }));
  autoUpdater.on('update-downloaded',    info => send('updater:downloaded', { version: info.version }));
  autoUpdater.on('error', err => {
    console.error('[Updater] error:', err == null ? 'unknown' : (err.message || err));
    send('updater:error', { message: err == null ? 'unknown' : (err.message || String(err)) });
  });
}

// ── 업데이트 트리거 IPC (수동, About 모달에서 호출) ──────────────────
ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };  // 개발 모드 graceful
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) { return { ok: false, reason: e && e.message }; }
});
ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (e) { return { ok: false, reason: e && e.message }; }
});
ipcMain.handle('updater:install', () => {
  stopSidecar();                        // 사이드카 정리 후 재시작 설치 (기존 패턴 유지)
  autoUpdater.quitAndInstall();
});

// ── 앱 기본 정보 IPC ─────────────────────────────────────────────────
ipcMain.handle('app:get-info', () => ({
  name: app.getName(), version: app.getVersion(), platform: process.platform,
}));

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
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  stopSidecar();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopSidecar);
