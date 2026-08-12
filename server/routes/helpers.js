// Envuelve un handler async de Express para no repetir try/catch en cada
// ruta. Cualquier error se devuelve como 400 con el mensaje (son errores
// de validación de negocio, ya pensados para mostrarse al usuario final,
// igual que hacía la app antes vía IPC).
function wrap(fn) {
    return async (req, res) => {
        try {
            await fn(req, res);
        } catch (error) {
            console.error(error);
            res.status(400).json({ error: error.message || 'Error inesperado' });
        }
    };
}
module.exports = { wrap };
