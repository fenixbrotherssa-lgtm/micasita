const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentoController');

router.get('/pendientes', controller.pendientes);
router.post('/pendientes/firmar', controller.firmarPendientes);
router.get('/:tipo/:id/pdf', controller.pdf);
router.post('/:tipo/:id/whatsapp', controller.whatsapp);

module.exports = router;
