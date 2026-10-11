const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/personalController');

// Nómina de personal (solo administrador — se valida en el controlador)
router.get('/lista', ctrl.getLista);
router.post('/guardar', ctrl.guardar);
router.post('/movimiento', ctrl.registrarMovimiento);
router.post('/movimiento/:id/anular', ctrl.anularMovimiento);
router.post('/nomina', ctrl.generarNomina);
router.post('/nomina/pagar', ctrl.pagarNomina);
router.get('/nomina/pagos', ctrl.historialPagos);
router.get('/liquidacion/calcular', ctrl.calcularLiquidacion);
router.post('/liquidacion', ctrl.registrarLiquidacion);
router.get('/parametros-laborales', ctrl.getParametros);
router.post('/parametros-laborales', ctrl.guardarParametros);
router.post('/:id/desactivar', ctrl.desactivar);
router.get('/:id/historial', ctrl.getHistorial);

module.exports = router;
