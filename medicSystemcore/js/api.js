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
    get: async function(path) {
        try {
            const headers = {};
            const token = this.getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`; // 🛡️ Inyección del Token

            const response = await fetch(this.baseURL + path, { headers });
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            return await response.json();
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
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error("🔴 Error POST:", err);
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
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            return await response.json();
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
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            return await response.json();
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
    }
};