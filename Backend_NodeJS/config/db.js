const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, // true para Azure
        trustServerCertificate: true, // Para desarrollo local
        // SQL Server guarda DATETIME sin zona horaria (GETDATE() = hora local del servidor).
        // El driver (tedious) por defecto ASUME que esos valores son UTC y les pega una "Z" al
        // convertirlos a Date de JS sin corregir nada — como la hora local real ya es la que es,
        // esto la corre 5 horas, y en la madrugada (00:00–04:59) hace que la fecha se muestre
        // como "ayer" en vez de "hoy". Con useUTC:false, el driver trata el valor como lo que
        // realmente es: hora local, no UTC.
        useUTC: false
    }
};

const getConnection = async () => {
    try {
        const pool = await sql.connect(dbConfig);
        return pool;
    } catch (error) {
        console.error("❌ Error de conexión a la base de datos:", error);
    }
};

module.exports = {
    getConnection,
    sql
};