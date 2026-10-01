const { contextBridge, ipcRenderer } = require('electron');

// Exposición de diálogos nativos del SO
contextBridge.exposeInMainWorld('nativeDialog', {
    confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
    message: (options) => ipcRenderer.invoke('dialog:message', options),
    error: (options) => ipcRenderer.invoke('dialog:error', options),
    warning: (options) => ipcRenderer.invoke('dialog:warning', options),
    open: (options) => ipcRenderer.invoke('dialog:open', options),
    openMultiple: (options) => ipcRenderer.invoke('dialog:openMultiple', options),
    openDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),
    save: (options) => ipcRenderer.invoke('dialog:save', options),
    ensureFocus: () => ipcRenderer.invoke('ensure-focused')
});

// Exposición segura de métodos de autenticación cifrada (safeStorage)
contextBridge.exposeInMainWorld('authAPI', {
    saveToken: (token) => ipcRenderer.invoke('auth:saveToken', token),
    getToken: () => ipcRenderer.invoke('auth:getToken'),
    removeToken: () => ipcRenderer.invoke('auth:removeToken')
});