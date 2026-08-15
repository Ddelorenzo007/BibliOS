import './services/apiClient.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './modals.css';
import App from './App.jsx';
import Login from './Login.jsx';
import Prestamos from './Prestamos.jsx';
import Dashboard from './Dashboard.jsx';
import Socios from './Socios.jsx';
import Obras from './Obras.jsx';
import Usuarios from './Usuarios.jsx';
import Documentos from './Documentos.jsx';
import Ingresos from './Ingresos.jsx';
import Auditoria from './Auditoria.jsx';
import Reportes from './Reportes.jsx';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { DataProvider } from './context/DataContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/login" element={<Login />} />
          <Route path="/prestamos" element={<ProtectedRoute><Prestamos /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/socios" element={<ProtectedRoute><Socios /></ProtectedRoute>} />
          <Route path="/obras" element={<ProtectedRoute><Obras /></ProtectedRoute>} />
          <Route path="/usuarios" element={<AdminRoute><Usuarios /></AdminRoute>} />
          <Route path="/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
          <Route path="/ingresos" element={<ProtectedRoute><Ingresos /></ProtectedRoute>} />
          <Route path="/auditoria" element={<AdminRoute><Auditoria /></AdminRoute>} />
          <Route path="/reportes" element={<ProtectedRoute><Reportes /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  </StrictMode >,
);