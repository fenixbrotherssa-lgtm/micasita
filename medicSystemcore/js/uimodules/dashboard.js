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

            // 3. Aviso de actualización del servidor (solo administrador)
            if (parseInt(sesion.ID_Rol || sesion.id_rol) === 1) this.avisoActualizacionServidor();

        } catch (e) {
            console.error("❌ Error en Dashboard:", e);
        }
    },

    // El servidor se actualiza solo a las 23:30; este aviso permite instalar antes o ver
    // si una actualización fue revertida. Nunca bloquea el dashboard si falla.
    avisoActualizacionServidor: async function() {
        try {
            const res = await window.api.get('/sistema/estado');
            const e = res?.data;
            const main = document.querySelector('.main-viewport');
            if (!e || !main || document.getElementById('aviso-actualizacion')) return;
            let html = '';
            if (e.preparada) {
                html = `<i class="fas fa-cloud-download-alt"></i>
                    <span><b>Actualización ${e.preparada} lista</b> para el servidor (actual ${e.version}). Se instalará sola a las 23:30.${e.notasPreparada ? ` <small>${String(e.notasPreparada).replace(/</g, '&lt;')}</small>` : ''}</span>
                    <button onclick="window.dashboardModule.instalarActualizacionServidor()" style="margin-left:auto; background:#4f46e5; color:white; border:none; border-radius:8px; padding:7px 14px; font-weight:700; cursor:pointer;">Instalar ahora</button>`;
            } else if (e.ultimoError && /revertida|rechaz/i.test(e.ultimoError)) {
                html = `<i class="fas fa-exclamation-triangle"></i><span>${String(e.ultimoError).replace(/</g, '&lt;')} El sistema sigue funcionando con la versión ${e.version}.</span>`;
            }
            if (!html) return;
            const div = document.createElement('div');
            div.id = 'aviso-actualizacion';
            div.style.cssText = `display:flex; align-items:center; gap:10px; margin:0 0 16px; padding:12px 16px; border-radius:12px; font-size:13px;
                background:${e.preparada ? '#eef2ff' : '#fef3c7'}; color:${e.preparada ? '#3730a3' : '#92400e'}; border:1px solid ${e.preparada ? '#c7d2fe' : '#fde68a'};`;
            div.innerHTML = html;
            main.prepend(div);
        } catch (_) { /* sin aviso si el servidor no responde */ }
    },

    instalarActualizacionServidor: async function() {
        const c = await Swal.fire({
            icon: 'question', title: '¿Instalar la actualización ahora?',
            text: 'El servidor se reiniciará (alrededor de 1 minuto). Avise a quienes estén usando el sistema en otras PCs.',
            showCancelButton: true, confirmButtonText: 'Sí, instalar', cancelButtonText: 'Cancelar', confirmButtonColor: '#4f46e5'
        });
        if (!c.isConfirmed) return;
        const r = await window.api.post('/sistema/instalar-actualizacion', {});
        if (r.status !== 'Success') return Swal.fire('Atención', r.message, 'info');
        Swal.fire({ icon: 'info', title: 'Instalando...', text: 'El sistema se reconectará solo en un momento.', timer: 60000, timerProgressBar: true, showConfirmButton: false });
        // Espera a que el servidor vuelva y recarga
        const esperar = async () => {
            const ok = await window.api.get('/sistema/estado').then(x => x?.status === 'Success').catch(() => false);
            if (ok) { Swal.close(); location.reload(); } else setTimeout(esperar, 5000);
        };
        setTimeout(esperar, 15000);
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