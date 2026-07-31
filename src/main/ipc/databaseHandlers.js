const { ipcMain } = require('electron');
const DatabaseService = require('../database/database');

class DatabaseHandlers {
    constructor() {
        this.db = new DatabaseService();
        this.setupHandlers();
    }

    setupHandlers() {
        // ===== MANEJADORES DE AUTENTICACIÓN =====
        // Autenticación local/ficticia. La entidad externa (superentidad)
        // que se hará cargo del registro real de usuarios todavía no está
        // integrada, por eso el login valida contra la tabla local.

        ipcMain.handle('database:login', async (event, { usuario, password }) => {
            try {
                return await this.db.login(usuario, password);
            } catch (error) {
                console.error('Error en login:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE LIBROS =====

        ipcMain.handle('database:createLibro', async (event, libroData) => {
            try {
                return await this.db.createLibro(libroData);
            } catch (error) {
                console.error('Error en createLibro:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getLibros', async (event, { filters = {} } = {}) => {
            try {
                return await this.db.getLibros(filters);
            } catch (error) {
                console.error('Error en getLibros:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getLibroById', async (event, id) => {
            try {
                return await this.db.getLibroById(id);
            } catch (error) {
                console.error('Error en getLibroById:', error);
                throw error;
            }
        });

        ipcMain.handle('database:updateLibro', async (event, { id, updates }) => {
            try {
                return await this.db.updateLibro(id, updates);
            } catch (error) {
                console.error('Error en updateLibro:', error);
                throw error;
            }
        });

        ipcMain.handle('database:deleteLibro', async (event, id) => {
            try {
                return await this.db.deleteLibro(id);
            } catch (error) {
                console.error('Error en deleteLibro:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE SOCIOS =====

        ipcMain.handle('database:createSocio', async (event, socioData) => {
            try {
                return await this.db.createSocio(socioData);
            } catch (error) {
                console.error('Error en createSocio:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getSocios', async (event, { filters = {} } = {}) => {
            try {
                return await this.db.getSocios(filters);
            } catch (error) {
                console.error('Error en getSocios:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getSocioById', async (event, id) => {
            try {
                return await this.db.getSocioById(id);
            } catch (error) {
                console.error('Error en getSocioById:', error);
                throw error;
            }
        });

        ipcMain.handle('database:updateSocio', async (event, { id, updates }) => {
            try {
                return await this.db.updateSocio(id, updates);
            } catch (error) {
                console.error('Error en updateSocio:', error);
                throw error;
            }
        });

        ipcMain.handle('database:deleteSocio', async (event, id) => {
            try {
                return await this.db.deleteSocio(id);
            } catch (error) {
                console.error('Error en deleteSocio:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE PRÉSTAMOS =====

        ipcMain.handle('database:createPrestamo', async (event, prestamoData) => {
            try {
                return await this.db.createPrestamo(prestamoData);
            } catch (error) {
                console.error('Error en createPrestamo:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getPrestamos', async (event, { filters = {} } = {}) => {
            try {
                return await this.db.getPrestamos(filters);
            } catch (error) {
                console.error('Error en getPrestamos:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getPrestamoById', async (event, id) => {
            try {
                return await this.db.getPrestamoById(id);
            } catch (error) {
                console.error('Error en getPrestamoById:', error);
                throw error;
            }
        });

        ipcMain.handle('database:devolverLibro', async (event, prestamoId) => {
            try {
                return await this.db.devolverLibro(prestamoId);
            } catch (error) {
                console.error('Error en devolverLibro:', error);
                throw error;
            }
        });

        ipcMain.handle('database:updatePrestamo', async (event, { id, updates }) => {
            try {
                return await this.db.updatePrestamo(id, updates);
            } catch (error) {
                console.error('Error en updatePrestamo:', error);
                throw error;
            }
        });

        ipcMain.handle('database:deletePrestamo', async (event, id) => {
            try {
                return await this.db.deletePrestamo(id);
            } catch (error) {
                console.error('Error en deletePrestamo:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE ESTADÍSTICAS =====

        ipcMain.handle('database:getStats', async () => {
            try {
                return await this.db.getStats();
            } catch (error) {
                console.error('Error en getStats:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getPrestamosPorMes', async (event, { meses = 6 } = {}) => {
            try {
                return await this.db.getPrestamosPorMes(meses);
            } catch (error) {
                console.error('Error en getPrestamosPorMes:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getLibrosPorCategoria', async () => {
            try {
                return await this.db.getLibrosPorCategoria();
            } catch (error) {
                console.error('Error en getLibrosPorCategoria:', error);
                throw error;
            }
        });

        ipcMain.handle('database:getSociosPorMes', async (event, { meses = 6 } = {}) => {
            try {
                return await this.db.getSociosPorMes(meses);
            } catch (error) {
                console.error('Error en getSociosPorMes:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE UTILIDADES =====

        ipcMain.handle('database:backup', async (event, destinationPath) => {
            try {
                return await this.db.backup(destinationPath);
            } catch (error) {
                console.error('Error en backup:', error);
                throw error;
            }
        });

        ipcMain.handle('database:close', async () => {
            try {
                await this.db.close();
                return true;
            } catch (error) {
                console.error('Error en close:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE DATOS FICTICIOS DE DEMOSTRACIÓN =====

        ipcMain.handle('database:insertSampleData', async () => {
            try {
                return await this.db.insertSampleData();
            } catch (error) {
                console.error('Error en insertSampleData:', error);
                throw error;
            }
        });

        // ===== MANEJADORES DE VENTANA =====

        ipcMain.handle('window:focus', async () => {
            try {
                const { BrowserWindow } = require('electron');
                const mainWindow = BrowserWindow.getFocusedWindow();
                if (mainWindow) {
                    mainWindow.focus();
                    mainWindow.show();
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Error en focusWindow:', error);
                throw error;
            }
        });
    }

    // Método para limpiar todos los manejadores
    cleanup() {
        // Remover todos los manejadores IPC
        ipcMain.removeHandler('database:login');

        ipcMain.removeHandler('database:createLibro');
        ipcMain.removeHandler('database:getLibros');
        ipcMain.removeHandler('database:getLibroById');
        ipcMain.removeHandler('database:updateLibro');
        ipcMain.removeHandler('database:deleteLibro');

        ipcMain.removeHandler('database:createSocio');
        ipcMain.removeHandler('database:getSocios');
        ipcMain.removeHandler('database:getSocioById');
        ipcMain.removeHandler('database:updateSocio');
        ipcMain.removeHandler('database:deleteSocio');

        ipcMain.removeHandler('database:createPrestamo');
        ipcMain.removeHandler('database:getPrestamos');
        ipcMain.removeHandler('database:getPrestamoById');
        ipcMain.removeHandler('database:devolverLibro');
        ipcMain.removeHandler('database:updatePrestamo');
        ipcMain.removeHandler('database:deletePrestamo');

        ipcMain.removeHandler('database:getStats');
        ipcMain.removeHandler('database:getPrestamosPorMes');
        ipcMain.removeHandler('database:getLibrosPorCategoria');
        ipcMain.removeHandler('database:getSociosPorMes');

        ipcMain.removeHandler('database:backup');
        ipcMain.removeHandler('database:close');
        ipcMain.removeHandler('database:insertSampleData');

        ipcMain.removeHandler('window:focus');
    }
}

module.exports = DatabaseHandlers;
