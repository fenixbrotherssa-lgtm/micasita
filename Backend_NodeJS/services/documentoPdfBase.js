// =====================================================================
//  Base común de PDF clínicos A5 (receta, orden de exámenes):
//  membrete de la clínica, título, secciones, bloque de firma + QR y pie.
//  Mismo estilo que el certificado médico (services/certificadoPdfService.js).
// =====================================================================
const fs = require('fs');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { fechaLarga, fechaCorta, edad, nombrePropio, limpio } = require('./certificadoPdfService');

const AZUL = '#1e3a8a';
const GRIS = '#475569';
const GRIS_CLARO = '#94a3b8';
const BORDE = '#cbd5e1';
const FONDO = '#f1f5f9';

/**
 * Crea el documento y devuelve helpers de dibujo. Llamar a `terminar()` al final.
 * @param {object} o { titulo, autor, asunto }
 */
function crearDocumentoA5(o) {
    const doc = new PDFDocument({
        size: 'A5',
        margins: { top: 30, bottom: 32, left: 34, right: 34 },
        info: { Title: o.titulo, Author: o.autor || 'AMETRA OS', Subject: o.asunto || o.titulo, Creator: 'AMETRA OS — CasRodsoft' }
    });
    const partes = [];
    const promesa = new Promise((resolve, reject) => {
        doc.on('data', c => partes.push(c));
        doc.on('end', () => resolve(Buffer.concat(partes)));
        doc.on('error', reject);
    });
    const W = doc.page.width, IZQ = doc.page.margins.left, DER = W - doc.page.margins.right, ANCHO = DER - IZQ;

    const h = {
        doc, IZQ, DER, ANCHO,

        membrete(d) {
            const yTop = 26;
            let xTexto = IZQ;
            if (d.rutaLogo && fs.existsSync(d.rutaLogo)) {
                try { doc.image(d.rutaLogo, IZQ, yTop, { fit: [52, 44] }); xTexto = IZQ + 60; } catch (_) { /* formato no soportado */ }
            }
            doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(12).text(limpio(d.Nombre_Clinica) || 'Establecimiento de salud', xTexto, yTop + 1, { width: DER - xTexto });
            doc.fillColor(GRIS).font('Helvetica').fontSize(7);
            [
                d.RUC ? `RUC: ${d.RUC}` : '',
                [limpio(d.Direccion_Clinica), limpio(d.Ciudad_Clinica)].filter(Boolean).join(' · '),
                d.Telefono_Clinica ? `Teléfono: ${d.Telefono_Clinica}` : ''
            ].filter(Boolean).forEach(l => doc.text(l, xTexto, doc.y + 1, { width: DER - xTexto }));
            const yLinea = Math.max(doc.y, yTop + 46) + 6;
            doc.moveTo(IZQ, yLinea).lineTo(DER, yLinea).lineWidth(1.6).strokeColor(AZUL).stroke();
            doc.moveTo(IZQ, yLinea + 2.5).lineTo(DER, yLinea + 2.5).lineWidth(0.4).strokeColor(BORDE).stroke();
            doc.y = yLinea + 10;
        },

        titulo(texto, subtitulo) {
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(texto, IZQ, doc.y, { width: ANCHO, align: 'center', characterSpacing: 1.2 });
            if (subtitulo) doc.fillColor(GRIS).font('Helvetica').fontSize(7.5).text(subtitulo, { width: ANCHO, align: 'center' });
        },

        seccion(titulo) {
            doc.moveDown(0.6);
            const y = doc.y;
            doc.rect(IZQ, y, ANCHO, 14).fill(FONDO);
            doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(7).text(titulo.toUpperCase(), IZQ + 6, y + 4, { width: ANCHO - 12, characterSpacing: 0.6 });
            doc.y = y + 18;
        },

        // filas: [[etiqueta, valor, etiqueta, valor], ...]
        tablaDatos(filas) {
            const colW = ANCHO / 2;
            filas.forEach(f => {
                const y = doc.y;
                let alto = 0;
                const ancho = (f[2] ? colW : ANCHO);
                [0, 1].forEach(i => {
                    if (!f[i * 2]) return;
                    const x = IZQ + i * colW;
                    doc.fillColor(GRIS_CLARO).font('Helvetica-Bold').fontSize(6).text(f[i * 2].toUpperCase(), x + 6, y, { width: (i === 0 ? ancho : colW) - 12 });
                    doc.fillColor('#0f172a').font('Helvetica').fontSize(8).text(limpio(f[i * 2 + 1]) || '—', x + 6, y + 7.5, { width: (i === 0 ? ancho : colW) - 12 });
                    alto = Math.max(alto, doc.y - y);
                });
                doc.y = y + alto + 4;
            });
        },

        texto(t, opciones = {}) {
            doc.fillColor('#1e293b').font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(opciones.tam || 8.5)
                .text(t, IZQ + 6, doc.y, { width: ANCHO - 12, align: opciones.align || 'left', lineGap: 1.5 });
        },

        /**
         * Firma + QR anclados al pie. f = { qr (Buffer), leyendaQr, firma ({titular, emisor}|null),
         *   nombreMedico, especialidad, cedula, registro }
         */
        async firmaYQr(f) {
            const qr = await QRCode.toBuffer(f.urlVerificacion, { margin: 1, width: 180, errorCorrectionLevel: 'M' });
            const altoPie = 104;
            let yPie = Math.max(doc.y + 12, doc.page.height - doc.page.margins.bottom - altoPie - 12);
            if (yPie + altoPie > doc.page.height - doc.page.margins.bottom) { doc.addPage(); yPie = doc.page.margins.top + 20; }

            doc.image(qr, IZQ, yPie + 6, { width: 66 });
            doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(5.5).text(f.leyendaQr || 'VERIFIQUE ESTE DOCUMENTO', IZQ - 4, yPie + 75, { width: 74, align: 'center' });
            doc.font('Helvetica').fontSize(5).fillColor(GRIS_CLARO).text('Escanee el código para comprobar su autenticidad.', IZQ - 4, doc.y + 1, { width: 74, align: 'center' });

            const xFirma = IZQ + 86, wFirma = DER - xFirma;
            if (f.firma) {
                doc.roundedRect(xFirma + 10, yPie + 4, wFirma - 20, 40, 5).lineWidth(0.7).strokeColor('#16a34a').stroke();
                doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(6.3).text('FIRMADO ELECTRÓNICAMENTE POR:', xFirma + 16, yPie + 9, { width: wFirma - 32, align: 'center' });
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(limpio(f.firma.titular).toUpperCase(), xFirma + 16, doc.y + 1.5, { width: wFirma - 32, align: 'center' });
                doc.fillColor(GRIS).font('Helvetica').fontSize(5.5).text(`${f.firma.emisor ? 'Certificado: ' + f.firma.emisor + ' · ' : ''}Validar en FirmaEC (firmaec.gob.ec)`, xFirma + 16, doc.y + 1.5, { width: wFirma - 32, align: 'center' });
            }
            const yLinea = yPie + 58;
            doc.moveTo(xFirma + 30, yLinea).lineTo(DER - 30, yLinea).lineWidth(0.7).strokeColor('#334155').stroke();
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text(`Dr(a). ${nombrePropio(f.nombreMedico)}`, xFirma, yLinea + 4, { width: wFirma, align: 'center' });
            doc.fillColor(GRIS).font('Helvetica').fontSize(6.8);
            [
                limpio(f.especialidad) || 'Médico tratante',
                [f.cedula ? `C.I. ${f.cedula}` : '', f.registro ? `Reg. ${f.registro}` : ''].filter(Boolean).join('   ·   ')
            ].filter(Boolean).forEach(l => doc.text(l, xFirma, doc.y + 1, { width: wFirma, align: 'center' }));
            if (!f.firma) doc.fontSize(6).fillColor(GRIS_CLARO).text('Firma y sello', xFirma, doc.y + 1, { width: wFirma, align: 'center' });
        },

        pie(texto) {
            const yFooter = doc.page.height - doc.page.margins.bottom + 10;
            doc.page.margins.bottom = 0; // sin esto pdfkit abre una página vacía
            doc.moveTo(IZQ, yFooter - 5).lineTo(DER, yFooter - 5).lineWidth(0.4).strokeColor(BORDE).stroke();
            doc.fillColor(GRIS_CLARO).font('Helvetica').fontSize(5.5).text(texto, IZQ, yFooter - 2, { width: ANCHO, align: 'center', lineBreak: false });
        },

        terminar() { doc.end(); return promesa; }
    };
    return h;
}

module.exports = { crearDocumentoA5, fechaLarga, fechaCorta, edad, nombrePropio, limpio };
