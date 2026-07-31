import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, X, AlertCircle, Eye, EyeOff, Info } from 'lucide-react';
import './Login.css';
import Navbar from './Navbar.jsx';
import { useAuth } from './hooks/useAuth.js';

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Limpiar formulario al cargar la página
  useEffect(() => {
    setUsername('');
    setPassword('');
    setError('');
    setIsLoading(false);

    // Solución específica para el problema de logout: resetear completamente el estado de focus
    const resetFocus = () => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }

      setTimeout(() => {
        const firstInput = document.querySelector('#username');
        if (firstInput) {
          firstInput.focus();
          firstInput.click();
        }
      }, 100);
    };

    setTimeout(resetFocus, 200);
  }, []);

  // Función para restaurar focus en inputs (solución para Windows/Electron)
  const handleInputClick = (e) => {
    const target = e.target;
    target.focus();
    target.select();

    setTimeout(() => {
      if (document.activeElement !== target) {
        target.click();
        target.focus();
        target.select();
      }
    }, 10);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(username.trim(), password);

      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.message || 'Usuario o contraseña incorrectos');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Error durante la autenticación');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="full-width-page">
      <Navbar />
      <div className="login-container">
        <div className="login-content">
          <button className="close-login-button" onClick={() => navigate('/')}>
            <X size={18} />
          </button>
          <div className="login-header">
            <h1>Iniciar Sesión</h1>
            <p>Ingrese su usuario y contraseña para acceder al sistema.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Usuario
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onClick={handleInputClick}
                placeholder="Nombre de usuario"
                className="form-input"
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Contraseña
              </label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onClick={handleInputClick}
                  placeholder="Contraseña"
                  className="form-input"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="login-submit-btn"
              disabled={isLoading || !username.trim() || !password.trim()}
            >
              <LogIn size={15} />
              {isLoading ? 'Iniciando...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Nota: mientras trabajamos con datos ficticios y no hay
              integración con la entidad externa que registrará usuarios
              reales, la app crea un usuario de prueba automáticamente. */}
          <div className="login-actions">
            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={13} />
              Usuario ficticio de prueba: <strong>admin</strong> / <strong>biblios2026</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
