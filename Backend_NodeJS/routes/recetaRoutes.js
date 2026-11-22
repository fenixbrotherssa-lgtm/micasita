const express = require('express');
const router = express.Router();
const recetaController = require('../controllers/recetaController');

// Guardar receta y generar registro
router.post('/guardar', recetaController.guardarReceta);

// Obtener historial de recetas de un paciente
router.get('/paciente/:id', recetaController.getRecetasPorPaciente);

// Firma electrónica de la receta (MEDICO con PIN / CLINICA / NINGUNA)
router.post('/:id/firmar', recetaController.firmarReceta);

// GET /verificar/:id se movió a server.js como ruta pública (fuera de verificarToken) —
// quien escanea el QR de la receta impresa nunca tiene sesión iniciada.

module.exports = router;