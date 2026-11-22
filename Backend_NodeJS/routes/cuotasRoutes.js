// v4.8.0 — cuotas por tratamiento + link de pago (Payphone)
const express = require('express');
const router = express.Router();
const c = require('../controllers/cuotasController');

router.get('/vencidas', c.vencidas);
router.get('/config', c.verConfig);
router.put('/config', c.guardarConfig);
router.post('/link', c.crearLink);
router.post('/link/:id/verificar', c.verificarLink);
router.get('/plan/:idPlan', c.verPlan);
router.post('/plan/:idPlan', c.crearPlan);
router.delete('/plan/:idPlan', c.quitarPlan);

module.exports = router;
