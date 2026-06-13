const express    = require('express');
const router     = express.Router();
const inventarioController = require('../controllers/inventarioController');

// ══════════════════════════════════════════════════════════════════════════════
// RUTAS DE INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════

// ── CRUD BASE ─────────────────────────────────────────────────────────────────
// GET  /inventario?id_clinica=1&tipo=ACTIVO  →  lista ítems por sede y tipo
router.get('/', inventarioController.getInventario);

// POST /inventario/guardar  →  crea nuevo ítem o repone stock (suma cantidad)
router.post('/guardar', inventarioController.guardarItem);

// POST /inventario/salida  →  salida general: { id_item, cantidad_salida, motivo, id_usuario }
router.post('/salida', inventarioController.registrarSalida);

// DELETE /inventario/eliminar/:id  →  baja lógica con validación de clave admin
router.delete('/eliminar/:id', inventarioController.eliminarItem);

// GET  /inventario/reporte-pdf?id_clinica=1&tipo=ACTIVO  →  descarga PDF
router.get('/reporte-pdf', inventarioController.generarReportePDF);

// ── PORCIONES Y ASIGNACIÓN A DOCTORES ────────────────────────────────────────
// POST /inventario/porciones
//   Body: { id_item, porciones_por_unidad }
//   Define cuántos usos rinde 1 unidad física (ej: 1 resina = 15 aplicaciones)
router.post('/porciones', inventarioController.configurarPorciones);

// POST /inventario/asignar-doctor
//   Body: { id_item, id_usuario_destino, cantidad_unidades, motivo, id_usuario_admin }
//   Admin transfiere unidades del inventario clínico al pool personal del doctor
router.post('/asignar-doctor', inventarioController.asignarADoctor);

// POST /inventario/consumo
//   Body: { id_item, porciones_usadas, id_usuario, id_paciente?, motivo?, referencia_externa? }
//   Doctor registra el uso real de porciones de su pool asignado
router.post('/consumo', inventarioController.registrarConsumo);

// ── CONSULTAS POR ROL ─────────────────────────────────────────────────────────
// GET  /inventario/stock-doctor/:id_usuario
//   Vista personal del doctor: porciones disponibles, recibidas y consumidas
router.get('/stock-doctor/:id_usuario', inventarioController.getStockDoctor);

// GET  /inventario/movimientos/:id_item
//   Historial completo de un ítem: quién usó qué, cuándo y en qué paciente
router.get('/movimientos/:id_item', inventarioController.getMovimientosItem);

module.exports = router;