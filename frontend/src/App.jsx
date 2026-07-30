import "./App.css";
import "./welcome.css";

import libro from "./assets/libro.png";

import { Link } from "react-router-dom";
import Navbar from "./Navbar.jsx";
import { useEffect } from "react";
import { initializeMockData } from "./utils/mockData.js";

function App() {
  useEffect(() => {
    document.body.classList.add("home-page-active");

    // Por el momento dejamos los datos mock.
    // En un sprint posterior eliminaremos completamente esta lógica.
    initializeMockData();

    return () => {
      document.body.classList.remove("home-page-active");
    };
  }, []);

  return (
    <div className="home-page">
      <Navbar />

      <main className="hero">
        <div className="hero-text">

          <span className="tagline">
            UNIVERSIDAD TECNOLÓGICA NACIONAL
          </span>

          <h1 className="hero-title">
            BibliOS
          </h1>

          <p className="hero-description">
            Sistema Integral de Gestión Bibliotecaria para la Biblioteca de la
            Facultad Regional La Plata.
          </p>

          <p className="hero-description">
            Permite administrar obras, ejemplares, socios, préstamos,
            documentación institucional y auditorías desde una única aplicación.
          </p>

          <div className="cta-group">
            <Link className="primary-btn" to="/login">
              Iniciar sesión
            </Link>
          </div>

        </div>

        <div className="hero-img">
          <img
            src={libro}
            alt="BibliOS"
            className="float"
          />
        </div>
      </main>
    </div>
  );
}

export default App;