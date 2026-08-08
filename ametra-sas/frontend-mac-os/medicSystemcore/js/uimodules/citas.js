// ==========================================
// MÓDULO: GESTIÓN DE CITAS (TIMELINE + KANBAN COMPACTO)
// ==========================================
window.citasModule = {
    doctoresActuales: [],
    citasActuales: [],
    citaEditandoId: null, // null = creando cita nueva; con valor = reagendando esa cita
    terminoBusqueda: '',  // texto del buscador "Buscar paciente..." (filtra por nombre)

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

        await this.cargarSelectores();
        await this.cargarDatos();

        const formCita = document.getElementById('form-cita');
        if (formCita) formCita.onsubmit = (e) => this.guardarCita(e);

        const selectDoctorModal = document.getElementById('cita-doctor');
        if (selectDoctorModal) selectDoctorModal.onchange = () => this.actualizarSelectorHora();
        const inputFechaModal = document.getElementById('cita-fecha');
        if (inputFechaModal) inputFechaModal.onchange = () => this.actualizarSelectorHora();

        const selectorSede = document.getElementById('select-sede-agenda');
        if (selectorSede) selectorSede.onchange = (e) => {
            this.cargarSelectores().then(() => this.cargarDatos());
        };

        const inputBusqueda = document.getElementById('search-citas');
        if (inputBusqueda) inputBusqueda.oninput = (e) => {
            this.terminoBusqueda = e.target.value.toLowerCase().trim();
            this.renderTimeline();
            this.renderKanban();
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
    // Genera un bloque de tabla (horarios x doctores) POR CADA DÍA del rango filtrado,
    // para no mezclar citas de días distintos en la misma celda de horario.
    renderTimeline: function() {
        const contenedor = document.getElementById('tabla-timeline');
        if (!contenedor) return;

        if (this.doctoresActuales.length === 0) {
            contenedor.innerHTML = `<div class="timeline-day-block"><div style="padding: 20px; text-align: center; color: #64748b;">No hay especialistas asignados a esta sede.</div></div>`;
            return;
        }

        const dias = this.obtenerDiasDelFiltro();
        contenedor.innerHTML = dias.map(fecha => this.renderTablaDelDia(fecha)).join('');
    },

    // Devuelve el listado de fechas (YYYY-MM-DD) entre filtro-fecha-desde y filtro-fecha-hasta, inclusive.
    obtenerDiasDelFiltro: function() {
        const desdeStr = document.getElementById('filtro-fecha-desde')?.value;
        const hastaStr = document.getElementById('filtro-fecha-hasta')?.value || desdeStr;
        if (!desdeStr) return [new Date().toISOString().split('T')[0]];

        const dias = [];
        let cursor = new Date(desdeStr + 'T00:00:00');
        const fin = new Date(hastaStr + 'T00:00:00');
        while (cursor <= fin) {
            dias.push(cursor.toISOString().split('T')[0]);
            cursor.setDate(cursor.getDate() + 1);
        }
        return dias.length > 0 ? dias : [desdeStr];
    },

    formatearEncabezadoDia: function(fechaStr) {
        const d = new Date(fechaStr + 'T00:00:00');
        const texto = d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
        return texto.toUpperCase();
    },

    // Construye el bloque completo (encabezado + tabla horarios x doctores) para UN día puntual.
    renderTablaDelDia: function(fechaStr) {
        const citasDelDia = this.citasActuales.filter(c =>
            c.Fecha_Cita === fechaStr &&
            c.Estado !== 'Cancelada' &&
            (!this.terminoBusqueda || (c.Paciente_Nombre || '').toLowerCase().includes(this.terminoBusqueda))
        );

        let html = `<div class="timeline-day-block">
            <div class="timeline-day-header"><i class="fas fa-calendar-day"></i> ${this.formatearEncabezadoDia(fechaStr)}</div>
            <table class="timeline-table">
                <thead><tr><th class="timeline-time-col"><i class="fas fa-clock"></i></th>`;
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
                    const citasEnEsteHorario = citasDelDia.filter(c =>
                        (c.Doctor_Nombre && c.Doctor_Nombre.includes(doc.Apellidos)) &&
                        c.Hora_Inicio.startsWith(horaFila)
                    );

                    if (citasEnEsteHorario.length > 0) {
                        html += `<td>`;
                        citasEnEsteHorario.forEach(cita => {
                            const idC = cita.ID_Cita || cita.id_cita;
                            const borderColor = this.getColorEstado(cita.Estado);
                            html += `
                                <div class="t-card" style="border-left-color: ${borderColor}; margin-bottom: 8px;">
                                    <div class="t-card-header">
                                        <span title="${cita.Paciente_Nombre}" style="font-size:0.8rem;">${cita.Paciente_Nombre.substring(0, 16)}...</span>
                                        <div style="display:flex; gap:6px;">
                                            <button onclick="window.citasModule.abrirModalReagendar(${idC})" title="Reagendar" style="background:none; border:none; color:#cbd5e1; cursor:pointer;" onmouseover="this.style.color='#4f46e5'" onmouseout="this.style.color='#cbd5e1'">
                                                <i class="fas fa-pen"></i>
                                            </button>
                                            <button onclick="window.citasModule.eliminarCita(${idC})" title="Eliminar" style="background:none; border:none; color:#cbd5e1; cursor:pointer;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
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
                        html += `<td><div class="slot-empty" onclick="window.citasModule.abrirModalContextual('${horaFila}', ${idDoc}, '${fechaStr}')"><i class="fas fa-plus"></i> AGENDAR</div></td>`;
                    }
                });
                html += `</tr>`;
            }
        }
        html += `</tbody></table></div>`;
        return html;
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
            if (this.terminoBusqueda && !(c.Paciente_Nombre || '').toLowerCase().includes(this.terminoBusqueda)) return;

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
            // Antes esto armaba un <select> con TODOS los pacientes de la clínica — en clínicas
            // con cientos de pacientes era una lista imposible de recorrer a mano. Ahora se
            // guarda la lista para filtrarla en vivo con un buscador (ver filtrarPacienteModal).
            this.pacientesActuales = Array.isArray(pacs) ? pacs : [];

            const selDoc = document.getElementById('cita-doctor');
            if (selDoc) selDoc.innerHTML = '<option value="">Seleccione Doctor...</option>' + this.doctoresActuales.map(u => `<option value="${u.ID_Usuario || u.id_usuario}">Dr(a). ${u.Apellidos || ''} ${u.Nombres || ''}</option>`).join('');
        } catch (err) {}
    },

    // Filtra this.pacientesActuales por nombre/apellido/cédula mientras el doctor escribe,
    // y muestra hasta 30 resultados clicables debajo del campo de búsqueda.
    filtrarPacienteModal: function(termino) {
        const cont = document.getElementById('cita-paciente-resultados');
        if (!cont) return;
        const lista = this.pacientesActuales || [];
        const t = (termino || '').trim().toLowerCase();

        const resultados = (t
            ? lista.filter(p => {
                const nombre = `${p.Nombres || ''} ${p.Apellidos || ''}`.toLowerCase();
                const dni = String(p.DNI || p.dni || '').toLowerCase();
                return nombre.includes(t) || dni.includes(t);
            })
            : lista
        ).slice(0, 30);

        if (resultados.length === 0) {
            cont.innerHTML = '<div style="padding:10px 12px; font-size:0.8rem; color:#94a3b8;">Sin pacientes que coincidan.</div>';
        } else {
            cont.innerHTML = resultados.map(p => {
                const id = p.ID_Paciente || p.id_paciente;
                const nombre = `${p.Nombres || ''} ${p.Apellidos || ''}`.trim();
                const dni = p.DNI || p.dni || '';
                return `<div onmousedown="window.citasModule.seleccionarPacienteModal(${id}, '${nombre.replace(/'/g, "\\'")}')"
                             style="padding:9px 12px; cursor:pointer; font-size:0.85rem; border-bottom:1px solid #f1f5f9;"
                             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                            <strong>${nombre}</strong>${dni ? ` <span style="color:#94a3b8; font-size:0.75rem;">· ${dni}</span>` : ''}
                        </div>`;
            }).join('');
        }
        cont.style.display = 'block';
    },

    seleccionarPacienteModal: function(id, nombre) {
        document.getElementById('cita-paciente').value = id;
        document.getElementById('cita-paciente-busqueda').value = nombre;
        document.getElementById('cita-paciente-resultados').style.display = 'none';
    },

    // onmousedown en cada resultado ya registra el clic antes de este blur, así que el
    // pequeño retraso solo evita que el dropdown se oculte justo antes de poder hacer clic.
    ocultarResultadosPacienteModalDiferido: function() {
        setTimeout(() => {
            const cont = document.getElementById('cita-paciente-resultados');
            if (cont) cont.style.display = 'none';
        }, 150);
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

    // Antes el selector de hora ofrecía las 25 franjas del día completas desde que se abría
    // el modal, sin importar si ya había doctor elegido — dejaba escoger un horario ocupado
    // y recién al guardar el backend lo rechazaba con "Choque" (citasController.js sí valida
    // bien esa parte). Ahora el flujo es: primero DOCTOR, y la hora queda deshabilitada con
    // un aviso hasta que hay doctor + fecha elegidos; recién ahí se llenan las franjas
    // marcando como no seleccionables las que chocan con una cita real de ese doctor ese día
    // (mismo cálculo de solape inicio/fin que ya usa el bot de WhatsApp, no solo igualdad exacta).
    actualizarSelectorHora: async function() {
        const selectHora = document.getElementById('cita-hora');
        const fecha = document.getElementById('cita-fecha')?.value;
        const idDoctor = document.getElementById('cita-doctor')?.value;
        if (!selectHora) return;

        if (!fecha || !idDoctor) {
            selectHora.innerHTML = '<option value="">Elija doctor y fecha primero...</option>';
            selectHora.disabled = true;
            return;
        }

        const valorPrevio = selectHora.value;
        let opciones = '<option value="">Seleccione hora...</option>';
        for (let h = 8; h <= 20; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hh = String(h).padStart(2, '0');
                const mm = String(m).padStart(2, '0');
                opciones += `<option value="${hh}:${mm}">${hh}:${mm}</option>`;
            }
        }
        selectHora.innerHTML = opciones;
        selectHora.disabled = false;

        const idClinica = parseInt(document.getElementById('select-sede-agenda')?.value);
        if (!idClinica) return;

        const sumarMediaHora = (hhmm) => {
            const [h, m] = hhmm.split(':').map(Number);
            const total = h * 60 + m + 30;
            return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        };

        let ocupadas = [];
        try {
            const citasDelDia = await window.api.get(`/citas/listar/${idClinica}?desde=${fecha}&hasta=${fecha}`);
            if (Array.isArray(citasDelDia)) {
                ocupadas = citasDelDia.filter(c =>
                    String(c.ID_Doctor || c.id_doctor) === String(idDoctor) &&
                    c.Estado !== 'Cancelada' &&
                    (c.ID_Cita || c.id_cita) != this.citaEditandoId // reagendar su propia cita no se cuenta como choque contra sí misma
                );
            }
        } catch (err) { return; } // si falla la consulta, se deja el selector sin marcar — no bloquea agendar

        Array.from(selectHora.options).forEach(opt => {
            if (!opt.value) return; // "Seleccione hora..."
            const finTurno = sumarMediaHora(opt.value);
            const choque = ocupadas.some(c => (c.Hora_Inicio || c.hora_inicio) < finTurno && (c.Hora_Fin || c.hora_fin) > opt.value);
            opt.disabled = choque;
            opt.textContent = choque ? `${opt.value} (Ocupado)` : opt.value;
        });

        if (Array.from(selectHora.options).some(o => o.value === valorPrevio && !o.disabled)) {
            selectHora.value = valorPrevio;
        }
    },

    abrirModal: function() {
        this.citaEditandoId = null;
        document.getElementById('modal-cita-titulo').innerHTML = '<i class="fas fa-calendar-plus" style="color: #4f46e5; margin-right: 10px;"></i> Programar Cita';
        document.getElementById('btn-guardar-cita').textContent = 'AGENDAR Y NOTIFICAR';
        document.getElementById('form-cita').reset();
        document.getElementById('cita-paciente-resultados').style.display = 'none';
        document.getElementById('modal-cita').style.display = 'flex';
        document.getElementById('cita-fecha').value = document.getElementById('filtro-fecha-desde').value || new Date().toISOString().split('T')[0];
        this.actualizarSelectorHora(); // sin doctor todavía elegido, queda deshabilitada con el aviso
    },

    abrirModalContextual: async function(hora, idDoctor, fecha) {
        this.abrirModal();
        if (fecha) document.getElementById('cita-fecha').value = fecha;
        document.getElementById('cita-doctor').value = idDoctor;
        await this.actualizarSelectorHora(); // recién con doctor+fecha puestos se puede llenar/habilitar la hora
        document.getElementById('cita-hora').value = hora;
    },

    // Abre el modal precargado con los datos de una cita existente para reagendarla
    // (cambia fecha/hora/doctor/asunto sobre la misma cita, no crea una nueva).
    abrirModalReagendar: async function(idCita) {
        const cita = this.citasActuales.find(c => (c.ID_Cita || c.id_cita) == idCita);
        if (!cita) return;

        this.citaEditandoId = idCita;
        document.getElementById('modal-cita-titulo').innerHTML = '<i class="fas fa-calendar-check" style="color: #4f46e5; margin-right: 10px;"></i> Reagendar Cita';
        document.getElementById('btn-guardar-cita').textContent = 'GUARDAR CAMBIOS';
        document.getElementById('modal-cita').style.display = 'flex';

        const idPacCita = cita.ID_Paciente || cita.id_paciente || '';
        document.getElementById('cita-paciente').value = idPacCita;
        const pacCita = (this.pacientesActuales || []).find(p => (p.ID_Paciente || p.id_paciente) == idPacCita);
        document.getElementById('cita-paciente-busqueda').value = pacCita
            ? `${pacCita.Nombres || ''} ${pacCita.Apellidos || ''}`.trim()
            : (cita.Paciente_Nombre || '');
        document.getElementById('cita-paciente-resultados').style.display = 'none';
        document.getElementById('cita-doctor').value = cita.ID_Doctor || cita.id_doctor || '';
        document.getElementById('cita-fecha').value = cita.Fecha_Cita;
        // citaEditandoId ya quedó seteado arriba, así que actualizarSelectorHora no marca la
        // hora propia de esta misma cita como "ocupada" contra sí misma.
        await this.actualizarSelectorHora();
        document.getElementById('cita-hora').value = (cita.Hora_Inicio || '').substring(0, 5);
        document.getElementById('cita-asunto').value = cita.Asunto || '';
    },

    cerrarModal: function() {
        this.citaEditandoId = null;
        document.getElementById('modal-cita').style.display = 'none';
        document.getElementById('form-cita').reset();
        const resPac = document.getElementById('cita-paciente-resultados');
        if (resPac) resPac.style.display = 'none';
    },

    guardarCita: async function(e) {
        e.preventDefault();

        // El campo de paciente ahora es un buscador (no un <select> con "required" nativo del
        // navegador) — hay que validar a mano que sí se haya elegido uno de la lista de resultados.
        const idPacienteVal = document.getElementById('cita-paciente').value;
        if (!idPacienteVal) {
            return Swal.fire('Falta el paciente', 'Busca y selecciona un paciente de la lista antes de agendar.', 'warning');
        }

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

        const reagendando = this.citaEditandoId !== null;
        const url = reagendando ? `/citas/reagendar/${this.citaEditandoId}` : '/citas/guardar';

        try {
            const res = await window.api.post(url, payload);
            if (res.status === "Success") {
                await Swal.fire({ icon: 'success', title: reagendando ? '¡Reagendada!' : '¡Agendada!', timer: 1500, showConfirmButton: false });
                this.cerrarModal();
                this.cargarDatos();
            } else if (res.status === "Choque") {
                const detalle = res.cita_conflicto ? `${res.cita_conflicto.hora_inicio} a ${res.cita_conflicto.hora_fin}` : res.message;
                Swal.fire('⚠️ Choque', `Horario ocupado: ${detalle}`, 'warning');
            } else {
                // ANTES: si res.status no era "Success" ni "Choque" (ej. un 500 real, o un
                // "Error" con mensaje) no pasaba NADA — el modal se quedaba ahí sin avisar
                // que el guardado había fallado.
                Swal.fire('⚠️ Error', res.message || 'No se pudo guardar la cita.', 'error');
            }
        } catch (err) { Swal.fire('⚠️ Error', 'Problema de conexión.', 'error'); }
    },

    eliminarCita: async function(id) {
        const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (result.isConfirmed) {
            // window.api.delete() nunca rechaza la promesa (atrapa cualquier error y lo
            // devuelve como {status:'Error', message}) — hay que revisar res.status, si no,
            // un rechazo del backend (ej. cita ya Atendida) se ve como si se hubiera
            // borrado bien.
            const res = await window.api.delete(`/citas/eliminar/${id}`);
            if (res && res.status === 'Error') {
                Swal.fire({ icon: 'warning', title: 'No se pudo eliminar', text: res.message || 'La cita no se pudo eliminar.' });
                return;
            }
            this.cargarDatos();
        }
    }
};