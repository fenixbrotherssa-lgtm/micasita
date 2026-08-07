// Alertas de emergencia fuera de horario — cuando un paciente escribe algo que
// no es una opción del menú del bot de WhatsApp (whatsappService.js) mientras la
// clínica está cerrada, se asume candidato a emergencia y se avisa a todos los
// doctores activos de la clínica (decisión ya confirmada: sin tabla de turnos,
// cualquier médico activo recibe la alerta — ID_Rol = 3).
const { getConnection, sql } = require('../config/db');
const { enviarPushAUsuarios } = require('./pushService');

// Mismo horario que el bot ya anuncia en su menú (whatsappService.js, opción "1").
// Duplicar esta constante aquí es intencional para la v1 — migrar a una tabla de
// horarios real es un proyecto aparte si se necesita más adelante.
function estaFueraDeHorario(fecha = new Date()) {
    const dia = fecha.getDay(); // 0=domingo … 6=sábado
    const minutos = fecha.getHours() * 60 + fecha.getMinutes();
    const desde = (h, m) => h * 60 + m;

    if (dia === 0) return true; // domingo cerrado
    if (dia >= 1 && dia <= 5) return !(minutos >= desde(9, 0) && minutos <= desde(17, 30));
    return !(minutos >= desde(9, 0) && minutos <= desde(15, 30)); // sábado
}

async function dispararAlertaEmergencia(id_clinica, numeroPaciente, mensajeOriginal) {
    const pool = await getConnection();

    const pacienteRes = await pool.request()
        .input('tel', sql.VarChar, numeroPaciente)
        .input('cli', sql.Int, id_clinica)
        .query(`SELECT TOP 1 ID_Paciente, Nombres, Apellidos FROM Pacientes WHERE Telefono = @tel AND ID_Clinica = @cli`);

    const paciente = pacienteRes.recordset[0];
    let resumenClinico = '';

    if (paciente) {
        const antecedentes = await pool.request()
            .input('idP', sql.Int, paciente.ID_Paciente)
            .query(`SELECT Alergias, Enfermedades_Sistemicas, Medicamentos FROM Antecedentes_Medicos WHERE ID_Paciente = @idP`);
        const a = antecedentes.recordset[0];
        if (a) {
            const partes = [
                a.Alergias && `Alergias: ${a.Alergias}`,
                a.Enfermedades_Sistemicas && `Enf. sistémicas: ${a.Enfermedades_Sistemicas}`,
                a.Medicamentos && `Medicamentos: ${a.Medicamentos}`
            ].filter(Boolean);
            if (partes.length) resumenClinico = '\n' + partes.join(' · ');
        }
    }

    const nombrePaciente = paciente ? `${paciente.Nombres} ${paciente.Apellidos}`.trim() : `Número desconocido (${numeroPaciente})`;

    const doctoresRes = await pool.request()
        .input('cli', sql.Int, id_clinica)
        .query(`SELECT ID_Usuario FROM Usuarios WHERE ID_Rol = 3 AND Activo = 1 AND ID_Clinica = @cli`);

    const idsDoctores = doctoresRes.recordset.map(r => r.ID_Usuario);
    if (!idsDoctores.length) return { alertados: 0, motivo: 'Sin doctores activos en la clínica' };

    return enviarPushAUsuarios(idsDoctores, {
        title: '🚨 Posible emergencia fuera de horario',
        body: `${nombrePaciente}: "${mensajeOriginal}"${resumenClinico}`,
        data: { tipo: 'emergencia', id_paciente: paciente?.ID_Paciente || '', telefono: numeroPaciente }
    });
}

module.exports = { dispararAlertaEmergencia, estaFueraDeHorario };
