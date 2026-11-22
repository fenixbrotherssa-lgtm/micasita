// =====================================================================
//  CERTIFICADOS MÉDICOS (reposo, constancia de atención, certificado de salud)
//  con firma electrónica opcional: de la clínica o personal del médico.
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getConnection, sql } = require('../config/db');
const firmaSrv = require('../services/firmaElectronicaService');
const { fechaLarga } = require('../services/certificadoPdfService');
const docs = require('../services/documentosFirmaService');

const DIR_CERTIFICADOS = () => path.join(process.cwd(), 'uploads', 'certificados');
const TIPOS = ['REPOSO', 'ASISTENCIA', 'SALUD'];
const FIRMAS = ['CLINICA', 'MEDICO', 'NINGUNA'];

const numeroCertificado = (id) => `CM-${String(id).padStart(6, '0')}`;
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const esHora = v => !v || /^\d{2}:\d{2}$/.test(String(v));
const txt = (v, max) => { const s = String(v == null ? '' : v).trim(); return s ? s.slice(0, max) : null; };
const esAdmin = (req) => Number(req.usuarioAuth?.id_rol) === 1;

function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Base pública para el QR: la que manda la app (PUBLIC_DOMAIN) o la del propio servidor. */
function basePublica(req) {
    const enviada = String(req.body?.url_publica || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
    if (/^https?:\/\/[^\s/]+/i.test(enviada)) return enviada;
    return `${req.protocol}://${req.get('host')}`;
}

// ---------------------------------------------------------------------
// GET /api/certificados/medicos — médicos activos con datos para el certificado
// ---------------------------------------------------------------------
const listarMedicos = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().query(`
            SELECT U.ID_Usuario, U.Nombres, U.Apellidos, U.Cedula, U.Registro_Sanitario, U.Especialidad,
                   CASE WHEN EXISTS (SELECT 1 FROM Usuarios_Firma_Electronica F
                                     WHERE F.ID_Usuario = U.ID_Usuario AND F.Activo = 1
                                       AND (F.Fecha_Vencimiento IS NULL OR F.Fecha_Vencimiento > GETDATE()))
                        THEN 1 ELSE 0 END AS Tiene_Firma
            FROM Usuarios U
            WHERE U.Activo = 1 AND U.ID_Rol = 3
            ORDER BY U.Apellidos, U.Nombres`);
        res.json(r.recordset);
    } catch (error) {
        console.error('❌ listarMedicos (certificados):', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar la lista de médicos.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/certificados/firmas/estado?id_medico=
// ---------------------------------------------------------------------
const estadoFirmas = async (req, res) => {
    try {
        const pool = await getConnection();
        const idMedico = parseInt(req.query.id_medico, 10) || null;
        res.json(await firmaSrv.estadoFirmas(pool, req.usuarioAuth.id_clinica, idMedico));
    } catch (error) {
        console.error('❌ estadoFirmas:', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo consultar las firmas electrónicas.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/certificados/firmas/medico  (multipart: p12, password, id_medico)
// Cada médico sube la suya; el administrador puede subirla por cualquier médico.
// ---------------------------------------------------------------------
const subirFirmaMedico = async (req, res) => {
    try {
        const idMedico = parseInt(req.body.id_medico, 10);
        if (!idMedico) return res.status(400).json({ status: 'Error', message: 'Falta el médico.' });
        if (!esAdmin(req) && Number(req.usuarioAuth.id_usuario) !== idMedico) {
            return res.status(403).json({ status: 'Error', message: 'Solo el propio médico o un administrador puede cargar esta firma.' });
        }
        if (!req.file || !req.file.buffer) return res.status(400).json({ status: 'Error', message: 'Seleccione el archivo .p12 de la firma electrónica.' });
        if (!req.body.password) return res.status(400).json({ status: 'Error', message: 'Ingrese la contraseña de la firma electrónica.' });

        const pool = await getConnection();
        const info = await firmaSrv.guardarFirmaMedico(pool, idMedico, req.file.buffer, String(req.body.password));
        res.json({
            status: 'Success',
            message: `Firma de ${info.titular} cargada. Vence el ${info.vence.toLocaleDateString('es-EC')}.`,
            titular: info.titular, emisor: info.emisor, vence: info.vence
        });
    } catch (error) {
        // Errores de validación del .p12 llevan mensaje claro para el usuario
        res.status(400).json({ status: 'Error', message: error.message });
    }
};

// DELETE /api/certificados/firmas/medico/:id
const eliminarFirmaMedico = async (req, res) => {
    try {
        const idMedico = parseInt(req.params.id, 10);
        if (!esAdmin(req) && Number(req.usuarioAuth.id_usuario) !== idMedico) {
            return res.status(403).json({ status: 'Error', message: 'Solo el propio médico o un administrador puede quitar esta firma.' });
        }
        const pool = await getConnection();
        await firmaSrv.eliminarFirmaMedico(pool, idMedico);
        res.json({ status: 'Success', message: 'Firma electrónica del médico eliminada.' });
    } catch (error) {
        console.error('❌ eliminarFirmaMedico:', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo eliminar la firma.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/certificados — emite el certificado (genera, firma y guarda el PDF)
// ---------------------------------------------------------------------
const emitirCertificado = async (req, res) => {
    const b = req.body || {};
    try {
        const tipo = String(b.tipo || '').toUpperCase();
        const firmaPref = String(b.firma || 'NINGUNA').toUpperCase();
        const idPaciente = parseInt(b.id_paciente, 10);
        const idMedico = parseInt(b.id_medico, 10);
        const idClinica = parseInt(req.usuarioAuth.id_clinica, 10);

        // ── Validaciones ──
        if (!TIPOS.includes(tipo)) return res.status(400).json({ status: 'Error', message: 'Tipo de certificado no válido.' });
        if (!FIRMAS.includes(firmaPref)) return res.status(400).json({ status: 'Error', message: 'Opción de firma no válida.' });
        if (!idPaciente || !idMedico) return res.status(400).json({ status: 'Error', message: 'Faltan el paciente o el médico.' });
        if (!esFecha(b.fecha_atencion)) return res.status(400).json({ status: 'Error', message: 'Indique la fecha de atención.' });
        if (!esHora(b.hora_entrada) || !esHora(b.hora_salida)) return res.status(400).json({ status: 'Error', message: 'Hora no válida (use HH:MM).' });

        let dias = null, desde = null, hasta = null;
        if (tipo === 'REPOSO') {
            dias = parseInt(b.dias_reposo, 10);
            if (!dias || dias < 1 || dias > 365) return res.status(400).json({ status: 'Error', message: 'Indique los días de reposo (1 a 365).' });
            if (!esFecha(b.reposo_desde)) return res.status(400).json({ status: 'Error', message: 'Indique desde qué fecha rige el reposo.' });
            desde = b.reposo_desde;
            const h = new Date(desde + 'T12:00:00');
            h.setDate(h.getDate() + dias - 1);
            hasta = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
        }

        const pool = await getConnection();

        // ── Datos del paciente, médico y clínica ──
        const [rp, rm, rc] = await Promise.all([
            pool.request().input('id', sql.Int, idPaciente).query(`
                SELECT ID_Paciente, Nombres, Apellidos, DNI, Fecha_Nacimiento, Genero, Ocupacion,
                       ISNULL(Historial_Clinico_General, 'HC-' + RIGHT('000000' + CAST(ID_Paciente AS VARCHAR(10)), 6)) AS Historia_Clinica
                FROM Pacientes WHERE ID_Paciente = @id`),
            pool.request().input('id', sql.Int, idMedico).query(`
                SELECT ID_Usuario, Nombres, Apellidos, Cedula, Registro_Sanitario, Especialidad
                FROM Usuarios WHERE ID_Usuario = @id AND Activo = 1`),
            pool.request().input('id', sql.Int, idClinica).query(`
                SELECT Nombre_Clinica, RUC, Direccion, Telefono, Ciudad, Logo_Ruta FROM Clinicas WHERE ID_Clinica = @id`)
        ]);
        const pac = rp.recordset[0], med = rm.recordset[0], cli = rc.recordset[0] || {};
        if (!pac) return res.status(404).json({ status: 'Error', message: 'Paciente no encontrado.' });
        if (!med) return res.status(404).json({ status: 'Error', message: 'Médico no encontrado o inactivo.' });

        // ── Firma: se valida ANTES de grabar nada ──
        // CLINICA se abre ya; MEDICO solo se comprueba que exista (el PIN lo escribe el médico).
        const yoSoyElMedico = Number(req.usuarioAuth.id_usuario) === idMedico;
        try {
            if (firmaPref === 'CLINICA') await firmaSrv.resolverFirma(pool, 'CLINICA', idClinica, idMedico);
            if (firmaPref === 'MEDICO') {
                const fm = await firmaSrv.datosFirmaMedico(pool, idMedico);
                if (!fm) throw new Error('El médico no tiene una firma electrónica cargada.');
                if (fm.Fecha_Vencimiento && new Date(fm.Fecha_Vencimiento) < new Date()) throw new Error('La firma electrónica del médico está vencida.');
                if (yoSoyElMedico && b.pin) await firmaSrv.resolverFirma(pool, 'MEDICO', idClinica, idMedico, b.pin); // PIN errado → no se graba nada
            }
        } catch (e) {
            return res.status(400).json({ status: 'Error', message: e.message });
        }

        // ── Trazabilidad: plan / procedimiento relacionado (debe ser del mismo paciente) ──
        const idPlan = parseInt(b.id_plan, 10) || null;
        const atencionTexto = idPlan ? await docs.textoAtencion(pool, idPlan, idPaciente) : null;
        if (idPlan && !atencionTexto) return res.status(400).json({ status: 'Error', message: 'El tratamiento elegido no pertenece a este paciente.' });

        const especialidad = txt(b.especialidad, 150) || txt(med.Especialidad, 150);
        // La especialidad escrita se recuerda en el médico para la próxima vez
        // (opcional: hay usuarios protegidos por trigger que no admiten edición — nunca debe
        // impedir emitir el certificado)
        if (txt(b.especialidad, 150) && txt(b.especialidad, 150) !== txt(med.Especialidad, 150)) {
            try {
                await pool.request().input('id', sql.Int, idMedico).input('esp', sql.NVarChar(150), txt(b.especialidad, 150))
                    .query(`UPDATE Usuarios SET Especialidad = @esp WHERE ID_Usuario = @id`);
            } catch (e) {
                console.warn('⚠️ No se pudo recordar la especialidad del médico', idMedico, '-', e.message);
            }
        }

        const token = crypto.randomBytes(24).toString('hex'); // 48 caracteres, no adivinable
        const nombreMedico = `${(med.Nombres || '').trim()} ${(med.Apellidos || '').trim()}`.trim();
        const mostrarDx = b.mostrar_diagnostico === true || b.mostrar_diagnostico === 1 || b.mostrar_diagnostico === '1' || b.mostrar_diagnostico === 'true';

        // ── Registro ──
        const ins = await pool.request()
            .input('token', sql.VarChar(64), token)
            .input('pac', sql.Int, idPaciente)
            .input('cli', sql.Int, idClinica)
            .input('med', sql.Int, idMedico)
            .input('emite', sql.Int, req.usuarioAuth.id_usuario || null)
            .input('tipo', sql.VarChar(20), tipo)
            .input('fatencion', sql.VarChar(10), b.fecha_atencion)
            .input('hent', sql.VarChar(5), txt(b.hora_entrada, 5))
            .input('hsal', sql.VarChar(5), txt(b.hora_salida, 5))
            .input('cont', sql.NVarChar(100), tipo === 'REPOSO' ? txt(b.contingencia, 100) : null)
            .input('dias', sql.Int, dias)
            .input('desde', sql.VarChar(10), desde)
            .input('hasta', sql.VarChar(10), hasta)
            .input('res', sql.NVarChar(60), tipo === 'SALUD' ? (txt(b.resultado_aptitud, 60) || 'APTO') : null)
            .input('act', sql.NVarChar(300), tipo === 'SALUD' ? txt(b.actividad_aptitud, 300) : null)
            .input('ciecod', sql.NVarChar(20), txt(b.cie10_cod, 20))
            .input('cietxt', sql.NVarChar(400), txt(b.cie10_texto, 400))
            .input('mostrar', sql.Bit, mostrarDx ? 1 : 0)
            .input('motivo', sql.NVarChar(1000), txt(b.motivo, 1000))
            .input('obs', sql.NVarChar(2000), txt(b.observaciones, 2000))
            .input('esp', sql.NVarChar(150), especialidad)
            .input('nmed', sql.NVarChar(250), nombreMedico)
            .input('cmed', sql.VarChar(20), txt(med.Cedula, 20))
            .input('rmed', sql.VarChar(80), txt(med.Registro_Sanitario, 80))
            .input('plan', sql.Int, idPlan)
            .input('atencion', sql.NVarChar(400), atencionTexto)
            .query(`
                INSERT INTO Certificados_Medicos (
                    Token, ID_Paciente, ID_Clinica, ID_Medico, ID_Usuario_Emite, Tipo, Fecha_Atencion, Hora_Entrada, Hora_Salida,
                    Contingencia, Dias_Reposo, Reposo_Desde, Reposo_Hasta, Resultado_Aptitud, Actividad_Aptitud,
                    CIE10_Cod, CIE10_Texto, Mostrar_Diagnostico, Motivo, Observaciones, Especialidad_Medico,
                    Nombre_Medico_Snapshot, Cedula_Medico_Snapshot, Registro_Medico_Snapshot, ID_Plan, Atencion_Texto)
                OUTPUT INSERTED.ID_Certificado, INSERTED.Fecha_Emision
                VALUES (
                    @token, @pac, @cli, @med, @emite, @tipo, @fatencion, @hent, @hsal,
                    @cont, @dias, @desde, @hasta, @res, @act,
                    @ciecod, @cietxt, @mostrar, @motivo, @obs, @esp,
                    @nmed, @cmed, @rmed, @plan, @atencion)`);
        const { ID_Certificado: idCert } = ins.recordset[0];

        // ── PDF: firma ya, o queda pendiente de la firma del médico ──
        let r;
        try {
            r = await docs.procesarFirma(pool, req, 'CERTIFICADO', idCert, {
                firmaPref, idMedico, pin: b.pin, descripcion: `certificado de ${pac.Nombres} ${pac.Apellidos}`
            });
        } catch (e) {
            // No dejar un certificado "fantasma" sin PDF
            await pool.request().input('id', sql.Int, idCert).query(`DELETE FROM Certificados_Medicos WHERE ID_Certificado = @id`);
            console.error('❌ Error generando/firmando certificado:', e);
            return res.status(400).json({ status: 'Error', message: 'No se pudo generar o firmar el PDF: ' + e.message });
        }

        res.json({
            status: 'Success',
            message: r.pendiente
                ? `Certificado ${r.numero} preparado. Quedó pendiente de la firma del Dr(a). ${nombreMedico}, que ya fue notificado.`
                : (r.firmado ? `Certificado ${r.numero} emitido y firmado electrónicamente.` : `Certificado ${r.numero} emitido.`),
            id_certificado: idCert, numero: r.numero, token, firmado: r.firmado, pendiente: r.pendiente
        });
    } catch (error) {
        console.error('❌ emitirCertificado:', error);
        res.status(500).json({ status: 'Error', message: 'No se pudo emitir el certificado: ' + error.message });
    }
};

// ---------------------------------------------------------------------
// GET /api/certificados/paciente/:id
// ---------------------------------------------------------------------
const listarPorPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id, 10)).query(`
            SELECT ID_Certificado, Fecha_Emision, Tipo, Fecha_Atencion, Dias_Reposo, Reposo_Desde, Reposo_Hasta,
                   Resultado_Aptitud, CIE10_Cod, Nombre_Medico_Snapshot, Firma_Tipo, Firma_Titular, Anulado, Motivo_Anulacion,
                   Estado, ID_Medico, Atencion_Texto
            FROM Certificados_Medicos
            WHERE ID_Paciente = @id
            ORDER BY Fecha_Emision DESC`);
        res.json(r.recordset.map(c => ({ ...c, Numero: numeroCertificado(c.ID_Certificado) })));
    } catch (error) {
        console.error('❌ listarPorPaciente (certificados):', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar los certificados.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/certificados/:id/pdf — PDF original (el firmado no se regenera)
// ---------------------------------------------------------------------
const descargarPdf = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`SELECT ID_Certificado, Archivo_PDF, Estado FROM Certificados_Medicos WHERE ID_Certificado = @id`);
        const c = r.recordset[0];
        if (c && c.Estado === docs.PENDIENTE) return res.status(409).json({ status: 'Error', message: 'El certificado está pendiente de la firma del médico.' });
        const ruta = c && c.Archivo_PDF ? path.join(DIR_CERTIFICADOS(), path.basename(c.Archivo_PDF)) : null;
        if (!ruta || !fs.existsSync(ruta)) return res.status(404).json({ status: 'Error', message: 'PDF no encontrado.' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Certificado_${numeroCertificado(c.ID_Certificado)}.pdf"`);
        fs.createReadStream(ruta).pipe(res);
    } catch (error) {
        console.error('❌ descargarPdf (certificados):', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo obtener el PDF.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/certificados/:id/anular  { motivo }
// ---------------------------------------------------------------------
const anularCertificado = async (req, res) => {
    try {
        const motivo = txt(req.body?.motivo, 500);
        if (!motivo) return res.status(400).json({ status: 'Error', message: 'Indique el motivo de la anulación.' });
        const pool = await getConnection();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id, 10))
            .input('motivo', sql.NVarChar(500), motivo)
            .query(`UPDATE Certificados_Medicos SET Anulado = 1, Motivo_Anulacion = @motivo, Fecha_Anulacion = GETDATE()
                    WHERE ID_Certificado = @id AND Anulado = 0`);
        if (!r.rowsAffected[0]) return res.status(404).json({ status: 'Error', message: 'El certificado no existe o ya estaba anulado.' });
        res.json({ status: 'Success', message: 'Certificado anulado. Al verificarlo por QR aparecerá como ANULADO.' });
    } catch (error) {
        console.error('❌ anularCertificado:', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo anular el certificado.' });
    }
};

// ---------------------------------------------------------------------
// PÚBLICO: GET /api/certificados/verificar/:token  (lo abre quien escanea el QR)
// ---------------------------------------------------------------------
const verificarCertificado = async (req, res) => {
    const token = String(req.params.token || '');
    const pagina = (contenido, titulo) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
        <title>${titulo}</title>
        <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f1f5f9;color:#1e293b;padding:20px}
        .card{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}
        .head{background:#1e3a8a;color:#fff;padding:22px 26px}.head h1{font-size:17px;font-weight:800}.head p{font-size:12px;opacity:.8;margin-top:3px}
        .badge{display:inline-block;margin-top:10px;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:.5px}
        .ok{background:#10b981;color:#fff}.anulado{background:#ef4444;color:#fff}
        .body{padding:22px 26px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .item{background:#f8fafc;padding:10px 12px;border-radius:8px}.lbl{font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:3px}
        .val{font-size:13px;font-weight:600}.full{grid-column:1/-1}.btn{display:inline-block;margin-top:18px;background:#1e3a8a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600}
        .nota{font-size:11px;color:#64748b;margin-top:16px;line-height:1.5}@media(max-width:520px){.grid{grid-template-columns:1fr}}</style></head>
        <body><div class="card">${contenido}</div></body></html>`;

    if (!/^[0-9a-f]{48}$/i.test(token)) {
        return res.status(404).send(pagina(`<div class="head"><h1>⚠️ Certificado no encontrado</h1><p>El código no corresponde a ningún certificado.</p></div>`, 'Certificado no encontrado'));
    }
    try {
        const pool = await getConnection();
        const r = await pool.request().input('t', sql.VarChar(64), token).query(`
            SELECT C.*, P.Nombres, P.Apellidos, P.DNI, CL.Nombre_Clinica, CL.RUC, CL.Ciudad
            FROM Certificados_Medicos C
            INNER JOIN Pacientes P ON P.ID_Paciente = C.ID_Paciente
            LEFT JOIN Clinicas CL ON CL.ID_Clinica = C.ID_Clinica
            WHERE C.Token = @t`);
        const c = r.recordset[0];
        if (!c) return res.status(404).send(pagina(`<div class="head"><h1>⚠️ Certificado no encontrado</h1><p>El código no corresponde a ningún certificado registrado.</p></div>`, 'Certificado no encontrado'));

        // Datos mínimos: se oculta parte de la cédula y nunca se muestra el diagnóstico
        const dni = String(c.DNI || '');
        const dniOculto = dni.length > 4 ? '•'.repeat(dni.length - 4) + dni.slice(-4) : dni;
        const tipoTxt = { REPOSO: 'Reposo médico', ASISTENCIA: 'Constancia de atención', SALUD: 'Certificado de salud' }[c.Tipo] || c.Tipo;
        let detalle = '';
        if (c.Tipo === 'REPOSO') detalle = `<div class="item full"><div class="lbl">Reposo</div><div class="val">${c.Dias_Reposo} día(s): del ${escHtml(fechaLarga(c.Reposo_Desde))} al ${escHtml(fechaLarga(c.Reposo_Hasta))}</div></div>`;
        if (c.Tipo === 'SALUD') detalle = `<div class="item full"><div class="lbl">Resultado</div><div class="val">${escHtml(c.Resultado_Aptitud)}${c.Actividad_Aptitud ? ' — ' + escHtml(c.Actividad_Aptitud) : ''}</div></div>`;
        const firmaTxt = c.Firma_Titular
            ? `Firmado electrónicamente por ${escHtml(c.Firma_Titular)}${c.Firma_Emisor ? ' (' + escHtml(c.Firma_Emisor) + ')' : ''}`
            : 'Firma manuscrita (sin firma electrónica)';

        res.send(pagina(`
            <div class="head">
                <h1>${escHtml(c.Nombre_Clinica || 'Certificado médico')}</h1>
                <p>Verificación de certificado médico ${numeroCertificado(c.ID_Certificado)}</p>
                ${c.Anulado ? '<span class="badge anulado">✖ CERTIFICADO ANULADO</span>' : (c.Estado === docs.PENDIENTE ? '<span class="badge anulado" style="background:#f59e0b">⏳ EN PROCESO DE FIRMA</span>' : '<span class="badge ok">✔ CERTIFICADO VÁLIDO</span>')}
            </div>
            <div class="body">
                <div class="grid">
                    <div class="item"><div class="lbl">Tipo</div><div class="val">${escHtml(tipoTxt)}</div></div>
                    <div class="item"><div class="lbl">Fecha de emisión</div><div class="val">${escHtml(fechaLarga(c.Fecha_Emision))}</div></div>
                    <div class="item"><div class="lbl">Paciente</div><div class="val">${escHtml(`${c.Nombres || ''} ${c.Apellidos || ''}`.trim())}</div></div>
                    <div class="item"><div class="lbl">Identificación</div><div class="val">${escHtml(dniOculto)}</div></div>
                    <div class="item"><div class="lbl">Fecha de atención</div><div class="val">${escHtml(fechaLarga(c.Fecha_Atencion))}</div></div>
                    <div class="item"><div class="lbl">Médico</div><div class="val">Dr(a). ${escHtml(c.Nombre_Medico_Snapshot)}${c.Registro_Medico_Snapshot ? '<br><small>Reg. ' + escHtml(c.Registro_Medico_Snapshot) + '</small>' : ''}</div></div>
                    ${detalle}
                    <div class="item full"><div class="lbl">Firma</div><div class="val">${firmaTxt}</div></div>
                    ${c.Anulado ? `<div class="item full"><div class="lbl">Motivo de anulación</div><div class="val">${escHtml(c.Motivo_Anulacion)}</div></div>` : ''}
                </div>
                ${!c.Anulado && c.Archivo_PDF ? `<a class="btn" href="${token}/pdf">Descargar el PDF original</a>` : ''}
                <p class="nota">Compare estos datos con el documento recibido.${c.Firma_Titular ? ' La firma electrónica del PDF original puede validarse en FirmaEC (firmaec.gob.ec).' : ''}
                Consultado el ${escHtml(new Date().toLocaleString('es-EC'))}.</p>
            </div>`, `Verificación ${numeroCertificado(c.ID_Certificado)}`));
    } catch (error) {
        console.error('❌ verificarCertificado:', error.message);
        res.status(500).send(pagina(`<div class="head"><h1>Error</h1><p>No se pudo verificar el certificado en este momento.</p></div>`, 'Error'));
    }
};

// PÚBLICO: GET /api/certificados/verificar/:token/pdf — PDF original (para validar la firma)
const verificarPdf = async (req, res) => {
    const token = String(req.params.token || '');
    if (!/^[0-9a-f]{48}$/i.test(token)) return res.status(404).send('No encontrado');
    try {
        const pool = await getConnection();
        const r = await pool.request().input('t', sql.VarChar(64), token)
            .query(`SELECT ID_Certificado, Archivo_PDF, Anulado FROM Certificados_Medicos WHERE Token = @t`);
        const c = r.recordset[0];
        const ruta = c && c.Archivo_PDF && !c.Anulado ? path.join(DIR_CERTIFICADOS(), path.basename(c.Archivo_PDF)) : null;
        if (!ruta || !fs.existsSync(ruta)) return res.status(404).send('No encontrado');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Certificado_${numeroCertificado(c.ID_Certificado)}.pdf"`);
        fs.createReadStream(ruta).pipe(res);
    } catch (error) {
        res.status(500).send('Error');
    }
};

module.exports = {
    listarMedicos, estadoFirmas, subirFirmaMedico, eliminarFirmaMedico,
    emitirCertificado, listarPorPaciente, descargarPdf, anularCertificado,
    verificarCertificado, verificarPdf
};
