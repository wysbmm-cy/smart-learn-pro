const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Disable security warnings for local development content
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    // Try to load icon if it exists, otherwise default
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // preload: path.join(__dirname, 'preload.js') // Not needed yet
    },
    show: false // Don't show until ready to prevent white flash
  });

  // Hide the default menu for a cleaner "App" look
  Menu.setApplicationMenu(null);

  const isDev = !app.isPackaged; // More reliable check than NODE_ENV sometimes

  if (isDev) {
    // In dev, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
    console.log("Running in Development Mode: Loading http://localhost:5173");
  } else {
    // In prod, load from built file (index.html)
    // 'loadFile' handles the file protocol automatically
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    console.log("Running in Production Mode: Loading dist/index.html");
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links (open in browser instead of Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
