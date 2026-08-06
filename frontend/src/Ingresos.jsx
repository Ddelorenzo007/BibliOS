import React, { useState, useEffect } from 'react';
import { LogIn, User, Calendar, Menu, Users } from 'lucide-react';
import './gestion.css';
import Sidebar from './Sidebar.jsx';
import { useData } from './context/DataContext.jsx';

export default function Ingresos() {
  const { socios: sociosRaw } = useData();
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [socioSearch, setSocioSearch] = useState('');
  const [showSocioResults, setShowSocioResults] = useState(false);
  const [selectedSocio, setSelectedSocio] = useState(null);

  const socios = (sociosRaw || []).filter(s => s.estado === 'activo');

  const cargarIngresos = async () => {
    if (!window.electronAPI) return;
    try {
      setLoading(true);
      const data = await window.electronAPI.getIngresos({});
      setIngresos(data || []);
    } catch (error) {
      console.error('Error al cargar ingresos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarIngresos(); }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.searchable-dropdown')) setShowSocioResults(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSocios = socios.filter(s =>
    `${s.nombre} ${s.apellido} ${s.dni}`.toLowerCase().includes(socioSearch.toLowerCase())
  );

  const selectSocio = (socio) => {
    setSelectedSocio(socio);
    setSocioSearch(`${socio.nombre} ${socio.apellido} (DNI ${socio.dni})`);
    setShowSocioResults(false);
  };

  const handleRegistrarIngreso = async (e) => {
    e.preventDefault();
    if (!selectedSocio) {
      await window.nativeDialog.warning({ message: 'Elegí un socio', detail: 'Buscá y seleccioná a la persona que está ingresando.' });
      return;
    }
    try {
      await window.electronAPI.registrarIngreso({ socioId: selectedSocio.id });
      await cargarIngresos();
      setSocioSearch('');
      setSelectedSocio(null);
    } catch (error) {
      console.error('Error al registrar ingreso:', error);
      await window.nativeDialog.error({ message: 'No se pudo registrar el ingreso', detail: error.message });
    }
  };

  const hoy = new Date().toDateString();
  const ingresosHoy = ingresos.filter(i => new Date(i.fechaHora).toDateString() === hoy);

  const formatFechaHora = (fecha) => fecha ? new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="gestion-container">
        <div className="gestion-header">
          <div className="header-content">
            <h1>Ingresos a Sala</h1>
            <span className="header-separator">|</span>
            <p>Registrá el ingreso de socios a la sala de lectura</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><Users size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Ingresos Hoy</h3><p className="stat-value">{ingresosHoy.length}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Calendar size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Total Registrado</h3><p className="stat-value">{ingresos.length}</p></div>
          </div>
        </div>

        <div className="form-section">
          <h3>Registrar Ingreso</h3>
          <form onSubmit={handleRegistrarIngreso} className="prestamo-form">
            <div className="form-row">
              <div className="form-group searchable-dropdown">
                <label>Socio <span style={{ color: "#ef4444" }}>*</span></label>
                <div className="search-wrapper">
                  <input
                    type="text" placeholder="Buscar por nombre o DNI..."
                    value={socioSearch}
                    onChange={(e) => { setSocioSearch(e.target.value); setShowSocioResults(true); setSelectedSocio(null); }}
                    onFocus={() => setShowSocioResults(socioSearch.length > 0)}
                  />
                  {showSocioResults && filteredSocios.length > 0 && (
                    <div className="search-results">
                      {filteredSocios.map(socio => (
                        <div key={socio.id} className="search-result-item" onClick={() => selectSocio(socio)}>
                          <User size={16} /><span>{socio.nombre} {socio.apellido} — DNI {socio.dni}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button type="submit" className="submit-button" style={{ alignSelf: 'flex-end' }}><LogIn size={16} />Registrar Ingreso</button>
            </div>
          </form>
        </div>

        <div className="table-section">
          <div className="table-header"><h3>Últimos Ingresos</h3><span className="count">{ingresos.length} registros</span></div>
          <div className="table-container">
            {loading ? <p style={{ padding: '1.5rem', opacity: 0.7 }}>Cargando...</p> : (
              <table className="gestion-table">
                <thead><tr><th>Socio</th><th>DNI</th><th>Fecha y Hora</th></tr></thead>
                <tbody>
                  {ingresos.slice(0, 100).map(i => (
                    <tr key={i.id}>
                      <td><div className="user-info"><User size={14} /><span>{i.socioNombre} {i.socioApellido}</span></div></td>
                      <td>{i.socioDni}</td>
                      <td><div className="date-info"><Calendar size={14} /><span>{formatFechaHora(i.fechaHora)}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}