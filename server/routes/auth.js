const express = require('express');
const router = express.Router();
const db = require('../db/queries');
const { generarToken, requireAuth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        const resultado = await db.login(usuario, password);
        if (!resultado.success) return res.status(401).json(resultado);
        const token = generarToken(resultado.usuario);
        res.json({ success: true, usuario: resultado.usuario, token });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Verificación rápida de que el token todavía es válido (para restaurar
// sesión al recargar la app sin tener que volver a pedir usuario/contraseña)
router.get('/me', requireAuth, (req, res) => {
    res.json({ usuario: req.usuario });
});

module.exports = router;
