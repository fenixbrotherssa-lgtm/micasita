/**
 * MÓDULO DE FACTURACIÓN ELECTRÓNICA Y RECIBOS
 * Versión: 4.5 - Ametra OS
 */
window.facturacionModule = {
    init: function() {
        console.log("🚀 Módulo de Facturación Inicializado (v4.5)");
        this.cargarCertificados();
        this.cargarHistorial();

        const pendiente = localStorage.getItem('factura_pendiente_editar');
        if (pendiente) {
            try {
                const datos = JSON.parse(pendiente);
                this.prepararFacturaDesdePago(datos);
                localStorage.removeItem('factura_pendiente_editar');
            } catch (e) {
                console.error("Error al procesar pago pendiente:", e);
            }
        }
    },

    imprimirUltimoRecibo: async function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
        if (!sesion) return Swal.fire('Error', 'Inicie sesión nuevamente', 'error');

        try {
            const idClinica = Number(sesion.ID_Clinica || sesion.id_clinica);
            const res = await window.api.get(`/facturacion/historial?id_clinica=${idClinica}&tipo=00`);
            
            if (res.data && res.data.length > 0) {
                const ultimoPago = res.data[0];
                const idRef = ultimoPago.ID_Pago || ultimoPago.ID_Facturacion;
                this.reimprimirDocumento(idRef);
            } else {
                Swal.fire('Aviso', 'No hay recibos recientes para imprimir.', 'info');
            }
        } catch (e) {
            console.error("Error al obtener último recibo:", e);
            Swal.fire('Error', 'Fallo al conectar con el servidor de impresión.', 'error');
        }
    },

    abrirModalCertificado: function() {
        const modal = document.getElementById('modal-certificado');
        if (modal) modal.style.display = 'flex';
    },

    cerrarModal: function() {
        const modal = document.getElementById('modal-certificado');
        if (modal) modal.style.display = 'none';
        const form = document.getElementById('form-p12');
        if (form) form.reset();
    },

    subirP12: async function(event) {
        if (event) event.preventDefault();
        
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return Swal.fire('Error', 'Sesión no válida.', 'error');
        const sesion = JSON.parse(sesionRaw);

        const fileInput = document.getElementById('archivo-p12');
        const passInput = document.getElementById('pass-p12');
        const nombreInput = document.getElementById('nombre-p12');

        if (!fileInput.files[0]) return Swal.fire('Error', 'Selecciona el archivo .p12', 'warning');

        const formData = new FormData();
        formData.append('p12', fileInput.files[0]);
        formData.append('nombre_certificado', nombreInput.value || "Firma 2026");
        formData.append('password_p12', passInput.value.trim());
        formData.append('id_clinica', String(sesion.ID_Clinica || sesion.id_clinica));
        formData.append('id_usuario', String(sesion.ID_Usuario || sesion.id_usuario));

        try {
            Swal.fire({ 
                title: 'Subiendo...', 
                text: 'Guardando en Facturacion_Certificados',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading() 
            });

            const response = await fetch(`${window.api.baseURL}/facturacion/certificado/subir`, {
                method: 'POST',
                // 🛡️ Token JWT (FormData: NO se pone Content-Type, el navegador lo arma solo)
                headers: { 'Authorization': `Bearer ${window.api.getToken()}` },
                body: formData
            });

            const res = await response.json();

            if (response.ok && (res.status === "Success" || res.success || res.id)) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Éxito!',
                    text: 'Firma vinculada correctamente.',
                    timer: 2500,
                    timerProgressBar: true,
                    showConfirmButton: false,
                    allowOutsideClick: false
                });

                this.cerrarModal();
                
                if (typeof this.cargarCertificados === 'function') {
                    this.cargarCertificados();
                }
            } else {
                Swal.fire('Error', res.mensaje || res.message || 'Error al procesar archivo.', 'error');
            }
        } catch (error) {
            console.error("Detalle del error:", error);
            Swal.fire('Error', 'Hubo un fallo en la comunicación con el servidor.', 'error');
        }
    },

    reimprimirDocumento: async function(idPago) {
        try {
            if (!idPago) return Swal.fire('Error', 'ID de pago no válido.', 'error');
            Swal.fire({ title: 'Generando Recibo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            const res = await window.api.get(`/pagos/recibo/${idPago}`);
            
            if (res.success || res.status === "Success") {
                Swal.close();
                const datosRecibo = res.datos || res.data;
                if (typeof window.imprimirReciboGlobal === 'function') {
                    window.imprimirReciboGlobal(datosRecibo);
                } else if (window.ipcRenderer) {
                    window.ipcRenderer.send('imprimir-recibo', datosRecibo);
                } else {
                    Swal.fire('Error', 'Motor de impresión no detectado.', 'error');
                }
            } else {
                Swal.fire('Error', 'No se encontró el registro en SQL Server.', 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'Fallo de red al intentar imprimir.', 'error');
        }
    },

    prepararFacturaDesdePago: async function(pago) {
        try {
            if (pago.YaFacturado === 1) {
                return Swal.fire('Documento Facturado', 'Este pago ya tiene una factura electrónica asociada.', 'info');
            }

            const idPago = Number(pago.ID_Pago || pago.id_pago || pago.ID_Pago_Origen || pago.ID_Facturacion);

            if (!idPago) return Swal.fire('Error', 'No se pudo identificar el origen del pago.', 'error');

            if (pago.Receptor_Nombre_RS || (pago.Nombres && pago.Apellidos)) {
                this.llenarFormularioEmisionSRI(pago, idPago);
                return;
            }

            Swal.fire({ title: 'Cargando datos...', didOpen: () => Swal.showLoading() });
            const res = await window.api.get(`/pagos/recibo/${idPago}`);
            
            if (res.success || res.status === "Success") {
                Swal.close();
                this.llenarFormularioEmisionSRI(res.datos || res.data, idPago);
            } else {
                Swal.fire('Error', 'No se pudieron recuperar los detalles del pago.', 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'Error de comunicación con el servidor local.', 'error');
        }
    },

    // NUEVO: SE AGREGARON LOS CAMPOS DE AMBIENTE Y SECUENCIAL
    llenarFormularioEmisionSRI: function(datos, idPago) {
        const cliente = datos.Receptor_Nombre_RS || datos.receptor_nombre_rs || 
                        `${datos.Nombres || ''} ${datos.Apellidos || ''}`.trim() || "Consumidor Final";
        
        const subtotalBase = parseFloat(datos.Importe_Total || datos.importe_total || 
                                      datos.Subtotal_Sin_Impuestos || datos.Monto || 0);
        
        const rucSugerido = datos.Receptor_Identificacion || datos.Cedula || datos.DNI || '';
        const emailSugerido = datos.Receptor_Email || datos.Email || '';

        Swal.fire({
            title: 'Emitir Factura Electrónica',
            html: `
                <div style="text-align: left; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display:flex; gap:10px;">
                        <div style="flex:1" class="swal-field">
                            <label style="font-size: 0.8rem; font-weight: bold;">Ambiente SRI:</label>
                            <select id="swal-ambiente" class="swal2-input" style="margin:0; width:100%; height: 42px;">
                                <option value="2">Producción (2)</option>
                                <option value="1">Pruebas (1)</option>
                            </select>
                        </div>
                        <div style="flex:1" class="swal-field">
                            <label style="font-size: 0.8rem; font-weight: bold;">Secuencial:</label>
                            <input id="swal-secuencial" class="swal2-input" placeholder="Auto" style="margin:0; width:100%; height: 42px;">
                        </div>
                    </div>
                    <div class="swal-field">
                        <label style="font-size: 0.8rem; font-weight: bold;">RUC / Cédula:</label>
                        <input id="swal-ruc" class="swal2-input" style="margin:0; width:90%" value="${rucSugerido}">
                    </div>
                    <div class="swal-field">
                        <label style="font-size: 0.8rem; font-weight: bold;">Razón Social:</label>
                        <input id="swal-nombre" class="swal2-input" style="margin:0; width:90%" value="${cliente}">
                    </div>
                    <div class="swal-field">
                        <label style="font-size: 0.8rem; font-weight: bold;">Email Receptor:</label>
                        <input id="swal-email" class="swal2-input" style="margin:0; width:90%" value="${emailSugerido}">
                    </div>
                    <div class="swal-field">
                        <label style="font-size: 0.8rem; font-weight: bold;">Tipo de IVA:</label>
                        <select id="swal-iva-tipo" class="swal2-input" style="margin:0; width:90%" 
                                onchange="window.facturacionModule.recalcularTotalesSwal(${subtotalBase})">
                            <option value="0">IVA 0% (Servicios Médicos)</option>
                            <option value="15">IVA 15% (Otros)</option>
                        </select>
                    </div>
                    <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 10px;">
                        <div style="display:flex; justify-content:space-between"><span>Subtotal:</span> <span id="lbl-swal-subtotal">$${subtotalBase.toFixed(2)}</span></div>
                        <div style="display:flex; justify-content:space-between"><span>IVA:</span> <span id="lbl-swal-iva">$0.00</span></div>
                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#059669; font-size:1.1rem">
                            <span>Total:</span> <span id="lbl-swal-total">$${subtotalBase.toFixed(2)}</span>
                        </div>
                    </div>
                </div>`,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-paper-plane"></i> Guardar Factura',
            confirmButtonColor: '#059669',
            preConfirm: () => {
                const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
                const tipoIva = document.getElementById('swal-iva-tipo').value;
                const sub = parseFloat(subtotalBase);
                const ivaVal = tipoIva === "15" ? (sub * 0.15) : 0;

                return {
                    factura_data: {
                        id_pago: Number(idPago),
                        id_clinica: Number(sesion.ID_Clinica || sesion.id_clinica),
                        id_usuario: Number(sesion.ID_Usuario || sesion.id_usuario),
                        ambiente_sri: document.getElementById('swal-ambiente').value, // NUEVO
                        secuencial_manual: document.getElementById('swal-secuencial').value // NUEVO
                    },
                    receptor_data: {
                        nombre: document.getElementById('swal-nombre').value,
                        cedula: document.getElementById('swal-ruc').value,
                        email: document.getElementById('swal-email').value
                    },
                    totales: {
                        subtotal: sub,
                        iva: ivaVal,
                        total: sub + ivaVal
                    }
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                this.generarFactura(result.value).then(res => {
                    if (res.status === "Success" || res.success) {
                        Swal.fire({
                            icon: 'success',
                            title: '¡Registrada!',
                            text: 'La factura se guardó en SQL Server lista para envío.',
                            timer: 2000,
                            showConfirmButton: false
                        });
                        this.cargarHistorial(); 
                    }
                }).catch(err => {
                    Swal.fire('Error', 'No se pudo registrar: ' + err.message, 'error');
                });
            }
        });
    },

    recalcularTotalesSwal: function(subtotal) {
        const tipoIva = document.getElementById('swal-iva-tipo').value;
        const valorIva = tipoIva === "15" ? (subtotal * 0.15) : 0;
        const total = subtotal + valorIva;
        const ivaLabel = document.getElementById('lbl-swal-iva');
        const totalLabel = document.getElementById('lbl-swal-total');
        if(ivaLabel) ivaLabel.innerText = `$${valorIva.toFixed(2)}`;
        if(totalLabel) totalLabel.innerText = `$${total.toFixed(2)}`;
    },

    generarFactura: function(datos) {
        return window.api.post('/facturacion/documento/registrar', datos);
    },

    // ===========================================================
    // FACTURA MANUAL (independiente del flujo de pagos clínico)
    // Búsqueda de cliente contra el padrón nacional (CSV)
    // ===========================================================
    // Opciones de forma de pago (catálogo SRI tabla 24)
    opcionesFormaPagoSRI: function(selected) {
        const ops = [
            ['01', '01 - Efectivo (sin sistema financiero)'],
            ['20', '20 - Transferencia / otros con sistema financiero'],
            ['19', '19 - Tarjeta de crédito'],
            ['16', '16 - Tarjeta de débito'],
            ['17', '17 - Dinero electrónico'],
            ['18', '18 - Tarjeta prepago'],
            ['15', '15 - Compensación de deudas'],
            ['21', '21 - Endoso de títulos']
        ];
        const sel = selected || '01';
        return ops.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
    },

    abrirFacturaManual: function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
        const idClinica = Number(sesion.ID_Clinica || sesion.id_clinica);

        Swal.fire({
            title: 'Factura Manual',
            width: 660,
            html: `
              <div style="text-align:left;display:flex;flex-direction:column;gap:8px;font-size:0.85rem;">
                <label style="font-weight:bold;">RUC / Cédula del cliente</label>
                <div style="display:flex;gap:8px;">
                    <input id="fm-ruc" class="swal2-input" style="margin:0;flex:1;" placeholder="Identificación">
                    <button type="button" id="fm-buscar" title="Buscar en padrón"
                        style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:0 16px;cursor:pointer;">
                        <i class="fas fa-search"></i>
                    </button>
                </div>
                <span id="fm-origen" style="display:none;font-size:0.72rem;padding:3px 8px;border-radius:6px;width:fit-content;"></span>

                <label style="font-weight:bold;">Razón Social / Nombres</label>
                <input id="fm-nombre" class="swal2-input" style="margin:0;" placeholder="Nombres y apellidos / Razón social">

                <div style="display:flex;gap:8px;">
                    <input id="fm-email" class="swal2-input" style="margin:0;flex:1;" placeholder="Email">
                    <input id="fm-tel" class="swal2-input" style="margin:0;flex:1;" placeholder="Teléfono">
                </div>
                <input id="fm-dir" class="swal2-input" style="margin:0;" placeholder="Dirección">

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:4px 0;">
                <label style="font-weight:bold;">Detalle del comprobante</label>
                <div style="display:flex;gap:8px;">
                    <input id="fm-cod" class="swal2-input" style="margin:0;width:100px;" placeholder="Cód." value="SERV-01">
                    <input id="fm-desc" class="swal2-input" style="margin:0;flex:1;" placeholder="Descripción" value="CONSULTA Y TRATAMIENTO ODONTOLÓGICO">
                </div>
                <div style="display:flex;gap:8px;">
                    <input id="fm-cant" type="number" min="1" step="1" class="swal2-input" style="margin:0;flex:1;" placeholder="Cantidad" value="1">
                    <input id="fm-precio" type="number" min="0" step="0.01" class="swal2-input" style="margin:0;flex:1;" placeholder="Precio unitario">
                    <select id="fm-iva" class="swal2-input" style="margin:0;flex:1;height:42px;">
                        <option value="0">IVA 0%</option>
                        <option value="15">IVA 15%</option>
                    </select>
                </div>
                <div style="display:flex;gap:8px;">
                    <select id="fm-amb" class="swal2-input" style="margin:0;flex:1;height:42px;">
                        <option value="2">Producción (2)</option>
                        <option value="1">Pruebas (1)</option>
                    </select>
                    <input id="fm-sec" class="swal2-input" style="margin:0;flex:1;" placeholder="Secuencial (auto)">
                </div>

                <label style="font-weight:bold;">Forma de Pago</label>
                <select id="fm-fp" class="swal2-input" style="margin:0;height:42px;">${this.opcionesFormaPagoSRI('01')}</select>

                <div style="background:#f1f5f9;padding:12px;border-radius:8px;margin-top:4px;">
                    <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span id="fm-lbl-sub">$0.00</span></div>
                    <div style="display:flex;justify-content:space-between;"><span>IVA:</span><span id="fm-lbl-iva">$0.00</span></div>
                    <div style="display:flex;justify-content:space-between;font-weight:bold;color:#059669;font-size:1.05rem;"><span>Total:</span><span id="fm-lbl-total">$0.00</span></div>
                </div>
              </div>`,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-paper-plane"></i> Emitir y Firmar',
            confirmButtonColor: '#059669',
            didOpen: () => {
                document.getElementById('fm-buscar').onclick = () => window.facturacionModule.buscarClientePadron(idClinica);
                ['fm-cant', 'fm-precio', 'fm-iva'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.addEventListener('input', window.facturacionModule.recalcularManual);
                    el.addEventListener('change', window.facturacionModule.recalcularManual);
                });
                const inputRuc = document.getElementById('fm-ruc');
                if (inputRuc) inputRuc.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); window.facturacionModule.buscarClientePadron(idClinica); }
                });
            },
            preConfirm: () => {
                const ruc = document.getElementById('fm-ruc').value.trim();
                const nombre = document.getElementById('fm-nombre').value.trim();
                if (!ruc) { Swal.showValidationMessage('Ingrese la identificación del cliente'); return false; }
                if (!nombre) { Swal.showValidationMessage('Ingrese la razón social'); return false; }
                const cant = parseFloat(document.getElementById('fm-cant').value) || 1;
                const precio = parseFloat(document.getElementById('fm-precio').value) || 0;
                if (precio <= 0) { Swal.showValidationMessage('Ingrese un precio unitario válido'); return false; }
                const tipoIva = document.getElementById('fm-iva').value;
                const subtotal = +(cant * precio).toFixed(2);
                const iva = tipoIva === '15' ? +(subtotal * 0.15).toFixed(2) : 0;
                const fpSel = document.getElementById('fm-fp');
                const formaPago = fpSel.value;
                const formaPagoLabel = fpSel.options[fpSel.selectedIndex].text;
                return {
                    receptor: {
                        cedula: ruc,
                        nombre: nombre,
                        email: document.getElementById('fm-email').value.trim(),
                        direccion: document.getElementById('fm-dir').value.trim() || 'S/N',
                        telefono: document.getElementById('fm-tel').value.trim()
                    },
                    item: {
                        codigo: document.getElementById('fm-cod').value.trim() || 'SERV-01',
                        descripcion: document.getElementById('fm-desc').value.trim() || 'CONSULTA Y TRATAMIENTO ODONTOLÓGICO',
                        cantidad: cant,
                        precioUnitario: precio,
                        descuento: 0
                    },
                    ambiente: document.getElementById('fm-amb').value,
                    secuencial: document.getElementById('fm-sec').value.trim(),
                    forma_pago: formaPago,
                    forma_pago_label: formaPagoLabel,
                    totales: { subtotal: subtotal, iva: iva, total: +(subtotal + iva).toFixed(2) }
                };
            }
        }).then((r) => {
            if (r.isConfirmed) window.facturacionModule.emitirFacturaManual(r.value, idClinica);
        });
    },

    recalcularManual: function() {
        const cant = parseFloat(document.getElementById('fm-cant').value) || 0;
        const precio = parseFloat(document.getElementById('fm-precio').value) || 0;
        const tipoIva = document.getElementById('fm-iva').value;
        const sub = cant * precio;
        const iva = tipoIva === '15' ? sub * 0.15 : 0;
        const s = document.getElementById('fm-lbl-sub');
        const i = document.getElementById('fm-lbl-iva');
        const t = document.getElementById('fm-lbl-total');
        if (s) s.textContent = `$${sub.toFixed(2)}`;
        if (i) i.textContent = `$${iva.toFixed(2)}`;
        if (t) t.textContent = `$${(sub + iva).toFixed(2)}`;
    },

    buscarClientePadron: async function(idClinica) {
        const ruc = document.getElementById('fm-ruc').value.trim();
        if (!ruc) return;
        const btn = document.getElementById('fm-buscar');
        const tag = document.getElementById('fm-origen');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        try {
            const res = await window.api.get(`/facturacion/buscar-cliente/${encodeURIComponent(ruc)}`);
            if (res.success && res.cliente) {
                document.getElementById('fm-nombre').value = res.cliente.NombreFull || '';
                if (res.cliente.Correo)    document.getElementById('fm-email').value = res.cliente.Correo;
                if (res.cliente.Telefono)  document.getElementById('fm-tel').value = res.cliente.Telefono;
                if (res.cliente.Direccion) document.getElementById('fm-dir').value = res.cliente.Direccion;
                if (tag) {
                    tag.style.display = 'inline-block';
                    tag.textContent = '✔ Encontrado en padrón nacional';
                    tag.style.background = '#dcfce7';
                    tag.style.color = '#166534';
                }
            } else if (tag) {
                tag.style.display = 'inline-block';
                tag.textContent = 'No encontrado, ingrese los datos manualmente';
                tag.style.background = '#fef3c7';
                tag.style.color = '#92400e';
            }
        } catch (e) {
            if (tag) {
                tag.style.display = 'inline-block';
                tag.textContent = 'Error al consultar el padrón';
                tag.style.background = '#fee2e2';
                tag.style.color = '#991b1b';
            }
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    },

    emitirFacturaManual: async function(data, idClinica) {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');

        // 1) Verificar firma activa
        const resCert = await window.api.get(`/facturacion/certificados/${idClinica}`);
        if (!resCert.data || resCert.data.length === 0) {
            return Swal.fire('Firma Faltante', 'No hay firma electrónica activa para esta clínica.', 'error');
        }
        const idCertificado = resCert.data[0].ID_Certificado;

        Swal.fire({ title: 'Registrando factura...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // 2) Crear el Pago origen real (necesario por la FK FK_Factura_Pago)
        let idPagoOrigen;
        try {
            const pago = await window.api.post('/facturacion/pago-manual', {
                id_clinica: idClinica,
                id_usuario: Number(sesion.ID_Usuario || sesion.id_usuario),
                monto: data.totales.total,
                concepto: data.item.descripcion,
                metodo_pago: data.forma_pago_label || 'FACTURA MANUAL'
            });
            if (!(pago.status === 'Success') || !pago.id_pago) {
                return Swal.fire('Error', pago.mensaje || 'No se pudo registrar el pago origen.', 'error');
            }
            idPagoOrigen = pago.id_pago;
        } catch (e) {
            return Swal.fire('Error', 'No se pudo registrar el pago origen: ' + (e.message || ''), 'error');
        }

        // 3) Registrar el documento usando el ID_Pago real
        let reg;
        try {
            reg = await window.api.post('/facturacion/documento/registrar', {
                factura_data: {
                    id_pago: idPagoOrigen,
                    id_clinica: idClinica,
                    id_usuario: Number(sesion.ID_Usuario || sesion.id_usuario),
                    ambiente_sri: data.ambiente,
                    secuencial_manual: data.secuencial,
                    ruc_clinica: sesion.RUC || sesion.ruc || ''
                },
                receptor_data: {
                    nombre: data.receptor.nombre,
                    cedula: data.receptor.cedula,
                    email: data.receptor.email,
                    direccion: data.receptor.direccion
                },
                totales: data.totales
            });
        } catch (e) {
            return Swal.fire('Error', 'No se pudo registrar la factura: ' + (e.message || ''), 'error');
        }

        if (!(reg.status === 'Success' || reg.success)) {
            return Swal.fire('Error', reg.mensaje || 'No se pudo registrar la factura.', 'error');
        }
        const idFacturacion = reg.id_facturacion;

        // 4) Firmar y autorizar enviando los ítems personalizados
        Swal.fire({ title: 'Firmando y enviando al SRI...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        let auth;
        try {
            auth = await window.api.post('/facturacion/documento/autorizar-sri', {
                id_facturacion: idFacturacion,
                id_certificado: idCertificado,
                items: [data.item],
                forma_pago: data.forma_pago || '01',
                info_adicional: { telefono: data.receptor.telefono, email: data.receptor.email }
            });
        } catch (e) {
            this.cargarHistorial();
            return Swal.fire('Atención', 'La factura se registró, pero falló el envío al SRI: ' + (e.message || ''), 'warning');
        }

        if (auth.status === 'Success' && auth.estado === 'AUTORIZADO') {
            await Swal.fire('¡Autorizada!', `Factura autorizada por el SRI.\nClave: ${auth.clave || ''}`, 'success');
        } else if (auth.status === 'Success') {
            await Swal.fire('Procesada', `Estado SRI: ${auth.estado || 'enviado'}.`, 'info');
        } else {
            await Swal.fire('Atención', auth.mensaje || 'Respuesta del SRI no concluyente.', 'warning');
        }
        this.cargarHistorial();
    },

    enviarComprobanteSRI: async function(datosFinales) {
        try {
            console.log("📂 Datos para envío SRI:", datosFinales);
            
            const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
            const idClinica = Number(sesion.ID_Clinica || sesion.id_clinica);

            const idFacturacion = 
                datosFinales.ID_Facturacion || 
                datosFinales.id_facturacion || 
                datosFinales.factura_data?.ID_Facturacion || 
                datosFinales.factura_data?.id_facturacion ||
                datosFinales.factura_data?.id_pago || 
                datosFinales.ID_Pago_Origen; 

            if (!idFacturacion) {
                return Swal.fire('Error', 'No se pudo identificar el ID del documento.', 'error');
            }

            const resCert = await window.api.get(`/facturacion/certificados/${idClinica}`);
            if (!resCert.data || resCert.data.length === 0) {
                return Swal.fire("Firma Faltante", "No hay firmas electrónicas configuradas para esta clínica.", "error");
            }

            let idCertificado;

            if (resCert.data.length > 1) {
                const inputOptions = {};
                resCert.data.forEach(c => {
                    const nombreFirma = c.Ruta_Archivo_P12.split('\\').pop().split('/').pop();
                    inputOptions[c.ID_Certificado] = `Firma: ${nombreFirma}`;
                });

                const { value: certId } = await Swal.fire({
                    title: 'Seleccione la firma para este envío',
                    input: 'select',
                    inputOptions: inputOptions,
                    inputPlaceholder: 'Elija un certificado...',
                    showCancelButton: true,
                    confirmButtonText: 'Firmar y Enviar',
                    cancelButtonText: 'Cancelar'
                });

                if (!certId) return; 
                idCertificado = certId;
            } else {
                idCertificado = resCert.data[0].ID_Certificado;
            }

            // Seleccionar la forma de pago del comprobante
            const { value: formaPagoSel, isConfirmed: fpOk } = await Swal.fire({
                title: 'Forma de pago',
                html: `<select id="sw-fp" class="swal2-input" style="height:42px;">${this.opcionesFormaPagoSRI('01')}</select>`,
                showCancelButton: true,
                confirmButtonText: 'Firmar y Enviar',
                confirmButtonColor: '#059669',
                cancelButtonText: 'Cancelar',
                focusConfirm: false,
                preConfirm: () => document.getElementById('sw-fp').value
            });
            if (!fpOk) return;
            const formaPago = formaPagoSel || '01';

            Swal.fire({ 
                title: 'Procesando...', 
                text: `Firmando y enviando al SRI...`, 
                allowOutsideClick: false, 
                didOpen: () => Swal.showLoading() 
            });

            const resSRI = await window.api.post('/facturacion/documento/autorizar-sri', {
                id_facturacion: idFacturacion,
                id_certificado: idCertificado,
                forma_pago: formaPago
            });

            if (resSRI.status === "Success" || resSRI.status === "Autorizado") {
                await Swal.fire('¡Éxito!', 'Documento autorizado correctamente por el SRI.', 'success');
                Swal.close();
                if (this.cargarHistorial) this.cargarHistorial();
            } else {
                throw new Error(resSRI.mensaje || resSRI.error || "Error desconocido en el SRI");
            }

        } catch (e) {
            console.error("❌ Error en enviarComprobanteSRI:", e);
            Swal.fire('Atención', 'Respuesta: ' + e.message, 'warning');
        }
    },

    cargarCertificados: async function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
        const container = document.getElementById('firma-activa-status');
        if (!container || !sesion) return;
        try {
            const idClinica = Number(sesion.ID_Clinica || sesion.id_clinica);
            const res = await window.api.get(`/facturacion/certificados/${idClinica}`);
            if (res.data?.length > 0) {
                const f = res.data[0];
                container.innerHTML = `
                    <div style="background:#ecfdf5; border:1px solid #10b981; padding:10px; border-radius:8px; display:flex; align-items:center; gap:10px">
                        <i class="fas fa-certificate" style="color:#10b981; font-size:1.5rem"></i>
                        <div>
                            <div style="font-weight:bold; color:#065f46; font-size:0.8rem">CERTIFICADO ACTIVO</div>
                            <div style="font-size:0.7rem">${f.Nombre_Certificado}</div>
                        </div>
                    </div>`;
            } else {
                container.innerHTML = `<div style="color:#ef4444; border:1px dashed #ef4444; padding:10px; border-radius:8px; font-size:0.8rem">⚠️ Requiere Firma Electrónica</div>`;
            }
        } catch (e) { container.innerHTML = "Error al validar firma."; }
    },

    cargarHistorial: async function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
        const tbody = document.getElementById('lista-comprobantes');
        const filtro = document.getElementById('filtro-tipo-doc');
        if (!tbody || !sesion) return;

        const tipo = filtro ? filtro.value : "00";
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Consultando SQL Server...</td></tr>';

        try {
            const idClinica = Number(sesion.ID_Clinica || sesion.id_clinica);
            const res = await window.api.get(`/facturacion/historial?id_clinica=${idClinica}&tipo=${tipo}`);
            
            if (res.data && res.data.length > 0) {
                tbody.innerHTML = res.data.map(doc => {
                    const estado = (doc.Estado_SRI || 'PAGO_INTERNO').toUpperCase();
                    const esInterno = estado === 'PAGO_INTERNO';
                    const yaFacturado = doc.YaFacturado === 1;
                    const idRef = doc.ID_Facturacion || doc.ID_Pago || doc.ID_Pago_Origen;
                    const cliente = doc.Receptor_Nombre_RS || `${doc.Nombres || ''} ${doc.Apellidos || ''}`.trim() || 'Consumidor Final';

                    return `
                        <tr>
                            <td>${new Date(doc.Fecha_Emision || doc.Fecha_Pago).toLocaleDateString()}</td>
                            <td><small>${doc.Establecimiento || '001'}-${doc.Punto_Emision || '001'}</small><br><b>${doc.Secuencial || '---'}</b></td>
                            <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${cliente}</td>
                            <td><b>$${parseFloat(doc.Importe_Total || doc.Monto).toFixed(2)}</b></td>
                            <td><span class="badge ${esInterno ? 'bg-gray' : 'bg-green'}">${estado}</span></td>
                            <td>
                                <div style="display: flex; gap: 5px;">
                                    ${esInterno ? 
                                        `<button class="btn-action blue" title="Reimprimir Recibo" onclick="facturacionModule.reimprimirDocumento(${idRef})"><i class="fas fa-print"></i></button>` :
                                        `<button class="btn-action blue" title="Ver PDF" onclick="facturacionModule.verPDF('${doc.Ruta_PDF_RIDE}')"><i class="fas fa-file-pdf"></i></button>`
                                    }
                                    <button class="btn-action ${yaFacturado ? 'gray' : (esInterno ? 'green' : 'orange')}" 
                                        title="${yaFacturado ? 'Ya Autorizado' : (esInterno ? 'Crear Factura' : 'Firmar y Enviar SRI')}" 
                                        ${yaFacturado ? 'disabled' : ''}
                                        onclick='facturacionModule.${esInterno ? "prepararFacturaDesdePago" : "enviarComprobanteSRI"}(${JSON.stringify(doc).replace(/'/g, "&apos;")})'>
                                    <i class="fas ${esInterno ? 'fa-file-invoice-dollar' : 'fa-paper-plane'}"></i>
                                </button>
                                </div>
                            </td>
                        </tr>`;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px">No se encontraron registros.</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:20px">Error al conectar con SQL Server.</td></tr>';
        }
    },

    verPDF: function(ruta) {
        if (!ruta || ruta === 'null') {
            return Swal.fire("Aviso", "PDF no generado aún.", "info");
        }

        const base = window.api.baseURL.split('/api')[0];
        const dominioPublico = window.api.publicURL; 
        
        const indexUploads = ruta.indexOf('uploads');
        let pathLimpio = indexUploads !== -1 ? ruta.substring(indexUploads) : ruta;
        pathLimpio = pathLimpio.replace(/\\/g, '/');
        
        const urlFinal = `${base}/${pathLimpio}`; 
        const urlPublica = `${dominioPublico}/${pathLimpio}`;

        console.log("📄 Abriendo PDF con PDF.js:", urlFinal);

        const anterior = document.getElementById('pdf-viewer-overlay');
        if (anterior) anterior.remove();

        if (!document.getElementById('swal-zindex-fix')) {
            const style = document.createElement('style');
            style.id = 'swal-zindex-fix';
            style.textContent = `.swal2-container { z-index: 9999999 !important; }`;
            document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.id = 'pdf-viewer-overlay';
        overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;`;
        overlay.innerHTML = `
            <div style="background:#1e293b;border-radius:12px;width:92vw;height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#0f172a;border-bottom:1px solid #334155;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:0.85rem;">
                        <i class="fas fa-file-pdf" style="color:#ef4444;"></i>
                        <span>Visualizador de Comprobante</span>
                        <span id="pdf-page-info" style="color:#64748b;font-size:0.78rem;"></span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <a href="${urlFinal}" download
                           style="color:#60a5fa;font-size:0.8rem;text-decoration:none;padding:5px 12px;border:1px solid #3b82f6;border-radius:6px;display:flex;align-items:center;gap:5px;">
                            <i class="fas fa-download"></i> Descargar
                        </a>
                        <button id="btn-enviar-whatsapp"
                                style="background:#25d366;border:none;color:white;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;gap:5px;">
                            <i class="fab fa-whatsapp"></i> WhatsApp
                        </button>
                        <button id="btn-enviar-email"
                                style="background:#6366f1;border:none;color:white;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;gap:5px;">
                            <i class="fas fa-envelope"></i> Email Físico
                        </button>
                        <button onclick="document.getElementById('pdf-viewer-overlay').remove()"
                                style="background:#ef4444;border:none;color:white;width:30px;height:30px;border-radius:6px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">
                            ✕
                        </button>
                    </div>
                </div>
                <div id="pdf-canvas-container" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:20px;background:#475569;gap:12px;">
                    <div id="pdf-loading" style="color:white;margin-top:40px;">
                        <i class="fas fa-spinner fa-spin"></i> Cargando comprobante...
                    </div>
                </div>
            </div>`;

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        const mostrarFormulario = ({ titulo, placeholder, tipo = 'text', onConfirm }) => {
            const modal = document.createElement('div');
            modal.id = 'pdf-mini-modal';
            modal.style.cssText = `
                position:fixed;inset:0;z-index:9999999;
                display:flex;align-items:center;justify-content:center;
            `;
            modal.innerHTML = `
                <div style="background:#1e293b;border-radius:12px;padding:28px 32px;width:420px;
                            box-shadow:0 20px 60px rgba(0,0,0,0.7);border:1px solid #334155;">
                    <p style="color:#f1f5f9;font-size:1rem;font-weight:600;margin:0 0 16px 0;">${titulo}</p>
                    <input id="pdf-mini-input" type="${tipo}" placeholder="${placeholder}"
                           style="width:100%;box-sizing:border-box;padding:10px 14px;border-radius:8px;
                                  border:1px solid #475569;background:#0f172a;color:#f1f5f9;
                                  font-size:0.9rem;outline:none;">
                    <p id="pdf-mini-error" style="color:#fca5a5;font-size:0.78rem;margin:6px 0 0 0;display:none;"></p>
                    <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
                        <button id="pdf-mini-cancel"
                                style="background:#334155;border:none;color:#94a3b8;padding:8px 18px;
                                       border-radius:8px;cursor:pointer;font-size:0.85rem;">
                            Cancelar
                        </button>
                        <button id="pdf-mini-confirm"
                                style="background:#3b82f6;border:none;color:white;padding:8px 18px;
                                       border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;">
                            Confirmar
                        </button>
                    </div>
                </div>`;

            document.body.appendChild(modal);

            const input  = document.getElementById('pdf-mini-input');
            const error  = document.getElementById('pdf-mini-error');
            const cerrar = () => modal.remove();

            input.focus();

            document.getElementById('pdf-mini-cancel').onclick = cerrar;

            document.getElementById('pdf-mini-confirm').onclick = () => {
                const val = input.value.trim();
                const resultado = onConfirm(val, (msg) => {
                    error.textContent = msg;
                    error.style.display = 'block';
                });
                if (resultado) cerrar();
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('pdf-mini-confirm').click();
                if (e.key === 'Escape') cerrar();
            });
        };

        // ── WHATSAPP (Mantiene Enlaces) ──
        document.getElementById('btn-enviar-whatsapp').onclick = () => {
            mostrarFormulario({
                titulo: '<i class="fab fa-whatsapp" style="color:#25d366;margin-right:8px;"></i> Número de WhatsApp',
                placeholder: 'Ej: 593987654321',
                tipo: 'tel',
                onConfirm: (val, showError) => {
                    const tel = val.replace(/\s+/g, '');
                    if (!tel) { showError('Ingrese un número de teléfono.'); return false; }
                    if (!/^\d{10,15}$/.test(tel)) { showError('Debe contener entre 10 y 15 dígitos.'); return false; }

                    const urlXml = urlPublica.replace('/facturacion/pdf/', '/facturacion/xml_firmados/').replace(/\.pdf$/i, '_firmado.xml');

                    const texto = encodeURIComponent(`Estimado/a cliente,\n\nAdjuntamos su comprobante electrónico autorizado por el SRI.\n\n📄 PDF:\n${urlPublica}\n\n📎 XML:\n${urlXml}\n\nGracias por confiar en nosotros.`);

                    window.api.abrirExterno(`https://wa.me/${tel}?text=${texto}`);
                    return true;
                }
            });
        };

        // ── EMAIL (NUEVO: ENVÍO DIRECTO CON NODEMAILER) ──
        document.getElementById('btn-enviar-email').onclick = () => {
            mostrarFormulario({
                titulo: '<i class="fas fa-envelope" style="color:#6366f1;margin-right:8px;"></i> Correo electrónico destino',
                placeholder: 'correo@ejemplo.com',
                tipo: 'email',
                onConfirm: async (val, showError) => {
                    if (!val) { showError('Ingrese un correo electrónico.'); return false; }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { showError('Ingrese un correo válido.'); return false; }

                    // Extraer la clave de acceso del nombre del archivo PDF actual cargado
                    const filename = pathLimpio.split('/').pop(); 
                    const claveAcceso = filename.replace('.pdf', '');

                    Swal.fire({ title: 'Enviando archivos adjuntos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    
                    try {
                        const res = await window.api.post('/facturacion/documento/enviar-correo', {
                            clave_acceso: claveAcceso,
                            email_destino: val
                        });
                        
                        if(res.status === "Success") {
                            Swal.fire('Enviado', 'Los documentos fueron adjuntados y enviados físicamente.', 'success');
                        } else {
                            Swal.fire('Error', res.mensaje || 'Error al enviar el correo.', 'error');
                        }
                    } catch(e) {
                        Swal.fire('Error', 'Fallo al comunicarse con el servidor.', 'error');
                    }
                    return true;
                }
            });
        };

        const cargarPDFJS = () => new Promise((resolve, reject) => {
            if (window.pdfjsLib) return resolve(window.pdfjsLib);
            const script = document.createElement('script');
            script.src = `${base}/assets/js/pdf.min.js`;
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}/assets/js/pdf.worker.min.js`;
                resolve(window.pdfjsLib);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });

        cargarPDFJS().then(pdfjsLib => {
            pdfjsLib.getDocument(urlFinal).promise.then(pdfDoc => {
                const totalPages = pdfDoc.numPages;
                const container  = document.getElementById('pdf-canvas-container');
                const pageInfo   = document.getElementById('pdf-page-info');
                container.innerHTML = '';

                for (let i = 1; i <= totalPages; i++) {
                    pdfDoc.getPage(i).then(page => {
                        const containerWidth = container.clientWidth - 40;
                        const viewport       = page.getViewport({ scale: 1 });
                        const scale          = Math.min(containerWidth / viewport.width, 2.0);
                        const scaledViewport = page.getViewport({ scale });

                        const canvas = document.createElement('canvas');
                        canvas.style.cssText = `box-shadow:0 4px 20px rgba(0,0,0,0.5);border-radius:4px;display:block;max-width:100%;`;
                        canvas.height = scaledViewport.height;
                        canvas.width  = scaledViewport.width;
                        container.appendChild(canvas);

                        page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport });
                        if (i === 1 && pageInfo) pageInfo.textContent = `${totalPages} página(s)`;
                    });
                }
            }).catch(err => {
                document.getElementById('pdf-canvas-container').innerHTML =
                    `<div style="color:#fca5a5;margin-top:40px;text-align:center;">
                        <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;"></i><br>
                        Error al renderizar el comprobante.<br>
                        <small>${err.message}</small>
                    </div>`;
            });
        }).catch(() => {
            document.getElementById('pdf-canvas-container').innerHTML =
                `<div style="color:#fca5a5;margin-top:40px;text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;"></i><br>
                    No se pudo inicializar el visor de documentos.<br>
                    <small>Verifique la conexión con el servidor.</small>
                </div>`;
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.facturacionModule.init());
} else {
    window.facturacionModule.init();
}