const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Importamos las funciones del controlador (Agregamos generarReciboPDF)
const { 
    registrarPago, 
    getHistorialPagos, 
    generarReciboPDF // <--- Nueva función para el recibo
} = require('../controllers/pagoController');

// --- ASEGURAR QUE LA CARPETA EXISTE ---
const dir = './uploads/vouchers/';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

// --- CONFIGURACIÓN DE ALMACENAMIENTO ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'VOUCHER-' + uniqueSuffix + path.extname(file.originalname)); 
    }
});

// Filtro estricto de archivos
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('FORMAT_INVALID'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// --- MIDDLEWARE DE CAPTURA DE ERRORES DE MULTER ---
const uploadMiddleware = (req, res, next) => {
    const uploadSingle = upload.single('voucher');

    uploadSingle(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ status: "Error", message: "Archivo demasiado pesado (Máx 5MB)." });
        } else if (err) {
            if(err.message === 'FORMAT_INVALID') {
                return res.status(400).json({ status: "Error", message: "Formato no permitido. Use JPG, PNG o PDF." });
            }
            return res.status(500).json({ status: "Error", message: err.message });
        }
        next();
    });
};

// --- DEFINICIÓN DE RUTAS ---

// 1. Registrar Pago (POST)
router.post('/registrar', uploadMiddleware, registrarPago);

// 2. Obtener Historial (GET)
router.get('/historial/:id', getHistorialPagos);

// 3. Generar Recibo (GET) - ESTA ES LA RUTA QUE FALTABA
// Es la que resuelve el error "Cannot GET /api/pagos/recibo/..."
router.get('/recibo/:id', generarReciboPDF);

module.exports = router;