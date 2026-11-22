// =====================================================================
//  ÓRDENES DE EXÁMENES (laboratorio / imagen) con firma electrónica,
//  QR de verificación, convenio del paciente y carga del resultado.
// =====================================================================
const fs = require('fs');
const path = require('path');
const { getConnection, sql } = require('../config/db');
const firmaSrv = require('../services/firmaElectronicaService');
const docs = require('../services/documentosFirmaService');
const { fechaLarga } = require('../services/certificadoPdfService');

const TIPOS = ['LABORATORIO', 'IMAGEN', 'OTRO'];
const FIRMAS = ['CLINICA', 'MEDICO', 'NINGUNA'];
const DIR_RESULTADOS = () => path.join(process.cwd(), 'uploads', 'documentos_firmados', 'resultados');
const txt = (v, max) => { const s = String(v == null ? '' : v).trim(); return s ? s.slice(0, max) : null; };
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Convenio vigente del paciente (texto para la orden)
async function convenioVigente(pool, idPaciente) {
    try {
        const r = await pool.request().input('pac', sql.Int, idPaciente).query(`
            SELECT TOP 1 C.ID_Convenio, C.Nombre, PC.Numero_Afiliado
            FROM Paciente_Convenios PC INNER JOIN Convenios C ON C.ID_Convenio = PC.ID_Convenio
            WHERE PC.ID_Paciente = @pac AND PC.Activo = 1 AND C.Activo = 1
              AND (PC.Vigente_Hasta IS NULL OR PC.Vigente_Hasta >= CAST(GETDATE() AS DATE))
            ORDER BY PC.Fecha_Registro DESC`);
        const c = r.recordset[0];
        return c ? { id: c.ID_Convenio, texto: `${c.Nombre}${c.Numero_Afiliado ? ' · afiliado ' + c.Numero_Afiliado : ''}` } : null;
    } catch (_) { return null; }
}

