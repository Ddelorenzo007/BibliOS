const { ipcMain } = require('electron');
const DatabaseService = require('../database/database');

class DatabaseHandlers {
    constructor() {
        this.db = new DatabaseService();
        this.setupHandlers();
    }

    setupHandlers() {
        // ===== AUTENTICACIÓN =====
        ipcMain.handle('database:login', async (event, { usuario, password }) => {
            return await this.db.login(usuario, password);
        });

        // ===== GESTIÓN DE USUARIOS (rol administrador) =====
        ipcMain.handle('database:getUsuarios', async (event, { filters = {} } = {}) => {
            return await this.db.getUsuarios(filters);
        });
        ipcMain.handle('database:createUsuario', async (event, usuarioData) => {
            return await this.db.createUsuario(usuarioData);
        });
        ipcMain.handle('database:toggleEstadoUsuario', async (event, { id, nuevoEstado, usuarioQueLoHace }) => {
            return await this.db.toggleEstadoUsuario(id, nuevoEstado, usuarioQueLoHace);
        });

        // ===== PERSONAS (autores/responsables) =====
        ipcMain.handle('database:getPersonas', async (event, { filters = {} } = {}) => {
            return await this.db.getPersonas(filters);
        });

        // ===== OBRAS =====
        ipcMain.handle('database:createObra', async (event, obraData) => {
            return await this.db.createObra(obraData);
        });
        ipcMain.handle('database:getObras', async (event, { filters = {} } = {}) => {
            return await this.db.getObras(filters);
        });
        ipcMain.handle('database:getObraById', async (event, id) => {
            return await this.db.getObraById(id);
        });
        ipcMain.handle('database:updateObra', async (event, { id, updates }) => {
            return await this.db.updateObra(id, updates);
        });
        ipcMain.handle('database:darDeBajaObra', async (event, { id, usuarioId }) => {
            return await this.db.darDeBajaObra(id, usuarioId);
        });

        // ===== TOMOS =====
        ipcMain.handle('database:createTomo', async (event, tomoData) => {
            return await this.db.createTomo(tomoData);
        });
        ipcMain.handle('database:getTomosByObra', async (event, obraId) => {
            return await this.db.getTomosByObra(obraId);
        });

        // ===== EJEMPLARES =====
        ipcMain.handle('database:createEjemplar', async (event, ejemplarData) => {
            return await this.db.createEjemplar(ejemplarData);
        });
        ipcMain.handle('database:getEjemplares', async (event, { filters = {} } = {}) => {
            return await this.db.getEjemplares(filters);
        });
        ipcMain.handle('database:getEjemplarById', async (event, id) => {
            return await this.db.getEjemplarById(id);
        });
        ipcMain.handle('database:updateEjemplar', async (event, { id, updates }) => {
            return await this.db.updateEjemplar(id, updates);
        });

        // ===== SOCIOS =====
        ipcMain.handle('database:createSocio', async (event, socioData) => {
            return await this.db.createSocio(socioData);
        });
        ipcMain.handle('database:getSocios', async (event, { filters = {} } = {}) => {
            return await this.db.getSocios(filters);
        });
        ipcMain.handle('database:getSocioById', async (event, id) => {
            return await this.db.getSocioById(id);
        });
        ipcMain.handle('database:updateSocio', async (event, { id, updates }) => {
            return await this.db.updateSocio(id, updates);
        });
        ipcMain.handle('database:darDeBajaSocio', async (event, { id, usuarioId }) => {
            return await this.db.darDeBajaSocio(id, usuarioId);
        });

        // ===== SANCIONES =====
        ipcMain.handle('database:aplicarSancion', async (event, sancionData) => {
            return await this.db.aplicarSancion(sancionData);
        });
        ipcMain.handle('database:finalizarSancion', async (event, { id, usuarioId }) => {
            return await this.db.finalizarSancion(id, usuarioId);
        });
        ipcMain.handle('database:getSancionesBySocio', async (event, socioId) => {
            return await this.db.getSancionesBySocio(socioId);
        });

        // ===== PRÉSTAMOS =====
        ipcMain.handle('database:createPrestamo', async (event, prestamoData) => {
            return await this.db.createPrestamo(prestamoData);
        });
        ipcMain.handle('database:getPrestamos', async (event, { filters = {} } = {}) => {
            return await this.db.getPrestamos(filters);
        });
        ipcMain.handle('database:getPrestamoById', async (event, id) => {
            return await this.db.getPrestamoById(id);
        });
        ipcMain.handle('database:devolverLibro', async (event, { prestamoId, usuarioId }) => {
            return await this.db.devolverLibro(prestamoId, usuarioId);
        });
        ipcMain.handle('database:renovarPrestamo', async (event, { prestamoId, usuarioId }) => {
            return await this.db.renovarPrestamo(prestamoId, usuarioId);
        });
        ipcMain.handle('database:actualizarPrestamosVencidos', async () => {
            return await this.db.actualizarPrestamosVencidos();
        });

        // ===== RESERVAS =====
        ipcMain.handle('database:createReserva', async (event, reservaData) => {
            return await this.db.createReserva(reservaData);
        });
        ipcMain.handle('database:getReservas', async (event, { filters = {} } = {}) => {
            return await this.db.getReservas(filters);
        });
        ipcMain.handle('database:cancelarReserva', async (event, { id, usuarioId }) => {
            return await this.db.cancelarReserva(id, usuarioId);
        });
        ipcMain.handle('database:atenderReserva', async (event, { id, usuarioId }) => {
            return await this.db.atenderReserva(id, usuarioId);
        });

        // ===== INGRESOS A SALA =====
        ipcMain.handle('database:registrarIngreso', async (event, ingresoData) => {
            return await this.db.registrarIngreso(ingresoData);
        });
        ipcMain.handle('database:getIngresos', async (event, { filters = {} } = {}) => {
            return await this.db.getIngresos(filters);
        });

        // ===== DOCUMENTACIÓN INSTITUCIONAL =====
        ipcMain.handle('database:subirDocumento', async (event, docData) => {
            return await this.db.subirDocumento(docData);
        });
        ipcMain.handle('database:getDocumentos', async (event, { filters = {} } = {}) => {
            return await this.db.getDocumentos(filters);
        });
        ipcMain.handle('database:darDeBajaDocumento', async (event, { id, usuarioId }) => {
            return await this.db.darDeBajaDocumento(id, usuarioId);
        });

        // ===== AUDITORÍA =====
        ipcMain.handle('database:getAuditoria', async (event, { filters = {} } = {}) => {
            return await this.db.getAuditoria(filters);
        });

        // ===== ESTADÍSTICAS =====
        ipcMain.handle('database:getStats', async () => {
            return await this.db.getStats();
        });
        ipcMain.handle('database:getPrestamosPorMes', async (event, { meses = 6 } = {}) => {
            return await this.db.getPrestamosPorMes(meses);
        });
        ipcMain.handle('database:getObrasPorCategoria', async () => {
            return await this.db.getObrasPorCategoria();
        });
        ipcMain.handle('database:getSociosPorMes', async (event, { meses = 6 } = {}) => {
            return await this.db.getSociosPorMes(meses);
        });

        // ===== REPORTES =====
        ipcMain.handle('database:getObrasMasPrestadas', async (event, { limit = 10 } = {}) => {
            return await this.db.getObrasMasPrestadas(limit);
        });
        ipcMain.handle('database:getSociosConMasPrestamos', async (event, { limit = 10 } = {}) => {
            return await this.db.getSociosConMasPrestamos(limit);
        });
        ipcMain.handle('database:getEstadisticasMensuales', async (event, { meses = 6 } = {}) => {
            return await this.db.getEstadisticasMensuales(meses);
        });

        // ===== UTILIDADES =====
        ipcMain.handle('database:backup', async (event, destinationPath) => {
            return await this.db.backup(destinationPath);
        });
        ipcMain.handle('database:close', async () => {
            await this.db.close();
            return true;
        });
        ipcMain.handle('database:insertSampleData', async () => {
            return await this.db.insertSampleData();
        });

        // ===== VENTANA =====
        ipcMain.handle('window:focus', async () => {
            const { BrowserWindow } = require('electron');
            const mainWindow = BrowserWindow.getFocusedWindow();
            if (mainWindow) { mainWindow.focus(); mainWindow.show(); return true; }
            return false;
        });
    }

