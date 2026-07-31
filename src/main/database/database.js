const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// ===== VALIDADORES =====
class Validators {
    static validateEmail(email) {
        if (!email) return true; // Devuelve true aunque no esté ya que el Email es opcional
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validatePhone(phone) {
        if (!phone) return true; // Teléfono opcional
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10;
    }

    static validateISBN(isbn) {
        if (!isbn) return true; // ISBN opcional
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
    }

    static validateYear(year) {
        if (!year) return true; // Año opcional
        const currentYear = new Date().getFullYear();
        return year >= 0 && year <= currentYear + 1;
    }

    static validateRequired(value, fieldName) {
        const stringValue = String(value || ''); // Si tiene un valor thruty lo convierte a string, si no, devuelve una cadena vacía
        if (!value || stringValue.trim() === '') { // si value es falsy devuelve true
            throw new Error(`El campo "${fieldName}" es requerido`);
        }
        return true;
    }

    static validatePositiveNumber(value, fieldName) {
        if (value !== undefined && value !== null) {
            const num = Number(value);
            if (isNaN(num) || num < 0) {
                throw new Error(`El campo "${fieldName}" debe ser un número positivo`);
            }
        }
        return true;
    }
}

// ===== UTILIDADES DE HASHING DE CONTRASEÑAS =====
// NOTA: Esto es autenticación LOCAL con usuarios ficticios, mientras la
// entidad externa (superentidad) que registrará usuarios reales todavía
// no está integrada. Cuando esa integración exista, este esquema de
// usuarios locales se reemplaza (o se usa solo como caché/fallback).
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

            // Crear directorio de datos si no existe
            const userDataPath = app.getPath('userData'); // Ruta al directorio de datos del usuario
            const dbDir = path.join(userDataPath, 'BibliOS'); // Ruta al directorio de la base de datos

            // Crear directorio si no existe
            const fs = require('fs'); // Importa el modulo del sistema de archivos y se lo asigna a la variable fs
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Ruta de la base de datos
            this.dbPath = path.join(dbDir, 'biblios.db');// Nombre del arc de la BD

            // Conectar a la base de datos
            this.db = new Database(this.dbPath);//Crea una conexión directa a ese archivo (el de arriba).

            // Habilitar foreign keys
            this.db.pragma('foreign_keys = ON');

            // Funcion para crear tablas (implementada abajo)
            this.createTables();

            // Migrar tablas existentes si es necesario (incluye eliminar el
            // concepto de multibiblioteca de instalaciones previas)
            this.migrateTables();

            // Asegurar que exista al menos un usuario ficticio para poder
            // iniciar sesión mientras no exista integración con la
            // entidad externa que gestionará usuarios reales
            this.seedDefaultUsuario();

