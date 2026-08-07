// Envío de notificaciones push (FCM) — mismo estilo de helper exportado que
// whatsappService.js (enviarMensaje). Un usuario puede tener varios dispositivos
// (celular + tablet), así que se envía a todos los tokens activos que tenga.
require('../config/firebase'); // asegura que la app de Firebase Admin ya esté inicializada
const { getMessaging } = require('firebase-admin/messaging');
const { getConnection, sql } = require('../config/db');

const enviarPushAUsuario = async (id_usuario, { title, body, data = {} }) => {
    const pool = await getConnection();
    const result = await pool.request()
        .input('id_usuario', sql.Int, id_usuario)
        .query(`SELECT Token_FCM FROM Dispositivos_Push WHERE ID_Usuario = @id_usuario AND Activo = 1`);

    const tokens = result.recordset.map(r => r.Token_FCM);
    if (!tokens.length) return { enviados: 0 };

    const mensaje = {
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        tokens
    };

    const respuesta = await getMessaging().sendEachForMulticast(mensaje);

    // Tokens que ya no son válidos (app desinstalada, etc.) — se desactivan para no
    // reintentar contra ellos indefinidamente.
    const tokensInvalidos = [];
    respuesta.responses.forEach((r, i) => {
        if (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code)) {
            tokensInvalidos.push(tokens[i]);
        }
    });
    if (tokensInvalidos.length) {
        const req = pool.request();
        const placeholders = tokensInvalidos.map((t, i) => {
            req.input(`t${i}`, sql.NVarChar, t);
            return `@t${i}`;
        });
        await req.query(`UPDATE Dispositivos_Push SET Activo = 0 WHERE Token_FCM IN (${placeholders.join(',')})`);
    }

    return { enviados: respuesta.successCount, fallidos: respuesta.failureCount };
};

const enviarPushAUsuarios = async (idsUsuarios, payload) => {
    const resultados = await Promise.all(idsUsuarios.map(id => enviarPushAUsuario(id, payload)));
    return resultados.reduce((acc, r) => ({
        enviados: acc.enviados + (r.enviados || 0),
        fallidos: acc.fallidos + (r.fallidos || 0)
    }), { enviados: 0, fallidos: 0 });
};

module.exports = { enviarPushAUsuario, enviarPushAUsuarios };
