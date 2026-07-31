const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs de base de datos al frontend
contextBridge.exposeInMainWorld('electronAPI', {
    // ===== API DE AUTENTICACIÓN =====
    // Login local/ficticio contra la tabla de usuarios de SQLite, mientras
    // no exista integración con la entidad externa (superentidad) que
    // gestionará el registro real de usuarios.
    login: (usuario, password) =>
        ipcRenderer.invoke('database:login', { usuario, password }),

    // ===== APIS DE LIBROS =====
    
    // Crear nuevo libro
    createLibro: (libroData) => 
        ipcRenderer.invoke('database:createLibro', libroData),
    
    // Obtener libros
    getLibros: (filters = {}) => 
        ipcRenderer.invoke('database:getLibros', { filters }),
    
    // Obtener libro por ID
    getLibroById: (id) => 
        ipcRenderer.invoke('database:getLibroById', id),
    
    // Actualizar libro
    updateLibro: (id, updates) => 
        ipcRenderer.invoke('database:updateLibro', { id, updates }),
    
    // Eliminar libro
    deleteLibro: (id) => 
        ipcRenderer.invoke('database:deleteLibro', id),

    // ===== APIS DE SOCIOS =====
    
    // Crear nuevo socio
    createSocio: (socioData) => 
        ipcRenderer.invoke('database:createSocio', socioData),
    
    // Obtener socios
    getSocios: (filters = {}) => 
        ipcRenderer.invoke('database:getSocios', { filters }),
    
    // Obtener socio por ID
    getSocioById: (id) => 
        ipcRenderer.invoke('database:getSocioById', id),
    
    // Actualizar socio
    updateSocio: (id, updates) => 
        ipcRenderer.invoke('database:updateSocio', { id, updates }),
    
    // Eliminar socio
    deleteSocio: (id) => 
        ipcRenderer.invoke('database:deleteSocio', id),

    // ===== APIS DE PRÉSTAMOS =====
    
    // Crear nuevo préstamo
    createPrestamo: (prestamoData) => 
        ipcRenderer.invoke('database:createPrestamo', prestamoData),
    
    // Obtener préstamos
    getPrestamos: (filters = {}) => 
        ipcRenderer.invoke('database:getPrestamos', { filters }),
    
    // Obtener préstamo por ID
    getPrestamoById: (id) => 
        ipcRenderer.invoke('database:getPrestamoById', id),
    
    // Devolver libro (marcar préstamo como completado)
    devolverLibro: (prestamoId) => 
        ipcRenderer.invoke('database:devolverLibro', prestamoId),

    // Actualizar préstamo
    updatePrestamo: (id, updates) => 
        ipcRenderer.invoke('database:updatePrestamo', { id, updates }),

    // Eliminar préstamo
    deletePrestamo: (id) => 
        ipcRenderer.invoke('database:deletePrestamo', id),

    // ===== APIS DE ESTADÍSTICAS =====
    
    // Obtener estadísticas generales
    getStats: () => 
        ipcRenderer.invoke('database:getStats'),
    
    // Obtener préstamos por mes
    getPrestamosPorMes: (meses = 6) => 
        ipcRenderer.invoke('database:getPrestamosPorMes', { meses }),
    
    // Obtener distribución de libros por categoría
    getLibrosPorCategoria: () => 
        ipcRenderer.invoke('database:getLibrosPorCategoria'),

    // Obtener socios por mes (histórico acumulado)
    getSociosPorMes: (meses = 6) => 
        ipcRenderer.invoke('database:getSociosPorMes', { meses }),

    // ===== APIS DE UTILIDADES =====
    
    // Hacer backup de la base de datos
    backup: (destinationPath) => 
        ipcRenderer.invoke('database:backup', destinationPath),
    
    // Cerrar conexión a la base de datos
    close: () => 
        ipcRenderer.invoke('database:close'),
    
    // Insertar datos ficticios de ejemplo
    insertSampleData: () => 
        ipcRenderer.invoke('database:insertSampleData'),

    // ===== APIS DE LA APLICACIÓN =====
    
    // Escuchar eventos de la aplicación
    onAppError: (callback) => 
        ipcRenderer.on('app:error', callback),
    
    // Remover listener de eventos
    removeAppErrorListener: (callback) => 
        ipcRenderer.removeListener('app:error', callback),

    // ===== APIS DEL SISTEMA =====
    
    // Obtener información del sistema
    getSystemInfo: () => ({
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron
    }),

    // Obtener versión de la aplicación
    getAppVersion: () => process.env.npm_package_version || '1.0.0',

    // Verificar si estamos en desarrollo
    isDevelopment: () => process.env.NODE_ENV === 'development',

    // ===== APIS DE VENTANA =====
    
    // Forzar focus de la ventana
    focusWindow: () => 
        ipcRenderer.invoke('window:focus')
});

