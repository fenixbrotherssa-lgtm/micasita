// =====================================================================
//  PDF de la orden de exámenes (laboratorio / imagen) A5, con firma y QR.
// =====================================================================
const { crearDocumentoA5, fechaLarga, fechaCorta, edad, nombrePropio, limpio } = require('./documentoPdfBase');

const TITULOS = { LABORATORIO: 'ORDEN DE LABORATORIO', IMAGEN: 'ORDEN DE IMAGEN', OTRO: 'ORDEN DE EXÁMENES' };

async function generarOrdenPdf(d) {
    const titulo = TITULOS[d.Tipo] || TITULOS.OTRO;
    const h = crearDocumentoA5({ titulo: `${titulo} ${d.numero}`, autor: limpio(d.Nombre_Clinica), asunto: titulo });
    const { doc, IZQ, ANCHO } = h;

    h.membrete(d);
    h.titulo(titulo, `N.° ${d.numero}   ·   ${fechaLarga(d.Fecha)}${d.Prioridad === 'URGENTE' ? '   ·   URGENTE' : ''}`);

    h.seccion('Paciente');
    h.tablaDatos([
        ['Apellidos y nombres', nombrePropio(`${limpio(d.Apellidos_Paciente)} ${limpio(d.Nombres_Paciente)}`), 'Cédula', d.DNI],
        ['Edad', edad(d.Fecha_Nacimiento), 'Diagnóstico presuntivo (CIE-10)', d.CIE10_Cod ? `${d.CIE10_Cod}${d.CIE10_Texto ? ' — ' + d.CIE10_Texto : ''}` : '—']
    ]);
    const extra = [];
    if (limpio(d.Atencion_Texto)) extra.push(['Atención / tratamiento relacionado', d.Atencion_Texto, '', '']);
    if (limpio(d.Convenio_Texto)) extra.push(['Convenio / seguro', d.Convenio_Texto, '', '']);
    if (limpio(d.Destino)) extra.push(['Laboratorio / centro de destino', d.Destino, '', '']);
    if (extra.length) h.tablaDatos(extra);

    h.seccion('Exámenes solicitados');
    const examenes = Array.isArray(d.examenes) ? d.examenes : [];
    examenes.forEach((e, i) => {
        // casilla para que el laboratorio marque lo realizado (Helvetica no trae el carácter ☐)
        doc.rect(IZQ + 6, doc.y + 1, 7, 7).lineWidth(0.6).strokeColor('#334155').stroke();
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(`${i + 1}. ${limpio(e.nombre)}`, IZQ + 18, doc.y, { width: ANCHO - 24 });
        if (limpio(e.indicacion)) doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(limpio(e.indicacion), IZQ + 22, doc.y + 1, { width: ANCHO - 28 });
        doc.y += 3;
    });

    if (limpio(d.Indicaciones)) {
        h.seccion('Indicaciones / preparación');
        h.texto(limpio(d.Indicaciones), { align: 'justify' });
    }

    await h.firmaYQr({
        urlVerificacion: d.urlVerificacion, leyendaQr: 'VERIFIQUE ESTA ORDEN', firma: d.firma,
        nombreMedico: d.Nombre_Medico, especialidad: d.Especialidad_Medico, cedula: d.Cedula_Medico, registro: d.Registro_Medico
    });
    h.pie(`Documento generado por AMETRA OS · ${fechaCorta(d.Fecha)} · Código: ${String(d.Codigo_Verificacion || '').slice(0, 12).toUpperCase()}`);
    return h.terminar();
}

module.exports = { generarOrdenPdf };
