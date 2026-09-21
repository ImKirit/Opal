// Opal Desktop: ein eigenes Fenster fuer den Opal-Server.
// Die App enthaelt bewusst keinen eigenen Spielserver. Mehrspieler braucht ohnehin einen
// gemeinsamen Server, und so bleiben Web und Desktop immer auf demselben Stand.
// Welcher Server geladen wird: Umgebungsvariable OPAL_URL oder opal.config.json.

const { app, BrowserWindow, shell, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const dev = process.argv.includes('--dev');
if (dev) app.setPath('userData', path.join(app.getPath('appData'), 'opal-dev'));

function serverUrl() {
  if (process.env.OPAL_URL) return process.env.OPAL_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'opal.config.json'), 'utf8'));
    if (cfg.server) return cfg.server;
  } catch {
    /* Standard unten */
  }
  return 'http://localhost:5174';
}

const SERVER = serverUrl();
const SERVER_ORIGIN = new URL(SERVER).origin;
// Discord-Login laeuft im selben Fenster, damit das Login-Cookie in der App landet
const IN_APP_ORIGINS = new Set([SERVER_ORIGIN, 'https://discord.com']);

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: '#0a1426',
    title: 'Opal',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a1426', symbolColor: '#cfe6ff', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const origin = new URL(url).origin;
    if (!IN_APP_ORIGINS.has(origin) && !url.startsWith('file:')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_e, code, _desc, url) => {
    if (code === -3 || !url.startsWith(SERVER_ORIGIN)) return; // -3 = abgebrochen
    void win.loadFile(path.join(__dirname, 'offline.html'), { query: { server: SERVER } });
  });

  void win.loadURL(SERVER);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
