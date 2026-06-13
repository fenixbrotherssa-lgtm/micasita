const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citasController');

// ==========================================
// RUTAS DE GESTIÓN INTERNA (SISTEMA LOCAL)
// ==========================================

// Listar todas las citas (incluye las pendientes para revisión)
router.get('/listar/:id_clinica', citasController.listarCitas);

// Guardar cita manual desde el panel de la clínica (Estado: Confirmada)
// Ahora valida choque de horario — responde 409 si el doctor ya está ocupado
router.post('/guardar', citasController.crearCita);

// Actualizar estado — acepta: Pendiente, Confirmada, Llegó, En sillón, Atendida, Cancelada
router.post('/estado/:id_cita', citasController.actualizarEstado);

// Eliminar cita
router.delete('/eliminar/:id_cita', citasController.eliminarCita);

// Citas de hoy con tiempo de espera — para el tablero de flujo del día
router.get('/hoy/:id_clinica', citasController.citasDeHoy);

// ==========================================
// RUTAS DE GESTIÓN EXTERNA (WHATSAPP / AUTOMATIZACIÓN)
// ==========================================

// Bot de WhatsApp — sin cambios
router.post('/externa', citasController.agendarCitaExterna);

module.exports = router;