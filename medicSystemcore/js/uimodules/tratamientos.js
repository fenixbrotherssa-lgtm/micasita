// ==========================================
// MÓDULO: TRATAMIENTOS Y PLANES (Versión Integral)
// ==========================================
let cieSeleccionadoCod = null;
let cieSeleccionadoTexto = null;
window.tratamientosModule = {
   
    init: async function(id) {
        if (!id) return;
        window.router.currentPatientId = id;
        
        // 1. Cargar nombre del paciente en el encabezado
        window.api.getHistoriaClinicaCompleta(id).then(res => {
            const el = document.getElementById('paciente_nombre_tra');
            if (el && res && res.perfil) {
                el.innerText = `Plan de: ${res.perfil.Nombres} ${res.perfil.Apellidos}`;
            }
        });

        // 2. Cargar catálogo de prestaciones
        try {
            const data = await window.api.get('/tratamientos/catalogo');
            window.router.catalogoPrestaciones = Array.isArray(data) ? data : [];
        } catch (e) { 
            console.error("Error cargando catálogo", e); 
            window.router.catalogoPrestaciones = [];
        }
        
        // 3. Renderizar tabla de tratamientos actuales
        this.renderTablaTratamientos(id);
        
        // 4. Renderizar catálogo lateral si existe el contenedor
        if (typeof window.renderCatalogoLateral === 'function') {
            window.renderCatalogoLateral();
        }

        // 5. Cargar presupuestos pendientes
        if (typeof window.cargarHistorialPresupuestos === 'function') {
            window.cargarHistorialPresupuestos(id);
        }
    },

    /**
     * Renderiza la tabla principal de tratamientos del paciente.
     */
    renderTablaTratamientos: function(id) {
        const tbody = document.getElementById('tbodyTratamientos');
        const totalEl = document.getElementById('totalDeudaPaciente');
        if (!tbody) return;

        window.api.get(`/tratamientos/paciente/${id}`).then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">Sin tratamientos registrados</td></tr>';
                if (totalEl) {
                    totalEl.innerText = "Saldo: $0.00";
                    totalEl.style.background = "#dcfce7";
                    totalEl.style.color = "#166534";
                }
                return;
            }
            
            let totalDeuda = 0;
            tbody.innerHTML = data.map(t => {
                const costo = parseFloat(t.Costo_Total || 0);
                const saldo = parseFloat(t.Saldo_Pendiente || 0);
                totalDeuda += saldo;

                // Formateo de caras si existen
                const displayCaras = t.Caras ? `<span style="display:block; font-size:0.7rem; color:#4f46e5; font-weight:bold;">Caras: ${t.Caras}</span>` : '';

                return `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding:12px;">${new Date(t.Fecha_Inicio).toLocaleDateString()}</td>
                        <td style="padding:12px;">
                            <strong style="color:#1e293b;">${t.Nombre_Tratamiento || 'Sin nombre'}</strong><br>
                            <small style="color:#64748b;">Dr. ${t.Nombre_Medico || 'No asignado'}</small>
                        </td>
                        <td style="padding:12px; text-align:center;">
                            <span style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-weight:600; font-size:0.8rem; color:#475569;">
                                ${t.Numero_Diente ? `Pieza ${t.Numero_Diente}` : 'Gral.'}
                            </span>
                            ${displayCaras}
                        </td>
                        <td style="padding:12px; font-weight:500;">$${costo.toFixed(2)}</td>
                        <td style="padding:12px; color:#b91c1c; font-weight:bold;">$${saldo.toFixed(2)}</td>
                        <td style="padding:12px;">
                            <span class="badge-estado estado-${(t.Estado_Tratamiento || 'pendiente').toLowerCase()}">
                                ${t.Estado_Tratamiento}
                            </span>
                        </td>
                        <td style="padding:12px; text-align:center;">
                            <button onclick="window.borrarTratamientoAsignado(${t.ID_Plan})" 
                                    style="background:none; border:none; color:#cbd5e1; cursor:pointer; transition:color 0.2s;" 
                                    onmouseover="this.style.color='#ef4444'" 
                                    onmouseout="this.style.color='#cbd5e1'">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            if (totalEl) {
                totalEl.innerText = `Saldo Total: $${totalDeuda.toFixed(2)}`;
                totalEl.style.background = totalDeuda > 0 ? '#fee2e2' : '#dcfce7';
                totalEl.style.color = totalDeuda > 0 ? '#b91c1c' : '#166534';
            }
        });
    }
};

// ==========================================
// GESTIÓN DE PRESUPUESTOS
// ==========================================

window.cargarHistorialPresupuestos = async function(idPaciente) {
    const contenedor = document.getElementById('lista-presupuestos-paciente');
    if (!contenedor) return;

    try {
        const presupuestos = await window.api.get(`/presupuestos/paciente/${idPaciente}`);
        const pendientes = Array.isArray(presupuestos) ? presupuestos.filter(p => p.Estado === 'PENDIENTE') : [];

        if (pendientes.length === 0) {
            contenedor.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.75rem; margin-top:10px;">Sin presupuestos pendientes.</p>';
            return;
        }

        contenedor.innerHTML = pendientes.map(p => {
            let detalle = [];
            try { detalle = JSON.parse(p.Detalle_JSON || '[]'); } catch(e) { detalle = []; }

            return `
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-size: 0.7rem; font-weight: bold; color: #64748b;">#${p.ID_Presupuesto} - ${new Date(p.Fecha).toLocaleDateString()}</span>
                        <span style="font-size: 0.85rem; font-weight: 800; color: #10b981;">$${parseFloat(p.Total).toFixed(2)}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #1e293b; margin-bottom: 10px; line-height:1.2;">
                        ${detalle.map(item => `${item.nombre} (x${item.cantidad || 1})`).join(', ')}
                    </div>
                    <button onclick="window.aprobarPresupuestoClick(${p.ID_Presupuesto})" 
                            style="width: 100%; background: #4f46e5; color: white; border: none; padding: 7px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: bold; transition: background 0.2s;">
                        APROBAR E INSTALAR EN PLAN
                    </button>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Error cargando presupuestos:", e);
    }
};

window.aprobarPresupuestoClick = async function(id) {
    try {
        const idPaciente = window.router.currentPatientId;
        const presupuestos = await window.api.get(`/presupuestos/paciente/${idPaciente}`);
        const p = presupuestos.find(item => item.ID_Presupuesto === id);
        
        if (!p) return;
        let detalle = [];
        try { detalle = JSON.parse(p.Detalle_JSON || '[]'); } catch(e) { detalle = []; }

        const htmlResumen = `
            <div style="text-align: left; font-size: 0.85rem;">
                <p>Se instalarán los siguientes servicios en el plan oficial:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #e2e8f0;">
                    <thead>
                        <tr style="background: #f8fafc;">
                            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align:left;">Servicio</th>
                            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align:center;">Cant.</th>
                            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align:right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detalle.map(d => `
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.nombre}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align:center;">${d.cantidad || 1}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align:right;">$${parseFloat(d.costo_total).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top:15px; text-align:right; font-weight:800; font-size:1.1rem; color:#10b981;">
                    Total a Confirmar: $${parseFloat(p.Total).toFixed(2)}
                </div>
            </div>
        `;

        const result = await Swal.fire({
            title: `Aprobar Presupuesto #${id}`,
            html: htmlResumen,
            width: '550px',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Confirmar e Instalar',
            cancelButtonText: 'Cerrar'
        });

        if (result.isConfirmed) {
            const res = await window.api.post('/presupuestos/aprobar', { id_presupuesto: id });
            if (res.status === 'Success') {
                Swal.fire({ icon: 'success', title: 'Plan Actualizado', timer: 1500, showConfirmButton: false });
                window.tratamientosModule.init(idPaciente);
            }
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo procesar la aprobación', 'error');
    }
};
window.buscarCIETratamiento = function(termino) {
    const lista = document.getElementById('resultados_cie_tratamiento');
    
    if (!termino || termino.length < 2) {
        lista.style.display = 'none';
        return;
    }

    const terminoBusqueda = termino.toLowerCase();
    
    // Filtramos usando 'window.CATALOGO_CIE10' y las propiedades 'c' y 'd'
    const resultados = window.CATALOGO_CIE10.filter(item => 
        item.c.toLowerCase().includes(terminoBusqueda) || 
        item.d.toLowerCase().includes(terminoBusqueda)
    ).slice(0, 15); // Mostramos hasta 15 resultados

    lista.innerHTML = '';
    
    if (resultados.length > 0) {
        resultados.forEach(item => {
            const div = document.createElement('div');
            div.style = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 0.8rem; color: #334155;';
            div.innerHTML = `<span style="color:#4f46e5; font-weight:800;">${item.c}</span> - ${item.d}`;
            
            div.onmouseover = () => div.style.backgroundColor = '#f8fafc';
            div.onmouseout = () => div.style.backgroundColor = 'transparent';

            div.onclick = () => {
                // Guardamos en las variables globales que declaraste al inicio del archivo
                cieSeleccionadoCod = item.c;
                cieSeleccionadoTexto = item.d;
                
                // Ponemos la descripción en el input y cerramos
                document.getElementById('buscar_cie_tra').value = item.d;
                lista.style.display = 'none';
            };
            lista.appendChild(div);
        });
        lista.style.display = 'block';
    } else {
        lista.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:#94a3b8; text-align:center;">No se encontró el diagnóstico</div>';
        lista.style.display = 'block';
    }
};
// ==========================================
// MODAL DE CARGA POR LOTE (PLANIFICACIÓN) - ACTUALIZADO Y CORREGIDO
// ==========================================
window.modalNuevoTratamiento = async function(itemsPreCargados = []) {
    const idPaciente = window.router.currentPatientId;
    const cat = window.router.catalogoPrestaciones || [];
    let listaLote = [...itemsPreCargados]; 

    let medicos = [];
    try {
        medicos = await window.api.get('/usuarios/listar-medicos');
    } catch(e) {
        console.error("Error cargando médicos", e);
    }

    // --- DATOS DEL PACIENTE: edad (para detectar menor) y contacto de emergencia (prellenar representante) ---
    let perfilPaciente = {};
    try {
        const histo = await window.api.getHistoriaClinicaCompleta(idPaciente);
        if (histo && histo.perfil) perfilPaciente = histo.perfil;
    } catch(e) { console.warn("No se pudo cargar perfil para representante:", e); }

    const calcEdadModal = (fn) => {
        if (!fn) return parseInt(perfilPaciente.Edad) || 0;
        const hoy = new Date(), nac = new Date(fn);
        let a = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) a--;
        return a;
    };
    const edadPaciente   = calcEdadModal(perfilPaciente.Fecha_Nacimiento);
    const esMenorPaciente = edadPaciente > 0 && edadPaciente < 18;
    const repNombrePre    = (perfilPaciente.Contacto_Emergencia_Nombre || '').replace(/"/g, '&quot;');
    const repParentescoPre= (perfilPaciente.Parentesco_Contacto || '').replace(/"/g, '&quot;');

    const estilosOdonto = `
        <style>
            :root {
                --medical-blue: #3b82f6; --medical-red: #ef4444; --medical-green: #10b981;
                --medical-gold: #f59e0b; --medical-purple: #a855f7; --medical-cyan: #22d3ee;
                --border-soft: #cbd5e1;
            }
            .v-tooth-wrapper { text-align: center; width: 48px; position: relative; padding: 2px; transition: all 0.2s; }
            .v-tooth-container { position: relative; width: 42px; height: 42px; margin: 0 auto; }
            .v-tooth-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; opacity: 0.8; }
            .v-tooth-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; background: transparent; display: block; overflow: visible; }
            .v-num { font-size: 10px; font-weight: 800; color: #1e293b; display: block; margin-bottom: 1px; }
            
            /* ESTILOS PARA LA RAIZ EN EL MINI VISOR */
            .v-zona-raiz {
                width: 42px; height: 8px; margin: 0 auto 2px auto; border-radius: 2px;
                background: #f1f5f9; border: 1px dashed #cbd5e1; cursor: pointer;
                transition: all 0.2s; font-size: 6px; color: #94a3b8;
                display: flex; align-items: center; justify-content: center; font-weight: 800;
            }
            .v-zona-raiz:hover { background: #e2e8f0; }
            .v-zona-raiz.caries { background: var(--medical-red); border: none; color: transparent; }
            .v-zona-raiz.fractura { background: var(--medical-red); border: 1px dashed #fff; color: transparent; }
            .v-zona-raiz.endodoncia { background: var(--medical-purple); border: none; color: transparent; }
            .v-zona-raiz.raiz { background: #7c2d12; border: none; color: transparent; }
            
            .v-cara-odo { fill: rgba(255,255,255,0); stroke: var(--border-soft); stroke-width: 1.2; transition: all 0.2s; cursor: pointer; }
            .caries { fill: var(--medical-red) !important; opacity: 0.7; }
            .fractura { fill: var(--medical-red) !important; stroke: #fff; stroke-dasharray: 2; }
            .resina { fill: var(--medical-blue) !important; opacity: 0.7; }
            .carilla_resina { fill: #e0f2fe !important; stroke: var(--medical-blue) !important; stroke-width: 2; }
            .carilla_porcelana { fill: #f0f9ff !important; stroke: var(--medical-cyan) !important; stroke-width: 2.5; }
            .corona { fill: var(--medical-gold) !important; opacity: 0.7; }
            .protesis_fija { fill: var(--medical-green) !important; opacity: 0.7; }
            .endodoncia { fill: var(--medical-purple) !important; opacity: 0.7; }
            .sellante { fill: var(--medical-cyan) !important; opacity: 0.7; }
            .raiz { fill: #7c2d12 !important; }
            .extraer { fill: #000 !important; }
            .periodontitis-total { background: rgba(239, 68, 68, 0.1); border-radius: 5px; }
            .ausente-total { opacity: 0.2; filter: grayscale(1); }
            .ortodoncia-total { outline: 2px dashed #6366f1; border-radius: 4px; }
            .supernumerario-total::after {
                content: "S"; position: absolute; top: -5px; right: -5px; width: 16px; height: 16px;
                background: white; border: 2px solid var(--medical-green); color: var(--medical-green);
                border-radius: 50%; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; z-index: 10;
            }
            .v-tooth-target:hover { background: #f1f5f9; border-radius: 8px; cursor: pointer; }
            .v-tooltip {
                position: fixed; background: #0f172a; color: white; padding: 10px; border-radius: 8px;
                font-size: 11px; z-index: 10000; display: none; pointer-events: none;
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); border: 1px solid #334155;
            }
            /* Ocultar scrollbar en contenedor de firmas */
            .msp-scroll::-webkit-scrollbar { width: 4px; }
            .msp-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        </style>
    `;

    const { value: resultadoLote } = await Swal.fire({
        title: 'Planificar Tratamiento y Consentimiento',
        width: '1300px',
        html: `
            ${estilosOdonto}
            <div id="v-tooltip" class="v-tooltip"></div>
            
            <!-- CONTENEDOR DEL ODONTOGRAMA -->
            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
                <div id="render-visor" style="display: flex; flex-direction: column; gap: 10px; align-items: center;">
                    <div style="display: flex; gap: 5px;">
                        <div id="v-c1" style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px; border-right: 2px solid #cbd5e1; padding-right: 10px; max-width: 450px;"></div>
                        <div id="v-c2" style="display: flex; flex-wrap: wrap; gap: 2px; max-width: 450px;"></div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <div id="v-c4" style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px; border-right: 2px solid #cbd5e1; padding-right: 10px; max-width: 450px;"></div>
                        <div id="v-c3" style="display: flex; flex-wrap: wrap; gap: 2px; max-width: 450px;"></div>
                    </div>
                </div>
            </div>

            <!-- CONTENEDOR FLEX PARA FORMULARIO Y FIRMA LADO A LADO -->
            <div id="bulk-container" style="text-align:left; display: flex; gap: 15px; margin-bottom: 15px;">
                
                <!-- COLUMNA IZQUIERDA: FORMULARIO DE TRATAMIENTO -->
                <div style="flex: 1; background: #ffffff; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div>
                            <label style="font-weight:800; font-size:0.65rem; color:#64748b;">PROCEDIMIENTO:</label>
                            <select id="sw-servicio" class="swal2-select" style="width:100%; margin: 5px 0; font-size:0.85rem;">
                                <option value="">Seleccione servicio...</option>
                                ${cat.map(p => `<option value="${p.ID_Prestacion}" data-nombre="${p.Nombre_Prestacion}" data-precio="${p.Precio_Base}">${p.Nombre_Prestacion}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:800; font-size:0.65rem; color:#64748b;">ODONTÓLOGO:</label>
                            <select id="sw-medico" class="swal2-select" style="width:100%; margin: 5px 0; font-size:0.85rem;">
                                <option value="">Seleccione Médico...</option>
                                ${medicos.map(m => `<option value="${m.ID_Usuario}">Dr. ${m.Apellidos} ${m.Nombres}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="grid-column: span 2; margin-top: 10px;">
                        <label style="font-weight:800; font-size:0.65rem; color:#4f46e5;">DIAGNÓSTICO CIE-10 (Búsqueda):</label>
                        <div style="position: relative;">
                            <input id="buscar_cie_tra" class="swal2-input" 
                                   placeholder="Escriba el diagnóstico para buscar..." 
                                   onkeyup="window.buscarCIETratamiento(this.value)" 
                                   style="width:100%; margin: 5px 0; font-size:0.85rem;" autocomplete="off">
                            
                            <div id="resultados_cie_tratamiento" 
                                 style="position: absolute; z-index: 10000; width: 100%; background: white; 
                                        border: 1px solid #cbd5e1; display: none; max-height: 150px; 
                                        overflow-y: auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-radius: 4px;">
                            </div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 90px 1fr 80px; gap: 10px; align-items: start;">
                        <div>
                            <label style="font-weight:800; font-size:0.65rem; color:#4f46e5;">N° PIEZA:</label>
                            <input id="sw-pieza" type="number" class="swal2-input" style="width:100%; margin: 5px 0; font-weight:900; text-align:center;">
                        </div>
                        <div>
                            <label style="font-weight:800; font-size:0.65rem; color:#64748b;">CARAS A TRATAR:</label>
                            <div id="contenedor-caras" style="display: flex; gap: 4px; margin-top: 5px;">
                                ${['V', 'M', 'D', 'P', 'L', 'O'].map(c => `
                                    <label style="flex:1; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; padding:5px; border-radius:4px; cursor:pointer; font-size:0.7rem; font-weight:bold;">
                                        <input type="checkbox" name="cara-diente" value="${c}"> ${c}
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        <div>
                            <label style="font-weight:800; font-size:0.65rem; color:#64748b;">CANT:</label>
                            <input id="sw-cantidad" type="number" value="1" class="swal2-input" style="width:100%; margin: 5px 0;">
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 140px; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f1f5f9; align-items: end;">
                        <div><label style="font-size:0.65rem; font-weight:800;">PRECIO UNITARIO ($):</label><input id="sw-precio" type="number" class="swal2-input" style="margin:5px 0 0 0; font-size:0.85rem;"></div>
                        <div><label style="font-size:0.65rem; font-weight:800;">DESC. TOTAL ($):</label><input id="sw-desc" type="number" value="0" class="swal2-input" style="margin:5px 0 0 0; font-size:0.85rem;"></div>
                        <button type="button" onclick="window.agregarALote()" style="height:42px; background:#4f46e5; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:800; font-size:0.75rem;">
                            <i class="fas fa-plus-circle"></i> AGREGAR
                        </button>
                    </div>
                </div>

                <!-- COLUMNA DERECHA: FORMULARIO LEGAL MSP-024 COMPLETO -->
                <div style="width: 380px; background: #ffffff; padding: 15px; border-radius: 12px; border: 2px solid #cbd5e1; display: flex; flex-direction: column;">
                    <label style="font-weight:900; font-size:0.75rem; color:#0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 10px;">
                        <i class="fas fa-file-signature"></i> CONSENTIMIENTO INFORMADO (MSP-024)
                    </label>
                    
                    <!-- TEXTO LEGAL -->
                    <div class="msp-scroll" style="font-size: 0.65rem; color: #475569; margin-bottom: 10px; line-height: 1.4; max-height: 70px; overflow-y: auto; background: #f8fafc; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        He facilitado la información completa sobre mis antecedentes. He sido informado de forma clara en qué consiste, los beneficios y posibles riesgos del procedimiento. He escuchado, leído y comprendido la información recibida.
                    </div>

                    <!-- ESPECIALIDAD (autodetectada y editable) -->
                    <label style="font-weight:800; font-size:0.65rem; color:#4f46e5; margin-bottom: 4px; display:block;">
                        <i class="fas fa-tooth"></i> ESPECIALIDAD
                        <span id="esp-auto-tag" style="font-weight:600; color:#10b981; font-size:0.6rem;">(autodetectada)</span>
                    </label>
                    <select id="msp-especialidad" onchange="this.dataset.tocado='1'; document.getElementById('esp-auto-tag').style.display='none'"
                            style="width:100%; padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.72rem; margin-bottom:10px; background:#f8fafc; color:#1e293b; font-family:'Inter';">
                        <option value="Odontología General">Odontología General</option>
                        <option value="Endodoncia">Endodoncia</option>
                        <option value="Ortodoncia y Ortopedia Maxilar">Ortodoncia y Ortopedia Maxilar</option>
                        <option value="Cirugía Oral y Maxilofacial">Cirugía Oral y Maxilofacial</option>
                        <option value="Periodoncia">Periodoncia</option>
                        <option value="Rehabilitación Oral y Prótesis">Rehabilitación Oral y Prótesis</option>
                        <option value="Odontopediatría">Odontopediatría</option>
                        <option value="Estética y Operatoria Dental">Estética y Operatoria Dental</option>
                        <option value="Implantología Oral">Implantología Oral</option>
                        <option value="Patología y Medicina Oral">Patología y Medicina Oral</option>
                        <option value="Radiología Oral y Maxilofacial">Radiología Oral y Maxilofacial</option>
                    </select>

                    <!-- OBSERVACIONES -->
                    <label style="font-weight:800; font-size:0.65rem; color:#4f46e5; margin-bottom: 4px; display:block;">
                        <i class="fas fa-pen"></i> OBSERVACIONES
                    </label>
                    <textarea id="msp-observaciones" rows="2" placeholder="Notas u observaciones del profesional (opcional)..."
                              style="width:100%; padding:7px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.72rem; margin-bottom:10px; resize:vertical; font-family:'Inter'; box-sizing:border-box;"></textarea>
                    
                    <!-- OPCIONES LEGALES (Aceptación, Negativa, Revocatoria) -->
                    <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; background: #f1f5f9; padding: 10px; border-radius: 6px;">
                        <label style="font-size: 0.7rem; font-weight: bold; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="tipo_msp024" value="aceptar" checked style="accent-color: #10b981; transform: scale(1.2);">
                            <span style="color: #047857;">C. Otorgar Consentimiento</span>
                        </label>
                        <label style="font-size: 0.7rem; font-weight: bold; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="tipo_msp024" value="negar" style="accent-color: #ef4444; transform: scale(1.2);">
                            <span style="color: #b91c1c;">D. Negativa de Procedimiento</span>
                        </label>
                        <label style="font-size: 0.7rem; font-weight: bold; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="tipo_msp024" value="revocar" style="accent-color: #f59e0b; transform: scale(1.2);">
                            <span style="color: #b45309;">E. Revocatoria de Consentimiento</span>
                        </label>
                    </div>

                    <!-- REPRESENTANTE LEGAL (menor de edad / no apto) -->
                    <div style="margin-bottom:10px;">
                        <label style="font-size:0.7rem; font-weight:bold; display:flex; align-items:center; gap:8px; cursor:pointer; color:#b45309;">
                            <input type="checkbox" id="chk-no-apto" ${esMenorPaciente ? 'checked disabled' : ''} onchange="window.toggleRepresentante()" style="transform:scale(1.2); accent-color:#f59e0b;">
                            <span>Paciente no apto para firmar (menor / discapacidad)</span>
                        </label>
                        ${esMenorPaciente ? `<div style="font-size:0.62rem; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:5px; padding:5px 8px; margin-top:5px;"><i class="fas fa-exclamation-triangle"></i> Paciente menor de edad (${edadPaciente} años): firma el representante legal.</div>` : ''}
                    </div>

                    <div id="bloque-representante" style="display:${esMenorPaciente ? 'block' : 'none'}; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px; margin-bottom:10px;">
                        <label style="font-weight:800; font-size:0.62rem; color:#b45309; display:block; margin-bottom:5px;"><i class="fas fa-user-shield"></i> DATOS DEL REPRESENTANTE LEGAL</label>
                        <input id="rep-nombre" placeholder="Nombre completo del representante" value="${repNombrePre}" style="width:100%; padding:6px; border:1px solid #fed7aa; border-radius:5px; font-size:0.72rem; margin-bottom:6px; box-sizing:border-box; font-family:'Inter';">
                        <div style="display:flex; gap:6px;">
                            <input id="rep-cedula" placeholder="Cédula" style="width:50%; padding:6px; border:1px solid #fed7aa; border-radius:5px; font-size:0.72rem; box-sizing:border-box; font-family:'Inter';">
                            <input id="rep-parentesco" placeholder="Parentesco" value="${repParentescoPre}" style="width:50%; padding:6px; border:1px solid #fed7aa; border-radius:5px; font-size:0.72rem; box-sizing:border-box; font-family:'Inter';">
                        </div>
                    </div>

                    <!-- ÁREA DE FIRMA -->
                    <label id="lbl-firma" style="font-weight:800; font-size:0.65rem; color:#4f46e5; margin-bottom: 5px;">${esMenorPaciente ? 'FIRMA DEL REPRESENTANTE LEGAL' : 'FIRMA DEL PACIENTE'}</label>
                    <canvas id="canvas-firma" style="border: 1px dashed #94a3b8; border-radius: 8px; width: 100%; height: 110px; cursor: crosshair; background: #f8fafc;"></canvas>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px;">
                        <span style="font-size: 0.65rem; color: #ef4444; cursor: pointer; font-weight: bold; padding: 2px 5px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='transparent'" onclick="if(window.modalFirmaPad) window.modalFirmaPad.clear()">
                            <i class="fas fa-eraser"></i> LIMPIAR FIRMA
                        </span>
                        <span style="font-size: 0.6rem; color: #94a3b8;"><i class="fas fa-exclamation-circle"></i> Firma obligatoria</span>
                    </div>
                </div>

            </div>

            <!-- TABLA DE RESULTADOS -->
            <div style="max-height: 180px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: white;">
                <table style="width:100%; border-collapse: collapse; font-size: 0.8rem;">
                    <thead style="background:#f8fafc; position: sticky; top:0; border-bottom:2px solid #e2e8f0;">
                        <tr>
                            <th style="padding:10px; text-align:left;">Tratamiento / Médico</th>
                            <th style="padding:10px; text-align:center;">Pieza</th>
                            <th style="padding:10px; text-align:right;">Total</th>
                            <th style="padding:10px; text-align:center;"></th>
                        </tr>
                    </thead>
                    <tbody id="lote-body"></tbody>
                </table>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Guardar Planificación y Firma',
        confirmButtonColor: '#10b981',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            if (listaLote.length === 0) {
                Swal.showValidationMessage('Agregue al menos un ítem a la lista de tratamientos.');
                return false;
            }
            
            // ¿Requiere representante? (menor de edad o checkbox no-apto)
            const chkNoApto = document.getElementById('chk-no-apto');
            const requiereRep = !!(chkNoApto && chkNoApto.checked);

            // Recolectar la firma de forma OBLIGATORIA
            if (!window.modalFirmaPad || window.modalFirmaPad.isEmpty()) {
                Swal.showValidationMessage(requiereRep
                    ? 'El MSP-024 requiere la firma obligatoria del representante legal.'
                    : 'El formulario MSP-024 requiere la firma obligatoria del paciente.');
                return false;
            }

            // Validar datos del representante cuando aplica
            let representante = { nombre: '', cedula: '', parentesco: '' };
            if (requiereRep) {
                representante.nombre     = document.getElementById('rep-nombre')?.value?.trim() || '';
                representante.cedula     = document.getElementById('rep-cedula')?.value?.trim() || '';
                representante.parentesco = document.getElementById('rep-parentesco')?.value?.trim() || '';
                if (!representante.nombre || !representante.cedula) {
                    Swal.showValidationMessage('Ingrese al menos nombre y cédula del representante legal.');
                    return false;
                }
            }

            const base64Firma = window.modalFirmaPad.toDataURL('image/png');

            // Extraer el estado legal seleccionado del MSP-024
            const tipoMsp = document.querySelector('input[name="tipo_msp024"]:checked').value;
            const aceptado = tipoMsp === 'aceptar' ? 1 : 0;
            const revocatoria = tipoMsp === 'revocar' ? 1 : 0;

            // Especialidad (autodetectada/editable) y observaciones
            const especialidad = document.getElementById('msp-especialidad')?.value || 'Odontología General';
            const observaciones = document.getElementById('msp-observaciones')?.value?.trim() || '';

            // Retornamos todo estructurado
            return {
                tratamientos: listaLote,
                firma: base64Firma,
                especialidad: especialidad,
                observaciones: observaciones,
                representante: representante,
                requiere_representante: requiereRep ? 1 : 0,
                consentimiento: {
                    aceptado: aceptado,
                    revocatoria: revocatoria
                }
            };
        },
        didOpen: async () => {
            const tooltip = document.getElementById('v-tooltip');
            const pInput = document.getElementById('sw-pieza');

            // --- TOGGLE REPRESENTANTE LEGAL ---
            window.toggleRepresentante = function() {
                const chk = document.getElementById('chk-no-apto');
                const bloque = document.getElementById('bloque-representante');
                const lbl = document.getElementById('lbl-firma');
                const activo = !!(chk && chk.checked);
                if (bloque) bloque.style.display = activo ? 'block' : 'none';
                if (lbl) lbl.innerText = activo ? 'FIRMA DEL REPRESENTANTE LEGAL' : 'FIRMA DEL PACIENTE';
            };

            // --- INICIALIZAR LA FIRMA DE MANERA SEGURA ---
            const canvasFirma = document.getElementById('canvas-firma');
            if (canvasFirma) {
                const ratio = Math.max(window.devicePixelRatio || 1, 1);
                canvasFirma.width = canvasFirma.offsetWidth * ratio;
                canvasFirma.height = canvasFirma.offsetHeight * ratio;
                canvasFirma.getContext("2d").scale(ratio, ratio);

                if (typeof SignaturePad !== 'undefined') {
                    window.modalFirmaPad = new SignaturePad(canvasFirma, {
                        backgroundColor: 'rgba(255, 255, 255, 0)',
                        penColor: 'rgb(15, 23, 42)'
                    });
                } else {
                    console.warn("La librería SignaturePad no está definida.");
                    const ctx = canvasFirma.getContext("2d");
                    ctx.font = "10px Arial"; ctx.fillStyle = "#ef4444";
                    ctx.fillText("Error: Librería SignaturePad no cargada", 10, 20);
                }
            }

            // 1. RENDERIZAR TABLA
            window.renderLoteTable = () => {
                const tbody = document.getElementById('lote-body');
                if (!tbody) return;
                tbody.innerHTML = listaLote.length === 0 
                    ? '<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">No hay ítems en el lote</td></tr>'
                    : listaLote.map((item, index) => `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:8px;">
                                <strong>${item.nombre}</strong><br>
                                <small style="color:#64748b;">${item.nombre_medico}</small>
                                ${item.cie_cod ? `<br><small style="color:#4f46e5; font-weight:700;">Diag: ${item.cie_cod}</small>` : ''}
                            </td>
                            <td style="padding:8px; text-align:center;"><span style="background:#eef2ff; color:#4f46e5; padding:2px 6px; border-radius:4px; font-weight:800;">${item.numero_diente || 'Gral'}</span> ${item.caras ? `<small>(${item.caras})</small>` : ''}</td>
                            <td style="padding:8px; text-align:right; font-weight:800;">$${item.costo_total.toFixed(2)}</td>
                            <td style="padding:8px; text-align:center;"><button onclick="window.quitarDeLote(${index})" style="color:#ef4444; background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button></td>
                        </tr>
                    `).join('');
            };

            // 2. AGREGAR AL LOTE
            window.agregarALote = () => {
                const sel = document.getElementById('sw-servicio');
                const med = document.getElementById('sw-medico');
                const cieInput = document.getElementById('buscar_cie_tra');
                
                if (!sel.value || !med.value) return Swal.showValidationMessage('Complete Servicio y Médico');
                
                const s = sel.options[sel.selectedIndex];
                const pre = parseFloat(document.getElementById('sw-precio').value || 0);
                const cant = parseInt(document.getElementById('sw-cantidad').value || 1);
                const desc = parseFloat(document.getElementById('sw-desc').value || 0);
                const sub = (pre * cant) - desc;

                listaLote.push({
                    id_paciente: idPaciente, 
                    id_prestacion: sel.value, 
                    id_usuario_medico: med.value,
                    nombre_medico: med.options[med.selectedIndex].text, 
                    nombre: s.dataset.nombre,
                    numero_diente: pInput.value || null, 
                    caras: Array.from(document.querySelectorAll('input[name="cara-diente"]:checked')).map(cb => cb.value).join(','),
                    cantidad: cant, 
                    precio_lista: pre, 
                    descuento: desc, 
                    costo_total: sub, 
                    saldo_pendiente: sub,
                    cie_cod: typeof cieSeleccionadoCod !== 'undefined' ? cieSeleccionadoCod : null,
                    cie_texto: typeof cieSeleccionadoTexto !== 'undefined' ? cieSeleccionadoTexto : null
                });

                window.renderLoteTable();

                // AUTODETECTAR ESPECIALIDAD según los procedimientos del lote
                // (solo si el doctor aún no la cambió manualmente)
                window.autoDetectarEspecialidad();

                // LIMPIEZA
                pInput.value = ""; 
                if(cieInput) cieInput.value = "";
                if(typeof cieSeleccionadoCod !== 'undefined') cieSeleccionadoCod = null;
                if(typeof cieSeleccionadoTexto !== 'undefined') cieSeleccionadoTexto = null;
                document.querySelectorAll('input[name="cara-diente"]').forEach(c => c.checked = false);
            };

            window.quitarDeLote = (i) => { listaLote.splice(i, 1); window.renderLoteTable(); };

            // --- AUTODETECCIÓN DE ESPECIALIDAD (espejo de la lógica del backend) ---
            window._mapaEspecialidades = {
                'conducto':'Endodoncia','endodoncia':'Endodoncia','pulp':'Endodoncia','necropulp':'Endodoncia',
                'extraccion':'Cirugía Oral y Maxilofacial','exodoncia':'Cirugía Oral y Maxilofacial',
                'cirugia':'Cirugía Oral y Maxilofacial','cordal':'Cirugía Oral y Maxilofacial',
                'tercer molar':'Cirugía Oral y Maxilofacial','biopsia':'Cirugía Oral y Maxilofacial',
                'ortodoncia':'Ortodoncia y Ortopedia Maxilar','bracket':'Ortodoncia y Ortopedia Maxilar',
                'alineador':'Ortodoncia y Ortopedia Maxilar','ortopedia':'Ortodoncia y Ortopedia Maxilar',
                'periodon':'Periodoncia','curetaje':'Periodoncia','raspado':'Periodoncia','gingiv':'Periodoncia',
                'profilaxis':'Periodoncia','limpieza':'Periodoncia','destartraje':'Periodoncia',
                'corona':'Rehabilitación Oral y Prótesis','perno':'Rehabilitación Oral y Prótesis',
                'protesis':'Rehabilitación Oral y Prótesis','puente':'Rehabilitación Oral y Prótesis',
                'incrustacion':'Rehabilitación Oral y Prótesis',
                'implante':'Implantología Oral','implantolog':'Implantología Oral',
                'carilla':'Estética y Operatoria Dental','blanqueamiento':'Estética y Operatoria Dental',
                'estetica':'Estética y Operatoria Dental','resina':'Estética y Operatoria Dental',
                'restauracion':'Estética y Operatoria Dental','calza':'Estética y Operatoria Dental',
                'sellante':'Estética y Operatoria Dental','obturacion':'Estética y Operatoria Dental',
                'pediatr':'Odontopediatría','pulpotomia':'Odontopediatría',
                'radiograf':'Radiología Oral y Maxilofacial','tomograf':'Radiología Oral y Maxilofacial'
            };
            window.autoDetectarEspecialidad = () => {
                const selectEsp = document.getElementById('msp-especialidad');
                if (!selectEsp || selectEsp.dataset.tocado === '1') return; // respeta cambio manual
                let detectada = 'Odontología General';
                outer:
                for (const t of listaLote) {
                    const n = (t.nombre || '').toLowerCase();
                    for (const key in window._mapaEspecialidades) {
                        if (n.includes(key)) { detectada = window._mapaEspecialidades[key]; break outer; }
                    }
                }
                selectEsp.value = detectada;
                const tag = document.getElementById('esp-auto-tag');
                if (tag) tag.style.display = 'inline';
            };

            document.getElementById('sw-servicio').onchange = (e) => {
                document.getElementById('sw-precio').value = e.target.options[e.target.selectedIndex].dataset.precio;
            };

            // --- CARGAR ODONTOGRAMA ORIGINAL ---
            const res = await window.api.get(`/odontograma/${idPaciente}`);
            if (res && res.status === "Success") {
                const edad = parseInt(res.perfil?.Edad || 20);
                let config = {};

                if (edad < 6) {
                    config = { 'v-c1': [55,54,53,52,51], 'v-c2': [61,62,63,64,65], 'v-c4': [85,84,83,82,81], 'v-c3': [71,72,73,74,75] };
                } else if (edad >= 6 && edad <= 12) {
                    config = { 
                        'v-c1': [18,17,16,15,14,13,12,11, 55,54,53,52,51], 
                        'v-c2': [21,22,23,24,25,26,27,28, 61,62,63,64,65], 
                        'v-c4': [48,47,46,45,44,43,42,41, 85,84,83,82,81], 
                        'v-c3': [31,32,33,34,35,36,37,38, 71,72,73,74,75] 
                    };
                } else {
                    config = { 'v-c1': [18,17,16,15,14,13,12,11], 'v-c2': [21,22,23,24,25,26,27,28], 'v-c4': [48,47,46,45,44,43,42,41], 'v-c3': [31,32,33,34,35,36,37,38] };
                }

                Object.keys(config).forEach(quad => {
                    const container = document.getElementById(quad);
                    if (container) container.innerHTML = config[quad].map(n => `
                        <div class="v-tooth-target v-tooth-wrapper" id="v-unit-${n}" data-n="${n}" onclick="document.getElementById('sw-pieza').value = ${n};">
                            <span class="v-num" style="${n > 50 ? 'color: #4f46e5;' : ''}">${n}</span>
                            <div class="v-zona-raiz" data-cara="Raiz" title="Raíz (R)">R</div>
                            <div class="v-tooth-container">
                                <img src="assets/dientes/${n}.png" class="v-tooth-img" onerror="this.style.display='none'">
                                <svg viewBox="0 0 100 100" class="v-tooth-svg" data-v-svg="${n}">
                                    <polygon points="0,0 100,0 75,25 25,25" class="v-cara-odo" data-cara="Superior"/>
                                    <polygon points="100,0 100,100 75,75 75,25" class="v-cara-odo" data-cara="Derecha"/>
                                    <polygon points="100,100 0,100 25,75 75,75" class="v-cara-odo" data-cara="Inferior"/>
                                    <polygon points="0,0 0,100 25,75 25,25" class="v-cara-odo" data-cara="Izquierda"/>
                                    <rect x="25" y="25" width="50" height="50" class="v-cara-odo" data-cara="Centro"/>
                                </svg>
                            </div>
                        </div>`).join('');
                });

                const mapaEstados = { 
                    'Caries': 'caries', 'Fractura': 'fractura', 'Resina': 'resina', 
                    'Carilla Resina': 'carilla_resina', 'Carilla Porcelana': 'carilla_porcelana', 
                    'Corona': 'corona', 'Protesis Fija': 'protesis_fija', 'Endodoncia': 'endodoncia', 
                    'Sellante': 'sellante', 'Raiz': 'raiz', 'Extraer': 'extraer'
                };

                const mapaCaras = {
                    'Superior': 'Superior', 'Vestibular': 'Superior', 'V': 'Superior',
                    'Inferior': 'Inferior', 'Palatino': 'Inferior', 'Lingual': 'Inferior', 'P': 'Inferior', 'L': 'Inferior',
                    'Derecha': 'Derecha', 'Distal': 'Derecha', 'D': 'Derecha',
                    'Izquierda': 'Izquierda', 'Mesial': 'Izquierda', 'M': 'Izquierda',
                    'Centro': 'Centro', 'Oclusal': 'Centro', 'O': 'Centro'
                };

                res.hallazgos.forEach(h => {
                    const unit = document.getElementById(`v-unit-${h.Numero_Diente}`);
                    const svg = document.querySelector(`[data-v-svg="${h.Numero_Diente}"]`);
                    if (!svg || !unit) return;

                    if (h.Estado === 'Ausente') svg.classList.add('ausente-total');
                    if (h.Estado === 'Ortodoncia') unit.classList.add('ortodoncia-total');
                    if (h.Estado === 'Periodontitis') unit.classList.add('periodontitis-total');
                    if (h.Estado === 'Supernumerario') unit.classList.add('supernumerario-total');

                    const estadoClase = mapaEstados[h.Estado];
                    if (estadoClase) {
                        const esCoberturaTotal = ['Corona', 'Carilla Resina', 'Carilla Porcelana', 'Protesis Fija', 'Extraer', 'Raiz'].includes(h.Estado);
                        
                        if (h.Cara_Diente === 'General' || esCoberturaTotal) {
                            svg.querySelectorAll('.v-cara-odo').forEach(c => c.classList.add(estadoClase));
                        } else if (h.Cara_Diente === 'Raiz') {
                            const vRaiz = unit.querySelector('.v-zona-raiz');
                            if (vRaiz) vRaiz.classList.add(estadoClase);
                        } else {
                            const caraNombre = mapaCaras[h.Cara_Diente] || h.Cara_Diente;
                            const elCara = svg.querySelector(`[data-cara="${caraNombre}"]`);
                            if (elCara) elCara.classList.add(estadoClase);
                        }
                    }
                });

                document.querySelectorAll('.v-tooth-target').forEach(el => {
                    el.onmouseenter = (e) => {
                        const h = res.hallazgos.filter(x => x.Numero_Diente == el.dataset.n);
                        if (h.length > 0) {
                            tooltip.style.display = 'block';
                            tooltip.innerHTML = `<strong>Pieza ${el.dataset.n}</strong><br>` + h.map(i => `• ${i.Cara_Diente}: ${i.Estado}`).join('<br>');
                        }
                    };
                    el.onmousemove = (e) => { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; };
                    el.onmouseleave = () => tooltip.style.display = 'none';
                });
            }
            window.renderLoteTable();
        }
    });

    // --- INTEGRACIÓN DEL GUARDADO FINAL AL BACKEND ---
    if (resultadoLote) {
    try {
        const payload = { 
            tratamientos:              resultadoLote.tratamientos,
            firma_paciente:            resultadoLote.firma,
            especialidad:              resultadoLote.especialidad,
            observaciones:             resultadoLote.observaciones,
            representante:             resultadoLote.representante,
            requiere_representante:    resultadoLote.requiere_representante,
            consentimiento_aceptado:   resultadoLote.consentimiento.aceptado,
            consentimiento_revocatoria: resultadoLote.consentimiento.revocatoria
        };
        
        const resPost = await window.api.post('/tratamientos/asignar-lote', payload);
        
        if (resPost.status === 'Success') {
 
            // ✅ FIX CLAVE: El backend ahora devuelve datos del médico y el ID del consentimiento.
            // Los inyectamos en datosLote para que imprimirMSP024 no tenga que adivinarlos.
            const datosParaImprimir = {
                ...resultadoLote,
                especialidad:  resPost.especialidad  || resultadoLote.especialidad,
                observaciones: resPost.observaciones || resultadoLote.observaciones,
                representante: resPost.representante  || resultadoLote.representante,
                requiere_representante: resPost.requiere_representante ?? resultadoLote.requiere_representante,
                consentimiento: {
                    ...resultadoLote.consentimiento,
                    // Enriquecemos con lo que devuelve el backend
                    ID_Consentimiento: resPost.id_consentimiento,
                    ID_Plan:           resPost.ids_plan?.[0],
                    Hash_Digital:      resPost.hash_digital,
                }
            };
 
            // ✅ FIX: El médico ahora viene del backend con Registro_Sanitario correcto.
            // Lo metemos en el primer tratamiento del lote para que imprimirMSP024 lo encuentre.
            if (resPost.medico && datosParaImprimir.tratamientos?.length > 0) {
                datosParaImprimir.tratamientos[0].Nombre_Medico  = resPost.medico.nombre;
                datosParaImprimir.tratamientos[0].nombre_medico  = resPost.medico.nombre;
                datosParaImprimir.tratamientos[0].Codigo_Medico  = resPost.medico.registro_msp;
                datosParaImprimir.tratamientos[0].medico_codigo  = resPost.medico.registro_msp;
            }
            datosParaImprimir.clinica = resPost.clinica || {};
            Swal.fire({ 
                icon: 'success', 
                title: 'Planificación y MSP-024 Guardados', 
                text: resPost.message,
                timer: 1500, 
                showConfirmButton: false 
            }).then(() => {
                Swal.fire({
                    title: '¿Imprimir Formulario 024?',
                    text: "El consentimiento se guardó correctamente. ¿Desea imprimir el documento físico firmado?",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#4f46e5',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: '<i class="fas fa-print"></i> Sí, Imprimir',
                    cancelButtonText: 'Cerrar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        // ✅ Ahora pasamos datosParaImprimir que ya tiene médico + hash + ID
                        window.imprimirMSP024(datosParaImprimir, idPaciente);
                    }
                });
            });
 
            if (window.tratamientosModule?.init) window.tratamientosModule.init(idPaciente);
            if (window.odontogramaModule?.init)  window.odontogramaModule.init(idPaciente);
 
        } else {
            Swal.fire('Error', resPost.message || 'No se pudo guardar la información', 'error');
        }
    } catch (error) {
        console.error("Error en post:", error);
        Swal.fire('Error de Red', 'No se pudo conectar con el servidor', 'error');
    }
}

};

// --- CATÁLOGO DE PRESTACIONES ---
window.renderCatalogoLateral = async function() {
    const contenedor = document.getElementById('listaCatalogo');
    if (!contenedor) return;

    try {
        const servicios = await window.api.get('/tratamientos/catalogo');
        window.router.catalogoPrestaciones = Array.isArray(servicios) ? servicios : [];

        if (window.router.catalogoPrestaciones.length === 0) {
            contenedor.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.8rem; margin-top:20px;">Catálogo vacío.</p>';
            return;
        }

        contenedor.innerHTML = window.router.catalogoPrestaciones.map(s => `
            <div class="catalogo-card" style="display:flex; justify-content:space-between; align-items:center; background:white; padding:10px; margin-bottom:8px; border-radius:8px; border:1px solid #e2e8f0;">
                <div>
                    <div style="font-weight: bold; color: #1e293b; font-size: 0.85rem;">${s.Nombre_Prestacion}</div>
                    <div style="color: #10b981; font-weight: 800; font-size: 0.8rem;">$${parseFloat(s.Precio_Base).toFixed(2)}</div>
                </div>
                <button onclick="window.borrarPrestacion(${s.ID_Prestacion})" style="background: none; border: none; color: #cbd5e1; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
    } catch (error) {
        console.error("Error al renderizar catálogo lateral", error);
    }
};

window.modalGestionarCatalogo = async function() {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Servicio Médico',
        html: `
            <div style="text-align:left;">
                <label style="font-size:0.8rem; font-weight:bold;">Nombre de la Prestación:</label>
                <input id="cat-nombre" class="swal2-input" placeholder="Ej: Resina Simple" style="width:100%; margin: 5px 0 15px 0;">
                <label style="font-size:0.8rem; font-weight:bold;">Precio Base $:</label>
                <input id="cat-precio" type="number" class="swal2-input" placeholder="0.00" style="width:100%; margin: 5px 0 0 0;">
            </div>
        `,
        confirmButtonText: 'Registrar',
        confirmButtonColor: '#4f46e5',
        showCancelButton: true,
        preConfirm: () => {
            const nombre = document.getElementById('cat-nombre').value;
            const precio = document.getElementById('cat-precio').value;
            if (!nombre || !precio) return Swal.showValidationMessage('Todos los campos son obligatorios');
            return { nombre, precio: parseFloat(precio) };
        }
    });

    if (formValues) {
        window.api.post('/tratamientos/catalogo/nuevo', formValues).then(res => {
            if (res.status === 'Success') {
                Swal.fire({ icon: 'success', title: 'Agregado', timer: 1000, showConfirmButton: false });
                window.renderCatalogoLateral();
            }
        });
    }
};

window.borrarPrestacion = function(id) {
    Swal.fire({
        title: '¿Eliminar del catálogo?',
        text: "Esto no afectará tratamientos ya asignados.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
        if (result.isConfirmed) {
            window.api.delete(`/tratamientos/catalogo/${id}`).then(() => {
                window.renderCatalogoLateral();
            });
        }
    });
};
// ==========================================
// FUNCIÓN: BORRAR TRATAMIENTO ASIGNADO
// ==========================================
window.borrarTratamientoAsignado = function(id) {
    Swal.fire({
        title: '¿Deseas eliminar este procedimiento?',
        text: "Esta acción no se puede deshacer.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444', // Rojo para borrado
        cancelButtonColor: '#6b7280',  // Gris neutro
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        reverseButtons: true // Pone el botón de cancelar a la izquierda
    }).then((result) => {
        if (result.isConfirmed) {
            
            // 1. Llamada al API con manejo de errores robusto
            window.api.delete(`/tratamientos/${id}`)
                .then(res => {
                    // SI EL BORRADO ES EXITOSO (Status 200)
                    Swal.fire({
                        icon: 'success',
                        title: 'Eliminado',
                        text: 'El procedimiento ha sido removido correctamente.',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    
                    // 2. Refrescar la tabla automáticamente
                    if (window.tratamientosModule && typeof window.tratamientosModule.renderTablaTratamientos === 'function') {
                        // Usamos el ID del paciente que ya está guardado en el router
                        window.tratamientosModule.renderTablaTratamientos(window.router.currentPatientId);
                    }
                })
                .catch(err => {
                    // AQUÍ CAPTURAMOS LOS BLOQUEOS (403 Forbidden) O ERRORES (500)
                    // console.error ya registra el stack en el log
                    console.error("❌ Error en el proceso de borrado:", err);
                    
                    Swal.fire({
                        icon: 'warning', // Icono de advertencia para reglas de negocio
                        title: 'Operación denegada',
                        text: err.message || 'No se pudo eliminar el tratamiento por restricciones del sistema.',
                        confirmButtonColor: '#3b82f6', // Azul para confirmación de lectura
                        confirmButtonText: 'Entendido'
                    });
                });
        }
    });
};

// =======================================================================
// FORMULARIO MSP-024 — CONSENTIMIENTO INFORMADO
// Versión final corregida — 3 bugs resueltos:
//   1. Ruta: usa getHistoriaClinicaCompleta (no /pacientes/:id/historia)
//   2. Logo: construye URL absoluta correcta con /uploads/logos/
//   3. Sección C/D/E: lee aceptado/revocatoria en minúsculas (como los manda preConfirm)
// =======================================================================

window.imprimirMSP024 = async function(datosLote, idPaciente) {
    let info = { perfil: {}, historiaMedica: {} };

    // 1. OBTENEMOS LA DATA COMPLETA DEL PACIENTE Y CLÍNICA
    // CORRECCIÓN: usamos getHistoriaClinicaCompleta que ya existe en window.api
    // (la ruta /pacientes/:id/historia daba 404 porque Express resuelve /:id primero)
    try {
        const response = await window.api.getHistoriaClinicaCompleta(idPaciente);
        if (response && response.perfil) info = response;
    } catch(e) {
        console.error("Error al recuperar datos para el formulario MSP-024:", e);
    }

    const p   = info.perfil        || {};
    const hm  = info.historiaMedica || {};
    const cs  = datosLote.consentimiento || {};   // ← Campos de MSP_024_Consentimiento_Informado
    const t0  = (datosLote.tratamientos && datosLote.tratamientos[0]) || {};

    // ── FECHA Y HORA ──────────────────────────────────────────────────────
    // Usamos Fecha_Firma de la BD si existe; si no, la fecha actual
    const fechaFirmaRaw = cs.Fecha_Firma || cs.fecha_firma || null;
    const dtFirma       = fechaFirmaRaw ? new Date(fechaFirmaRaw) : new Date();
    const fechaDoc      = dtFirma.toLocaleDateString('es-EC',  { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaDoc       = dtFirma.toLocaleTimeString('es-EC',  { hour: '2-digit', minute: '2-digit' });
    const fechaImpresion= new Date().toLocaleDateString('es-EC',{ day: '2-digit', month: '2-digit', year: 'numeric' });

    // ── NOMBRES Y APELLIDOS ───────────────────────────────────────────────
    const apellidosArr  = (p.Apellidos || '').trim().split(' ');
    const primerApellido  = apellidosArr[0] || '';
    const segundoApellido = apellidosArr.length > 1 ? apellidosArr.slice(1).join(' ') : '';
    const nombresArr    = (p.Nombres || '').trim().split(' ');
    const primerNombre    = nombresArr[0] || '';
    const segundoNombre   = nombresArr.length > 1 ? nombresArr.slice(1).join(' ') : '';

    // ── CONDICIÓN EDAD ────────────────────────────────────────────────────
    const calcEdad = (fn) => {
        if (!fn) return p.Edad || '';
        const hoy = new Date(), nac = new Date(fn);
        let a = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) a--;
        return a;
    };
    const calcCondicion = (fn) => {
        const a = calcEdad(fn);
        if (!a && a !== 0) return '';
        if (a < 1)   return 'Lactante';
        if (a < 12)  return 'Niño/a';
        if (a < 18)  return 'Adolescente';
        if (a < 65)  return 'Adulto';
        return 'Adulto mayor';
    };
    const edadTexto     = p.Edad ? `${p.Edad} años` : (calcEdad(p.Fecha_Nacimiento) + ' años');
    const condicionTexto= calcCondicion(p.Fecha_Nacimiento);

    // ── PROCEDIMIENTO / DIAGNÓSTICO / MÉDICO ─────────────────────────────
    const diagnostico   = t0.CIE_Texto    || t0.cie_texto    || 'Ver planificación adjunta';
    const cie10         = t0.CIE_Cod      || t0.cie_cod      || 'S/N';
    const procedimientos= (datosLote.tratamientos || []).map(t => t.Nombre_Tratamiento || t.nombre).filter(Boolean).join(', ') || '—';
    const profesional   = t0.Nombre_Medico || t0.medico_nombre || 'ODONTÓLOGO RESPONSABLE';
    const codigoMedico  = t0.Codigo_Medico || t0.medico_codigo || 'MSP-XXXX';
    // Especialidad y observaciones (vienen del backend / del lote)
    const especialidadDoc = datosLote.especialidad || cs.Especialidad || 'Odontología General';
    const observacionesDoc = datosLote.observaciones || cs.Observaciones || '';

    // ── LOGO ──────────────────────────────────────────────────────────────
    // CORRECCIÓN: Logo_Ruta viene solo como nombre de archivo (ej: "clinica-123.png")
    // El servidor sirve los logos desde /uploads/logos/
    const serverBase = window.api?.baseURL
        ? window.api.baseURL.split('/api')[0]
        : window.location.origin;
    const logoUrl = p.Logo_Ruta
        ? (p.Logo_Ruta.startsWith('http')
            ? p.Logo_Ruta
            : `${serverBase}/uploads/logos/${p.Logo_Ruta.replace(/^.*[/\\]/, '')}`)
        : '';
    const cli = datosLote.clinica || {};
    // ── ODONTOGRAMA ───────────────────────────────────────────────────────
    const odontogramaVisual = datosLote.odontogramaSVG
        || '<br><br><em style="color:#94a3b8">(Gráfico o plano de tratamiento adjunto en el expediente físico)</em><br><br>';

    // ── FIRMA DEL PACIENTE ────────────────────────────────────────────────
    // ── REPRESENTANTE LEGAL (menor / no apto) ─────────────────────────────
    const repData = datosLote.representante || {};
    const repNombre     = repData.nombre || cs.Rep_Nombre || '';
    const repCedula     = repData.cedula || cs.Rep_Cedula || '';
    const repParentesco = repData.parentesco || cs.Rep_Parentesco || '';
    const aplicaRepresentante = !!(
        datosLote.requiere_representante == 1 || datosLote.requiere_representante === true ||
        cs.Rep_Nombre || (repData && repData.nombre)
    );

    // La firma capturada pertenece al representante cuando aplica; si no, al paciente.
    const firmaImgHtml = datosLote.firma
        ? `<img src="${datosLote.firma}" style="max-height:55px;object-fit:contain;">`
        : '<div style="height:55px;"></div>';
    // En la fila del paciente: solo se muestra la firma si NO hay representante.
    const firmaPacienteHtml = aplicaRepresentante ? '<div style="height:55px;"></div>' : firmaImgHtml;

    // ── HASH / IDs (trazabilidad) ──────────────────────────────────────────
    const hashDigital = cs.Hash_Digital || cs.hash_digital || '';
    const idConsent   = cs.ID_Consentimiento || cs.id_consentimiento || '';
    const idPlan      = cs.ID_Plan || cs.id_plan || '';

    // ── LÓGICA DE SECCIÓN ACTIVA (C / D / E) ──────────────────────────────
    // CORRECCIÓN CRÍTICA: preConfirm manda aceptado/revocatoria en MINÚSCULAS
    // { consentimiento: { aceptado: 1, revocatoria: 0 } }
    // La versión anterior buscaba cs.Aceptado (mayúscula) → siempre undefined → siempre sección D
    const esAceptado    = (cs.aceptado == 1 || cs.aceptado === true || cs.aceptado === '1'
                       ||  cs.Aceptado == 1 || cs.Aceptado === true || cs.Aceptado === '1');
    const esRevocatoria = (cs.revocatoria == 1 || cs.revocatoria === true
                       ||  cs.Revocatoria == 1 || cs.Revocatoria === true);

    // =======================================================================
    // GENERADOR DE SECCIÓN C / D / E
    // =======================================================================
    const renderSeccion = () => {
        let letraSeccion, titulo, colorFondo, colorTexto, textoPrincipal;

        if (esRevocatoria) {
            letraSeccion  = 'E';
            titulo        = 'REVOCATORIA DEL CONSENTIMIENTO INFORMADO';
            colorFondo    = '#f59e0b';
            colorTexto    = '#fff';
            textoPrincipal= `"De forma libre y voluntaria, revoco el consentimiento realizado en fecha ${fechaDoc} 
            y manifiesto expresamente mi deseo de no continuar con el procedimiento médico que doy por finalizado 
            en esta fecha. Libero de responsabilidades futuras de cualquier índole al establecimiento de salud y 
            al profesional sanitario que me atiende."`;
        } else if (esAceptado) {
            letraSeccion  = 'C';
            titulo        = 'DECLARACIÓN DE CONSENTIMIENTO INFORMADO';
            colorFondo    = '#16a34a';
            colorTexto    = '#fff';
            textoPrincipal= `He facilitado la información completa que conozco, y me ha sido solicitada, sobre los antecedentes 
            personales, familiares y de mi estado de salud. Soy consciente que de omitir estos datos puede afectarse los 
            resultados del tratamiento. Estoy de acuerdo con el procedimiento que se me ha propuesto; he sido informado de las 
            ventajas e inconvenientes del mismo; se me ha explicado de forma clara en qué consiste, los beneficios y posibles 
            riesgos del procedimiento. He escuchado, leído y comprendido la información recibida y se me ha dado la oportunidad 
            de preguntar sobre el procedimiento. He tomado consciente y libremente la decisión de autorizar el procedimiento 
            adicional, si es considerado necesario según el juicio del profesional de la salud, para mi beneficio. También 
            conozco que puedo retirar mi consentimiento cuando lo estime oportuno.`;
        } else {
            letraSeccion  = 'D';
            titulo        = 'NEGATIVA DEL CONSENTIMIENTO INFORMADO';
            colorFondo    = '#dc2626';
            colorTexto    = '#fff';
            textoPrincipal= `Una vez que he entendido claramente el procedimiento propuesto, así como las consecuencias posibles 
            si no se realiza la intervención, no autorizo y me niego a que se me realice el procedimiento propuesto y desvinculo 
            de responsabilidades futuras de cualquier índole al establecimiento de salud y al profesional sanitario que me atiende, 
            por no realizar la intervención sugerida.`;
        }

        // Bloque de representante legal:
        //  - Si APLICA (menor/no apto): se muestra RELLENO con datos + firma, en cualquier sección.
        //  - Si NO aplica pero es D/E: bloque genérico vacío (como el original).
        let bloqueTestigo = '';
        if (aplicaRepresentante) {
            bloqueTestigo = `
            <tr>
                <td colspan="3" class="bg-header" style="text-align:center; padding:5px 8px;">
                    Firma el representante legal (paciente menor de edad o no apto para firmar por sí mismo):
                </td>
            </tr>
            <tr class="text-center" style="vertical-align:bottom;">
                <td style="height:70px; padding-bottom:8px;">
                    <span class="val">${repNombre || ''}</span>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Nombre del representante legal</span>
                </td>
                <td style="padding-bottom:8px;">
                    <span class="val">${repCedula || ''}</span>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Cédula de ciudadanía</span>
                </td>
                <td style="padding-bottom:8px;">
                    ${firmaImgHtml}
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Firma del representante legal</span>
                </td>
            </tr>
            <tr>
                <td class="bg-header" width="20%">Parentesco</td>
                <td colspan="2" class="val">${repParentesco || '—'}</td>
            </tr>`;
        } else if (letraSeccion !== 'C') {
            bloqueTestigo = `
            <tr>
                <td colspan="3" class="bg-header" style="text-align:center; padding:5px 8px;">
                    Si el paciente no está en capacidad para firmar el consentimiento informado:
                </td>
            </tr>
            <tr class="text-center" style="vertical-align:bottom;">
                <td style="height:60px; padding-bottom:8px;">
                    <div style="height:45px;"></div>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Nombre del representante legal</span>
                </td>
                <td style="padding-bottom:8px;">
                    <div style="height:45px;"></div>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Cédula de ciudadanía</span>
                </td>
                <td style="padding-bottom:8px;">
                    <div style="height:45px;"></div>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Firma del representante legal</span>
                </td>
            </tr>
            <tr>
                <td class="bg-header" width="20%">Parentesco</td>
                <td colspan="2"></td>
            </tr>`;
        }

        // Bloque extra de testigo cuando el paciente se niega a firmar (solo sección D)
        const bloqueTestigoNegativa = (letraSeccion === 'D') ? `
            <tr>
                <td colspan="3" class="bg-header" style="text-align:center; padding:5px 8px;">
                    Si el paciente no acepta el procedimiento sugerido y se niega a firmar este acápite:
                </td>
            </tr>
            <tr class="text-center" style="vertical-align:bottom;">
                <td style="height:60px; padding-bottom:8px;">
                    <div style="height:45px;"></div>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Nombre completo del testigo</span>
                </td>
                <td style="padding-bottom:8px;">
                    <div style="height:45px;"></div>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Cédula de ciudadanía</span>
                </td>
                <td style="padding-bottom:8px;">
                    <div style="height:45px;"></div>
                    <hr style="margin:4px 15px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Firma del testigo</span>
                </td>
            </tr>` : '';

        return `
        <table>
            <tr>
                <td colspan="4" class="bg-title"
                    style="background-color:${colorFondo} !important; color:${colorTexto} !important;
                           -webkit-print-color-adjust:exact; print-color-adjust:exact;">
                    ${letraSeccion}. ${titulo}
                </td>
            </tr>
            <tr>
                <td class="bg-header" width="15%">FECHA:</td>
                <td class="val" width="35%">${fechaDoc}</td>
                <td class="bg-header" width="15%">HORA:</td>
                <td class="val" width="35%">${horaDoc}</td>
            </tr>
            <tr>
                <td colspan="4" style="text-align:justify; padding:12px; font-size:11px; line-height:1.6;">
                    ${textoPrincipal}
                </td>
            </tr>
        </table>

        <!-- FIRMAS -->
        <table>
            <tr class="text-center" style="vertical-align:bottom;">
                <td width="33%" style="height:70px; padding-bottom:10px;">
                    <span class="val">${p.Nombres || ''} ${p.Apellidos || ''}</span><br>
                    <hr style="margin:5px 20px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Nombre completo del paciente</span>
                </td>
                <td width="33%" style="padding-bottom:10px;">
                    <span class="val">${p.DNI || ''}</span><br>
                    <hr style="margin:5px 20px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Cédula de ciudadanía</span>
                </td>
                <td width="34%" style="padding-bottom:10px;">
                    ${firmaPacienteHtml}
                    <hr style="margin:5px 20px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Firma del paciente o huella, según el caso</span>
                </td>
            </tr>
            <tr class="text-center" style="vertical-align:bottom;">
                <td colspan="2" style="height:70px; padding-bottom:10px;">
                    <span class="val">${profesional}</span><br>
                    <hr style="margin:5px 20px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Nombre del profesional que realiza el procedimiento</span>
                </td>
                <td style="padding-bottom:10px;">
                    <div style="height:45px; display:flex; align-items:flex-end; justify-content:center;">
                        <span class="val">${codigoMedico}</span>
                    </div>
                    <hr style="margin:5px 20px; border:0; border-top:1px solid #94a3b8;">
                    <span style="font-size:9px; color:#475569;">Firma, sello y código del profesional</span>
                </td>
            </tr>
            ${bloqueTestigo}
            ${bloqueTestigoNegativa}
        </table>`;
    };

    // =======================================================================
    // VENTANA DE IMPRESIÓN
    // =======================================================================
    const ventana = window.open('', '_blank', 'width=970,height=1050');

    ventana.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>MSP-024 — ${p.Nombres || ''} ${p.Apellidos || ''}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Inter', Arial, sans-serif;
            font-size: 11px;
            color: #0f172a;
            padding: 18px 28px;
            line-height: 1.4;
            background: #fff;
        }

        /* ── TABLAS ── */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }
        th, td {
            border: 1px solid #cbd5e1;
            padding: 5px 7px;
            vertical-align: middle;
        }

        /* ── CLASES REUTILIZABLES ── */
        .bg-title {
            background-color: #2563eb;
            color: #fff;
            font-weight: 700;
            font-size: 11.5px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            padding: 7px 10px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .bg-header {
            background-color: #f1f5f9;
            font-weight: 600;
            color: #334155;
            font-size: 10px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .val     { font-weight: 600; color: #0f172a; }
        .tc      { text-align: center; }

        /* ── CABECERA ── */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e2e8f0;
        }
        .header-logo { max-width: 150px; max-height: 65px; object-fit: contain; }
        .header-center { text-align: center; flex: 1; }
        .header-center h2 { font-size: 15px; font-weight: 800; color: #1e293b; }
        .header-center p  { font-size: 10.5px; color: #475569; margin-top: 2px; }
        .header-right { text-align: right; font-size: 12px; font-weight: 700; color: #1e3a5f; white-space: nowrap; }
        .header-right small { display: block; font-size: 9.5px; color: #64748b; font-weight: 400; }

        /* ── ODONTOGRAMA ── */
        .box-grafico {
            padding: 8px;
            text-align: center;
            background: #f8fafc;
            border: 1px dashed #cbd5e1;
            border-radius: 6px;
            min-height: 110px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* ── IMPRESIÓN ── */
        @media print {
            body { padding: 0 10px; }
            .bg-title  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bg-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>

    <!-- ══ ENCABEZADO ═════════════════════════════════════════════════════ -->
    <div class="header">
        <div style="width:22%;">
            ${logoUrl
                ? `<img src="${logoUrl}" class="header-logo" alt="Logo clínica">`
                : `<div style="font-style:italic;color:#94a3b8;font-size:10px;">Sin logo</div>`}
        </div>
        <div class="header-center">
            <h2>${cli.nombre || 'CLÍNICA ODONTOLÓGICA'}</h2>
<p>RUC: ${cli.ruc || '—'} &nbsp;|&nbsp; Tel: ${cli.telefono || '—'}</p>
<p>${cli.direccion || ''} ${cli.ciudad ? '— ' + cli.ciudad : ''}</p>
        </div>
        <div class="header-right">
            FORMULARIO MSP-024
            <small>Consentimiento informado<br>SNS-MSP / HCU-form.024/2016</small>
        </div>
    </div>

    <!-- ══ A. DATOS DEL ESTABLECIMIENTO Y USUARIO ═════════════════════════ -->
    <table>
        <tr><td colspan="4" class="bg-title">A. Datos del establecimiento y usuario</td></tr>
        <tr class="bg-header tc">
            <td width="20%">Institución del sistema</td>
            <td width="30%">Establecimiento de salud</td>
            <td width="25%">N° historia clínica única</td>
            <td width="25%">N° de archivo</td>
        </tr>
        <tr class="tc val">
            <td>PRIVADO</td>
            <td>${cli.nombre || '—'}</td>
            <td>${p.Historial_Clinico_General || (p.ID_Paciente ? 'HC-' + String(p.ID_Paciente).padStart(6, '0') : '—')}</td>
            <td>${p.ID_Paciente || '—'}</td>
        </tr>
    </table>

    <table>
        <tr class="bg-header tc">
            <td width="16%">Primer apellido</td>
            <td width="16%">Segundo apellido</td>
            <td width="16%">Primer nombre</td>
            <td width="16%">Segundo nombre</td>
            <td width="12%">Sexo</td>
            <td width="12%">Edad</td>
            <td width="12%">Condición</td>
        </tr>
        <tr class="tc val">
            <td>${primerApellido}</td>
            <td>${segundoApellido}</td>
            <td>${primerNombre}</td>
            <td>${segundoNombre}</td>
            <td>${p.Genero || '—'}</td>
            <td>${edadTexto}</td>
            <td>${condicionTexto}</td>
        </tr>
    </table>

    <!-- ══ B. CONSENTIMIENTO INFORMADO ════════════════════════════════════ -->
    <table>
        <tr><td colspan="4" class="bg-title">B. Consentimiento informado para:</td></tr>

        <tr>
            <td class="bg-header" width="22%">Servicio / Especialidad:</td>
            <td class="val" width="28%">${(especialidadDoc || 'ODONTOLOGÍA').toUpperCase()}</td>
            <td class="bg-header" width="18%">Tipo de atención:</td>
            <td class="val" width="32%">
                AMBULATORIO &nbsp;<strong>(X)</strong>&nbsp;&nbsp;&nbsp; HOSPITALIZACIÓN &nbsp;(&nbsp;)
            </td>
        </tr>

        <tr>
            <td class="bg-header">Diagnóstico:</td>
            <td colspan="2" class="val">${diagnostico}</td>
            <td class="val">
                <span class="bg-header" style="padding:2px 5px; border-radius:3px;">CIE-10:</span>
                &nbsp;${cie10}
            </td>
        </tr>

        <tr>
            <td class="bg-header">Nombre del procedimiento recomendado:</td>
            <td colspan="3" class="val">${procedimientos}</td>
        </tr>

        <tr>
            <td class="bg-header">Observaciones:</td>
            <td colspan="3" class="val">${observacionesDoc && observacionesDoc.trim() !== '' ? observacionesDoc : '—'}</td>
        </tr>

        <tr>
            <td class="bg-header">En qué consiste:</td>
            <td colspan="3">
                Intervención clínica y/o quirúrgica destinada a restaurar la funcionalidad, salud y estética
                bucodental del paciente según el plan de tratamiento establecido.
            </td>
        </tr>

        <tr>
            <td class="bg-header">Cómo se realiza:</td>
            <td colspan="3">
                Bajo protocolos odontológicos estandarizados, con instrumental esterilizado, y aplicando
                anestesia local en caso de ser requerido por la naturaleza del procedimiento.
            </td>
        </tr>

        <!-- ODONTOGRAMA -->
        <tr>
            <td colspan="4" class="bg-header">
                Gráfico de la intervención (Odontograma renderizado al momento de la planificación):
            </td>
        </tr>
        <tr>
            <td colspan="4">
                <div class="box-grafico">${odontogramaVisual}</div>
            </td>
        </tr>

        <tr>
            <td class="bg-header">Duración estimada de la intervención:</td>
            <td colspan="3">Variable según la complejidad del procedimiento planificado (Aprox. 30 a 90 min).</td>
        </tr>

        <tr>
            <td class="bg-header">Beneficios del procedimiento:</td>
            <td colspan="3">
                Restauración de la salud bucal, alivio del dolor, prevención de infecciones mayores
                y mejora de la función masticatoria y estética.
            </td>
        </tr>

        <tr>
            <td class="bg-header">Riesgos frecuentes (poco graves):</td>
            <td colspan="3">
                Sensibilidad post-operatoria, inflamación local leve, molestias gingivales o dolor
                a la masticación en las primeras 48 a 72 horas.
            </td>
        </tr>

        <tr>
            <td class="bg-header">Riesgos poco frecuentes (graves):</td>
            <td colspan="3">
                Alergias severas a los anestésicos o materiales dentales, hemorragias prolongadas,
                parestesia temporal o daño a estructuras adyacentes.
            </td>
        </tr>

        <!-- RIESGOS ESPECÍFICOS DEL PACIENTE — mapeados desde historiaMedica -->
        <tr>
            <td class="bg-header" style="color:#b91c1c;">
                Riesgos específicos relacionados con el paciente<br>
                <span style="font-weight:400;">(edad, estado de salud, creencias, valores, etc.):</span>
            </td>
            <td colspan="3" class="val">
                • Enfermedades sistémicas: ${hm.Enfermedades_Sistemicas || 'Ninguna reportada'}<br>
                • Alergias confirmadas: ${hm.Alergias || 'Ninguna reportada'}<br>
                • Medicación actual: ${hm.Medicamentos || 'Ninguna reportada'}
            </td>
        </tr>

        <tr>
            <td class="bg-header">Alternativas al procedimiento:</td>
            <td colspan="3">
                Tratamiento conservador, observación clínica periódica o derivación a especialista
                según el criterio del profesional tratante.
            </td>
        </tr>

        <tr>
            <td class="bg-header">Descripción del manejo posterior al procedimiento:</td>
            <td colspan="3">
                Seguir estrictamente la receta médica, dieta blanda si se indica, correcta higiene oral
                y asistir a las citas de control programadas.
            </td>
        </tr>

        <tr>
            <td class="bg-header">Consecuencias posibles si no se realiza el procedimiento:</td>
            <td colspan="3">
                Progresión de la enfermedad dental, dolor crónico, pérdida dental definitiva o
                compromiso sistémico derivado del foco infeccioso bucal no tratado.
            </td>
        </tr>
    </table>

    <!-- ══ C / D / E — SECCIÓN DINÁMICA SEGÚN BD ══════════════════════════ -->
    ${renderSeccion()}

    <!-- ══ PIE DE PÁGINA CON TRAZABILIDAD ════════════════════════════════ -->
    <p style="font-size:8.5px; margin-top:14px; text-align:right; color:#64748b; border-top:1px solid #e2e8f0; padding-top:6px;">
        ID Consentimiento: <strong>${idConsent || '—'}</strong>
        &nbsp;|&nbsp; ID Plan: <strong>${idPlan || '—'}</strong>
        &nbsp;|&nbsp; Documento generado por <strong>Ametra os</strong>
        &nbsp;|&nbsp; Impreso el ${fechaImpresion}
        ${hashDigital ? `<br><span style="font-size:8px; color:#94a3b8;">Hash: ${hashDigital}</span>` : ''}
    </p>

</body>
</html>`);

    ventana.document.close();
    setTimeout(() => ventana.print(), 600);
}