// Exponer utilidades adicionales
contextBridge.exposeInMainWorld('utils', {
    // Formatear fecha
    formatDate: (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    },

    // Formatear fecha y hora
    formatDateTime: (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Validar email
    validateEmail: (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    // Validar ISBN
    validateISBN: (isbn) => {
        // Remover guiones y espacios
        const cleanISBN = isbn.replace(/[-\s]/g, '');
        
        // ISBN-10: 10 dígitos
        if (cleanISBN.length === 10) {
            return /^\d{9}[\dX]$/.test(cleanISBN);
        }
        
        // ISBN-13: 13 dígitos
        if (cleanISBN.length === 13) {
            return /^\d{13}$/.test(cleanISBN);
        }
        
        return false;
    },

    // Generar ID único
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Capitalizar primera letra
    capitalize: (str) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    // Truncar texto
    truncate: (str, length = 50) => {
        if (!str) return '';
        if (str.length <= length) return str;
        return str.substring(0, length) + '...';
    },

    // Calcular días entre fechas
    daysBetween: (date1, date2) => {
        const oneDay = 24 * 60 * 60 * 1000; // horas * minutos * segundos * milisegundos
        const diffTime = Math.abs(date2 - date1);
        return Math.ceil(diffTime / oneDay);
    },

    // Verificar si una fecha está vencida
    isOverdue: (date) => {
        return new Date(date) < new Date();
    },

    // Obtener estado del préstamo
    getPrestamoStatus: (fechaDevolucion, estado) => {
        if (estado === 'completado') return 'completado';
        if (estado === 'vencido') return 'vencido';
        
        const isOverdue = this.isOverdue(fechaDevolucion);
        return isOverdue ? 'vencido' : 'activo';
    },

    // Formatear número de teléfono
    formatPhone: (phone) => {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{3})$/);
        if (match) {
            return '(' + match[1] + ') ' + match[2] + '-' + match[3];
        }
        return phone;
    },

    // Validar número de teléfono
    validatePhone: (phone) => {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10;
    },

    // Generar slug para URLs
    generateSlug: (text) => {
        return text
            .toLowerCase()
            .replace(/[^\w ]+/g, '')
            .replace(/ +/g, '-');
    },

    // Obtener iniciales de un nombre
    getInitials: (name) => {
        if (!name) return '';
        return name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }
});

// ===== WRAPPER DE DIÁLOGOS NATIVOS CON REPARACIÓN DE FOCO =====
contextBridge.exposeInMainWorld('nativeDialog', {
    // Diálogo de confirmación
    confirm: (opts) => ipcRenderer.invoke('dialog:confirm', opts),
    
    // Diálogo de mensaje/información
    message: (opts) => ipcRenderer.invoke('dialog:message', opts),
    
    // Diálogo de error
    error: (opts) => ipcRenderer.invoke('dialog:error', opts),
    
    // Diálogo de advertencia
    warning: (opts) => ipcRenderer.invoke('dialog:warning', opts),
    
    // Diálogo de apertura de archivo
    open: (opts) => ipcRenderer.invoke('dialog:open', opts),
    
    // Diálogo de apertura de múltiples archivos
    openMultiple: (opts) => ipcRenderer.invoke('dialog:openMultiple', opts),
    
    // Diálogo de apertura de directorio
    openDirectory: (opts) => ipcRenderer.invoke('dialog:openDirectory', opts),
    
    // Diálogo de guardado de archivo
    save: (opts) => ipcRenderer.invoke('dialog:save', opts),
    
    // Asegurar foco en la ventana principal
    ensureFocus: () => ipcRenderer.invoke('ensure-focused')
});

// Manejar errores de IPC
ipcRenderer.on('error', (event, error) => {
    console.error('Error en el proceso renderer:', error);
});

// Log de inicialización
console.log('Preload script cargado correctamente');
console.log('Exponiendo electronAPI con focusWindow disponible');
