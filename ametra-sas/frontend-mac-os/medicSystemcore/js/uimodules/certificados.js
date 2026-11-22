// =====================================================================
//  MÓDULO: CERTIFICADOS MÉDICOS
//  Reposo médico · Constancia de atención · Certificado de salud
//  Firma electrónica: de la clínica (la de facturación) u opcional la
//  personal del médico (.p12 que cada médico sube). PDF firmado (PAdES),
//  validable en FirmaEC, con QR de verificación.
// =====================================================================
window.certificadosModule = (function () {

    const TIPOS = {
        REPOSO: { nombre: 'Reposo médico', icono: 'fa-bed', color: '#4f46e5' },
        ASISTENCIA: { nombre: 'Constancia de atención', icono: 'fa-user-clock', color: '#0891b2' },
        SALUD: { nombre: 'Certificado de salud', icono: 'fa-heart-pulse', color: '#16a34a' }
    };
    const CONTINGENCIAS = ['Enfermedad general', 'Accidente no laboral', 'Accidente de trabajo', 'Enfermedad profesional', 'Maternidad', 'Otro'];

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const fechaCorta = v => {
        if (!v) return '—';
        const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
        const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
        return d.toLocaleDateString('es-EC');
    };
    const sumarDias = (iso, n) => {
        const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const sesion = () => { try { return JSON.parse(localStorage.getItem('usuario_sesion') || '{}'); } catch (_) { return {}; } };
    const pacienteActual = () => window.currentPacienteId || (window.router && window.router.currentPatientId) ||
        (document.getElementById('paciente_dni') && document.getElementById('paciente_dni').getAttribute('data-id'));
    const nombreMedico = m => `${m.Nombres || ''} ${m.Apellidos || ''}`.trim();

    // -----------------------------------------------------------------
    // Lista de certificados en la Historia clínica
    // -----------------------------------------------------------------
    async function cargarLista(idPaciente) {
        const tbody = document.getElementById('tbodyCertificadosHistorial');
        if (!tbody) return;
        idPaciente = idPaciente || pacienteActual();
        if (!idPaciente) return;
        try {
            const lista = await window.api.get(`/certificados/paciente/${idPaciente}`);
            if (!Array.isArray(lista) || !lista.length) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:18px;color:#94a3b8;">Sin certificados emitidos.</td></tr>`;
                return;
            }
            tbody.innerHTML = lista.map(c => {
                const t = TIPOS[c.Tipo] || { nombre: c.Tipo, icono: 'fa-file', color: '#64748b' };
                const detalle = c.Tipo === 'REPOSO' ? `${c.Dias_Reposo} día(s) · ${fechaCorta(c.Reposo_Desde)} al ${fechaCorta(c.Reposo_Hasta)}`
                    : c.Tipo === 'SALUD' ? (c.Resultado_Aptitud || '') : `Atención ${fechaCorta(c.Fecha_Atencion)}`;
                const pendiente = c.Estado === 'PENDIENTE_FIRMA';
                const firma = window.documentosUI ? window.documentosUI.badgeFirma(c.Estado, c.Firma_Tipo, c.Firma_Titular) : '';
                const soyElMedico = Number(sesion().ID_Usuario) === Number(c.ID_Medico);
                return `
                <tr style="border-bottom:1px solid #f1f5f9;${c.Anulado ? 'opacity:.55;' : ''}">
                    <td style="padding:10px;font-size:12px;">${fechaCorta(c.Fecha_Emision)}<div style="font-size:10px;color:#94a3b8;">${esc(c.Numero)}</div></td>
                    <td style="padding:10px;font-size:12px;"><i class="fas ${t.icono}" style="color:${t.color};margin-right:5px;"></i><b>${esc(t.nombre)}</b>
                        <div style="font-size:10px;color:#64748b;">${esc(detalle)}</div>
                        ${c.Atencion_Texto ? `<div style="font-size:10px;color:#4f46e5;"><i class="fas fa-link"></i> ${esc(c.Atencion_Texto)}</div>` : ''}
                        ${c.Anulado ? `<div style="font-size:10px;color:#dc2626;font-weight:700;">ANULADO: ${esc(c.Motivo_Anulacion)}</div>` : ''}</td>
                    <td style="padding:10px;font-size:12px;">Dr(a). ${esc(c.Nombre_Medico_Snapshot)}</td>
                    <td style="padding:10px;text-align:center;">${firma}</td>
                    <td style="padding:10px;text-align:center;white-space:nowrap;">
                        ${pendiente
                            ? (soyElMedico ? `<button onclick="window.documentosUI.bandejaFirmas()" title="Firmar con mi PIN" style="background:#4f46e5;color:white;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;"><i class="fas fa-signature"></i></button>` : '')
                            : `<button onclick="window.certificadosModule.verPdf(${c.ID_Certificado}, '${esc(c.Numero)}')" title="Ver / imprimir / WhatsApp" style="background:#eef2ff;color:#4f46e5;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;"><i class="fas fa-file-pdf"></i></button>
                               ${c.Anulado ? '' : `<button onclick="window.documentosUI.enviarWhatsApp('CERTIFICADO', ${c.ID_Certificado})" title="Enviar por WhatsApp" style="background:#dcfce7;color:#16a34a;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;margin-left:4px;"><i class="fab fa-whatsapp"></i></button>`}`}
                        ${c.Anulado ? '' : `<button onclick="window.certificadosModule.anular(${c.ID_Certificado}, '${esc(c.Numero)}')" title="Anular" style="background:#fef2f2;color:#dc2626;border:none;padding:6px 9px;border-radius:6px;cursor:pointer;margin-left:4px;"><i class="fas fa-ban"></i></button>`}
                    </td>
                </tr>`;
            }).join('');
        } catch (e) {
            console.error('Error cargando certificados:', e);
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:18px;color:#ef4444;">No se pudieron cargar los certificados.</td></tr>`;
        }
    }

    // -----------------------------------------------------------------
    // Ver PDF (vista previa con imprimir / descargar)
    // -----------------------------------------------------------------
    async function verPdf(id, numero) {
        return window.documentosUI.verPdf('CERTIFICADO', id, numero);
    }

    async function anular(id, numero) {
        const r = await Swal.fire({
            title: `Anular ${numero}`,
            text: 'El certificado quedará como ANULADO al verificarlo por QR. Esta acción no se puede deshacer.',
            input: 'text',
            inputPlaceholder: 'Motivo de la anulación',
            showCancelButton: true,
            confirmButtonText: 'Anular certificado',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626',
            inputValidator: v => (!v || !v.trim()) ? 'Indique el motivo' : undefined
        });
        if (!r.isConfirmed) return;
        const res = await window.api.post(`/certificados/${id}/anular`, { motivo: r.value.trim() });
        if (res && res.status === 'Success') { Swal.fire('Anulado', res.message, 'success'); cargarLista(); }
        else Swal.fire('Error', (res && res.message) || 'No se pudo anular.', 'error');
    }

    // -----------------------------------------------------------------
    // Firma electrónica del médico (subir / reemplazar / quitar)
    // -----------------------------------------------------------------
    async function gestionarFirmaMedico(idMedico, nombre) {
        const yo = sesion();
        const esAdmin = Number(yo.ID_Rol) === 1;
        if (!esAdmin && Number(yo.ID_Usuario) !== Number(idMedico)) {
            return Swal.fire('Firma personal', 'Cada médico carga su propia firma electrónica desde su usuario (o un administrador por él).', 'info');
        }
        const estado = await window.api.get(`/certificados/firmas/estado?id_medico=${idMedico}`).catch(() => null);
        const m = estado && estado.medico;
        const actual = m && m.titular
            ? `<div style="background:${m.vencida ? '#fef2f2' : '#f0fdf4'};border:1px solid ${m.vencida ? '#fecaca' : '#bbf7d0'};border-radius:8px;padding:10px;margin-bottom:12px;font-size:13px;text-align:left;">
                 <b>Firma actual:</b> ${esc(m.titular)}<br><small>${esc(m.emisor || '')} · ${m.vencida ? '<b style="color:#dc2626">VENCIDA</b>' : 'vence ' + new Date(m.vence).toLocaleDateString('es-EC')}</small></div>`
            : `<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:10px;margin-bottom:12px;font-size:13px;color:#64748b;">Este médico aún no tiene firma electrónica personal.</div>`;

        const r = await Swal.fire({
            title: 'Firma electrónica del médico',
            html: `<p style="font-size:13px;color:#475569;margin-bottom:10px;">Dr(a). ${esc(nombre)}</p>${actual}
                <div style="text-align:left;font-size:13px;">
                    <label style="font-weight:700;color:#334155;">Archivo de firma (.p12 / .pfx)</label>
                    <input type="file" id="cm-p12" accept=".p12,.pfx" class="swal2-file" style="width:100%;margin:6px 0 12px;font-size:13px;">
                    <label style="font-weight:700;color:#334155;">Contraseña de la firma</label>
                    <input type="password" id="cm-p12-pass" class="swal2-input" style="width:100%;margin:6px 0;" autocomplete="new-password">
                    <small style="color:#94a3b8;">Solo se usa para comprobar el archivo: <b>no se guarda</b>. El médico la escribe como PIN cada vez que firma.</small>
                </div>`,
            showCancelButton: true,
            showDenyButton: !!(m && m.titular),
            confirmButtonText: '<i class="fas fa-upload"></i> Guardar firma',
            denyButtonText: 'Quitar firma',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            preConfirm: () => {
                const f = document.getElementById('cm-p12').files[0];
                const p = document.getElementById('cm-p12-pass').value;
                if (!f) return Swal.showValidationMessage('Seleccione el archivo .p12');
                if (!p) return Swal.showValidationMessage('Ingrese la contraseña');
                return { f, p };
            }
        });
        if (r.isDenied) {
            const res = await fetch(`${window.api.baseURL}/certificados/firmas/medico/${idMedico}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${window.api.getToken()}` }
            }).then(x => x.json()).catch(() => null);
            Swal.fire(res && res.status === 'Success' ? 'Listo' : 'Error', (res && res.message) || 'No se pudo quitar la firma.', res && res.status === 'Success' ? 'success' : 'error');
            return;
        }
        if (!r.isConfirmed) return;
        const fd = new FormData();
        fd.append('id_medico', idMedico);
        fd.append('password', r.value.p);
        fd.append('p12', r.value.f);
        Swal.fire({ title: 'Validando firma...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.postFormData('/certificados/firmas/medico', fd);
        if (res && res.status === 'Success') await Swal.fire('Firma guardada', res.message, 'success');
        else await Swal.fire('No se pudo guardar', (res && res.message) || 'Error al validar la firma.', 'error');
    }

    // -----------------------------------------------------------------
    // Emitir certificado
    // -----------------------------------------------------------------
    async function abrirModal(tipoInicial) {
        const idPaciente = pacienteActual();
        if (!idPaciente) return Swal.fire('Atención', 'Abra primero la historia clínica de un paciente.', 'warning');

        let medicos = [];
        try { medicos = await window.api.get('/certificados/medicos'); } catch (_) { }
        const yo = sesion();
        if (!Array.isArray(medicos)) medicos = [];
        // Si quien emite no es "Médico" (ej. administrador que también atiende), lo agregamos
        if (yo.ID_Usuario && !medicos.some(m => Number(m.ID_Usuario) === Number(yo.ID_Usuario)) && Number(yo.ID_Rol) !== 2) {
            medicos.unshift({ ID_Usuario: yo.ID_Usuario, Nombres: yo.Nombres || '', Apellidos: yo.Apellidos || '', Registro_Sanitario: yo.Registro_Sanitario || '', Especialidad: '', Tiene_Firma: 0 });
        }
        if (!medicos.length) return Swal.fire('Sin médicos', 'No hay usuarios con rol Médico activos para emitir el certificado.', 'warning');
        const idDefecto = medicos.some(m => Number(m.ID_Usuario) === Number(yo.ID_Usuario)) ? yo.ID_Usuario : medicos[0].ID_Usuario;

        const lbl = 'display:block;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;';
        const inp = 'width:100%;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;';
        const opcionesCie = (window.CATALOGO_CIE10 || []).slice(0, 3000).map(i => `<option value="${esc(i.c)} — ${esc(i.d)}">`).join('');
        const htmlPlan = await window.documentosUI.selectorPlan(idPaciente, 'cm-plan', inp);

        const html = `
        <div style="text-align:left;font-size:13px;">
            <div id="cm-tipos" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
                ${Object.entries(TIPOS).map(([k, t]) => `
                <label data-tipo="${k}" style="border:2px solid #e2e8f0;border-radius:10px;padding:10px;cursor:pointer;text-align:center;">
                    <input type="radio" name="cm-tipo" value="${k}" style="display:none;" ${k === (tipoInicial || 'REPOSO') ? 'checked' : ''}>
                    <i class="fas ${t.icono}" style="color:${t.color};font-size:18px;"></i>
                    <div style="font-weight:800;font-size:12px;margin-top:4px;color:#1e293b;">${t.nombre}</div>
                </label>`).join('')}
            </div>

            <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
                <div><label style="${lbl}">Médico que certifica</label>
                    <select id="cm-medico" style="${inp}">${medicos.map(m => `<option value="${m.ID_Usuario}" ${Number(m.ID_Usuario) === Number(idDefecto) ? 'selected' : ''}>Dr(a). ${esc(nombreMedico(m))}${m.Registro_Sanitario ? ' (Reg. ' + esc(m.Registro_Sanitario) + ')' : ''}</option>`).join('')}</select></div>
                <div><label style="${lbl}">Especialidad</label><input id="cm-especialidad" style="${inp}" placeholder="Ej. Odontología General"></div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;">
                <div><label style="${lbl}">Fecha de atención</label><input type="date" id="cm-fecha" value="${hoyISO()}" style="${inp}"></div>
                <div><label style="${lbl}">Hora de ingreso</label><input type="time" id="cm-hent" style="${inp}"></div>
                <div><label style="${lbl}">Hora de salida</label><input type="time" id="cm-hsal" style="${inp}"></div>
            </div>

            <div id="cm-bloque-reposo" style="margin-top:12px;padding:12px;background:#eef2ff;border-radius:10px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1.4fr;gap:10px;">
                    <div><label style="${lbl}">Días de reposo</label><input type="number" min="1" max="365" id="cm-dias" value="1" style="${inp}"></div>
                    <div><label style="${lbl}">Desde</label><input type="date" id="cm-desde" value="${hoyISO()}" style="${inp}"></div>
                    <div><label style="${lbl}">Hasta</label><input type="date" id="cm-hasta" value="${hoyISO()}" style="${inp};background:#f8fafc;" readonly></div>
                    <div><label style="${lbl}">Contingencia</label><select id="cm-contingencia" style="${inp}">${CONTINGENCIAS.map(c => `<option>${c}</option>`).join('')}</select></div>
                </div>
            </div>

            <div id="cm-bloque-salud" style="margin-top:12px;padding:12px;background:#f0fdf4;border-radius:10px;display:none;">
                <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
                    <div><label style="${lbl}">Resultado</label><select id="cm-resultado" style="${inp}"><option>Apto</option><option>Apto con restricciones</option><option>No apto temporalmente</option><option>No apto</option></select></div>
                    <div><label style="${lbl}">Para (actividad evaluada)</label><input id="cm-actividad" style="${inp}" placeholder="Ej. actividades laborales, actividad física, ingreso escolar"></div>
                </div>
            </div>

            <div style="margin-top:12px;"><label style="${lbl}"><i class="fas fa-link"></i> Tratamiento / procedimiento relacionado</label>${htmlPlan}</div>

            <div style="margin-top:12px;"><label style="${lbl}">Motivo de la atención / procedimiento</label>
                <input id="cm-motivo" style="${inp}" placeholder="Ej. exodoncia de tercer molar inferior"></div>

            <div style="margin-top:12px;"><label style="${lbl}">Diagnóstico CIE-10</label>
                <input id="cm-cie" list="cm-cie-lista" style="${inp}" placeholder="Escriba código o diagnóstico (ej. K04.0 o pulpitis)">
                <datalist id="cm-cie-lista">${opcionesCie}</datalist>
                <label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:#475569;cursor:pointer;">
                    <input type="checkbox" id="cm-mostrar-dx"> El paciente autoriza mostrar el diagnóstico en el certificado
                    <span style="color:#94a3b8;">(si no, aparece "Reservado por confidencialidad")</span>
                </label></div>

            <div style="margin-top:12px;"><label style="${lbl}">Observaciones / recomendaciones</label>
                <textarea id="cm-obs" rows="2" style="${inp};resize:vertical;" placeholder="Ej. dieta blanda, frío local, control en 7 días"></textarea></div>

            <div style="margin-top:14px;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="${lbl};margin:0;"><i class="fas fa-signature"></i> Firma electrónica</span>
                    <a href="#" id="cm-gestionar-firma" style="font-size:12px;color:#4f46e5;font-weight:700;text-decoration:none;"><i class="fas fa-key"></i> Firma personal del médico</a>
                </div>
                <div id="cm-firmas" style="display:grid;gap:6px;font-size:12.5px;color:#64748b;">Consultando firmas...</div>
            </div>
        </div>`;

        const pintarTipo = () => {
            const tipo = (document.querySelector('input[name="cm-tipo"]:checked') || {}).value || 'REPOSO';
            document.querySelectorAll('#cm-tipos label').forEach(l => {
                const on = l.dataset.tipo === tipo;
                l.style.borderColor = on ? TIPOS[l.dataset.tipo].color : '#e2e8f0';
                l.style.background = on ? '#f8fafc' : 'white';
            });
            document.getElementById('cm-bloque-reposo').style.display = tipo === 'REPOSO' ? 'block' : 'none';
            document.getElementById('cm-bloque-salud').style.display = tipo === 'SALUD' ? 'block' : 'none';
        };
        const recalcularHasta = () => {
            const dias = Math.max(1, parseInt(document.getElementById('cm-dias').value, 10) || 1);
            const desde = document.getElementById('cm-desde').value;
            if (desde) document.getElementById('cm-hasta').value = sumarDias(desde, dias - 1);
        };
        const cargarFirmas = async () => {
            const idMedico = document.getElementById('cm-medico').value;
            const med = medicos.find(m => String(m.ID_Usuario) === String(idMedico)) || {};
            document.getElementById('cm-especialidad').value = med.Especialidad || document.getElementById('cm-especialidad').value || '';
            await window.documentosUI.bloqueFirma(document.getElementById('cm-firmas'), idMedico, nombreMedico(med));
        };

        const r = await Swal.fire({
            title: '<i class="fas fa-file-medical" style="color:#4f46e5;"></i> Certificado médico',
            width: '820px',
            html,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check"></i> Emitir certificado',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            focusConfirm: false,
            didOpen: () => {
                document.querySelectorAll('input[name="cm-tipo"]').forEach(i => i.addEventListener('change', pintarTipo));
                document.querySelectorAll('#cm-tipos label').forEach(l => l.addEventListener('click', () => setTimeout(pintarTipo, 0)));
                ['cm-dias', 'cm-desde'].forEach(id => document.getElementById(id).addEventListener('input', recalcularHasta));
                document.getElementById('cm-fecha').addEventListener('change', e => { document.getElementById('cm-desde').value = e.target.value; recalcularHasta(); });
                document.getElementById('cm-medico').addEventListener('change', cargarFirmas);
                document.getElementById('cm-gestionar-firma').addEventListener('click', async ev => {
                    ev.preventDefault();
                    const idMedico = document.getElementById('cm-medico').value;
                    const med = medicos.find(m => String(m.ID_Usuario) === String(idMedico)) || {};
                    // Se gestiona la firma y luego se vuelve a abrir el formulario (vacío)
                    Swal.close();
                    await gestionarFirmaMedico(idMedico, nombreMedico(med));
                    abrirModal(tipoInicial);
                });
                pintarTipo(); recalcularHasta(); cargarFirmas();
            },
            preConfirm: () => {
                const v = id => (document.getElementById(id) || {}).value || '';
                const tipo = (document.querySelector('input[name="cm-tipo"]:checked') || {}).value;
                const { firma, pin } = window.documentosUI.leerFirma(document.getElementById('cm-firmas'));
                if (!v('cm-fecha')) return Swal.showValidationMessage('Indique la fecha de atención');
                if (tipo === 'REPOSO' && !(parseInt(v('cm-dias'), 10) >= 1)) return Swal.showValidationMessage('Indique los días de reposo');
                if (tipo === 'ASISTENCIA' && !v('cm-hent')) return Swal.showValidationMessage('Indique al menos la hora de ingreso');
                const cie = v('cm-cie').trim();
                const m = cie.match(/^([A-Z]\d{2}(?:\.\d{1,2})?)\s*(?:—|-)?\s*(.*)$/i);
                return {
                    tipo, firma, pin,
                    id_plan: v('cm-plan') || null,
                    id_paciente: idPaciente,
                    id_medico: v('cm-medico'),
                    especialidad: v('cm-especialidad').trim(),
                    fecha_atencion: v('cm-fecha'),
                    hora_entrada: v('cm-hent'), hora_salida: v('cm-hsal'),
                    dias_reposo: v('cm-dias'), reposo_desde: v('cm-desde'), contingencia: v('cm-contingencia'),
                    resultado_aptitud: v('cm-resultado'), actividad_aptitud: v('cm-actividad').trim(),
                    motivo: v('cm-motivo').trim(),
                    cie10_cod: m ? m[1].toUpperCase() : '',
                    cie10_texto: m ? m[2].trim() : cie,
                    mostrar_diagnostico: document.getElementById('cm-mostrar-dx').checked,
                    observaciones: v('cm-obs').trim(),
                    url_publica: (window.api.publicURL || window.api.baseURL || '').replace(/\/api\/?$/, '')
                };
            }
        });
        if (!r.isConfirmed) return;

        Swal.fire({ title: r.value.firma === 'NINGUNA' ? 'Generando certificado...' : (r.value.firma === 'MEDICO' && !r.value.pin ? 'Enviando a la firma del médico...' : 'Generando y firmando electrónicamente...'), allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.post('/certificados', r.value);
        if (!res || res.status !== 'Success') {
            return Swal.fire('No se pudo emitir', (res && res.message) || 'Error al emitir el certificado.', 'error');
        }
        cargarLista(idPaciente);
        if (res.pendiente) return Swal.fire('Pendiente de firma', res.message, 'info');
        await verPdf(res.id_certificado, res.numero);
    }

    return { abrirModal, cargarLista, verPdf, anular, gestionarFirmaMedico };
})();
