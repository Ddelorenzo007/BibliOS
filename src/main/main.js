const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerDialogsIPC } = require('./dialogs');

// Ruta del archivo binario donde se guardará el token cifrado por el SO
const TOKEN_FILE_PATH = path.join(app.getPath('userData'), 'session_token.bin');

// Mantener una referencia global del objeto de ventana
let mainWindow;
let databaseHandlers;
const dbQueries = require('../../server/db/queries'); // Ajusta los niveles de ruta según corresponda

// === IPC Handlers para Autenticación Segura con safeStorage ===
ipcMain.handle('auth:saveToken', async (event, token) => {
    try {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('El cifrado nativo del SO no está disponible.');
        }
        const encryptedBuffer = safeStorage.encryptString(token);
        fs.writeFileSync(TOKEN_FILE_PATH, encryptedBuffer);
        return { success: true };
    } catch (error) {
        console.error('Error al cifrar token con safeStorage:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('auth:getToken', async () => {
    try {
        if (!fs.existsSync(TOKEN_FILE_PATH)) return null;
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('El cifrado nativo del SO no está disponible.');
        }
        const encryptedBuffer = fs.readFileSync(TOKEN_FILE_PATH);
        return safeStorage.decryptString(encryptedBuffer);
    } catch (error) {
        console.error('Error al descifrar token con safeStorage:', error);
        return null;
    }
});

ipcMain.handle('auth:removeToken', async () => {
    try {
        if (fs.existsSync(TOKEN_FILE_PATH)) {
            fs.unlinkSync(TOKEN_FILE_PATH);
        }
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar token cifrado:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('buscarEnSistemaAcademico', async (event, dni) => {
    try {
        return await dbQueries.buscarPersonaEnSistemaAcademico(dni);
    } catch (error) {
        console.error('Error en IPC buscarEnSistemaAcademico:', error);
        throw error;
    }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../renderer/assets/BibliOS_Logo.png'),
    title: 'BibliOS - Sistema de Gestión Bibliotecaria',
    show: false,
    autoHideMenuBar: true
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Error al cargar la aplicación:', errorCode, errorDescription);
    setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
      } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
      }
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    console.log('Manejadores de base de datos inicializados');
    createWindow();
    setupAppEvents();
    registerDialogsIPC();
  } catch (error) {
    console.error('Error al inicializar la aplicación:', error);
    app.quit();
  }
});

function setupAppEvents() {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', async (event) => {
    if (app.isQuiting) return;
    event.preventDefault();
    app.isQuiting = true;
    try {
      if (databaseHandlers) {
        await databaseHandlers.db.close();
        databaseHandlers.cleanup();
      }
      app.exit(0);
    } catch (error) {
      console.error('Error al cerrar la aplicación:', error);
      app.exit(1);
    }
  });
}

if (process.env.NODE_ENV === 'development') {
  process.env.NODE_ENV = 'development';
} else {
  process.env.NODE_ENV = 'production';
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('biblios', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('biblios');
}

module.exports = { mainWindow, databaseHandlers };