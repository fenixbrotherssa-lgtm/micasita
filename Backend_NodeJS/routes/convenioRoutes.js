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
// v4.7.1 — convenio por tratamiento y cuentas por cobrar al convenio
router.put('/tratamiento/:idPlan', controller.coberturaTratamiento);
router.get('/tratamiento/:idPlan/movimientos', controller.movimientosTratamiento);
router.get('/por-cobrar', controller.porCobrar);
router.post('/envio', controller.marcarEnviado);
router.post('/cobros', controller.registrarCobro);
router.post('/rechazo', controller.rechazar);

module.exports = router;
