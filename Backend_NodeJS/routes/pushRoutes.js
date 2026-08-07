const express = require('express');
const router = express.Router();
const { registrarDispositivo, eliminarDispositivo } = require('../controllers/pushController');

// Base: /api/push (ya montada detrás de verificarToken en server.js)
router.post('/registrar', registrarDispositivo);
router.post('/eliminar', eliminarDispositivo);

module.exports = router;
