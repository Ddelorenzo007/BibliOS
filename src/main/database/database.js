const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// ============================================================================
// Esquema de datos: obras / tomos / ejemplares / socios / prestamos /
// renovaciones / reservas / sanciones / auditoria / ingresos / documentos.
// Corresponde al DDL de PostgreSQL validado en db/schema_postgres.sql
// (Entrega 6 - casos de uso). Esta versión SQLite mantiene los mismos
// nombres de tabla/columna para que las queries no tengan que reescribirse
// cuando se migre a Postgres.
// ============================================================================

// ===== VALIDADORES =====
class Validators {
    static validateEmail(email) {
        if (!email) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    static validatePhone(phone) {
        if (!phone) return true;
        return phone.replace(/\D/g, '').length >= 10;
    }

    static validateDNI(dni) {
        if (!dni) return false;
        const cleaned = String(dni).replace(/\D/g, '');
        return cleaned.length >= 7 && cleaned.length <= 9;
    }

    static validateISBN(isbn) {
        if (!isbn) return true;
        const cleanISBN = isbn.replace(/[-\s]/g, '');
        if (cleanISBN.length === 10) return /^\d{9}[\dX]$/.test(cleanISBN);
        if (cleanISBN.length === 13) return /^\d{13}$/.test(cleanISBN);
        return false;
    }

    static validateYear(year) {
        if (!year) return true;
        const currentYear = new Date().getFullYear();
        return year >= 0 && year <= currentYear + 1;
    }

    static validateRequired(value, fieldName) {
        const stringValue = String(value || '');
        if (!value || stringValue.trim() === '') {
            throw new Error(`El campo "${fieldName}" es requerido`);
        }
        return true;
    }

    static validateTipoSocio(tipo) {
        return ['alumno', 'graduado', 'docente', 'no_docente'].includes(tipo);
    }
}

// ===== HASHING DE CONTRASEÑAS (autenticación local/ficticia) =====
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.init();
    }

    init() {
        try {
            console.log('Inicializando base de datos SQLite...');
            const userDataPath = app.getPath('userData');
            const dbDir = path.join(userDataPath, 'BibliOS');

            const fs = require('fs');
            if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

            this.dbPath = path.join(dbDir, 'biblios.db');
            this.db = new Database(this.dbPath);
            this.db.pragma('foreign_keys = ON');

            this.migrateEsquemaBibliografico(); // debe correr ANTES de createTables
            this.createTables();
            this.seedDefaultUsuario();

            console.log(`Base de datos SQLite inicializada en: ${this.dbPath}`);
        } catch (error) {
            console.error('Error al inicializar la base de datos:', error);
            throw error;
        }
    }

    // Detecta el esquema plano viejo (libros/socios/prestamos sin
    // obras/tomos/ejemplares) y lo reemplaza por el esquema nuevo. Como los
    // datos son ficticios y el esquema nuevo exige campos que no existían
    // antes (dni, tipoSocio, ISBN por tomo, etc.), no es una migración con
    // preservación de datos: se informa por consola y se recrean las tablas
    // vacías. Usar insertSampleData() después para repoblar.
    migrateEsquemaBibliografico() {
        try {
            const tieneObras = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='obras'"
            ).get();
            const tieneLibrosViejo = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='libros'"
            ).get();

            if (!tieneObras && tieneLibrosViejo) {
                console.warn('======================================================================');
                console.warn('MIGRACIÓN DE ESQUEMA: se detectó el esquema plano anterior (libros/socios/prestamos).');
                console.warn('El nuevo esquema (obras/tomos/ejemplares, socios con DNI y tipo institucional)');
                console.warn('no es compatible campo a campo, así que las tablas viejas se van a reemplazar');
                console.warn('vacías. Datos ficticios anteriores: se pierden. Usar insertSampleData() para repoblar.');
                console.warn('======================================================================');
                this.db.exec('DROP TABLE IF EXISTS prestamos');
                this.db.exec('DROP TABLE IF EXISTS socios');
                this.db.exec('DROP TABLE IF EXISTS libros');
            }

            // Segunda migración: la primera versión del esquema bibliográfico
            // tenía el ISBN y las clasificaciones en tablas separadas
            // (tomos.isbn, obra_clasificaciones). Ahora el ISBN y la
            // categoría viven directo en "obras". Si detectamos la tabla
            // "obras" sin la columna "isbn", recreamos ese grupo de tablas
            // vacías (siguen siendo datos ficticios de desarrollo).
            if (tieneObras) {
                const columnasObras = this.db.prepare("PRAGMA table_info(obras)").all().map(c => c.name);
                if (!columnasObras.includes('isbn')) {
                    console.warn('======================================================================');
                    console.warn('MIGRACIÓN DE ESQUEMA: el ISBN y la categoría pasan a vivir en "obras"');
                    console.warn('(antes estaban en "tomos" y "obra_clasificaciones"). Se recrean esas');
                    console.warn('tablas vacías. Usar insertSampleData() para repoblar.');
                    console.warn('======================================================================');
                    this.db.exec('DROP TABLE IF EXISTS prestamos');
                    this.db.exec('DROP TABLE IF EXISTS reservas');
                    this.db.exec('DROP TABLE IF EXISTS ejemplares');
                    this.db.exec('DROP TABLE IF EXISTS obra_clasificaciones');
                    this.db.exec('DROP TABLE IF EXISTS obra_personas');
                    this.db.exec('DROP TABLE IF EXISTS tomos');
                    this.db.exec('DROP TABLE IF EXISTS obras');
                }
            }

            // Migración aditiva (no se pierde nada): agregar la columna
            // "estado" a usuarios si la base es de antes de tener el módulo
            // de administración de cuentas.
            const tieneUsuarios = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
            ).get();
            if (tieneUsuarios) {
                const columnasUsuarios = this.db.prepare("PRAGMA table_info(usuarios)").all().map(c => c.name);
                if (!columnasUsuarios.includes('estado')) {
                    this.db.exec("ALTER TABLE usuarios ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo'");
                    console.log('Migración: columna "estado" agregada a usuarios');
                }
                // El usuario ficticio "admin" pasa a ser el administrador
                // que gestiona las cuentas de bibliotecarios, si no lo era ya.
                this.db.prepare("UPDATE usuarios SET rol = 'administrador' WHERE usuario = 'admin' AND rol != 'administrador'").run();
            }

            // Migración aditiva: agregar "resultado" a auditoria si la base
            // es de antes de que se registrara éxito/fallo por operación.
            // Los registros viejos (sin esta columna) se completan con
            // 'exito' automáticamente, porque en su momento SÍ se
            // completaron correctamente (si no, ni existirían).
            const tieneAuditoria = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria'"
            ).get();
            if (tieneAuditoria) {
                const columnasAuditoria = this.db.prepare("PRAGMA table_info(auditoria)").all().map(c => c.name);
                if (!columnasAuditoria.includes('resultado')) {
                    this.db.exec("ALTER TABLE auditoria ADD COLUMN resultado TEXT NOT NULL DEFAULT 'exito'");
                    console.log('Migración: columna "resultado" agregada a auditoria (registros existentes marcados como éxito)');
                }
            }
        } catch (error) {
            console.error('Error al migrar esquema bibliográfico:', error);
        }
    }

    createTables() {
        try {
            // ----- USUARIOS (autenticación local/ficticia) -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS usuarios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario TEXT NOT NULL UNIQUE,
                    passwordHash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    nombre TEXT,
                    rol TEXT NOT NULL DEFAULT 'bibliotecario' CHECK (rol IN ('administrador','bibliotecario')),
                    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
                    fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- SOCIOS -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS socios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    apellido TEXT NOT NULL,
                    dni TEXT NOT NULL UNIQUE,
                    legajo TEXT,
                    tipoSocio TEXT NOT NULL CHECK (tipoSocio IN ('alumno','graduado','docente','no_docente')),
                    email TEXT NOT NULL UNIQUE,
                    telefono TEXT,
                    direccion TEXT,
                    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','sancionado')),
                    observaciones TEXT,
                    fechaRegistro DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- PERSONAS (autores / responsables intelectuales) -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS personas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    apellido TEXT,
                    fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- OBRAS -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS obras (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    isbn TEXT NOT NULL UNIQUE,
                    titulo TEXT NOT NULL,
                    subtitulo TEXT,
                    categoria TEXT,
                    editorial TEXT,
                    lugarPublicacion TEXT,
                    anioPublicacion INTEGER,
                    edicion TEXT,
                    idioma TEXT,
                    descripcion TEXT,
                    cabecera TEXT,
                    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
                    fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- OBRA_PERSONAS (autores/responsables con rol; una obra puede tener varios) -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS obra_personas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    obraId INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
                    personaId INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
                    rol TEXT NOT NULL DEFAULT 'autor' CHECK (rol IN ('autor','compilador','traductor','director','coordinador','otro')),
                    orden INTEGER NOT NULL DEFAULT 1,
                    UNIQUE (obraId, personaId, rol)
                )
            `);

            // ----- TOMOS (una obra puede tener varios; el ISBN vive en la obra, no acá) -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS tomos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    obraId INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
                    numero TEXT NOT NULL DEFAULT 'Único',
                    paginas TEXT,
                    anioPublicacion INTEGER,
                    descripcion TEXT,
                    UNIQUE (obraId, numero)
                )
            `);

            // ----- EJEMPLARES (unidad física individual) -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS ejemplares (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tomoId INTEGER NOT NULL REFERENCES tomos(id) ON DELETE RESTRICT,
                    numeroControl TEXT NOT NULL UNIQUE,
                    numeroInventario TEXT NOT NULL UNIQUE,
                    ubicacion TEXT,
                    estado TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible','prestado','reservado','en_reparacion','extraviado','baja')),
                    fechaAlta DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- PRESTAMOS -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS prestamos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ejemplarId INTEGER REFERENCES ejemplares(id) ON DELETE SET NULL,
                    socioId INTEGER REFERENCES socios(id) ON DELETE SET NULL,
                    usuarioId INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    fechaPrestamo DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fechaDevolucionPrevista DATETIME NOT NULL,
                    fechaDevolucionReal DATETIME,
                    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','devuelto','vencido')),
                    observaciones TEXT
                )
            `);

            // ----- RENOVACIONES -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS renovaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    prestamoId INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
                    usuarioId INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    fechaRenovacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fechaDevolucionAnterior DATETIME NOT NULL,
                    nuevaFechaDevolucion DATETIME NOT NULL
                )
            `);

            // ----- RESERVAS (sobre la obra, no un ejemplar puntual) -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS reservas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    obraId INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
                    socioId INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
                    ejemplarAsignadoId INTEGER REFERENCES ejemplares(id) ON DELETE SET NULL,
                    prioridad INTEGER NOT NULL,
                    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','atendida','cancelada','vencida')),
                    fechaReserva DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fechaAtencion DATETIME,
                    observaciones TEXT
                )
            `);

            // ----- SANCIONES -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS sanciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    socioId INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
                    usuarioId INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    motivo TEXT NOT NULL,
                    fechaInicio DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fechaFin DATETIME NOT NULL,
                    estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','finalizada')),
                    observaciones TEXT
                )
            `);

            // ----- AUDITORÍA -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS auditoria (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuarioId INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    accion TEXT NOT NULL,
                    modulo TEXT NOT NULL,
                    entidadId INTEGER,
                    detalle TEXT,
                    resultado TEXT NOT NULL DEFAULT 'exito' CHECK (resultado IN ('exito','fallo')),
                    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- INGRESOS A SALA -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS ingresos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    socioId INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
                    fechaHora DATETIME DEFAULT CURRENT_TIMESTAMP,
                    observaciones TEXT
                )
            `);

            // ----- DOCUMENTACIÓN INSTITUCIONAL -----
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS documentos_institucionales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    categoria TEXT NOT NULL,
                    rutaArchivo TEXT NOT NULL,
                    tipo TEXT NOT NULL CHECK (tipo IN ('pdf','doc','docx')),
                    descripcion TEXT,
                    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
                    usuarioId INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    fechaSubida DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ----- ÍNDICES -----
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);

                CREATE INDEX IF NOT EXISTS idx_socios_dni ON socios(dni);
                CREATE INDEX IF NOT EXISTS idx_socios_legajo ON socios(legajo);
                CREATE INDEX IF NOT EXISTS idx_socios_estado ON socios(estado);
                CREATE INDEX IF NOT EXISTS idx_socios_nombre ON socios(nombre, apellido);

                CREATE INDEX IF NOT EXISTS idx_personas_apellido ON personas(apellido);

                CREATE INDEX IF NOT EXISTS idx_obras_titulo ON obras(titulo);
                CREATE INDEX IF NOT EXISTS idx_obras_estado ON obras(estado);
                CREATE INDEX IF NOT EXISTS idx_obras_isbn ON obras(isbn);
                CREATE INDEX IF NOT EXISTS idx_obras_categoria ON obras(categoria);

                CREATE INDEX IF NOT EXISTS idx_obra_personas_obra ON obra_personas(obraId);
                CREATE INDEX IF NOT EXISTS idx_obra_personas_persona ON obra_personas(personaId);

                CREATE INDEX IF NOT EXISTS idx_tomos_obra ON tomos(obraId);

                CREATE INDEX IF NOT EXISTS idx_ejemplares_tomo ON ejemplares(tomoId);
                CREATE INDEX IF NOT EXISTS idx_ejemplares_estado ON ejemplares(estado);

                CREATE INDEX IF NOT EXISTS idx_prestamos_ejemplar ON prestamos(ejemplarId);
                CREATE INDEX IF NOT EXISTS idx_prestamos_socio ON prestamos(socioId);
                CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado);
                CREATE INDEX IF NOT EXISTS idx_prestamos_fechaDevolucionPrevista ON prestamos(fechaDevolucionPrevista);

                CREATE INDEX IF NOT EXISTS idx_renovaciones_prestamo ON renovaciones(prestamoId);

                CREATE INDEX IF NOT EXISTS idx_reservas_obra ON reservas(obraId);
                CREATE INDEX IF NOT EXISTS idx_reservas_socio ON reservas(socioId);
                CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado);

                CREATE INDEX IF NOT EXISTS idx_sanciones_socio ON sanciones(socioId);
                CREATE INDEX IF NOT EXISTS idx_sanciones_estado ON sanciones(estado);

                CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria(modulo);
                CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);

                CREATE INDEX IF NOT EXISTS idx_ingresos_socio ON ingresos(socioId);
                CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fechaHora);

                CREATE INDEX IF NOT EXISTS idx_documentos_categoria ON documentos_institucionales(categoria);
                CREATE INDEX IF NOT EXISTS idx_documentos_estado ON documentos_institucionales(estado);
            `);

            // Índice único para legajo (permite múltiples NULL, pero no
            // legajos repetidos entre sí). Va aparte del exec() de arriba
            // porque, si ya existen duplicados cargados de antes de esta
            // validación, no queremos que rompa el arranque de la app: se
            // avisa por consola y hay que corregir los duplicados a mano
            // (editando uno de los socios repetidos) para que el índice
            // se termine de crear en el siguiente arranque.
            try {
                this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_socios_legajo_unique ON socios(legajo)');
            } catch (error) {
                console.warn('======================================================================');
                console.warn('AVISO: no se pudo crear el índice único de "legajo" en socios porque ya');
                console.warn('existen legajos duplicados cargados. La validación en la aplicación ya');
                console.warn('bloquea nuevos duplicados, pero para que quede también protegido a nivel');
                console.warn('de base de datos hay que corregir manualmente los socios con legajo');
                console.warn('repetido (editando uno de los dos) y reiniciar la app.');
                console.warn('Detalle técnico:', error.message);
                console.warn('======================================================================');
            }

            console.log('Tablas creadas correctamente (esquema bibliográfico ampliado)');
        } catch (error) {
            console.error('Error al crear tablas:', error);
            throw error;
        }
    }

    // ===== AUDITORÍA (helper interno) =====
    // Registra quién hizo qué, cuándo y sobre qué módulo (RF-24). Un fallo
    // acá no debe frenar la operación principal, solo se loguea.
    registrarAuditoria(usuarioId, accion, modulo, entidadId = null, detalle = null, resultado = 'exito') {
        try {
            this.db.prepare(`
                INSERT INTO auditoria (usuarioId, accion, modulo, entidadId, detalle, resultado)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(usuarioId || null, accion, modulo, entidadId, detalle, resultado);
        } catch (error) {
            console.error('Error al registrar auditoría (no bloqueante):', error);
        }
    }

    async getAuditoria(filters = {}) {
        let query = `
            SELECT a.*, u.usuario as usuarioNombre
            FROM auditoria a
            LEFT JOIN usuarios u ON a.usuarioId = u.id
            WHERE 1=1
        `;
        const params = [];
        if (filters.modulo) { query += ' AND a.modulo = ?'; params.push(filters.modulo); }
        if (filters.usuarioId) { query += ' AND a.usuarioId = ?'; params.push(filters.usuarioId); }
        if (filters.fechaDesde) { query += ' AND a.fecha >= ?'; params.push(filters.fechaDesde); }
        if (filters.fechaHasta) { query += ' AND a.fecha <= ?'; params.push(filters.fechaHasta); }
        query += ' ORDER BY a.fecha DESC, a.id DESC';
        if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
        return this.db.prepare(query).all(...params);
    }

    // ===== USUARIOS / AUTENTICACIÓN =====

    seedDefaultUsuario() {
        try {
            const count = this.db.prepare('SELECT COUNT(*) as count FROM usuarios').get().count;
            if (count === 0) {
                this.createUsuarioSync({ usuario: 'admin', password: 'biblios2026', nombre: 'Administrador BibliOS (ficticio)', rol: 'administrador' });
                console.log('Usuario ficticio creado -> usuario: "admin" / contraseña: "biblios2026"');
            }
        } catch (error) {
            console.error('Error al crear usuario ficticio por defecto:', error);
        }
    }

    createUsuarioSync(usuarioData) {
        Validators.validateRequired(usuarioData.usuario, 'usuario');
        Validators.validateRequired(usuarioData.password, 'password');
        if (usuarioData.rol && !['administrador', 'bibliotecario'].includes(usuarioData.rol)) {
            throw new Error('El rol debe ser "administrador" o "bibliotecario"');
        }
        const existente = this.db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuarioData.usuario);
        if (existente) throw new Error(`Ya existe un usuario con el nombre "${usuarioData.usuario}".`);
        const salt = generateSalt();
        const passwordHash = hashPassword(usuarioData.password, salt);
        const result = this.db.prepare(`
            INSERT INTO usuarios (usuario, passwordHash, salt, nombre, rol) VALUES (?, ?, ?, ?, ?)
        `).run(usuarioData.usuario, passwordHash, salt, usuarioData.nombre || null, usuarioData.rol || 'bibliotecario');
        return this.getUsuarioById(result.lastInsertRowid);
    }

    async createUsuario(usuarioData) {
        try {
            const nuevo = this.createUsuarioSync(usuarioData);
            this.registrarAuditoria(usuarioData.usuarioCreadorId, 'crear', 'usuarios', nuevo.id, `Usuario "${nuevo.usuario}" creado con rol ${nuevo.rol}`);
            return nuevo;
        } catch (error) {
            this.registrarAuditoria(usuarioData.usuarioCreadorId, 'crear', 'usuarios', null, error.message, 'fallo');
            console.error('Error al crear usuario:', error);
            throw error;
        }
    }

    getUsuarioById(id) {
        return this.db.prepare('SELECT id, usuario, nombre, rol, estado, fechaCreacion FROM usuarios WHERE id = ?').get(id);
    }

    async login(usuario, password) {
        try {
            Validators.validateRequired(usuario, 'usuario');
            Validators.validateRequired(password, 'password');
            const row = this.db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
            if (!row) return { success: false, message: 'Usuario o contraseña incorrectos' };
            const hashedInput = hashPassword(password, row.salt);
            if (hashedInput !== row.passwordHash) return { success: false, message: 'Usuario o contraseña incorrectos' };
            if (row.estado !== 'activo') return { success: false, message: 'Este usuario está inactivo. Contactá al administrador del sistema.' };
            return { success: true, usuario: { id: row.id, usuario: row.usuario, nombre: row.nombre, rol: row.rol } };
        } catch (error) {
            console.error('Error durante el login:', error);
            throw error;
        }
    }

    // ===== GESTIÓN DE USUARIOS (solo accesible para rol "administrador" desde el frontend) =====

    async getUsuarios(filters = {}) {
        let query = 'SELECT id, usuario, nombre, rol, estado, fechaCreacion FROM usuarios WHERE 1=1';
        const params = [];
        if (filters.rol) { query += ' AND rol = ?'; params.push(filters.rol); }
        if (filters.estado) { query += ' AND estado = ?'; params.push(filters.estado); }
        query += ' ORDER BY usuario ASC';
        return this.db.prepare(query).all(...params);
    }

    // Activa/desactiva una cuenta. Protege contra dejar el sistema sin
    // ningún administrador activo (nadie podría volver a habilitar cuentas).
    async toggleEstadoUsuario(id, nuevoEstado, usuarioQueLoHace) {
        try {
            if (!['activo', 'inactivo'].includes(nuevoEstado)) {
                throw new Error('Estado inválido');
            }
            const usuario = this.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
            if (!usuario) throw new Error('Usuario no encontrado');

            if (id === usuarioQueLoHace && nuevoEstado === 'inactivo') {
                throw new Error('No podés desactivar tu propia cuenta mientras estás logueado con ella');
            }

            if (usuario.rol === 'administrador' && nuevoEstado === 'inactivo') {
                const otrosAdminsActivos = this.db.prepare(
                    "SELECT COUNT(*) as count FROM usuarios WHERE rol = 'administrador' AND estado = 'activo' AND id != ?"
                ).get(id).count;
                if (otrosAdminsActivos === 0) {
                    throw new Error('No se puede desactivar: es el único administrador activo del sistema');
                }
            }

            this.db.prepare('UPDATE usuarios SET estado = ? WHERE id = ?').run(nuevoEstado, id);
            this.registrarAuditoria(usuarioQueLoHace, nuevoEstado === 'activo' ? 'activar' : 'desactivar', 'usuarios', id, `Usuario "${usuario.usuario}" -> ${nuevoEstado}`);
            return true;
        } catch (error) {
            this.registrarAuditoria(usuarioQueLoHace, 'cambiar_estado', 'usuarios', id, error.message, 'fallo');
            console.error('Error al cambiar estado de usuario:', error);
            throw error;
        }
    }

    // ===== PERSONAS (autores / responsables) =====

    async getPersonas(filters = {}) {
        let query = 'SELECT * FROM personas WHERE 1=1';
        const params = [];
        if (filters.search) {
            query += ' AND (nombre LIKE ? OR apellido LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }
        query += ' ORDER BY apellido ASC, nombre ASC';
        return this.db.prepare(query).all(...params);
    }

    // ===== OBRAS (con autores, clasificaciones y tomo inicial) =====

    async createObra(obraData) {
        const transaction = this.db.transaction((data) => {
            Validators.validateRequired(data.titulo, 'titulo');
            Validators.validateRequired(data.isbn, 'isbn');
            if (!Validators.validateISBN(data.isbn)) {
                throw new Error('El ISBN proporcionado no es válido (debe ser ISBN-10 o ISBN-13)');
            }
            if (data.anioPublicacion && !Validators.validateYear(data.anioPublicacion)) {
                throw new Error('El año de publicación no es válido');
            }

            const isbnDuplicado = this.db.prepare('SELECT id FROM obras WHERE isbn = ?').get(data.isbn);
            if (isbnDuplicado) throw new Error(`Ya existe una obra registrada con el ISBN "${data.isbn}".`);

            const result = this.db.prepare(`
                INSERT INTO obras (isbn, titulo, subtitulo, categoria, editorial, lugarPublicacion, anioPublicacion, edicion, idioma, descripcion, cabecera)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                data.isbn, data.titulo, data.subtitulo || null, data.categoria || null, data.editorial || null,
                data.lugarPublicacion || null, data.anioPublicacion || null, data.edicion || null,
                data.idioma || null, data.descripcion || null, data.cabecera || null
            );
            const obraId = result.lastInsertRowid;

            // Personas responsables (autores, compiladores, traductores, etc.) - una obra puede tener varias
            const personas = data.personas || [];
            personas.forEach((p, idx) => {
                let personaId = p.personaId;
                if (!personaId) {
                    Validators.validateRequired(p.nombre, 'nombre de la persona responsable');
                    const existente = this.db.prepare(
                        'SELECT id FROM personas WHERE nombre = ? AND IFNULL(apellido,\'\') = IFNULL(?,\'\')'
                    ).get(p.nombre, p.apellido || null);
                    personaId = existente
                        ? existente.id
                        : this.db.prepare('INSERT INTO personas (nombre, apellido) VALUES (?, ?)').run(p.nombre, p.apellido || null).lastInsertRowid;
                }
                this.db.prepare(`
                    INSERT INTO obra_personas (obraId, personaId, rol, orden) VALUES (?, ?, ?, ?)
                `).run(obraId, personaId, p.rol || 'autor', idx + 1);
            });

            // Tomo inicial (una obra puede tener varios tomos; el ISBN ya quedó en la obra)
            const tomo = data.tomo || {};
            this.db.prepare(`
                INSERT INTO tomos (obraId, numero, paginas, anioPublicacion, descripcion)
                VALUES (?, ?, ?, ?, ?)
            `).run(obraId, tomo.numero || 'Único', tomo.paginas || null, tomo.anioPublicacion || data.anioPublicacion || null, tomo.descripcion || null);

            return obraId;
        });

        try {
            const obraId = transaction(obraData);
            this.registrarAuditoria(obraData.usuarioId, 'crear', 'obras', obraId, `Obra creada: ${obraData.titulo}`);
            return this.getObraById(obraId);
        } catch (error) {
            this.registrarAuditoria(obraData.usuarioId, 'crear', 'obras', null, error.message, 'fallo');
            console.error('Error al crear obra:', error);
            throw error;
        }
    }

    async getObras(filters = {}) {
        let query = `
            SELECT o.*,
                   (SELECT COUNT(*) FROM tomos t WHERE t.obraId = o.id) as cantidadTomos,
                   (SELECT COUNT(*) FROM ejemplares e JOIN tomos t2 ON e.tomoId = t2.id WHERE t2.obraId = o.id) as cantidadEjemplares,
                   (SELECT COUNT(*) FROM ejemplares e JOIN tomos t3 ON e.tomoId = t3.id WHERE t3.obraId = o.id AND e.estado = 'disponible') as ejemplaresDisponibles,
                   (SELECT GROUP_CONCAT(TRIM(p.nombre || ' ' || IFNULL(p.apellido, '')), ', ')
                      FROM obra_personas op JOIN personas p ON op.personaId = p.id
                      WHERE op.obraId = o.id) as autoresTexto
            FROM obras o
            WHERE 1=1
        `;
        const params = [];
        if (filters.search) {
            query += ` AND (
                o.titulo LIKE ? OR o.subtitulo LIKE ? OR o.isbn LIKE ? OR
                o.id IN (
                    SELECT op.obraId FROM obra_personas op JOIN personas p ON op.personaId = p.id
                    WHERE p.nombre LIKE ? OR p.apellido LIKE ?
                )
            )`;
            const s = `%${filters.search}%`;
            params.push(s, s, s, s, s);
        }
        if (filters.isbn) { query += ' AND o.isbn = ?'; params.push(filters.isbn); }
        if (filters.categoria) { query += ' AND o.categoria = ?'; params.push(filters.categoria); }
        if (filters.estado) { query += ' AND o.estado = ?'; params.push(filters.estado); }
        else { query += " AND o.estado != 'inactivo'"; } // por defecto no mostrar dadas de baja
        query += ' ORDER BY o.titulo ASC';
        if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
        return this.db.prepare(query).all(...params);
    }

    async getObraById(id) {
        const obra = this.db.prepare('SELECT * FROM obras WHERE id = ?').get(id);
        if (!obra) return null;

        obra.personas = this.db.prepare(`
            SELECT p.id, p.nombre, p.apellido, op.rol, op.orden
            FROM obra_personas op JOIN personas p ON op.personaId = p.id
            WHERE op.obraId = ? ORDER BY op.orden ASC
        `).all(id);

        obra.tomos = this.db.prepare('SELECT * FROM tomos WHERE obraId = ? ORDER BY numero ASC').all(id);
        obra.tomos.forEach(t => {
            t.ejemplares = this.db.prepare('SELECT * FROM ejemplares WHERE tomoId = ? ORDER BY numeroInventario ASC').all(t.id);
        });

        return obra;
    }

    // Nota: el ISBN NO es editable (queda fijo desde el alta), consistente
    // con el caso de uso "Modificar Obra" (campos no editables: ISBN, Fecha de Alta).
    async updateObra(id, updates) {
        try {
            const camposDirectos = ['titulo', 'subtitulo', 'categoria', 'editorial', 'lugarPublicacion', 'anioPublicacion', 'edicion', 'idioma', 'descripcion', 'cabecera'];
            const fields = [];
            const values = [];
            camposDirectos.forEach(key => {
                if (updates[key] !== undefined) { fields.push(`${key} = ?`); values.push(updates[key]); }
            });
            if (fields.length > 0) {
                values.push(id);
                this.db.prepare(`UPDATE obras SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            }

            if (updates.personas) {
                this.db.prepare('DELETE FROM obra_personas WHERE obraId = ?').run(id);
                updates.personas.forEach((p, idx) => {
                    let personaId = p.personaId;
                    if (!personaId) {
                        const existente = this.db.prepare(
                            'SELECT id FROM personas WHERE nombre = ? AND IFNULL(apellido,\'\') = IFNULL(?,\'\')'
                        ).get(p.nombre, p.apellido || null);
                        personaId = existente
                            ? existente.id
                            : this.db.prepare('INSERT INTO personas (nombre, apellido) VALUES (?, ?)').run(p.nombre, p.apellido || null).lastInsertRowid;
                    }
                    this.db.prepare('INSERT INTO obra_personas (obraId, personaId, rol, orden) VALUES (?, ?, ?, ?)').run(id, personaId, p.rol || 'autor', idx + 1);
                });
            }

            this.registrarAuditoria(updates.usuarioId, 'modificar', 'obras', id, 'Obra modificada');
            return true;
        } catch (error) {
            this.registrarAuditoria(updates.usuarioId, 'modificar', 'obras', id, error.message, 'fallo');
            console.error('Error al actualizar obra:', error);
            throw error;
        }
    }

    // Baja lógica: bloqueada si algún ejemplar de la obra tiene préstamos
    // activos o hay reservas pendientes (regla de negocio del CU "Dar de Baja Obra").
    async darDeBajaObra(id, usuarioId) {
        const transaction = this.db.transaction((id) => {
            const prestamosActivos = this.db.prepare(`
                SELECT COUNT(*) as count FROM prestamos p
                JOIN ejemplares e ON p.ejemplarId = e.id
                JOIN tomos t ON e.tomoId = t.id
                WHERE t.obraId = ? AND p.estado = 'activo'
            `).get(id).count;
            if (prestamosActivos > 0) {
                throw new Error(`No se puede dar de baja la obra: tiene ${prestamosActivos} préstamo(s) activo(s).`);
            }

            const reservasPendientes = this.db.prepare(
                "SELECT COUNT(*) as count FROM reservas WHERE obraId = ? AND estado = 'pendiente'"
            ).get(id).count;
            if (reservasPendientes > 0) {
                throw new Error(`No se puede dar de baja la obra: tiene ${reservasPendientes} reserva(s) pendiente(s).`);
            }

            const result = this.db.prepare("UPDATE obras SET estado = 'inactivo' WHERE id = ?").run(id);
            return result.changes > 0;
        });

        try {
            const ok = transaction(id);
            this.registrarAuditoria(usuarioId, 'baja', 'obras', id, 'Obra dada de baja');
            return ok;
        } catch (error) {
            this.registrarAuditoria(usuarioId, 'baja', 'obras', id, error.message, 'fallo');
            console.error('Error al dar de baja obra:', error);
            throw error;
        }
    }

    // ===== TOMOS =====

    async createTomo(tomoData) {
        try {
            Validators.validateRequired(tomoData.obraId, 'obraId');
            const result = this.db.prepare(`
                INSERT INTO tomos (obraId, numero, paginas, anioPublicacion, descripcion)
                VALUES (?, ?, ?, ?, ?)
            `).run(tomoData.obraId, tomoData.numero || 'Único', tomoData.paginas || null, tomoData.anioPublicacion || null, tomoData.descripcion || null);
            return this.db.prepare('SELECT * FROM tomos WHERE id = ?').get(result.lastInsertRowid);
        } catch (error) {
            console.error('Error al crear tomo:', error);
            throw error;
        }
    }

    async getTomosByObra(obraId) {
        return this.db.prepare('SELECT * FROM tomos WHERE obraId = ? ORDER BY numero ASC').all(obraId);
    }

    // ===== EJEMPLARES =====
    // numeroControl se autogenera (RF-19); numeroInventario lo carga el
    // bibliotecario a mano y debe ser único (RF-20).

    async createEjemplar(ejemplarData) {
        const transaction = this.db.transaction((data) => {
            Validators.validateRequired(data.tomoId, 'tomoId');
            Validators.validateRequired(data.numeroInventario, 'numeroInventario');

            const tomo = this.db.prepare('SELECT * FROM tomos WHERE id = ?').get(data.tomoId);
            if (!tomo) throw new Error('El tomo especificado no existe');

            const duplicado = this.db.prepare('SELECT id FROM ejemplares WHERE numeroInventario = ?').get(data.numeroInventario);
            if (duplicado) throw new Error(`El número de inventario manual "${data.numeroInventario}" ya existe.`);

            const result = this.db.prepare(`
                INSERT INTO ejemplares (tomoId, numeroControl, numeroInventario, ubicacion, estado)
                VALUES (?, 'TEMP', ?, ?, ?)
            `).run(data.tomoId, data.numeroInventario, data.ubicacion || null, data.estado || 'disponible');

            const numeroControl = `C-${String(result.lastInsertRowid).padStart(6, '0')}`;
            this.db.prepare('UPDATE ejemplares SET numeroControl = ? WHERE id = ?').run(numeroControl, result.lastInsertRowid);

            return result.lastInsertRowid;
        });

        try {
            const id = transaction(ejemplarData);
            this.registrarAuditoria(ejemplarData.usuarioId, 'crear', 'ejemplares', id, `Ejemplar creado (inventario: ${ejemplarData.numeroInventario})`);
            return this.getEjemplarById(id);
        } catch (error) {
            console.error('Error al crear ejemplar:', error);
            throw error;
        }
    }

    async getEjemplares(filters = {}) {
        let query = `
            SELECT ej.*, t.numero as tomoNumero, o.isbn, o.id as obraId, o.titulo as obraTitulo
            FROM ejemplares ej
            JOIN tomos t ON ej.tomoId = t.id
            JOIN obras o ON t.obraId = o.id
            WHERE 1=1
        `;
        const params = [];
        if (filters.tomoId) { query += ' AND ej.tomoId = ?'; params.push(filters.tomoId); }
        if (filters.obraId) { query += ' AND o.id = ?'; params.push(filters.obraId); }
        if (filters.estado) { query += ' AND ej.estado = ?'; params.push(filters.estado); }
        if (filters.search) {
            query += ' AND (ej.numeroInventario LIKE ? OR ej.numeroControl LIKE ? OR o.titulo LIKE ?)';
            const s = `%${filters.search}%`;
            params.push(s, s, s);
        }
        query += ' ORDER BY o.titulo ASC, t.numero ASC';
        return this.db.prepare(query).all(...params);
    }

    async getEjemplarById(id) {
        return this.db.prepare(`
            SELECT ej.*, t.numero as tomoNumero, o.isbn, o.id as obraId, o.titulo as obraTitulo
            FROM ejemplares ej
            JOIN tomos t ON ej.tomoId = t.id
            JOIN obras o ON t.obraId = o.id
            WHERE ej.id = ?
        `).get(id);
    }

    async updateEjemplar(id, updates) {
        try {
            const fields = [];
            const values = [];
            ['ubicacion', 'estado'].forEach(key => {
                if (updates[key] !== undefined) { fields.push(`${key} = ?`); values.push(updates[key]); }
            });
            if (fields.length === 0) return false;
            values.push(id);
            const result = this.db.prepare(`UPDATE ejemplares SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            this.registrarAuditoria(updates.usuarioId, 'modificar', 'ejemplares', id, `Estado actualizado: ${updates.estado || ''}`);
            return result.changes > 0;
        } catch (error) {
            console.error('Error al actualizar ejemplar:', error);
            throw error;
        }
    }

    // ===== SOCIOS =====

    async createSocio(socioData) {
        try {
            Validators.validateRequired(socioData.nombre, 'nombre');
            Validators.validateRequired(socioData.apellido, 'apellido');
            Validators.validateRequired(socioData.dni, 'dni');
            Validators.validateRequired(socioData.email, 'email');

            if (!Validators.validateDNI(socioData.dni)) throw new Error('El DNI proporcionado no es válido');
            if (!Validators.validateEmail(socioData.email)) throw new Error('El email proporcionado no es válido');
            if (socioData.telefono && !Validators.validatePhone(socioData.telefono)) throw new Error('El teléfono debe tener al menos 10 dígitos');
            if (!Validators.validateTipoSocio(socioData.tipoSocio)) throw new Error('El tipo de socio debe ser alumno, graduado, docente o no_docente');

            const dniDuplicado = this.db.prepare('SELECT id FROM socios WHERE dni = ?').get(socioData.dni);
            if (dniDuplicado) throw new Error(`Ya existe un socio registrado con el DNI "${socioData.dni}".`);

            const emailNormalizado = socioData.email.toLowerCase().trim();
            const emailDuplicado = this.db.prepare('SELECT id FROM socios WHERE LOWER(TRIM(email)) = ?').get(emailNormalizado);
            if (emailDuplicado) throw new Error(`Ya existe un socio con el email "${socioData.email}".`);

            if (socioData.legajo) {
                const legajoDuplicado = this.db.prepare('SELECT id FROM socios WHERE legajo = ?').get(socioData.legajo);
                if (legajoDuplicado) throw new Error(`Ya existe un socio con el legajo "${socioData.legajo}".`);
            }

            const result = this.db.prepare(`
                INSERT INTO socios (nombre, apellido, dni, legajo, tipoSocio, email, telefono, direccion, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                socioData.nombre, socioData.apellido, socioData.dni, socioData.legajo || null, socioData.tipoSocio,
                socioData.email, socioData.telefono || null, socioData.direccion || null, socioData.observaciones || null
            );

            this.registrarAuditoria(socioData.usuarioId, 'crear', 'socios', result.lastInsertRowid, `Socio registrado: ${socioData.nombre} ${socioData.apellido}`);
            return this.getSocioById(result.lastInsertRowid);
        } catch (error) {
            console.error('Error al crear socio:', error);
            throw error;
        }
    }

    async getSocios(filters = {}) {
        let query = 'SELECT * FROM socios WHERE 1=1';
        const params = [];
        if (filters.search) {
            query += ' AND (nombre LIKE ? OR apellido LIKE ? OR dni LIKE ? OR legajo LIKE ? OR email LIKE ?)';
            const s = `%${filters.search}%`;
            params.push(s, s, s, s, s);
        }
        if (filters.tipoSocio) { query += ' AND tipoSocio = ?'; params.push(filters.tipoSocio); }
        if (filters.estado) { query += ' AND estado = ?'; params.push(filters.estado); }
        query += ' ORDER BY apellido ASC, nombre ASC';
        if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
        return this.db.prepare(query).all(...params);
    }

    async getSocioById(id) {
        return this.db.prepare('SELECT * FROM socios WHERE id = ?').get(id);
    }

    async updateSocio(id, updates) {
        try {
            if (updates.email !== undefined) {
                if (!Validators.validateEmail(updates.email)) throw new Error('El email proporcionado no es válido');
                const emailNormalizado = updates.email.toLowerCase().trim();
                const existente = this.db.prepare('SELECT id FROM socios WHERE LOWER(TRIM(email)) = ? AND id != ?').get(emailNormalizado, id);
                if (existente) throw new Error(`Ya existe un socio con el email "${updates.email}".`);
            }
            if (updates.dni !== undefined) {
                const existente = this.db.prepare('SELECT id FROM socios WHERE dni = ? AND id != ?').get(updates.dni, id);
                if (existente) throw new Error(`Ya existe un socio con el DNI "${updates.dni}".`);
            }
            if (updates.legajo) {
                const existente = this.db.prepare('SELECT id FROM socios WHERE legajo = ? AND id != ?').get(updates.legajo, id);
                if (existente) throw new Error(`Ya existe un socio con el legajo "${updates.legajo}".`);
            }
            if (updates.tipoSocio !== undefined && !Validators.validateTipoSocio(updates.tipoSocio)) {
                throw new Error('El tipo de socio debe ser alumno, graduado, docente o no_docente');
            }

            const camposPermitidos = ['nombre', 'apellido', 'dni', 'legajo', 'tipoSocio', 'email', 'telefono', 'direccion', 'estado', 'observaciones'];
            const fields = [];
            const values = [];
            camposPermitidos.forEach(key => {
                if (updates[key] !== undefined) { fields.push(`${key} = ?`); values.push(updates[key]); }
            });
            if (fields.length === 0) return false;
            values.push(id);
            const result = this.db.prepare(`UPDATE socios SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            this.registrarAuditoria(updates.usuarioId, 'modificar', 'socios', id, 'Socio modificado');
            return result.changes > 0;
        } catch (error) {
            console.error('Error al actualizar socio:', error);
            throw error;
        }
    }

    // Baja lógica: bloqueada si el socio tiene préstamos vigentes o sanciones
    // vigentes (CU "Dar de Baja Socio").
    async darDeBajaSocio(id, usuarioId) {
        const transaction = this.db.transaction((id) => {
            const prestamosActivos = this.db.prepare("SELECT COUNT(*) as count FROM prestamos WHERE socioId = ? AND estado = 'activo'").get(id).count;
            if (prestamosActivos > 0) throw new Error(`No se puede dar de baja: el socio tiene ${prestamosActivos} préstamo(s) activo(s).`);

            const sancionesVigentes = this.db.prepare("SELECT COUNT(*) as count FROM sanciones WHERE socioId = ? AND estado = 'vigente'").get(id).count;
            if (sancionesVigentes > 0) throw new Error('No se puede dar de baja: el socio tiene sanciones vigentes.');

            const result = this.db.prepare("UPDATE socios SET estado = 'inactivo' WHERE id = ?").run(id);
            return result.changes > 0;
        });

        try {
            const ok = transaction(id);
            this.registrarAuditoria(usuarioId, 'baja', 'socios', id, 'Socio dado de baja');
            return ok;
        } catch (error) {
            this.registrarAuditoria(usuarioId, 'baja', 'socios', id, error.message, 'fallo');
            console.error('Error al dar de baja socio:', error);
            throw error;
        }
    }

    // ===== SANCIONES =====

    async aplicarSancion(sancionData) {
        const transaction = this.db.transaction((data) => {
            Validators.validateRequired(data.socioId, 'socioId');
            Validators.validateRequired(data.motivo, 'motivo');
            Validators.validateRequired(data.fechaFin, 'fechaFin');

            if (new Date(data.fechaFin) <= new Date()) {
                throw new Error('La fecha de fin de la sanción debe ser posterior a la fecha actual');
            }

            const socio = this.db.prepare('SELECT * FROM socios WHERE id = ?').get(data.socioId);
            if (!socio) throw new Error('El socio especificado no existe');

            const result = this.db.prepare(`
                INSERT INTO sanciones (socioId, usuarioId, motivo, fechaFin, observaciones)
                VALUES (?, ?, ?, ?, ?)
            `).run(data.socioId, data.usuarioId || null, data.motivo, data.fechaFin, data.observaciones || null);

            this.db.prepare("UPDATE socios SET estado = 'sancionado' WHERE id = ?").run(data.socioId);

            return result.lastInsertRowid;
        });

        try {
            const id = transaction(sancionData);
            this.registrarAuditoria(sancionData.usuarioId, 'crear', 'sanciones', id, `Sanción aplicada a socio ${sancionData.socioId}: ${sancionData.motivo}`);
            return this.db.prepare('SELECT * FROM sanciones WHERE id = ?').get(id);
        } catch (error) {
            this.registrarAuditoria(sancionData.usuarioId, 'crear', 'sanciones', null, error.message, 'fallo');
            console.error('Error al aplicar sanción:', error);
            throw error;
        }
    }

    // Finaliza una sanción manualmente. Si el socio no tiene otras sanciones
    // vigentes, vuelve a estado 'activo' (no hay proceso automático sin
    // intervención del bibliotecario, según el alcance definido).
    async finalizarSancion(id, usuarioId) {
        const transaction = this.db.transaction((id) => {
            const sancion = this.db.prepare('SELECT * FROM sanciones WHERE id = ?').get(id);
            if (!sancion) throw new Error('Sanción no encontrada');

            this.db.prepare("UPDATE sanciones SET estado = 'finalizada' WHERE id = ?").run(id);

            const otrasVigentes = this.db.prepare(
                "SELECT COUNT(*) as count FROM sanciones WHERE socioId = ? AND estado = 'vigente' AND id != ?"
            ).get(sancion.socioId, id).count;

            if (otrasVigentes === 0) {
                this.db.prepare("UPDATE socios SET estado = 'activo' WHERE id = ? AND estado = 'sancionado'").run(sancion.socioId);
            }
            return true;
        });

        try {
            const ok = transaction(id);
            this.registrarAuditoria(usuarioId, 'finalizar', 'sanciones', id, 'Sanción finalizada manualmente');
            return ok;
        } catch (error) {
            console.error('Error al finalizar sanción:', error);
            throw error;
        }
    }

    async getSancionesBySocio(socioId) {
        return this.db.prepare('SELECT * FROM sanciones WHERE socioId = ? ORDER BY fechaInicio DESC, id DESC').all(socioId);
    }

    // Chequea si el socio tiene una sanción vigente (por estado Y por fecha,
    // para no depender de que alguien la haya finalizado a mano).
    tieneSancionVigente(socioId) {
        const sancion = this.db.prepare(`
            SELECT id FROM sanciones
            WHERE socioId = ? AND estado = 'vigente' AND fechaFin > CURRENT_TIMESTAMP
        `).get(socioId);
        return !!sancion;
    }

    // ===== PRÉSTAMOS =====

    async createPrestamo(prestamoData) {
        const transaction = this.db.transaction((data) => {
            Validators.validateRequired(data.ejemplarId, 'ejemplarId');
            Validators.validateRequired(data.socioId, 'socioId');

            const socio = this.db.prepare('SELECT * FROM socios WHERE id = ?').get(data.socioId);
            if (!socio) throw new Error('El socio especificado no existe');
            if (socio.estado === 'sancionado' || this.tieneSancionVigente(data.socioId)) {
                throw new Error('El socio posee una sanción vigente y no puede retirar material en préstamo');
            }
            if (socio.estado !== 'activo') throw new Error('El socio no está en estado activo');

            const ejemplar = this.db.prepare('SELECT * FROM ejemplares WHERE id = ?').get(data.ejemplarId);
            if (!ejemplar) throw new Error('El ejemplar especificado no existe');

            let reservaACerrar = null;
            if (ejemplar.estado !== 'disponible') {
                // Único caso permitido: el ejemplar está "reservado" y coincide
                // exactamente con la reserva pendiente de este socio (viene del
                // flujo "entregar reserva"). Cualquier otro estado, o una
                // reserva que no sea de este socio, sigue bloqueado.
                reservaACerrar = ejemplar.estado === 'reservado'
                    ? this.db.prepare(`
                        SELECT id FROM reservas
                        WHERE ejemplarAsignadoId = ? AND socioId = ? AND estado = 'pendiente'
                    `).get(data.ejemplarId, data.socioId)
                    : null;

                if (!reservaACerrar) {
                    throw new Error(`El ejemplar no está disponible (estado actual: ${ejemplar.estado})`);
                }
            }

            const fechaDevolucionPrevista = data.fechaDevolucionPrevista || (() => {
                const f = new Date();
                f.setDate(f.getDate() + 14);
                return f.toISOString();
            })();

            const result = this.db.prepare(`
                INSERT INTO prestamos (ejemplarId, socioId, usuarioId, fechaDevolucionPrevista, observaciones)
                VALUES (?, ?, ?, ?, ?)
            `).run(data.ejemplarId, data.socioId, data.usuarioId || null, fechaDevolucionPrevista, data.observaciones || null);

            this.db.prepare("UPDATE ejemplares SET estado = 'prestado' WHERE id = ?").run(data.ejemplarId);

            if (reservaACerrar) {
                this.db.prepare("UPDATE reservas SET estado = 'atendida', fechaAtencion = CURRENT_TIMESTAMP WHERE id = ?").run(reservaACerrar.id);
            }

            return result.lastInsertRowid;
        });

        try {
            const id = transaction(prestamoData);
            this.registrarAuditoria(prestamoData.usuarioId, 'crear', 'prestamos', id, `Préstamo registrado (ejemplar ${prestamoData.ejemplarId}, socio ${prestamoData.socioId})`);
            return this.getPrestamoById(id);
        } catch (error) {
            this.registrarAuditoria(prestamoData.usuarioId, 'crear', 'prestamos', null, error.message, 'fallo');
            console.error('Error al crear préstamo:', error);
            throw error;
        }
    }

    async getPrestamos(filters = {}) {
        let query = `
            SELECT p.*,
                   o.titulo as obraTitulo, ej.numeroInventario, ej.numeroControl,
                   s.nombre as socioNombre, s.apellido as socioApellido, s.dni as socioDni
            FROM prestamos p
            LEFT JOIN ejemplares ej ON p.ejemplarId = ej.id
            LEFT JOIN tomos t ON ej.tomoId = t.id
            LEFT JOIN obras o ON t.obraId = o.id
            LEFT JOIN socios s ON p.socioId = s.id
            WHERE 1=1
        `;
        const params = [];
        if (filters.estado) { query += ' AND p.estado = ?'; params.push(filters.estado); }
        if (filters.socioId) { query += ' AND p.socioId = ?'; params.push(filters.socioId); }
        if (filters.fechaDesde) { query += ' AND p.fechaPrestamo >= ?'; params.push(filters.fechaDesde); }
        if (filters.fechaHasta) { query += ' AND p.fechaPrestamo <= ?'; params.push(filters.fechaHasta); }
        query += ' ORDER BY p.fechaPrestamo DESC, p.id DESC';
        return this.db.prepare(query).all(...params);
    }

    async getPrestamoById(id) {
        return this.db.prepare(`
            SELECT p.*, o.titulo as obraTitulo, ej.numeroInventario, s.nombre as socioNombre, s.apellido as socioApellido
            FROM prestamos p
            LEFT JOIN ejemplares ej ON p.ejemplarId = ej.id
            LEFT JOIN tomos t ON ej.tomoId = t.id
            LEFT JOIN obras o ON t.obraId = o.id
            LEFT JOIN socios s ON p.socioId = s.id
            WHERE p.id = ?
        `).get(id);
    }

    // Devuelve el ejemplar. Si hay una reserva pendiente para esa obra, el
    // ejemplar queda en estado 'reservado' en vez de 'disponible' (CU
    // Registrar Devolución, Esc. Alternativo 6.a).
    async devolverLibro(prestamoId, usuarioId) {
        const transaction = this.db.transaction((prestamoId) => {
            const prestamo = this.db.prepare('SELECT * FROM prestamos WHERE id = ?').get(prestamoId);
            if (!prestamo) throw new Error('Préstamo no encontrado');
            if (prestamo.estado === 'devuelto') throw new Error('El préstamo ya está devuelto');

            const conMora = new Date(prestamo.fechaDevolucionPrevista) < new Date();

            this.db.prepare("UPDATE prestamos SET estado = 'devuelto', fechaDevolucionReal = CURRENT_TIMESTAMP WHERE id = ?").run(prestamoId);

            let reservaAtendida = null;
            if (prestamo.ejemplarId) {
                const ejemplar = this.db.prepare(`
                    SELECT ej.*, t.obraId FROM ejemplares ej JOIN tomos t ON ej.tomoId = t.id WHERE ej.id = ?
                `).get(prestamo.ejemplarId);

                // IMPORTANTE: excluir reservas que YA tienen un ejemplar
                // asignado (ejemplarAsignadoId IS NOT NULL). Sin este filtro,
                // si se devuelven 2 ejemplares de una obra con 1 sola reserva
                // pendiente, la misma reserva se reasigna dos veces y los 2
                // ejemplares quedan "reservado" en vez de 1 solo.
                const reservaPendiente = ejemplar ? this.db.prepare(`
                    SELECT * FROM reservas
                    WHERE obraId = ? AND estado = 'pendiente' AND ejemplarAsignadoId IS NULL
                    ORDER BY prioridad ASC LIMIT 1
                `).get(ejemplar.obraId) : null;

                if (reservaPendiente) {
                    this.db.prepare("UPDATE ejemplares SET estado = 'reservado' WHERE id = ?").run(prestamo.ejemplarId);
                    this.db.prepare('UPDATE reservas SET ejemplarAsignadoId = ? WHERE id = ?').run(prestamo.ejemplarId, reservaPendiente.id);
                    reservaAtendida = reservaPendiente;
                } else {
                    this.db.prepare("UPDATE ejemplares SET estado = 'disponible' WHERE id = ?").run(prestamo.ejemplarId);
                }
            }

            return { conMora, reservaAtendida };
        });

        try {
            const resultado = transaction(prestamoId);
            this.registrarAuditoria(usuarioId, 'devolucion', 'prestamos', prestamoId, resultado.conMora ? 'Devolución con mora' : 'Devolución en término');
            return resultado;
        } catch (error) {
            this.registrarAuditoria(usuarioId, 'devolucion', 'prestamos', prestamoId, error.message, 'fallo');
            console.error('Error al devolver libro:', error);
            throw error;
        }
    }

    // Renueva 7 días adicionales. Bloquea si: préstamo vencido, socio con
    // sanción vigente, o reserva pendiente sobre la misma obra (RF-04/RF-05).
    async renovarPrestamo(prestamoId, usuarioId) {
        const transaction = this.db.transaction((prestamoId) => {
            const prestamo = this.db.prepare('SELECT * FROM prestamos WHERE id = ?').get(prestamoId);
            if (!prestamo) throw new Error('Préstamo no encontrado');
            if (prestamo.estado !== 'activo') throw new Error('Solo se pueden renovar préstamos activos');
            if (new Date(prestamo.fechaDevolucionPrevista) < new Date()) throw new Error('El préstamo está vencido, no se puede renovar');

            if (this.tieneSancionVigente(prestamo.socioId)) {
                throw new Error('El socio posee una sanción vigente, no se puede renovar el préstamo');
            }

            if (prestamo.ejemplarId) {
                const ejemplar = this.db.prepare(`
                    SELECT ej.*, t.obraId FROM ejemplares ej JOIN tomos t ON ej.tomoId = t.id WHERE ej.id = ?
                `).get(prestamo.ejemplarId);
                if (ejemplar) {
                    const reservaPendiente = this.db.prepare(
                        "SELECT id FROM reservas WHERE obraId = ? AND estado = 'pendiente' LIMIT 1"
                    ).get(ejemplar.obraId);
                    if (reservaPendiente) throw new Error('Existe una reserva pendiente sobre esta obra, no se puede renovar');
                }
            }

            const fechaAnterior = prestamo.fechaDevolucionPrevista;
            const nuevaFecha = new Date(fechaAnterior);
            nuevaFecha.setDate(nuevaFecha.getDate() + 7);
            const nuevaFechaISO = nuevaFecha.toISOString();

            this.db.prepare('UPDATE prestamos SET fechaDevolucionPrevista = ? WHERE id = ?').run(nuevaFechaISO, prestamoId);
            this.db.prepare(`
                INSERT INTO renovaciones (prestamoId, usuarioId, fechaDevolucionAnterior, nuevaFechaDevolucion)
                VALUES (?, ?, ?, ?)
            `).run(prestamoId, usuarioId || null, fechaAnterior, nuevaFechaISO);

            return nuevaFechaISO;
        });

        try {
            const nuevaFecha = transaction(prestamoId);
            this.registrarAuditoria(usuarioId, 'renovar', 'prestamos', prestamoId, `Renovado hasta ${nuevaFecha}`);
            return this.getPrestamoById(prestamoId);
        } catch (error) {
            this.registrarAuditoria(usuarioId, 'renovar', 'prestamos', prestamoId, error.message, 'fallo');
            console.error('Error al renovar préstamo:', error);
            throw error;
        }
    }

    // Marca como vencidos los préstamos activos cuya fecha prevista ya pasó.
    // Se llama bajo demanda (al abrir el módulo de préstamos), no hay cron.
    async actualizarPrestamosVencidos() {
        const result = this.db.prepare(`
            UPDATE prestamos SET estado = 'vencido'
            WHERE estado = 'activo' AND fechaDevolucionPrevista < CURRENT_TIMESTAMP
        `).run();
        return result.changes;
    }

    // ===== RESERVAS =====

    async createReserva(reservaData) {
        const transaction = this.db.transaction((data) => {
            Validators.validateRequired(data.obraId, 'obraId');
            Validators.validateRequired(data.socioId, 'socioId');

            const socio = this.db.prepare('SELECT * FROM socios WHERE id = ?').get(data.socioId);
            if (!socio) throw new Error('El socio especificado no existe');
            if (socio.estado !== 'activo') throw new Error('El socio debe estar activo para reservar');
            if (this.tieneSancionVigente(data.socioId)) throw new Error('El socio posee una sanción vigente y no puede registrar reservas');

            const reservaExistente = this.db.prepare(
                "SELECT id FROM reservas WHERE obraId = ? AND socioId = ? AND estado = 'pendiente'"
            ).get(data.obraId, data.socioId);
            if (reservaExistente) throw new Error('El socio ya tiene una reserva pendiente para esta obra');

            const ejemplarDisponible = this.db.prepare(`
                SELECT ej.id FROM ejemplares ej JOIN tomos t ON ej.tomoId = t.id
                WHERE t.obraId = ? AND ej.estado = 'disponible' LIMIT 1
            `).get(data.obraId);
            if (ejemplarDisponible) {
                throw new Error('La obra tiene ejemplares disponibles: registrá un préstamo directo en vez de una reserva');
            }

            const maxPrioridad = this.db.prepare(
                "SELECT COALESCE(MAX(prioridad), 0) as max FROM reservas WHERE obraId = ? AND estado = 'pendiente'"
            ).get(data.obraId).max;

            const result = this.db.prepare(`
                INSERT INTO reservas (obraId, socioId, prioridad, observaciones)
                VALUES (?, ?, ?, ?)
            `).run(data.obraId, data.socioId, maxPrioridad + 1, data.observaciones || null);

            return result.lastInsertRowid;
        });

        try {
            const id = transaction(reservaData);
            this.registrarAuditoria(reservaData.usuarioId, 'crear', 'reservas', id, `Reserva registrada (obra ${reservaData.obraId}, socio ${reservaData.socioId})`);
            return this.db.prepare('SELECT * FROM reservas WHERE id = ?').get(id);
        } catch (error) {
            console.error('Error al crear reserva:', error);
            throw error;
        }
    }

    async getReservas(filters = {}) {
        let query = `
            SELECT r.*, o.titulo as obraTitulo, s.nombre as socioNombre, s.apellido as socioApellido
            FROM reservas r
            JOIN obras o ON r.obraId = o.id
            JOIN socios s ON r.socioId = s.id
            WHERE 1=1
        `;
        const params = [];
        if (filters.estado) { query += ' AND r.estado = ?'; params.push(filters.estado); }
        if (filters.obraId) { query += ' AND r.obraId = ?'; params.push(filters.obraId); }
        if (filters.socioId) { query += ' AND r.socioId = ?'; params.push(filters.socioId); }
        query += ' ORDER BY r.prioridad ASC';
        return this.db.prepare(query).all(...params);
    }

    async cancelarReserva(id, usuarioId) {
        const result = this.db.prepare("UPDATE reservas SET estado = 'cancelada' WHERE id = ?").run(id);
        this.registrarAuditoria(usuarioId, 'cancelar', 'reservas', id, 'Reserva cancelada');
        return result.changes > 0;
    }

    // Marca la reserva como atendida (el socio retiró el ejemplar apartado).
    async atenderReserva(id, usuarioId) {
        const result = this.db.prepare(
            "UPDATE reservas SET estado = 'atendida', fechaAtencion = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(id);
        this.registrarAuditoria(usuarioId, 'atender', 'reservas', id, 'Reserva atendida');
        return result.changes > 0;
    }

    // ===== INGRESOS A SALA =====

    async registrarIngreso(ingresoData) {
        try {
            Validators.validateRequired(ingresoData.socioId, 'socioId');
            const result = this.db.prepare(`
                INSERT INTO ingresos (socioId, observaciones) VALUES (?, ?)
            `).run(ingresoData.socioId, ingresoData.observaciones || null);
            return this.db.prepare('SELECT * FROM ingresos WHERE id = ?').get(result.lastInsertRowid);
        } catch (error) {
            console.error('Error al registrar ingreso:', error);
            throw error;
        }
    }

    async getIngresos(filters = {}) {
        let query = `
            SELECT i.*, s.nombre as socioNombre, s.apellido as socioApellido, s.dni as socioDni
            FROM ingresos i JOIN socios s ON i.socioId = s.id WHERE 1=1
        `;
        const params = [];
        if (filters.socioId) { query += ' AND i.socioId = ?'; params.push(filters.socioId); }
        if (filters.fechaDesde) { query += ' AND i.fechaHora >= ?'; params.push(filters.fechaDesde); }
        if (filters.fechaHasta) { query += ' AND i.fechaHora <= ?'; params.push(filters.fechaHasta); }
        query += ' ORDER BY i.fechaHora DESC, i.id DESC';
        return this.db.prepare(query).all(...params);
    }

    // ===== DOCUMENTACIÓN INSTITUCIONAL =====

    async subirDocumento(docData) {
        try {
            Validators.validateRequired(docData.nombre, 'nombre');
            Validators.validateRequired(docData.categoria, 'categoria');
            Validators.validateRequired(docData.rutaArchivo, 'rutaArchivo');
            if (!['pdf', 'doc', 'docx'].includes(docData.tipo)) throw new Error('Formato de archivo no válido (debe ser pdf, doc o docx)');

            const result = this.db.prepare(`
                INSERT INTO documentos_institucionales (nombre, categoria, rutaArchivo, tipo, descripcion, usuarioId)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(docData.nombre, docData.categoria, docData.rutaArchivo, docData.tipo, docData.descripcion || null, docData.usuarioId || null);

            this.registrarAuditoria(docData.usuarioId, 'crear', 'documentos', result.lastInsertRowid, `Documento subido: ${docData.nombre}`);
            return this.db.prepare('SELECT * FROM documentos_institucionales WHERE id = ?').get(result.lastInsertRowid);
        } catch (error) {
            console.error('Error al subir documento:', error);
            throw error;
        }
    }

    async getDocumentos(filters = {}) {
        let query = 'SELECT * FROM documentos_institucionales WHERE 1=1';
        const params = [];
        if (filters.categoria) { query += ' AND categoria = ?'; params.push(filters.categoria); }
        if (filters.estado) { query += ' AND estado = ?'; params.push(filters.estado); }
        else { query += " AND estado = 'activo'"; }
        query += ' ORDER BY fechaSubida DESC, id DESC';
        return this.db.prepare(query).all(...params);
    }

    async darDeBajaDocumento(id, usuarioId) {
        const result = this.db.prepare("UPDATE documentos_institucionales SET estado = 'inactivo' WHERE id = ?").run(id);
        this.registrarAuditoria(usuarioId, 'baja', 'documentos', id, 'Documento dado de baja');
        return result.changes > 0;
    }

    // ===== ESTADÍSTICAS =====

    async getStats() {
        try {
            const stmt = this.db.prepare(`
                SELECT 'obras' as tipo, COUNT(*) as count FROM obras WHERE estado = 'activo'
                UNION ALL
                SELECT 'ejemplares', COUNT(*) FROM ejemplares
                UNION ALL
                SELECT 'ejemplares_disponibles', COUNT(*) FROM ejemplares WHERE estado = 'disponible'
                UNION ALL
                SELECT 'socios', COUNT(*) FROM socios WHERE estado != 'inactivo'
                UNION ALL
                SELECT 'prestamos_activos', COUNT(*) FROM prestamos WHERE estado = 'activo'
                UNION ALL
                SELECT 'prestamos_vencidos', COUNT(*) FROM prestamos WHERE estado = 'activo' AND fechaDevolucionPrevista < CURRENT_TIMESTAMP
                UNION ALL
                SELECT 'prestamos_devueltos', COUNT(*) FROM prestamos WHERE estado = 'devuelto'
                UNION ALL
                SELECT 'reservas_pendientes', COUNT(*) FROM reservas WHERE estado = 'pendiente'
                UNION ALL
                SELECT 'sanciones_vigentes', COUNT(*) FROM sanciones WHERE estado = 'vigente'
            `);
            const stats = {};
            stmt.all().forEach(row => {
                const map = {
                    obras: 'totalObras', ejemplares: 'totalEjemplares', ejemplares_disponibles: 'ejemplaresDisponibles',
                    socios: 'totalSocios', prestamos_activos: 'prestamosActivos', prestamos_vencidos: 'prestamosVencidos',
                    prestamos_devueltos: 'prestamosDevueltos', reservas_pendientes: 'reservasPendientes', sanciones_vigentes: 'sancionesVigentes'
                };
                stats[map[row.tipo]] = row.count;
            });
            return stats;
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            throw error;
        }
    }

    async getPrestamosPorMes(meses = 6) {
        return this.db.prepare(`
            SELECT strftime('%Y-%m', fechaPrestamo) as mes,
                   COUNT(*) as prestamos,
                   SUM(CASE WHEN estado = 'devuelto' THEN 1 ELSE 0 END) as devoluciones
            FROM prestamos
            WHERE fechaPrestamo >= date('now', '-' || ? || ' months')
            GROUP BY strftime('%Y-%m', fechaPrestamo) ORDER BY mes ASC
        `).all(meses);
    }

    async getObrasPorCategoria() {
        return this.db.prepare(`
            SELECT COALESCE(categoria, 'Sin categoría') as categoria, COUNT(*) as cantidad
            FROM obras WHERE estado != 'inactivo' GROUP BY categoria ORDER BY cantidad DESC
        `).all();
    }

    async getSociosPorMes(meses = 6) {
        const resultados = this.db.prepare(`
            SELECT strftime('%Y-%m', fechaRegistro) as mes, COUNT(*) as sociosNuevos
            FROM socios WHERE fechaRegistro >= date('now', '-' || ? || ' months')
            GROUP BY strftime('%Y-%m', fechaRegistro) ORDER BY mes ASC
        `).all(meses);
        let total = 0;
        return resultados.map(r => { total += r.sociosNuevos; return { ...r, totalAcumulado: total }; });
    }

    // ===== UTILIDADES =====

    async close() {
        if (this.db) { this.db.close(); console.log('Base de datos cerrada correctamente'); }
    }

    async backup(destinationPath) {
        try {
            require('fs').copyFileSync(this.dbPath, destinationPath);
            return true;
        } catch (error) {
            console.error('Error al hacer backup:', error);
            return false;
        }
    }

    getDatabaseInfo() {
        return { type: 'sqlite', path: this.dbPath, dialect: 'sqlite' };
    }

    // ===== DATOS FICTICIOS DE DEMOSTRACIÓN =====
    async insertSampleData() {
        try {
            const obrasFicticias = [
                { isbn: '978-1234567891', titulo: 'Estructuras de Datos y Algoritmos', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2021, idioma: 'Español', personas: [{ nombre: 'Laura', apellido: 'Fernández', rol: 'autor' }] },
                { isbn: '978-1234567892', titulo: 'Bases de Datos Relacionales', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2022, idioma: 'Español', personas: [{ nombre: 'Roberto', apellido: 'Sánchez', rol: 'autor' }] },
                { isbn: '978-1234567893', titulo: 'Matemática Discreta', categoria: 'Matemática', editorial: 'UTN Press', anioPublicacion: 2019, idioma: 'Español', personas: [{ nombre: 'Ana', apellido: 'García', rol: 'autor' }] },
                { isbn: '978-1234567894', titulo: 'Álgebra Lineal', categoria: 'Matemática', editorial: 'UTN Press', anioPublicacion: 2020, idioma: 'Español', personas: [{ nombre: 'Miguel', apellido: 'Torres', rol: 'autor' }] },
                { isbn: '978-1234567898', titulo: 'Redes de Computadoras', subtitulo: 'Protocolos y arquitecturas', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2022, idioma: 'Español', personas: [{ nombre: 'Fernando', apellido: 'Morales', rol: 'autor' }, { nombre: 'Julián', apellido: 'Ibáñez', rol: 'compilador' }] },
                { isbn: '978-1234567899', titulo: 'Ingeniería de Software', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2021, idioma: 'Español', personas: [{ nombre: 'Silvia', apellido: 'Ramírez', rol: 'autor' }] },
                { isbn: '978-1234567900', titulo: 'Inteligencia Artificial', subtitulo: 'Fundamentos de Machine Learning', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2023, idioma: 'Español', personas: [{ nombre: 'Luis', apellido: 'Herrera', rol: 'autor' }] },
                { isbn: '978-1234567897', titulo: 'Física II', subtitulo: 'Electricidad y magnetismo', categoria: 'Física', editorial: 'UTN Press', anioPublicacion: 2020, idioma: 'Español', personas: [{ nombre: 'Carmen', apellido: 'Díaz', rol: 'autor' }] },
            ];


            const obrasCreadas = [];
            for (const obraData of obrasFicticias) {
                try {
                    const obra = await this.createObra(obraData);
                    obrasCreadas.push(obra);
                    // 2 a 4 ejemplares por obra
                    const cantidad = 2 + Math.floor(Math.random() * 3);
                    for (let i = 0; i < cantidad; i++) {
                        await this.createEjemplar({
                            tomoId: obra.tomos[0].id,
                            numeroInventario: `INV-${obra.id}-${i + 1}`,
                            ubicacion: `Estante ${String.fromCharCode(65 + (obra.id % 6))}-${(obra.id % 5) + 1}`
                        });
                    }
                } catch (error) {
                    console.error('Error al insertar obra ficticia:', obraData.titulo, error.message);
                }
            }

            const sociosFicticios = [
                { nombre: 'Juan', apellido: 'Pérez', dni: '38111222', legajo: '34001', tipoSocio: 'alumno', email: 'juan.perez@utn.frlp.edu.ar', telefono: '221-4567890' },
                { nombre: 'María', apellido: 'González', dni: '38111223', legajo: '34002', tipoSocio: 'alumno', email: 'maria.gonzalez@utn.frlp.edu.ar', telefono: '221-4567891' },
                { nombre: 'Carlos', apellido: 'Rodríguez', dni: '38111224', legajo: '34003', tipoSocio: 'alumno', email: 'carlos.rodriguez@utn.frlp.edu.ar', telefono: '221-4567892' },
                { nombre: 'Ana', apellido: 'Martínez', dni: '30111225', legajo: null, tipoSocio: 'graduado', email: 'ana.martinez@utn.frlp.edu.ar', telefono: '221-4567893' },
                { nombre: 'Luis', apellido: 'Fernández', dni: '25111226', legajo: null, tipoSocio: 'docente', email: 'luis.fernandez@utn.frlp.edu.ar', telefono: '221-4567894' },
                { nombre: 'Laura', apellido: 'Sánchez', dni: '27111227', legajo: null, tipoSocio: 'no_docente', email: 'laura.sanchez@utn.frlp.edu.ar', telefono: '221-4567895' },
                { nombre: 'Roberto', apellido: 'Díaz', dni: '38111228', legajo: '34004', tipoSocio: 'alumno', email: 'roberto.diaz@utn.frlp.edu.ar', telefono: '221-4567896' },
                { nombre: 'Patricia', apellido: 'López', dni: '22111229', legajo: null, tipoSocio: 'docente', email: 'patricia.lopez@utn.frlp.edu.ar', telefono: '221-4567899' },
            ];

            const sociosCreados = [];
            for (const socioData of sociosFicticios) {
                try {
                    sociosCreados.push(await this.createSocio(socioData));
                } catch (error) {
                    console.error('Error al insertar socio ficticio:', socioData.nombre, error.message);
                }
            }

            // Préstamos activos de ejemplo
            let prestamosCreados = 0;
            const ejemplaresDisponibles = await this.getEjemplares({ estado: 'disponible' });
            for (let i = 0; i < Math.min(6, ejemplaresDisponibles.length, sociosCreados.length); i++) {
                try {
                    await this.createPrestamo({
                        ejemplarId: ejemplaresDisponibles[i].id,
                        socioId: sociosCreados[i % sociosCreados.length].id
                    });
                    prestamosCreados++;
                } catch (error) {
                    console.error('Error al crear préstamo ficticio:', error.message);
                }
            }

            console.log('Datos ficticios creados exitosamente');
            return {
                success: true,
                message: 'Datos ficticios insertados correctamente',
                obrasInsertadas: obrasCreadas.length,
                sociosInsertados: sociosCreados.length,
                prestamosInsertados: prestamosCreados
            };
        } catch (error) {
            console.error('Error al insertar datos ficticios:', error);
            throw error;
        }
    }
}

module.exports = DatabaseService;