const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db/queries');
const authRoutes = require('./routes/auth');
const obrasRoutes = require('./routes/obras');
const sociosRoutes = require('./routes/socios');
const prestamosRoutes = require('./routes/prestamos');
const otrosRoutes = require('./routes/otros');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api', obrasRoutes);
app.use('/api', sociosRoutes);
app.use('/api', prestamosRoutes);
app.use('/api', otrosRoutes);

app.get('/api/academico/buscar/:dni', async (req, res) => {
    try {
        const { dni } = req.params;
        const resultado = await db.buscarPersonaEnSistemaAcademico(dni);
        res.json(resultado);
    } catch (error) {
        console.error("Error al consultar el sistema académico:", error);
        res.status(500).json({ error: "Error al consultar el sistema académico" });
    }
});

// Manejador de errores genérico (por si algo se escapa de los try/catch de las rutas)
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, async () => {
    console.log(`BibliOS API escuchando en el puerto ${PORT}`);
    // Igual que en la versión Electron/SQLite: si no hay usuarios cargados,
    // se crea uno ficticio para poder entrar mientras no exista integración
    // con el sistema real de autenticación de la Facultad.
    await db.seedDefaultUsuario();
});