// POST /api/ordenes
const emitir = async (req, res) => {
    const b = req.body || {};
    try {
        const tipo = String(b.tipo || '').toUpperCase();
        const firmaPref = String(b.firma || 'NINGUNA').toUpperCase();
        const idPaciente = parseInt(b.id_paciente, 10);
        const idMedico = parseInt(b.id_medico, 10);
        const idClinica = parseInt(req.usuarioAuth.id_clinica, 10);
        const examenes = (Array.isArray(b.examenes) ? b.examenes : [])
            .map(e => ({ nombre: txt(e && e.nombre, 200), indicacion: txt(e && e.indicacion, 300) }))
            .filter(e => e.nombre).slice(0, 40);

        if (!TIPOS.includes(tipo)) return res.status(400).json({ status: 'Error', message: 'Tipo de orden no válido.' });
        if (!FIRMAS.includes(firmaPref)) return res.status(400).json({ status: 'Error', message: 'Opción de firma no válida.' });
        if (!idPaciente || !idMedico) return res.status(400).json({ status: 'Error', message: 'Faltan el paciente o el médico.' });
        if (!examenes.length) return res.status(400).json({ status: 'Error', message: 'Agregue al menos un examen.' });

        const pool = await getConnection();
        const med = (await pool.request().input('id', sql.Int, idMedico)
            .query(`SELECT ID_Usuario, Nombres, Apellidos FROM Usuarios WHERE ID_Usuario = @id AND Activo = 1`)).recordset[0];
        if (!med) return res.status(404).json({ status: 'Error', message: 'Médico no encontrado o inactivo.' });
        const pac = (await pool.request().input('id', sql.Int, idPaciente)
            .query(`SELECT Nombres, Apellidos FROM Pacientes WHERE ID_Paciente = @id`)).recordset[0];
        if (!pac) return res.status(404).json({ status: 'Error', message: 'Paciente no encontrado.' });

        // Firma validada antes de grabar (mismo criterio que el certificado)
        try {
            if (firmaPref === 'CLINICA') await firmaSrv.resolverFirma(pool, 'CLINICA', idClinica, idMedico);
            if (firmaPref === 'MEDICO') {
                const fm = await firmaSrv.datosFirmaMedico(pool, idMedico);
                if (!fm) throw new Error('El médico no tiene una firma electrónica cargada.');
                if (Number(req.usuarioAuth.id_usuario) === idMedico && b.pin) await firmaSrv.resolverFirma(pool, 'MEDICO', idClinica, idMedico, b.pin);
            }
        } catch (e) {
            return res.status(400).json({ status: 'Error', message: e.message });
        }

        const idPlan = parseInt(b.id_plan, 10) || null;
        const atencionTexto = idPlan ? await docs.textoAtencion(pool, idPlan, idPaciente) : null;
        if (idPlan && !atencionTexto) return res.status(400).json({ status: 'Error', message: 'El tratamiento elegido no pertenece a este paciente.' });
        const convenio = await convenioVigente(pool, idPaciente);

        const ins = await pool.request()
            .input('pac', sql.Int, idPaciente)
            .input('cli', sql.Int, idClinica)
            .input('med', sql.Int, idMedico)
            .input('emite', sql.Int, req.usuarioAuth.id_usuario || null)
            .input('tipo', sql.VarChar(15), tipo)
            .input('prio', sql.VarChar(10), String(b.prioridad || '').toUpperCase() === 'URGENTE' ? 'URGENTE' : 'RUTINA')
            .input('exa', sql.NVarChar(sql.MAX), JSON.stringify(examenes))
            .input('ciecod', sql.NVarChar(20), txt(b.cie10_cod, 20))
            .input('cietxt', sql.NVarChar(400), txt(b.cie10_texto, 400))
            .input('ind', sql.NVarChar(1000), txt(b.indicaciones, 1000))
            .input('dest', sql.NVarChar(200), txt(b.destino, 200))
            .input('plan', sql.Int, idPlan)
            .input('atencion', sql.NVarChar(400), atencionTexto)
            .input('conv', sql.Int, convenio ? convenio.id : null)
            .input('convtxt', sql.NVarChar(200), convenio ? convenio.texto : null)
            .query(`INSERT INTO Ordenes_Examenes (ID_Paciente, ID_Clinica, ID_Medico, ID_Usuario_Emite, Tipo, Prioridad, Examenes_JSON,
                        CIE10_Cod, CIE10_Texto, Indicaciones, Destino, ID_Plan, Atencion_Texto, ID_Convenio, Convenio_Texto)
                    OUTPUT INSERTED.ID_Orden
                    VALUES (@pac, @cli, @med, @emite, @tipo, @prio, @exa, @ciecod, @cietxt, @ind, @dest, @plan, @atencion, @conv, @convtxt)`);
        const idOrden = ins.recordset[0].ID_Orden;

        let r;
        try {
            r = await docs.procesarFirma(pool, req, 'ORDEN', idOrden, {
                firmaPref, idMedico, pin: b.pin, descripcion: `orden de exámenes de ${pac.Nombres} ${pac.Apellidos}`
            });
        } catch (e) {
            await pool.request().input('id', sql.Int, idOrden).query(`DELETE FROM Ordenes_Examenes WHERE ID_Orden = @id`);
            return res.status(400).json({ status: 'Error', message: 'No se pudo generar o firmar el PDF: ' + e.message });
        }
        const nombreMedico = `${med.Nombres || ''} ${med.Apellidos || ''}`.trim();
        res.json({
            status: 'Success', id_orden: idOrden, numero: r.numero, firmado: r.firmado, pendiente: r.pendiente,
            message: r.pendiente
                ? `Orden ${r.numero} preparada. Quedó pendiente de la firma del Dr(a). ${nombreMedico}, que ya fue notificado.`
                : (r.firmado ? `Orden ${r.numero} emitida y firmada electrónicamente.` : `Orden ${r.numero} emitida.`)
        });
    } catch (error) {
        console.error('❌ emitir orden:', error);
        res.status(500).json({ status: 'Error', message: 'No se pudo emitir la orden: ' + error.message });
    }
};

