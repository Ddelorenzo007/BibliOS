const express = require('express');
const router = express.Router();
const db = require('../db/queries');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('./helpers');

router.use(requireAuth);

router.post('/prestamos', wrap(async (req, res) => {
    res.json(await db.createPrestamo({ ...req.body, usuarioId: req.usuario.id }));
}));

router.get('/prestamos', wrap(async (req, res) => {
    res.json(await db.getPrestamos(req.query));
}));

router.get('/prestamos/:id', wrap(async (req, res) => {
    const prestamo = await db.getPrestamoById(req.params.id);
    if (!prestamo) return res.status(404).json({ error: 'Préstamo no encontrado' });
    res.json(prestamo);
}));

router.post('/prestamos/:id/devolver', wrap(async (req, res) => {
    res.json(await db.devolverLibro(req.params.id, req.usuario.id));
}));

router.post('/prestamos/:id/renovar', wrap(async (req, res) => {
    res.json(await db.renovarPrestamo(req.params.id, req.usuario.id));
}));

router.post('/prestamos/actualizar-vencidos', wrap(async (req, res) => {
    res.json({ actualizados: await db.actualizarPrestamosVencidos() });
}));

// ----- Reservas -----
router.post('/reservas', wrap(async (req, res) => {
    res.json(await db.createReserva({ ...req.body, usuarioId: req.usuario.id }));
}));

router.get('/reservas', wrap(async (req, res) => {
    res.json(await db.getReservas(req.query));
}));

router.post('/reservas/:id/cancelar', wrap(async (req, res) => {
    res.json({ success: await db.cancelarReserva(req.params.id, req.usuario.id) });
}));

router.post('/reservas/:id/atender', wrap(async (req, res) => {
    res.json({ success: await db.atenderReserva(req.params.id, req.usuario.id) });
}));

module.exports = router;
