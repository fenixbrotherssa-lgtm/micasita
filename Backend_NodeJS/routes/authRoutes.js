const express = require('express');
const router = express.Router();
const { login, refrescarToken } = require('../controllers/authController');
const verificarToken = require('../middlewares/authMiddleware');

router.post('/login', login);
// Sesión deslizante — ver comentario en authController.refrescarToken.
router.post('/refresh', verificarToken, refrescarToken);
module.exports = router;