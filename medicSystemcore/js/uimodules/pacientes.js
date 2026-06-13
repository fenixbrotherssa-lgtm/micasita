// ==========================================
// MÓDULO: PACIENTES (FRONTEND - COMPLETO CON MSP)
// ==========================================
window.pacientesModule = {
    init: async function() {
        const tbody = document.getElementById('tbodyPacientes');
        const filterSede = document.getElementById('filterClinica');
        const search = document.getElementById('searchPacientes');

        // Recuperar sesión para control de acceso por sede
        const sesionRaw = localStorage.getItem('usuario_sesion');
        const sesion = sesionRaw ? JSON.parse(sesionRaw) : null;
        const idRol = sesion ? String(sesion.ID_Rol || sesion.id_rol) : '0';
        const idClinicaSession = sesion ? (sesion.ID_Clinica || sesion.id_clinica) : '';

        // 1. CARGAR LAS SEDES EN EL FILTRO
        try {
            const clinicas = await window.api.get('/clinicas/listar');
            
            if (Array.isArray(clinicas) && filterSede) {
                let options = (idRol === "1") ? '<option value="">Todas las Sedes</option>' : '';
                
                clinicas.forEach(c => {
                    if (idRol === "1" || c.ID_Clinica == idClinicaSession) {
                        options += `<option value="${c.ID_Clinica}">${c.Nombre_Clinica}</option>`;
                    }
                });
                
                filterSede.innerHTML = options;

                if (idRol !== "1") {
                    filterSede.value = idClinicaSession;
                    filterSede.disabled = true; 
                    filterSede.style.backgroundColor = "#f1f5f9";
                }
            }
        } catch (err) {
            console.error("Error cargando sedes:", err);
        }

        // 2. FUNCIÓN DE CARGA DE DATOS
        const cargar = (bus) => {
            const idClinicaFiltro = filterSede ? filterSede.value : '';
            const sedeFinal = (idRol === "1") ? idClinicaFiltro : idClinicaSession;

            window.api.getPacientes(bus, sedeFinal).then(lista => {
                if (!tbody) return;
                
                if (!Array.isArray(lista) || lista.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px; color:#94a3b8;">
                        <i class="fas fa-user-slash" style="display:block; font-size:2rem; margin-bottom:10px;"></i>
                        No hay pacientes registrados
                    </td></tr>`;
                    return;
                }

                tbody.innerHTML = lista.map(p => `
                    <tr style="border-bottom: 1px solid #f1f5f9; height: 70px;">
                        <td style="width: 12%; padding: 10px; font-weight:700; color:#64748b; vertical-align: middle;">
                            ${p.DNI || p.Cedula || '---'}
                        </td>
                        <td style="width: 25%; padding: 10px; vertical-align: middle;">
                            <div style="font-weight:700; color:#1e293b; text-transform: capitalize;">
                                ${(p.Nombres + ' ' + (p.Apellidos || '')).toLowerCase()}
                            </div>
                            <div style="font-size:0.75rem; color:#94a3b8;">
                                ${p.Genero || 'N/A'} • ${p.Email || 'Sin correo'}
                            </div>
                        </td>
                        <td style="width: 13%; padding: 10px; vertical-align: middle; color: #64748b;">
                            ${p.Telefono || '---'}
                        </td>
                        <td style="width: 15%; padding: 10px; vertical-align: middle;">
                            <span class="badge-sede" style="background:#eff6ff; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:700; color:#1e40af; border: 1px solid #dbeafe;">
                                ${p.Nombre_Clinica || 'Sede Principal'}
                            </span>
                        </td>
                        <td style="width: 35%; padding: 10px; text-align: right; vertical-align: middle; white-space:nowrap;">
                            <div style="display: inline-flex; gap: 6px; align-items: center;">
                                <button onclick="window.router.load('odontograma', {id_paciente: ${p.ID_Paciente}})" 
                                    style="background:#0ea5e9; color:white; border:none; width: 36px; height: 36px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center;" 
                                    title="Odontograma">
                                    <i class="fas fa-tooth"></i>
                                </button>
                                
                                <button onclick="window.router.load('historia_clinica', {id_paciente: ${p.ID_Paciente}})" 
                                    style="background:#3b82f6; color:white; border:none; padding: 0 12px; height: 36px; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.7rem;">
                                    FICHA
                                </button>

                                <button onclick="window.router.load('tratamientos', {id_paciente: ${p.ID_Paciente}})" 
                                    style="background:#8b5cf6; color:white; border:none; padding: 0 12px; height: 36px; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.7rem;">
                                    PLANES
                                </button>

                                <button onclick="window.editarPaciente(${p.ID_Paciente})" 
                                    style="background:none; border:none; color:#f59e0b; padding: 0 8px; cursor:pointer; font-size: 1.1rem;"
                                    title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>

                                <button onclick="window.borrarPaciente(${p.ID_Paciente})" 
                                    style="background:none; border:none; color:#ef4444; padding: 0 8px; cursor:pointer; font-size: 1.1rem;"
                                    title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`).join('');
            }).catch(err => {
                console.error("Error al cargar pacientes:", err);
            });
        };

        if (search) search.oninput = (e) => cargar(e.target.value);
        if (filterSede) filterSede.onchange = () => cargar(search ? search.value : '');

        cargar('');
    }
};

const swalConfig = {
    heightAuto: false,
    backdrop: `rgba(15, 23, 42, 0.75)`,
    allowOutsideClick: false,
    customClass: { popup: 'swal-wide-popup' } // Para manejar mejor el formulario amplio
};

// --- MÉTODOS MSP AUXILIARES (CORREGIDO CON TODOS LOS CAMPOS DEL CONTROLADOR) ---
const getMspFieldsHTML = (data = {}) => `
    <div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 10px;">
        <p style="font-size: 0.75rem; color: #3b82f6; font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">Información Normativa MSP & Complementaria</p>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
                <label style="font-size:0.8rem;font-weight:600;">Tipo Sanguíneo</label>
                <select id="sw-sangre" class="swal2-input" style="width:100%; margin:4px 0; font-size:0.9rem;">
                    <option value="">Seleccione...</option>
                    <option value="O+" ${data.Tipo_Sanguineo === 'O+' ? 'selected' : ''}>O+</option>
                    <option value="O-" ${data.Tipo_Sanguineo === 'O-' ? 'selected' : ''}>O-</option>
                    <option value="A+" ${data.Tipo_Sanguineo === 'A+' ? 'selected' : ''}>A+</option>
                    <option value="A-" ${data.Tipo_Sanguineo === 'A-' ? 'selected' : ''}>A-</option>
                    <option value="B+" ${data.Tipo_Sanguineo === 'B+' ? 'selected' : ''}>B+</option>
                    <option value="B-" ${data.Tipo_Sanguineo === 'B-' ? 'selected' : ''}>B-</option>
                    <option value="AB+" ${data.Tipo_Sanguineo === 'AB+' ? 'selected' : ''}>AB+</option>
                    <option value="AB-" ${data.Tipo_Sanguineo === 'AB-' ? 'selected' : ''}>AB-</option>
                </select>
            </div>
            <div>
                <label style="font-size:0.8rem;font-weight:600;">Estado Civil</label>
                <select id="sw-estado-civil" class="swal2-input" style="width:100%; margin:4px 0; font-size:0.9rem;">
                    <option value="Soltero/a" ${data.Estado_Civil === 'Soltero/a' ? 'selected' : ''}>Soltero/a</option>
                    <option value="Casado/a" ${data.Estado_Civil === 'Casado/a' ? 'selected' : ''}>Casado/a</option>
                    <option value="Divorciado/a" ${data.Estado_Civil === 'Divorciado/a' ? 'selected' : ''}>Divorciado/a</option>
                    <option value="Viudo/a" ${data.Estado_Civil === 'Viudo/a' ? 'selected' : ''}>Viudo/a</option>
                    <option value="Unión Libre" ${data.Estado_Civil === 'Unión Libre' ? 'selected' : ''}>Unión Libre</option>
                </select>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:5px;">
            <div>
                <label style="font-size:0.8rem;font-weight:600;">Ocupación</label>
                <input id="sw-ocupacion" class="swal2-input" value="${data.Ocupacion || ''}" placeholder="Profesión" style="width:100%; margin:4px 0; font-size:0.9rem;">
            </div>
            <div>
                <label style="font-size:0.8rem;font-weight:600;">Lugar de Nacimiento</label>
                <input id="sw-lugar-nacimiento" class="swal2-input" value="${data.Lugar_Nacimiento || ''}" placeholder="Ciudad/País" style="width:100%; margin:4px 0; font-size:0.9rem;">
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:5px;">
            <div>
                <label style="font-size:0.8rem;font-weight:600;">Autoidentificación Étnica</label>
                <select id="sw-etnia" class="swal2-input" style="width:100%; margin:4px 0; font-size:0.9rem;">
                    <option value="Mestizo" ${data.Etnia === 'Mestizo' ? 'selected' : ''}>Mestizo</option>
                    <option value="Afroecuatoriano" ${data.Etnia === 'Afroecuatoriano' ? 'selected' : ''}>Afroecuatoriano</option>
                    <option value="Indígena" ${data.Etnia === 'Indígena' ? 'selected' : ''}>Indígena</option>
                    <option value="Blanco" ${data.Etnia === 'Blanco' ? 'selected' : ''}>Blanco</option>
                    <option value="Montubio" ${data.Etnia === 'Montubio' ? 'selected' : ''}>Montubio</option>
                    <option value="Otro" ${data.Etnia === 'Otro' ? 'selected' : ''}>Otro</option>
                </select>
            </div>
            <div>
                <label style="font-size:0.8rem;font-weight:600;">Instrucción (Año aprobado)</label>
                <input id="sw-instruccion" type="number" class="swal2-input" value="${data.Instruccion_Ultimo_Anio || ''}" style="width:100%; margin:4px 0; font-size:0.9rem;">
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:5px;">
            <div><label style="font-size:0.75rem;font-weight:600;">Provincia</label><input id="sw-provincia" class="swal2-input" value="${data.Provincia_Residencia || ''}" style="width:100%; margin:4px 0; font-size:0.85rem;"></div>
            <div><label style="font-size:0.75rem;font-weight:600;">Cantón</label><input id="sw-canton" class="swal2-input" value="${data.Canton_Residencia || ''}" style="width:100%; margin:4px 0; font-size:0.85rem;"></div>
            <div><label style="font-size:0.75rem;font-weight:600;">Parroquia</label><input id="sw-parroquia" class="swal2-input" value="${data.Parroquia_Residencia || ''}" style="width:100%; margin:4px 0; font-size:0.85rem;"></div>
        </div>

        <p style="font-size: 0.7rem; color: #ef4444; font-weight: 700; margin: 10px 0 5px 0; text-transform: uppercase;">Contacto de Emergencia</p>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
            <input id="sw-em-nombre" class="swal2-input" placeholder="Nombre" value="${data.Contacto_Emergencia_Nombre || ''}" style="width:100%; margin:0; font-size:0.8rem;">
            <input id="sw-em-tel" class="swal2-input" placeholder="Teléfono" value="${data.Contacto_Emergencia_Telefono || ''}" style="width:100%; margin:0; font-size:0.8rem;">
            <input id="sw-em-parentesco" class="swal2-input" placeholder="Parentesco" value="${data.Parentesco_Contacto || ''}" style="width:100%; margin:0; font-size:0.8rem;">
        </div>
    </div>
`;

window.borrarPaciente = function(id) {
    if (!id) return;
    Swal.fire({
        ...swalConfig,
        title: '¿Estás seguro?',
        text: "Se inactivará al paciente. Si no tiene historial financiero, se eliminará permanentemente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            window.api.get(`/pacientes/eliminar/${id}`).then(data => {
                if(data.status === 'Success') {
                    Swal.fire({...swalConfig, title: 'Eliminado', text: data.message, icon: 'success', timer: 1500, showConfirmButton: false});
                    window.pacientesModule.init(); 
                } else {
                    Swal.fire('Error', data.message || 'Error desconocido', 'error');
                }
            });
        }
    });
};

window.editarPaciente = async function(id) {
    try {
        const p = await window.api.get(`/pacientes/${id}`);
        if (!p) return;
        const fechaDoc = p.Fecha_Nacimiento ? p.Fecha_Nacimiento.split('T')[0] : '';
        
        const { value: formValues } = await Swal.fire({
            ...swalConfig,
            title: 'Editar Ficha de Paciente',
            html: `
                <div id="swal-form-container" style="display: flex; flex-direction: column; gap: 8px; text-align: left; padding: 5px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div><label style="font-size:0.8rem;font-weight:600;">Nombres</label><input id="sw-nombre" class="swal2-input" value="${p.Nombres || ''}" style="width:100%; margin:4px 0;"></div>
                        <div><label style="font-size:0.8rem;font-weight:600;">Apellidos</label><input id="sw-apellido" class="swal2-input" value="${p.Apellidos || ''}" style="width:100%; margin:4px 0;"></div>
                    </div>
                    <div><label style="font-size:0.8rem;font-weight:600;">DNI / Cédula</label><input id="sw-dni" class="swal2-input" value="${p.DNI || p.Cedula || ''}" style="width:100%; margin:4px 0;"></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-size:0.8rem;font-weight:600;">Género</label>
                            <select id="sw-genero" class="swal2-input" style="width:100%; margin:4px 0;">
                                <option value="Masculino" ${p.Genero === 'Masculino' ? 'selected' : ''}>Masculino</option>
                                <option value="Femenino" ${p.Genero === 'Femenino' ? 'selected' : ''}>Femenino</option>
                                <option value="Otro" ${p.Genero === 'Otro' ? 'selected' : ''}>Otro</option>
                            </select>
                        </div>
                        <div><label style="font-size:0.8rem;font-weight:600;">Teléfono</label><input id="sw-tel" class="swal2-input" value="${p.Telefono || ''}" style="width:100%; margin:4px 0;"></div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div><label style="font-size:0.8rem;font-weight:600;">Email</label><input id="sw-email" type="email" class="swal2-input" value="${p.Email || ''}" style="width:100%; margin:4px 0;"></div>
                        <div><label style="font-size:0.8rem;font-weight:600;">Nacimiento</label><input id="sw-fecha" type="date" class="swal2-input" value="${fechaDoc}" style="width:100%; margin:4px 0;"></div>
                    </div>
                    ${getMspFieldsHTML(p)}
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Actualizar',
            preConfirm: () => {
                const instVal = document.getElementById('sw-instruccion').value;
                return {
                    id_paciente: id,
                    nombres: document.getElementById('sw-nombre').value.trim(),
                    apellidos: document.getElementById('sw-apellido').value.trim(),
                    dni: document.getElementById('sw-dni').value.trim(),
                    genero: document.getElementById('sw-genero').value,
                    telefono: document.getElementById('sw-tel').value.trim(),
                    email: document.getElementById('sw-email').value.trim(),
                    fecha_nac: document.getElementById('sw-fecha').value,
                    id_clinica: p.ID_Clinica,
                    etnia: document.getElementById('sw-etnia').value,
                    instruccion: instVal === '' ? null : instVal.trim(), // CORREGIDO: Se envía como texto
                    provincia: document.getElementById('sw-provincia').value.trim(),
                    canton: document.getElementById('sw-canton').value.trim(),
                    parroquia: document.getElementById('sw-parroquia').value.trim(),
                    tipo_sanguineo: document.getElementById('sw-sangre').value,
                    estado_civil: document.getElementById('sw-estado-civil').value,
                    ocupacion: document.getElementById('sw-ocupacion').value.trim(),
                    lugar_nacimiento: document.getElementById('sw-lugar-nacimiento').value.trim(),
                    contacto_emergencia_nombre: document.getElementById('sw-em-nombre').value.trim(), // Ajustado al controlador
                    contacto_emergencia_telefono: document.getElementById('sw-em-tel').value.trim(), // Ajustado al controlador
                    parentesco_contacto: document.getElementById('sw-em-parentesco').value.trim() // Ajustado al controlador
                }
            }
        });

        if (formValues) {
            window.api.post('/pacientes/registro', formValues).then(data => {
                if (data.status === 'Success') {
                    Swal.fire({...swalConfig, title: '¡Éxito!', text: 'Paciente actualizado', icon: 'success', timer: 1500, showConfirmButton: false});
                    window.pacientesModule.init();
                } else {
                    Swal.fire('Error', data.message || 'No se pudo actualizar', 'error');
                }
            });
        }
    } catch (e) { console.error(e); }
};

window.nuevoPaciente = async function() {
    const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
    const idClinicaDefault = sesion ? (sesion.ID_Clinica || sesion.id_clinica) : 1;

    const { value: formValues } = await Swal.fire({
        ...swalConfig,
        title: 'Registrar Nuevo Paciente',
        html: `
            <div id="swal-form-container" style="display: flex; flex-direction: column; gap: 8px; text-align: left; padding: 5px;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><label style="font-size:0.8rem;font-weight:600;">Nombres *</label><input id="sw-nombre" class="swal2-input" style="width: 100%; margin: 4px 0;"></div>
                    <div><label style="font-size:0.8rem;font-weight:600;">Apellidos</label><input id="sw-apellido" class="swal2-input" style="width: 100%; margin: 4px 0;"></div>
                </div>
                <div><label style="font-size:0.8rem;font-weight:600;">DNI / Cédula *</label><input id="sw-dni" class="swal2-input" style="width: 100%; margin: 4px 0;"></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;">Género</label>
                        <select id="sw-genero" class="swal2-input" style="width: 100%; margin: 4px 0;">
                            <option value="Masculino">Masculino</option>
                            <option value="Femenino">Femenino</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <div><label style="font-size:0.8rem;font-weight:600;">Teléfono</label><input id="sw-tel" class="swal2-input" style="width: 100%; margin: 4px 0;"></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><label style="font-size:0.8rem;font-weight:600;">Email</label><input id="sw-email" type="email" class="swal2-input" style="width: 100%; margin: 4px 0;"></div>
                    <div><label style="font-size:0.8rem;font-weight:600;">Nacimiento</label><input id="sw-fecha" type="date" class="swal2-input" style="width: 100%; margin: 4px 0;"></div>
                </div>
                ${getMspFieldsHTML()}
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        preConfirm: () => {
            const nombres = document.getElementById('sw-nombre').value.trim();
            const dni = document.getElementById('sw-dni').value.trim();
            const instVal = document.getElementById('sw-instruccion').value;

            if (!nombres || !dni) { 
                Swal.showValidationMessage('Nombres y DNI son obligatorios'); 
                return false; 
            }

            return {
                nombres,
                apellidos: document.getElementById('sw-apellido').value.trim(),
                dni,
                genero: document.getElementById('sw-genero').value,
                telefono: document.getElementById('sw-tel').value.trim(),
                email: document.getElementById('sw-email').value.trim(),
                fecha_nac: document.getElementById('sw-fecha').value,
                id_clinica: idClinicaDefault,
                etnia: document.getElementById('sw-etnia').value,
                instruccion: instVal === '' ? null : instVal.trim(), // CORREGIDO: Sin parseInt
                provincia: document.getElementById('sw-provincia').value.trim(),
                canton: document.getElementById('sw-canton').value.trim(),
                parroquia: document.getElementById('sw-parroquia').value.trim(),
                tipo_sanguineo: document.getElementById('sw-sangre').value,
                estado_civil: document.getElementById('sw-estado-civil').value,
                ocupacion: document.getElementById('sw-ocupacion').value.trim(),
                lugar_nacimiento: document.getElementById('sw-lugar-nacimiento').value.trim(),
                contacto_emergencia_nombre: document.getElementById('sw-em-nombre').value.trim(),
                contacto_emergencia_telefono: document.getElementById('sw-em-tel').value.trim(),
                parentesco_contacto: document.getElementById('sw-em-parentesco').value.trim()
            }
        }
    });

    if (formValues) {
        window.api.post('/pacientes/registro', formValues).then(data => {
            if (data.status === 'Success') {
                Swal.fire({...swalConfig, title: '¡Éxito!', text: 'Paciente guardado correctamente', icon: 'success', timer: 1500, showConfirmButton: false});
                window.pacientesModule.init();
            } else {
                Swal.fire('Error', data.message || 'No se pudo guardar', 'error');
            }
        });
    }
};