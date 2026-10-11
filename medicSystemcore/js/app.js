// ==========================================================
// Router SPA - ASISTENTE INTEGRAL "MINI DOCTOR" (OPTIMIZADO)
// ==========================================================
console.log("✅ app.js v3 cargado (fix Mini Doctor + arranque)");

window.router = {
    currentPatientId: null,
    currentTool: 'Caries',
    catalogoPrestaciones: [],
    
    iaState: {
        ultimoModulo: null,
        ultimoPaciente: null,
        ultimaConsulta: 0,
        esperaMinima: 30000, // 🔥 Subido a 30s
        cargando: false
    },

    load: function(view, params) {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        const sesion = sesionRaw ? JSON.parse(sesionRaw) : null;

        // 🔧 FIX MINI DOCTOR: mostrar/ocultar el wrapper en CADA navegación.
        // En 'login' (o sin sesión) se oculta; en cualquier otra vista con
        // sesión se muestra. Esto arregla que la burbuja no aparezca tras el
        // login (el wrapper quedaba en display:none desde el arranque).
        const miniDoc = document.getElementById('mini-doctor-wrapper');
        if (miniDoc) {
            miniDoc.style.display = (view === 'login' || !sesion) ? 'none' : 'flex';
        }

        if (sesion) {
            const idRol = parseInt(sesion.ID_Rol || sesion.id_rol || 0);
            document.body.setAttribute('data-user-role', idRol);
            
            // 1. APLICAR OCULTAMIENTO DE MENÚ (Solo Admin Rol 1 ve todo)
            this.aplicarPermisosInterfaz(idRol);

            // 2. BLOQUEO DE NAVEGACIÓN (Seguridad)
            const vistasSoloAdmin = ['usuarios', 'sucursales', 'gastos', 'kpi', 'reportes', 'crm', 'comisiones', 'nomina'];
            if (idRol !== 1 && vistasSoloAdmin.includes(view)) {
                console.warn("🚫 Acceso denegado a:", view);
                return this.load('dashboard'); 
            }
        }

        params = params || {};
        var self = this;
        var root = document.getElementById('app-root');
        if (!root) return;

        // Guarda de dónde veníamos ANTES de pisarlo, para que vistas como Historia Clínica
        // puedan volver con router.volver() a lo que el usuario estaba haciendo (ej. un
        // segmento de CRM ya armado) en vez de mandarlo siempre a un destino fijo.
        // OJO: si esta navegación es en sí un volver() (ej. Pagos → Ficha), NO hay que volver
        // a grabar "Pagos" como vistaAnterior — volver() ya la limpió a propósito. Sin este
        // guard, load() la pisaba de nuevo con la vista que se estaba dejando, y al salir de
        // la Ficha después el doctor terminaba regresando a Pagos en vez de a donde quería.
        if (this.currentView && this.currentView !== view && !this._navegandoAtras) {
            this.vistaAnterior = { view: this.currentView, params: this.paramsActuales || {} };
        }
        this._navegandoAtras = false;
        this.currentView = view;
        this.paramsActuales = params;

        if (params.id_paciente) {
            this.currentPatientId = params.id_paciente;
        } else if (params.id) {
            this.currentPatientId = params.id;
        }

        var fileName = view;
        if (view === 'historia_clinica') fileName = 'historiaclinica';
        if (view === 'reportes' || view === 'kpi') fileName = 'kpi';

        fetch('./views/' + fileName + '.html')
            .then(res => {
                if (!res.ok) throw new Error('No se encontró la vista: ' + fileName);
                return res.text();
            })
            .then(html => {
                root.innerHTML = html;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        self.initView(view, params);
                    });
                });
            })
            .catch(err => {
                console.error('🔴 Error:', err);
                if (view !== 'dashboard') self.load('dashboard');
            });
    },

    // Vuelve a la vista desde la que se navegó (ej. Historia Clínica → CRM en vez de
    // siempre a Pacientes), o al dashboard si no hay ninguna registrada.
    volver: function() {
        if (this.vistaAnterior) {
            const destino = this.vistaAnterior;
            this.vistaAnterior = null; // evita ida-y-vuelta infinita si el destino también "vuelve"
            this._navegandoAtras = true; // le avisa a load() que no vuelva a grabar esta salida
            this.load(destino.view, destino.params);
        } else {
            this.load('dashboard');
        }
    },

    // Nueva función para ocultar botones del menú lateral según el Rol
    aplicarPermisosInterfaz: function(idRol) {
        // IDs de los botones en el index.html que queremos proteger
        const elementosProtegidos = [
            'btn-menu-usuarios', 
            'btn-menu-sucursales', 
            'nav-gastos', 
            'nav-kpi'
        ];

        elementosProtegidos.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Si el rol es 1 (Administrador) se muestra, si no, se oculta
                el.style.display = (idRol === 1) ? 'flex' : 'none';
            }
        });
    },

    initView: function(view, params) {
        const id = params.id_paciente || params.id || this.currentPatientId;
        
        this.notificarCambioModuloIA(view, id);

        switch(view) {
            case 'login': if(window.loginModule) window.loginModule.init(); break;
            case 'dashboard': if(window.dashboardModule) window.dashboardModule.init(); break;
            case 'pacientes': if(window.pacientesModule) window.pacientesModule.init(); break;
            case 'historia_clinica': if(window.historiaModule) window.historiaModule.init(id); break;
            case 'odontograma': if(window.odontogramaModule) window.odontogramaModule.init(id); break;
            case 'tratamientos': if(window.tratamientosModule) window.tratamientosModule.init(id); break;
            case 'sucursales': if(window.sucursalesModule) window.sucursalesModule.init(); break;
            case 'usuarios': if(window.usuariosModule) window.usuariosModule.init(); break;
            case 'citas': if(window.citasModule) window.citasModule.init(); break;
            case 'caja': if(window.cajaModule) window.cajaModule.init(); break;
            case 'gastos': if(window.gastosModule) window.gastosModule.init(); break;
            case 'inventario': if(window.inventarioModule) window.inventarioModule.init(); break;
            case 'kpi':
            case 'reportes': if(window.kpiModule) window.kpiModule.init(); break;
            case 'pagos': if(window.cargarDatosDePago) window.cargarDatosDePago(id, params.plan); break;
            case 'facturacion': if(window.facturacionModule) window.facturacionModule.init(); break;
            case 'crm': if(window.crmModule) window.crmModule.init(); break;
            case 'comisiones': if(window.comisionesModule) window.comisionesModule.init(); break;
            case 'nomina': if(window.personalModule) window.personalModule.init(); break;
            case 'manual': if(window.manualModule) window.manualModule.init(); break;
        }
    },

    notificarCambioModuloIA: async function(modulo, id_referencia) {
        const ahora = Date.now();
        if (modulo === 'login') return;
        if (this.iaState.cargando) return;
        if (
            modulo === this.iaState.ultimoModulo &&
            id_referencia === this.iaState.ultimoPaciente &&
            (ahora - this.iaState.ultimaConsulta) < this.iaState.esperaMinima
        ) {
            return;
        }

        try {
            this.iaState.cargando = true;
            const sesionRaw = localStorage.getItem('usuario_sesion');
            if (!sesionRaw) return;
            const sesion = JSON.parse(sesionRaw);

            const bubble = document.getElementById('mini-doctor-bubble');
            const text = document.getElementById('mini-doctor-text');

            // 🔧 FIX: si la burbuja aún no está en el DOM (arranque en frío),
            // reintenta UNA vez en 400ms en lugar de abortar en silencio.
            if (!bubble || !text) {
                if (!this._iaRetry) {
                    this._iaRetry = true;
                    setTimeout(() => {
                        this._iaRetry = false;
                        this.notificarCambioModuloIA(modulo, id_referencia);
                    }, 400);
                }
                return;
            }

            bubble.style.display = "block";
            text.innerText = "...";

            let contexto = {
                id_referencia: id_referencia,
                id_clinica: sesion.ID_Clinica || sesion.id_clinica
            };

            if (id_referencia) {
                contexto.paciente_actual =
                    document.querySelector('.paciente-info-header h2')?.innerText || null;
            }

            const payload = {
                usuario: { 
                    nombre: sesion.Nombres || sesion.username, 
                    rol: sesion.rol || "Personal" 
                },
                modulo_actual: modulo,
                contexto: contexto
            };

            const respuesta = await fetch(window.api.baseURL + '/ia/saludo-entorno', {
                method: 'POST',
                // 🛡️ Token JWT añadido (ruta protegida): mantiene Content-Type y suma Authorization
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.api.getToken()}` },
                body: JSON.stringify(payload)
            });

            const data = await respuesta.json();

            if (data.status === "Success" && data.mensaje) {
                this.iaState.ultimaConsulta = Date.now();
                this.iaState.ultimoModulo = modulo;
                this.iaState.ultimoPaciente = id_referencia;
                text.innerText = data.mensaje;
                const tiempoLectura = data.mensaje.length > 100 ? 15000 : 8000;
                setTimeout(() => { bubble.style.display = "none"; }, tiempoLectura);
            }
        } catch (error) {
            console.warn("Mini Doctor dormido");
        } finally {
            this.iaState.cargando = false;
        }
    }
};

window.cerrarSesion = function() {
    localStorage.removeItem('usuario_sesion');
    document.body.removeAttribute('data-user-role');
    window.location.reload();
};

// ==========================================================
// ⚠️ ARRANQUE: ya NO va aquí.
// El arranque de la SPA lo controla el bootstrap de index.html,
// que llama a window.router.load(...) en cuanto este archivo
// (y el resto del núcleo) terminan de cargar. Así evitamos la
// doble carrera con el evento 'load' y los scripts del backend.
// ==========================================================

// ==========================================================
// ESCUCHADOR DE TIEMPO REAL (SOCKET.IO) — VERSIÓN RESILIENTE
// No asume que 'io' o 'window.api' ya existan: espera por ellos
// y reintenta solo. Nunca rompe el arranque ni se cuelga si el
// backend está frío.
// ==========================================================
(function initRealtime() {
    function conectar() {
        if (typeof io === 'undefined' || !window.api || !window.api.baseURL) {
            // socket.io.js (del backend) o api.js aún no están listos → reintenta.
            return setTimeout(conectar, 600);
        }

        const socketURL = window.api.baseURL.replace('/api', '');
        let socket;
        try {
            socket = io(socketURL, { reconnection: true, reconnectionDelay: 2000 });
        } catch (e) {
            console.warn("Socket.io aún no disponible:", e.message);
            return setTimeout(conectar, 1500);
        }

        window.socketRT = socket; // expuesto para que otros módulos (ej. Firmar desde el celular) reusen esta misma conexión

        socket.on('connect', () => {
            // Sin esto, este socket nunca entra a la sala 'clinica-X' del backend — el
            // celular sí se unía (core/socket.js) y por eso "solicitar-firma" SÍ le llegaba,
            // pero "firma-recibida" es un broadcast A esa sala, y el escritorio nunca estaba
            // adentro para recibirlo de vuelta. Quedaba pegado en "Esperando firma..." aunque
            // el celular ya hubiera firmado.
            try {
                const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
                // El backend verifica este MISMO token y saca la clínica de ahí — no confía
                // en un id_clinica suelto (ver server.js).
                if (sesion.token) socket.emit('unirse-clinica', sesion.token);
            } catch (e) {}

            console.log("🌐 [RealTime]: Conectado al servidor de actualizaciones.");
        });

        socket.on('connect_error', () => {
            // Backend frío o caído: socket.io reintenta solo, no hacemos nada.
        });

        // Antes, si el token de esta sesión ya había vencido, el backend se lo tragaba
        // en silencio: el socket quedaba "conectado" pero sin unirse a ninguna sala, y
        // "Enviar a Firma (celular)" se quedaba pegado en "Esperando firma..." para
        // siempre, sin ningún error visible (así fue el bug de hoy). Ahora el backend
        // avisa explícitamente y acá forzamos un relogin en vez de quedar colgado.
        socket.on('clinica-error', () => {
            console.warn("🔐 [RealTime]: Sesión vencida o inválida, cerrando sesión...");
            alert('Tu sesión venció. Volvé a iniciar sesión para seguir usando "Enviar a Firma (celular)" y las actualizaciones en tiempo real.');
            if (typeof window.cerrarSesion === 'function') window.cerrarSesion();
        });

        socket.on('db-update', (data) => {
            const moduloActual = window.router.iaState.ultimoModulo;
            if (data.modulo === moduloActual) {
                console.log(`🔄 Cambio detectado en ${data.modulo}. Refrescando vista...`);
                window.router.initView(moduloActual, { 
                    id: data.id_referencia || window.router.currentPatientId 
                });

                if (window.notificarIA) {
                    window.notificarIA("He actualizado los datos automáticamente.");
                }
            }
        });
    }

    conectar();
})();