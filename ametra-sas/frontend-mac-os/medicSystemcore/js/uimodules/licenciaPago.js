// ==========================================
// RENOVAR LICENCIA (lado de la clínica)
// Elegir meses, ver el total, pagar por transferencia o PayPhone y reportar el pago para
// que soporte lo apruebe. Se abre desde el dashboard (administrador) o desde el login
// cuando la licencia ya venció (con el token de pago, ver authController.login).
// ==========================================
window.licenciaPago = {
    _token: null,

    _fetch: async function(ruta, opciones = {}) {
        const headers = { ...(opciones.headers || {}) };
        const token = this._token || window.api.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const resp = await fetch(window.api.baseURL + ruta, { ...opciones, headers });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) return { status: 'Error', message: (data && data.message) || `Error HTTP: ${resp.status}` };
            return data;
        } catch (e) {
            return { status: 'Error', message: 'No se pudo conectar con el servidor.' };
        }
    },

    _esc: function(t) {
        return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    _dinero: (n) => `$${Number(n || 0).toFixed(2)}`,

    // tokenPago: solo cuando viene del login de una clínica vencida.
    abrir: async function({ tokenPago = null, nombreUsuario = '' } = {}) {
        this._token = tokenPago;
        Swal.fire({ title: 'Cargando opciones de pago...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await this._fetch('/licencia/opciones');
        if (res.status !== 'Success') {
            this._token = null;
            return Swal.fire('No disponible', res.message || 'No se pudieron cargar las opciones de pago.', 'error');
        }
        const d = res.data;
        if (!d.activo) {
            this._token = null;
            const contacto = [d.whatsapp && `WhatsApp ${this._esc(d.whatsapp)}`, d.correo && this._esc(d.correo)].filter(Boolean).join(' · ');
            return Swal.fire({
                icon: 'info', title: 'Renovar licencia',
                html: `Para renovar su licencia contacte a CasRodsoft${contacto ? `:<br><b>${contacto}</b>` : '.'}`,
                confirmButtonColor: '#4f46e5'
            });
        }

        const vence = d.fecha_vencimiento ? new Date(d.fecha_vencimiento).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
        const vencida = d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date();
        const b = d.banco || {};
        const hayBanco = b.numero && b.nombre;
        const hayPayphone = !!d.payphone_link;
        const opcionesHtml = d.opciones.map((o, i) => `
            <label class="lp-op" style="flex:1 1 110px; border:2px solid ${i === 0 ? '#4f46e5' : '#e2e8f0'}; border-radius:10px; padding:10px 8px; cursor:pointer; text-align:center; position:relative;">
                <input type="radio" name="lp-meses" value="${o.meses}" ${i === 0 ? 'checked' : ''} style="position:absolute; opacity:0;">
                <div style="font-weight:800; color:#1e293b;">${o.meses} ${o.meses === 1 ? 'mes' : 'meses'}</div>
                <div style="font-size:1.05rem; font-weight:800; color:#4f46e5;">${this._dinero(o.total)}</div>
                ${o.descuento_pct ? `<div style="font-size:0.7rem; color:#059669; font-weight:700;">-${o.descuento_pct}% · antes ${this._dinero(o.subtotal)}</div>` : `<div style="font-size:0.7rem; color:#94a3b8;">${this._dinero(o.total / o.meses)} / mes</div>`}
            </label>`).join('');

        const fila = (k, v, copiar) => `
            <div style="display:flex; justify-content:space-between; gap:8px; padding:4px 0; border-bottom:1px dashed #e2e8f0;">
                <span style="color:#64748b;">${k}</span>
                <span style="font-weight:700; color:#1e293b; text-align:right;">${this._esc(v)}${copiar ? ` <i class="fas fa-copy lp-copiar" data-v="${this._esc(v)}" title="Copiar" style="cursor:pointer; color:#94a3b8; margin-left:4px;"></i>` : ''}</span>
            </div>`;

        const historial = (d.solicitudes || []).map(s => {
            const color = s.Estado === 'aprobada' ? '#059669' : s.Estado === 'rechazada' ? '#dc2626' : '#d97706';
            return `<div style="padding:5px 2px; border-bottom:1px solid #f1f5f9;">
                <b>${this._dinero(s.Monto)}</b> · ${s.Meses} ${s.Meses === 1 ? 'mes' : 'meses'} · ${this._esc(s.Metodo)}
                <span style="float:right; font-weight:800; color:${color}; text-transform:uppercase; font-size:0.68rem;">${s.Estado === 'pendiente' ? 'en revisión' : s.Estado}</span>
                <div style="color:#94a3b8;">${new Date(s.Fecha_Solicitud).toLocaleDateString('es-EC')}${s.Referencia ? ' · ref ' + this._esc(s.Referencia) : ''}${s.Motivo_Rechazo ? ' · ' + this._esc(s.Motivo_Rechazo) : ''}</div>
            </div>`;
        }).join('');

        await Swal.fire({
            title: 'Renovar licencia',
            width: 620,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#64748b',
            html: `
            <div style="text-align:left; font-size:0.85rem;">
                <div style="background:${vencida ? '#fee2e2' : '#f8fafc'}; color:${vencida ? '#991b1b' : '#334155'}; padding:10px 14px; border-radius:8px; margin-bottom:14px;">
                    ${this._esc(d.clinica || '')} · Licencia ${vencida ? 'vencida desde' : 'vigente hasta'} <b>${vence}</b>
                </div>

                <div style="font-weight:700; margin-bottom:6px; color:#1e293b;">1. ¿Cuántos meses quiere pagar?</div>
                <div id="lp-opciones" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">${opcionesHtml}</div>

                <div style="font-weight:700; margin-bottom:6px; color:#1e293b;">2. Pague <span id="lp-total" style="color:#4f46e5;">${this._dinero(d.opciones[0].total)}</span> por uno de estos medios</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
                    ${hayBanco ? `<div style="flex:1 1 250px; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                        <div style="font-weight:800; margin-bottom:6px;"><i class="fas fa-building-columns" style="color:#4f46e5;"></i> Transferencia bancaria</div>
                        ${fila('Banco', b.nombre)}${b.tipo ? fila('Tipo de cuenta', b.tipo) : ''}${fila('Número de cuenta', b.numero, true)}
                        ${b.titular ? fila('Titular', b.titular) : ''}${b.identificacion ? fila('CI / RUC', b.identificacion, true) : ''}
                    </div>` : ''}
                    ${hayPayphone ? `<div style="flex:1 1 200px; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-weight:800;"><i class="fas fa-credit-card" style="color:#ea580c;"></i> Tarjeta o PayPhone</div>
                        <div style="color:#64748b; font-size:0.78rem;">Se abre la página de PayPhone en su navegador. Ingrese el valor exacto indicado arriba.</div>
                        <button type="button" id="lp-payphone" class="swal2-styled" style="background:#ea580c; margin:0;"><i class="fas fa-up-right-from-square"></i> Pagar con PayPhone</button>
                    </div>` : ''}
                </div>
                ${d.instrucciones ? `<div style="background:#eef2ff; color:#3730a3; padding:8px 12px; border-radius:8px; margin:-6px 0 14px; font-size:0.78rem;">${this._esc(d.instrucciones)}</div>` : ''}

                <div style="font-weight:700; margin-bottom:6px; color:#1e293b;">3. Reporte su pago</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <select id="lp-metodo" class="swal2-input" style="margin:0 0 8px; flex:1 1 150px;">
                        ${hayBanco ? '<option value="Transferencia">Transferencia</option>' : ''}
                        ${hayPayphone ? '<option value="PayPhone">PayPhone / tarjeta</option>' : ''}
                    </select>
                    <input id="lp-referencia" class="swal2-input" placeholder="N.º de comprobante o transacción" maxlength="100" style="margin:0 0 8px; flex:2 1 220px;">
                </div>
                <label style="display:block; font-size:0.75rem; color:#64748b; margin-bottom:4px;">Foto o PDF del comprobante (opcional si escribió el número)</label>
                <input id="lp-comprobante" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style="margin-bottom:8px; font-size:0.78rem;">
                <button type="button" id="lp-reportar" class="swal2-styled" style="background:#059669; width:100%; margin:4px 0 16px;">
                    <i class="fas fa-paper-plane"></i> Reportar pago
                </button>
                <div style="color:#94a3b8; font-size:0.72rem; margin:-10px 0 14px;">CasRodsoft verifica el pago y renueva la licencia. Recibirá la confirmación al volver a ingresar.</div>

                <div style="font-weight:700; margin-bottom:6px; color:#1e293b;">Pagos reportados</div>
                <div id="lp-historial" style="max-height:130px; overflow-y:auto; font-size:0.72rem; border:1px solid #e2e8f0; border-radius:6px; padding:6px;">
                    ${historial || '<div style="color:#94a3b8; text-align:center; padding:6px;">Todavía no reportó pagos.</div>'}
                </div>
            </div>`,
            didOpen: () => {
                const opciones = d.opciones;
                const radios = document.querySelectorAll('input[name="lp-meses"]');
                radios.forEach(r => r.onchange = () => {
                    document.querySelectorAll('.lp-op').forEach(l => {
                        l.style.borderColor = l.querySelector('input').checked ? '#4f46e5' : '#e2e8f0';
                    });
                    const o = opciones.find(x => String(x.meses) === r.value);
                    document.getElementById('lp-total').textContent = this._dinero(o.total);
                });
                document.querySelectorAll('.lp-copiar').forEach(i => i.onclick = async () => {
                    try { await navigator.clipboard.writeText(i.getAttribute('data-v')); i.className = 'fas fa-check'; i.style.color = '#059669'; } catch (_) {}
                });
                const btnPP = document.getElementById('lp-payphone');
                if (btnPP) btnPP.onclick = () => {
                    window.api.abrirExterno(d.payphone_link);
                    document.getElementById('lp-metodo').value = 'PayPhone';
                };

                document.getElementById('lp-reportar').onclick = async () => {
                    const meses = document.querySelector('input[name="lp-meses"]:checked').value;
                    const referencia = document.getElementById('lp-referencia').value.trim();
                    const archivo = document.getElementById('lp-comprobante').files[0];
                    if (!referencia && !archivo) {
                        return Swal.showValidationMessage('Escriba el número de comprobante o adjunte la imagen del pago.');
                    }
                    Swal.resetValidationMessage();
                    const fd = new FormData();
                    fd.append('meses', meses);
                    fd.append('metodo', document.getElementById('lp-metodo').value);
                    fd.append('referencia', referencia);
                    fd.append('reportado_por', nombreUsuario || this._nombreSesion());
                    if (archivo) fd.append('comprobante', archivo);
                    const btn = document.getElementById('lp-reportar');
                    btn.disabled = true;
                    const r = await this._fetch('/licencia/reportar-pago', { method: 'POST', body: fd });
                    btn.disabled = false;
                    if (r.status !== 'Success') return Swal.showValidationMessage(r.message || 'No se pudo enviar el reporte.');
                    this._token = null;
                    Swal.fire({
                        icon: 'success', title: 'Pago reportado',
                        html: `Recibimos su reporte por <b>${this._dinero(r.monto)}</b>.<br>CasRodsoft lo verificará y renovará su licencia.`,
                        confirmButtonColor: '#4f46e5'
                    });
                };
            },
            willClose: () => { /* el token de pago se descarta al cerrar */ }
        });
        this._token = null;
    },

    _nombreSesion: function() {
        try {
            const s = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
            return `${s.Nombres || ''} ${s.Apellidos || ''}`.trim();
        } catch (_) { return ''; }
    }
};
