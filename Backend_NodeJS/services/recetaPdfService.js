// =====================================================================
//  PDF de la receta médica (A5), con firma electrónica opcional y QR.
// =====================================================================
const { crearDocumentoA5, fechaLarga, fechaCorta, edad, nombrePropio, limpio } = require('./documentoPdfBase');

/**
 * @param {object} d receta + paciente + clínica + médico
 *   d.medicamentos [{nombre, dosis, frecuencia, duracion}], d.urlVerificacion, d.firma
 * @returns {Promise<Buffer>}
 */
async function generarRecetaPdf(d) {
    const h = crearDocumentoA5({ titulo: `Receta médica ${d.numero}`, autor: limpio(d.Nombre_Clinica), asunto: 'Receta médica' });
    const { doc, IZQ, ANCHO } = h;

    h.membrete(d);
    h.titulo('RECETA MÉDICA', `N.° ${d.numero}   ·   ${fechaLarga(d.Fecha)}`);

    h.seccion('Paciente');
    h.tablaDatos([
        ['Apellidos y nombres', nombrePropio(`${limpio(d.Apellidos_Paciente)} ${limpio(d.Nombres_Paciente)}`), 'Cédula', d.DNI],
        ['Edad', edad(d.Fecha_Nacimiento), 'Diagnóstico (CIE-10)', d.CIE10_Cod ? `${d.CIE10_Cod}${d.CIE10_Texto ? ' — ' + d.CIE10_Texto : ''}` : '—']
    ]);
    if (limpio(d.Atencion_Texto)) h.tablaDatos([['Atención / tratamiento relacionado', d.Atencion_Texto]]);

    // ── Rp. ──
    h.seccion('Rp. / Prescripción');
    const meds = Array.isArray(d.medicamentos) ? d.medicamentos : [];
    if (!meds.length) h.texto('Sin medicamentos registrados.');
    meds.forEach((m, i) => {
        const y = doc.y;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(`${i + 1}. ${limpio(m.nombre)}`, IZQ + 6, y, { width: ANCHO - 12 });
        const detalle = [m.dosis && `Dosis: ${limpio(m.dosis)}`, m.via && `Vía: ${limpio(m.via)}`, m.frecuencia && `Frecuencia: ${limpio(m.frecuencia)}`, m.duracion && `Duración: ${limpio(m.duracion)}`].filter(Boolean).join('   ·   ');
        if (detalle) doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(detalle, IZQ + 16, doc.y + 1, { width: ANCHO - 22 });
        doc.y += 3;
    });

    if (limpio(d.Indicaciones_Generales)) {
        h.seccion('Indicaciones');
        h.texto(limpio(d.Indicaciones_Generales), { align: 'justify' });
    }
    if (d.Proxima_Cita) {
        doc.moveDown(0.4);
        h.texto(`Próximo control: ${fechaLarga(d.Proxima_Cita)}`, { negrita: true });
    }

    await h.firmaYQr({
        urlVerificacion: d.urlVerificacion, leyendaQr: 'VERIFIQUE ESTA RECETA', firma: d.firma,
        nombreMedico: d.Nombre_Medico, especialidad: d.Especialidad_Medico, cedula: d.Cedula_Medico, registro: d.Registro_Medico
    });
    h.pie(`Documento generado por AMETRA OS · ${fechaCorta(d.Fecha)} · Código: ${String(d.Codigo_Verificacion || '').slice(0, 12).toUpperCase()}`);
    return h.terminar();
}

module.exports = { generarRecetaPdf };
