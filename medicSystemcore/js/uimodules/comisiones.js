// ==========================================
// MÓDULO: COMISIONES DE DOCTORES
// Base = lo COBRADO (pagos de pacientes ligados a un plan con médico).
// % por doctor y por especialidad; al liquidar, el pago al doctor queda como Egreso.
// ==========================================
window.comisionesModule = {
    especialidades: [],
    doctores: [],
    pendientes: null,
    tabActual: 'pendientes',

    init: async function() {
        const ahora = new Date();
        const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        document.getElementById('com-fecha-inicio').value = ymd(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
        document.getElementById('com-fecha-fin').value = ymd(ahora);

        await this.cargarClinicas();
        const esp = await window.api.get('/comisiones/especialidades');
        this.especialidades = esp?.data || [];
        this.tab('pendientes');
    },

    sesion: () => JSON.parse(localStorage.getItem('usuario_sesion') || '{}'),
    fmt: (v) => `$${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    fecha: (v) => v ? new Date(v).toLocaleDateString('es-EC') : '—',

    idClinica: function() {
        const sel = document.getElementById('com-clinica');
        const s = this.sesion();
        return (sel && sel.value) ? sel.value : (s.ID_Clinica || s.id_clinica || 0);
    },
    rango: function() {
        return {
            fIn: document.getElementById('com-fecha-inicio').value,
            fFin: document.getElementById('com-fecha-fin').value
        };
    },

    cargarClinicas: async function() {
        const s = this.sesion();
        const cont = document.getElementById('com-container-clinica');
        const sel = document.getElementById('com-clinica');
        const clinicas = await window.api.get('/clinicas/listar');
        if (!Array.isArray(clinicas) || clinicas.length < 2) return;
        const actual = s.ID_Clinica || s.id_clinica;
        sel.innerHTML = clinicas.map(c =>
            `<option value="${c.ID_Clinica}" ${parseInt(c.ID_Clinica) === parseInt(actual) ? 'selected' : ''}>${this.esc(c.Nombre_Clinica)}</option>`
        ).join('');
        cont.style.display = 'flex';
    },

    tab: function(nombre) {
        this.tabActual = nombre;
        document.querySelectorAll('.com-tab').forEach(b => b.classList.toggle('activa', b.dataset.tab === nombre));
        ['pendientes', 'config', 'historial'].forEach(t => {
            document.getElementById(`com-panel-${t}`).style.display = t === nombre ? 'block' : 'none';
        });
        this.recargar();
    },

    recargar: function() {
        if (this.tabActual === 'pendientes') return this.cargarPendientes();
        if (this.tabActual === 'config') return this.cargarConfig();
        if (this.tabActual === 'historial') return this.cargarHistorial();
    },

    // ─────────────────────────── PENDIENTES ───────────────────────────
    cargarPendientes: async function() {
        const panel = document.getElementById('com-panel-pendientes');
        panel.innerHTML = '<div class="com-empty">Calculando comisiones...</div>';
        const { fIn, fFin } = this.rango();
        const res = await window.api.get(`/comisiones/pendientes?id_clinica=${this.idClinica()}&fecha_inicio=${fIn}&fecha_fin=${fFin}`);
        if (res.status !== 'Success') {
            panel.innerHTML = `<div class="com-empty">Error: ${this.esc(res.message)}</div>`;
            return;
        }
        this.pendientes = res;
        const resumen = res.resumen || [];
        const totCob = resumen.reduce((s, r) => s + r.Total_Cobrado, 0);
        const totCom = resumen.reduce((s, r) => s + r.Total_Comision, 0);

        panel.innerHTML = `
            <div class="com-tot">
                <div><span>Cobrado sin liquidar</span><b>${this.fmt(totCob)}</b></div>
                <div style="border-left-color:#10b981;"><span>Comisiones por pagar</span><b>${this.fmt(totCom)}</b></div>
                <div style="border-left-color:#f59e0b;"><span>Doctores con pendientes</span><b>${resumen.length}</b></div>
            </div>
            ${resumen.length ? `
            <table class="com-table">
                <thead><tr>
                    <th>Doctor</th><th style="text-align:center;">Pagos</th>
                    <th style="text-align:right;">Cobrado</th><th style="text-align:right;">Comisión</th>
                    <th></th><th></th>
                </tr></thead>
                <tbody>
                ${resumen.map(r => `
                    <tr>
                        <td style="font-weight:700;">Dr(a). ${this.esc(r.Doctor)}
                            ${r.Sin_Configurar ? `<br><span class="com-warn"><i class="fas fa-exclamation-triangle"></i> ${r.Sin_Configurar} pago(s) sin % configurado</span>` : ''}
                        </td>
                        <td style="text-align:center;">${r.Pagos}</td>
                        <td class="num">${this.fmt(r.Total_Cobrado)}</td>
                        <td class="num" style="color:#059669;">${this.fmt(r.Total_Comision)}</td>
                        <td style="text-align:right;"><button class="com-btn com-btn-ghost" onclick="window.comisionesModule.verDetallePendiente(${r.ID_Medico})"><i class="fas fa-list"></i> Detalle</button></td>
                        <td style="text-align:right;"><button class="com-btn com-btn-green" ${r.Total_Comision > 0 ? '' : 'disabled style="opacity:.5;cursor:not-allowed;"'} onclick="window.comisionesModule.liquidar(${r.ID_Medico})"><i class="fas fa-hand-holding-usd"></i> Liquidar</button></td>
                    </tr>`).join('')}
                </tbody>
            </table>` : '<div class="com-empty"><i class="fas fa-check-circle" style="font-size:28px; color:#10b981;"></i><br><br>No hay cobros pendientes de comisión en este rango.</div>'}
            <p style="font-size:11px; color:#94a3b8; margin:14px 0 0 0;">
                Solo cuentan los pagos de pacientes asociados a un tratamiento con médico asignado. Cada pago se comisiona una sola vez.
            </p>`;
    },

    tablaPagos: function(filas, conPctOrigen) {
        const tot = (k) => filas.reduce((s, f) => s + (parseFloat(f[k]) || 0), 0);
        return `
            <div style="max-height:55vh; overflow:auto; border:1px solid #e2e8f0; border-radius:8px;">
            <table style="width:100%; border-collapse:collapse; font-size:12px; font-family:'Inter';">
                <thead><tr style="background:#f8fafc; position:sticky; top:0;">
                    <th style="text-align:left; padding:8px;">Fecha</th>
                    <th style="text-align:left; padding:8px;">Paciente</th>
                    <th style="text-align:left; padding:8px;">Tratamiento</th>
                    <th style="text-align:left; padding:8px;">Especialidad</th>
                    <th style="text-align:right; padding:8px;">Cobrado</th>
                    <th style="text-align:right; padding:8px;">%</th>
                    <th style="text-align:right; padding:8px;">Comisión</th>
                </tr></thead>
                <tbody>
                ${filas.map(f => `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:7px 8px;">${this.fecha(f.Fecha_Pago)}</td>
                        <td style="padding:7px 8px;">${this.esc(f.Paciente)}</td>
                        <td style="padding:7px 8px;">${this.esc(f.Nombre_Tratamiento)}</td>
                        <td style="padding:7px 8px;">${this.esc(f.Especialidad)}</td>
                        <td style="padding:7px 8px; text-align:right;">${this.fmt(f.Monto ?? f.Monto_Pago)}</td>
                        <td style="padding:7px 8px; text-align:right;">${Number(f.Porcentaje).toFixed(2)}%${
                            conPctOrigen && f.Origen_Porcentaje === 'defecto' ? ' <small style="color:#94a3b8;">(defecto)</small>'
                            : conPctOrigen && f.Origen_Porcentaje === 'sin configurar' ? ' <span class="com-warn">sin %</span>' : ''}</td>
                        <td style="padding:7px 8px; text-align:right; font-weight:700; color:#059669;">${this.fmt(f.Comision)}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot><tr style="background:#f1f5f9; font-weight:800;">
                    <td colspan="4" style="padding:8px;">TOTAL</td>
                    <td style="padding:8px; text-align:right;">${this.fmt(tot('Monto') || tot('Monto_Pago'))}</td>
                    <td></td>
                    <td style="padding:8px; text-align:right;">${this.fmt(tot('Comision'))}</td>
                </tr></tfoot>
            </table></div>`;
    },

    verDetallePendiente: function(idMedico) {
        const filas = (this.pendientes?.detalle || []).filter(f => f.ID_Medico === idMedico);
        const doc = filas[0]?.Doctor || '';
        Swal.fire({
            title: `Pendiente · Dr(a). ${this.esc(doc)}`,
            width: 950,
            html: this.tablaPagos(filas, true),
            confirmButtonText: 'Cerrar', confirmButtonColor: '#4f46e5'
        });
    },

    liquidar: async function(idMedico) {
        const r = (this.pendientes?.resumen || []).find(x => x.ID_Medico === idMedico);
        if (!r) return;
        const { fIn, fFin } = this.rango();
        const { value: form } = await Swal.fire({
            title: 'Liquidar comisión',
            html: `
                <div style="text-align:left; font-size:14px;">
                    <p style="margin:0 0 6px 0;">Doctor: <b>Dr(a). ${this.esc(r.Doctor)}</b></p>
                    <p style="margin:0 0 6px 0;">Pagos cobrados del <b>${fIn}</b> al <b>${fFin}</b>: ${r.Pagos}</p>
                    <p style="margin:0 0 14px 0;">Comisión a pagar: <b style="color:#059669; font-size:18px;">${this.fmt(r.Total_Comision)}</b></p>
                    ${r.Sin_Configurar ? `<p class="com-warn" style="display:block; margin-bottom:12px;">${r.Sin_Configurar} pago(s) sin % configurado no se incluyen; quedan pendientes.</p>` : ''}
                    <label style="font-size:11px; font-weight:800; color:#64748b;">MÉTODO DE PAGO AL DOCTOR</label>
                    <select id="liq-metodo" class="swal2-input" style="width:100%; margin:5px 0 12px 0;">
                        <option value="EFECTIVO">EFECTIVO (CAJA CHICA)</option>
                        <option value="TRANSFERENCIA">TRANSFERENCIA / BANCO</option>
                        <option value="TARJETA">TARJETA DÉBITO/CRÉDITO</option>
                    </select>
                    <label style="font-size:11px; font-weight:800; color:#64748b;">OBSERVACIONES (OPCIONAL)</label>
                    <textarea id="liq-obs" class="swal2-textarea" style="width:100%; margin:5px 0 0 0;" placeholder="Ej: Transferencia Banco Pichincha #123"></textarea>
                    <p style="font-size:11px; color:#94a3b8; margin-top:10px;">Se registrará como egreso en "Ingresos y Gastos" (categoría Comisiones Médicas).</p>
                </div>`,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check"></i> Registrar pago',
            confirmButtonColor: '#10b981',
            cancelButtonText: 'Cancelar',
            preConfirm: () => ({
                metodo_pago: document.getElementById('liq-metodo').value,
                observaciones: document.getElementById('liq-obs').value.trim()
            })
        });
        if (!form) return;

        const res = await window.api.post('/comisiones/liquidar', {
            id_clinica: this.idClinica(), id_medico: idMedico,
            fecha_inicio: fIn, fecha_fin: fFin, ...form
        });
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo liquidar.', 'error');

        const q = await Swal.fire({
            icon: 'success', title: 'Comisión liquidada', text: res.message,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-print"></i> Imprimir comprobante',
            cancelButtonText: 'Cerrar', confirmButtonColor: '#4f46e5'
        });
        if (q.isConfirmed) this.imprimir(res.id_liquidacion);
        this.cargarPendientes();
    },

    // ─────────────────────────── CONFIGURACIÓN ───────────────────────────
    cargarConfig: async function() {
        const panel = document.getElementById('com-panel-config');
        panel.innerHTML = '<div class="com-empty">Cargando doctores...</div>';
        const res = await window.api.get(`/comisiones/doctores?id_clinica=${this.idClinica()}`);
        if (res.status !== 'Success') {
            panel.innerHTML = `<div class="com-empty">Error: ${this.esc(res.message)}</div>`;
            return;
        }
        this.doctores = res.data || [];
        if (!this.doctores.length) {
            panel.innerHTML = '<div class="com-empty">No hay doctores activos en esta sede.</div>';
            return;
        }
        panel.innerHTML = `
            <table class="com-table">
                <thead><tr><th>Doctor</th><th>% por defecto</th><th>% por especialidad</th><th></th></tr></thead>
                <tbody>
                ${this.doctores.map(d => {
                    const def = d.porcentajes.find(p => p.especialidad === '*');
                    const esp = d.porcentajes.filter(p => p.especialidad !== '*');
                    return `
                    <tr>
                        <td style="font-weight:700;">Dr(a). ${this.esc(d.Doctor)}</td>
                        <td>${def ? `<b>${def.porcentaje}%</b>` : '<span class="com-warn">sin configurar</span>'}</td>
                        <td style="font-size:12px; color:#475569;">${esp.length ? esp.map(p => `${this.esc(p.especialidad)}: <b>${p.porcentaje}%</b>`).join(' · ') : '—'}</td>
                        <td style="text-align:right;"><button class="com-btn com-btn-primary" onclick="window.comisionesModule.editarConfig(${d.ID_Usuario})"><i class="fas fa-pen"></i> Editar %</button></td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
            <p style="font-size:11px; color:#94a3b8; margin:14px 0 0 0;">
                El % por defecto se aplica a toda especialidad que no tenga un % propio. La especialidad de cada tratamiento es la elegida en el MSP-024 al planificar.
            </p>`;
    },

    editarConfig: async function(idUsuario) {
        const d = this.doctores.find(x => x.ID_Usuario === idUsuario);
        if (!d) return;
        const valor = (esp) => {
            const p = d.porcentajes.find(x => x.especialidad === esp);
            return p ? p.porcentaje : '';
        };
        const filas = this.especialidades.map((e, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f1f5f9;">
                <span style="font-size:13px;">${this.esc(e)}</span>
                <div style="display:flex; align-items:center; gap:4px;">
                    <input id="cfg-esp-${i}" type="number" min="0" max="100" step="0.01" value="${valor(e)}" placeholder="defecto"
                           style="width:90px; padding:6px; border:1px solid #cbd5e1; border-radius:6px; text-align:right;">
                    <span>%</span>
                </div>
            </div>`).join('');

        const { value: lista } = await Swal.fire({
            title: `Comisiones · Dr(a). ${this.esc(d.Doctor)}`,
            width: 560,
            html: `
                <div style="text-align:left;">
                    <div style="background:#eef2ff; border-radius:10px; padding:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <b style="font-size:13px; color:#4f46e5;">% POR DEFECTO</b>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <input id="cfg-defecto" type="number" min="0" max="100" step="0.01" value="${valor('*')}"
                                   style="width:90px; padding:6px; border:2px solid #4f46e5; border-radius:6px; text-align:right; font-weight:700;">
                            <span>%</span>
                        </div>
                    </div>
                    <p style="font-size:11px; color:#64748b; margin:0 0 8px 0;">Deja vacía una especialidad para que use el % por defecto.</p>
                    <div style="max-height:45vh; overflow:auto;">${filas}</div>
                </div>`,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> Guardar',
            confirmButtonColor: '#4f46e5',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const out = [];
                const leer = (id) => document.getElementById(id).value.trim();
                const validar = (v, nombre) => {
                    const n = Number(v);
                    if (isNaN(n) || n < 0 || n > 100) { Swal.showValidationMessage(`"${nombre}": el % debe estar entre 0 y 100.`); return false; }
                    return true;
                };
                const def = leer('cfg-defecto');
                if (def !== '') { if (!validar(def, 'Por defecto')) return false; out.push({ especialidad: '*', porcentaje: Number(def) }); }
                for (let i = 0; i < this.especialidades.length; i++) {
                    const v = leer(`cfg-esp-${i}`);
                    if (v === '') continue;
                    if (!validar(v, this.especialidades[i])) return false;
                    out.push({ especialidad: this.especialidades[i], porcentaje: Number(v) });
                }
                return out;
            }
        });
        if (!lista) return;
        const res = await window.api.put(`/comisiones/config/${idUsuario}`, { porcentajes: lista });
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo guardar.', 'error');
        Swal.fire({ icon: 'success', title: 'Guardado', text: res.message, timer: 1300, showConfirmButton: false });
        this.cargarConfig();
    },

    // ─────────────────────────── HISTORIAL ───────────────────────────
    cargarHistorial: async function() {
        const panel = document.getElementById('com-panel-historial');
        panel.innerHTML = '<div class="com-empty">Cargando liquidaciones...</div>';
        const res = await window.api.get(`/comisiones/liquidaciones?id_clinica=${this.idClinica()}`);
        if (res.status !== 'Success') {
            panel.innerHTML = `<div class="com-empty">Error: ${this.esc(res.message)}</div>`;
            return;
        }
        const data = res.data || [];
        panel.innerHTML = data.length ? `
            <table class="com-table">
                <thead><tr>
                    <th>#</th><th>Fecha pago</th><th>Doctor</th><th>Período cobrado</th>
                    <th style="text-align:center;">Pagos</th><th style="text-align:right;">Cobrado</th>
                    <th style="text-align:right;">Comisión</th><th>Método</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                ${data.map(l => `
                    <tr style="${l.Estado === 'ANULADA' ? 'opacity:.55;' : ''}">
                        <td style="font-weight:800; color:#4f46e5;">${l.ID_Liquidacion}</td>
                        <td>${this.fecha(l.Fecha_Registro)}</td>
                        <td style="font-weight:600;">Dr(a). ${this.esc(l.Doctor)}</td>
                        <td style="font-size:12px;">${this.fecha(l.Fecha_Desde)} – ${this.fecha(l.Fecha_Hasta)}</td>
                        <td style="text-align:center;">${l.Pagos}</td>
                        <td class="num">${this.fmt(l.Total_Cobrado)}</td>
                        <td class="num" style="color:#059669;">${this.fmt(l.Total_Comision)}</td>
                        <td style="font-size:12px;">${this.esc(l.Metodo_Pago)}</td>
                        <td><span style="font-size:11px; font-weight:800; color:${l.Estado === 'ANULADA' ? '#b91c1c' : '#059669'};">${l.Estado}</span></td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="com-btn com-btn-ghost" onclick="window.comisionesModule.imprimir(${l.ID_Liquidacion})" title="Ver / imprimir"><i class="fas fa-print"></i></button>
                            ${l.Estado !== 'ANULADA' ? `<button class="com-btn com-btn-red" onclick="window.comisionesModule.anular(${l.ID_Liquidacion})" title="Anular"><i class="fas fa-ban"></i></button>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>` : '<div class="com-empty">Aún no hay liquidaciones registradas.</div>';
    },

    anular: async function(id) {
        const c = await Swal.fire({
            icon: 'warning', title: `¿Anular liquidación #${id}?`,
            text: 'Se elimina el egreso registrado y los pagos vuelven a quedar pendientes de comisión.',
            showCancelButton: true, confirmButtonText: 'Sí, anular', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancelar'
        });
        if (!c.isConfirmed) return;
        const res = await window.api.post(`/comisiones/liquidaciones/${id}/anular`, {});
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo anular.', 'error');
        Swal.fire({ icon: 'success', title: 'Anulada', text: res.message, timer: 1500, showConfirmButton: false });
        this.cargarHistorial();
    },

    // Comprobante imprimible (mismo patrón de ventana que el reporte del KPI)
    imprimir: async function(id) {
        const res = await window.api.get(`/comisiones/liquidaciones/${id}`);
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo cargar.', 'error');
        const c = res.cabecera, det = res.detalle || [];
        const serverBase = window.api.baseURL.replace('/api', '').replace(/\/$/, '');
        const logoUrl = c.Logo_Ruta ? `${serverBase}/uploads/logos/${c.Logo_Ruta}` : '';
        const f = this.fmt, e = this.esc, fe = this.fecha;

        const v = window.open('', '_blank');
        v.document.write(`
            <html><head><title>Liquidación de comisión #${c.ID_Liquidacion}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body { font-family:'Inter',sans-serif; padding:30px; color:#1e293b; }
                .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #1e293b; padding-bottom:15px; margin-bottom:20px; }
                .header img { max-height:70px; max-width:200px; object-fit:contain; }
                .header-info { text-align:right; } .header-info h2 { margin:0; font-size:1.3rem; font-weight:800; }
                .header-info p { margin:2px 0; font-size:.85rem; color:#64748b; font-weight:700; }
                .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
                .card { padding:12px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; }
                .card span { display:block; font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; }
                .card strong { font-size:1rem; }
                table { width:100%; border-collapse:collapse; font-size:10.5px; }
                th { background:#f1f5f9; text-align:left; padding:8px; border-bottom:2px solid #e2e8f0; color:#475569; }
                td { padding:6px 8px; border-bottom:1px solid #f1f5f9; } .r { text-align:right; }
                tfoot td { font-weight:800; background:#f1f5f9; }
                .firmas { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:70px; text-align:center; font-size:11px; }
                .firmas div { border-top:1px solid #94a3b8; padding-top:6px; }
                .anulada { color:#b91c1c; font-weight:800; font-size:1.2rem; text-align:center; border:2px solid #b91c1c; padding:6px; margin-bottom:15px; }
                .no-print { text-align:center; margin-bottom:20px; }
                .no-print button { padding:10px 22px; background:#4f46e5; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; }
                @media print { body { padding:0; } .no-print { display:none; } }
            </style></head><body>
                <div class="no-print"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
                <div class="header">
                    ${logoUrl ? `<img src="${logoUrl}" onerror="this.style.display='none'">` : '<div></div>'}
                    <div class="header-info">
                        <h2>LIQUIDACIÓN DE COMISIONES #${c.ID_Liquidacion}</h2>
                        <p>${e((c.Nombre_Clinica || '').toUpperCase())}${c.RUC ? ' · RUC ' + e(c.RUC) : ''}</p>
                        <p>Fecha de pago: ${new Date(c.Fecha_Registro).toLocaleString('es-EC')}</p>
                    </div>
                </div>
                ${c.Estado === 'ANULADA' ? '<div class="anulada">LIQUIDACIÓN ANULADA</div>' : ''}
                <div class="grid">
                    <div class="card"><span>Doctor</span><strong>Dr(a). ${e(c.Doctor)}</strong>${c.Registro_Sanitario ? `<br><small>Reg. ${e(c.Registro_Sanitario)}</small>` : ''}</div>
                    <div class="card"><span>Cobros del período</span><strong>${fe(c.Fecha_Desde)} – ${fe(c.Fecha_Hasta)}</strong></div>
                    <div class="card"><span>Total cobrado</span><strong>${f(c.Total_Cobrado)}</strong></div>
                    <div class="card" style="background:#1e293b;"><span style="color:#cbd5e1;">Comisión pagada</span><strong style="color:white;">${f(c.Total_Comision)}</strong><br><small style="color:#cbd5e1;">${e(c.Metodo_Pago)}</small></div>
                </div>
                <table>
                    <thead><tr><th>Fecha cobro</th><th>Paciente</th><th>Tratamiento</th><th>Especialidad</th><th class="r">Cobrado</th><th class="r">%</th><th class="r">Comisión</th></tr></thead>
                    <tbody>${det.length ? det.map(d => `<tr><td>${fe(d.Fecha_Pago)}</td><td>${e(d.Paciente)}</td><td>${e(d.Nombre_Tratamiento)}</td><td>${e(d.Especialidad)}</td><td class="r">${f(d.Monto_Pago)}</td><td class="r">${Number(d.Porcentaje).toFixed(2)}%</td><td class="r">${f(d.Comision)}</td></tr>`).join('')
                        : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Sin detalle (liquidación anulada).</td></tr>'}</tbody>
                    <tfoot><tr><td colspan="4">TOTAL</td><td class="r">${f(c.Total_Cobrado)}</td><td></td><td class="r">${f(c.Total_Comision)}</td></tr></tfoot>
                </table>
                ${c.Observaciones ? `<p style="font-size:11px; margin-top:12px;"><b>Observaciones:</b> ${e(c.Observaciones)}</p>` : ''}
                <div class="firmas"><div>Entregué conforme<br><b>${e(c.Nombre_Clinica || 'La clínica')}</b></div><div>Recibí conforme<br><b>Dr(a). ${e(c.Doctor)}</b></div></div>
                <div style="margin-top:30px; text-align:center; font-size:8px; color:#94a3b8;">Generado por Ametra OS - ${new Date().toLocaleString()}</div>
            </body></html>`);
        v.document.close();
    }
};
