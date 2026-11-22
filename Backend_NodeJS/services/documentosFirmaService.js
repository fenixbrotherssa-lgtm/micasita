// =====================================================================
//  DOCUMENTOS FIRMABLES: certificado médico, receta y orden de exámenes.
//
//  Flujo de firma:
//   - CLINICA  → se firma al momento con el .p12 de facturación de la clínica.
//   - MEDICO   → solo el propio médico, escribiendo su PIN (contraseña del .p12, que
//                NO se guarda). Si lo prepara otra persona (recepción) o el médico no
//                escribe el PIN, el documento queda "PENDIENTE_FIRMA" y le llega al
//                médico a su bandeja (escritorio / celular) para firmarlo con su PIN.
//   - NINGUNA  → PDF para firma y sello manuscritos.
// =====================================================================
const fs = require('fs');
const path = require('path');
const { sql } = require('../config/db');
const firmaSrv = require('./firmaElectronicaService');
const { generarCertificadoPdf } = require('./certificadoPdfService');
const { generarRecetaPdf } = require('./recetaPdfService');
const { generarOrdenPdf } = require('./ordenPdfService');

const PENDIENTE = 'PENDIENTE_FIRMA';

// Carpetas privadas (NO se sirven por /uploads, ver server.js)
const CARPETAS = {
    CERTIFICADO: () => path.join(process.cwd(), 'uploads', 'certificados'),
    RECETA: () => path.join(process.cwd(), 'uploads', 'documentos_firmados', 'recetas'),
    ORDEN: () => path.join(process.cwd(), 'uploads', 'documentos_firmados', 'ordenes')
};

const numero = {
    CERTIFICADO: id => `CM-${String(id).padStart(6, '0')}`,
    RECETA: id => `RX-${String(id).padStart(6, '0')}`,
    ORDEN: id => `OE-${String(id).padStart(6, '0')}`
};
const NOMBRE_DOC = { CERTIFICADO: 'certificado médico', RECETA: 'receta', ORDEN: 'orden de exámenes' };

const rutaLogo = (logo) => logo ? path.join(process.cwd(), 'uploads', 'logos', path.basename(logo)) : null;

