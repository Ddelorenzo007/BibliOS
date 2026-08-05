<h1 align="center">BibliOS</h1>
<h3 align="center">Sistema Integral de Gestión Bibliotecaria — Biblioteca de la Facultad Regional La Plata (UTN FRLP)</h3>

## ¿Qué es BibliOS?

**BibliOS** es el sistema de gestión bibliotecaria desarrollado para la Biblioteca de UTN FRLP. Permite administrar el catálogo de obras, ejemplares, socios, préstamos, reservas, sanciones y documentación institucional desde una única aplicación de escritorio.

El proyecto nació como un sistema genérico multibiblioteca y fue reorientado, con la conformidad del Área de TIC de la Facultad, a un sistema de biblioteca única con autenticación de bibliotecarios y datos ajustados a las políticas y al modelo académico de UTN FRLP.

## Créditos

**Equipo original** (concepción inicial del proyecto y primera propuesta de arquitectura):
Emiliano Cuervo, Jesús Vergara, Pedro Fiuza, Máximo Carpignano, Joaquín Montes.

**Equipo actual** (Grupo N°15 — Cátedra Seminario Integrador, continuación y ampliación funcional del proyecto):
Dante De Lorenzo, Nahuel Hernández, Tiziano Hurst, Luciano Privitera, Santino Taini.

## Stack tecnológico

Stack validado con el Área de TIC de UTN FRLP:

