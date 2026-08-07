const express = require('express');
const router = express.Router();
const clinicaController = require('../controllers/clinicaController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ==========================================
// CONFIGURACIÓN DE ALMACENAMIENTO PARA LOGOS
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Usamos la carpeta que ya garantizaste en app.js
        cb(null, 'uploads/logos/');
    },
    filename: (req, file, cb) => {
        // Nombre único: clinica-RUC-timestamp.ext
        const ruc = req.body.ruc || 'logo';
        const uniqueSuffix = Date.now();
        cb(null, `clinica-${ruc}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// Filtro para asegurar que solo suban imágenes
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes (jpg, png, webp)'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10MB para el logo
});

// --- RUTAS ---

// Lista todas las clínicas activas
router.get('/listar', clinicaController.listarClinicas);

// Obtiene los datos de una sola clínica por su ID
router.get('/leer/:id', clinicaController.obtenerClinica);

/**
 * GUARDAR / ACTUALIZAR CLÍNICA
 * Usamos upload.single('logo_file') para procesar la imagen que viene del FormData.
 * El campo en el frontend debe llamarse 'logo_file'.
 */
router.post('/guardar', upload.single('logo_file'), clinicaController.guardarClinica);

// --- ESPECIALIDADES (catálogo global + asignación por sede) ---
router.get('/especialidades/catalogo', clinicaController.listarEspecialidadesCatalogo);
router.post('/especialidades/catalogo', clinicaController.crearEspecialidadCatalogo);
router.get('/:id/especialidades', clinicaController.obtenerEspecialidadesClinica);
router.put('/:id/especialidades', clinicaController.guardarEspecialidadesClinica);

// --- HORARIOS DE ATENCIÓN POR SEDE ---
router.get('/:id/horarios', clinicaController.obtenerHorariosClinica);
router.put('/:id/horarios', clinicaController.guardarHorariosClinica);

module.exports = router;