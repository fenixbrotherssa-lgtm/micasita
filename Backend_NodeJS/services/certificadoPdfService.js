// =====================================================================
//  PDF DEL CERTIFICADO MÉDICO (pdfkit, A4)
//  Tipos: REPOSO (reposo médico), ASISTENCIA (constancia de atención),
//         SALUD (certificado de salud / aptitud).
// =====================================================================
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const AZUL = '#1e3a8a';
const GRIS = '#475569';
const GRIS_CLARO = '#94a3b8';
const BORDE = '#cbd5e1';
const FONDO = '#f1f5f9';

const TITULOS = {
    REPOSO: { titulo: 'CERTIFICADO MÉDICO', subtitulo: 'Reposo médico' },
    ASISTENCIA: { titulo: 'CERTIFICADO MÉDICO', subtitulo: 'Constancia de atención médica' },
    SALUD: { titulo: 'CERTIFICADO MÉDICO', subtitulo: 'Certificado de salud' }
};

// ---------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------
const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
    'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function numeroALetras(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n < 30) return UNIDADES[n];
    if (n < 100) { const d = Math.floor(n / 10), u = n % 10; return DECENAS[d] + (u ? ' y ' + UNIDADES[u] : ''); }
    if (n === 100) return 'cien';
    if (n < 1000) { const c = Math.floor(n / 100), r = n % 100; return CENTENAS[c] + (r ? ' ' + numeroALetras(r) : ''); }
    return String(n);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Las fechas DATE llegan de mssql como Date a medianoche local; se formatean sin zona.
