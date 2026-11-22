const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/ordenController');

// El resultado se recibe en memoria y se guarda en una carpeta privada (no pública)
const subirResultado = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /\.(pdf|jpe?g|png)$/i.test(file.originalname || ''))
});

router.post('/', controller.emitir);
router.get('/paciente/:id', controller.listarPorPaciente);
router.post('/:id/anular', controller.anular);
router.post('/:id/resultado', subirResultado.single('archivo'), controller.subirResultado);
router.get('/:id/resultado', controller.verResultado);

module.exports = router;
