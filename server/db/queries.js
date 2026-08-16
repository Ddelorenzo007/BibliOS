const crypto = require('crypto');
const pool = require('./pool');

// ============================================================================
// Traducción de la lógica de negocio de src/main/database/database.js
// (SQLite/better-sqlite3, síncrono) a PostgreSQL (pg, asíncrono).
// Los nombres de método y el comportamiento se mantienen 1:1 respecto de
// la versión SQLite, ya validada con tests. Cambia la capa de acceso a
// datos (placeholders $1/$2, async/await, transacciones explícitas), no
// las reglas de negocio.
// ============================================================================

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

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

// ============================================================================
// Postgres pliega a minúsculas cualquier identificador sin comillas (una
// columna creada como "fechaCreacion" queda literalmente guardada como
// "fechacreacion"). Para no depender de acordarse de aliasear a mano CADA
// columna camelCase en CADA query (ya me olvidé dos veces escribiendo este
// archivo), se arma acá un diccionario único con todas las columnas
// camelCase del esquema, y una función que las remapea automáticamente en
// cualquier fila devuelta por "SELECT *". Es idempotente: si una columna
// ya viene con alias correcto de la query, no la toca.
// ============================================================================
const CAMEL_MAP = {
    passwordhash: 'passwordHash', fechacreacion: 'fechaCreacion',
    lugarpublicacion: 'lugarPublicacion', aniopublicacion: 'anioPublicacion',
    tiposocio: 'tipoSocio', fecharegistro: 'fechaRegistro',
    obraid: 'obraId', personaid: 'personaId', tomoid: 'tomoId',
    numerocontrol: 'numeroControl', numeroinventario: 'numeroInventario',
    fechaalta: 'fechaAlta', ejemplarid: 'ejemplarId', socioid: 'socioId',
    usuarioid: 'usuarioId', fechaprestamo: 'fechaPrestamo',
    fechadevolucionprevista: 'fechaDevolucionPrevista', fechadevolucionreal: 'fechaDevolucionReal',
    prestamoid: 'prestamoId', fecharenovacion: 'fechaRenovacion',
    fechadevolucionanterior: 'fechaDevolucionAnterior', nuevafechadevolucion: 'nuevaFechaDevolucion',
    ejemplarasignadoid: 'ejemplarAsignadoId', fechareserva: 'fechaReserva', fechaatencion: 'fechaAtencion',
    fechainicio: 'fechaInicio', fechafin: 'fechaFin', entidadid: 'entidadId',
    fechahora: 'fechaHora', rutaarchivo: 'rutaArchivo', fechasubida: 'fechaSubida',
    cantidadtomos: 'cantidadTomos', cantidadejemplares: 'cantidadEjemplares',
    ejemplaresdisponibles: 'ejemplaresDisponibles', autorestexto: 'autoresTexto',
    tomonumero: 'tomoNumero', obratitulo: 'obraTitulo', socionombre: 'socioNombre',
    socioapellido: 'socioApellido', sociodni: 'socioDni', usuarionombre: 'usuarioNombre',
};

function camelizeRow(row) {
    if (!row) return row;
    const out = {};
    for (const key of Object.keys(row)) {
        out[CAMEL_MAP[key] || key] = row[key];
    }
    return out;
}
function camelizeRows(rows) {
    return rows.map(camelizeRow);
}

