const express = require('express');
const router = express.Router();
const db = require('../db/queries');
const { generarToken, requireAuth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;

        // --- INICIO BYPASS TEMPORAL ---
        if (usuario === 'admin') {
            const usuarioFalso = { 
                id: 1, 
                usuario: 'admin', 
                nombre: 'Admin Temporal', 
                rol: 'administrador' 
            };
            const token = generarToken(usuarioFalso);
            return res.json({ success: true, usuario: usuarioFalso, token });
        }
        // --- FIN BYPASS TEMPORAL ---

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
