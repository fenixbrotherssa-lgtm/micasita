// ==========================================
// MÓDULO: HISTORIA CLÍNICA (SISTEMA INTEGRAL)
// ==========================================
window.historiaModule = {
    init: function(id) {
        if (!id) {
            console.error("❌ No se encontró ID de paciente para inicializar");
            return;
        }
        window.currentPacienteId = id;
        this.initExpediente(id);
    },

    initExpediente: async function(pacienteId) {
        try {
            console.log("📂 Cargando expediente del paciente:", pacienteId);
            const data = await window.api.get(`/pacientes/historia/${pacienteId}`);

            if (data && data.status === "Success") {
                const p = data.perfil;
                const h = data.historiaMedica || {};
                const sv = data.signosVitales || {};
                const ex = data.examenEstomatognatico || [];

               // ======================================
// 1. IDENTIFICACIÓN (DATOS COMPLETOS)
// ======================================
if(document.getElementById('paciente_nombre')) 
    document.getElementById('paciente_nombre').value = `${p.Nombres} ${p.Apellidos}`;

if(document.getElementById('paciente_dni')) {
    document.getElementById('paciente_dni').value = p.DNI || '';
    document.getElementById('paciente_dni').setAttribute('data-id', p.ID_Paciente);
}

if(document.getElementById('paciente_fecha_nac')) {
    document.getElementById('paciente_fecha_nac').value = p.Fecha_Nacimiento ? p.Fecha_Nacimiento.split('T')[0] : '';
}

if(document.getElementById('paciente_genero')) 
    document.getElementById('paciente_genero').value = p.Genero || '';

if(document.getElementById('paciente_edad')) 
    document.getElementById('paciente_edad').value = p.Edad ? `${p.Edad} Años` : '';

if(document.getElementById('paciente_num_historia')) 
    document.getElementById('paciente_num_historia').value = p.Historial_Clinico_General || '';

if(document.getElementById('paciente_email')) 
    document.getElementById('paciente_email').value = p.Email || '';

if(document.getElementById('paciente_telefono')) 
    document.getElementById('paciente_telefono').value = p.Telefono || '';

// --- CAMPOS MSP 033 (MAPEO SEGÚN BASE DE DATOS) ---
if(document.getElementById('paciente_etnia')) 
    document.getElementById('paciente_etnia').value = p.Etnia || '';

if(document.getElementById('paciente_provincia')) 
    document.getElementById('paciente_provincia').value = p.Provincia_Residencia || '';

if(document.getElementById('paciente_canton')) 
    document.getElementById('paciente_canton').value = p.Canton_Residencia || '';

if(document.getElementById('paciente_parroquia')) 
    document.getElementById('paciente_parroquia').value = p.Parroquia_Residencia || '';

if(document.getElementById('paciente_instruccion')) 
    document.getElementById('paciente_instruccion').value = p.Instruccion_Ultimo_Anio || '';

// --- CAMPOS ADICIONALES REQUERIDOS ---
if(document.getElementById('paciente_ocupacion')) 
    document.getElementById('paciente_ocupacion').value = p.Ocupacion || '';

if(document.getElementById('paciente_estado_civil')) 
    document.getElementById('paciente_estado_civil').value = p.Estado_Civil || '';

if(document.getElementById('paciente_sangre')) 
    document.getElementById('paciente_sangre').value = p.Tipo_Sanguineo || '';

if(document.getElementById('paciente_lugar_nacimiento')) 
    document.getElementById('paciente_lugar_nacimiento').value = p.Lugar_Nacimiento || '';

// --- CONTACTO DE EMERGENCIA ---
if(document.getElementById('paciente_em_nombre')) 
    document.getElementById('paciente_em_nombre').value = p.Contacto_Emergencia_Nombre || '';

if(document.getElementById('paciente_em_tel')) 
    document.getElementById('paciente_em_tel').value = p.Contacto_Emergencia_Telefono || '';

if(document.getElementById('paciente_em_parentesco')) 
    document.getElementById('paciente_em_parentesco').value = p.Parentesco_Contacto || '';

                // ======================================
                // 2. ANAMNESIS
                // ======================================
                const camposH = {
                    'paciente_alergias': h.Alergias,
                    'paciente_enfermedades': h.Enfermedades_Sistemicas,
                    'paciente_medicamentos': h.Medicamentos,
                    'paciente_cirugias': h.Cirugias_Previas,
                    'paciente_observaciones': h.Observaciones
                };

                for (let id in camposH) {
                    const el = document.getElementById(id);
                    if (el) el.value = camposH[id] || '';
                }

                // ======================================
                // 3. MSP 033 - SIGNOS VITALES (CARGA REAL)
                // ======================================
                if (sv) {
                    if(document.getElementById('sv_pa')) 
                        document.getElementById('sv_pa').value = sv.Presion_Arterial || '';

                    if(document.getElementById('sv_fc')) 
                        document.getElementById('sv_fc').value = sv.Frecuencia_Cardiaca || '';

                    if(document.getElementById('sv_temp')) 
                        document.getElementById('sv_temp').value = sv.Temperatura || '';

                    if(document.getElementById('sv_fr')) 
                        document.getElementById('sv_fr').value = sv.Frecuencia_Respiratoria || '';
                }

                // ======================================
                // 4. MSP 033 - EXAMEN ESTOMATOGNÁTICO
                // ======================================
                if (Array.isArray(ex) && ex.length > 0) {
                    ex.forEach(item => {
                        // Checkbox NORMAL
                        const normalCheck = document.querySelector(
                            `input[data-region="${item.Region_Cod}"][data-tipo="normal"]`
                        );

                        // Checkbox PATOLOGÍA
                        const patoCheck = document.querySelector(
                            `input[data-region="${item.Region_Cod}"][data-tipo="patologia"]`
                        );

                        // Input descripción
                        const descInput = document.querySelector(
                            `textarea[data-region="${item.Region_Cod}"]`
                        );

                        if (item.Es_Normal) {
                            if (normalCheck) normalCheck.checked = true;
                        } else {
                            if (patoCheck) patoCheck.checked = true;
                            if (descInput) descInput.value = item.Descripcion_Patologia || '';
                        }
                    });
                }

                // ======================================
                // 5. TRATAMIENTOS
                // ======================================
                this.renderTablaTratamientos(data.planesTratamiento);

                // ======================================
                // 6. RECETAS
                // ======================================
                this.cargarHistorialRecetas(pacienteId);

                // ======================================
                // 7. GALERÍA
                // ======================================
                this.cargarGaleriaClinica(pacienteId);
                // ======================================
                // 8. CONSENTIMIENTOS MSP-024  
                // ======================================
                this.cargarConsentimientosMSP024(pacienteId);
            }
        } catch (err) {
            console.error("❌ Error al cargar expediente:", err);
        }
    },

    renderTablaTratamientos: function(planes) {
        const tbody = document.getElementById('tbodyTratamientos');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        if (!planes || planes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">No hay tratamientos registrados</td></tr>';
            return;
        }

        tbody.innerHTML = planes.map(t => {
            const saldo = parseFloat(t.Saldo_Pendiente || 0);
            const pagado = parseFloat(t.Total_Pagado || 0);
            const tieneSaldo = saldo > 0.01;

            return `
            <tr>
                <td style="font-weight:600;">${t.Nombre_Tratamiento || 'Prestación'}</td>
                <td style="text-align:right">$${parseFloat(t.Costo_Total).toFixed(2)}</td>
                <td style="text-align:right; color:#16a34a;">$${pagado.toFixed(2)}</td>
                <td style="text-align:right; color:${tieneSaldo ? '#dc2626' : '#16a34a'}; font-weight:700">
                    $${saldo.toFixed(2)}
                </td>
                <td style="text-align:center;">
                    ${tieneSaldo 
                        ? `<button onclick="window.cobrarTratamiento(${t.ID_Plan})" style="background:#16a34a; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Cobrar</button>`
                        : `<span style="background:#dcfce7; color:#166534; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:bold;">Pagado</span>`
                    }
                </td>
            </tr>`;
        }).join('');
    },

    cargarGaleriaClinica: async function(pacienteId) {
        const grid = document.getElementById('galeria_imagenes_grid');
        if (!grid) return;

        try {
            const res = await window.api.get(`/pacientes/imagenes/${pacienteId}`);
            const serverUrl = window.api.baseURL.replace('/api', '');
            
            if (res.status === "Success" && res.imagenes && res.imagenes.length > 0) {
                grid.innerHTML = res.imagenes.map(imgData => {
                    const fileName = imgData.archivo;
                    const tipo = imgData.tipo || 'Otro';
                    const imgUrl = `${serverUrl}/uploads/clinico/${fileName}`;
                    const fechaTxt = new Date(imgData.fecha).toLocaleDateString();

                    const colors = { 'Rayos X': '#ef4444', 'Antes': '#3b82f6', 'Despues': '#10b981', 'Intraoral': '#8b5cf6' };
                    const badgeColor = colors[tipo] || '#64748b';

                    return `
                    <div class="galeria-item" data-tipo="${tipo}">
                        <div style="position: absolute; top: 5px; left: 5px; z-index: 10;">
                            <input type="checkbox" class="compare-check" value="${imgUrl}" data-tipo="${tipo}" style="width: 18px; height: 18px; cursor: pointer;">
                        </div>
                        <img src="${imgUrl}" onclick="window.verImagenFull('${imgUrl}')" onerror="this.src='assets/placeholder-img.png'" style="cursor: zoom-in;">
                        <div class="info">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">${tipo.toUpperCase()}</span>
                                <span style="color: #94a3b8; font-size: 10px;">${fechaTxt}</span>
                            </div>
                        </div>
                        <div class="btns">
                            <button onclick="window.verImagenFull('${imgUrl}')" style="background: #64748b;" title="Ver"><i class="fas fa-eye"></i></button>
                            <a href="${imgUrl}" download="${fileName}" style="background: #10b981;" title="Descargar"><i class="fas fa-download"></i></a>
                        </div>
                    </div>`;
                }).join('');

                if (res.imagenes.length >= 2) this.injectCompareButton();
            } else {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#94a3b8;">No hay imágenes registradas.</div>`;
            }
        } catch (err) { console.error("❌ Error al cargar galería:", err); }
    },

    cargarHistorialRecetas: async function(pacienteId) {
        const tbody = document.getElementById('tbodyRecetasHistorial');
        if (!tbody) return;

        try {
            const recetas = await window.api.get(`/recetas/paciente/${pacienteId}`);

            if (!recetas || recetas.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8; font-size:0.8rem;">Sin recetas previas</td></tr>';
                return;
            }

            tbody.innerHTML = recetas.map(r => {
                let medsText = "";
                try {
                    const meds = JSON.parse(r.Medicamentos_JSON || '[]');
                    medsText = meds.map(m => m.nombre).join(', ');
                } catch(e) { medsText = "Ver detalles"; }

                return `
                <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;">
                    <td style="padding:10px;">${new Date(r.Fecha).toLocaleDateString()}</td>
                    <td style="padding:10px;">${r.Nombre_Medico}</td>
                    <td style="padding:10px; color:#64748b; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${medsText}</td>
                    <td style="padding:10px; text-align:center;">
                        <button onclick='window.imprimirDocumentoClinico("receta", ${JSON.stringify(r)})' style="background:#4f46e5; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
                            <i class="fas fa-print"></i>
                        </button>
                    </td>
                </tr>`;
            }).join('');
        } catch (e) { console.error("❌ Error cargando recetas:", e); }
    },

