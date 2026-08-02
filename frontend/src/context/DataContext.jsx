import React, { createContext, useState, useEffect, useContext } from 'react';

export const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    const [obras, setObras] = useState([]);
    const [socios, setSocios] = useState([]);
    const [prestamos, setPrestamos] = useState([]);
    const [reservas, setReservas] = useState([]);
    const [stats, setStats] = useState({
        totalObras: 0,
        totalEjemplares: 0,
        ejemplaresDisponibles: 0,
        totalSocios: 0,
        prestamosActivos: 0,
        prestamosVencidos: 0,
        prestamosDevueltos: 0,
        reservasPendientes: 0,
        sancionesVigentes: 0
    });

    // Chart Data
    const [charts, setCharts] = useState({
        prestamosPorMes: [],
        obrasPorCategoria: [],
        sociosActivos: []
    });

    const [loading, setLoading] = useState(true);

    // Cargar todos los datos al montar (biblioteca única, no depende de una selección)
    useEffect(() => {
        if (window.electronAPI) {
            refreshAll();
        } else {
            setLoading(false);
        }
    }, []);

    const refreshAll = async () => {
        if (!window.electronAPI) return;

        try {
            setLoading(true);

            // Antes de traer los préstamos, marcamos como vencidos los que
            // ya pasaron su fecha prevista (no hay cron: se resuelve al
            // pedirlos, que es como el resto de la app ya funciona)
            await window.electronAPI.actualizarPrestamosVencidos();

            const [
                obrasData,
                sociosData,
                prestamosData,
                reservasData,
                statsData,
                prestamosMesData,
                obrasCategoriaData,
                sociosMesData
            ] = await Promise.all([
                window.electronAPI.getObras({}),
                window.electronAPI.getSocios({}),
                window.electronAPI.getPrestamos({}),
                window.electronAPI.getReservas({}),
                window.electronAPI.getStats(),
                window.electronAPI.getPrestamosPorMes(6),
                window.electronAPI.getObrasPorCategoria(),
                window.electronAPI.getSociosPorMes(6)
            ]);

            setObras(obrasData || []);
            setSocios(sociosData || []);
            setPrestamos(prestamosData || []);
            setReservas(reservasData || []);

            if (statsData) {
                setStats({
                    totalObras: statsData.totalObras || 0,
                    totalEjemplares: statsData.totalEjemplares || 0,
                    ejemplaresDisponibles: statsData.ejemplaresDisponibles || 0,
                    totalSocios: statsData.totalSocios || 0,
                    prestamosActivos: statsData.prestamosActivos || 0,
                    prestamosVencidos: statsData.prestamosVencidos || 0,
                    prestamosDevueltos: statsData.prestamosDevueltos || 0,
                    reservasPendientes: statsData.reservasPendientes || 0,
                    sancionesVigentes: statsData.sancionesVigentes || 0
                });
            }

            const prestamosFormateados = (prestamosMesData || []).map(item => ({
                mes: item.mes,
                prestamos: item.prestamos || 0,
                devoluciones: item.devoluciones || 0
            }));

            const categoriasFormateadas = (obrasCategoriaData || []).map((item, index) => ({
                name: item.categoria || 'Sin categoría',
                value: item.cantidad || 0,
                color: ['#8DA9C4', '#134074', '#c9a368', '#4a5568', '#e8e8e8', '#2a4365'][index % 6]
            }));

            const sociosActivosFormateados = (sociosMesData || []).map(item => ({
                mes: item.mes,
                activos: item.totalAcumulado || 0
            }));

            setCharts({
                prestamosPorMes: prestamosFormateados,
                obrasPorCategoria: categoriasFormateadas,
                sociosActivos: sociosActivosFormateados
            });

        } catch (error) {
            console.error("Error refreshing global data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Refresh granulares
    const refreshObras = async () => {
        if (!window.electronAPI) return;
        const data = await window.electronAPI.getObras({});
        setObras(data || []);
        refreshAll();
    };

    const refreshSocios = async () => {
        if (!window.electronAPI) return;
        const data = await window.electronAPI.getSocios({});
        setSocios(data || []);
        refreshAll();
    };

    const refreshPrestamos = async () => {
        if (!window.electronAPI) return;
        const data = await window.electronAPI.getPrestamos({});
        setPrestamos(data || []);
        refreshAll();
    };

    const refreshReservas = async () => {
        if (!window.electronAPI) return;
        const data = await window.electronAPI.getReservas({});
        setReservas(data || []);
        refreshAll();
    };

    const clearData = () => {
        setObras([]);
        setSocios([]);
        setPrestamos([]);
        setReservas([]);
        setStats({
            totalObras: 0, totalEjemplares: 0, ejemplaresDisponibles: 0, totalSocios: 0,
            prestamosActivos: 0, prestamosVencidos: 0, prestamosDevueltos: 0,
            reservasPendientes: 0, sancionesVigentes: 0
        });
    };

    return (
        <DataContext.Provider value={{
            obras,
            socios,
            prestamos,
            reservas,
            stats,
            charts,
            loading,
            refreshAll,
            refreshObras,
            refreshSocios,
            refreshPrestamos,
            refreshReservas,
            clearData
        }}>
            {children}
        </DataContext.Provider>
    );
};