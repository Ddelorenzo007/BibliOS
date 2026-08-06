import React, { useState, useEffect } from 'react';
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

  const handleElegirArchivo = async () => {
    try {
      const resultado = await window.nativeDialog.open({
        title: 'Seleccionar documento',
        filters: [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx'] }]
      });
      if (resultado.canceled || !resultado.filePaths?.length) return;

      const rutaCompleta = resultado.filePaths[0];
      const nombreArchivo = rutaCompleta.split(/[\\/]/).pop();
      const extension = nombreArchivo.split('.').pop().toLowerCase();

      setFormData(prev => ({
        ...prev,
        rutaArchivo: rutaCompleta,
        tipo: ['pdf', 'doc', 'docx'].includes(extension) ? extension : 'pdf',
        nombre: prev.nombre || nombreArchivo.replace(/\.[^/.]+$/, '')
      }));
    } catch (error) {
      console.error('Error al elegir archivo:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.rutaArchivo) {
      await window.nativeDialog.warning({ message: 'Falta el archivo', detail: 'Elegí un archivo PDF, DOC o DOCX antes de guardar.' });
      return;
    }
    try {
      await window.electronAPI.subirDocumento({
        nombre: formData.nombre,
        categoria: formData.categoria,
        rutaArchivo: formData.rutaArchivo,
        tipo: formData.tipo,
        descripcion: formData.descripcion || null,
        usuarioId: currentUser?.id
      });
      await cargarDocumentos();
      setFormData(FORM_VACIO);
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
                  <button type="button" className="submit-button" onClick={handleElegirArchivo} style={{ width: '100%', justifyContent: 'center' }}>
                    <Upload size={16} />{formData.rutaArchivo ? 'Cambiar archivo' : 'Elegir archivo (PDF/DOC/DOCX)'}
                  </button>
                  {formData.rutaArchivo && <p style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '0.4rem' }}>{formData.rutaArchivo.split(/[\\/]/).pop()}</p>}
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