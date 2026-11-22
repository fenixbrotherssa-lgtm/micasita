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
                        ${Number(c.Descuento_Porcentaje) ? ` · ${Number(c.Descuento_Porcentaje)}% desc.` : ''}${c.Requiere_Autorizacion ? ' · requiere autorización' : ''}</div>
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
    // Gestión del catálogo (administrador)
    // -----------------------------------------------------------------
    async function abrirGestion() {
        const lista = await window.api.get('/convenios?todos=1').catch(() => []);
        const filas = (Array.isArray(lista) ? lista : []).map((c, i) => `
            <tr style="border-bottom:1px solid #f1f5f9;${c.Activo ? '' : 'opacity:.5;'}">
                <td style="padding:8px;text-align:left;"><b>${esc(c.Nombre)}</b><br><small style="color:#64748b;">${esc(TIPOS[c.Tipo] || c.Tipo)}${c.RUC ? ' · RUC ' + esc(c.RUC) : ''}</small></td>
                <td style="padding:8px;">${Number(c.Descuento_Porcentaje)}%</td>
                <td style="padding:8px;">${c.Pacientes}</td>
                <td style="padding:8px;white-space:nowrap;">
                    <button class="cv-editar" data-i="${i}" style="background:#eef2ff;color:#4f46e5;border:none;padding:5px 8px;border-radius:6px;cursor:pointer;"><i class="fas fa-pen"></i></button>
                </td>
            </tr>`).join('') || '<tr><td colspan="4" style="padding:18px;color:#94a3b8;">Aún no hay convenios registrados.</td></tr>';
        let accion = null;
        await Swal.fire({
            title: '<i class="fas fa-shield-heart" style="color:#0d9488;"></i> Convenios y seguros',
            width: '760px',
            html: `<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px;">
                    <button id="cv-nuevo" style="background:#0d9488;color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;"><i class="fas fa-plus"></i> Nuevo convenio</button>
                    <button id="cv-planilla" style="background:#1e3a8a;color:white;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;"><i class="fas fa-file-invoice-dollar"></i> Planilla para cobro</button>
                </div>
                <div style="max-height:52vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;">
                    <th style="padding:8px;text-align:left;">Convenio</th><th style="padding:8px;">Descuento</th><th style="padding:8px;">Pacientes</th><th></th></tr></thead>
                <tbody>${filas}</tbody></table></div>`,
            showConfirmButton: false, showCloseButton: true,
            didOpen: () => {
                document.getElementById('cv-nuevo').addEventListener('click', () => { accion = { tipo: 'editar', c: null }; Swal.close(); });
                document.getElementById('cv-planilla').addEventListener('click', () => { accion = { tipo: 'planilla' }; Swal.close(); });
                document.querySelectorAll('.cv-editar').forEach(b => b.addEventListener('click', () => { accion = { tipo: 'editar', c: lista[Number(b.dataset.i)] }; Swal.close(); }));
            }
        });
        if (!accion) return;
        if (accion.tipo === 'planilla') return planilla(lista);
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
                <div><label style="${lbl}">% de descuento / cobertura</label><input type="number" min="0" max="100" step="0.5" id="cv-desc" style="${inp}" value="${Number(c.Descuento_Porcentaje || 0)}"></div>
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
                    email: v('cv-email').trim(), descuento_porcentaje: v('cv-desc'), requiere_autorizacion: document.getElementById('cv-aut').checked,
                    activo: document.getElementById('cv-activo') ? document.getElementById('cv-activo').checked : true, observaciones: v('cv-obs').trim()
                };
            }
        });
        if (!r.isConfirmed) return;
        const res = c.ID_Convenio ? await window.api.put(`/convenios/${c.ID_Convenio}`, r.value) : await window.api.post('/convenios', r.value);
        if (!res || res.status !== 'Success') await Swal.fire('Error', (res && res.message) || 'No se pudo guardar.', 'error');
    }

    // -----------------------------------------------------------------
    // Planilla de atenciones para cobrar al convenio (exporta a Excel)
    // -----------------------------------------------------------------
    async function planilla(lista) {
        lista = (lista || await window.api.get('/convenios?todos=1').catch(() => [])).filter(Boolean);
        if (!lista.length) return Swal.fire('Sin convenios', 'Registre primero un convenio.', 'info');
        const d = new Date(); const inicioMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        let datos = null;
        await Swal.fire({
            title: '<i class="fas fa-file-invoice-dollar" style="color:#1e3a8a;"></i> Planilla de convenio',
            width: '1000px',
            html: `<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end;text-align:left;">
                    <div><label style="${lbl}">Convenio</label><select id="pl-conv" style="${inp}">${lista.map(c => `<option value="${c.ID_Convenio}">${esc(c.Nombre)}</option>`).join('')}</select></div>
                    <div><label style="${lbl}">Desde</label><input type="date" id="pl-desde" value="${inicioMes}" style="${inp}"></div>
                    <div><label style="${lbl}">Hasta</label><input type="date" id="pl-hasta" value="${hoyISO()}" style="${inp}"></div>
                    <button id="pl-generar" style="background:#1e3a8a;color:white;border:none;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:700;">Generar</button>
                </div>
                <div id="pl-resumen" style="margin:12px 0;font-size:13px;color:#334155;"></div>
                <div id="pl-tabla" style="max-height:50vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;"></div>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-file-excel"></i> Exportar a Excel', cancelButtonText: 'Cerrar', confirmButtonColor: '#16a34a',
            didOpen: () => {
                const generar = async () => {
                    const q = `id_convenio=${document.getElementById('pl-conv').value}&desde=${document.getElementById('pl-desde').value}&hasta=${document.getElementById('pl-hasta').value}`;
                    document.getElementById('pl-tabla').innerHTML = '<div style="padding:20px;color:#64748b;">Generando...</div>';
                    datos = await window.api.get(`/convenios/planilla?${q}`).catch(() => null);
                    if (!datos || !datos.filas) { document.getElementById('pl-tabla').innerHTML = '<div style="padding:20px;color:#ef4444;">No se pudo generar.</div>'; return; }
                    document.getElementById('pl-resumen').innerHTML = `<b>${datos.resumen.atenciones}</b> atenciones · <b>${datos.resumen.pacientes}</b> pacientes · Total <b>${dinero(datos.resumen.total)}</b>`;
                    document.getElementById('pl-tabla').innerHTML = datos.filas.length ? `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8fafc;color:#64748b;font-size:10.5px;text-transform:uppercase;">
                        <th style="padding:6px;">Fecha</th><th style="padding:6px;text-align:left;">Paciente</th><th style="padding:6px;">Afiliado</th><th style="padding:6px;text-align:left;">Prestación</th><th style="padding:6px;">CIE-10</th><th style="padding:6px;text-align:left;">Médico</th><th style="padding:6px;">Valor</th><th style="padding:6px;">Estado</th></tr></thead>
                        <tbody>${datos.filas.map(f => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px;">${fecha(f.Fecha_Inicio)}</td><td style="padding:6px;text-align:left;">${esc(f.Paciente)}<br><small style="color:#94a3b8;">${esc(f.DNI || '')}</small></td><td style="padding:6px;">${esc(f.Numero_Afiliado || '')}</td><td style="padding:6px;text-align:left;">${esc(f.Prestacion)}${f.Numero_Diente ? ' (pieza ' + esc(f.Numero_Diente) + ')' : ''}</td><td style="padding:6px;">${esc(f.CIE_Cod || '')}</td><td style="padding:6px;text-align:left;">${esc(f.Medico)}</td><td style="padding:6px;">${dinero(f.Costo_Total)}</td><td style="padding:6px;">${esc(f.Estado_Tratamiento || '')}</td></tr>`).join('')}</tbody></table>`
                        : '<div style="padding:20px;color:#94a3b8;">No hay atenciones de pacientes de este convenio en el período.</div>';
                };
                document.getElementById('pl-generar').addEventListener('click', generar);
                generar();
            },
            preConfirm: () => {
                if (!datos || !datos.filas || !datos.filas.length) { Swal.showValidationMessage('No hay datos para exportar'); return false; }
                const conv = lista.find(c => String(c.ID_Convenio) === document.getElementById('pl-conv').value) || {};
                const col = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
                const filas = [['Fecha', 'Paciente', 'Cédula', 'N.° afiliado', 'Titular', 'Parentesco', 'Prestación', 'Pieza', 'CIE-10', 'Diagnóstico', 'Médico', 'Registro', 'Precio lista', 'Descuento', 'Valor', 'Saldo', 'Estado']]
                    .concat(datos.filas.map(f => [fecha(f.Fecha_Inicio), f.Paciente, f.DNI, f.Numero_Afiliado, f.Titular, f.Parentesco, f.Prestacion, f.Numero_Diente, f.CIE_Cod, f.CIE_Texto, f.Medico, f.Registro_Sanitario,
                        Number(f.Precio_Lista || 0).toFixed(2), Number(f.Descuento || 0).toFixed(2), Number(f.Costo_Total || 0).toFixed(2), Number(f.Saldo_Pendiente || 0).toFixed(2), f.Estado_Tratamiento]));
                const csv = '﻿' + filas.map(f => f.map(col).join(';')).join('\r\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                a.download = `Planilla_${String(conv.Nombre || 'convenio').replace(/[^\w]+/g, '_')}_${document.getElementById('pl-desde').value}_${document.getElementById('pl-hasta').value}.csv`;
                document.body.appendChild(a); a.click(); a.remove();
                return false;
            }
        });
    }

    return { cargarDelPaciente, asignarAPaciente, quitar, abrirGestion, planilla };
})();
