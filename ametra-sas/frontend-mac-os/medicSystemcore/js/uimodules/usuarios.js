/// ==========================================
// MÓDULO: GESTIÓN DE USUARIOS (PERSONAL) - VERSIÓN ULTRA-STABLE + ESCUDO CASRODSOFT
// ==========================================
window.usuariosModule = {
    sesion: null,

    init: function() {
        console.log("👥 Inicializando Módulo de Usuarios...");
        
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return console.error("🔴 Error: No hay sesión activa.");
        this.sesion = JSON.parse(sesionRaw);

        this.bindEvents();
        this.cargarClinicas();
        this.listar();
    },

    bindEvents: function() {
        const btnNuevo = document.getElementById('btn-nuevo-usuario');
        const formUsuario = document.getElementById('form-usuario');

        if (btnNuevo) {
            btnNuevo.onclick = (e) => {
                e.preventDefault();
                window.usuariosModule.abrirModal();
            };
        }

        if (formUsuario) {
            formUsuario.onsubmit = (e) => {
                e.preventDefault();
                window.usuariosModule.guardar();
            };
        }
    },

    abrirModal: function() {
        const modal = document.getElementById('modal-usuario');
        const form = document.getElementById('form-usuario');
        const titulo = document.getElementById('modal-titulo');

        if (modal && form) {
            form.reset();
            document.getElementById('user-id').value = "";
            if (titulo) titulo.innerText = "Registrar Nuevo Usuario";
            modal.style.display = 'flex';
        }
    },

    cerrarModal: function() {
        const modal = document.getElementById('modal-usuario');
        if (modal) modal.style.display = 'none';
    },

    listar: async function() {
        if (!this.sesion) return;
        
        const idRolNumerico = (this.sesion.rol === 'Administrador') ? 1 : 2;
        const idClinica = this.sesion.id_clinica;
        
        const path = `/usuarios/listar?id_clinica=${idClinica}&id_rol=${idRolNumerico}`;
        const res = await window.api.get(path);
        
        if (res && Array.isArray(res)) {
            this.render(res);
        }
    },

    render: function(usuarios) {
        const tbody = document.getElementById('lista-usuarios-body');
        if (!tbody) return;
        
        if (usuarios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">No hay personal registrado</td></tr>`;
            return;
        }

        tbody.innerHTML = usuarios.map(u => {
            const esMaestro = (u.ID_Usuario == 2);
            
            return `
            <tr>
                <td><strong>${u.Cedula}</strong></td>
                <td>${u.Apellidos}, ${u.Nombres} ${esMaestro ? '<i class="fas fa-shield-alt" style="color:#4f46e5" title="Usuario Protegido"></i>' : ''}</td>
                <td>${u.Username}</td>
                <td><span class="badge" style="background:#e0e7ff; color:#4338ca; padding:4px 8px; border-radius:4px;">${u.Rol}</span></td>
                <td>${u.Nombre_Clinica}</td>
                <td>
                    ${u.Activo 
                        ? '<span style="color:green; font-weight:bold;"><i class="fas fa-check-circle"></i> Activo</span>' 
                        : '<span style="color:red; font-weight:bold;"><i class="fas fa-times-circle"></i> Inactivo</span>'}
                </td>
                <td>
                    <button class="btn-action" 
                        style="background:#4f46e5; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;" 
                        onclick='window.usuariosModule.editar(${JSON.stringify(u)})'>
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            </tr>
        `}).join('');
    },

    cargarClinicas: async function() {
        const selectClinica = document.getElementById('user-clinica');
        const res = await window.api.get('/clinicas/listar'); 
        
        if (selectClinica && Array.isArray(res)) {
            selectClinica.innerHTML = `
                <option value="">-- Seleccione Clínica --</option>
                ${res.map(c => `<option value="${c.ID_Clinica}">${c.Nombre_Clinica}</option>`).join('')}
            `;
        }
    },

    editar: function(u) {
        this.abrirModal();
        const titulo = document.getElementById('modal-titulo');
        if (titulo) titulo.innerText = "Editar Perfil de Usuario";
        
        document.getElementById('user-id').value = u.ID_Usuario || "";
        document.getElementById('user-cedula').value = u.Cedula || "";
        document.getElementById('user-nombres').value = u.Nombres || "";
        document.getElementById('user-apellidos').value = u.Apellidos || "";
        
        document.getElementById('user-username').value = u.Username || "";
        document.getElementById('user-pass').value = "";
        document.getElementById('user-rol').value = u.ID_Rol || "";
        document.getElementById('user-clinica').value = u.ID_Clinica || "";
        document.getElementById('user-activo').checked = (u.Activo == 1 || u.Activo == true);

        // --- CARGA DEL REGISTRO SANITARIO ---
        const inputReg = document.getElementById('user-registro');
        if (inputReg) inputReg.value = u.Registro_Sanitario || "";
    },

    guardar: async function() {
        const id_usuario = document.getElementById('user-id').value || null;
        const cedula = document.getElementById('user-cedula').value.trim();
        const nombres = document.getElementById('user-nombres').value.trim();
        const apellidos = document.getElementById('user-apellidos').value.trim();
        const username = document.getElementById('user-username').value.trim();
        const passwordNuevo = document.getElementById('user-pass').value.trim();
        const rol = document.getElementById('user-rol').value;
        const clinica = document.getElementById('user-clinica').value;
        
        // Captura el nuevo campo
        const registro_sanitario = document.getElementById('user-registro').value.trim();

        if (!cedula || !nombres || !apellidos || !username || rol === "" || clinica === "") {
            return Swal.fire("Atención", "Todos los campos son obligatorios", "warning");
        }

        const payload = {
            id_usuario: id_usuario,
            cedula: cedula,
            nombres: nombres,
            apellidos: apellidos,
            username: username,
            id_rol: parseInt(rol),
            id_clinica: parseInt(clinica),
            activo: document.getElementById('user-activo').checked ? 1 : 0,
            registro_sanitario: registro_sanitario, // <-- Enviado al backend
            rol_solicitante: (this.sesion && this.sesion.rol === 'Administrador') ? 1 : 0
        };

        if (!id_usuario) {
            if (!passwordNuevo) return Swal.fire("Atención", "Asigna una contraseña", "warning");
            payload.password = passwordNuevo;
        } else if (passwordNuevo !== "") {
            payload.password = passwordNuevo;
        }

        try {
            const res = await window.api.post('/usuarios/guardar', payload);
            
            if (res && res.status !== "Error") {
                this.cerrarModal();
                this.listar();
                Swal.fire("Éxito", "Usuario guardado correctamente", "success");
            } else {
                Swal.fire("Error", res.message || "No se pudo guardar", "error");
            }
        } catch (error) {
            console.error("🔴 Bloqueo de Seguridad CasRodsoft:", error);
            
            if (id_usuario == 2) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Acceso Restringido',
                    text: 'Usuario del Sistema CasRodsoft: No se permiten cambios en este perfil maestro.',
                    confirmButtonColor: '#4f46e5'
                });
            } else {
                Swal.fire("Error", "Ocurrió un error en el servidor al procesar la solicitud.", "error");
            }
            this.cerrarModal();
        }
    }
};