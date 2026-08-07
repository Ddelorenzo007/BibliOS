import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Filter, BookOpen, User, Calendar,
  CheckCircle, AlertTriangle, Clock, Eye, Edit, Trash2,
  Book, FileText, Circle, MapPin, Hash, Tag, Users, Zap, Menu, X
} from 'lucide-react';
import './obras.css';
import Sidebar from './Sidebar.jsx';
import { buscarLibroPorISBN } from './utils/openLibraryAPI.js';
import { useData } from './context/DataContext.jsx';

const ROLES_PERSONA = [
  { value: 'autor', label: 'Autor' },
  { value: 'compilador', label: 'Compilador' },
  { value: 'traductor', label: 'Traductor' },
  { value: 'director', label: 'Director' },
  { value: 'coordinador', label: 'Coordinador' },
  { value: 'otro', label: 'Otro' },
];

const OBRA_FORM_VACIO = {
  isbn: '', titulo: '', subtitulo: '', categoria: '', editorial: '',
  lugarPublicacion: '', anioPublicacion: '', edicion: '', idioma: '',
  descripcion: '', cabecera: '', tomoNumero: 'Único'
};

export default function Obras() {
  const { obras: obrasRaw, refreshObras } = useData();

  const [obras, setObras] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('todas');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedObra, setSelectedObra] = useState(null); // obra completa (con tomos/ejemplares) para el modal de detalle
  const [showDetails, setShowDetails] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [obraToDelete, setObraToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [obraToEdit, setObraToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editPersonas, setEditPersonas] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [formData, setFormData] = useState(OBRA_FORM_VACIO);
  const [personas, setPersonas] = useState([{ nombre: '', apellido: '', rol: 'autor' }]);

  // Estado del mini-formulario "agregar ejemplar" dentro del modal de detalle
  const [nuevoEjemplar, setNuevoEjemplar] = useState({ tomoId: '', numeroInventario: '', ubicacion: '' });

  useEffect(() => {
    setObras(obrasRaw || []);
  }, [obrasRaw]);

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'disponible': return '#10b981';
      case 'prestado': return '#f59e0b';
      case 'reservado': return '#8b5cf6';
      case 'en_reparacion': return '#ef4444';
      case 'extraviado': return '#991b1b';
      case 'baja': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getEstadoIcon = (estado) => {
    switch (estado) {
      case 'disponible': return <CheckCircle size={14} />;
      case 'prestado': return <Clock size={14} />;
      case 'en_reparacion': return <AlertTriangle size={14} />;
      default: return <Circle size={14} />;
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handleInputClick = (e) => { e.target.focus(); e.target.select(); };

  // ===== Autores dinámicos (alta) =====
  const addPersonaRow = () => setPersonas(prev => [...prev, { nombre: '', apellido: '', rol: 'autor' }]);
  const removePersonaRow = (idx) => setPersonas(prev => prev.filter((_, i) => i !== idx));
  const updatePersonaRow = (idx, field, value) => {
    setPersonas(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  // ===== Autores dinámicos (edición) =====
  const addEditPersonaRow = () => setEditPersonas(prev => [...prev, { nombre: '', apellido: '', rol: 'autor' }]);
  const removeEditPersonaRow = (idx) => setEditPersonas(prev => prev.filter((_, i) => i !== idx));
  const updateEditPersonaRow = (idx, field, value) => {
    setEditPersonas(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  // Búsqueda automática por ISBN (Open Library). Autocompleta datos generales
  // y, si encuentra autores, reemplaza la primera fila de personas.
  const handleAutoSearch = async () => {
    if (!formData.isbn.trim()) {
      await window.nativeDialog.warning({ message: 'ISBN requerido', detail: 'Ingresá el ISBN para buscar automáticamente.' });
      return;
    }
    setIsSearching(true);
    try {
      const encontrado = await buscarLibroPorISBN(formData.isbn.trim());
      if (encontrado) {
        setFormData(prev => ({
          ...prev,
          titulo: encontrado.titulo || prev.titulo,
          isbn: encontrado.isbn || prev.isbn,
          categoria: encontrado.categoria || prev.categoria,
          editorial: encontrado.editorial || prev.editorial,
          lugarPublicacion: encontrado.publish_places?.[0] || prev.lugarPublicacion,
          anioPublicacion: encontrado.anioPublicacion || prev.anioPublicacion,
          descripcion: encontrado.descripcion || prev.descripcion
        }));
        if (encontrado.autor) {
          const nombresAutores = String(encontrado.autor).split(',').map(a => a.trim()).filter(Boolean);
          if (nombresAutores.length > 0) {
            setPersonas(nombresAutores.map(nombreCompleto => {
              const partes = nombreCompleto.split(' ');
              const apellido = partes.length > 1 ? partes.pop() : '';
              return { nombre: partes.join(' ') || nombreCompleto, apellido, rol: 'autor' };
            }));
          }
        }
        await window.nativeDialog.message({ message: '¡Obra encontrada!', detail: 'Revisá los datos completados automáticamente antes de guardar.' });
      } else {
        await window.nativeDialog.warning({ message: 'Obra no encontrada', detail: 'No se encontró información para ese ISBN. Completá los datos a mano.' });
      }
    } catch (error) {
      console.error('Error al buscar obra:', error);
      await window.nativeDialog.error({ message: 'Error al buscar la obra', detail: error.message });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!window.electronAPI) return;

      const personasValidas = personas.filter(p => p.nombre.trim());
      if (personasValidas.length === 0) {
        await window.nativeDialog.warning({ message: 'Falta el autor', detail: 'Ingresá al menos un autor o responsable.' });
        return;
      }

      await window.electronAPI.createObra({
        isbn: formData.isbn,
        titulo: formData.titulo,
        subtitulo: formData.subtitulo || null,
        categoria: formData.categoria || null,
        editorial: formData.editorial || null,
        lugarPublicacion: formData.lugarPublicacion || null,
        anioPublicacion: formData.anioPublicacion ? parseInt(formData.anioPublicacion) : null,
        edicion: formData.edicion || null,
        idioma: formData.idioma || null,
        descripcion: formData.descripcion || null,
        cabecera: formData.cabecera || null,
        personas: personasValidas,
        tomo: { numero: formData.tomoNumero || 'Único' }
      });

      refreshObras();
      setFormData(OBRA_FORM_VACIO);
      setPersonas([{ nombre: '', apellido: '', rol: 'autor' }]);
      setShowForm(false);
    } catch (error) {
      console.error('Error al crear obra:', error);
      await window.nativeDialog.error({ message: 'Error al crear la obra', detail: error.message });
    }
  };

  const handleEliminar = (obraId) => {
    setObraToDelete(obraId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (obraToDelete) {
      try {
        await window.electronAPI.darDeBajaObra(obraToDelete);
        refreshObras();
      } catch (error) {
        console.error('Error al dar de baja obra:', error);
        await window.nativeDialog.error({ message: 'No se pudo dar de baja la obra', detail: error.message });
      }
      setObraToDelete(null);
    }
    setShowDeleteConfirm(false);
  };
  const cancelDelete = () => { setObraToDelete(null); setShowDeleteConfirm(false); };

  const handleEditClick = (obra) => {
    setObraToEdit(obra);
    setEditFormData({
      titulo: obra.titulo, subtitulo: obra.subtitulo || '', categoria: obra.categoria || '',
      editorial: obra.editorial || '', lugarPublicacion: obra.lugarPublicacion || '',
      anioPublicacion: obra.anioPublicacion || '', edicion: obra.edicion || '',
      idioma: obra.idioma || '', descripcion: obra.descripcion || '', cabecera: obra.cabecera || ''
    });
    setEditPersonas(obra.personas && obra.personas.length > 0 ? obra.personas.map(p => ({ nombre: p.nombre, apellido: p.apellido || '', rol: p.rol })) : [{ nombre: '', apellido: '', rol: 'autor' }]);
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
      if (window.electronAPI && obraToEdit) {
        const personasValidas = editPersonas.filter(p => p.nombre.trim());
        await window.electronAPI.updateObra(obraToEdit.id, {
          titulo: editFormData.titulo,
          subtitulo: editFormData.subtitulo || null,
          categoria: editFormData.categoria || null,
          editorial: editFormData.editorial || null,
          lugarPublicacion: editFormData.lugarPublicacion || null,
          anioPublicacion: editFormData.anioPublicacion ? parseInt(editFormData.anioPublicacion) : null,
          edicion: editFormData.edicion || null,
          idioma: editFormData.idioma || null,
          descripcion: editFormData.descripcion || null,
          cabecera: editFormData.cabecera || null,
          personas: personasValidas.length > 0 ? personasValidas : undefined
        });
        refreshObras();
      }
      setShowEditModal(false);
      setObraToEdit(null);
      setEditFormData({});
    } catch (error) {
      console.error('Error al actualizar obra:', error);
      await window.nativeDialog.error({ message: 'Error al actualizar la obra', detail: error.message });
    }
  };

  // ===== Modal de detalle: carga la obra completa (con tomos/ejemplares) =====
  const abrirDetalle = async (obra) => {
    try {
      const obraCompleta = await window.electronAPI.getObraById(obra.id);
      setSelectedObra(obraCompleta);
      setNuevoEjemplar({ tomoId: obraCompleta.tomos[0]?.id || '', numeroInventario: '', ubicacion: '' });
      setShowTomoForm(false);
      setNuevoTomoNumero('');
      setShowDetails(true);
    } catch (error) {
      console.error('Error al obtener detalle de la obra:', error);
      await window.nativeDialog.error({ message: 'No se pudo cargar el detalle', detail: error.message });
    }
  };

  const recargarDetalle = async () => {
    if (!selectedObra) return;
    const obraCompleta = await window.electronAPI.getObraById(selectedObra.id);
    setSelectedObra(obraCompleta);
    refreshObras();
  };

  const handleAgregarEjemplar = async (e) => {
    e.preventDefault();
    if (!nuevoEjemplar.numeroInventario.trim() || !nuevoEjemplar.tomoId) return;
    try {
      await window.electronAPI.createEjemplar({
        tomoId: parseInt(nuevoEjemplar.tomoId),
        numeroInventario: nuevoEjemplar.numeroInventario.trim(),
        ubicacion: nuevoEjemplar.ubicacion || null
      });
      setNuevoEjemplar(prev => ({ ...prev, numeroInventario: '', ubicacion: '' }));
      await recargarDetalle();
    } catch (error) {
      console.error('Error al agregar ejemplar:', error);
      await window.nativeDialog.error({ message: 'No se pudo agregar el ejemplar', detail: error.message });
    }
  };

  const handleCambiarEstadoEjemplar = async (ejemplarId, nuevoEstado) => {
    try {
      await window.electronAPI.updateEjemplar(ejemplarId, { estado: nuevoEstado });
      await recargarDetalle();
    } catch (error) {
      console.error('Error al actualizar ejemplar:', error);
      await window.nativeDialog.error({ message: 'No se pudo actualizar el ejemplar', detail: error.message });
    }
  };

  const [showTomoForm, setShowTomoForm] = useState(false);
  const [nuevoTomoNumero, setNuevoTomoNumero] = useState('');

  const handleAgregarTomo = async (e) => {
    e.preventDefault();
    if (!nuevoTomoNumero.trim()) return;
    try {
      await window.electronAPI.createTomo({ obraId: selectedObra.id, numero: nuevoTomoNumero.trim() });
      setNuevoTomoNumero('');
      setShowTomoForm(false);
      await recargarDetalle();
    } catch (error) {
      console.error('Error al crear tomo:', error);
      await window.nativeDialog.error({ message: 'No se pudo crear el tomo', detail: error.message });
    }
  };

  // Filtrado y búsqueda
  const categoriasDisponibles = [...new Set(obras.map(o => o.categoria).filter(Boolean))];
  const filteredObras = obras.filter(obra => {
    const matchesSearch = searchTerm === '' ||
      obra.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (obra.isbn || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (obra.autoresTexto || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterCategoria === 'todas' || obra.categoria === filterCategoria;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: obras.length,
    ejemplares: obras.reduce((sum, o) => sum + (o.cantidadEjemplares || 0), 0),
    disponibles: obras.reduce((sum, o) => sum + (o.ejemplaresDisponibles || 0), 0),
    sinStock: obras.filter(o => (o.ejemplaresDisponibles || 0) === 0).length
  };

  // En la lista (getObras) los autores vienen como texto plano ya armado
  // (autoresTexto); en el detalle (getObraById) vienen como array (personas)
  // porque ahí sí se necesita cada nombre/apellido/rol por separado.
  const formatearAutores = (obra) => {
    if (obra.personas && obra.personas.length > 0) {
      return obra.personas.map(p => `${p.nombre} ${p.apellido || ''}`.trim()).join(', ');
    }
    return obra.autoresTexto || 'Sin autor registrado';
  };

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="libros-container">
        <div className="libros-header">
          <div className="header-content">
            <h1>Gestión de Obras</h1>
            <span className="header-separator">|</span>
            <p>Administrá el catálogo bibliográfico, tomos y ejemplares</p>
          </div>
          <button className="add-button" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} />
            Nueva Obra
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><Book size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Total Obras</h3><p className="stat-value">{stats.total}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Users size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Total Ejemplares</h3><p className="stat-value">{stats.ejemplares}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><CheckCircle size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Ejemplares Disponibles</h3><p className="stat-value">{stats.disponibles}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><AlertTriangle size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Obras sin stock</h3><p className="stat-value">{stats.sinStock}</p></div>
          </div>
        </div>

        {showForm && (
          <div className="form-section">
            <h3>Nueva Obra</h3>
            <form onSubmit={handleSubmit} className="libro-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="isbn">ISBN <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="isbn" name="isbn" value={formData.isbn} onChange={handleInputChange} onClick={handleInputClick} required />
                </div>
                <div className="form-group">
                  <label htmlFor="titulo">Título <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="titulo" name="titulo" value={formData.titulo} onChange={handleInputChange} onClick={handleInputClick} required />
                </div>
                <div className="form-group">
                  <label htmlFor="subtitulo">Subtítulo</label>
                  <input type="text" id="subtitulo" name="subtitulo" value={formData.subtitulo} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
                <div className="form-group">
                  <label htmlFor="categoria">Categoría</label>
                  <input type="text" id="categoria" name="categoria" value={formData.categoria} onChange={handleInputChange} onClick={handleInputClick} placeholder="Ej: Informática" />
                </div>
              </div>

              {/* Autores / responsables dinámicos */}
              <div className="form-row" style={{ display: 'block' }}>
                <label>Autores / Responsables <span style={{ color: "#ef4444" }}>*</span></label>
                {personas.map((p, idx) => (
                  <div className="autor-row" key={idx}>
                    <input type="text" placeholder="Nombre" value={p.nombre} onChange={e => updatePersonaRow(idx, 'nombre', e.target.value)} onClick={handleInputClick} />
                    <input type="text" placeholder="Apellido" value={p.apellido} onChange={e => updatePersonaRow(idx, 'apellido', e.target.value)} onClick={handleInputClick} />
                    <select value={p.rol} onChange={e => updatePersonaRow(idx, 'rol', e.target.value)}>
                      {ROLES_PERSONA.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    {personas.length > 1 && (
                      <button type="button" className="remove-autor-btn" onClick={() => removePersonaRow(idx)} title="Quitar">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="add-autor-btn" onClick={addPersonaRow}>
                  <Plus size={14} /> Agregar otro autor/responsable
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="editorial">Editorial</label>
                  <input type="text" id="editorial" name="editorial" value={formData.editorial} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
                <div className="form-group">
                  <label htmlFor="lugarPublicacion">Lugar de Pub.</label>
                  <input type="text" id="lugarPublicacion" name="lugarPublicacion" value={formData.lugarPublicacion} onChange={handleInputChange} onClick={handleInputClick} placeholder="Ej: Madrid" />
                </div>
                <div className="form-group">
                  <label htmlFor="anioPublicacion">Año</label>
                  <input type="number" id="anioPublicacion" name="anioPublicacion" value={formData.anioPublicacion} onChange={handleInputChange} onClick={handleInputClick} min="1000" max={new Date().getFullYear()} />
                </div>
                <div className="form-group">
                  <label htmlFor="edicion">Edición</label>
                  <input type="text" id="edicion" name="edicion" value={formData.edicion} onChange={handleInputChange} onClick={handleInputClick} placeholder="Ej: 3a. ed." />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="idioma">Idioma</label>
                  <input type="text" id="idioma" name="idioma" value={formData.idioma} onChange={handleInputChange} onClick={handleInputClick} placeholder="Ej: Español" />
                </div>
                <div className="form-group">
                  <label htmlFor="cabecera">Cabecera</label>
                  <input type="text" id="cabecera" name="cabecera" value={formData.cabecera} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
                <div className="form-group">
                  <label htmlFor="tomoNumero">Tomo/Volumen inicial</label>
                  <input type="text" id="tomoNumero" name="tomoNumero" value={formData.tomoNumero} onChange={handleInputChange} onClick={handleInputClick} placeholder="Único" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="descripcion">Descripción</label>
                  <textarea id="descripcion" name="descripcion" value={formData.descripcion} onChange={handleInputChange} onClick={handleInputClick} rows="4" />
                </div>
              </div>

              <div className="auto-search-section" style={{ marginTop: '1rem', marginBottom: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button type="button" className="auto-search-button" onClick={handleAutoSearch} disabled={isSearching} style={{ width: '100%', justifyContent: 'center' }}>
                  <Zap size={16} />
                  {isSearching ? 'Buscando...' : 'Buscar datos por ISBN'}
                </button>
                <p className="auto-search-hint" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  Completá el ISBN y hacé clic para autocompletar los datos generales y el/los autor/es.
                </p>
              </div>

              <div className="libros-form-actions">
                <button type="submit" className="submit-button">
                  <Plus size={16} />
                  Registrar Obra
                </button>
                <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        <div className="filters-section">
          <div className="search-box">
            <Search size={16} />
            <input type="text" placeholder="Buscar por título, ISBN o autor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="filter-box custom-dropdown">
            <Filter size={16} />
            <div className="dropdown-trigger" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              {filterCategoria === 'todas' ? 'Todas las categorías' : filterCategoria}
              <span className="dropdown-arrow">▼</span>
            </div>
            {showFilterDropdown && (
              <div className="dropdown-menu">
                <div className={`dropdown-item ${filterCategoria === 'todas' ? 'active' : ''}`} onClick={() => { setFilterCategoria('todas'); setShowFilterDropdown(false); }}>
                  Todas las categorías
                </div>
                {categoriasDisponibles.map(cat => (
                  <div key={cat} className={`dropdown-item ${filterCategoria === cat ? 'active' : ''}`} onClick={() => { setFilterCategoria(cat); setShowFilterDropdown(false); }}>
                    {cat}
                  </div>
                ))}
              </div>
            )}
            {showFilterDropdown && <div className="dropdown-backdrop" onClick={() => setShowFilterDropdown(false)} />}
          </div>
        </div>

        <div className="table-section">
          <div className="table-header">
            <h3>Catálogo de Obras</h3>
            <span className="count">{filteredObras.length} obras</span>
          </div>
          <div className="table-container">
            <table className="libros-table">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Información</th>
                  <th>Ejemplares</th>
                  <th>Categoría</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredObras.map(obra => (
                  <tr key={obra.id}>
                    <td>
                      <div className="libro-info">
                        <BookOpen size={16} />
                        <div>
                          <strong>{obra.titulo}</strong>
                          <div className="libro-author">
                            <User size={12} />
                            {formatearAutores(obra)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="libro-details">
                        {obra.isbn && <div className="detail-item"><Hash size={12} />{obra.isbn}</div>}
                        {obra.editorial && <div className="detail-item"><FileText size={12} />{obra.editorial} {obra.anioPublicacion ? `(${obra.anioPublicacion})` : ''}</div>}
                      </div>
                    </td>
                    <td>
                      <div className="ejemplares-info">
                        <div className="ejemplares-total"><Book size={12} />{obra.cantidadEjemplares || 0} total</div>
                        <div className="ejemplares-disponibles"><CheckCircle size={12} />{obra.ejemplaresDisponibles || 0} disponibles</div>
                      </div>
                    </td>
                    <td>
                      {obra.categoria && <span className="status-badge" style={{ backgroundColor: '#134074' }}><Tag size={12} />{obra.categoria}</span>}
                    </td>
                    <td>
                      <div className="actions">
                        <button className="action-btn view" onClick={() => abrirDetalle(obra)} title="Ver detalles / ejemplares"><Eye size={14} /></button>
                        <button className="action-btn edit" onClick={() => handleEditClick(obra)} title="Editar obra"><Edit size={14} /></button>
                        <button className="action-btn delete" onClick={() => handleEliminar(obra.id)} title="Dar de baja"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal de detalle: obra + tomos + ejemplares */}
        {showDetails && selectedObra && (
          <div className="modal-overlay" onClick={() => setShowDetails(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
              <div className="modal-header">
                <h3>{selectedObra.titulo}</h3>
                <button className="close-button" onClick={() => setShowDetails(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="detail-row"><span className="label">ISBN:</span><span className="value">{selectedObra.isbn}</span></div>
                <div className="detail-row"><span className="label">Autores:</span><span className="value">{formatearAutores(selectedObra)}</span></div>
                {selectedObra.categoria && <div className="detail-row"><span className="label">Categoría:</span><span className="value">{selectedObra.categoria}</span></div>}
                {selectedObra.editorial && <div className="detail-row"><span className="label">Editorial:</span><span className="value">{selectedObra.editorial} {selectedObra.anioPublicacion ? `(${selectedObra.anioPublicacion})` : ''}</span></div>}
                {selectedObra.descripcion && <div className="detail-row"><span className="label">Descripción:</span><span className="value">{selectedObra.descripcion}</span></div>}

                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0 }}>Tomos y ejemplares</h4>
                    <button type="button" className="add-autor-btn" onClick={() => setShowTomoForm(!showTomoForm)}><Plus size={14} /> Agregar tomo</button>
                  </div>

                  {showTomoForm && (
                    <form className="add-ejemplar-form" onSubmit={handleAgregarTomo} style={{ marginBottom: '0.75rem' }}>
                      <input
                        type="text" placeholder='Número/nombre del tomo (ej: "Tomo 2", "Volumen II")'
                        value={nuevoTomoNumero}
                        onChange={e => setNuevoTomoNumero(e.target.value)}
                        autoFocus
                        required
                      />
                      <button type="submit" className="submit-button" style={{ padding: '0.5rem 1rem' }}><Plus size={14} /> Crear tomo</button>
                    </form>
                  )}

                  {(selectedObra.tomos || []).map(tomo => (
                    <div className="tomo-block" key={tomo.id}>
                      <h4>{tomo.numero}</h4>
                      {(tomo.ejemplares || []).length === 0 && <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Sin ejemplares cargados todavía.</p>}
                      {(tomo.ejemplares || []).map(ej => (
                        <div className="ejemplar-row" key={ej.id}>
                          <span>{ej.numeroInventario} <span style={{ opacity: 0.6 }}>({ej.numeroControl})</span> {ej.ubicacion ? `· ${ej.ubicacion}` : ''}</span>
                          <select
                            className="ejemplar-estado-select"
                            value={ej.estado}
                            onChange={(e) => handleCambiarEstadoEjemplar(ej.id, e.target.value)}
                            style={{ borderColor: getEstadoColor(ej.estado) }}
                          >
                            <option value="disponible">Disponible</option>
                            <option value="prestado">Prestado</option>
                            <option value="reservado">Reservado</option>
                            <option value="en_reparacion">En reparación</option>
                            <option value="extraviado">Extraviado</option>
                            <option value="baja">Baja</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  ))}

                  <form className="add-ejemplar-form" onSubmit={handleAgregarEjemplar}>
                    {selectedObra.tomos && selectedObra.tomos.length > 1 && (
                      <select value={nuevoEjemplar.tomoId} onChange={e => setNuevoEjemplar(prev => ({ ...prev, tomoId: e.target.value }))}>
                        {selectedObra.tomos.map(t => <option key={t.id} value={t.id}>{t.numero}</option>)}
                      </select>
                    )}
                    <input
                      type="text" placeholder="N° de inventario manual"
                      value={nuevoEjemplar.numeroInventario}
                      onChange={e => setNuevoEjemplar(prev => ({ ...prev, numeroInventario: e.target.value }))}
                      required
                    />
                    <input
                      type="text" placeholder="Ubicación (opcional)"
                      value={nuevoEjemplar.ubicacion}
                      onChange={e => setNuevoEjemplar(prev => ({ ...prev, ubicacion: e.target.value }))}
                    />
                    <button type="submit" className="submit-button" style={{ padding: '0.5rem 1rem' }}><Plus size={14} /> Agregar ejemplar</button>
                  </form>
                </div>
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
                  <p>¿Dar de baja esta obra?</p>
                  <p className="confirm-warning">Se bloquea si tiene préstamos activos o reservas pendientes. No se puede deshacer desde acá.</p>
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
        {showEditModal && obraToEdit && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Editar Obra #{obraToEdit.id}</h3>
                <button className="close-button" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleUpdateSubmit} className="libro-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>ISBN (no editable)</label>
                      <input type="text" value={obraToEdit.isbn} disabled />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-titulo">Título *</label>
                      <input type="text" id="edit-titulo" name="titulo" value={editFormData.titulo} onChange={handleEditInputChange} onClick={handleEditInputClick} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-subtitulo">Subtítulo</label>
                      <input type="text" id="edit-subtitulo" name="subtitulo" value={editFormData.subtitulo} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-categoria">Categoría</label>
                      <input type="text" id="edit-categoria" name="categoria" value={editFormData.categoria} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'block' }}>
                    <label>Autores / Responsables</label>
                    {editPersonas.map((p, idx) => (
                      <div className="autor-row" key={idx}>
                        <input type="text" placeholder="Nombre" value={p.nombre} onChange={e => updateEditPersonaRow(idx, 'nombre', e.target.value)} onClick={handleEditInputClick} />
                        <input type="text" placeholder="Apellido" value={p.apellido} onChange={e => updateEditPersonaRow(idx, 'apellido', e.target.value)} onClick={handleEditInputClick} />
                        <select value={p.rol} onChange={e => updateEditPersonaRow(idx, 'rol', e.target.value)}>
                          {ROLES_PERSONA.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {editPersonas.length > 1 && (
                          <button type="button" className="remove-autor-btn" onClick={() => removeEditPersonaRow(idx)}><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="add-autor-btn" onClick={addEditPersonaRow}><Plus size={14} /> Agregar otro autor/responsable</button>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit-editorial">Editorial</label>
                      <input type="text" id="edit-editorial" name="editorial" value={editFormData.editorial} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-lugarPublicacion">Lugar de Pub.</label>
                      <input type="text" id="edit-lugarPublicacion" name="lugarPublicacion" value={editFormData.lugarPublicacion} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-anioPublicacion">Año</label>
                      <input type="number" id="edit-anioPublicacion" name="anioPublicacion" value={editFormData.anioPublicacion} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-edicion">Edición</label>
                      <input type="text" id="edit-edicion" name="edicion" value={editFormData.edicion} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="edit-idioma">Idioma</label>
                      <input type="text" id="edit-idioma" name="idioma" value={editFormData.idioma} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-cabecera">Cabecera</label>
                      <input type="text" id="edit-cabecera" name="cabecera" value={editFormData.cabecera} onChange={handleEditInputChange} onClick={handleEditInputClick} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="edit-descripcion">Descripción</label>
                      <textarea id="edit-descripcion" name="descripcion" value={editFormData.descripcion} onChange={handleEditInputChange} onClick={handleEditInputClick} rows="4" />
                    </div>
                  </div>

                  <div className="libros-form-actions">
                    <button type="submit" className="submit-button"><CheckCircle size={16} /> Guardar cambios</button>
                    <button type="button" className="cancel-button" onClick={() => setShowEditModal(false)}>Cancelar</button>
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