            console.log(`Base de datos SQLite inicializada en: ${this.dbPath}`);

        } catch (error) {
            console.error('Error al inicializar la base de datos:', error);
            throw error;
        }
    }

    createTables() {
        try {
            // Tabla usuarios (autenticación local/ficticia del sistema)
            // El campo "rol" se deja preparado desde ahora para no tener
            // que migrar de nuevo cuando se implemente el sistema de roles
            // y auditoría (fuera de alcance por ahora).
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS usuarios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario TEXT NOT NULL UNIQUE,
                    passwordHash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    nombre TEXT,
                    rol TEXT DEFAULT 'bibliotecario',
                    fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Tabla libros
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS libros (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    titulo TEXT NOT NULL,
                    autor TEXT NOT NULL,
                    isbn TEXT UNIQUE,
                    categoria TEXT,
                    editorial TEXT,
                    lugarPublicacion TEXT,
                    anioPublicacion INTEGER,
                    edicion TEXT,
                    cantidad INTEGER DEFAULT 1,
                    disponibles INTEGER DEFAULT 1,
                    paginas TEXT,
                    clasificacion TEXT,
                    ubicacion TEXT,
                    estado TEXT DEFAULT 'disponible',
                    descripcion TEXT,
                    cabecera TEXT,
                    numeroControl TEXT,
                    fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Tabla socios
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS socios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    telefono TEXT,
                    direccion TEXT,
                    fechaRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
                    estado TEXT DEFAULT 'activo',
                    observaciones TEXT
                )
            `);

            // Tabla préstamos
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS prestamos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    libroId INTEGER,
                    socioId INTEGER,
                    fechaPrestamo DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fechaDevolucion DATETIME,
                    fechaDevolucionReal DATETIME,
                    estado TEXT DEFAULT 'activo',
                    observaciones TEXT,
                    FOREIGN KEY (libroId) REFERENCES libros(id) ON DELETE SET NULL,
                    FOREIGN KEY (socioId) REFERENCES socios(id) ON DELETE SET NULL
                )
            `);

            // Crear índices para mejorar rendimiento
            this.db.exec(`
                -- Índices para usuarios
                CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);

                -- Índices para libros
                CREATE INDEX IF NOT EXISTS idx_libros_titulo ON libros(titulo);
                CREATE INDEX IF NOT EXISTS idx_libros_autor ON libros(autor);
                CREATE INDEX IF NOT EXISTS idx_libros_categoria ON libros(categoria);
                CREATE INDEX IF NOT EXISTS idx_libros_isbn ON libros(isbn);
                CREATE INDEX IF NOT EXISTS idx_libros_estado ON libros(estado);
                CREATE INDEX IF NOT EXISTS idx_libros_disponibles ON libros(disponibles);

                -- Índices para socios
                CREATE INDEX IF NOT EXISTS idx_socios_nombre ON socios(nombre);
                CREATE INDEX IF NOT EXISTS idx_socios_estado ON socios(estado);
                CREATE INDEX IF NOT EXISTS idx_socios_email ON socios(email);

                -- Índices para préstamos
                CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado);
                CREATE INDEX IF NOT EXISTS idx_prestamos_libro ON prestamos(libroId);
                CREATE INDEX IF NOT EXISTS idx_prestamos_socio ON prestamos(socioId);
                CREATE INDEX IF NOT EXISTS idx_prestamos_fecha ON prestamos(fechaPrestamo);
                CREATE INDEX IF NOT EXISTS idx_prestamos_devolucion ON prestamos(fechaDevolucion);
            `);

            console.log('Tablas creadas correctamente');

        } catch (error) {
            console.error('Error al crear tablas:', error);
            throw error;
        }
    }

    migrateTables() {
        try {
            // ===== MIGRACIÓN: eliminar el concepto de multibiblioteca =====
            // Instalaciones previas tenían columna bibliotecaId en libros,
            // socios y prestamos, más una tabla "bibliotecas". Si detectamos
            // ese esquema viejo, migramos los datos existentes al esquema
            // nuevo de una sola biblioteca implícita y eliminamos la tabla.
            const tieneBibliotecas = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='bibliotecas'"
            ).get();

            if (tieneBibliotecas) {
                console.log('Migrando esquema: eliminando concepto de multibiblioteca...');

                // --- libros: quitar columna bibliotecaId ---
                const librosCols = this.db.prepare("PRAGMA table_info(libros)").all().map(c => c.name);
                if (librosCols.includes('bibliotecaId')) {
                    this.db.exec(`
                        CREATE TABLE libros_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            titulo TEXT NOT NULL,
                            autor TEXT NOT NULL,
                            isbn TEXT UNIQUE,
                            categoria TEXT,
                            editorial TEXT,
                            lugarPublicacion TEXT,
                            anioPublicacion INTEGER,
                            edicion TEXT,
                            cantidad INTEGER DEFAULT 1,
                            disponibles INTEGER DEFAULT 1,
                            paginas TEXT,
                            clasificacion TEXT,
                            ubicacion TEXT,
                            estado TEXT DEFAULT 'disponible',
                            descripcion TEXT,
                            cabecera TEXT,
                            numeroControl TEXT,
                            fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                    // isbn es UNIQUE: si había duplicados repetidos entre
                    // "bibliotecas" distintas (datos ficticios), nos quedamos
                    // con el registro de menor id para evitar romper la migración
                    this.db.exec(`
                        INSERT INTO libros_new (id, titulo, autor, isbn, categoria, editorial, lugarPublicacion, anioPublicacion, edicion, cantidad, disponibles, paginas, clasificacion, ubicacion, estado, descripcion, cabecera, numeroControl, fechaCreacion)
                        SELECT id, titulo, autor,
                               CASE WHEN isbn IN (SELECT isbn FROM libros WHERE isbn IS NOT NULL GROUP BY isbn HAVING COUNT(*) > 1) AND id != (SELECT MIN(id) FROM libros l2 WHERE l2.isbn = libros.isbn) THEN NULL ELSE isbn END,
                               categoria, editorial, lugarPublicacion, anioPublicacion, edicion, cantidad, disponibles, paginas, clasificacion, ubicacion, estado, descripcion, cabecera, numeroControl, fechaCreacion
                        FROM libros
                    `);
                    this.db.exec('DROP TABLE libros');
                    this.db.exec('ALTER TABLE libros_new RENAME TO libros');
                    this.db.exec(`
                        CREATE INDEX IF NOT EXISTS idx_libros_titulo ON libros(titulo);
                        CREATE INDEX IF NOT EXISTS idx_libros_autor ON libros(autor);
                        CREATE INDEX IF NOT EXISTS idx_libros_categoria ON libros(categoria);
                        CREATE INDEX IF NOT EXISTS idx_libros_isbn ON libros(isbn);
                        CREATE INDEX IF NOT EXISTS idx_libros_estado ON libros(estado);
                        CREATE INDEX IF NOT EXISTS idx_libros_disponibles ON libros(disponibles);
                    `);
                    console.log('Migración: columna bibliotecaId eliminada de libros');
                }

                // --- socios: quitar columna bibliotecaId, email pasa a UNIQUE global ---
                const sociosCols = this.db.prepare("PRAGMA table_info(socios)").all().map(c => c.name);
                if (sociosCols.includes('bibliotecaId')) {
                    this.db.exec(`
                        CREATE TABLE socios_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            nombre TEXT NOT NULL,
                            email TEXT NOT NULL UNIQUE,
                            telefono TEXT,
                            direccion TEXT,
                            fechaRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
                            estado TEXT DEFAULT 'activo',
                            observaciones TEXT
                        )
                    `);
                    // Si había el mismo email repetido en distintas
                    // "bibliotecas" ficticias, se hace único agregando sufijo
                    this.db.exec(`
                        INSERT INTO socios_new (id, nombre, email, telefono, direccion, fechaRegistro, estado, observaciones)
                        SELECT id, nombre,
                               CASE WHEN id != (SELECT MIN(id) FROM socios s2 WHERE LOWER(TRIM(s2.email)) = LOWER(TRIM(socios.email)))
                                    THEN email || '.' || id
                                    ELSE email END,
                               telefono, direccion, fechaRegistro, estado, observaciones
                        FROM socios
                    `);
                    this.db.exec('DROP TABLE socios');
                    this.db.exec('ALTER TABLE socios_new RENAME TO socios');
                    this.db.exec(`
                        CREATE INDEX IF NOT EXISTS idx_socios_nombre ON socios(nombre);
                        CREATE INDEX IF NOT EXISTS idx_socios_estado ON socios(estado);
                        CREATE INDEX IF NOT EXISTS idx_socios_email ON socios(email);
                    `);
                    console.log('Migración: columna bibliotecaId eliminada de socios');
                }

                // --- prestamos: quitar columna bibliotecaId ---
                const prestamosCols = this.db.prepare("PRAGMA table_info(prestamos)").all().map(c => c.name);
                if (prestamosCols.includes('bibliotecaId')) {
                    this.db.exec(`
                        CREATE TABLE prestamos_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            libroId INTEGER,
                            socioId INTEGER,
                            fechaPrestamo DATETIME DEFAULT CURRENT_TIMESTAMP,
                            fechaDevolucion DATETIME,
                            fechaDevolucionReal DATETIME,
                            estado TEXT DEFAULT 'activo',
                            observaciones TEXT,
                            FOREIGN KEY (libroId) REFERENCES libros(id) ON DELETE SET NULL,
                            FOREIGN KEY (socioId) REFERENCES socios(id) ON DELETE SET NULL
                        )
                    `);
                    this.db.exec(`
                        INSERT INTO prestamos_new (id, libroId, socioId, fechaPrestamo, fechaDevolucion, fechaDevolucionReal, estado, observaciones)
                        SELECT id, libroId, socioId, fechaPrestamo, fechaDevolucion, fechaDevolucionReal, estado, observaciones
                        FROM prestamos
                    `);
                    this.db.exec('DROP TABLE prestamos');
                    this.db.exec('ALTER TABLE prestamos_new RENAME TO prestamos');
                    this.db.exec(`
                        CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado);
                        CREATE INDEX IF NOT EXISTS idx_prestamos_libro ON prestamos(libroId);
                        CREATE INDEX IF NOT EXISTS idx_prestamos_socio ON prestamos(socioId);
                        CREATE INDEX IF NOT EXISTS idx_prestamos_fecha ON prestamos(fechaPrestamo);
                        CREATE INDEX IF NOT EXISTS idx_prestamos_devolucion ON prestamos(fechaDevolucion);
                    `);
                    console.log('Migración: columna bibliotecaId eliminada de prestamos');
                }

                // --- eliminar la tabla bibliotecas ---
                this.db.exec('DROP TABLE bibliotecas');
                console.log('Migración: tabla bibliotecas eliminada. El sistema ahora es de biblioteca única.');
            }

            // Migrar tabla libros: agregar columnas si no existen (cabecera, numeroControl, lugarPublicacion, edicion, paginas, clasificacion)
            const librosTableInfo = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='libros'").get();
            if (librosTableInfo) {
                const librosColumns = this.db.prepare("PRAGMA table_info(libros)").all();
                const colNames = librosColumns.map(c => c.name);
                const columnsToAdd = [
                    'cabecera', 'numeroControl', 'lugarPublicacion', 'edicion', 'paginas', 'clasificacion'
                ];
                for (const col of columnsToAdd) {
                    if (!colNames.includes(col)) {
                        this.db.exec(`ALTER TABLE libros ADD COLUMN ${col} TEXT`);
                        console.log(`Migración libros: agregada columna ${col}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error al migrar tablas:', error);
            // No lanzar error para no bloquear la aplicación
        }
    }

    // ===== OPERACIONES DE USUARIOS / AUTENTICACIÓN =====
    // Autenticación local con usuarios ficticios. Cuando la entidad externa
    // (superentidad) provea su propio mecanismo de registro/autenticación,
    // este bloque se reemplaza por la integración correspondiente.

    seedDefaultUsuario() {
        try {
            const count = this.db.prepare('SELECT COUNT(*) as count FROM usuarios').get().count;
            if (count === 0) {
                console.log('No hay usuarios cargados, creando usuario ficticio por defecto...');
                this.createUsuario({
                    usuario: 'admin',
                    password: 'biblios2026',
                    nombre: 'Administrador BibliOS (ficticio)'
                });
                console.log('Usuario ficticio creado -> usuario: "admin" / contraseña: "biblios2026"');
            }
        } catch (error) {
            console.error('Error al crear usuario ficticio por defecto:', error);
        }
    }

    async createUsuario(usuarioData) {
        try {
            Validators.validateRequired(usuarioData.usuario, 'usuario');
            Validators.validateRequired(usuarioData.password, 'password');

            const existente = this.db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuarioData.usuario);
            if (existente) {
                throw new Error(`Ya existe un usuario con el nombre "${usuarioData.usuario}".`);
            }

            const salt = generateSalt();
            const passwordHash = hashPassword(usuarioData.password, salt);

            const stmt = this.db.prepare(`
                INSERT INTO usuarios (usuario, passwordHash, salt, nombre, rol)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                usuarioData.usuario,
                passwordHash,
                salt,
                usuarioData.nombre || null,
                usuarioData.rol || 'bibliotecario'
            );

            return this.getUsuarioById(result.lastInsertRowid);
        } catch (error) {
            console.error('Error al crear usuario:', error);
            throw error;
        }
    }

    getUsuarioById(id) {
        const stmt = this.db.prepare('SELECT id, usuario, nombre, rol, fechaCreacion FROM usuarios WHERE id = ?');
        return stmt.get(id);
    }

    async login(usuario, password) {
        try {
            Validators.validateRequired(usuario, 'usuario');
            Validators.validateRequired(password, 'password');

            const row = this.db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);

            if (!row) {
                return { success: false, message: 'Usuario o contraseña incorrectos' };
            }

            const hashedInput = hashPassword(password, row.salt);
            if (hashedInput !== row.passwordHash) {
                return { success: false, message: 'Usuario o contraseña incorrectos' };
            }

            return {
                success: true,
                usuario: {
                    id: row.id,
                    usuario: row.usuario,
                    nombre: row.nombre,
                    rol: row.rol
                }
            };
        } catch (error) {
            console.error('Error durante el login:', error);
            throw error;
        }
    }

    // ===== OPERACIONES DE LIBROS =====

    async createLibro(libroData) {
        try {
            // VALIDACIONES
            Validators.validateRequired(libroData.titulo, 'titulo');// Valida que el titulo no esté vacío
            Validators.validateRequired(libroData.autor, 'autor');// lo mismo el autor

            if (libroData.isbn && !Validators.validateISBN(libroData.isbn)) { //para que la sentencia derecha de true, el valid tiene que ser false(no cumple el formato)
                throw new Error('El ISBN proporcionado no es válido (debe ser ISBN-10 o ISBN-13)');
            }

            if (libroData.anioPublicacion && !Validators.validateYear(libroData.anioPublicacion)) { //lo mismo
                throw new Error('El año de publicación no es válido');
            }

            Validators.validatePositiveNumber(libroData.cantidad, 'cantidad');
            Validators.validatePositiveNumber(libroData.disponibles, 'disponibles');

            const stmt = this.db.prepare(`
                INSERT INTO libros (titulo, autor, isbn, categoria, editorial, lugarPublicacion, anioPublicacion, edicion, cantidad, disponibles, paginas, clasificacion, ubicacion, estado, descripcion, cabecera, numeroControl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            //Devuelve un objeto statement, que se guarda en stmt. Luego se ejecuta con los datos del libro
            //Con el prepare lo que hace es preparar la sentencia SQL para su ejecución posterior con los valores proporcionados.
            const result = stmt.run(
                libroData.titulo,
                libroData.autor,
                libroData.isbn || null,
                libroData.categoria || null,
                libroData.editorial || null,
                libroData.lugarPublicacion || null,
                libroData.anioPublicacion || null,
                libroData.edicion || null,
                libroData.cantidad || 1,
                libroData.disponibles || libroData.cantidad || 1,
                libroData.paginas || null,
                libroData.clasificacion || null,
                libroData.ubicacion || null,
                libroData.estado || 'disponible',
                libroData.descripcion || null,
                libroData.cabecera || null,
                libroData.numeroControl || null
            );

            return this.getLibroById(result.lastInsertRowid); // usa la funcion getLibroById que es una funcion que ejecutauna query select para devolver el libro recien creado
        } catch (error) {
            console.error('Error al crear libro:', error);
            throw error;
        }
    }

    async getLibros(filters = {}) { //filter es un objeto con posibles filtros de busqueda
        try {
            // OPTIMIZACIÓN: Usar índices y LIMIT para paginación
            let query = 'SELECT * FROM libros WHERE 1=1';
            const params = [];

            if (filters.search) { //si escribio algo en el campo de busqueda "nombre" lo toma como thruty y entra, si puso 0 o nada no
                query += ' AND (titulo LIKE ? OR autor LIKE ? OR isbn LIKE ?)';
                const searchTerm = `%${filters.search}%`; //agrega % antes y despues del termino de busqueda para que busque coincidencias en cualquier parte del texto (como hacemos en sql server)
                params.push(searchTerm, searchTerm, searchTerm);
            }

            if (filters.categoria) {
                query += ' AND categoria = ?';
                params.push(filters.categoria); //agrega el valor del filtro a los parametros de la query
            }

            if (filters.estado) {
                query += ' AND estado = ?';
                params.push(filters.estado); // lo mismo
            }

            query += ' ORDER BY titulo ASC';  // agrupa de forma ascendente alfabeticamente

            // Agregar LIMIT para paginación si se especifica
            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(filters.limit);

                if (filters.offset) {
                    query += ' OFFSET ?';
                    params.push(filters.offset);
                }
            }

            const stmt = this.db.prepare(query); //ahora si deja la query lista y abajo le pasa el array de parametros
            return stmt.all(...params);
        } catch (error) {
            console.error('Error al obtener libros:', error);
            throw error;
        }
    }

    async getLibroById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM libros WHERE id = ?');
            return stmt.get(id);
        } catch (error) {
            console.error('Error al obtener libro:', error);
            throw error;
        }
    }

    async updateLibro(id, updates) { //updates es un objeto con los campos que se quieren modificar
        try {
            const fields = []; //fields guarda fragmentos de texto tipo "titulo = ?", "autor = ?", etc
            const values = []; //values guarda los valores correspondientes a cada campo

            Object.keys(updates).forEach(key => { // obtiene los nombres de las propiedades del objeto.(por eso los keys) ej: "autor","titulo",etc.
                if (updates[key] !== undefined) { // verifica que el valor sea undefined
                    fields.push(`${key} = ?`); // agrega el fragmento de texto al array fields (la key)
                    values.push(updates[key]); // agrega el valor (el value) correspondiente del campo ingresado para modificar al array values
                }
            });

            if (fields.length === 0) return false;

            values.push(id);
            const stmt = this.db.prepare(`UPDATE libros SET ${fields.join(', ')} WHERE id = ?`);
            const result = stmt.run(...values);

            return result.changes > 0;
        } catch (error) {
            console.error('Error al actualizar libro:', error);
            throw error;
        }
    }

    async deleteLibro(id) {
        // TRANSACCIÓN: Usar transacción para garantizar consistencia
        const transaction = this.db.transaction((id) => { // el transaction hace toda la consulta se efectue de manera atomica
            // Verificar si hay préstamos activos asociados a este libro
            const prestamosActivos = this.db.prepare('SELECT COUNT(*) as count FROM prestamos WHERE libroId = ? AND estado = ?').get(id, 'activo');
            // con una query de sql se fija el numero de prestamos activos de este libro
            if (prestamosActivos.count > 0) {
                throw new Error(`No se puede eliminar el libro porque tiene ${prestamosActivos.count} préstamo(s) activo(s). Debe devolver todos los préstamos antes de eliminar el libro.`);
            }

            // IMPORTANTE: Poner en NULL los libroId de los préstamos ANTES de eliminar el libro
            // Esto mantiene el historial de préstamos incluso después de eliminar el libro
            console.log(`Poniendo en NULL los libroId de los préstamos para el libro ${id}...`);
            const updateResult = this.db.prepare('UPDATE prestamos SET libroId = NULL WHERE libroId = ?').run(id);
            console.log(`Actualizados ${updateResult.changes} préstamos`);  //actualiza a null la cant de prestamos de este libro

            // Ahora eliminar el libro
            const stmt = this.db.prepare('DELETE FROM libros WHERE id = ?');
            const result = stmt.run(id);

            return result.changes > 0;
        });  // por eso termina aca por mas que esten separadas las lineas de la query

        try {
            return transaction(id);
        } catch (error) {
            console.error('Error al eliminar libro:', error);
            throw error;
        }
    }

    // ===== OPERACIONES DE SOCIOS =====

    async createSocio(socioData) {
        try {
            // VALIDACIONES
            Validators.validateRequired(socioData.nombre, 'nombre');
            Validators.validateRequired(socioData.email, 'email');

            if (!Validators.validateEmail(socioData.email)) {
                throw new Error('El email proporcionado no es válido');
            }

            if (socioData.telefono && !Validators.validatePhone(socioData.telefono)) {
                throw new Error('El teléfono debe tener al menos 10 dígitos');
            }

            // Verificar si ya existe un socio con ese email (único a nivel global)
            const emailNormalizado = socioData.email.toLowerCase().trim();
            const existingSocio = this.db.prepare('SELECT id, nombre FROM socios WHERE LOWER(TRIM(email)) = ?').get(emailNormalizado);

            if (existingSocio) {
                throw new Error(`Ya existe un socio con el email "${socioData.email}".`);
            }

            const stmt = this.db.prepare(`
                INSERT INTO socios (nombre, email, telefono, direccion, estado, observaciones)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                socioData.nombre,
                socioData.email,
                socioData.telefono || null,
                socioData.direccion || null,
                socioData.estado || 'activo',
                socioData.observaciones || null
            );

            return this.getSocioById(result.lastInsertRowid);
        } catch (error) {
            console.error('Error al crear socio:', error);
            throw error;
        }
    }

    async getSocios(filters = {}) {
        try {
            // OPTIMIZACIÓN: Usar índices y LIMIT para paginación
            let query = 'SELECT * FROM socios WHERE 1=1';
            const params = [];

            if (filters.search) {
                query += ' AND (nombre LIKE ? OR email LIKE ?)';
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm);
            }

            if (filters.estado) {
                query += ' AND estado = ?';
                params.push(filters.estado);
            }

            query += ' ORDER BY nombre ASC';

            // Agregar LIMIT para paginación si se especifica
            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(filters.limit);

                if (filters.offset) {
                    query += ' OFFSET ?';
                    params.push(filters.offset);
                }
            }

            const stmt = this.db.prepare(query);
            return stmt.all(...params);
        } catch (error) {
            console.error('Error al obtener socios:', error);
            throw error;
        }
    }

    async getSocioById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM socios WHERE id = ?');
            return stmt.get(id);
        } catch (error) {
            console.error('Error al obtener socio:', error);
            throw error;
        }
    }

    async updateSocio(id, updates) {
        try {
            // Si se está actualizando el email, validar que sea único
            if (updates.email !== undefined) {
                // Validar formato del email
                if (!Validators.validateEmail(updates.email)) {
                    throw new Error('El email proporcionado no es válido');
                }

                // Verificar que no exista otro socio con ese email
                const emailNormalizado = updates.email.toLowerCase().trim();

                const currentSocio = this.getSocioById(id);
                if (!currentSocio) {
                    throw new Error('El socio que intenta actualizar no existe');
                }

                const existingSocio = this.db.prepare('SELECT id FROM socios WHERE LOWER(TRIM(email)) = ? AND id != ?').get(emailNormalizado, id);

                if (existingSocio) {
                    throw new Error(`Ya existe un socio con el email "${updates.email}".`);
                }
            }

            const fields = [];
            const values = [];

            Object.keys(updates).forEach(key => {
                if (updates[key] !== undefined) {
                    fields.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            });

            if (fields.length === 0) return false;

            values.push(id);
            const stmt = this.db.prepare(`UPDATE socios SET ${fields.join(', ')} WHERE id = ?`);
            const result = stmt.run(...values);

            return result.changes > 0;
        } catch (error) {
            console.error('Error al actualizar socio:', error);
            throw error;
        }
    }

    async deleteSocio(id) {
        // TRANSACCIÓN: Usar transacción para garantizar consistencia
        const transaction = this.db.transaction((id) => {
            // Verificar si hay préstamos activos asociados a este socio
            const prestamosActivos = this.db.prepare('SELECT COUNT(*) as count FROM prestamos WHERE socioId = ? AND estado = ?').get(id, 'activo');

            if (prestamosActivos.count > 0) {
                throw new Error(`No se puede eliminar el socio porque tiene ${prestamosActivos.count} préstamo(s) activo(s). Debe devolver todos los préstamos antes de eliminar el socio.`);
            }

            // IMPORTANTE: Poner en NULL los socioId de los préstamos ANTES de eliminar el socio
            // Esto mantiene el historial de préstamos incluso después de eliminar el socio
            console.log(`Poniendo en NULL los socioId de los préstamos para el socio ${id}...`);
            const updateResult = this.db.prepare('UPDATE prestamos SET socioId = NULL WHERE socioId = ?').run(id);
            console.log(`Actualizados ${updateResult.changes} préstamos`);

            // Ahora eliminar el socio
            const stmt = this.db.prepare('DELETE FROM socios WHERE id = ?');
            const result = stmt.run(id);

            return result.changes > 0;
        });

        try {
            return transaction(id);
        } catch (error) {
            console.error('Error al eliminar socio:', error);
            throw error;
        }
    }

    // ===== OPERACIONES DE PRÉSTAMOS =====

    async createPrestamo(prestamoData) {
        // TRANSACCIÓN: Usar transacción para garantizar consistencia
        const transaction = this.db.transaction((prestamoData) => {
            // VALIDACIONES
            if (!prestamoData.libroId || !prestamoData.socioId) {
                throw new Error('Los campos libroId y socioId son requeridos');
            }

            // Verificar que el libro existe
            const libro = this.db.prepare('SELECT * FROM libros WHERE id = ?').get(prestamoData.libroId);
            if (!libro) {
                throw new Error('El libro especificado no existe');
            }

            // Verificar que el socio existe
            const socio = this.db.prepare('SELECT * FROM socios WHERE id = ?').get(prestamoData.socioId);
            if (!socio) {
                throw new Error('El socio especificado no existe');
            }

            // Verificar que el libro esté disponible
            if (libro.disponibles <= 0) {
                throw new Error('El libro no está disponible para préstamo');
            }

            // Crear el préstamo
            const stmt = this.db.prepare(`
                INSERT INTO prestamos (libroId, socioId, fechaDevolucion, observaciones)
                VALUES (?, ?, ?, ?)
            `);

            const result = stmt.run(
                prestamoData.libroId,
                prestamoData.socioId,
                prestamoData.fechaDevolucion,
                prestamoData.observaciones || null
            );

            // Actualizar disponibilidad del libro
            const updateStmt = this.db.prepare(`
                UPDATE libros 
                SET disponibles = disponibles - 1, 
                    estado = CASE WHEN disponibles - 1 = 0 THEN 'prestado' ELSE 'disponible' END
                WHERE id = ?
            `);
            updateStmt.run(prestamoData.libroId);

            return result.lastInsertRowid;
        });

        try {
            const prestamoId = transaction(prestamoData);
            return this.getPrestamoById(prestamoId);
        } catch (error) {
            console.error('Error al crear préstamo:', error);
            throw error;
        }
    }

    async getPrestamos(filters = {}) {
        try {
            let query = `
                SELECT p.*, 
                       COALESCE(l.titulo, '[Libro eliminado]') as libroTitulo, 
                       COALESCE(l.autor, '') as libroAutor, 
                       COALESCE(s.nombre, '[Socio eliminado]') as socioNombre, 
                       COALESCE(s.email, '') as socioEmail
                FROM prestamos p
                LEFT JOIN libros l ON p.libroId = l.id
                LEFT JOIN socios s ON p.socioId = s.id
                WHERE 1=1
            `;
            const params = [];

            if (filters.estado) {
                query += ' AND p.estado = ?';
                params.push(filters.estado);
            }

            query += ' ORDER BY p.fechaPrestamo DESC';

            const stmt = this.db.prepare(query);
            return stmt.all(...params);
        } catch (error) {
            console.error('Error al obtener préstamos:', error);
            throw error;
        }
    }

    async getPrestamoById(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, 
                       COALESCE(l.titulo, '[Libro eliminado]') as libroTitulo, 
                       COALESCE(l.autor, '') as libroAutor, 
                       COALESCE(s.nombre, '[Socio eliminado]') as socioNombre, 
                       COALESCE(s.email, '') as socioEmail
                FROM prestamos p
                LEFT JOIN libros l ON p.libroId = l.id
                LEFT JOIN socios s ON p.socioId = s.id
                WHERE p.id = ?
            `);
            return stmt.get(id);
        } catch (error) {
            console.error('Error al obtener préstamo:', error);
            throw error;
        }
    }
    ///////////////////////////////////////////////// Estado de disponibilidad del libro y cambio de estado del prestamo
    async devolverLibro(prestamoId) {
        // TRANSACCIÓN: Usa transacción para garantizar consistencia
        const transaction = this.db.transaction((prestamoId) => {
            // Obtener el préstamo
            const prestamo = this.db.prepare(`
                SELECT p.*, 
                       COALESCE(l.titulo, '[Libro eliminado]') as libroTitulo, 
                       COALESCE(l.autor, '') as libroAutor, 
                       COALESCE(s.nombre, '[Socio eliminado]') as socioNombre, 
                       COALESCE(s.email, '') as socioEmail
                FROM prestamos p
                LEFT JOIN libros l ON p.libroId = l.id
                LEFT JOIN socios s ON p.socioId = s.id
                WHERE p.id = ?
            `).get(prestamoId); //el coalesce es para que devuelva el primer valor que no sea null
            //aca le pasamos al prepare el id del prestamo del libro que queremos retornar al sistema(biblioteca)
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }

            // Verificar que el préstamo no esté ya completado
            if (prestamo.estado === 'completado') {
                throw new Error('El préstamo ya está completado');
            }

            // Actualizar el préstamo
            const updatePrestamo = this.db.prepare(`
                UPDATE prestamos 
                SET estado = 'completado', fechaDevolucionReal = CURRENT_TIMESTAMP 
                WHERE id = ?
            `);
            const result = updatePrestamo.run(prestamoId);

            if (result.changes > 0 && prestamo.libroId) {  //si se detecto un cambio y el id del libro no es null updateamos el estado de disponibilidad del libro
                // Actualizar disponibilidad del libro solo si el libro existe
                const updateLibro = this.db.prepare(`
                    UPDATE libros 
                    SET disponibles = disponibles + 1, 
                        estado = 'disponible'
                    WHERE id = ?
                `);
                updateLibro.run(prestamo.libroId);
            }

            return result.changes > 0;
        });

        try {
            return transaction(prestamoId);
        } catch (error) {
            console.error('Error al devolver libro:', error);
            throw error;
        }
    }

    async updatePrestamo(id, updates) {
        try {
            const fields = [];
            const values = [];

            Object.keys(updates).forEach(key => {
                if (updates[key] !== undefined) {
                    fields.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            });

            if (fields.length === 0) return false;

            values.push(id);
            const stmt = this.db.prepare(`UPDATE prestamos SET ${fields.join(', ')} WHERE id = ?`);
            const result = stmt.run(...values);

            return result.changes > 0;
        } catch (error) {
            console.error('Error al actualizar préstamo:', error);
            throw error;
        }
    }

    async deletePrestamo(id) {
        // TRANSACCIÓN: Usar transacción para garantizar consistencia
        const transaction = this.db.transaction((id) => {
            // Obtener el préstamo para verificar su estado
            const prestamo = this.db.prepare('SELECT * FROM prestamos WHERE id = ?').get(id);

            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }

            // Si el préstamo está activo, devolver el libro antes de eliminar
            if (prestamo.estado === 'activo' && prestamo.libroId) {
                // Aumentar disponibilidad del libro
                const updateLibro = this.db.prepare(`
                    UPDATE libros 
                    SET disponibles = disponibles + 1, 
                        estado = 'disponible'
                    WHERE id = ?
                `);
                updateLibro.run(prestamo.libroId);
            }

            // Eliminar el préstamo
            const stmt = this.db.prepare('DELETE FROM prestamos WHERE id = ?');
            const result = stmt.run(id);

            return result.changes > 0;
        });

        try {
            return transaction(id);
        } catch (error) {
            console.error('Error al eliminar préstamo:', error);
            throw error;
        }
    }

    // ===== ESTADÍSTICAS Y REPORTES =====

    async getStats() {
        try {
            // OPTIMIZACIÓN: Consulta única con UNION ALL para obtener todas las estadísticas
            const stmt = this.db.prepare(`
                SELECT 
                    'libros' as tipo,
                    COUNT(*) as count
                FROM libros
                
                UNION ALL
                
                SELECT 
                    'socios' as tipo,
                    COUNT(*) as count
                FROM socios
                
                UNION ALL
                
                SELECT 
                    'prestamos_activos' as tipo,
                    COUNT(*) as count
                FROM prestamos 
                WHERE estado = 'activo'
                
                UNION ALL
                
                SELECT 
                    'prestamos_vencidos' as tipo,
                    COUNT(*) as count
                FROM prestamos 
                WHERE estado = 'activo' AND fechaDevolucion < CURRENT_TIMESTAMP
                
                UNION ALL
                
                SELECT 
                    'prestamos_completados' as tipo,
                    COUNT(*) as count
                FROM prestamos 
                WHERE estado = 'completado'
            `);

            const results = stmt.all();

            // Convertir resultados en objeto
            const stats = {};
            results.forEach(row => {
                switch (row.tipo) {
                    case 'libros':
                        stats.totalLibros = row.count;
                        break;
                    case 'socios':
                        stats.totalSocios = row.count;
                        break;
                    case 'prestamos_activos':
                        stats.prestamosActivos = row.count;
                        break;
                    case 'prestamos_vencidos':
                        stats.prestamosVencidos = row.count;
                        break;
                    case 'prestamos_completados':
                        stats.prestamosCompletados = row.count;
                        break;
                }
            });

            return stats;
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            throw error;
        }
    }

    async getPrestamosPorMes(meses = 6) {
        try {
            // OPTIMIZACIÓN: Usar índice en fechaPrestamo
            const stmt = this.db.prepare(`
                SELECT 
                    strftime('%Y-%m', fechaPrestamo) as mes,
                    COUNT(*) as prestamos,
                    SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END) as devoluciones
                FROM prestamos 
                WHERE fechaPrestamo >= date('now', '-' || ? || ' months')
                GROUP BY strftime('%Y-%m', fechaPrestamo)
                ORDER BY mes ASC
            `);

            return stmt.all(meses);
        } catch (error) {
            console.error('Error al obtener préstamos por mes:', error);
            throw error;
        }
    }

    async getLibrosPorCategoria() {
        try {
            // OPTIMIZACIÓN: Usar índice en categoria
            const stmt = this.db.prepare(`
                SELECT 
                    COALESCE(categoria, 'Sin categoría') as categoria, 
                    COUNT(*) as cantidad
                FROM libros 
                GROUP BY categoria
                ORDER BY cantidad DESC
            `);

            return stmt.all();
        } catch (error) {
            console.error('Error al obtener libros por categoría:', error);
            throw error;
        }
    }

    async getSociosPorMes(meses = 6) {
        try {
            // Contar socios registrados por mes
            const stmt = this.db.prepare(`
                SELECT 
                    strftime('%Y-%m', fechaRegistro) as mes,
                    COUNT(*) as sociosNuevos
                FROM socios 
                WHERE fechaRegistro >= date('now', '-' || ? || ' months')
                GROUP BY strftime('%Y-%m', fechaRegistro)
                ORDER BY mes ASC
            `);

            const resultados = stmt.all(meses);

            // Calcular total acumulado por mes
            let totalAcumulado = 0;
            return resultados.map(item => {
                totalAcumulado += item.sociosNuevos;
                return {
                    mes: item.mes,
                    sociosNuevos: item.sociosNuevos,
                    totalAcumulado: totalAcumulado
                };
            });
        } catch (error) {
            console.error('Error al obtener socios por mes:', error);
            throw error;
        }
    }

    // ===== UTILIDADES =====

    async close() {
        if (this.db) {
            this.db.close();
            console.log('Base de datos cerrada correctamente');
        }
    }

    async backup(destinationPath) {
        try {
            // Para SQLite, simplemente copiar el archivo
            const fs = require('fs');
            fs.copyFileSync(this.dbPath, destinationPath);
            return true;
        } catch (error) {
            console.error('Error al hacer backup:', error);
            return false;
        }
    }

    // ===== MÉTODOS DE DATOS FICTICIOS DE DEMOSTRACIÓN =====
    // Catálogo, socios y préstamos ficticios de la biblioteca UTN-FRLP,
    // usados mientras trabajamos con datos propios simulados en lugar de
    // datos reales (esos vendrán de la integración con la entidad externa).

    async insertSampleData() {
        try {
            const librosUTN = [
                { titulo: 'Introducción a la Programación', autor: 'Dr. Carlos Martínez', isbn: '978-1234567890', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2020, cantidad: 5, disponibles: 3, ubicacion: 'Estante A-1', descripcion: 'Fundamentos de programación' },
                { titulo: 'Estructuras de Datos', autor: 'Prof. Laura Fernández', isbn: '978-1234567891', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2021, cantidad: 4, disponibles: 2, ubicacion: 'Estante A-2', descripcion: 'Algoritmos y estructuras' },
                { titulo: 'Base de Datos', autor: 'Ing. Roberto Sánchez', isbn: '978-1234567892', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2022, cantidad: 6, disponibles: 4, ubicacion: 'Estante A-3', descripcion: 'SQL y diseño de BD' },
                { titulo: 'Matemática Discreta', autor: 'Dr. Ana García', isbn: '978-1234567893', categoria: 'Matemática', editorial: 'UTN Press', anioPublicacion: 2019, cantidad: 3, disponibles: 1, ubicacion: 'Estante B-1', descripcion: 'Lógica y teoría de grafos' },
                { titulo: 'Álgebra Lineal', autor: 'Prof. Miguel Torres', isbn: '978-1234567894', categoria: 'Matemática', editorial: 'UTN Press', anioPublicacion: 2020, cantidad: 4, disponibles: 2, ubicacion: 'Estante B-2', descripcion: 'Vectores y matrices' },
                { titulo: 'Cálculo Diferencial', autor: 'Dr. Patricia López', isbn: '978-1234567895', categoria: 'Matemática', editorial: 'UTN Press', anioPublicacion: 2021, cantidad: 5, disponibles: 3, ubicacion: 'Estante B-3', descripcion: 'Límites y derivadas' },
                { titulo: 'Física I', autor: 'Ing. Daniel Ruiz', isbn: '978-1234567896', categoria: 'Física', editorial: 'UTN Press', anioPublicacion: 2019, cantidad: 4, disponibles: 2, ubicacion: 'Estante C-1', descripcion: 'Mecánica clásica' },
                { titulo: 'Física II', autor: 'Prof. Carmen Díaz', isbn: '978-1234567897', categoria: 'Física', editorial: 'UTN Press', anioPublicacion: 2020, cantidad: 3, disponibles: 1, ubicacion: 'Estante C-2', descripcion: 'Electricidad y magnetismo' },
                { titulo: 'Redes de Computadoras', autor: 'Ing. Fernando Morales', isbn: '978-1234567898', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2022, cantidad: 5, disponibles: 3, ubicacion: 'Estante A-4', descripcion: 'Protocolos y arquitecturas' },
                { titulo: 'Ingeniería de Software', autor: 'Dr. Silvia Ramírez', isbn: '978-1234567899', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2021, cantidad: 4, disponibles: 2, ubicacion: 'Estante A-5', descripcion: 'Metodologías ágiles' },
                { titulo: 'Inteligencia Artificial', autor: 'Prof. Luis Herrera', isbn: '978-1234567900', categoria: 'Informática', editorial: 'UTN Press', anioPublicacion: 2023, cantidad: 3, disponibles: 1, ubicacion: 'Estante A-6', descripcion: 'Machine Learning básico' },
                { titulo: 'Química General', autor: 'Dr. María González', isbn: '978-1234567901', categoria: 'Química', editorial: 'UTN Press', anioPublicacion: 2020, cantidad: 4, disponibles: 2, ubicacion: 'Estante D-1', descripcion: 'Fundamentos químicos' },
                { titulo: 'Diseño Gráfico', autor: 'Prof. Jorge Castro', isbn: '978-1234567902', categoria: 'Diseño', editorial: 'UTN Press', anioPublicacion: 2021, cantidad: 3, disponibles: 1, ubicacion: 'Estante E-1', descripcion: 'Principios de diseño' },
                { titulo: 'Marketing Digital', autor: 'Ing. Andrea Silva', isbn: '978-1234567903', categoria: 'Marketing', editorial: 'UTN Press', anioPublicacion: 2022, cantidad: 5, disponibles: 3, ubicacion: 'Estante F-1', descripcion: 'Estrategias digitales' },
                { titulo: 'Gestión de Proyectos', autor: 'Dr. Ricardo Vargas', isbn: '978-1234567904', categoria: 'Administración', editorial: 'UTN Press', anioPublicacion: 2020, cantidad: 4, disponibles: 2, ubicacion: 'Estante G-1', descripcion: 'PMI y Scrum' }
            ];

            const sociosUTN = [
                { nombre: 'Juan Pérez', email: 'juan.perez@utn.frlp.edu.ar', telefono: '221-4567890', direccion: 'Calle 60 1234', observaciones: 'Estudiante de Ingeniería en Sistemas' },
                { nombre: 'María González', email: 'maria.gonzalez@utn.frlp.edu.ar', telefono: '221-4567891', direccion: 'Av. 7 567', observaciones: 'Estudiante de Ingeniería Industrial' },
                { nombre: 'Carlos Rodríguez', email: 'carlos.rodriguez@utn.frlp.edu.ar', telefono: '221-4567892', direccion: 'Calle 50 890', observaciones: 'Estudiante de Ingeniería Química' },
                { nombre: 'Ana Martínez', email: 'ana.martinez@utn.frlp.edu.ar', telefono: '221-4567893', direccion: 'Av. 13 234', observaciones: 'Estudiante de Ingeniería en Sistemas' },
                { nombre: 'Luis Fernández', email: 'luis.fernandez@utn.frlp.edu.ar', telefono: '221-4567894', direccion: 'Calle 66 456', observaciones: 'Estudiante de Ingeniería Industrial' },
                { nombre: 'Laura Sánchez', email: 'laura.sanchez@utn.frlp.edu.ar', telefono: '221-4567895', direccion: 'Av. 1 789', observaciones: 'Estudiante de Ingeniería Química' },
                { nombre: 'Roberto Díaz', email: 'roberto.diaz@utn.frlp.edu.ar', telefono: '221-4567896', direccion: 'Calle 52 123', observaciones: 'Estudiante de Ingeniería en Sistemas' },
                { nombre: 'Carmen Torres', email: 'carmen.torres@utn.frlp.edu.ar', telefono: '221-4567897', direccion: 'Av. 7 890', observaciones: 'Estudiante de Ingeniería Industrial' },
                { nombre: 'Miguel Ruiz', email: 'miguel.ruiz@utn.frlp.edu.ar', telefono: '221-4567898', direccion: 'Calle 60 567', observaciones: 'Estudiante de Ingeniería Química' },
                { nombre: 'Patricia López', email: 'patricia.lopez@utn.frlp.edu.ar', telefono: '221-4567899', direccion: 'Av. 13 234', observaciones: 'Docente de Informática' },
                { nombre: 'Daniel Morales', email: 'daniel.morales@utn.frlp.edu.ar', telefono: '221-4567900', direccion: 'Calle 50 456', observaciones: 'Docente de Matemática' },
                { nombre: 'Silvia Ramírez', email: 'silvia.ramirez@utn.frlp.edu.ar', telefono: '221-4567901', direccion: 'Av. 7 123', observaciones: 'Docente de Física' },
                { nombre: 'Fernando Herrera', email: 'fernando.herrera@utn.frlp.edu.ar', telefono: '221-4567902', direccion: 'Calle 66 789', observaciones: 'Estudiante de Ingeniería en Sistemas' },
                { nombre: 'Andrea Castro', email: 'andrea.castro@utn.frlp.edu.ar', telefono: '221-4567903', direccion: 'Av. 1 567', observaciones: 'Estudiante de Ingeniería Industrial' },
                { nombre: 'Jorge Silva', email: 'jorge.silva@utn.frlp.edu.ar', telefono: '221-4567904', direccion: 'Calle 52 890', observaciones: 'Estudiante de Ingeniería Química' }
            ];

            console.log('Insertando libros ficticios...');
            const librosInsertados = [];
            for (const libro of librosUTN) {
                try {
                    const nuevoLibro = await this.createLibro(libro);
                    librosInsertados.push(nuevoLibro);
                } catch (error) {
                    console.error('Error al insertar libro:', libro.titulo, error.message);
                }
            }

            console.log('Insertando socios ficticios...');
            const sociosInsertados = [];
            for (const socio of sociosUTN) {
                try {
                    const nuevoSocio = await this.createSocio(socio);
                    sociosInsertados.push(nuevoSocio);
                } catch (error) {
                    console.error('Error al insertar socio:', socio.nombre, error.message);
                }
            }

            console.log('Creando préstamos ficticios...');
            const prestamosInsertados = [];

            // Crear algunos préstamos completados (historial)
            for (let i = 0; i < 30; i++) {
                const libroRandom = librosInsertados[Math.floor(Math.random() * librosInsertados.length)];
                const socioRandom = sociosInsertados[Math.floor(Math.random() * sociosInsertados.length)];
                if (!libroRandom || !socioRandom) continue;

                // Fecha aleatoria en los últimos 6 meses
                const fechaPrestamo = new Date();
                fechaPrestamo.setMonth(fechaPrestamo.getMonth() - Math.floor(Math.random() * 6));
                fechaPrestamo.setDate(fechaPrestamo.getDate() - Math.floor(Math.random() * 30));

                const fechaDevolucion = new Date(fechaPrestamo);
                fechaDevolucion.setDate(fechaDevolucion.getDate() + 7 + Math.floor(Math.random() * 14));

                try {
                    const prestamo = await this.createPrestamo({
                        libroId: libroRandom.id,
                        socioId: socioRandom.id,
                        fechaDevolucion: fechaDevolucion.toISOString(),
                        observaciones: 'Préstamo de muestra'
                    });

                    await this.devolverLibro(prestamo.id);
                    prestamosInsertados.push(prestamo);
                } catch (error) {
                    console.error('Error al crear préstamo:', error.message);
                }
            }

            // Crear algunos préstamos activos
            for (let i = 0; i < 8; i++) {
                const libroRandom = librosInsertados[Math.floor(Math.random() * librosInsertados.length)];
                const socioRandom = sociosInsertados[Math.floor(Math.random() * sociosInsertados.length)];
                if (!libroRandom || !socioRandom) continue;

                const fechaPrestamo = new Date();
                fechaPrestamo.setDate(fechaPrestamo.getDate() - Math.floor(Math.random() * 15));

                const fechaDevolucion = new Date(fechaPrestamo);
                fechaDevolucion.setDate(fechaDevolucion.getDate() + 14);

                try {
                    const prestamo = await this.createPrestamo({
                        libroId: libroRandom.id,
                        socioId: socioRandom.id,
                        fechaDevolucion: fechaDevolucion.toISOString(),
                        observaciones: 'Préstamo activo'
                    });
                    prestamosInsertados.push(prestamo);
                } catch (error) {
                    console.error('Error al crear préstamo activo:', error.message);
                }
            }

            console.log('Datos ficticios creados exitosamente');

            return {
                success: true,
                message: 'Datos ficticios de UTN-FRLP insertados correctamente',
                librosInsertados: librosInsertados.length,
                sociosInsertados: sociosInsertados.length,
                prestamosInsertados: prestamosInsertados.length
            };
        } catch (error) {
            console.error('Error al insertar datos ficticios:', error);
            throw error;
        }
    }

    // ===== INFORMACIÓN DEL SISTEMA =====

    getDatabaseInfo() {
        return {
            type: 'sqlite',
            path: this.dbPath,
            dialect: 'sqlite'
        };
    }
}

module.exports = DatabaseService;