cargarConsentimientosMSP024: async function(pacienteId) {
        const contenedor = document.getElementById('lista-consentimientos-msp024');
        if (!contenedor) return;

        try {
            const response = await window.api.get(`/tratamientos/consentimiento/paciente/${pacienteId}`);
            const lista = response?.data || [];

            if (lista.length === 0) {
                contenedor.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.75rem; padding:10px;">Sin formularios MSP-024 registrados.</p>';
                return;
            }

            contenedor.innerHTML = lista.map(ci => {
                const fecha   = new Date(ci.Fecha_Firma).toLocaleDateString('es-EC');
                const seccion = ci.Tipo_Seccion === 'C' ? '<span style="color:#16a34a; font-weight:800;">✅ Acepta</span>'
                              : ci.Tipo_Seccion === 'E' ? '<span style="color:#b45309; font-weight:800;">🔄 Revoca</span>'
                              :                           '<span style="color:#dc2626; font-weight:800;">❌ Niega</span>';
                return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px;">
                    <div>
                        <div style="font-size:0.75rem; font-weight:700; color:#1e293b;">${fecha} — ${seccion}</div>
                        <div style="font-size:0.7rem; color:#64748b;">Dr. ${ci.Nombre_Medico || 'S/R'} <span style="color:#4f46e5;">· MSP: ${ci.Registro_MSP || 'S/R'}</span></div>
                    </div>
                    <button onclick="window._reimprimir024(${ci.ID_Consentimiento}, ${pacienteId})"
                            style="background:#4f46e5; color:white; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.7rem; font-weight:bold; white-space:nowrap;">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                </div>`;
            }).join('');

        } catch(e) {
            console.error("❌ Error cargando consentimientos:", e);
        }
    },
    injectCompareButton: function() {
        if (document.getElementById('btn-comparar-flotante')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-comparar-flotante';
        btn.innerHTML = '<i class="fas fa-columns"></i> Comparar Seleccionadas';
        btn.style = "position: fixed; bottom: 20px; right: 20px; z-index: 999; background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 50px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2); cursor: pointer; display: none;";
        btn.onclick = () => window.abrirComparador();

        document.body.appendChild(btn);

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('compare-check')) {
                const checked = document.querySelectorAll('.compare-check:checked');
                btn.style.display = checked.length === 2 ? 'block' : 'none';
                if (checked.length > 2) e.target.checked = false;
            }
        });
    }
};
window._reimprimir024 = async function(idConsentimiento, idPaciente) {
    try {
        const response = await window.api.get(`/tratamientos/consentimiento/paciente/${idPaciente}`);
        const ci = response?.data?.find(x => x.ID_Consentimiento === idConsentimiento);
        if (!ci) return Swal.fire('Error', 'Formulario no encontrado.', 'error');

        let procedimientos = [];
        try { procedimientos = JSON.parse(ci.Procedimientos_JSON || '[]'); } catch(e) {}

        // ── OBTENER DATOS DE CLÍNICA ──────────────────────────────────────
        let clinica = {};
        try {
            const infoResp = await window.api.getHistoriaClinicaCompleta(idPaciente);
            const p = infoResp?.perfil || {};
            clinica = {
                nombre:    p.Nombre_Clinica || '',
                ruc:       p.RUC           || '',
                direccion: p.Direccion     || '',
                ciudad:    p.Ciudad        || '',
                telefono:  p.Telefono      || '',
                logo:      p.Logo_Ruta     || ''
            };
        } catch(e) { console.warn('No se pudo cargar clínica:', e); }

        // ── REPRESENTANTE LEGAL (si aplica) ───────────────────────────────
        const tieneRepresentante = !!(ci.Rep_Nombre || ci.Rep_Cedula);
        const representante = tieneRepresentante ? {
            nombre:     ci.Rep_Nombre     || '',
            cedula:     ci.Rep_Cedula     || '',
            parentesco: ci.Rep_Parentesco || ''
        } : null;

        const datosLote = {
            firma: ci.Firma_Paciente,
            clinica,
            especialidad:           ci.Especialidad        || '',   // ← NUEVO
            observaciones:          ci.Observaciones       || '',   // ← NUEVO
            representante,                                           // ← NUEVO
            requiere_representante: tieneRepresentante ? 1 : 0,     // ← NUEVO
            consentimiento: {
                aceptado:          ci.Aceptado    ? 1 : 0,
                Aceptado:          ci.Aceptado    ? 1 : 0,
                revocatoria:       ci.Revocatoria ? 1 : 0,
                Revocatoria:       ci.Revocatoria ? 1 : 0,
                Fecha_Firma:       ci.Fecha_Firma,
                ID_Consentimiento: ci.ID_Consentimiento,
                ID_Plan:           ci.ID_Plan,
                Hash_Digital:      ci.Hash_Digital,
                hash_digital:      ci.Hash_Digital,
                Tipo_Seccion:      ci.Tipo_Seccion || 'C',          // ← NUEVO
            },
            tratamientos: procedimientos.map(p => ({
                ...p,
                Nombre_Medico:  ci.Nombre_Medico,
                nombre_medico:  ci.Nombre_Medico,
                Codigo_Medico:  ci.Registro_MSP,
                medico_codigo:  ci.Registro_MSP,
                CIE_Cod:        ci.CIE10_Codigo,
                cie_cod:        ci.CIE10_Codigo,
                CIE_Texto:      ci.CIE10_Descripcion,
                cie_texto:      ci.CIE10_Descripcion,
            }))
        };

        window.imprimirMSP024(datosLote, idPaciente);
    } catch(e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo reconstruir el formulario.', 'error');
    }
};
window.guardarMSP033 = async function () {
    try {
        const idPaciente = window.currentPacienteId;

        if (!idPaciente) {
            Swal.fire({
                icon: 'warning',
                title: 'Paciente no cargado',
                text: 'No hay paciente seleccionado',
                confirmButtonColor: '#f59e0b'
            });
            return;
        }

        // ============================
// 1. SIGNOS VITALES (ACTUALIZADO CON SATURACIÓN)
// ============================
const signos = {
    id_paciente: idPaciente,
    pa: document.getElementById('sv_pa')?.value || '',
    fc: parseInt(document.getElementById('sv_fc')?.value) || 0,
    temp: parseFloat(document.getElementById('sv_temp')?.value) || 0,
    fr: parseInt(document.getElementById('sv_fr')?.value) || 0,
    saturacion: parseInt(document.getElementById('sv_saturacion')?.value) || 0 // NUEVO: Captura Saturación
};

// Enviamos los signos al backend
await window.api.post('/pacientes/msp/signos', signos);

// ============================
// 2. EXAMEN ESTOMATOGNÁTICO (DINÁMICO PARA LAS 9 REGIONES)
// ============================
const hallazgos = [];

// El querySelectorAll encontrará las 9 regiones automáticamente por la clase .area-group
document.querySelectorAll('.area-group').forEach(group => {

    const inputBase = group.querySelector('input[data-region]');
    if (!inputBase) return;

    const region = inputBase.dataset.region;

    const normalCheck = group.querySelector('input[data-tipo="normal"]');
    const patoCheck = group.querySelector('input[data-tipo="patologia"]');
    const textarea = group.querySelector('textarea');

    const normal = normalCheck ? normalCheck.checked : false;
    const patologia = patoCheck ? patoCheck.checked : false;
    const descripcion = textarea ? textarea.value.trim() : '';

    // Solo lo agregamos si se marcó algo o hay texto, para no enviar basura
    if (normal || patologia || descripcion !== '') {
        hallazgos.push({
            region_cod: parseInt(region),
            es_normal: normal ? 1 : 0,
            descripcion: normal ? 'Normal' : descripcion // Si es normal, ponemos texto por defecto o vacío
        });
    }
});

// Enviamos el examen completo (las 9 regiones que existan en el DOM)
await window.api.post('/pacientes/msp/examen-estomatognatico', {
    id_paciente: idPaciente,
    hallazgos
});

// ✅ SUCCESS
Swal.fire({
    icon: 'success',
    title: 'Expediente Actualizado',
    text: 'Se han guardado los signos vitales y el examen estomatognático (MSP 033)',
    confirmButtonColor: '#0ea5e9'
});

    } catch (err) {
        console.error("❌ Error guardando MSP 033:", err);

        // ❌ ERROR
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo guardar el MSP 033',
            confirmButtonColor: '#ef4444'
        });
    }
};

window.imprimirDocumentoClinico = function(tipo, datos) {
    // 1. CAPTURA DE SESIÓN (Como respaldo para datos de clínica)
    const sesionRaw = localStorage.getItem('usuario_sesion');
    const sesion = sesionRaw ? JSON.parse(sesionRaw) : {};
    
    // 2. NORMALIZACIÓN DE DATOS DE CLÍNICA
    const clinica = {
        nombre: datos.Nombre_Clinica || datos.nombre_clinica || sesion.Nombre_Clinica || sesion.nombre_clinica || 'Clínica Dental',
        ruc: datos.RUC || datos.ruc || sesion.RUC || sesion.ruc || '',
        direccion: datos.Direccion || datos.direccion || sesion.Direccion || sesion.direccion || '',
        telefono: datos.Telefono || datos.telefono || sesion.Telefono || sesion.telefono || '',
        logo: datos.Logo_Ruta || datos.logo_ruta || datos.logo || sesion.Logo_Ruta || sesion.logo_ruta || null
    };

    // 3. CONSTRUCCIÓN DE URL DEL LOGO
    let logoUrl = "";
    if (clinica.logo && typeof clinica.logo === 'string') {
        let serverUrl = window.api.baseURL.replace('/api', '');
        if (serverUrl.endsWith('/')) serverUrl = serverUrl.slice(0, -1);
        logoUrl = clinica.logo.startsWith('http') 
            ? clinica.logo 
            : `${serverUrl}/uploads/logos/${clinica.logo}`.replace(/([^:]\/)\/+/g, "$1");
    }

    // 4. EXTRACCIÓN DE DATOS DEL PACIENTE Y MÉDICO
    const pDNI = (datos.perfil && datos.perfil.DNI) || 
                 document.getElementById('paciente_dni')?.value || 
                 datos.DNI || datos.dni || "S/N";

    const pNombre = (datos.perfil && `${datos.perfil.Nombres} ${datos.perfil.Apellidos}`) || 
                    document.getElementById('paciente_nombre')?.value || 
                    (datos.Nombres ? `${datos.Nombres} ${datos.Apellidos || ''}` : (datos.Nombre_Paciente || datos.Paciente || "Paciente"));
    
    const n = sesion.nombres || sesion.Nombres || "";
    const a = sesion.apellidos || sesion.Apellidos || "";
    
    // CAPTURAMOS EL MÉDICO Y EL REGISTRO
    const firmaProfesional = datos.Nombre_Medico || datos.nombre_medico_firma || (n + " " + a).trim() || "Profesional Responsable";
    const registroSanitario = datos.Registro_Sanitario || datos.Registro_Doc_Snapshot || "";

    // CAPTURAMOS EL NÚMERO DE RECETA Y DIAGNÓSTICO CIE-10
    const numReceta = datos.ID_Receta || "";
    const cieCod = datos.CIE10_Cod || datos.cie_cod || datos.CIE_Cod || "";
    const cieTxt = datos.CIE10_Texto || datos.cie_texto || datos.CIE_Texto || "";
    let fechaDocumento = "";
    if (datos.Fecha) {
        // Extraemos solo YYYY-MM-DD para evitar errores de zona horaria
        const soloFecha = datos.Fecha.split('T')[0]; 
        const [anio, mes, dia] = soloFecha.split('-');
        fechaDocumento = `${dia}/${mes}/${anio}`;
    } else {
        // Si es nuevo, usamos la del sistema
        const hoy = new Date();
        const d = String(hoy.getDate()).padStart(2, '0');
        const m = String(hoy.getMonth() + 1).padStart(2, '0');
        fechaDocumento = `${d}/${m}/${hoy.getFullYear()}`;
    }
    // ==========================================
/// ==========================================
// 5. CONSTRUCCIÓN DEL CONTENIDO QR (RUTA DIRECTA)
// ==========================================

// Usamos la URL pública para que funcione fuera de la máquina (QR en celular)
const baseParaQR = window.api.publicURL || window.api.baseURL; 

// Construimos la ruta pegando el endpoint de verificación
// Resultado: https://tudominio.com/api/recetas/verificar/123
let contenidoQR = `${baseParaQR}/api/recetas/verificar/${numReceta}`;

// Escapado simple para que no rompa la impresión
const contenidoQREscapado = contenidoQR
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
        <head>
            <title>${tipo.toUpperCase()} - ${pNombre}</title>
            <!-- QR library: mismo origen que inventario.js -->
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
            <style>
                @page { size: A5; margin: 10mm; }
                body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 11px; line-height: 1.3; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; }
                .logo-container { width: 100px; height: 50px; display: flex; align-items: center; justify-content: center; }
                .logo { max-height: 50px; max-width: 100px; object-fit: contain; }
                .legal-info { text-align: right; line-height: 1.2; }
                .legal-info h2 { margin: 0; font-size: 13px; color: #1e3a8a; text-transform: uppercase; }
                .legal-info p { margin: 0; font-size: 8px; color: #64748b; }
                .ruc-bold { font-weight: bold; color: #0f172a; font-size: 9px; }
                
                .paciente-box { background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 10px; display: grid; grid-template-columns: 1.5fr 1fr; gap: 8px; border: 1px solid #e2e8f0; }
                
                /* Caja especial para el Diagnóstico */
                .diagnostico-box { background: #f0fdf4; padding: 8px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #bbf7d0; display: ${tipo === 'receta' && cieCod ? 'block' : 'none'}; }
                
                .item-info { display: flex; flex-direction: column; }
                .label { font-size: 7px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 2px; }
                .value { font-size: 10px; font-weight: 600; color: #1e293b; }
                
                .doc-title { text-align: center; font-size: 11px; font-weight: 800; text-transform: uppercase; margin: 10px 0; color: #1e3a8a; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 4px 0; background: #f1f5f9; }
                
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                th { background: #3b82f6; color: white; text-align: left; padding: 6px; font-size: 8px; text-transform: uppercase; }
                td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 10px; }
                
                .total-box { text-align: right; margin-top: 10px; padding: 8px; background: #1e3a8a; color: white; font-weight: bold; font-size: 11px; border-radius: 4px; }
                
                .indicaciones { margin-top: 10px; padding: 10px; border-left: 3px solid #3b82f6; background: #fafafa; border-radius: 0 4px 4px 0; }
                .indicaciones strong { font-size: 8px; color: #3b82f6; text-transform: uppercase; }
                .indicaciones p { margin: 5px 0 0 0; white-space: pre-line; font-size: 10px; }

                /* ==========================================
                   ESTILOS DEL BLOQUE QR (SOLO RECETAS)
                   Posicionado al lado de la firma para no
                   romper el layout A5 existente
                ========================================== */
                .footer-firmas { margin-top: 50px; display: flex; justify-content: space-around; align-items: flex-end; }
                .firma-box { border-top: 1px solid #1e293b; width: 180px; text-align: center; padding-top: 5px; font-size: 9px; font-weight: bold; line-height: 1.4; }

                .qr-receta-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                }
                .qr-receta-wrapper #qr-receta-box img,
                .qr-receta-wrapper #qr-receta-box canvas {
                    width: 90px !important;
                    height: 90px !important;
                    border: 1px solid #e2e8f0;
                    padding: 4px;
                    border-radius: 6px;
                    display: block;
                }
                .qr-receta-label {
                    font-size: 7px;
                    color: #64748b;
                    text-transform: uppercase;
                    font-weight: bold;
                    margin-top: 3px;
                    letter-spacing: 0.5px;
                    text-align: center;
                }
                
                @media print { .no-print { display: none; } body { padding: 0; } }
            </style>
        </head>
        <body>
            <div class="no-print" style="text-align:right; margin-bottom:10px;">
                <button onclick="window.print()" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight:bold;">🖨️ IMPRIMIR</button>
            </div>

            <div class="header">
                <div class="logo-container">
                    ${logoUrl ? `<img src="${logoUrl}" class="logo" onerror="this.style.display='none'">` : ''}
                </div>
                <div class="legal-info">
                    <h2>${clinica.nombre}</h2>
                    <p class="ruc-bold">RUC: ${clinica.ruc}</p>
                    <p>${clinica.direccion}</p>
                    <p>Telf: ${clinica.telefono}</p>
                </div>
            </div>

            <div class="paciente-box">
                <div class="item-info">
                    <span class="label">Paciente</span>
                    <span class="value">${pNombre}</span>
                </div>
                <div class="item-info">
    <span class="label">Fecha</span>
    <span class="value">${fechaDocumento}</span>
</div>
                <div class="item-info">
                    <span class="label">Cédula / DNI</span>
                    <span class="value">${pDNI}</span>
                </div>
                <div class="item-info">
                    <span class="label">Profesional</span>
                    <span class="value">${firmaProfesional} ${registroSanitario ? `(Reg: ${registroSanitario})` : ''}</span>
                </div>
            </div>

            <div class="diagnostico-box">
                <span class="label" style="color: #166534;">Diagnóstico (CIE-10)</span>
                <div class="value" style="color: #166534; font-size: 9px;">
                    <b style="background: #166534; color: white; padding: 1px 4px; border-radius: 3px; font-size: 8px; margin-right: 5px;">${cieCod}</b> ${cieTxt}
                </div>
            </div>

            <div class="doc-title">${tipo === 'receta' ? `Receta Médica ${numReceta ? 'N° '+numReceta : ''}` : 'Presupuesto'}</div>

            <table>
                <thead>
                    ${tipo === 'receta' 
                        ? '<tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Duración</th></tr>' 
                        : '<tr><th>Descripción</th><th style="text-align:right">Costo</th></tr>'}
                </thead>
                <tbody>
                    ${tipo === 'receta' 
                        ? (Array.isArray(datos.medicamentos) ? datos.medicamentos : JSON.parse(datos.Medicamentos_JSON || '[]')).map(m => `<tr><td><b>${m.nombre}</b></td><td>${m.dosis}</td><td>${m.frecuencia}</td><td>${m.duracion}</td></tr>`).join('')
                        : (Array.isArray(datos.detalle_json) ? datos.detalle_json : JSON.parse(datos.Detalle_JSON || '[]')).map(i => `<tr><td>${i.nombre}</td><td style="text-align:right">$${parseFloat(i.costo_total || i.Costo_Total || 0).toFixed(2)}</td></tr>`).join('')}
                </tbody>
            </table>

            ${tipo === 'presupuesto' ? `<div class="total-box">TOTAL: $${parseFloat(datos.total || datos.Total || 0).toFixed(2)}</div>` : ''}

            <div class="indicaciones">
                <strong>Observaciones / Indicaciones:</strong>
                <p>${tipo === 'receta' ? (datos.indicaciones || datos.Indicaciones_Generales || 'Ninguna.') : (datos.observaciones || 'Válido por 15 días.')}</p>
            </div>

            ${tipo === 'receta' && (datos.proxima_cita || datos.Proxima_Cita) ? `
            <div style="margin-top: 10px; font-size: 9px; color: #1e3a8a; font-weight: bold;">
                📅 PRÓXIMA CITA: ${new Date(datos.proxima_cita || datos.Proxima_Cita).toLocaleDateString()}
            </div>
            ` : ''}

            <!-- ==========================================
                 SECCIÓN DE FIRMAS + QR (SOLO RECETAS)
                 El QR queda a la derecha de la firma del
                 médico. En presupuesto se mantiene el
                 layout original con dos líneas de firma.
            ========================================== -->
            <div class="footer-firmas">
                <div class="firma-box">
                    ${firmaProfesional}<br>
                    ${registroSanitario ? `<span style="font-size:8px; font-weight:normal; color:#475569;">Reg: ${registroSanitario}</span><br>` : ''}
                    <span style="font-weight:normal; font-size:7px; color:#64748b;">Firma Médico</span>
                </div>

                ${tipo === 'receta' ? `
                <!-- QR DE VERIFICACIÓN DE RECETA -->
                <div class="qr-receta-wrapper">
                    <div id="qr-receta-box"></div>
                    <div class="qr-receta-label">Verificar Receta</div>
                </div>
                ` : '<div class="firma-box">Firma Paciente</div>'}
            </div>
        </body>

        ${tipo === 'receta' ? `
        <script>
            // ==========================================
            // GENERACIÓN DE QR EN RECETA
            // Mismo patrón que inventario.js:
            //   1. Intenta qrcodejs (ya cargado en <head>)
            //   2. Fallback a api.qrserver.com si falla
            // ==========================================
            (function generarQRReceta() {
                const qrDiv = document.getElementById('qr-receta-box');
                if (!qrDiv) return;

                const contenido = \`${contenidoQREscapado}\`;

                try {
                    if (typeof QRCode !== 'undefined') {
                        new QRCode(qrDiv, {
                            text: contenido,
                            width: 90,
                            height: 90,
                            colorDark: "#1e3a8a",
                            colorLight: "#ffffff",
                            correctLevel: QRCode.CorrectLevel.M
                        });
                    } else {
                        // Fallback: API externa (igual que inventario.js)
                        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=90x90&data='
                            + encodeURIComponent(contenido);
                        qrDiv.innerHTML = '<img src="' + qrUrl + '" style="width:90px;height:90px;border:1px solid #e2e8f0;padding:4px;border-radius:6px;">';
                    }
                } catch (err) {
                    // Si todo falla, silencioso: el documento sigue siendo válido sin QR
                    console.warn('QR no generado:', err);
                    qrDiv.innerHTML = '';
                }
            })();
        <\/script>
        ` : ''}
        </html>
    `);
    ventana.document.close();
};
// ==========================================
// 2. FUNCIONES: RECETA PROFESIONAL (MODAL Y LÓGICA) - FULL MSP COMPLIANT
// ==========================================

window.medsTemporales = [];

window.agregarMedALista = function() {
    const nombre = document.getElementById('rec_med').value;
    const dosis = document.getElementById('rec_dos').value;
    const via = document.getElementById('rec_via').value; // Nueva Vía
    const frecuencia = document.getElementById('rec_fre').value;
    const duracion = document.getElementById('rec_dur').value;
    
    if (!nombre || !via) {
        return Swal.showValidationMessage("Nombre y Vía son obligatorios");
    }
    
    window.medsTemporales.push({ nombre, dosis, via, frecuencia, duracion });
    
    // Limpiar campos y devolver foco
    ['rec_med', 'rec_dos', 'rec_fre', 'rec_dur'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('rec_via').value = 'Oral'; // Reset a default
    
    document.getElementById('rec_med').focus();
    window.actualizarTablaMedsReceta();
};

window.actualizarTablaMedsReceta = function() {
    const tbody = document.getElementById('body-meds-receta');
    if (!tbody) return;
    
    if (window.medsTemporales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color: #94a3b8;">Agregue los medicamentos arriba</td></tr>';
        return;
    }
    
    tbody.innerHTML = window.medsTemporales.map((m, idx) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px;"><b>${m.nombre}</b></td>
            <td style="padding: 10px;">${m.dosis}</td>
            <td style="padding: 10px;"><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:11px;">${m.via}</span></td>
            <td style="padding: 10px;">${m.frecuencia}</td>
            <td style="padding: 10px;">${m.duracion}</td>
            <td style="padding: 10px; text-align: center;">
                <button type="button" onclick="window.medsTemporales.splice(${idx},1); window.actualizarTablaMedsReceta();" 
                        style="border:none; background:none; color:#ef4444; cursor:pointer;">
                    <i class="fas fa-times-circle"></i>
                </button>
            </td>
        </tr>
    `).join('');
};

window.abrirModalReceta = async function() {
    const inputDNI = document.getElementById('paciente_dni');
    const inputNombre = document.getElementById('paciente_nombre');
    
    const idPacienteRaw = window.currentPacienteId || (inputDNI ? inputDNI.getAttribute('data-id') : null);
    const idPaciente = idPacienteRaw ? parseInt(idPacienteRaw) : null;
    
    const dniActual = inputDNI ? inputDNI.value : '';
    const nombreActual = inputNombre ? inputNombre.value : '';

    if (!idPaciente) return Swal.fire("Error", "Seleccione un paciente primero", "warning");

    let medicos = [];
    try {
        medicos = await window.api.get('/usuarios/listar-medicos');
    } catch (e) {
        console.error("Error cargando médicos:", e);
    }

    window.medsTemporales = []; 

    const { value: formValues } = await Swal.fire({
        title: 'Generar Receta Médica Profesional',
        width: '1000px',
        html: `
            <div style="text-align: left; font-family: 'Segoe UI', sans-serif;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div style="background: #eff6ff; padding: 12px; border-radius: 8px; border: 1px solid #bfdbfe;">
                        <label style="font-size: 11px; font-weight: bold; color: #1e40af;">MÉDICO QUE PRESCRIBE:</label>
                        <select id="sw-medico-receta" class="swal2-select" style="width:100%; margin: 5px 0; height: 38px; font-size:14px;">
                            <option value="">-- Seleccione al Profesional --</option>
                            ${medicos.map(m => `
                                <option value="${m.ID_Usuario}" 
                                        data-nombre="Dr(a). ${m.Apellidos} ${m.Nombres}" 
                                        data-registro="${m.Registro_Sanitario || ''}">
                                    Dr(a). ${m.Apellidos} ${m.Nombres} ${m.Registro_Sanitario ? `(Reg: ${m.Registro_Sanitario})` : ''}
                                </option>`).join('')}
                        </select>
                    </div>

                    <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; border: 1px solid #bbf7d0; position: relative;">
                        <label style="font-size: 11px; font-weight: bold; color: #166534;">DIAGNÓSTICO CIE-10:</label>
                        <input type="text" id="busqueda_cie10_receta" class="swal2-input" 
                               style="margin: 5px 0; width:100%; height: 38px; font-size:14px;" 
                               placeholder="Buscar código o enfermedad..." autocomplete="off">
                        
                        <div id="res_cie10_receta" style="position: absolute; width: 95%; max-height: 150px; overflow-y: auto; z-index: 9999; background: white; border: 1px solid #ddd; display: none; border-radius: 4px;"></div>
                        
                        <input type="hidden" id="cie10_cod_receta">
                        <input type="hidden" id="cie10_txt_receta">

                        <div style="margin-top: 5px; display: flex; gap: 15px; font-size: 11px;">
                            <label><input type="radio" name="tipo_diag" value="Presuntivo" checked> Presuntivo</label>
                            <label><input type="radio" name="tipo_diag" value="Definitivo"> Definitivo</label>
                        </div>
                    </div>
                </div>

                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: end;">
                        <div>
                            <label style="font-size: 10px; font-weight: bold; color: #64748b;">MEDICAMENTO</label>
                            <input type="text" id="rec_med" class="swal2-input" style="margin:0; width:100%; height: 35px; font-size:13px;" placeholder="Ej: Paracetamol">
                        </div>
                        <div>
                            <label style="font-size: 10px; font-weight: bold; color: #64748b;">DOSIS</label>
                            <input type="text" id="rec_dos" class="swal2-input" style="margin:0; width:100%; height: 35px; font-size:13px;" placeholder="500mg">
                        </div>
                        <div>
                            <label style="font-size: 10px; font-weight: bold; color: #64748b;">VÍA ADM.</label>
                            <select id="rec_via" class="swal2-select" style="margin:0; width:100%; height: 35px; font-size:12px;">
                                <option value="Oral">Oral</option>
                                <option value="Sublingual">Sublingual</option>
                                <option value="Tópica">Tópica</option>
                                <option value="Inhalatoria">Inhalatoria</option>
                                <option value="Intramuscular">Intramuscular</option>
                                <option value="Intravenosa">Intravenosa</option>
                                <option value="Subcutánea">Subcutánea</option>
                                <option value="Oftálmica">Oftálmica</option>
                                <option value="Otica">Otica</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 10px; font-weight: bold; color: #64748b;">FRECUENCIA</label>
                            <input type="text" id="rec_fre" class="swal2-input" style="margin:0; width:100%; height: 35px; font-size:13px;" placeholder="c/8h">
                        </div>
                        <div>
                            <label style="font-size: 10px; font-weight: bold; color: #64748b;">DURACIÓN</label>
                            <input type="text" id="rec_dur" class="swal2-input" style="margin:0; width:100%; height: 35px; font-size:13px;" placeholder="5 días">
                        </div>
                        <button type="button" onclick="window.agregarMedALista()" style="height: 35px; background: #3b82f6; color: white; border:none; padding: 0 12px; border-radius: 5px; cursor: pointer;">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>

                <div style="max-height: 180px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead style="background: #f1f5f9;">
                            <tr>
                                <th style="padding: 10px; text-align: left;">Medicamento</th>
                                <th style="padding: 10px; text-align: left;">Dosis</th>
                                <th style="padding: 10px; text-align: left;">Vía</th>
                                <th style="padding: 10px; text-align: left;">Frecuencia</th>
                                <th style="padding: 10px; text-align: left;">Duración</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="body-meds-receta">
                            <tr><td colspan="6" style="text-align:center; padding: 20px; color: #94a3b8;">No hay medicamentos</td></tr>
                        </tbody>
                    </table>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #64748b;">INDICACIONES GENERALES:</label>
                        <textarea id="rec_ind" class="swal2-textarea" style="height: 60px; margin-top: 5px; font-size: 13px; width: 100%;"></textarea>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #64748b;">PRÓXIMA CITA:</label>
                        <input type="date" id="rec_cita" class="swal2-input" style="margin-top: 5px; height: 35px; width: 100%;">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Guardar Receta',
        didOpen: () => {
            const input = document.getElementById('busqueda_cie10_receta');
            const lista = document.getElementById('res_cie10_receta');

            input.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                if (query.length < 2) { lista.style.display = 'none'; return; }

                if (typeof CATALOGO_CIE10 === 'undefined') return;

                const filtrado = CATALOGO_CIE10.filter(i => 
                    i.c.toLowerCase().includes(query) || i.d.toLowerCase().includes(query)
                ).slice(0, 8);

                if (filtrado.length > 0) {
                    lista.innerHTML = filtrado.map(i => `
                        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 12px; text-align: left;"
                             onclick="document.getElementById('busqueda_cie10_receta').value='[${i.c}] ${i.d}';
                                      document.getElementById('cie10_cod_receta').value='${i.c}';
                                      document.getElementById('cie10_txt_receta').value='${i.d}';
                                      document.getElementById('res_cie10_receta').style.display='none';">
                            <b style="color:#059669;">${i.c}</b> - ${i.d}
                        </div>`).join('');
                    lista.style.display = 'block';
                } else {
                    lista.style.display = 'none';
                }
            });

            document.addEventListener('click', (e) => {
                if (e.target !== input) lista.style.display = 'none';
            });
        },
        preConfirm: () => {
            const selMed = document.getElementById('sw-medico-receta');
            const cieCod = document.getElementById('cie10_cod_receta').value;
            const cieTxt = document.getElementById('cie10_txt_receta').value;
            const tipoDiag = document.querySelector('input[name="tipo_diag"]:checked').value;

            if (!selMed.value) return Swal.showValidationMessage("Seleccione el médico");
            if (window.medsTemporales.length === 0) return Swal.showValidationMessage("Agregue medicamentos");
            if (!cieCod) return Swal.showValidationMessage("Seleccione diagnóstico CIE-10");
            
            const sesion = JSON.parse(localStorage.getItem('usuario_sesion')) || {};
            const medicoSeleccionado = selMed.options[selMed.selectedIndex];
            
            return {
                id_paciente: idPaciente,
                id_usuario: parseInt(selMed.value),
                id_clinica: sesion.ID_Clinica || sesion.id_clinica,
                medicamentos: [...window.medsTemporales],
                indicaciones: document.getElementById('rec_ind').value,
                proxima_cita: document.getElementById('rec_cita').value || null,
                cie_cod: cieCod,
                cie_texto: cieTxt,
                tipo_diagnostico: tipoDiag,
                dni_temp: dniActual,
                nombre_temp: nombreActual,
                medico_nombre: medicoSeleccionado.dataset.nombre,
                medico_registro: medicoSeleccionado.dataset.registro
            };
        }
    });

    if (formValues) {
        try {
            const res = await window.api.post('/recetas/guardar', formValues);
            if (res.status === "Success") {
                if (window.historiaModule?.cargarHistorialRecetas) {
                    window.historiaModule.cargarHistorialRecetas(idPaciente);
                }

                // Preparamos objeto limpio para impresión
                const recetaParaImprimir = {
                    ...formValues,
                    ID_Receta: res.id_receta,
                    DNI: formValues.dni_temp,
                    Paciente: formValues.nombre_temp,
                    Nombre_Medico: formValues.medico_nombre,
                    Registro_Sanitario: formValues.medico_registro
                };

                Swal.fire({
                    icon: "success",
                    title: `Receta #${res.id_receta} Guardada`,
                    showCancelButton: true,
                    confirmButtonText: "🖨️ Imprimir",
                    cancelButtonText: "Cerrar",
                    confirmButtonColor: '#10b981'
                }).then(result => {
                    if(result.isConfirmed) {
                        window.imprimirDocumentoClinico('receta', recetaParaImprimir);
                    }
                });
            }
        } catch (e) { 
            console.error(e);
            Swal.fire("Error", "No se pudo guardar", "error"); 
        }
    }
};

