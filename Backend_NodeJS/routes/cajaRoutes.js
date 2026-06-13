const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/cajaController');

// Obtener el estado actual y cálculos del sistema
router.get('/estado', cajaController.obtenerEstadoCaja);

// Registrar el arqueo y cerrar el turno
router.post('/cerrar', cajaController.procesarCierreCaja);

// NUEVO: Permitir al administrador reabrir una caja cerrada
router.post('/reabrir', cajaController.reabrirCaja);

router.get('/reporte-cierre/:id_caja', cajaController.generarReportePDFCierre);

module.exports = router;