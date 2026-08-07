const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');

router.get('/resumen', crmController.getResumen);
router.get('/recurrencia', crmController.getRecurrencia);
router.get('/canales-origen', crmController.getCanalesOrigen);
router.get('/demografia', crmController.getDemografia);
router.get('/patologias-zona', crmController.getPatologiasPorZona);
router.get('/retencion-medicos', crmController.getRetencionPorMedico);
router.get('/pacientes', crmController.getPacientes);
router.get('/paciente/:id', crmController.getPacienteDetalle);
router.post('/mensaje', crmController.enviarMensajeManual);
router.get('/cumpleanieros', crmController.getCumpleanieros);
router.post('/felicitar', crmController.enviarFelicitacionManual);
router.get('/segmento', crmController.getSegmentoPacientes);
router.post('/campana', crmController.enviarCampana);
router.get('/campana-estado/:id', crmController.getEstadoCampana);

module.exports = router;
