// =====================================================================
//  MÓDULO: CUOTAS + LINK DE PAGO (v4.8.0)
//  Calendario de cuotas por tratamiento, link de pago Payphone (WhatsApp),
//  cuotas vencidas y configuración de cobros en línea.
// =====================================================================
window.cuotasModule = (function () {

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sesion = () => { try { return JSON.parse(localStorage.getItem('usuario_sesion') || '{}'); } catch (_) { return {}; } };
    const esAdmin = () => Number(sesion().ID_Rol || sesion().id_rol) === 1;
    const dinero = n => '$' + Number(n || 0).toFixed(2);
    const fecha = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    const fechaHora = v => v ? new Date(v).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const inp = 'width:100%;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;';
    const lbl = 'display:block;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:4px;';
    const ESTADO = { PAGADA: ['Pagada', '#15803d', '#dcfce7'], PARCIAL: ['Abonada', '#b45309', '#fef3c7'], PENDIENTE: ['Por pagar', '#475569', '#f1f5f9'], VENCIDA: ['Vencida', '#b91c1c', '#fee2e2'] };
    const ESTADO_LINK = { PENDIENTE: ['Esperando pago', '#1d4ed8'], PAGADO: ['Pagado', '#15803d'], EXPIRADO: ['Venció', '#94a3b8'] };
    const chip = (txt, color, fondo) => `<span style="background:${fondo || '#f1f5f9'};color:${color};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;">${txt}</span>`;

    // Etiqueta para las tablas de tratamientos (debajo del nombre)
    function badge(t) {
        const saldo = Number(t.Saldo_Pendiente || 0);
        const n = Number(t.Cuotas_Activas || 0);
        if (!n && saldo <= 0.01) return '';
        const abrir = `onclick="event.preventDefault(); window.cuotasModule.abrir(${Number(t.ID_Plan)})"`;
        if (!n) return `<div style="font-size:11px;margin-top:2px;"><a href="#" ${abrir} style="color:#7c3aed;font-weight:700;" title="Dividir el saldo en cuotas o enviar un link de pago"><i class="fas fa-calendar-check"></i> Cuotas / link de pago</a></div>`;
        const abonado = Math.max(0, Number(t.Cuotas_Base || 0) - saldo);
        const vencido = Number(t.Cuotas_Vencido_Base || 0) - abonado;
        return `<div style="font-size:11px;margin-top:2px;"><a href="#" ${abrir} style="color:${vencido > 0.01 ? '#b91c1c' : '#7c3aed'};font-weight:700;">
            <i class="fas fa-calendar-check"></i> ${n} cuotas${vencido > 0.01 ? ' · <b>vencido ' + dinero(vencido) + '</b>' : saldo <= 0.01 ? ' · completas' : ' · al día'}</a></div>`;
    }

    async function refrescarTablas(idPaciente) {
        if (document.getElementById('paciente_nombre_tra') && window.tratamientosModule) window.tratamientosModule.renderTablaTratamientos(idPaciente);
        else if (window.historiaModule && idPaciente && document.getElementById('tbodyTratamientos')) {
            const data = await window.api.get(`/pacientes/historia/${idPaciente}`).catch(() => null);
            if (data && data.planesTratamiento) window.historiaModule.renderTablaTratamientos(data.planesTratamiento);
        }
    }

    // -----------------------------------------------------------------
    // Modal principal del tratamiento
    // -----------------------------------------------------------------
    async function abrir(idPlan) {
        const d = await window.api.get(`/cuotas/plan/${idPlan}`).catch(e => ({ message: e.message }));
        if (!d || !d.plan) return Swal.fire('No se pudo', (d && d.message) || 'No se pudo cargar el tratamiento.', 'error');
        const p = d.plan;
        let accion = null;
        const cab = `<div style="text-align:left;font-size:13px;color:#334155;margin-bottom:10px;">
            <b>${esc(p.Tratamiento)}</b> · ${esc(p.Nombres)} ${esc(p.Apellidos)}<br>
            Valor ${dinero(p.Costo_Total)} · <b style="color:#b91c1c;">El paciente debe ${dinero(p.Saldo_Pendiente)}</b>${Number(p.Saldo_Convenio) > 0.01 ? ` · <span style="color:#0f766e;">el convenio debe ${dinero(p.Saldo_Convenio)}</span>` : ''}</div>`;
        const linkBtn = (attrs, texto) => d.payphone
            ? `<button ${attrs} style="background:#7c3aed;color:white;border:none;padding:5px 9px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;"><i class="fas fa-link"></i> ${texto}</button>` : '';
        const tablaCuotas = d.cuotas.length ? `<div style="max-height:34vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="background:#f8fafc;color:#64748b;font-size:10.5px;text-transform:uppercase;"><th style="padding:7px;">N.°</th><th style="padding:7px;">Vence</th><th style="padding:7px;">Cuota</th><th style="padding:7px;">Pagado</th><th style="padding:7px;">Falta</th><th style="padding:7px;">Estado</th><th></th></tr></thead>
            <tbody>${d.cuotas.map(c => `<tr style="border-bottom:1px solid #f1f5f9;text-align:center;">
                <td style="padding:7px;font-weight:700;">${c.numero}</td><td style="padding:7px;">${fecha(c.vence)}</td><td style="padding:7px;">${dinero(c.monto)}</td>
                <td style="padding:7px;color:#15803d;">${dinero(c.pagado)}</td><td style="padding:7px;font-weight:700;">${dinero(c.pendiente)}</td>
                <td style="padding:7px;">${chip(ESTADO[c.estado][0], ESTADO[c.estado][1], ESTADO[c.estado][2])}</td>
                <td style="padding:7px;">${c.pendiente > 0.01 ? linkBtn(`class="cq-link" data-cuota="${c.id_cuota}" data-monto="${c.pendiente.toFixed(2)}" data-num="${c.numero}"`, 'Link') : ''}</td></tr>`).join('')}</tbody></table></div>
            ${d.fuera_plan > 0.01 ? `<div style="font-size:12px;color:#b45309;margin-top:6px;"><i class="fas fa-triangle-exclamation"></i> Hay ${dinero(d.fuera_plan)} de saldo fuera de las cuotas (por ejemplo, un rechazo del convenio). Use <b>Rehacer cuotas</b> para incluirlo.</div>` : ''}`
            : `<div style="background:#f5f3ff;border:1px dashed #c4b5fd;border-radius:10px;padding:14px;font-size:13px;color:#5b21b6;text-align:left;">Este tratamiento no tiene cuotas. Divida el saldo en cuotas para que el paciente sepa cuánto y cuándo pagar; cada abono se descuenta solo de las cuotas.</div>`;
        const tablaLinks = d.links.length ? `<div style="margin-top:12px;text-align:left;"><div style="${lbl}">Links de pago enviados</div>
            <div style="max-height:20vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
            ${d.links.map(l => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px;">${fechaHora(l.Fecha_Creacion)}</td><td style="padding:6px;">${l.Numero_Cuota ? 'Cuota ' + l.Numero_Cuota : 'Saldo'}</td>
                <td style="padding:6px;font-weight:700;">${dinero(l.Monto)}</td><td style="padding:6px;color:${(ESTADO_LINK[l.Estado] || [])[1]};font-weight:700;">${(ESTADO_LINK[l.Estado] || [l.Estado])[0]}${l.Estado === 'PAGADO' ? ' ' + fechaHora(l.Fecha_Pago) : ''}${l.Detalle ? '<br><small style="color:#b45309;">' + esc(l.Detalle) + '</small>' : ''}</td>
                <td style="padding:6px;text-align:right;white-space:nowrap;">${l.Estado === 'PENDIENTE' ? `<button class="cq-copiar" data-url="${esc(l.Url)}" title="Copiar link" style="border:1px solid #e2e8f0;background:white;border-radius:6px;padding:4px 7px;cursor:pointer;"><i class="fas fa-copy"></i></button>
                    <button class="cq-verificar" data-id="${l.ID_Link}" title="Ver si ya pagó" style="border:1px solid #e2e8f0;background:white;border-radius:6px;padding:4px 7px;cursor:pointer;"><i class="fas fa-rotate"></i></button>` : ''}</td></tr>`).join('')}
            </table></div></div>` : '';
        const avisoPP = d.payphone ? '' : `<div style="font-size:11.5px;color:#64748b;margin-top:10px;text-align:left;"><i class="fas fa-circle-info"></i> Para enviar links de pago con tarjeta, el administrador configura Payphone en Dashboard → Configuración → <b>Cobros en línea</b>.</div>`;
        const tieneSaldo = Number(p.Saldo_Pendiente) > 0.01;
        await Swal.fire({
            title: '<i class="fas fa-calendar-check" style="color:#7c3aed;"></i> Cuotas y link de pago', width: '820px',
            html: cab + tablaCuotas + tablaLinks + avisoPP + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
                ${tieneSaldo ? `<button id="cq-armar" style="background:#7c3aed;color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;"><i class="fas fa-calendar-plus"></i> ${d.cuotas.length ? 'Rehacer cuotas' : 'Dividir en cuotas'}</button>` : ''}
                ${tieneSaldo ? linkBtn('id="cq-link-saldo"', 'Link por todo el saldo') : ''}
                ${d.cuotas.length ? `<button id="cq-quitar" style="background:white;color:#b91c1c;border:1px solid #fecaca;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;"><i class="fas fa-trash"></i> Quitar cuotas</button>` : ''}
                ${d.cuotas.length ? `<button id="cq-compartir" style="background:white;color:#15803d;border:1px solid #bbf7d0;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;"><i class="fab fa-whatsapp"></i> Copiar calendario</button>` : ''}
            </div>`,
            showConfirmButton: false, showCloseButton: true,
            didOpen: () => {
                const fin = a => { accion = a; Swal.close(); };
                const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
                on('cq-armar', () => fin({ tipo: 'armar' }));
                on('cq-quitar', () => fin({ tipo: 'quitar' }));
                on('cq-link-saldo', () => fin({ tipo: 'link', monto: Number(p.Saldo_Pendiente).toFixed(2) }));
                on('cq-compartir', async () => {
                    const txt = `Calendario de pagos — ${p.Tratamiento}\n` + d.cuotas.map(c => `Cuota ${c.numero}: ${dinero(c.monto)} — vence ${fecha(c.vence)}${c.estado === 'PAGADA' ? ' ✅' : c.pagado > 0 ? ` (abonado ${dinero(c.pagado)})` : ''}`).join('\n') + `\nSaldo: ${dinero(p.Saldo_Pendiente)}`;
                    try { await navigator.clipboard.writeText(txt); Swal.showValidationMessage('Calendario copiado: péguelo en WhatsApp.'); } catch (_) { }
                });
                document.querySelectorAll('.cq-link').forEach(b => b.addEventListener('click', () => fin({ tipo: 'link', idCuota: Number(b.dataset.cuota), monto: b.dataset.monto, num: b.dataset.num })));
                document.querySelectorAll('.cq-copiar').forEach(b => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.url); Swal.showValidationMessage('Link copiado.'); } catch (_) { } }));
                document.querySelectorAll('.cq-verificar').forEach(b => b.addEventListener('click', () => fin({ tipo: 'verificar', id: Number(b.dataset.id) })));
            }
        });
        if (!accion) return;
        if (accion.tipo === 'armar') { if (await armar(p, d.cuotas.length > 0)) await refrescarTablas(p.ID_Paciente); return abrir(idPlan); }
        if (accion.tipo === 'quitar') {
            const c = await Swal.fire({ title: '¿Quitar las cuotas?', text: 'El saldo y los pagos no cambian; solo se borra el calendario.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Quitar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b91c1c' });
            if (c.isConfirmed) { await window.api.delete(`/cuotas/plan/${idPlan}`).catch(() => null); await refrescarTablas(p.ID_Paciente); }
            return abrir(idPlan);
        }
        if (accion.tipo === 'link') { await generarLink(p, accion); await refrescarTablas(p.ID_Paciente); return abrir(idPlan); }
        if (accion.tipo === 'verificar') {
            Swal.fire({ title: 'Consultando a Payphone...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const r = await window.api.post(`/cuotas/link/${accion.id}/verificar`, {}).catch(e => ({ message: e.message }));
            await Swal.fire(r.estado === 'PAGADO' ? '¡Pagado!' : 'Estado del link', r.message || '', r.estado === 'PAGADO' ? 'success' : r.status === 'Success' ? 'info' : 'error');
            if (r.estado === 'PAGADO') await refrescarTablas(p.ID_Paciente);
            return abrir(idPlan);
        }
    }

    // Formulario para dividir el saldo
    async function armar(p, rehacer) {
        const saldo = Number(p.Saldo_Pendiente);
        const sig = new Date(); sig.setMonth(sig.getMonth() + 1);
        const r = await Swal.fire({
            title: rehacer ? 'Rehacer cuotas' : 'Dividir en cuotas', width: '560px',
            html: `<div style="text-align:left;font-size:13px;">Saldo a dividir: <b>${dinero(saldo)}</b>${rehacer ? '<br><small style="color:#b45309;">Se reemplaza el calendario actual por uno nuevo sobre lo que debe hoy.</small>' : ''}
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px;">
                    <div><label style="${lbl}">N.° de cuotas</label><input id="cq-n" type="number" min="2" max="48" value="3" style="${inp}"></div>
                    <div><label style="${lbl}">Cada</label><select id="cq-f" style="${inp}"><option value="MENSUAL">Mes</option><option value="QUINCENAL">15 días</option><option value="SEMANAL">Semana</option></select></div>
                    <div><label style="${lbl}">Primera cuota</label><input id="cq-d" type="date" value="${isoLocal(sig)}" style="${inp}"></div>
                </div><div id="cq-prev" style="margin-top:10px;font-size:12.5px;color:#5b21b6;"></div></div>`,
            showCancelButton: true, confirmButtonText: 'Crear cuotas', cancelButtonText: 'Cancelar', confirmButtonColor: '#7c3aed',
            didOpen: () => {
                const prev = () => { const n = parseInt(document.getElementById('cq-n').value, 10) || 0; document.getElementById('cq-prev').innerHTML = n >= 2 ? `${n} cuotas de <b>${dinero(Math.floor(saldo / n * 100) / 100)}</b>` : ''; };
                document.getElementById('cq-n').addEventListener('input', prev); prev();
            },
            preConfirm: () => {
                const n = parseInt(document.getElementById('cq-n').value, 10);
                if (!(n >= 2 && n <= 48)) { Swal.showValidationMessage('Entre 2 y 48 cuotas.'); return false; }
                if (!document.getElementById('cq-d').value) { Swal.showValidationMessage('Elija la fecha de la primera cuota.'); return false; }
                return { numero_cuotas: n, frecuencia: document.getElementById('cq-f').value, primera_fecha: document.getElementById('cq-d').value };
            }
        });
        if (!r.isConfirmed) return false;
        const res = await window.api.post(`/cuotas/plan/${p.ID_Plan}`, r.value).catch(e => ({ message: e.message }));
        await Swal.fire(res.status === 'Success' ? 'Listo' : 'No se pudo', res.message || '', res.status === 'Success' ? 'success' : 'error');
        return res.status === 'Success';
    }

    // Genera el link (cuota o saldo) y opcionalmente lo manda por WhatsApp
    async function generarLink(p, a) {
        const r = await Swal.fire({
            title: '<i class="fas fa-link" style="color:#7c3aed;"></i> Link de pago', width: '520px',
            html: `<div style="text-align:left;font-size:13px;">${a.num ? 'Cuota ' + esc(a.num) + ' · ' : ''}${esc(p.Tratamiento)}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
                    <div><label style="${lbl}">Valor a cobrar</label><input id="lk-monto" type="number" step="0.01" min="0.01" max="${Number(p.Saldo_Pendiente).toFixed(2)}" value="${a.monto}" style="${inp}"></div>
                    <div><label style="${lbl}">Vale por</label><select id="lk-horas" style="${inp}"><option value="24">24 horas</option><option value="72" selected>3 días</option><option value="168">7 días</option></select></div>
                </div>
                <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px;"><input type="checkbox" id="lk-wa" ${p.Telefono ? 'checked' : 'disabled'}> Enviar por WhatsApp al ${esc(p.Telefono || '(sin teléfono)')}</label>
                <div style="font-size:11.5px;color:#64748b;margin-top:8px;">El paciente paga con tarjeta en Payphone. Cuando pague, el sistema lo registra solo en Pagos y en caja (revisa cada minuto).</div></div>`,
            showCancelButton: true, confirmButtonText: 'Generar link', cancelButtonText: 'Cancelar', confirmButtonColor: '#7c3aed',
            preConfirm: () => {
                const m = Number(document.getElementById('lk-monto').value);
                if (!(m > 0) || m > Number(p.Saldo_Pendiente) + 0.01) { Swal.showValidationMessage(`El valor debe ser mayor a 0 y hasta ${dinero(p.Saldo_Pendiente)}.`); return false; }
                return { monto: m, horas: Number(document.getElementById('lk-horas').value), enviar_whatsapp: document.getElementById('lk-wa').checked };
            }
        });
        if (!r.isConfirmed) return;
        Swal.fire({ title: 'Generando link...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await window.api.post('/cuotas/link', { id_plan: p.ID_Plan, id_cuota: a.idCuota || null, ...r.value }).catch(e => ({ message: e.message }));
        if (res.status !== 'Success') return Swal.fire('No se pudo', res.message || '', 'error');
        const wa = res.whatsapp;
        await Swal.fire({
            icon: 'success', title: 'Link listo', width: '560px',
            html: `<div style="text-align:left;font-size:13px;">${wa ? (wa.success ? '<div style="color:#15803d;font-weight:700;margin-bottom:8px;"><i class="fab fa-whatsapp"></i> Enviado por WhatsApp al paciente.</div>' : `<div style="color:#b45309;font-weight:700;margin-bottom:8px;"><i class="fas fa-triangle-exclamation"></i> No se envió por WhatsApp: ${esc(wa.motivo || '')} Copie el mensaje y envíelo usted.</div>`) : ''}
                <textarea id="lk-texto" readonly style="${inp};height:130px;font-size:12px;">${esc(res.texto)}</textarea></div>`,
            showDenyButton: true, confirmButtonText: 'Cerrar', denyButtonText: '<i class="fas fa-copy"></i> Copiar mensaje', denyButtonColor: '#7c3aed',
            preDeny: async () => { try { await navigator.clipboard.writeText(res.texto); } catch (_) { } Swal.showValidationMessage('Mensaje copiado.'); return false; }
        });
    }

    // -----------------------------------------------------------------
    // Dashboard → Cobros en línea: cuotas vencidas + configuración Payphone
    // -----------------------------------------------------------------
    async function abrirPanel() {
        const [v, cfg] = await Promise.all([window.api.get('/cuotas/vencidas').catch(() => ({ filas: [] })), window.api.get('/cuotas/config').catch(() => ({}))]);
        const filas = (v && v.filas) || [];
        let accion = null;
        await Swal.fire({
            title: '<i class="fas fa-credit-card" style="color:#7c3aed;"></i> Cobros en línea y cuotas', width: '900px',
            html: `<div style="text-align:left;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-size:13px;color:#334155;"><b>Cuotas vencidas</b> · ${filas.length} paciente(s) · <b style="color:#b91c1c;">${dinero(v && v.total)}</b></div>
                    <div style="font-size:12px;">Payphone: ${cfg.token_guardado && cfg.store_id ? '<b style="color:#15803d;">configurado</b>' : '<b style="color:#b45309;">sin configurar</b>'} · Recordatorio automático: <b>${cfg.recordatorio ? 'activado' : 'apagado'}</b></div>
                </div>
                <div style="max-height:46vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;">${filas.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px;">
                    <thead><tr style="background:#f8fafc;color:#64748b;font-size:10.5px;text-transform:uppercase;"><th style="padding:7px;text-align:left;">Paciente</th><th style="padding:7px;text-align:left;">Tratamiento</th><th style="padding:7px;">Cuotas vencidas</th><th style="padding:7px;">Desde</th><th style="padding:7px;">Vencido</th><th></th></tr></thead>
                    <tbody>${filas.map((f, i) => `<tr style="border-bottom:1px solid #f1f5f9;text-align:center;">
                        <td style="padding:7px;text-align:left;">${esc(f.paciente)}<br><small style="color:#94a3b8;">${esc(f.telefono || 'sin teléfono')}</small></td><td style="padding:7px;text-align:left;">${esc(f.tratamiento)}</td>
                        <td style="padding:7px;">${f.cuotas_vencidas}</td><td style="padding:7px;">${fecha(f.desde)}</td><td style="padding:7px;font-weight:800;color:#b91c1c;">${dinero(f.vencido)}</td>
                        <td style="padding:7px;"><button class="pn-abrir" data-i="${i}" style="background:#7c3aed;color:white;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">Ver / cobrar</button></td></tr>`).join('')}</tbody></table>`
                    : '<div style="padding:20px;color:#94a3b8;text-align:center;">No hay cuotas vencidas. 🎉</div>'}</div></div>`,
            showConfirmButton: esAdmin(), confirmButtonText: '<i class="fas fa-gear"></i> Configurar Payphone y recordatorios', confirmButtonColor: '#334155',
            showCancelButton: true, cancelButtonText: 'Cerrar',
            didOpen: () => document.querySelectorAll('.pn-abrir').forEach(b => b.addEventListener('click', () => { accion = { tipo: 'abrir', fila: filas[Number(b.dataset.i)] }; Swal.close(); })),
            preConfirm: () => { accion = { tipo: 'config' }; }
        });
        if (!accion) return;
        if (accion.tipo === 'abrir') { await abrir(accion.fila.id_plan); return abrirPanel(); }
        if (accion.tipo === 'config') { await configurar(cfg); return abrirPanel(); }
    }

    async function configurar(cfg) {
        const r = await Swal.fire({
            title: 'Cobros en línea (Payphone)', width: '600px',
            html: `<div style="text-align:left;font-size:13px;">
                <div style="font-size:12px;color:#64748b;margin-bottom:10px;">En <b>Payphone Developer</b> cree una aplicación de tipo <b>API</b> y copie su <b>token</b> y el <b>Store ID</b> de su tienda. Con eso podrá enviar links de pago con tarjeta a sus pacientes.</div>
                <label style="${lbl}">Store ID</label><input id="pp-store" value="${esc(cfg.store_id || '')}" style="${inp}">
                <label style="${lbl};margin-top:10px;">Token de la aplicación</label><input id="pp-token" type="password" autocomplete="off" style="${inp}" placeholder="${cfg.token_guardado ? '•••••• guardado (déjelo vacío para no cambiarlo)' : 'Pegue aquí el token'}">
                ${cfg.token_guardado ? '<label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12px;color:#b91c1c;"><input type="checkbox" id="pp-borrar"> Quitar el token guardado</label>' : ''}
                <label style="display:flex;gap:8px;align-items:flex-start;margin-top:14px;font-size:13px;"><input type="checkbox" id="pp-rec" ${cfg.recordatorio ? 'checked' : ''} style="margin-top:3px;">
                    <span><b>Recordatorio automático de cuotas por WhatsApp</b><br><small style="color:#64748b;">A las 9:00 avisa al paciente el día antes de que venza su cuota (y una vez por semana si está atrasada), con el link de pago si Payphone está configurado.</small></span></label></div>`,
            showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#7c3aed',
            preConfirm: () => ({ store_id: document.getElementById('pp-store').value.trim(), token: document.getElementById('pp-token').value.trim(),
                borrar_token: !!(document.getElementById('pp-borrar') || {}).checked, recordatorio: document.getElementById('pp-rec').checked })
        });
        if (!r.isConfirmed) return;
        const res = await window.api.put('/cuotas/config', r.value).catch(e => ({ message: e.message }));
        await Swal.fire(res.status === 'Success' ? 'Guardado' : 'No se pudo', res.message || '', res.status === 'Success' ? 'success' : 'error');
    }

    return { badge, abrir, abrirPanel };
})();
