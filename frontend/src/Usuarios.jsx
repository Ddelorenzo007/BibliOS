import React, { useState, useEffect } from 'react';
import {
  Plus, Search, UserCog, CheckCircle, Circle, Ban,
  Menu, User, Shield, Eye, EyeOff
} from 'lucide-react';
import './usuarios.css';
import Sidebar from './Sidebar.jsx';
import { useAuth } from './hooks/useAuth.js';

const FORM_VACIO = { usuario: '', password: '', nombre: '', rol: 'bibliotecario' };

export default function Usuarios() {
  const { currentUser } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState(FORM_VACIO);
  const [showPassword, setShowPassword] = useState(false);

  const cargarUsuarios = async () => {
    if (!window.electronAPI) return;
    try {
      setLoading(true);
      const data = await window.electronAPI.getUsuarios({});
      setUsuarios(data || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarUsuarios(); }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handleInputClick = (e) => { e.target.focus(); e.target.select(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.createUsuario({
        usuario: formData.usuario,
        password: formData.password,
        nombre: formData.nombre || null,
        rol: formData.rol,
        usuarioCreadorId: currentUser?.id
      });
      await cargarUsuarios();
      setFormData(FORM_VACIO);
      setShowForm(false);
    } catch (error) {
      console.error('Error al crear usuario:', error);
      await window.nativeDialog.error({ message: 'Error al crear el usuario', detail: error.message });
    }
  };

  const handleToggleEstado = async (usuario) => {
    const nuevoEstado = usuario.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await window.electronAPI.toggleEstadoUsuario(usuario.id, nuevoEstado, currentUser?.id);
      await cargarUsuarios();
    } catch (error) {
      console.error('Error al cambiar estado del usuario:', error);
      await window.nativeDialog.error({ message: 'No se pudo cambiar el estado', detail: error.message });
    }
  };

  const filteredUsuarios = usuarios.filter(u =>
    searchTerm === '' ||
    u.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.nombre || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: usuarios.length,
    administradores: usuarios.filter(u => u.rol === 'administrador').length,
    bibliotecarios: usuarios.filter(u => u.rol === 'bibliotecario').length,
    activos: usuarios.filter(u => u.estado === 'activo').length
  };

  const formatFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString('es-AR') : '—';

  return (
    <>
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menú">
        <Menu size={24} />
      </button>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="usuarios-container">
        <div className="usuarios-header">
          <div className="header-content">
            <h1>Gestión de Usuarios</h1>
            <span className="header-separator">|</span>
            <p>Administrá las cuentas de acceso al sistema (administradores y bibliotecarios)</p>
          </div>
          <button className="add-button" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} />
            Nuevo Usuario
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><UserCog size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Total Usuarios</h3><p className="stat-value">{stats.total}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Shield size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Administradores</h3><p className="stat-value">{stats.administradores}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><User size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Bibliotecarios</h3><p className="stat-value">{stats.bibliotecarios}</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><CheckCircle size={20} strokeWidth={1.5} /></div>
            <div className="stat-content"><h3>Cuentas Activas</h3><p className="stat-value">{stats.activos}</p></div>
          </div>
        </div>

        {showForm && (
          <div className="form-section">
            <h3>Nuevo Usuario</h3>
            <form onSubmit={handleSubmit} className="socio-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="usuario">Usuario <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" id="usuario" name="usuario" value={formData.usuario} onChange={handleInputChange} onClick={handleInputClick} required autoComplete="off" />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Contraseña <span style={{ color: "#ef4444" }}>*</span></label>
                  <div className="password-input-wrapper" style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'} id="password" name="password"
                      value={formData.password} onChange={handleInputChange} onClick={handleInputClick}
                      required autoComplete="new-password" style={{ width: '100%' }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="nombre">Nombre completo</label>
                  <input type="text" id="nombre" name="nombre" value={formData.nombre} onChange={handleInputChange} onClick={handleInputClick} />
                </div>
                <div className="form-group">
                  <label htmlFor="rol">Rol <span style={{ color: "#ef4444" }}>*</span></label>
                  <select id="rol" name="rol" value={formData.rol} onChange={handleInputChange} required>
                    <option value="bibliotecario">Bibliotecario</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                Los administradores pueden crear y desactivar cuentas de usuario. Los bibliotecarios operan el sistema normalmente (obras, socios, préstamos), sin distinción de permisos entre sí.
              </p>
              <div className="form-actions">
                <button type="submit" className="submit-button"><Plus size={16} />Crear Usuario</button>
                <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        <div className="filters-section">
          <div className="search-box">
            <Search size={16} />
            <input type="text" placeholder="Buscar por usuario o nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="table-section">
          <div className="table-header">
            <h3>Cuentas del Sistema</h3>
            <span className="count">{filteredUsuarios.length} usuarios</span>
          </div>
          <div className="table-container">
            {loading ? (
              <p style={{ padding: '1.5rem', opacity: 0.7 }}>Cargando usuarios...</p>
            ) : (
              <table className="usuarios-table">
                <thead>
                  <tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {filteredUsuarios.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className="socio-info">
                          <div className="socio-avatar">{u.rol === 'administrador' ? <Shield size={16} /> : <User size={16} />}</div>
                          <strong>{u.usuario}</strong>
                          {u.id === currentUser?.id && <span style={{ fontSize: '0.72rem', opacity: 0.6, marginLeft: '6px' }}>(vos)</span>}
                        </div>
                      </td>
                      <td>{u.nombre || '—'}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: u.rol === 'administrador' ? '#134074' : '#6b7280' }}>
                          {u.rol === 'administrador' ? <Shield size={12} /> : <User size={12} />}
                          {u.rol === 'administrador' ? 'Administrador' : 'Bibliotecario'}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: u.estado === 'activo' ? '#10b981' : '#6b7280' }}>
                          {u.estado === 'activo' ? <CheckCircle size={12} /> : <Ban size={12} />}
                          {u.estado}
                        </span>
                      </td>
                      <td>{formatFecha(u.fechaCreacion)}</td>
                      <td>
                        <div className="actions">
                          {u.estado === 'activo' ? (
                            <button className="action-btn delete" onClick={() => handleToggleEstado(u)} title="Desactivar cuenta"><Ban size={14} /></button>
                          ) : (
                            <button className="action-btn reactivar" onClick={() => handleToggleEstado(u)} title="Activar cuenta"><CheckCircle size={14} /></button>
                          )}
                        </div>
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