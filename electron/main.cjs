const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
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

function setupAutoUpdates() {
  if (!app.isPackaged || process.env.CUTLINE_DISABLE_AUTO_UPDATE === '1') return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on('error', error => {
    console.warn('[Cutline updater] Update check/download failed:', error);
  });
  autoUpdater.on('update-available', info => {
    console.info(`[Cutline updater] Version ${info.version} available; downloading in the background.`);
  });
  autoUpdater.on('update-not-available', info => {
    console.info(`[Cutline updater] Cutline ${info.version} is up to date.`);
  });
  autoUpdater.on('download-progress', progress => {
    console.info(`[Cutline updater] Downloading update: ${Math.round(progress.percent)}%`);
  });
  autoUpdater.on('update-downloaded', async info => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        autoUpdater.quitAndInstall();
        return;
      }
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Cutline update ready',
        message: `Cutline ${info.version} has been downloaded.`,
        detail: 'Restart now to finish installing the update, or choose Later. The update will install automatically when you quit Cutline.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) autoUpdater.quitAndInstall();
    } catch (error) {
      console.warn('[Cutline updater] Could not show update prompt:', error);
    }
  });

  const checkForUpdates = () => {
    if (app.isQuitting) return;
    void autoUpdater.checkForUpdates().catch(error => {
      console.warn('[Cutline updater] Could not check for updates:', error);
    });
  };
  setTimeout(checkForUpdates, 8000).unref();
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000).unref();
}

app.whenReady().then(() => {
  // Cutline owns its menus inside the renderer; disable Electron's default menu bar.
  Menu.setApplicationMenu(null);
  createWindow();
  setupAutoUpdates();
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