    cleanup() {
        const canales = [
            'database:login',
            'database:getUsuarios', 'database:createUsuario', 'database:toggleEstadoUsuario',
            'database:getPersonas',
            'database:createObra', 'database:getObras', 'database:getObraById', 'database:updateObra', 'database:darDeBajaObra',
            'database:createTomo', 'database:getTomosByObra',
            'database:createEjemplar', 'database:getEjemplares', 'database:getEjemplarById', 'database:updateEjemplar',
            'database:createSocio', 'database:getSocios', 'database:getSocioById', 'database:updateSocio', 'database:darDeBajaSocio',
            'database:aplicarSancion', 'database:finalizarSancion', 'database:getSancionesBySocio',
            'database:createPrestamo', 'database:getPrestamos', 'database:getPrestamoById', 'database:devolverLibro',
            'database:renovarPrestamo', 'database:actualizarPrestamosVencidos',
            'database:createReserva', 'database:getReservas', 'database:cancelarReserva', 'database:atenderReserva',
            'database:registrarIngreso', 'database:getIngresos',
            'database:subirDocumento', 'database:getDocumentos', 'database:darDeBajaDocumento',
            'database:getAuditoria',
            'database:getStats', 'database:getPrestamosPorMes', 'database:getObrasPorCategoria', 'database:getSociosPorMes',
            'database:getObrasMasPrestadas', 'database:getSociosConMasPrestamos', 'database:getEstadisticasMensuales',
            'database:backup', 'database:close', 'database:insertSampleData',
            'window:focus'
        ];
        canales.forEach(c => ipcMain.removeHandler(c));
    }
}

module.exports = DatabaseHandlers;