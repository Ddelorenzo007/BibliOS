import { useState, useEffect } from 'react';

// Hook de autenticación simple: usuario + contraseña contra la base SQLite
// local (usuarios ficticios). Cuando exista integración con la entidad
// externa (superentidad) que gestionará el registro real de usuarios, la
// función `login` de acá es el único lugar que habría que adaptar.

const SESSION_KEY = 'biblios_session';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthState();
  }, []);

  const loadAuthState = () => {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (session) {
        setCurrentUser(session);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (usuario, password) => {
    try {
      if (!window.electronAPI) {
        return { success: false, message: 'La aplicación no está corriendo en modo Electron' };
      }

      const result = await window.electronAPI.login(usuario, password);

      if (result.success) {
        setIsAuthenticated(true);
        setCurrentUser(result.usuario);
        localStorage.setItem(SESSION_KEY, JSON.stringify(result.usuario));
        return { success: true };
      }

      return { success: false, message: result.message || 'Credenciales incorrectas' };
    } catch (error) {
      console.error('Error during authentication:', error);
      return { success: false, message: 'Error durante la autenticación' };
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);

    // Solución simple: solo limpiar el focus actual
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  };

  return {
    isAuthenticated,
    currentUser,
    loading,
    login,
    logout
  };
};
