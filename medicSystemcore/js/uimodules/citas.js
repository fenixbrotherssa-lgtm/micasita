// ==========================================
// MÓDULO: GESTIÓN DE CITAS (TIMELINE + KANBAN COMPACTO)
// ==========================================
window.citasModule = {
    doctoresActuales: [], 
    citasActuales: [],    

    init: async function() {
        console.log("📅 Inicializando Agenda Dual (Timeline + Kanban)...");
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return;
        
        const sesion = JSON.parse(sesionRaw);
        const idRol = String(sesion.ID_Rol || sesion.id_rol || '0');
        const idClinicaSesion = parseInt(sesion.ID_Clinica || sesion.id_clinica);

        const hoy = new Date().toISOString().split('T')[0];
        if (document.getElementById('filtro-fecha-desde')) document.getElementById('filtro-fecha-desde').value = hoy;
        if (document.getElementById('filtro-fecha-hasta')) document.getElementById('filtro-fecha-hasta').value = hoy;

        await this.configurarSelectorSedes(idRol, idClinicaSesion);
        this.generarSelectorHoras();

        await this.cargarSelectores();
        await this.cargarDatos();

        const formCita = document.getElementById('form-cita');
        if (formCita) formCita.onsubmit = (e) => this.guardarCita(e);
        
        const selectorSede = document.getElementById('select-sede-agenda');
        if (selectorSede) selectorSede.onchange = (e) => {
            this.cargarSelectores().then(() => this.cargarDatos());
        };
    },

    // --- MANEJO DE TABS ---
    switchTab: function(view, btnElement) {
        document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        btnElement.classList.add('active');
        document.getElementById(`view-${view}`).classList.add('active');
    },

    // --- CARGA DE DATOS MAESTRA ---
    cargarDatos: async function() {
        const idClinica = document.getElementById('select-sede-agenda')?.value;
        if (!idClinica) return;

        const desde = document.getElementById('filtro-fecha-desde')?.value;
        const hasta = document.getElementById('filtro-fecha-hasta')?.value;
        const esHoy = (desde === new Date().toISOString().split('T')[0] && hasta === desde);

        try {
            let url = esHoy ? `/citas/hoy/${idClinica}` : `/citas/listar/${idClinica}?desde=${desde}&hasta=${hasta}`;
            const res = await window.api.get(url);
            this.citasActuales = Array.isArray(res) ? res : (res.data || []);
            
            this.renderTimeline();
            this.renderKanban();
        } catch (err) {
            console.error("🔴 Fallo al cargar citas:", err);
        }
    },

    // --- 1. RENDERIZADO DEL TIMELINE (VISTA MÉDICO) ---
    renderTimeline: function() {
        const tabla = document.getElementById('tabla-timeline');
        if (!tabla) return;

        if (this.doctoresActuales.length === 0) {
            tabla.innerHTML = `<tr><td style="padding: 20px; text-align: center; color: #64748b;">No hay especialistas asignados a esta sede.</td></tr>`;
            return;
        }

        let html = `<thead><tr><th class="timeline-time-col"><i class="fas fa-clock"></i></th>`;
        this.doctoresActuales.forEach(doc => {
            html += `<th>Dr(a). ${doc.Apellidos || ''} ${doc.Nombres || ''}</th>`;
        });
        html += `</tr></thead><tbody>`;

        for (let h = 8; h <= 20; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hh = String(h).padStart(2, '0');
                const mm = String(m).padStart(2, '0');
                const horaFila = `${hh}:${mm}`;

                html += `<tr><td class="timeline-time-col">${horaFila}</td>`;
                
                this.doctoresActuales.forEach(doc => {
                    // FIX: Usamos filter en lugar de find para soportar múltiples días en la misma franja
                    const citasEnEsteHorario = this.citasActuales.filter(c => 
                        (c.Doctor_Nombre && c.Doctor_Nombre.includes(doc.Apellidos)) && 
                        c.Hora_Inicio.startsWith(horaFila) && 
                        c.Estado !== 'Cancelada'
                    );

                    if (citasEnEsteHorario.length > 0) {
                        html += `<td>`;
                        citasEnEsteHorario.forEach(cita => {
                            const idC = cita.ID_Cita || cita.id_cita;
                            const borderColor = this.getColorEstado(cita.Estado);
                            html += `
                                <div class="t-card" style="border-left-color: ${borderColor}; margin-bottom: 8px;">
                                    <div class="t-card-header">
                                        <div style="display:flex; flex-direction:column;">
                                            <span title="${cita.Paciente_Nombre}" style="font-size:0.8rem;">${cita.Paciente_Nombre.substring(0, 16)}...</span>
                                            <span style="font-size:0.65rem; color:#4f46e5; background:#e0e7ff; padding:2px 6px; border-radius:4px; width:fit-content; margin-top:3px; border:1px solid #c7d2fe;">
                                                <i class="fas fa-calendar-day"></i> ${cita.Fecha_Cita}
                                            </span>
                                        </div>
                                        <button onclick="window.citasModule.eliminarCita(${idC})" style="background:none; border:none; color:#cbd5e1; cursor:pointer;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                                        <span style="color:#64748b; font-size:0.7rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 70px;" title="${cita.Asunto || 'Consulta'}">
                                            ${cita.Asunto || 'Consulta'}
                                        </span>
                                        <select class="t-card-status" onchange="window.citasModule.cambiarEstado(${idC}, this.value)" style="color: ${borderColor};">
                                            <option value="Pendiente" ${cita.Estado === 'Pendiente'?'selected':''}>Pendiente</option>
                                            <option value="Confirmada" ${cita.Estado === 'Confirmada'?'selected':''}>Confirmada</option>
                                            <option value="Llegó" ${cita.Estado === 'Llegó'?'selected':''}>En Sala</option>
                                            <option value="En sillón" ${cita.Estado === 'En sillón'?'selected':''}>En Sillón</option>
                                            <option value="Atendida" ${cita.Estado === 'Atendida'?'selected':''}>Atendida</option>
                                        </select>
                                    </div>
                                </div>`;
                        });
                        html += `</td>`;
                    } else {
                        const idDoc = doc.ID_Usuario || doc.id_usuario;
                        html += `<td><div class="slot-empty" onclick="window.citasModule.abrirModalContextual('${horaFila}', ${idDoc})"><i class="fas fa-plus"></i> AGENDAR</div></td>`;
                    }
                });
                html += `</tr>`;
            }
        }
        html += `</tbody>`;
        tabla.innerHTML = html;
    },

    // --- 2. RENDERIZADO DEL KANBAN COMPACTO ---
    renderKanban: function() {
        ['Pendiente', 'Confirmada', 'Llegó', 'En_sillón', 'Atendida'].forEach(col => {
            const el = document.getElementById(`col-${col}`);
            if(el) el.innerHTML = '';
            const cEl = document.getElementById(`count-${col}`);
            if(cEl) cEl.innerText = '0';
        });

        let contadores = { Pendiente: 0, Confirmada: 0, Llegó: 0, 'En sillón': 0, Atendida: 0 };

        this.citasActuales.forEach(c => {
            if(c.Estado === 'Cancelada') return;
            
            const idCitaSegura = c.ID_Cita || c.id_cita;
            let estadoSeguro = c.Estado === 'En sillón' ? 'En_sillón' : c.Estado;
            const colDestino = document.getElementById(`col-${estadoSeguro}`);
            
            if (colDestino) {
                contadores[c.Estado] = (contadores[c.Estado] || 0) + 1;
                const colorBorder = this.getColorEstado(c.Estado);

                // FIX: Integración de Fecha en tarjeta Kanban
                const html = `
                    <div class="k-card" draggable="true" ondragstart="window.citasModule.dragStart(event, ${idCitaSegura}, '${c.Estado}')" style="border-left-color: ${colorBorder};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight:800; color:#1e293b; font-size:1.05rem;">${c.Hora_Inicio}</span>
                                <span style="font-size:0.65rem; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:6px; border:1px solid #e2e8f0; font-weight:700;">
                                    <i class="fas fa-calendar-alt"></i> ${c.Fecha_Cita}
                                </span>
                            </div>
                            <button onclick="window.citasModule.eliminarCita(${idCitaSegura})" style="background:none; border:none; color:#cbd5e1; cursor:pointer;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'"><i class="fas fa-trash-alt"></i></button>
                        </div>
                        <div style="font-weight:800; color:#334155; margin:8px 0;">${c.Paciente_Nombre || 'Sin Nombre'}</div>
                        <div style="color:#64748b; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
                            <span><i class="fas fa-user-md"></i> Dr. ${c.Doctor_Nombre || '--'}</span>
                            <span style="font-size:0.65rem; color:${colorBorder}; background:${colorBorder}15; padding:2px 6px; border-radius:4px; font-weight:700;">${c.Asunto || 'Consulta'}</span>
                        </div>
                    </div>
                `;
                colDestino.innerHTML += html;
            }
        });

        document.getElementById('count-Pendiente').innerText = contadores['Pendiente'];
        document.getElementById('count-Confirmada').innerText = contadores['Confirmada'];
        document.getElementById('count-Llegó').innerText = contadores['Llegó'];
        document.getElementById('count-En_sillón').innerText = contadores['En sillón'];
        document.getElementById('count-Atendida').innerText = contadores['Atendida'];
    },

    getColorEstado: function(estado) {
        const mapa = { 'Pendiente': '#94a3b8', 'Confirmada': '#3b82f6', 'Llegó': '#f59e0b', 'En sillón': '#ef4444', 'Atendida': '#10b981' };
        return mapa[estado] || '#cbd5e1';
    },

    // --- KANBAN DRAG & DROP LOGIC ---
    dragStart: function(event, idCita, estadoActual) {
        event.dataTransfer.setData("idCita", idCita);
        event.dataTransfer.setData("estadoActual", estadoActual);
        event.target.style.opacity = "0.5";
    },
    allowDrop: function(event) { event.preventDefault(); },
    drop: async function(event, nuevoEstado) {
        event.preventDefault();
        const idCita = event.dataTransfer.getData("idCita");
        const estadoActual = event.dataTransfer.getData("estadoActual");
        document.querySelectorAll('.k-card').forEach(el => el.style.opacity = "1");
        if (!idCita || estadoActual === nuevoEstado) return;
        await this.cambiarEstado(idCita, nuevoEstado);
    },

    // --- ACCIONES CORE ---
    cambiarEstado: async function(idCita, nuevoEstado) {
        if (!idCita) return;
        try {
            const res = await window.api.post(`/citas/estado/${idCita}`, { estado: nuevoEstado });
            if (res.status === "Success") {
                this.cargarDatos(); 
                if (nuevoEstado === 'En sillón' && window._electronSalaEspera) {
                    window._electronSalaEspera.llamarPaciente({ idCita: idCita });
                }
            }
        } catch (err) { this.cargarDatos(); }
    },

    cargarSelectores: async function() {
        try {
            const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
            const idCli = document.getElementById('select-sede-agenda')?.value || sesion.ID_Clinica || sesion.id_clinica;
            const idRol = sesion.ID_Rol || sesion.id_rol;
            
            const [pacs, users] = await Promise.all([
                window.api.get(`/pacientes?id_clinica=${idCli}&id_rol=${idRol}`),
                window.api.get(`/usuarios/listar-medicos?id_clinica=${idCli}`)
            ]);
            
            this.doctoresActuales = Array.isArray(users) ? users : []; 

            const selPac = document.getElementById('cita-paciente');
            const selDoc = document.getElementById('cita-doctor');
            if (selPac) selPac.innerHTML = '<option value="">Seleccione Paciente...</option>' + pacs.map(p => `<option value="${p.ID_Paciente || p.id_paciente}">${p.Nombres || ''} ${p.Apellidos || ''}</option>`).join('');
            if (selDoc) selDoc.innerHTML = '<option value="">Seleccione Doctor...</option>' + this.doctoresActuales.map(u => `<option value="${u.ID_Usuario || u.id_usuario}">Dr(a). ${u.Apellidos || ''} ${u.Nombres || ''}</option>`).join('');
        } catch (err) {}
    },

    configurarSelectorSedes: async function(idRol, idClinicaSesion) {
        try {
            const clinicas = await window.api.get('/clinicas/listar');
            const selector = document.getElementById('select-sede-agenda');
            if (selector && Array.isArray(clinicas)) {
                selector.innerHTML = clinicas.map(c => `<option value="${c.ID_Clinica || c.id_clinica}" ${parseInt(c.ID_Clinica || c.id_clinica) === idClinicaSesion ? 'selected' : ''}>${c.Nombre_Clinica || c.nombre_clinica}</option>`).join('');
                if (idRol !== "1" && idRol !== "3") { selector.disabled = true; selector.style.background = "#f1f5f9"; }
            }
        } catch (err) {}
    },

    generarSelectorHoras: function() {
        const selectHora = document.getElementById('cita-hora');
        if (!selectHora) return;
        let opciones = '<option value="">Seleccione hora...</option>';
        for (let h = 8; h <= 20; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hh = String(h).padStart(2, '0');
                const mm = String(m).padStart(2, '0');
                opciones += `<option value="${hh}:${mm}">${hh}:${mm}</option>`;
            }
        }
        selectHora.innerHTML = opciones;
    },

    abrirModal: function() {
        document.getElementById('modal-cita').style.display = 'flex';
        document.getElementById('cita-fecha').value = document.getElementById('filtro-fecha-desde').value || new Date().toISOString().split('T')[0];
    },

    abrirModalContextual: function(hora, idDoctor) {
        this.abrirModal();
        document.getElementById('cita-hora').value = hora;
        document.getElementById('cita-doctor').value = idDoctor;
    },

    cerrarModal: function() {
        document.getElementById('modal-cita').style.display = 'none';
        document.getElementById('form-cita').reset();
    },

    guardarCita: async function(e) {
        e.preventDefault();
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
        const idClinicaDestino = parseInt(document.getElementById('select-sede-agenda').value);
        const horaInicio = document.getElementById('cita-hora').value;
        const [h, m] = horaInicio.split(':');
        const d = new Date(); d.setHours(parseInt(h), parseInt(m) + 30);
        
        const payload = {
            id_paciente: parseInt(document.getElementById('cita-paciente').value),
            id_doctor: parseInt(document.getElementById('cita-doctor').value),
            id_clinica: idClinicaDestino,
            fecha: document.getElementById('cita-fecha').value,
            hora_inicio: `${horaInicio}:00`,
            hora_fin: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`,
            asunto: document.getElementById('cita-asunto').value || "Consulta General",
            color: "#3b82f6",
            id_usuario_reg: parseInt(sesion.ID_Usuario || sesion.id_usuario)
        };

        try {
            const res = await window.api.post('/citas/guardar', payload);
            if (res.status === "Success") {
                await Swal.fire({ icon: 'success', title: '¡Agendada!', timer: 1500, showConfirmButton: false });
                this.cerrarModal();
                this.cargarDatos();
            } else if (res.status === "Choque") {
                Swal.fire('⚠️ Choque', `Horario ocupado de ${res.cita_conflicto.hora_inicio} a ${res.cita_conflicto.hora_fin}.`, 'warning');
            }
        } catch (err) { Swal.fire('⚠️ Error', 'Problema de conexión.', 'error'); }
    },

    eliminarCita: async function(id) {
        const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (result.isConfirmed) {
            await window.api.delete(`/citas/eliminar/${id}`);
            this.cargarDatos();
        }
    }
};