// ==========================================
// REPORTE DE PRESTACIONES (ULTRA-FIX)
// ==========================================

// 1. CARGA EL CATÁLOGO (CON VALIDACIÓN DE ESTADO)
async function cargarPrestacionesAudit() {
    const select = document.getElementById('audit_prestacion');
    
    // Si el select no existe o ya tiene las opciones cargadas (más del "ALL"), abortamos
    if (!select || select.options.length > 1) return;

    try {
        console.log("🔄 Sincronizando catálogo de prestaciones...");
        const res = await window.api.get('/tratamientos/catalogo');
        const data = res.data || res;

        // Limpieza y opción por defecto obligatoria
        select.innerHTML = '<option value="ALL">Todas las prestaciones</option>';

        if (Array.isArray(data) && data.length > 0) {
            const fragment = document.createDocumentFragment();
            data.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.ID_Prestacion; 
                opt.textContent = p.Nombre_Prestacion.toUpperCase();
                fragment.appendChild(opt);
            });
            select.appendChild(fragment);
            console.log(`✅ Catálogo cargado: ${data.length} ítems listos.`);
        }
    } catch (err) {
        console.error("❌ Error en la carga del catálogo:", err);
    }
}

// 2. FUNCIÓN DE CONSULTA (CAPTURA DINÁMICA)
window.obtenerReporteAuditado = async () => {
    const inputDesde = document.getElementById('audit_desde');
    const inputHasta = document.getElementById('audit_hasta');
    const selectPres = document.getElementById('audit_prestacion');

    if (!inputDesde?.value || !inputHasta?.value) {
        return Swal.fire('Atención', 'Seleccione un rango de fechas.', 'warning');
    }

    const desde = inputDesde.value;
    const hasta = inputHasta.value;
    const idPrestacion = selectPres.value; 

    try {
        // La URL inyecta el ID real (ej: 41 para Brackets) en lugar del string "ALL"
        const url = `/pacientes/auditoria/prestaciones/ALL?desde=${desde}&hasta=${hasta}&id_prestacion=${idPrestacion}`;
        const res = await window.api.get(url);

        const contenedor = document.getElementById('audit_tbody');
        const sectionResultados = document.getElementById('audit_results');
        
        if (sectionResultados) sectionResultados.style.display = 'block';
        contenedor.innerHTML = '';

        if (res.status === "Success" && res.data && res.data.length > 0) {
            let htmlRows = '';
            res.data.forEach(item => {
                htmlRows += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px;">${new Date(item.Fecha_Inicio).toLocaleDateString()}</td>
                        <td style="padding: 10px;">
                            <div style="font-weight: 700; color: #1e293b;">${item.Nombre_Paciente}</div>
                            <small style="color: #64748b;">DNI: ${item.DNI || 'N/A'}</small>
                        </td>
                        <td style="padding: 10px;">${item.Nombre_Prestacion || 'TRATAMIENTO'}</td>
                        <td style="padding: 10px;">${item.Doctor}</td>
                        <td style="padding: 10px; text-align: right; font-weight: 800; color: #16a34a;">
                            $${parseFloat(item.Costo_Total || 0).toFixed(2)}
                        </td>
                    </tr>`;
            });
            contenedor.innerHTML = htmlRows;
        } else {
            contenedor.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay datos para esta combinación de filtros.</td></tr>';
        }
    } catch (error) {
        console.error("❌ Fallo crítico en Auditoría:", error);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
    }
};

// 3. EL VIGILANTE AUTOMÁTICO (SOLUCIÓN AL REFREZCO)
// Este observador detecta si el selector aparece en el DOM al cambiar de pestaña
const observerAuditoria = new MutationObserver(() => {
    const el = document.getElementById('audit_prestacion');
    if (el && el.options.length <= 1) {
        cargarPrestacionesAudit();
    }
});

// Iniciamos la vigilancia en todo el cuerpo de la página
observerAuditoria.observe(document.body, { childList: true, subtree: true });

// Intento de carga inicial por si acaso
document.addEventListener('DOMContentLoaded', cargarPrestacionesAudit);
// ==========================================
// FUNCIONES: PRESUPUESTO DINÁMICO CON CANTIDAD
// ==========================================

window.itemsPre = [];

window.abrirModalPresupuesto = async function() {
    // CORRECCIÓN: Asegurar el nombre de variable id_paciente para el controlador
    const id_paciente = window.currentPacienteId || window.router?.currentPatientId || document.getElementById('paciente_dni')?.getAttribute('data-id');
    
    if (!id_paciente) return Swal.fire("Error", "Seleccione un paciente", "error");

    let catalogo = window.router?.catalogoPrestaciones || [];
    if (catalogo.length === 0) {
        try {
            const data = await window.api.get('/tratamientos/catalogo');
            catalogo = Array.isArray(data) ? data : [];
            if(window.router) window.router.catalogoPrestaciones = catalogo;
        } catch (e) { console.error("Error al recuperar catálogo", e); }
    }

    window.itemsPre = []; 

    const { value: formValues } = await Swal.fire({
        title: 'Presupuesto de Tratamientos',
        width: '950px',
        html: `
            <div style="display:flex; gap:15px; height:500px; text-align: left; font-family: 'Segoe UI', sans-serif;">
                <div style="flex: 1; display: flex; flex-direction: column; border-right: 1px solid #e2e8f0; padding-right: 15px;">
                    <input type="text" id="search-pre" class="swal2-input" placeholder="Buscar tratamiento..." style="width:100%; height:35px; margin:0 0 10px 0; font-size:14px;">
                    <div id="lista-pre-cat" style="flex:1; overflow-y:auto; background: #f8fafc; border-radius: 8px; padding: 5px;">
                        ${catalogo.map(item => `
                            <div class="item-presupuesto" onclick="window.addPre('${item.Nombre_Prestacion}', ${item.Precio_Base}, ${item.ID_Prestacion})"
                                 style="padding:10px; border-bottom:1px solid #e2e8f0; cursor:pointer; background: white; margin-bottom: 4px; border-radius: 5px;">
                                <div style="font-weight:bold; font-size:13px;">${item.Nombre_Prestacion}</div>
                                <div style="color:#10b981; font-size:12px; font-weight: bold;">$${parseFloat(item.Precio_Base).toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div style="flex: 1.2; display: flex; flex-direction: column;">
                    <label style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 5px;">DETALLE DEL PRESUPUESTO:</label>
                    <div id="seleccionados-pre" style="flex:1; overflow-y:auto; background:#f1f5f9; padding:10px; border-radius:8px; border: 1px dashed #cbd5e1;">
                        <p style="text-align:center; color:#94a3b8; margin-top:50px; font-size: 13px;">Seleccione ítems del catálogo...</p>
                    </div>
                    <div style="margin-top:15px; padding-top:10px; border-top: 2px solid #3b82f6;">
                        <div style="display:flex; justify-content:space-between; align-items: center;">
                            <span style="font-weight:bold;">TOTAL ESTIMADO:</span>
                            <span id="total-pre" style="font-size: 24px; font-weight: 800; color: #1e293b;">$0.00</span>
                        </div>
                        <textarea id="obs-pre" class="swal2-textarea" placeholder="Notas adicionales..." style="margin-top:10px; height:60px; font-size: 13px; width: 100%;"></textarea>
                    </div>
                </div>
            </div>
        `,
        didOpen: () => {
            document.getElementById('search-pre').addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('.item-presupuesto').forEach(div => {
                    div.style.display = div.innerText.toLowerCase().includes(term) ? 'block' : 'none';
                });
            });
        },
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-save"></i> Guardar Presupuesto',
        preConfirm: () => {
            if (window.itemsPre.length === 0) return Swal.showValidationMessage("Agregue al menos un tratamiento");
            
            const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
            
            // VALIDACIÓN CRÍTICA DE DATOS OBLIGATORIOS
            const payload = {
                id_paciente: id_paciente,
                id_clinica: sesion.ID_Clinica || sesion.id_clinica,
                id_usuario: sesion.ID_Usuario || sesion.id_usuario || sesion.id,
                detalle_json: window.itemsPre,
                total: window.itemsPre.reduce((sum, i) => sum + i.costo_total, 0),
                observaciones: document.getElementById('obs-pre').value
            };

            if (!payload.id_clinica || !payload.id_usuario) {
                return Swal.showValidationMessage("Error de sesión: No se encontró ID de clínica o usuario");
            }

            return payload;
        }
    });

    if (formValues) {
        try {
            const res = await window.api.post('/presupuestos/guardar', formValues);
            if (res.status === "Success") {
                Swal.fire({ 
                    title: "Guardado", 
                    text: "Presupuesto registrado correctamente",
                    icon: "success", 
                    showCancelButton: true, 
                    confirmButtonText: "🖨️ Imprimir" 
                }).then(async (r) => { 
                    if(r.isConfirmed) {
                        // Recargamos para obtener los datos con JOINs del servidor
                        const lista = await window.api.get(`/presupuestos/paciente/${id_paciente}`);
                        if (lista && lista.length > 0) {
                            const dataReal = lista[0]; // El más reciente
                            window.imprimirDocumentoClinico('presupuesto', dataReal);
                        }
                    } 
                });
            } else {
                throw new Error(res.message || "Error desconocido");
            }
        } catch (e) { 
            console.error("Error al guardar presupuesto:", e);
            Swal.fire("Error", "No se pudo guardar: " + e.message, "error"); 
        }
    }
};

window.addPre = function(nombre, precio, id) {
    window.itemsPre.push({ 
        id_prestacion: id, 
        nombre: nombre, 
        precio_lista: precio, 
        cantidad: 1, 
        costo_total: precio,
        descuento: 0 
    });
    window.renderPreList();
};

window.updateCant = function(index, cant) {
    const item = window.itemsPre[index];
    item.cantidad = parseInt(cant) || 1;
    item.costo_total = item.precio_lista * item.cantidad;
    window.renderPreList();
};

window.renderPreList = function() {
    const div = document.getElementById('seleccionados-pre');
    if (!div) return;
    
    let total = 0;
    if (window.itemsPre.length === 0) {
        div.innerHTML = '<p style="text-align:center; color:#94a3b8; margin-top:50px;">Seleccione ítems del catálogo...</p>';
        if(document.getElementById('total-pre')) document.getElementById('total-pre').innerText = `$0.00`;
        return;
    }
    
    div.innerHTML = window.itemsPre.map((item, index) => {
        total += item.costo_total;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; margin-bottom:6px; padding:10px; border-radius:6px; border-left:4px solid #3b82f6; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:12px;">${item.nombre}</div>
                    <div style="color: #64748b; font-size:11px;">u. $${parseFloat(item.precio_lista).toFixed(2)}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="display:flex; flex-direction:column; align-items:center;">
                        <span style="font-size:9px; font-weight:bold; color: #4f46e5;">CANT/DIENTES</span>
                        <input type="number" value="${item.cantidad}" min="1" 
                            onchange="window.updateCant(${index}, this.value)"
                            style="width:50px; text-align:center; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; font-weight:bold;">
                    </div>
                    <div style="width:80px; text-align:right; font-weight:bold; color:#1e293b;">
                        $${item.costo_total.toFixed(2)}
                    </div>
                    <button onclick="window.itemsPre.splice(${index},1); window.renderPreList();" 
                            style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    if(document.getElementById('total-pre')) {
        document.getElementById('total-pre').innerText = `$${total.toFixed(2)}`;
    }
};

// ==========================================
// RESTO DE FUNCIONES (GALERIA, PAGOS, ANAMNESIS)
// ==========================================

window.abrirGaleriaImagenes = function() {
    const idPaciente = document.getElementById('paciente_dni')?.getAttribute('data-id') || window.currentPacienteId;
    if (!idPaciente) return Swal.fire('Atención', 'Seleccione un paciente.', 'warning');

    Swal.fire({
        title: 'Cargar Imagen Clínica',
        text: 'Selecciona el tipo de imagen',
        input: 'select',
        inputOptions: {
            'Rayos X': 'Rayos X',
            'Antes': 'Foto del Antes',
            'Despues': 'Foto del Después',
            'Intraoral': 'Foto Intraoral',
            'Otro': 'Documento / Otro'
        },
        showCancelButton: true,
        confirmButtonText: 'Seleccionar Archivo'
    }).then((result) => {
        if (result.isConfirmed) {
            const tipo = result.value;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;

            input.onchange = async (e) => {
                const archivos = e.target.files;
                if (archivos.length === 0) return;

                const formData = new FormData();
                formData.append('id_paciente', idPaciente);
                formData.append('tipo', tipo);
                for (let i = 0; i < archivos.length; i++) {
                    formData.append('imagenes', archivos[i]);
                }

                try {
                    Swal.fire({ title: 'Subiendo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    const response = await fetch(`${window.api.baseURL}/pacientes/imagenes/subir`, {
                        method: 'POST',
                        // 🛡️ Token JWT (FormData: sin Content-Type)
                        headers: { 'Authorization': `Bearer ${window.api.getToken()}` },
                        body: formData
                    });
                    const res = await response.json();

                    if (res.status === "Success") {
                        Swal.fire('¡Éxito!', 'Imágenes añadidas correctamente.', 'success');
                        window.historiaModule.cargarGaleriaClinica(idPaciente);
                    } else {
                        Swal.fire('Error', res.message, 'error');
                    }
                } catch (err) {
                    Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
                }
            };
            input.click();
        }
    });
};

window.verImagenFull = function(url) {
    let scale = 1;
    let pointX = 0;
    let pointY = 0;
    let start = { x: 0, y: 0 };
    let isDragging = false;

    Swal.fire({
        html: `
            <div id="zoom-container" style="overflow: hidden; height: 75vh; background: #000; cursor: grab; position: relative; border-radius: 8px;">
                <img src="${url}" id="img-zoom-target" 
                     style="width: 100%; height: 100%; object-fit: contain; transform-origin: 0 0; transform: translate(0,0) scale(1); transition: none;">
            </div>
            <div style="color: white; margin-top: 10px; font-size: 0.85rem;">
                <i class="fas fa-search-plus"></i> Rueda del mouse para Zoom y arrastra para mover
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: '90%',
        background: '#1a1a1a',
        didOpen: () => {
            const container = document.getElementById('zoom-container');
            const img = document.getElementById('img-zoom-target');

            const setTransform = () => {
                img.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
            };

            container.onwheel = (e) => {
                e.preventDefault();
                const xs = (e.clientX - pointX) / scale;
                const ys = (e.clientY - pointY) / scale;
                const delta = (e.wheelDelta ? e.wheelDelta : -e.deltaY);
                (delta > 0) ? (scale *= 1.2) : (scale /= 1.2);
                if(scale < 1) scale = 1;
                if(scale > 10) scale = 10;
                pointX = e.clientX - xs * scale;
                pointY = e.clientY - ys * scale;
                setTransform();
            };

            container.onmousedown = (e) => {
                if (scale === 1) return;
                e.preventDefault();
                start = { x: e.clientX - pointX, y: e.clientY - pointY };
                isDragging = true;
                container.style.cursor = 'grabbing';
            };

            window.onmouseup = () => { isDragging = false; container.style.cursor = 'grab'; };

            container.onmousemove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                pointX = e.clientX - start.x;
                pointY = e.clientY - start.y;
                setTransform();
            };
        }
    });
};

window.abrirComparador = function() {
    const selected = document.querySelectorAll('.compare-check:checked');
    if (selected.length !== 2) return Swal.fire('Atención', 'Seleccione exactamente 2 imágenes para comparar.', 'info');
    
    const img1 = selected[0].value;
    const img2 = selected[1].value;

    Swal.fire({
        title: 'Comparador Clínico',
        width: '95%',
        background: '#1a1a1a',
        showConfirmButton: false,
        showCloseButton: true,
        html: `
            <div class="comparison-slider" style="position: relative; width: 100%; height: 70vh; overflow: hidden; border-radius: 8px;">
                <img src="${img2}" style="width: 100%; height: 100%; object-fit: contain; position: absolute; top:0; left:0;">
                <div id="comparison-overlay" style="position: absolute; top:0; left:0; width: 50%; height: 100%; overflow: hidden; border-right: 3px solid #3b82f6;">
                    <img src="${img1}" style="width: 100vw; height: 70vh; object-fit: contain; position: absolute; top:0; left:0;">
                </div>
                <input type="range" min="0" max="100" value="50" style="position: absolute; top: 50%; left:0; width: 100%; z-index: 100; cursor: pointer;" 
                    oninput="document.getElementById('comparison-overlay').style.width = this.value + '%'">
            </div>
            <div style="display: flex; justify-content: space-between; color: white; padding: 10px;">
                <span>← Imagen A</span>
                <span>Imagen B →</span>
            </div>
        `
    });
};

window.cobrarTratamiento = function(idPlan) {
    const idPaciente = document.getElementById('paciente_dni')?.getAttribute('data-id') || window.currentPacienteId;
    if (window.router) window.router.load('pagos', { id: idPaciente, plan: idPlan });
};

window.cargarDatosDePago = async function(pacienteId, idPlanSeleccionado = null) {
    try {
        if (!pacienteId) return;
        const data = await window.api.get(`/pacientes/historia/${pacienteId}`);
        const historial = await window.api.get(`/pagos/historial/${pacienteId}`);
        const selectPlan = document.getElementById('select_plan');
        const tbodyPagos = document.getElementById('tbodyHistorialPagos');

        if (selectPlan && data.planesTratamiento) {
            selectPlan.innerHTML = '<option value="">Seleccione un plan pendiente...</option>';
            data.planesTratamiento.forEach(plan => {
                const saldo = parseFloat(plan.Saldo_Pendiente || 0);
                if (saldo > 0.01 || (idPlanSeleccionado && plan.ID_Plan == idPlanSeleccionado)) {
                    const opt = document.createElement('option');
                    opt.value = plan.ID_Plan;
                    opt.textContent = `${plan.Nombre_Tratamiento} (Debe: $${saldo.toFixed(2)})`;
                    selectPlan.appendChild(opt);
                }
            });
            if (idPlanSeleccionado) selectPlan.value = String(idPlanSeleccionado);
        }

        if (tbodyPagos) {
            tbodyPagos.innerHTML = (Array.isArray(historial) && historial.length > 0)
                ? historial.map(p => `
                    <tr>
                        <td>${new Date(p.Fecha_Pago).toLocaleDateString()}</td>
                        <td>${p.Nombre_Tratamiento || 'Abono'}</td>
                        <td style="color:green; font-weight:bold">$${parseFloat(p.Monto).toFixed(2)}</td>
                        <td><small>${p.Metodo_Pago}</small></td>
                    </tr>
                `).join('')
                : '<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">No hay pagos registrados.</td></tr>';
        }
    } catch (error) { console.error("❌ Error en cargarDatosDePago:", error); }
};

window.procesarPagoElectron = async function(event) {
    if (event) event.preventDefault();
    
    const idPlan = document.getElementById('select_plan').value;
    const monto = document.getElementById('pago_monto').value;
    const sesionRaw = localStorage.getItem('usuario_sesion');
    
    if (!sesionRaw) return Swal.fire('Error', 'Sesión no válida.', 'error');
    const sesion = JSON.parse(sesionRaw);

    if (!idPlan || !monto || monto <= 0) return Swal.fire('Atención', 'Datos inválidos.', 'warning');

    // Usamos esta variable de forma consistente en toda la función
    const idPacienteActual = window.currentPacienteId;

    const formData = new FormData();
    formData.append('id_paciente', idPacienteActual);
    formData.append('id_plan', idPlan);
    formData.append('monto', monto);
    formData.append('metodo', document.getElementById('pago_metodo').value);
    formData.append('id_clinica', sesion.id_clinica || 1);
    
    // Ajuste para asegurar que capturamos el ID de usuario correctamente
    formData.append('id_usuario_audit', sesion.ID_Usuario || sesion.id_usuario);

    const fileInput = document.getElementById('pago_voucher');
    if (fileInput && fileInput.files[0]) formData.append('voucher', fileInput.files[0]);

    try {
        Swal.fire({ title: 'Registrando...', didOpen: () => Swal.showLoading() });
        
        const response = await fetch(`${window.api.baseURL}/pagos/registrar`, { 
            method: 'POST', 
            // 🛡️ Token JWT (FormData: sin Content-Type)
            headers: { 'Authorization': `Bearer ${window.api.getToken()}` },
            body: formData 
        });

        // REPARACIÓN CRÍTICA: Convertir respuesta a JSON antes de usarla
        const res = await response.json();

        if (res.status === "Success") {
            const idPagoActual = res.id_pago;

            Swal.fire({
                title: '¡Pago Registrado!',
                text: `Se ha registrado el abono correctamente. ¿Deseas emitir la factura legal ahora?`,
                icon: 'success',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-file-invoice"></i> Ir a Facturar',
                denyButtonText: '<i class="fas fa-print"></i> Imprimir Recibo',
                cancelButtonText: 'Solo Cerrar',
                confirmButtonColor: '#4f46e5',
                denyButtonColor: '#10b981'
            }).then(async (result) => { // Mantener async aquí para los await internos[cite: 3]
                if (result.isConfirmed) {
                    // 1. Preparamos los datos para el módulo de facturación[cite: 2]
                    localStorage.setItem('factura_pendiente_editar', JSON.stringify({
                        id_pago: idPagoActual,
                        monto: monto,
                        id_paciente: idPacienteActual
                    }));
                    
                    // 2. Redirección mediante router o hash[cite: 3, 5]
                    if (window.router) {
                        window.router.load('facturacion'); 
                    } else {
                        window.location.hash = '/facturacion'; 
                    }

                } else if (result.isDenied) {
                    // 3. Llamada a la función global de impresión definida en index.html[cite: 3]
                    try {
                        const urlRecibo = `${window.api.baseURL}/pagos/recibo/${idPagoActual}`;
                        const respuestaRecibo = await fetch(urlRecibo, { headers: { 'Authorization': `Bearer ${window.api.getToken()}` } });
                        const datosRecibo = await respuestaRecibo.json();

                        if (datosRecibo.success) {
                            // Cambiado de window.facturacionModule a la función global segura[cite: 3]
                            window.imprimirReciboGlobal(datosRecibo.datos);
                        } else {
                            Swal.fire('Error', 'No se pudieron obtener los datos del recibo.', 'error');
                        }
                    } catch (err) {
                        console.error("Error obteniendo datos del recibo:", err);
                    }
                }

                // Refrescos de vista obligatorios[cite: 3]
                if (typeof window.cargarDatosDePago === 'function') {
                    window.cargarDatosDePago(idPacienteActual);
                }
                
                if (window.historiaModule && typeof window.historiaModule.initExpediente === 'function') {
                    window.historiaModule.initExpediente(idPacienteActual);
                }
            }); 
        } else {
            Swal.fire('Error', res.message || 'No se pudo procesar el pago', 'error');
        }
    } catch (error) {
        console.error("Error en el proceso de pago:", error);
        Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
    }
}; 

window.irAlOdontograma = function() {
    const idReal = document.getElementById('paciente_dni')?.getAttribute('data-id') || window.currentPacienteId;
    if (idReal && window.router) window.router.load('odontograma', { id: idReal });
};

window.guardarCambiosClinicos = async function() {
    const idReal = document.getElementById('paciente_dni')?.getAttribute('data-id') || window.currentPacienteId;
    if (!idReal) return;
    const payload = {
        id_paciente: idReal,
        alergias: document.getElementById('paciente_alergias').value,
        enfermedades_sistemicas: document.getElementById('paciente_enfermedades').value,
        medicamentos: document.getElementById('paciente_medicamentos').value,
        cirugias_previas: document.getElementById('paciente_cirugias').value,
        observaciones: document.getElementById('paciente_observaciones').value
    };
    try {
        const res = await window.api.post('/pacientes/anamnesis', payload);
        if(res.status === "Success") {
            Swal.fire({ icon: 'success', title: 'Actualizado', timer: 800, showConfirmButton: false });
        }
    } catch (err) { 
        Swal.fire('Error', 'No se pudo guardar los cambios clínicos', 'error'); 
    }
};

// --- LISTENER PARA CAMBIO DE VISTAS ---
document.addEventListener('viewLanded', (e) => {
    if (e.detail.view === 'pagos') {
        const params = e.detail.params || {};
        const idPaciente = params.id || window.currentPacienteId;
        if (idPaciente) {
            window.currentPacienteId = idPaciente;
            setTimeout(() => window.cargarDatosDePago(idPaciente, params.plan), 200);
        }
    }
});

// ============================================================
// EXPEDIENTE CLÍNICO UNIVERSAL — VERSIÓN MÁSTER PRO v3.0
// Sistema: MedicinaEcuador Pro / Master Clinic Global
// Lógica: Dinámica Multi-sede · Odontograma SVG inline
// Módulos: Demografía · Anamnesis · Signos · Estomatognático
//          Odontograma Pintado · Planes CIE-10 · Recetas · Galería
// ============================================================

window.imprimirExpedienteCompleto = async function () {
    let win;
    try {
        // ─── 0. IDENTIFICAR AL PACIENTE ───────────────────────────────
        const pacienteId =
            window.currentPacienteId ||
            window.router?.currentPatientId ||
            document.getElementById('paciente_dni')?.getAttribute('data-id');

        if (!pacienteId) return alert("Error: No se ha identificado al paciente.");

        win = window.open('', '_blank');
        if (!win) return alert("Por favor, permite los pop-ups para generar el reporte.");

        win.document.write(`
            <html><head><title>Cargando...</title></head>
            <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;">
              <div style="text-align:center;">
                <div style="width:50px;height:50px;border:5px solid #e2e8f0;border-top-color:#1e40af;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div>
                <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
                <h3 style="color:#1e40af;font-size:1.1rem;">Generando Expediente Clínico...</h3>
                <p style="color:#64748b;font-size:.85rem;">Obteniendo todos los datos del paciente</p>
              </div>
            </body></html>`);

        // ─── 1. CAPTURA PARALELA DE TODOS LOS DATOS ──────────────────
const serverUrl = window.api?.baseURL
    ? window.api.baseURL.split('/api')[0]
    : window.location.origin;

// Añadimos 'detalleTratamientos' a las variables
let maestro, odontograma, recetas, examenes, imagenes, signos, detalleTratamientos;

try {
    // IMPORTANTE: Ahora ejecutamos 7 peticiones. 
    // La última es la que trae el CIE-10 y la Fecha_Inicio correcta.
    [maestro, odontograma, recetas, examenes, imagenes, signos, detalleTratamientos] = await Promise.all([
        window.api.get(`/pacientes/reporte-maestro/${pacienteId}`),
        window.api.get(`/odontograma/${pacienteId}`),
        window.api.get(`/recetas/paciente/${pacienteId}`).catch(() => []),
        window.api.get(`/pacientes/examenes/estomatognatico/${pacienteId}`).catch(() => []),
        window.api.get(`/pacientes/imagenes/${pacienteId}`).catch(() => ({ imagenes: [] })),
        window.api.get(`/pacientes/signos-todos/${pacienteId}`).catch(() => []),
        window.api.get(`/tratamientos/paciente/${pacienteId}`).catch(() => []) // <--- NUEVA RUTA CLAVE
    ]);
} catch (err) {
    console.error("Error capturando datos:", err);
    win.close();
    return alert("Error de red al obtener el historial. Verifique la conexión con el servidor.");
}

// ─── 2. NORMALIZACIÓN ─────────────────────────────────────────
const d = maestro?.data || {};

/** 
 * JUAN: Esto es lo único que agregamos. 
 * Si no hacemos esto, el reporte seguirá leyendo 'ID_Paciente' como el número 15.
 * Al hacer esta igualdad, todas las etiquetas ${d.ID_Paciente} del HTML 
 * se actualizarán automáticamente a 'HC-000015' sin que edites nada más.
 */
d.ID_Paciente = d.Historial_Clinico_General || d.ID_Paciente;

// El resto se queda igual como lo tienes:
const planes = Array.isArray(detalleTratamientos) ? detalleTratamientos : [];
const hallazgos = odontograma?.hallazgos || [];
const recetasArr = Array.isArray(recetas) ? recetas : [];
const examenArr = Array.isArray(examenes) ? examenes : [];
const imagenesArr = Array.isArray(imagenes?.imagenes) ? imagenes.imagenes : [];
const signosArr = Array.isArray(signos) ? signos : [];

const logoUrl = d.Logo_Ruta
    ? (d.Logo_Ruta.startsWith('http') ? d.Logo_Ruta : `${serverUrl}/uploads/logos/${d.Logo_Ruta}`)
    : '';

const fmt = v => v || '—';
const fmtDate = v => v ? new Date(v).toLocaleDateString('es-EC') : '—';
const fmtMoney = v => `$${parseFloat(v || 0).toFixed(2)}`;

        // ─── 3. ODONTOGRAMA SVG GENERADO EN MEMORIA (CORRECCIÓN FINAL DE POSICIÓN) ──────────
const COLORES = {
    caries: '#ef4444', fractura: '#ef4444', resina: '#3b82f6',
    carilla_resina: '#bae6fd', carilla_porcelana: '#e0f2fe',
    corona: '#f59e0b', protesis_fija: '#10b981', protesis_removible: '#065f46',
    endodoncia: '#a855f7', sellante: '#22d3ee', raiz: '#7c2d12',
    extraer: '#000000', ausente: '#e2e8f0', periodontitis: '#fee2e2',
    ortodoncia: '#6366f1', supernumerario: '#10b981'
};

const hallazgosMap = {};
hallazgos.forEach(h => {
    const n = String(h.Numero_Diente);
    if (!hallazgosMap[n]) hallazgosMap[n] = [];
    hallazgosMap[n].push(h);
});

function svgPieza(num) {
    const lista = hallazgosMap[String(num)] || [];
    const w = 52, h = 62;
    const esInferior = (num >= 31 && num <= 48) || (num >= 71 && num <= 85);

    const getColor = (cara) => {
        const hF = lista.find(x => (x.Cara_Diente || '').toLowerCase() === cara.toLowerCase() || (x.Cara_Diente || '').toLowerCase() === 'general');
        if (!hF) return 'transparent';
        const clave = (hF.Estado || '').toLowerCase().replace(/ /g, '_');
        return COLORES[clave] || 'transparent';
    };

    const esAusente = lista.some(x => x.Estado === 'Ausente'), 
          esOrtodoncia = lista.some(x => x.Estado === 'Ortodoncia'), 
          esPeriodont = lista.some(x => x.Estado === 'Periodontitis'), 
          esSupernum = lista.some(x => x.Estado === 'Supernumerario');

    const cSup = esAusente ? '#e2e8f0' : getColor('Superior'), 
          cInf = esAusente ? '#e2e8f0' : getColor('Inferior'),
          cIzq = esAusente ? '#e2e8f0' : getColor('Izquierda'), 
          cDer = esAusente ? '#e2e8f0' : getColor('Derecha'), 
          cCen = esAusente ? '#e2e8f0' : getColor('Centro');

    const raizH = lista.find(x => (x.Cara_Diente || '') === 'Raiz'), 
          cRaiz = raizH ? (COLORES[(raizH.Estado || '').toLowerCase().replace(/ /g, '_')] || '#94a3b8') : '#94a3b8';

    const sanadoStroke = (cara) => {
        const hF = lista.find(x => (x.Cara_Diente || '').toLowerCase() === cara.toLowerCase());
        return (hF && hF.Tipo_Registro === 'Evolucion') ? 'stroke:#2563eb;stroke-width:3;' : '';
    };

    /**
     * CORRECCIÓN: Para las filas inferiores invertidas, 
     * un translate negativo alto lo subía al diente de arriba.
     * Al usar -10, el número queda justo debajo de la raíz.
     */
    const transformTexto = esInferior ? `transform="scale(1,-1) translate(0, -10)"` : '';
    const transformS = esInferior ? `transform="scale(1,-1) translate(0, -22)"` : '';

    return `
    <g class="pieza-${num}">
      <rect x="0" y="8" width="${w}" height="${h - 8}" rx="4" fill="${esPeriodont ? '#fee2e2' : '#ffffff'}" stroke="${esPeriodont ? '#ef4444' : esOrtodoncia ? '#6366f1' : '#cbd5e1'}" stroke-width="${esOrtodoncia || esPeriodont ? 1.5 : 0.5}"/>
      
      <text x="${w/2}" y="7" text-anchor="middle" font-size="7" font-weight="800" fill="${num > 50 ? '#4f46e5' : '#475569'}" ${transformTexto}>${num}</text>
      
      <rect x="10" y="10" width="${w - 20}" height="7" rx="3" fill="${cRaiz}" stroke="#94a3b8" stroke-width="0.5"/>
      <polygon points="4,19 ${w-4},19 ${w-4-8},27 12,27" fill="${cSup}" stroke="#94a3b8" stroke-width="0.8" style="${sanadoStroke('Superior')}"/>
      <polygon points="${w-4},19 ${w-4},${h-4} ${w-4-8},${h-12} ${w-4-8},27" fill="${cDer}" stroke="#94a3b8" stroke-width="0.8" style="${sanadoStroke('Derecha')}"/>
      <polygon points="${w-4},${h-4} 4,${h-4} 12,${h-12} ${w-4-8},${h-12}" fill="${cInf}" stroke="#94a3b8" stroke-width="0.8" style="${sanadoStroke('Inferior')}"/>
      <polygon points="4,19 4,${h-4} 12,${h-12} 12,27" fill="${cIzq}" stroke="#94a3b8" stroke-width="0.8" style="${sanadoStroke('Izquierda')}"/>
      <polygon points="12,27 ${w-4-8},27 ${w-4-8},${h-12} 12,${h-12}" fill="${cCen}" stroke="#94a3b8" stroke-width="0.8" style="${sanadoStroke('Centro')}"/>
      
      ${esAusente ? `<line x1="6" y1="20" x2="${w-6}" y2="${h-4}" stroke="#94a3b8" stroke-width="1.5"/><line x1="${w-6}" y1="20" x2="6" y2="${h-4}" stroke="#94a3b8" stroke-width="1.5"/>` : ''}
      
      ${esSupernum ? `
        <g ${transformS}>
            <circle cx="${w-4}" cy="11" r="6" fill="white" stroke="#10b981" stroke-width="1.2"/>
            <text x="${w-4}" y="14" text-anchor="middle" font-size="7" font-weight="900" fill="#10b981">S</text>
        </g>` : ''}

      ${esOrtodoncia ? `<rect x="2" y="19" width="${w-4}" height="3" fill="#6366f1" opacity="0.6"/><rect x="2" y="${h-7}" width="${w-4}" height="3" fill="#6366f1" opacity="0.6"/>` : ''}
    </g>`;
}

function generarFila(nums, xStart) {
    const SEP = 56;
    return nums.map((n, i) => `<g transform="translate(${xStart + (i * SEP)}, 0)">${svgPieza(n)}</g>`).join('');
}

const edadReal = parseInt(d.Edad_Real || d.Edad || 0);
const mostrarTemporales = edadReal <= 12;

const c1 = [18,17,16,15,14,13,12,11], c2 = [21,22,23,24,25,26,27,28];
const c4 = [48,47,46,45,44,43,42,41], c3 = [31,32,33,34,35,36,37,38];
const t1 = [55,54,53,52,51], t2 = [61,62,63,64,65];
const t4 = [85,84,83,82,81], t3 = [71,72,73,74,75];

const svgW = 16 * 56 + 20;
const centroX = svgW / 2;

const svgOdontograma = `
<svg viewBox="0 0 ${svgW} 320" xmlns="http://www.w3.org/2000/svg" style="width:100%; max-height:350px; display:block;">
  <line x1="${centroX}" y1="0" x2="${centroX}" y2="320" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4"/>
  <line x1="0" y1="150" x2="${svgW}" y2="150" stroke="#cbd5e1" stroke-width="1"/>

  <g transform="translate(10, 20)">
    ${generarFila(c1, 0)} ${generarFila(c2, 8 * 56)} 
  </g>
  ${mostrarTemporales ? `
  <g transform="translate(${10 + (3 * 56)}, 85)">
    ${generarFila(t1, 0)} ${generarFila(t2, 5 * 56)}
  </g>` : ''}

  ${mostrarTemporales ? `
  <g transform="translate(${10 + (3 * 56)}, 145)">
    <g transform="scale(1,-1) translate(0,-62)">${generarFila(t4, 0)} ${generarFila(t3, 5 * 56)}</g>
  </g>` : ''}
  <g transform="translate(10, 210)">
    <g transform="scale(1,-1) translate(0,-62)">${generarFila(c4, 0)} ${generarFila(c3, 8 * 56)}</g>
  </g>

  <text x="10" y="310" font-size="8" fill="#94a3b8" font-weight="bold">HISTORIAL CLÍNICO - ${edadReal} AÑOS</text>
</svg>`;

        // ─── 4. LEYENDA DEL ODONTOGRAMA ───────────────────────────────
        const leyendaItems = [
            { color: COLORES.caries,             label: 'Caries' },
            { color: COLORES.resina,             label: 'Resina' },
            { color: COLORES.endodoncia,         label: 'Endodoncia' },
            { color: COLORES.corona,             label: 'Corona' },
            { color: COLORES.protesis_fija,      label: 'Prótesis Fija' },
            { color: COLORES.protesis_removible, label: 'Prótesis Removible' },
            { color: COLORES.sellante,           label: 'Sellante' },
            { color: COLORES.carilla_resina,     label: 'Carilla Resina' },
            { color: COLORES.carilla_porcelana,  label: 'Carilla Porcelana' },
            { color: COLORES.raiz,               label: 'Raíz Residual' },
            { color: COLORES.extraer,            label: 'Para Extraer' },
            { color: COLORES.ausente,            label: 'Ausente' },
            { color: COLORES.periodontitis,      label: 'Periodontitis' },
            { color: COLORES.ortodoncia,         label: 'Ortodoncia' },
            { color: COLORES.supernumerario,     label: 'Supernumerario' }
        ];

        const htmlLeyenda = leyendaItems.map(i => `
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                <div style="width:14px;height:14px;background:${i.color};border:1px solid #cbd5e1;border-radius:3px;flex-shrink:0;"></div>
                <span style="font-size:8px;color:#374151;">${i.label}</span>
            </div>`).join('');

        // ─── 5. TABLA HALLAZGOS ───────────────────────────────────────
        const htmlHallazgos = hallazgos.length > 0 ? hallazgos.map(h => `
            <tr>
                <td style="text-align:center;font-weight:800;">${h.Numero_Diente}</td>
                <td>${h.Cara_Diente || 'General'}</td>
                <td>
                    <span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:8px;font-weight:700;
                          background:${COLORES[(h.Estado||'').toLowerCase().replace(/ /g,'_')] || '#e2e8f0'}20;
                          color:${COLORES[(h.Estado||'').toLowerCase().replace(/ /g,'_')] || '#374151'};
                          border:1px solid ${COLORES[(h.Estado||'').toLowerCase().replace(/ /g,'_')] || '#e2e8f0'}60;">
                        ${h.Estado}
                    </span>
                </td>
                <td>
                    <span style="padding:2px 6px;border-radius:4px;font-size:8px;font-weight:700;
                          background:${h.Tipo_Registro === 'Evolucion' ? '#dbeafe' : '#fee2e2'};
                          color:${h.Tipo_Registro === 'Evolucion' ? '#1e40af' : '#b91c1c'};">
                        ${h.Tipo_Registro === 'Evolucion' ? 'Evolución / Tratado' : 'Hallazgo Inicial'}
                    </span>
                </td>
                <td style="color:#64748b;">${fmtDate(h.Fecha)}</td>
                <td style="color:#475569;">${h.Observaciones || '—'}</td>
            </tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center;padding:12px;color:#94a3b8;">Sin hallazgos registrados en el odontograma.</td></tr>';

        // ─── 6. PLANES DE TRATAMIENTO (con CIE-10) ───────────────────
        let totalCosto = 0, totalSaldo = 0;
        const htmlPlanes = planes.length > 0 ? planes.map(t => {
            const costo = parseFloat(t.Costo_Total || 0);
            const saldo = parseFloat(t.Saldo_Pendiente || 0);
            totalCosto += costo; totalSaldo += saldo;
            const estadoColor = { 'Completado': '#dcfce7', 'En Proceso': '#fef3c7', 'Pendiente': '#fee2e2' };
            const estadoText  = { 'Completado': '#166534', 'En Proceso': '#92400e', 'Pendiente': '#b91c1c' };
            return `
            <tr>
                <td>
                    ${t.CIE_Cod ? `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:8px;font-weight:800;">${t.CIE_Cod}</span>` : '—'}
                    ${t.CIE_Texto ? `<div style="font-size:7px;color:#64748b;margin-top:2px;">${t.CIE_Texto}</div>` : ''}
                </td>
                <td style="font-weight:600;">${t.Nombre_Tratamiento || '—'}</td>
                <td style="text-align:center;">${t.Numero_Diente ? `Pza. ${t.Numero_Diente}` : 'General'}${t.Caras ? `<div style="font-size:7px;color:#4f46e5;">${t.Caras}</div>` : ''}</td>
                <td style="text-align:center;">${fmtDate(t.Fecha_Inicio)}</td>
                <td style="text-align:right;">${fmtMoney(t.Costo_Total)}</td>
                <td style="text-align:right;color:#b91c1c;font-weight:700;">${fmtMoney(t.Saldo_Pendiente)}</td>
                <td style="text-align:center;">
                    <span style="padding:2px 7px;border-radius:4px;font-size:8px;font-weight:700;
                          background:${estadoColor[t.Estado_Tratamiento] || '#f1f5f9'};
                          color:${estadoText[t.Estado_Tratamiento] || '#475569'};">
                        ${t.Estado_Tratamiento || '—'}
                    </span>
                </td>
            </tr>`;
        }).join('') + `
            <tr style="border-top:2px solid #cbd5e1;background:#f8fafc;font-weight:700;">
                <td colspan="4" style="text-align:right;padding:8px;">TOTALES:</td>
                <td style="text-align:right;color:#0f172a;">${fmtMoney(totalCosto)}</td>
                <td style="text-align:right;color:#b91c1c;">${fmtMoney(totalSaldo)}</td>
                <td></td>
            </tr>`
            : '<tr><td colspan="7" style="text-align:center;padding:12px;color:#94a3b8;">No hay planes de tratamiento registrados.</td></tr>';

        // ─── 7. RECETAS ───────────────────────────────────────────────
        const htmlRecetas = recetasArr.length > 0 ? recetasArr.map((r, idx) => {
            let meds = [];
            try { meds = JSON.parse(r.Medicamentos_JSON || '[]'); } catch(e) { meds = []; }
            return `
            <div style="page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px;background:#fafafa;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <div>
                        <span style="font-size:8px;font-weight:800;color:#1e40af;text-transform:uppercase;">Receta #${idx + 1}</span>
                        ${r.CIE10_Cod ? `<span style="margin-left:8px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:8px;font-family:monospace;">${r.CIE10_Cod} — ${r.CIE10_Texto || ''}</span>` : ''}
                    </div>
                    <span style="font-size:8px;color:#64748b;">${fmtDate(r.Fecha)} | Dr. ${r.Registro_Doc_Snapshot || '—'}</span>
                </div>
                <table style="width:100%;font-size:8.5px;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:4px 6px;text-align:left;">Medicamento</th>
                            <th style="padding:4px 6px;text-align:left;">Dosis</th>
                            <th style="padding:4px 6px;text-align:left;">Frecuencia</th>
                            <th style="padding:4px 6px;text-align:left;">Duración</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${meds.length > 0 ? meds.map(m => `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:4px 6px;font-weight:600;">${m.nombre || m.Nombre || '—'}</td>
                            <td style="padding:4px 6px;">${m.dosis || m.Dosis || '—'}</td>
                            <td style="padding:4px 6px;">${m.frecuencia || m.Frecuencia || '—'}</td>
                            <td style="padding:4px 6px;">${m.duracion || m.Duracion || '—'}</td>
                        </tr>`).join('') : '<tr><td colspan="4" style="padding:6px;color:#94a3b8;">Sin medicamentos detallados</td></tr>'}
                    </tbody>
                </table>
                ${r.Indicaciones_Generales ? `<div style="margin-top:6px;background:#eff6ff;padding:6px 8px;border-radius:4px;font-size:8px;color:#1e40af;"><b>Indicaciones:</b> ${r.Indicaciones_Generales}</div>` : ''}
                ${r.Proxima_Cita ? `<div style="margin-top:4px;font-size:8px;color:#64748b;">🗓 Próxima cita: <b>${fmtDate(r.Proxima_Cita)}</b></div>` : ''}
            </div>`;
        }).join('')
        : '<p style="color:#94a3b8;text-align:center;font-size:9px;padding:10px;">No hay recetas registradas para este paciente.</p>';

        // ─── 8. SIGNOS VITALES (historial o último) ───────────────────
        const svData = signosArr.length > 0 ? signosArr : (d.Presion_Arterial ? [d] : []);
        const htmlSignos = svData.length > 0 ? svData.slice(0, 6).map(sv => `
            <tr>
                <td style="text-align:center;white-space:nowrap;">${fmtDate(sv.Fecha_Registro || sv.Fecha_Ultimos_Signos)}</td>
                <td style="text-align:center;font-weight:700;">${fmt(sv.Presion_Arterial)}</td>
                <td style="text-align:center;">${fmt(sv.Frecuencia_Cardiaca)} bpm</td>
                <td style="text-align:center;">${fmt(sv.Temperatura)} °C</td>
                <td style="text-align:center;">${fmt(sv.Frecuencia_Respiratoria)} rpm</td>
                <td style="text-align:center;">${fmt(sv.Saturacion_Oxigeno)}${sv.Saturacion_Oxigeno ? ' %' : ''}</td>
            </tr>`).join('')
        : `<tr>
            <td style="text-align:center;">${fmtDate(d.Fecha_Ultimos_Signos)}</td>
            <td style="text-align:center;font-weight:700;">${fmt(d.Presion_Arterial)}</td>
            <td style="text-align:center;">${fmt(d.Frecuencia_Cardiaca)} bpm</td>
            <td style="text-align:center;">${fmt(d.Temperatura)} °C</td>
            <td style="text-align:center;">${fmt(d.Frecuencia_Respiratoria)} rpm</td>
            <td style="text-align:center;">—</td>
           </tr>`;

        // ─── 9. EXAMEN ESTOMATOGNÁTICO ────────────────────────────────
        const regionesMap = {
            1: 'Apertura Bucal', 2: 'Labios', 3: 'Mucosa Yugal', 4: 'Piso de Boca',
            5: 'Lengua', 6: 'Paladar Duro', 7: 'Paladar Blando', 8: 'Amígdalas',
            9: 'Orofaringe', 10: 'Encías / Periodonto', 11: 'Glándulas Salivales',
            12: 'ATM', 13: 'Ganglios', 14: 'Cara / Cuello'
        };

        const htmlEstomato = examenArr.length > 0 ? (() => {
            // Agrupar por fecha (toma el último examen primero)
            const grupos = {};
            examenArr.forEach(e => {
                const fecha = fmtDate(e.Fecha_Examen);
                if (!grupos[fecha]) grupos[fecha] = [];
                grupos[fecha].push(e);
            });

            return Object.entries(grupos).slice(0, 2).map(([fecha, items]) => `
                <div style="margin-bottom:10px;">
                    <div style="font-size:8px;font-weight:700;color:#1e40af;margin-bottom:4px;">Examen del ${fecha}</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                        ${items.map(e => {
                            const normal = e.Es_Normal == 1 || e.Es_Normal === true;
                            return `<div style="padding:5px 8px;border-radius:5px;border:1px solid ${normal ? '#d1fae5' : '#fecaca'};background:${normal ? '#f0fdf4' : '#fff1f1'};">
                                <div style="font-size:7.5px;font-weight:700;color:${normal ? '#166534' : '#b91c1c'};">
                                    ${normal ? '✔' : '✘'} ${regionesMap[e.Region_Cod] || `Región ${e.Region_Cod}`}
                                </div>
                                ${!normal && e.Descripcion_Patologia ? `<div style="font-size:7px;color:#64748b;margin-top:2px;">${e.Descripcion_Patologia}</div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>`).join('');
        })()
        : '<p style="color:#94a3b8;font-size:9px;padding:8px;">Sin registros de examen estomatognático.</p>';

        // ─── 10. GALERÍA ──────────────────────────────────────────────
        let htmlGaleria = '';
        if (imagenesArr.length > 0) {
            htmlGaleria = imagenesArr.map(img => {
                const src = img.url || `${serverUrl}/uploads/clinico/${img.archivo}`;
                return `<div style="text-align:center;">
                    <img src="${src}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" onerror="this.parentNode.remove()">
                    <div style="font-size:7px;color:#94a3b8;margin-top:3px;">${img.tipo || 'Imagen clínica'}</div>
                </div>`;
            }).join('');
        } else {
            // Intenta leer del DOM como fallback
            document.querySelectorAll('#galeria_imagenes_grid img, .paciente-galeria img').forEach(img => {
                if (img.src && !img.src.includes('placeholder') && !img.src.includes('data:')) {
                    htmlGaleria += `<div style="text-align:center;"><img src="${img.src}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></div>`;
                }
            });
        }

        // ─── 11. INSTRUCCIÓN EDUCATIVA ────────────────────────────────
        const instMap = {
            1:'Ninguna', 2:'Centro Alfabetización', 3:'Primaria Incompleta',
            4:'Primaria Completa', 5:'Secundaria Incompleta', 6:'Secundaria Completa',
            7:'Superior Incompleta', 8:'Superior Completa', 9:'Post-grado'
        };

        // ─── 12. RENDER FINAL DEL DOCUMENTO ──────────────────────────
        win.document.open();
        win.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>HC — ${d.Apellidos || ''} ${d.Nombres || ''}</title>
    <style>
        @page { size: A4; margin: 9mm 10mm; }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            font-size: 9.5px; color: #1e293b; line-height: 1.45; background: #fff;
        }

        /* ── ENCABEZADO ── */
        .hdr {
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 12px;
        }
        .hdr-logo { max-height: 62px; max-width: 180px; object-fit: contain; }
        .hdr-clinica { text-align: right; font-size: 8.5px; line-height: 1.5; }
        .hdr-clinica b { font-size: 13px; color: #1e40af; }

        /* ── TÍTULO ── */
        .main-title {
            text-align: center; font-size: 14px; font-weight: 900; color: #1e40af;
            text-transform: uppercase; letter-spacing: 1.5px; margin: 10px 0;
        }

        /* ── GRILLA DATOS PACIENTE ── */
        .grid-paciente {
            display: grid; grid-template-columns: repeat(4, 1fr);
            gap: 1px; background: #cbd5e1;
            border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;
            margin-bottom: 12px;
        }
        .field {
            background: white; padding: 6px 10px;
            display: flex; flex-direction: column; gap: 1px;
        }
        .field .lbl { font-size: 6.5px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
        .field .val { font-size: 9.5px; color: #0f172a; font-weight: 600; }
        .field.span2 { grid-column: span 2; }
        .field.span4 { grid-column: span 4; }
        .field.span3 { grid-column: span 3; }

        /* ── SECCIONES ── */
        .sec-h {
            background: linear-gradient(135deg, #1e40af, #2563eb);
            color: white; padding: 6px 12px; font-weight: 800;
            border-radius: 5px 5px 0 0; margin-top: 14px;
            font-size: 8.5px; text-transform: uppercase; letter-spacing: .8px;
            display: flex; align-items: center; gap: 6px;
        }
        .sec-body {
            border: 1px solid #cbd5e1; border-top: none;
            padding: 10px 12px; background: #fff;
        }

        /* ── TABLAS ── */
        table { width: 100%; border-collapse: collapse; }
        th {
            background: #f8fafc; padding: 5px 8px; text-align: left;
            font-size: 7.5px; border-bottom: 2px solid #cbd5e1;
            text-transform: uppercase; color: #475569; font-weight: 800;
        }
        td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 8.5px; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: #f8fafc; }

        /* ── ANTECEDENTES ── */
        .ante-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ante-item { background: #f8fafc; padding: 7px 10px; border-radius: 5px; border-left: 3px solid #1e40af; }
        .ante-item.warn { border-left-color: #ef4444; background: #fff5f5; }
        .ante-lbl { font-size: 7px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 3px; }
        .ante-val { font-size: 9px; color: #0f172a; line-height: 1.4; }

        /* ── SIGNOS VITALES CARDS ── */
        .sv-cards { display: flex; gap: 8px; justify-content: space-around; flex-wrap: wrap; }
        .sv-card { text-align: center; background: #f8fafc; padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .sv-val  { font-size: 15px; font-weight: 900; color: #1e40af; }
        .sv-lbl  { font-size: 7px; color: #64748b; margin-top: 2px; }

        /* ── GALERÍA ── */
        .gallery { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }

        /* ── FIRMAS ── */
        .firmas { margin-top: 45px; display: flex; justify-content: space-around; break-inside: avoid; }
        .firma-box { text-align: center; }
        .firma-linea { border-top: 1.5px solid #0f172a; width: 200px; padding-top: 5px; font-weight: 800; font-size: 9px; }
        .firma-sub { font-size: 7.5px; color: #64748b; margin-top: 2px; }

        /* ── BOTÓN IMPRIMIR ── */
        .btn-print {
            position: fixed; bottom: 22px; right: 22px;
            background: linear-gradient(135deg, #059669, #10b981);
            color: white; border: none; padding: 13px 26px;
            border-radius: 50px; cursor: pointer; font-weight: 800; font-size: 12px;
            box-shadow: 0 6px 20px rgba(16,185,129,.35); z-index: 9999;
        }
        @media print {
            .btn-print { display: none !important; }
            .page-break { page-break-before: always; }
            .no-break { break-inside: avoid; }
        }

        /* ── BADGE MSP ── */
        .badge-msp {
            display: inline-block; background: #eff6ff; color: #1e40af;
            border: 1px solid #bfdbfe; border-radius: 4px; padding: 1px 6px;
            font-size: 7px; font-weight: 700; margin-left: 6px;
        }

        /* ── WATERMARK ── */
        .watermark {
            position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
            font-size: 7px; color: #cbd5e1; font-weight: 700; letter-spacing: 1px;
            pointer-events: none;
        }
        @media print { .watermark { position: fixed; } }
    </style>
</head>
<body>
<button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR EXPEDIENTE</button>
<div class="watermark">Ametra-dental · Expediente Generado: ${new Date().toLocaleString('es-EC')}</div>

<!-- ═══════════════════ ENCABEZADO ═══════════════════ -->
<div class="hdr">
    <img src="${logoUrl}" class="hdr-logo" onerror="this.style.visibility='hidden'" alt="">
    <div class="hdr-clinica">
        <b>${d.Nombre_Clinica || 'MedicinaEcuador Pro'}</b><br>
        RUC / Fiscal: ${fmt(d.Clinica_Identificacion_Fiscal)}<br>
        ${fmt(d.Clinica_Direccion)} — ${fmt(d.Clinica_Ciudad)}<br>
        Tel: ${fmt(d.Clinica_Telefono)}
    </div>
</div>

<div class="main-title">Historia Clínica Odontológica <span class="badge-msp">MSP 033</span></div>

<!-- ═══════════════════ DATOS DEL PACIENTE ═══════════════════ -->
<div class="grid-paciente">
    <div class="field span2">
        <span class="lbl">Paciente</span>
        <span class="val" style="font-size:12px;">${d.Apellidos || ''} ${d.Nombres || ''}</span>
    </div>
    <div class="field">
        <span class="lbl">N° Historia Clínica</span>
        <span class="val" style="font-weight:bold; color:#1e40af;">${fmt(d.ID_Paciente)}</span>
    </div>
    <div class="field">
        <span class="lbl">Identificación (DNI)</span>
        <span class="val">${fmt(d.DNI)}</span>
    </div>

    <div class="field">
        <span class="lbl">Género</span>
        <span class="val">${fmt(d.Genero)}</span>
    </div>
    <div class="field">
        <span class="lbl">Fecha de Nacimiento</span>
        <span class="val">${fmtDate(d.Fecha_Nacimiento)}</span>
    </div>
    <div class="field">
        <span class="lbl">Edad</span>
        <span class="val">${fmt(d.Edad_Real)} años</span>
    </div>
    <div class="field">
        <span class="lbl">Estado Civil</span>
        <span class="val">${fmt(d.Estado_Civil)}</span>
    </div>

    <div class="field">
        <span class="lbl">Tipo Sanguíneo</span>
        <span class="val">${fmt(d.Tipo_Sanguineo)}</span>
    </div>
    <div class="field">
        <span class="lbl">Etnia (MSP)</span>
        <span class="val">${fmt(d.Etnia)}</span>
    </div>
    <div class="field">
        <span class="lbl">Ocupación</span>
        <span class="val">${fmt(d.Ocupacion)}</span>
    </div>
    <div class="field">
        <span class="lbl">Instrucción</span>
        <span class="val">${instMap[d.Instruccion_Ultimo_Anio] || fmt(d.Instruccion_Ultimo_Anio)}</span>
    </div>

    <div class="field">
        <span class="lbl">Teléfono</span>
        <span class="val">${fmt(d.Telefono_Paciente)}</span>
    </div>
    <div class="field">
        <span class="lbl">Correo Electrónico</span>
        <span class="val">${fmt(d.Email)}</span>
    </div>
    <div class="field">
        <span class="lbl">Lugar de Nacimiento</span>
        <span class="val">${fmt(d.Lugar_Nacimiento)}</span>
    </div>
    <div class="field">
        <span class="lbl">Sede / Clínica</span>
        <span class="val">${fmt(d.Nombre_Clinica)}</span>
    </div>

    <div class="field">
        <span class="lbl">Provincia</span>
        <span class="val">${fmt(d.Region_Nivel1)}</span>
    </div>
    <div class="field">
        <span class="lbl">Cantón</span>
        <span class="val">${fmt(d.Region_Nivel2)}</span>
    </div>
    <div class="field">
        <span class="lbl">Parroquia</span>
        <span class="val">${fmt(d.Region_Nivel3)}</span>
    </div>
    <div class="field">
        <span class="lbl">Fecha del Reporte</span>
        <span class="val">${new Date().toLocaleString('es-EC')}</span>
    </div>

    <div class="field span2" style="border-top: 1px solid #eee; margin-top: 4px; padding-top: 4px;">
        <span class="lbl">Contacto Emergencia</span>
        <span class="val">${fmt(d.Contacto_Emergencia_Nombre)}</span>
    </div>
    <div class="field" style="border-top: 1px solid #eee; margin-top: 4px; padding-top: 4px;">
        <span class="lbl">Parentesco</span>
        <span class="val">${fmt(d.Parentesco_Contacto)}</span>
    </div>
    <div class="field" style="border-top: 1px solid #eee; margin-top: 4px; padding-top: 4px;">
        <span class="lbl">Tel. Emergencia</span>
        <span class="val">${fmt(d.Contacto_Emergencia_Telefono)}</span>
    </div>
</div>

<!-- ═══════════════════ ANTECEDENTES MÉDICOS ═══════════════════ -->
<div class="sec-h">🩺 Anamnesis / Antecedentes Médicos</div>
<div class="sec-body">
    <div class="ante-grid">
        <div class="ante-item ${d.Alergias && d.Alergias !== 'No registra' ? 'warn' : ''}">
            <div class="ante-lbl">⚠ Alergias</div>
            <div class="ante-val">${fmt(d.Alergias)}</div>
        </div>
        <div class="ante-item">
            <div class="ante-lbl">Enfermedades Sistémicas</div>
            <div class="ante-val">${fmt(d.Enfermedades_Sistemicas)}</div>
        </div>
        <div class="ante-item">
            <div class="ante-lbl">Medicamentos Actuales</div>
            <div class="ante-val">${fmt(d.Medicamentos)}</div>
        </div>
        <div class="ante-item">
            <div class="ante-lbl">Cirugías Previas</div>
            <div class="ante-val">${fmt(d.Cirugias_Previas)}</div>
        </div>
        <div class="ante-item span2" style="grid-column:span 2;">
            <div class="ante-lbl">Observaciones / Notas Médicas</div>
            <div class="ante-val">${fmt(d.Observaciones_Antecedentes)}</div>
        </div>
    </div>
</div>

<!-- ═══════════════════ SIGNOS VITALES ═══════════════════ -->
<div class="sec-h">💓 Signos Vitales</div>
<div class="sec-body">
    <table>
        <thead>
            <tr>
                <th>Fecha</th>
                <th style="text-align:center;">P. Arterial</th>
                <th style="text-align:center;">F. Cardíaca</th>
                <th style="text-align:center;">Temperatura</th>
                <th style="text-align:center;">F. Respiratoria</th>
                <th style="text-align:center;">Saturación O₂</th>
            </tr>
        </thead>
        <tbody>${htmlSignos}</tbody>
    </table>
</div>

<!-- ═══════════════════ EXAMEN ESTOMATOGNÁTICO ═══════════════════ -->
<div class="sec-h">🔬 Examen Estomatognático (MSP 033)</div>
<div class="sec-body">${htmlEstomato}</div>

<!-- ═══════════════════ ODONTOGRAMA ═══════════════════ -->
<div class="sec-h">🦷 Odontograma Clínico</div>
<div class="sec-body">
    <!-- SVG ODONTOGRAMA -->
    <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:10px;">
        ${svgOdontograma}
    </div>

    <!-- LEYENDA -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px;margin-bottom:10px;padding:8px;background:#f8fafc;border-radius:5px;">
        ${htmlLeyenda}
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
            <div style="width:14px;height:4px;background:#2563eb;border-radius:2px;"></div>
            <span style="font-size:8px;color:#374151;">Tratado/Sanado (borde azul)</span>
        </div>
    </div>

    <!-- TABLA DETALLE HALLAZGOS -->
    <table>
        <thead>
            <tr>
                <th style="width:40px;text-align:center;">Pieza</th>
                <th style="width:70px;">Cara</th>
                <th>Estado / Hallazgo</th>
                <th style="width:110px;">Tipo de Registro</th>
                <th style="width:80px;">Fecha</th>
                <th>Observaciones</th>
            </tr>
        </thead>
        <tbody>${htmlHallazgos}</tbody>
    </table>
</div>

<!-- ═══════════════════ PLANES DE TRATAMIENTO ═══════════════════ -->
<div class="sec-h">📋 Plan de Tratamiento y Estado Financiero</div>
<div class="sec-body">
    <table>
        <thead>
            <tr>
                <th style="width:90px;">CIE-10</th>
                <th>Procedimiento</th>
                <th style="width:70px;text-align:center;">Diente</th>
                <th style="width:80px;text-align:center;">Fecha</th>
                <th style="width:70px;text-align:right;">Inversión</th>
                <th style="width:70px;text-align:right;">Saldo</th>
                <th style="width:80px;text-align:center;">Estado</th>
            </tr>
        </thead>
        <tbody>${htmlPlanes}</tbody>
    </table>
</div>

<!-- ═══════════════════ RECETAS ═══════════════════ -->
<div class="sec-h page-break">💊 Recetas Médicas</div>
<div class="sec-body">${htmlRecetas}</div>

<!-- ═══════════════════ GALERÍA ═══════════════════ -->
${htmlGaleria ? `
<div class="sec-h">📸 Evidencia Fotográfica / Diagnóstico por Imagen</div>
<div class="sec-body">
    <div class="gallery">${htmlGaleria}</div>
</div>` : ''}

<!-- ═══════════════════ FIRMAS ═══════════════════ -->
<div class="firmas">
    <div class="firma-box">
        <div class="firma-linea">Firma y Sello del Profesional</div>
        <div class="firma-sub">Odontólogo Responsable / Número de Registro</div>
    </div>
    <div class="firma-box">
        <div class="firma-linea">Firma y Huella del Paciente</div>
        <div class="firma-sub">Aceptación y Consentimiento</div>
    </div>
</div>

</body>
</html>`);
        win.document.close();

    } catch (err) {
        console.error("❌ Error crítico en expediente:", err);
        if (win) win.close();
        alert("Ocurrió un error al generar el Expediente Clínico:\n" + (err.message || err));
    }
};