// ==========================================
// MÓDULO: BUSINESS INTELLIGENCE (KPI) - MULTI-CLÍNICA AVANZADO
// ==========================================
window.kpiModule = {
    clinicasCargadas: false,

    init: async function() {
        console.log("📊 Inicializando Super KPI Avanzado (Motor Dinámico)...");
        this.clinicasCargadas = false;
        this.establecerFechasDefault();
        this.verificarRolAdmin();
        setTimeout(() => this.cargarMetricas(), 150);
    },

    establecerFechasDefault: function() {
        const ahora = new Date();
        const primero = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];
        const hoy = ahora.toISOString().split('T')[0];
        const fIn = document.getElementById('kpi-fecha-inicio');
        const fFin = document.getElementById('kpi-fecha-fin');
        if (fIn) fIn.value = primero;
        if (fFin) fFin.value = hoy;
    },

    verificarRolAdmin: function() {
        const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
        const esAdmin = (sesion.ID_Rol === 1 || sesion.id_rol === 1);
        const container = document.getElementById('container-selector-clinica');
        if (esAdmin && container) container.style.display = 'flex';
    },

    // Formato de moneda reutilizable
    fmt: function(val) {
        return `$${(parseFloat(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    // Motor de interpolación matemática para animar valores en UI
    animarNumeros: function(id_elemento, valor_final, es_moneda = false, sufijo = '') {
        const el = document.getElementById(id_elemento);
        if (!el) return;
        
        const duracion = 750; // ms
        const fps = 30;
        const totalFrames = Math.round(duracion / (1000 / fps));
        const incremento = valor_final / totalFrames;
        
        let valorActual = 0;
        let frameActual = 0;

        const timer = setInterval(() => {
            valorActual += incremento;
            frameActual++;
            
            if (frameActual >= totalFrames) {
                valorActual = valor_final;
                clearInterval(timer);
            }
            
            if (es_moneda) {
                el.innerText = this.fmt(valorActual);
            } else {
                const procesado = Number.isInteger(valor_final) ? Math.floor(valorActual) : valorActual.toFixed(1);
                el.innerText = procesado + sufijo;
            }
        }, 1000 / fps);
    },

    cargarMetricas: async function() {
        try {
            const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
            const id_rol = sesion.ID_Rol || sesion.id_rol || 0;

            const selectorCli = document.getElementById('kpi-selector-clinica');
            const id_clinica = (selectorCli && selectorCli.value) ? selectorCli.value : (sesion.ID_Clinica || sesion.id_clinica || 0);

            const fIn = document.getElementById('kpi-fecha-inicio').value;
            const fFin = document.getElementById('kpi-fecha-fin').value;

            const url = `/kpi/dashboard-super-kpi?id_clinica=${id_clinica}&fecha_inicio=${fIn}&fecha_fin=${fFin}&id_rol=${id_rol}`;
            const data = await window.api.get(url);

            if (data.status === "Error") throw new Error(data.message);

            if (data.clinicas && !this.clinicasCargadas) {
                this.llenarSelectorClinicas(data.clinicas, id_clinica);
            }

            this.actualizarUI(data);
            this.renderTendencia(data.tendencia || {});
            this.renderMetodos(data.metodos_pago || []);
            this.renderServicios(data.top_servicios || []);
            this.renderDoctores(data.doctores || []);
            this.renderDeudores(data.top_deudores || []);

        } catch (error) {
            console.error("🔴 Error BI:", error);
            if (window.Swal) Swal.fire("Error", "Error al sincronizar datos de BI.", "error");
        }
    },

    actualizarUI: function(data) {
        const fin = data.financiero || {};
        const ope = data.operativo || {};

        // Inyección dinámica de valores interpolados
        this.animarNumeros('kpi-ingresos', parseFloat(fin.ingresos) || 0, true);
        this.animarNumeros('kpi-gastos', parseFloat(fin.gastos) || 0, true);
        this.animarNumeros('kpi-balance', parseFloat(fin.balance) || 0, true);
        this.animarNumeros('kpi-ticket', parseFloat(fin.ticket_promedio) || 0, true);
        this.animarNumeros('kpi-cartera', parseFloat(fin.cartera_pendiente) || 0, true);
        
        this.animarNumeros('kpi-citas', parseFloat(ope.efectividad_citas) || 0, false, '%');
        this.animarNumeros('kpi-cancelacion', parseFloat(ope.tasa_cancelacion) || 0, false, '%');
        this.animarNumeros('kpi-pacientes', parseInt(ope.pacientes_nuevos) || 0, false);
        this.animarNumeros('kpi-stock', parseInt(ope.stock_alerta) || 0, false);

        // Color condicional del balance
        const elBal = document.getElementById('kpi-balance');
        if (elBal) elBal.style.color = (parseFloat(fin.balance) || 0) < 0 ? '#dc2626' : '#059669';
    },

    llenarSelectorClinicas: function(clinicas, idSeleccionado) {
        const selector = document.getElementById('kpi-selector-clinica');
        if (!selector) return;
        selector.innerHTML = clinicas.map(c => `
            <option value="${c.ID_Clinica}" ${parseInt(c.ID_Clinica) === parseInt(idSeleccionado) ? 'selected' : ''}>
                ${c.Nombre_Clinica}
            </option>
        `).join('');
        this.clinicasCargadas = true;
    },

    // --- GRÁFICO: TENDENCIA INGRESOS vs GASTOS (LÍNEA) ---
    renderTendencia: function(tendencia) {
        const ctx = document.getElementById('chart-tendencia');
        if (!ctx) return;
        if (window.chartTendencia instanceof Chart) window.chartTendencia.destroy();

        const ing = tendencia.ingresos_por_dia || [];
        const gas = tendencia.gastos_por_dia || [];

        const fechasSet = new Set([...ing, ...gas].map(r => (r.Dia || '').toString().split('T')[0]));
        const fechas = Array.from(fechasSet).filter(Boolean).sort();

        const mapaIng = {}; ing.forEach(r => { mapaIng[(r.Dia || '').toString().split('T')[0]] = parseFloat(r.Total) || 0; });
        const mapaGas = {}; gas.forEach(r => { mapaGas[(r.Dia || '').toString().split('T')[0]] = parseFloat(r.Total) || 0; });

        const etiquetas = fechas.map(f => {
            const [y, m, d] = f.split('-');
            return `${d}/${m}`;
        });

        window.chartTendencia = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: etiquetas.length ? etiquetas : ['Sin datos'],
                datasets: [
                    {
                        label: 'Ingresos',
                        data: fechas.map(f => mapaIng[f] || 0),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true, tension: 0.35, borderWidth: 3, pointRadius: 3
                    },
                    {
                        label: 'Gastos',
                        data: fechas.map(f => mapaGas[f] || 0),
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244,63,94,0.08)',
                        fill: true, tension: 0.35, borderWidth: 3, pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 1200, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    },

    // --- GRÁFICO: MÉTODOS DE PAGO (DONA) ---
    renderMetodos: function(metodos) {
        const ctx = document.getElementById('chart-metodos');
        if (!ctx) return;
        if (window.chartMetodos instanceof Chart) window.chartMetodos.destroy();

        const colores = {
            'Efectivo': '#10b981', 'Transferencia': '#0ea5e9',
            'Tarjeta': '#8b5cf6', 'Otro': '#94a3b8'
        };
        const labels = metodos.map(m => m.Metodo);
        const valores = metodos.map(m => parseFloat(m.Total) || 0);

        window.chartMetodos = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Sin datos'],
                datasets: [{
                    data: valores.length ? valores : [1],
                    backgroundColor: labels.length ? labels.map(l => colores[l] || '#cbd5e1') : ['#e2e8f0'],
                    borderWidth: 2, borderColor: '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                animation: { animateScale: true, animateRotate: true, duration: 1000 },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (c) => `${c.label}: $${(c.raw || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        }
                    }
                }
            }
        });
    },

    // --- GRÁFICO: TOP SERVICIOS (BARRAS) ---
    renderServicios: function(servicios) {
        const ctx = document.getElementById('chart-servicios');
        if (!ctx) return;
        if (window.chartServicios instanceof Chart) window.chartServicios.destroy();

        const labels = servicios.map(s => s.Nombre_Tratamiento);
        const valores = servicios.map(s => parseFloat(s.Total_Generado) || 0);

        window.chartServicios = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sin datos'],
                datasets: [{
                    label: 'Generado',
                    data: valores.length ? valores : [0],
                    backgroundColor: ['#4f46e5', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                animation: { duration: 1000, easing: 'easeOutBounce' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => `$${(c.raw || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        }
                    }
                },
                scales: { x: { beginAtZero: true } }
            }
        });
    },

    // --- TABLA: RANKING DE DOCTORES ---
    renderDoctores: function(doctores) {
        const tbody = document.getElementById('tabla-doctores-body');
        if (!tbody) return;

        if (!doctores.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">Sin actividad de doctores en este rango</td></tr>`;
            return;
        }

        const medallas = ['🥇', '🥈', '🥉'];
        tbody.innerHTML = doctores.map((d, i) => `
            <tr style="border-top: 1px solid #f1f5f9; transition: background 0.3s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
                <td style="padding:12px 8px; font-weight:800; color:#4f46e5; font-size:1.1rem;">${medallas[i] || (i + 1)}</td>
                <td style="padding:12px 8px; font-weight:600; color:#1e293b;">Dr(a). ${d.Doctor || 'N/A'}</td>
                <td style="padding:12px 8px; text-align:center; color:#334155; font-weight:700;">${d.Pacientes_Unicos || 0}</td>
                <td style="padding:12px 8px; text-align:center; color:#334155;">
                    <span style="color:#059669; font-weight:700;">${d.Citas_Atendidas || 0}</span>
                    <span style="color:#94a3b8;"> / ${d.Citas_Totales || 0}</span>
                </td>
                <td style="padding:12px 8px; text-align:right; font-weight:800; color:#059669;">${this.fmt(d.Ingresos_Generados)}</td>
            </tr>
        `).join('');
    },

    // --- LISTA: TOP DEUDORES ---
    renderDeudores: function(deudores) {
        const cont = document.getElementById('lista-deudores');
        if (!cont) return;

        if (!deudores.length) {
            cont.innerHTML = `<p style="color:#94a3b8; font-size:13px; text-align:center; padding:20px;">Sin cartera pendiente 🎉</p>`;
            return;
        }

        cont.innerHTML = deudores.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:11px 0; border-bottom:1px solid #f1f5f9; transition: transform 0.2s;" onmouseover="this.style.transform='translateX(5px)'" onmouseout="this.style.transform='translateX(0)'">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div style="width:34px; height:34px; border-radius:50%; background:#fee2e2; color:#dc2626; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">
                        ${(d.Paciente || '?').charAt(0).toUpperCase()}
                    </div>
                    <span style="font-size:13px; font-weight:600; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${d.Paciente || 'N/A'}</span>
                </div>
                <span style="font-size:13px; font-weight:800; color:#dc2626; flex-shrink:0; margin-left:8px;">${this.fmt(d.Saldo)}</span>
            </div>
        `).join('');
    }
};