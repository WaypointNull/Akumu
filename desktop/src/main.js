const path = require('path');
const { app, BrowserWindow, Tray, Menu, dialog, nativeImage } = require('electron');

const isPackaged = app.isPackaged;

// Packaged: everything lives inside resources/app.asar. Dev: repo root.
const APP_ROOT = isPackaged ? path.join(process.resourcesPath, 'app.asar') : path.join(__dirname, '..', '..');

// Use a stable, writable data dir (%APPDATA%\Akumu) for the bundled server.
const USER_DATA_DIR = path.join(app.getPath('appData'), 'Akumu');
app.setPath('userData', USER_DATA_DIR);

let mainWindow = null;
let tray = null;
let server = null;
let port = null;

function log(...args) {
  console.log('[akumu]', ...args);
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const p = probe.address().port;
      probe.close(() => resolve(p));
    });
  });
}

async function startBackend() {
  if (isPackaged) {
    const fs = require('fs');
    const dataDir = path.join(USER_DATA_DIR, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const bundled = path.join(APP_ROOT, 'data', 'danbooru-tags.txt');
    const dest = path.join(dataDir, 'danbooru-tags.txt');
    if (!fs.existsSync(dest) && fs.existsSync(bundled)) {
      fs.copyFileSync(bundled, dest);
    }
    process.env.AKUMU_DATA_DIR = dataDir;
  }
  process.env.AKUMU_PORT = String(port);
  const { start } = require(path.join(APP_ROOT, 'server', 'server.js'));
  server = await start({ host: '127.0.0.1' });
  log(`backend listening on ${port}`);
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) {
        return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0d18',
    title: 'Akumu · Booru Prompt Studio',
    icon: path.join(APP_ROOT, 'desktop', 'assets', 'tray.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('window shown');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Akumu · Booru Prompt Studio');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Akumu', click: showMainWindow },
      { type: 'separator' },
      { label: 'Quit Akumu', click: () => app.quit() }
    ])
  );
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

async function bootstrap() {
  port = await pickFreePort();
  try {
    await startBackend();
  } catch (error) {
    log('backend failed to start:', error);
    dialog.showErrorBox('Akumu could not start', String((error && error.message) || error));
    app.exit(1);
    return;
  }
  const ok = await waitForServer(30000);
  if (!ok) {
    log('backend never became ready');
    dialog.showErrorBox('Akumu could not start', 'The local server did not become ready in time.');
    app.exit(1);
    return;
  }
  createWindow();
  createTray();
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (server) {
      try {
        server.close();
      } catch {}
    }
    if (tray) {
      tray.destroy();
    }
  });
  app.setAppUserModelId('com.akumu.desktop');
  app
    .whenReady()
    .then(bootstrap)
    .catch((error) => {
      log('fatal:', error);
      dialog.showErrorBox('Akumu failed to launch', String((error && error.message) || error));
      app.exit(1);
    });
}
