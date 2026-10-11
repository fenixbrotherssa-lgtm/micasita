const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/comisionController');

// Comisiones de doctores (solo administrador — se valida en el controlador)
router.get('/especialidades', ctrl.getEspecialidades);
router.get('/doctores', ctrl.getDoctores);
router.put('/config/:id_usuario', ctrl.guardarConfig);
router.get('/pendientes', ctrl.getPendientes);
router.post('/liquidar', ctrl.liquidar);
router.get('/liquidaciones', ctrl.getLiquidaciones);
router.get('/liquidaciones/:id', ctrl.getLiquidacion);
router.post('/liquidaciones/:id/anular', ctrl.anularLiquidacion);

module.exports = router;
