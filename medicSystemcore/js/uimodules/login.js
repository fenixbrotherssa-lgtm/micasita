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

        // También permite iniciar sesión al presionar "Enter" en los campos
        const inputs = document.querySelectorAll('#user, #pass');
        inputs.forEach(input => {
            input.onkeypress = (e) => {
                if (e.key === 'Enter') this.procesarLogin();
            };
        });
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