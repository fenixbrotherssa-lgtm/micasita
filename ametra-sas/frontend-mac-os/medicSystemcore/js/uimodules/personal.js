// ==========================================
// MÓDULO: NÓMINA Y PERSONAL — portado de MasterHotel/OMNI CORE
// Todo dinero que sale (adelanto, bono, horas, pago de rol, liquidación) queda como
// EGRESO en Ingresos y Gastos; el descuento solo resta del neto.
// ==========================================
window.personalModule = {
    personal: [],
    nomina: null,
    categorias: [],
    clinicaNombre: '',
    region: null,

    TIPOS: {
        ADELANTO: 'Adelanto de nómina', BONO: 'Bono / incentivo', DESCUENTO: 'Descuento',
        HORAS_SUPLEMENTARIAS: 'Horas suplementarias (+50%)', HORAS_EXTRAORDINARIAS: 'Horas extraordinarias (+100%)',
        PAGO_NOMINA: 'Pago de nómina', LIQUIDACION_FINAL: 'Liquidación final'
    },

    init: async function() {
        const hoy = new Date();
        document.getElementById('nom-periodo').value = this.periodoActual();
        await this.cargarClinicas();
        await this.cargarCategorias();
        await this.cargarPersonal();
    },

    sesion: () => JSON.parse(localStorage.getItem('usuario_sesion') || '{}'),
    fmt: (v) => `$${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    periodoActual: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
    hoyISO: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
    // Las fechas DATE llegan como medianoche local serializada; se muestran con la fecha local.
    fechaCorta: (v) => v ? new Date(v).toLocaleDateString('es-EC') : '—',
    fechaISO: (v) => { if (!v) return ''; const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },

    idClinica: function() {
        const sel = document.getElementById('nom-clinica');
        const s = this.sesion();
        return (sel && sel.value) ? sel.value : (s.ID_Clinica || s.id_clinica || 0);
    },

    cargarClinicas: async function() {
        const clinicas = await window.api.get('/clinicas/listar');
        if (!Array.isArray(clinicas) || clinicas.length < 2) return;
        const s = this.sesion();
        const actual = s.ID_Clinica || s.id_clinica;
        document.getElementById('nom-clinica').innerHTML = clinicas.map(c =>
            `<option value="${c.ID_Clinica}" ${parseInt(c.ID_Clinica) === parseInt(actual) ? 'selected' : ''}>${this.esc(c.Nombre_Clinica)}</option>`).join('');
        document.getElementById('nom-container-clinica').style.display = 'flex';
    },

    cambiarClinica: function() {
        this.nomina = null;
        document.getElementById('nom-resultado').innerHTML = '<div class="nom-empty">Elige el período y pulsa "Calcular".</div>';
        this.cargarPersonal();
    },

    // Categorías de Gastos para el egreso; por defecto la de sueldos/nómina si existe.
    cargarCategorias: async function() {
        const res = await window.api.get('/gastos/categorias');
        this.categorias = Array.isArray(res) ? res.map(c => c.Nombre_Categoria) : [];
        if (!this.categorias.some(c => /n[oó]mina|personal/i.test(c))) this.categorias.unshift('Nómina y Personal');
    },
    categoriaDefecto: function() {
        return this.categorias.find(c => /n[oó]mina|personal/i.test(c)) || this.categorias.find(c => /sueldo/i.test(c)) || 'Nómina y Personal';
    },
    htmlPago: function(prefijo) {
        const def = this.categoriaDefecto();
        return `
            <div class="nom-form" style="margin-top:12px;">
                <div><label>¿DE DÓNDE SALE EL DINERO?</label>
                    <select id="${prefijo}-metodo">
                        <option value="EFECTIVO">EFECTIVO (CAJA CHICA)</option>
                        <option value="TRANSFERENCIA">TRANSFERENCIA / BANCO</option>
                        <option value="TARJETA">TARJETA DÉBITO/CRÉDITO</option>
                    </select></div>
                <div><label>CATEGORÍA DEL EGRESO</label>
                    <select id="${prefijo}-cat">${this.categorias.map(c => `<option ${c === def ? 'selected' : ''}>${this.esc(c)}</option>`).join('')}</select></div>
            </div>`;
    },

    // ─────────────────────────── PERSONAL ───────────────────────────
    cargarPersonal: async function() {
        const cont = document.getElementById('nom-tabla-personal');
        cont.innerHTML = '<div class="nom-empty">Cargando personal...</div>';
        const res = await window.api.get(`/personal/lista?id_clinica=${this.idClinica()}`);
        if (res.status !== 'Success') { cont.innerHTML = `<div class="nom-empty">Error: ${this.esc(res.message)}</div>`; return; }
        this.personal = res.data || [];
        this.clinicaNombre = res.clinica || '';
        this.region = res.region;

        document.getElementById('nom-aviso').innerHTML = !this.region
            ? `<div class="nom-aviso" style="background:#fef3c7; color:#b45309;"><i class="fas fa-exclamation-triangle"></i>
                 Esta clínica no tiene configurada la región del Décimo Cuarto (Costa/Galápagos o Sierra/Amazonía); se asume Sierra/Amazonía.
                 Configúrala en <b>Parámetros SBU/IESS</b>.</div>` : '';

        if (!this.personal.length) {
            cont.innerHTML = '<div class="nom-empty">No hay empleados registrados. Pulsa "Nuevo empleado".</div>';
            return;
        }
        cont.innerHTML = `
            <table class="nom-table">
                <thead><tr><th>Empleado</th><th>Cargo</th><th style="text-align:right;">Salario base</th><th>Ingreso</th><th style="text-align:right;">Adelantos (hist.)</th><th>Teléfono</th><th></th></tr></thead>
                <tbody>
                ${this.personal.map(p => `
                    <tr>
                        <td><b>${this.esc(p.Nombre_Completo)}</b><br><small style="color:#94a3b8;">${this.esc(p.Cedula || '—')}</small>
                            ${p.Afiliado_IESS ? ' <span class="nom-tag" style="background:#dcfce7; color:#047857;"><i class="fas fa-shield-alt"></i> IESS</span>' : ''}</td>
                        <td style="font-size:12px;">${this.esc(p.Cargo || '—')}</td>
                        <td class="num" style="color:#059669;">${this.fmt(p.Salario_Base)}</td>
                        <td style="font-size:12px;">${this.fechaCorta(p.Fecha_Ingreso)}</td>
                        <td class="num" style="color:${p.Total_Adelantos > 0 ? '#dc2626' : '#94a3b8'};">${p.Total_Adelantos > 0 ? '-' + this.fmt(p.Total_Adelantos) : '$0.00'}</td>
                        <td style="font-size:12px;">${this.esc(p.Telefono || '—')}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="nom-btn nom-btn-sm nom-btn-ghost" title="Editar" onclick="window.personalModule.editarEmpleado(${p.ID_Personal})"><i class="fas fa-edit"></i></button>
                            <button class="nom-btn nom-btn-sm nom-btn-primary" title="Adelanto / bono / descuento / horas" onclick="window.personalModule.nuevoMovimiento(${p.ID_Personal})"><i class="fas fa-exchange-alt"></i></button>
                            <button class="nom-btn nom-btn-sm nom-btn-gray" title="Historial" onclick="window.personalModule.verHistorial(${p.ID_Personal})"><i class="fas fa-history"></i></button>
                            <button class="nom-btn nom-btn-sm nom-btn-red" title="Liquidación final (finiquito)" onclick="window.personalModule.liquidacionFinal(${p.ID_Personal})"><i class="fas fa-file-invoice-dollar"></i></button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    },

    editarEmpleado: async function(id = null) {
        const e = id ? this.personal.find(p => p.ID_Personal === id) : {};
        const v = (k) => this.esc(e?.[k] ?? '');
        const { value: f, isDenied } = await Swal.fire({
            title: id ? 'Editar empleado' : 'Nuevo empleado',
            width: 620,
            html: `
                <div class="nom-form">
                    <div class="span2"><label>NOMBRE COMPLETO</label><input id="emp-nombre" value="${v('Nombre_Completo')}" placeholder="Apellidos y nombres"></div>
                    <div><label>CÉDULA</label><input id="emp-cedula" value="${v('Cedula')}"></div>
                    <div><label>CARGO</label><input id="emp-cargo" value="${v('Cargo')}" placeholder="Ej: Asistente dental"></div>
                    <div><label>SALARIO BASE MENSUAL ($)</label><input id="emp-salario" type="number" min="0" step="0.01" value="${v('Salario_Base')}"></div>
                    <div><label>FECHA DE INGRESO</label><input id="emp-ingreso" type="date" value="${this.fechaISO(e?.Fecha_Ingreso)}"></div>
                    <div><label>TELÉFONO</label><input id="emp-tel" value="${v('Telefono')}"></div>
                    <div><label>CORREO</label><input id="emp-correo" type="email" value="${v('Correo')}"></div>
                </div>
                <div style="background:#f8fafc; border-radius:10px; padding:12px; margin-top:12px; text-align:left; font-size:13px;">
                    <label style="display:flex; gap:8px; align-items:center; font-weight:800; color:#1e293b; cursor:pointer;">
                        <input type="checkbox" id="emp-iess" ${e?.Afiliado_IESS ? 'checked' : ''}> Afiliado al IESS (aporte personal 9.45%)</label>
                    <div style="font-size:11px; font-weight:800; color:#64748b; margin:10px 0 4px;">BENEFICIOS MENSUALIZADOS (el empleado eligió recibirlos cada mes)</div>
                    <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" id="emp-d13" ${e?.Decimo_Tercero_Mensualizado ? 'checked' : ''}> Décimo Tercero</label>
                    <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" id="emp-d14" ${e?.Decimo_Cuarto_Mensualizado ? 'checked' : ''}> Décimo Cuarto</label>
                    <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" id="emp-fr" ${e?.Fondo_Reserva_Mensualizado ? 'checked' : ''}> Fondo de Reserva</label>
                </div>`,
            showCancelButton: true,
            showDenyButton: !!id,
            denyButtonText: '<i class="fas fa-user-slash"></i> Desactivar',
            confirmButtonText: '<i class="fas fa-save"></i> Guardar',
            confirmButtonColor: '#4f46e5', cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const nombre = document.getElementById('emp-nombre').value.trim();
                if (nombre.length < 3) { Swal.showValidationMessage('Ingrese el nombre completo.'); return false; }
                return {
                    id_personal: id || undefined, id_clinica: this.idClinica(), nombre_completo: nombre,
                    cedula: document.getElementById('emp-cedula').value.trim(),
                    cargo: document.getElementById('emp-cargo').value.trim(),
                    salario_base: document.getElementById('emp-salario').value || 0,
                    fecha_ingreso: document.getElementById('emp-ingreso').value || null,
                    telefono: document.getElementById('emp-tel').value.trim(),
                    correo: document.getElementById('emp-correo').value.trim(),
                    afiliado_iess: document.getElementById('emp-iess').checked,
                    decimo_tercero_mensualizado: document.getElementById('emp-d13').checked,
                    decimo_cuarto_mensualizado: document.getElementById('emp-d14').checked,
                    fondo_reserva_mensualizado: document.getElementById('emp-fr').checked
                };
            }
        });
        if (isDenied) return this.desactivar(id);
        if (!f) return;
        const res = await window.api.post('/personal/guardar', f);
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo guardar.', 'error');
        Swal.fire({ icon: 'success', title: 'Empleado guardado', timer: 1300, showConfirmButton: false });
        this.cargarPersonal();
    },

    desactivar: async function(id) {
        const c = await Swal.fire({ icon: 'warning', title: '¿Desactivar empleado?', text: 'Deja de aparecer en el rol de pagos. Su historial se conserva.',
            showCancelButton: true, confirmButtonText: 'Sí, desactivar', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancelar' });
        if (!c.isConfirmed) return;
        const res = await window.api.post(`/personal/${id}/desactivar`, {});
        if (res.status !== 'Success') return Swal.fire('Error', res.message, 'error');
        this.cargarPersonal();
    },

    nuevoMovimiento: async function(id) {
        const e = this.personal.find(p => p.ID_Personal === id);
        if (!e) return;
        const { value: f } = await Swal.fire({
            title: `Movimiento · ${this.esc(e.Nombre_Completo)}`,
            width: 560,
            html: `
                <div class="nom-form">
                    <div class="span2"><label>TIPO</label>
                        <select id="mov-tipo">
                            <option value="ADELANTO">Adelanto de nómina (se descuenta del rol)</option>
                            <option value="BONO">Bono / incentivo</option>
                            <option value="DESCUENTO">Descuento (no mueve dinero)</option>
                            <option value="HORAS_SUPLEMENTARIAS">Horas suplementarias (+50%)</option>
                            <option value="HORAS_EXTRAORDINARIAS">Horas extraordinarias (+100%)</option>
                        </select></div>
                    <div id="mov-monto-wrap"><label>MONTO ($)</label><input id="mov-monto" type="number" min="0" step="0.01"></div>
                    <div id="mov-horas-wrap" style="display:none;"><label>HORAS</label><input id="mov-horas" type="number" min="0" step="0.5"></div>
                    <div><label>PERÍODO DEL ROL</label><input id="mov-periodo" type="month" value="${document.getElementById('nom-periodo').value || this.periodoActual()}"></div>
                    <div class="span2"><label>DESCRIPCIÓN</label><input id="mov-desc" placeholder="Motivo u observación"></div>
                    <div class="span2" id="mov-preview" style="font-size:12px; font-weight:700; color:#4f46e5;"></div>
                </div>
                <div id="mov-pago-wrap" style="background:#f8fafc; border-radius:10px; padding:12px; margin-top:12px; text-align:left;">
                    <label style="display:flex; gap:8px; align-items:center; font-weight:800; font-size:13px; cursor:pointer;">
                        <input type="checkbox" id="mov-pagar" checked> ¿Ya se entregó el dinero? Registrar egreso en Gastos</label>
                    <div id="mov-pago-campos">${this.htmlPago('mov')}</div>
                    <p style="font-size:11px; color:#94a3b8; margin:8px 0 0;">Si no se entrega ahora, el bono/horas se suma al neto del rol de ese período.</p>
                </div>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-check"></i> Registrar', confirmButtonColor: '#4f46e5', cancelButtonText: 'Cancelar',
            didOpen: () => {
                const tipo = document.getElementById('mov-tipo');
                const actualizar = () => {
                    const t = tipo.value, esHoras = t.startsWith('HORAS_');
                    document.getElementById('mov-monto-wrap').style.display = esHoras ? 'none' : 'block';
                    document.getElementById('mov-horas-wrap').style.display = esHoras ? 'block' : 'none';
                    document.getElementById('mov-pago-wrap').style.display = t === 'DESCUENTO' ? 'none' : 'block';
                    // El adelanto siempre es dinero entregado: se registra el egreso.
                    const chk = document.getElementById('mov-pagar');
                    if (t === 'ADELANTO') { chk.checked = true; chk.disabled = true; } else chk.disabled = false;
                    document.getElementById('mov-pago-campos').style.display = chk.checked ? 'block' : 'none';
                    const h = parseFloat(document.getElementById('mov-horas').value) || 0;
                    const vh = parseFloat(e.Salario_Base) / 240, rec = t === 'HORAS_EXTRAORDINARIAS' ? 2 : 1.5;
                    document.getElementById('mov-preview').textContent = esHoras && h
                        ? `${h}h × $${vh.toFixed(4)}/h × ${rec === 2 ? '100%' : '50%'} recargo = ${this.fmt(h * vh * rec)}` : '';
                };
                tipo.onchange = actualizar;
                document.getElementById('mov-horas').oninput = actualizar;
                document.getElementById('mov-pagar').onchange = actualizar;
                actualizar();
            },
            preConfirm: () => {
                const tipo = document.getElementById('mov-tipo').value;
                const esHoras = tipo.startsWith('HORAS_');
                const monto = parseFloat(document.getElementById('mov-monto').value);
                const horas = parseFloat(document.getElementById('mov-horas').value);
                if (esHoras ? !(horas > 0) : !(monto > 0)) { Swal.showValidationMessage(esHoras ? 'Ingrese las horas.' : 'Ingrese un monto mayor a 0.'); return false; }
                const periodo = document.getElementById('mov-periodo').value;
                if (!periodo) { Swal.showValidationMessage('Indique el período.'); return false; }
                const pagar = tipo !== 'DESCUENTO' && document.getElementById('mov-pagar').checked;
                return {
                    id_personal: id, id_clinica: this.idClinica(), tipo, periodo,
                    monto: esHoras ? undefined : monto, horas: esHoras ? horas : undefined,
                    descripcion: document.getElementById('mov-desc').value.trim() || undefined,
                    registrar_pago: pagar,
                    metodo_pago: pagar ? document.getElementById('mov-metodo').value : undefined,
                    categoria: pagar ? document.getElementById('mov-cat').value : undefined
                };
            }
        });
        if (!f) return;
        const res = await window.api.post('/personal/movimiento', f);
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo registrar.', 'error');
        const q = await Swal.fire({ icon: 'success', title: 'Movimiento registrado', text: res.message,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-print"></i> Imprimir comprobante', cancelButtonText: 'Cerrar', confirmButtonColor: '#4f46e5' });
        if (q.isConfirmed) this.imprimirMovimiento(e, f.tipo, res.monto, f.descripcion, f.periodo);
        this.cargarPersonal();
        if (this.nomina) this.generarNomina();
    },

    verHistorial: async function(id) {
        const e = this.personal.find(p => p.ID_Personal === id);
        const res = await window.api.get(`/personal/${id}/historial`);
        if (res.status !== 'Success') return Swal.fire('Error', res.message, 'error');
        const movs = res.data || [];
        const color = { ADELANTO: '#dc2626', BONO: '#059669', DESCUENTO: '#d97706', PAGO_NOMINA: '#2563eb', HORAS_SUPLEMENTARIAS: '#7c3aed', HORAS_EXTRAORDINARIAS: '#7c3aed', LIQUIDACION_FINAL: '#b91c1c' };
        const positivos = ['BONO', 'PAGO_NOMINA', 'HORAS_SUPLEMENTARIAS', 'HORAS_EXTRAORDINARIAS', 'LIQUIDACION_FINAL'];
        Swal.fire({
            title: `Historial · ${this.esc(e?.Nombre_Completo || '')}`,
            width: 760,
            html: movs.length ? `<div style="max-height:60vh; overflow:auto; text-align:left;">${movs.map(m => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 4px; border-bottom:1px solid #f1f5f9;">
                    <div style="min-width:0;">
                        <span class="nom-tag" style="background:${color[m.Tipo] || '#64748b'}; color:white;">${this.TIPOS[m.Tipo] || m.Tipo}</span>
                        <span style="font-size:12px; color:#334155;"> ${this.esc(m.Descripcion || '')}</span>
                        <div style="font-size:11px; color:#94a3b8; margin-top:3px;">${new Date(m.Fecha_Movimiento).toLocaleString('es-EC')} · Período ${m.Periodo || '—'} ·
                            ${m.Tipo === 'DESCUENTO' ? 'no mueve dinero' : m.ID_Gasto ? `<span style="color:#059669; font-weight:700;">egreso registrado (${this.esc(m.Metodo_Pago || '')})</span>` : '<span style="color:#d97706; font-weight:700;">se paga en el rol</span>'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <b style="color:${color[m.Tipo] || '#64748b'};">${positivos.includes(m.Tipo) ? '+' : '-'}${this.fmt(m.Monto)}</b>
                        <button class="nom-btn nom-btn-sm nom-btn-red" title="Anular" onclick="window.personalModule.anularMovimiento(${m.ID_Movimiento}, ${id})"><i class="fas fa-ban"></i></button>
                    </div>
                </div>`).join('')}</div>` : '<div class="nom-empty">Sin movimientos registrados.</div>',
            confirmButtonText: 'Cerrar', confirmButtonColor: '#4f46e5'
        });
    },

    anularMovimiento: async function(idMov, idPersonal) {
        const c = await Swal.fire({ icon: 'warning', title: '¿Anular este movimiento?', text: 'Si generó un egreso en Gastos, también se elimina.',
            showCancelButton: true, confirmButtonText: 'Sí, anular', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancelar' });
        if (!c.isConfirmed) return this.verHistorial(idPersonal);
        const res = await window.api.post(`/personal/movimiento/${idMov}/anular`, {});
        if (res.status !== 'Success') return Swal.fire('Error', res.message, 'error');
        await Swal.fire({ icon: 'success', title: 'Anulado', text: res.message, timer: 1400, showConfirmButton: false });
        this.cargarPersonal();
        if (this.nomina) this.generarNomina();
        this.verHistorial(idPersonal);
    },

    // ─────────────────────────── ROL DE PAGOS ───────────────────────────
    generarNomina: async function() {
        const periodo = document.getElementById('nom-periodo').value;
        const cont = document.getElementById('nom-resultado');
        if (!periodo) return Swal.fire('Atención', 'Seleccione el período.', 'info');
        cont.innerHTML = '<div class="nom-empty">Calculando rol de pagos...</div>';
        const res = await window.api.post('/personal/nomina', { id_clinica: this.idClinica(), periodo });
        if (res.status !== 'Success') {
            this.nomina = null;
            cont.innerHTML = `<div class="nom-aviso" style="background:#fee2e2; color:#b91c1c;"><i class="fas fa-exclamation-circle"></i> ${this.esc(res.message)}
                ${/parámetros/i.test(res.message || '') ? ' <button class="nom-btn nom-btn-sm nom-btn-primary" onclick="window.personalModule.abrirParametros()">Configurar ahora</button>' : ''}</div>`;
            return;
        }
        this.nomina = res;
        const d14 = res.decimoCuarto;
        let avisos = '';
        if (res.parametrosDeOtroAnio) avisos += `<div class="nom-aviso" style="background:#fef3c7; color:#b45309;"><i class="fas fa-exclamation-triangle"></i> No hay SBU/IESS configurado para ${periodo.slice(0, 4)}; se usan los de ${res.parametros.Anio} (SBU ${this.fmt(res.parametros.SBU)}). Actualízalos en Parámetros SBU/IESS.</div>`;
        if (d14 && d14.esMesDePago) avisos += `<div class="nom-aviso" style="background:#eff6ff; color:#1d4ed8;"><i class="fas fa-bell"></i> Este es el mes de pago del Décimo Cuarto (${d14.region === 'COSTA' ? 'Costa/Galápagos' : 'Sierra/Amazonía'}, fecha tope ${d14.fechaTope}). A quien no lo tenga mensualizado, págaselo aparte este mes.</div>`;

        if (!res.nomina.length) { cont.innerHTML = avisos + '<div class="nom-empty">Sin empleados activos para este período.</div>'; return; }
        const total = res.nomina.reduce((s, n) => s + n.NetoPagar, 0);
        const pendiente = res.nomina.filter(n => !n.Pagado).reduce((s, n) => s + n.NetoPagar, 0);
        const menos = (v) => v > 0 ? '-' + this.fmt(v) : '—';
        const mas = (v) => v > 0 ? '+' + this.fmt(v) : '—';
        cont.innerHTML = avisos + `
            <table class="nom-table">
                <thead><tr>
                    <th>Empleado</th><th style="text-align:right;">Sueldo ganado</th><th style="text-align:right;">Bonos</th><th style="text-align:right;">Horas extra</th>
                    <th style="text-align:right;">Adelantos</th><th style="text-align:right;">Descuentos</th><th style="text-align:right;">IESS personal</th>
                    <th style="text-align:right;">Neto a pagar</th><th></th>
                </tr></thead>
                <tbody>
                ${res.nomina.map((n, i) => `
                    <tr>
                        <td><b>${this.esc(n.Nombre_Completo)}</b><br><small style="color:#94a3b8;">${this.esc(n.Cargo || '')}${n.Prorrateado ? ` · ${n.DiasTrabajados} días` : ''}</small></td>
                        <td class="num" style="color:#059669;">${this.fmt(n.SalarioBase)}</td>
                        <td class="num" style="color:#2563eb;">${mas(n.Bonos)}</td>
                        <td class="num" style="color:#7c3aed;">${mas(n.HorasExtra)}</td>
                        <td class="num" style="color:#dc2626;">${menos(n.Adelantos)}</td>
                        <td class="num" style="color:#d97706;">${menos(n.Descuentos)}</td>
                        <td class="num" style="color:#b91c1c;">${menos(n.AporteIessPersonal)}</td>
                        <td class="num" style="font-size:15px; color:#059669;">${this.fmt(n.NetoPagar)}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            ${n.Pagado
                                ? `<span class="nom-tag" style="background:#dcfce7; color:#047857;" title="${new Date(n.InfoPago.Fecha_Movimiento).toLocaleString('es-EC')} · ${this.esc(n.InfoPago.Metodo_Pago || '')}"><i class="fas fa-check-circle"></i> PAGADO</span>`
                                : `<button class="nom-btn nom-btn-sm nom-btn-green" onclick="window.personalModule.pagarNomina(${i})"><i class="fas fa-money-check-alt"></i> Pagar</button>`}
                            <button class="nom-btn nom-btn-sm nom-btn-gray" title="Provisiones (décimos, fondo de reserva, vacaciones)" onclick="window.personalModule.verProvisiones(${i})"><i class="fas fa-piggy-bank"></i></button>
                            <button class="nom-btn nom-btn-sm nom-btn-ghost" title="Imprimir rol" onclick="window.personalModule.imprimirRol(${i})"><i class="fas fa-print"></i></button>
                        </td>
                    </tr>`).join('')}
                </tbody>
                <tfoot><tr style="background:#f1f5f9; font-weight:800;">
                    <td colspan="7" style="text-align:right; padding:12px 8px;">TOTAL NÓMINA ${periodo} ${pendiente > 0 ? `<span style="color:#d97706; font-size:12px;">(pendiente de pagar: ${this.fmt(pendiente)})</span>` : ''}</td>
                    <td class="num" style="font-size:16px; color:#059669;">${this.fmt(total)}</td><td></td>
                </tr></tfoot>
            </table>`;
    },

    pagarNomina: async function(i) {
        const n = this.nomina.nomina[i];
        const { value: f } = await Swal.fire({
            title: `Pagar nómina · ${this.esc(n.Nombre_Completo)}`,
            html: `<p style="font-size:24px; font-weight:900; color:#059669; margin:0 0 6px;">${this.fmt(n.NetoPagar)}</p>
                   <p style="font-size:12px; color:#64748b; margin:0;">Período ${this.nomina.periodo}. Se registrará como egreso en Ingresos y Gastos.</p>
                   ${this.htmlPago('pg')}`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-check"></i> Confirmar pago', confirmButtonColor: '#10b981', cancelButtonText: 'Cancelar',
            preConfirm: () => ({ metodo_pago: document.getElementById('pg-metodo').value, categoria: document.getElementById('pg-cat').value })
        });
        if (!f) return;
        const res = await window.api.post('/personal/nomina/pagar', { id_personal: n.ID_Personal, id_clinica: this.idClinica(), periodo: this.nomina.periodo, ...f });
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo pagar.', 'error');
        const q = await Swal.fire({ icon: 'success', title: 'Nómina pagada', text: res.message,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-print"></i> Imprimir rol', cancelButtonText: 'Cerrar', confirmButtonColor: '#4f46e5' });
        await this.generarNomina();
        if (q.isConfirmed) this.imprimirRol(i);
    },

    verProvisiones: function(i) {
        const n = this.nomina.nomina[i];
        const p = this.nomina.parametros || {};
        const fila = (lbl, val, mensual, aplica = true) => `
            <tr><td style="text-align:left; padding:7px 8px; font-weight:700;">${lbl}</td>
                <td style="text-align:right; padding:7px 8px;">${aplica ? this.fmt(val) : '—'}</td>
                <td style="text-align:center; padding:7px 8px; font-size:11px;">${!aplica ? '<span style="color:#94a3b8;">No aplica aún</span>'
                    : mensual ? '<span style="color:#059669; font-weight:800;">✓ Sumado al neto</span>' : '<span style="color:#64748b;">Acumulado (no se paga este mes)</span>'}</td></tr>`;
        Swal.fire({
            title: `Provisiones · ${this.esc(n.Nombre_Completo)}`, width: 580,
            html: `<table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead><tr><th style="text-align:left; padding:6px 8px;">Beneficio</th><th style="text-align:right; padding:6px 8px;">Del mes</th><th style="padding:6px 8px;">Estado</th></tr></thead>
                <tbody>
                    ${fila('Décimo Tercero', n.DecimoTerceroAcumulado, n.DecimoTerceroMensualizado)}
                    ${fila(`Décimo Cuarto (SBU ${this.fmt(p.SBU)}/12)`, n.DecimoCuartoAcumulado, n.DecimoCuartoMensualizado)}
                    ${fila('Fondo de Reserva (8.33%)', n.FondoReservaAcumulado, n.FondoReservaMensualizado, n.FondoReservaAplica)}
                    ${fila('Vacaciones (salario/24)', n.VacacionesAcumulado, false)}
                    ${fila('Aporte Patronal IESS (a cargo de la clínica)', n.AportePatronalIess, false, n.AfiliadoIESS)}
                </tbody></table>
                <p style="font-size:11px; color:#64748b; text-align:left; margin-top:12px;">Antigüedad: ${n.AntiguedadMeses} meses. El Fondo de Reserva aplica desde el mes 13 (Art. 196). Lo mensualizado lo elige el empleado (se configura al editarlo).</p>`,
            confirmButtonText: 'Cerrar', confirmButtonColor: '#4f46e5'
        });
    },

    verHistorialPagos: async function() {
        const periodo = document.getElementById('nom-periodo').value;
        const res = await window.api.get(`/personal/nomina/pagos?id_clinica=${this.idClinica()}${periodo ? '&periodo=' + periodo : ''}`);
        if (res.status !== 'Success') return Swal.fire('Error', res.message, 'error');
        const pagos = res.data || [];
        Swal.fire({
            title: `Pagos realizados${periodo ? ' · ' + periodo : ''}`, width: 760,
            html: pagos.length ? `<div style="max-height:60vh; overflow:auto;"><table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead><tr style="background:#f8fafc;"><th style="text-align:left; padding:8px;">Empleado</th><th style="padding:8px;">Tipo</th><th style="padding:8px;">Período</th><th style="text-align:right; padding:8px;">Monto</th><th style="padding:8px;">Método</th><th style="padding:8px;">Fecha</th></tr></thead>
                <tbody>${pagos.map(p => `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="text-align:left; padding:7px 8px;">${this.esc(p.Nombre_Completo)}</td>
                    <td style="padding:7px 8px; font-size:11px;">${this.TIPOS[p.Tipo] || p.Tipo}</td>
                    <td style="padding:7px 8px;">${p.Periodo || '—'}</td>
                    <td style="text-align:right; padding:7px 8px; font-weight:800; color:#059669;">${this.fmt(p.Monto)}</td>
                    <td style="padding:7px 8px; font-size:11px;">${this.esc(p.Metodo_Pago || '')}</td>
                    <td style="padding:7px 8px; font-size:11px;">${new Date(p.Fecha_Movimiento).toLocaleString('es-EC')}</td></tr>`).join('')}</tbody>
                </table></div>` : '<div class="nom-empty">Sin pagos registrados.</div>',
            confirmButtonText: 'Cerrar', confirmButtonColor: '#4f46e5'
        });
    },

    // ─────────────────────────── LIQUIDACIÓN FINAL ───────────────────────────
    liquidacionFinal: async function(id) {
        const e = this.personal.find(p => p.ID_Personal === id);
        if (!e) return;
        const { value: p1 } = await Swal.fire({
            title: `Liquidación final · ${this.esc(e.Nombre_Completo)}`,
            html: `<div class="nom-form">
                <div class="span2"><label>MOTIVO DE SALIDA</label>
                    <select id="lq-tipo">
                        <option value="RENUNCIA_VOLUNTARIA">Renuncia voluntaria (Art. 185 — desahucio 25%/año)</option>
                        <option value="DESPIDO_INTEMPESTIVO">Despido intempestivo (Art. 188 — indemnización)</option>
                        <option value="MUTUO_ACUERDO">Mutuo acuerdo (sin indemnización ni desahucio)</option>
                        <option value="VISTO_BUENO">Visto bueno / causa justa (sin indemnización ni desahucio)</option>
                    </select></div>
                <div class="span2"><label>FECHA DE SALIDA</label><input id="lq-fecha" type="date" value="${this.hoyISO()}"></div>
            </div>
            <p style="font-size:11px; color:#64748b; text-align:left; margin-top:10px;">En el siguiente paso puedes ajustar cada valor antes de confirmar.</p>`,
            showCancelButton: true, confirmButtonText: 'Calcular', confirmButtonColor: '#4f46e5', cancelButtonText: 'Cancelar',
            preConfirm: () => ({ tipo_salida: document.getElementById('lq-tipo').value, fecha_salida: document.getElementById('lq-fecha').value })
        });
        if (!p1 || !p1.fecha_salida) return;

        const calc = await window.api.get(`/personal/liquidacion/calcular?id_personal=${id}&fecha_salida=${p1.fecha_salida}&tipo_salida=${p1.tipo_salida}`);
        if (calc.status !== 'Success') return Swal.fire('Error', calc.message, 'error');
        const d = calc.desglose;
        const campos = [
            ['decimoTerceroProporcional', 'Décimo Tercero proporcional'], ['decimoCuartoProporcional', 'Décimo Cuarto proporcional'],
            ['vacacionesProporcional', 'Vacaciones proporcionales'], ['fondoReservaPendiente', 'Fondo de Reserva pendiente'],
            ['indemnizacion', 'Indemnización (Art. 188)'], ['desahucio', 'Desahucio (Art. 185)']
        ];
        const { value: p2 } = await Swal.fire({
            title: 'Desglose de liquidación', width: 600,
            html: `${!calc.regionConfigurada ? '<p style="font-size:11px; color:#b91c1c; text-align:left;"><i class="fas fa-exclamation-triangle"></i> Clínica sin región de Décimo Cuarto: se asumió Sierra/Amazonía.</p>' : ''}
                <p style="font-size:11px; color:#64748b; text-align:left;">Antigüedad: ${d.antiguedadMeses} meses (${d.aniosCompletos} años completos). Ajusta los valores si el empleado ya tomó vacaciones o recibió el fondo de reserva mensualizado.</p>
                <table style="width:100%; font-size:13px;">${campos.map(([k, l]) => `
                    <tr><td style="text-align:left; padding:5px;">${l}</td>
                        <td style="padding:5px; text-align:right;"><input id="lq-${k}" class="lq-val" type="number" step="0.01" min="0" value="${d[k]}" style="width:120px; padding:6px; border:1px solid #cbd5e1; border-radius:6px; text-align:right;"></td></tr>`).join('')}
                    <tr><td style="text-align:left; padding:8px 5px; font-weight:900;">TOTAL</td><td id="lq-total" style="text-align:right; padding:8px 5px; font-weight:900; color:#b91c1c; font-size:16px;">${this.fmt(d.total)}</td></tr>
                </table>
                ${this.htmlPago('lq')}
                <label style="display:flex; gap:8px; align-items:center; font-size:13px; font-weight:700; margin-top:12px; cursor:pointer;"><input type="checkbox" id="lq-desactivar" checked> Desactivar al empleado al confirmar</label>`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-check"></i> Pagar y liquidar', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancelar',
            didOpen: () => {
                document.querySelectorAll('.lq-val').forEach(inp => inp.oninput = () => {
                    const t = campos.reduce((s, [k]) => s + (parseFloat(document.getElementById('lq-' + k).value) || 0), 0);
                    document.getElementById('lq-total').textContent = this.fmt(t);
                });
            },
            preConfirm: () => {
                const desglose = {};
                campos.forEach(([k]) => { desglose[k] = parseFloat(document.getElementById('lq-' + k).value) || 0; });
                if (!(Object.values(desglose).reduce((a, b) => a + b, 0) > 0)) { Swal.showValidationMessage('El total debe ser mayor a 0.'); return false; }
                return { desglose, metodo_pago: document.getElementById('lq-metodo').value, categoria: document.getElementById('lq-cat').value, desactivar: document.getElementById('lq-desactivar').checked };
            }
        });
        if (!p2) return;
        const res = await window.api.post('/personal/liquidacion', { id_personal: id, id_clinica: this.idClinica(), ...p1, ...p2 });
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo registrar.', 'error');
        const q = await Swal.fire({ icon: 'success', title: 'Liquidación registrada', text: res.message,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-print"></i> Imprimir acta', cancelButtonText: 'Cerrar', confirmButtonColor: '#4f46e5' });
        if (q.isConfirmed) {
            const fe = this.fechaCorta(p1.fecha_salida + 'T12:00:00');
            this.abrirImpresion(this.tplComprobante({
                titulo: 'ACTA DE LIQUIDACIÓN FINAL', periodo: `Salida: ${fe} · ${p1.tipo_salida.replace(/_/g, ' ')}`, emp: e,
                filas: campos.map(([k, l]) => [l, this.fmt(p2.desglose[k])]), neto: this.fmt(res.monto),
                nota: 'El trabajador declara recibir a su entera satisfacción los valores detallados por concepto de liquidación de haberes.'
            }));
        }
        this.cargarPersonal();
    },

    // ─────────────────────────── PARÁMETROS ───────────────────────────
    abrirParametros: async function() {
        const res = await window.api.get('/personal/parametros-laborales');
        const lista = res.status === 'Success' ? res.data : [];
        const anio = new Date().getFullYear();
        const a = lista.find(x => x.Anio === anio) || lista[0] || { Anio: anio, SBU: '', Aporte_Personal_IESS: 0.0945, Aporte_Patronal_IESS: 0.1115, Porcentaje_Fondo_Reserva: 0.0833 };
        const { value: f } = await Swal.fire({
            title: 'Parámetros laborales', width: 560,
            html: `<p style="font-size:12px; color:#64748b; text-align:left; margin-top:0;">Actualiza el SBU cuando el gobierno lo cambie (normalmente cada enero).</p>
                <div class="nom-form">
                    <div><label>AÑO</label><input id="pl-anio" type="number" value="${a.Anio === anio ? a.Anio : anio}"></div>
                    <div><label>SBU ($)</label><input id="pl-sbu" type="number" step="0.01" value="${a.Anio === anio ? a.SBU : ''}" placeholder="${a.SBU ? 'Último: ' + a.SBU : ''}"></div>
                    <div><label>APORTE PERSONAL IESS</label><input id="pl-ap" type="number" step="0.0001" value="${a.Aporte_Personal_IESS}"></div>
                    <div><label>APORTE PATRONAL IESS</label><input id="pl-at" type="number" step="0.0001" value="${a.Aporte_Patronal_IESS}"></div>
                    <div><label>% FONDO DE RESERVA</label><input id="pl-fr" type="number" step="0.0001" value="${a.Porcentaje_Fondo_Reserva}"></div>
                    <div><label>REGIÓN DÉCIMO CUARTO (ESTA CLÍNICA)</label>
                        <select id="pl-region">
                            <option value="">— Sin configurar —</option>
                            <option value="SIERRA" ${this.region === 'SIERRA' ? 'selected' : ''}>Sierra / Amazonía (pago ago)</option>
                            <option value="COSTA" ${this.region === 'COSTA' ? 'selected' : ''}>Costa / Galápagos (pago mar)</option>
                        </select></div>
                </div>
                <p style="font-size:11px; color:#94a3b8; text-align:left;">Tasas en decimal: 0.0945 = 9.45%.</p>
                ${lista.length ? `<p style="font-size:11px; color:#64748b; text-align:left;">Configurados: ${lista.map(x => `${x.Anio} (SBU ${this.fmt(x.SBU)})`).join(' · ')}</p>` : ''}`,
            showCancelButton: true, confirmButtonText: '<i class="fas fa-save"></i> Guardar', confirmButtonColor: '#4f46e5', cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const sbu = parseFloat(document.getElementById('pl-sbu').value);
                if (!(sbu > 0)) { Swal.showValidationMessage('Ingrese el SBU del año.'); return false; }
                return {
                    anio: parseInt(document.getElementById('pl-anio').value), sbu,
                    aporte_personal_iess: parseFloat(document.getElementById('pl-ap').value),
                    aporte_patronal_iess: parseFloat(document.getElementById('pl-at').value),
                    porcentaje_fondo_reserva: parseFloat(document.getElementById('pl-fr').value),
                    id_clinica: this.idClinica(), region: document.getElementById('pl-region').value
                };
            }
        });
        if (!f) return;
        const r = await window.api.post('/personal/parametros-laborales', f);
        if (r.status !== 'Success') return Swal.fire('Error', r.message, 'error');
        Swal.fire({ icon: 'success', title: 'Parámetros guardados', timer: 1300, showConfirmButton: false });
        await this.cargarPersonal();
        if (this.nomina) this.generarNomina();
    },

    // ─────────────────────────── IMPRESIÓN ───────────────────────────
    imprimirRol: function(i) {
        const n = this.nomina.nomina[i];
        const e = this.personal.find(p => p.ID_Personal === n.ID_Personal) || n;
        const f = this.fmt;
        const ingresos = [
            ['Sueldo' + (n.Prorrateado ? ` (${n.DiasTrabajados} días)` : ''), f(n.SalarioBase)],
            n.HorasExtra > 0 ? ['(+) Horas suplementarias/extraordinarias', f(n.HorasExtra)] : null,
            n.Bonos > 0 ? ['(+) Bonos / incentivos', f(n.Bonos)] : null,
            n.DecimoTerceroMensualizado ? ['(+) Décimo Tercero mensualizado', f(n.DecimoTerceroAcumulado)] : null,
            n.DecimoCuartoMensualizado ? ['(+) Décimo Cuarto mensualizado', f(n.DecimoCuartoAcumulado)] : null,
            (n.FondoReservaMensualizado && n.FondoReservaAplica) ? ['(+) Fondo de Reserva mensualizado', f(n.FondoReservaAcumulado)] : null
        ].filter(Boolean);
        const deducciones = [
            n.Adelantos > 0 ? ['(-) Adelantos de nómina', f(n.Adelantos)] : null,
            n.Descuentos > 0 ? ['(-) Otros descuentos', f(n.Descuentos)] : null,
            n.AporteIessPersonal > 0 ? ['(-) Aporte personal IESS', f(n.AporteIessPersonal)] : null
        ].filter(Boolean);
        const provisiones = [
            (n.FondoReservaAplica && !n.FondoReservaMensualizado) ? ['Fondo de Reserva acumulado', f(n.FondoReservaAcumulado)] : null,
            !n.DecimoTerceroMensualizado ? ['Décimo Tercero acumulado', f(n.DecimoTerceroAcumulado)] : null,
            !n.DecimoCuartoMensualizado ? ['Décimo Cuarto acumulado', f(n.DecimoCuartoAcumulado)] : null,
            ['Vacaciones acumuladas', f(n.VacacionesAcumulado)],
            n.AfiliadoIESS ? ['Aporte patronal IESS (a cargo de la clínica)', f(n.AportePatronalIess)] : null
        ].filter(Boolean);
        this.abrirImpresion(this.tplComprobante({
            titulo: 'ROL DE PAGOS', periodo: `Período: ${this.nomina.periodo}${n.AfiliadoIESS ? ' · Afiliado IESS' : ''}`, emp: e,
            filas: [['INGRESOS', ''], ...ingresos, ['DEDUCCIONES', ''], ...(deducciones.length ? deducciones : [['(sin deducciones)', '—']]),
                    ['PROVISIONES (informativas, no pagadas este mes)', ''], ...provisiones],
            neto: f(n.NetoPagar),
            nota: 'El empleado confirma haber recibido conforme el pago neto detallado. Las provisiones se pagan según ley, salvo las marcadas como mensualizadas.'
        }));
    },

    imprimirMovimiento: function(e, tipo, monto, desc, periodo) {
        const notas = {
            ADELANTO: 'El empleado confirma haber recibido el adelanto indicado, que será descontado de su rol de pagos.',
            BONO: 'El empleado confirma haber recibido el bono/incentivo indicado.',
            DESCUENTO: 'Se aplica el descuento indicado según lo acordado entre las partes.',
            HORAS_SUPLEMENTARIAS: 'Pago de horas suplementarias (Art. 55 Código de Trabajo).',
            HORAS_EXTRAORDINARIAS: 'Pago de horas extraordinarias (Art. 55 Código de Trabajo).'
        };
        this.abrirImpresion(this.tplComprobante({
            titulo: 'COMPROBANTE · ' + (this.TIPOS[tipo] || tipo).toUpperCase(), periodo: `Período: ${periodo}`, emp: e,
            filas: [['Concepto', this.TIPOS[tipo] || tipo], ['Descripción', this.esc(desc || '—')]],
            neto: (tipo === 'ADELANTO' || tipo === 'DESCUENTO' ? '-' : '+') + this.fmt(monto), nota: notas[tipo] || ''
        }));
    },

    tplComprobante: function({ titulo, periodo, emp, filas, neto, nota }) {
        const clinica = this.esc(this.clinicaNombre || 'Clínica');
        const fecha = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
        const filasHtml = filas.map(([l, v]) => v === ''
            ? `<tr><td colspan="2" style="padding:10px 12px 4px; font-size:10px; font-weight:900; color:#4f46e5; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #4f46e5;">${l}</td></tr>`
            : `<tr><td style="padding:6px 12px; border-bottom:1px solid #eee; font-size:12px;">${l}</td><td style="padding:6px 12px; border-bottom:1px solid #eee; text-align:right; font-weight:700; font-size:12px;">${v}</td></tr>`).join('');
        const bloque = `
            <div style="border:2px solid #1e293b; border-radius:6px; padding:24px; max-width:680px; margin:0 auto;">
                <div style="text-align:center; border-bottom:3px double #4f46e5; padding-bottom:12px; margin-bottom:16px;">
                    <div style="font-size:20px; font-weight:900; color:#1e293b; letter-spacing:1px;">${clinica.toUpperCase()}</div>
                    <div style="font-size:15px; font-weight:800; color:#4f46e5; margin-top:5px;">${titulo}</div>
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">${periodo} · Emitido: ${fecha}</div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:14px; font-size:12px;">
                    <div><span style="font-size:9px; font-weight:800; color:#64748b;">EMPLEADO</span><br><b>${this.esc(emp.Nombre_Completo || '')}</b></div>
                    <div><span style="font-size:9px; font-weight:800; color:#64748b;">CÉDULA</span><br><b>${this.esc(emp.Cedula || '—')}</b></div>
                    <div><span style="font-size:9px; font-weight:800; color:#64748b;">CARGO</span><br><b>${this.esc(emp.Cargo || '—')}</b></div>
                </div>
                <table style="width:100%; border-collapse:collapse;">${filasHtml}
                    <tr style="background:#1e293b; color:white;"><td style="padding:10px 12px; font-weight:900;">TOTAL</td><td style="padding:10px 12px; text-align:right; font-weight:900; font-size:15px;">${neto}</td></tr>
                </table>
                ${nota ? `<p style="font-size:11px; color:#64748b; font-style:italic; margin:10px 0 0;">${nota}</p>` : ''}
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:48px; text-align:center; font-size:11px;">
                    <div style="border-top:2px solid #334155; padding-top:6px;"><b>FIRMA DEL EMPLEADO</b><br>${this.esc(emp.Nombre_Completo || '')}</div>
                    <div style="border-top:2px solid #334155; padding-top:6px;"><b>FIRMA ADMINISTRACIÓN</b><br>${clinica}</div>
                </div>
            </div>`;
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
            <style>body{font-family:Arial,sans-serif;padding:20px;} @media print{body{padding:0;} .no-print{display:none!important;} .salto{page-break-before:always;}}</style></head><body>
            <div class="no-print" style="text-align:center; margin-bottom:16px;"><button onclick="window.print()" style="padding:10px 22px; background:#4f46e5; color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer;">Imprimir / Guardar como PDF</button></div>
            ${bloque}
            <div class="salto" style="border-top:2px dashed #ccc; margin:28px 0; padding-top:6px; text-align:center; font-size:10px; color:#aaa;">✂ COPIA PARA EL ARCHIVO</div>
            ${bloque}
            </body></html>`;
    },

    abrirImpresion: function(html) {
        const v = window.open('', '_blank', 'width=820,height=760,scrollbars=yes');
        v.document.write(html);
        v.document.close();
    }
};