function aFecha(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}
function fechaLarga(v) {
    const d = aFecha(v);
    return d ? `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` : '—';
}
function fechaCorta(v) {
    const d = aFecha(v);
    return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—';
}
function edad(fechaNac) {
    const d = aFecha(fechaNac);
    if (!d) return '—';
    const h = new Date();
    let e = h.getFullYear() - d.getFullYear();
    if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) e--;
    return `${e} años`;
}
function tratamiento(genero) {
    const g = String(genero || '').trim().toUpperCase();
    if (g === 'F' || g.includes('FEM') || g.includes('MUJ')) return { el: 'la', paciente: 'la paciente', atendido: 'atendida' };
    if (g === 'M' || g === 'H' || g.includes('MASC') || g.includes('HOMB')) return { el: 'el', paciente: 'el paciente', atendido: 'atendido' };
    return { el: 'el/la', paciente: 'el/la paciente', atendido: 'atendido(a)' };
}
const limpio = v => String(v == null ? '' : v).trim();
// "juan jose CASTILLO" → "Juan Jose Castillo" (los nombres suelen venir en minúsculas o mayúsculas)
const nombrePropio = v => limpio(v).toLocaleLowerCase('es').replace(/(^|[\s'-])([a-záéíóúñü])/g, (m, a, l) => a + l.toLocaleUpperCase('es'));

// ---------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------
/**
 * @param {object} d datos combinados: certificado + paciente + clínica + médico
 *   d.urlVerificacion, d.firma ({titular, emisor} | null)
 * @returns {Promise<Buffer>}
 */
async function generarCertificadoPdf(d) {
    const qr = await QRCode.toBuffer(d.urlVerificacion, { margin: 1, width: 220, errorCorrectionLevel: 'M' });

    return await new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 45, bottom: 45, left: 55, right: 55 },
            info: {
                Title: `Certificado médico ${d.numero}`,
                Author: limpio(d.Nombre_Clinica) || 'AMETRA OS',
                Subject: TITULOS[d.Tipo]?.subtitulo || 'Certificado médico',
                Creator: 'AMETRA OS — CasRodsoft'
            }
        });
        const partes = [];
        doc.on('data', c => partes.push(c));
        doc.on('end', () => resolve(Buffer.concat(partes)));
        doc.on('error', reject);

        const W = doc.page.width, IZQ = doc.page.margins.left, DER = W - doc.page.margins.right, ANCHO = DER - IZQ;
        const t = tratamiento(d.Genero);

        // ── MEMBRETE ──────────────────────────────────────────────
        let yTop = 40;
        let xTexto = IZQ;
        if (d.rutaLogo && fs.existsSync(d.rutaLogo)) {
            try { doc.image(d.rutaLogo, IZQ, yTop, { fit: [70, 60] }); xTexto = IZQ + 82; } catch (_) { /* formato no soportado */ }
        }
        doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(15).text(limpio(d.Nombre_Clinica) || 'Establecimiento de salud', xTexto, yTop + 2, { width: DER - xTexto });
        doc.fillColor(GRIS).font('Helvetica').fontSize(8.5);
        const lineasClinica = [
            d.RUC ? `RUC: ${d.RUC}` : '',
            [limpio(d.Direccion_Clinica), limpio(d.Ciudad_Clinica)].filter(Boolean).join(' · '),
            d.Telefono_Clinica ? `Teléfono: ${d.Telefono_Clinica}` : ''
        ].filter(Boolean);
        lineasClinica.forEach(l => doc.text(l, xTexto, doc.y + 1, { width: DER - xTexto }));
        const yLinea = Math.max(doc.y, yTop + 62) + 8;
        doc.moveTo(IZQ, yLinea).lineTo(DER, yLinea).lineWidth(2).strokeColor(AZUL).stroke();
        doc.moveTo(IZQ, yLinea + 3).lineTo(DER, yLinea + 3).lineWidth(0.5).strokeColor(BORDE).stroke();

        // ── TÍTULO ────────────────────────────────────────────────
        doc.y = yLinea + 18;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(19).text(TITULOS[d.Tipo].titulo, IZQ, doc.y, { width: ANCHO, align: 'center', characterSpacing: 1.5 });
        doc.fillColor(AZUL).font('Helvetica').fontSize(10.5).text(TITULOS[d.Tipo].subtitulo.toUpperCase(), { width: ANCHO, align: 'center', characterSpacing: 1 });
        doc.moveDown(0.3);
        doc.fillColor(GRIS).fontSize(8.5).text(`N.° ${d.numero}   ·   Emitido: ${fechaCorta(d.Fecha_Emision)}`, { width: ANCHO, align: 'center' });

        // ── DATOS DEL PACIENTE ────────────────────────────────────
        const seccion = (titulo) => {
            doc.moveDown(0.9);
            const y = doc.y;
            doc.rect(IZQ, y, ANCHO, 17).fill(FONDO);
            doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(8.5).text(titulo.toUpperCase(), IZQ + 8, y + 5, { width: ANCHO - 16, characterSpacing: 0.8 });
            doc.y = y + 23;
        };
        const tablaDatos = (filas) => {
            // filas: [[etiqueta, valor, etiqueta, valor], ...]
            const colW = ANCHO / 2;
            filas.forEach(f => {
                const y = doc.y;
                let alto = 0;
                [0, 1].forEach(i => {
                    const x = IZQ + i * colW;
                    if (!f[i * 2]) return;
                    doc.fillColor(GRIS_CLARO).font('Helvetica-Bold').fontSize(7).text(f[i * 2].toUpperCase(), x + 8, y, { width: colW - 16 });
                    doc.fillColor('#0f172a').font('Helvetica').fontSize(9.5).text(limpio(f[i * 2 + 1]) || '—', x + 8, y + 9, { width: colW - 16 });
                    alto = Math.max(alto, doc.y - y);
                });
                doc.y = y + alto + 6;
            });
        };

        seccion('Datos del paciente');
        tablaDatos([
            ['Apellidos y nombres', nombrePropio(`${limpio(d.Apellidos_Paciente)} ${limpio(d.Nombres_Paciente)}`), 'Cédula / Identificación', d.DNI],
            ['Edad', edad(d.Fecha_Nacimiento), 'Historia clínica N.°', d.Historia_Clinica],
            ['Fecha de atención', fechaLarga(d.Fecha_Atencion) + (d.Hora_Entrada ? `  (${d.Hora_Entrada}${d.Hora_Salida ? ' – ' + d.Hora_Salida : ''})` : ''), 'Ocupación', d.Ocupacion]
        ]);

        // ── CUERPO ────────────────────────────────────────────────
        seccion('Certificación');
        const nombreMedico = nombrePropio(d.Nombre_Medico_Snapshot);
        const nombrePaciente = `${limpio(d.Nombres_Paciente)} ${limpio(d.Apellidos_Paciente)}`.trim().toUpperCase();
        const estab = limpio(d.Nombre_Clinica) || 'este establecimiento de salud';
        let cuerpo = `Yo, Dr(a). ${nombreMedico}${d.Registro_Medico_Snapshot ? `, con registro profesional ${d.Registro_Medico_Snapshot}` : ''}, CERTIFICO que ${t.paciente} ${nombrePaciente}, con documento de identidad N.° ${limpio(d.DNI) || '—'}, fue ${t.atendido} en ${estab} el día ${fechaLarga(d.Fecha_Atencion)}`;

        if (d.Tipo === 'REPOSO') {
            const dias = Number(d.Dias_Reposo) || 0;
            cuerpo += `${d.Motivo ? `, por ${limpio(d.Motivo).replace(/\.$/, '')}` : ''}; y, por su condición de salud, requiere REPOSO MÉDICO de ${dias} (${numeroALetras(dias)}) día${dias === 1 ? '' : 's'}, desde el ${fechaLarga(d.Reposo_Desde)} hasta el ${fechaLarga(d.Reposo_Hasta)}, inclusive.`;
        } else if (d.Tipo === 'ASISTENCIA') {
            cuerpo += d.Hora_Entrada
                ? `, permaneciendo en atención desde las ${d.Hora_Entrada}${d.Hora_Salida ? ` hasta las ${d.Hora_Salida}` : ''}`
                : '';
            cuerpo += `${d.Motivo ? `, por ${limpio(d.Motivo).replace(/\.$/, '')}` : ''}.`;
        } else {
            const resultado = limpio(d.Resultado_Aptitud) || 'APTO';
            cuerpo += `; y que, luego de la valoración clínica realizada, se encuentra ${resultado.toUpperCase()}${d.Actividad_Aptitud ? ` para ${limpio(d.Actividad_Aptitud).replace(/\.$/, '')}` : ''}.`;
        }
        doc.fillColor('#1e293b').font('Helvetica').fontSize(10.5).text(cuerpo, IZQ + 4, doc.y, { width: ANCHO - 8, align: 'justify', lineGap: 3 });

        // ── DETALLE CLÍNICO ───────────────────────────────────────
        seccion('Detalle clínico');
        const diagnostico = d.Mostrar_Diagnostico && (d.CIE10_Cod || d.CIE10_Texto)
            ? `${d.CIE10_Cod ? d.CIE10_Cod + ' — ' : ''}${limpio(d.CIE10_Texto)}`
            : 'Reservado por confidencialidad médica (Ley Orgánica de Protección de Datos Personales).';
        const filasDetalle = [['Diagnóstico (CIE-10)', diagnostico, d.Tipo === 'REPOSO' ? 'Tipo de contingencia' : '', d.Contingencia]];
        if (d.Tipo === 'REPOSO') filasDetalle.push(['Días de reposo', `${d.Dias_Reposo} (${numeroALetras(d.Dias_Reposo)})`, 'Período', `${fechaCorta(d.Reposo_Desde)} al ${fechaCorta(d.Reposo_Hasta)}`]);
        if (d.Tipo === 'SALUD') filasDetalle.push(['Resultado', d.Resultado_Aptitud, 'Actividad evaluada', d.Actividad_Aptitud]);
        tablaDatos(filasDetalle);
        if (limpio(d.Observaciones)) {
            doc.fillColor(GRIS_CLARO).font('Helvetica-Bold').fontSize(7).text('OBSERVACIONES / RECOMENDACIONES', IZQ + 8, doc.y);
            doc.fillColor('#0f172a').font('Helvetica').fontSize(9.5).text(limpio(d.Observaciones), IZQ + 8, doc.y + 2, { width: ANCHO - 16, align: 'justify', lineGap: 2 });
        }

        // ── CIERRE ────────────────────────────────────────────────
        doc.moveDown(1);
        doc.fillColor('#1e293b').font('Helvetica').fontSize(10)
            .text('Se extiende el presente certificado a petición de la parte interesada, para los fines que estime pertinentes.', IZQ + 4, doc.y, { width: ANCHO - 8, align: 'justify' });
        doc.moveDown(0.5);
        doc.text(`${limpio(d.Ciudad_Clinica) || 'Ecuador'}, ${fechaLarga(d.Fecha_Emision)}.`, { width: ANCHO - 8, align: 'right' });

        // ── FIRMA + QR (anclados al pie de la página) ─────────────
        const altoPie = 150;
        let yPie = Math.max(doc.y + 20, doc.page.height - doc.page.margins.bottom - altoPie - 18);
        if (yPie + altoPie > doc.page.height - doc.page.margins.bottom) { doc.addPage(); yPie = doc.page.margins.top + 40; }

        // QR a la izquierda
        doc.image(qr, IZQ, yPie + 10, { width: 92 });
        doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(6.5).text('VERIFIQUE ESTE CERTIFICADO', IZQ, yPie + 106, { width: 100, align: 'center' });
        doc.font('Helvetica').fontSize(6).fillColor(GRIS_CLARO).text('Escanee el código para comprobar su autenticidad.', IZQ, doc.y + 1, { width: 100, align: 'center' });

        // Bloque de firma centrado en el espacio restante
        const xFirma = IZQ + 130, wFirma = DER - xFirma;
        if (d.firma) {
            doc.roundedRect(xFirma + 20, yPie + 8, wFirma - 40, 54, 6).lineWidth(0.8).strokeColor('#16a34a').stroke();
            doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(8).text('FIRMADO ELECTRÓNICAMENTE POR:', xFirma + 28, yPie + 15, { width: wFirma - 56, align: 'center' });
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(limpio(d.firma.titular).toUpperCase(), xFirma + 28, doc.y + 2, { width: wFirma - 56, align: 'center' });
            doc.fillColor(GRIS).font('Helvetica').fontSize(6.8).text(`${d.firma.emisor ? 'Certificado: ' + d.firma.emisor + ' · ' : ''}Validar en FirmaEC (firmaec.gob.ec)`, xFirma + 28, doc.y + 2, { width: wFirma - 56, align: 'center' });
        }
        const yLineaFirma = yPie + 82;
        doc.moveTo(xFirma + 50, yLineaFirma).lineTo(DER - 50, yLineaFirma).lineWidth(0.8).strokeColor('#334155').stroke();
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(`Dr(a). ${nombreMedico}`, xFirma, yLineaFirma + 5, { width: wFirma, align: 'center' });
        doc.fillColor(GRIS).font('Helvetica').fontSize(8.5);
        [
            limpio(d.Especialidad_Medico) || 'Médico tratante',
            [d.Cedula_Medico_Snapshot ? `C.I. ${d.Cedula_Medico_Snapshot}` : '', d.Registro_Medico_Snapshot ? `Reg. ${d.Registro_Medico_Snapshot}` : ''].filter(Boolean).join('   ·   ')
        ].filter(Boolean).forEach(l => doc.text(l, xFirma, doc.y + 1, { width: wFirma, align: 'center' }));
        if (!d.firma) doc.fontSize(7).fillColor(GRIS_CLARO).text('Firma y sello', xFirma, doc.y + 1, { width: wFirma, align: 'center' });

        // ── PIE ───────────────────────────────────────────────────
        // El pie va dentro del margen inferior: sin esto pdfkit abre una página nueva vacía
        const yFooter = doc.page.height - doc.page.margins.bottom + 12;
        doc.page.margins.bottom = 0;
        doc.moveTo(IZQ, yFooter - 6).lineTo(DER, yFooter - 6).lineWidth(0.5).strokeColor(BORDE).stroke();
        doc.fillColor(GRIS_CLARO).font('Helvetica').fontSize(6.5)
            .text(`Documento generado por AMETRA OS · Código de verificación: ${d.Token.slice(0, 12).toUpperCase()}`, IZQ, yFooter - 2, { width: ANCHO, align: 'center', lineBreak: false });

        doc.end();
    });
}

module.exports = { generarCertificadoPdf, numeroALetras, fechaLarga };