// GET /api/ordenes/paciente/:id
const listarPorPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id, 10)).query(`
            SELECT O.ID_Orden, O.Fecha, O.Tipo, O.Prioridad, O.Examenes_JSON, O.Estado, O.ID_Medico, O.Firma_Tipo, O.Firma_Titular,
                   O.Anulado, O.Motivo_Anulacion, O.Atencion_Texto, O.Convenio_Texto, O.Destino,
                   O.Resultado_Archivo, O.Resultado_Nombre, O.Resultado_Fecha, O.Resultado_Notas,
                   LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Nombre_Medico
            FROM Ordenes_Examenes O LEFT JOIN Usuarios U ON U.ID_Usuario = O.ID_Medico
            WHERE O.ID_Paciente = @id ORDER BY O.Fecha DESC`);
        res.json(r.recordset.map(o => {
            let examenes = [];
            try { examenes = JSON.parse(o.Examenes_JSON || '[]'); } catch (_) { /* */ }
            delete o.Examenes_JSON;
            return { ...o, examenes, Numero: docs.numero.ORDEN(o.ID_Orden), Tiene_Resultado: !!o.Resultado_Archivo };
        }));
    } catch (error) {
        console.error('❌ listar órdenes:', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar las órdenes.' });
    }
};

// POST /api/ordenes/:id/anular { motivo }
const anular = async (req, res) => {
    try {
        const motivo = txt(req.body?.motivo, 500);
        if (!motivo) return res.status(400).json({ status: 'Error', message: 'Indique el motivo de la anulación.' });
        const pool = await getConnection();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id, 10)).input('m', sql.NVarChar(500), motivo)
            .query(`UPDATE Ordenes_Examenes SET Anulado = 1, Motivo_Anulacion = @m, Fecha_Anulacion = GETDATE() WHERE ID_Orden = @id AND Anulado = 0`);
        if (!r.rowsAffected[0]) return res.status(404).json({ status: 'Error', message: 'La orden no existe o ya estaba anulada.' });
        res.json({ status: 'Success', message: 'Orden anulada.' });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: 'No se pudo anular la orden.' });
    }
};

// POST /api/ordenes/:id/resultado (multipart: archivo, notas)
const subirResultado = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!req.file || !req.file.buffer) return res.status(400).json({ status: 'Error', message: 'Seleccione el archivo del resultado (PDF o imagen).' });
        const pool = await getConnection();
        const o = (await pool.request().input('id', sql.Int, id).query(`SELECT ID_Orden, Codigo_Verificacion, ID_Paciente FROM Ordenes_Examenes WHERE ID_Orden = @id`)).recordset[0];
        if (!o) return res.status(404).json({ status: 'Error', message: 'Orden no encontrada.' });
        const ext = (path.extname(req.file.originalname || '').toLowerCase().match(/^\.(pdf|jpe?g|png)$/) || ['.pdf'])[0];
        fs.mkdirSync(DIR_RESULTADOS(), { recursive: true });
        const archivo = `${o.Codigo_Verificacion}-${Date.now()}${ext}`;
        fs.writeFileSync(path.join(DIR_RESULTADOS(), archivo), req.file.buffer);
        await pool.request().input('id', sql.Int, id)
            .input('arch', sql.NVarChar(200), archivo)
            .input('nom', sql.NVarChar(200), txt(req.file.originalname, 200))
            .input('notas', sql.NVarChar(1000), txt(req.body?.notas, 1000))
            .input('u', sql.Int, req.usuarioAuth.id_usuario || null)
            .query(`UPDATE Ordenes_Examenes SET Resultado_Archivo = @arch, Resultado_Nombre = @nom, Resultado_Notas = @notas,
                        Resultado_Fecha = GETDATE(), ID_Usuario_Resultado = @u WHERE ID_Orden = @id`);
        res.json({ status: 'Success', message: 'Resultado cargado en la orden.', id_paciente: o.ID_Paciente });
    } catch (error) {
        console.error('❌ subir resultado:', error.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar el resultado.' });
    }
};

