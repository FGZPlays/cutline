const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDevelopment = !app.isPackaged;
const devUrl = process.env.CUTLINE_DEV_URL || 'http://127.0.0.1:5173/#/editor';
let mainWindow;

function openExternalSafely(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(rawUrl).catch(error => console.error('Could not open external link:', error));
    }
  } catch (error) {
    console.warn('Blocked invalid external URL:', rawUrl, error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Cutline',
    width: 1540,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#17191c',
    autoHideMenuBar: true,
    ...(process.platform === 'win32' ? { icon: path.join(__dirname, '..', 'build', 'icon.ico') } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, rawUrl) => {
    const isDevNavigation = isDevelopment && rawUrl.startsWith('http://127.0.0.1:5173');
    const isPackagedFile = rawUrl.startsWith('file:') && rawUrl.includes('/dist/index.html');
    if (!isDevNavigation && !isPackagedFile) {
      event.preventDefault();
      openExternalSafely(rawUrl);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Cutline renderer process exited:', details);
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDevelopment) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexFile = path.join(app.getAppPath(), 'dist', 'index.html');
    void mainWindow.loadURL(`${pathToFileURL(indexFile).href}#/editor`);
  }
}

app.whenReady().then(() => {
  // Cutline owns its menus inside the renderer; disable Electron's default menu bar.
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  console.error('Cutline failed to launch:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
