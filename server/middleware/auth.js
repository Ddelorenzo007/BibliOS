const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_ESTO_EN_PRODUCCION';
const JWT_EXPIRES_IN = '12h';

function generarToken(usuario) {
    return jwt.sign(
        { id: usuario.id, usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Middleware: exige un JWT válido en el header Authorization: Bearer <token>.
// Si es válido, deja los datos del usuario en req.usuario.
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Falta el token de autenticación' });

    try {
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado, iniciá sesión de nuevo' });
    }
}

// Middleware adicional: además de estar autenticado, exige rol administrador.
// Se usa DESPUÉS de requireAuth en la cadena de middlewares de la ruta.
function requireAdmin(req, res, next) {
    if (!req.usuario || req.usuario.rol !== 'administrador') {
        return res.status(403).json({ error: 'Esta acción requiere rol de administrador' });
    }
    next();
}

module.exports = { generarToken, requireAuth, requireAdmin, JWT_SECRET };
