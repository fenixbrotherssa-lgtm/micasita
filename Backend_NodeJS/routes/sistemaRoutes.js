const express = require('express');
const router = express.Router();
const actualizador = require('../services/actualizadorService');

const soloAdmin = (req, res, next) => {
    if (parseInt(req.usuarioAuth?.id_rol) !== 1) {
        return res.status(403).json({ status: "Error", message: "Solo el administrador." });
    }
    next();
};

// Versión del servidor y estado de actualizaciones (para el aviso del dashboard)
router.get('/estado', (req, res) => {
    res.json({ status: "Success", data: actualizador.estadoPublico() });
});

// Buscar actualización ahora (sin esperar el ciclo de 6 horas)
router.post('/buscar-actualizacion', soloAdmin, async (req, res) => {
    const r = await actualizador.checkin();
    res.json({ status: r.ok ? "Success" : "Error", message: r.ok ? 'Comprobación realizada.' : `No se pudo comprobar: ${r.motivo}`, data: actualizador.estadoPublico() });
});

// Instalar ya la versión descargada (reinicia el servidor ~10 segundos)
router.post('/instalar-actualizacion', soloAdmin, (req, res) => {
    const ok = actualizador.aplicarAhora('solicitado por el administrador');
    res.json(ok
        ? { status: "Success", message: "Instalando. El sistema se reiniciará en unos segundos." }
        : { status: "Error", message: "No hay ninguna actualización descargada para instalar." });
});

module.exports = router;
