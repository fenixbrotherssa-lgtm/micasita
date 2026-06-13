const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, // true para Azure
        trustServerCertificate: true // Para desarrollo local
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