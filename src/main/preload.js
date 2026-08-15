const { contextBridge, ipcRenderer } = require('electron');

// A partir de la migración a PostgreSQL + Express, TODO lo relacionado a
// datos (obras, socios, préstamos, etc.) dejó de pasar por IPC: ahora vive
// en frontend/src/services/apiClient.js, que le habla directo al servidor
// por HTTP. Acá solo queda lo que genuinamente necesita al sistema
// operativo -- los diálogos nativos -- porque eso sí depende del proceso
// principal de Electron.
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