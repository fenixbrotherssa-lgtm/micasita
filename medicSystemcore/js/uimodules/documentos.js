// =====================================================================
//  MÓDULO COMÚN DE DOCUMENTOS FIRMABLES (certificado, receta, orden)
//  - Selector de plan / procedimiento relacionado (trazabilidad)
//  - Bloque de firma: médico (con su PIN) / clínica / sin firma
//  - Vista previa del PDF (pdf.js), descarga y envío por WhatsApp
//  - Bandeja "Pendientes de firma" del médico (firma en lote con su PIN)
// =====================================================================
window.documentosUI = (function () {

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sesion = () => { try { return JSON.parse(localStorage.getItem('usuario_sesion') || '{}'); } catch (_) { return {}; } };
    const yo = () => Number(sesion().ID_Usuario || sesion().id_usuario || 0);
    const urlPublica = () => (window.api.publicURL || window.api.baseURL || '').replace(/\/api\/?$/, '');
    const fecha = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('es-EC'); };
    const NOMBRES = { CERTIFICADO: 'Certificado', RECETA: 'Receta', ORDEN: 'Orden de exámenes' };

    // -----------------------------------------------------------------
    // Trazabilidad: planes del paciente
    // -----------------------------------------------------------------
    async function selectorPlan(idPaciente, idSelect, estilo) {
        let planes = [];
        try { planes = await window.api.get(`/tratamientos/paciente/${idPaciente}`); } catch (_) { }
        if (!Array.isArray(planes)) planes = [];
        const opciones = planes.map(p => {
            const partes = [`#${p.ID_Plan}`, p.Nombre_Tratamiento, p.Numero_Diente ? `pieza ${p.Numero_Diente}` : '', fecha(p.Fecha_Inicio), p.Estado_Tratamiento || ''];
            return `<option value="${p.ID_Plan}">${esc(partes.filter(Boolean).join(' · '))}</option>`;
        }).join('');
        return `<select id="${idSelect}" style="${estilo || ''}"><option value="">— Sin relacionar a un tratamiento —</option>${opciones}</select>`;
    }

    // -----------------------------------------------------------------
    // Bloque de firma (se dibuja dentro de `caja`)
    // -----------------------------------------------------------------
    async function bloqueFirma(caja, idMedico, nombreMedico) {
        caja.innerHTML = '<div style="color:#64748b;font-size:12.5px;">Consultando firmas...</div>';
        const e = await window.api.get(`/certificados/firmas/estado?id_medico=${idMedico}`).catch(() => null) || { clinica: {}, medico: {} };
        const soyElMedico = yo() === Number(idMedico);
        const opcion = (valor, titulo, info, habilitada, motivoNo) => `
            <label style="display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border-radius:8px;background:${habilitada ? '#f8fafc' : '#fafafa'};cursor:${habilitada ? 'pointer' : 'not-allowed'};opacity:${habilitada ? 1 : .6};">
                <input type="radio" name="doc-firma" value="${valor}" ${habilitada ? '' : 'disabled'} style="margin-top:3px;">
                <span><b style="color:#1e293b;">${titulo}</b><br><small>${habilitada ? info : motivoNo}</small></span>
            </label>`;
        const fmt = f => `${esc(f.titular)} · vence ${new Date(f.vence).toLocaleDateString('es-EC')}`;
        const infoMedico = e.medico && e.medico.disponible
            ? fmt(e.medico) + (soyElMedico
                ? '<br><span style="color:#4f46e5;">Escriba su PIN para firmar ahora, o déjelo vacío y fírmelo luego desde su bandeja.</span>'
                : `<br><span style="color:#b45309;">Quedará <b>pendiente</b>: el Dr(a). ${esc(nombreMedico || '')} recibirá el aviso y lo firmará con su PIN.</span>`)
            : '';
        caja.innerHTML =
            opcion('MEDICO', 'Firma electrónica del médico', infoMedico, !!(e.medico && e.medico.disponible),
                e.medico && e.medico.vencida ? 'La firma del médico está vencida.' : 'El médico no ha cargado su firma personal (opcional).') +
            `<div id="doc-firma-pin-caja" style="display:none;padding:2px 9px 6px 30px;">
                <input type="password" id="doc-firma-pin" autocomplete="new-password" placeholder="PIN de su firma (contraseña del archivo .p12)"
                       style="width:100%;padding:8px 10px;border:1.5px solid #c7d2fe;border-radius:8px;font-size:13px;box-sizing:border-box;">
                <small style="color:#94a3b8;">El PIN no se guarda en el sistema.</small>
            </div>` +
            opcion('CLINICA', 'Firma electrónica de la clínica', e.clinica && e.clinica.disponible ? fmt(e.clinica) : '', !!(e.clinica && e.clinica.disponible),
                e.clinica && e.clinica.vencida ? 'La firma de la clínica está vencida.' : (e.clinica && e.clinica.error ? esc(e.clinica.error) : 'La clínica no ha cargado su firma (Facturación → Certificado).')) +
            opcion('NINGUNA', 'Sin firma electrónica', 'PDF para firma y sello manuscritos.', true, '');
        const pinCaja = caja.querySelector('#doc-firma-pin-caja');
        const actualizar = () => {
            const v = (caja.querySelector('input[name="doc-firma"]:checked') || {}).value;
            pinCaja.style.display = (v === 'MEDICO' && soyElMedico) ? 'block' : 'none';
        };
        caja.querySelectorAll('input[name="doc-firma"]').forEach(i => i.addEventListener('change', actualizar));
        const preferida = caja.querySelector('input[value="MEDICO"]:not([disabled])') || caja.querySelector('input[value="CLINICA"]:not([disabled])') || caja.querySelector('input[value="NINGUNA"]');
        if (preferida) preferida.checked = true;
        actualizar();
    }

    function leerFirma(caja) {
        const firma = ((caja || document).querySelector('input[name="doc-firma"]:checked') || {}).value || 'NINGUNA';
        const pinEl = (caja || document).querySelector('#doc-firma-pin');
        const pin = firma === 'MEDICO' && pinEl && pinEl.offsetParent !== null ? pinEl.value : '';
        return { firma, pin };
    }

    // -----------------------------------------------------------------
    // Vista previa (pdf.js) + descargar + WhatsApp
    // -----------------------------------------------------------------
    function cargarPDFJS() {
        const base = window.api.baseURL.replace(/\/api\/?$/, '');
        return new Promise((resolve, reject) => {
            if (window.pdfjsLib) return resolve(window.pdfjsLib);
            const s = document.createElement('script');
            s.src = `${base}/assets/js/pdf.min.js`;
            s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}/assets/js/pdf.worker.min.js`; resolve(window.pdfjsLib); };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async function verPdf(tipo, id, numero) {
        try {
            Swal.fire({ title: 'Abriendo documento...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const resp = await fetch(`${window.api.baseURL}/documentos/${tipo}/${id}/pdf?url_publica=${encodeURIComponent(urlPublica())}`, {
                headers: { 'Authorization': `Bearer ${window.api.getToken()}` }
            });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j.message || 'No se encontró el PDF.');
            }
            const bytes = await resp.arrayBuffer();
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            const r = await Swal.fire({
                title: `${NOMBRES[tipo] || 'Documento'} ${esc(numero || '')}`,
                width: '900px',
                html: `<div id="doc-pdf-vista" style="height:72vh;overflow:auto;background:#525659;border-radius:8px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="color:#e2e8f0;margin-top:40px;">Cargando vista previa...</div></div>`,
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: '<i class="fas fa-download"></i> Descargar',
                denyButtonText: '<i class="fab fa-whatsapp"></i> Enviar por WhatsApp',
                cancelButtonText: 'Cerrar',
                confirmButtonColor: '#4f46e5',
                denyButtonColor: '#16a34a',
                didOpen: async () => {
                    const cont = document.getElementById('doc-pdf-vista');
                    try {
                        const pdfjsLib = await cargarPDFJS();
                        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
                        cont.innerHTML = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const v1 = page.getViewport({ scale: 1 });
                            const vp = page.getViewport({ scale: Math.min((cont.clientWidth - 40) / v1.width, 2) });
                            const canvas = document.createElement('canvas');
                            canvas.width = vp.width; canvas.height = vp.height;
                            canvas.style.cssText = 'box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:100%;background:#fff;';
                            cont.appendChild(canvas);
                            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                        }
                    } catch (err) {
                        cont.innerHTML = `<div style="color:#fca5a5;margin-top:40px;text-align:center;">No se pudo mostrar la vista previa.<br><small>Use "Descargar".</small></div>`;
                    }
                },
                preConfirm: () => {
                    const a = document.createElement('a');
                    a.href = url; a.download = `${numero || tipo + '-' + id}.pdf`;
                    document.body.appendChild(a); a.click(); a.remove();
                    return false; // deja la vista abierta
                }
            });
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            if (r.isDenied) await enviarWhatsApp(tipo, id);
        } catch (e) {
            Swal.fire('Atención', e.message, 'info');
        }
    }

    async function enviarWhatsApp(tipo, id) {
        const r = await Swal.fire({
            title: 'Enviar por WhatsApp',
            text: 'Se enviará el PDF al teléfono registrado del paciente. Puede escribir otro número:',
            input: 'text', inputPlaceholder: 'Dejar vacío para usar el del paciente (ej. 0991234567)',
            showCancelButton: true, confirmButtonText: '<i class="fab fa-whatsapp"></i> Enviar', cancelButtonText: 'Cancelar', confirmButtonColor: '#16a34a'
        });
        if (!r.isConfirmed) return;
        Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.post(`/documentos/${tipo}/${id}/whatsapp`, { telefono: (r.value || '').trim(), url_publica: urlPublica() });
        Swal.fire(res && res.status === 'Success' ? 'Enviado' : 'No se pudo enviar', (res && res.message) || 'Error al enviar.', res && res.status === 'Success' ? 'success' : 'error');
    }

    /** Badge de estado de firma para listas. */
    function badgeFirma(estado, firmaTipo, titular) {
        if (estado === 'PENDIENTE_FIRMA') return `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;"><i class="fas fa-hourglass-half"></i> Pendiente de firma</span>`;
        if (firmaTipo) return `<span title="${esc(titular)}" style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;"><i class="fas fa-signature"></i> ${firmaTipo === 'MEDICO' ? 'Médico' : 'Clínica'}</span>`;
        return `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Manuscrita</span>`;
    }

    // -----------------------------------------------------------------
    // Bandeja del médico: documentos por firmar
    // -----------------------------------------------------------------
    async function bandejaFirmas() {
        const lista = await window.api.get('/documentos/pendientes').catch(() => []);
        if (!Array.isArray(lista) || !lista.length) return Swal.fire('Sin pendientes', 'No tiene documentos esperando su firma.', 'success');
        const filas = lista.map((d, i) => `
            <label style="display:flex;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid #f1f5f9;cursor:pointer;">
                <input type="checkbox" class="doc-pend" data-i="${i}" checked>
                <span style="flex:1;text-align:left;font-size:13px;">
                    <b>${esc(NOMBRES[d.Tipo_Documento])} ${esc(d.Numero)}</b>${d.Subtipo ? ` <small style="color:#64748b;">(${esc(d.Subtipo)})</small>` : ''}<br>
                    <small style="color:#475569;">${esc(d.Paciente)} · ${fecha(d.Fecha)}${d.Preparado_Por ? ' · preparado por ' + esc(d.Preparado_Por) : ''}</small>
                </span>
                <button type="button" class="doc-ver" data-i="${i}" style="background:#eef2ff;color:#4f46e5;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;" title="Ver datos"><i class="fas fa-eye"></i></button>
            </label>`).join('');
        let verIndice = null;
        const r = await Swal.fire({
            title: '<i class="fas fa-file-signature" style="color:#4f46e5;"></i> Documentos por firmar',
            width: '640px',
            html: `<div style="max-height:46vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;">${filas}</div>
                   <input type="password" id="doc-pend-pin" autocomplete="new-password" placeholder="PIN de su firma electrónica"
                          style="width:100%;margin-top:14px;padding:10px 12px;border:1.5px solid #c7d2fe;border-radius:8px;font-size:14px;box-sizing:border-box;">
                   <small style="color:#94a3b8;display:block;margin-top:4px;">Un solo PIN firma todos los seleccionados. El PIN no se guarda.</small>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-signature"></i> Firmar seleccionados', cancelButtonText: 'Cerrar', confirmButtonColor: '#4f46e5',
            didOpen: () => {
                document.querySelectorAll('.doc-ver').forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); verIndice = Number(b.dataset.i); Swal.clickCancel(); }));
            },
            preConfirm: () => {
                const items = [...document.querySelectorAll('.doc-pend:checked')].map(c => lista[Number(c.dataset.i)]).map(d => ({ tipo: d.Tipo_Documento, id: d.ID }));
                const pin = document.getElementById('doc-pend-pin').value;
                if (!items.length) return Swal.showValidationMessage('Seleccione al menos un documento');
                if (!pin) return Swal.showValidationMessage('Ingrese su PIN');
                return { items, pin };
            }
        });
        if (verIndice !== null) {
            const d = lista[verIndice];
            await Swal.fire({
                title: `${NOMBRES[d.Tipo_Documento]} ${d.Numero}`,
                html: `<div style="text-align:left;font-size:13px;line-height:1.7;"><b>Paciente:</b> ${esc(d.Paciente)} (${esc(d.DNI || '')})<br><b>Fecha:</b> ${fecha(d.Fecha)}<br>${d.Preparado_Por ? `<b>Preparado por:</b> ${esc(d.Preparado_Por)}<br>` : ''}<small style="color:#64748b;">Revise el detalle en la historia clínica del paciente antes de firmar.</small></div>`,
                confirmButtonText: 'Volver a la bandeja'
            });
            return bandejaFirmas();
        }
        if (!r.isConfirmed) return;
        Swal.fire({ title: 'Firmando electrónicamente...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.post('/documentos/pendientes/firmar', { ...r.value, url_publica: urlPublica() });
        const fallos = (res && res.resultado || []).filter(x => !x.ok);
        await Swal.fire(res && res.status === 'Success' ? 'Firmado' : 'Atención',
            ((res && res.message) || 'No se pudo firmar.') + (fallos.length ? '<br><small>' + fallos.map(f => esc(f.motivo)).join('<br>') + '</small>' : ''),
            res && res.status === 'Success' ? 'success' : 'warning');
        avisoPendientes();
        if (window.historiaModule && window.router && window.router.currentPatientId) {
            try { window.certificadosModule && window.certificadosModule.cargarLista(); } catch (_) { }
        }
    }

    // Aviso flotante para el médico con documentos por firmar (se refresca en tiempo real)
    async function avisoPendientes() {
        let lista = [];
        try { lista = await window.api.get('/documentos/pendientes'); } catch (_) { return; }
        let aviso = document.getElementById('aviso-firmas-pendientes');
        if (!Array.isArray(lista) || !lista.length) { if (aviso) aviso.remove(); return; }
        if (!aviso) {
            aviso = document.createElement('div');
            aviso.id = 'aviso-firmas-pendientes';
            aviso.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:9000;background:#4f46e5;color:white;border-radius:14px;padding:12px 16px;box-shadow:0 10px 30px rgba(79,70,229,.35);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px;';
            aviso.addEventListener('click', () => bandejaFirmas());
            document.body.appendChild(aviso);
        }
        aviso.innerHTML = `<i class="fas fa-file-signature" style="font-size:18px;"></i><span><b>${lista.length}</b> documento(s) por firmar<br><small style="opacity:.85;">Toque para firmar con su PIN</small></span>`;
    }

    // Tiempo real: el servidor avisa cuando hay un documento nuevo por firmar
    window.addEventListener('ametra-firmas-pendientes', ev => {
        if (!ev.detail || Number(ev.detail.id_medico) === yo()) avisoPendientes();
    });

    return { selectorPlan, bloqueFirma, leerFirma, verPdf, enviarWhatsApp, badgeFirma, bandejaFirmas, avisoPendientes, urlPublica };
})();
