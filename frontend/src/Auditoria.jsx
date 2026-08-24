import React, { useState, useEffect } from 'react';
import { ShieldCheck, Menu, Filter, CheckCircle, XCircle, Calendar, User, AlertTriangle } from 'lucide-react';
import './gestion.css';
import Sidebar from './Sidebar.jsx';

const MODULOS = ['obras', 'ejemplares', 'socios', 'prestamos', 'renovaciones', 'reservas', 'sanciones', 'documentos', 'usuarios'];

export default function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [filterModulo, setFilterModulo] = useState('todos');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const cargar = async () => {
    if (!window.electronAPI) return;
    try {
      setLoading(true);
      const filters = { limit: 200 };
      if (filterModulo !== 'todos') filters.modulo = filterModulo;
      const data = await window.electronAPI.getAuditoria(filters);
      setRegistros(data || []);
    } catch (error) {
      console.error('Error al cargar auditoría:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [filterModulo]);

  const formatFechaHora = (fecha) => fecha ? new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const stats = {
    total: registros.length,
    fallos: registros.filter(r => r.resultado === 'fallo').length
  };

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="gestion-container">
        <div className="gestion-header">
          <div className="header-content">
            <h1>Auditoría del Sistema</h1>
            <span className="header-separator">|</span>
            <p>Registro de acciones realizadas por cada usuario (últimos 200 movimientos)</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><ShieldCheck size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Movimientos Mostrados</h3><p className="stat-value">{stats.total}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><XCircle size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Operaciones Fallidas</h3><p className="stat-value">{stats.fallos}</p></div>
          </div>
        </div>

        <div className="filters-section">
          <div className="filter-box custom-dropdown">
            <Filter size={18} />
            <div className="dropdown-trigger" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              {filterModulo === 'todos' ? 'Todos los módulos' : filterModulo}
              <span className="dropdown-arrow">▼</span>
            </div>
            {showFilterDropdown && (
              <div className="dropdown-menu">
                <div className={`dropdown-item ${filterModulo === 'todos' ? 'active' : ''}`} onClick={() => { setFilterModulo('todos'); setShowFilterDropdown(false); }}>Todos los módulos</div>
                {MODULOS.map(m => (
                  <div key={m} className={`dropdown-item ${filterModulo === m ? 'active' : ''}`} onClick={() => { setFilterModulo(m); setShowFilterDropdown(false); }}>{m}</div>
                ))}
              </div>
            )}
            {showFilterDropdown && <div className="dropdown-backdrop" onClick={() => setShowFilterDropdown(false)} />}
          </div>
        </div>

        <div className="table-section">
          <div className="table-header"><h3>Registro de Auditoría</h3><span className="count">{registros.length} movimientos</span></div>
          <div className="table-container">
            {loading ? <p style={{ padding: '1.5rem', opacity: 0.7 }}>Cargando...</p> : (
              <table className="gestion-table">
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Detalle</th><th>Resultado</th></tr></thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td><div className="date-info"><Calendar size={14} /><span>{formatFechaHora(r.fecha)}</span></div></td>
                      <td><div className="user-info"><User size={14} /><span>{r.usuarioNombre || '—'}</span></div></td>
                      
                      {/* LÓGICA VISUAL PARA LA ACCIÓN */}
                      <td>
                        {r.accion === 'excepcion_sala' ? (
                          <span className="status-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                            <AlertTriangle size={12} /> Excepción Sala
                          </span>
                        ) : (
                          <span style={{ textTransform: 'capitalize' }}>{r.accion}</span>
                        )}
                      </td>
                      
                      <td><span className="status-badge" style={{ backgroundColor: '#134074' }}>{r.modulo}</span></td>
                      
                      {/* LÓGICA VISUAL PARA EL DETALLE */}
                      <td style={{ 
                        maxWidth: '320px', 
                        fontSize: '0.82rem', 
                        opacity: r.accion === 'excepcion_sala' ? 1 : 0.85,
                        color: r.accion === 'excepcion_sala' ? '#fbbf24' : 'inherit',
                        fontWeight: r.accion === 'excepcion_sala' ? '500' : 'normal'
                      }}>
                        {r.detalle || '—'}
                      </td>

                      <td>
                        <span className="status-badge" style={{ backgroundColor: r.resultado === 'exito' ? '#10b981' : '#ef4444' }}>
                          {r.resultado === 'exito' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {r.resultado}
                        </span>
                      </td>
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