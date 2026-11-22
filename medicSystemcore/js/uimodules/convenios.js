// =====================================================================
//  MÓDULO: CONVENIOS / SEGUROS
//  Catálogo (aseguradoras, empresas, IESS, ISSFA, ISSPOL, RPIS), convenio
//  de cada paciente y planilla de atenciones para cobrar al convenio.
// =====================================================================
window.conveniosModule = (function () {

    const TIPOS = { ASEGURADORA: 'Aseguradora privada', EMPRESA: 'Empresa / corporativo', IESS: 'IESS', ISSFA: 'ISSFA', ISSPOL: 'ISSPOL', MSP_RPIS: 'MSP / Red Pública (RPIS)', OTRO: 'Otro' };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sesion = () => { try { return JSON.parse(localStorage.getItem('usuario_sesion') || '{}'); } catch (_) { return {}; } };
    const esAdmin = () => Number(sesion().ID_Rol || sesion().id_rol) === 1;
    const pacienteActual = () => window.currentPacienteId || (window.router && window.router.currentPatientId) ||
        (document.getElementById('paciente_dni') && document.getElementById('paciente_dni').getAttribute('data-id'));
    const fecha = v => { if (!v) return ''; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(v).toLocaleDateString('es-EC'); };
    const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const dinero = n => '$' + Number(n || 0).toFixed(2);
    const inp = 'width:100%;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;';
    const lbl = 'display:block;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:4px;';

    // -----------------------------------------------------------------
    // Convenio del paciente (tarjeta en la historia clínica)
    // -----------------------------------------------------------------
    async function cargarDelPaciente(idPaciente) {
        const caja = document.getElementById('convenio-paciente');
        if (!caja) return;
        idPaciente = idPaciente || pacienteActual();
        try {
            const lista = await window.api.get(`/convenios/paciente/${idPaciente}`);
            if (!Array.isArray(lista) || !lista.length) {
                caja.innerHTML = '<span style="font-size:12px;color:#94a3b8;">Particular (sin convenio)</span>';
                return;
            }
            caja.innerHTML = lista.map(c => `
                <div style="background:${c.Vigente ? '#f0fdfa' : '#fef2f2'};border:1px solid ${c.Vigente ? '#99f6e4' : '#fecaca'};border-radius:10px;padding:9px 10px;margin-bottom:6px;font-size:12px;">
                    <div style="display:flex;justify-content:space-between;gap:6px;">
                        <b style="color:#0f766e;">${esc(c.Nombre)}</b>
                        <a href="#" onclick="event.preventDefault(); window.conveniosModule.quitar(${c.ID_Paciente_Convenio})" title="Quitar" style="color:#dc2626;"><i class="fas fa-times"></i></a>
                    </div>
                    <div style="color:#475569;">${esc(TIPOS[c.Tipo] || c.Tipo)}${c.Numero_Afiliado ? ' · Afiliado ' + esc(c.Numero_Afiliado) : ''}</div>
                    ${c.Titular ? `<div style="color:#64748b;">Titular: ${esc(c.Titular)}${c.Parentesco ? ' (' + esc(c.Parentesco) + ')' : ''}</div>` : ''}
                    <div style="color:${c.Vigente ? '#0f766e' : '#dc2626'};font-weight:700;">${c.Vigente ? (c.Vigente_Hasta ? 'Vigente hasta ' + fecha(c.Vigente_Hasta) : 'Vigente') : 'VENCIDO ' + fecha(c.Vigente_Hasta)}
                        · cubre ${Number(c.Cobertura_Porcentaje == null ? 100 : c.Cobertura_Porcentaje)}%${Number(c.Descuento_Porcentaje) ? ` · ${Number(c.Descuento_Porcentaje)}% desc.` : ''}${c.Requiere_Autorizacion ? ' · requiere autorización' : ''}</div>
                </div>`).join('');
        } catch (_) {
            caja.innerHTML = '<span style="font-size:12px;color:#ef4444;">No se pudo cargar.</span>';
        }
    }

    async function asignarAPaciente() {
        const idPaciente = pacienteActual();
        if (!idPaciente) return;
        const convenios = await window.api.get('/convenios').catch(() => []);
        if (!Array.isArray(convenios) || !convenios.length) {
            return Swal.fire('Sin convenios', esAdmin() ? 'Primero registre los convenios en Dashboard → Configuración → Convenios.' : 'Pida al administrador que registre los convenios de la clínica.', 'info');
        }
        const r = await Swal.fire({
            title: '<i class="fas fa-shield-heart" style="color:#0d9488;"></i> Asignar convenio',
            html: `<div style="text-align:left;font-size:13px;display:grid;gap:10px;">
                <div><label style="${lbl}">Convenio / seguro</label><select id="cv-sel" style="${inp}">${convenios.map(c => `<option value="${c.ID_Convenio}">${esc(c.Nombre)} — ${esc(TIPOS[c.Tipo] || c.Tipo)}</option>`).join('')}</select></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div><label style="${lbl}">N.° afiliado / póliza</label><input id="cv-num" style="${inp}"></div>
                    <div><label style="${lbl}">Vigente hasta</label><input type="date" id="cv-vig" style="${inp}"></div>
                    <div><label style="${lbl}">Titular (si es dependiente)</label><input id="cv-tit" style="${inp}"></div>
                    <div><label style="${lbl}">Parentesco</label><select id="cv-par" style="${inp}"><option value="">Titular</option><option>Cónyuge</option><option>Hijo(a)</option><option>Padre / Madre</option><option>Otro</option></select></div>
                </div></div>`,
            showCancelButton: true, confirmButtonText: 'Asignar', cancelButtonText: 'Cancelar', confirmButtonColor: '#0d9488',
            preConfirm: () => ({
                id_convenio: document.getElementById('cv-sel').value, numero_afiliado: document.getElementById('cv-num').value.trim(),
                vigente_hasta: document.getElementById('cv-vig').value || null, titular: document.getElementById('cv-tit').value.trim(),
                parentesco: document.getElementById('cv-par').value
            })
        });
        if (!r.isConfirmed) return;
        const res = await window.api.post(`/convenios/paciente/${idPaciente}`, r.value);
        if (!res || res.status !== 'Success') return Swal.fire('Error', (res && res.message) || 'No se pudo asignar.', 'error');
        cargarDelPaciente(idPaciente);
    }

    async function quitar(idAsignacion) {
        const c = await Swal.fire({ icon: 'question', title: '¿Quitar el convenio de este paciente?', showCancelButton: true, confirmButtonText: 'Quitar', cancelButtonText: 'Cancelar', confirmButtonColor: '#dc2626' });
        if (!c.isConfirmed) return;
        const res = await fetch(`${window.api.baseURL}/convenios/asignacion/${idAsignacion}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${window.api.getToken()}` } }).then(x => x.json()).catch(() => null);
        if (!res || res.status !== 'Success') Swal.fire('Error', 'No se pudo quitar.', 'error');
        cargarDelPaciente();
    }

    // -----------------------------------------------------------------
    // v4.7.1 — Convenio POR TRATAMIENTO (quién paga cada tratamiento)
    // -----------------------------------------------------------------
    const ESTADO_COBRO = { PENDIENTE: 'por enviar', ENVIADO: 'enviado al convenio', PARCIAL: 'pago parcial', PAGADO: 'pagado por el convenio', RECHAZADO: 'rechazado' };
    const COLOR_COBRO = { PENDIENTE: '#0f766e', ENVIADO: '#1d4ed8', PARCIAL: '#b45309', PAGADO: '#15803d', RECHAZADO: '#dc2626' };

    // Etiqueta para las tablas de tratamientos del paciente
    function badgeCobertura(t, conBoton = true) {
        const btn = conBoton ? ` <a href="#" onclick="event.preventDefault(); window.conveniosModule.coberturaTratamiento(${Number(t.ID_Plan)})" title="Quién paga este tratamiento (convenio / particular)" style="color:#0d9488;margin-left:4px;"><i class="fas fa-shield-heart"></i></a>` : '';
        if (!t.ID_Convenio) return `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">Particular${btn}</div>`;
        const est = t.Estado_Cobro_Convenio || 'PENDIENTE';
        const debe = Number(t.Saldo_Convenio || 0);
        return `<div style="font-size:11px;margin-top:3px;color:${COLOR_COBRO[est] || '#0f766e'};font-weight:700;">
            <i class="fas fa-shield-heart"></i> ${esc(t.Convenio_Nombre || 'Convenio')}${t.Numero_Autorizacion ? ' · Aut. ' + esc(t.Numero_Autorizacion) : ''}
            <span style="font-weight:600;color:#475569;">· cubre ${dinero(t.Monto_Convenio)}${Number(t.Descuento_Convenio || 0) > 0.009 ? ' · desc. ' + dinero(t.Descuento_Convenio) : ''}${debe > 0.009 ? ' · debe ' + dinero(debe) : ''} · ${esc(ESTADO_COBRO[est] || est)}</span>${btn}</div>`;
    }

    // ¿El tratamiento está totalmente cobrado? (paciente y seguro)
    const estaSaldado = t => Number(t.Saldo_Pendiente || 0) <= 0.01 && Number(t.Saldo_Convenio || 0) <= 0.01;

    async function conveniosVigentes(idPaciente) {
        const lista = await window.api.get(`/convenios/paciente/${idPaciente}`).catch(() => []);
        return (Array.isArray(lista) ? lista : []).filter(c => c.Vigente);
    }

    // Selector "Paga:" en el modal de nuevo plan de tratamiento
    async function llenarSelectorCobertura(idPaciente) {
        const caja = document.getElementById('lote-cobertura-box');
        const sel = document.getElementById('lote-cobertura');
        if (!caja || !sel || !idPaciente) return;
        const vigentes = await conveniosVigentes(idPaciente);
        if (!vigentes.length) return;   // particular: no se muestra nada
        sel.innerHTML = vigentes.map(c => `<option value="${c.ID_Convenio}" data-aut="${c.Requiere_Autorizacion ? 1 : 0}">${esc(c.Nombre)} — cubre ${Number(c.Cobertura_Porcentaje == null ? 100 : c.Cobertura_Porcentaje)}%</option>`).join('')
            + '<option value="" data-aut="0">Particular (paga el paciente)</option>';
        caja.style.display = 'grid';
    }

    // Lo que eligió recepción en el modal del plan; null = particular. Devuelve {error} si falta algo.
    function leerSelectorCobertura() {
        const sel = document.getElementById('lote-cobertura');
        const caja = document.getElementById('lote-cobertura-box');
        if (!sel || !caja || caja.style.display === 'none' || !sel.value) return null;
        const aut = (document.getElementById('lote-autorizacion') || {}).value || '';
        const op = sel.options[sel.selectedIndex];
        if (op && op.dataset.aut === '1' && !aut.trim()) return { error: `${op.textContent.split(' — ')[0]} requiere el número de autorización.` };
        return { id_convenio: Number(sel.value), numero_autorizacion: aut.trim() };
    }

    async function refrescarPlanes() {
        const idPaciente = pacienteActual();
        if (document.getElementById('paciente_nombre_tra') && window.tratamientosModule) {
            window.tratamientosModule.renderTablaTratamientos(idPaciente);
        } else if (window.historiaModule && idPaciente) {
            const data = await window.api.get(`/pacientes/historia/${idPaciente}`).catch(() => null);
            if (data && data.planesTratamiento) window.historiaModule.renderTablaTratamientos(data.planesTratamiento);
        }
    }

    // Modal: quién paga este tratamiento + historial del cobro al seguro
    async function coberturaTratamiento(idPlan) {
        const idPaciente = pacienteActual();
        const [planes, vigentes, movs] = await Promise.all([
            window.api.get(`/tratamientos/paciente/${idPaciente}`).catch(() => []),
            conveniosVigentes(idPaciente),
            window.api.get(`/convenios/tratamiento/${idPlan}/movimientos`).catch(() => [])
        ]);
        const t = (Array.isArray(planes) ? planes : []).find(x => Number(x.ID_Plan) === Number(idPlan));
        if (!t) return Swal.fire('Error', 'No se encontró el tratamiento.', 'error');
        const bloqueado = t.ID_Convenio && ['ENVIADO', 'PARCIAL', 'PAGADO'].includes(t.Estado_Cobro_Convenio);
        const opciones = vigentes.slice();
        if (t.ID_Convenio && !opciones.some(c => Number(c.ID_Convenio) === Number(t.ID_Convenio))) {
            opciones.unshift({ ID_Convenio: t.ID_Convenio, Nombre: t.Convenio_Nombre + ' (ya no vigente)', Cobertura_Porcentaje: null });
        }
        const historial = (Array.isArray(movs) ? movs : []).map(m => `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:5px;">${fecha(m.Fecha)}</td><td style="padding:5px;font-weight:700;">${esc(m.Tipo)}</td><td style="padding:5px;">${esc(m.Convenio || '')}</td>
            <td style="padding:5px;text-align:right;">${dinero(m.Monto)}</td><td style="padding:5px;">${esc(m.Referencia || m.Observacion || '')}</td><td style="padding:5px;">${esc(m.Usuario || '')}</td></tr>`).join('');
        const r = await Swal.fire({
            title: '<i class="fas fa-shield-heart" style="color:#0d9488;"></i> ¿Quién paga este tratamiento?',
            width: '680px',
            html: `<div style="text-align:left;font-size:13px;">
                <div style="background:#f8fafc;border-radius:10px;padding:10px;margin-bottom:12px;">
                    <b>${esc(t.Nombre_Tratamiento)}</b>${t.Numero_Diente ? ' · pieza ' + esc(t.Numero_Diente) : ''}<br>
                    Valor ${dinero(t.Costo_Total)} · debe el paciente <b style="color:#b91c1c;">${dinero(t.Saldo_Pendiente)}</b>
                    ${t.ID_Convenio ? ` · debe el convenio <b style="color:#0f766e;">${dinero(t.Saldo_Convenio)}</b>` : ''}
                </div>
                ${bloqueado ? `<div style="background:#fef3c7;color:#92400e;border-radius:8px;padding:9px;margin-bottom:10px;">El cobro al convenio ya está ${esc(ESTADO_COBRO[t.Estado_Cobro_Convenio])}: solo se puede corregir el N.° de autorización.</div>` : ''}
                ${!opciones.length ? `<div style="background:#eff6ff;color:#1e40af;border-radius:8px;padding:9px;margin-bottom:10px;">El paciente no tiene convenios vigentes. Asígnele uno en su historia clínica (tarjeta «Convenio / Seguro»).</div>` : ''}
                <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;">
                    <div><label style="${lbl}">Paga</label><select id="cb-conv" style="${inp}" ${bloqueado ? 'disabled' : ''}>
                        <option value="">Particular (paga el paciente)</option>
                        ${opciones.map(c => `<option value="${c.ID_Convenio}" data-pct="${c.Cobertura_Porcentaje == null ? '' : Number(c.Cobertura_Porcentaje)}" data-desc="${Number(c.Descuento_Porcentaje || 0)}" ${Number(c.ID_Convenio) === Number(t.ID_Convenio) ? 'selected' : ''}>${esc(c.Nombre)}${c.Cobertura_Porcentaje != null ? ' — cubre ' + Number(c.Cobertura_Porcentaje) + '%' : ''}</option>`).join('')}
                    </select></div>
                    <div><label style="${lbl}">N.° autorización</label><input id="cb-aut" style="${inp}" value="${esc(t.Numero_Autorizacion || '')}"></div>
                    <div><label style="${lbl}">Cubre el convenio $</label><input id="cb-monto" type="number" min="0" step="0.01" style="${inp}" ${bloqueado ? 'disabled' : ''} value="${t.ID_Convenio ? Number(t.Monto_Convenio || 0).toFixed(2) : ''}"></div>
                </div>
                <div id="cb-ayuda" style="font-size:11.5px;color:#64748b;margin-top:6px;"></div>
                ${historial ? `<div style="margin-top:14px;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;">Historial del cobro al convenio</div>
                    <div style="max-height:160px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;">${historial}</table></div>` : ''}
            </div>`,
            showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#0d9488',
            didOpen: () => {
                const sel = document.getElementById('cb-conv'), monto = document.getElementById('cb-monto'), ayuda = document.getElementById('cb-ayuda');
                // Valor "de lista" del tratamiento (sin el descuento del convenio que ya tenga aplicado)
                const costoLista = Number(t.Costo_Total) + Number(t.Descuento_Convenio || 0);
                const actualizar = (cambio) => {
                    const op = sel.options[sel.selectedIndex];
                    if (!sel.value) { monto.value = ''; ayuda.textContent = 'Todo el valor lo paga el paciente.'; return; }
                    const desc = Math.round(costoLista * Number(op.dataset.desc || 0)) / 100;
                    const neto = costoLista - desc;
                    if (cambio && op.dataset.pct !== '') monto.value = (neto * Number(op.dataset.pct) / 100).toFixed(2);
                    const copago = Math.max(0, neto - Number(monto.value || 0));
                    ayuda.textContent = `Copago del paciente: ${dinero(copago)} (valor ${dinero(costoLista)}${desc > 0 ? ' − descuento pactado ' + dinero(desc) : ''} − convenio ${dinero(monto.value)}).`;
                };
                sel.addEventListener('change', () => actualizar(true));
                monto.addEventListener('input', () => actualizar(false));
                actualizar(!t.ID_Convenio);
            },
            preConfirm: () => {
                const id = document.getElementById('cb-conv').value;
                return { id_convenio: id ? Number(id) : null, numero_autorizacion: document.getElementById('cb-aut').value.trim(), monto_convenio: id ? document.getElementById('cb-monto').value : null };
            }
        });
        if (!r.isConfirmed) return;
        const body = { ...r.value };
        if (bloqueado) { body.id_convenio = t.ID_Convenio; body.monto_convenio = null; }
        const res = await window.api.put(`/convenios/tratamiento/${idPlan}`, body).catch(e => ({ message: e.message }));
        if (!res || res.status !== 'Success') return Swal.fire('No se pudo guardar', (res && res.message) || 'Error', 'error');
        Swal.fire({ icon: 'success', title: 'Listo', text: res.message, timer: 2200, showConfirmButton: false });
        refrescarPlanes();
    }

    // -----------------------------------------------------------------
    // Gestión del catálogo (administrador)
    // -----------------------------------------------------------------
    async function abrirGestion() {
        const lista = await window.api.get('/convenios?todos=1').catch(() => []);
        const filas = (Array.isArray(lista) ? lista : []).map((c, i) => `
            <tr style="border-bottom:1px solid #f1f5f9;${c.Activo ? '' : 'opacity:.5;'}">
                <td style="padding:8px;text-align:left;"><b>${esc(c.Nombre)}</b><br><small style="color:#64748b;">${esc(TIPOS[c.Tipo] || c.Tipo)}${c.RUC ? ' · RUC ' + esc(c.RUC) : ''}</small></td>
                <td style="padding:8px;">${Number(c.Cobertura_Porcentaje == null ? 100 : c.Cobertura_Porcentaje)}%</td>
                <td style="padding:8px;">${Number(c.Descuento_Porcentaje)}%</td>
                <td style="padding:8px;">${c.Pacientes}</td>
                <td style="padding:8px;white-space:nowrap;">
                    <button class="cv-editar" data-i="${i}" style="background:#eef2ff;color:#4f46e5;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;"><i class="fas fa-pen"></i></button>
                </td>
            </tr>`).join('') || '<tr><td colspan="5" style="padding:18px;color:#94a3b8;">Aún no hay convenios registrados.</td></tr>';
        let accion = null;
        await Swal.fire({
            title: '<i class="fas fa-shield-heart" style="color:#0d9488;"></i> Convenios y seguros',
            width: '760px',
            html: `<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px;">
                    <button id="cv-nuevo" style="background:#0d9488;color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;"><i class="fas fa-plus"></i> Nuevo convenio</button>
                    <button id="cv-planilla" style="background:#1e3a8a;color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;"><i class="fas fa-file-invoice-dollar"></i> Planilla y cobro</button>
                    <button id="cv-porcobrar" style="background:#b45309;color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;"><i class="fas fa-scale-balanced"></i> Lo que deben</button>
                </div>
                <div style="max-height:52vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;">
                    <th style="padding:8px;text-align:left;">Convenio</th><th style="padding:8px;">Cubre</th><th style="padding:8px;">Descuento</th><th style="padding:8px;">Pacientes</th><th></th></tr></thead>
                <tbody>${filas}</tbody></table></div>`,
            showConfirmButton: false, showCloseButton: true,
            didOpen: () => {
                document.getElementById('cv-nuevo').addEventListener('click', () => { accion = { tipo: 'editar', c: null }; Swal.close(); });
                document.getElementById('cv-planilla').addEventListener('click', () => { accion = { tipo: 'planilla' }; Swal.close(); });
                document.getElementById('cv-porcobrar').addEventListener('click', () => { accion = { tipo: 'porcobrar' }; Swal.close(); });
                document.querySelectorAll('.cv-editar').forEach(b => b.addEventListener('click', () => { accion = { tipo: 'editar', c: lista[Number(b.dataset.i)] }; Swal.close(); }));
            }
        });
        if (!accion) return;
        if (accion.tipo === 'planilla') return planilla(lista);
        if (accion.tipo === 'porcobrar') { await porCobrar(); return abrirGestion(); }
        await editar(accion.c);
        abrirGestion();
    }

    async function editar(c) {
        c = c || {};
        const r = await Swal.fire({
            title: c.ID_Convenio ? 'Editar convenio' : 'Nuevo convenio',
            width: '620px',
            html: `<div style="text-align:left;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div style="grid-column:1/-1;"><label style="${lbl}">Nombre</label><input id="cv-nombre" style="${inp}" value="${esc(c.Nombre || '')}" placeholder="Ej. Saludsa, BMI, IESS, Empresa X"></div>
                <div><label style="${lbl}">Tipo</label><select id="cv-tipo" style="${inp}">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${c.Tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
                <div><label style="${lbl}">RUC</label><input id="cv-ruc" style="${inp}" value="${esc(c.RUC || '')}"></div>
                <div><label style="${lbl}">Contacto</label><input id="cv-contacto" style="${inp}" value="${esc(c.Contacto || '')}"></div>
                <div><label style="${lbl}">Teléfono</label><input id="cv-tel" style="${inp}" value="${esc(c.Telefono || '')}"></div>
                <div><label style="${lbl}">Email</label><input id="cv-email" style="${inp}" value="${esc(c.Email || '')}"></div>
                <div><label style="${lbl}">% que cubre el convenio</label><input type="number" min="0" max="100" step="0.5" id="cv-cob" style="${inp}" value="${Number(c.Cobertura_Porcentaje == null ? 100 : c.Cobertura_Porcentaje)}"></div>
                <div><label style="${lbl}">% de descuento pactado</label><input type="number" min="0" max="100" step="0.5" id="cv-desc" style="${inp}" value="${Number(c.Descuento_Porcentaje || 0)}"></div>
                <div style="grid-column:1/-1;font-size:11px;color:#64748b;margin-top:-4px;">Lo que cubre el convenio se le cobra al convenio; el resto es el copago del paciente. Se puede ajustar en cada tratamiento.</div>
                <label style="grid-column:1/-1;display:flex;gap:8px;align-items:center;"><input type="checkbox" id="cv-aut" ${c.Requiere_Autorizacion ? 'checked' : ''}> Requiere autorización previa del convenio</label>
                ${c.ID_Convenio ? `<label style="grid-column:1/-1;display:flex;gap:8px;align-items:center;"><input type="checkbox" id="cv-activo" ${c.Activo !== false ? 'checked' : ''}> Activo</label>` : ''}
                <div style="grid-column:1/-1;"><label style="${lbl}">Observaciones</label><textarea id="cv-obs" rows="2" style="${inp}">${esc(c.Observaciones || '')}</textarea></div>
            </div>`,
            showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#0d9488',
            preConfirm: () => {
                const v = id => (document.getElementById(id) || {}).value || '';
                if (!v('cv-nombre').trim()) return Swal.showValidationMessage('Indique el nombre');
                return {
                    nombre: v('cv-nombre').trim(), tipo: v('cv-tipo'), ruc: v('cv-ruc').trim(), contacto: v('cv-contacto').trim(), telefono: v('cv-tel').trim(),
                    email: v('cv-email').trim(), descuento_porcentaje: v('cv-desc'), cobertura_porcentaje: v('cv-cob'), requiere_autorizacion: document.getElementById('cv-aut').checked,
                    activo: document.getElementById('cv-activo') ? document.getElementById('cv-activo').checked : true, observaciones: v('cv-obs').trim()
                };
            }
        });
        if (!r.isConfirmed) return;
        const res = c.ID_Convenio ? await window.api.put(`/convenios/${c.ID_Convenio}`, r.value) : await window.api.post('/convenios', r.value);
        if (!res || res.status !== 'Success') await Swal.fire('Error', (res && res.message) || 'No se pudo guardar.', 'error');
    }

    // -----------------------------------------------------------------
    // Planilla de cobro al convenio: sale de los tratamientos MARCADOS con el convenio.
    // Desde aquí se marca la planilla como enviada, se registra el pago del convenio
    // (entra a caja como un pago más) o se rechaza (glosa → pasa al paciente).
    // -----------------------------------------------------------------
    async function planilla(lista, filtros) {
        lista = (lista || await window.api.get('/convenios?todos=1').catch(() => [])).filter(Boolean);
        if (!lista.length) return Swal.fire('Sin convenios', 'Registre primero un convenio.', 'info');
        const d = new Date();
        filtros = filtros || { conv: String(lista[0].ID_Convenio), desde: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, hasta: hoyISO(), estado: '' };
        let datos = null, accion = null;
        const leerFiltros = () => ({ conv: document.getElementById('pl-conv').value, desde: document.getElementById('pl-desde').value, hasta: document.getElementById('pl-hasta').value, estado: document.getElementById('pl-estado').value });
        const seleccion = () => [...document.querySelectorAll('.pl-sel:checked')].map(c => datos.filas[Number(c.dataset.i)]);
        const btn = (id, color, icono, texto) => `<button id="${id}" style="background:${color};color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;"><i class="fas ${icono}"></i> ${texto}</button>`;
        await Swal.fire({
            title: '<i class="fas fa-file-invoice-dollar" style="color:#1e3a8a;"></i> Planilla y cobro al convenio',
            width: '1150px',
            html: `<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;align-items:end;text-align:left;">
                    <div><label style="${lbl}">Convenio</label><select id="pl-conv" style="${inp}">${lista.map(c => `<option value="${c.ID_Convenio}" ${String(c.ID_Convenio) === filtros.conv ? 'selected' : ''}>${esc(c.Nombre)}</option>`).join('')}</select></div>
                    <div><label style="${lbl}">Desde</label><input type="date" id="pl-desde" value="${filtros.desde}" style="${inp}"></div>
                    <div><label style="${lbl}">Hasta</label><input type="date" id="pl-hasta" value="${filtros.hasta}" style="${inp}"></div>
                    <div><label style="${lbl}">Estado del cobro</label><select id="pl-estado" style="${inp}"><option value="">Todos</option>${Object.entries(ESTADO_COBRO).map(([k, v]) => `<option value="${k}" ${filtros.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
                    <button id="pl-generar" style="background:#1e3a8a;color:white;border:none;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:700;">Generar</button>
                </div>
                <div id="pl-resumen" style="margin:12px 0;font-size:13px;color:#334155;"></div>
                <div id="pl-tabla" style="max-height:46vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-start;margin-top:10px;flex-wrap:wrap;">
                    ${btn('pl-enviar', '#1d4ed8', 'fa-paper-plane', 'Marcar como enviada al convenio')}
                    ${btn('pl-pagar', '#15803d', 'fa-hand-holding-dollar', 'Registrar pago del convenio')}
                    ${esAdmin() ? btn('pl-rechazar', '#dc2626', 'fa-ban', 'Rechazo / glosa') : ''}
                    <span style="font-size:11px;color:#64748b;align-self:center;">Marque las atenciones con la casilla.</span>
                </div>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-file-excel"></i> Exportar a Excel', cancelButtonText: 'Cerrar', confirmButtonColor: '#16a34a',
            didOpen: () => {
                const generar = async () => {
                    const f = leerFiltros();
                    document.getElementById('pl-tabla').innerHTML = '<div style="padding:20px;color:#64748b;">Generando...</div>';
                    datos = await window.api.get(`/convenios/planilla?id_convenio=${f.conv}&desde=${f.desde}&hasta=${f.hasta}&estado=${f.estado}`).catch(() => null);
                    if (!datos || !datos.filas) { document.getElementById('pl-tabla').innerHTML = '<div style="padding:20px;color:#ef4444;">No se pudo generar.</div>'; return; }
                    const s = datos.resumen;
                    document.getElementById('pl-resumen').innerHTML = `<b>${s.atenciones}</b> atenciones · <b>${s.pacientes}</b> pacientes · Valor ${dinero(s.total)} · Cubre el convenio <b>${dinero(s.convenio)}</b> · Copagos ${dinero(s.copago)} · <span style="color:#b45309;">El convenio debe <b>${dinero(s.por_cobrar)}</b></span>`;
                    document.getElementById('pl-tabla').innerHTML = datos.filas.length ? `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8fafc;color:#64748b;font-size:10.5px;text-transform:uppercase;position:sticky;top:0;">
                        <th style="padding:6px;"><input type="checkbox" id="pl-todos"></th><th style="padding:6px;">Fecha</th><th style="padding:6px;text-align:left;">Paciente</th><th style="padding:6px;">Afiliado</th><th style="padding:6px;">Autorización</th><th style="padding:6px;text-align:left;">Prestación</th><th style="padding:6px;text-align:left;">Médico</th>
                        <th style="padding:6px;">Valor</th><th style="padding:6px;">Convenio</th><th style="padding:6px;">Copago</th><th style="padding:6px;">Debe el convenio</th><th style="padding:6px;">Estado</th></tr></thead>
                        <tbody>${datos.filas.map((f, i) => `<tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:6px;text-align:center;">${Number(f.Saldo_Convenio) > 0.009 ? `<input type="checkbox" class="pl-sel" data-i="${i}">` : ''}</td>
                            <td style="padding:6px;">${fecha(f.Fecha_Inicio)}</td><td style="padding:6px;text-align:left;">${esc(f.Paciente)}<br><small style="color:#94a3b8;">${esc(f.DNI || '')}</small></td>
                            <td style="padding:6px;">${esc(f.Numero_Afiliado || '')}</td><td style="padding:6px;">${esc(f.Numero_Autorizacion || '')}</td>
                            <td style="padding:6px;text-align:left;">${esc(f.Prestacion)}${f.Numero_Diente ? ' (pieza ' + esc(f.Numero_Diente) + ')' : ''}${f.CIE_Cod ? '<br><small style="color:#94a3b8;">' + esc(f.CIE_Cod) + '</small>' : ''}</td>
                            <td style="padding:6px;text-align:left;">${esc(f.Medico)}</td><td style="padding:6px;">${dinero(f.Costo_Total)}</td><td style="padding:6px;">${dinero(f.Monto_Convenio)}</td>
                            <td style="padding:6px;">${dinero(f.Copago)}</td><td style="padding:6px;font-weight:700;color:#b45309;">${dinero(f.Saldo_Convenio)}</td>
                            <td style="padding:6px;font-weight:700;color:${COLOR_COBRO[f.Estado_Cobro_Convenio] || '#475569'};">${esc(ESTADO_COBRO[f.Estado_Cobro_Convenio] || f.Estado_Cobro_Convenio || '')}</td></tr>`).join('')}</tbody></table>`
                        : '<div style="padding:20px;color:#94a3b8;">No hay tratamientos marcados con este convenio en el período. Para marcarlos, use el escudo <i class="fas fa-shield-heart"></i> en el plan de tratamiento del paciente.</div>';
                    const todos = document.getElementById('pl-todos');
                    if (todos) todos.addEventListener('change', () => document.querySelectorAll('.pl-sel').forEach(c => { c.checked = todos.checked; }));
                };
                const lanzar = (tipo) => {
                    if (!datos || !datos.filas) return;
                    const sel = seleccion();
                    if (!sel.length) { Swal.showValidationMessage('Marque al menos una atención con saldo del convenio.'); return; }
                    accion = { tipo, filas: sel, filtros: leerFiltros() };
                    Swal.close();
                };
                document.getElementById('pl-generar').addEventListener('click', generar);
                document.getElementById('pl-enviar').addEventListener('click', () => lanzar('enviar'));
                document.getElementById('pl-pagar').addEventListener('click', () => lanzar('pagar'));
                const rech = document.getElementById('pl-rechazar');
                if (rech) rech.addEventListener('click', () => lanzar('rechazar'));
                generar();
            },
            preConfirm: () => {
                if (!datos || !datos.filas || !datos.filas.length) { Swal.showValidationMessage('No hay datos para exportar'); return false; }
                const conv = lista.find(c => String(c.ID_Convenio) === document.getElementById('pl-conv').value) || {};
                const col = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
                const n2 = v => Number(v || 0).toFixed(2);
                const filas = [['Fecha', 'Paciente', 'Cédula', 'N.° afiliado', 'Titular', 'Parentesco', 'N.° autorización', 'Prestación', 'Pieza', 'CIE-10', 'Diagnóstico', 'Médico', 'Registro', 'Precio lista', 'Descuento', 'Descuento convenio', 'Valor', 'Cubre convenio', 'Copago paciente', 'Debe el convenio', 'Estado del cobro']]
                    .concat(datos.filas.map(f => [fecha(f.Fecha_Inicio), f.Paciente, f.DNI, f.Numero_Afiliado, f.Titular, f.Parentesco, f.Numero_Autorizacion, f.Prestacion, f.Numero_Diente, f.CIE_Cod, f.CIE_Texto, f.Medico, f.Registro_Sanitario,
                        n2(f.Precio_Lista), n2(f.Descuento), n2(f.Descuento_Convenio), n2(f.Costo_Total), n2(f.Monto_Convenio), n2(f.Copago), n2(f.Saldo_Convenio), ESTADO_COBRO[f.Estado_Cobro_Convenio] || f.Estado_Cobro_Convenio]));
                const csv = '﻿' + filas.map(f => f.map(col).join(';')).join('\r\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                a.download = `Planilla_${String(conv.Nombre || 'convenio').replace(/[^\w]+/g, '_')}_${document.getElementById('pl-desde').value}_${document.getElementById('pl-hasta').value}.csv`;
                document.body.appendChild(a); a.click(); a.remove();
                return false;
            }
        });
        if (!accion) return;
        const ids = accion.filas.map(f => f.ID_Plan);
        let res = null;
        if (accion.tipo === 'enviar') {
            const r = await Swal.fire({ title: 'Marcar como enviada', html: `${ids.length} atención(es) por ${dinero(accion.filas.reduce((s, f) => s + Number(f.Saldo_Convenio), 0))}.<br><input id="en-ref" style="${inp};margin-top:10px;" placeholder="N.° de planilla / oficio (opcional)">`,
                showCancelButton: true, confirmButtonText: 'Marcar enviada', cancelButtonText: 'Cancelar', confirmButtonColor: '#1d4ed8', preConfirm: () => document.getElementById('en-ref').value.trim() });
            if (r.isConfirmed) res = await window.api.post('/convenios/envio', { ids_plan: ids, referencia: r.value }).catch(e => ({ message: e.message }));
        } else if (accion.tipo === 'pagar') {
            const r = await Swal.fire({
                title: '<i class="fas fa-hand-holding-dollar" style="color:#15803d;"></i> Pago del convenio', width: '720px',
                html: `<div style="text-align:left;font-size:12.5px;">
                    <div style="max-height:40vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;"><table style="width:100%;border-collapse:collapse;">
                    ${accion.filas.map((f, i) => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px;">${esc(f.Paciente)}<br><small style="color:#64748b;">${esc(f.Prestacion)} · debe ${dinero(f.Saldo_Convenio)}</small></td>
                        <td style="padding:6px;width:130px;"><input type="number" class="pg-monto" data-i="${i}" min="0" step="0.01" max="${Number(f.Saldo_Convenio)}" value="${Number(f.Saldo_Convenio).toFixed(2)}" style="${inp}"></td></tr>`).join('')}
                    </table></div>
                    <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:10px;">
                        <div><label style="${lbl}">Forma de pago</label><select id="pg-metodo" style="${inp}"><option>Transferencia</option><option>Efectivo</option></select></div>
                        <div><label style="${lbl}">Referencia (N.° transferencia / cheque)</label><input id="pg-ref" style="${inp}"></div>
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:8px;">Entra a su caja abierta como un cobro más. Si el convenio pagó menos, deje el valor real: el resto queda pendiente y luego puede registrarlo como rechazo.</div>
                </div>`,
                showCancelButton: true, confirmButtonText: 'Registrar pago', cancelButtonText: 'Cancelar', confirmButtonColor: '#15803d',
                preConfirm: () => {
                    const items = [...document.querySelectorAll('.pg-monto')].map(x => ({ id_plan: accion.filas[Number(x.dataset.i)].ID_Plan, monto: Number(x.value || 0) })).filter(x => x.monto > 0);
                    if (!items.length) return Swal.showValidationMessage('Indique al menos un valor pagado.');
                    return { items, metodo: document.getElementById('pg-metodo').value, referencia: document.getElementById('pg-ref').value.trim() };
                }
            });
            if (r.isConfirmed) res = await window.api.post('/convenios/cobros', r.value).catch(e => ({ message: e.message }));
        } else if (accion.tipo === 'rechazar') {
            const r = await Swal.fire({ icon: 'warning', title: 'Rechazo / glosa del convenio',
                html: `Lo que debe el convenio en ${ids.length} atención(es) (${dinero(accion.filas.reduce((s, f) => s + Number(f.Saldo_Convenio), 0))}) <b>pasará a deberlo el paciente</b>.<textarea id="rz-motivo" rows="3" style="${inp};margin-top:10px;" placeholder="Motivo (obligatorio)"></textarea>`,
                showCancelButton: true, confirmButtonText: 'Registrar rechazo', cancelButtonText: 'Cancelar', confirmButtonColor: '#dc2626',
                preConfirm: () => document.getElementById('rz-motivo').value.trim() || Swal.showValidationMessage('Indique el motivo') });
            if (r.isConfirmed) res = await window.api.post('/convenios/rechazo', { ids_plan: ids, motivo: r.value }).catch(e => ({ message: e.message }));
        }
        if (res) await Swal.fire(res.status === 'Success' ? 'Listo' : 'No se pudo', res.message || '', res.status === 'Success' ? 'success' : 'error');
        return planilla(lista, accion.filtros);
    }

    // Cuentas por cobrar a los convenios (resumen)
    async function porCobrar() {
        const lista = await window.api.get('/convenios/por-cobrar').catch(() => []);
        const total = (Array.isArray(lista) ? lista : []).reduce((s, c) => s + Number(c.Por_Cobrar || 0), 0);
        await Swal.fire({
            title: '<i class="fas fa-scale-balanced" style="color:#b45309;"></i> Lo que deben los convenios', width: '760px',
            html: (Array.isArray(lista) && lista.length) ? `<div style="font-size:13px;margin-bottom:8px;">Total por cobrar: <b style="color:#b45309;">${dinero(total)}</b></div>
                <table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:#f8fafc;color:#64748b;font-size:10.5px;text-transform:uppercase;">
                <th style="padding:7px;text-align:left;">Convenio</th><th style="padding:7px;">Atenciones</th><th style="padding:7px;">Sin enviar</th><th style="padding:7px;">Enviado</th><th style="padding:7px;">Total</th><th style="padding:7px;">Desde</th></tr></thead>
                <tbody>${lista.map(c => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:7px;text-align:left;"><b>${esc(c.Nombre)}</b></td><td style="padding:7px;">${c.Atenciones}</td>
                    <td style="padding:7px;">${dinero(c.Sin_Enviar)}</td><td style="padding:7px;">${dinero(c.Enviado)}</td><td style="padding:7px;font-weight:800;color:#b45309;">${dinero(c.Por_Cobrar)}</td><td style="padding:7px;">${fecha(c.Mas_Antigua)}</td></tr>`).join('')}</tbody></table>`
                : '<div style="color:#16a34a;padding:10px;">Ningún convenio tiene saldos pendientes.</div>',
            confirmButtonText: 'Cerrar', confirmButtonColor: '#64748b'
        });
    }

    return { cargarDelPaciente, asignarAPaciente, quitar, abrirGestion, planilla, porCobrar,
        badgeCobertura, estaSaldado, llenarSelectorCobertura, leerSelectorCobertura, coberturaTratamiento };
})();
