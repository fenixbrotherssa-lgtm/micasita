const express = require('express');
const router = express.Router();
const recetaController = require('../controllers/recetaController');

// Guardar receta y generar registro
router.post('/guardar', recetaController.guardarReceta);

// Obtener historial de recetas de un paciente
router.get('/paciente/:id', recetaController.getRecetasPorPaciente);

router.get('/verificar/:id', recetaController.verificarReceta);


module.exports = router;