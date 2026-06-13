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

        } catch (e) {
            console.error("❌ Error en Dashboard:", e);
        }
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