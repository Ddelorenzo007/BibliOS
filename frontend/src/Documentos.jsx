import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, FileText, File, Menu, Trash2, Upload, Calendar, Tag
} from 'lucide-react';
import './gestion.css';
import Sidebar from './Sidebar.jsx';
import { useAuth } from './hooks/useAuth.js';

const CATEGORIAS = ['Reglamento', 'Acta', 'Manual', 'Formulario', 'Otro'];
const FORM_VACIO = { nombre: '', categoria: 'Reglamento', descripcion: '', rutaArchivo: '', tipo: '' };

export default function Documentos() {
  const { currentUser } = useAuth();
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState(FORM_VACIO);

  // ¡Acá van los hooks! Adentro de la función Documentos()
  const [archivo, setArchivo] = useState(null); 
  const fileInputRef = useRef(null);      

  const cargarDocumentos = async () => {
    if (!window.electronAPI) return;
    try {
      setLoading(true);
      const data = await window.electronAPI.getDocumentos({});
      setDocumentos(data || []);
    } catch (error) {
      console.error('Error al cargar documentos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDocumentos(); }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleElegirArchivo = () => {
    // Simulamos un clic en el input de archivo oculto
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const extension = file.name.split('.').pop().toLowerCase();
    
    setArchivo(file);
    setFormData(prev => ({
      ...prev,
      tipo: ['pdf', 'doc', 'docx'].includes(extension) ? extension : 'pdf',
      nombre: prev.nombre || file.name.replace(/\.[^/.]+$/, '')
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!archivo) {
      await window.nativeDialog.warning({ message: 'Falta el archivo', detail: 'Elegí un archivo PDF, DOC o DOCX antes de guardar.' });
      return;
    }
    try {
      // Empaquetamos como FormData
      const data = new FormData();
      data.append('nombre', formData.nombre);
      data.append('categoria', formData.categoria);
      if (formData.descripcion) data.append('descripcion', formData.descripcion);
      data.append('tipo', formData.tipo);
      data.append('archivo', archivo); 
      
      await window.electronAPI.subirDocumento(data);
      
      await cargarDocumentos();
      setFormData(FORM_VACIO);
      setArchivo(null); 
      setShowForm(false);
    } catch (error) {
      console.error('Error al subir documento:', error);
      await window.nativeDialog.error({ message: 'Error al subir el documento', detail: error.message });
    }
  };

  const handleDarDeBaja = async (id) => {
    try {
      await window.electronAPI.darDeBajaDocumento(id, currentUser?.id);
      await cargarDocumentos();
    } catch (error) {
      console.error('Error al dar de baja documento:', error);
      await window.nativeDialog.error({ message: 'No se pudo dar de baja el documento', detail: error.message });
    }
  };

  const filteredDocumentos = documentos.filter(d =>
    searchTerm === '' ||
    d.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.categoria.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <h1>Documentación Institucional</h1>
            <span className="header-separator">|</span>
            <p>Reglamentos, actas, manuales y formularios de la biblioteca</p>
          </div>
          <button className="add-button" onClick={() => setShowForm(!showForm)}><Plus size={18} />Subir Documento</button>
        </div>

        {showForm && (
          <div className="form-section">
            <h3>Nuevo Documento</h3>
            <form onSubmit={handleSubmit} className="prestamo-form">
              <div className="form-row">
                <div className="form-group">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".pdf,.doc,.docx" 
                    onChange={handleFileChange} 
                  />
                  <button type="button" className="submit-button" onClick={handleElegirArchivo} style={{ width: '100%', justifyContent: 'center' }}>
                    <Upload size={16} />{archivo ? 'Cambiar archivo' : 'Elegir archivo (PDF/DOC/DOCX)'}
                  </button>
                  {archivo && <p style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '0.4rem' }}>{archivo.name}</p>}
                </div>
                <div className="form-group">
                  <label htmlFor="nombre">Nombre <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="nombre" name="nombre" value={formData.nombre} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="categoria">Categoría <span style={{ color: "#ef4444" }}>*</span></label>
                  <select id="categoria" name="categoria" value={formData.categoria} onChange={handleInputChange} required>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="descripcion">Descripción</label>
                <textarea id="descripcion" name="descripcion" value={formData.descripcion} onChange={handleInputChange} rows="3" />
              </div>
              <div className="form-actions">
                <button type="submit" className="submit-button"><Plus size={18} />Guardar Documento</button>
                <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        <div className="filters-section">
          <div className="search-box"><Search size={18} /><input type="text" placeholder="Buscar por nombre o categoría..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
        </div>

        <div className="table-section">
          <div className="table-header"><h3>Documentos</h3><span className="count">{filteredDocumentos.length} documentos</span></div>
          <div className="table-container">
            {loading ? <p style={{ padding: '1.5rem', opacity: 0.7 }}>Cargando...</p> : (
              <table className="gestion-table">
                <thead><tr><th>Documento</th><th>Categoría</th><th>Tipo</th><th>Subido</th><th>Acciones</th></tr></thead>
                <tbody>
                  {filteredDocumentos.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div className="book-info"><FileText size={14} /><div><strong>{doc.nombre}</strong>{doc.descripcion && <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>{doc.descripcion}</div>}</div></div>
                      </td>
                      <td><span className="status-badge" style={{ backgroundColor: '#134074' }}><Tag size={12} />{doc.categoria}</span></td>
                      <td><File size={14} /> {doc.tipo.toUpperCase()}</td>
                      <td><div className="date-info"><Calendar size={14} /><span>{formatFecha(doc.fechaSubida)}</span></div></td>
                      <td><div className="actions"><button className="action-btn delete" onClick={() => handleDarDeBaja(doc.id)} title="Dar de baja"><Trash2 size={14} /></button></div></td>
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