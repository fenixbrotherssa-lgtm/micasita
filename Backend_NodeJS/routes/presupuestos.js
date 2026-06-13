const express = require('express');
const router = express.Router();
const presupuestoController = require('../controllers/presupuestoController');

// Guardar nueva cotización
router.post('/guardar', presupuestoController.guardarPresupuesto);

// Listar presupuestos de un paciente (¡IMPORTANTE DESCOMENTAR ESTA!)
router.get('/paciente/:id', presupuestoController.getPresupuestosPorPaciente);

// Aprobar (Usaremos POST enviando el ID en el body para mayor seguridad)
router.post('/aprobar', presupuestoController.aprobarPresupuesto);

module.exports = router;