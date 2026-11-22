// =====================================================================
//  /api/documentos — bandeja de firma del médico, PDF y envío por WhatsApp
//  (certificados, recetas y órdenes de exámenes)
// =====================================================================
const fs = require('fs');
const { getConnection } = require('../config/db');
const docs = require('../services/documentosFirmaService');

const TIPOS = ['CERTIFICADO', 'RECETA', 'ORDEN'];

// GET /api/documentos/pendientes — lo que espera MI firma
const pendientes = async (req, res) => {
    try {
        const pool = await getConnection();
        res.json(await docs.listarPendientes(pool, req.usuarioAuth.id_usuario));
    } catch (e) {
        console.error('❌ pendientes de firma:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar la bandeja de firmas.' });
    }
};

// POST /api/documentos/pendientes/firmar  { items: [{tipo, id}], pin, url_publica }
const firmarPendientes = async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (!items.length) return res.status(400).json({ status: 'Error', message: 'Seleccione los documentos a firmar.' });
    if (!req.body?.pin) return res.status(400).json({ status: 'Error', message: 'Ingrese el PIN de su firma electrónica.' });
    try {
        const pool = await getConnection();
        const resultado = await docs.firmarPendientes(pool, req, items, String(req.body.pin));
        const ok = resultado.filter(r => r.ok).length;
        res.json({
            status: ok ? 'Success' : 'Error',
            message: ok === resultado.length ? `${ok} documento(s) firmado(s).` : `${ok} de ${resultado.length} firmado(s).`,
            resultado
        });
    } catch (e) {
        // PIN errado, firma vencida, etc.
        res.status(400).json({ status: 'Error', message: e.message });
    }
};

async function obtenerPdf(pool, req, tipo, id) {
    const d = await docs.cargar(pool, tipo, id);
    if (!d) return { error: 404, message: 'Documento no encontrado.' };
    const estado = tipo === 'RECETA' ? d.Estado_Firma : d.Estado;
    if (estado === docs.PENDIENTE) return { error: 409, message: 'El documento está pendiente de la firma del médico.' };
    if (d.Anulado) return { error: 409, message: 'El documento está anulado.' };
    let ruta = docs.rutaPdf(tipo, d);
    // Receta u orden sin PDF todavía: se genera sin firma electrónica (firma y sello manuscritos)
    if ((!ruta || !fs.existsSync(ruta)) && tipo !== 'CERTIFICADO') {
        await docs.emitirPdf(pool, req, tipo, id, null);
        ruta = docs.rutaPdf(tipo, await docs.cargar(pool, tipo, id));
    }
    if (!ruta || !fs.existsSync(ruta)) return { error: 404, message: 'PDF no encontrado.' };
    return { d, ruta };
}

// GET /api/documentos/:tipo/:id/pdf
const pdf = async (req, res) => {
    const tipo = String(req.params.tipo || '').toUpperCase();
    const id = parseInt(req.params.id, 10);
    if (!TIPOS.includes(tipo) || !id) return res.status(400).json({ status: 'Error', message: 'Documento no válido.' });
    try {
        const pool = await getConnection();
        const r = await obtenerPdf(pool, req, tipo, id);
        if (r.error) return res.status(r.error).json({ status: 'Error', message: r.message });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${docs.numero[tipo](id)}.pdf"`);
        fs.createReadStream(r.ruta).pipe(res);
    } catch (e) {
        console.error('❌ pdf documento:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo obtener el PDF: ' + e.message });
    }
};

// POST /api/documentos/:tipo/:id/whatsapp  { telefono? }
const whatsapp = async (req, res) => {
    const tipo = String(req.params.tipo || '').toUpperCase();
    const id = parseInt(req.params.id, 10);
    if (!TIPOS.includes(tipo) || !id) return res.status(400).json({ status: 'Error', message: 'Documento no válido.' });
    try {
        const pool = await getConnection();
        const r = await obtenerPdf(pool, req, tipo, id);
        if (r.error) return res.status(r.error).json({ status: 'Error', message: r.message });
        const telefono = String(req.body?.telefono || r.d.Telefono_Paciente || '').trim();
        const nombre = String(r.d.Nombres_Paciente || '').trim().split(/\s+/)[0] || '';
        const clinica = r.d.Nombre_Clinica || 'su clínica';
        const firmado = r.d.Firma_Titular ? ' firmado electrónicamente' : '';
        const mensaje = `Hola ${nombre} 👋, ${clinica} le envía su ${docs.NOMBRE_DOC[tipo]} ${docs.numero[tipo](id)}${firmado}.\nPuede comprobar su autenticidad escaneando el código QR del documento.`;
        const { enviarDocumento } = require('../services/whatsappService');
        // En el SaaS cada clínica tiene su propio WhatsApp (el 5.º parámetro); on-premise lo ignora
        const envio = await enviarDocumento(telefono, fs.readFileSync(r.ruta), `${docs.numero[tipo](id)}.pdf`, mensaje, req.usuarioAuth && req.usuarioAuth.id_tenant);
        if (!envio.success) return res.status(400).json({ status: 'Error', message: envio.motivo || 'No se pudo enviar por WhatsApp.' });
        res.json({ status: 'Success', message: `Enviado por WhatsApp al ${telefono}.` });
    } catch (e) {
        console.error('❌ whatsapp documento:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo enviar: ' + e.message });
    }
};

module.exports = { pendientes, firmarPendientes, pdf, whatsapp };
