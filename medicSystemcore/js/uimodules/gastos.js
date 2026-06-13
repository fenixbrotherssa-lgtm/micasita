// ==========================================
// MÓDULO: FINANZAS Y GASTOS (DASHBOARD ADMINISTRATIVO)
// ==========================================
window.gastosModule = {
    arqueosActuales: [],
    datosUltimoReporte: null, // Para la impresión

    init: async function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return console.error("No hay sesión activa");
        const sesion = JSON.parse(sesionRaw);

        const idRol = String(sesion.ID_Rol || sesion.id_rol || '0');
        const idClinicaSession = sesion.ID_Clinica || sesion.id_clinica || '';
        const nombreUsuario = sesion.Nombres || sesion.nombres || 'USUARIO';

        // 1. Mostrar nombre de usuario
        const displayUser = document.getElementById('display-usuario-nombre');
        if (displayUser) displayUser.innerText = `USUARIO: ${nombreUsuario.toUpperCase()}`;

        // 2. Cargar selector de sedes
        try {
            const clinicas = await window.api.get('/clinicas/listar');
            const filterSede = document.getElementById('select-sede-finanzas');
            
            if (filterSede && Array.isArray(clinicas)) {
                let options = (idRol === "1") ? '<option value="">TODAS LAS SEDES</option>' : '';
                clinicas.forEach(c => {
                    if (idRol === "1" || c.ID_Clinica == idClinicaSession) {
                        options += `<option value="${c.ID_Clinica}">${c.Nombre_Clinica}</option>`;
                    }
                });
                filterSede.innerHTML = options;
                if (idClinicaSession) filterSede.value = idClinicaSession;
                if (idRol !== "1") filterSede.disabled = true;
            }
        } catch (e) { console.error("Error sedes:", e); }

        // 3. Fechas por defecto (Mes actual)
        const hoy = new Date();
        const fIn = document.getElementById('fecha-inicio-admin');
        const fOut = document.getElementById('fecha-fin-admin');
        if (fIn && !fIn.value) fIn.value = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        if (fOut && !fOut.value) fOut.value = hoy.toISOString().split('T')[0];

        // 4. Carga inicial
        this.cargarReporte(); 
    },

    cambiarSede: function() { this.cargarReporte(); },
    filtrarPorFecha: function() { this.cargarReporte(); },

    cargarReporte: async function() {
        const tbody = document.getElementById('tbody-finanzas');
        const sede = document.getElementById('select-sede-finanzas')?.value || '';
        const fIn = document.getElementById('fecha-inicio-admin')?.value || '';
        const fOut = document.getElementById('fecha-fin-admin')?.value || '';

        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">Cargando Dashboard...</td></tr>`;

        try {
            const data = await window.api.get(`/gastos/reporte-admin?id_clinica=${sede}&fecha_inicio=${fIn}&fecha_fin=${fOut}`);
            this.datosUltimoReporte = data; 
            
            const res = data.resumen || {};
            const desglose = res.desglose || {};
            this.arqueosActuales = data.arqueosDetalle || [];
            
            const f = (n) => `$ ${parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            
            // Actualización de Kpis
            if(document.getElementById('lbl-total-produccion')) document.getElementById('lbl-total-produccion').innerText = f(res.totalProduccion);
            if(document.getElementById('lbl-total-ingresos')) document.getElementById('lbl-total-ingresos').innerText = f(res.totalRecaudado);
            if(document.getElementById('lbl-total-gastos')) document.getElementById('lbl-total-gastos').innerText = f(res.totalGastos);
            
            const totalCartera = (data.pacientesDeudores || []).reduce((acc, curr) => acc + curr.Deuda_Actual, 0);
            if(document.getElementById('lbl-cartera-vencida')) document.getElementById('lbl-cartera-vencida').innerText = f(totalCartera);
            if(document.getElementById('lbl-balance-neto')) document.getElementById('lbl-balance-neto').innerText = f(res.balanceNeto);

            if(document.getElementById('lbl-total-efectivo')) document.getElementById('lbl-total-efectivo').innerText = f(desglose.efectivo);
            if(document.getElementById('lbl-total-bancos')) document.getElementById('lbl-total-bancos').innerText = f(desglose.banco);
            if(document.getElementById('lbl-total-tarjeta')) document.getElementById('lbl-total-tarjeta').innerText = f(desglose.tarjeta);
            
            if(document.getElementById('lbl-pacientes-conteo')) document.getElementById('lbl-pacientes-conteo').innerText = res.pacientesAtendidos || 0;

            this.renderizarResumenArqueos(this.arqueosActuales);
            this.renderizarPacientesDeudores(data.pacientesDeudores || []);

            if (tbody) {
                const movimientosLimpios = (data.movimientos || []).filter(m => m.Origen !== 'ARQUEO');
                if (movimientosLimpios.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:#94a3b8;">No hay movimientos</td></tr>`;
                    return;
                }

                tbody.innerHTML = movimientosLimpios.map(m => {
                    const responsable = (m.Responsable || 'SISTEMA').toString().toUpperCase();
                    const esIngreso = m.Tipo === 'Ingreso' || m.Origen === 'PAGO' || m.Origen === 'PACIENTE';
                    
                    return `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding:15px 25px; font-size:12px; color:#475569;">${new Date(m.Fecha).toLocaleDateString()}</td>
                        <td style="padding:15px 10px;"><span style="background:${esIngreso ? '#dcfce7':'#fee2e2'}; color:${esIngreso ? '#166534':'#991b1b'}; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:800;">${m.Origen}</span></td>
                        <td style="padding:15px 25px;">
                            <div style="font-weight:700; color:#1e293b; font-size:13px;">
                                ${m.Categoria} 
                                ${m.ID_Referencia && (m.Origen.includes('ADMIN')) ? `<i onclick="window.gastosModule.eliminarGasto(${m.ID_Referencia})" class="fas fa-trash" style="color:#ef4444; cursor:pointer; margin-left:10px; font-size:11px;"></i>` : ''}
                            </div>
                            <div style="font-size:10px; line-height:1.4; color:#64748b; margin-top:3px;">${m.Descripcion || '---'}</div>
                        </td>
                        <td style="padding:15px 25px; font-size:12px; font-weight:600; color:#64748b;">${responsable}</td>
                        <td style="padding:15px 25px; text-align:right; font-weight:800; color:${esIngreso ? '#10b981' : '#ef4444'}">
                            ${esIngreso ? '+' : '-'} ${f(m.Monto)}
                        </td>
                        <td style="padding:15px 25px; text-align:center;">
                            ${m.Ruta_Voucher_Img ? 
                                `<button onclick="window.gastosModule.verVoucher('${m.Ruta_Voucher_Img}')" style="background:#f1f5f9; border:1px solid #cbd5e0; border-radius:6px; padding:5px 10px; cursor:pointer;">👁️</button>` : '---'}
                        </td>
                    </tr>`;
                }).join('');
            }
        } catch (err) { 
            console.error("🔴 Error reporte:", err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error de servidor</td></tr>`;
        }
    },

    verVoucher: function(ruta) {
        if (!ruta) {
            Swal.fire('Error', 'No hay un comprobante registrado para este movimiento', 'warning');
            return;
        }

        // 1. Extraemos la base del servidor (quitando el /api) 
        // para apuntar a la raíz donde están los 'uploads'
        const baseArchivos = window.api.baseURL.replace('/api', '').replace(/\/$/, '');

        // 2. Limpiamos la ruta para que no tenga dobles barras si ya viene con una
        const rutaLimpia = ruta.startsWith('/') ? ruta : `/${ruta}`;
        const urlCompleta = `${baseArchivos}${rutaLimpia}`;

        // 3. Mostramos con SweetAlert2
        Swal.fire({ 
            title: 'Comprobante de Movimiento', 
            imageUrl: urlCompleta, 
            imageWidth: 450, 
            confirmButtonColor: '#2d3748',
            confirmButtonText: 'Cerrar',
            // Agregamos un respaldo por si la imagen no carga
            didOpen: () => {
                const img = Swal.getImage();
                img.onerror = () => {
                    img.src = `${baseArchivos}/assets/icon.png`; // Imagen por defecto
                    console.error("Error cargando voucher desde:", urlCompleta);
                };
            }
        });
    },

    imprimirReporteActual: function() {
    if (!this.datosUltimoReporte) return Swal.fire("Atención", "No hay datos para imprimir", "info");
    
    const data = this.datosUltimoReporte;
    const res = data.resumen || {};
    const desglose = res.desglose || { efectivo: 0, banco: 0, tarjeta: 0 };
    const sedeNombre = document.getElementById('select-sede-finanzas')?.options[document.getElementById('select-sede-finanzas').selectedIndex]?.text || 'TODAS LAS SEDES';
    const fIn = document.getElementById('fecha-inicio-admin')?.value;
    const fOut = document.getElementById('fecha-fin-admin')?.value;
    
    const f = (n) => `$ ${parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    const logoUrl = data.clinica?.Ruta_Logo ? `http://localhost:8000${data.clinica.Ruta_Logo}` : '';

    // SEPARACIÓN DE INVENTARIO
    const activos = (data.inventario || []).filter(i => i.Categoria_Inventario === 'ACTIVO');
    const insumos = (data.inventario || []).filter(i => i.Categoria_Inventario !== 'ACTIVO');

    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
        <head>
            <title>Reporte Gerencial - ${sedeNombre}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; line-height: 1.4; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; }
                .header img { max-height: 70px; max-width: 200px; object-fit: contain; }
                .header-info { text-align: right; }
                .header-info h2 { margin: 0; font-size: 1.4rem; font-weight: 800; }
                .header-info p { margin: 2px 0; font-size: 0.85rem; color: #64748b; font-weight: 700; }
                
                .resumen-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
                .card { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; text-align: center; }
                .card span { display: block; font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; }
                .card strong { font-size: 1.1rem; color: #0f172a; }
                .card-dark { background: #1e293b !important; color: white !important; }
                .card-dark * { color: white !important; }

                h3 { font-size: 12px; text-transform: uppercase; border-left: 4px solid #1e293b; padding-left: 10px; margin: 25px 0 10px 0; color: #1e293b; font-weight: 800; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; }
                th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 800; }
                td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
                .monto { font-weight: 700; text-align: right; }
                .badge { padding: 2px 5px; border-radius: 4px; font-weight: 800; font-size: 8px; text-transform: uppercase; }
                
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                @media print { body { padding: 0; } .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                ${logoUrl ? `<img src="${logoUrl}" onerror="this.style.display='none'">` : '<div></div>'}
                <div class="header-info">
                    <h2>REPORTE GERENCIAL CONSOLIDADO</h2>
                    <p>${sedeNombre.toUpperCase()}</p>
                    <p>PERIODO: ${fIn} al ${fOut}</p>
                </div>
            </div>

            <div class="resumen-grid">
                <div class="card"><span>Producción Bruta</span><strong>${f(res.totalProduccion)}</strong></div>
                <div class="card"><span>Recaudación (Caja)</span><strong>${f(res.totalRecaudado)}</strong></div>
                <div class="card"><span>Gastos/Egresos</span><strong>${f(res.totalGastos)}</strong></div>
                <div class="card card-dark"><span>Balance Neto</span><strong>${f(res.balanceNeto)}</strong></div>
            </div>

            <h3>1. Detalle de Movimientos</h3>
            <table>
                <thead><tr><th>Fecha</th><th>Origen</th><th>Descripción</th><th style="text-align:right">Monto</th></tr></thead>
                <tbody>
                    ${data.movimientos.map(m => `
                        <tr>
                            <td>${new Date(m.Fecha).toLocaleDateString()}</td>
                            <td><span class="badge" style="background:${m.Tipo === 'Egreso' ? '#fee2e2':'#dcfce7'}">${m.Origen}</span></td>
                            <td>${m.Categoria} - <small>${m.Descripcion || ''}</small></td>
                            <td class="monto">${f(m.Monto)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>

            <div class="grid-2">
                <div>
                    <h3>2. Arqueos de Caja</h3>
                    <table>
                        <thead><tr><th>Usuario</th><th style="text-align:right">Diferencia</th></tr></thead>
                        <tbody>
                            ${(data.arqueosDetalle || []).map(a => `<tr><td>${a.Nombre_Usuario}</td><td class="monto">${f(a.Diferencia)}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <div>
                    <h3>3. Cartera Pendiente</h3>
                    <table>
                        <thead><tr><th>Paciente</th><th style="text-align:right">Saldo</th></tr></thead>
                        <tbody>
                            ${(data.pacientesDeudores || []).map(d => `<tr><td>${d.Paciente}</td><td class="monto">${f(d.Deuda_Actual)}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="grid-2">
                <div>
                    <h3>4. Activos y Equipos</h3>
                    <table>
                        <thead><tr><th>Descripción</th><th style="text-align:right">Valoración</th></tr></thead>
                        <tbody>
                            ${activos.length ? activos.map(i => `
                                <tr>
                                    <td>${i.Nombre_Producto}</td>
                                    <td class="monto">${f(i.Valor_Inversion)}</td>
                                </tr>`).join('') : '<tr><td colspan="2">No hay activos registrados</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <div>
                    <h3>5. Insumos y Stock Crítico</h3>
                    <table>
                        <thead><tr><th>Insumo</th><th>Stock</th><th style="text-align:right">Estado</th></tr></thead>
                        <tbody>
                            ${insumos.length ? insumos.map(i => {
                                const critico = i.Stock_Actual <= i.Stock_Minimo;
                                return `
                                <tr>
                                    <td>${i.Nombre_Producto}</td>
                                    <td>${i.Stock_Actual}</td>
                                    <td class="monto">
                                        <span class="badge" style="background:${critico ? '#ef4444' : '#f1f5f9'}; color:${critico ? 'white' : '#475569'}">
                                            ${critico ? 'REPOSTER' : 'OK'}
                                        </span>
                                    </td>
                                </tr>`;
                            }).join('') : '<tr><td colspan="3">No hay insumos registrados</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style="margin-top:30px; text-align:center; font-size:8px; color:#94a3b8;">
                Generado por Ametra os - ${new Date().toLocaleString()}
            </div>

            <script>
                window.onload = function() {
                    setTimeout(() => { window.print(); setTimeout(() => window.close(), 500); }, 800);
                }
            </script>
        </body>
        </html>
    `);
    ventana.document.close();
},

    abrirModalRegistro: async function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
        let categorias = [];
        try { categorias = await window.api.get('/gastos/categorias'); } catch (e) { }
        const catOptions = categorias.map(c => `<option value="${c.Nombre_Categoria}">${c.Nombre_Categoria}</option>`).join('');

        const { value: formResult } = await Swal.fire({
            title: 'REGISTRAR MOVIMIENTO',
            width: '650px',
            html: `
                <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px; text-align:left; border:1px solid #e2e8f0;">
                    <span style="font-size:10px; font-weight:bold; color:#64748b;">RESPONSABLE:</span><br>
                    <span style="font-size:12px; font-weight:800; color:#1e293b;"><i class="fas fa-user-circle"></i> ${sesion.Nombres.toUpperCase()}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left;">
                    <div>
                        <label style="font-size:11px; font-weight:bold; color:#4a5568;">TIPO</label>
                        <select id="sw-tipo" class="swal2-input" style="width:100%; margin: 5px 0; font-size:13px;">
                            <option value="Egreso">🔴 EGRESO (GASTO)</option>
                            <option value="Ingreso">🟢 INGRESO MANUAL</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:bold; color:#4a5568;">RUBRO</label>
                        <select id="sw-cat" class="swal2-input" style="width:100%; margin: 5px 0; font-size:13px;">
                            ${catOptions}
                            <option value="VARIOS">VARIOS</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:bold; color:#4a5568;">MÉTODO DE PAGO</label>
                        <select id="sw-metodo" class="swal2-input" style="width:100%; margin: 5px 0; font-size:13px;" 
                                onchange="document.getElementById('div-ref-g').style.display = (this.value=='EFECTIVO' ? 'none' : 'block')">
                            <option value="EFECTIVO">EFECTIVO (CAJA CHICA)</option>
                            <option value="TRANSFERENCIA">TRANSFERENCIA / BANCO</option>
                            <option value="TARJETA">TARJETA DÉBITO/CRÉDITO</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:bold; color:#4a5568;">MONTO ($)</label>
                        <input id="sw-monto" type="number" class="swal2-input" style="width:100%; margin: 5px 0; font-size:13px;" placeholder="0.00">
                    </div>
                </div>
                <div id="div-ref-g" style="display:none; text-align:left; margin-top:10px;">
                    <label style="font-size:11px; font-weight:bold; color:#4a5568;">REFERENCIA / BANCO / N° COMPROBANTE</label>
                    <input id="sw-ref" class="swal2-input" style="width:100%; margin: 5px 0; font-size:13px;" placeholder="Ej: Pichincha Trans 456">
                </div>
                <div style="text-align:left; margin-top:10px;">
                    <label style="font-size:11px; font-weight:bold; color:#4a5568;">MOTIVO / DESCRIPCIÓN</label>
                    <textarea id="sw-desc" class="swal2-textarea" style="width:100%; margin: 5px 0; font-size:13px; height:60px;" placeholder="¿Para qué es este dinero?"></textarea>
                </div>
                <div style="text-align:left; margin-top:10px;">
                    <label style="font-size:11px; font-weight:bold; color:#4a5568;">SUBIR VOUCHER / SOPORTE (OPCIONAL)</label>
                    <input type="file" id="sw-voucher" class="swal2-file" style="width:100%; margin: 5px 0; font-size:12px;" accept="image/*">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'GUARDAR REGISTRO',
            confirmButtonColor: '#10b981',
            preConfirm: () => {
                const monto = document.getElementById('sw-monto').value;
                if (!monto || monto <= 0) return Swal.showValidationMessage('Ingrese un monto válido');
                
                const formData = new FormData();
                formData.append('ID_Clinica', sesion.ID_Clinica || sesion.id_clinica);
                formData.append('ID_Usuario', sesion.ID_Usuario || sesion.id_usuario);
                formData.append('Tipo', document.getElementById('sw-tipo').value);
                formData.append('Categoria', document.getElementById('sw-cat').value);
                formData.append('Metodo_Pago', document.getElementById('sw-metodo').value);
                formData.append('Referencia', document.getElementById('sw-ref').value);
                formData.append('Monto', monto);
                formData.append('Descripcion', document.getElementById('sw-desc').value);
                
                const fileInput = document.getElementById('sw-voucher');
                if (fileInput.files[0]) formData.append('voucher', fileInput.files[0]);
                
                return formData;
            }
        });

        if (formResult) {
            try {
                const response = await fetch('http://localhost:8000/api/gastos/guardar', {
                    method: 'POST',
                    body: formResult
                });
                const res = await response.json();
                if (res.status === "Success") {
                    this.cargarReporte();
                    Swal.fire({ icon: 'success', title: 'Registrado', showConfirmButton: false, timer: 1500 });
                } else { throw new Error(res.message); }
            } catch (e) { 
                console.error(e);
                Swal.fire('Error', 'No se pudo guardar el movimiento', 'error'); 
            }
        }
    },

    gestionarCatalogo: async function() {
        try {
            const categorias = await window.api.get('/gastos/categorias');
            let listaHtml = categorias.map(c => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                    <span style="font-size:13px; font-weight:600; cursor:pointer;" onclick="window.gastosModule.editarRubro(${c.ID_Categoria}, '${c.Nombre_Categoria}')">
                        <i class="fas fa-edit" style="color:#3182ce; margin-right:8px;"></i>${c.Nombre_Categoria}
                    </span>
                    <button onclick="window.gastosModule.borrarRubro(${c.ID_Categoria})" style="border:none; background:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
            `).join('');

            await Swal.fire({
                title: 'GESTIONAR RUBROS', width: '500px',
                html: `
                    <div style="margin-bottom:15px; text-align:right;">
                        <button onclick="window.gastosModule.nuevoRubro()" class="swal2-confirm swal2-styled" style="padding:8px 20px; font-size:12px; background:#3182ce;">+ NUEVO RUBRO</button>
                    </div>
                    <div style="max-height:300px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#f9fafb;">${listaHtml || '<p>Sin rubros</p>'}</div>
                `,
                showConfirmButton: false, showCloseButton: true
            });
        } catch (e) { console.error(e); }
    },

    nuevoRubro: async function() {
        const { value: nombre } = await Swal.fire({ title: 'Nombre del nuevo Rubro', input: 'text', showCancelButton: true });
        if (nombre) {
            try {
                await window.api.post('/gastos/categorias/guardar', { nombre: nombre.toUpperCase() });
                this.gestionarCatalogo(); 
            } catch (e) { }
        }
    },

    editarRubro: async function(id, nombreActual) {
        const { value: nuevoNombre } = await Swal.fire({ 
            title: 'Editar Rubro', 
            input: 'text', 
            inputValue: nombreActual,
            showCancelButton: true 
        });
        if (nuevoNombre && nuevoNombre !== nombreActual) {
            try {
                await window.api.post('/gastos/categorias/guardar', { id: id, nombre: nuevoNombre.toUpperCase() });
                this.gestionarCatalogo();
            } catch (e) { Swal.fire('Error', 'No se pudo actualizar', 'error'); }
        }
    },

    borrarRubro: async function(id) {
        const { isConfirmed } = await Swal.fire({
            title: '¿Desactivar rubro?',
            text: "No aparecerá más en los selectores.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444'
        });
        if (isConfirmed) {
            try {
                await window.api.get(`/gastos/categorias/eliminar/${id}`);
                this.gestionarCatalogo();
            } catch (e) { }
        }
    },

    renderizarResumenArqueos: function(arqueos) {
        const contenedor = document.getElementById('lista-usuarios-caja');
        if (!contenedor) return;
        const f = (n) => `$ ${parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        if (!arqueos || arqueos.length === 0) {
            contenedor.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:10px;">Sin arqueos registrados</div>';
            return;
        }
        contenedor.innerHTML = arqueos.map(a => {
            const dif = parseFloat(a.Diferencia || 0);
            const colorDif = dif < 0 ? '#ef4444' : (dif > 0 ? '#3182ce' : '#10b981');
            return `
            <div style="padding:12px; border-bottom:1px solid #f1f5f9; display:flex; flex-direction:column; gap:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:11px; font-weight:800; color:#1e293b;">👤 ${a.Nombre_Usuario.toUpperCase()}</div>
                    <button onclick="window.gastosModule.imprimirReporte(${a.ID_Caja})" style="border:none; background:#f1f5f9; padding:4px 8px; border-radius:4px; cursor:pointer;"><i class="fas fa-print"></i></button>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:700;">
                    <span style="color:#64748b;">Diferencia:</span>
                    <span style="color:${colorDif}">${dif < 0 ? '⚠️' : '✅'} ${f(dif)}</span>
                </div>
            </div>`;
        }).join('');
    },

    renderizarPacientesDeudores: function(deudores) {
        const contenedor = document.getElementById('tbody-pacientes-deudores');
        if (!contenedor) return;
        const f = (n) => `$ ${parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        if (!deudores || deudores.length === 0) {
            contenedor.innerHTML = '<tr><td style="padding:20px; text-align:center; color:#94a3b8; font-size:11px;">Al día</td></tr>';
            return;
        }
        contenedor.innerHTML = deudores.map(d => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding:12px 15px;">
                    <div style="font-weight:700; font-size:11px; color:#1e293b;">${(d.Paciente || '---').toUpperCase()}</div>
                    <div style="font-weight:800; color:#ef4444; font-size:12px;">${f(d.Deuda_Actual)}</div>
                </td>
            </tr>`).join('');
    },

    eliminarGasto: async function(id) {
        const { value: claveAdmin } = await Swal.fire({
            title: 'Autorización Requerida',
            text: "Ingrese la clave de administrador para eliminar este gasto:",
            input: 'password',
            inputPlaceholder: 'Clave de acceso',
            showCancelButton: true,
            confirmButtonText: 'Autorizar',
            confirmButtonColor: '#1e293b'
        });

        if (claveAdmin) {
            try {
                // Usamos POST igual que en reabrirCaja de tu archivo caja.js
                const res = await window.api.post(`/gastos/eliminar/${id}`, {
                    claveAutorizacion: claveAdmin
                });

                if (res.status === "Success") {
                    await Swal.fire("Éxito", "Gasto eliminado correctamente", "success");
                    this.cargarReporte(); // Refresca la tabla
                } else {
                    Swal.fire("Error", res.message || "No se pudo autorizar", "error");
                }
            } catch (err) {
                Swal.fire("Error", "Fallo de comunicación con el servidor", "error");
            }
        }
    },

     imprimirReporte: function(idCaja) {
        if (!idCaja) return;

        // Base dinámica para recursos (imágenes/iconos) desde el servidor central
        const baseArchivos = window.api.baseURL.replace('/api', '').replace(/\/$/, '');

        // Usamos el puente oficial window.api.get para evitar el error de conexión en red
        window.api.get(`/caja/reporte-cierre/${idCaja}`)
            .then(response => {
                if (!response || response.status !== "OK") {
                    throw new Error(response ? response.message : "Sin respuesta del servidor");
                }
                
                const d = response.datos;

                // El logo se busca siempre en el servidor donde reside la base de datos
                const logoUrl = d.clinica.logo 
                    ? `${baseArchivos}/uploads/logos/${d.clinica.logo}`
                    : `${baseArchivos}/assets/icon.png`;

                const win = window.open('', '_blank');

                win.document.write(`
                    <html>
                    <head>
                        <title>Reporte Arqueo #${d.info.id}</title>
                        <style>
                            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #1e293b; background: white; margin: 0; }
                            .header { text-align: center; margin-bottom: 20px; }
                            .logo-reporte { max-width: 140px; height: auto; margin-bottom: 10px; object-fit: contain; }
                            .banner { background: #1e293b; color: white; padding: 10px; text-align: center; font-weight: bold; margin: 20px 0; border-radius: 4px; letter-spacing: 1px; }
                            .info { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 30px; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: #fcfcfc; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                            th { border-bottom: 2px solid #1e293b; padding: 12px 10px; text-align: right; font-size: 13px; color: #475569; }
                            td { padding: 12px 10px; text-align: right; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                            .text-left { text-align: left; }
                            .bold { font-weight: bold; }
                            .total-row { background: #f8fafc; font-weight: bold; }
                            .footer { margin-top: 80px; display: flex; justify-content: space-around; }
                            .linea { border-top: 1.5px solid #1e293b; width: 220px; text-align: center; font-size: 11px; padding-top: 8px; color: #1e293b; font-weight: bold; }
                            @media print {
                                body { padding: 20px; }
                                .no-print { display: none; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <img src="${logoUrl}" class="logo-reporte" onerror="this.src='${baseArchivos}/assets/icon.png'">
                            <h2 style="margin:0; color: #0f172a;">${d.clinica.nombre}</h2>
                            <p style="margin:5px 0; font-size: 13px;">RUC: ${d.clinica.ruc} | ${d.clinica.direccion}</p>
                        </div>

                        <div class="banner">REPORTE DE ARQUEO Y CIERRE DE CAJA</div>

                        <div class="info">
                            <div>
                                <b>ID ARQUEO:</b> #${d.info.id}<br>
                                <b>RESPONSABLE:</b> ${d.info.responsable}
                            </div>
                            <div style="text-align:right;">
                                <b>FECHA:</b> ${d.info.fecha}<br>
                                <b>ESTADO:</b> <span style="color:#059669; font-weight:bold;">${d.info.estado}</span>
                            </div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th class="text-left">DESCRIPCIÓN</th>
                                    <th>SISTEMA</th>
                                    <th>REAL</th>
                                    <th>DIFERENCIA</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="text-left">Efectivo</td>
                                    <td>$${d.filas.efectivo.sistema}</td>
                                    <td>$${d.filas.efectivo.real}</td>
                                    <td style="color:${d.filas.efectivo.color}; font-weight:bold;">$${d.filas.efectivo.diferencia}</td>
                                </tr>
                                <tr>
                                    <td class="text-left">Transferencias</td>
                                    <td>$${d.filas.transferencia.sistema}</td>
                                    <td>$${d.filas.transferencia.real}</td>
                                    <td style="color:${d.filas.transferencia.color}; font-weight:bold;">$${d.filas.transferencia.diferencia}</td>
                                </tr>
                                <tr>
                                    <td class="text-left">Tarjetas</td>
                                    <td>$${d.filas.tarjeta.sistema}</td>
                                    <td>$${d.filas.tarjeta.real}</td>
                                    <td style="color:${d.filas.tarjeta.color}; font-weight:bold;">$${d.filas.tarjeta.diferencia}</td>
                                </tr>
                                <tr class="total-row">
                                    <td class="text-left">TOTALES GENERALES</td>
                                    <td>$${d.totales.sistema}</td>
                                    <td>$${d.totales.real}</td>
                                    <td style="color:${d.totales.color}">$${d.totales.diferencia}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="footer">
                            <div class="linea">FIRMA RESPONSABLE</div>
                            <div class="linea">REVISADO POR</div>
                        </div>

                        <script>
                            document.close();
                            const finalizar = () => {
                                setTimeout(() => { window.close(); }, 200);
                            };
                            window.onafterprint = finalizar;
                            setTimeout(() => {
                                window.print();
                                window.onfocus = finalizar;
                            }, 500);
                        </script>
                    </body>
                    </html>
                `);
            })
            .catch(err => {
                console.error("Error al generar reporte de gastos:", err);
                alert("No se pudo obtener la información desde el servidor central.");
            });

    }, // <-- ESTA COMA ES VITAL PARA PODER AÑADIR OTRA FUNCIÓN ABAJO

   // ==========================================
    // 5. LÓGICA DE CIERRE FINANCIERO (ACTUALIZADO)
    // ==========================================
    ejecutarCierre: async function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return;
        const sesion = JSON.parse(sesionRaw);

        const sede = document.getElementById('select-sede-finanzas')?.value;
        const fIn = document.getElementById('fecha-inicio-admin')?.value;
        const fOut = document.getElementById('fecha-fin-admin')?.value;
        
        // 1. CAPTURA DE TOTALES DESDE LA INTERFAZ
        const totalIngresosStr = document.getElementById('lbl-total-ingresos')?.innerText || "$ 0.00";
        const totalEgresosStr = document.getElementById('lbl-total-gastos')?.innerText || "$ 0.00";
        const balanceNetoStr = document.getElementById('lbl-balance-neto')?.innerText || "$ 0.00";
        
        // 2. CAPTURA DEL DESGLOSE PARA EL MODAL
        const efecStr = document.getElementById('lbl-total-efectivo')?.innerText || "$ 0.00";
        const transStr = document.getElementById('lbl-total-bancos')?.innerText || "$ 0.00";
        const tarjStr = document.getElementById('lbl-total-tarjeta')?.innerText || "$ 0.00";
        const pacientesAtendidos = document.getElementById('lbl-pacientes-conteo')?.innerText || "0";

        // Validaciones de UI
        if (!sede || sede === "" || sede === "null" || sede === "0") {
            return Swal.fire("Atención", "Seleccione una sede específica para realizar el cierre financiero.", "warning");
        }

        if (!fIn || !fOut) {
            return Swal.fire("Atención", "Debe definir un rango de fechas (Inicio y Fin) para el cierre.", "warning");
        }

        const { value: comentarios, isConfirmed } = await Swal.fire({
            title: 'Confirmar Cierre Financiero',
            width: '550px',
            html: `
                <div style="text-align:left; font-size:14px; background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #e2e8f0; color: #1e293b;">
                    <p style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #cbd5e1;">
                        <i class="fas fa-calendar-alt"></i> <b>Periodo:</b> <span style="float:right;">${fIn} al ${fOut}</span>
                    </p>
                    
                    <p style="color:#059669; margin-bottom:5px; font-size:15px;">
                        <b>(+) Total Recaudado:</b> <span style="float:right;">${totalIngresosStr}</span>
                    </p>
                    
                    <div style="background:#ffffff; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #f1f5f9; font-size:12px; color:#64748b;">
                        <div style="margin-bottom:3px;">• Efectivo: <span style="float:right;">${efecStr}</span></div>
                        <div style="margin-bottom:3px;">• Bancos/Transf: <span style="float:right;">${transStr}</span></div>
                        <div style="margin-bottom:3px;">• Tarjetas: <span style="float:right;">${tarjStr}</span></div>
                        <div style="margin-top:5px; border-top:1px solid #f1f5f9; padding-top:5px;">• Pacientes Atendidos: <span style="float:right;">${pacientesAtendidos}</span></div>
                    </div>

                    <p style="color:#ef4444; margin-bottom:12px; font-size:15px;">
                        <b>(-) Total Gastos:</b> <span style="float:right;">${totalEgresosStr}</span>
                    </p>

                    <p style="font-weight:800; padding-top:10px; border-top:2px dashed #cbd5e1; margin-top:5px; color:#0f172a; font-size:17px;">
                        <b>(=) DISPONIBLE NETO:</b> <span style="float:right;">${balanceNetoStr}</span>
                    </p>
                </div>
                <div style="margin-top:15px; padding:10px; background:#fff1f2; border-radius:8px; border:1px solid #ffe4e6;">
                    <p style="font-size:11px; color:#be123c; margin:0; line-height:1.4; text-align:center;">
                        <i class="fas fa-shield-alt"></i> <b>VALIDACIÓN ACTIVA:</b> El sistema verificará que no existan turnos de caja abiertos antes de proceder.
                    </p>
                </div>
            `,
            input: 'textarea',
            inputPlaceholder: 'Observaciones del cierre...',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check-circle"></i> EJECUTAR CIERRE',
            confirmButtonColor: '#10b981',
            cancelButtonText: 'Cancelar',
            reverseButtons: true
        });

        if (isConfirmed) {
            try {
                Swal.fire({
                    title: 'Validando y procesando...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                const res = await window.api.post('/gastos/ejecutar-cierre', {
                    desde: fIn, 
                    hasta: fOut, 
                    id_clinica: parseInt(sede),
                    id_usuario: sesion.ID_Usuario || sesion.id_usuario,
                    comentarios: comentarios || 'Cierre manual desde panel administrativo'
                });

                if (res.status === "Success") {
                    await Swal.fire({
                        title: "¡Cierre Completado!",
                        text: `El periodo ha sido sellado correctamente.`,
                        icon: "success",
                        showCancelButton: true,
                        confirmButtonText: '<i class="fas fa-print"></i> Imprimir Ticket',
                        cancelButtonText: 'Cerrar',
                        confirmButtonColor: "#0f172a"
                    }).then((result) => {
                        if (result.isConfirmed && res.id_cierre) {
                            window.gastosModule.imprimirTicketCierre(res.id_cierre);
                        }
                    });

                    // Refrescar vistas del dashboard
                    if (typeof this.cargarReporte === 'function') this.cargarReporte(); 
                    if (typeof this.cargarHistorialCierres === 'function') this.cargarHistorialCierres(); 

                } else {
                    // Aquí se captura el error de "Cajas Abiertas" enviado por el controlador
                    Swal.fire("Cierre Bloqueado", res.message || "No se pudo completar el cierre.", "error");
                }
            } catch (err) {
                console.error("Error conexión cierre:", err);
                // Si el controlador devuelve 400, entra por aquí dependiendo de cómo esté configurada tu window.api
                const msg = err.response?.data?.message || "El servidor detectó un error o hay cajas abiertas.";
                Swal.fire("Atención", msg, "warning");
            }
        }
    },

    // ==========================================
    // 6. FUNCIÓN DE IMPRESIÓN (TICKET TÉRMICO)
    // ==========================================
    imprimirTicketCierre: async function(idCierre) {
        if (!idCierre) return;
        try {
            // Usamos window.api.get para asegurar que la petición vaya al servidor configurado
            const cierre = await window.api.get(`/gastos/detalle-cierre/${idCierre}`);

            // Definimos la base para recursos (si llegaras a necesitar el logo en el ticket)
            const baseArchivos = window.api.baseURL.replace('/api', '').replace(/\/$/, '');

            const ventana = window.open('', '_blank', 'width=400,height=600');
            ventana.document.write(`
                <html>
                <head>
                    <title>Ticket de Cierre #${idCierre}</title>
                    <style>
                        body { 
                            font-family: 'Courier New', Courier, monospace; 
                            width: 80mm; 
                            margin: 0; 
                            padding: 10px; 
                            font-size: 12px; 
                            color: #000;
                        }
                        .text-center { text-align: center; }
                        .bold { font-weight: bold; }
                        .divider { border-top: 1px dashed #000; margin: 10px 0; }
                        .item { display: flex; justify-content: space-between; margin: 3px 0; }
                        .total-box { margin-top: 10px; padding: 5px; border: 1px solid #000; font-size: 14px; }
                        @media print { 
                            .no-print { display: none; } 
                            body { padding: 5px; }
                        }
                    </style>
                </head>
                <body>
                    <div class="no-print" style="text-align:center; padding: 10px;">
                        <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">IMPRIMIR TICKET</button>
                        <hr>
                    </div>
                    
                    <div class="text-center header">
                        <span class="bold" style="font-size:16px;">${cierre.Nombre_Clinica}</span><br>
                        <span>${cierre.Direccion_Clinica || ''}</span><br>
                        <span class="bold">CIERRE DE CAJA #00${idCierre}</span>
                    </div>

                    <div class="divider"></div>
                    
                    <div class="item"><span>FECHA:</span> <span>${new Date(cierre.Fecha_Cierre).toLocaleDateString()}</span></div>
                    <div class="item"><span>USUARIO:</span> <span>${cierre.Nombre_Usuario}</span></div>
                    
                    <div class="divider"></div>
                    
                    <div class="item"><span>DESDE:</span> <span>${cierre.Periodo_Desde}</span></div>
                    <div class="item"><span>HASTA:</span> <span>${cierre.Periodo_Hasta}</span></div>
                    
                    <div class="divider"></div>
                    
                    <div class="item"><span>(+) EFECTIVO:</span> <span>$${parseFloat(cierre.Efectivo_Real || 0).toFixed(2)}</span></div>
                    <div class="item"><span>(+) TRANSFER:</span> <span>$${parseFloat(cierre.Transferencia_Real || 0).toFixed(2)}</span></div>
                    <div class="item"><span>(+) TARJETAS:</span> <span>$${parseFloat(cierre.Tarjeta_Real || 0).toFixed(2)}</span></div>
                    <div class="item"><span>(-) GASTOS:</span> <span>$${parseFloat(cierre.Total_Gastos || 0).toFixed(2)}</span></div>
                    
                    <div class="total-box">
                        <div class="item bold">
                            <span>NETO CAJA:</span> 
                            <span>$${(parseFloat(cierre.Total_Ingresos) - parseFloat(cierre.Total_Gastos)).toFixed(2)}</span>
                        </div>
                    </div>

                    <div style="margin-top:10px;">
                        <span class="bold">OBS:</span> <span style="font-size: 11px;">${cierre.Comentarios || 'SIN OBSERVACIONES'}</span>
                    </div>

                    <div class="text-center" style="margin-top:40px;">
                        <span>_______________________</span><br>
                        <span class="bold">FIRMA RESPONSABLE</span>
                    </div>

                    <div class="text-center" style="margin-top:20px; font-size: 10px;">
                        <span>Generado por Medic System Core</span>
                    </div>

                    <script>
                        document.close();
                        
                        const finalizar = () => {
                            setTimeout(() => { window.close(); }, 300);
                        };

                        window.onafterprint = finalizar;

                        // Auto-activar impresión
                        setTimeout(() => {
                            window.print();
                            // Red de seguridad: si cancela la impresión, cerramos al recuperar el foco
                            window.onfocus = finalizar;
                        }, 500);
                    </script>
                </body>
                </html>
            `);
        } catch (error) {
            console.error("Error en impresión de ticket:", error);
            Swal.fire("Error", "No se pudo conectar con el servidor para obtener el detalle del cierre.", "error");
        }
    },

    // ==========================================
    // 7. CARGAR HISTORIAL DE CIERRES
    // ==========================================
    cargarHistorialCierres: async function() {
        const sede = document.getElementById('select-sede-finanzas')?.value;
        if (!sede || sede === "0") return;

        try {
            const res = await window.api.get(`/gastos/historial-cierres?id_clinica=${sede}`);
            const cierres = Array.isArray(res) ? res : [];
            const tbody = document.getElementById('tbody-historial-cierres');
            if (!tbody) return;

            if (cierres.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">No hay cierres registrados en esta sede.</td></tr>`;
                return;
            }

            tbody.innerHTML = cierres.map(c => {
                const fecha = c.Fecha_Cierre ? new Date(c.Fecha_Cierre).toLocaleDateString() : 'N/A';
                return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding:12px 15px; font-weight:700;">#00${c.ID_Cierre}</td>
                    <td style="padding:12px 15px;">${fecha}</td>
                    <td style="padding:12px 15px;"><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-size:11px;">${c.Periodo_Desde} al ${c.Periodo_Hasta}</span></td>
                    <td style="padding:12px 15px; color:#059669; font-weight:700;">$${parseFloat(c.Total_Ingresos || 0).toFixed(2)}</td>
                    <td style="padding:12px 15px; color:#dc2626;">$${parseFloat(c.Total_Gastos || 0).toFixed(2)}</td>
                    <td style="padding:12px 15px; font-weight:800; background:#f8fafc;">$${(parseFloat(c.Total_Ingresos || 0) - parseFloat(c.Total_Gastos || 0)).toFixed(2)}</td>
                    <td style="padding:12px 15px; text-align:center;">
                        <button onclick="window.gastosModule.imprimirTicketCierre(${c.ID_Cierre})" 
                                style="background:#1e293b; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px;">
                            <i class="fas fa-print"></i> REIMPRIMIR
                        </button>
                    </td>
                </tr>`;
            }).join('');
        } catch (error) {
            console.error("❌ Error al cargar historial:", error);
        }
    }
}; 

