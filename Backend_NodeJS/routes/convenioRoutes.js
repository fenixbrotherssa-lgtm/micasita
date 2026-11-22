const express = require('express');
const router = express.Router();
const controller = require('../controllers/convenioController');

router.get('/', controller.listar);
router.post('/', controller.crear);
router.put('/:id', controller.actualizar);
router.get('/planilla', controller.planilla);
router.get('/paciente/:id', controller.delPaciente);
router.post('/paciente/:id', controller.asignarPaciente);
router.delete('/asignacion/:id', controller.quitarPaciente);

module.exports = router;
