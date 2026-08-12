const { Pool, types } = require('pg');
require('dotenv').config();

// COUNT(*) y otras agregaciones devuelven tipo "bigint" (OID 20) en
// Postgres, que node-postgres parsea como STRING por defecto (para no
// perder precisión en números astronómicos). Acá nunca vamos a tener
// conteos que superen el rango seguro de un number de JS, así que se
// fuerza a número real -- si no, cosas como `stats.reduce((sum, o) =>
// sum + o.cantidadEjemplares, 0)` en el frontend concatenan strings en
// vez de sumar ("0" + "0" = "00").
types.setTypeParser(20, (val) => parseInt(val, 10));

// Variables de entorno esperadas (ver .env.example):
//   DATABASE_URL=postgres://usuario:password@host:5432/biblios
// o, alternativamente, las variables sueltas PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
// que "pg" reconoce automáticamente si DATABASE_URL no está seteada.
const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : undefined
);

pool.on('error', (err) => {
    console.error('Error inesperado en una conexión inactiva del pool de Postgres:', err);
});

module.exports = pool;
