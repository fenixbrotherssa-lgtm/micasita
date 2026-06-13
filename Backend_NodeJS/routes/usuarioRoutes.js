const express = require('express');
const router = express.Router();
const controller = require('../controllers/usuarioController');

// Middleware para verificar si es Administrador (Ajustado según tu lógica)
const soloAdmin = (req, res, next) => {
    const { rol_solicitante } = req.body; 

    if (parseInt(rol_solicitante) === 1) { // Nota: En tu listarPersonal, Admin es 1
        next(); 
    } else {
        res.status(403).json({ 
            status: "Error", 
            message: "No tienes permisos para realizar esta acción" 
        });
    }
};

// --- RUTAS DE USUARIOS ---

// 1. Listado completo para administración (el que ya tenías)
router.get('/listar', controller.listarPersonal); 

// 2. NUEVA RUTA: Listado ligero para el modal de tratamientos
// Esta es la que permite que se vean los médicos en el selector
router.get('/listar-medicos', controller.listarMedicosParaSelect);

// 3. Guardar/Editar (Protegido)
router.post('/guardar', soloAdmin, controller.guardarUsuario); 

module.exports = router;