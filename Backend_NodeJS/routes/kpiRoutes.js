const express = require('express');
const router = express.Router();
const kpiController = require('../controllers/kpiController');

// ==========================================
// RUTA MAESTRA DE MÉTRICAS (DASHBOARD)
// ==========================================

/**
 * Obtiene el objeto global de KPIs:
 * - Financiero (Ingresos, Gastos, Cartera)
 * - Operativo (Citas, Efectividad, Pacientes Nuevos)
 * - Inventario (Alertas de stock)
 * - Top Servicios (Tratamientos más vendidos)
 */
router.get('/dashboard-super-kpi', kpiController.getDashboardSuperKPI);

module.exports = router;