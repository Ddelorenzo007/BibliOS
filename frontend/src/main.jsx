import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import Login from './Login.jsx';
import Prestamos from './Prestamos.jsx';
import Dashboard from './Dashboard.jsx';
import Socios from './Socios.jsx';
import Libros from './Libros.jsx';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { DataProvider } from './context/DataContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

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
          <Route path="/libros" element={<ProtectedRoute><Libros /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  </StrictMode >,
);