// Ejecuta `fn(client)` dentro de una transacción real (BEGIN/COMMIT/ROLLBACK).
// Equivalente asíncrono de this.db.transaction() de better-sqlite3.
async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// registrarAuditoria no usa transacción propia: si el llamador ya está
// dentro de una (le pasamos el `client`), se inserta con esa conexión;
// si no, usa el pool directo. Un fallo acá nunca debe frenar la operación
// principal, solo se loguea.
async function registrarAuditoria(executor, usuarioId, accion, modulo, entidadId = null, detalle = null, resultado = 'exito') {
    try {
        await executor.query(
            `INSERT INTO auditoria (usuarioId, accion, modulo, entidadId, detalle, resultado)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [usuarioId || null, accion, modulo, entidadId, detalle, resultado]
        );
    } catch (error) {
        console.error('Error al registrar auditoría (no bloqueante):', error);
    }
}

async function getAuditoria(filters = {}) {
    let query = `
        SELECT a.*, u.usuario as "usuarioNombre"
        FROM auditoria a
        LEFT JOIN usuarios u ON a.usuarioId = u.id
        WHERE 1=1
    `;
    const params = [];
    if (filters.modulo) { params.push(filters.modulo); query += ` AND a.modulo = $${params.length}`; }
    if (filters.usuarioId) { params.push(filters.usuarioId); query += ` AND a.usuarioId = $${params.length}`; }
    if (filters.fechaDesde) { params.push(filters.fechaDesde); query += ` AND a.fecha >= $${params.length}`; }
    if (filters.fechaHasta) { params.push(filters.fechaHasta); query += ` AND a.fecha <= $${params.length}`; }
    query += ' ORDER BY a.fecha DESC, a.id DESC';
    if (filters.limit) { params.push(filters.limit); query += ` LIMIT $${params.length}`; }
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

// ===== USUARIOS / AUTENTICACIÓN =====

async function seedDefaultUsuario() {
    try {
        const { rows } = await pool.query('SELECT COUNT(*) as count FROM usuarios');
        if (parseInt(rows[0].count) === 0) {
            await createUsuarioSync(pool, { usuario: 'admin', password: 'biblios2026', nombre: 'Administrador BibliOS (ficticio)', rol: 'administrador' });
            console.log('Usuario ficticio creado -> usuario: "admin" / contraseña: "biblios2026"');
        }
    } catch (error) {
        console.error('Error al crear usuario ficticio por defecto:', error);
    }
}

async function createUsuarioSync(executor, usuarioData) {
    Validators.validateRequired(usuarioData.usuario, 'usuario');
    Validators.validateRequired(usuarioData.password, 'password');
    if (usuarioData.rol && !['administrador', 'bibliotecario'].includes(usuarioData.rol)) {
        throw new Error('El rol debe ser "administrador" o "bibliotecario"');
    }
    const existente = await executor.query('SELECT id FROM usuarios WHERE usuario = $1', [usuarioData.usuario]);
    if (existente.rows.length > 0) throw new Error(`Ya existe un usuario con el nombre "${usuarioData.usuario}".`);
    const salt = generateSalt();
    const passwordHash = hashPassword(usuarioData.password, salt);
    const { rows } = await executor.query(
        `INSERT INTO usuarios (usuario, passwordHash, salt, nombre, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [usuarioData.usuario, passwordHash, salt, usuarioData.nombre || null, usuarioData.rol || 'bibliotecario']
    );
    return getUsuarioById(rows[0].id);
}

async function createUsuario(usuarioData) {
    try {
        const nuevo = await createUsuarioSync(pool, usuarioData);
        await registrarAuditoria(pool, usuarioData.usuarioCreadorId, 'crear', 'usuarios', nuevo.id, `Usuario "${nuevo.usuario}" creado con rol ${nuevo.rol}`);
        return nuevo;
    } catch (error) {
        await registrarAuditoria(pool, usuarioData.usuarioCreadorId, 'crear', 'usuarios', null, error.message, 'fallo');
        console.error('Error al crear usuario:', error);
        throw error;
    }
}

async function getUsuarioById(id) {
    const { rows } = await pool.query(
        `SELECT id, usuario, nombre, rol, estado, fechaCreacion AS "fechaCreacion" FROM usuarios WHERE id = $1`,
        [id]
    );
    return rows[0] || null;
}

async function login(usuario, password) {
    Validators.validateRequired(usuario, 'usuario');
    Validators.validateRequired(password, 'password');
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const row = rows[0];
    if (!row) return { success: false, message: 'Usuario o contraseña incorrectos' };
    const hashedInput = hashPassword(password, row.salt);
    if (hashedInput !== row.passwordhash) return { success: false, message: 'Usuario o contraseña incorrectos' };
    if (row.estado !== 'activo') return { success: false, message: 'Este usuario está inactivo. Contactá al administrador del sistema.' };
    return { success: true, usuario: { id: row.id, usuario: row.usuario, nombre: row.nombre, rol: row.rol } };
}

async function getUsuarios(filters = {}) {
    let query = `SELECT id, usuario, nombre, rol, estado, fechaCreacion AS "fechaCreacion" FROM usuarios WHERE 1=1`;
    const params = [];
    if (filters.rol) { params.push(filters.rol); query += ` AND rol = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND estado = $${params.length}`; }
    query += ' ORDER BY usuario ASC';
    const { rows } = await pool.query(query, params);
    return rows;
}

async function toggleEstadoUsuario(id, nuevoEstado, usuarioQueLoHace) {
    try {
        if (!['activo', 'inactivo'].includes(nuevoEstado)) throw new Error('Estado inválido');
        const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
        const usuario = rows[0];
        if (!usuario) throw new Error('Usuario no encontrado');

        if (id === usuarioQueLoHace && nuevoEstado === 'inactivo') {
            throw new Error('No podés desactivar tu propia cuenta mientras estás logueado con ella');
        }
        if (usuario.rol === 'administrador' && nuevoEstado === 'inactivo') {
            const otros = await pool.query(
                "SELECT COUNT(*) as count FROM usuarios WHERE rol = 'administrador' AND estado = 'activo' AND id != $1",
                [id]
            );
            if (parseInt(otros.rows[0].count) === 0) {
                throw new Error('No se puede desactivar: es el único administrador activo del sistema');
            }
        }
        await pool.query('UPDATE usuarios SET estado = $1 WHERE id = $2', [nuevoEstado, id]);
        await registrarAuditoria(pool, usuarioQueLoHace, nuevoEstado === 'activo' ? 'activar' : 'desactivar', 'usuarios', id, `Usuario "${usuario.usuario}" -> ${nuevoEstado}`);
        return true;
    } catch (error) {
        await registrarAuditoria(pool, usuarioQueLoHace, 'cambiar_estado', 'usuarios', id, error.message, 'fallo');
        console.error('Error al cambiar estado de usuario:', error);
        throw error;
    }
}

// ===== PERSONAS (autores / responsables) =====

async function getPersonas(filters = {}) {
    let query = 'SELECT * FROM personas WHERE 1=1';
    const params = [];
    if (filters.search) {
        params.push(`%${filters.search}%`, `%${filters.search}%`);
        query += ` AND (nombre ILIKE $${params.length - 1} OR apellido ILIKE $${params.length})`;
    }
    query += ' ORDER BY apellido ASC, nombre ASC';
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

// ===== OBRAS =====

async function createObra(obraData) {
    return withTransaction(async (client) => {
        Validators.validateRequired(obraData.titulo, 'titulo');
        Validators.validateRequired(obraData.isbn, 'isbn');
        if (!Validators.validateISBN(obraData.isbn)) {
            throw new Error('El ISBN proporcionado no es válido (debe ser ISBN-10 o ISBN-13)');
        }
        if (obraData.anioPublicacion && !Validators.validateYear(obraData.anioPublicacion)) {
            throw new Error('El año de publicación no es válido');
        }

        const isbnDuplicado = await client.query('SELECT id FROM obras WHERE isbn = $1', [obraData.isbn]);
        if (isbnDuplicado.rows.length > 0) throw new Error(`Ya existe una obra registrada con el ISBN "${obraData.isbn}".`);

        const result = await client.query(
            `INSERT INTO obras (isbn, titulo, subtitulo, categoria, editorial, lugarPublicacion, anioPublicacion, edicion, idioma, descripcion, cabecera)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [
                obraData.isbn, obraData.titulo, obraData.subtitulo || null, obraData.categoria || null, obraData.editorial || null,
                obraData.lugarPublicacion || null, obraData.anioPublicacion || null, obraData.edicion || null,
                obraData.idioma || null, obraData.descripcion || null, obraData.cabecera || null
            ]
        );
        const obraId = result.rows[0].id;

        const personas = obraData.personas || [];
        for (let idx = 0; idx < personas.length; idx++) {
            const p = personas[idx];
            let personaId = p.personaId;
            if (!personaId) {
                Validators.validateRequired(p.nombre, 'nombre de la persona responsable');
                const existente = await client.query(
                    `SELECT id FROM personas WHERE nombre = $1 AND COALESCE(apellido,'') = COALESCE($2,'')`,
                    [p.nombre, p.apellido || null]
                );
                if (existente.rows.length > 0) {
                    personaId = existente.rows[0].id;
                } else {
                    const nuevaPersona = await client.query(
                        'INSERT INTO personas (nombre, apellido) VALUES ($1, $2) RETURNING id',
                        [p.nombre, p.apellido || null]
                    );
                    personaId = nuevaPersona.rows[0].id;
                }
            }
            await client.query(
                'INSERT INTO obra_personas (obraId, personaId, rol, orden) VALUES ($1, $2, $3, $4)',
                [obraId, personaId, p.rol || 'autor', idx + 1]
            );
        }

        const tomo = obraData.tomo || {};
        await client.query(
            `INSERT INTO tomos (obraId, numero, paginas, anioPublicacion, descripcion) VALUES ($1, $2, $3, $4, $5)`,
            [obraId, tomo.numero || 'Único', tomo.paginas || null, tomo.anioPublicacion || obraData.anioPublicacion || null, tomo.descripcion || null]
        );

        return obraId;
    }).then(async (obraId) => {
        await registrarAuditoria(pool, obraData.usuarioId, 'crear', 'obras', obraId, `Obra creada: ${obraData.titulo}`);
        return getObraById(obraId);
    }).catch(async (error) => {
        await registrarAuditoria(pool, obraData.usuarioId, 'crear', 'obras', null, error.message, 'fallo');
        console.error('Error al crear obra:', error);
        throw error;
    });
}

async function getObras(filters = {}) {
    let query = `
        SELECT o.*,
               (SELECT COUNT(*) FROM tomos t WHERE t.obraId = o.id) as "cantidadTomos",
               (SELECT COUNT(*) FROM ejemplares e JOIN tomos t2 ON e.tomoId = t2.id WHERE t2.obraId = o.id) as "cantidadEjemplares",
               (SELECT COUNT(*) FROM ejemplares e JOIN tomos t3 ON e.tomoId = t3.id WHERE t3.obraId = o.id AND e.estado = 'disponible') as "ejemplaresDisponibles",
               (SELECT string_agg(TRIM(p.nombre || ' ' || COALESCE(p.apellido, '')), ', ')
                  FROM obra_personas op JOIN personas p ON op.personaId = p.id
                  WHERE op.obraId = o.id) as "autoresTexto"
        FROM obras o
        WHERE 1=1
    `;
    const params = [];
    if (filters.search) {
        params.push(`%${filters.search}%`);
        const i = params.length;
        query += ` AND (
            o.titulo ILIKE $${i} OR o.subtitulo ILIKE $${i} OR o.isbn ILIKE $${i} OR
            o.id IN (
                SELECT op.obraId FROM obra_personas op JOIN personas p ON op.personaId = p.id
                WHERE p.nombre ILIKE $${i} OR p.apellido ILIKE $${i}
            )
        )`;
    }
    if (filters.isbn) { params.push(filters.isbn); query += ` AND o.isbn = $${params.length}`; }
    if (filters.categoria) { params.push(filters.categoria); query += ` AND o.categoria = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND o.estado = $${params.length}`; }
    else { query += " AND o.estado != 'inactivo'"; }
    query += ' ORDER BY o.titulo ASC';
    if (filters.limit) { params.push(filters.limit); query += ` LIMIT $${params.length}`; }
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

async function getObraById(id) {
    const { rows } = await pool.query('SELECT * FROM obras WHERE id = $1', [id]);
    const obra = camelizeRow(rows[0]);
    if (!obra) return null;

    const personasRes = await pool.query(`
        SELECT p.id, p.nombre, p.apellido, op.rol, op.orden
        FROM obra_personas op JOIN personas p ON op.personaId = p.id
        WHERE op.obraId = $1 ORDER BY op.orden ASC
    `, [id]);
    obra.personas = personasRes.rows;

    const tomosRes = await pool.query('SELECT * FROM tomos WHERE obraId = $1 ORDER BY numero ASC', [id]);
    obra.tomos = camelizeRows(tomosRes.rows);
    for (const tomo of obra.tomos) {
        const ejemplaresRes = await pool.query('SELECT * FROM ejemplares WHERE tomoId = $1 ORDER BY numeroInventario ASC', [tomo.id]);
        tomo.ejemplares = camelizeRows(ejemplaresRes.rows);
    }

    return obra;
}

async function updateObra(id, updates) {
    try {
        const camposDirectos = ['titulo', 'subtitulo', 'categoria', 'editorial', 'lugarPublicacion', 'anioPublicacion', 'edicion', 'idioma', 'descripcion', 'cabecera'];
        const fields = [];
        const values = [];
        camposDirectos.forEach(key => {
            if (updates[key] !== undefined) { values.push(updates[key]); fields.push(`${key} = $${values.length}`); }
        });
        if (fields.length > 0) {
            values.push(id);
            await pool.query(`UPDATE obras SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
        }

        if (updates.personas) {
            await withTransaction(async (client) => {
                await client.query('DELETE FROM obra_personas WHERE obraId = $1', [id]);
                for (let idx = 0; idx < updates.personas.length; idx++) {
                    const p = updates.personas[idx];
                    let personaId = p.personaId;
                    if (!personaId) {
                        const existente = await client.query(
                            `SELECT id FROM personas WHERE nombre = $1 AND COALESCE(apellido,'') = COALESCE($2,'')`,
                            [p.nombre, p.apellido || null]
                        );
                        if (existente.rows.length > 0) {
                            personaId = existente.rows[0].id;
                        } else {
                            const nueva = await client.query('INSERT INTO personas (nombre, apellido) VALUES ($1, $2) RETURNING id', [p.nombre, p.apellido || null]);
                            personaId = nueva.rows[0].id;
                        }
                    }
                    await client.query('INSERT INTO obra_personas (obraId, personaId, rol, orden) VALUES ($1, $2, $3, $4)', [id, personaId, p.rol || 'autor', idx + 1]);
                }
            });
        }

        await registrarAuditoria(pool, updates.usuarioId, 'modificar', 'obras', id, 'Obra modificada');
        return true;
    } catch (error) {
        await registrarAuditoria(pool, updates.usuarioId, 'modificar', 'obras', id, error.message, 'fallo');
        console.error('Error al actualizar obra:', error);
        throw error;
    }
}

async function darDeBajaObra(id, usuarioId) {
    try {
        const ok = await withTransaction(async (client) => {
            const prestamosActivos = await client.query(`
                SELECT COUNT(*) as count FROM prestamos p
                JOIN ejemplares e ON p.ejemplarId = e.id
                JOIN tomos t ON e.tomoId = t.id
                WHERE t.obraId = $1 AND p.estado = 'activo'
            `, [id]);
            if (parseInt(prestamosActivos.rows[0].count) > 0) {
                throw new Error(`No se puede dar de baja la obra: tiene ${prestamosActivos.rows[0].count} préstamo(s) activo(s).`);
            }
            const reservasPendientes = await client.query(
                `SELECT COUNT(*) as count FROM reservas WHERE obraId = $1 AND estado = 'pendiente'`, [id]
            );
            if (parseInt(reservasPendientes.rows[0].count) > 0) {
                throw new Error(`No se puede dar de baja la obra: tiene ${reservasPendientes.rows[0].count} reserva(s) pendiente(s).`);
            }
            const result = await client.query(`UPDATE obras SET estado = 'inactivo' WHERE id = $1`, [id]);
            return result.rowCount > 0;
        });
        await registrarAuditoria(pool, usuarioId, 'baja', 'obras', id, 'Obra dada de baja');
        return ok;
    } catch (error) {
        await registrarAuditoria(pool, usuarioId, 'baja', 'obras', id, error.message, 'fallo');
        console.error('Error al dar de baja obra:', error);
        throw error;
    }
}

// ===== TOMOS =====

async function createTomo(tomoData) {
    try {
        Validators.validateRequired(tomoData.obraId, 'obraId');
        const { rows } = await pool.query(
            `INSERT INTO tomos (obraId, numero, paginas, anioPublicacion, descripcion) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [tomoData.obraId, tomoData.numero || 'Único', tomoData.paginas || null, tomoData.anioPublicacion || null, tomoData.descripcion || null]
        );
        return camelizeRow(rows[0]);
    } catch (error) {
        console.error('Error al crear tomo:', error);
        throw error;
    }
}

async function getTomosByObra(obraId) {
    const { rows } = await pool.query('SELECT * FROM tomos WHERE obraId = $1 ORDER BY numero ASC', [obraId]);
    return camelizeRows(rows);
}

// ===== EJEMPLARES =====

async function createEjemplar(ejemplarData) {
    try {
        const id = await withTransaction(async (client) => {
            Validators.validateRequired(ejemplarData.tomoId, 'tomoId');
            Validators.validateRequired(ejemplarData.numeroInventario, 'numeroInventario');

            const tomo = await client.query('SELECT * FROM tomos WHERE id = $1', [ejemplarData.tomoId]);
            if (tomo.rows.length === 0) throw new Error('El tomo especificado no existe');

            const duplicado = await client.query('SELECT id FROM ejemplares WHERE numeroInventario = $1', [ejemplarData.numeroInventario]);
            if (duplicado.rows.length > 0) throw new Error(`El número de inventario manual "${ejemplarData.numeroInventario}" ya existe.`);

            const result = await client.query(
                `INSERT INTO ejemplares (tomoId, numeroControl, numeroInventario, ubicacion, estado)
                 VALUES ($1, 'TEMP', $2, $3, $4) RETURNING id`,
                [ejemplarData.tomoId, ejemplarData.numeroInventario, ejemplarData.ubicacion || null, ejemplarData.estado || 'disponible']
            );
            const nuevoId = result.rows[0].id;
            const numeroControl = `C-${String(nuevoId).padStart(6, '0')}`;
            await client.query('UPDATE ejemplares SET numeroControl = $1 WHERE id = $2', [numeroControl, nuevoId]);
            return nuevoId;
        });

        await registrarAuditoria(pool, ejemplarData.usuarioId, 'crear', 'ejemplares', id, `Ejemplar creado (inventario: ${ejemplarData.numeroInventario})`);
        return getEjemplarById(id);
    } catch (error) {
        console.error('Error al crear ejemplar:', error);
        throw error;
    }
}

async function getEjemplares(filters = {}) {
    let query = `
        SELECT ej.*, t.numero as "tomoNumero", o.isbn, o.id as "obraId", o.titulo as "obraTitulo"
        FROM ejemplares ej
        JOIN tomos t ON ej.tomoId = t.id
        JOIN obras o ON t.obraId = o.id
        WHERE 1=1
    `;
    const params = [];
    if (filters.tomoId) { params.push(filters.tomoId); query += ` AND ej.tomoId = $${params.length}`; }
    if (filters.obraId) { params.push(filters.obraId); query += ` AND o.id = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND ej.estado = $${params.length}`; }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        const i = params.length;
        query += ` AND (ej.numeroInventario ILIKE $${i} OR ej.numeroControl ILIKE $${i} OR o.titulo ILIKE $${i})`;
    }
    query += ' ORDER BY o.titulo ASC, t.numero ASC';
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

async function getEjemplarById(id) {
    const { rows } = await pool.query(`
        SELECT ej.*, t.numero as "tomoNumero", o.isbn, o.id as "obraId", o.titulo as "obraTitulo"
        FROM ejemplares ej
        JOIN tomos t ON ej.tomoId = t.id
        JOIN obras o ON t.obraId = o.id
        WHERE ej.id = $1
    `, [id]);
    return camelizeRow(rows[0]) || null;
}

async function updateEjemplar(id, updates) {
    try {
        const fields = [];
        const values = [];
        ['ubicacion', 'estado'].forEach(key => {
            if (updates[key] !== undefined) { values.push(updates[key]); fields.push(`${key} = $${values.length}`); }
        });
        if (fields.length === 0) return false;
        values.push(id);
        const result = await pool.query(`UPDATE ejemplares SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
        await registrarAuditoria(pool, updates.usuarioId, 'modificar', 'ejemplares', id, `Estado actualizado: ${updates.estado || ''}`);
        return result.rowCount > 0;
    } catch (error) {
        console.error('Error al actualizar ejemplar:', error);
        throw error;
    }
}

// ===== SOCIOS =====

async function createSocio(socioData) {
    try {
        Validators.validateRequired(socioData.nombre, 'nombre');
        Validators.validateRequired(socioData.apellido, 'apellido');
        Validators.validateRequired(socioData.dni, 'dni');
        Validators.validateRequired(socioData.email, 'email');

        if (!Validators.validateDNI(socioData.dni)) throw new Error('El DNI proporcionado no es válido');
        if (!Validators.validateEmail(socioData.email)) throw new Error('El email proporcionado no es válido');
        if (socioData.telefono && !Validators.validatePhone(socioData.telefono)) throw new Error('El teléfono debe tener al menos 10 dígitos');
        if (!Validators.validateTipoSocio(socioData.tipoSocio)) throw new Error('El tipo de socio debe ser alumno, graduado, docente o no_docente');

        const dniDup = await pool.query('SELECT id FROM socios WHERE dni = $1', [socioData.dni]);
        if (dniDup.rows.length > 0) throw new Error(`Ya existe un socio registrado con el DNI "${socioData.dni}".`);

        const emailNorm = socioData.email.toLowerCase().trim();
        const emailDup = await pool.query('SELECT id FROM socios WHERE LOWER(TRIM(email)) = $1', [emailNorm]);
        if (emailDup.rows.length > 0) throw new Error(`Ya existe un socio con el email "${socioData.email}".`);

        if (socioData.legajo) {
            const legajoDup = await pool.query('SELECT id FROM socios WHERE legajo = $1', [socioData.legajo]);
            if (legajoDup.rows.length > 0) throw new Error(`Ya existe un socio con el legajo "${socioData.legajo}".`);
        }

        const { rows } = await pool.query(
            `INSERT INTO socios (nombre, apellido, dni, legajo, tipoSocio, email, telefono, direccion, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [socioData.nombre, socioData.apellido, socioData.dni, socioData.legajo || null, socioData.tipoSocio,
             socioData.email, socioData.telefono || null, socioData.direccion || null, socioData.observaciones || null]
        );

        await registrarAuditoria(pool, socioData.usuarioId, 'crear', 'socios', rows[0].id, `Socio registrado: ${socioData.nombre} ${socioData.apellido}`);
        return getSocioById(rows[0].id);
    } catch (error) {
        console.error('Error al crear socio:', error);
        throw error;
    }
}

async function getSocios(filters = {}) {
    let query = 'SELECT * FROM socios WHERE 1=1';
    const params = [];
    if (filters.search) {
        params.push(`%${filters.search}%`);
        const i = params.length;
        query += ` AND (nombre ILIKE $${i} OR apellido ILIKE $${i} OR dni ILIKE $${i} OR legajo ILIKE $${i} OR email ILIKE $${i})`;
    }
    if (filters.tipoSocio) { params.push(filters.tipoSocio); query += ` AND tipoSocio = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND estado = $${params.length}`; }
    query += ' ORDER BY apellido ASC, nombre ASC';
    if (filters.limit) { params.push(filters.limit); query += ` LIMIT $${params.length}`; }
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

async function getSocioById(id) {
    const { rows } = await pool.query('SELECT * FROM socios WHERE id = $1', [id]);
    return camelizeRow(rows[0]) || null;
}

async function updateSocio(id, updates) {
    try {
        if (updates.email !== undefined) {
            if (!Validators.validateEmail(updates.email)) throw new Error('El email proporcionado no es válido');
            const emailNorm = updates.email.toLowerCase().trim();
            const existente = await pool.query('SELECT id FROM socios WHERE LOWER(TRIM(email)) = $1 AND id != $2', [emailNorm, id]);
            if (existente.rows.length > 0) throw new Error(`Ya existe un socio con el email "${updates.email}".`);
        }
        if (updates.dni !== undefined) {
            const existente = await pool.query('SELECT id FROM socios WHERE dni = $1 AND id != $2', [updates.dni, id]);
            if (existente.rows.length > 0) throw new Error(`Ya existe un socio con el DNI "${updates.dni}".`);
        }
        if (updates.legajo) {
            const existente = await pool.query('SELECT id FROM socios WHERE legajo = $1 AND id != $2', [updates.legajo, id]);
            if (existente.rows.length > 0) throw new Error(`Ya existe un socio con el legajo "${updates.legajo}".`);
        }
        if (updates.tipoSocio !== undefined && !Validators.validateTipoSocio(updates.tipoSocio)) {
            throw new Error('El tipo de socio debe ser alumno, graduado, docente o no_docente');
        }

        const camposPermitidos = ['nombre', 'apellido', 'dni', 'legajo', 'tipoSocio', 'email', 'telefono', 'direccion', 'estado', 'observaciones'];
        const fields = [];
        const values = [];
        camposPermitidos.forEach(key => {
            if (updates[key] !== undefined) { values.push(updates[key]); fields.push(`${key} = $${values.length}`); }
        });
        if (fields.length === 0) return false;
        values.push(id);
        const result = await pool.query(`UPDATE socios SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
        await registrarAuditoria(pool, updates.usuarioId, 'modificar', 'socios', id, 'Socio modificado');
        return result.rowCount > 0;
    } catch (error) {
        console.error('Error al actualizar socio:', error);
        throw error;
    }
}

async function darDeBajaSocio(id, usuarioId) {
    try {
        const ok = await withTransaction(async (client) => {
            const prestamosActivos = await client.query(`SELECT COUNT(*) as count FROM prestamos WHERE socioId = $1 AND estado = 'activo'`, [id]);
            if (parseInt(prestamosActivos.rows[0].count) > 0) throw new Error(`No se puede dar de baja: el socio tiene ${prestamosActivos.rows[0].count} préstamo(s) activo(s).`);

            const sancionesVigentes = await client.query(`SELECT COUNT(*) as count FROM sanciones WHERE socioId = $1 AND estado = 'vigente'`, [id]);
            if (parseInt(sancionesVigentes.rows[0].count) > 0) throw new Error('No se puede dar de baja: el socio tiene sanciones vigentes.');

            const result = await client.query(`UPDATE socios SET estado = 'inactivo' WHERE id = $1`, [id]);
            return result.rowCount > 0;
        });
        await registrarAuditoria(pool, usuarioId, 'baja', 'socios', id, 'Socio dado de baja');
        return ok;
    } catch (error) {
        await registrarAuditoria(pool, usuarioId, 'baja', 'socios', id, error.message, 'fallo');
        console.error('Error al dar de baja socio:', error);
        throw error;
    }
}

// ===== SANCIONES =====

async function aplicarSancion(sancionData) {
    try {
        const id = await withTransaction(async (client) => {
            Validators.validateRequired(sancionData.socioId, 'socioId');
            Validators.validateRequired(sancionData.motivo, 'motivo');
            Validators.validateRequired(sancionData.fechaFin, 'fechaFin');

            if (new Date(sancionData.fechaFin) <= new Date()) {
                throw new Error('La fecha de fin de la sanción debe ser posterior a la fecha actual');
            }
            const socio = await client.query('SELECT * FROM socios WHERE id = $1', [sancionData.socioId]);
            if (socio.rows.length === 0) throw new Error('El socio especificado no existe');

            const result = await client.query(
                `INSERT INTO sanciones (socioId, usuarioId, motivo, fechaFin, observaciones) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [sancionData.socioId, sancionData.usuarioId || null, sancionData.motivo, sancionData.fechaFin, sancionData.observaciones || null]
            );
            await client.query(`UPDATE socios SET estado = 'sancionado' WHERE id = $1`, [sancionData.socioId]);
            return result.rows[0].id;
        });
        await registrarAuditoria(pool, sancionData.usuarioId, 'crear', 'sanciones', id, `Sanción aplicada a socio ${sancionData.socioId}: ${sancionData.motivo}`);
        const { rows } = await pool.query('SELECT * FROM sanciones WHERE id = $1', [id]);
        return camelizeRow(rows[0]);
    } catch (error) {
        await registrarAuditoria(pool, sancionData.usuarioId, 'crear', 'sanciones', null, error.message, 'fallo');
        console.error('Error al aplicar sanción:', error);
        throw error;
    }
}

async function finalizarSancion(id, usuarioId) {
    try {
        const ok = await withTransaction(async (client) => {
            const sancion = await client.query('SELECT * FROM sanciones WHERE id = $1', [id]);
            if (sancion.rows.length === 0) throw new Error('Sanción no encontrada');

            await client.query(`UPDATE sanciones SET estado = 'finalizada' WHERE id = $1`, [id]);

            const otras = await client.query(
                `SELECT COUNT(*) as count FROM sanciones WHERE socioId = $1 AND estado = 'vigente' AND id != $2`,
                [sancion.rows[0].socioid, id]
            );
            if (parseInt(otras.rows[0].count) === 0) {
                await client.query(`UPDATE socios SET estado = 'activo' WHERE id = $1 AND estado = 'sancionado'`, [sancion.rows[0].socioid]);
            }
            return true;
        });
        await registrarAuditoria(pool, usuarioId, 'finalizar', 'sanciones', id, 'Sanción finalizada manualmente');
        return ok;
    } catch (error) {
        console.error('Error al finalizar sanción:', error);
        throw error;
    }
}

async function getSancionesBySocio(socioId) {
    const { rows } = await pool.query('SELECT * FROM sanciones WHERE socioId = $1 ORDER BY fechaInicio DESC, id DESC', [socioId]);
    return camelizeRows(rows);
}

async function tieneSancionVigente(socioId) {
    const { rows } = await pool.query(
        `SELECT id FROM sanciones WHERE socioId = $1 AND estado = 'vigente' AND fechaFin > now()`, [socioId]
    );
    return rows.length > 0;
}

// ===== PRÉSTAMOS =====

async function createPrestamo(prestamoData) {
    try {
        const id = await withTransaction(async (client) => {
            Validators.validateRequired(prestamoData.ejemplarId, 'ejemplarId');
            Validators.validateRequired(prestamoData.socioId, 'socioId');

            const socioRes = await client.query('SELECT * FROM socios WHERE id = $1', [prestamoData.socioId]);
            const socio = socioRes.rows[0];
            if (!socio) throw new Error('El socio especificado no existe');
            const sancionVigente = await client.query(
                `SELECT id FROM sanciones WHERE socioId = $1 AND estado = 'vigente' AND fechaFin > now()`, [prestamoData.socioId]
            );
            if (socio.estado === 'sancionado' || sancionVigente.rows.length > 0) {
                throw new Error('El socio posee una sanción vigente y no puede retirar material en préstamo');
            }
            if (socio.estado !== 'activo') throw new Error('El socio no está en estado activo');

            const ejemplarRes = await client.query('SELECT * FROM ejemplares WHERE id = $1', [prestamoData.ejemplarId]);
            const ejemplar = ejemplarRes.rows[0];
            if (!ejemplar) throw new Error('El ejemplar especificado no existe');

            let reservaACerrar = null;
            if (ejemplar.estado !== 'disponible') {
                if (ejemplar.estado === 'reservado') {
                    const reservaRes = await client.query(
                        `SELECT id FROM reservas WHERE ejemplarAsignadoId = $1 AND socioId = $2 AND estado = 'pendiente'`,
                        [prestamoData.ejemplarId, prestamoData.socioId]
                    );
                    reservaACerrar = reservaRes.rows[0] || null;
                }
                if (!reservaACerrar) throw new Error(`El ejemplar no está disponible (estado actual: ${ejemplar.estado})`);
            }

            const fechaDevolucionPrevista = prestamoData.fechaDevolucionPrevista || (() => {
                const f = new Date(); f.setDate(f.getDate() + 14); return f.toISOString();
            })();

            const result = await client.query(
                `INSERT INTO prestamos (ejemplarId, socioId, usuarioId, fechaDevolucionPrevista, observaciones)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [prestamoData.ejemplarId, prestamoData.socioId, prestamoData.usuarioId || null, fechaDevolucionPrevista, prestamoData.observaciones || null]
            );
            await client.query(`UPDATE ejemplares SET estado = 'prestado' WHERE id = $1`, [prestamoData.ejemplarId]);

            if (reservaACerrar) {
                await client.query(`UPDATE reservas SET estado = 'atendida', fechaAtencion = now() WHERE id = $1`, [reservaACerrar.id]);
            }
            return result.rows[0].id;
        });

        await registrarAuditoria(pool, prestamoData.usuarioId, 'crear', 'prestamos', id, `Préstamo registrado (ejemplar ${prestamoData.ejemplarId}, socio ${prestamoData.socioId})`);
        return getPrestamoById(id);
    } catch (error) {
        await registrarAuditoria(pool, prestamoData.usuarioId, 'crear', 'prestamos', null, error.message, 'fallo');
        console.error('Error al crear préstamo:', error);
        throw error;
    }
}

async function getPrestamos(filters = {}) {
    let query = `
        SELECT p.*,
               o.titulo as "obraTitulo", ej.numeroInventario as "numeroInventario", ej.numeroControl as "numeroControl",
               s.nombre as "socioNombre", s.apellido as "socioApellido", s.dni as "socioDni"
        FROM prestamos p
        LEFT JOIN ejemplares ej ON p.ejemplarId = ej.id
        LEFT JOIN tomos t ON ej.tomoId = t.id
        LEFT JOIN obras o ON t.obraId = o.id
        LEFT JOIN socios s ON p.socioId = s.id
        WHERE 1=1
    `;
    const params = [];
    if (filters.estado) { params.push(filters.estado); query += ` AND p.estado = $${params.length}`; }
    if (filters.socioId) { params.push(filters.socioId); query += ` AND p.socioId = $${params.length}`; }
    if (filters.fechaDesde) { params.push(filters.fechaDesde); query += ` AND p.fechaPrestamo >= $${params.length}`; }
    if (filters.fechaHasta) { params.push(filters.fechaHasta); query += ` AND p.fechaPrestamo <= $${params.length}`; }
    query += ' ORDER BY p.fechaPrestamo DESC, p.id DESC';
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

async function getPrestamoById(id) {
    const { rows } = await pool.query(`
        SELECT p.*, o.titulo as "obraTitulo", ej.numeroInventario as "numeroInventario",
               s.nombre as "socioNombre", s.apellido as "socioApellido"
        FROM prestamos p
        LEFT JOIN ejemplares ej ON p.ejemplarId = ej.id
        LEFT JOIN tomos t ON ej.tomoId = t.id
        LEFT JOIN obras o ON t.obraId = o.id
        LEFT JOIN socios s ON p.socioId = s.id
        WHERE p.id = $1
    `, [id]);
    return camelizeRow(rows[0]) || null;
}

async function devolverLibro(prestamoId, usuarioId) {
    try {
        const resultado = await withTransaction(async (client) => {
            const prestamoRes = await client.query('SELECT * FROM prestamos WHERE id = $1', [prestamoId]);
            const prestamo = prestamoRes.rows[0];
            if (!prestamo) throw new Error('Préstamo no encontrado');
            if (prestamo.estado === 'devuelto') throw new Error('El préstamo ya está devuelto');

            const conMora = new Date(prestamo.fechadevolucionprevista) < new Date();

            await client.query(`UPDATE prestamos SET estado = 'devuelto', fechaDevolucionReal = now() WHERE id = $1`, [prestamoId]);

            let reservaAtendida = null;
            if (prestamo.ejemplarid) {
                const ejemplarRes = await client.query(`
                    SELECT ej.*, t.obraId FROM ejemplares ej JOIN tomos t ON ej.tomoId = t.id WHERE ej.id = $1
                `, [prestamo.ejemplarid]);
                const ejemplar = ejemplarRes.rows[0];

                const reservaRes = ejemplar ? await client.query(
                    `SELECT * FROM reservas WHERE obraId = $1 AND estado = 'pendiente' AND ejemplarAsignadoId IS NULL ORDER BY prioridad ASC LIMIT 1`,
                    [ejemplar.obraid]
                ) : { rows: [] };
                const reservaPendiente = reservaRes.rows[0] || null;

                if (reservaPendiente) {
                    await client.query(`UPDATE ejemplares SET estado = 'reservado' WHERE id = $1`, [prestamo.ejemplarid]);
                    await client.query('UPDATE reservas SET ejemplarAsignadoId = $1 WHERE id = $2', [prestamo.ejemplarid, reservaPendiente.id]);
                    reservaAtendida = camelizeRow(reservaPendiente);
                } else {
                    await client.query(`UPDATE ejemplares SET estado = 'disponible' WHERE id = $1`, [prestamo.ejemplarid]);
                }
            }
            return { conMora, reservaAtendida };
        });

        await registrarAuditoria(pool, usuarioId, 'devolucion', 'prestamos', prestamoId, resultado.conMora ? 'Devolución con mora' : 'Devolución en término');
        return resultado;
    } catch (error) {
        await registrarAuditoria(pool, usuarioId, 'devolucion', 'prestamos', prestamoId, error.message, 'fallo');
        console.error('Error al devolver libro:', error);
        throw error;
    }
}

async function renovarPrestamo(prestamoId, usuarioId) {
    try {
        const nuevaFecha = await withTransaction(async (client) => {
            const prestamoRes = await client.query('SELECT * FROM prestamos WHERE id = $1', [prestamoId]);
            const prestamo = prestamoRes.rows[0];
            if (!prestamo) throw new Error('Préstamo no encontrado');
            if (prestamo.estado !== 'activo') throw new Error('Solo se pueden renovar préstamos activos');
            if (new Date(prestamo.fechadevolucionprevista) < new Date()) throw new Error('El préstamo está vencido, no se puede renovar');

            const sancionVigente = await client.query(
                `SELECT id FROM sanciones WHERE socioId = $1 AND estado = 'vigente' AND fechaFin > now()`, [prestamo.socioid]
            );
            if (sancionVigente.rows.length > 0) throw new Error('El socio posee una sanción vigente, no se puede renovar el préstamo');

            if (prestamo.ejemplarid) {
                const ejemplarRes = await client.query(
                    `SELECT ej.*, t.obraId FROM ejemplares ej JOIN tomos t ON ej.tomoId = t.id WHERE ej.id = $1`, [prestamo.ejemplarid]
                );
                const ejemplar = ejemplarRes.rows[0];
                if (ejemplar) {
                    const reservaRes = await client.query(
                        `SELECT id FROM reservas WHERE obraId = $1 AND estado = 'pendiente' LIMIT 1`, [ejemplar.obraid]
                    );
                    if (reservaRes.rows.length > 0) throw new Error('Existe una reserva pendiente sobre esta obra, no se puede renovar');
                }
            }

            const fechaAnterior = prestamo.fechadevolucionprevista;
            const nueva = new Date(fechaAnterior);
            nueva.setDate(nueva.getDate() + 7);
            const nuevaFechaISO = nueva.toISOString();

            await client.query('UPDATE prestamos SET fechaDevolucionPrevista = $1 WHERE id = $2', [nuevaFechaISO, prestamoId]);
            await client.query(
                `INSERT INTO renovaciones (prestamoId, usuarioId, fechaDevolucionAnterior, nuevaFechaDevolucion) VALUES ($1, $2, $3, $4)`,
                [prestamoId, usuarioId || null, fechaAnterior, nuevaFechaISO]
            );
            return nuevaFechaISO;
        });

        await registrarAuditoria(pool, usuarioId, 'renovar', 'prestamos', prestamoId, `Renovado hasta ${nuevaFecha}`);
        return getPrestamoById(prestamoId);
    } catch (error) {
        await registrarAuditoria(pool, usuarioId, 'renovar', 'prestamos', prestamoId, error.message, 'fallo');
        console.error('Error al renovar préstamo:', error);
        throw error;
    }
}

async function actualizarPrestamosVencidos() {
    const result = await pool.query(
        `UPDATE prestamos SET estado = 'vencido' WHERE estado = 'activo' AND fechaDevolucionPrevista < now()`
    );
    return result.rowCount;
}

// ===== RESERVAS =====

async function createReserva(reservaData) {
    try {
        const id = await withTransaction(async (client) => {
            Validators.validateRequired(reservaData.obraId, 'obraId');
            Validators.validateRequired(reservaData.socioId, 'socioId');

            const socioRes = await client.query('SELECT * FROM socios WHERE id = $1', [reservaData.socioId]);
            const socio = socioRes.rows[0];
            if (!socio) throw new Error('El socio especificado no existe');
            if (socio.estado !== 'activo') throw new Error('El socio debe estar activo para reservar');

            const sancionVigente = await client.query(
                `SELECT id FROM sanciones WHERE socioId = $1 AND estado = 'vigente' AND fechaFin > now()`, [reservaData.socioId]
            );
            if (sancionVigente.rows.length > 0) throw new Error('El socio posee una sanción vigente y no puede registrar reservas');

            const reservaExistente = await client.query(
                `SELECT id FROM reservas WHERE obraId = $1 AND socioId = $2 AND estado = 'pendiente'`,
                [reservaData.obraId, reservaData.socioId]
            );
            if (reservaExistente.rows.length > 0) throw new Error('El socio ya tiene una reserva pendiente para esta obra');

            const ejemplarDisponible = await client.query(`
                SELECT ej.id FROM ejemplares ej JOIN tomos t ON ej.tomoId = t.id
                WHERE t.obraId = $1 AND ej.estado = 'disponible' LIMIT 1
            `, [reservaData.obraId]);
            if (ejemplarDisponible.rows.length > 0) {
                throw new Error('La obra tiene ejemplares disponibles: registrá un préstamo directo en vez de una reserva');
            }

            const maxPrioridad = await client.query(
                `SELECT COALESCE(MAX(prioridad), 0) as max FROM reservas WHERE obraId = $1 AND estado = 'pendiente'`,
                [reservaData.obraId]
            );

            const result = await client.query(
                `INSERT INTO reservas (obraId, socioId, prioridad, observaciones) VALUES ($1, $2, $3, $4) RETURNING id`,
                [reservaData.obraId, reservaData.socioId, parseInt(maxPrioridad.rows[0].max) + 1, reservaData.observaciones || null]
            );
            return result.rows[0].id;
        });

        await registrarAuditoria(pool, reservaData.usuarioId, 'crear', 'reservas', id, `Reserva registrada (obra ${reservaData.obraId}, socio ${reservaData.socioId})`);
        const { rows } = await pool.query('SELECT * FROM reservas WHERE id = $1', [id]);
        return camelizeRow(rows[0]);
    } catch (error) {
        await registrarAuditoria(pool, reservaData.usuarioId, 'crear', 'reservas', null, error.message, 'fallo');
        console.error('Error al crear reserva:', error);
        throw error;
    }
}

async function getReservas(filters = {}) {
    let query = `
        SELECT r.*, o.titulo as "obraTitulo", s.nombre as "socioNombre", s.apellido as "socioApellido"
        FROM reservas r
        JOIN obras o ON r.obraId = o.id
        JOIN socios s ON r.socioId = s.id
        WHERE 1=1
    `;
    const params = [];
    if (filters.estado) { params.push(filters.estado); query += ` AND r.estado = $${params.length}`; }
    if (filters.obraId) { params.push(filters.obraId); query += ` AND r.obraId = $${params.length}`; }
    if (filters.socioId) { params.push(filters.socioId); query += ` AND r.socioId = $${params.length}`; }
    query += ' ORDER BY r.prioridad ASC';
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

async function cancelarReserva(id, usuarioId) {
    try {
        const resultado = await withTransaction(async (client) => {
            const reservaRes = await client.query('SELECT * FROM reservas WHERE id = $1', [id]);
            const reserva = reservaRes.rows[0];
            if (!reserva) throw new Error('Reserva no encontrada');

            await client.query(`UPDATE reservas SET estado = 'cancelada' WHERE id = $1`, [id]);

            // Si esta reserva ya tenía un ejemplar apartado (estado
            // "reservado"), hay que liberarlo -- si no, queda huérfano:
            // "reservado" para siempre, sin ninguna reserva pendiente real
            // que lo justifique.
            if (reserva.ejemplarasignadoid) {
                // Por si hay otra reserva pendiente detrás en la cola para
                // la misma obra, se lo pasamos a ella directamente en vez
                // de dejarlo "disponible" y que cualquiera se lo lleve
                // salteando el orden de espera.
                const siguienteRes = await client.query(`
                    SELECT * FROM reservas
                    WHERE obraId = $1 AND estado = 'pendiente' AND ejemplarAsignadoId IS NULL AND id != $2
                    ORDER BY prioridad ASC LIMIT 1
                `, [reserva.obraid, id]);
                const siguiente = siguienteRes.rows[0];

                if (siguiente) {
                    await client.query('UPDATE reservas SET ejemplarAsignadoId = $1 WHERE id = $2', [reserva.ejemplarasignadoid, siguiente.id]);
                    // el ejemplar queda "reservado" igual, pero ahora para la próxima persona en la cola
                } else {
                    await client.query(`UPDATE ejemplares SET estado = 'disponible' WHERE id = $1`, [reserva.ejemplarasignadoid]);
                }
            }
            return true;
        });
        await registrarAuditoria(pool, usuarioId, 'cancelar', 'reservas', id, 'Reserva cancelada');
        return resultado;
    } catch (error) {
        await registrarAuditoria(pool, usuarioId, 'cancelar', 'reservas', id, error.message, 'fallo');
        console.error('Error al cancelar reserva:', error);
        throw error;
    }
}

async function atenderReserva(id, usuarioId) {
    const result = await pool.query(`UPDATE reservas SET estado = 'atendida', fechaAtencion = now() WHERE id = $1`, [id]);
    await registrarAuditoria(pool, usuarioId, 'atender', 'reservas', id, 'Reserva atendida');
    return result.rowCount > 0;
}

// ===== INGRESOS A SALA =====

async function registrarIngreso(ingresoData) {
    try {
        Validators.validateRequired(ingresoData.socioId, 'socioId');
        const { rows } = await pool.query(
            'INSERT INTO ingresos (socioId, observaciones) VALUES ($1, $2) RETURNING *',
            [ingresoData.socioId, ingresoData.observaciones || null]
        );
        return camelizeRow(rows[0]);
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        throw error;
    }
}

async function getIngresos(filters = {}) {
    let query = `
        SELECT i.*, s.nombre as "socioNombre", s.apellido as "socioApellido", s.dni as "socioDni"
        FROM ingresos i JOIN socios s ON i.socioId = s.id WHERE 1=1
    `;
    const params = [];
    if (filters.socioId) { params.push(filters.socioId); query += ` AND i.socioId = $${params.length}`; }
    if (filters.fechaDesde) { params.push(filters.fechaDesde); query += ` AND i.fechaHora >= $${params.length}`; }
    if (filters.fechaHasta) { params.push(filters.fechaHasta); query += ` AND i.fechaHora <= $${params.length}`; }
    query += ' ORDER BY i.fechaHora DESC, i.id DESC';
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

// ===== DOCUMENTACIÓN INSTITUCIONAL =====

async function subirDocumento(docData) {
    try {
        Validators.validateRequired(docData.nombre, 'nombre');
        Validators.validateRequired(docData.categoria, 'categoria');
        Validators.validateRequired(docData.rutaArchivo, 'rutaArchivo');
        if (!['pdf', 'doc', 'docx'].includes(docData.tipo)) throw new Error('Formato de archivo no válido (debe ser pdf, doc o docx)');

        const { rows } = await pool.query(
            `INSERT INTO documentos_institucionales (nombre, categoria, rutaArchivo, tipo, descripcion, usuarioId)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [docData.nombre, docData.categoria, docData.rutaArchivo, docData.tipo, docData.descripcion || null, docData.usuarioId || null]
        );
        await registrarAuditoria(pool, docData.usuarioId, 'crear', 'documentos', rows[0].id, `Documento subido: ${docData.nombre}`);
        const doc = await pool.query('SELECT * FROM documentos_institucionales WHERE id = $1', [rows[0].id]);
        return camelizeRow(doc.rows[0]);
    } catch (error) {
        console.error('Error al subir documento:', error);
        throw error;
    }
}

async function getDocumentos(filters = {}) {
    let query = 'SELECT * FROM documentos_institucionales WHERE 1=1';
    const params = [];
    if (filters.categoria) { params.push(filters.categoria); query += ` AND categoria = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND estado = $${params.length}`; }
    else { query += " AND estado = 'activo'"; }
    query += ' ORDER BY fechaSubida DESC, id DESC';
    const { rows } = await pool.query(query, params);
    return camelizeRows(rows);
}

async function darDeBajaDocumento(id, usuarioId) {
    const result = await pool.query(`UPDATE documentos_institucionales SET estado = 'inactivo' WHERE id = $1`, [id]);
    await registrarAuditoria(pool, usuarioId, 'baja', 'documentos', id, 'Documento dado de baja');
    return result.rowCount > 0;
}

// ===== ESTADÍSTICAS =====

async function getStats() {
    const { rows } = await pool.query(`
        SELECT 'obras' as tipo, COUNT(*) as count FROM obras WHERE estado = 'activo'
        UNION ALL SELECT 'ejemplares', COUNT(*) FROM ejemplares
        UNION ALL SELECT 'ejemplares_disponibles', COUNT(*) FROM ejemplares WHERE estado = 'disponible'
        UNION ALL SELECT 'socios', COUNT(*) FROM socios WHERE estado != 'inactivo'
        UNION ALL SELECT 'prestamos_activos', COUNT(*) FROM prestamos WHERE estado = 'activo'
        UNION ALL SELECT 'prestamos_vencidos', COUNT(*) FROM prestamos WHERE estado = 'activo' AND fechaDevolucionPrevista < now()
        UNION ALL SELECT 'prestamos_devueltos', COUNT(*) FROM prestamos WHERE estado = 'devuelto'
        UNION ALL SELECT 'reservas_pendientes', COUNT(*) FROM reservas WHERE estado = 'pendiente'
        UNION ALL SELECT 'sanciones_vigentes', COUNT(*) FROM sanciones WHERE estado = 'vigente'
    `);
    const map = {
        obras: 'totalObras', ejemplares: 'totalEjemplares', ejemplares_disponibles: 'ejemplaresDisponibles',
        socios: 'totalSocios', prestamos_activos: 'prestamosActivos', prestamos_vencidos: 'prestamosVencidos',
        prestamos_devueltos: 'prestamosDevueltos', reservas_pendientes: 'reservasPendientes', sanciones_vigentes: 'sancionesVigentes'
    };
    const stats = {};
    rows.forEach(row => { stats[map[row.tipo]] = parseInt(row.count); });
    return stats;
}

async function getPrestamosPorMes(meses = 6) {
    const { rows } = await pool.query(`
        SELECT to_char(fechaPrestamo, 'YYYY-MM') as mes,
               COUNT(*) as prestamos,
               SUM(CASE WHEN estado = 'devuelto' THEN 1 ELSE 0 END) as devoluciones
        FROM prestamos WHERE fechaPrestamo >= now() - ($1 || ' months')::interval
        GROUP BY mes ORDER BY mes ASC
    `, [meses]);
    return rows.map(r => ({ mes: r.mes, prestamos: parseInt(r.prestamos), devoluciones: parseInt(r.devoluciones) }));
}

async function getObrasPorCategoria() {
    const { rows } = await pool.query(`
        SELECT COALESCE(categoria, 'Sin categoría') as categoria, COUNT(*) as cantidad
        FROM obras WHERE estado != 'inactivo' GROUP BY categoria ORDER BY cantidad DESC
    `);
    return rows.map(r => ({ categoria: r.categoria, cantidad: parseInt(r.cantidad) }));
}

async function getSociosPorMes(meses = 6) {
    const { rows } = await pool.query(`
        SELECT to_char(fechaRegistro, 'YYYY-MM') as mes, COUNT(*) as sociosNuevos
        FROM socios WHERE fechaRegistro >= now() - ($1 || ' months')::interval
        GROUP BY mes ORDER BY mes ASC
    `, [meses]);
    let total = 0;
    return rows.map(r => { total += parseInt(r.sociosnuevos); return { mes: r.mes, sociosNuevos: parseInt(r.sociosnuevos), totalAcumulado: total }; });
}

// ===== REPORTES =====

async function getObrasMasPrestadas(limit = 10) {
    const { rows } = await pool.query(`
        SELECT o.id, o.titulo, o.isbn, o.categoria, COUNT(p.id) as "cantidadPrestamos"
        FROM prestamos p
        JOIN ejemplares e ON p.ejemplarId = e.id
        JOIN tomos t ON e.tomoId = t.id
        JOIN obras o ON t.obraId = o.id
        GROUP BY o.id ORDER BY "cantidadPrestamos" DESC LIMIT $1
    `, [limit]);
    return rows.map(r => ({ ...r, cantidadPrestamos: parseInt(r.cantidadPrestamos) }));
}

async function getSociosConMasPrestamos(limit = 10) {
    const { rows } = await pool.query(`
        SELECT s.id, s.nombre, s.apellido, s.dni, s.tipoSocio as "tipoSocio", COUNT(p.id) as "cantidadPrestamos"
        FROM prestamos p JOIN socios s ON p.socioId = s.id
        GROUP BY s.id ORDER BY "cantidadPrestamos" DESC LIMIT $1
    `, [limit]);
    return rows.map(r => ({ ...r, cantidadPrestamos: parseInt(r.cantidadPrestamos) }));
}

async function getEstadisticasMensuales(meses = 6) {
    const obrasPorMes = await pool.query(`
        SELECT to_char(fechaCreacion, 'YYYY-MM') as mes, COUNT(*) as obrasNuevas
        FROM obras WHERE fechaCreacion >= now() - ($1 || ' months')::interval GROUP BY mes
    `, [meses]);
    const sociosPorMes = await pool.query(`
        SELECT to_char(fechaRegistro, 'YYYY-MM') as mes, COUNT(*) as sociosNuevos
        FROM socios WHERE fechaRegistro >= now() - ($1 || ' months')::interval GROUP BY mes
    `, [meses]);
    const prestamosPorMes = await pool.query(`
        SELECT to_char(fechaPrestamo, 'YYYY-MM') as mes, COUNT(*) as prestamos,
               SUM(CASE WHEN estado = 'devuelto' THEN 1 ELSE 0 END) as devoluciones
        FROM prestamos WHERE fechaPrestamo >= now() - ($1 || ' months')::interval GROUP BY mes
    `, [meses]);

    const mapa = {};
    const asegurar = (mes) => { if (!mapa[mes]) mapa[mes] = { mes, obrasNuevas: 0, sociosNuevos: 0, prestamos: 0, devoluciones: 0 }; return mapa[mes]; };
    obrasPorMes.rows.forEach(r => { asegurar(r.mes).obrasNuevas = parseInt(r.obrasnuevas); });
    sociosPorMes.rows.forEach(r => { asegurar(r.mes).sociosNuevos = parseInt(r.sociosnuevos); });
    prestamosPorMes.rows.forEach(r => { asegurar(r.mes).prestamos = parseInt(r.prestamos); asegurar(r.mes).devoluciones = parseInt(r.devoluciones || 0); });

    return Object.values(mapa).sort((a, b) => a.mes.localeCompare(b.mes));
}

// ===== DATOS FICTICIOS DE DEMOSTRACIÓN =====
async function insertSampleData() {
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
            const obra = await createObra(obraData);
            obrasCreadas.push(obra);
            const cantidad = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < cantidad; i++) {
                await createEjemplar({
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
            sociosCreados.push(await createSocio(socioData));
        } catch (error) {
            console.error('Error al insertar socio ficticio:', socioData.nombre, error.message);
        }
    }

    let prestamosCreados = 0;
    const ejemplaresDisponibles = await getEjemplares({ estado: 'disponible' });
    for (let i = 0; i < Math.min(6, ejemplaresDisponibles.length, sociosCreados.length); i++) {
        try {
            await createPrestamo({ ejemplarId: ejemplaresDisponibles[i].id, socioId: sociosCreados[i % sociosCreados.length].id });
            prestamosCreados++;
        } catch (error) {
            console.error('Error al crear préstamo ficticio:', error.message);
        }
    }

    return {
        success: true,
        message: 'Datos ficticios insertados correctamente',
        obrasInsertadas: obrasCreadas.length,
        sociosInsertados: sociosCreados.length,
        prestamosInsertados: prestamosCreados
    };
}

module.exports = {
    Validators, hashPassword, generateSalt,
    seedDefaultUsuario, createUsuario, getUsuarioById, login, getUsuarios, toggleEstadoUsuario,
    getPersonas,
    createObra, getObras, getObraById, updateObra, darDeBajaObra,
    createTomo, getTomosByObra,
    createEjemplar, getEjemplares, getEjemplarById, updateEjemplar,
    createSocio, getSocios, getSocioById, updateSocio, darDeBajaSocio,
    aplicarSancion, finalizarSancion, getSancionesBySocio, tieneSancionVigente,
    createPrestamo, getPrestamos, getPrestamoById, devolverLibro, renovarPrestamo, actualizarPrestamosVencidos,
    createReserva, getReservas, cancelarReserva, atenderReserva,
    registrarIngreso, getIngresos,
    subirDocumento, getDocumentos, darDeBajaDocumento,
    getAuditoria,
    getStats, getPrestamosPorMes, getObrasPorCategoria, getSociosPorMes,
    getObrasMasPrestadas, getSociosConMasPrestamos, getEstadisticasMensuales,
    insertSampleData,
};