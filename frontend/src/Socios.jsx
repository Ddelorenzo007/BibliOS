import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Filter, User, Mail, Phone, Calendar,
  CheckCircle, AlertTriangle, Clock, Eye, Edit, Trash2,
  Users, FileText, Circle, CheckCircle2, MapPin, Menu, Zap,
  Ban, ShieldAlert, IdCard, UserCheck
} from 'lucide-react';
import './socios.css';
import Sidebar from './Sidebar.jsx';
import { useData } from './context/DataContext.jsx';
import { buscarPersonaPorDNI } from './utils/academicoService.js';

const TIPOS_SOCIO = [
  { value: 'alumno', label: 'Alumno' },
  { value: 'graduado', label: 'Graduado' },
  { value: 'docente', label: 'Docente' },
  { value: 'no_docente', label: 'No docente' },
];

const FORM_VACIO = {
  nombre: '', apellido: '', dni: '', legajo: '', tipoSocio: 'alumno',
  email: '', telefono: '', direccion: '', observaciones: ''
};

export default function Socios() {
  const { socios: sociosRaw, prestamos, refreshSocios } = useData();

  const [socios, setSocios] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedSocio, setSelectedSocio] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sancionesSocio, setSancionesSocio] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [socioToDelete, setSocioToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [socioToEdit, setSocioToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isBuscandoDNI, setIsBuscandoDNI] = useState(false);

  // Modal de sanción
  const [showSancionModal, setShowSancionModal] = useState(false);
  const [socioASancionar, setSocioASancionar] = useState(null);
  const [sancionForm, setSancionForm] = useState({ motivo: '', fechaFin: '' });

  const [formData, setFormData] = useState(FORM_VACIO);

  useEffect(() => {
    if (sociosRaw && prestamos) {
      const sorted = [...sociosRaw].sort((a, b) => a.id - b.id);
      const sociosWithStats = sorted.map((socio, index) => {
        const socioPrestamos = prestamos.filter(p => p.socioId === socio.id);
        const activos = socioPrestamos.filter(p => p.estado === 'activo' || p.estado === 'vencido').length;
        const totales = socioPrestamos.length;
        return { ...socio, numeroEnBiblioteca: index + 1, prestamosActivos: activos, prestamosTotales: totales };
      });
      setSocios(sociosWithStats);
    }
  }, [sociosRaw, prestamos]);

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'activo': return '#10b981';
      case 'inactivo': return '#6b7280';
      case 'sancionado': return '#ef4444';
      default: return '#6b7280';
    }
  };
  const getEstadoIcon = (estado) => {
    switch (estado) {
      case 'activo': return <CheckCircle size={14} />;
      case 'sancionado': return <Ban size={14} />;
      case 'inactivo': return <Circle size={14} />;
      default: return <Circle size={14} />;
    }
  };
  const formatearTipoSocio = (tipo) => TIPOS_SOCIO.find(t => t.value === tipo)?.label || tipo;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handleInputClick = (e) => { e.target.focus(); e.target.select(); };

  // Autocompletar por DNI contra el (por ahora simulado) sistema académico
  const handleBuscarPorDNI = async () => {
    if (!formData.dni.trim()) {
      await window.nativeDialog.warning({ message: 'DNI requerido', detail: 'Ingresá el DNI para buscar en el sistema académico.' });
      return;
    }
    setIsBuscandoDNI(true);
    try {
      const persona = await buscarPersonaPorDNI(formData.dni.trim());
      if (persona) {
        setFormData(prev => ({
          ...prev,
          nombre: persona.nombre || prev.nombre,
          apellido: persona.apellido || prev.apellido,
          tipoSocio: persona.tipoSocio || prev.tipoSocio,
          legajo: persona.legajo || prev.legajo
        }));
        await window.nativeDialog.message({ message: 'Persona encontrada', detail: 'Se completaron los datos desde el sistema académico. Revisalos antes de guardar.' });
      } else {
        await window.nativeDialog.warning({ message: 'No encontrado', detail: 'No se encontró a esa persona en el sistema académico. Completá los datos manualmente.' });
      }
    } catch (error) {
      console.error('Error al buscar por DNI:', error);
      await window.nativeDialog.error({ message: 'Error al consultar el sistema académico', detail: error.message });
    } finally {
      setIsBuscandoDNI(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (window.electronAPI) {
        await window.electronAPI.createSocio({
          nombre: formData.nombre,
          apellido: formData.apellido,
          dni: formData.dni,
          legajo: formData.legajo || null,
          tipoSocio: formData.tipoSocio,
          email: formData.email,
          telefono: formData.telefono || null,
          direccion: formData.direccion || null,
          observaciones: formData.observaciones || null
        });
        refreshSocios();
      }
      setFormData(FORM_VACIO);
      setShowForm(false);
    } catch (error) {
      console.error('Error al crear socio:', error);
      await window.nativeDialog.error({ message: 'Error al crear socio', detail: error.message });
    }
  };

  const handleEliminar = (socioId) => { setSocioToDelete(socioId); setShowDeleteConfirm(true); };

  const handleReactivar = async (socioId) => {
    try {
      await window.electronAPI.updateSocio(socioId, { estado: 'activo' });
      refreshSocios();
    } catch (error) {
      console.error('Error al reactivar socio:', error);
      await window.nativeDialog.error({ message: 'No se pudo reactivar al socio', detail: error.message });
    }
  };

  const confirmDelete = async () => {
    if (socioToDelete) {
      try {
        await window.electronAPI.darDeBajaSocio(socioToDelete);
        refreshSocios();
      } catch (error) {
        console.error('Error al dar de baja socio:', error);
        await window.nativeDialog.error({ message: 'No se pudo dar de baja al socio', detail: error.message });
      }
      setSocioToDelete(null);
    }
    setShowDeleteConfirm(false);
  };
  const cancelDelete = () => { setSocioToDelete(null); setShowDeleteConfirm(false); };

  const handleEditClick = (socio) => {
    setSocioToEdit(socio);
    setEditFormData({
      nombre: socio.nombre, apellido: socio.apellido, dni: socio.dni, legajo: socio.legajo || '',
      tipoSocio: socio.tipoSocio, email: socio.email, telefono: socio.telefono || '',
      direccion: socio.direccion || '', observaciones: socio.observaciones || ''
    });
    setShowEditModal(true);
  };
  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };
  const handleEditInputClick = (e) => { e.target.focus(); e.target.select(); };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    try {
      if (window.electronAPI && socioToEdit) {
        await window.electronAPI.updateSocio(socioToEdit.id, {
          nombre: editFormData.nombre,
          apellido: editFormData.apellido,
          dni: editFormData.dni,
          legajo: editFormData.legajo || null,
          tipoSocio: editFormData.tipoSocio,
          email: editFormData.email,
          telefono: editFormData.telefono || null,
          direccion: editFormData.direccion || null,
          observaciones: editFormData.observaciones || null
        });
        refreshSocios();
      }
      setShowEditModal(false);
      setSocioToEdit(null);
      setEditFormData({});
    } catch (error) {
      console.error('Error al actualizar socio:', error);
      await window.nativeDialog.error({ message: 'Error al actualizar socio', detail: error.message });
    }
  };

  // ===== Detalle + historial de sanciones =====
  const abrirDetalle = async (socio) => {
    setSelectedSocio(socio);
    setShowDetails(true);
    try {
      const sanciones = await window.electronAPI.getSancionesBySocio(socio.id);
      setSancionesSocio(sanciones || []);
    } catch (error) {
      console.error('Error al obtener sanciones:', error);
      setSancionesSocio([]);
    }
  };

  const handleFinalizarSancion = async (sancionId) => {
    try {
      await window.electronAPI.finalizarSancion(sancionId);
      refreshSocios();
      if (selectedSocio) {
        const sanciones = await window.electronAPI.getSancionesBySocio(selectedSocio.id);
        setSancionesSocio(sanciones || []);
      }
    } catch (error) {
      console.error('Error al finalizar sanción:', error);
      await window.nativeDialog.error({ message: 'No se pudo finalizar la sanción', detail: error.message });
    }
  };

  // ===== Aplicar sanción =====
  const abrirSancionModal = (socio) => {
    setSocioASancionar(socio);
    const fechaSugerida = new Date();
    fechaSugerida.setDate(fechaSugerida.getDate() + 15);
    setSancionForm({ motivo: '', fechaFin: fechaSugerida.toISOString().slice(0, 10) });
    setShowSancionModal(true);
  };
  const handleAplicarSancion = async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.aplicarSancion({
        socioId: socioASancionar.id,
        motivo: sancionForm.motivo,
        fechaFin: new Date(sancionForm.fechaFin + 'T23:59:59').toISOString()
      });
      refreshSocios();
      setShowSancionModal(false);
      setSocioASancionar(null);
    } catch (error) {
      console.error('Error al aplicar sanción:', error);
      await window.nativeDialog.error({ message: 'No se pudo aplicar la sanción', detail: error.message });
    }
  };

  // Filtrado y búsqueda
  const filteredSocios = socios.filter(socio => {
    const matchesSearch = searchTerm === '' ||
      socio.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (socio.apellido || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      socio.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (socio.dni || '').includes(searchTerm) ||
      (socio.legajo || '').includes(searchTerm);
    const matchesFilter = filterStatus === 'todos' || socio.estado === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: socios.length,
    activos: socios.filter(s => s.estado === 'activo').length,
    sancionados: socios.filter(s => s.estado === 'sancionado').length,
    inactivos: socios.filter(s => s.estado === 'inactivo').length,
  };

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="socios-container">
        <div className="socios-header">
          <div className="header-content">
            <h1>Gestión de Socios</h1>
            <span className="header-separator">|</span>
            <p>Administrá los socios de la biblioteca, sus datos y estado de membresía</p>
          </div>
          <button className="add-button" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} />
            Nuevo Socio
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><Users size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Total Socios</h3><p className="stat-value">{stats.total}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><CheckCircle2 size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Activos</h3><p className="stat-value">{stats.activos}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><ShieldAlert size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Sancionados</h3><p className="stat-value">{stats.sancionados}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Circle size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Inactivos</h3><p className="stat-value">{stats.inactivos}</p></div>
          </div>
        </div>

        {showForm && (
          <div className="form-section">
            <h3>Nuevo Socio</h3>
            <form onSubmit={handleSubmit} className="socio-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="dni">DNI <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="dni" name="dni" value={formData.dni} onChange={handleInputChange} onClick={handleInputClick} required />
                </div>
                <div className="form-group">
                  <label htmlFor="nombre">Nombre <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="nombre" name="nombre" value={formData.nombre} onChange={handleInputChange} onClick={handleInputClick} required />
                </div>
                <div className="form-group">
                  <label htmlFor="apellido">Apellido <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="apellido" name="apellido" value={formData.apellido} onChange={handleInputChange} onClick={handleInputClick} required />
                </div>
                <div className="form-group">
                  <label htmlFor="tipoSocio">Tipo de Socio <span style={{ color: "#ef4444" }}>*</span></label>
                  <select id="tipoSocio" name="tipoSocio" value={formData.tipoSocio} onChange={handleInputChange} required>
                    {TIPOS_SOCIO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="legajo">Legajo</label>
                  <input type="text" id="legajo" name="legajo" value={formData.legajo} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange} onClick={handleInputClick} required />
                </div>
                <div className="form-group">
                  <label htmlFor="telefono">Teléfono</label>
                  <input type="tel" id="telefono" name="telefono" value={formData.telefono} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
                <div className="form-group">
                  <label htmlFor="direccion">Dirección</label>
                  <input type="text" id="direccion" name="direccion" value={formData.direccion} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="observaciones">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" value={formData.observaciones} onChange={handleInputChange} onClick={handleInputClick} rows="4" />
                </div>
              </div>

              <div className="auto-search-section">
                <button type="button" className="auto-search-button" onClick={handleBuscarPorDNI} disabled={isBuscandoDNI}>
                  <Zap size={16} />
                  {isBuscandoDNI ? 'Buscando...' : 'Buscar por DNI'}
                </button>
                <p className="auto-search-hint">
                  Autocompleta nombre, apellido, legajo y tipo desde el sistema académico (por ahora, datos simulados — la integración real todavía no está definida por TIC).
                </p>
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-button"><Plus size={16} />Registrar Socio</button>
                <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        <div className="filters-section">
          <div className="search-box">
            <Search size={16} />
            <input type="text" placeholder="Buscar por nombre, apellido, DNI, legajo o email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="filter-box custom-dropdown">
            <Filter size={16} />
            <div className="dropdown-trigger" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              {filterStatus === 'todos' && 'Todos los estados'}
              {filterStatus === 'activo' && 'Activos'}
              {filterStatus === 'sancionado' && 'Sancionados'}
              {filterStatus === 'inactivo' && 'Inactivos'}
              <span className="dropdown-arrow">▼</span>
            </div>
            {showFilterDropdown && (
              <div className="dropdown-menu">
                <div className={`dropdown-item ${filterStatus === 'todos' ? 'active' : ''}`} onClick={() => { setFilterStatus('todos'); setShowFilterDropdown(false); }}>Todos los estados</div>
                <div className={`dropdown-item ${filterStatus === 'activo' ? 'active' : ''}`} onClick={() => { setFilterStatus('activo'); setShowFilterDropdown(false); }}>Activos</div>
                <div className={`dropdown-item ${filterStatus === 'sancionado' ? 'active' : ''}`} onClick={() => { setFilterStatus('sancionado'); setShowFilterDropdown(false); }}>Sancionados</div>
                <div className={`dropdown-item ${filterStatus === 'inactivo' ? 'active' : ''}`} onClick={() => { setFilterStatus('inactivo'); setShowFilterDropdown(false); }}>Inactivos</div>
              </div>
            )}
            {showFilterDropdown && <div className="dropdown-backdrop" onClick={() => setShowFilterDropdown(false)} />}
          </div>
        </div>

        <div className="table-section">
          <div className="table-header">
            <h3>Lista de Socios</h3>
            <span className="count">{filteredSocios.length} socios</span>
          </div>
          <div className="table-container">
            <table className="socios-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Socio</th>
                  <th>DNI / Legajo</th>
                  <th>Tipo</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th>Préstamos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSocios.map(socio => (
                  <tr key={socio.id}>
                    <td className="id-cell">#{socio.numeroEnBiblioteca}</td>
                    <td>
                      <div className="socio-info">
                        <div className="socio-avatar"><User size={16} /></div>
                        <div>
                          <strong>{socio.nombre} {socio.apellido}</strong>
                          {socio.direccion && <div className="socio-address"><MapPin size={12} />{socio.direccion}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="contact-item"><IdCard size={12} />{socio.dni}</div>
                      {socio.legajo && <div className="contact-item" style={{ opacity: 0.7 }}>Legajo {socio.legajo}</div>}
                    </td>
                    <td>{formatearTipoSocio(socio.tipoSocio)}</td>
                    <td>
                      <div className="contact-info">
                        <div className="contact-item"><Mail size={12} />{socio.email}</div>
                        {socio.telefono && <div className="contact-item"><Phone size={12} />{socio.telefono}</div>}
                      </div>
                    </td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: getEstadoColor(socio.estado) }}>
                        {getEstadoIcon(socio.estado)}
                        {socio.estado}
                      </span>
                    </td>
                    <td>
                      <div className="prestamos-info">
                        <div className="prestamos-activos"><Clock size={12} />{socio.prestamosActivos} activos</div>
                        <div className="prestamos-totales"><FileText size={12} />{socio.prestamosTotales} total</div>
                      </div>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="action-btn view" onClick={() => abrirDetalle(socio)} title="Ver detalles"><Eye size={14} /></button>
                        <button className="action-btn edit" onClick={() => handleEditClick(socio)} title="Editar socio"><Edit size={14} /></button>
                        {socio.estado !== 'sancionado' && (
                          <button className="action-btn sancionar" onClick={() => abrirSancionModal(socio)} title="Aplicar sanción"><ShieldAlert size={14} /></button>
                        )}
                        {socio.estado === 'inactivo' ? (
                          <button className="action-btn reactivar" onClick={() => handleReactivar(socio.id)} title="Reactivar socio"><UserCheck size={14} /></button>
                        ) : (
                          <button className="action-btn delete" onClick={() => handleEliminar(socio.id)} title="Dar de baja"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal de detalles + historial de sanciones */}
        {showDetails && selectedSocio && (
          <div className="modal-overlay" onClick={() => setShowDetails(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Detalles del Socio #{selectedSocio.numeroEnBiblioteca}</h3>
                <button className="close-button" onClick={() => setShowDetails(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="detail-row"><span className="label">Nombre:</span><span className="value">{selectedSocio.nombre} {selectedSocio.apellido}</span></div>
                <div className="detail-row"><span className="label">DNI:</span><span className="value">{selectedSocio.dni}</span></div>
                {selectedSocio.legajo && <div className="detail-row"><span className="label">Legajo:</span><span className="value">{selectedSocio.legajo}</span></div>}
                <div className="detail-row"><span className="label">Tipo:</span><span className="value">{formatearTipoSocio(selectedSocio.tipoSocio)}</span></div>
                <div className="detail-row"><span className="label">Email:</span><span className="value">{selectedSocio.email}</span></div>
                <div className="detail-row"><span className="label">Teléfono:</span><span className="value">{selectedSocio.telefono || 'No especificado'}</span></div>
                <div className="detail-row"><span className="label">Dirección:</span><span className="value">{selectedSocio.direccion || 'No especificada'}</span></div>
                <div className="detail-row">
                  <span className="label">Estado:</span>
                  <span className="value status-badge" style={{ backgroundColor: getEstadoColor(selectedSocio.estado) }}>{selectedSocio.estado}</span>
                </div>
                <div className="detail-row"><span className="label">Préstamos Activos:</span><span className="value">{selectedSocio.prestamosActivos}</span></div>
                <div className="detail-row"><span className="label">Total de Préstamos:</span><span className="value">{selectedSocio.prestamosTotales}</span></div>
                {selectedSocio.observaciones && (
                  <div className="detail-row"><span className="label">Observaciones:</span><span className="value">{selectedSocio.observaciones}</span></div>
                )}

                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>Historial de sanciones</h4>
                  {sancionesSocio.length === 0 && <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Sin sanciones registradas.</p>}
                  {sancionesSocio.map(s => (
                    <div key={s.id} className="sancion-row">
                      <div>
                        <strong style={{ color: s.estado === 'vigente' ? '#ef4444' : 'inherit' }}>{s.estado === 'vigente' ? 'Vigente' : 'Finalizada'}</strong>
                        {' — '}{s.motivo}
                        <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                          Desde {new Date(s.fechaInicio).toLocaleDateString('es-AR')} hasta {new Date(s.fechaFin).toLocaleDateString('es-AR')}
                        </div>
                      </div>
                      {s.estado === 'vigente' && (
                        <button className="cancel-button" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={() => handleFinalizarSancion(s.id)}>
                          Finalizar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de aplicar sanción */}
        {showSancionModal && socioASancionar && (
          <div className="modal-overlay" onClick={() => setShowSancionModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Aplicar Sanción a {socioASancionar.nombre} {socioASancionar.apellido}</h3>
                <button className="close-button" onClick={() => setShowSancionModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleAplicarSancion} className="socio-form">
                  <div className="form-row" style={{ display: 'block' }}>
                    <div className="form-group">
                      <label htmlFor="sancion-motivo">Motivo <span style={{ color: "#ef4444" }}>*</span></label>
                      <textarea id="sancion-motivo" value={sancionForm.motivo} onChange={e => setSancionForm(prev => ({ ...prev, motivo: e.target.value }))} rows="3" required />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="sancion-fechaFin">Vigente hasta <span style={{ color: "#ef4444" }}>*</span></label>
                      <input type="date" id="sancion-fechaFin" value={sancionForm.fechaFin} onChange={e => setSancionForm(prev => ({ ...prev, fechaFin: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="submit-button"><ShieldAlert size={16} />Aplicar Sanción</button>
                    <button type="button" className="cancel-button" onClick={() => setShowSancionModal(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmación de baja */}
        {showDeleteConfirm && (
          <div className="modal-overlay" onClick={cancelDelete}>
            <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirmar Baja</h3>
                <button className="close-button" onClick={cancelDelete}>×</button>
              </div>
              <div className="modal-body">
                <div className="confirm-message">
                  <AlertTriangle size={24} color="#ef4444" />
                  <p>¿Dar de baja este socio?</p>
                  <p className="confirm-warning">Se bloquea si tiene préstamos activos o sanciones vigentes.</p>
                </div>
                <div className="confirm-actions">
                  <button className="confirm-btn cancel" onClick={cancelDelete}>Cancelar</button>
                  <button className="confirm-btn delete" onClick={confirmDelete}>Dar de baja</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de edición */}
        {showEditModal && socioToEdit && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Editar Socio #{socioToEdit.numeroEnBiblioteca}</h3>
                <button className="close-button" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleUpdateSubmit} className="socio-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit-dni">DNI <span style={{ color: "#ef4444" }}>*</span></label>
                      <input type="text" id="edit-dni" name="dni" value={editFormData.dni} onChange={handleEditInputChange} onClick={handleEditInputClick} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-nombre">Nombre <span style={{ color: "#ef4444" }}>*</span></label>
                      <input type="text" id="edit-nombre" name="nombre" value={editFormData.nombre} onChange={handleEditInputChange} onClick={handleEditInputClick} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-apellido">Apellido <span style={{ color: "#ef4444" }}>*</span></label>
                      <input type="text" id="edit-apellido" name="apellido" value={editFormData.apellido} onChange={handleEditInputChange} onClick={handleEditInputClick} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-tipoSocio">Tipo de Socio</label>
                      <select id="edit-tipoSocio" name="tipoSocio" value={editFormData.tipoSocio} onChange={handleEditInputChange}>
                        {TIPOS_SOCIO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit-legajo">Legajo</label>
                      <input type="text" id="edit-legajo" name="legajo" value={editFormData.legajo} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-email">Email <span style={{ color: "#ef4444" }}>*</span></label>
                      <input type="email" id="edit-email" name="email" value={editFormData.email} onChange={handleEditInputChange} onClick={handleEditInputClick} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-telefono">Teléfono</label>
                      <input type="tel" id="edit-telefono" name="telefono" value={editFormData.telefono} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-direccion">Dirección</label>
                      <input type="text" id="edit-direccion" name="direccion" value={editFormData.direccion} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group full-width">
                      <label htmlFor="edit-observaciones">Observaciones</label>
                      <textarea id="edit-observaciones" name="observaciones" value={editFormData.observaciones} onChange={handleEditInputChange} onClick={handleEditInputClick} rows="3" />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="cancel-btn" onClick={() => setShowEditModal(false)}>Cancelar</button>
                    <button type="submit" className="submit-btn">Guardar Cambios</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}