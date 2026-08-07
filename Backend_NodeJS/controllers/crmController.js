const { getConnection, sql } = require('../config/db');

// Mismos estados que usa kpiController para que "cita atendida" signifique lo mismo en todo el sistema.
const ESTADOS_ATENDIDA = "'Atendida','Atendido','Finalizada','Finalizado','Completada','Completado','Realizada','Realizado'";

// Progreso de campañas masivas en curso (en memoria — se pierde si el server reinicia, pero una
// campaña dura minutos, no días, así que alcanza). El frontend hace polling a /campana-estado/:id
// para mostrar "enviando X/Y" en vivo, sobre todo para tranquilizar que el delay entre mensajes
// de WhatsApp SÍ se está respetando (evita que el número quede bloqueado por envío masivo).
const campanasEnCurso = {};

const crmController = {

    // --- 1. RESUMEN GENERAL (tarjetas superiores del panel CRM) ---
    // "Pacientes Activos" y el LTV son fotos del momento (no tiene sentido acotarlas a un
    // rango: son "cuántos hay hoy" y "cuánto deja un paciente en toda su vida"). Lo que SÍ
    // se acota por fecha cuando se manda fecha_inicio/fecha_fin es "nuevos" (antes fijo al
    // mes calendario actual, sin poder verlo de otro período) y la recurrencia (visitas
    // dentro del rango). Sin fecha_inicio/fecha_fin, se mantiene el comportamiento histórico
    // de siempre — nadie que ya llamaba este endpoint se rompe.
    getResumen: async (req, res) => {
        const { id_clinica, fecha_inicio, fecha_fin } = req.query;
        const hayRango = !!(fecha_inicio && fecha_fin);
        try {
            const pool = await getConnection();

            const [totales, nuevos, recurrencia, ltv, canalHoy] = await Promise.all([
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    SELECT COUNT(*) as Total_Pacientes FROM Pacientes WHERE ID_Clinica = @id_cli AND Activo = 1
                `),
                hayRango
                    ? pool.request().input('id_cli', sql.Int, id_clinica).input('fIn', sql.Date, fecha_inicio).input('fOut', sql.Date, fecha_fin).query(`
                        SELECT COUNT(*) as Nuevos FROM Pacientes
                        WHERE ID_Clinica = @id_cli AND Activo = 1 AND CAST(Fecha_Registro AS DATE) BETWEEN @fIn AND @fOut
                    `)
                    : pool.request().input('id_cli', sql.Int, id_clinica).query(`
                        SELECT COUNT(*) as Nuevos FROM Pacientes
                        WHERE ID_Clinica = @id_cli AND Activo = 1
                          AND MONTH(Fecha_Registro) = MONTH(GETDATE()) AND YEAR(Fecha_Registro) = YEAR(GETDATE())
                    `),
                (hayRango
                    ? pool.request().input('id_cli', sql.Int, id_clinica).input('fIn', sql.Date, fecha_inicio).input('fOut', sql.Date, fecha_fin)
                    : pool.request().input('id_cli', sql.Int, id_clinica)
                ).query(`
                    WITH VisitasPorPaciente AS (
                        SELECT C.ID_Paciente, COUNT(*) as Visitas
                        FROM Citas C
                        INNER JOIN Pacientes P ON C.ID_Paciente = P.ID_Paciente
                        WHERE P.ID_Clinica = @id_cli AND C.Estado IN (${ESTADOS_ATENDIDA})
                          ${hayRango ? 'AND CAST(C.Fecha_Cita AS DATE) BETWEEN @fIn AND @fOut' : ''}
                        GROUP BY C.ID_Paciente
                    )
                    SELECT
                        COUNT(*) as Total_Con_Visitas,
                        SUM(CASE WHEN Visitas >= 2 THEN 1 ELSE 0 END) as Recurrentes,
                        SUM(CASE WHEN Visitas = 1 THEN 1 ELSE 0 END) as Unicos
                    FROM VisitasPorPaciente
                `),
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    SELECT ISNULL(AVG(TotalPorPaciente), 0) as Ticket_Vida_Promedio
                    FROM (
                        SELECT PG.ID_Paciente, SUM(PG.Monto) as TotalPorPaciente
                        FROM Pagos PG WHERE PG.ID_Clinica = @id_cli
                        GROUP BY PG.ID_Paciente
                    ) x
                `),
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    SELECT COUNT(*) as Cumpleanos_Hoy
                    FROM Pacientes
                    WHERE ID_Clinica = @id_cli AND Activo = 1
                      AND MONTH(Fecha_Nacimiento) = MONTH(GETDATE()) AND DAY(Fecha_Nacimiento) = DAY(GETDATE())
                `)
            ]);

            const t = totales.recordset[0];
            const r = recurrencia.recordset[0];
            const totalConVisitas = r.Total_Con_Visitas || 0;

            res.json({
                status: 'OK',
                total_pacientes: t.Total_Pacientes, // foto de hoy, siempre histórico — no cambia con el rango
                nuevos_este_mes: nuevos.recordset[0].Nuevos, // acotado al rango si se mandó, si no al mes calendario actual (igual que antes)
                rango_aplicado: hayRango ? { fecha_inicio, fecha_fin } : null,
                recurrentes: r.Recurrentes || 0,
                unicos: r.Unicos || 0,
                tasa_recurrencia: totalConVisitas > 0 ? (((r.Recurrentes || 0) / totalConVisitas) * 100).toFixed(1) : 0,
                ticket_vida_promedio: ltv.recordset[0].Ticket_Vida_Promedio,
                cumpleanos_hoy: canalHoy.recordset[0].Cumpleanos_Hoy
            });
        } catch (error) {
            console.error('🔴 Error CRM Resumen:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al generar el resumen CRM', dev_info: error.message });
        }
    },

    // --- 2. RECURRENCIA: distribución de pacientes por cantidad de visitas ---
    getRecurrencia: async (req, res) => {
        const { id_clinica } = req.query;
        try {
            const pool = await getConnection();
            const result = await pool.request().input('id_cli', sql.Int, id_clinica).query(`
                WITH VisitasPorPaciente AS (
                    SELECT C.ID_Paciente, COUNT(*) as Visitas
                    FROM Citas C
                    INNER JOIN Pacientes P ON C.ID_Paciente = P.ID_Paciente
                    WHERE P.ID_Clinica = @id_cli AND C.Estado IN (${ESTADOS_ATENDIDA})
                    GROUP BY C.ID_Paciente
                )
                SELECT
                    ISNULL(SUM(CASE WHEN Visitas = 1 THEN 1 ELSE 0 END), 0) as [1_Visita],
                    ISNULL(SUM(CASE WHEN Visitas BETWEEN 2 AND 3 THEN 1 ELSE 0 END), 0) as [2_a_3_Visitas],
                    ISNULL(SUM(CASE WHEN Visitas BETWEEN 4 AND 6 THEN 1 ELSE 0 END), 0) as [4_a_6_Visitas],
                    ISNULL(SUM(CASE WHEN Visitas >= 7 THEN 1 ELSE 0 END), 0) as [7_o_mas_Visitas]
                FROM VisitasPorPaciente
            `);
            res.json({ status: 'OK', ...result.recordset[0] });
        } catch (error) {
            console.error('🔴 Error CRM Recurrencia:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al calcular recurrencia', dev_info: error.message });
        }
    },

    // --- 3. CANALES DE ORIGEN: cuántas citas entraron por WhatsApp vs. registro manual ---
    // Sin fecha_inicio/fecha_fin: histórico completo (comportamiento de siempre). Con rango:
    // solo cuenta las citas creadas (Fecha_Registro) dentro de esas fechas.
    getCanalesOrigen: async (req, res) => {
        const { id_clinica, fecha_inicio, fecha_fin } = req.query;
        const hayRango = !!(fecha_inicio && fecha_fin);
        try {
            const pool = await getConnection();
            const request = pool.request().input('id_cli', sql.Int, id_clinica);
            if (hayRango) request.input('fIn', sql.Date, fecha_inicio).input('fOut', sql.Date, fecha_fin);

            const result = await request.query(`
                SELECT
                    CASE WHEN Asunto = 'WhatsApp' THEN 'WhatsApp (Bot)' ELSE 'Registro Manual' END as Canal,
                    COUNT(*) as Total
                FROM Citas
                WHERE ID_Clinica = @id_cli
                  ${hayRango ? 'AND CAST(Fecha_Registro AS DATE) BETWEEN @fIn AND @fOut' : ''}
                GROUP BY CASE WHEN Asunto = 'WhatsApp' THEN 'WhatsApp (Bot)' ELSE 'Registro Manual' END
            `);
            res.json({ status: 'OK', canales: result.recordset, rango_aplicado: hayRango ? { fecha_inicio, fecha_fin } : null });
        } catch (error) {
            console.error('🔴 Error CRM Canales:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al calcular canales de origen', dev_info: error.message });
        }
    },

    // --- 4. DEMOGRAFÍA: para saber hacia dónde dirigir la publicidad ---
    getDemografia: async (req, res) => {
        const { id_clinica } = req.query;
        try {
            const pool = await getConnection();
            const reqBase = () => pool.request().input('id_cli', sql.Int, id_clinica);

            const [genero, edad, ubicacion] = await Promise.all([
                reqBase().query(`
                    SELECT ISNULL(Genero, 'No especificado') as Genero, COUNT(*) as Total
                    FROM Pacientes WHERE ID_Clinica = @id_cli AND Activo = 1
                    GROUP BY Genero
                `),
                reqBase().query(`
                    SELECT
                        CASE
                            WHEN Fecha_Nacimiento IS NULL THEN 'No especificado'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) < 18 THEN 'Menor de 18'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) BETWEEN 18 AND 30 THEN '18 a 30'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) BETWEEN 31 AND 45 THEN '31 a 45'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) BETWEEN 46 AND 60 THEN '46 a 60'
                            ELSE 'Mayor de 60'
                        END as Rango_Edad,
                        COUNT(*) as Total
                    FROM Pacientes WHERE ID_Clinica = @id_cli AND Activo = 1
                    GROUP BY
                        CASE
                            WHEN Fecha_Nacimiento IS NULL THEN 'No especificado'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) < 18 THEN 'Menor de 18'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) BETWEEN 18 AND 30 THEN '18 a 30'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) BETWEEN 31 AND 45 THEN '31 a 45'
                            WHEN DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) BETWEEN 46 AND 60 THEN '46 a 60'
                            ELSE 'Mayor de 60'
                        END
                `),
                reqBase().query(`
                    SELECT TOP 10 ISNULL(Canton_Residencia, 'No especificado') as Canton, COUNT(*) as Total
                    FROM Pacientes WHERE ID_Clinica = @id_cli AND Activo = 1
                    GROUP BY Canton_Residencia
                    ORDER BY Total DESC
                `)
            ]);

            res.json({
                status: 'OK',
                por_genero: genero.recordset,
                por_edad: edad.recordset,
                por_canton: ubicacion.recordset
            });
        } catch (error) {
            console.error('🔴 Error CRM Demografía:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al calcular demografía', dev_info: error.message });
        }
    },

    // --- 4b. PATOLOGÍAS MÁS FRECUENTES POR ZONA (útil para estadística de salud pública / MSP) ---
    // Combina los códigos CIE10 que ya se registran en Recetas y en Tratamientos_Plan (según qué
    // módulo use cada clínica), cruzados con el cantón de residencia del paciente. No agrega nada
    // nuevo: solo lee CIE10_Cod/CIE10_Texto y CIE_Cod/CIE_Texto que ya existían.
    getPatologiasPorZona: async (req, res) => {
        const { id_clinica } = req.query;
        try {
            const pool = await getConnection();

            const [porPatologia, porCanton] = await Promise.all([
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    WITH Diagnosticos AS (
                        SELECT R.CIE10_Cod as Cod, R.CIE10_Texto as Texto, P.Canton_Residencia
                        FROM Recetas R INNER JOIN Pacientes P ON R.ID_Paciente = P.ID_Paciente
                        WHERE P.ID_Clinica = @id_cli AND R.CIE10_Cod IS NOT NULL AND R.CIE10_Cod != ''
                        UNION ALL
                        SELECT TP.CIE_Cod as Cod, TP.CIE_Texto as Texto, P.Canton_Residencia
                        FROM Tratamientos_Plan TP INNER JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                        WHERE P.ID_Clinica = @id_cli AND TP.CIE_Cod IS NOT NULL AND TP.CIE_Cod != ''
                    )
                    SELECT TOP 10 Cod, Texto, COUNT(*) as Total
                    FROM Diagnosticos
                    GROUP BY Cod, Texto
                    ORDER BY Total DESC
                `),
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    WITH Diagnosticos AS (
                        SELECT R.CIE10_Cod as Cod, R.CIE10_Texto as Texto, P.Canton_Residencia
                        FROM Recetas R INNER JOIN Pacientes P ON R.ID_Paciente = P.ID_Paciente
                        WHERE P.ID_Clinica = @id_cli AND R.CIE10_Cod IS NOT NULL AND R.CIE10_Cod != ''
                        UNION ALL
                        SELECT TP.CIE_Cod as Cod, TP.CIE_Texto as Texto, P.Canton_Residencia
                        FROM Tratamientos_Plan TP INNER JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                        WHERE P.ID_Clinica = @id_cli AND TP.CIE_Cod IS NOT NULL AND TP.CIE_Cod != ''
                    )
                    SELECT ISNULL(Canton_Residencia, 'No especificado') as Canton, Texto as Patologia, COUNT(*) as Total
                    FROM Diagnosticos
                    GROUP BY Canton_Residencia, Texto
                    ORDER BY Canton_Residencia, Total DESC
                `)
            ]);

            res.json({
                status: 'OK',
                top_patologias: porPatologia.recordset,
                patologias_por_canton: porCanton.recordset
            });
        } catch (error) {
            console.error('🔴 Error CRM Patologías por Zona:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al calcular patologías por zona', dev_info: error.message });
        }
    },

    // --- 5. RETENCIÓN POR MÉDICO: qué % de los pacientes de cada doctor vuelven ---
    // Complementa el ranking financiero de kpiController (ahí se ve ingresos/citas; acá, fidelización).
    getRetencionPorMedico: async (req, res) => {
        const { id_clinica } = req.query;
        try {
            const pool = await getConnection();
            const result = await pool.request().input('id_cli', sql.Int, id_clinica).query(`
                WITH VisitasPorMedicoYPaciente AS (
                    SELECT C.ID_Doctor, C.ID_Paciente, COUNT(*) as Visitas
                    FROM Citas C
                    WHERE C.ID_Clinica = @id_cli AND C.Estado IN (${ESTADOS_ATENDIDA})
                    GROUP BY C.ID_Doctor, C.ID_Paciente
                )
                SELECT
                    U.ID_Usuario,
                    (U.Nombres + ' ' + U.Apellidos) as Doctor,
                    COUNT(*) as Pacientes_Totales,
                    SUM(CASE WHEN V.Visitas >= 2 THEN 1 ELSE 0 END) as Pacientes_Recurrentes,
                    CASE WHEN COUNT(*) > 0
                        THEN CAST(SUM(CASE WHEN V.Visitas >= 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,1))
                        ELSE 0 END as Tasa_Retencion
                FROM VisitasPorMedicoYPaciente V
                INNER JOIN Usuarios U ON V.ID_Doctor = U.ID_Usuario
                WHERE U.Activo = 1
                GROUP BY U.ID_Usuario, U.Nombres, U.Apellidos
                ORDER BY Tasa_Retencion DESC
            `);
            res.json({ status: 'OK', medicos: result.recordset });
        } catch (error) {
            console.error('🔴 Error CRM Retención Médicos:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al calcular retención por médico', dev_info: error.message });
        }
    },

    // --- 6. LISTADO DE PACIENTES ENRIQUECIDO (buscador CRM: recurrencia, LTV, última visita, canal, VIP) ---
    // VIP = gasta bastante más que el promedio de la clínica, o es muy recurrente (>= 6 visitas
    // atendidas) aunque gaste poco — cubre tanto al paciente de alto ticket como al fiel de siempre.
    getPacientes: async (req, res) => {
        const { id_clinica, busqueda } = req.query;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_cli', sql.Int, id_clinica)
                .input('bus', `%${busqueda || ''}%`)
                .query(`
                    WITH GastoPromedio AS (
                        SELECT ISNULL(AVG(TotalPorPaciente), 0) as Promedio
                        FROM (
                            SELECT PG.ID_Paciente, SUM(PG.Monto) as TotalPorPaciente
                            FROM Pagos PG WHERE PG.ID_Clinica = @id_cli
                            GROUP BY PG.ID_Paciente
                        ) x
                    )
                    SELECT
                        P.ID_Paciente, P.Nombres, P.Apellidos, P.Telefono, P.Email, P.Fecha_Nacimiento,
                        ISNULL(V.Total_Visitas, 0) as Total_Visitas,
                        V.Ultima_Visita,
                        ISNULL(G.Total_Gastado, 0) as Total_Gastado,
                        CASE WHEN EXISTS (
                            SELECT 1 FROM Citas C2 WHERE C2.ID_Paciente = P.ID_Paciente AND C2.Asunto = 'WhatsApp'
                        ) THEN 'WhatsApp (Bot)' ELSE 'Registro Manual' END as Canal_Origen,
                        CASE WHEN
                            ISNULL(G.Total_Gastado, 0) >= 1.5 * (SELECT Promedio FROM GastoPromedio) AND ISNULL(G.Total_Gastado, 0) > 0
                            OR ISNULL(V.Total_Visitas, 0) >= 6
                        THEN 1 ELSE 0 END as Es_VIP
                    FROM Pacientes P
                    LEFT JOIN (
                        SELECT ID_Paciente, COUNT(*) as Total_Visitas, MAX(Fecha_Cita) as Ultima_Visita
                        FROM Citas WHERE Estado IN (${ESTADOS_ATENDIDA})
                        GROUP BY ID_Paciente
                    ) V ON V.ID_Paciente = P.ID_Paciente
                    LEFT JOIN (
                        SELECT ID_Paciente, SUM(Monto) as Total_Gastado
                        FROM Pagos GROUP BY ID_Paciente
                    ) G ON G.ID_Paciente = P.ID_Paciente
                    WHERE P.ID_Clinica = @id_cli AND P.Activo = 1
                      AND (P.Nombres LIKE @bus OR P.Apellidos LIKE @bus OR P.DNI LIKE @bus)
                    ORDER BY Es_VIP DESC, Total_Gastado DESC
                `);
            res.json({ status: 'OK', pacientes: result.recordset });
        } catch (error) {
            console.error('🔴 Error CRM Pacientes:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al listar pacientes', dev_info: error.message });
        }
    },

    // --- 6b. DETALLE DE UN PACIENTE PARA EL MODAL DEL CRM ---
    getPacienteDetalle: async (req, res) => {
        const { id } = req.params;
        try {
            const pool = await getConnection();
            const reqId = () => pool.request().input('id', sql.Int, id);

            const [datos, tratamientos, citas, medicoFrecuente] = await Promise.all([
                reqId().query(`
                    SELECT P.*, ISNULL(G.Total_Gastado, 0) as Total_Gastado, ISNULL(D.Saldo_Pendiente, 0) as Saldo_Pendiente
                    FROM Pacientes P
                    LEFT JOIN (SELECT ID_Paciente, SUM(Monto) as Total_Gastado FROM Pagos GROUP BY ID_Paciente) G ON G.ID_Paciente = P.ID_Paciente
                    LEFT JOIN (SELECT ID_Paciente, SUM(Saldo_Pendiente) as Saldo_Pendiente FROM Tratamientos_Plan GROUP BY ID_Paciente) D ON D.ID_Paciente = P.ID_Paciente
                    WHERE P.ID_Paciente = @id
                `),
                reqId().query(`
                    SELECT TOP 5 TP.Nombre_Tratamiento, TP.Costo_Total, TP.Estado_Tratamiento, TP.Fecha_Inicio,
                           (U.Nombres + ' ' + U.Apellidos) as Doctor
                    FROM Tratamientos_Plan TP
                    LEFT JOIN Usuarios U ON TP.ID_Medico = U.ID_Usuario
                    WHERE TP.ID_Paciente = @id
                    ORDER BY TP.Fecha_Inicio DESC
                `),
                reqId().query(`
                    SELECT TOP 5 C.Fecha_Cita, LEFT(CAST(C.Hora_Inicio AS VARCHAR), 5) as Hora, C.Estado,
                           (U.Nombres + ' ' + U.Apellidos) as Doctor
                    FROM Citas C
                    LEFT JOIN Usuarios U ON C.ID_Doctor = U.ID_Usuario
                    WHERE C.ID_Paciente = @id
                    ORDER BY C.Fecha_Cita DESC
                `),
                reqId().query(`
                    SELECT TOP 1 U.ID_Usuario, (U.Nombres + ' ' + U.Apellidos) as Doctor, COUNT(*) as Veces
                    FROM Citas C INNER JOIN Usuarios U ON C.ID_Doctor = U.ID_Usuario
                    WHERE C.ID_Paciente = @id AND C.Estado IN (${ESTADOS_ATENDIDA})
                    GROUP BY U.ID_Usuario, U.Nombres, U.Apellidos
                    ORDER BY COUNT(*) DESC
                `)
            ]);

            if (datos.recordset.length === 0) {
                return res.status(404).json({ status: 'Error', message: 'Paciente no encontrado.' });
            }

            res.json({
                status: 'OK',
                paciente: datos.recordset[0],
                tratamientos: tratamientos.recordset,
                citas: citas.recordset,
                doctor_frecuente: medicoFrecuente.recordset[0] || null
            });
        } catch (error) {
            console.error('🔴 Error CRM Detalle Paciente:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al cargar el detalle del paciente', dev_info: error.message });
        }
    },

    // --- 6c. ENVÍO DE MENSAJE MANUAL (acción libre desde el modal) — WhatsApp, correo, o ambos ---
    enviarMensajeManual: async (req, res) => {
        const { id_paciente, mensaje, canal, asunto_email } = req.body; // canal: 'whatsapp' | 'email' | 'ambos'
        if (!mensaje || !mensaje.trim()) {
            return res.status(400).json({ status: 'Error', message: 'El mensaje no puede estar vacío.' });
        }
        const canalFinal = ['whatsapp', 'email', 'ambos'].includes(canal) ? canal : 'whatsapp';

        try {
            const pool = await getConnection();
            const resPac = await pool.request().input('id', sql.Int, id_paciente).query(`
                SELECT P.Telefono, P.Email, CL.Nombre_Clinica
                FROM Pacientes P INNER JOIN Clinicas CL ON P.ID_Clinica = CL.ID_Clinica
                WHERE P.ID_Paciente = @id
            `);
            if (resPac.recordset.length === 0) {
                return res.status(404).json({ status: 'Error', message: 'Paciente no encontrado.' });
            }
            const p = resPac.recordset[0];
            let enviadoWa = false, enviadoMail = false;

            if ((canalFinal === 'whatsapp' || canalFinal === 'ambos') && p.Telefono) {
                const { enviarMensaje } = require('../services/whatsappService');
                const envio = await enviarMensaje(p.Telefono, mensaje.trim());
                enviadoWa = envio.success;
            }

            if ((canalFinal === 'email' || canalFinal === 'ambos') && p.Email) {
                const nodemailer = require('nodemailer');
                const { construirEmailHTML } = require('../services/emailTemplates');
                const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } });
                await transporter.sendMail({
                    from: `"${p.Nombre_Clinica}" <${process.env.MAIL_USER}>`,
                    to: p.Email,
                    subject: asunto_email || `Un mensaje de ${p.Nombre_Clinica}`,
                    text: mensaje.trim(),
                    html: construirEmailHTML(p.Nombre_Clinica, mensaje.trim())
                });
                enviadoMail = true;
            }

            const enviado = enviadoWa || enviadoMail;
            res.json({ status: enviado ? 'OK' : 'Error', enviado, enviadoWa, enviadoMail, message: enviado ? undefined : 'El paciente no tiene ese dato de contacto registrado.' });
        } catch (error) {
            console.error('🔴 Error CRM Mensaje Manual:', error.message);
            res.status(500).json({ status: 'Error', message: 'No se pudo enviar el mensaje.', dev_info: error.message });
        }
    },

    // --- 7. CUMPLEAÑEROS (hoy o próximos N días) ---
    getCumpleanieros: async (req, res) => {
        const { id_clinica } = req.query;
        const dias = parseInt(req.query.dias) || 0;
        try {
            const pool = await getConnection();
            // OJO: DATEFROMPARTS(año, 2, 29) truena con "Cannot construct data type date"
            // en cualquier año no bisiesto — con un paciente nacido el 29 de febrero esta
            // consulta rompía para TODA la clínica (era una sola query agregada, sin
            // aislamiento por fila). Se resuelve calculando el cumpleaños "de este año" y
            // "del próximo año" con el día recortado al último día válido del mes (EOMONTH),
            // igual que hacen los calendarios reales (29-feb se celebra el 28 en año no bisiesto).
            const result = await pool.request().input('id_cli', sql.Int, id_clinica).query(`
                SELECT P.ID_Paciente, P.Nombres, P.Apellidos, P.Telefono, P.Email, P.Fecha_Nacimiento
                FROM Pacientes P
                CROSS APPLY (
                    SELECT
                        DiaEsteAnio = CASE
                            WHEN DAY(P.Fecha_Nacimiento) > DAY(EOMONTH(DATEFROMPARTS(YEAR(GETDATE()), MONTH(P.Fecha_Nacimiento), 1)))
                            THEN DAY(EOMONTH(DATEFROMPARTS(YEAR(GETDATE()), MONTH(P.Fecha_Nacimiento), 1)))
                            ELSE DAY(P.Fecha_Nacimiento)
                        END,
                        DiaAnioSiguiente = CASE
                            WHEN DAY(P.Fecha_Nacimiento) > DAY(EOMONTH(DATEFROMPARTS(YEAR(GETDATE()) + 1, MONTH(P.Fecha_Nacimiento), 1)))
                            THEN DAY(EOMONTH(DATEFROMPARTS(YEAR(GETDATE()) + 1, MONTH(P.Fecha_Nacimiento), 1)))
                            ELSE DAY(P.Fecha_Nacimiento)
                        END
                ) D
                CROSS APPLY (
                    SELECT ProximoCumple = CASE
                        WHEN DATEFROMPARTS(YEAR(GETDATE()), MONTH(P.Fecha_Nacimiento), D.DiaEsteAnio) >= CAST(GETDATE() AS DATE)
                        THEN DATEFROMPARTS(YEAR(GETDATE()), MONTH(P.Fecha_Nacimiento), D.DiaEsteAnio)
                        ELSE DATEFROMPARTS(YEAR(GETDATE()) + 1, MONTH(P.Fecha_Nacimiento), D.DiaAnioSiguiente)
                    END
                ) PC
                WHERE P.ID_Clinica = @id_cli AND P.Activo = 1 AND P.Fecha_Nacimiento IS NOT NULL
                  AND DATEDIFF(DAY, CAST(GETDATE() AS DATE), PC.ProximoCumple) BETWEEN 0 AND ${Math.max(0, dias)}
                ORDER BY MONTH(P.Fecha_Nacimiento), DAY(P.Fecha_Nacimiento)
            `);
            res.json({ status: 'OK', pacientes: result.recordset });
        } catch (error) {
            console.error('🔴 Error CRM Cumpleañeros:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al buscar cumpleañeros', dev_info: error.message });
        }
    },

    // --- 8. ENVÍO MANUAL DE FELICITACIÓN (un paciente puntual, desde el panel) ---
    enviarFelicitacionManual: async (req, res) => {
        const { id_paciente } = req.body;
        try {
            const pool = await getConnection();
            const resPac = await pool.request().input('id', sql.Int, id_paciente).query(`
                SELECT P.Nombres, P.Telefono, P.Email, CL.Nombre_Clinica
                FROM Pacientes P INNER JOIN Clinicas CL ON P.ID_Clinica = CL.ID_Clinica
                WHERE P.ID_Paciente = @id
            `);
            if (resPac.recordset.length === 0) {
                return res.status(404).json({ status: 'Error', message: 'Paciente no encontrado.' });
            }
            const paciente = resPac.recordset[0];
            const crmService = require('../services/crmService');
            const resultado = await crmService.enviarFelicitacionCumpleanos(paciente);
            res.json({ status: 'OK', resultado });
        } catch (error) {
            console.error('🔴 Error enviando felicitación manual:', error.message);
            res.status(500).json({ status: 'Error', message: 'No se pudo enviar la felicitación.', dev_info: error.message });
        }
    },

    // --- 9. SEGMENTACIÓN DE PACIENTES PARA CAMPAÑAS/DESCUENTOS ---
    // Filtros combinables: vip, recurrente, inactivo_meses (sin visitas atendidas hace X meses o
    // nunca), canton, edad_min/edad_max, cumple_mes (cumpleaños en el mes actual). El frontend
    // arma el segmento, lo muestra con checkbox por paciente, y el usuario decide a quién de esa
    // lista realmente enviarle (no se envía a nadie desde acá, solo se calcula quién califica).
    getSegmentoPacientes: async (req, res) => {
        const { id_clinica, vip, recurrente, inactivo_meses, canton, edad_min, edad_max, cumple_mes, con_saldo, meses_sin_tratamiento } = req.query;
        try {
            const pool = await getConnection();
            const request = pool.request().input('id_cli', sql.Int, id_clinica);

            // No exigimos teléfono acá: la campaña puede ser solo por correo. enviarCampana()
            // se encarga de saltar al paciente si le falta el dato del canal elegido.
            let condiciones = ['P.ID_Clinica = @id_cli', 'P.Activo = 1', "(P.Telefono IS NOT NULL OR P.Email IS NOT NULL)"];

            if (canton) { request.input('canton', canton); condiciones.push('P.Canton_Residencia = @canton'); }
            if (edad_min) { request.input('edadMin', sql.Int, parseInt(edad_min)); condiciones.push('DATEDIFF(YEAR, P.Fecha_Nacimiento, GETDATE()) >= @edadMin'); }
            if (edad_max) { request.input('edadMax', sql.Int, parseInt(edad_max)); condiciones.push('DATEDIFF(YEAR, P.Fecha_Nacimiento, GETDATE()) <= @edadMax'); }
            if (cumple_mes === '1') condiciones.push('MONTH(P.Fecha_Nacimiento) = MONTH(GETDATE())');
            if (inactivo_meses) { request.input('meses', sql.Int, parseInt(inactivo_meses)); }
            if (meses_sin_tratamiento) { request.input('mesesTrat', sql.Int, parseInt(meses_sin_tratamiento)); }

            const result = await request.query(`
                WITH VisitasPorPaciente AS (
                    SELECT ID_Paciente, COUNT(*) as Visitas, MAX(Fecha_Cita) as Ultima_Visita
                    FROM Citas WHERE Estado IN (${ESTADOS_ATENDIDA})
                    GROUP BY ID_Paciente
                ),
                GastoPromedio AS (
                    SELECT ISNULL(AVG(TotalPorPaciente), 0) as Promedio
                    FROM (SELECT ID_Paciente, SUM(Monto) as TotalPorPaciente FROM Pagos WHERE ID_Clinica = @id_cli GROUP BY ID_Paciente) x
                ),
                GastoPorPaciente AS (
                    SELECT ID_Paciente, SUM(Monto) as Total_Gastado FROM Pagos GROUP BY ID_Paciente
                ),
                TratamientosPorPaciente AS (
                    SELECT ID_Paciente, SUM(Saldo_Pendiente) as Saldo_Pendiente, MAX(Fecha_Inicio) as Ultimo_Tratamiento
                    FROM Tratamientos_Plan GROUP BY ID_Paciente
                )
                SELECT
                    P.ID_Paciente, P.Nombres, P.Apellidos, P.Telefono, P.Email,
                    ISNULL(V.Visitas, 0) as Total_Visitas, V.Ultima_Visita,
                    ISNULL(G.Total_Gastado, 0) as Total_Gastado,
                    ISNULL(T.Saldo_Pendiente, 0) as Saldo_Pendiente,
                    T.Ultimo_Tratamiento,
                    CASE WHEN (ISNULL(G.Total_Gastado, 0) >= 1.5 * (SELECT Promedio FROM GastoPromedio) AND ISNULL(G.Total_Gastado, 0) > 0) OR ISNULL(V.Visitas, 0) >= 6 THEN 1 ELSE 0 END as Es_VIP
                FROM Pacientes P
                LEFT JOIN VisitasPorPaciente V ON V.ID_Paciente = P.ID_Paciente
                LEFT JOIN GastoPorPaciente G ON G.ID_Paciente = P.ID_Paciente
                LEFT JOIN TratamientosPorPaciente T ON T.ID_Paciente = P.ID_Paciente
                WHERE ${condiciones.join(' AND ')}
                ${vip === '1' ? `AND (CASE WHEN (ISNULL(G.Total_Gastado, 0) >= 1.5 * (SELECT Promedio FROM GastoPromedio) AND ISNULL(G.Total_Gastado, 0) > 0) OR ISNULL(V.Visitas, 0) >= 6 THEN 1 ELSE 0 END) = 1` : ''}
                ${recurrente === '1' ? 'AND ISNULL(V.Visitas, 0) >= 2' : ''}
                ${inactivo_meses ? 'AND (V.Ultima_Visita IS NULL OR V.Ultima_Visita <= DATEADD(MONTH, -@meses, GETDATE()))' : ''}
                ${con_saldo === '1' ? 'AND ISNULL(T.Saldo_Pendiente, 0) > 0' : ''}
                ${meses_sin_tratamiento ? 'AND (T.Ultimo_Tratamiento IS NULL OR T.Ultimo_Tratamiento <= DATEADD(MONTH, -@mesesTrat, GETDATE()))' : ''}
                ORDER BY P.Nombres
            `);

            res.json({ status: 'OK', pacientes: result.recordset, total: result.recordset.length });
        } catch (error) {
            console.error('🔴 Error CRM Segmento:', error.message);
            res.status(500).json({ status: 'Error', message: 'Error al calcular el segmento', dev_info: error.message });
        }
    },

    // --- 10. ENVÍO DE CAMPAÑA / DESCUENTO A UNA LISTA DE PACIENTES ELEGIDOS A MANO ---
    // Responde de inmediato y procesa el envío en segundo plano (con pausa entre mensajes, igual
    // que el resto de envíos masivos del sistema) porque mandarle a muchos pacientes puede tardar
    // varios minutos — no tiene sentido dejar la petición HTTP colgada todo ese tiempo.
    enviarCampana: async (req, res) => {
        const { id_pacientes, mensaje, canal, asunto_email } = req.body; // canal: 'whatsapp' | 'email' | 'ambos'
        if (!Array.isArray(id_pacientes) || id_pacientes.length === 0) {
            return res.status(400).json({ status: 'Error', message: 'No se seleccionó ningún paciente.' });
        }
        if (!mensaje || !mensaje.trim()) {
            return res.status(400).json({ status: 'Error', message: 'El mensaje no puede estar vacío.' });
        }
        const canalFinal = ['whatsapp', 'email', 'ambos'].includes(canal) ? canal : 'whatsapp';

        const campaignId = `camp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        campanasEnCurso[campaignId] = { enviados: 0, fallidos: 0, total: id_pacientes.length, completada: false };

        res.json({ status: 'OK', campaignId, message: `Campaña iniciada para ${id_pacientes.length} paciente(s) por ${canalFinal}.` });

        // --- Procesamiento en segundo plano (no bloquea la respuesta ya enviada) ---
        (async () => {
            const delay = (ms) => new Promise((r) => setTimeout(r, ms));
            const { enviarMensaje } = require('../services/whatsappService');
            const nodemailer = require('nodemailer');
            const transporter = (canalFinal === 'email' || canalFinal === 'ambos')
                ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } })
                : null;

            const pool = await getConnection();
            let enviadosWa = 0, enviadosMail = 0, fallidos = 0;
            const progreso = campanasEnCurso[campaignId];

            for (const idPaciente of id_pacientes) {
                try {
                    const resPac = await pool.request().input('id', sql.Int, idPaciente).query(`
                        SELECT P.Nombres, P.Telefono, P.Email, CL.Nombre_Clinica
                        FROM Pacientes P INNER JOIN Clinicas CL ON P.ID_Clinica = CL.ID_Clinica
                        WHERE P.ID_Paciente = @id
                    `);
                    const p = resPac.recordset[0];
                    if (!p) { fallidos++; continue; }

                    const primerNombre = (p.Nombres || '').split(' ')[0];
                    const mensajePersonalizado = mensaje.trim().replace(/\{nombre\}/gi, primerNombre);
                    let algoEnviado = false;

                    if ((canalFinal === 'whatsapp' || canalFinal === 'ambos') && p.Telefono) {
                        const envio = await enviarMensaje(p.Telefono, mensajePersonalizado);
                        if (envio.success) { enviadosWa++; algoEnviado = true; }
                    }

                    if ((canalFinal === 'email' || canalFinal === 'ambos') && p.Email && transporter) {
                        const { construirEmailHTML } = require('../services/emailTemplates');
                        await transporter.sendMail({
                            from: `"${p.Nombre_Clinica}" <${process.env.MAIL_USER}>`,
                            to: p.Email,
                            subject: asunto_email || `Un mensaje de ${p.Nombre_Clinica}`,
                            text: mensajePersonalizado,
                            html: construirEmailHTML(p.Nombre_Clinica, mensajePersonalizado)
                        });
                        enviadosMail++; algoEnviado = true;
                    }

                    if (!algoEnviado) fallidos++;
                } catch (e) {
                    fallidos++;
                }
                progreso.enviados = enviadosWa + enviadosMail;
                progreso.fallidos = fallidos;
                await delay(3000); // misma pausa de seguridad que usan los otros envíos masivos por WhatsApp
            }
            progreso.completada = true;
            console.log(`📣 [CRM Campaña]: Finalizada. WhatsApp: ${enviadosWa}, Email: ${enviadosMail}, Fallidos: ${fallidos}, Total: ${id_pacientes.length}`);
            // Limpieza: no acumular campañas viejas en memoria para siempre.
            setTimeout(() => { delete campanasEnCurso[campaignId]; }, 10 * 60 * 1000);
        })();
    },

    // --- 11. ESTADO DE UNA CAMPAÑA EN CURSO (para la barra de progreso del frontend) ---
    getEstadoCampana: (req, res) => {
        const progreso = campanasEnCurso[req.params.id];
        if (!progreso) return res.status(404).json({ status: 'Error', message: 'Campaña no encontrada (puede que ya haya terminado hace rato).' });
        res.json({ status: 'OK', ...progreso });
    }
};

module.exports = crmController;
