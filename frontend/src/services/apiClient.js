// ============================================================================
// Cliente HTTP que reemplaza preload.js/IPC para todo lo relacionado a datos.
// Expone exactamente la misma superficie que tenía window.electronAPI antes
// (mismos nombres de método, mismos argumentos, misma forma de respuesta),
// para que NINGUNA pantalla (Obras.jsx, Socios.jsx, Prestamos.jsx, etc.)
// necesite cambiar una sola línea. Lo único que cambia es CÓMO se obtienen
// los datos: antes por IPC hacia el proceso principal de Electron (que leía
// SQLite directo), ahora por HTTP hacia el servidor Express (que lee
// PostgreSQL). Los diálogos nativos (window.nativeDialog) siguen viviendo
// en preload.js/Electron sin cambios, porque esos sí necesitan acceso al
// sistema operativo.
// ============================================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'biblios_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}
function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

// Arma la query string a partir de un objeto de filtros, ignorando valores
// vacíos/undefined (mismo comportamiento laxo que tenían los métodos
// getX(filters) del preload.js viejo).
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
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // LÓGICA NUEVA: Si NO es FormData, usamos JSON. 
    // Si ES FormData, el navegador asigna automáticamente el Content-Type multipart con su boundary.
    let fetchBody = body;
    if (body !== undefined && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        fetchBody = JSON.stringify(body);
    }

    const res = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: fetchBody
    });

    let data = null;
    try { data = await res.json(); } catch (_) { /* respuesta sin cuerpo JSON */ }

    if (res.status === 401) {
        clearToken();
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
        if (resultado.success && resultado.token) setToken(resultado.token);
        // Se devuelve la misma forma que antes (success + usuario), el
        // token queda guardado acá adentro sin que useAuth.js tenga que
        // saber que existe.
        return { success: resultado.success, message: resultado.message, usuario: resultado.usuario };
    },
    logout: () => clearToken(),

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

    // ===== DATOS FICTICIOS DE DEMOSTRACIÓN =====
    insertSampleData: () => post('/seed-demo'),
};