import { useState, useEffect } from 'react';

// Hook de autenticación. Antes hablaba con SQLite vía IPC en el mismo
// proceso; ahora window.electronAPI.login() habla por HTTP con el
// servidor Express (ver frontend/src/services/apiClient.js), que además
// devuelve un JWT. Ese token lo administra apiClient.js solo (se guarda al
// loguear, se manda en cada request); acá lo único nuevo respecto de la
// versión anterior es llamar a electronAPI.logout() para borrarlo al
// cerrar sesión.

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
    window.electronAPI?.logout?.(); // limpia el JWT guardado por apiClient.js

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