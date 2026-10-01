// ============================================================================
// Cliente HTTP que reemplaza preload.js/IPC para todo lo relacionado a datos.
// ============================================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Ahora el token lo obtiene de forma asíncrona usando el puente seguro de Electron.
// Si no está en Electron (ej. navegador web en desarrollo), usa localStorage como fallback.
async function getToken() {
    if (window.authAPI && window.authAPI.getToken) {
        return await window.authAPI.getToken();
    }
    return localStorage.getItem('biblios_token');
}

async function clearToken() {
    if (window.authAPI && window.authAPI.removeToken) {
        await window.authAPI.removeToken();
    }
    localStorage.removeItem('biblios_token');
}

function toQueryString(params = {}) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') usp.set(key, value);
    });
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
}

async function request(method, path, body) {
    const headers = {};
    
    // Esperamos el token cifrado desde safeStorage antes de armar la petición
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let fetchBody = body;
    if (body !== undefined && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        fetchBody = JSON.stringify(body);
    }

    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
    const finalUrl = baseUrl + path;

    const res = await fetch(finalUrl, {
        method: method,
        headers: headers,
        body: fetchBody
    });

    let data = null;
    try { data = await res.json(); } catch (_) { /* respuesta sin cuerpo JSON */ }

    if (res.status === 401) {
        await clearToken();
        localStorage.removeItem('biblios_session');
        if (!window.location.hash.includes('/login') && window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
        throw new Error('Tu sesión expiró. Iniciá sesión de nuevo.');
    }

    if (!res.ok) {
        const mensaje = (data && (data.error || data.message)) || `Error ${res.status}`;
        throw new Error(mensaje);
    }
    return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);

window.electronAPI = {
    // ===== AUTENTICACIÓN =====
    login: async (usuario, password) => {
        const resultado = await post('/auth/login', { usuario, password });
        
        // Ya NO hacemos setToken() en localStorage acá. 
        // Devolvemos el token explícitamente para que useAuth.js lo encripte.
        return { 
            success: resultado.success, 
            message: resultado.message, 
            usuario: resultado.usuario,
            token: resultado.token 
        };
    },
    logout: async () => await clearToken(),

    // ===== PERSONAS =====
    getPersonas: (filters = {}) => get(`/personas${toQueryString(filters)}`),

    // ===== OBRAS =====
    createObra: (obraData) => post('/obras', obraData),
    getObras: (filters = {}) => get(`/obras${toQueryString(filters)}`),
    getObraById: (id) => get(`/obras/${id}`),
    updateObra: (id, updates) => put(`/obras/${id}`, updates),
    darDeBajaObra: (id) => post(`/obras/${id}/baja`),

    // ===== TOMOS =====
    createTomo: (tomoData) => post('/tomos', tomoData),
    getTomosByObra: (obraId) => get(`/obras/${obraId}/tomos`),

    // ===== EJEMPLARES =====
    createEjemplar: (ejemplarData) => post('/ejemplares', ejemplarData),
    getEjemplares: (filters = {}) => get(`/ejemplares${toQueryString(filters)}`),
    getEjemplarById: (id) => get(`/ejemplares/${id}`),
    updateEjemplar: (id, updates) => put(`/ejemplares/${id}`, updates),

    // ===== SOCIOS =====
    createSocio: (socioData) => post('/socios', socioData),
    getSocios: (filters = {}) => get(`/socios${toQueryString(filters)}`),
    getSocioById: (id) => get(`/socios/${id}`),
    updateSocio: (id, updates) => put(`/socios/${id}`, updates),
    darDeBajaSocio: (id) => post(`/socios/${id}/baja`),

    // ===== SANCIONES =====
    aplicarSancion: (sancionData) => post('/sanciones', sancionData),
    finalizarSancion: (id) => post(`/sanciones/${id}/finalizar`),
    getSancionesBySocio: (socioId) => get(`/socios/${socioId}/sanciones`),

    // ===== PRÉSTAMOS =====
    createPrestamo: (prestamoData) => post('/prestamos', prestamoData),
    getPrestamos: (filters = {}) => get(`/prestamos${toQueryString(filters)}`),
    getPrestamoById: (id) => get(`/prestamos/${id}`),
    devolverLibro: (prestamoId) => post(`/prestamos/${prestamoId}/devolver`),
    renovarPrestamo: (prestamoId) => post(`/prestamos/${prestamoId}/renovar`),
    actualizarPrestamosVencidos: () => post('/prestamos/actualizar-vencidos'),

    // ===== RESERVAS =====
    createReserva: (reservaData) => post('/reservas', reservaData),
    getReservas: (filters = {}) => get(`/reservas${toQueryString(filters)}`),
    cancelarReserva: (id) => post(`/reservas/${id}/cancelar`),
    atenderReserva: (id) => post(`/reservas/${id}/atender`),

    // ===== INGRESOS A SALA =====
    registrarIngreso: (ingresoData) => post('/ingresos', ingresoData),
    getIngresos: (filters = {}) => get(`/ingresos${toQueryString(filters)}`),

    // ===== DOCUMENTACIÓN INSTITUCIONAL =====
    subirDocumento: (docData) => post('/documentos', docData),
    getDocumentos: (filters = {}) => get(`/documentos${toQueryString(filters)}`),
    darDeBajaDocumento: (id) => post(`/documentos/${id}/baja`),

    // ===== AUDITORÍA =====
    getAuditoria: (filters = {}) => get(`/auditoria${toQueryString(filters)}`),

    // ===== USUARIOS (admin) =====
    getUsuarios: (filters = {}) => get(`/usuarios${toQueryString(filters)}`),
    createUsuario: (usuarioData) => post('/usuarios', usuarioData),
    toggleEstadoUsuario: (id, nuevoEstado) => post(`/usuarios/${id}/estado`, { nuevoEstado }),

    // ===== ESTADÍSTICAS Y REPORTES =====
    getStats: () => get('/stats'),
    getPrestamosPorMes: (meses = 6) => get(`/reportes/prestamos-por-mes${toQueryString({ meses })}`),
    getObrasPorCategoria: () => get('/reportes/obras-por-categoria'),
    getSociosPorMes: (meses = 6) => get(`/reportes/socios-por-mes${toQueryString({ meses })}`),
    getObrasMasPrestadas: (limit = 10) => get(`/reportes/obras-mas-prestadas${toQueryString({ limit })}`),
    getSociosConMasPrestamos: (limit = 10) => get(`/reportes/socios-mas-prestamos${toQueryString({ limit })}`),
    getEstadisticasMensuales: (meses = 6) => get(`/reportes/estadisticas-mensuales${toQueryString({ meses })}`),

    // ===== SISTEMA ACADÉMICO (BD .bak) =====
    buscarEnSistemaAcademico: (dni) => get(`/academico/buscar/${dni}`),

    // ===== DATOS FICTICIOS DE DEMOSTRACIÓN =====
    insertSampleData: () => post('/seed-demo'),
};