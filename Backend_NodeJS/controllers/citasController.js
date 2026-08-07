const { getConnection, sql } = require('../config/db');
const { enviarMensaje } = require('../services/whatsappService');
const { enviarPushAUsuario } = require('../services/pushService');

// Función auxiliar para formatear fechas a español (Ecuador)
// Acepta un Date ya construido o un string 'YYYY-MM-DD'. Si es string, se
// parsea por componentes (año, mes, día) en vez de new Date(string), que
// JS interpreta como medianoche UTC y desplaza un día al formatear en
// hora local (Ecuador, UTC-5).
const formatearFechaEcuador = (fecha) => {
    let fechaLocal = fecha;
    if (typeof fecha === 'string') {
        const [anio, mes, dia] = fecha.split('-');
        fechaLocal = new Date(anio, mes - 1, dia);
    }
    return fechaLocal.toLocaleDateString('es-EC', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    }).toUpperCase();
};

// La MISMA trampa de arriba (string 'YYYY-MM-DD' -> new Date() = medianoche UTC) afecta
// también a los parámetros sql.Date que se mandan al driver: con useUTC:false (config/db.js),
// tedious serializa Date usando getFullYear/getMonth/getDate LOCALES — así que ese Date en
// medianoche UTC se lee como el día ANTERIOR en Ecuador (UTC-5) y la fecha queda guardada
// corrida un día. Construir el Date por componentes locales (igual que formatearFechaEcuador)
// hace que esos mismos getters locales devuelvan el día correcto.
const fechaComoLocal = (fecha) => {
    if (fecha instanceof Date) return fecha;
    const [anio, mes, dia] = String(fecha).split('-').map(Number);
    return new Date(anio, mes - 1, dia);
};