/** Base pública para el QR: la que manda la app (PUBLIC_DOMAIN) o la del propio servidor. */
function basePublica(req) {
    const enviada = String(req.body?.url_publica || req.query?.url_publica || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
    if (/^https?:\/\/[^\s/]+/i.test(enviada)) return enviada;
    return `${req.protocol}://${req.get('host')}`;
}

// En el SaaS la URL pública lleva el N.° de clínica; on-premise/Mac no.
const prefijoTenant = (req) => (req && req.usuarioAuth && req.usuarioAuth.id_tenant) ? `${req.usuarioAuth.id_tenant}/` : '';

// ---------------------------------------------------------------------
// Carga de datos para el PDF
// ---------------------------------------------------------------------
const SQL_CLINICA = `CL.Nombre_Clinica, CL.RUC, CL.Direccion AS Direccion_Clinica, CL.Telefono AS Telefono_Clinica, CL.Ciudad AS Ciudad_Clinica, CL.Logo_Ruta`;

async function cargar(pool, tipo, id) {
    const r = pool.request().input('id', sql.Int, id);
    let q;
    if (tipo === 'CERTIFICADO') {
        q = await r.query(`
            SELECT C.*, P.Nombres AS Nombres_Paciente, P.Apellidos AS Apellidos_Paciente, P.DNI, P.Fecha_Nacimiento, P.Genero, P.Ocupacion, P.Telefono AS Telefono_Paciente,
                   ISNULL(P.Historial_Clinico_General, 'HC-' + RIGHT('000000' + CAST(P.ID_Paciente AS VARCHAR(10)), 6)) AS Historia_Clinica,
                   ${SQL_CLINICA}
            FROM Certificados_Medicos C
            INNER JOIN Pacientes P ON P.ID_Paciente = C.ID_Paciente
            LEFT JOIN Clinicas CL ON CL.ID_Clinica = C.ID_Clinica
            WHERE C.ID_Certificado = @id`);
    } else if (tipo === 'RECETA') {
        q = await r.query(`
            SELECT R.*, R.ID_Usuario AS ID_Medico, R.Estado_Firma AS Estado,
                   P.Nombres AS Nombres_Paciente, P.Apellidos AS Apellidos_Paciente, P.DNI, P.Fecha_Nacimiento, P.Telefono AS Telefono_Paciente,
                   LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Nombre_Medico, U.Cedula AS Cedula_Medico,
                   ISNULL(R.Registro_Doc_Snapshot, U.Registro_Sanitario) AS Registro_Medico, U.Especialidad AS Especialidad_Medico,
                   ${SQL_CLINICA}
            FROM Recetas R
            INNER JOIN Pacientes P ON P.ID_Paciente = R.ID_Paciente
            LEFT JOIN Usuarios U ON U.ID_Usuario = R.ID_Usuario
            LEFT JOIN Clinicas CL ON CL.ID_Clinica = R.ID_Clinica
            WHERE R.ID_Receta = @id`);
    } else if (tipo === 'ORDEN') {
        q = await r.query(`
            SELECT O.*, P.Nombres AS Nombres_Paciente, P.Apellidos AS Apellidos_Paciente, P.DNI, P.Fecha_Nacimiento, P.Telefono AS Telefono_Paciente,
                   LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Nombre_Medico, U.Cedula AS Cedula_Medico,
                   U.Registro_Sanitario AS Registro_Medico, U.Especialidad AS Especialidad_Medico,
                   ${SQL_CLINICA}
            FROM Ordenes_Examenes O
            INNER JOIN Pacientes P ON P.ID_Paciente = O.ID_Paciente
            LEFT JOIN Usuarios U ON U.ID_Usuario = O.ID_Medico
            LEFT JOIN Clinicas CL ON CL.ID_Clinica = O.ID_Clinica
            WHERE O.ID_Orden = @id`);
    } else {
        throw new Error('Tipo de documento no válido.');
    }
    return q.recordset[0] || null;
}

function urlVerificacion(req, tipo, d) {
    const base = basePublica(req);
    const t = prefijoTenant(req);
    if (tipo === 'CERTIFICADO') return `${base}/api/certificados/verificar/${t}${d.Token}`;
    if (tipo === 'RECETA') return `${base}/api/recetas/verificar/${t}${d.Codigo_Verificacion}`;
    return `${base}/api/ordenes/verificar/${t}${d.Codigo_Verificacion}`;
}

async function generarPdf(req, tipo, d, firma) {
    const comunes = { rutaLogo: rutaLogo(d.Logo_Ruta), urlVerificacion: urlVerificacion(req, tipo, d), firma: firma ? { titular: firma.info.titular, emisor: firma.info.emisor } : null };
    if (tipo === 'CERTIFICADO') {
        return generarCertificadoPdf({ ...d, ...comunes, numero: numero.CERTIFICADO(d.ID_Certificado) });
    }
    if (tipo === 'RECETA') {
        let medicamentos = [];
        try { medicamentos = JSON.parse(d.Medicamentos_JSON || '[]'); } catch (_) { medicamentos = []; }
        return generarRecetaPdf({ ...d, ...comunes, numero: numero.RECETA(d.ID_Receta), medicamentos });
    }
    let examenes = [];
    try { examenes = JSON.parse(d.Examenes_JSON || '[]'); } catch (_) { examenes = []; }
    return generarOrdenPdf({ ...d, ...comunes, numero: numero.ORDEN(d.ID_Orden), examenes });
}

const TABLA = {
    CERTIFICADO: { tabla: 'Certificados_Medicos', id: 'ID_Certificado', estado: 'Estado', nombre: d => d.Token },
    RECETA: { tabla: 'Recetas', id: 'ID_Receta', estado: 'Estado_Firma', nombre: d => d.Codigo_Verificacion },
    ORDEN: { tabla: 'Ordenes_Examenes', id: 'ID_Orden', estado: 'Estado', nombre: d => d.Codigo_Verificacion }
};

/**
 * Genera el PDF (firmado si hay firma), lo guarda y marca el documento como emitido.
 * @param firma resultado de firmaSrv.resolverFirma o null
 */
async function emitirPdf(pool, req, tipo, id, firma) {
    const d = await cargar(pool, tipo, id);
    if (!d) throw new Error('Documento no encontrado.');
    let pdf = await generarPdf(req, tipo, d, firma);
    if (firma) {
        pdf = await firmaSrv.firmarPdf(pdf, firma, {
            motivo: `${NOMBRE_DOC[tipo].charAt(0).toUpperCase() + NOMBRE_DOC[tipo].slice(1)} ${numero[tipo](id)}`,
            ubicacion: d.Ciudad_Clinica || 'Ecuador',
            contacto: d.Telefono_Clinica || ''
        });
    }
    const t = TABLA[tipo];
    fs.mkdirSync(CARPETAS[tipo](), { recursive: true });
    const archivo = `${t.nombre(d)}.pdf`;
    fs.writeFileSync(path.join(CARPETAS[tipo](), archivo), pdf);
    const estadoFinal = tipo === 'RECETA' ? (firma ? 'FIRMADA' : 'EMITIDA') : 'EMITIDO';
    await pool.request()
        .input('id', sql.Int, id)
        .input('arch', sql.NVarChar(200), archivo)
        .input('estado', sql.VarChar(20), estadoFinal)
        .input('ftipo', sql.VarChar(10), firma ? firma.origen : null)
        .input('ftit', sql.NVarChar(300), firma ? firma.info.titular : null)
        .input('femi', sql.NVarChar(300), firma ? (firma.info.emisor || null) : null)
        .input('ufirma', sql.Int, firma ? (req.usuarioAuth?.id_usuario || null) : null)
        .input('origen', sql.NVarChar(100), firma ? String(req.headers['x-ametra-origen'] || req.ip || '').slice(0, 100) : null)
        .query(`UPDATE ${t.tabla} SET Archivo_PDF = @arch, ${t.estado} = @estado, Firma_Tipo = @ftipo, Firma_Titular = @ftit,
                    Firma_Emisor = @femi, ID_Usuario_Firma = @ufirma, Origen_Firma = @origen,
                    Fecha_Firma = CASE WHEN @ftipo IS NULL THEN NULL ELSE GETDATE() END
                WHERE ${t.id} = @id`);
    return { pdf, numero: numero[tipo](id), firmado: !!firma };
}

/** Deja el documento pendiente de la firma del médico y le avisa. */
async function marcarPendiente(pool, req, tipo, id, idMedico, descripcion) {
    const t = TABLA[tipo];
    await pool.request().input('id', sql.Int, id).input('estado', sql.VarChar(20), PENDIENTE)
        .query(`UPDATE ${t.tabla} SET ${t.estado} = @estado, Firma_Tipo = 'MEDICO' WHERE ${t.id} = @id`);
    avisarMedico(req, idMedico, `Tiene un documento por firmar: ${descripcion || NOMBRE_DOC[tipo]}.`);
}

function avisarMedico(req, idMedico, cuerpo) {
    try {
        const io = req.app.get('io');
        if (io) io.emit('firmas-pendientes', { id_medico: idMedico });
    } catch (_) { /* sin tiempo real */ }
    try {
        const { enviarPushAUsuario } = require('./pushService');
        enviarPushAUsuario(idMedico, { title: 'Documento por firmar', body: cuerpo, data: { tipo: 'firma_pendiente' } }).catch(() => {});
    } catch (_) { /* sin push configurado */ }
}

/**
 * Decide qué hacer según la firma pedida. Devuelve { pendiente, numero, firmado }.
 * Lanza Error con mensaje para el usuario si no se puede (firma no disponible, PIN errado...).
 */
async function procesarFirma(pool, req, tipo, id, { firmaPref, idMedico, pin, descripcion }) {
    const yo = Number(req.usuarioAuth?.id_usuario);
    if (firmaPref === 'MEDICO') {
        const datos = await firmaSrv.datosFirmaMedico(pool, idMedico);
        if (!datos) throw new Error('El médico no tiene una firma electrónica cargada.');
        if (datos.Fecha_Vencimiento && new Date(datos.Fecha_Vencimiento) < new Date()) throw new Error('La firma electrónica del médico está vencida.');
        if (yo !== Number(idMedico) || !pin) {
            await marcarPendiente(pool, req, tipo, id, idMedico, descripcion);
            return { pendiente: true, numero: numero[tipo](id), firmado: false };
        }
    }
    const firma = await firmaSrv.resolverFirma(pool, firmaPref, req.usuarioAuth.id_clinica, idMedico, pin);
    const r = await emitirPdf(pool, req, tipo, id, firma);
    return { pendiente: false, numero: r.numero, firmado: r.firmado };
}

/** Bandeja del médico: todo lo que espera su firma. */
async function listarPendientes(pool, idMedico) {
    const r = await pool.request().input('med', sql.Int, idMedico).query(`
        SELECT 'CERTIFICADO' AS Tipo_Documento, C.ID_Certificado AS ID, C.Fecha_Emision AS Fecha, C.Tipo AS Subtipo,
               P.Nombres + ' ' + P.Apellidos AS Paciente, P.DNI, C.ID_Usuario_Emite AS ID_Prepara
        FROM Certificados_Medicos C INNER JOIN Pacientes P ON P.ID_Paciente = C.ID_Paciente
        WHERE C.ID_Medico = @med AND C.Estado = '${PENDIENTE}' AND C.Anulado = 0
        UNION ALL
        SELECT 'RECETA', R.ID_Receta, R.Fecha, NULL, P.Nombres + ' ' + P.Apellidos, P.DNI, R.ID_Usuario_Prepara
        FROM Recetas R INNER JOIN Pacientes P ON P.ID_Paciente = R.ID_Paciente
        WHERE R.ID_Usuario = @med AND R.Estado_Firma = '${PENDIENTE}'
        UNION ALL
        SELECT 'ORDEN', O.ID_Orden, O.Fecha, O.Tipo, P.Nombres + ' ' + P.Apellidos, P.DNI, O.ID_Usuario_Emite
        FROM Ordenes_Examenes O INNER JOIN Pacientes P ON P.ID_Paciente = O.ID_Paciente
        WHERE O.ID_Medico = @med AND O.Estado = '${PENDIENTE}' AND O.Anulado = 0
        ORDER BY Fecha DESC`);
    const ids = [...new Set(r.recordset.map(x => x.ID_Prepara).filter(Boolean))];
    let nombres = {};
    if (ids.length) {
        const u = await pool.request().query(`SELECT ID_Usuario, Nombres + ' ' + Apellidos AS N FROM Usuarios WHERE ID_Usuario IN (${ids.map(Number).join(',')})`);
        u.recordset.forEach(x => { nombres[x.ID_Usuario] = x.N; });
    }
    return r.recordset.map(x => ({ ...x, Numero: numero[x.Tipo_Documento](x.ID), Preparado_Por: nombres[x.ID_Prepara] || null }));
}

/** Firma con un solo PIN varios documentos de la bandeja del médico. */
async function firmarPendientes(pool, req, items, pin) {
    const yo = Number(req.usuarioAuth?.id_usuario);
    const firma = await firmaSrv.resolverFirma(pool, 'MEDICO', req.usuarioAuth.id_clinica, yo, pin); // valida el PIN una vez
    const resultado = [];
    for (const it of items) {
        const tipo = String(it.tipo || '').toUpperCase();
        const id = parseInt(it.id, 10);
        if (!TABLA[tipo] || !id) continue;
        const d = await cargar(pool, tipo, id);
        const estado = tipo === 'RECETA' ? d && d.Estado_Firma : d && d.Estado;
        if (!d || Number(d.ID_Medico) !== yo || estado !== PENDIENTE || d.Anulado) {
            resultado.push({ tipo, id, ok: false, motivo: 'No está pendiente de su firma.' });
            continue;
        }
        try {
            await emitirPdf(pool, req, tipo, id, firma);
            resultado.push({ tipo, id, ok: true, numero: numero[tipo](id) });
        } catch (e) {
            resultado.push({ tipo, id, ok: false, motivo: e.message });
        }
    }
    return resultado;
}

/**
 * Texto de trazabilidad del plan / procedimiento ("Plan #12 · Endodoncia · pieza 36 · 05/11/2026").
 * Devuelve null si el plan no existe o no es de ese paciente.
 */
async function textoAtencion(pool, idPlan, idPaciente) {
    const r = await pool.request().input('plan', sql.Int, idPlan).input('pac', sql.Int, idPaciente).query(`
        SELECT t.ID_Plan, ISNULL(t.Nombre_Tratamiento, p.Nombre_Prestacion) AS Nombre, t.Numero_Diente, t.Fecha_Inicio, t.CIE_Cod
        FROM Tratamientos_Plan t LEFT JOIN Prestaciones p ON p.ID_Prestacion = t.ID_Prestacion
        WHERE t.ID_Plan = @plan AND t.ID_Paciente = @pac`);
    const p = r.recordset[0];
    if (!p) return null;
    const f = p.Fecha_Inicio ? new Date(p.Fecha_Inicio) : null;
    const fecha = f ? `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}` : '';
    return [`Plan #${p.ID_Plan}`, p.Nombre, p.Numero_Diente ? `pieza ${p.Numero_Diente}` : '', p.CIE_Cod ? `CIE-10 ${p.CIE_Cod}` : '', fecha]
        .filter(Boolean).join(' · ').slice(0, 400);
}

function rutaPdf(tipo, d) {
    return d && d.Archivo_PDF ? path.join(CARPETAS[tipo](), path.basename(d.Archivo_PDF)) : null;
}

module.exports = {
    PENDIENTE, numero, NOMBRE_DOC, basePublica, prefijoTenant, cargar, emitirPdf, procesarFirma,
    listarPendientes, firmarPendientes, rutaPdf, avisarMedico, textoAtencion
};
