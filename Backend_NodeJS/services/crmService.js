// --- SERVICIO CRM: AUTOMATIZACIÓN DE CUMPLEAÑOS ---
// Todos los días revisa qué pacientes cumplen años HOY y les manda un saludo por
// WhatsApp (reutilizando el bot ya vinculado) y por correo (mismo transporte
// nodemailer/Gmail que ya usa facturacionController para enviar comprobantes).
// No se agregan tablas ni columnas nuevas: solo se lee Pacientes.Fecha_Nacimiento,
// que ya existe.
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { getConnection, sql } = require('../config/db');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function construirTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
        }
    });
}

async function enviarFelicitacionCumpleanos(paciente) {
    const nombreClinica = paciente.Nombre_Clinica || 'Nuestra Clínica';
    const primerNombre = (paciente.Nombres || '').split(' ')[0];
    const resultado = { whatsapp: false, email: false };

    if (paciente.Telefono) {
        try {
            // enviarMensaje ya está pensado para reintentos/formato de número (593...).
            const { enviarMensaje } = require('./whatsappService');
            const envio = await enviarMensaje(
                paciente.Telefono,
                `🎉 ¡Feliz cumpleaños, ${primerNombre}! 🎂\n\nTodo el equipo de *${nombreClinica}* te desea un día maravilloso. ¡Gracias por tu confianza durante este tiempo! 🦷✨`
            );
            resultado.whatsapp = !!envio.success;
        } catch (e) {
            console.error(`Error enviando WhatsApp de cumpleaños a ${paciente.Nombres}:`, e.message);
        }
    }

    if (paciente.Email) {
        try {
            const { construirEmailHTML } = require('./emailTemplates');
            const transporter = construirTransporter();
            const textoPlano = `Hola ${primerNombre},\n\nTodo el equipo de ${nombreClinica} te desea un muy feliz cumpleaños. ¡Gracias por tu confianza!\n\nUn abrazo,\n${nombreClinica}`;
            await transporter.sendMail({
                from: `"${nombreClinica}" <${process.env.MAIL_USER}>`,
                to: paciente.Email,
                subject: `¡Feliz cumpleaños de parte de ${nombreClinica}! 🎉`,
                text: textoPlano,
                html: construirEmailHTML(nombreClinica, textoPlano)
            });
            resultado.email = true;
        } catch (e) {
            console.error(`Error enviando email de cumpleaños a ${paciente.Nombres}:`, e.message);
        }
    }

    return resultado;
}

async function ejecutarRondaDeCumpleanos() {
    console.log('🎂 [CRM]: Revisando cumpleaños de hoy...');
    try {
        const pool = await getConnection();
        const res = await pool.request().query(`
            SELECT P.Nombres, P.Telefono, P.Email, CL.Nombre_Clinica
            FROM Pacientes P
            INNER JOIN Clinicas CL ON P.ID_Clinica = CL.ID_Clinica
            WHERE P.Activo = 1 AND P.Fecha_Nacimiento IS NOT NULL
              AND MONTH(P.Fecha_Nacimiento) = MONTH(GETDATE()) AND DAY(P.Fecha_Nacimiento) = DAY(GETDATE())
        `);

        console.log(`🎂 [CRM]: ${res.recordset.length} cumpleañero(s) hoy.`);
        for (const paciente of res.recordset) {
            const r = await enviarFelicitacionCumpleanos(paciente);
            console.log(`🎂 [CRM]: ${paciente.Nombres} -> WhatsApp: ${r.whatsapp ? 'OK' : 'no'}, Email: ${r.email ? 'OK' : 'no'}`);
            await delay(3000); // misma pausa de seguridad que usan los otros envíos masivos por WhatsApp
        }
    } catch (err) {
        console.error('🔴 [CRM]: Error en ronda de cumpleaños:', err.message);
    }
}

// DISPARADOR AUTOMÁTICO: todos los días a las 10:00 AM (más tarde que el
// recordatorio de citas de las 09:00 — a esa hora ya hay más probabilidad de
// que el paciente esté despierto/disponible para ver el saludo).
cron.schedule('0 10 * * *', ejecutarRondaDeCumpleanos);

module.exports = { enviarFelicitacionCumpleanos, ejecutarRondaDeCumpleanos };
