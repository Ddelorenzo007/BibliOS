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
- **Node.js + Express** — backend desacoplado en una API REST
- **PostgreSQL** — base de datos relacional
- **Docker & Docker Compose** — despliegue y contenedorización del backend y la base de datos

## Arquitectura

**Arquitectura actual (Producción / Despliegue):**
Electron (cliente de escritorio, instalado en cada puesto)
<br>
└─ HTTP ──> API Node.js + Express (contenedor Docker)
<br>
└─ PostgreSQL (contenedor Docker)

La lógica de negocio y el acceso a datos viven en el servidor backend (Node.js/Express) utilizando PostgreSQL como motor de base de datos definitivo, mientras que Electron actúa como cliente liviano de escritorio interactuando vía HTTP.

## Estructura del proyecto
BibliOS/<br>
├── server/                 # Backend Node.js (Express + PostgreSQL)<br>
│   ├── db/                 # Conexión a BD, queries y esquemas SQL<br>
│   ├── middleware/         # Autenticación y seguridad<br>
│   ├── routes/             # Endpoints de la API REST<br>
│   └── index.js            # Punto de entrada de la API<br>
├── frontend/               # Interfaz React (Vite) / Cliente Electron<br>
│   └── src/<br>
│       ├── context/        # Estado global (DataContext, etc.)<br>
│       ├── hooks/          # Autenticación y lógica de UI<br>
│       ├── utils/          # Conexiones externas (Open Library, etc.)<br>
│       └── *.jsx, *.css    # Pantallas y estilos (Dashboard, Obras, Socios, etc.)<br>
├── docker-compose.yml      # Orquestador de contenedores (API + PostgreSQL)<br>
└── package.json<br>
## Módulos implementados

| Módulo | Estado |
|---|---|
| Autenticación (usuario/contraseña) | ✅ Funcional |
| Obras (autores múltiples, tomos, ISBN/categoría) | ✅ Funcional |
| Ejemplares (número de control automático + inventario manual + tipo sala/depósito) | ✅ Funcional |
| Socios (DNI, legajo, tipo institucional) | ✅ Funcional |
| Préstamos (14 días, renovación +7 días, excepciones de sala) | ✅ Funcional |
| Reservas | ✅ Funcional |
| Sanciones | ✅ Funcional |
| Auditoría (registro interno) | ✅ Funcional |
| Documentación institucional | ✅ Funcional |
| Ingresos a sala | ✅ Funcional |
| Usuario administrador (alta de bibliotecarios / control de estados) | ✅ Funcional |
| Reportes (obras más prestadas, estadísticas mensuales, etc.) | ✅ Funcional |
| Migración a PostgreSQL + Express + Docker | ✅ Funcional |
| Integración con sistema académico de UTN (SysAcad) | 🔴 Pendiente |

## Cómo iniciar el proyecto en una máquina nueva (Paso a paso)

Para poner en marcha el sistema completo en un entorno limpio, seguí los siguientes pasos:

### 1. Requisitos previos
Asegurate de tener instalado en tu equipo:
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (versión LTS recomendada)
- [Docker](https://www.docker.com/) y **Docker Desktop** (asegurate de que el servicio de Docker esté corriendo).

### 2. Clonar el repositorio e instalar dependencias
Abrí una terminal en la carpeta donde quieras clonar el proyecto y ejecutá:

```bash
git clone https://github.com/frlputn/bibliotecaFRLP
cd BibliOS
```
Luego, instalá las dependencias tanto en la raíz (para el cliente/frontend) como en el servidor:
```
# Instalar dependencias del cliente y Electron
npm install

# Entrar a la carpeta del servidor e instalar sus dependencias
cd server
npm install
cd ..
```
### 3. Levantar los servicios con Docker (Backend + Base de datos)
Desde la raíz del proyecto, usá Docker Compose para poner en marcha PostgreSQL y la API de Node.js:
```
docker compose up --build -d
```
Este comando compilará el contenedor de la API y levantará la base de datos PostgreSQL de forma automática. Podés verificar que todo esté OK corriendo:
```
docker compose ps
```
### 4. Iniciar la aplicación de escritorio (Electron)
Una vez que el backend y la base de datos estén corriendo en Docker, iniciá la interfaz gráfica de Electron ejecutando:
```
npm run dev
```
### 5. Primer ingreso y datos de prueba
1. Iniciar sesión: La primera vez que el sistema se conecta a la base de datos vacía, genera automáticamente un usuario administrador por defecto:<br>
Usuario: admin<br>
Contraseña: biblios2026
2. Cargar datos ficticios de prueba (opcional): con la app abierta, podés abrir las DevTools de Electron (Ctrl+Shift+I → pestaña Console) y ejecutar:<br>
```
await window.electronAPI.insertSampleData()
```
### 6. Build de producción
Si necesitás generar el instalador ejecutable de la aplicación de escritorio para distribución:
```
npm run build
```
## Licencia
Este proyecto está licenciado bajo la licencia MIT. Puede utilizarse, modificarse y distribuirse libremente con atribución.