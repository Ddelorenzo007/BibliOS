-- ============================================================================
-- BibliOS - Esquema de base de datos (PostgreSQL)
-- UTN FRLP - Biblioteca central
--
-- Sincronizado con el esquema real de src/main/database/database.js
-- (SQLite, entorno de desarrollo) al momento de la migración a Postgres.
-- Cualquier cambio de esquema futuro debe aplicarse en los DOS lugares:
-- acá (Postgres, producción) y en createTables()/las migraciones de
-- database.js (SQLite, si se lo sigue usando localmente).
-- ============================================================================


-- ============================================================================
-- USUARIOS (autenticación: administradores y bibliotecarios)
-- ============================================================================
CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    usuario         VARCHAR(50) NOT NULL UNIQUE,
    passwordHash    VARCHAR(255) NOT NULL,
    salt            VARCHAR(64) NOT NULL,
    nombre          VARCHAR(150),
    rol             VARCHAR(30) NOT NULL DEFAULT 'bibliotecario'
                        CHECK (rol IN ('administrador', 'bibliotecario')),
    estado          VARCHAR(20) NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo')),
    fechaCreacion   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_usuario ON usuarios(usuario);


-- ============================================================================
-- SOCIOS
-- ============================================================================
CREATE TABLE socios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100) NOT NULL,
    dni             VARCHAR(15) NOT NULL UNIQUE,
    legajo          VARCHAR(30) UNIQUE,
    tipoSocio       VARCHAR(20) NOT NULL
                        CHECK (tipoSocio IN ('alumno', 'graduado', 'docente', 'no_docente')),
    email           VARCHAR(150) NOT NULL UNIQUE,
    telefono        VARCHAR(30),
    direccion       VARCHAR(200),
    estado          VARCHAR(20) NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo', 'sancionado')),
    observaciones   TEXT,
    fechaRegistro   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_socios_dni ON socios(dni);
CREATE INDEX idx_socios_legajo ON socios(legajo);
CREATE INDEX idx_socios_estado ON socios(estado);
CREATE INDEX idx_socios_nombre_apellido ON socios(nombre, apellido);


-- ============================================================================
-- GESTIÓN BIBLIOGRÁFICA: personas, obras, tomos, ejemplares
-- ============================================================================

CREATE TABLE personas (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100),
    fechaCreacion   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_personas_apellido ON personas(apellido);

