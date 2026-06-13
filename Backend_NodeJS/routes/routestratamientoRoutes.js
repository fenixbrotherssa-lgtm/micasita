const express = require('express');
const router = express.Router();
const controller = require('../controllers/tratamientoController');

// ==========================================
// --- GESTIÓN DEL CATÁLOGO ---
// ==========================================
router.get('/catalogo',            controller.getCatalogoCompleto);
router.post('/catalogo/nuevo',     controller.guardarNuevaPrestacion);
router.post('/catalogo/guardar',   controller.guardarOEditarPrestacion);
router.delete('/catalogo/:id',     controller.eliminarPrestacionCatalogo);

// ==========================================
// --- PLAN DE TRATAMIENTO DEL PACIENTE ---
// ==========================================
router.post('/asignar-lote',       controller.asignarTratamientosLote);
router.get('/paciente/:id',        controller.getTratamientosPorPaciente);
router.delete('/:id',              controller.eliminarTratamiento);

// ==========================================
// --- CONSENTIMIENTO MSP-024 ---
// ==========================================
router.get('/consentimiento/paciente/:id', controller.getConsentimientosPorPaciente);

module.exports = router;