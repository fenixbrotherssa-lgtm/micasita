// =====================================================================
//  MÓDULO: ÓRDENES DE EXÁMENES (laboratorio / imagen)
//  Firma electrónica (médico con PIN / clínica), QR, trazabilidad con el
//  plan, convenio del paciente y carga del resultado.
// =====================================================================
window.ordenesModule = (function () {

    const CATALOGO = {
        LABORATORIO: ['Biometría hemática completa', 'Glucosa en ayunas', 'Hemoglobina glicosilada (HbA1c)', 'Tiempo de protrombina (TP)',
            'Tiempo de tromboplastina parcial (TTP)', 'INR', 'Plaquetas', 'Urea', 'Creatinina', 'Perfil lipídico', 'TGO / TGP',
            'Elemental y microscópico de orina', 'Prueba de embarazo (β-hCG)', 'VIH (prueba rápida)', 'VDRL', 'Hepatitis B (HBsAg)',
            'Cultivo y antibiograma', 'Biopsia — estudio histopatológico', 'Grupo sanguíneo y factor Rh', 'Calcio sérico', 'Vitamina D'],
        IMAGEN: ['Radiografía panorámica', 'Radiografía periapical', 'Radiografía de aleta de mordida (bitewing)', 'Radiografía oclusal',
            'Radiografía cefálica lateral (cefalometría)', 'Tomografía Cone Beam (CBCT)', 'Tomografía de ATM', 'Resonancia magnética de ATM',
            'Ecografía', 'Radiografía de tórax', 'Fotografías intraorales / extraorales', 'Modelos de estudio / escaneo intraoral'],
        OTRO: ['Electrocardiograma', 'Valoración cardiológica prequirúrgica', 'Interconsulta', 'Espirometría']
    };

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sesion = () => { try { return JSON.parse(localStorage.getItem('usuario_sesion') || '{}'); } catch (_) { return {}; } };
    const pacienteActual = () => window.currentPacienteId || (window.router && window.router.currentPatientId) ||
        (document.getElementById('paciente_dni') && document.getElementById('paciente_dni').getAttribute('data-id'));
    const fecha = v => v ? new Date(v).toLocaleDateString('es-EC') : '—';
    let cache = [];

    async function cargarLista(idPaciente) {
        const tbody = document.getElementById('tbodyOrdenesHistorial');
        if (!tbody) return;
        idPaciente = idPaciente || pacienteActual();
        if (!idPaciente) return;
        try {
            cache = await window.api.get(`/ordenes/paciente/${idPaciente}`);
            if (!Array.isArray(cache) || !cache.length) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:18px;color:#94a3b8;">Sin órdenes emitidas.</td></tr>`;
                return;
            }
            const yo = Number(sesion().ID_Usuario);
            tbody.innerHTML = cache.map((o, i) => {
                const pendiente = o.Estado === 'PENDIENTE_FIRMA';
                const icono = o.Tipo === 'IMAGEN' ? 'fa-x-ray' : (o.Tipo === 'LABORATORIO' ? 'fa-vial' : 'fa-stethoscope');
                return `
                <tr style="border-bottom:1px solid #f1f5f9;${o.Anulado ? 'opacity:.55;' : ''}">
                    <td style="padding:10px;font-size:12px;">${fecha(o.Fecha)}<div style="font-size:10px;color:#94a3b8;">${esc(o.Numero)}</div></td>
                    <td style="padding:10px;font-size:12px;"><i class="fas ${icono}" style="color:#c026d3;margin-right:5px;"></i><b>${esc(o.Tipo)}</b>${o.Prioridad === 'URGENTE' ? ' <span style="color:#dc2626;font-size:10px;font-weight:800;">URGENTE</span>' : ''}
                        <div style="font-size:11px;color:#475569;">${esc(o.examenes.map(e => e.nombre).join(', '))}</div>
                        <div style="font-size:10px;color:#64748b;">Dr(a). ${esc(o.Nombre_Medico)}${o.Destino ? ' · ' + esc(o.Destino) : ''}</div>
                        ${o.Atencion_Texto ? `<div style="font-size:10px;color:#4f46e5;"><i class="fas fa-link"></i> ${esc(o.Atencion_Texto)}</div>` : ''}
                        ${o.Convenio_Texto ? `<div style="font-size:10px;color:#0d9488;"><i class="fas fa-shield-heart"></i> ${esc(o.Convenio_Texto)}</div>` : ''}
                        ${o.Anulado ? `<div style="font-size:10px;color:#dc2626;font-weight:700;">ANULADA: ${esc(o.Motivo_Anulacion)}</div>` : ''}</td>
                    <td style="padding:10px;text-align:center;">${window.documentosUI.badgeFirma(o.Estado, o.Firma_Tipo, o.Firma_Titular)}</td>
                    <td style="padding:10px;text-align:center;">
                        ${o.Tiene_Resultado
                            ? `<button onclick="window.ordenesModule.verResultado(${i})" title="${esc(o.Resultado_Notas || 'Ver resultado')}" style="background:#ecfdf5;color:#059669;border:none;padding:5px 9px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;"><i class="fas fa-file-medical-alt"></i> ${fecha(o.Resultado_Fecha)}</button>`
                            : (o.Anulado ? '' : `<button onclick="window.ordenesModule.subirResultado(${o.ID_Orden})" style="background:#f8fafc;color:#475569;border:1px dashed #cbd5e1;padding:5px 9px;border-radius:6px;cursor:pointer;font-size:11px;"><i class="fas fa-upload"></i> Cargar</button>`)}
                    </td>
                    <td style="padding:10px;text-align:center;white-space:nowrap;">
                        ${pendiente
                            ? (yo === Number(o.ID_Medico) ? `<button onclick="window.documentosUI.bandejaFirmas()" title="Firmar con mi PIN" style="background:#4f46e5;color:white;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;"><i class="fas fa-signature"></i></button>` : '')
                            : `<button onclick="window.documentosUI.verPdf('ORDEN', ${o.ID_Orden}, '${esc(o.Numero)}')" title="Ver / imprimir / WhatsApp" style="background:#eef2ff;color:#4f46e5;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;"><i class="fas fa-file-pdf"></i></button>`}
                        ${o.Anulado ? '' : `<button onclick="window.ordenesModule.anular(${o.ID_Orden}, '${esc(o.Numero)}')" title="Anular" style="background:#fef2f2;color:#dc2626;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;margin-left:4px;"><i class="fas fa-ban"></i></button>`}
                    </td>
                </tr>`;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:18px;color:#ef4444;">No se pudieron cargar las órdenes.</td></tr>`;
        }
    }

    async function abrirModal() {
        const idPaciente = pacienteActual();
        if (!idPaciente) return Swal.fire('Atención', 'Abra primero la historia clínica de un paciente.', 'warning');
        let medicos = [];
        try { medicos = await window.api.get('/certificados/medicos'); } catch (_) { }
        const yo = sesion();
        if (!Array.isArray(medicos)) medicos = [];
        if (yo.ID_Usuario && !medicos.some(m => Number(m.ID_Usuario) === Number(yo.ID_Usuario)) && Number(yo.ID_Rol) !== 2) {
            medicos.unshift({ ID_Usuario: yo.ID_Usuario, Nombres: yo.Nombres || '', Apellidos: yo.Apellidos || '' });
        }
        if (!medicos.length) return Swal.fire('Sin médicos', 'No hay médicos activos.', 'warning');
        const idDefecto = medicos.some(m => Number(m.ID_Usuario) === Number(yo.ID_Usuario)) ? yo.ID_Usuario : medicos[0].ID_Usuario;
        const nombre = m => `${m.Nombres || ''} ${m.Apellidos || ''}`.trim();

        const lbl = 'display:block;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;';
        const inp = 'width:100%;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;';
        const htmlPlan = await window.documentosUI.selectorPlan(idPaciente, 'oe-plan', inp);
        const opcionesCie = (window.CATALOGO_CIE10 || []).slice(0, 3000).map(i => `<option value="${esc(i.c)} — ${esc(i.d)}">`).join('');
        const examenes = [];

        const pintarCatalogo = () => {
            const tipo = document.getElementById('oe-tipo').value;
            document.getElementById('oe-catalogo').innerHTML = CATALOGO[tipo].map(n =>
                `<button type="button" class="oe-chip" data-n="${esc(n)}" style="border:1px solid #e9d5ff;background:#faf5ff;color:#7e22ce;border-radius:14px;padding:4px 10px;font-size:11.5px;cursor:pointer;">+ ${esc(n)}</button>`).join('');
            document.querySelectorAll('.oe-chip').forEach(b => b.addEventListener('click', () => agregar(b.dataset.n)));
        };
        const pintarLista = () => {
            const caja = document.getElementById('oe-lista');
            caja.innerHTML = examenes.length ? examenes.map((e, i) => `
                <div style="display:grid;grid-template-columns:1.3fr 1fr auto;gap:6px;align-items:center;margin-bottom:5px;">
                    <b style="font-size:12.5px;color:#1e293b;">${i + 1}. ${esc(e.nombre)}</b>
                    <input data-i="${i}" class="oe-ind" value="${esc(e.indicacion)}" placeholder="Indicación (opcional, ej. pieza 36)" style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;">
                    <button type="button" data-i="${i}" class="oe-quitar" style="background:#fef2f2;color:#dc2626;border:none;border-radius:6px;padding:5px 8px;cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>`).join('') : '<div style="color:#94a3b8;font-size:12px;">Agregue exámenes del catálogo o escriba uno.</div>';
            caja.querySelectorAll('.oe-ind').forEach(x => x.addEventListener('input', () => { examenes[Number(x.dataset.i)].indicacion = x.value; }));
            caja.querySelectorAll('.oe-quitar').forEach(x => x.addEventListener('click', () => { examenes.splice(Number(x.dataset.i), 1); pintarLista(); }));
        };
        const agregar = (n) => {
            n = String(n || '').trim();
            if (!n || examenes.some(e => e.nombre.toLowerCase() === n.toLowerCase())) return;
            examenes.push({ nombre: n, indicacion: '' }); pintarLista();
        };

        const r = await Swal.fire({
            title: '<i class="fas fa-flask" style="color:#c026d3;"></i> Orden de exámenes',
            width: '820px',
            html: `
            <div style="text-align:left;font-size:13px;">
                <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:10px;">
                    <div><label style="${lbl}">Tipo</label><select id="oe-tipo" style="${inp}"><option value="LABORATORIO">Laboratorio</option><option value="IMAGEN">Imagen</option><option value="OTRO">Otro</option></select></div>
                    <div><label style="${lbl}">Médico que solicita</label><select id="oe-medico" style="${inp}">${medicos.map(m => `<option value="${m.ID_Usuario}" ${Number(m.ID_Usuario) === Number(idDefecto) ? 'selected' : ''}>Dr(a). ${esc(nombre(m))}</option>`).join('')}</select></div>
                    <div><label style="${lbl}">Prioridad</label><select id="oe-prioridad" style="${inp}"><option value="RUTINA">Rutina</option><option value="URGENTE">Urgente</option></select></div>
                </div>
                <div style="margin-top:12px;"><label style="${lbl}">Exámenes frecuentes</label><div id="oe-catalogo" style="display:flex;flex-wrap:wrap;gap:6px;"></div></div>
                <div style="display:flex;gap:6px;margin-top:10px;"><input id="oe-otro" style="${inp}" placeholder="Otro examen (escriba y presione Agregar)"><button type="button" id="oe-agregar" style="background:#c026d3;color:white;border:none;border-radius:8px;padding:0 14px;cursor:pointer;font-weight:700;">Agregar</button></div>
                <div id="oe-lista" style="margin-top:10px;padding:10px;background:#faf5ff;border-radius:10px;"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
                    <div><label style="${lbl}">Diagnóstico presuntivo CIE-10</label><input id="oe-cie" list="oe-cie-lista" style="${inp}" placeholder="Código o diagnóstico"><datalist id="oe-cie-lista">${opcionesCie}</datalist></div>
                    <div><label style="${lbl}">Laboratorio / centro de destino</label><input id="oe-destino" style="${inp}" placeholder="Opcional"></div>
                </div>
                <div style="margin-top:12px;"><label style="${lbl}"><i class="fas fa-link"></i> Tratamiento / procedimiento relacionado</label>${htmlPlan}</div>
                <div style="margin-top:12px;"><label style="${lbl}">Indicaciones / preparación</label><textarea id="oe-ind" rows="2" style="${inp};resize:vertical;" placeholder="Ej. ayuno de 8 horas"></textarea></div>
                <div style="margin-top:14px;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;">
                    <span style="${lbl}"><i class="fas fa-signature"></i> Firma electrónica</span>
                    <div id="oe-firmas" style="display:grid;gap:6px;font-size:12.5px;"></div>
                </div>
            </div>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-check"></i> Emitir orden', cancelButtonText: 'Cancelar', confirmButtonColor: '#c026d3', focusConfirm: false,
            didOpen: () => {
                const medSel = document.getElementById('oe-medico');
                const firmas = () => { const m = medicos.find(x => String(x.ID_Usuario) === medSel.value) || {}; window.documentosUI.bloqueFirma(document.getElementById('oe-firmas'), medSel.value, nombre(m)); };
                document.getElementById('oe-tipo').addEventListener('change', pintarCatalogo);
                medSel.addEventListener('change', firmas);
                const otro = document.getElementById('oe-otro');
                document.getElementById('oe-agregar').addEventListener('click', () => { agregar(otro.value); otro.value = ''; otro.focus(); });
                otro.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); agregar(otro.value); otro.value = ''; } });
                pintarCatalogo(); pintarLista(); firmas();
            },
            preConfirm: () => {
                if (!examenes.length) return Swal.showValidationMessage('Agregue al menos un examen');
                const v = id => (document.getElementById(id) || {}).value || '';
                const cie = v('oe-cie').trim();
                const m = cie.match(/^([A-Z]\d{2}(?:\.\d{1,2})?)\s*(?:—|-)?\s*(.*)$/i);
                const { firma, pin } = window.documentosUI.leerFirma(document.getElementById('oe-firmas'));
                return {
                    tipo: v('oe-tipo'), prioridad: v('oe-prioridad'), id_paciente: idPaciente, id_medico: v('oe-medico'),
                    examenes, cie10_cod: m ? m[1].toUpperCase() : '', cie10_texto: m ? m[2].trim() : cie,
                    destino: v('oe-destino').trim(), indicaciones: v('oe-ind').trim(), id_plan: v('oe-plan') || null,
                    firma, pin, url_publica: window.documentosUI.urlPublica()
                };
            }
        });
        if (!r.isConfirmed) return;
        Swal.fire({ title: 'Generando orden...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.post('/ordenes', r.value);
        if (!res || res.status !== 'Success') return Swal.fire('No se pudo emitir', (res && res.message) || 'Error al emitir la orden.', 'error');
        cargarLista(idPaciente);
        if (res.pendiente) return Swal.fire('Pendiente de firma', res.message, 'info');
        window.documentosUI.verPdf('ORDEN', res.id_orden, res.numero);
    }

    async function anular(id, numero) {
        const r = await Swal.fire({
            title: `Anular ${numero}`, input: 'text', inputPlaceholder: 'Motivo de la anulación', showCancelButton: true,
            confirmButtonText: 'Anular orden', cancelButtonText: 'Cancelar', confirmButtonColor: '#dc2626',
            inputValidator: v => (!v || !v.trim()) ? 'Indique el motivo' : undefined
        });
        if (!r.isConfirmed) return;
        const res = await window.api.post(`/ordenes/${id}/anular`, { motivo: r.value.trim() });
        Swal.fire(res && res.status === 'Success' ? 'Anulada' : 'Error', (res && res.message) || 'No se pudo anular.', res && res.status === 'Success' ? 'success' : 'error');
        cargarLista();
    }

    async function subirResultado(id) {
        const r = await Swal.fire({
            title: 'Cargar resultado',
            html: `<div style="text-align:left;font-size:13px;">
                <label style="font-weight:700;">Archivo (PDF o imagen, máx. 15 MB)</label>
                <input type="file" id="oe-res-archivo" accept=".pdf,.jpg,.jpeg,.png" style="width:100%;margin:6px 0 12px;">
                <label style="font-weight:700;">Notas / hallazgos</label>
                <textarea id="oe-res-notas" rows="3" class="swal2-textarea" style="width:100%;margin:6px 0;"></textarea></div>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-upload"></i> Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#059669',
            preConfirm: () => {
                const f = document.getElementById('oe-res-archivo').files[0];
                if (!f) return Swal.showValidationMessage('Seleccione el archivo');
                return { f, notas: document.getElementById('oe-res-notas').value };
            }
        });
        if (!r.isConfirmed) return;
        const fd = new FormData();
        fd.append('archivo', r.value.f); fd.append('notas', r.value.notas);
        Swal.fire({ title: 'Subiendo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.postFormData(`/ordenes/${id}/resultado`, fd);
        Swal.fire(res && res.status === 'Success' ? 'Listo' : 'Error', (res && res.message) || 'No se pudo cargar.', res && res.status === 'Success' ? 'success' : 'error');
        cargarLista();
    }

    async function verResultado(i) {
        const o = cache[i];
        if (!o) return;
        const resp = await fetch(`${window.api.baseURL}/ordenes/${o.ID_Orden}/resultado`, { headers: { 'Authorization': `Bearer ${window.api.getToken()}` } });
        if (!resp.ok) return Swal.fire('Atención', 'No se encontró el resultado.', 'info');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const esImagen = (blob.type || '').startsWith('image/');
        await Swal.fire({
            title: `Resultado ${esc(o.Numero)}`, width: '820px',
            html: `${o.Resultado_Notas ? `<p style="text-align:left;font-size:13px;background:#f0fdf4;padding:10px;border-radius:8px;">${esc(o.Resultado_Notas)}</p>` : ''}
                   ${esImagen ? `<img src="${url}" style="max-width:100%;max-height:65vh;border-radius:8px;">` : `<p style="font-size:13px;color:#475569;">Documento PDF: ${esc(o.Resultado_Nombre || '')}</p>`}`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-download"></i> Descargar', cancelButtonText: 'Cerrar', confirmButtonColor: '#059669',
            preConfirm: () => { const a = document.createElement('a'); a.href = url; a.download = o.Resultado_Nombre || `Resultado-${o.Numero}`; document.body.appendChild(a); a.click(); a.remove(); return false; }
        });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    return { abrirModal, cargarLista, anular, subirResultado, verResultado };
})();
