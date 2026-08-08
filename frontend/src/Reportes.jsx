import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from 'recharts';
import {
  Menu, TrendingUp, Users, AlertTriangle, Calendar, BookOpen, Trophy, Search
} from 'lucide-react';
import './gestion.css';
import Sidebar from './Sidebar.jsx';

const REPORTES = [
  { id: 'obras-mas-prestadas', label: 'Obras más prestadas', icon: Trophy },
  { id: 'socios-mas-prestamos', label: 'Socios con más préstamos', icon: Users },
  { id: 'prestamos-periodo', label: 'Préstamos por período', icon: Calendar },
  { id: 'obras-vencidas', label: 'Préstamos vencidos', icon: AlertTriangle },
  { id: 'estadisticas-mensuales', label: 'Estadísticas mensuales', icon: TrendingUp },
];

export default function Reportes() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [reporteActivo, setReporteActivo] = useState('obras-mas-prestadas');
  const [loading, setLoading] = useState(false);

  const [obrasMasPrestadas, setObrasMasPrestadas] = useState([]);
  const [sociosConMasPrestamos, setSociosConMasPrestamos] = useState([]);
  const [prestamosVencidos, setPrestamosVencidos] = useState([]);
  const [estadisticasMensuales, setEstadisticasMensuales] = useState([]);

  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [prestamosPeriodo, setPrestamosPeriodo] = useState(null);

  const cargarReporte = async (id) => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      if (id === 'obras-mas-prestadas') setObrasMasPrestadas(await window.electronAPI.getObrasMasPrestadas(10));
      if (id === 'socios-mas-prestamos') setSociosConMasPrestamos(await window.electronAPI.getSociosConMasPrestamos(10));
      if (id === 'obras-vencidas') {
        await window.electronAPI.actualizarPrestamosVencidos();
        setPrestamosVencidos(await window.electronAPI.getPrestamos({ estado: 'vencido' }));
      }
      if (id === 'estadisticas-mensuales') setEstadisticasMensuales(await window.electronAPI.getEstadisticasMensuales(6));
      if (id === 'prestamos-periodo') await buscarPeriodo();
    } catch (error) {
      console.error('Error al cargar reporte:', error);
    } finally {
      setLoading(false);
    }
  };

  const buscarPeriodo = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.getPrestamos({
        fechaDesde: new Date(fechaDesde).toISOString(),
        fechaHasta: new Date(fechaHasta + 'T23:59:59').toISOString()
      });
      setPrestamosPeriodo(data || []);
    } catch (error) {
      console.error('Error al buscar préstamos por período:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarReporte(reporteActivo); }, [reporteActivo]);

  const diasDeAtraso = (fechaDevolucionPrevista) => {
    const dias = Math.floor((new Date() - new Date(fechaDevolucionPrevista)) / (1000 * 60 * 60 * 24));
    return dias > 0 ? dias : 0;
  };

  const formatFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString('es-AR') : '—';

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="gestion-container">
        <div className="gestion-header">
          <div className="header-content">
            <h1>Reportes</h1>
            <span className="header-separator">|</span>
            <p>Estadísticas y reportes de gestión de la biblioteca</p>
          </div>
        </div>

        <div className="vista-toggle" style={{ flexWrap: 'wrap' }}>
          {REPORTES.map(r => (
            <button key={r.id} className={reporteActivo === r.id ? 'active' : ''} onClick={() => setReporteActivo(r.id)}>
              <r.icon size={16} /> {r.label}
            </button>
          ))}
        </div>

        {loading && <p style={{ padding: '1rem', opacity: 0.7 }}>Cargando...</p>}

        {!loading && reporteActivo === 'obras-mas-prestadas' && (
          <div className="table-section">
            <div className="table-header"><h3>Top 10 — Obras más prestadas</h3><span className="count">{obrasMasPrestadas.length} obras</span></div>
            {obrasMasPrestadas.length > 0 ? (
              <>
                <div style={{ padding: '1.5rem 1.5rem 0' }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={obrasMasPrestadas} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="titulo" width={160} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="cantidadPrestamos" name="Préstamos" fill="#8DA9C4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-container">
                  <table className="gestion-table">
                    <thead><tr><th>#</th><th>Obra</th><th>ISBN</th><th>Categoría</th><th>Préstamos</th></tr></thead>
                    <tbody>
                      {obrasMasPrestadas.map((o, i) => (
                        <tr key={o.id}>
                          <td>{i + 1}</td>
                          <td><div className="book-info"><BookOpen size={14} /><span>{o.titulo}</span></div></td>
                          <td>{o.isbn}</td>
                          <td>{o.categoria || '—'}</td>
                          <td><strong>{o.cantidadPrestamos}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p style={{ padding: '1.5rem', opacity: 0.7 }}>Todavía no hay préstamos registrados.</p>}
          </div>
        )}

        {!loading && reporteActivo === 'socios-mas-prestamos' && (
          <div className="table-section">
            <div className="table-header"><h3>Top 10 — Socios con más préstamos</h3><span className="count">{sociosConMasPrestamos.length} socios</span></div>
            <div className="table-container">
              {sociosConMasPrestamos.length > 0 ? (
                <table className="gestion-table">
                  <thead><tr><th>#</th><th>Socio</th><th>DNI</th><th>Tipo</th><th>Préstamos</th></tr></thead>
                  <tbody>
                    {sociosConMasPrestamos.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td><div className="user-info"><Users size={14} /><span>{s.nombre} {s.apellido}</span></div></td>
                        <td>{s.dni}</td>
                        <td>{s.tipoSocio}</td>
                        <td><strong>{s.cantidadPrestamos}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ padding: '1.5rem', opacity: 0.7 }}>Todavía no hay préstamos registrados.</p>}
            </div>
          </div>
        )}

        {!loading && reporteActivo === 'prestamos-periodo' && (
          <>
            <div className="form-section">
              <h3>Filtrar por período</h3>
              <div className="prestamo-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Desde</label>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Hasta</label>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                  </div>
                  <button className="submit-button" style={{ alignSelf: 'flex-end' }} onClick={buscarPeriodo}><Search size={16} />Buscar</button>
                </div>
              </div>
            </div>

            {prestamosPeriodo !== null && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon"><BookOpen size={20} strokeWidth={1.5} /></div>
                    <div className="stat-content"><h3>Total del período</h3><p className="stat-value">{prestamosPeriodo.length}</p></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon"><TrendingUp size={20} strokeWidth={1.5} /></div>
                    <div className="stat-content"><h3>Devueltos</h3><p className="stat-value">{prestamosPeriodo.filter(p => p.estado === 'devuelto').length}</p></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon"><AlertTriangle size={20} strokeWidth={1.5} /></div>
                    <div className="stat-content"><h3>Vencidos</h3><p className="stat-value">{prestamosPeriodo.filter(p => p.estado === 'vencido').length}</p></div>
                  </div>
                </div>
                <div className="table-section">
                  <div className="table-header"><h3>Préstamos del {formatFecha(fechaDesde)} al {formatFecha(fechaHasta)}</h3></div>
                  <div className="table-container">
                    <table className="gestion-table">
                      <thead><tr><th>Fecha</th><th>Obra</th><th>Socio</th><th>Estado</th></tr></thead>
                      <tbody>
                        {prestamosPeriodo.map(p => (
                          <tr key={p.id}>
                            <td>{formatFecha(p.fechaPrestamo)}</td>
                            <td>{p.obraTitulo || '[Ejemplar eliminado]'}</td>
                            <td>{p.socioNombre ? `${p.socioNombre} ${p.socioApellido}` : '[Socio eliminado]'}</td>
                            <td><span className="status-badge" style={{ backgroundColor: p.estado === 'devuelto' ? '#10b981' : p.estado === 'vencido' ? '#ef4444' : '#3b82f6' }}>{p.estado}</span></td>
                          </tr>
                        ))}
                        {prestamosPeriodo.length === 0 && <tr><td colSpan={4} style={{ opacity: 0.7, textAlign: 'center', padding: '1.5rem' }}>No hay préstamos en ese período.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {!loading && reporteActivo === 'obras-vencidas' && (
          <div className="table-section">
            <div className="table-header"><h3>Préstamos actualmente vencidos</h3><span className="count">{prestamosVencidos.length} préstamos</span></div>
            <div className="table-container">
              {prestamosVencidos.length > 0 ? (
                <table className="gestion-table">
                  <thead><tr><th>Obra</th><th>Socio</th><th>Vencimiento</th><th>Días de atraso</th></tr></thead>
                  <tbody>
                    {prestamosVencidos.map(p => (
                      <tr key={p.id}>
                        <td><div className="book-info"><BookOpen size={14} /><span>{p.obraTitulo}</span></div></td>
                        <td><div className="user-info"><Users size={14} /><span>{p.socioNombre} {p.socioApellido}</span></div></td>
                        <td>{formatFecha(p.fechaDevolucionPrevista)}</td>
                        <td><span className="status-badge" style={{ backgroundColor: '#ef4444' }}>{diasDeAtraso(p.fechaDevolucionPrevista)} días</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ padding: '1.5rem', opacity: 0.7 }}>No hay préstamos vencidos en este momento. 🎉</p>}
            </div>
          </div>
        )}

        {!loading && reporteActivo === 'estadisticas-mensuales' && (
          <div className="table-section">
            <div className="table-header"><h3>Estadísticas de los últimos 6 meses</h3></div>
            {estadisticasMensuales.length > 0 ? (
              <>
                <div style={{ padding: '1.5rem' }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={estadisticasMensuales}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="prestamos" name="Préstamos" stroke="#8DA9C4" strokeWidth={2} />
                      <Line type="monotone" dataKey="devoluciones" name="Devoluciones" stroke="#10b981" strokeWidth={2} />
                      <Line type="monotone" dataKey="sociosNuevos" name="Socios nuevos" stroke="#c9a368" strokeWidth={2} />
                      <Line type="monotone" dataKey="obrasNuevas" name="Obras nuevas" stroke="#134074" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-container">
                  <table className="gestion-table">
                    <thead><tr><th>Mes</th><th>Obras nuevas</th><th>Socios nuevos</th><th>Préstamos</th><th>Devoluciones</th></tr></thead>
                    <tbody>
                      {estadisticasMensuales.map(e => (
                        <tr key={e.mes}>
                          <td>{e.mes}</td><td>{e.obrasNuevas}</td><td>{e.sociosNuevos}</td><td>{e.prestamos}</td><td>{e.devoluciones}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p style={{ padding: '1.5rem', opacity: 0.7 }}>Todavía no hay suficientes datos para este reporte.</p>}
          </div>
        )}
      </div>
    </>
  );
}