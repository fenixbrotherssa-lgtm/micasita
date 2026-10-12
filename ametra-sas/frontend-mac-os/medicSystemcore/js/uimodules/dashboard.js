// ==========================================
// MÓDULO: DASHBOARD (FILTRO: SOLO HOY)
// ==========================================
window.dashboardModule = {
    init: async function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return;

        try {
            const sesion = JSON.parse(sesionRaw);

            // 1. Renderizado de interfaz (Nombre, Clínica, Logo)
            this.renderInterfaz(sesion);

            // 2. Carga de estadísticas del DÍA
            await this.cargarEstadisticasHoy(sesion);

            // 3. Aviso de licencia por vencer (solo administrador)
            if (parseInt(sesion.ID_Rol || sesion.id_rol) === 1) this.avisoLicencia();

        } catch (e) {
            console.error("❌ Error en Dashboard:", e);
        }
    },

    // Desde 5 días antes de vencer, el administrador ve cuántos días le quedan a la licencia
    // y cómo renovarla. Nunca bloquea el dashboard si falla.
    avisoLicencia: async function() {
        try {
            const res = await window.api.get('/licencia/estado');
            const l = res?.data;
            const main = document.querySelector('.main-viewport');
            if (!l || !l.fecha_vencimiento || !main || document.getElementById('aviso-licencia')) return;
            const btnPagar = l.cobros_activos
                ? `<button onclick="window.licenciaPago.abrir()" style="margin-left:auto; flex-shrink:0; background:#4f46e5; color:white; border:none; border-radius:8px; padding:7px 14px; font-weight:700; cursor:pointer;">Renovar / pagar</button>`
                : '';
            if (!l.avisar) {
                // Sin urgencia: solo un acceso discreto para pagar por adelantado (varios meses).
                if (!l.cobros_activos) return;
                const fechaV = new Date(l.fecha_vencimiento).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
                const linea = document.createElement('div');
                linea.id = 'aviso-licencia';
                linea.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; gap:8px; margin:0 0 10px; font-size:12px; color:#64748b;';
                linea.innerHTML = `<i class="fas fa-shield-halved"></i> Licencia vigente hasta ${fechaV} ·
                    <a href="#" onclick="event.preventDefault(); window.licenciaPago.abrir();" style="color:#4f46e5; font-weight:700;">Renovar</a>`;
                main.prepend(linea);
                return;
            }
            const fecha = new Date(l.fecha_vencimiento).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
            const cuando = l.dias === 0 ? 'vence <b>hoy</b>' : `vence en <b>${l.dias} día${l.dias === 1 ? '' : 's'}</b>`;
            const urgente = l.dias <= 2;
            const div = document.createElement('div');
            div.id = 'aviso-licencia';
            div.style.cssText = `display:flex; align-items:center; gap:10px; margin:0 0 16px; padding:12px 16px; border-radius:12px; font-size:13px;
                background:${urgente ? '#fee2e2' : '#fef3c7'}; color:${urgente ? '#991b1b' : '#92400e'}; border:1px solid ${urgente ? '#fecaca' : '#fde68a'};`;
            div.innerHTML = `<i class="fas fa-exclamation-triangle"></i>
                <span>La licencia de su clínica ${cuando} (${fecha}). ${l.cobros_activos ? 'Renuévela para no perder el acceso.' : 'Para renovarla y no perder el acceso, contacte a CasRodsoft: WhatsApp 098 447 7183 · casrodsoft@gmail.com'}</span>${btnPagar}`;
            main.prepend(div);
        } catch (_) { /* sin aviso si el servidor no responde */ }
    },

    renderInterfaz: function(sesion) {
        const elNombreSide = document.getElementById('display-usuario-side');
        const elWelcome = document.getElementById('user-name-welcome');
        const elClinicaSide = document.getElementById('display-clinica-side');
        const elLogo = document.getElementById('clinica-logo-side');
        const elAvatar = document.getElementById('user-initial-side');

        const nombre = sesion.Nombres || sesion.nombre || 'Usuario';
        const apellido = sesion.Apellidos || sesion.apellido || '';
        const clinica = sesion.Nombre_Clinica || sesion.nombre_clinica || 'CLÍNICA';
        const rutaLogo = sesion.Logo_Ruta || sesion.logo_ruta;

        if (elNombreSide) elNombreSide.textContent = `${nombre} ${apellido}`;
        if (elWelcome) elWelcome.textContent = nombre.split(' ')[0];
        if (elClinicaSide) elClinicaSide.innerHTML = `${clinica} <span class="badge">PRO</span>`;
        if (elAvatar) elAvatar.textContent = nombre.charAt(0).toUpperCase();

        if (elLogo && rutaLogo) {
            const serverUrl = window.api.baseURL.replace('/api', '');
            elLogo.src = rutaLogo.startsWith('http') 
                ? rutaLogo 
                : `${serverUrl}/uploads/logos/${rutaLogo}`.replace(/([^:]\/)\/+/g, "$1");
        }
    },

    cargarEstadisticasHoy: async function(sesion) {
        try {
            const id_clinica = sesion.ID_Clinica || sesion.id_clinica;
            const id_rol = sesion.ID_Rol || sesion.id_rol;

            if (!id_clinica) return;

            // --- CAMBIO CLAVE: FECHA DE HOY SOLAMENTE ---
            const hoy = new Date().toISOString().split('T')[0]; 
            // Al ser inicio y fin el mismo día, el SQL filtrará solo lo de hoy
            const fechaInicio = hoy;
            const fechaFin = hoy;

            const url = `/kpi/dashboard-super-kpi?id_clinica=${id_clinica}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}&id_rol=${id_rol}`;
            
            const res = await window.api.get(url);

            if (res.status === "Success" && res.operativo) {
                const elPac = document.getElementById('count-pacientes');
                const elCit = document.getElementById('count-pendientes');

                // Ahora estos valores representarán solo los creados/agendados HOY
                if (elPac) elPac.innerText = res.operativo.pacientes_nuevos || 0;
                if (elCit) elCit.innerText = res.operativo.citas_totales || 0;
                
                console.log(`✅ Dashboard filtrado para hoy: ${hoy}`);
            } else if (res.status === "Error") {
                // El dashboard carga solo al entrar — un popup por cada fallo sería
                // molesto, así que se marca el estado directo en los contadores en vez de
                // un Swal.fire, pero ya no se queda callado sin ninguna pista.
                console.error("❌ Error del backend en dashboard-super-kpi:", res.message);
                const elPac = document.getElementById('count-pacientes');
                const elCit = document.getElementById('count-pendientes');
                if (elPac) elPac.innerText = '—';
                if (elCit) elCit.innerText = '—';
            }
        } catch (error) {
            console.error("❌ Error cargando estadísticas de hoy:", error);
        }
    }
};

// Ejecutar
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardModule.init();
});