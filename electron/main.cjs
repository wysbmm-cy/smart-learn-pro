const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Handle creating/removing shortcuts on Windows - Skipped for now
// if (require('electron-squirrel-startup')) { app.quit(); }

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // For simple ipcRenderer usage in this project style
            webSecurity: false // Often needed for local file access in simple apps
        },
        autoHideMenuBar: true,
        // icon: path.join(__dirname, '../public/icon.png') // Optional if icon exists
    });

    // Load the index.html of the app.
    // In development: load from Vite dev server
    // In production: load from dist/index.html
    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.whenReady().then(() => {
    createWindow();

    // Check for updates immediately
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Auto Updater Events
autoUpdater.on('update-available', () => {
    console.log('Update available.');
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new version of SmartLearn Pro has been downloaded. Restart now to apply?',
        buttons: ['Restart', 'Later']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
