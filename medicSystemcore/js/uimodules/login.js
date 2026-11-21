// ==========================================
// MÓDULO: LOGIN (ESTILIZADO CON SWEETALERT Y JWT)
// ==========================================
window.loginModule = {
    init: function() {
        var btn = document.querySelector('.btn-login');
        if (!btn) return;

        btn.onclick = (e) => {
            e.preventDefault();
            this.procesarLogin();
        };

        // ⚙️ Tuerca: configurar a qué servidor se conecta esta PC
        var btnCfg = document.getElementById('btn-config-servidor');
        if (btnCfg) {
            if (!window._electronConfigServidor) btnCfg.style.display = 'none';
            else btnCfg.onclick = () => this.configurarServidor();
        }

        // También permite iniciar sesión al presionar "Enter" en los campos
        const inputs = document.querySelectorAll('#user, #pass');
        inputs.forEach(input => {
            input.onkeypress = (e) => {
                if (e.key === 'Enter') this.procesarLogin();
            };
        });
    },

    // Acepta "192.168.1.10", "192.168.1.10:8000", "SERVIDOR", "ametra.midominio.com",
    // "http://servidor:8000" o la URL completa con /api.
    // IP o nombre de red sin puntos → http + puerto 8000; dominio → https sin puerto.
    normalizarUrlServidor: function(texto) {
        var t = (texto || '').trim().replace(/\/+$/, '');
        if (!t) return '';
        if (!/^https?:\/\//i.test(t)) {
            var host = t.split('/')[0];
            var nombre = host.replace(/:\d+$/, '');
            var esLocal = /^\d{1,3}(\.\d{1,3}){3}$/.test(nombre) || nombre.indexOf('.') === -1;
            if (esLocal && !/:\d+$/.test(host)) t = t.replace(host, host + ':8000');
            t = (esLocal ? 'http://' : 'https://') + t;
        }
        if (!/\/api$/i.test(t)) t += '/api';
        return t;
    },

    configurarServidor: async function() {
        var actual = await window._electronConfigServidor.leer();
        var esc = function(s) { return String(s || '').replace(/"/g, '&quot;'); };

        var r = await Swal.fire({
            title: 'Configuración del servidor',
            html:
                '<div style="text-align:left; font-size:0.85rem;">' +
                '<label style="font-weight:700; color:#64748b;">IP o dirección del servidor</label>' +
                '<input id="cfg-api" class="swal2-input" style="margin:6px 0 4px; width:100%; box-sizing:border-box;" placeholder="Ej. 192.168.1.10" value="' + esc(actual.apiUrl) + '">' +
                '<small style="color:#94a3b8;">Si el servidor está en esta misma PC, use 127.0.0.1. Puerto por defecto: 8000.</small>' +
                '<label style="font-weight:700; color:#64748b; display:block; margin-top:14px;">Dominio público (opcional)</label>' +
                '<input id="cfg-public" class="swal2-input" style="margin:6px 0 4px; width:100%; box-sizing:border-box;" placeholder="Ej. https://recetas.miclinica.com" value="' + esc(actual.publicDomain) + '">' +
                '<small style="color:#94a3b8;">Para los enlaces públicos (recetas, firma por celular).</small>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> Guardar y reiniciar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            focusConfirm: false,
            preConfirm: () => {
                var api = this.normalizarUrlServidor(document.getElementById('cfg-api').value);
                var pub = document.getElementById('cfg-public').value.trim().replace(/\/+$/, '');
                if (!api) { Swal.showValidationMessage('Ingrese la IP o dirección del servidor'); return false; }
                try { new URL(api); } catch (e) { Swal.showValidationMessage('Dirección no válida'); return false; }
                if (pub && !/^https?:\/\//i.test(pub)) pub = 'https://' + pub;
                return { apiUrl: api, publicDomain: pub };
            }
        });
        if (!r.isConfirmed) return;
        var datos = r.value;

        // Probar que el servidor responde (cualquier respuesta HTTP sirve)
        Swal.fire({ title: 'Probando conexión...', text: datos.apiUrl, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        var responde = false;
        try {
            var ctrl = new AbortController();
            var tmr = setTimeout(() => ctrl.abort(), 5000);
            await fetch(datos.apiUrl, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
            clearTimeout(tmr);
            responde = true;
        } catch (e) { responde = false; }

        if (!responde) {
            var seguir = await Swal.fire({
                icon: 'warning',
                title: 'El servidor no responde',
                html: 'No hubo respuesta de <b>' + datos.apiUrl + '</b>.<br>¿Guardar de todas formas?',
                showCancelButton: true,
                confirmButtonText: 'Guardar igual',
                cancelButtonText: 'Corregir',
                confirmButtonColor: '#4f46e5'
            });
            if (!seguir.isConfirmed) return this.configurarServidor();
        }

        try {
            await window._electronConfigServidor.guardar(datos);
            Swal.fire({ icon: 'success', title: 'Guardado', text: 'Reiniciando Ametra OS...', showConfirmButton: false, allowOutsideClick: false });
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message, confirmButtonColor: '#4f46e5' });
        }
    },

    procesarLogin: function() {
        var user = document.getElementById('user').value.trim();
        var pass = document.getElementById('pass').value.trim();

        // Validación de campos vacíos con SweetAlert
        if (!user || !pass) {
            return Swal.fire({
                icon: 'warning',
                title: 'Atención',
                text: 'Por favor, ingrese su usuario y contraseña.',
                confirmButtonColor: '#4f46e5',
                background: '#ffffff',
                customClass: {
                    popup: 'border-radius-12'
                }
            });
        }

        // Mostrar un pequeño cargando para mejorar la experiencia
        Swal.showLoading();

        window.api.login({ username: user, password: pass }).then(res => {
            Swal.close(); // Cerrar el cargando

            if (res.status === 'Success') {
                
                // 🛡️ BÓVEDA CERRADA: Atrapamos el token JWT y lo unimos a la sesión
                const datosSesion = res.user;
                datosSesion.token = res.token; // Guardamos el pasaporte criptográfico

                // Guardamos todo en la memoria del navegador
                localStorage.setItem('usuario_sesion', JSON.stringify(datosSesion));

                // 🔌 Re-unir el socket de tiempo real a la sala de la clínica con el token
                // NUEVO. Como esta app es una SPA (no recarga la página al loguear), el
                // socket ya venía abierto desde antes y su evento 'connect' NO se vuelve a
                // disparar solo por loguearse de nuevo — sin esto, "Enviar a Firma (celular)"
                // y las actualizaciones en tiempo real seguían atadas al login anterior hasta
                // cerrar TODA la app (no solo la sesión). Mismo arreglo que ya tiene el celular
                // en ametra-mobile/src/core/socket.js (socketRT.reunirse()).
                if (window.socketRT) {
                    window.socketRT.emit('unirse-clinica', datosSesion.token);
                }

                // Notificación elegante de éxito
                Swal.fire({
                    icon: 'success',
                    title: '¡Bienvenido!',
                    text: `Accediendo al sistema como ${res.user.Nombres}...`,
                    showConfirmButton: false,
                    timer: 1500,
                    timerProgressBar: true
                }).then(() => {
                    window.router.load('dashboard');
                });

            } else { 
                // Error de credenciales
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: res.message || "Credenciales incorrectas. Intente de nuevo.",
                    confirmButtonColor: '#4f46e5'
                });
            }
        }).catch(err => {
            console.error("Error en login:", err);
            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                text: 'No se pudo establecer comunicación con el servidor CasRodsoft.',
                confirmButtonColor: '#4f46e5'
            });
        });
    }
};