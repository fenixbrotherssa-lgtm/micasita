const express = require('express');
const router = express.Router();
const { 
    guardarHallazgo, 
    getOdontogramaPaciente, 
    eliminarHallazgo 
} = require('../controllers/odontogramaController');

// --- RUTAS DE ODONTOGRAMA ---

// Obtener perfil (con edad) y hallazgos
router.get('/:id_paciente', getOdontogramaPaciente);

// Guardar o actualizar
router.post('/guardar', guardarHallazgo);

// Eliminar hallazgo
router.post('/eliminar', eliminarHallazgo);

module.exports = router;