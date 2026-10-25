import { useState, useEffect } from 'react';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthState();
  }, []);

  const loadAuthState = async () => {
    try {
      if (window.authAPI?.getToken) {
        const token = await window.authAPI.getToken();
        if (token) {
          setIsAuthenticated(true);
          
          // Decodificamos el payload del JWT de forma nativa (sin librerías extra)
          try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const payload = JSON.parse(jsonPayload);
            
            setCurrentUser({
              id: payload.id,
              usuario: payload.usuario,
              nombre: payload.nombre,
              rol: payload.rol
            }); 
          } catch (decodeError) {
            console.error('Error al decodificar el JWT:', decodeError);
          }
        }
      }
    } catch (error) {
      console.error('Error cargando el estado de sesión cifrado:', error);
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

      if (result.success && result.token) {
        setIsAuthenticated(true);
        setCurrentUser(result.usuario);
        
        // Guardar el JWT usando safeStorage en lugar de localStorage
        if (window.authAPI?.saveToken) {
          await window.authAPI.saveToken(result.token);
        }
        return { success: true };
      }

      return { success: false, message: result.message || 'Credenciales incorrectas' };
    } catch (error) {
      console.error('Error durante la autenticación:', error);
      return { success: false, message: 'Error durante la autenticación' };
    }
  };

  const logout = async () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    
    // Eliminar el archivo del token cifrado
    if (window.authAPI?.removeToken) {
      await window.authAPI.removeToken();
    }
    
    window.electronAPI?.logout?.();

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