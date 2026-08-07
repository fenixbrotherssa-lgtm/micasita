const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

router.get('/estado', whatsappController.getEstado);
router.post('/reiniciar', whatsappController.reiniciar);

module.exports = router;
