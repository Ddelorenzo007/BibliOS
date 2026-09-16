export async function buscarPersonaPorDNI(dni) {
    const dniLimpio = String(dni || '').replace(/\D/g, '');
    if (dniLimpio.length < 7) return null;

    try {
        const persona = await window.electronAPI.buscarEnSistemaAcademico(dniLimpio);
        return persona; 
    } catch (error) {
        console.error('Error al consultar BD Académica:', error);
        throw error;
    }
}