const citasController = {

    // 1. LISTAR CITAS
    listarCitas: async (req, res) => {
        try {
            const id_clinica = parseInt(req.params.id_clinica);
            const { desde, hasta } = req.query;

            if (isNaN(id_clinica)) return res.status(400).json({ status: "Error", message: "ID de clínica inválido" });

            const pool = await getConnection();

            let query = `
                SELECT 
                    c.ID_Cita,
                    FORMAT(c.Fecha_Cita, 'yyyy-MM-dd') as Fecha_Cita,
                    LEFT(CAST(c.Hora_Inicio AS VARCHAR), 5) as Hora_Inicio,
                    LEFT(CAST(c.Hora_Fin AS VARCHAR), 5) as Hora_Fin,
                    ISNULL(p.Nombres, '') + ' ' + ISNULL(p.Apellidos, '') AS Paciente_Nombre,
                    p.Telefono AS Paciente_Telefono,
                    ISNULL(u.Nombres, '') + ' ' + ISNULL(u.Apellidos, '') AS Doctor_Nombre,
                    c.Estado, c.Asunto, c.Notas_Cita, c.Color_Etiqueta, c.ID_Paciente, c.ID_Doctor
                FROM Citas c
                INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                LEFT JOIN Usuarios u ON c.ID_Doctor = u.ID_Usuario
                WHERE c.ID_Clinica = @id_c
            `;

            const request = pool.request().input('id_c', sql.Int, id_clinica);

            if (desde && hasta) {
                query += ` AND c.Fecha_Cita BETWEEN @desde AND @hasta `;
                request.input('desde', sql.Date, fechaComoLocal(desde));
                request.input('hasta', sql.Date, fechaComoLocal(hasta));
            }

            query += ` ORDER BY c.Fecha_Cita DESC, c.Hora_Inicio ASC`;

            const result = await request.query(query);
            res.json(result.recordset || []);
        } catch (err) {
            console.error("❌ Error en listarCitas:", err);
            res.status(500).json({ status: "Error", message: err.message });
        }
    },

    // 2. CREAR CITA (Manual) — CON VALIDACIÓN DE CHOQUE DE HORARIO
    crearCita: async (req, res) => {
        try {
            const {
                id_paciente, id_doctor, id_clinica, fecha,
                hora_inicio, hora_fin, asunto, notas, color, id_usuario_reg
            } = req.body;

            const h_inicio_safe = hora_inicio.length === 5 ? `${hora_inicio}:00` : hora_inicio;
            const h_fin_safe = (hora_fin && hora_fin.length === 5) ? `${hora_fin}:00` : (hora_fin || null);

            const pool = await getConnection();

            // --- VALIDACIÓN DE CHOQUE ---
            // Detecta si el doctor ya tiene una cita que se solape en ese horario.
            // Excluye Canceladas igual que hace el bot para calcular huecos libres.
            const choque = await pool.request()
                .input('id_d',  sql.Int,     parseInt(id_doctor))
                .input('id_c',  sql.Int,     parseInt(id_clinica))
                .input('fecha', sql.Date,    fechaComoLocal(fecha))
                .input('h_in',  sql.VarChar, h_inicio_safe)
                .input('h_fi',  sql.VarChar, h_fin_safe || '23:59:59')
                .query(`
                    SELECT TOP 1
                        c.ID_Cita,
                        LEFT(CAST(c.Hora_Inicio AS VARCHAR), 5) AS Hora_Inicio,
                        LEFT(CAST(c.Hora_Fin   AS VARCHAR), 5) AS Hora_Fin,
                        ISNULL(p.Nombres,'') + ' ' + ISNULL(p.Apellidos,'') AS Paciente_Nombre
                    FROM Citas c
                    INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                    WHERE c.ID_Doctor  = @id_d
                      AND c.ID_Clinica = @id_c
                      AND c.Fecha_Cita = @fecha
                      AND c.Estado    != 'Cancelada'
                      AND c.Hora_Inicio < @h_fi
                      AND c.Hora_Fin    > @h_in
                `);

            if (choque.recordset.length > 0) {
                const cx = choque.recordset[0];
                return res.status(409).json({
                    status: "Choque",
                    message: `El doctor ya tiene una cita de ${cx.Hora_Inicio} a ${cx.Hora_Fin} con ${cx.Paciente_Nombre}.`,
                    cita_conflicto: {
                        id: cx.ID_Cita,
                        hora_inicio: cx.Hora_Inicio,
                        hora_fin: cx.Hora_Fin,
                        paciente: cx.Paciente_Nombre
                    }
                });
            }
            // --- FIN VALIDACIÓN ---

            const insertResult = await pool.request()
                .input('id_p',  sql.Int,      parseInt(id_paciente))
                .input('id_d',  sql.Int,      parseInt(id_doctor))
                .input('id_c',  sql.Int,      parseInt(id_clinica))
                .input('fecha', sql.Date,     fechaComoLocal(fecha))
                .input('h_in',  sql.VarChar,  h_inicio_safe)
                .input('h_fi',  sql.VarChar,  h_fin_safe)
                .input('asunto',sql.NVarChar, asunto || 'Consulta General')
                .input('notes', sql.NVarChar, notas || null)
                .input('color', sql.VarChar,  color || '#3b82f6')
                .input('id_reg',sql.Int,      parseInt(id_usuario_reg))
                .query(`
                    INSERT INTO Citas (ID_Paciente, ID_Doctor, ID_Clinica, Fecha_Cita, Hora_Inicio, Hora_Fin, Asunto, Notas_Cita, Color_Etiqueta, ID_Usuario_Registro, Estado, Fecha_Registro)
                    OUTPUT INSERTED.ID_Cita
                    VALUES (@id_p, @id_d, @id_c, @fecha, @h_in, @h_fi, @asunto, @notes, @color, @id_reg, 'Confirmada', GETDATE())
                `);

            const newId = insertResult.recordset[0].ID_Cita;

            // Notificación WhatsApp — idéntica al original, no se toca
            setImmediate(async () => {
                try {
                    const infoQuery = await pool.request()
                        .input('idP', sql.Int, id_paciente)
                        .input('idC', sql.Int, id_clinica)
                        .query(`
                            SELECT TOP 1 p.Nombres as Paciente, p.Telefono, cl.Nombre_Clinica
                            FROM Pacientes p
                            INNER JOIN Clinicas cl ON cl.ID_Clinica = @idC
                            WHERE p.ID_Paciente = @idP
                        `);
                    const d = infoQuery.recordset[0];
                    if (d && d.Telefono) {
                        const fechaLegible = formatearFechaEcuador(fecha);
                        const mensaje = `✨ *CITA CONFIRMADA*\n\nHola *${d.Paciente}*, tu cita en *${d.Nombre_Clinica}* ha sido agendada:\n\n📅 *${fechaLegible}*\n🕒 *${h_inicio_safe.substring(0, 5)}*\n\n🔔 *Recordatorio:* Por favor, intenta llegar *10 minutos antes* para tu registro. ¡Te esperamos!`;
                        await enviarMensaje(d.Telefono, mensaje, true);
                    }
                } catch (wsErr) { console.error("⚠️ Error WA Manual:", wsErr); }
            });

            // Push inmediato al doctor asignado ("le llegó una cita nueva") — aparte del
            // recordatorio de 30 min antes que ya manda agendaNotificationService.js.
            setImmediate(async () => {
                try {
                    const infoPac = await pool.request()
                        .input('idP', sql.Int, id_paciente)
                        .query(`SELECT ISNULL(Nombres,'') + ' ' + ISNULL(Apellidos,'') AS Paciente FROM Pacientes WHERE ID_Paciente = @idP`);
                    const paciente = infoPac.recordset[0]?.Paciente?.trim() || 'un paciente';
                    const fechaLegible = formatearFechaEcuador(fecha);
                    await enviarPushAUsuario(parseInt(id_doctor), {
                        title: '🆕 Nueva cita agendada',
                        body: `${paciente} — ${fechaLegible} a las ${h_inicio_safe.substring(0, 5)}`,
                        data: { tipo: 'cita', id_cita: newId }
                    });
                } catch (pushErr) { console.error("⚠️ Error Push Nueva Cita:", pushErr); }
            });

            res.json({ status: "Success", id_cita: newId });
        } catch (err) {
            res.status(500).json({ status: "Error", message: err.message });
        }
    },

    // 2B. REAGENDAR CITA (cambia fecha/hora/doctor/asunto de una cita existente)
    // Misma validación de choque que crearCita, pero excluyendo la propia cita.
    reagendarCita: async (req, res) => {
        try {
            const id_cita = parseInt(req.params.id_cita);
            const { id_doctor, fecha, hora_inicio, hora_fin, asunto } = req.body;

            const h_inicio_safe = hora_inicio.length === 5 ? `${hora_inicio}:00` : hora_inicio;
            const h_fin_safe = (hora_fin && hora_fin.length === 5) ? `${hora_fin}:00` : (hora_fin || null);

            const pool = await getConnection();

            const choque = await pool.request()
                .input('id_actual', sql.Int,     id_cita)
                .input('id_d',      sql.Int,     parseInt(id_doctor))
                .input('fecha',     sql.Date,    fechaComoLocal(fecha))
                .input('h_in',      sql.VarChar, h_inicio_safe)
                .input('h_fi',      sql.VarChar, h_fin_safe || '23:59:59')
                .query(`
                    SELECT TOP 1
                        c.ID_Cita,
                        LEFT(CAST(c.Hora_Inicio AS VARCHAR), 5) AS Hora_Inicio,
                        LEFT(CAST(c.Hora_Fin   AS VARCHAR), 5) AS Hora_Fin,
                        ISNULL(p.Nombres,'') + ' ' + ISNULL(p.Apellidos,'') AS Paciente_Nombre
                    FROM Citas c
                    INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                    WHERE c.ID_Doctor  = @id_d
                      AND c.Fecha_Cita = @fecha
                      AND c.Estado    != 'Cancelada'
                      AND c.ID_Cita   != @id_actual
                      AND c.Hora_Inicio < @h_fi
                      AND c.Hora_Fin    > @h_in
                `);

            if (choque.recordset.length > 0) {
                const cx = choque.recordset[0];
                return res.status(409).json({
                    status: "Choque",
                    message: `El doctor ya tiene una cita de ${cx.Hora_Inicio} a ${cx.Hora_Fin} con ${cx.Paciente_Nombre}.`
                });
            }

            await pool.request()
                .input('id',     sql.Int,      id_cita)
                .input('id_d',   sql.Int,      parseInt(id_doctor))
                .input('fecha',  sql.Date,     fechaComoLocal(fecha))
                .input('h_in',   sql.VarChar,  h_inicio_safe)
                .input('h_fi',   sql.VarChar,  h_fin_safe)
                .input('asunto', sql.NVarChar, asunto || 'Consulta General')
                .query(`
                    UPDATE Citas
                    SET ID_Doctor = @id_d, Fecha_Cita = @fecha, Hora_Inicio = @h_in, Hora_Fin = @h_fi, Asunto = @asunto
                    WHERE ID_Cita = @id
                `);

            // Notificación WhatsApp de reagendamiento
            setImmediate(async () => {
                try {
                    const infoQuery = await pool.request().input('id', sql.Int, id_cita).query(`
                        SELECT p.Nombres as Paciente, p.Telefono, cl.Nombre_Clinica
                        FROM Citas c
                        INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                        INNER JOIN Clinicas cl ON c.ID_Clinica = cl.ID_Clinica
                        WHERE c.ID_Cita = @id
                    `);
                    const d = infoQuery.recordset[0];
                    if (d && d.Telefono) {
                        const fechaLegible = formatearFechaEcuador(fecha);
                        const mensaje = `🔄 *CITA REAGENDADA*\n\nHola *${d.Paciente}*, tu cita en *${d.Nombre_Clinica}* fue reprogramada:\n\n📅 *${fechaLegible}*\n🕒 *${h_inicio_safe.substring(0, 5)}*\n\n🔔 Por favor, intenta llegar *10 minutos antes*. ¡Te esperamos!`;
                        await enviarMensaje(d.Telefono, mensaje, true);
                    }
                } catch (wsErr) { console.error("⚠️ Error WA Reagendar:", wsErr); }
            });

            // Push inmediato al doctor (puede ser uno nuevo si se reasignó la cita).
            setImmediate(async () => {
                try {
                    const infoPac = await pool.request().input('id', sql.Int, id_cita).query(`
                        SELECT ISNULL(p.Nombres,'') + ' ' + ISNULL(p.Apellidos,'') AS Paciente
                        FROM Citas c INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                        WHERE c.ID_Cita = @id
                    `);
                    const paciente = infoPac.recordset[0]?.Paciente?.trim() || 'un paciente';
                    const fechaLegible = formatearFechaEcuador(fecha);
                    await enviarPushAUsuario(parseInt(id_doctor), {
                        title: '🔄 Cita reagendada',
                        body: `${paciente} — ${fechaLegible} a las ${h_inicio_safe.substring(0, 5)}`,
                        data: { tipo: 'cita', id_cita }
                    });
                } catch (pushErr) { console.error("⚠️ Error Push Reagendar:", pushErr); }
            });

            res.json({ status: "Success" });
        } catch (err) {
            console.error("❌ Error en reagendarCita:", err);
            res.status(500).json({ status: "Error", message: err.message });
        }
    },

    // 3. ACTUALIZAR ESTADO
    // Soporta los estados nuevos del tablero: 'Llegó', 'En sillón'
    // Al pasar a 'Llegó' guarda la hora exacta en Hora_Llegada
    // WhatsApp solo se dispara al confirmar — idéntico al original
    // `notas` es opcional (usado por la app móvil al "atender" una cita en campo) — si no
    // se manda, Notas_Cita queda intacta, así que las llamadas viejas del escritorio no cambian.
    actualizarEstado: async (req, res) => {
        try {
            const id_cita = parseInt(req.params.id_cita);
            const { estado, notas } = req.body;
            const pool = await getConnection();

            if (estado === 'Llegó') {
                // Registra la hora de llegada real del paciente
                await pool.request()
                    .input('id',     sql.Int,      id_cita)
                    .input('estado', sql.NVarChar, estado)
                    .query(`UPDATE Citas SET Estado = @estado, Hora_Llegada = GETDATE() WHERE ID_Cita = @id`);
            } else if (notas !== undefined && notas !== null) {
                await pool.request()
                    .input('id',     sql.Int,      id_cita)
                    .input('estado', sql.NVarChar, estado)
                    .input('notas',  sql.NVarChar, notas)
                    .query(`UPDATE Citas SET Estado = @estado, Notas_Cita = @notas WHERE ID_Cita = @id`);
            } else {
                await pool.request()
                    .input('id',     sql.Int,      id_cita)
                    .input('estado', sql.NVarChar, estado)
                    .query(`UPDATE Citas SET Estado = @estado WHERE ID_Cita = @id`);
            }

            // WhatsApp solo al confirmar — igual que el original, sin cambios
            if (estado?.toLowerCase() === 'confirmada') {
                setImmediate(async () => {
                    const info = await pool.request().input('id', sql.Int, id_cita).query(`
                        SELECT 
                            p.Nombres, 
                            p.Telefono, 
                            cl.Nombre_Clinica, 
                            CONVERT(VARCHAR, c.Fecha_Cita, 23) as Fecha_Cita_Txt,
                            LEFT(CAST(c.Hora_Inicio AS VARCHAR), 5) as Hora
                        FROM Citas c 
                        INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                        INNER JOIN Clinicas cl ON c.ID_Clinica = cl.ID_Clinica
                        WHERE c.ID_Cita = @id
                    `);

                    if (info.recordset.length > 0) {
                        const d = info.recordset[0];
                        const [anio, mes, dia] = d.Fecha_Cita_Txt.split('-');
                        const fechaParaFormatear = new Date(anio, mes - 1, dia);
                        const fechaLegible = formatearFechaEcuador(fechaParaFormatear);
                        const mensaje = `✅ *CITA APROBADA*\n\nHola *${d.Nombres}*, tu cita en *${d.Nombre_Clinica}* ha sido confirmada:\n\n📅 *${fechaLegible}*\n🕒 *${d.Hora}*\n\n⏰ *Nota:* Te recomendamos asistir *10 minutos antes* de la hora citada. ¡Saludos!`;
                        await enviarMensaje(d.Telefono, mensaje, true);
                    }
                });
            }

            res.json({ status: "Success" });
        } catch (err) {
            res.status(500).json({ status: "Error", message: err.message });
        }
    },

    // 4. ELIMINAR CITA — sin cambios
    eliminarCita: async (req, res) => {
        try {
            const id_cita = parseInt(req.params.id_cita);
            const pool = await getConnection();

            // Una cita "Atendida" ya generó historial real (KPIs, CRM, y puede tener
            // tratamientos/pagos vinculados) — borrarla desordena esos módulos sin dejar
            // rastro de que la atención existió. No hay forma de deshacer esto, así que se
            // bloquea acá en vez de confiar en que cada cliente (escritorio/móvil) lo valide.
            const cita = await pool.request().input('id', sql.Int, id_cita).query(`SELECT Estado FROM Citas WHERE ID_Cita = @id`);
            if (cita.recordset.length === 0) {
                return res.status(404).json({ status: "Error", message: "La cita no existe." });
            }
            if (cita.recordset[0].Estado === 'Atendida') {
                return res.status(403).json({
                    status: "Error",
                    message: "No se puede eliminar: la cita ya fue atendida y forma parte del historial (KPIs/CRM). Si fue un error, márcala como Cancelada en vez de borrarla."
                });
            }

            await pool.request().input('id', sql.Int, id_cita).query(`DELETE FROM Recordatorios_Citas WHERE ID_Cita = @id`);
            await pool.request().input('id', sql.Int, id_cita).query(`DELETE FROM Citas WHERE ID_Cita = @id`);
            res.json({ status: "Success" });
        } catch (err) {
            res.status(500).json({ status: "Error" });
        }
    },

    // 5. AGENDAR DESDE WHATSAPP / EXTERNO — SIN NINGÚN CAMBIO
    agendarCitaExterna: async (req, res) => {
        try {
            const { nombres, apellidos, dni, telefono, fecha, hora, id_clinica } = req.body;
            const pool = await getConnection();

            let numLimpio = telefono.toString().replace(/\D/g, '');
            if (numLimpio.startsWith('09') && numLimpio.length === 10) numLimpio = '593' + numLimpio.substring(1);
            else if (!numLimpio.startsWith('593')) numLimpio = '593' + numLimpio;

            let pRes = await pool.request().input('tel', sql.VarChar, numLimpio).query("SELECT ID_Paciente FROM Pacientes WHERE Telefono = @tel");

            let id_p;
            if (pRes.recordset.length > 0) {
                id_p = pRes.recordset[0].ID_Paciente;
            } else {
                const nuevoP = await pool.request()
                    .input('n', sql.NVarChar, nombres)
                    .input('a', sql.NVarChar, apellidos)
                    .input('d', sql.VarChar,  dni || '')
                    .input('t', sql.VarChar,  numLimpio)
                    .query(`INSERT INTO Pacientes (Nombres, Apellidos, DNI, Telefono, Fecha_Registro, Activo) OUTPUT INSERTED.ID_Paciente VALUES (@n, @a, @d, @t, GETDATE(), 1)`);
                id_p = nuevoP.recordset[0].ID_Paciente;
            }

            await pool.request()
                .input('id_p', sql.Int,     id_p)
                .input('id_c', sql.Int,     id_clinica)
                .input('f',    sql.Date,    fechaComoLocal(fecha))
                .input('h',    sql.VarChar, hora.length === 5 ? `${hora}:00` : hora)
                .query(`INSERT INTO Citas (ID_Paciente, ID_Clinica, ID_Doctor, Fecha_Cita, Hora_Inicio, Estado, Asunto, Fecha_Registro) VALUES (@id_p, @id_c, 1, @f, @h, 'Pendiente', 'Solicitud WhatsApp', GETDATE())`);

            const msg = `👋 Hola *${nombres}*, recibimos tu solicitud. Para agilizar tu atención, por favor completa tu ficha aquí: https://medicinaecuador.pro/registro-paciente?id=${id_p}`;
            await enviarMensaje(numLimpio, msg, false);

            res.json({ status: "Success", telefono_registrado: numLimpio });
        } catch (err) {
            console.error("❌ Error en agenda externa:", err);
            res.status(500).json({ status: "Error", message: err.message });
        }
    },

    // 6. CITAS DE HOY — para el tablero de flujo
    // Devuelve las citas del día con Minutos_Espera calculado en tiempo real
    citasDeHoy: async (req, res) => {
        try {
            const id_clinica = parseInt(req.params.id_clinica);
            if (isNaN(id_clinica)) return res.status(400).json({ status: "Error", message: "ID de clínica inválido" });

            const pool = await getConnection();
            const result = await pool.request()
                .input('id_c', sql.Int, id_clinica)
                .query(`
                    SELECT
                        c.ID_Cita,
                        c.ID_Paciente,
                        FORMAT(c.Fecha_Cita, 'yyyy-MM-dd') AS Fecha_Cita,
                        LEFT(CAST(c.Hora_Inicio AS VARCHAR), 5) AS Hora_Inicio,
                        LEFT(CAST(c.Hora_Fin   AS VARCHAR), 5) AS Hora_Fin,
                        ISNULL(p.Nombres,'') + ' ' + ISNULL(p.Apellidos,'') AS Paciente_Nombre,
                        p.Telefono AS Paciente_Telefono,
                        ISNULL(u.Nombres,'') + ' ' + ISNULL(u.Apellidos,'') AS Doctor_Nombre,
                        c.Estado,
                        c.Asunto,
                        CASE 
                            WHEN c.Hora_Llegada IS NOT NULL
                            THEN DATEDIFF(MINUTE, c.Hora_Llegada, GETDATE())
                            ELSE NULL
                        END AS Minutos_Espera
                    FROM Citas c
                    INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente
                    LEFT JOIN Usuarios u ON c.ID_Doctor = u.ID_Usuario
                    WHERE c.ID_Clinica = @id_c
                      AND CAST(c.Fecha_Cita AS DATE) = CAST(GETDATE() AS DATE)
                      AND c.Estado != 'Cancelada'
                    ORDER BY c.Hora_Inicio ASC
                `);

            res.json(result.recordset || []);
        } catch (err) {
            console.error("❌ Error en citasDeHoy:", err);
            res.status(500).json({ status: "Error", message: err.message });
        }
    }
};

module.exports = citasController;