// ==========================================
// MÓDULO: GESTIÓN DE INVENTARIO PROFESIONAL
// ==========================================
window.inventarioModule = {
    tipoActual: 'ACTIVO',
    data: [],
    clinicasDisponibles: [],

    init: async function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return;
        const sesion = JSON.parse(sesionRaw);

        const displayUser = document.getElementById('display-usuario-nombre');
        if (displayUser) {
            const nombre   = sesion.Nombres   || sesion.nombres   || 'USUARIO';
            const apellido = sesion.Apellidos  || sesion.apellidos || '';
            displayUser.innerText = `RESPONSABLE: ${nombre.toUpperCase()} ${apellido.toUpperCase()}`;
        }

        await this.cargarClinicas();
        await this.cargarInventario();

        // Los doctores ven su panel de stock personal al iniciar
        const idRol = String(sesion.ID_Rol || sesion.id_rol);
        if (idRol !== '1') {
            await this.renderStockDoctor();
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // CARGA DE SEDES
    // ══════════════════════════════════════════════════════════════════════
    cargarClinicas: async function() {
        try {
            const clinicas = await window.api.get('/clinicas/listar');
            this.clinicasDisponibles = clinicas || [];

            const selectFilter = document.getElementById('inv-filter-sede');
            const selectModal  = document.getElementById('inv-id-clinica-modal');
            const sesion       = JSON.parse(localStorage.getItem('usuario_sesion'));
            const idRol        = String(sesion.ID_Rol || sesion.id_rol);

            if (Array.isArray(clinicas)) {
                let optionsFilter = (idRol === '1') ? '<option value="">TODAS LAS SEDES (GLOBAL)</option>' : '';
                let optionsModal  = '';

                clinicas.forEach(c => {
                    const texto = `${c.Nombre_Clinica.toUpperCase()} - ${c.Ciudad || ''}`;
                    if (idRol === '1' || c.ID_Clinica == (sesion.ID_Clinica || sesion.id_clinica)) {
                        optionsFilter += `<option value="${c.ID_Clinica}">${texto}</option>`;
                        optionsModal  += `<option value="${c.ID_Clinica}">${texto}</option>`;
                    }
                });

                if (selectFilter) selectFilter.innerHTML = optionsFilter;
                if (selectModal) {
                    selectModal.innerHTML = optionsModal;
                    const wrapperSede = document.getElementById('wrapper-seleccionar-sede-modal');
                    if (wrapperSede) wrapperSede.style.display = (idRol === '1') ? 'block' : 'none';
                }
            }
        } catch (e) { console.error('Error cargando sedes:', e); }
    },

    // ══════════════════════════════════════════════════════════════════════
    // CARGA PRINCIPAL DEL INVENTARIO
    // ══════════════════════════════════════════════════════════════════════
    cargarInventario: async function() {
        const contenedor  = document.getElementById('contenedor-tabla-inventario');
        const filterSede  = document.getElementById('inv-filter-sede');
        const sesion      = JSON.parse(localStorage.getItem('usuario_sesion'));
        const id_c        = (filterSede && filterSede.value)
            ? filterSede.value
            : (sesion.ID_Clinica || sesion.id_clinica);

        contenedor.innerHTML = `
            <div style="padding:100px; text-align:center; color:#64748b;">
                <i class="fas fa-sync fa-spin" style="font-size:2rem; margin-bottom:15px; display:block;"></i>
                <span style="font-weight:700; letter-spacing:1px;">SINCRONIZANDO...</span>
            </div>`;

        try {
            const res  = await window.api.get(`/inventario?id_clinica=${id_c}&tipo=${this.tipoActual}&v=${Date.now()}`);
            this.data  = res || [];
            this.renderizar();
        } catch (e) {
            contenedor.innerHTML = '<div style="padding:50px; color:red; text-align:center;">Error de conexión con el servidor.</div>';
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // RENDER TABLA PRINCIPAL
    // ══════════════════════════════════════════════════════════════════════
    renderizar: function() {
        const contenedor  = document.getElementById('contenedor-tabla-inventario');
        const countAlertas = document.getElementById('count-alertas');
        const sesion      = JSON.parse(localStorage.getItem('usuario_sesion'));
        const idRol       = String(sesion.ID_Rol || sesion.id_rol);

        const alertas = this.data.filter(i => i.Tipo === 'PASIVO' && i.Cantidad <= (i.Stock_Minimo || 0)).length;
        if (countAlertas) countAlertas.innerText = alertas;

        if (this.data.length === 0) {
            contenedor.innerHTML = `
                <div style="padding:100px; text-align:center;">
                    <i class="fas fa-box-open" style="font-size:3rem; color:#e2e8f0; margin-bottom:15px;"></i>
                    <p style="color:#94a3b8; font-weight:700;">NO HAY REGISTROS EN ESTA CATEGORÍA</p>
                </div>`;
            return;
        }

        let html = `
            <table style="width:100%; border-collapse:separate; border-spacing:0 8px; font-size:13px;">
                <thead>
                    <tr style="color:#64748b; font-weight:800; text-transform:uppercase; font-size:11px;">
                        <th style="padding:10px 20px; text-align:left;">Detalle / Auditoría</th>
                        <th style="padding:10px; text-align:center;">Registro</th>
                        <th style="padding:10px; text-align:center;">Stock</th>
                        ${this.tipoActual === 'PASIVO' ? '<th style="padding:10px; text-align:center;">Porciones/ud</th>' : ''}
                        <th style="padding:10px; text-align:right;">Valorizado</th>
                        <th class="no-print" style="padding:10px; text-align:center;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.data.map(item => {
                        const esAlerta   = item.Tipo === 'PASIVO' && item.Cantidad <= (item.Stock_Minimo || 0);
                        const ppU        = item.Porciones_Por_Unidad || 1;
                        const porcionCol = this.tipoActual === 'PASIVO'
                            ? `<td style="padding:15px; text-align:center;">
                                ${ppU > 1
                                    ? `<span style="background:#ede9fe; color:#7c3aed; padding:3px 8px; border-radius:6px; font-weight:800; font-size:11px;">${ppU} usos</span>`
                                    : `<span style="color:#cbd5e1; font-size:11px;">—</span>`
                                }
                               </td>`
                            : '';

                        const botonesAccion = item.Tipo === 'ACTIVO'
                            ? `<button onclick="window.inventarioModule.imprimirEtiqueta(${item.ID_Item})"
                                    title="Etiqueta"
                                    style="border:none; background:#1e293b; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer;">
                                    <i class="fas fa-barcode"></i>
                               </button>`
                            : `<button onclick="window.inventarioModule.abrirMenuConsumo(${item.ID_Item})"
                                    title="Consumo / Asignar"
                                    style="border:none; background:#f59e0b; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer;">
                                    <i class="fas fa-flask"></i>
                               </button>
                               ${idRol === '1'
                                    ? `<button onclick="window.inventarioModule.configurarPorciones(${item.ID_Item})"
                                            title="Configurar porciones"
                                            style="border:none; background:#7c3aed; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer;">
                                            <i class="fas fa-sliders-h"></i>
                                       </button>
                                       <button onclick="window.inventarioModule.verMovimientos(${item.ID_Item})"
                                            title="Historial"
                                            style="border:none; background:#0ea5e9; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer;">
                                            <i class="fas fa-history"></i>
                                       </button>`
                                    : ''
                               }`;

                        return `
                            <tr style="background:white; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                                <td style="padding:15px 20px; border-radius:12px 0 0 12px; border-left:4px solid ${esAlerta ? '#f59e0b' : '#10b981'}">
                                    <div style="font-weight:800; color:#1e293b; font-size:14px;">${item.Nombre.toUpperCase()}</div>
                                    <div style="font-size:10px; color:#64748b; margin-top:4px;">
                                        <i class="fas fa-user-edit"></i> RESP: ${item.RegistradoPor || 'SISTEMA'}
                                        ${item.Numero_Factura ? `<span style="margin-left:10px; color:#4f46e5;"><i class="fas fa-file-invoice"></i> FAC: ${item.Numero_Factura}</span>` : ''}
                                    </div>
                                </td>
                                <td style="padding:15px; text-align:center; color:#64748b;">
                                    ${item.Fecha_Registro ? item.Fecha_Registro.split('T')[0].split('-').reverse().join('/') : '—'}
                                </td>
                                <td style="padding:15px; text-align:center;">
                                    <div style="font-weight:900; font-size:16px; color:${esAlerta ? '#ef4444' : '#1e293b'}">${item.Cantidad}</div>
                                    ${item.Tipo === 'PASIVO' ? `<div style="font-size:9px; color:#94a3b8;">MÍN: ${item.Stock_Minimo || 0}</div>` : ''}
                                </td>
                                ${porcionCol}
                                <td style="padding:15px; text-align:right; font-weight:800; color:#059669;">
                                    $${(item.Cantidad * (item.Precio_Unitario || 0)).toFixed(2)}
                                </td>
                                <td class="no-print" style="padding:15px; text-align:center; border-radius:0 12px 12px 0;">
                                    <div style="display:flex; gap:5px; justify-content:center;">
                                        <button onclick="window.inventarioModule.abrirEdicion(${item.ID_Item})"
                                                title="Editar"
                                                style="border:none; background:#f1f5f9; color:#475569; width:32px; height:32px; border-radius:8px; cursor:pointer;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${botonesAccion}
                                        <button onclick="window.inventarioModule.eliminar(${item.ID_Item})"
                                                title="Eliminar"
                                                style="border:none; background:#fee2e2; color:#ef4444; width:32px; height:32px; border-radius:8px; cursor:pointer;">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>`;

        contenedor.innerHTML = html;
    },

    // ══════════════════════════════════════════════════════════════════════
    // PANEL DE STOCK PERSONAL DEL DOCTOR
    //   Se inserta encima de la tabla principal cuando el usuario es doctor
    // ══════════════════════════════════════════════════════════════════════
    renderStockDoctor: async function() {
        const sesion    = JSON.parse(localStorage.getItem('usuario_sesion'));
        const idUsuario = sesion.ID_Usuario || sesion.id_usuario;
        let panelEl     = document.getElementById('panel-stock-doctor');

        if (!panelEl) {
            panelEl = document.createElement('div');
            panelEl.id = 'panel-stock-doctor';
            panelEl.style.cssText = 'margin-bottom:20px;';
            const wrapper = document.querySelector('.inventario-wrapper');
            const grid    = wrapper ? wrapper.querySelector('[style*="grid-template-columns"]') : null;
            if (grid) grid.parentNode.insertBefore(panelEl, grid);
        }

        panelEl.innerHTML = `
            <div style="background:white; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.05);
                        border:1px solid #e2e8f0; padding:20px;">
                <p style="margin:0 0 15px; font-weight:800; color:#1e293b; font-size:0.85rem;
                           text-transform:uppercase; letter-spacing:1px;">
                    <i class="fas fa-user-md" style="color:#4f46e5; margin-right:8px;"></i>
                    Mi Stock Asignado
                </p>
                <div id="grid-stock-doctor" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px;">
                    <div style="color:#94a3b8; font-size:12px; padding:20px; text-align:center;">
                        <i class="fas fa-sync fa-spin"></i> Cargando...
                    </div>
                </div>
            </div>`;

        try {
            const res   = await window.api.get(`/inventario/stock-doctor/${idUsuario}`);
            const items = res.data || [];
            const grid  = document.getElementById('grid-stock-doctor');

            if (items.length === 0) {
                grid.innerHTML = `
                    <div style="color:#94a3b8; font-size:12px; padding:20px; text-align:center; grid-column:1/-1;">
                        No tienes insumos asignados. Solicita al administrador.
                    </div>`;
                return;
            }

            grid.innerHTML = items.map(it => {
                const pct     = it.Porciones_Totales_Recibidas > 0
                    ? Math.round((it.Porciones_Disponibles / it.Porciones_Totales_Recibidas) * 100)
                    : 0;
                const color   = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';
                return `
                    <div style="background:#f8fafc; border-radius:14px; padding:16px;
                                border:1px solid #e2e8f0; border-left:4px solid ${color};">
                        <div style="font-weight:800; color:#1e293b; font-size:12px; margin-bottom:8px; line-height:1.2;">
                            ${it.Nombre.toUpperCase()}
                        </div>
                        <div style="font-size:11px; color:#64748b; margin-bottom:6px;">
                            ${it.Nombre_Clinica}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span style="font-size:1.5rem; font-weight:900; color:${color};">
                                    ${parseFloat(it.Porciones_Disponibles).toFixed(1)}
                                </span>
                                <span style="font-size:10px; color:#94a3b8;"> porciones</span>
                            </div>
                            <div style="text-align:right; font-size:10px; color:#94a3b8;">
                                Usadas: ${parseFloat(it.Porciones_Consumidas).toFixed(1)}<br>
                                Recibidas: ${parseFloat(it.Porciones_Totales_Recibidas).toFixed(1)}
                            </div>
                        </div>
                        <div style="background:#e2e8f0; border-radius:99px; height:4px; margin-top:10px;">
                            <div style="background:${color}; width:${pct}%; height:4px; border-radius:99px; transition:width 0.5s;"></div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            console.error('Error cargando stock doctor:', e);
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // GUARDAR / REPONER ÍTEM
    // ══════════════════════════════════════════════════════════════════════
    guardar: async function() {
        const sesion           = JSON.parse(localStorage.getItem('usuario_sesion'));
        const idEdit           = document.getElementById('inv-id-edit').value;
        const idRol            = String(sesion.ID_Rol || sesion.id_rol);
        const selectSedeModal  = document.getElementById('inv-id-clinica-modal');
        const clinicaDestino   = (idRol === '1' && selectSedeModal)
            ? selectSedeModal.value
            : (sesion.ID_Clinica || sesion.id_clinica);
        const cantidadIngresada = parseInt(document.getElementById('inv-cantidad').value) || 0;

        if (idEdit && cantidadIngresada <= 0) {
            return Swal.fire('Atención', 'Ingresa la cantidad a reponer (debe ser mayor a 0)', 'warning');
        }

        const payload = {
            id_item:      idEdit ? parseInt(idEdit) : null,
            id_clinica:   clinicaDestino,
            id_usuario:   sesion.ID_Usuario || sesion.id_usuario,
            tipo:         document.getElementById('inv-tipo').value,
            nombre:       document.getElementById('inv-nombre').value,
            precio:       document.getElementById('inv-precio').value,
            cantidad:     cantidadIngresada,
            factura:      document.getElementById('inv-factura').value,
            fecha:        document.getElementById('inv-fecha-compra').value,
            stock_minimo: document.getElementById('inv-minimo').value
        };

        if (!payload.nombre || !payload.precio || !payload.cantidad) {
            return Swal.fire('Atención', 'Campos obligatorios incompletos', 'warning');
        }

        try {
            const res = await window.api.post('/inventario/guardar', payload);
            if (res.status === 'Success') {
                Swal.fire('Éxito',
                    idEdit
                        ? `Se repusieron ${cantidadIngresada} unidades correctamente`
                        : 'Registro procesado correctamente',
                    'success');
                this.cerrarModal();
                this.cargarInventario();
            }
        } catch (e) { Swal.fire('Error', 'No se pudo guardar la información', 'error'); }
    },

    // ══════════════════════════════════════════════════════════════════════
    // CONFIGURAR PORCIONES (solo admin)
    //   Define cuántos usos rinde 1 unidad física. Recalcula el pool general.
    // ══════════════════════════════════════════════════════════════════════
    configurarPorciones: async function(id) {
        const item = this.data.find(i => i.ID_Item === id);
        if (!item) return;

        const { value } = await Swal.fire({
            title: `Porciones de "${item.Nombre}"`,
            html: `
                <p style="font-size:13px; color:#64748b; margin-bottom:15px;">
                    Define cuántos <strong>usos clínicos</strong> rinde
                    <strong>1 unidad física</strong> de este producto.<br>
                    <small style="color:#94a3b8;">Ej: 1 frasco de resina = 15 aplicaciones</small>
                </p>
                <input id="swal-ppu" class="swal2-input" type="number" min="1"
                    placeholder="Usos por unidad"
                    value="${item.Porciones_Por_Unidad || 1}">`,
            showCancelButton: true,
            confirmButtonText: 'Guardar configuración',
            confirmButtonColor: '#7c3aed',
            preConfirm: () => {
                const v = parseInt(document.getElementById('swal-ppu').value);
                if (!v || v < 1) return Swal.showValidationMessage('Debe ser un número mayor a 0');
                return v;
            }
        });

        if (value) {
            const res = await window.api.post('/inventario/porciones', {
                id_item: id, porciones_por_unidad: value
            });
            if (res.status === 'Success') {
                Swal.fire('Configurado', res.message, 'success');
                this.cargarInventario();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // MENÚ DE CONSUMO / ASIGNACIÓN
    //   Admin: puede asignar a doctor o registrar salida general
    //   Doctor: solo consume de su pool personal
    // ══════════════════════════════════════════════════════════════════════
    abrirMenuConsumo: async function(id) {
        const item  = this.data.find(i => i.ID_Item === id);
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
        const idRol  = String(sesion.ID_Rol || sesion.id_rol);
        const ppU    = item.Porciones_Por_Unidad || 1;

        if (idRol === '1') {
            // Admin: elige entre asignar o salida general
            let accionElegida = null;

            await Swal.fire({
                title: item.Nombre.toUpperCase(),
                html: `
                    <p style="font-size:12px; color:#64748b; margin-bottom:15px;">
                        Stock: <strong>${item.Cantidad}</strong> unidades
                        ${ppU > 1 ? `&nbsp;·&nbsp; <strong>${ppU} porciones</strong>/unidad` : '&nbsp;·&nbsp; Sin porciones configuradas'}
                    </p>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                        <button id="btn-asignar"
                            style="background:#4f46e5; color:white; border:none; padding:14px; border-radius:12px;
                                   font-weight:800; cursor:pointer; font-size:13px;">
                            <i class="fas fa-user-md"></i>&nbsp; Asignar a Doctor
                        </button>
                        <button id="btn-salida"
                            style="background:#f59e0b; color:white; border:none; padding:14px; border-radius:12px;
                                   font-weight:800; cursor:pointer; font-size:13px;">
                            <i class="fas fa-minus-circle"></i>&nbsp; Registrar Salida General
                        </button>
                    </div>`,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'Cancelar',
                didOpen: () => {
                    document.getElementById('btn-asignar').addEventListener('click', () => {
                        accionElegida = 'asignar'; Swal.close();
                    });
                    document.getElementById('btn-salida').addEventListener('click', () => {
                        accionElegida = 'salida'; Swal.close();
                    });
                }
            });

            if (!accionElegida) return;
            if (accionElegida === 'asignar') return this._flujoAsignarDoctor(item, sesion);
            if (accionElegida === 'salida')  return this.registrarSalida(id);
        } else {
            // Doctor: flujo de consumo de su propio pool
            return this._flujoConsumoDoctor(item, sesion);
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // FLUJO: ADMIN ASIGNA UNIDADES A UN DOCTOR
    // ══════════════════════════════════════════════════════════════════════
    _flujoAsignarDoctor: async function(item, sesion) {
        let doctores = [];
        try {
            // Mismo endpoint que citas.js: filtra por clinica y devuelve roles 1 y 3
            const idCli = item.ID_Clinica || sesion.ID_Clinica || sesion.id_clinica;
            const raw = await window.api.get(`/usuarios/listar-medicos?id_clinica=${idCli}`);
            doctores = Array.isArray(raw) ? raw : [];
        } catch (e) { doctores = []; }

        if (doctores.length === 0) {
            return Swal.fire('Sin doctores', 'No hay medicos activos registrados en esta sede.', 'warning');
        }

        // listar-medicos devuelve: ID_Usuario, Nombres, Apellidos, ID_Rol, Registro_Sanitario
        const opsDoctores = doctores.map(d =>
            `<option value="${d.ID_Usuario}">Dr(a). ${d.Apellidos} ${d.Nombres}</option>`
        ).join('');

        const { value: form } = await Swal.fire({
            title: `Asignar "${item.Nombre}"`,
            html: `
                <div style="text-align:left;">
                    <label style="font-weight:800; color:#475569; font-size:11px; text-transform:uppercase;">Doctor destino</label>
                    <select id="swal-doctor" class="swal2-input" style="margin:5px 0 15px; font-weight:600;">
                        ${opsDoctores}
                    </select>
                    <label style="font-weight:800; color:#475569; font-size:11px; text-transform:uppercase;">Unidades a asignar</label>
                    <input id="swal-unidades" class="swal2-input" type="number" min="1" max="${item.Cantidad}"
                        placeholder="Máx: ${item.Cantidad}" style="margin:5px 0 6px;">
                    <p style="font-size:10px; color:#94a3b8; margin:0 0 12px;">
                        Stock disponible: ${item.Cantidad} uds
                        ${item.Porciones_Por_Unidad > 1 ? ` · ${item.Porciones_Por_Unidad} porciones/ud` : ''}
                    </p>
                    <label style="font-weight:800; color:#475569; font-size:11px; text-transform:uppercase;">Motivo (opcional)</label>
                    <input id="swal-motivo" class="swal2-input" type="text" placeholder="Ej: Guardia del lunes">
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Asignar',
            confirmButtonColor: '#4f46e5',
            preConfirm: () => {
                const doc = document.getElementById('swal-doctor').value;
                const uni = parseInt(document.getElementById('swal-unidades').value);
                if (!doc) return Swal.showValidationMessage('Selecciona un doctor');
                if (!uni || uni < 1 || uni > item.Cantidad)
                    return Swal.showValidationMessage(`Cantidad inválida (máx ${item.Cantidad})`);
                return {
                    id_doctor: doc,
                    unidades:  uni,
                    motivo:    document.getElementById('swal-motivo').value
                };
            }
        });

        if (form) {
            const res = await window.api.post('/inventario/asignar-doctor', {
                id_item:            item.ID_Item,
                id_usuario_destino: form.id_doctor,
                cantidad_unidades:  form.unidades,
                motivo:             form.motivo,
                id_usuario_admin:   sesion.ID_Usuario || sesion.id_usuario
            });
            if (res.status === 'Success') {
                Swal.fire('Asignado ✓', res.message, 'success');
                this.cargarInventario();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // FLUJO: DOCTOR CONSUME DE SU POOL PERSONAL
    // ══════════════════════════════════════════════════════════════════════
    _flujoConsumoDoctor: async function(item, sesion) {
        const idUsuario = sesion.ID_Usuario || sesion.id_usuario;

        // Verificar saldo disponible
        let stockDoctor = { Porciones_Disponibles: 0 };
        try {
            const res   = await window.api.get(`/inventario/stock-doctor/${idUsuario}`);
            const found = (res.data || []).find(x => x.ID_Item === item.ID_Item);
            if (found) stockDoctor = found;
        } catch (e) {}

        if (stockDoctor.Porciones_Disponibles <= 0) {
            return Swal.fire(
                'Sin stock asignado',
                `No tienes porciones asignadas de "${item.Nombre}". Solicita al administrador que te asigne unidades.`,
                'warning'
            );
        }

        const disponible = parseFloat(stockDoctor.Porciones_Disponibles);

        const { value: form } = await Swal.fire({
            title: `Usar "${item.Nombre}"`,
            html: `
                <div style="background:#f0fdf4; border-radius:12px; padding:14px; margin-bottom:16px; text-align:center;">
                    <span style="font-size:11px; color:#166534; font-weight:800; text-transform:uppercase;">Tu stock disponible</span>
                    <div style="font-size:2.2rem; font-weight:900; color:#15803d; line-height:1;">${disponible}</div>
                    <span style="font-size:11px; color:#166534;">porciones</span>
                </div>
                <label style="display:block; text-align:left; font-weight:800; font-size:11px; color:#475569;
                               text-transform:uppercase; margin-bottom:5px;">Porciones usadas</label>
                <input id="swal-porciones" class="swal2-input" type="number"
                    min="0.5" max="${disponible}" step="0.5"
                    placeholder="Ej: 1 · 0.5 · 2">
                <label style="display:block; text-align:left; font-weight:800; font-size:11px; color:#475569;
                               text-transform:uppercase; margin:12px 0 5px;">Paciente o motivo</label>
                <input id="swal-motivo" class="swal2-input" type="text"
                    placeholder="Nombre del paciente o procedimiento">`,
            showCancelButton: true,
            confirmButtonText: 'Registrar uso',
            confirmButtonColor: '#059669',
            preConfirm: () => {
                const p = parseFloat(document.getElementById('swal-porciones').value);
                const m = document.getElementById('swal-motivo').value;
                if (!p || p <= 0)          return Swal.showValidationMessage('Ingresa la cantidad de porciones usadas');
                if (p > disponible)        return Swal.showValidationMessage(`No tienes suficientes (disponible: ${disponible})`);
                return { porciones: p, motivo: m };
            }
        });

        if (form) {
            const res = await window.api.post('/inventario/consumo', {
                id_item:          item.ID_Item,
                porciones_usadas: form.porciones,
                id_usuario:       idUsuario,
                motivo:           form.motivo
            });
            if (res.status === 'Success') {
                await Swal.fire({
                    title: 'Registrado ✓',
                    html: `${res.message}<br>
                           <small style="color:#64748b;">
                               Porciones restantes: <strong>${res.porciones_restantes}</strong>
                           </small>`,
                    icon: 'success'
                });
                // Refrescar panel de stock del doctor
                await this.renderStockDoctor();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // HISTORIAL DE MOVIMIENTOS DE UN ÍTEM (admin)
    // ══════════════════════════════════════════════════════════════════════
    verMovimientos: async function(id) {
        const item = this.data.find(i => i.ID_Item === id);
        let movs   = [];
        try {
            const res = await window.api.get(`/inventario/movimientos/${id}`);
            movs = res.data || [];
        } catch (e) {}

        const badgeColor = {
            ASIGNACION:    '#4f46e5',
            CONSUMO:       '#f59e0b',
            SALIDA_GENERAL:'#ef4444',
            ENTRADA:       '#10b981',
            AJUSTE:        '#64748b'
        };

        const filas = movs.length === 0
            ? `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Sin movimientos registrados</td></tr>`
            : movs.map(m => `
                <tr style="border-bottom:1px solid #f1f5f9; font-size:12px;">
                    <td style="padding:8px 12px; color:#64748b;">${m.Fecha_Movimiento}</td>
                    <td style="padding:8px 12px;">
                        <span style="background:${badgeColor[m.Tipo_Movimiento] || '#64748b'}20;
                                     color:${badgeColor[m.Tipo_Movimiento] || '#64748b'};
                                     padding:2px 8px; border-radius:6px; font-weight:800; font-size:10px;">
                            ${m.Tipo_Movimiento}
                        </span>
                    </td>
                    <td style="padding:8px 12px; font-weight:700;">${m.Nombre_Usuario}</td>
                    <td style="padding:8px 12px; text-align:center; color:#7c3aed;">
                        ${m.Porciones_Cantidad ? parseFloat(m.Porciones_Cantidad).toFixed(1) : m.Cantidad_Unidades || '—'}
                    </td>
                    <td style="padding:8px 12px; color:#475569;">${m.Nombre_Paciente || '—'}</td>
                    <td style="padding:8px 12px; color:#94a3b8; font-size:11px;">${m.Motivo || '—'}</td>
                </tr>`
            ).join('');

        Swal.fire({
            title: `Historial: ${item ? item.Nombre : ''}`,
            width: 900,
            html: `
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f8fafc; font-size:10px; color:#64748b; text-transform:uppercase; font-weight:800;">
                                <th style="padding:8px 12px; text-align:left;">Fecha</th>
                                <th style="padding:8px 12px; text-align:left;">Tipo</th>
                                <th style="padding:8px 12px; text-align:left;">Usuario</th>
                                <th style="padding:8px 12px; text-align:center;">Cant/Porciones</th>
                                <th style="padding:8px 12px; text-align:left;">Paciente</th>
                                <th style="padding:8px 12px; text-align:left;">Motivo</th>
                            </tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>`,
            showConfirmButton: false,
            showCloseButton: true
        });
    },

    // ══════════════════════════════════════════════════════════════════════
    // SALIDA GENERAL (mantiene el flujo original para admin)
    // ══════════════════════════════════════════════════════════════════════
    registrarSalida: async function(id) {
        const item  = this.data.find(i => i.ID_Item === id);
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));

        const { value: formValues } = await Swal.fire({
            title: `Retirar: ${item.Nombre}`,
            html: `
                <p style="font-size:12px; color:#64748b;">Stock actual: <strong>${item.Cantidad}</strong></p>
                <input id="swal-cant"   class="swal2-input" type="number" placeholder="Cantidad">
                <input id="swal-motivo" class="swal2-input" type="text"   placeholder="Motivo / Destino">`,
            showCancelButton: true,
            confirmButtonText: 'Confirmar Salida',
            preConfirm: () => {
                const c = document.getElementById('swal-cant').value;
                const m = document.getElementById('swal-motivo').value;
                if (!c || c <= 0 || c > item.Cantidad)
                    return Swal.showValidationMessage('Cantidad no válida o insuficiente');
                if (!m) return Swal.showValidationMessage('Debe indicar un motivo');
                return { cantidad: c, motivo: m };
            }
        });

        if (formValues) {
            try {
                const res = await window.api.post('/inventario/salida', {
                    id_item:        id,
                    cantidad_salida: formValues.cantidad,
                    motivo:          formValues.motivo,
                    id_usuario:      sesion.ID_Usuario || sesion.id_usuario
                });
                if (res.status === 'Success') {
                    this.cargarInventario();
                    Swal.fire('Movimiento Registrado', `Se descontaron ${formValues.cantidad} unidades.`, 'success');
                }
            } catch (e) {
                Swal.fire('Error', 'Fallo en la comunicación con el servidor', 'error');
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // ELIMINAR CON VALIDACIÓN DE ADMINISTRADOR
    // ══════════════════════════════════════════════════════════════════════
    eliminar: async function(id) {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));

        const { value: password } = await Swal.fire({
            title: 'Confirmar Eliminación',
            text: 'Ingrese la clave de administrador para registrar la baja lógica.',
            input: 'password',
            inputPlaceholder: 'Contraseña de administrador',
            inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
            showCancelButton: true,
            confirmButtonText: 'Autorizar y Eliminar',
            confirmButtonColor: '#ef4444',
            cancelButtonText: 'Cancelar'
        });

        if (password) {
            try {
                const res = await window.api.delete(`/inventario/eliminar/${id}`, {
                    password,
                    id_clinica:      sesion.ID_Clinica   || sesion.id_clinica,
                    id_usuario_admin: sesion.ID_Usuario  || sesion.id_usuario
                });
                if (res.status === 'Success') {
                    Swal.fire({ title: 'Eliminado', text: res.message, icon: 'success', timer: 1500, showConfirmButton: false });
                    await this.cargarInventario();
                } else {
                    Swal.fire('Error de Autorización', res.message, 'error');
                }
            } catch (e) {
                console.error('Error al eliminar:', e);
                Swal.fire('Error', 'No se pudo procesar la baja en el servidor.', 'error');
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // EDICIÓN / REPOSICIÓN
    // ══════════════════════════════════════════════════════════════════════
    abrirEdicion: function(id) {
        const item = this.data.find(i => i.ID_Item === id);
        if (!item) return;

        document.getElementById('modal-titulo').innerText = 'Editar / Reponer';
        document.getElementById('inv-id-edit').value      = item.ID_Item;

        const selectTipo = document.getElementById('inv-tipo');
        selectTipo.value    = item.Tipo;
        selectTipo.disabled = true;

        document.getElementById('inv-nombre').value  = item.Nombre;
        document.getElementById('inv-precio').value  = item.Precio_Unitario;

        const inputCantidad     = document.getElementById('inv-cantidad');
        inputCantidad.value       = 0;
        inputCantidad.placeholder = `Stock actual: ${item.Cantidad} — ¿Cuánto reponer?`;

        document.getElementById('inv-factura').value  = item.Numero_Factura || '';
        document.getElementById('inv-minimo').value   = item.Stock_Minimo || 5;
        if (item.Fecha_Compra) {
            document.getElementById('inv-fecha-compra').value = item.Fecha_Compra.split('T')[0];
        }

        this.abrirModal();
        this.toggleCampos();
    },

    // ══════════════════════════════════════════════════════════════════════
    // ETIQUETA QR (activos fijos)
    // ══════════════════════════════════════════════════════════════════════
    imprimirEtiqueta: function(id) {
        const item         = this.data.find(i => i.ID_Item === id);
        if (!item) return;
        const sesion       = JSON.parse(localStorage.getItem('usuario_sesion'));
        const clinicaNombre = item.Nombre_Clinica || (sesion ? sesion.Nombre_Clinica : 'MEDIC SYSTEM PRO');
        const codigoTexto   = `INV-${String(item.ID_Item).padStart(6, '0')}`;
        const fechaActual   = new Date().toLocaleDateString();

        const urlBase  = window.api.baseURL.replace('/api', '');
        const esLocal  = urlBase.includes('127.0.0.1') || urlBase.includes('localhost');
        const contenidoQR = esLocal
            ? `SISTEMA: MEDIC SYSTEM PRO\nCLINICA: ${clinicaNombre}\nACTIVO: ${item.Nombre}\nCODIGO: ${codigoTexto}\nFECHA: ${fechaActual}\nESTADO: OPERATIVO`
            : `${urlBase}/ficha/${item.ID_Item}\n\nACTIVO: ${item.Nombre}\nID: ${codigoTexto}`;

        const win = window.open('', '_blank', 'width=500,height=600');
        win.document.write(`
            <html>
            <head>
                <title>Etiqueta - ${item.Nombre}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                    body { font-family:'Inter',sans-serif; display:flex; justify-content:center;
                           align-items:center; height:100vh; margin:0; background:#fff; color:#1e293b; }
                    .ticket { width:320px; padding:25px; border:2px solid #0f172a; border-radius:12px;
                               text-align:center; box-sizing:border-box; }
                    .header-brand  { font-size:10px; font-weight:900; text-transform:uppercase;
                                      letter-spacing:2.5px; color:#64748b; margin-bottom:10px; }
                    .hospital-name { font-size:18px; font-weight:800; color:#0f172a; margin:5px 0;
                                      border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9; padding:10px 0; text-transform:uppercase; }
                    .asset-title   { font-size:22px; font-weight:900; margin:15px 0; color:#2563eb;
                                      text-transform:uppercase; min-height:50px; display:flex; align-items:center; justify-content:center; }
                    #qrcode { display:flex; justify-content:center; margin:15px 0; }
                    #qrcode img { width:155px; height:155px; border:1px solid #f1f5f9; padding:8px; border-radius:8px; }
                    .id-badge { background:#0f172a; color:#fff; padding:8px 20px; font-family:'Courier New',monospace;
                                 font-size:18px; font-weight:bold; display:inline-block; border-radius:6px; margin-bottom:10px; }
                    .footer-info { font-size:9px; font-weight:700; color:#94a3b8; border-top:1px dashed #e2e8f0;
                                    padding-top:10px; margin-top:5px; text-transform:uppercase; }
                </style>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            </head>
            <body>
                <div class="ticket">
                    <div class="header-brand">MEDIC SYSTEMS PRO</div>
                    <div class="hospital-name">${clinicaNombre}</div>
                    <div class="asset-title">${item.Nombre}</div>
                    <div id="qrcode"></div>
                    <div class="id-badge">${codigoTexto}</div>
                    <div class="footer-info">ID ACTIVO: ${item.ID_Item} | FECHA: ${fechaActual}</div>
                </div>
                <script>
                    window.onload = function() {
                        try {
                            if (typeof QRCode !== 'undefined') {
                                new QRCode(document.getElementById('qrcode'), {
                                    text: \`${contenidoQR}\`,
                                    width: 155, height: 155,
                                    colorDark: '#0f172a', colorLight: '#ffffff',
                                    correctLevel: QRCode.CorrectLevel.H
                                });
                                setTimeout(() => { window.print(); window.onafterprint = () => window.close(); setTimeout(() => window.close(), 2500); }, 800);
                            } else {
                                const url = 'https://api.qrserver.com/v1/create-qr-code/?size=155x155&data=' + encodeURIComponent(\`${contenidoQR}\`);
                                document.getElementById('qrcode').innerHTML = '<img src="' + url + '">';
                                setTimeout(() => { window.print(); window.close(); }, 1500);
                            }
                        } catch(e) { window.print(); }
                    };
                </script>
            </body>
            </html>`);
        win.document.close();
    },

    // ══════════════════════════════════════════════════════════════════════
    // REPORTE PDF
    // ══════════════════════════════════════════════════════════════════════
    descargarReporte: function() {
        const sesion       = JSON.parse(localStorage.getItem('usuario_sesion'));
        const responsable  = `${sesion.Nombres || sesion.nombres} ${sesion.Apellidos || sesion.apellidos}`.toUpperCase();
        const selectSede   = document.getElementById('inv-filter-sede');
        const sedeText     = selectSede ? selectSede.options[selectSede.selectedIndex].text : 'SEDE ACTUAL';
        const contenidoTabla = document.getElementById('contenedor-tabla-inventario').innerHTML;

        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Reporte Inventario</title>
                <style>
                    body { font-family:'Segoe UI',sans-serif; padding:40px; color:#1e293b; }
                    .rep-header { display:flex; justify-content:space-between; border-bottom:3px solid #1e293b; padding-bottom:20px; margin-bottom:30px; }
                    table { width:100%; border-collapse:collapse; }
                    th { background:#f1f5f9; text-align:left; padding:10px; border:1px solid #e2e8f0; font-size:10px; }
                    td { padding:10px; border:1px solid #e2e8f0; font-size:11px; }
                    .no-print { display:none !important; }
                    .firma-box { border-top:1px solid #000; width:200px; text-align:center; margin-top:50px; padding-top:10px; font-size:10px; }
                </style>
            </head>
            <body>
                <div class="rep-header">
                    <div>
                        <h1 style="margin:0;">MEDIC SYSTEMS PRO</h1>
                        <p style="margin:5px 0; color:#4f46e5; font-weight:bold;">REPORTE DE ${this.tipoActual}</p>
                    </div>
                    <div style="text-align:right; font-size:11px;">
                        <b>Sede:</b> ${sedeText}<br>
                        <b>Fecha:</b> ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}<br>
                        <b>Generado por:</b> ${responsable}
                    </div>
                </div>
                ${contenidoTabla}
                <div style="display:flex; justify-content:space-around; margin-top:50px;">
                    <div class="firma-box">FIRMA RESPONSABLE<br>${responsable}</div>
                    <div class="firma-box">AUDITORÍA / GERENCIA</div>
                </div>
                <script>window.onload = function() { setTimeout(() => window.print(), 700); }</script>
            </body>
            </html>`);
        win.document.close();
    },

    // ══════════════════════════════════════════════════════════════════════
    // HELPERS DE MODAL
    // ══════════════════════════════════════════════════════════════════════
    toggleCampos: function() {
        const tipo = document.getElementById('inv-tipo').value;
        document.getElementById('box-stock-min').style.display  = (tipo === 'PASIVO') ? 'block' : 'none';
        document.getElementById('seccion-activo').style.display = (tipo === 'ACTIVO') ? 'grid'  : 'none';
    },

    abrirModal: function() {
        document.getElementById('modal-inventario-pro').style.display = 'flex';
    },

    cerrarModal: function() {
        document.getElementById('modal-inventario-pro').style.display = 'none';
        document.getElementById('inv-id-edit').value = '';
        document.getElementById('form-registro-inv').reset();
        document.getElementById('inv-tipo').disabled        = false;
        document.getElementById('inv-cantidad').placeholder = '1';
    },

    switchTab: function(tipo, btn) {
        this.tipoActual = tipo;
        document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.remove('active-tab'));
        btn.classList.add('active-tab');
        this.cargarInventario();
    }
};