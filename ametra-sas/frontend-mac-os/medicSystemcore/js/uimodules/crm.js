// ==========================================
// MÓDULO: CRM & MARKETING
// Recurrencia, canales de origen, demografía, retención por médico,
// cumpleaños y buscador de pacientes con valor de vida.
// ==========================================
window.crmModule = {

    idPacienteAbierto: null, // paciente actualmente mostrado en el modal (para las acciones)
    segmentoActual: [], // último segmento buscado para la campaña (id + nombre + teléfono)
    rangoActual: { inicio: null, fin: null }, // null = todo el historial (comportamiento de siempre)

    getIdClinica: function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
        return sesion.ID_Clinica || sesion.id_clinica || 0;
    },

    // yyyy-mm-dd en hora LOCAL (no toISOString, que corta a UTC y puede correr el día).
    formatoISO: function(fecha) {
        const y = fecha.getFullYear(), m = String(fecha.getMonth() + 1).padStart(2, '0'), d = String(fecha.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    // Para mostrar un "yyyy-mm-dd" suelto (sin hora): NO usar formatoFecha/new Date() acá,
    // porque un string sin hora se interpreta como medianoche UTC y en Ecuador (UTC-5) eso
    // cae en el día ANTERIOR al convertir a hora local — mostraría "30 jun" en vez de "01 jul".
    formatoFechaSimple: function(isoDate) {
        const [y, m, d] = isoDate.split('-');
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${d} ${meses[parseInt(m, 10) - 1]} ${y}`;
    },

    calcularRangoPreset: function(preset) {
        const hoy = new Date();
        if (preset === 'todo') return { inicio: null, fin: null };
        if (preset === 'mes') {
            return { inicio: this.formatoISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fin: this.formatoISO(hoy) };
        }
        if (preset === '30dias') {
            const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30);
            return { inicio: this.formatoISO(hace30), fin: this.formatoISO(hoy) };
        }
        if (preset === 'anio') {
            return { inicio: this.formatoISO(new Date(hoy.getFullYear(), 0, 1)), fin: this.formatoISO(hoy) };
        }
        return null; // 'personalizado' -> se arma desde los inputs de fecha
    },

    // Recarga todo lo que depende del rango de fechas (resumen + canales de origen) y
    // actualiza la etiqueta visible para que siempre quede claro qué período se está viendo.
    aplicarRango: function(idClinica) {
        const etiqueta = document.getElementById('crm-rango-actual');
        const labelNuevos = document.getElementById('crm-nuevos-label');
        if (this.rangoActual.inicio && this.rangoActual.fin) {
            etiqueta.innerText = `Mostrando: ${this.formatoFechaSimple(this.rangoActual.inicio)} — ${this.formatoFechaSimple(this.rangoActual.fin)}`;
            labelNuevos.innerText = 'Nuevos en el período';
        } else {
            etiqueta.innerText = 'Mostrando: todo el historial';
            labelNuevos.innerText = 'Nuevos este mes';
        }
        this.cargarResumen(idClinica);
        this.cargarCanales(idClinica);
    },

    init: async function() {
        console.log('📊 Inicializando Módulo CRM...');
        const idClinica = this.getIdClinica();

        this.rangoActual = { inicio: null, fin: null }; // por defecto: todo el historial, igual que antes
        this.aplicarRango(idClinica);
        this.cargarCumpleanieros(idClinica);
        this.cargarRecurrencia(idClinica);
        this.cargarDemografia(idClinica);
        this.cargarPatologiasZona(idClinica);
        this.cargarRetencionMedicos(idClinica);
        this.cargarPacientes(idClinica, '');

        const selectPreset = document.getElementById('crm-rango-preset');
        const inputDesde = document.getElementById('crm-rango-desde');
        const inputHasta = document.getElementById('crm-rango-hasta');
        const guion = document.getElementById('crm-rango-guion');

        selectPreset.addEventListener('change', () => {
            const esPersonalizado = selectPreset.value === 'personalizado';
            inputDesde.style.display = esPersonalizado ? 'inline-block' : 'none';
            inputHasta.style.display = esPersonalizado ? 'inline-block' : 'none';
            guion.style.display = esPersonalizado ? 'inline' : 'none';

            const calculado = this.calcularRangoPreset(selectPreset.value);
            if (calculado) {
                this.rangoActual = calculado;
                this.aplicarRango(idClinica);
            }
            // Si es 'personalizado', esperamos a que llenen ambas fechas (evento de los inputs abajo).
        });

        [inputDesde, inputHasta].forEach(input => {
            input.addEventListener('change', () => {
                if (inputDesde.value && inputHasta.value) {
                    this.rangoActual = { inicio: inputDesde.value, fin: inputHasta.value };
                    this.aplicarRango(idClinica);
                }
            });
        });

        const inputBusqueda = document.getElementById('crm-input-busqueda');
        if (inputBusqueda) {
            let timeoutBusqueda = null;
            inputBusqueda.addEventListener('input', (e) => {
                clearTimeout(timeoutBusqueda);
                const valor = e.target.value;
                timeoutBusqueda = setTimeout(() => this.cargarPacientes(idClinica, valor), 400);
            });
        }
    },

    formatoMoneda: function(valor) {
        return '$' + (parseFloat(valor) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatoFecha: function(fechaStr) {
        if (!fechaStr) return '—';
        const d = new Date(fechaStr);
        return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    // --- 1. TARJETAS RESUMEN ---
    cargarResumen: async function(idClinica) {
        const resp = await window.api.getCrmResumen(idClinica, this.rangoActual.inicio, this.rangoActual.fin);
        if (resp.status !== 'OK') return;

        document.getElementById('crm-total-pacientes').innerText = resp.total_pacientes;
        document.getElementById('crm-nuevos-mes').innerText = resp.nuevos_este_mes;
        document.getElementById('crm-tasa-recurrencia').innerText = resp.tasa_recurrencia + '%';
        document.getElementById('crm-ltv').innerText = this.formatoMoneda(resp.ticket_vida_promedio);
        document.getElementById('crm-cumple-hoy').innerText = resp.cumpleanos_hoy;
    },

    // --- 2. CUMPLEAÑEROS ---
    cargarCumpleanieros: async function(idClinica) {
        const tbody = document.getElementById('crm-tabla-cumpleanieros');
        if (!tbody) return;

        const resp = await window.api.getCrmCumpleanieros(idClinica, 30);
        if (resp.status !== 'OK') {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444">Error al cargar cumpleañeros.</td></tr>';
            return;
        }

        if (!resp.pacientes.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8">Sin cumpleaños en los próximos 30 días.</td></tr>';
            return;
        }

        const self = this;
        tbody.innerHTML = resp.pacientes.map(p => {
            const hoy = new Date();
            const nac = new Date(p.Fecha_Nacimiento);
            const esHoy = nac.getUTCMonth() === hoy.getMonth() && nac.getUTCDate() === hoy.getDate();
            return `
                <tr>
                    <td><strong>${p.Nombres} ${p.Apellidos}</strong> ${esHoy ? '<span class="badge-estado estado-activo">HOY 🎉</span>' : ''}</td>
                    <td>${self.formatoFecha(p.Fecha_Nacimiento)}</td>
                    <td>${p.Telefono || '—'} ${p.Email ? '· ' + p.Email : ''}</td>
                    <td style="text-align:center">
                        <button class="btn-felicitar" onclick="window.crmModule.felicitar(${p.ID_Paciente}, this)">
                            <i class="fas fa-gift"></i> Felicitar
                        </button>
                    </td>
                </tr>`;
        }).join('');
    },

    felicitar: function(idPaciente, btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        window.api.enviarFelicitacionCrm(idPaciente, this.getIdClinica()).then((resp) => {
            if (resp.status === 'OK') {
                const r = resp.resultado || {};
                Swal.fire('Enviado', `WhatsApp: ${r.whatsapp ? 'OK' : 'no enviado'} · Email: ${r.email ? 'OK' : 'no enviado'}`, 'success');
            } else {
                Swal.fire('Error', resp.message || 'No se pudo enviar la felicitación.', 'error');
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-gift"></i> Felicitar';
        });
    },

    // --- 3. RECURRENCIA (gráfico de barras) ---
    cargarRecurrencia: async function(idClinica) {
        const ctx = document.getElementById('chart-crm-recurrencia');
        if (!ctx) return;
        const resp = await window.api.getCrmRecurrencia(idClinica);
        if (resp.status !== 'OK') return;

        const labels = ['1 visita', '2 a 3 visitas', '4 a 6 visitas', '7 o más'];
        const valores = [resp['1_Visita'], resp['2_a_3_Visitas'], resp['4_a_6_Visitas'], resp['7_o_mas_Visitas']];

        if (window.chartCrmRecurrencia instanceof Chart) window.chartCrmRecurrencia.destroy();
        window.chartCrmRecurrencia = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Pacientes', data: valores, backgroundColor: '#4f46e5', borderRadius: 8 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });
    },

    // --- 4. CANALES DE ORIGEN (dona) ---
    cargarCanales: async function(idClinica) {
        const ctx = document.getElementById('chart-crm-canales');
        if (!ctx) return;
        const resp = await window.api.getCrmCanalesOrigen(idClinica, this.rangoActual.inicio, this.rangoActual.fin);
        if (resp.status !== 'OK') return;

        const labels = resp.canales.map(c => c.Canal);
        const valores = resp.canales.map(c => c.Total);
        const colores = { 'WhatsApp (Bot)': '#22c55e', 'Registro Manual': '#4f46e5' };

        if (window.chartCrmCanales instanceof Chart) window.chartCrmCanales.destroy();
        window.chartCrmCanales = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: labels.length ? labels : ['Sin datos'], datasets: [{ data: valores.length ? valores : [1], backgroundColor: labels.map(l => colores[l] || '#94a3b8'), borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
        });
    },

    // --- 5. DEMOGRAFÍA (género, edad, cantón) ---
    cargarDemografia: async function(idClinica) {
        const resp = await window.api.getCrmDemografia(idClinica);
        if (resp.status !== 'OK') return;

        const ctxGenero = document.getElementById('chart-crm-genero');
        if (ctxGenero) {
            if (window.chartCrmGenero instanceof Chart) window.chartCrmGenero.destroy();
            window.chartCrmGenero = new Chart(ctxGenero.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: resp.por_genero.map(g => g.Genero),
                    datasets: [{ data: resp.por_genero.map(g => g.Total), backgroundColor: ['#0ea5e9', '#ec4899', '#94a3b8', '#f59e0b'], borderWidth: 2, borderColor: '#fff' }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
            });
        }

        const ctxEdad = document.getElementById('chart-crm-edad');
        if (ctxEdad) {
            const ordenEdades = ['Menor de 18', '18 a 30', '31 a 45', '46 a 60', 'Mayor de 60', 'No especificado'];
            const ordenado = resp.por_edad.slice().sort((a, b) => ordenEdades.indexOf(a.Rango_Edad) - ordenEdades.indexOf(b.Rango_Edad));
            if (window.chartCrmEdad instanceof Chart) window.chartCrmEdad.destroy();
            window.chartCrmEdad = new Chart(ctxEdad.getContext('2d'), {
                type: 'bar',
                data: { labels: ordenado.map(e => e.Rango_Edad), datasets: [{ label: 'Pacientes', data: ordenado.map(e => e.Total), backgroundColor: '#f59e0b', borderRadius: 8 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
        }

        const ctxCanton = document.getElementById('chart-crm-canton');
        if (ctxCanton) {
            if (window.chartCrmCanton instanceof Chart) window.chartCrmCanton.destroy();
            window.chartCrmCanton = new Chart(ctxCanton.getContext('2d'), {
                type: 'bar',
                data: { labels: resp.por_canton.map(c => c.Canton), datasets: [{ label: 'Pacientes', data: resp.por_canton.map(c => c.Total), backgroundColor: '#10b981', borderRadius: 8 }] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
        }
    },

    // --- 5b. PATOLOGÍAS MÁS FRECUENTES POR ZONA ---
    cargarPatologiasZona: async function(idClinica) {
        const tbody = document.getElementById('crm-tabla-patologias');
        if (!tbody) return;
        const resp = await window.api.getCrmPatologiasZona(idClinica);
        if (resp.status !== 'OK') {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#ef4444">Error al cargar.</td></tr>';
            return;
        }
        if (!resp.patologias_por_canton.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94a3b8">Todavía no hay diagnósticos CIE10 registrados.</td></tr>';
            return;
        }
        tbody.innerHTML = resp.patologias_por_canton.map(p => `
            <tr>
                <td><strong>${p.Canton}</strong></td>
                <td>${p.Patologia || '—'}</td>
                <td>${p.Total}</td>
            </tr>
        `).join('');
    },

    // --- 6. RETENCIÓN POR MÉDICO ---
    cargarRetencionMedicos: async function(idClinica) {
        const tbody = document.getElementById('crm-tabla-medicos');
        if (!tbody) return;
        const resp = await window.api.getCrmRetencionMedicos(idClinica);
        if (resp.status !== 'OK') {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444">Error al cargar.</td></tr>';
            return;
        }
        if (!resp.medicos.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8">Sin datos suficientes todavía.</td></tr>';
            return;
        }
        tbody.innerHTML = resp.medicos.map(m => `
            <tr>
                <td><strong>${m.Doctor}</strong></td>
                <td>${m.Pacientes_Totales}</td>
                <td>${m.Pacientes_Recurrentes}</td>
                <td><span class="badge-estado ${m.Tasa_Retencion >= 50 ? 'estado-activo' : 'estado-inactivo'}">${m.Tasa_Retencion}%</span></td>
            </tr>
        `).join('');
    },

    // --- 7. BUSCADOR DE PACIENTES ---
    cargarPacientes: async function(idClinica, busqueda) {
        const tbody = document.getElementById('crm-tabla-pacientes');
        if (!tbody) return;
        const resp = await window.api.getCrmPacientes(idClinica, busqueda);
        if (resp.status !== 'OK') {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444">Error al cargar pacientes.</td></tr>';
            return;
        }
        if (!resp.pacientes.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8">Sin resultados.</td></tr>';
            return;
        }
        const self = this;
        tbody.innerHTML = resp.pacientes.map(p => `
            <tr class="crm-fila-paciente" onclick="window.crmModule.abrirModal(${p.ID_Paciente})">
                <td><strong>${p.Nombres} ${p.Apellidos}</strong> ${p.Es_VIP ? '<span class="badge-vip"><i class="fas fa-crown"></i> VIP</span>' : ''}</td>
                <td>${p.Total_Visitas}</td>
                <td>${self.formatoFecha(p.Ultima_Visita)}</td>
                <td>${self.formatoMoneda(p.Total_Gastado)}</td>
                <td><span class="badge-estado ${p.Canal_Origen === 'WhatsApp (Bot)' ? 'estado-activo' : 'estado-inactivo'}">${p.Canal_Origen}</span></td>
                <td style="text-align:center; color:#94a3b8"><i class="fas fa-chevron-right"></i></td>
            </tr>
        `).join('');
    },

    // --- 8. MODAL DE DETALLE DE PACIENTE (datos reales + acciones) ---
    abrirModal: async function(idPaciente) {
        this.idPacienteAbierto = idPaciente;
        const modal = document.getElementById('crm-modal-paciente');
        if (!modal) return;
        modal.style.display = 'flex';

        const resp = await window.api.getCrmPacienteDetalle(idPaciente, this.getIdClinica());
        if (resp.status !== 'OK') {
            Swal.fire('Error', resp.message || 'No se pudo cargar el paciente.', 'error');
            this.cerrarModal();
            return;
        }

        const p = resp.paciente;
        document.getElementById('crm-modal-nombre').innerText = `${p.Nombres} ${p.Apellidos}`;
        document.getElementById('crm-modal-vip-badge').innerHTML = p.DNI ? `Cédula: ${p.DNI}` : '';
        document.getElementById('crm-modal-visitas').innerText = resp.citas.filter(c => c.Estado && c.Estado.toLowerCase().includes('atend')).length || '0';
        document.getElementById('crm-modal-gastado').innerText = this.formatoMoneda(p.Total_Gastado);
        document.getElementById('crm-modal-saldo').innerText = this.formatoMoneda(p.Saldo_Pendiente);
        document.getElementById('crm-modal-doctor').innerText = resp.doctor_frecuente ? resp.doctor_frecuente.Doctor : '—';
        document.getElementById('crm-modal-telefono').innerText = p.Telefono || 'Sin registrar';
        document.getElementById('crm-modal-email').innerText = p.Email || 'Sin registrar';
        document.getElementById('crm-modal-ubicacion').innerText = [p.Parroquia_Residencia, p.Canton_Residencia, p.Provincia_Residencia].filter(Boolean).join(', ') || 'Sin registrar';

        const listaTratamientos = document.getElementById('crm-modal-tratamientos');
        listaTratamientos.innerHTML = resp.tratamientos.length
            ? resp.tratamientos.map(t => `<li><span>${t.Nombre_Tratamiento}</span><span>${this.formatoMoneda(t.Costo_Total)} · ${t.Estado_Tratamiento || ''}</span></li>`).join('')
            : '<li style="color:#94a3b8">Sin tratamientos registrados.</li>';

        const listaCitas = document.getElementById('crm-modal-citas');
        listaCitas.innerHTML = resp.citas.length
            ? resp.citas.map(c => `<li><span>${this.formatoFecha(c.Fecha_Cita)} ${c.Hora || ''}</span><span>${c.Doctor || ''} · ${c.Estado || ''}</span></li>`).join('')
            : '<li style="color:#94a3b8">Sin citas registradas.</li>';
    },

    cerrarModal: function() {
        const modal = document.getElementById('crm-modal-paciente');
        if (modal) modal.style.display = 'none';
        this.idPacienteAbierto = null;
    },

    verHistoriaClinica: function() {
        if (!this.idPacienteAbierto) return;
        const idPaciente = this.idPacienteAbierto;
        this.cerrarModal();
        window.router.load('historia_clinica', { id_paciente: idPaciente });
    },

    enviarMensajeDesdeModal: function() {
        if (!this.idPacienteAbierto) return;
        const idPaciente = this.idPacienteAbierto;

        Swal.fire({
            title: 'Enviar mensaje',
            html: `
                <textarea id="swal-mensaje" class="swal2-textarea" placeholder="Escribí el mensaje para este paciente..." style="margin-top:4px"></textarea>
                <div style="display:flex; gap:16px; justify-content:center; margin-top:8px; font-size:0.9rem">
                    <label><input type="radio" name="swal-canal" value="whatsapp" checked> WhatsApp</label>
                    <label><input type="radio" name="swal-canal" value="email"> Correo</label>
                    <label><input type="radio" name="swal-canal" value="ambos"> Ambos</label>
                </div>
                <input id="swal-asunto" class="swal2-input" placeholder="Asunto del correo (si aplica)" style="display:none">
            `,
            didOpen: () => {
                document.querySelectorAll('input[name="swal-canal"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        const canal = document.querySelector('input[name="swal-canal"]:checked').value;
                        document.getElementById('swal-asunto').style.display = (canal === 'email' || canal === 'ambos') ? 'block' : 'none';
                    });
                });
            },
            showCancelButton: true,
            confirmButtonText: 'Enviar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const mensaje = document.getElementById('swal-mensaje').value.trim();
                if (!mensaje) { Swal.showValidationMessage('Escribí un mensaje.'); return false; }
                return {
                    mensaje,
                    canal: document.querySelector('input[name="swal-canal"]:checked').value,
                    asunto: document.getElementById('swal-asunto').value.trim()
                };
            }
        }).then((result) => {
            if (!result.isConfirmed) return;
            const { mensaje, canal, asunto } = result.value;

            window.api.enviarMensajeCrm(idPaciente, this.getIdClinica(), mensaje, canal, asunto).then((resp) => {
                if (resp.status === 'OK' && resp.enviado) {
                    Swal.fire('Enviado', 'El mensaje se envió correctamente.', 'success');
                } else {
                    Swal.fire('No se pudo enviar', resp.message || 'Verificá que el paciente tenga ese dato de contacto registrado.', 'error');
                }
            });
        });
    },

    // --- 8b. CAMPAÑAS Y DESCUENTOS DIRIGIDOS ---
    buscarSegmento: async function() {
        const filtros = {};
        if (document.getElementById('crm-filtro-vip').checked) filtros.vip = '1';
        if (document.getElementById('crm-filtro-recurrente').checked) filtros.recurrente = '1';
        if (document.getElementById('crm-filtro-cumple-mes').checked) filtros.cumple_mes = '1';
        const inactivo = document.getElementById('crm-filtro-inactivo').value;
        if (inactivo) filtros.inactivo_meses = inactivo;
        const edadMin = document.getElementById('crm-filtro-edad-min').value;
        if (edadMin) filtros.edad_min = edadMin;
        const edadMax = document.getElementById('crm-filtro-edad-max').value;
        if (edadMax) filtros.edad_max = edadMax;
        if (document.getElementById('crm-filtro-saldo').checked) filtros.con_saldo = '1';
        const sinTratamiento = document.getElementById('crm-filtro-sin-tratamiento').value;
        if (sinTratamiento) filtros.meses_sin_tratamiento = sinTratamiento;

        await this.ejecutarBusquedaSegmento(filtros);
    },

    // Ignora cualquier filtro cargado en el formulario: trae literalmente todos los pacientes
    // activos de la clínica con al menos un dato de contacto. Pensado para campañas masivas
    // (ej. "feliz año nuevo a todos") donde no tiene sentido armar un filtro.
    buscarTodos: function() {
        document.getElementById('crm-filtro-vip').checked = false;
        document.getElementById('crm-filtro-recurrente').checked = false;
        document.getElementById('crm-filtro-cumple-mes').checked = false;
        document.getElementById('crm-filtro-inactivo').value = '';
        document.getElementById('crm-filtro-edad-min').value = '';
        document.getElementById('crm-filtro-edad-max').value = '';
        document.getElementById('crm-filtro-saldo').checked = false;
        document.getElementById('crm-filtro-sin-tratamiento').value = '';
        return this.ejecutarBusquedaSegmento({});
    },

    ejecutarBusquedaSegmento: async function(filtros) {
        const idClinica = this.getIdClinica();
        const resp = await window.api.getCrmSegmento(idClinica, filtros);
        if (resp.status !== 'OK') {
            Swal.fire('Error', resp.message || 'No se pudo calcular el segmento.', 'error');
            return;
        }

        this.segmentoActual = resp.pacientes;
        document.getElementById('crm-segmento-resultado').style.display = 'block';
        document.getElementById('crm-segmento-total').innerText = resp.total;
        document.getElementById('crm-check-todos').checked = true;

        const tbody = document.getElementById('crm-tabla-segmento');
        if (!resp.pacientes.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8">Nadie cumple con esos filtros.</td></tr>';
            return;
        }
        tbody.innerHTML = resp.pacientes.map(p => `
            <tr>
                <td><input type="checkbox" class="crm-check-paciente" data-id="${p.ID_Paciente}" checked></td>
                <td>${p.Nombres} ${p.Apellidos} ${p.Es_VIP ? '<span class="badge-vip"><i class="fas fa-crown"></i> VIP</span>' : ''}</td>
                <td>${p.Telefono || '—'}</td>
                <td>${p.Email || '—'}</td>
                <td>${p.Total_Visitas}</td>
                <td>${p.Saldo_Pendiente > 0 ? this.formatoMoneda(p.Saldo_Pendiente) : '—'}</td>
            </tr>
        `).join('');

        // Selector de canal: el asunto del correo solo aplica si el canal incluye email.
        document.querySelectorAll('input[name="crm-canal"]').forEach(radio => {
            radio.onchange = () => {
                const asuntoInput = document.getElementById('crm-asunto-email');
                const canal = document.querySelector('input[name="crm-canal"]:checked').value;
                asuntoInput.style.display = (canal === 'email' || canal === 'ambos') ? 'block' : 'none';
            };
        });
    },

    toggleTodosSegmento: function(marcar) {
        document.querySelectorAll('.crm-check-paciente').forEach(chk => { chk.checked = marcar; });
    },

    // --- Plantillas listas para usar (el usuario las puede seguir editando antes de enviar) ---
    plantillasCampana: {
        descuento: '🏷️ ¡Hola {nombre}! Tenemos un descuento especial para vos esta semana. Escribinos para conocer los detalles y agendar tu cita. ¡No te lo pierdas! 🦷✨',
        reactivacion: '👋 ¡Hola {nombre}! Hace un tiempo que no te vemos por la clínica. Nos encantaría saber cómo estás y ayudarte a agendar tu próxima revisión. ¡Te esperamos! 😊',
        novedad: '✨ ¡Hola {nombre}! Queremos contarte que sumamos un nuevo servicio en la clínica. Si te interesa saber más, escribinos y con gusto te contamos todos los detalles.'
    },

    usarPlantilla: function(nombre) {
        const texto = this.plantillasCampana[nombre];
        if (texto) document.getElementById('crm-mensaje-campana').value = texto;
    },

    enviarCampana: function() {
        const seleccionados = Array.from(document.querySelectorAll('.crm-check-paciente:checked')).map(chk => parseInt(chk.dataset.id));
        const mensaje = document.getElementById('crm-mensaje-campana').value.trim();
        const canal = document.querySelector('input[name="crm-canal"]:checked').value;
        const asunto = document.getElementById('crm-asunto-email').value.trim();

        if (!seleccionados.length) return Swal.fire('Atención', 'No seleccionaste ningún paciente.', 'warning');
        if (!mensaje) return Swal.fire('Atención', 'Escribí el mensaje de la campaña.', 'warning');

        const nombreCanal = { whatsapp: 'WhatsApp', email: 'correo', ambos: 'WhatsApp y correo' }[canal];

        Swal.fire({
            title: `¿Enviar a ${seleccionados.length} paciente(s) por ${nombreCanal}?`,
            text: canal !== 'email' ? 'Los mensajes de WhatsApp se mandan con una pausa de seguridad entre cada uno para no arriesgar el número. Puede tardar varios minutos.' : 'Puede tardar unos minutos.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, enviar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (!result.isConfirmed) return;
            window.api.enviarCampanaCrm(seleccionados, mensaje, canal, asunto).then((resp) => {
                if (resp.status === 'OK') {
                    this.monitorearCampana(resp.campaignId, seleccionados.length);
                } else {
                    Swal.fire('Error', resp.message || 'No se pudo iniciar la campaña.', 'error');
                }
            });
        });
    },

    // Consulta el progreso cada 2s y actualiza la barra — así se ve en vivo que la pausa de
    // seguridad entre mensajes de WhatsApp se está respetando, en vez de quedar "a ciegas"
    // varios minutos sin saber si de verdad está mandando algo.
    monitorearCampana: function(campaignId, total) {
        const btn = document.getElementById('crm-btn-enviar-campana');
        const wrap = document.getElementById('crm-progreso-campana');
        const fill = document.getElementById('crm-progreso-fill');
        const texto = document.getElementById('crm-progreso-texto');

        if (btn) btn.disabled = true;
        wrap.style.display = 'block';
        fill.style.width = '0%';
        texto.innerText = `Enviando... 0/${total}`;

        const intervalo = setInterval(async () => {
            const estado = await window.api.getCrmCampanaEstado(campaignId);
            if (estado.status !== 'OK') { clearInterval(intervalo); return; }

            const hechos = estado.enviados + estado.fallidos;
            const pct = estado.total > 0 ? Math.round((hechos / estado.total) * 100) : 100;
            fill.style.width = pct + '%';
            texto.innerText = `Enviando... ${hechos}/${estado.total} (${estado.fallidos} fallido${estado.fallidos === 1 ? '' : 's'})`;

            if (estado.completada) {
                clearInterval(intervalo);
                if (btn) btn.disabled = false;
                texto.innerText = `Completado: ${estado.enviados} enviados, ${estado.fallidos} fallidos de ${estado.total}.`;
                Swal.fire('Campaña finalizada', `Se enviaron ${estado.enviados} de ${estado.total} mensajes (${estado.fallidos} fallidos).`, 'success');
            }
        }, 2000);
    },

    // --- 9. REPORTE ESTADÍSTICO INTELIGENTE (ventana HTML con vista previa, mismo patrón que
    // gastos.js/caja.js: window.open + document.write, con el diseño de marca de la clínica.
    // El usuario ve el reporte en pantalla y decide si lo imprime/guarda como PDF con Ctrl+P.
    generarReporte: async function() {
        const btn = document.getElementById('btn-reporte-pdf');
        const idClinica = this.getIdClinica();
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...'; }

        try {
            const [clinica, resumen, recurrencia, canales, demografia, patologias, medicos, pacientes] = await Promise.all([
                window.api.get(`/clinicas/leer/${idClinica}`),
                window.api.getCrmResumen(idClinica, this.rangoActual.inicio, this.rangoActual.fin),
                window.api.getCrmRecurrencia(idClinica),
                window.api.getCrmCanalesOrigen(idClinica, this.rangoActual.inicio, this.rangoActual.fin),
                window.api.getCrmDemografia(idClinica),
                window.api.getCrmPatologiasZona(idClinica),
                window.api.getCrmRetencionMedicos(idClinica),
                window.api.getCrmPacientes(idClinica, '')
            ]);

            const periodoTexto = (this.rangoActual.inicio && this.rangoActual.fin)
                ? `Período: ${this.formatoFechaSimple(this.rangoActual.inicio)} — ${this.formatoFechaSimple(this.rangoActual.fin)}`
                : 'Período: todo el historial';

            const serverBase = window.api.baseURL.replace('/api', '').replace(/\/$/, '');
            const logoUrl = clinica && clinica.Logo_Ruta ? `${serverBase}/uploads/logos/${clinica.Logo_Ruta}` : `${serverBase}/assets/icon.png`;
            const nombreClinica = (clinica && clinica.Nombre_Clinica) || 'Clínica';
            const self = this;
            const f = (n) => '$ ' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

            // --- Insights automáticos (frases calculadas sobre los mismos datos, sin IA) ---
            const totalCanales = (canales.canales || []).reduce((a, c) => a + c.Total, 0);
            const whatsappCanal = (canales.canales || []).find(c => c.Canal === 'WhatsApp (Bot)');
            const pctWhatsapp = totalCanales > 0 && whatsappCanal ? ((whatsappCanal.Total / totalCanales) * 100).toFixed(0) : 0;
            const cantonTop = (demografia.por_canton || [])[0];
            const patologiaTop = (patologias.top_patologias || (patologias.patologias_por_canton || []))[0];
            const medicoTop = (medicos.medicos || [])[0];

            const insights = [`El ${resumen.tasa_recurrencia}% de los pacientes con visitas registradas son recurrentes.`];
            if (whatsappCanal) insights.push(`El ${pctWhatsapp}% de las citas se originaron por el bot de WhatsApp.`);
            if (cantonTop) insights.push(`El cantón con más pacientes es ${cantonTop.Canton} (${cantonTop.Total}) — buen foco para publicidad local.`);
            if (patologiaTop) insights.push(`La condición más diagnosticada es "${patologiaTop.Texto || patologiaTop.Patologia}".`);
            if (medicoTop) insights.push(`${medicoTop.Doctor} tiene la mejor tasa de retención de pacientes (${medicoTop.Tasa_Retencion}%).`);

            const maxRec = Math.max(recurrencia['1_Visita'], recurrencia['2_a_3_Visitas'], recurrencia['4_a_6_Visitas'], recurrencia['7_o_mas_Visitas'], 1);
            const barraRec = (label, valor) => `
                <div class="barra-fila">
                    <span class="barra-label">${label}</span>
                    <div class="barra-track"><div class="barra-fill" style="width:${(valor / maxRec) * 100}%"></div></div>
                    <span class="barra-valor">${valor}</span>
                </div>`;

            const topVip = (pacientes.pacientes || []).slice(0, 10);

            const ventana = window.open('', '_blank');
            ventana.document.write(`
                <html>
                <head>
                    <title>Reporte CRM - ${nombreClinica}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                        body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; line-height: 1.4; }
                        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; }
                        .header img { max-height: 70px; max-width: 200px; object-fit: contain; }
                        .header-info { text-align: right; }
                        .header-info h2 { margin: 0; font-size: 1.4rem; font-weight: 800; }
                        .header-info p { margin: 2px 0; font-size: 0.85rem; color: #64748b; font-weight: 700; }

                        .insights { background: #eef2ff; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; }
                        .insights h4 { margin: 0 0 8px; color: #4f46e5; font-size: 0.85rem; }
                        .insights p { margin: 4px 0; font-size: 0.82rem; color: #334155; }

                        .resumen-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
                        .card { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; text-align: center; }
                        .card span { display: block; font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; }
                        .card strong { font-size: 1.1rem; color: #0f172a; }
                        .card-dark { background: #1e293b !important; } .card-dark * { color: white !important; }

                        h3 { font-size: 12px; text-transform: uppercase; border-left: 4px solid #1e293b; padding-left: 10px; margin: 25px 0 10px 0; color: #1e293b; font-weight: 800; }
                        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; }
                        th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 800; }
                        td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
                        .monto { font-weight: 700; text-align: right; }
                        .badge-vip { background: linear-gradient(135deg, #f59e0b, #ec4899); color: white; font-size: 8px; padding: 2px 6px; border-radius: 999px; font-weight: 800; }

                        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

                        .barra-fila { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
                        .barra-label { width: 110px; font-size: 9px; color: #334155; }
                        .barra-track { flex: 1; background: #f1f5f9; border-radius: 6px; height: 14px; overflow: hidden; }
                        .barra-fill { height: 100%; background: #4f46e5; }
                        .barra-valor { width: 30px; text-align: right; font-size: 9px; font-weight: 700; }

                        .no-print { text-align: center; margin-bottom: 20px; }
                        .no-print button { padding: 10px 22px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; }
                        @media print { body { padding: 0; } .no-print { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="no-print"><button onclick="window.print()"><i class="fas fa-print"></i> Imprimir / Guardar como PDF</button></div>

                    <div class="header">
                        <img src="${logoUrl}" onerror="this.style.display='none'">
                        <div class="header-info">
                            <h2>REPORTE ESTADÍSTICO INTELIGENTE</h2>
                            <p>${nombreClinica.toUpperCase()}</p>
                            <p>GENERADO: ${new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                            <p>${periodoTexto.toUpperCase()}</p>
                        </div>
                    </div>

                    <div class="insights">
                        <h4>💡 PUNTOS CLAVE</h4>
                        ${insights.map(i => `<p>• ${i}</p>`).join('')}
                    </div>

                    <div class="resumen-grid">
                        <div class="card"><span>Pacientes Activos</span><strong>${resumen.total_pacientes}</strong></div>
                        <div class="card"><span>Nuevos Este Mes</span><strong>${resumen.nuevos_este_mes}</strong></div>
                        <div class="card"><span>Ticket de Vida Prom.</span><strong>${f(resumen.ticket_vida_promedio)}</strong></div>
                        <div class="card card-dark"><span>Tasa de Recurrencia</span><strong>${resumen.tasa_recurrencia}%</strong></div>
                    </div>

                    <h3>1. Recurrencia de Pacientes</h3>
                    ${barraRec('1 visita', recurrencia['1_Visita'])}
                    ${barraRec('2 a 3 visitas', recurrencia['2_a_3_Visitas'])}
                    ${barraRec('4 a 6 visitas', recurrencia['4_a_6_Visitas'])}
                    ${barraRec('7 o más', recurrencia['7_o_mas_Visitas'])}

                    <div class="grid-2">
                        <div>
                            <h3>2. Canal de Origen</h3>
                            <table>
                                <thead><tr><th>Canal</th><th style="text-align:right">Citas</th></tr></thead>
                                <tbody>${(canales.canales || []).map(c => `<tr><td>${c.Canal}</td><td class="monto">${c.Total}</td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                        <div>
                            <h3>3. Género</h3>
                            <table>
                                <thead><tr><th>Género</th><th style="text-align:right">Pacientes</th></tr></thead>
                                <tbody>${(demografia.por_genero || []).map(g => `<tr><td>${g.Genero}</td><td class="monto">${g.Total}</td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                    </div>

                    <div class="grid-2">
                        <div>
                            <h3>4. Rango de Edad</h3>
                            <table>
                                <thead><tr><th>Rango</th><th style="text-align:right">Pacientes</th></tr></thead>
                                <tbody>${(demografia.por_edad || []).map(e => `<tr><td>${e.Rango_Edad}</td><td class="monto">${e.Total}</td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                        <div>
                            <h3>5. Cantones (dirigir publicidad)</h3>
                            <table>
                                <thead><tr><th>Cantón</th><th style="text-align:right">Pacientes</th></tr></thead>
                                <tbody>${(demografia.por_canton || []).map(c => `<tr><td>${c.Canton}</td><td class="monto">${c.Total}</td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                    </div>

                    <h3>6. Patologías Más Frecuentes por Zona</h3>
                    <table>
                        <thead><tr><th>Cantón</th><th>Patología (CIE10)</th><th style="text-align:right">Casos</th></tr></thead>
                        <tbody>
                            ${(patologias.patologias_por_canton || []).length
                                ? patologias.patologias_por_canton.map(p => `<tr><td>${p.Canton}</td><td>${p.Patologia}</td><td class="monto">${p.Total}</td></tr>`).join('')
                                : '<tr><td colspan="3">Sin diagnósticos CIE10 registrados todavía.</td></tr>'}
                        </tbody>
                    </table>

                    <h3>7. Retención de Pacientes por Médico</h3>
                    <table>
                        <thead><tr><th>Doctor</th><th style="text-align:right">Pacientes</th><th style="text-align:right">Recurrentes</th><th style="text-align:right">Retención</th></tr></thead>
                        <tbody>
                            ${(medicos.medicos || []).length
                                ? medicos.medicos.map(m => `<tr><td>${m.Doctor}</td><td class="monto">${m.Pacientes_Totales}</td><td class="monto">${m.Pacientes_Recurrentes}</td><td class="monto">${m.Tasa_Retencion}%</td></tr>`).join('')
                                : '<tr><td colspan="4">Sin datos suficientes todavía.</td></tr>'}
                        </tbody>
                    </table>

                    <h3>8. Top Pacientes por Valor (VIP)</h3>
                    <table>
                        <thead><tr><th>Paciente</th><th style="text-align:right">Visitas</th><th style="text-align:right">Total Gastado</th></tr></thead>
                        <tbody>
                            ${topVip.length
                                ? topVip.map(p => `<tr><td>${p.Nombres} ${p.Apellidos} ${p.Es_VIP ? '<span class="badge-vip">VIP</span>' : ''}</td><td class="monto">${p.Total_Visitas}</td><td class="monto">${f(p.Total_Gastado)}</td></tr>`).join('')
                                : '<tr><td colspan="3">Sin pagos registrados todavía.</td></tr>'}
                        </tbody>
                    </table>

                    <div style="margin-top:30px; text-align:center; font-size:8px; color:#94a3b8;">
                        Generado por Ametra OS - ${new Date().toLocaleString()}
                    </div>
                </body>
                </html>
            `);
            ventana.document.close();
        } catch (err) {
            console.error('🔴 Error generando reporte:', err);
            Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-pdf"></i> Generar Reporte'; }
        }
    }
};
