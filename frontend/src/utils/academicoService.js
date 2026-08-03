// ============================================================================
// Adaptador de integración con el sistema académico de UTN FRLP.
//
// HOY: TIC todavía no definió el contrato de esa integración (están
// preparando una base académica ficticia que van a exponer por DNS más
// adelante). Mientras tanto, esta función devuelve datos SIMULADOS a partir
// del DNI, solo para poder probar el flujo de autocompletado en el
// formulario de alta de socios.
//
// MAÑANA: cuando TIC entregue el contrato real (endpoint, autenticación,
// formato de respuesta), el único lugar que hay que tocar es esta función.
// Ningún componente de la UI necesita cambiar: todos llaman a
// `buscarPersonaPorDNI(dni)` y reciben siempre la misma forma de objeto.
// ============================================================================

// Pequeño set de personas ficticias para simular resultados reales al tipear
// un DNI "conocido". Cualquier otro DNI de 7-8 dígitos devuelve una persona
// genérica igual, para que el flujo completo (autocompletar -> guardar)
// siempre se pueda probar sin depender de tener el DNI "correcto".
const PERSONAS_FICTICIAS = {
    '38111222': { nombre: 'Juan', apellido: 'Pérez', tipoSocio: 'alumno', legajo: '34001' },
    '30111225': { nombre: 'Ana', apellido: 'Martínez', tipoSocio: 'graduado', legajo: null },
    '25111226': { nombre: 'Luis', apellido: 'Fernández', tipoSocio: 'docente', legajo: null },
};

/**
 * Busca los datos de una persona por DNI en el sistema académico.
 * @param {string} dni
 * @returns {Promise<{nombre: string, apellido: string, tipoSocio: string, legajo: string|null} | null>}
 */
export async function buscarPersonaPorDNI(dni) {
    const dniLimpio = String(dni || '').replace(/\D/g, '');
    if (dniLimpio.length < 7) return null;

    // Simula la latencia de una consulta de red real
    await new Promise(resolve => setTimeout(resolve, 400));

    if (PERSONAS_FICTICIAS[dniLimpio]) {
        return PERSONAS_FICTICIAS[dniLimpio];
    }

    // DNI no reconocido en el set ficticio: devolvemos null, como haría una
    // API real cuando la persona no existe en el sistema académico.
    return null;
}