const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const {
  WORKSPACE_DIR,
  saveGravureImage,
  saveGravurePdf,
  saveNovelStory,
  getPreviousVolumeSummary,
  nextVolumeNumber,
} = require('./workspace');

/**
 * Electron のメインプロセス。
 *
 * 画面は Next.js がそのまま担う。静的書き出しにしないのは、
 * 生成まわりが API ルート（/api/gravure/generate など）で動いており、
 * そこで PRODIA_TOKEN や OPENAI_API_KEY を扱っているため。
 * キーをレンダラーに出さないよう、本番でも next の本番サーバーを
 * 子プロセスとして立て、そこへ接続する。
 *
 * ファイル操作はここだけが行う。レンダラーは contextIsolation の内側に
 * いるので、preload が渡す窓口（window.desktop）越しにしか触れない。
 */

const isDev = !app.isPackaged;
const PORT = Number(process.env.PORT || 3000);

let mainWindow = null;
let serverProcess = null;

// ---------------------------------------------------------------
// ファイル操作（実体は electron/workspace.js）
// ---------------------------------------------------------------

async function openWorkspace() {
  await fs.ensureDir(WORKSPACE_DIR);
  await shell.openPath(WORKSPACE_DIR);
  return WORKSPACE_DIR;
}

function registerHandlers() {
  const handlers = {
    'fs:workspace-dir': async () => WORKSPACE_DIR,
    'fs:open-workspace': openWorkspace,
    'fs:next-volume': (_e, kind, seriesTitle) => nextVolumeNumber(kind, seriesTitle),
    'fs:save-gravure-image': (_e, volumeNumber, imageNumber, bytes, extension) =>
      saveGravureImage(volumeNumber, imageNumber, bytes, extension),
    'fs:save-gravure-pdf': (_e, volumeNumber, bytes) =>
      saveGravurePdf(volumeNumber, bytes),
    'fs:save-novel-story': (_e, seriesTitle, volumeNumber, title, content, summary) =>
      saveNovelStory(seriesTitle, volumeNumber, title, content, summary),
    'fs:previous-summary': (_e, seriesTitle, volumeNumber) =>
      getPreviousVolumeSummary(seriesTitle, volumeNumber),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (...args) => {
      try {
        return { ok: true, value: await handler(...args) };
      } catch (error) {
        return { ok: false, error: error?.message ?? String(error) };
      }
    });
  }
}

// ---------------------------------------------------------------
// Next.js サーバー
// ---------------------------------------------------------------

/**
 * 本番では next の本番サーバーを子プロセスで立てる。
 * 開発中は `npm run dev` 側が既に立てている前提で何もしない。
 */
function startServer() {
  if (isDev) return;

  const nextBin = path.join(app.getAppPath(), 'node_modules', 'next', 'dist', 'bin', 'next');
  serverProcess = spawn(process.execPath, [nextBin, 'start', '--port', String(PORT)], {
    cwd: app.getAppPath(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(PORT) },
    stdio: 'inherit',
  });

  serverProcess.on('error', (error) => {
    dialog.showErrorBox('起動に失敗しました', String(error));
  });
}

/** サーバーが応答するまで待つ。立ち上がりが間に合わないと白い画面になる */
async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`, { method: 'HEAD' });
      if (response.ok || response.status < 500) return true;
    } catch {
      // まだ立ち上がっていない
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const ok = await waitForServer();
  if (!ok) {
    dialog.showErrorBox(
      '起動に失敗しました',
      `http://localhost:${PORT} に接続できませんでした。`,
    );
  }

  await mainWindow.loadURL(`http://localhost:${PORT}/`);

  // アプリ外のリンクは既定のブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await fs.ensureDir(WORKSPACE_DIR);
  registerHandlers();
  startServer();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
