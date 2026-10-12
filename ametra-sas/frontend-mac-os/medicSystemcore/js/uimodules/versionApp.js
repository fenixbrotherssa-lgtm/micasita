// ==========================================
// CONTROL DE VERSIÓN DE LA APP (SaaS)
// El servidor es uno solo para todas las clínicas: cuando se actualiza, una app demasiado
// vieja puede dejar de funcionar. Al abrir (y cada 30 min) se consulta GET /api/version:
//  - por debajo de la mínima → bloquea hasta actualizar (Windows descarga sola, Mac por enlace);
//  - por debajo de la última → en Mac avisa (Windows ya se actualiza sola en segundo plano).
// ==========================================
window.versionApp = {
    comparar: function(a, b) {
        const pa = String(a || '0').split('.').map(n => parseInt(n) || 0);
        const pb = String(b || '0').split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pa[i] || 0) - (pb[i] || 0);
            if (d) return d > 0 ? 1 : -1;
        }
        return 0;
    },

    enlaceDescarga: function(e) {
        const info = window.appInfo || {};
        if (info.plataforma === 'darwin') return info.arquitectura === 'arm64' ? e.url_mac_arm : e.url_mac_intel;
        return e.url_windows;
    },

    revisar: async function() {
        const info = window.appInfo || {};
        if (!info.version || !window.api || !window.api.baseURL) return;
        let datos;
        try {
            const r = await fetch(window.api.baseURL + '/version');
            if (!r.ok) return;
            datos = (await r.json()).data;
        } catch (_) { return; } // sin servidor no se bloquea nada
        const e = datos && datos.escritorio;
        if (!e) return;

        if (this.comparar(info.version, e.minima) < 0) return this.bloquear(info, e);

        if (info.plataforma !== 'win32' && this.comparar(info.version, e.actual) < 0) {
            let avisado = null;
            try { avisado = sessionStorage.getItem('aviso_version_' + e.actual); } catch (_) {}
            if (avisado) return;
            try { sessionStorage.setItem('aviso_version_' + e.actual, '1'); } catch (_) {}
            const url = this.enlaceDescarga(e);
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed; right:18px; bottom:18px; z-index:9999; max-width:340px; background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; border-radius:12px; padding:12px 14px; font-size:13px; box-shadow:0 8px 24px rgba(0,0,0,.12);';
            div.innerHTML = `<b>Nueva versión ${e.actual} disponible</b><br>Usted tiene la ${info.version}.
                <div style="display:flex; gap:8px; margin-top:8px;">
                    ${url ? '<button id="va-descargar" style="background:#4f46e5; color:white; border:none; border-radius:8px; padding:6px 12px; font-weight:700; cursor:pointer;">Descargar</button>' : ''}
                    <button id="va-cerrar" style="background:none; border:none; color:#3730a3; cursor:pointer;">Más tarde</button>
                </div>`;
            document.body.appendChild(div);
            const btn = div.querySelector('#va-descargar');
            if (btn) btn.onclick = () => { window.api.abrirExterno(url); div.remove(); };
            div.querySelector('#va-cerrar').onclick = () => div.remove();
        }
    },

    // Capa propia (no Swal): cualquier otro Swal.fire de la app la reemplazaría.
    bloquear: function(info, e) {
        if (document.getElementById('bloqueo-version')) return;
        const url = this.enlaceDescarga(e);
        const esWindows = info.plataforma === 'win32';
        const capa = document.createElement('div');
        capa.id = 'bloqueo-version';
        capa.style.cssText = 'position:fixed; inset:0; z-index:2147483647; background:rgba(15,23,42,.88); display:flex; align-items:center; justify-content:center; padding:20px;';
        capa.innerHTML = `
            <div style="background:#fff; color:#1e293b; border-radius:16px; padding:28px; max-width:460px; text-align:center; font-size:15px; line-height:1.55; box-shadow:0 20px 50px rgba(0,0,0,.35);">
                <i class="fas fa-circle-arrow-up" style="font-size:44px; color:#4f46e5;"></i>
                <div style="font-size:21px; font-weight:800; margin:12px 0 8px;">Actualización obligatoria</div>
                <div>Esta versión de AMETRA OS (${info.version}) ya no es compatible con el servidor.
                     Se necesita la versión <b>${e.minima}</b> o superior.</div>
                <div style="color:#64748b; margin-top:10px;">${esWindows
                    ? 'La nueva versión se está descargando. Cuando termine, el programa le pedirá reiniciar.'
                    : 'Descargue e instale la nueva versión para continuar. Sus datos están en el servidor: no se pierde nada.'}</div>
                ${url ? `<button id="bv-descargar" style="margin-top:18px; background:#4f46e5; color:#fff; border:none; border-radius:10px; padding:11px 18px; font-weight:700; cursor:pointer;">
                    ${esWindows ? 'Descargar el instalador manualmente' : 'Descargar nueva versión'}</button>` : ''}
            </div>`;
        document.body.appendChild(capa);
        const btn = capa.querySelector('#bv-descargar');
        if (btn) btn.onclick = () => window.api.abrirExterno(url);
        if (esWindows && window._electronActualizador) window._electronActualizador.buscar();
    },

    iniciar: function() {
        setTimeout(() => this.revisar(), 3000);
        setInterval(() => this.revisar(), 30 * 60 * 1000);
    }
};
window.versionApp.iniciar();
