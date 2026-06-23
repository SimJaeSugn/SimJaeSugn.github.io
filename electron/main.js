const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
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

// ── 자동 업데이트 (electron-updater + GitHub Releases) ──────────────
// 빌드 시 publish 설정(package.json build.publish: github)으로 latest.yml·NSIS exe·blockmap이
// 릴리스에 올라가면, 설치된 앱이 새 버전을 백그라운드로 받아 "재시작하여 설치"한다.
// 개발(비패키지) 모드에서는 latest.yml 이 없어 오류만 나므로 건너뛴다.
function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', err => console.error('[Updater] error:', err == null ? 'unknown' : (err.message || err)));
  autoUpdater.on('checking-for-update', () => console.log('[Updater] 업데이트 확인 중...'));
  autoUpdater.on('update-available', info => console.log('[Updater] 새 버전 발견:', info.version));
  autoUpdater.on('update-not-available', () => console.log('[Updater] 최신 버전입니다.'));
  autoUpdater.on('download-progress', p => console.log(`[Updater] 다운로드 ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', info => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트 준비됨',
      message: `새 버전(${info.version})이 다운로드되었습니다.`,
      detail: '지금 재시작하여 설치할까요? "나중에"를 선택하면 다음 종료 시 자동 설치됩니다.',
    }).then(r => { if (r.response === 0) { stopSidecar(); autoUpdater.quitAndInstall(); } })
      .catch(() => {});
  });

  // 네트워크 오류 등으로 실패해도 앱 동작에는 영향 없게 (이미 error 핸들러가 받음)
  autoUpdater.checkForUpdates().catch(err =>
    console.error('[Updater] checkForUpdates 실패:', err && err.message));
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
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  stopSidecar();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopSidecar);
