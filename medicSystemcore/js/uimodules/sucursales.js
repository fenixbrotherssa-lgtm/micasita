/// ==========================================
// MÓDULO: SUCURSALES (SISTEMA DE LOGOS, GPS Y DATOS SRI)
// ==========================================
window.sucursalesModule = {
    init: async function() {
        console.log("🏥 Inicializando Módulo de Sucursales...");
        try {
            const clinicas = await window.api.get('/clinicas/listar');
            const tbody = document.getElementById('tabla-sucursales-body');
            
            const serverBase = window.api.baseURL ? window.api.baseURL.slice(0, -4) : '';

            if (tbody && Array.isArray(clinicas)) {
                tbody.innerHTML = clinicas.map(c => {
                    let logoUrl = 'assets/icon.png';
                    if (c.Logo_Ruta && !c.Logo_Ruta.includes('file:///')) {
                        logoUrl = c.Logo_Ruta.startsWith('http') 
                            ? c.Logo_Ruta 
                            : `${serverBase}/uploads/logos/${c.Logo_Ruta}`;
                    }

                    const tieneGPS = (c.Latitud && c.Longitud) ? 
                        `<i class="fas fa-map-marker-alt" style="color:#22c55e" title="GPS Configurado"></i>` : 
                        `<i class="fas fa-map-marker-alt" style="color:#cbd5e1" title="Sin GPS"></i>`;

                    return `
                        <tr>
                            <td>
                                <img src="${logoUrl}" 
                                     onerror="this.src='assets/icon.png'"
                                     style="width:38px; height:38px; border-radius:8px; border:1px solid #e2e8f0; object-fit:contain; background:#f8fafc">
                            </td>
                            <td><strong>${c.Nombre_Clinica}</strong><br><small style="color:#64748b">${c.Regimen_Rimpe || ''}</small></td>
                            <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px">${c.RUC || 'N/A'}</code></td>
                            <td>${tieneGPS} ${c.Ciudad || ''}</td>
                            <td><span class="badge-estado ${c.Activo ? 'estado-activo' : 'estado-inactivo'}">
                                ${c.Activo ? 'Activa' : 'Inactiva'}</span>
                            </td>
                            <td style="text-align:center">
                                <button class="btn-action" onclick="window.prepararEdicion(${c.ID_Clinica})" 
                                        style="background:#4f46e5; border:none; padding:8px; border-radius:6px; cursor:pointer; color:white;">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        } catch(e) {
            console.error("🔴 Error al listar clínicas:", e);
        }

        clearInterval(window._botEstadoInterval);
        window.actualizarEstadoBot();
        window._botEstadoInterval = setInterval(window.actualizarEstadoBot, 5000);
    }
};

// --- SERVICIOS/ESPECIALIDADES Y HORARIOS (configurables por sede, ya no hardcodeados en el bot) ---
const DIAS_SEMANA = [
    { dia: 1, nombre: 'Lunes' },
    { dia: 2, nombre: 'Martes' },
    { dia: 3, nombre: 'Miércoles' },
    { dia: 4, nombre: 'Jueves' },
    { dia: 5, nombre: 'Viernes' },
    { dia: 6, nombre: 'Sábado' },
    { dia: 7, nombre: 'Domingo' }
];

let _catalogoEspecialidades = [];
let _especialidadesSeleccionadas = new Set();

function renderEspecialidadesChips() {
    const cont = document.getElementById('s-especialidades-lista');
    if (!cont) return;
    if (!_catalogoEspecialidades.length) {
        cont.innerHTML = '<small style="color:#94a3b8">Sin especialidades en el catálogo todavía. Agrega la primera abajo.</small>';
        return;
    }
    cont.innerHTML = _catalogoEspecialidades.map(e => {
        const activo = _especialidadesSeleccionadas.has(e.ID_Especialidad);
        return `
            <label class="chip-especialidad ${activo ? 'activo' : ''}">
                <input type="checkbox" ${activo ? 'checked' : ''} onchange="window.toggleEspecialidad(${e.ID_Especialidad}, this.checked)">
                ${e.Nombre_Especialidad}
            </label>`;
    }).join('');
}

window.toggleEspecialidad = function(id, marcado) {
    if (marcado) _especialidadesSeleccionadas.add(id);
    else _especialidadesSeleccionadas.delete(id);
    renderEspecialidadesChips();
};

async function cargarCatalogoEspecialidades() {
    const res = await window.api.get('/clinicas/especialidades/catalogo');
    _catalogoEspecialidades = Array.isArray(res) ? res : [];
    renderEspecialidadesChips();
}

window.agregarEspecialidadNueva = async function() {
    const input = document.getElementById('s-especialidad-nueva');
    const nombre = input.value.trim();
    if (!nombre) return;

    const res = await window.api.post('/clinicas/especialidades/catalogo', { nombre });
    if (res.status === 'Error') {
        return Swal.fire('Error', res.message || 'No se pudo agregar la especialidad.', 'error');
    }
    input.value = '';
    await cargarCatalogoEspecialidades(); // refresca por si ya existía con otro ID
    _especialidadesSeleccionadas.add(res.id_especialidad);
    renderEspecialidadesChips();
};

function renderHorariosGrid(filasPorDia) {
    const cont = document.getElementById('s-horarios-grid');
    if (!cont) return;
    cont.innerHTML = DIAS_SEMANA.map(d => {
        const f = filasPorDia[d.dia] || {};
        const cerrado = !!f.Cerrado;
        const apertura = f.Hora_Apertura || '';
        const cierre = f.Hora_Cierre || '';
        return `
            <div class="horario-fila" data-dia="${d.dia}">
                <span class="dia-nombre">${d.nombre}</span>
                <input type="time" id="hor-apertura-${d.dia}" value="${apertura}" ${cerrado ? 'disabled' : ''}>
                <input type="time" id="hor-cierre-${d.dia}" value="${cierre}" ${cerrado ? 'disabled' : ''}>
                <label class="cerrado-toggle">
                    <input type="checkbox" id="hor-cerrado-${d.dia}" ${cerrado ? 'checked' : ''} onchange="window.toggleHorarioCerrado(${d.dia})">
                    Cerrado
                </label>
            </div>`;
    }).join('');
}

window.toggleHorarioCerrado = function(dia) {
    const chk = document.getElementById(`hor-cerrado-${dia}`);
    const apertura = document.getElementById(`hor-apertura-${dia}`);
    const cierre = document.getElementById(`hor-cierre-${dia}`);
    if (!chk || !apertura || !cierre) return;
    apertura.disabled = chk.checked;
    cierre.disabled = chk.checked;
};

function leerHorariosDelFormulario() {
    return DIAS_SEMANA.map(d => ({
        dia: d.dia,
        apertura: document.getElementById(`hor-apertura-${d.dia}`)?.value || '',
        cierre: document.getElementById(`hor-cierre-${d.dia}`)?.value || '',
        cerrado: document.getElementById(`hor-cerrado-${d.dia}`)?.checked || false
    }));
}

window.mostrarModalSucursal = function() {
    // Resetear campos básicos
    document.getElementById('s_id_clinica').value = "";
    document.getElementById('s_nombre').value = "";
    document.getElementById('s_ruc').value = "";
    document.getElementById('s_ciudad').value = "";
    document.getElementById('s_direccion').value = "";
    document.getElementById('s_telefono').value = "";
    document.getElementById('s_latitud').value = "";
    document.getElementById('s_longitud').value = "";

    // Resetear campos tributarios (NUEVOS)
    document.getElementById('s_contribuyente_especial').value = "";
    document.getElementById('s_obligado_contabilidad').value = "NO";
    document.getElementById('s_regimen_rimpe').value = "";
    
    const btnGps = document.querySelector('.btn-gps');
    if(btnGps) {
        btnGps.classList.remove('active');
        btnGps.innerHTML = '<i class="fas fa-crosshairs"></i>';
    }
    const statusGps = document.getElementById('status-gps');
    if(statusGps) statusGps.innerHTML = '<i class="fas fa-info-circle"></i> Captura el GPS para WhatsApp.';

    document.getElementById('logo-preview').src = "assets/icon.png";
    document.getElementById('path-text').innerText = "Archivo: predeterminado.png";
    document.getElementById('modal-titulo').innerText = "Configurar Sucursal";
    document.getElementById('modal-sucursal').style.display = 'flex';

    // Especialidades/horarios: sede nueva arranca sin nada marcado/configurado.
    _especialidadesSeleccionadas = new Set();
    renderHorariosGrid({});
    cargarCatalogoEspecialidades();
};

window.prepararEdicion = async function(id) {
    try {
        const clinica = await window.api.get(`/clinicas/leer/${id}`);
        if (clinica) {
            document.getElementById('s_id_clinica').value = clinica.ID_Clinica;
            document.getElementById('s_nombre').value = clinica.Nombre_Clinica || "";
            document.getElementById('s_ruc').value = clinica.RUC || "";
            document.getElementById('s_ciudad').value = clinica.Ciudad || "";
            document.getElementById('s_direccion').value = clinica.Direccion || "";
            document.getElementById('s_telefono').value = clinica.Telefono || "";
            document.getElementById('s_latitud').value = clinica.Latitud || "";
            document.getElementById('s_longitud').value = clinica.Longitud || "";

            // Cargar datos tributarios en el modal
            document.getElementById('s_contribuyente_especial').value = clinica.Contribuyente_Especial || "";
            document.getElementById('s_obligado_contabilidad').value = clinica.Obligado_Contabilidad || "NO";
            document.getElementById('s_regimen_rimpe').value = clinica.Regimen_Rimpe || "";

            const btnGps = document.querySelector('.btn-gps');
            const statusGps = document.getElementById('status-gps');
            if (clinica.Latitud && clinica.Longitud) {
                if(btnGps) btnGps.classList.add('active');
                if(statusGps) statusGps.innerHTML = `<i class="fas fa-check-circle" style="color:#22c55e"></i> Coordenadas cargadas.`;
            }

            const serverBase = window.api.baseURL ? window.api.baseURL.slice(0, -4) : '';
            const preview = document.getElementById('logo-preview');
            
            if (clinica.Logo_Ruta) {
                preview.src = `${serverBase}/uploads/logos/${clinica.Logo_Ruta}`;
                document.getElementById('path-text').innerText = "Archivo: " + clinica.Logo_Ruta;
            } else {
                preview.src = "assets/icon.png";
                document.getElementById('path-text').innerText = "Archivo: predeterminado.png";
            }
            
            document.getElementById('modal-titulo').innerText = "Editar Sucursal";
            document.getElementById('modal-sucursal').style.display = 'flex';

            // Especialidades/horarios reales de esta sede.
            _especialidadesSeleccionadas = new Set();
            await cargarCatalogoEspecialidades();
            const especialidadesClinica = await window.api.get(`/clinicas/${id}/especialidades`);
            if (Array.isArray(especialidadesClinica)) {
                especialidadesClinica.forEach(e => _especialidadesSeleccionadas.add(e.ID_Especialidad));
            }
            renderEspecialidadesChips();

            const horariosClinica = await window.api.get(`/clinicas/${id}/horarios`);
            const porDia = {};
            if (Array.isArray(horariosClinica)) horariosClinica.forEach(h => { porDia[h.Dia_Semana] = h; });
            renderHorariosGrid(porDia);
        }
    } catch (err) {
        Swal.fire('Error', 'No se pudo cargar la sucursal', 'error');
    }
};

window.guardarClinicaActualizada = async function() {
    const btn = document.getElementById('btnGuardarClinica');
    const fileInput = document.getElementById('input-logo');
    const formData = new FormData();
    
    const id = document.getElementById('s_id_clinica').value;
    const esNuevaSede = (!id || id === 'null' || id === '');

    // 🛡️ PROTOCOLO DE SEGURIDAD CASRODSOFT PARA EXPANSIÓN
    if (esNuevaSede) {
        const { value: masterKey } = await Swal.fire({
            title: 'AUTORIZACIÓN REQUERIDA',
            text: 'Ingrese la MasterKey de Casrodsoft para habilitar esta sede',
            input: 'password',
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            confirmButtonColor: '#1e293b'
        });

        if (!masterKey) return;

        const { value: respuestas } = await Swal.fire({
            title: 'VERIFICACIÓN DE IDENTIDAD',
            html: `
                <p style="font-size:0.9em; color:#64748b">Validación de desarrollador:</p>
                <input id="q1" class="swal2-input" placeholder="¿Apodo infancia?">
                <input id="q2" class="swal2-input" placeholder="¿Cédula?">
                <input id="q3" class="swal2-input" placeholder="¿Fecha importante?">
            `,
            focusConfirm: false,
            preConfirm: () => [
                document.getElementById('q1').value.trim(),
                document.getElementById('q2').value.trim(),
                document.getElementById('q3').value.trim()
            ]
        });

        if (!respuestas) return;

        formData.append('auth_key', masterKey);
        formData.append('respuestas_dev', JSON.stringify(respuestas));
    }

    // CAPTURA DE DATOS PARA ENVÍO
    formData.append('id_clinica', id);
    formData.append('nombre', document.getElementById('s_nombre').value.trim());
    formData.append('ruc', document.getElementById('s_ruc').value.trim());
    formData.append('ciudad', document.getElementById('s_ciudad').value.trim());
    formData.append('direccion', document.getElementById('s_direccion').value.trim());
    formData.append('telefono', document.getElementById('s_telefono').value.trim());
    
    // Coordenadas
    const lat = document.getElementById('s_latitud').value;
    const lng = document.getElementById('s_longitud').value;
    formData.append('latitud', (lat && lat !== "") ? lat : "");
    formData.append('longitud', (lng && lng !== "") ? lng : "");

    // Datos SRI (NUEVOS)[cite: 1]
    formData.append('contribuyente_especial', document.getElementById('s_contribuyente_especial').value.trim());
    formData.append('obligado_contabilidad', document.getElementById('s_obligado_contabilidad').value);
    formData.append('regimen_rimpe', document.getElementById('s_regimen_rimpe').value.trim());
    
    // Logo
    const pathText = document.getElementById('path-text').innerText;
    if (pathText.includes("Archivo: ") && !pathText.includes("predeterminado")) {
        formData.append('logo_ruta', pathText.replace("Archivo: ", ""));
    }

    if (fileInput.files.length > 0) {
        formData.append('logo_file', fileInput.files[0]);
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GUARDANDO...';

    try {
        const res = await fetch(`${window.api.baseURL}/clinicas/guardar`, {
            method: 'POST',
            // 🛡️ Token JWT (FormData: NO se pone Content-Type, el navegador lo arma solo)
            headers: { 'Authorization': `Bearer ${window.api.getToken()}` },
            body: formData
        });

        const data = await res.json();
        if (data.status !== "Error") {
            // Sede nueva: el backend recién devuelve el ID_Clinica generado. Sede existente:
            // ya lo teníamos en el formulario. Con eso se guardan especialidades/horarios
            // bajo el mismo botón, sin pedirle un segundo paso al usuario.
            const idFinal = esNuevaSede ? data.id_clinica : id;
            let avisoExtra = '';
            if (idFinal) {
                const [respEsp, respHor] = await Promise.all([
                    window.api.put(`/clinicas/${idFinal}/especialidades`, { ids_especialidad: Array.from(_especialidadesSeleccionadas) }),
                    window.api.put(`/clinicas/${idFinal}/horarios`, { horarios: leerHorariosDelFormulario() })
                ]);
                if (respEsp.status === 'Error' || respHor.status === 'Error') {
                    avisoExtra = ' (ojo: especialidades/horarios no se guardaron completos, revísalos)';
                }
            }
            Swal.fire(avisoExtra ? 'Guardado con advertencia' : 'Éxito', 'Sucursal gestionada correctamente' + avisoExtra, avisoExtra ? 'warning' : 'success');
            window.cerrarModal();
            window.sucursalesModule.init();
        } else {
            Swal.fire('Error de Autorización', data.message, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Guardar Clínica';
    }
};

window.cerrarModal = () => document.getElementById('modal-sucursal').style.display = 'none';

window.previewImagen = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('logo-preview').src = e.target.result;
            document.getElementById('path-text').innerText = "Archivo: " + input.files[0].name;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// --- ESTADO Y REINICIO DEL BOT DE WHATSAPP ---
// IMPORTANTE: esta lógica vive acá (archivo externo cargado una sola vez al
// arrancar la app) y NO en un <script> inline dentro de views/sucursales.html,
// porque router.load() inserta esas vistas vía innerHTML — y los navegadores
// nunca ejecutan <script> insertados así. Un <script> inline ahí se ve en el
// DOM pero jamás corre (así se quedaba pegado en "Consultando estado...").
const BOT_ESTADOS = {
    conectado:      { texto: 'Conectado',                dot: 'verde' },
    iniciando:      { texto: 'Iniciando...',             dot: 'amarillo' },
    reiniciando:    { texto: 'Reiniciando...',           dot: 'amarillo' },
    reconectando:   { texto: 'Reconectando...',          dot: 'amarillo' },
    esperando_qr:   { texto: 'Requiere escanear QR (entrar por AnyDesk)', dot: 'rojo' }
};

window.actualizarEstadoBot = async function() {
    const txtEl = document.getElementById('bot-estado-texto');
    const dbEl = document.getElementById('bot-db-texto');
    const qrCard = document.getElementById('bot-qr-card');
    const qrImg = document.getElementById('bot-qr-img');
    if (!txtEl || !dbEl) {
        clearInterval(window._botEstadoInterval);
        return;
    }

    const resp = await window.api.getEstadoBot();
    if (resp.status !== 'OK') return; // error de red puntual, se reintenta en el próximo ciclo

    const info = BOT_ESTADOS[resp.estadoBot] || { texto: resp.estadoBot, dot: 'gris' };
    txtEl.innerHTML = `<span class="bot-dot bot-dot-${info.dot}"></span> ${info.texto}`;
    dbEl.innerHTML = resp.dbOk
        ? '<i class="fas fa-check-circle" style="color:#22c55e"></i> Base de datos OK'
        : '<i class="fas fa-times-circle" style="color:#ef4444"></i> Base de datos sin respuesta';

    if (resp.estadoBot === 'esperando_qr' && resp.qr && qrCard && qrImg) {
        qrImg.src = resp.qr;
        qrCard.style.display = 'flex';
    } else if (qrCard) {
        qrCard.style.display = 'none';
    }
};

window.reiniciarBotWhatsapp = function() {
    Swal.fire({
        title: '¿Reiniciar el bot de WhatsApp?',
        text: 'Se cerrará y volverá a abrir la sesión. Tarda unos segundos y solo hace falta si el bot dejó de responder.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, reiniciar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (!result.isConfirmed) return;

        const btn = document.getElementById('btn-reiniciar-bot');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reiniciando...'; }

        window.api.reiniciarBot().then((resp) => {
            if (resp.status !== 'OK') {
                Swal.fire('Error', resp.message || 'No se pudo reiniciar el bot.', 'error');
            }
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate-right"></i> Reiniciar Bot'; }
            window.actualizarEstadoBot();
        });
    });
};