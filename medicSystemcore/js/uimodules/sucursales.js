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
    }
};

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
            Swal.fire('Éxito', 'Sucursal gestionada correctamente', 'success');
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