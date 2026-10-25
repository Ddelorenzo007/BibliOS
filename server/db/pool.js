const { Pool, types } = require('pg');
require('dotenv').config();

console.log("🔍 Password en memoria:", process.env.PGPASSWORD);

types.setTypeParser(20, (val) => parseInt(val, 10));

// Si existe DATABASE_URL (ej. en el servidor), la usa.
// Si no, usa las variables sueltas, y si tampoco están, usa los valores por defecto de tu Docker local.
const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            user: process.env.PGUSER || 'postgres',
            host: process.env.PGHOST || 'localhost',
            database: process.env.PGDATABASE || 'biblios_db',
            password: process.env.PGPASSWORD || 'biblios_password',
            port: process.env.PGPORT || 5432,
        }
);

pool.on('error', (err) => {
    console.error('Error inesperado en una conexión inactiva del pool de Postgres:', err);
});

module.exports = pool;