// GET /api/ordenes/:id/resultado
const verResultado = async (req, res) => {
    try {
        const pool = await getConnection();
        const o = (await pool.request().input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`SELECT Resultado_Archivo, Resultado_Nombre FROM Ordenes_Examenes WHERE ID_Orden = @id`)).recordset[0];
        const ruta = o && o.Resultado_Archivo ? path.join(DIR_RESULTADOS(), path.basename(o.Resultado_Archivo)) : null;
        if (!ruta || !fs.existsSync(ruta)) return res.status(404).json({ status: 'Error', message: 'Resultado no encontrado.' });
        const ext = path.extname(ruta).toLowerCase();
        res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : (ext === '.png' ? 'image/png' : 'image/jpeg'));
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(o.Resultado_Nombre || path.basename(ruta))}"`);
        fs.createReadStream(ruta).pipe(res);
    } catch (error) {
        res.status(500).json({ status: 'Error', message: 'No se pudo abrir el resultado.' });
    }
};

// ---------------------------------------------------------------------
// PÚBLICO: verificación por QR (sin nombres de exámenes ni diagnóstico)
// ---------------------------------------------------------------------
async function poolPublico(req) {
    if (req.params.idTenant) {
        const { getTenantPool } = require('../config/tenantPool');
        return getTenantPool(Number(req.params.idTenant));
    }
    return getConnection();
}