CREATE TABLE obras (
    id                  SERIAL PRIMARY KEY,
    isbn                VARCHAR(20) NOT NULL UNIQUE,
    titulo              VARCHAR(300) NOT NULL,
    subtitulo           VARCHAR(300),
    categoria           VARCHAR(100),
    editorial           VARCHAR(150),
    lugarPublicacion    VARCHAR(150),
    anioPublicacion     INTEGER,
    edicion             VARCHAR(50),
    idioma              VARCHAR(50),
    descripcion         TEXT,
    cabecera            VARCHAR(50),
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo', 'inactivo')),
    fechaCreacion       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_obras_titulo ON obras(titulo);
CREATE INDEX idx_obras_estado ON obras(estado);
CREATE INDEX idx_obras_isbn ON obras(isbn);
CREATE INDEX idx_obras_categoria ON obras(categoria);

CREATE TABLE obra_personas (
    id          SERIAL PRIMARY KEY,
    obraId      INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    personaId   INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    rol         VARCHAR(30) NOT NULL DEFAULT 'autor'
                    CHECK (rol IN ('autor', 'compilador', 'traductor', 'director', 'coordinador', 'otro')),
    orden       INTEGER NOT NULL DEFAULT 1,
    UNIQUE (obraId, personaId, rol)
);

CREATE INDEX idx_obra_personas_obra ON obra_personas(obraId);
CREATE INDEX idx_obra_personas_persona ON obra_personas(personaId);

CREATE TABLE tomos (
    id              SERIAL PRIMARY KEY,
    obraId          INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    numero          VARCHAR(30) NOT NULL DEFAULT 'Único',
    paginas         VARCHAR(20),
    anioPublicacion INTEGER,
    descripcion     TEXT,
    UNIQUE (obraId, numero)
);

CREATE INDEX idx_tomos_obra ON tomos(obraId);

CREATE TABLE ejemplares (
    id                  SERIAL PRIMARY KEY,
    tomoId              INTEGER NOT NULL REFERENCES tomos(id) ON DELETE RESTRICT,
    numeroControl       VARCHAR(30) NOT NULL UNIQUE,
    numeroInventario    VARCHAR(30) NOT NULL UNIQUE,
    ubicacion           VARCHAR(100),
    estado              VARCHAR(20) NOT NULL DEFAULT 'disponible'
                            CHECK (estado IN ('disponible', 'prestado', 'reservado', 'en_reparacion', 'extraviado', 'baja')),
    fechaAlta           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ejemplares_tomo ON ejemplares(tomoId);
CREATE INDEX idx_ejemplares_estado ON ejemplares(estado);


-- ============================================================================
-- CIRCULACIÓN: préstamos, renovaciones, reservas, sanciones
-- ============================================================================

CREATE TABLE prestamos (
    id                          SERIAL PRIMARY KEY,
    ejemplarId                  INTEGER REFERENCES ejemplares(id) ON DELETE SET NULL,
    socioId                     INTEGER REFERENCES socios(id) ON DELETE SET NULL,
    usuarioId                   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fechaPrestamo               TIMESTAMPTZ NOT NULL DEFAULT now(),
    fechaDevolucionPrevista     TIMESTAMPTZ NOT NULL,
    fechaDevolucionReal         TIMESTAMPTZ,
    estado                      VARCHAR(20) NOT NULL DEFAULT 'activo'
                                    CHECK (estado IN ('activo', 'devuelto', 'vencido')),
    observaciones               TEXT
);

CREATE INDEX idx_prestamos_ejemplar ON prestamos(ejemplarId);
CREATE INDEX idx_prestamos_socio ON prestamos(socioId);
CREATE INDEX idx_prestamos_estado ON prestamos(estado);
CREATE INDEX idx_prestamos_fechaDevolucionPrevista ON prestamos(fechaDevolucionPrevista);

CREATE TABLE renovaciones (
    id                          SERIAL PRIMARY KEY,
    prestamoId                  INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
    usuarioId                   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fechaRenovacion              TIMESTAMPTZ NOT NULL DEFAULT now(),
    fechaDevolucionAnterior      TIMESTAMPTZ NOT NULL,
    nuevaFechaDevolucion         TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_renovaciones_prestamo ON renovaciones(prestamoId);

CREATE TABLE reservas (
    id                  SERIAL PRIMARY KEY,
    obraId              INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    socioId             INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
    ejemplarAsignadoId  INTEGER REFERENCES ejemplares(id) ON DELETE SET NULL,
    prioridad           INTEGER NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'atendida', 'cancelada', 'vencida')),
    fechaReserva        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fechaAtencion       TIMESTAMPTZ,
    observaciones       TEXT
);

CREATE INDEX idx_reservas_obra ON reservas(obraId);
CREATE INDEX idx_reservas_socio ON reservas(socioId);
CREATE INDEX idx_reservas_estado ON reservas(estado);

CREATE TABLE sanciones (
    id              SERIAL PRIMARY KEY,
    socioId         INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
    usuarioId       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    motivo          VARCHAR(300) NOT NULL,
    fechaInicio     TIMESTAMPTZ NOT NULL DEFAULT now(),
    fechaFin        TIMESTAMPTZ NOT NULL,
    estado          VARCHAR(20) NOT NULL DEFAULT 'vigente'
                        CHECK (estado IN ('vigente', 'finalizada')),
    observaciones   TEXT,
    CONSTRAINT chk_sancion_fechas CHECK (fechaFin > fechaInicio)
);

CREATE INDEX idx_sanciones_socio ON sanciones(socioId);
CREATE INDEX idx_sanciones_estado ON sanciones(estado);


-- ============================================================================
-- AUDITORÍA
-- ============================================================================
CREATE TABLE auditoria (
    id              SERIAL PRIMARY KEY,
    usuarioId       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    accion          VARCHAR(50) NOT NULL,
    modulo          VARCHAR(50) NOT NULL,
    entidadId       INTEGER,
    detalle         TEXT,
    resultado       VARCHAR(10) NOT NULL DEFAULT 'exito' CHECK (resultado IN ('exito', 'fallo')),
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);


-- ============================================================================
-- INGRESOS A SALA
-- ============================================================================
CREATE TABLE ingresos (
    id              SERIAL PRIMARY KEY,
    socioId         INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
    fechaHora       TIMESTAMPTZ NOT NULL DEFAULT now(),
    observaciones   TEXT
);

CREATE INDEX idx_ingresos_socio ON ingresos(socioId);
CREATE INDEX idx_ingresos_fechaHora ON ingresos(fechaHora);


-- ============================================================================
-- DOCUMENTACIÓN INSTITUCIONAL
-- ============================================================================
CREATE TABLE documentos_institucionales (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(200) NOT NULL,
    categoria       VARCHAR(50) NOT NULL,
    rutaArchivo     VARCHAR(500) NOT NULL,
    tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('pdf', 'doc', 'docx')),
    descripcion     TEXT,
    estado          VARCHAR(20) NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo')),
    usuarioId       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fechaSubida     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documentos_categoria ON documentos_institucionales(categoria);
CREATE INDEX idx_documentos_estado ON documentos_institucionales(estado);
