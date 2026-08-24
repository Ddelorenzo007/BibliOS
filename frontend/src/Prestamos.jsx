import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Filter, BookOpen, User, Calendar,
  CheckCircle, AlertTriangle, Clock, Eye, RefreshCw,
  Book, Users, FileText, Circle, CheckCircle2, Menu, Bookmark, X, ArrowRight
} from 'lucide-react';
import './prestamos.css';
import Sidebar from './Sidebar.jsx';
import { useData } from './context/DataContext.jsx';

export default function Prestamos() {
  const { prestamos: prestamosRaw, obras: obrasRaw, socios: sociosRaw, reservas: reservasRaw, refreshPrestamos, refreshReservas } = useData();

  const [vista, setVista] = useState('prestamos'); // 'prestamos' | 'reservas'

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [selectedPrestamo, setSelectedPrestamo] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // Buscador de ejemplares disponibles
  const [ejemplarSearch, setEjemplarSearch] = useState('');
  const [ejemplaresEncontrados, setEjemplaresEncontrados] = useState([]);
  const [showEjemplarResults, setShowEjemplarResults] = useState(false);
  const [selectedEjemplar, setSelectedEjemplar] = useState(null);

  // Buscador de socios
  const [socioSearch, setSocioSearch] = useState('');
  const [showSocioResults, setShowSocioResults] = useState(false);
  const [selectedSocioForm, setSelectedSocioForm] = useState(null);
  const [observaciones, setObservaciones] = useState('');

  // ===== Reservas =====
  const [showReservaForm, setShowReservaForm] = useState(false);
  const [obraSearch, setObraSearch] = useState('');
  const [showObraResults, setShowObraResults] = useState(false);
  const [selectedObraReserva, setSelectedObraReserva] = useState(null);
  const [socioReservaSearch, setSocioReservaSearch] = useState('');
  const [showSocioReservaResults, setShowSocioReservaResults] = useState(false);
  const [selectedSocioReserva, setSelectedSocioReserva] = useState(null);

  const socios = (sociosRaw || []).filter(s => s.estado === 'activo');

  // El ejemplar elegido es de Sala: hay que justificar el préstamo (excepción)
  const esEjemplarDeSala = selectedEjemplar?.tipoUbicacion === 'sala';

  // Búsqueda en vivo de ejemplares disponibles (no vive en el contexto global)
  useEffect(() => {
    const buscar = async () => {
      if (!ejemplarSearch.trim() || !window.electronAPI) { setEjemplaresEncontrados([]); return; }
      try {
        const resultados = await window.electronAPI.getEjemplares({ estado: 'disponible', search: ejemplarSearch });
        setEjemplaresEncontrados(resultados || []);
      } catch (error) {
        console.error('Error al buscar ejemplares:', error);
      }
    };
    buscar();
  }, [ejemplarSearch]);

  useEffect(() => {
    if (!showForm) {
      setEjemplarSearch(''); setSocioSearch(''); setSelectedEjemplar(null); setSelectedSocioForm(null);
      setShowEjemplarResults(false); setShowSocioResults(false); setObservaciones('');
    }
  }, [showForm]);

  useEffect(() => {
    if (!showReservaForm) {
      setObraSearch(''); setSocioReservaSearch(''); setSelectedObraReserva(null); setSelectedSocioReserva(null);
      setShowObraResults(false); setShowSocioReservaResults(false);
    }
  }, [showReservaForm]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.searchable-dropdown')) {
        setShowEjemplarResults(false); setShowSocioResults(false);
        setShowObraResults(false); setShowSocioReservaResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'activo': return '#3b82f6';
      case 'vencido': return '#ef4444';
      case 'devuelto': return '#10b981';
      case 'pendiente': return '#f59e0b';
      case 'atendida': return '#10b981';
      case 'cancelada': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getEstadoIcon = (estado) => {
    switch (estado) {
      case 'activo': return <Clock size={16} />;
      case 'vencido': return <AlertTriangle size={16} />;
      case 'devuelto': return <CheckCircle size={16} />;
      case 'pendiente': return <Bookmark size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const selectEjemplar = (ej) => {
    setSelectedEjemplar(ej);
    setEjemplarSearch(`${ej.obraTitulo} — Ej. ${ej.numeroInventario}`);
    setShowEjemplarResults(false);
  };

  const selectSocioForm = (socio) => {
    setSelectedSocioForm(socio);
    setSocioSearch(`${socio.nombre} ${socio.apellido} (DNI ${socio.dni})`);
    setShowSocioResults(false);
  };

  const filteredSociosForm = socios.filter(s =>
    `${s.nombre} ${s.apellido} ${s.dni}`.toLowerCase().includes(socioSearch.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEjemplar || !selectedSocioForm) {
      await window.nativeDialog.warning({ message: 'Faltan datos', detail: 'Elegí un ejemplar y un socio de la lista de resultados.' });
      return;
    }
    
    // Mismo chequeo que hace el backend, pero adelantado acá para no
    // hacer un viaje al servidor si ya sabemos que lo va a rechazar.
    if (esEjemplarDeSala && !observaciones.trim()) {
      await window.nativeDialog.warning({
        message: 'Este ejemplar es de Sala',
        detail: 'Los ejemplares de Sala no se prestan salvo excepción justificada. Indicá el motivo en Observaciones para continuar.'
      });
      return;
    }

    try {
      await window.electronAPI.createPrestamo({
        ejemplarId: selectedEjemplar.id,
        socioId: selectedSocioForm.id,
        observaciones: observaciones || null
      });
      refreshPrestamos();
      setShowForm(false);
    } catch (error) {
      console.error('Error al crear préstamo:', error);
      await window.nativeDialog.error({ message: 'Error al crear préstamo', detail: error.message });
    }
  };

  const handleDevolver = async (prestamoId) => {
    try {
      const resultado = await window.electronAPI.devolverLibro(prestamoId);
      refreshPrestamos();
      refreshReservas();
      if (resultado?.reservaAtendida) {
        await window.nativeDialog.message({
          message: 'Devolución registrada',
          detail: 'Este ejemplar tenía una reserva pendiente: quedó apartado (estado "Reservado") para ese socio, en vez de disponible para todos.'
        });
      } else if (resultado?.conMora) {
        await window.nativeDialog.warning({ message: 'Devolución con mora', detail: 'Este préstamo se devolvió fuera de término. Evaluá si corresponde aplicar una sanción desde el módulo de Socios.' });
      }
    } catch (error) {
      console.error('Error al devolver libro:', error);
      await window.nativeDialog.error({ message: 'Error al devolver el ejemplar', detail: error.message });
    }
  };

  const handleRenovar = async (prestamoId) => {
    try {
      await window.electronAPI.renovarPrestamo(prestamoId);
      refreshPrestamos();
    } catch (error) {
      console.error('Error al renovar préstamo:', error);
      await window.nativeDialog.error({ message: 'No se pudo renovar el préstamo', detail: error.message });
    }
  };

  // ===== Reservas =====
  const filteredObrasReserva = (obrasRaw || []).filter(o =>
    (o.ejemplaresDisponibles || 0) === 0 &&
    `${o.titulo} ${o.isbn}`.toLowerCase().includes(obraSearch.toLowerCase())
  );

  const filteredSociosReserva = socios.filter(s =>
    `${s.nombre} ${s.apellido} ${s.dni}`.toLowerCase().includes(socioReservaSearch.toLowerCase())
  );

  const selectObraReserva = (obra) => {
    setSelectedObraReserva(obra);
    setObraSearch(obra.titulo);
    setShowObraResults(false);
  };

  const selectSocioReserva = (socio) => {
    setSelectedSocioReserva(socio);
    setSocioReservaSearch(`${socio.nombre} ${socio.apellido} (DNI ${socio.dni})`);
    setShowSocioReservaResults(false);
  };

  const handleSubmitReserva = async (e) => {
    e.preventDefault();
    if (!selectedObraReserva || !selectedSocioReserva) {
      await window.nativeDialog.warning({ message: 'Faltan datos', detail: 'Elegí una obra y un socio de la lista de resultados.' });
      return;
    }
    try {
      await window.electronAPI.createReserva({ obraId: selectedObraReserva.id, socioId: selectedSocioReserva.id });
      refreshReservas();
      setShowReservaForm(false);
    } catch (error) {
      console.error('Error al crear reserva:', error);
      await window.nativeDialog.error({ message: 'No se pudo crear la reserva', detail: error.message });
    }
  };

  const handleCancelarReserva = async (id) => {
    try {
      await window.electronAPI.cancelarReserva(id);
      refreshReservas();
    } catch (error) {
      console.error('Error al cancelar reserva:', error);
      await window.nativeDialog.error({ message: 'No se pudo cancelar la reserva', detail: error.message });
    }
  };

  const handleEntregarReserva = async (reserva) => {
    try {
      await window.electronAPI.createPrestamo({ ejemplarId: reserva.ejemplarAsignadoId, socioId: reserva.socioId });
      refreshPrestamos();
      refreshReservas();
    } catch (error) {
      console.error('Error al entregar la reserva:', error);
      await window.nativeDialog.error({ message: 'No se pudo entregar el ejemplar reservado', detail: error.message });
    }
  };

  // Filtrado y búsqueda de préstamos
  const filteredPrestamos = (prestamosRaw || []).filter(prestamo => {
    const matchesSearch = searchTerm === '' ||
      (prestamo.obraTitulo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (`${prestamo.socioNombre || ''} ${prestamo.socioApellido || ''}`).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'todos' || prestamo.estado === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: (prestamosRaw || []).length,
    activos: (prestamosRaw || []).filter(p => p.estado === 'activo').length,
    vencidos: (prestamosRaw || []).filter(p => p.estado === 'vencido').length,
    devueltos: (prestamosRaw || []).filter(p => p.estado === 'devuelto').length
  };

  const formatFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString('es-AR') : '—';

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="prestamos-container">
        <div className="prestamos-header">
          <div className="header-content">
            <h1>Gestión de Préstamos</h1>
            <span className="header-separator">|</span>
            <p>Administrá préstamos, renovaciones y reservas de ejemplares</p>
          </div>
          {vista === 'prestamos' ? (
            <button className="add-button" onClick={() => setShowForm(!showForm)}><Plus size={18} />Nuevo Préstamo</button>
          ) : (
            <button className="add-button" onClick={() => setShowReservaForm(!showReservaForm)}><Plus size={18} />Nueva Reserva</button>
          )}
        </div>

        {/* Toggle Préstamos / Reservas */}
        <div className="vista-toggle">
          <button className={vista === 'prestamos' ? 'active' : ''} onClick={() => setVista('prestamos')}>
            <BookOpen size={16} /> Préstamos
          </button>
          <button className={vista === 'reservas' ? 'active' : ''} onClick={() => setVista('reservas')}>
            <Bookmark size={16} /> Reservas {(reservasRaw || []).filter(r => r.estado === 'pendiente').length > 0 && (
              <span className="badge-count">{(reservasRaw || []).filter(r => r.estado === 'pendiente').length}</span>
            )}
          </button>
        </div>

        {vista === 'prestamos' && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon"><BookOpen size={20} strokeWidth={1.5} /></div>
                <div className="stat-content"><h3>Total Préstamos</h3><p className="stat-value">{stats.total}</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><Clock size={20} strokeWidth={1.5} /></div>
                <div className="stat-content"><h3>Activos</h3><p className="stat-value">{stats.activos}</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><AlertTriangle size={20} strokeWidth={1.5} /></div>
                <div className="stat-content"><h3>Vencidos</h3><p className="stat-value">{stats.vencidos}</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><CheckCircle2 size={20} strokeWidth={1.5} /></div>
                <div className="stat-content"><h3>Devueltos</h3><p className="stat-value">{stats.devueltos}</p></div>
              </div>
            </div>

            {showForm && (
              <div className="form-section">
                <h3>Nuevo Préstamo</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '-0.5rem' }}>La fecha de devolución se calcula automáticamente a 14 días desde hoy.</p>
                <form onSubmit={handleSubmit} className="prestamo-form">
                  <div className="form-row">
                    <div className="form-group searchable-dropdown">
                      <label>Ejemplar <span style={{ color: "#ef4444" }}>*</span></label>
                      <div className="search-wrapper">
                        <input
                          type="text" placeholder="Buscar por título, ISBN o inventario..."
                          value={ejemplarSearch}
                          onChange={(e) => { setEjemplarSearch(e.target.value); setShowEjemplarResults(true); setSelectedEjemplar(null); }}
                          onFocus={() => setShowEjemplarResults(ejemplarSearch.length > 0)}
                          required
                        />
                        {showEjemplarResults && ejemplaresEncontrados.length > 0 && (
                          <div className="search-results">
                            {ejemplaresEncontrados.map(ej => (
                              <div key={ej.id} className="search-result-item" onClick={() => selectEjemplar(ej)}>
                                <Book size={16} />
                                <div>
                                  <strong>
                                    {ej.obraTitulo}
                                    {ej.tipoUbicacion === 'sala' && <span className="badge-ubicacion badge-sala" style={{ marginLeft: '0.5rem' }}>Sala</span>}
                                  </strong>
                                  <span>Ej. {ej.numeroInventario} {ej.tomoNumero && ej.tomoNumero !== 'Único' ? `· ${ej.tomoNumero}` : ''}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="form-group searchable-dropdown">
                      <label>Socio <span style={{ color: "#ef4444" }}>*</span></label>
                      <div className="search-wrapper">
                        <input
                          type="text" placeholder="Buscar por nombre o DNI..."
                          value={socioSearch}
                          onChange={(e) => { setSocioSearch(e.target.value); setShowSocioResults(true); setSelectedSocioForm(null); }}
                          onFocus={() => setShowSocioResults(socioSearch.length > 0)}
                          required
                        />
                        {showSocioResults && filteredSociosForm.length > 0 && (
                          <div className="search-results">
                            {filteredSociosForm.map(socio => (
                              <div key={socio.id} className="search-result-item" onClick={() => selectSocioForm(socio)}>
                                <User size={16} />
                                <span>{socio.nombre} {socio.apellido} — DNI {socio.dni}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {esEjemplarDeSala && (
                    <div className="alerta-sala">
                      <AlertTriangle size={16} />
                      <span>Este ejemplar es de <strong>Sala</strong> (no circula normalmente). Para prestarlo como excepción, es obligatorio indicar el motivo abajo.</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="observaciones">
                      Observaciones {esEjemplarDeSala && <span style={{ color: "#ef4444" }}>* (obligatorio: motivo de la excepción)</span>}
                    </label>
                    <textarea
                      id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                      placeholder={esEjemplarDeSala ? 'Ej: préstamo autorizado al docente para preparar una clase' : 'Notas adicionales sobre el préstamo...'}
                      rows="3"
                      required={esEjemplarDeSala}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="submit-button"><Plus size={18} />Crear Préstamo</button>
                    <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            <div className="filters-section">
              <div className="search-box">
                <Search size={18} />
                <input type="text" placeholder="Buscar por obra o socio..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="filter-box custom-dropdown">
                <Filter size={18} />
                <div className="dropdown-trigger" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
                  {filterStatus === 'todos' && 'Todos los estados'}
                  {filterStatus === 'activo' && 'Activos'}
                  {filterStatus === 'vencido' && 'Vencidos'}
                  {filterStatus === 'devuelto' && 'Devueltos'}
                  <span className="dropdown-arrow">▼</span>
                </div>
                {showFilterDropdown && (
                  <div className="dropdown-menu">
                    {['todos', 'activo', 'vencido', 'devuelto'].map(f => (
                      <div key={f} className={`dropdown-item ${filterStatus === f ? 'active' : ''}`} onClick={() => { setFilterStatus(f); setShowFilterDropdown(false); }}>
                        {f === 'todos' ? 'Todos los estados' : f.charAt(0).toUpperCase() + f.slice(1) + (f !== 'activo' ? '' : 's')}
                      </div>
                    ))}
                  </div>
                )}
                {showFilterDropdown && <div className="dropdown-backdrop" onClick={() => setShowFilterDropdown(false)} />}
              </div>
            </div>

            <div className="table-section">
              <div className="table-header">
                <h3>Lista de Préstamos</h3>
                <span className="count">{filteredPrestamos.length} préstamos</span>
              </div>
              <div className="table-container">
                <table className="prestamos-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Obra / Ejemplar</th><th>Socio</th><th>Préstamo</th><th>Vence</th><th>Estado</th><th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrestamos.map(prestamo => (
                      <tr key={prestamo.id}>
                        <td>#{prestamo.id}</td>
                        <td>
                          <div className="book-info">
                            <Book size={14} />
                            <span>{prestamo.obraTitulo || '[Ejemplar eliminado]'} {prestamo.numeroInventario ? `(${prestamo.numeroInventario})` : ''}</span>
                          </div>
                        </td>
                        <td>
                          <div className="user-info">
                            <User size={14} />
                            <span>{prestamo.socioNombre ? `${prestamo.socioNombre} ${prestamo.socioApellido}` : '[Socio eliminado]'}</span>
                          </div>
                        </td>
                        <td><div className="date-info"><Calendar size={14} /><span>{formatFecha(prestamo.fechaPrestamo)}</span></div></td>
                        <td><div className="date-info"><Calendar size={14} /><span>{formatFecha(prestamo.fechaDevolucionPrevista)}</span></div></td>
                        <td>
                          <span className="status-badge" style={{ backgroundColor: getEstadoColor(prestamo.estado) }}>
                            {getEstadoIcon(prestamo.estado)}{prestamo.estado}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button className="action-btn view" onClick={() => { setSelectedPrestamo(prestamo); setShowDetails(true); }} title="Ver detalles"><Eye size={14} /></button>
                            {prestamo.estado === 'activo' && (
                              <button className="action-btn renovar" onClick={() => handleRenovar(prestamo.id)} title="Renovar 7 días"><RefreshCw size={14} /></button>
                            )}
                            {(prestamo.estado === 'activo' || prestamo.estado === 'vencido') && (
                              <button className="action-btn complete" onClick={() => handleDevolver(prestamo.id)} title="Marcar como devuelto"><CheckCircle size={14} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {vista === 'reservas' && (
          <>
            {showReservaForm && (
              <div className="form-section">
                <h3>Nueva Reserva</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '-0.5rem' }}>Solo se puede reservar una obra sin ejemplares disponibles en este momento — si hay stock, registrá un préstamo directo.</p>
                <form onSubmit={handleSubmitReserva} className="prestamo-form">
                  <div className="form-row">
                    <div className="form-group searchable-dropdown">
                      <label>Obra <span style={{ color: "#ef4444" }}>*</span></label>
                      <div className="search-wrapper">
                        <input
                          type="text" placeholder="Buscar obra sin stock..."
                          value={obraSearch}
                          onChange={(e) => { setObraSearch(e.target.value); setShowObraResults(true); setSelectedObraReserva(null); }}
                          onFocus={() => setShowObraResults(obraSearch.length > 0)}
                          required
                        />
                        {showObraResults && filteredObrasReserva.length > 0 && (
                          <div className="search-results">
                            {filteredObrasReserva.map(o => (
                              <div key={o.id} className="search-result-item" onClick={() => selectObraReserva(o)}>
                                <Book size={16} /><div><strong>{o.titulo}</strong><span>{o.isbn}</span></div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="form-group searchable-dropdown">
                      <label>Socio <span style={{ color: "#ef4444" }}>*</span></label>
                      <div className="search-wrapper">
                        <input
                          type="text" placeholder="Buscar por nombre o DNI..."
                          value={socioReservaSearch}
                          onChange={(e) => { setSocioReservaSearch(e.target.value); setShowSocioReservaResults(true); setSelectedSocioReserva(null); }}
                          onFocus={() => setShowSocioReservaResults(socioReservaSearch.length > 0)}
                          required
                        />
                        {showSocioReservaResults && filteredSociosReserva.length > 0 && (
                          <div className="search-results">
                            {filteredSociosReserva.map(socio => (
                              <div key={socio.id} className="search-result-item" onClick={() => selectSocioReserva(socio)}>
                                <User size={16} /><span>{socio.nombre} {socio.apellido} — DNI {socio.dni}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="submit-button"><Plus size={18} />Registrar Reserva</button>
                    <button type="button" className="cancel-button" onClick={() => setShowReservaForm(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}
            <div className="table-section">
              <div className="table-header">
                <h3>Reservas</h3>
                <span className="count">{(reservasRaw || []).length} reservas</span>
              </div>
              <div className="table-container">
                <table className="prestamos-table">
                  <thead>
                    <tr><th>ID</th><th>Obra</th><th>Socio</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {(reservasRaw || []).map(reserva => (
                      <tr key={reserva.id}>
                        <td>#{reserva.id}</td>
                        <td><div className="book-info"><Book size={14} /><span>{reserva.obraTitulo}</span></div></td>
                        <td><div className="user-info"><User size={14} /><span>{reserva.socioNombre} {reserva.socioApellido}</span></div></td>
                        <td><div className="date-info"><Calendar size={14} /><span>{formatFecha(reserva.fechaReserva)}</span></div></td>
                        <td>
                          <span className="status-badge" style={{ backgroundColor: getEstadoColor(reserva.estado) }}>
                            {getEstadoIcon(reserva.estado)}{reserva.estado}
                            {reserva.estado === 'pendiente' && reserva.ejemplarAsignadoId ? ' (listo para retirar)' : ''}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            {reserva.estado === 'pendiente' && reserva.ejemplarAsignadoId && (
                              <button className="action-btn complete" onClick={() => handleEntregarReserva(reserva)} title="Entregar ejemplar reservado"><ArrowRight size={14} /></button>
                            )}
                            {reserva.estado === 'pendiente' && (
                              <button className="action-btn delete" onClick={() => handleCancelarReserva(reserva.id)} title="Cancelar reserva"><X size={14} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Modal de detalles de préstamo */}
        {showDetails && selectedPrestamo && (
          <div className="modal-overlay" onClick={() => setShowDetails(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Detalles del Préstamo #{selectedPrestamo.id}</h3>
                <button className="close-button" onClick={() => setShowDetails(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="detail-row"><span className="label">Obra:</span><span className="value">{selectedPrestamo.obraTitulo || '[Ejemplar eliminado]'}</span></div>
                <div className="detail-row"><span className="label">Ejemplar:</span><span className="value">{selectedPrestamo.numeroInventario || '—'}</span></div>
                <div className="detail-row"><span className="label">Socio:</span><span className="value">{selectedPrestamo.socioNombre ? `${selectedPrestamo.socioNombre} ${selectedPrestamo.socioApellido}` : '[Socio eliminado]'}</span></div>
                <div className="detail-row"><span className="label">Fecha de Préstamo:</span><span className="value">{formatFecha(selectedPrestamo.fechaPrestamo)}</span></div>
                <div className="detail-row"><span className="label">Fecha de Devolución Prevista:</span><span className="value">{formatFecha(selectedPrestamo.fechaDevolucionPrevista)}</span></div>
                {selectedPrestamo.fechaDevolucionReal && (
                  <div className="detail-row"><span className="label">Fecha de Devolución Real:</span><span className="value">{formatFecha(selectedPrestamo.fechaDevolucionReal)}</span></div>
                )}
                <div className="detail-row">
                  <span className="label">Estado:</span>
                  <span className="value status-badge" style={{ backgroundColor: getEstadoColor(selectedPrestamo.estado) }}>{selectedPrestamo.estado}</span>
                </div>
                {selectedPrestamo.observaciones && (
                  <div className="detail-row"><span className="label">Observaciones:</span><span className="value">{selectedPrestamo.observaciones}</span></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}