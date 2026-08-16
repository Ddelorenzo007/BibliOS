const express = require('express');
const router = express.Router();
const db = require('../db/queries');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { wrap } = require('./helpers');

router.use(requireAuth);

// ----- Ingresos a sala -----
router.post('/ingresos', wrap(async (req, res) => {
    res.json(await db.registrarIngreso(req.body));
}));
router.get('/ingresos', wrap(async (req, res) => {
    res.json(await db.getIngresos(req.query));
}));

// ----- Documentación institucional -----
router.post('/documentos', wrap(async (req, res) => {
    res.json(await db.subirDocumento({ ...req.body, usuarioId: req.usuario.id }));
}));
router.get('/documentos', wrap(async (req, res) => {
    res.json(await db.getDocumentos(req.query));
}));
router.post('/documentos/:id/baja', wrap(async (req, res) => {
    res.json({ success: await db.darDeBajaDocumento(req.params.id, req.usuario.id) });
}));

// ----- Auditoría (solo administradores) -----
router.get('/auditoria', requireAdmin, wrap(async (req, res) => {
    res.json(await db.getAuditoria(req.query));
}));

// ----- Usuarios (solo administradores) -----
router.get('/usuarios', requireAdmin, wrap(async (req, res) => {
    res.json(await db.getUsuarios(req.query));
}));
router.post('/usuarios', requireAdmin, wrap(async (req, res) => {
    res.json(await db.createUsuario({ ...req.body, usuarioCreadorId: req.usuario.id }));
}));
router.post('/usuarios/:id/estado', requireAdmin, wrap(async (req, res) => {
    res.json({ success: await db.toggleEstadoUsuario(req.params.id, req.body.nuevoEstado, req.usuario.id) });
}));

// ----- Estadísticas y Reportes -----
router.get('/stats', wrap(async (req, res) => {
    res.json(await db.getStats());
}));
router.get('/reportes/prestamos-por-mes', wrap(async (req, res) => {
    res.json(await db.getPrestamosPorMes(req.query.meses ? parseInt(req.query.meses) : 6));
}));
router.get('/reportes/obras-por-categoria', wrap(async (req, res) => {
    res.json(await db.getObrasPorCategoria());
}));
router.get('/reportes/socios-por-mes', wrap(async (req, res) => {
    res.json(await db.getSociosPorMes(req.query.meses ? parseInt(req.query.meses) : 6));
}));
router.get('/reportes/obras-mas-prestadas', wrap(async (req, res) => {
    res.json(await db.getObrasMasPrestadas(req.query.limit ? parseInt(req.query.limit) : 10));
}));
router.get('/reportes/socios-mas-prestamos', wrap(async (req, res) => {
    res.json(await db.getSociosConMasPrestamos(req.query.limit ? parseInt(req.query.limit) : 10));
}));
router.get('/reportes/estadisticas-mensuales', wrap(async (req, res) => {
    res.json(await db.getEstadisticasMensuales(req.query.meses ? parseInt(req.query.meses) : 6));
}));

// ----- Datos ficticios de demostración (solo administradores) -----
router.post('/seed-demo', requireAdmin, wrap(async (req, res) => {
    res.json(await db.insertSampleData());
}));

module.exports = router;