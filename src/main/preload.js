const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ===== AUTENTICACIÓN =====
    login: (usuario, password) =>
        ipcRenderer.invoke('database:login', { usuario, password }),

    // ===== PERSONAS =====
    getPersonas: (filters = {}) =>
        ipcRenderer.invoke('database:getPersonas', { filters }),

    // ===== OBRAS =====
    createObra: (obraData) =>
        ipcRenderer.invoke('database:createObra', obraData),
    getObras: (filters = {}) =>
        ipcRenderer.invoke('database:getObras', { filters }),
    getObraById: (id) =>
        ipcRenderer.invoke('database:getObraById', id),
    updateObra: (id, updates) =>
        ipcRenderer.invoke('database:updateObra', { id, updates }),
    darDeBajaObra: (id, usuarioId) =>
        ipcRenderer.invoke('database:darDeBajaObra', { id, usuarioId }),

    // ===== TOMOS =====
    createTomo: (tomoData) =>
        ipcRenderer.invoke('database:createTomo', tomoData),
    getTomosByObra: (obraId) =>
        ipcRenderer.invoke('database:getTomosByObra', obraId),

    // ===== EJEMPLARES =====
    createEjemplar: (ejemplarData) =>
        ipcRenderer.invoke('database:createEjemplar', ejemplarData),
    getEjemplares: (filters = {}) =>
        ipcRenderer.invoke('database:getEjemplares', { filters }),
    getEjemplarById: (id) =>
        ipcRenderer.invoke('database:getEjemplarById', id),
    updateEjemplar: (id, updates) =>
        ipcRenderer.invoke('database:updateEjemplar', { id, updates }),

    // ===== SOCIOS =====
    createSocio: (socioData) =>
        ipcRenderer.invoke('database:createSocio', socioData),
    getSocios: (filters = {}) =>
        ipcRenderer.invoke('database:getSocios', { filters }),
    getSocioById: (id) =>
        ipcRenderer.invoke('database:getSocioById', id),
    updateSocio: (id, updates) =>
        ipcRenderer.invoke('database:updateSocio', { id, updates }),
    darDeBajaSocio: (id, usuarioId) =>
        ipcRenderer.invoke('database:darDeBajaSocio', { id, usuarioId }),

    // ===== SANCIONES =====
    aplicarSancion: (sancionData) =>
        ipcRenderer.invoke('database:aplicarSancion', sancionData),
    finalizarSancion: (id, usuarioId) =>
        ipcRenderer.invoke('database:finalizarSancion', { id, usuarioId }),
    getSancionesBySocio: (socioId) =>
        ipcRenderer.invoke('database:getSancionesBySocio', socioId),

    // ===== PRÉSTAMOS =====
    createPrestamo: (prestamoData) =>
        ipcRenderer.invoke('database:createPrestamo', prestamoData),
    getPrestamos: (filters = {}) =>
        ipcRenderer.invoke('database:getPrestamos', { filters }),
    getPrestamoById: (id) =>
        ipcRenderer.invoke('database:getPrestamoById', id),
    devolverLibro: (prestamoId, usuarioId) =>
        ipcRenderer.invoke('database:devolverLibro', { prestamoId, usuarioId }),
    renovarPrestamo: (prestamoId, usuarioId) =>
        ipcRenderer.invoke('database:renovarPrestamo', { prestamoId, usuarioId }),
    actualizarPrestamosVencidos: () =>
        ipcRenderer.invoke('database:actualizarPrestamosVencidos'),

    // ===== RESERVAS =====
    createReserva: (reservaData) =>
        ipcRenderer.invoke('database:createReserva', reservaData),
    getReservas: (filters = {}) =>
        ipcRenderer.invoke('database:getReservas', { filters }),
    cancelarReserva: (id, usuarioId) =>
        ipcRenderer.invoke('database:cancelarReserva', { id, usuarioId }),
    atenderReserva: (id, usuarioId) =>
        ipcRenderer.invoke('database:atenderReserva', { id, usuarioId }),

    // ===== INGRESOS A SALA =====
    registrarIngreso: (ingresoData) =>
        ipcRenderer.invoke('database:registrarIngreso', ingresoData),
    getIngresos: (filters = {}) =>
        ipcRenderer.invoke('database:getIngresos', { filters }),

    // ===== DOCUMENTACIÓN INSTITUCIONAL =====
    subirDocumento: (docData) =>
        ipcRenderer.invoke('database:subirDocumento', docData),
    getDocumentos: (filters = {}) =>
        ipcRenderer.invoke('database:getDocumentos', { filters }),
    darDeBajaDocumento: (id, usuarioId) =>
        ipcRenderer.invoke('database:darDeBajaDocumento', { id, usuarioId }),

    // ===== AUDITORÍA =====
    getAuditoria: (filters = {}) =>
        ipcRenderer.invoke('database:getAuditoria', { filters }),

    // ===== ESTADÍSTICAS =====
    getStats: () =>
        ipcRenderer.invoke('database:getStats'),
    getPrestamosPorMes: (meses = 6) =>
        ipcRenderer.invoke('database:getPrestamosPorMes', { meses }),
    getObrasPorCategoria: () =>
        ipcRenderer.invoke('database:getObrasPorCategoria'),
    getSociosPorMes: (meses = 6) =>
        ipcRenderer.invoke('database:getSociosPorMes', { meses }),

    // ===== UTILIDADES =====
    backup: (destinationPath) =>
        ipcRenderer.invoke('database:backup', destinationPath),
    close: () =>
        ipcRenderer.invoke('database:close'),
    insertSampleData: () =>
        ipcRenderer.invoke('database:insertSampleData'),
    focusWindow: () =>
        ipcRenderer.invoke('window:focus')
});

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