// ==========================================================
// API REST Client - VERSIÓN INTEGRAL (Sincronizada con Backend)
// Incluye Módulo de Inteligencia Artificial "Mini Doctor"
// SOPORTE MULTISEDE: Generación de QR Dinámica
// ==========================================================

window.api = {
    /**
     * Sincronización con el entorno detectado en preload.js
     * El preload expone la config en window.appConfig (baseURL/publicURL).
     * Respaldo: URL de desarrollo local.
     */
    baseURL: (window.appConfig && window.appConfig.baseURL) ? window.appConfig.baseURL : 'http://localhost:8000/api',
    publicURL: (window.appConfig && window.appConfig.publicURL) ? window.appConfig.publicURL : '',

    // --- 🔐 EXTRACTOR DE TOKEN DE SEGURIDAD ---
    getToken: function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (sesionRaw) {
            try {
                const sesion = JSON.parse(sesionRaw);
                return sesion.token || null; // Retorna el token si existe
            } catch (e) {
                return null;
            }
        }
        return null;
    },

    // --- NÚCLEO DE COMUNICACIÓN ---
    // OJO: las 4 funciones de abajo (get/post/delete/postFormData) ANTES lanzaban
    // `Error HTTP: ${status}` en cuanto la respuesta no era 2xx, SIN leer el cuerpo —
    // así que el mensaje real que el backend sí manda (ej. "Contraseña incorrecta" en el
    // login, o "La cita ya fue atendida" al eliminar) se perdía siempre, y cualquier
    // pantalla que mostrara `res.message` terminaba mostrando el genérico "Error HTTP: 401"
    // en vez del motivo real. Ahora se lee el cuerpo SIEMPRE (haya salido bien o mal) y se
    // usa su `.message` cuando existe; el genérico queda solo como último recurso (ej. el
    // servidor cayó y ni siquiera devolvió JSON).
    get: async function(path) {
        try {
            const headers = {};
            const token = this.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`; // 🛡️ Inyección del Token

            const response = await fetch(this.baseURL + path, { headers });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error((data && data.message) || `Error HTTP: ${response.status}`);
            return data;
        } catch (err) {
            console.error("🔴 Error GET:", err);
            return { status: "Error", message: err.message };
        }
    },

    post: async function(path, data) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = this.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`; // 🛡️ Inyección del Token

            const response = await fetch(this.baseURL + path, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            const resBody = await response.json().catch(() => null);
            if (!response.ok) throw new Error((resBody && resBody.message) || `Error HTTP: ${response.status}`);
            return resBody;
        } catch (err) {
            console.error("🔴 Error POST:", err);
            return { status: 'Error', message: err.message };
        }
    },

    put: async function(path, data) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = this.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`; // 🛡️ Inyección del Token

            const response = await fetch(this.baseURL + path, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(data)
            });
            const resBody = await response.json().catch(() => null);
            if (!response.ok) throw new Error((resBody && resBody.message) || `Error HTTP: ${response.status}`);
            return resBody;
        } catch (err) {
            console.error("🔴 Error PUT:", err);
            return { status: 'Error', message: err.message };
        }
    },

    // Método genérico DELETE (con token)
    delete: async function(path) {
        try {
            const headers = {};
            const token = this.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`; // 🛡️ Inyección del Token

            const response = await fetch(this.baseURL + path, {
                method: 'DELETE',
                headers: headers
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error((data && data.message) || `Error HTTP: ${response.status}`);
            return data;
        } catch (err) {
            console.error("🔴 Error DELETE:", err);
            return { status: 'Error', message: err.message };
        }
    },

    // Método para enviar archivos (Vouchers, Logos, etc.)
    postFormData: async function(path, formData) {
        try {
            // NOTA: No seteamos 'Content-Type' aquí, el navegador lo hace solo para FormData
            const headers = {};
            const token = this.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`; // 🛡️ Inyección del Token

            const response = await fetch(this.baseURL + path, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error((data && data.message) || `Error HTTP: ${response.status}`);
            return data;
        } catch (err) {
            console.error("🔴 Error POST FormData:", err);
            return { status: 'Error', message: err.message };
        }
    },

    // --- 🤖 MÉTODOS DE INTELIGENCIA ARTIFICIAL (MINI DOCTOR) ---

    consultarDoctor: function(data) {
        return this.post('/ia/consultar', data);
    },

    getSaludoProactivo: function(usuario, contexto, modulo) {
        return this.post('/ia/saludo-entorno', { 
            usuario, 
            contexto, 
            modulo_actual: modulo 
        });
    },

    // --- 🟢 MÉTODOS DE GASTOS Y FINANZAS ---
    
    guardarGasto: function(data) {
        return this.post('/gastos/guardar', data);
    },

    getReporteFinanciero: function(id_clinica) {
        return this.get(`/gastos/reporte/${id_clinica}`);
    },

    // --- MÉTODOS DE PACIENTES ---
    
    getPacientes: function(bus, id_clinica) { 
        let url = `/pacientes?busqueda=${encodeURIComponent(bus || '')}`;
        if (id_clinica) url += `&id_clinica=${id_clinica}`;
        return this.get(url); 
    },

    getPaciente: function(id) {
        return this.get(`/pacientes/${id}`);
    },

    getHistoriaClinicaCompleta: function(id) { 
        return this.get(`/pacientes/historia/${id}`); 
    },

    guardarPaciente: function(data) {
        return this.post('/pacientes/registro', data);
    },

    // Alias usado por algunos módulos (equivale a guardarPaciente)
    crearPaciente: function(data) {
        return this.post('/pacientes/registro', data);
    },

    eliminarPaciente: function(id) {
        return this.delete(`/pacientes/${id}`);
    },

    guardarAnamnesis: function(data) {
        return this.post('/pacientes/anamnesis', data);
    },

    // --- MÉTODOS DE PAGOS ---

    registrarPago: function(formData) {
        return this.postFormData('/pagos/registrar', formData);
    },

    getHistorialPagos: function(id_paciente) {
        return this.get(`/pagos/historial/${id_paciente}`);
    },

    // --- MÉTODOS DE CAJA ---

    getCajaEstado: function(id_usuario, id_clinica) {
        return this.get(`/caja/estado?id_usuario=${id_usuario}&id_clinica=${id_clinica}`);
    },

    cerrarCaja: function(datosCierre) {
        return this.post('/caja/cerrar', datosCierre);
    },

    // --- MÉTODOS DE ODONTOGRAMA ---

    getOdontograma: function(id) { 
        return this.get(`/odontograma/${id}`); 
    },

    guardarOdontograma: function(hallazgos) {
        return this.post('/odontograma/guardar', { hallazgos });
    },

    // Guarda un hallazgo individual (payload crudo, como lo usaban los módulos)
    guardarHallazgo: function(payload) {
        return this.post('/odontograma/guardar', payload);
    },

    eliminarHallazgo: function(payload) {
        return this.post('/odontograma/eliminar', payload);
    },

    // --- MÉTODOS DE TRATAMIENTOS ---

    getCatalogoTratamientos: function() {
        return this.get('/tratamientos/catalogo');
    },

    asignarTratamiento: function(data) {
        return this.post('/tratamientos/asignar', data);
    },

    getTratamientosPorPaciente: function(id) {
        return this.get(`/tratamientos/paciente/${id}`);
    },

    // --- OTROS MÉTODOS Y SEGURIDAD ---

    getClinicas: function() {
        return this.get('/clinicas/listar');
    },

    getUsuarios: function(id_clinica, id_rol) {
        return this.get(`/usuarios/listar?id_clinica=${id_clinica}&id_rol=${id_rol}`);
    },

    login: function(data) { 
        return this.post('/auth/login', data); 
    },

    // Abrir enlaces externos: usa el puente nativo expuesto por el preload.
    abrirExterno: function(url) {
        if (window._electronAbrirExterno) {
            window._electronAbrirExterno(url);
        } else {
            window.open(url, '_blank');
        }
    },

    // --- MÉTODOS DE FACTURACIÓN ELECTRÓNICA (SINCRONIZACIÓN TOTAL) ---

    /**
     * Sube el archivo .p12 y la contraseña al servidor.
     */
    subirFirmaElectronica: function(formData) {
        return this.postFormData('/facturacion/certificado/subir', formData);
    },

    /**
     * Obtiene las firmas instaladas para la clínica.
     */
    getMisCertificados: function(id_clinica) {
        return this.get(`/facturacion/certificados/${id_clinica}`);
    },

    /**
     * Registra la factura en la base de datos.
     */
    generarFactura: function(datos) {
        return this.post('/facturacion/documento/registrar', datos);
    },

    /**
     * Obtiene el historial de documentos.
     */
    getHistorialFacturas: function(id_clinica, tipo = '00') {
        return this.get(`/facturacion/historial?id_clinica=${id_clinica}&tipo=${tipo}`);
    },

    /**
     * Obtener los detalles de un pago para pre-llenar la factura.
     */
    getDetallePagoParaFactura: function(id_pago) {
        return this.get(`/pagos/recibo/${id_pago}`);
    },

    /**
     * --- 🟢 SOPORTE QR DINÁMICO ---
     * Extrae la raíz del dominio para validaciones externas.
     */
    getURLPublica: function() {
        if (!this.baseURL) return "";
        return this.baseURL.split('/api')[0];
    },

    // --- 🤖 BOT DE WHATSAPP ---

    getEstadoBot: function() {
        return this.get('/whatsapp/estado');
    },

    reiniciarBot: function() {
        return this.post('/whatsapp/reiniciar', {});
    },

    // --- 📊 CRM ---

    getCrmResumen: function(id_clinica, fechaInicio, fechaFin) {
        const rango = (fechaInicio && fechaFin) ? `&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}` : '';
        return this.get(`/crm/resumen?id_clinica=${id_clinica}${rango}`);
    },

    getCrmRecurrencia: function(id_clinica) {
        return this.get(`/crm/recurrencia?id_clinica=${id_clinica}`);
    },

    getCrmCanalesOrigen: function(id_clinica, fechaInicio, fechaFin) {
        const rango = (fechaInicio && fechaFin) ? `&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}` : '';
        return this.get(`/crm/canales-origen?id_clinica=${id_clinica}${rango}`);
    },

    getCrmDemografia: function(id_clinica) {
        return this.get(`/crm/demografia?id_clinica=${id_clinica}`);
    },

    getCrmPatologiasZona: function(id_clinica) {
        return this.get(`/crm/patologias-zona?id_clinica=${id_clinica}`);
    },

    getCrmPacienteDetalle: function(id_paciente) {
        return this.get(`/crm/paciente/${id_paciente}`);
    },

    enviarMensajeCrm: function(id_paciente, mensaje, canal, asunto_email) {
        return this.post('/crm/mensaje', { id_paciente, mensaje, canal, asunto_email });
    },

    getCrmSegmento: function(id_clinica, filtros) {
        const params = new URLSearchParams({ id_clinica, ...filtros });
        return this.get(`/crm/segmento?${params.toString()}`);
    },

    enviarCampanaCrm: function(id_pacientes, mensaje, canal, asunto_email) {
        return this.post('/crm/campana', { id_pacientes, mensaje, canal, asunto_email });
    },

    getCrmCampanaEstado: function(campaignId) {
        return this.get(`/crm/campana-estado/${campaignId}`);
    },

    getCrmRetencionMedicos: function(id_clinica) {
        return this.get(`/crm/retencion-medicos?id_clinica=${id_clinica}`);
    },

    getCrmPacientes: function(id_clinica, busqueda) {
        return this.get(`/crm/pacientes?id_clinica=${id_clinica}&busqueda=${encodeURIComponent(busqueda || '')}`);
    },

    getCrmCumpleanieros: function(id_clinica, dias) {
        return this.get(`/crm/cumpleanieros?id_clinica=${id_clinica}&dias=${dias || 0}`);
    },

    enviarFelicitacionCrm: function(id_paciente) {
        return this.post('/crm/felicitar', { id_paciente });
    }
};