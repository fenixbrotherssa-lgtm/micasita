const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const http = require('http'); 
const { Server } = require('socket.io'); 
const cron = require('node-cron'); // 🕒 Nuevo: Para el cierre automático
require('dotenv').config();

const { getConnection } = require('./config/db');

// --- SERVICIOS INTERNOS ---
const whatsappService = require('./services/whatsappService'); 

// --- IMPORTACIÓN DEL ESCUDO DE SEGURIDAD (JWT) ---
const verificarToken = require('./middlewares/authMiddleware');

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { 
    cors: { origin: "*" } 
}); 

// --- MIDDLEWARES ---
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// server.js - MIDDLEWARE VIGILANTE PROFESIONAL
app.use((req, res, next) => {
    const metodosModificadores = ['POST', 'PUT', 'DELETE'];
    const originalJson = res.json;

    res.json = function(data) {
        if (metodosModificadores.includes(req.method) && res.statusCode < 400) {
            const idPaciente = req.body?.id_paciente || data?.id_paciente || null;
            const esCatalogo = req.originalUrl.includes('/catalogo');
            const moduloDestino = esCatalogo ? 'catalogo' : 'tratamientos';

            io.emit('db-update', { 
                modulo: moduloDestino, 
                id_referencia: idPaciente 
            });
        }
        return originalJson.call(this, data);
    };
    next();
});

// --- CONFIGURACIÓN DE CARPETAS ---
const baseDir = process.env.NODE_ENV === 'production' ? process.cwd() : __dirname;

const folders = [
    path.join(baseDir, 'uploads', 'vouchers'),
    path.join(baseDir, 'uploads', 'clinico'),
    path.join(baseDir, 'uploads', 'logos'),
    path.join(baseDir, 'uploads', 'recetas'),
    path.join(baseDir, 'uploads', 'inventario'),
    path.join(baseDir, 'assets', 'js'),
    path.join(baseDir, 'uploads', 'facturacion', 'p12'),
    path.join(baseDir, 'uploads', 'facturacion', 'xml_generados'),
    path.join(baseDir, 'uploads', 'facturacion', 'pdf'),
    path.join(baseDir, 'uploads', 'facturacion', 'xml_firmados'),
    path.join(baseDir, 'sessions')
];

folders.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Carpeta garantizada: ${dir}`);
    }
});


// --- ARCHIVOS ESTÁTICOS ---
// Las carpetas públicas quedan abiertas para que Electron pueda leer las imágenes y logos
app.use('/uploads', express.static(path.join(baseDir, 'uploads')));
app.use('/assets', express.static(path.join(baseDir, 'assets')));

// --- RUTA RAIZ ---
app.get('/', (req, res) => {
    res.status(200).send("Servidor MedicSystem Pro Operativo");
});

// --- CLIENTE SOCKET.IO ESTÁTICO ---
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js'));
});

// =======================================================================
// --- RUTAS (API ENDPOINTS) ---
// =======================================================================

// 🔓 RUTA PÚBLICA (No requiere Token para poder iniciar sesión)
app.use('/api/auth', require('./routes/authRoutes'));

// 🛡️ RUTAS PROTEGIDAS (El middleware verificarToken bloquea intrusos)
app.use('/api/usuarios', verificarToken, require('./routes/usuarioRoutes'));
app.use('/api/clinicas', verificarToken, require('./routes/clinicaRoutes'));
app.use('/api/pacientes', verificarToken, require('./routes/pacienteRoutes'));
app.use('/api/odontograma', verificarToken, require('./routes/odontogramaRoutes'));
app.use('/api/recetas', verificarToken, require('./routes/recetaRoutes'));
app.use('/api/pagos', verificarToken, require('./routes/pagoRoutes'));
app.use('/api/caja', verificarToken, require('./routes/cajaRoutes'));
app.use('/api/gastos', verificarToken, require('./routes/gastosRoutes'));
app.use('/api/presupuestos', verificarToken, require('./routes/presupuestos'));
app.use('/api/tratamientos', verificarToken, require('./routes/routestratamientoRoutes'));
app.use('/api/inventario', verificarToken, require('./routes/inventarioRoutes'));
app.use('/api/citas', verificarToken, require('./routes/citasRoutes'));
app.use('/api/kpi', verificarToken, require('./routes/kpiRoutes')); 
app.use('/api/ia', verificarToken, require('./routes/iaRoutes'));
app.use('/api/facturacion', verificarToken, require('./routes/facturacionRoutes'));

// =======================================================================

// --- 🕒 CRON DE CIERRE AUTOMÁTICO (23:00 HRS) ---
cron.schedule('0 23 * * *', async () => {
    try {
        const pool = await getConnection();
        await pool.request().query(`
            UPDATE CAJA 
            SET 
                Estado = 'CERRADA', 
                Fecha_Cierre = GETDATE(),
                Monto_Final_Real = 0, 
                Efectivo_Real = 0,
                Transferencia_Real = 0,
                Tarjeta_Real = 0,
                Observaciones = 'CIERRE AUTOMÁTICO: SIN ARQUEO (CORTE 23:00)'
            WHERE Estado = 'ABIERTA' 
            AND CAST(Fecha_Apertura AS DATE) <= CAST(GETDATE() AS DATE)
        `);
        console.log("✅ [VIGILANTE]: Cajas cerradas y auditoría actualizada.");
    } catch (err) {
        console.error("❌ [VIGILANTE]: Error en proceso nocturno:", err);
    }
});

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
    console.error("❌ Error no controlado:", err.stack);
    res.status(500).json({ 
        status: "Error", 
        message: "Error interno del servidor",
        error: err.message 
    });
});

// --- INICIALIZACIÓN RESILIENTE ---
const PORT = process.env.PORT || 8000;

const connectWithRetry = async () => {
    console.log(`📡 [DB]: Intentando conectar a ${process.env.DB_SERVER}...`);
    try {
        const pool = await getConnection();
        if (pool) {
            console.log("✅ [DB]: Conexión establecida con éxito.");
        } else {
            throw new Error("Pool de conexión nulo.");
        }
    } catch (err) {
        console.error("⚠️ [DB]: Error de conexión. Reintentando en 5 segundos...");
        setTimeout(connectWithRetry, 5000); 
    }
};

// --- ARRANQUE DEL SERVIDOR ---
server.listen(PORT, () => {
    console.log("===============================================");
    console.log(`✅ [Server]: MedicinaEcuador Pro OK en puerto ${PORT}`);
    console.log(`🕒 [Cierre]: Vigilante nocturno programado (23:00)`);
    console.log(`🌐 [RealTime]: Sockets ACTIVOS`);
    
    // --- VALIDACIÓN DEL PADRÓN NACIONAL ---
    const rutaMaestra = path.join(baseDir, 'BASE_MAESTRA_NACIONAL.csv');
    if (fs.existsSync(rutaMaestra)) {
        const stats = fs.statSync(rutaMaestra);
        const megabytes = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`🗄️  Base Maestra Nacional: OK (${megabytes} MB)`);
    } else {
        console.log(`⚠️  Base Maestra Nacional: NO ENCONTRADA (Búsqueda local inactiva)`);
    }

    console.log("===============================================");

    // Eliminada la inicialización de whatsappService por socket
    connectWithRetry();
});

// --- SEGURIDAD CONTRA CRASHES ---
process.on('uncaughtException', (err) => {
    console.error('❌ EXCEPCIÓN NO CONTROLADA (Sigo vivo):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ PROMESA NO MANEJADA (Sigo vivo):', reason);
});