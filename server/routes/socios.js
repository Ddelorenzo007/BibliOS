const express = require('express');
const router = express.Router();
const db = require('../db/queries');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('./helpers');

router.use(requireAuth);

router.post('/socios', wrap(async (req, res) => {
    res.json(await db.createSocio({ ...req.body, usuarioId: req.usuario.id }));
}));

router.get('/socios', wrap(async (req, res) => {
    res.json(await db.getSocios(req.query));
}));

router.get('/socios/:id', wrap(async (req, res) => {
    const socio = await db.getSocioById(req.params.id);
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(socio);
}));

router.put('/socios/:id', wrap(async (req, res) => {
    res.json({ success: await db.updateSocio(req.params.id, { ...req.body, usuarioId: req.usuario.id }) });
}));

router.post('/socios/:id/baja', wrap(async (req, res) => {
    res.json({ success: await db.darDeBajaSocio(req.params.id, req.usuario.id) });
}));

// ----- Sanciones -----
router.post('/sanciones', wrap(async (req, res) => {
    res.json(await db.aplicarSancion({ ...req.body, usuarioId: req.usuario.id }));
}));

router.post('/sanciones/:id/finalizar', wrap(async (req, res) => {
    res.json({ success: await db.finalizarSancion(req.params.id, req.usuario.id) });
}));

router.get('/socios/:socioId/sanciones', wrap(async (req, res) => {
    res.json(await db.getSancionesBySocio(req.params.socioId));
}));

module.exports = router;
