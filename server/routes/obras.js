const express = require('express');
const router = express.Router();
const db = require('../db/queries');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('./helpers');

router.use(requireAuth);

// ----- Personas -----
router.get('/personas', wrap(async (req, res) => {
    res.json(await db.getPersonas({ search: req.query.search }));
}));

// ----- Obras -----
router.post('/obras', wrap(async (req, res) => {
    res.json(await db.createObra({ ...req.body, usuarioId: req.usuario.id }));
}));

router.get('/obras', wrap(async (req, res) => {
    res.json(await db.getObras(req.query));
}));

router.get('/obras/:id', wrap(async (req, res) => {
    const obra = await db.getObraById(req.params.id);
    if (!obra) return res.status(404).json({ error: 'Obra no encontrada' });
    res.json(obra);
}));

router.put('/obras/:id', wrap(async (req, res) => {
    await db.updateObra(req.params.id, { ...req.body, usuarioId: req.usuario.id });
    res.json({ success: true });
}));

router.post('/obras/:id/baja', wrap(async (req, res) => {
    res.json({ success: await db.darDeBajaObra(req.params.id, req.usuario.id) });
}));

// ----- Tomos -----
router.post('/tomos', wrap(async (req, res) => {
    res.json(await db.createTomo(req.body));
}));

router.get('/obras/:obraId/tomos', wrap(async (req, res) => {
    res.json(await db.getTomosByObra(req.params.obraId));
}));

// ----- Ejemplares -----
router.post('/ejemplares', wrap(async (req, res) => {
    res.json(await db.createEjemplar({ ...req.body, usuarioId: req.usuario.id }));
}));

router.get('/ejemplares', wrap(async (req, res) => {
    res.json(await db.getEjemplares(req.query));
}));

router.get('/ejemplares/:id', wrap(async (req, res) => {
    const ejemplar = await db.getEjemplarById(req.params.id);
    if (!ejemplar) return res.status(404).json({ error: 'Ejemplar no encontrado' });
    res.json(ejemplar);
}));

router.put('/ejemplares/:id', wrap(async (req, res) => {
    res.json({ success: await db.updateEjemplar(req.params.id, { ...req.body, usuarioId: req.usuario.id }) });
}));

module.exports = router;
