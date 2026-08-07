// Push de recordatorio de cita al doctor asignado — mismo patrón de "servicio que se
// autorregistra al hacer require()" que crmService.js usa para su cron de cumpleaños.
// Corre cada 5 minutos; busca citas que empiezan dentro de los próximos 30 minutos y
// que todavía no fueron notificadas (columna Citas.Notificado), envía el push y marca
// Notificado=1 para no repetir el aviso.
const cron = require('node-cron');
const { getConnection, sql } = require('../config/db');
const { enviarPushAUsuario } = require('./pushService');

const VENTANA_MINUTOS = 30;

async function revisarCitasProximas() {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT C.ID_Cita, C.ID_Doctor, C.Hora_Inicio, C.Asunto,
                   P.Nombres AS Paciente_Nombres, P.Apellidos AS Paciente_Apellidos
            FROM Citas C
            INNER JOIN Pacientes P ON P.ID_Paciente = C.ID_Paciente
            WHERE C.Notificado = 0
              AND C.Estado NOT IN ('Cancelada', 'Atendida')
              AND C.Fecha_Cita = CAST(GETDATE() AS DATE)
              AND CAST(C.Hora_Inicio AS TIME) BETWEEN CAST(GETDATE() AS TIME) AND DATEADD(MINUTE, ${VENTANA_MINUTOS}, CAST(GETDATE() AS TIME))
        `);

        for (const cita of result.recordset) {
            const paciente = `${cita.Paciente_Nombres || ''} ${cita.Paciente_Apellidos || ''}`.trim();
            const hora = String(cita.Hora_Inicio).substring(11, 16);

            await enviarPushAUsuario(cita.ID_Doctor, {
                title: '📅 Cita próxima',
                body: `${paciente} a las ${hora}${cita.Asunto ? ' — ' + cita.Asunto : ''}`,
                data: { tipo: 'cita', id_cita: cita.ID_Cita }
            });

            await pool.request()
                .input('id_cita', sql.Int, cita.ID_Cita)
                .query(`UPDATE Citas SET Notificado = 1 WHERE ID_Cita = @id_cita`);
        }
    } catch (err) {
        console.error('❌ [PUSH-AGENDA]: Error revisando citas próximas:', err.message);
    }
}

cron.schedule('*/5 * * * *', revisarCitasProximas);

module.exports = { revisarCitasProximas };
