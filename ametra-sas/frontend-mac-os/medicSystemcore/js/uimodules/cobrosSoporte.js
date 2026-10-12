// ==========================================
// COBROS DE LICENCIA (panel de soporte)
// Datos de pago que ve la clínica (cuenta bancaria, link de PayPhone, precio y
// descuentos) y revisión de los pagos que reportan: aprobar renueva la licencia.
// ==========================================
window.cobrosSoporte = {
    _req: async function(token, ruta, opciones = {}) {
        const headers = { Authorization: `Bearer ${token}`, ...(opciones.headers || {}) };
        if (opciones.body && typeof opciones.body === 'string') headers['Content-Type'] = 'application/json';
        try {
            const resp = await fetch(window.api.baseURL + ruta, { ...opciones, headers });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) return { status: 'Error', message: (data && data.message) || `Error HTTP: ${resp.status}` };
            return data;
        } catch (e) {
            return { status: 'Error', message: 'No se pudo conectar con el servidor.' };
        }
    },

    _esc: (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    _dinero: (n) => `$${Number(n || 0).toFixed(2)}`,

    abrirConfig: async function(token) {
        const res = await this._req(token, '/superadmin/cobros/config');
        if (res.status !== 'Success') return Swal.fire('Error', res.message, 'error');
        const c = res.config;
        const inp = (id, valor, ph, extra = '') =>
            `<input id="${id}" class="swal2-input" value="${this._esc(valor)}" placeholder="${ph}" style="margin:0 0 8px; width:100%; box-sizing:border-box;" ${extra}>`;

        const { value: datos } = await Swal.fire({
            title: 'Cobros de licencia',
            width: 560,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            html: `
            <div style="text-align:left; font-size:0.82rem;">
                <label style="display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:12px; cursor:pointer;">
                    <input type="checkbox" id="cc-activo" ${c.activo ? 'checked' : ''}> Las clínicas pueden pagar y reportar pagos desde el sistema
                </label>

                <div style="font-weight:700; margin-bottom:6px;">Precio</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:4px;">
                    <span style="flex:1 1 160px;">Precio mensual general (USD)</span>
                    <input id="cc-precio" type="number" min="0" step="0.01" class="swal2-input" value="${c.precio_mensual}" style="margin:0; flex:1 1 120px;">
                </div>
                <div style="color:#94a3b8; font-size:0.72rem; margin-bottom:8px;">Una clínica con precio especial usa el suyo (se edita en su ficha de licencia).</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                    ${[3, 6, 12].map(m => `<label style="flex:1 1 120px;">Descuento ${m} meses (%)
                        <input id="cc-desc-${m}" type="number" min="0" max="90" step="0.5" class="swal2-input" value="${c.descuentos[m] || 0}" style="margin:2px 0 0; width:100%; box-sizing:border-box;"></label>`).join('')}
                </div>

                <div style="font-weight:700; margin-bottom:6px;">Transferencia bancaria</div>
                ${inp('cc-banco', c.banco.nombre, 'Banco')}
                <div style="display:flex; gap:8px;">${inp('cc-tipo', c.banco.tipo, 'Tipo de cuenta (Ahorros / Corriente)')}${inp('cc-numero', c.banco.numero, 'Número de cuenta')}</div>
                <div style="display:flex; gap:8px;">${inp('cc-titular', c.banco.titular, 'Titular')}${inp('cc-ident', c.banco.identificacion, 'CI / RUC del titular')}</div>

                <div style="font-weight:700; margin:6px 0;">Tarjeta / PayPhone</div>
                <select id="cc-pp-modo" class="swal2-input" style="margin:0 0 8px; width:100%; box-sizing:border-box;">
                    <option value="link" ${c.payphone_modo !== 'api' ? 'selected' : ''}>Link fijo (la clínica escribe el monto y reporta el pago)</option>
                    <option value="api" ${c.payphone_modo === 'api' ? 'selected' : ''}>API de PayPhone (monto exacto y confirmación automática)</option>
                </select>
                <div id="cc-pp-link">${inp('cc-payphone', c.payphone_link, 'Link de PayPhone (https://ppls.me/...)')}</div>
                <div id="cc-pp-api">
                    <div style="display:flex; gap:8px;">${inp('cc-pp-token', c.payphone_token, 'Token de PayPhone Developer')}${inp('cc-pp-store', c.payphone_store_id, 'Store ID')}</div>
                    <div style="color:#94a3b8; font-size:0.72rem; margin:-4px 0 8px;">Se obtienen en PayPhone Developer → su aplicación. El pago confirmado renueva la licencia sola.</div>
                </div>

                <div style="font-weight:700; margin:6px 0;">Contacto que ve la clínica</div>
                <div style="display:flex; gap:8px;">${inp('cc-whatsapp', c.whatsapp, 'WhatsApp')}${inp('cc-correo', c.correo, 'Correo')}</div>
                <textarea id="cc-instrucciones" class="swal2-textarea" placeholder="Instrucciones adicionales (opcional)" maxlength="500" style="margin:0; width:100%; box-sizing:border-box; font-size:0.8rem;">${this._esc(c.instrucciones)}</textarea>
            </div>`,
            didOpen: () => {
                const modo = document.getElementById('cc-pp-modo');
                const mostrar = () => {
                    document.getElementById('cc-pp-link').style.display = modo.value === 'link' ? 'block' : 'none';
                    document.getElementById('cc-pp-api').style.display = modo.value === 'api' ? 'block' : 'none';
                };
                modo.onchange = mostrar;
                mostrar();
            },
            preConfirm: () => {
                const v = (id) => document.getElementById(id).value.trim();
                const datos = {
                    activo: document.getElementById('cc-activo').checked,
                    precio_mensual: parseFloat(v('cc-precio')) || 0,
                    descuentos: { 3: parseFloat(v('cc-desc-3')) || 0, 6: parseFloat(v('cc-desc-6')) || 0, 12: parseFloat(v('cc-desc-12')) || 0 },
                    banco: { nombre: v('cc-banco'), tipo: v('cc-tipo'), numero: v('cc-numero'), titular: v('cc-titular'), identificacion: v('cc-ident') },
                    payphone_modo: v('cc-pp-modo'),
                    payphone_link: v('cc-payphone'),
                    payphone_token: v('cc-pp-token'),
                    payphone_store_id: v('cc-pp-store'),
                    whatsapp: v('cc-whatsapp'),
                    correo: v('cc-correo'),
                    instrucciones: v('cc-instrucciones')
                };
                if (datos.activo && !(datos.precio_mensual > 0)) return Swal.showValidationMessage('Ingrese el precio mensual.');
                if (datos.payphone_modo === 'api' && (!datos.payphone_token || !datos.payphone_store_id)) {
                    return Swal.showValidationMessage('Para PayPhone por API ingrese el token y el Store ID.');
                }
                const hayPayphone = datos.payphone_modo === 'api' || !!datos.payphone_link;
                if (datos.activo && !hayPayphone && !(datos.banco.nombre && datos.banco.numero)) {
                    return Swal.showValidationMessage('Cargue al menos la cuenta bancaria o el link de PayPhone.');
                }
                return datos;
            }
        });
        if (!datos) return;
        const r = await this._req(token, '/superadmin/cobros/config', { method: 'PUT', body: JSON.stringify(datos) });
        if (r.status !== 'Success') return Swal.fire('Error', r.message, 'error');
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
    },

    // Versión mínima (obligatoria) y última (aviso) de las apps de las clínicas.
    abrirVersiones: async function(token) {
        const res = await this._req(token, '/superadmin/versiones');
        if (res.status !== 'Success') return Swal.fire('Error', res.message, 'error');
        const v = res.versiones;
        const campo = (id, valor, etiqueta) => `<label style="display:block; margin-bottom:8px;">${etiqueta}
            <input id="${id}" class="swal2-input" value="${this._esc(valor)}" style="margin:2px 0 0; width:100%; box-sizing:border-box;"></label>`;
        const { value: datos } = await Swal.fire({
            title: 'Versiones de las apps',
            width: 580,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            html: `
            <div style="text-align:left; font-size:0.8rem;">
                <div style="background:#eef2ff; color:#3730a3; padding:8px 12px; border-radius:8px; margin-bottom:12px;">
                    <b>Última</b>: las apps más viejas ven un aviso (Windows se actualiza sola).<br>
                    <b>Mínima</b>: las apps más viejas no pueden seguir hasta actualizarse. Súbala solo cuando el servidor ya no sea compatible con las versiones anteriores.
                </div>
                <div style="font-weight:700; margin-bottom:6px;">Escritorio (Windows y Mac)</div>
                <div style="display:flex; gap:8px;">${campo('vs-e-actual', v.escritorio.actual, 'Última')}${campo('vs-e-minima', v.escritorio.minima, 'Mínima')}</div>
                ${campo('vs-e-win', v.escritorio.url_windows, 'Descarga Windows')}
                ${campo('vs-e-mac-arm', v.escritorio.url_mac_arm, 'Descarga Mac Apple (M1–M4)')}
                ${campo('vs-e-mac-intel', v.escritorio.url_mac_intel, 'Descarga Mac Intel')}
                <div style="font-weight:700; margin:6px 0;">App móvil (Android)</div>
                <div style="display:flex; gap:8px;">${campo('vs-a-actual', v.android.actual, 'Última')}${campo('vs-a-minima', v.android.minima, 'Mínima')}</div>
                ${campo('vs-a-url', v.android.url, 'Descarga APK')}
            </div>`,
            preConfirm: () => {
                const g = (id) => document.getElementById(id).value.trim();
                return {
                    escritorio: { actual: g('vs-e-actual'), minima: g('vs-e-minima'), url_windows: g('vs-e-win'), url_mac_arm: g('vs-e-mac-arm'), url_mac_intel: g('vs-e-mac-intel') },
                    android: { actual: g('vs-a-actual'), minima: g('vs-a-minima'), url: g('vs-a-url') }
                };
            }
        });
        if (!datos) return;
        const r = await this._req(token, '/superadmin/versiones', { method: 'PUT', body: JSON.stringify(datos) });
        if (r.status !== 'Success') return Swal.fire('Error', r.message, 'error');
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
    },

    // Lista de pagos reportados. alCambiar se llama tras aprobar/rechazar (refrescar la lista de clínicas).
    abrirSolicitudes: async function(token, alCambiar) {
        const render = async () => {
            const r = await this._req(token, '/superadmin/cobros/solicitudes');
            const cont = document.getElementById('cs-lista');
            if (!cont) return;
            if (r.status !== 'Success') { cont.innerHTML = `<div style="color:#dc2626; padding:8px;">${this._esc(r.message)}</div>`; return; }
            if (!r.solicitudes.length) { cont.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:14px;">Ninguna clínica reportó pagos todavía.</div>'; return; }
            cont.innerHTML = r.solicitudes.map(s => {
                const color = s.Estado === 'aprobada' ? '#059669' : (s.Estado === 'rechazada' || s.Estado === 'vencida') ? '#dc2626' : '#d97706';
                const etiqueta = s.Estado === 'esperando_pago' ? 'esperando PayPhone' : s.Estado;
                return `<div style="padding:9px 6px; border-bottom:1px solid #f1f5f9; ${s.Estado === 'pendiente' ? 'background:#fffbeb;' : ''}">
                    <div style="display:flex; justify-content:space-between; gap:8px;">
                        <b>${this._esc(s.Nombre_Empresa)}</b>
                        <span style="font-weight:800; color:${color}; text-transform:uppercase; font-size:0.68rem;">${etiqueta}</span>
                    </div>
                    <div>${this._dinero(s.Monto)} · ${s.Meses} ${s.Meses === 1 ? 'mes' : 'meses'} · ${this._esc(s.Metodo)}${s.Referencia ? ' · ref <b>' + this._esc(s.Referencia) + '</b>' : ''}</div>
                    <div style="color:#94a3b8;">${new Date(s.Fecha_Solicitud).toLocaleString('es-EC')}${s.Reportado_Por ? ' · ' + this._esc(s.Reportado_Por) : ''}${s.Motivo_Rechazo ? ' · ' + this._esc(s.Motivo_Rechazo) : ''}</div>
                    <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                        ${s.Estado === 'esperando_pago' ? `<button type="button" class="swal2-styled cs-verificar" data-id="${s.ID_Solicitud}" style="margin:0; padding:4px 10px; font-size:0.72rem; background:#ea580c;"><i class="fas fa-rotate"></i> Verificar en PayPhone</button>` : ''}
                        ${s.Tiene_Comprobante ? `<button type="button" class="swal2-styled cs-ver" data-id="${s.ID_Solicitud}" style="margin:0; padding:4px 10px; font-size:0.72rem; background:#64748b;"><i class="fas fa-image"></i> Comprobante</button>` : ''}
                        ${s.Estado === 'pendiente' ? `
                            <button type="button" class="swal2-styled cs-aprobar" data-id="${s.ID_Solicitud}" data-monto="${s.Monto}" data-meses="${s.Meses}" data-clinica="${this._esc(s.Nombre_Empresa)}" style="margin:0; padding:4px 10px; font-size:0.72rem; background:#059669;"><i class="fas fa-check"></i> Aprobar</button>
                            <button type="button" class="swal2-styled cs-rechazar" data-id="${s.ID_Solicitud}" style="margin:0; padding:4px 10px; font-size:0.72rem; background:#dc2626;"><i class="fas fa-xmark"></i> Rechazar</button>` : ''}
                    </div>
                </div>`;
            }).join('');

            cont.querySelectorAll('.cs-ver').forEach(b => b.onclick = () => this.verComprobante(token, b.dataset.id));
            cont.querySelectorAll('.cs-verificar').forEach(b => b.onclick = async () => {
                b.disabled = true;
                const r2 = await this._req(token, `/superadmin/cobros/solicitudes/${b.dataset.id}/verificar`, { method: 'POST', body: '{}' });
                if (r2.status !== 'Success') { b.disabled = false; return this._error(r2.message); }
                this._error(r2.estado === 'esperando_pago' ? 'PayPhone todavía no registra el pago.' : `Resultado: ${r2.estado}.`);
                if (alCambiar) alCambiar();
                render();
            });
            cont.querySelectorAll('.cs-aprobar').forEach(b => b.onclick = async () => {
                const ok = await this._confirmarEnLinea(b, `Aprobar ${this._dinero(b.dataset.monto)} y renovar ${b.dataset.meses} ${b.dataset.meses === '1' ? 'mes' : 'meses'} a ${b.dataset.clinica}?`);
                if (!ok) return;
                const r2 = await this._req(token, `/superadmin/cobros/solicitudes/${b.dataset.id}/aprobar`, { method: 'POST', body: '{}' });
                if (r2.status !== 'Success') return this._error(r2.message);
                if (alCambiar) alCambiar();
                render();
            });
            cont.querySelectorAll('.cs-rechazar').forEach(b => b.onclick = () => {
                const fila = b.parentElement;
                if (fila.querySelector('.cs-motivo')) return;
                const caja = document.createElement('div');
                caja.style.cssText = 'display:flex; gap:6px; width:100%;';
                caja.innerHTML = `<input class="swal2-input cs-motivo" placeholder="Motivo (lo verá la clínica)" maxlength="300" style="margin:0; flex:1; height:32px; font-size:0.75rem;">
                    <button type="button" class="swal2-styled" style="margin:0; padding:4px 10px; font-size:0.72rem; background:#dc2626;">Confirmar</button>`;
                fila.appendChild(caja);
                caja.querySelector('button').onclick = async () => {
                    const motivo = caja.querySelector('input').value.trim();
                    if (!motivo) return caja.querySelector('input').focus();
                    const r2 = await this._req(token, `/superadmin/cobros/solicitudes/${b.dataset.id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) });
                    if (r2.status !== 'Success') return this._error(r2.message);
                    if (alCambiar) alCambiar();
                    render();
                };
            });
        };

        await Swal.fire({
            title: 'Pagos reportados',
            width: 600,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#64748b',
            html: `<div id="cs-error" style="display:none; color:#dc2626; font-size:0.8rem; margin-bottom:6px;"></div>
                   <div id="cs-lista" style="text-align:left; font-size:0.8rem; max-height:420px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">Cargando…</div>`,
            didOpen: render
        });
    },

    // confirm() no existe en este entorno: la confirmación es un segundo clic en el mismo botón.
    _confirmarEnLinea: function(boton, texto) {
        return new Promise((resolve) => {
            if (boton.dataset.confirmando === '1') { resolve(true); return; }
            boton.dataset.confirmando = '1';
            const original = boton.innerHTML;
            boton.innerHTML = '<i class="fas fa-check-double"></i> Confirmar';
            boton.title = texto;
            const err = document.getElementById('cs-error');
            if (err) { err.style.display = 'block'; err.style.color = '#334155'; err.textContent = texto + ' Toque "Confirmar".'; }
            setTimeout(() => {
                if (boton.isConnected) { boton.dataset.confirmando = ''; boton.innerHTML = original; }
            }, 6000);
            resolve(false);
        });
    },

    _error: function(msg) {
        const err = document.getElementById('cs-error');
        if (err) { err.style.display = 'block'; err.style.color = '#dc2626'; err.textContent = msg || 'No se pudo completar.'; }
    },

    verComprobante: async function(token, idSolicitud) {
        try {
            const resp = await fetch(window.api.baseURL + `/superadmin/cobros/solicitudes/${idSolicitud}/comprobante`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!resp.ok) return this._error('No se pudo abrir el comprobante.');
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            if (blob.type.startsWith('image/')) {
                // Visor encima del modal de solicitudes (otro Swal lo cerraría).
                const capa = document.createElement('div');
                capa.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,.85); display:flex; align-items:center; justify-content:center; cursor:zoom-out; padding:20px;';
                capa.innerHTML = `<img src="${url}" style="max-width:100%; max-height:100%; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,.5);">`;
                capa.onclick = () => { capa.remove(); URL.revokeObjectURL(url); };
                document.body.appendChild(capa);
                return;
            }
            const a = document.createElement('a');
            a.href = url;
            a.download = `comprobante-${idSolicitud}${blob.type === 'application/pdf' ? '.pdf' : ''}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            this._error('No se pudo abrir el comprobante.');
        }
    }
};