const verificar = async (req, res) => {
    const codigo = String(req.params.codigo || '').toLowerCase();
    const pagina = (cuerpo, titulo) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>${titulo}</title>
        <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f1f5f9;color:#1e293b;padding:20px}.card{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}.head{background:#1e3a8a;color:#fff;padding:22px 26px}.head h1{font-size:17px}.head p{font-size:12px;opacity:.8;margin-top:3px}.badge{display:inline-block;margin-top:10px;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px}.ok{background:#10b981}.no{background:#ef4444}.pend{background:#f59e0b}.body{padding:22px 26px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.item{background:#f8fafc;padding:10px 12px;border-radius:8px}.lbl{font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:3px}.val{font-size:13px;font-weight:600}.full{grid-column:1/-1}.btn{display:inline-block;margin-top:18px;background:#1e3a8a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600}.nota{font-size:11px;color:#64748b;margin-top:16px}@media(max-width:520px){.grid{grid-template-columns:1fr}}</style></head><body><div class="card">${cuerpo}</div></body></html>`;
    if (!/^[0-9a-f]{32}$/.test(codigo)) return res.status(404).send(pagina('<div class="head"><h1>⚠️ Orden no encontrada</h1></div>', 'Orden no encontrada'));
    try {
        const pool = await poolPublico(req);
        const o = (await pool.request().input('c', sql.VarChar(32), codigo).query(`
            SELECT O.*, P.Nombres, P.Apellidos, P.DNI, CL.Nombre_Clinica,
                   LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Nombre_Medico, U.Registro_Sanitario
            FROM Ordenes_Examenes O INNER JOIN Pacientes P ON P.ID_Paciente = O.ID_Paciente
            LEFT JOIN Clinicas CL ON CL.ID_Clinica = O.ID_Clinica LEFT JOIN Usuarios U ON U.ID_Usuario = O.ID_Medico
            WHERE O.Codigo_Verificacion = @c`)).recordset[0];
        if (!o) return res.status(404).send(pagina('<div class="head"><h1>⚠️ Orden no encontrada</h1><p>El código no corresponde a ninguna orden registrada.</p></div>', 'Orden no encontrada'));
        let n = 0; try { n = JSON.parse(o.Examenes_JSON || '[]').length; } catch (_) { /* */ }
        const iniciales = `${o.Nombres || ''} ${o.Apellidos || ''}`.split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ');
        const dni = String(o.DNI || ''); const dniOculto = dni.length > 3 ? '•'.repeat(dni.length - 3) + dni.slice(-3) : dni;
        const badge = o.Anulado ? '<span class="badge no">✖ ORDEN ANULADA</span>' : (o.Estado === docs.PENDIENTE ? '<span class="badge pend">⏳ EN PROCESO DE FIRMA</span>' : '<span class="badge ok">✔ ORDEN VÁLIDA</span>');
        res.send(pagina(`
            <div class="head"><h1>${escHtml(o.Nombre_Clinica || 'Orden de exámenes')}</h1><p>Verificación de la orden ${docs.numero.ORDEN(o.ID_Orden)}</p>${badge}</div>
            <div class="body"><div class="grid">
                <div class="item"><div class="lbl">Tipo</div><div class="val">${escHtml(o.Tipo)}${o.Prioridad === 'URGENTE' ? ' · URGENTE' : ''}</div></div>
                <div class="item"><div class="lbl">Fecha</div><div class="val">${escHtml(fechaLarga(o.Fecha))}</div></div>
                <div class="item"><div class="lbl">Paciente</div><div class="val">${escHtml(iniciales)}</div></div>
                <div class="item"><div class="lbl">Identificación</div><div class="val">${escHtml(dniOculto)}</div></div>
                <div class="item"><div class="lbl">Médico</div><div class="val">Dr(a). ${escHtml(o.Nombre_Medico)}${o.Registro_Sanitario ? '<br><small>Reg. ' + escHtml(o.Registro_Sanitario) + '</small>' : ''}</div></div>
                <div class="item"><div class="lbl">Exámenes solicitados</div><div class="val">${n}</div></div>
                <div class="item full"><div class="lbl">Firma</div><div class="val">${o.Firma_Titular ? 'Firmada electrónicamente por ' + escHtml(o.Firma_Titular) : 'Firma manuscrita'}</div></div>
            </div>
            ${!o.Anulado && o.Archivo_PDF && o.Estado !== docs.PENDIENTE ? `<a class="btn" href="${codigo}/pdf">Descargar el PDF original</a>` : ''}
            <p class="nota">Compare estos datos con la orden recibida. Consultado el ${escHtml(new Date().toLocaleString('es-EC'))}.</p></div>`, `Orden ${docs.numero.ORDEN(o.ID_Orden)}`));
    } catch (error) {
        res.status(404).send(pagina('<div class="head"><h1>⚠️ Orden no encontrada</h1></div>', 'Orden no encontrada'));
    }
};

const verificarPdf = async (req, res) => {
    const codigo = String(req.params.codigo || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(codigo)) return res.status(404).send('No encontrado');
    try {
        const pool = await poolPublico(req);
        const o = (await pool.request().input('c', sql.VarChar(32), codigo)
            .query(`SELECT ID_Orden, Archivo_PDF, Estado, Anulado FROM Ordenes_Examenes WHERE Codigo_Verificacion = @c`)).recordset[0];
        const ruta = o && !o.Anulado && o.Estado !== docs.PENDIENTE ? docs.rutaPdf('ORDEN', o) : null;
        if (!ruta || !fs.existsSync(ruta)) return res.status(404).send('No encontrado');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${docs.numero.ORDEN(o.ID_Orden)}.pdf"`);
        fs.createReadStream(ruta).pipe(res);
    } catch (e) {
        res.status(404).send('No encontrado');
    }
};

module.exports = { emitir, listarPorPaciente, anular, subirResultado, verResultado, verificar, verificarPdf, convenioVigente };
