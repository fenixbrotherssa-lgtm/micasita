const express = require('express');
const router = express.Router();
const iaController = require('../controllers/iaController');

/**
 * RUTAS DEL MÓDULO DE INTELIGENCIA ARTIFICIAL (MINI DOCTOR)
 */

// 1. Procesar preguntas manuales
router.post('/consultar', iaController.consultarMiniDoctor);

// 2. Saludo proactivo / análisis de módulo (CORREGIDO EL NOMBRE AQUÍ)
router.post('/saludo-entorno', iaController.saludoEntorno);

module.exports = router;