- **Electron** — aplicación de escritorio multiplataforma
- **React** — interfaz de usuario
- **Node.js** — backend (hoy embebido en el proceso principal de Electron vía IPC; la migración a un servicio Express independiente está planificada, ver [Arquitectura](#arquitectura))
- **SQLite** (`better-sqlite3`) — base de datos durante el desarrollo local
- **PostgreSQL** — base de datos objetivo para producción (DDL ya escrito y validado, ver `db/schema_postgres.sql`)
- **Docker** — despliegue objetivo del backend + base de datos sobre la VM Linux de la Facultad (pendiente de implementar)

## Arquitectura

**Estado actual (desarrollo):**

```
Electron (proceso principal)
  └─ IPC ──> better-sqlite3 ──> archivo local biblios.db
Electron (proceso renderer)
  └─ React (frontend)
```

Todo corre localmente en un solo proceso de Electron. No hay servidor ni red de por medio todavía.

**Arquitectura objetivo (acordada con TIC):**

```
Electron (cliente de escritorio, instalado en cada puesto)
  └─ HTTP ──> API Node.js + Express (contenedor Docker, VM Linux de la Facultad)
                └─ PostgreSQL (contenedor Docker, misma VM)
                └─ (futuro) Integración con el sistema académico de la Facultad
```

La lógica de negocio (validaciones, reglas de préstamos/reservas/sanciones) vive hoy en `src/main/database/database.js` y está escrita para portarse casi sin cambios al backend Express — lo que cambia en la migración es la capa de transporte (de IPC a HTTP/REST), no las reglas del sistema.

## Estructura del proyecto

```
BibliOS/
├── src/main/                    # Proceso principal de Electron
│   ├── main.js                  # Punto de entrada
│   ├── preload.js               # Puente seguro hacia el renderer (contextBridge)
│   ├── dialogs.js                # Diálogos nativos del SO
│   ├── database/
│   │   └── database.js          # Lógica de negocio + acceso a datos (SQLite)
│   └── ipc/
│       └── databaseHandlers.js  # Manejadores IPC (expone database.js al renderer)
├── frontend/                    # Interfaz React (Vite)
│   └── src/
│       ├── context/DataContext.jsx   # Estado global (obras, socios, préstamos, reservas)
│       ├── hooks/useAuth.js          # Autenticación
│       ├── utils/                    # Adaptadores externos (Open Library, sistema académico)
│       └── *.jsx, *.css              # Pantallas (Dashboard, Obras, Socios, Prestamos)
├── db/
│   └── schema_postgres.sql      # DDL completo para PostgreSQL (producción)
└── package.json
```

## Módulos implementados

| Módulo | Estado |
|---|---|
| Autenticación (usuario/contraseña) | ✅ Funcional |
| Obras (autores múltiples, tomos, ISBN/categoría) | ✅ Funcional |
| Ejemplares (número de control automático + inventario manual) | ✅ Funcional |
| Socios (DNI, legajo, tipo institucional) | ✅ Funcional |
| Préstamos (14 días, renovación +7 días) | ✅ Funcional |
| Reservas | ✅ Funcional |
| Sanciones | ✅ Funcional |
| Auditoría (registro interno) | 🟡 Backend listo, sin pantalla propia |
| Documentación institucional | 🟡 Backend listo, sin pantalla propia |
| Ingresos a sala | 🟡 Backend listo, sin pantalla propia |
| Usuario administrador (alta de bibliotecarios) | 🔴 Pendiente |
| Reportes (obras más prestadas, estadísticas, etc.) | 🔴 Pendiente |
| Migración a PostgreSQL + Express + Docker | 🔴 Pendiente |
| Integración con sistema académico de UTN | 🔴 Pendiente (a definir por TIC) |

## Cómo ejecutar el proyecto

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone <url-del-repositorio-oficial>
   cd BibliOS
   npm install
   cd frontend
   npm install
   cd ..
   ```

2. **Levantar el entorno de desarrollo** (desde la raíz del proyecto, corre Electron + Vite en paralelo):
   ```bash
   npm run dev
   ```

3. **Iniciar sesión:** la primera vez que corre, el sistema crea automáticamente un usuario ficticio para poder entrar mientras no haya integración con el sistema real de autenticación de usuarios:
   - Usuario: `admin`
   - Contraseña: `biblios2026`

4. **Cargar datos ficticios de prueba** (opcional): con la app abierta, en las DevTools de Electron (`Ctrl+Shift+I` → pestaña Console):
   ```js
   await window.electronAPI.insertSampleData()
   ```

5. **Build de producción** (genera el instalador de escritorio):
   ```bash
   npm run build
   ```

## Solución de problemas

### Error al correr `node algo.js` o al iniciar la app: `NODE_MODULE_VERSION` no coincide

```
Error: The module '...\better_sqlite3.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION 135. This version of Node.js
requires NODE_MODULE_VERSION 137.
```

**Por qué pasa:** `better-sqlite3` es un módulo nativo (código C++ compilado), y tiene que estar compilado contra la misma versión de Node que lo va a ejecutar. Electron trae su **propia** versión interna de Node, distinta de la que tenés instalada en el sistema — por eso el mismo binario no sirve para los dos.

**Cuándo aparece:**
- Si corrés un script suelto con `node archivo.js` (usando el Node del sistema) después de haber instalado/compilado dependencias para Electron.
- Si corrés `npm install` y después intentás abrir la app sin recompilar para Electron.

**Cómo solucionarlo, según qué necesites correr:**

- **Para volver a correr la app** (`npm run dev` / `npm start`), recompilá el módulo contra la versión de Electron del proyecto:
  ```bash
  npx electron-rebuild
  ```
  (o, si no está instalado como paquete: `npm install --save-dev electron-rebuild` una vez, y después `npx electron-rebuild` cada vez que haga falta)

- **Para correr un script suelto con Node del sistema** (por ejemplo, para inspeccionar o corregir datos directamente en `biblios.db` fuera de la app), recompilá contra el Node del sistema:
  ```bash
  npm rebuild better-sqlite3
  ```
  Y **antes de volver a abrir la app**, no te olvides de recompilar de nuevo para Electron con `npx electron-rebuild`, o `npm run dev` va a fallar con el mismo error pero al revés.

**Alternativa sin tocar nada de esto:** para inspeccionar o editar datos de `biblios.db` a mano, usar [DB Browser for SQLite](https://sqlitebrowser.org/dl/) evita todo este problema — es una app aparte con interfaz gráfica que abre el archivo `.db` directamente, sin pasar por Node ni por los módulos nativos del proyecto.

## Datos ficticios

Mientras no exista integración con el sistema académico real de UTN FRLP, el sistema trabaja con datos ficticios propios (usuario administrador, catálogo, socios y préstamos de ejemplo) para poder desarrollar y probar todos los flujos. Los adaptadores que en el futuro se conectarán a sistemas externos reales (`frontend/src/utils/academicoService.js` para el sistema académico, `frontend/src/utils/openLibraryAPI.js` para autocompletado bibliográfico) están aislados del resto de la aplicación, de forma que conectar los sistemas reales no requiere tocar la lógica de negocio ni las pantallas.

## Licencia

Este proyecto está licenciado bajo la licencia **MIT**. Puede utilizarse, modificarse y distribuirse libremente con atribución.