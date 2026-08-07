const whatsappService = require('../services/whatsappService');
const { getConnection } = require('../config/db');

// GET /api/whatsapp/estado
// Devuelve el estado actual del bot y si la base de datos responde, para que
// el panel admin pueda mostrar un semáforo sin tener que leer los logs del
// servidor por AnyDesk.
exports.getEstado = async (req, res) => {
    let dbOk = false;
    try {
        const pool = await getConnection();
        dbOk = !!pool;
    } catch (e) {
        dbOk = false;
    }

    const estadoBot = whatsappService.obtenerEstadoBot();

    res.json({
        status: 'OK',
        estadoBot,
        dbOk,
        qr: estadoBot === 'esperando_qr' ? whatsappService.obtenerUltimoQR() : null
    });
};

// POST /api/whatsapp/reiniciar
// Reinicia el cliente de WhatsApp (cierra el Chrome/sesión de Puppeteer y
// vuelve a lanzar initialize()). Solo Admin (ID_Rol 1) puede dispararlo.
exports.reiniciar = async (req, res) => {
    if (req.usuarioAuth?.id_rol !== 1) {
        return res.status(403).json({ status: 'Error', message: 'Solo un administrador puede reiniciar el bot.' });
    }

    whatsappService.reiniciarBot();
    res.json({ status: 'OK', message: 'Reinicio del bot iniciado. Puede tardar unos segundos.' });
};
