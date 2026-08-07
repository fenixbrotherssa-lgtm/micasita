const express = require('express');
const router = express.Router();
const multer = require('multer');
const { escanearCedula } = require('../controllers/ocrController');

// Memory storage: la foto de la cédula es transitoria (solo para leerla), no se
// guarda en disco ni en Archivos_Multimedia.
const upload = multer({ storage: multer.memoryStorage() });

router.post('/cedula', upload.single('cedula'), escanearCedula);

module.exports = router;
