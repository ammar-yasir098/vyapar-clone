const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Vyapar Enterprise POS & Accounting Desktop',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      zoomFactor: 1.0
    }
  });

  // Enable keyboard shortcuts (Ctrl+ / Ctrl- / Ctrl0)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta)) {
      if (input.key === '=' || input.key === '+' || input.code === 'NumpadAdd') {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        mainWindow.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 3.0));
        event.preventDefault();
      } else if (input.key === '-' || input.code === 'NumpadSubtract') {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        mainWindow.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.5));
        event.preventDefault();
      } else if (input.key === '0' || input.code === 'Numpad0') {
        mainWindow.webContents.setZoomFactor(1.0);
        event.preventDefault();
      }
    }
  });

  // Enable Ctrl + Mouse Wheel zooming
  mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    const currentZoom = mainWindow.webContents.getZoomFactor();
    if (zoomDirection === 'in') {
      mainWindow.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 3.0));
    } else {
      mainWindow.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.5));
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Build standard Application Menu with View options including Zoom In/Out/Reset
function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createApplicationMenu();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
