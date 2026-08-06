import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Protege rutas exclusivas del rol "administrador" (ej: gestión de
// usuarios/bibliotecarios). Si no hay sesión, redirige a /login como
// ProtectedRoute; si hay sesión pero el rol no es administrador, redirige
// al dashboard en vez de mostrar la pantalla.
const AdminRoute = ({ children }) => {
  const { isAuthenticated, currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '50vh', color: 'white', fontSize: '1.2rem'
      }}>
        Verificando acceso...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser?.rol !== 'administrador') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default AdminRoute;