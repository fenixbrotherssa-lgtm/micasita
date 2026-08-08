// ==========================================
// MÓDULO: LOGIN (ESTILIZADO CON SWEETALERT Y JWT)
// ==========================================
window.loginModule = {
    tokenSoporte: null, // vive solo en memoria — nunca en localStorage, muere al recargar
    tenantsSoporte: [], // último listado traído — la búsqueda filtra esto en memoria, sin volver a pedirle al backend en cada letra
    idTenantSeleccionado: null,

    // El autocomplete de Chromium (vía Electron) repuebla campos sensibles después de que
    // la página ya cargó — un clear() síncrono en init() no alcanza porque el autofill
    // corre en un pase aparte, un rato después. Reintenta el clear en varios momentos para
    // ganarle esa carrera, sin depender de en qué versión de Electron se note más o menos.
    limpiarConReintentos: function(input) {
        if (!input) return;
        const limpiar = () => { input.value = ''; };
        limpiar();
        [50, 150, 400, 1000].forEach(ms => setTimeout(limpiar, ms));
    },

    init: function() {
        var btn = document.querySelector('.btn-login');
        if (!btn) return;

        // La contraseña NUNCA debe quedar pre-cargada (a diferencia del identificador de
        // clínica, que sí conviene recordar) — ver limpiarConReintentos arriba.
        this.limpiarConReintentos(document.getElementById('pass'));

        // Recuerda el último identificador de clínica usado en ESTE equipo — cada
        // dispositivo suele ser de una sola clínica, así que pedirlo de nuevo en cada
        // login sería fricción sin sentido; solo hace falta tocarlo si cambia. El campo
        // sigue existiendo (oculto) con el valor cargado adentro — procesarLogin lo lee
        // igual sin importar si está visible o no.
        this.aplicarClinicaGuardada();

        const linkCambiar = document.getElementById('link-cambiar-clinica');
        if (linkCambiar) {
            linkCambiar.onclick = (e) => {
                e.preventDefault();
                localStorage.removeItem('ultimo_identificador_clinica');
                document.getElementById('identificador-clinica').value = '';
                this.aplicarClinicaGuardada();
                document.getElementById('identificador-clinica').focus();
            };
        }

        btn.onclick = (e) => {
            e.preventDefault();
            this.procesarLogin();
        };

        // También permite iniciar sesión al presionar "Enter" en los campos
        const inputs = document.querySelectorAll('#identificador-clinica, #user, #pass');
        inputs.forEach(input => {
            input.onkeypress = (e) => {
                if (e.key === 'Enter') this.procesarLogin();
            };
        });

        this.initModoSoporte();
    },

    // Alterna entre el campo de texto (primera vez en este equipo) y el badge de solo
    // lectura + "(cambiar)" (ya hay un código guardado) — el input real nunca se saca del
    // DOM, solo se oculta, así procesarLogin lo puede leer igual en los dos casos.
    aplicarClinicaGuardada: function() {
        const wrap = document.getElementById('wrap-identificador-clinica');
        const badge = document.getElementById('badge-clinica-guardada');
        const badgeTexto = document.getElementById('badge-clinica-texto');
        const input = document.getElementById('identificador-clinica');
        if (!wrap || !badge || !input) return;

        const guardada = localStorage.getItem('ultimo_identificador_clinica');
        if (guardada) {
            input.value = guardada;
            badgeTexto.textContent = guardada;
            wrap.style.display = 'none';
            badge.style.display = 'block';
        } else {
            wrap.style.display = '';
            badge.style.display = 'none';
        }
    },

    // Guarda la sesión y entra al sistema — usado tanto por el login normal como por
    // "entrar como soporte" (mismo shape de respuesta: {status, token, user}), así el
    // resto de la app nunca necesita saber por cuál de los dos caminos entró alguien.
    completarLogin: function(res, mensajeBienvenida) {
        const datosSesion = res.user;
        datosSesion.token = res.token;
        localStorage.setItem('usuario_sesion', JSON.stringify(datosSesion));

        // El estado de la licencia (res.licencia) NUNCA se muestra en el login normal de
        // una clínica — solo lo ve soporte/super-admin al elegir a qué clínica entrar (ver
        // initModoSoporte más abajo). Acá se ignora a propósito.

        if (window.socketRT) {
            window.socketRT.emit('unirse-clinica', datosSesion.token);
        }

        Swal.fire({
            icon: 'success',
            title: '¡Bienvenido!',
            text: mensajeBienvenida || `Accediendo al sistema como ${res.user.Nombres}...`,
            showConfirmButton: false,
            timer: 1500,
            timerProgressBar: true
        }).then(() => {
            window.router.load('dashboard');
        });
    },

    procesarLogin: function() {
        var identificadorClinica = document.getElementById('identificador-clinica').value.trim();
        var user = document.getElementById('user').value.trim();
        var pass = document.getElementById('pass').value.trim();

        // Validación de campos vacíos con SweetAlert
        if (!identificadorClinica || !user || !pass) {
            return Swal.fire({
                icon: 'warning',
                title: 'Atención',
                text: 'Por favor, ingrese el código de su clínica, usuario y contraseña.',
                confirmButtonColor: '#4f46e5',
                background: '#ffffff',
                customClass: {
                    popup: 'border-radius-12'
                }
            });
        }

        // Mostrar un pequeño cargando para mejorar la experiencia
        Swal.showLoading();

        window.api.login({ identificador_clinica: identificadorClinica, username: user, password: pass }).then(res => {
            Swal.close(); // Cerrar el cargando

            if (res.status === 'Success') {
                // Cada equipo suele ser de una sola clínica: recordar el código evita
                // tener que volver a teclearlo en cada login desde este dispositivo.
                localStorage.setItem('ultimo_identificador_clinica', identificadorClinica);
                this.completarLogin(res);
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
    },

    // ==========================================
    // MODO SOPORTE — entrar a cualquier clínica con el login de super-admin, sin
    // necesitar la contraseña de esa clínica (ver superAdminController.js#entrarComoTenant).
    // ==========================================
    initModoSoporte: function() {
        const linkAbrir = document.getElementById('link-modo-soporte');
        const linkVolver = document.getElementById('link-volver-login');
        const cardNormal = document.querySelector('.login-3d-card');
        const cardSoporte = document.getElementById('card-soporte');
        const btnLogin = document.getElementById('btn-soporte-login');
        const btnEntrar = document.getElementById('btn-soporte-entrar');
        const inputBuscar = document.getElementById('soporte-buscar-clinica');
        const linkCrear = document.getElementById('link-crear-clinica');
        if (!linkAbrir || !cardSoporte) return;

        // Igual que #pass: nunca deben quedar pre-cargados por el autocomplete del
        // navegador (más sensible todavía acá — son las credenciales de super-admin,
        // con acceso a TODAS las clínicas). autocomplete="off" en el HTML no alcanza:
        // Chromium lo ignora bastante seguido para email/usuario, así que se refuerza acá.
        const inputSoporteEmail = document.getElementById('soporte-email');
        const inputSoportePass = document.getElementById('soporte-pass');
        const limpiarCredencialesSoporte = () => {
            this.limpiarConReintentos(inputSoporteEmail);
            this.limpiarConReintentos(inputSoportePass);
        };
        limpiarCredencialesSoporte();

        const abrirPanelSoporte = () => {
            cardNormal.style.display = 'none';
            cardSoporte.style.display = 'block';
            limpiarCredencialesSoporte();
            if (inputSoporteEmail) inputSoporteEmail.focus();
        };

        linkAbrir.onclick = (e) => {
            e.preventDefault();
            abrirPanelSoporte();
        };

        // El link "Acceso de soporte" arranca oculto (display:none en el HTML) — ningún
        // usuario de clínica debería verlo nunca. Ctrl+Alt+S solo lo REVELA; todavía hay
        // que clickearlo para entrar. Sin el atajo, no hay ningún rastro visible de que
        // el modo soporte existe.
        const wrapLinkSoporte = document.getElementById('wrap-link-modo-soporte');
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 's' && wrapLinkSoporte) {
                e.preventDefault();
                wrapLinkSoporte.style.display = 'block';
            }
        });

        linkVolver.onclick = (e) => {
            e.preventDefault();
            cardSoporte.style.display = 'none';
            cardNormal.style.display = 'block';
            // Reiniciar el flujo por si vuelve a entrar más tarde
            document.getElementById('soporte-paso-login').style.display = 'block';
            document.getElementById('soporte-paso-clinica').style.display = 'none';
            this.tokenSoporte = null;
            this.tenantsSoporte = [];
            this.idTenantSeleccionado = null;
        };

        const procesarLoginSoporte = async () => {
            const email = document.getElementById('soporte-email').value.trim();
            const pass = document.getElementById('soporte-pass').value.trim();
            if (!email || !pass) {
                return Swal.fire({ icon: 'warning', title: 'Atención', text: 'Ingresá email y contraseña de super-admin.' });
            }

            Swal.showLoading();
            const res = await window.api.loginSuperAdmin(email, pass);
            Swal.close();

            if (res.status !== 'Success') {
                return Swal.fire({ icon: 'error', title: 'Acceso denegado', text: res.message || 'Credenciales de super-admin inválidas.' });
            }
            this.tokenSoporte = res.token;

            const listado = await window.api.listarTenantsSoporte(this.tokenSoporte);
            if (listado.status !== 'Success') {
                return Swal.fire({ icon: 'error', title: 'Error', text: listado.message || 'No se pudo cargar la lista de clínicas.' });
            }
            // Lista vacía (primera clínica del sistema, o se acaba de limpiar todo) NO es un
            // error — igual hay que dejar avanzar a este paso porque "Crear clínica nueva"
            // vive ahí adentro; bloquear acá era un candado sin salida (no había forma de
            // dar de alta la primera clínica).
            this.tenantsSoporte = listado.tenants;
            this.idTenantSeleccionado = null;
            inputBuscar.value = '';
            this.renderListaClinicas(this.tenantsSoporte);

            document.getElementById('soporte-paso-login').style.display = 'none';
            document.getElementById('soporte-paso-clinica').style.display = 'block';
        };

        btnLogin.onclick = procesarLoginSoporte;
        [inputSoporteEmail, inputSoportePass].forEach(input => {
            if (!input) return;
            input.onkeypress = (e) => {
                if (e.key === 'Enter') procesarLoginSoporte();
            };
        });

        inputBuscar.oninput = () => {
            const q = inputBuscar.value.trim().toLowerCase();
            const filtrados = !q ? this.tenantsSoporte
                : this.tenantsSoporte.filter(t => t.Nombre_Empresa.toLowerCase().includes(q));
            this.renderListaClinicas(filtrados);
        };

        btnEntrar.onclick = async () => {
            if (!this.idTenantSeleccionado || !this.tokenSoporte) return;

            Swal.showLoading();
            const res = await window.api.entrarComoTenant(this.tokenSoporte, this.idTenantSeleccionado);
            Swal.close();

            if (res.status !== 'Success') {
                return Swal.fire({ icon: 'error', title: 'No se pudo entrar', text: res.message || 'Intentá de nuevo.' });
            }
            this.completarLogin(res, `Entrando como soporte a ${res.user.Nombre_Clinica}...`);
        };

        linkCrear.onclick = (e) => {
            e.preventDefault();
            if (!this.tokenSoporte) return; // no debería poder llegar acá sin haber pasado btnLogin
            this.abrirFormCrearClinica();
        };
    },

    // Alta de clínica — genera automáticamente el usuario/contraseña del administrador de
    // esa clínica (nunca se elige a mano, ver superAdminController.js#crearTenant) y al
    // terminar refresca la lista + deja la clínica nueva ya seleccionada para entrar directo.
    abrirFormCrearClinica: function() {
        Swal.fire({
            title: 'Crear clínica nueva',
            html: `
                <input id="cc-nombre" class="swal2-input" placeholder="Nombre de la clínica *">
                <input id="cc-ruc" class="swal2-input" placeholder="RUC (opcional)">
                <!-- Sin campo de identificador: el servidor lo genera random (ver
                     provisionarClinica.js) — un código elegido a mano es adivinable, y es
                     justo el campo que decide a qué base de tenant conecta cada login. -->
                <select id="cc-plan" class="swal2-input">
                    <option value="basico">Plan básico (1 sola sede)</option>
                    <option value="pro">Plan pro (más de una sede)</option>
                </select>
                <!-- Básico: 1 sede fija, sin campo que mostrar. Pro: habilita el número
                     exacto de sedes que la clínica compró (no es "ilimitado", es lo que
                     pagó — 2, 3, 4...). Ver clinicaController.js#guardarClinica, que es
                     quien de verdad hace cumplir este límite al crear una sede. -->
                <div id="cc-sedes-wrap" style="display:none; text-align:left;">
                    <label style="display:block; font-size:0.7rem; font-weight:700; color:#64748b; margin:6px 0 4px 2px;">¿CUÁNTAS SEDES COMPRÓ?</label>
                    <input id="cc-sedes" type="number" min="2" value="2" class="swal2-input" placeholder="Cantidad de sedes" style="margin:0;">
                </div>
                <hr style="margin:10px 0; border-color:#e2e8f0;">
                <input id="cc-admin-user" class="swal2-input" placeholder="Usuario del administrador *">
                <input id="cc-admin-nombres" class="swal2-input" placeholder="Nombres del administrador *">
                <input id="cc-admin-apellidos" class="swal2-input" placeholder="Apellidos del administrador *">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Crear',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            didOpen: () => {
                const selectPlan = document.getElementById('cc-plan');
                const wrapSedes = document.getElementById('cc-sedes-wrap');
                selectPlan.onchange = () => {
                    wrapSedes.style.display = selectPlan.value === 'pro' ? 'block' : 'none';
                };
            },
            preConfirm: () => {
                const plan = document.getElementById('cc-plan').value;
                // Básico: 1 sede fija, el número no se lee ni se muestra. Pro: lo que se
                // haya puesto en cc-sedes (mínimo 2 — con 1 sola sede alcanza con básico).
                const sedesPermitidas = plan === 'basico' ? 1 : Math.max(2, parseInt(document.getElementById('cc-sedes').value) || 2);

                const datos = {
                    nombreEmpresa: document.getElementById('cc-nombre').value.trim(),
                    ruc: document.getElementById('cc-ruc').value.trim() || undefined,
                    plan,
                    sedesPermitidas,
                    adminUsername: document.getElementById('cc-admin-user').value.trim(),
                    adminNombres: document.getElementById('cc-admin-nombres').value.trim(),
                    adminApellidos: document.getElementById('cc-admin-apellidos').value.trim()
                };
                if (!datos.nombreEmpresa || !datos.adminUsername || !datos.adminNombres || !datos.adminApellidos) {
                    Swal.showValidationMessage('Completá todos los campos obligatorios (*).');
                    return false;
                }
                return datos;
            }
        }).then(async (result) => {
            if (!result.isConfirmed) return;

            Swal.showLoading();
            const res = await window.api.crearTenantSoporte(this.tokenSoporte, result.value);
            Swal.close();

            if (res.status !== 'Success') {
                return Swal.fire({ icon: 'error', title: 'No se pudo crear', text: res.message || 'Intentá de nuevo.' });
            }

            // Refresca la lista para que la clínica nueva ya aparezca, y la deja preseleccionada.
            const listado = await window.api.listarTenantsSoporte(this.tokenSoporte);
            if (listado.status === 'Success') {
                this.tenantsSoporte = listado.tenants;
                this.idTenantSeleccionado = String(res.idTenant);
                document.getElementById('soporte-buscar-clinica').value = '';
                this.renderListaClinicas(this.tenantsSoporte);
                const btnEntrar = document.getElementById('btn-soporte-entrar');
                btnEntrar.disabled = false;
                btnEntrar.style.opacity = '1';
            }

            // Texto ya armado para que "Copiar" mande exactamente lo que se le pasa al
            // cliente por WhatsApp/correo — incluye el identificador porque el login normal
            // lo pide ANTES que usuario/contraseña (ver login.html); sin él la clínica no
            // puede ni intentar entrar. Viene del servidor (res.identificador), no del
            // formulario — acá ya no se elige a mano (ver provisionarClinica.js).
            const identificadorClinica = res.identificador;
            const textoParaEnviar = `Clínica: ${identificadorClinica}\nUsuario: ${res.adminUsername}\nContraseña temporal: ${res.adminPasswordTemporal}`;

            Swal.fire({
                icon: 'success',
                title: 'Clínica creada',
                html: `
                    <p>Guardá estas credenciales — la clínica las necesita para su primer ingreso:</p>
                    <p style="text-align:left; background:#f8fafc; padding:10px 14px; border-radius:8px; font-family:monospace;">
                        Clínica: <strong>${identificadorClinica}</strong><br>
                        Usuario: <strong>${res.adminUsername}</strong><br>
                        Contraseña temporal: <strong>${res.adminPasswordTemporal}</strong>
                    </p>
                    <button id="btn-copiar-credenciales" type="button" class="swal2-styled" style="background:#059669; margin-top:6px;">
                        <i class="fas fa-copy"></i> Copiar clínica, usuario y contraseña
                    </button>
                `,
                confirmButtonColor: '#4f46e5',
                didOpen: () => {
                    document.getElementById('btn-copiar-credenciales').onclick = async () => {
                        try {
                            await navigator.clipboard.writeText(textoParaEnviar);
                            const btn = document.getElementById('btn-copiar-credenciales');
                            btn.innerHTML = '<i class="fas fa-check"></i> ¡Copiado!';
                            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copiar usuario y contraseña'; }, 2000);
                        } catch (e) {
                            Swal.fire('No se pudo copiar', 'Copiá manualmente el texto de arriba.', 'warning');
                        }
                    };
                }
            });
        });
    },

    // Único lugar de todo el sistema donde se muestra el estado de la licencia — a
    // propósito (ver completarLogin más arriba: en el login normal nunca se ve).
    diasRestantes: function(fechaVencimiento) {
        if (!fechaVencimiento) return null;
        return Math.ceil((new Date(fechaVencimiento) - new Date()) / (1000 * 60 * 60 * 24));
    },

    // Panel de licenciamiento de una clínica: registrar un pago real (que renueva y
    // reactiva sola si estaba suspendida/morosa, ver superAdminController.js#registrarPago),
    // cambiar el estado a mano para casos sin pago, e historial de todo lo cobrado. Es la
    // respuesta directa a "donde le renuevo o reactivo, donde agrego el pago" — antes esto
    // no existía en ningún lado de la UI.
    abrirGestionLicencia: async function(idTenant) {
        const t = this.tenantsSoporte.find(x => String(x.ID_Tenant) === String(idTenant));
        if (!t) return;

        const dias = this.diasRestantes(t.Fecha_Vencimiento);
        const fechaTexto = t.Fecha_Vencimiento ? new Date(t.Fecha_Vencimiento).toLocaleDateString('es-EC') : '—';
        const diasTexto = dias === null ? '' : (dias >= 0 ? ` (${dias}d restantes)` : ` (${Math.abs(dias)}d vencida)`);

        await Swal.fire({
            title: t.Nombre_Empresa,
            width: 480,
            html: `
                <div style="text-align:left; font-size:0.85rem;">
                    <div style="background:#f8fafc; padding:10px 14px; border-radius:8px; margin-bottom:14px;">
                        Estado: <strong id="pl-estado-actual">${t.Estado}</strong> ·
                        Vence: <strong id="pl-fecha-actual">${fechaTexto}</strong>
                        <span id="pl-dias-restantes" style="color:#94a3b8;">${diasTexto}</span>
                    </div>

                    <div style="font-weight:700; margin-bottom:6px; color:#1e293b;">Registrar pago</div>
                    <div style="display:flex; gap:8px;">
                        <input id="pl-monto" type="number" min="0" step="0.01" class="swal2-input" placeholder="Monto USD" style="margin:0 0 8px; flex:1;">
                        <select id="pl-periodo" class="swal2-input" style="margin:0 0 8px; flex:1;">
                            <option value="30">1 mes</option>
                            <option value="90">3 meses</option>
                            <option value="180">6 meses</option>
                            <option value="365">1 año</option>
                            <option value="custom">Personalizado</option>
                        </select>
                    </div>
                    <input id="pl-periodo-custom" type="number" min="1" class="swal2-input" placeholder="Cantidad de días" style="display:none; margin-bottom:8px;">
                    <select id="pl-metodo" class="swal2-input" style="margin-bottom:8px;">
                        <option value="">Método de pago (opcional)</option>
                        <option>Transferencia</option>
                        <option>Efectivo</option>
                        <option>Tarjeta</option>
                        <option>Otro</option>
                    </select>
                    <input id="pl-referencia" class="swal2-input" placeholder="Referencia (opcional)" style="margin-bottom:8px;">
                    <button id="btn-registrar-pago" type="button" class="swal2-styled" style="background:#059669; width:100%; margin:2px 0 16px;">
                        <i class="fas fa-check"></i> Registrar pago y renovar
                    </button>

                    <div style="display:flex; gap:6px; margin-bottom:16px;">
                        <button id="btn-pl-suspender" type="button" class="swal2-styled" style="background:#d97706; flex:1; font-size:0.72rem; padding:6px;">Suspender</button>
                        <button id="btn-pl-cancelar" type="button" class="swal2-styled" style="background:#dc2626; flex:1; font-size:0.72rem; padding:6px;">Cancelar</button>
                        <button id="btn-pl-reactivar" type="button" class="swal2-styled" style="background:#4f46e5; flex:1; font-size:0.72rem; padding:6px;">Reactivar</button>
                    </div>

                    <div style="font-weight:700; margin-bottom:6px; color:#1e293b;">Historial de pagos</div>
                    <div id="pl-historial" style="max-height:160px; overflow-y:auto; font-size:0.72rem; border:1px solid #e2e8f0; border-radius:6px; padding:6px;">Cargando…</div>
                </div>
            `,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#64748b',
            didOpen: () => {
                const selPeriodo = document.getElementById('pl-periodo');
                const inputCustom = document.getElementById('pl-periodo-custom');
                selPeriodo.onchange = () => {
                    inputCustom.style.display = selPeriodo.value === 'custom' ? 'block' : 'none';
                };

                const cargarHistorial = async () => {
                    const res = await window.api.listarPagosSoporte(this.tokenSoporte, idTenant);
                    const cont = document.getElementById('pl-historial');
                    if (!cont) return; // el modal se pudo haber cerrado mientras esperaba la respuesta
                    if (res.status !== 'Success' || !res.pagos.length) {
                        cont.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:8px;">Sin pagos registrados todavía.</div>';
                        return;
                    }
                    cont.innerHTML = res.pagos.map(p => `
                        <div style="padding:5px 2px; border-bottom:1px solid #f1f5f9;">
                            <strong>$${Number(p.Monto).toFixed(2)}</strong> · ${p.Periodo_Dias}d${p.Metodo_Pago ? ' · ' + p.Metodo_Pago : ''}
                            <span style="color:#94a3b8; float:right;">${new Date(p.Fecha_Registro).toLocaleDateString('es-EC')}</span>
                            <div style="color:#94a3b8;">${p.Registrado_Por || ''}${p.Referencia ? ' · ref: ' + p.Referencia : ''}</div>
                        </div>
                    `).join('');
                };
                cargarHistorial();

                // Refresca el encabezado del modal Y la fila de fondo (this.tenantsSoporte es
                // el mismo array que renderListaClinicas ya está usando) sin cerrar el modal.
                const actualizarEstadoLocal = (estado, fecha) => {
                    t.Estado = estado;
                    if (fecha) t.Fecha_Vencimiento = fecha;
                    document.getElementById('pl-estado-actual').textContent = t.Estado;
                    document.getElementById('pl-fecha-actual').textContent = t.Fecha_Vencimiento ? new Date(t.Fecha_Vencimiento).toLocaleDateString('es-EC') : '—';
                    const d = this.diasRestantes(t.Fecha_Vencimiento);
                    document.getElementById('pl-dias-restantes').textContent = d === null ? '' : (d >= 0 ? ` (${d}d restantes)` : ` (${Math.abs(d)}d vencida)`);
                    this.renderListaClinicas(this.tenantsSoporte);
                };

                document.getElementById('btn-registrar-pago').onclick = async () => {
                    const monto = parseFloat(document.getElementById('pl-monto').value);
                    const periodoSel = selPeriodo.value;
                    const periodoDias = periodoSel === 'custom' ? parseInt(inputCustom.value) : parseInt(periodoSel);
                    if (!(monto >= 0) || !periodoDias || periodoDias < 1) {
                        return Swal.fire({ icon: 'warning', title: 'Faltan datos', text: 'Ingresá un monto válido (puede ser 0) y el período en días.' });
                    }
                    const metodoPago = document.getElementById('pl-metodo').value || undefined;
                    const referencia = document.getElementById('pl-referencia').value.trim() || undefined;

                    const btn = document.getElementById('btn-registrar-pago');
                    btn.disabled = true;
                    const res = await window.api.registrarPagoSoporte(this.tokenSoporte, idTenant, { monto, periodoDias, metodoPago, referencia });
                    btn.disabled = false;
                    if (res.status !== 'Success') {
                        return Swal.fire('Error', res.message || 'No se pudo registrar el pago.', 'error');
                    }
                    actualizarEstadoLocal(res.estado, res.fecha_vencimiento);
                    cargarHistorial();
                    document.getElementById('pl-monto').value = '';
                    document.getElementById('pl-referencia').value = '';
                };

                const cambiarEstado = async (estado) => {
                    const res = await window.api.cambiarEstadoTenantSoporte(this.tokenSoporte, idTenant, estado);
                    if (res.status !== 'Success') {
                        return Swal.fire('Error', res.message || 'No se pudo cambiar el estado.', 'error');
                    }
                    actualizarEstadoLocal(estado, null);
                };
                document.getElementById('btn-pl-suspender').onclick = () => cambiarEstado('suspendido');
                document.getElementById('btn-pl-cancelar').onclick = () => cambiarEstado('cancelado');
                document.getElementById('btn-pl-reactivar').onclick = () => cambiarEstado('activo');
            }
        });
    },

    renderListaClinicas: function(tenants) {
        const cont = document.getElementById('soporte-lista-clinicas');
        const btnEntrar = document.getElementById('btn-soporte-entrar');

        if (!tenants.length) {
            cont.innerHTML = `<div style="padding:14px; font-size:0.82rem; color:#94a3b8; text-align:center;">Sin resultados.</div>`;
            return;
        }

        cont.innerHTML = tenants.map(t => {
            const dias = this.diasRestantes(t.Fecha_Vencimiento);
            let colorEstado = '#059669', textoEstado = t.Estado; // activo, con margen: verde
            if (t.Estado !== 'activo') { colorEstado = '#dc2626'; }
            else if (dias !== null && dias <= 0) { colorEstado = '#dc2626'; textoEstado = 'vencida'; }
            else if (dias !== null && dias <= 5) { colorEstado = '#d97706'; textoEstado = `vence en ${dias}d`; }

            const seleccionada = String(t.ID_Tenant) === String(this.idTenantSeleccionado);
            return `
                <div class="fila-clinica-soporte" data-id="${t.ID_Tenant}" style="
                    padding:10px 14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;
                    border-bottom:1px solid #f1f5f9; background:${seleccionada ? '#eef2ff' : 'white'};
                ">
                    <div>
                        <div style="font-size:0.88rem; font-weight:700; color:#1e293b;">${t.Nombre_Empresa}</div>
                        <div style="font-size:0.72rem; color:#4f46e5; font-family:monospace;">
                            <i class="fas fa-hospital" style="margin-right:3px;"></i>${t.Identificador}
                            <i class="fas fa-copy copiar-identificador" data-identificador="${t.Identificador}"
                               title="Copiar identificador" style="margin-left:4px; cursor:pointer; color:#94a3b8;"></i>
                        </div>
                        <div style="font-size:0.72rem; color:#94a3b8;">
                            Plan ${t.Plan_Nombre} · ${t.Sedes_Permitidas} sede${t.Sedes_Permitidas === 1 ? '' : 's'}
                            <i class="fas fa-pen editar-sedes" data-id-editar="${t.ID_Tenant}" data-sedes-actual="${t.Sedes_Permitidas}"
                               title="Cambiar cantidad de sedes" style="margin-left:4px; cursor:pointer; color:#4f46e5;"></i>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:0.7rem; font-weight:800; color:${colorEstado}; text-transform:uppercase;">${textoEstado}</span><br>
                        <i class="fas fa-file-invoice-dollar gestionar-licencia" data-id-licencia="${t.ID_Tenant}"
                           title="Gestionar licencia / pagos" style="cursor:pointer; color:#4f46e5; margin-top:5px; display:inline-block;"></i>
                    </div>
                </div>`;
        }).join('');

        cont.querySelectorAll('.copiar-identificador').forEach(icono => {
            icono.onclick = async (e) => {
                e.stopPropagation(); // no seleccionar/entrar a la clínica al tocar el ícono
                try {
                    await navigator.clipboard.writeText(icono.getAttribute('data-identificador'));
                    const original = icono.className;
                    icono.className = 'fas fa-check copiar-identificador';
                    icono.style.color = '#059669';
                    setTimeout(() => { icono.className = original; icono.style.color = '#94a3b8'; }, 1500);
                } catch (err) {
                    Swal.fire('No se pudo copiar', 'Copiá el identificador manualmente.', 'warning');
                }
            };
        });

        cont.querySelectorAll('.editar-sedes').forEach(icono => {
            icono.onclick = async (e) => {
                e.stopPropagation(); // no seleccionar/entrar a la clínica al tocar el lápiz
                const idTenant = icono.getAttribute('data-id-editar');
                const actual = icono.getAttribute('data-sedes-actual');

                const { value: nuevo } = await Swal.fire({
                    title: 'Sedes permitidas',
                    input: 'number',
                    inputValue: actual,
                    inputAttributes: { min: 1 },
                    showCancelButton: true,
                    confirmButtonText: 'Guardar',
                    confirmButtonColor: '#4f46e5'
                });
                if (!nuevo || parseInt(nuevo) < 1) return;

                const res = await window.api.actualizarSedesPermitidasSoporte(this.tokenSoporte, idTenant, parseInt(nuevo));
                if (res.status !== 'Success') {
                    return Swal.fire('Error', res.message || 'No se pudo actualizar.', 'error');
                }
                const t = this.tenantsSoporte.find(x => String(x.ID_Tenant) === String(idTenant));
                if (t) t.Sedes_Permitidas = res.sedesPermitidas;
                this.renderListaClinicas(tenants);
            };
        });

        cont.querySelectorAll('.gestionar-licencia').forEach(icono => {
            icono.onclick = (e) => {
                e.stopPropagation(); // no seleccionar/entrar a la clínica al tocar el ícono
                this.abrirGestionLicencia(icono.getAttribute('data-id-licencia'));
            };
        });

        cont.querySelectorAll('.fila-clinica-soporte').forEach(fila => {
            fila.onclick = () => {
                this.idTenantSeleccionado = fila.getAttribute('data-id');
                btnEntrar.disabled = false;
                btnEntrar.style.opacity = '1';
                this.renderListaClinicas(
                    // re-renderiza con lo que esté filtrado ahora mismo (no siempre la lista completa)
                    document.getElementById('soporte-buscar-clinica').value.trim()
                        ? this.tenantsSoporte.filter(t => t.Nombre_Empresa.toLowerCase().includes(document.getElementById('soporte-buscar-clinica').value.trim().toLowerCase()))
                        : this.tenantsSoporte
                );
            };
        });
    }
};
