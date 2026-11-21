const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/certificadoController');

// El .p12 del médico se recibe en memoria (nunca se escribe en disco sin cifrar)
const subirP12 = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /\.(p12|pfx)$/i.test(file.originalname || ''))
});

router.get('/medicos', controller.listarMedicos);
router.get('/firmas/estado', controller.estadoFirmas);
router.post('/firmas/medico', subirP12.single('p12'), controller.subirFirmaMedico);
router.delete('/firmas/medico/:id', controller.eliminarFirmaMedico);

router.post('/', controller.emitirCertificado);
router.get('/paciente/:id', controller.listarPorPaciente);
router.get('/:id/pdf', controller.descargarPdf);
router.post('/:id/anular', controller.anularCertificado);

module.exports = router;
