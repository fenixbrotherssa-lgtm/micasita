const express = require('express');
const router = express.Router();
const gastosController = require('../controllers/gastosController');
const multer = require('multer');
const path = require('path');

// Configuración de almacenamiento para los Vouchers de Gastos/Ingresos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Asegúrate de que esta carpeta exista en tu servidor: uploads/vouchers/
        cb(null, 'uploads/vouchers/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'finanza-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// ==========================================
// 1. GESTIÓN DEL CATÁLOGO (RUBROS)
// ==========================================
router.get('/categorias', gastosController.getCategorias);
router.post('/categorias/guardar', gastosController.guardarCategoria);
router.get('/categorias/eliminar/:id', gastosController.eliminarCategoria);

// ==========================================
// 2. MOVIMIENTOS Y REPORTES
// ==========================================

// Guardar gasto o ingreso manual (con subida de imagen)
router.post('/guardar', upload.single('voucher'), gastosController.guardarGasto);

// Reporte Administrativo Integral (Cartera, Producción, Movimientos, etc.)
router.get('/reporte-admin', gastosController.reporteAdmin);

// ==========================================
// 3. CIERRES FINANCIEROS Y SEGURIDAD
// ==========================================

/**
 * NUEVO: Listar historial de cierres realizados
 * Útil para llenar la tabla de consultas y reimpresiones.
 */
router.get('/historial-cierres', gastosController.listarCierres);

/**
 * NUEVO: Obtener detalle de un cierre específico para IMPRESIÓN
 * Se usa el ID del cierre para traer montos y datos de la clínica.
 */
router.get('/detalle-cierre/:id', gastosController.obtenerDetalleCierre);

/**
 * NUEVO: Ejecutar el cierre contable de un periodo.
 * Esto inserta en Cierres_Financieros y bloquea ediciones futuras.
 */
router.post('/ejecutar-cierre', gastosController.ejecutarCierre);

/**
 * ACTUALIZACIÓN CRÍTICA: Eliminar gasto con validación de clave
 * Se usa POST para recibir la 'claveAutorizacion' en el body.
 */
router.post('/eliminar/:id', gastosController.eliminarGasto);

module.exports = router;