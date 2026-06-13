// ==========================================
// ARCHIVO: odontograma.js
// ==========================================
// ESTADO GLOBAL DEL ODONTOGRAMA
// ==========================================
window.odontogramaState = {
    selectedTooth: null,
    data: {}, // Historial por pieza: { "18": [h1, h2], "11": [...] }
    tipoPaciente: 'adulto',
    currentTool: null
};

// Definición de patologías base para determinar el Tipo_Registro (Inicial vs Evolución)
const HALLAZGOS_INICIALES = ['Caries', 'Fractura', 'Ausente', 'Raiz', 'Extraer', 'Periodontitis', 'Ortodoncia', 'Supernumerario'];

const NOMBRES_DIENTES = {
    18: "Tercer Molar Sup. Der.", 17: "Segundo Molar Sup. Der.", 16: "Primer Molar Sup. Der.", 15: "Segundo Premolar Sup. Der.", 14: "Primer Premolar Sup. Der.", 13: "Canino Sup. Der.", 12: "Incisivo Lateral Sup. Der.", 11: "Incisivo Central Sup. Der.",
    21: "Incisivo Central Sup. Izq.", 22: "Incisivo Lateral Sup. Izq.", 23: "Canino Sup. Izq.", 24: "Primer Premolar Sup. Izq.", 25: "Segundo Premolar Sup. Izq.", 26: "Primer Molar Sup. Izq.", 27: "Segundo Molar Sup. Izq.", 28: "Tercer Molar Sup. Izq.",
    48: "Tercer Molar Inf. Der.", 47: "Segundo Molar Inf. Der.", 46: "Primer Molar Inf. Der.", 45: "Segundo Premolar Inf. Der.", 44: "Primer Premolar Inf. Der.", 43: "Canino Inf. Der.", 42: "Incisivo Lateral Inf. Der.", 41: "Incisivo Central Inf. Der.",
    31: "Incisivo Central Inf. Izq.", 32: "Incisivo Lateral Inf. Izq.", 33: "Canino Inf. Izq.", 34: "Primer Premolar Inf. Izq.", 35: "Segundo Premolar Inf. Izq.", 36: "Primer Molar Inf. Izq.", 37: "Segundo Molar Inf. Izq.", 38: "Tercer Molar Inf. Izq.",
    // Dentición Temporal (Niños)
    55: "2do Molar Temp. Sup. Der.", 54: "1er Molar Temp. Sup. Der.", 53: "Canino Temp. Sup. Der.", 52: "Inc. Lat. Temp. Sup. Der.", 51: "Inc. Cent. Temp. Sup. Der.",
    61: "Inc. Cent. Temp. Sup. Izq.", 62: "Inc. Lat. Temp. Sup. Izq.", 63: "Canino Temp. Sup. Izq.", 64: "1er Molar Temp. Sup. Izq.", 65: "2do Molar Temp. Sup. Izq.",
    85: "2do Molar Temp. Inf. Der.", 84: "1er Molar Temp. Inf. Der.", 83: "Canino Temp. Inf. Der.", 82: "Inc. Lat. Temp. Inf. Der.", 81: "Inc. Cent. Temp. Inf. Der.",
    71: "Inc. Cent. Temp. Inf. Izq.", 72: "Inc. Lat. Temp. Inf. Izq.", 73: "Canino Temp. Inf. Izq.", 74: "1er Molar Temp. Inf. Izq.", 75: "2do Molar Temp. Inf. Izq."
};
const TRADUCCION_TECNICA_CARAS = {
    "SUPERIOR": "Superior (Oclusal/Incisal)",
    "INFERIOR": "Inferior (Oclusal/Incisal)",
    "IZQUIERDA": "Izquierda (Mesial/Distal)",
    "DERECHA": "Derecha (Mesial/Distal)",
    "CENTRO": "Centro (Oclusal)",
    "RAIZ": "Radicular / Raíz",
    "GENERAL": "Pieza Completa"
};
// ==========================================
// MÓDULO DE LÓGICA PRINCIPAL
// ==========================================
window.odontogramaModule = {
    init: async function(id_paciente) {
        if (!id_paciente) return;
        
        try {
            window.odontogramaState.data = {};
            this.limpiarContenedores();

            const res = await window.api.get(`/odontograma/${id_paciente}`);
            
            if (!res || res.status !== "Success") {
                throw new Error("No se pudo obtener la información del paciente");
            }

            const elNombre = document.getElementById('paciente_nombre_odo');
            if (elNombre) {
                elNombre.innerText = `Paciente: ${res.perfil.Nombres} ${res.perfil.Apellidos || ""}`;
            }

            const edad = parseInt(res.perfil.Edad || 20);
            window.odontogramaState.tipoPaciente = (edad < 12) ? 'nino' : 'adulto';
            
            await this.renderizarOdontogramaSegunEdad(window.odontogramaState.tipoPaciente);
            this.pintarHallazgos(res.hallazgos);

            console.log("Despertando visor 3D para el paciente...");
            setTimeout(() => {
                if (typeof window.initVisor3D === 'function') {
                    window.initVisor3D();
                }
            }, 500);
        } catch (err) {
            console.error("❌ Error en odontogramaModule.init:", err);
            Swal.fire("Error", "No se pudo cargar el odontograma.", "error");
        }
    },

    limpiarContenedores: function() {
        ['cuadrante-1', 'cuadrante-2', 'cuadrante-3', 'cuadrante-4'].forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = "";
                container.classList.remove('modo-mixto');
            }
        });
    },

    renderizarOdontogramaSegunEdad: function(tipo) {
        return new Promise((resolve) => {
            const permanentes = {
                'cuadrante-1': [18, 17, 16, 15, 14, 13, 12, 11], 
                'cuadrante-2': [21, 22, 23, 24, 25, 26, 27, 28],
                'cuadrante-4': [48, 47, 46, 45, 44, 43, 42, 41], 
                'cuadrante-3': [31, 32, 33, 34, 35, 36, 37, 38]
            };
            const temporales = {
                'cuadrante-1': [55, 54, 53, 52, 51], 
                'cuadrante-2': [61, 62, 63, 64, 65],
                'cuadrante-4': [85, 84, 83, 82, 81], 
                'cuadrante-3': [71, 72, 73, 74, 75]
            };

            Object.keys(permanentes).forEach(id => {
                const container = document.getElementById(id);
                if (!container) return;

                const esSuperior = id === 'cuadrante-1' || id === 'cuadrante-2';

                if (tipo === 'nino') {
                    container.classList.add('modo-mixto');
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: ${esSuperior ? 'column' : 'column-reverse'}; width: 100%; align-items: center; gap: 15px;">
                            <div class="fila-dientes permanentes" style="display: flex; flex-wrap: nowrap; justify-content: center;">
                                ${this.generarHTMLDientes(permanentes[id])}
                            </div>
                            <div class="fila-dientes temporales" style="display: flex; flex-wrap: nowrap; justify-content: center;">
                                ${this.generarHTMLDientes(temporales[id])}
                            </div>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div class="fila-dientes" style="display: flex; flex-wrap: nowrap; justify-content: center; width: 100%;">
                            ${this.generarHTMLDientes(permanentes[id])}
                        </div>
                    `;
                }
            });
            setTimeout(resolve, 100);
        });
    },

    generarHTMLDientes: function(lista) {
        return lista.map(n => `
            <div class="diente-unit" id="unit-${n}" onmouseenter="window.mostrarCardDiente('${n}')">
                <div class="diente-label">${n}</div>
                <div class="zona-raiz" data-cara="Raiz" onclick="window.marcarCara(this)" title="Raíz (R)">R</div>
                <div class="diente-capas">
                    <img src="assets/dientes/${n}.png" class="diente-img" alt="Pieza ${n}" onerror="this.style.display='none'">
                    <svg viewBox="0 0 100 100" class="diente-svg" data-diente-id="${n}">
                        <polygon class="cara-odo" data-cara="Superior" points="0,0 100,0 75,25 25,25" onclick="window.marcarCara(this)" />
                        <polygon class="cara-odo" data-cara="Derecha" points="100,0 100,100 75,75 75,25" onclick="window.marcarCara(this)" />
                        <polygon class="cara-odo" data-cara="Inferior" points="100,100 0,100 25,75 75,75" onclick="window.marcarCara(this)" />
                        <polygon class="cara-odo" data-cara="Izquierda" points="0,0 0,100 25,75 25,25" onclick="window.marcarCara(this)" />
                        <polygon class="cara-odo" data-cara="Centro" points="25,25 75,25 75,75 25,75" onclick="window.marcarCara(this)" />
                    </svg>
                </div>
            </div>
        `).join('');
    },

  pintarHallazgos: function(hallazgos) {
    if (!Array.isArray(hallazgos)) return;
    
    window.odontogramaState.data = {};

    // 1. EL TRADUCTOR MAESTRO (Para que nombres largos activen colores cortos)
    const traductor = {
        "RESTAURACION SIMPLE": "resina",
        "RESTAURACION COMPLEJA": "resina",
        "CARILLAS RESINA": "resina",
        "CARILLAS CERAMICA": "carilla_porcelana",
        "PROTESIS TOTAL C/U": "protesis_removible",
        "PROTESIS FLEX": "protesis_removible",
        "PROTESIS FIJA": "protesis_fija",
        "CORONA": "corona",
        "ENDODONCIA": "endodoncia",
        "ORTODONCIA": "ortodoncia", // Brackets
        "BRACKETS": "ortodoncia"
    };

    hallazgos.forEach(h => {
        const num = h.Numero_Diente;
        const estadoOriginal = h.Estado || "";
        const caraStr = h.Cara_Diente;

        if (!window.odontogramaState.data[num]) window.odontogramaState.data[num] = [];
        window.odontogramaState.data[num].push(h);

        const svg = document.querySelector(`.diente-svg[data-diente-id="${num}"]`);
        const unit = document.getElementById(`unit-${num}`);
        if (!svg || !unit) return;

        const nombreUpper = estadoOriginal.toUpperCase().trim();
        const estadoClase = traductor[nombreUpper] || estadoOriginal.toLowerCase().replace(/ /g, '_');
        const esEvol = (h.Tipo_Registro === 'Evolucion' || h.Es_Sanado === 1);

        // --- LÓGICA DE PINTADO COMPLETA ---
        
        // 1. Casos Especiales (Afectan a todo el diente/SVG)
        if (nombreUpper === 'ORTODONCIA' || nombreUpper === 'BRACKETS') {
            svg.classList.add('ortodoncia-total'); // Dibuja los brackets
            return; 
        } 
        
        if (nombreUpper === 'AUSENTE') {
            svg.classList.add('ausente-total');
            const img = unit.querySelector('.diente-img');
            if(img) img.style.opacity = '0.15';
            return;
        }

        if (nombreUpper === 'PERIODONTITIS') {
            unit.classList.add('periodontitis-total');
            return;
        }

        if (nombreUpper === 'SUPERNUMERARIO') {
            unit.classList.add('supernumerario-total');
            return;
        }

        // 2. Casos de Prótesis Totales o Aparatos (Si cara es 'General' o 'Diente')
        if (nombreUpper.includes('PROTESIS') || nombreUpper.includes('PUENTE')) {
             svg.classList.add(estadoClase);
             if (esEvol) svg.classList.add('is-sanado');
        }

        // 3. Pintar Caras, Raíz o Endodoncia
        if (caraStr === 'Raiz') {
            const zonaRaiz = unit.querySelector('.zona-raiz');
            if (zonaRaiz) {
                zonaRaiz.className = `zona-raiz ${estadoClase} ${esEvol ? 'is-sanado' : ''}`;
            }
        } else {
            const caraPoligono = svg.querySelector(`[data-cara="${caraStr}"]`);
            if (caraPoligono) {
                // Esto pone el color (rojo/azul) según si es patología o tratamiento
                caraPoligono.setAttribute('class', `cara-odo ${estadoClase} ${esEvol ? 'is-sanado' : ''}`);
            }
        }
    });
},

    exportarAPlanTratamiento: async function() {
        const idPac = window.router?.currentPatientId;
        if (!idPac) return Swal.fire("Error", "No hay un paciente seleccionado.", "error");

        const data = window.odontogramaState.data;
        const catalog = window.router.catalogoPrestaciones || [];
        const itemsParaPlan = [];

        Object.keys(data).forEach(numDiente => {
            const historial = data[numDiente];
            const porSeccion = {}; 
            historial.forEach(h => {
                const key = h.Cara_Diente;
                if (!porSeccion[key]) porSeccion[key] = [];
                porSeccion[key].push(h);
            });

            Object.keys(porSeccion).forEach(cara => {
                const registros = porSeccion[cara];
                const patologia = registros.find(r => r.Tipo_Registro === 'Inicial' && HALLAZGOS_INICIALES.includes(r.Estado));
                const tratamiento = registros.some(r => r.Tipo_Registro === 'Evolucion');

                if (patologia && !tratamiento) {
                    const sugerencia = catalog.find(c => 
                        c.Nombre_Prestacion.toLowerCase().includes(patologia.Estado.toLowerCase())
                    ) || { ID_Prestacion: null, Nombre_Prestacion: `Tratamiento: ${patologia.Estado}`, Precio_Base: 0 };

                    itemsParaPlan.push({
                        id_paciente: idPac,
                        id_prestacion: sugerencia.ID_Prestacion,
                        nombre: sugerencia.Nombre_Prestacion,
                        numero_diente: numDiente,
                        cara: cara,
                        hallazgo_origen: patologia.Estado,
                        precio_lista: sugerencia.Precio_Base,
                        costo_total: sugerencia.Precio_Base,
                        saldo_pendiente: sugerencia.Precio_Base,
                        descuento: 0,
                        id_usuario_medico: "" 
                    });
                }
            });
        });

        if (itemsParaPlan.length === 0) {
            return Swal.fire("Sin Pendientes", "No se encontraron patologías activas para planificar.", "info");
        }

        if (typeof window.modalNuevoTratamiento === 'function') {
            window.modalNuevoTratamiento(itemsParaPlan);
        } else {
            console.error("El módulo de tratamientos.js no está cargado.");
        }
    }
};

// ==========================================
// FUNCIONES DE INTERACCIÓN (WINDOW)
// ==========================================

window.mostrarCardDiente = function(id) {
    const card = document.getElementById('odo-card');
    if (!card) return;

    const historial = window.odontogramaState.data[id] || [];
    card.classList.add('show');
    
    document.getElementById('odo-title').innerText = `Pieza ${id}: ${NOMBRES_DIENTES[id] || 'Diente'}`;
    
    const badge = document.getElementById('odo-badge');
    const info = document.getElementById('odo-info');
    
    const patologiasActivas = historial.some(h => HALLAZGOS_INICIALES.includes(h.Estado) && h.Tipo_Registro !== 'Evolucion');
    
    if (patologiasActivas) {
        badge.innerText = "PATOLOGÍA"; badge.style.background = "var(--medical-red)";
        info.innerText = "⚠️ Requiere tratamiento clínico.";
    } else {
        badge.innerText = "SANO / TRATADO"; badge.style.background = "var(--medical-green)";
        info.innerText = "🦷 Sin anomalías activas detectadas.";
    }

    const historialHTML = historial.length > 0 ? historial.map(h => {
        const fecha = h.Fecha ? new Date(h.Fecha).toLocaleDateString() : 'Reciente';
        const esEvol = (h.Tipo_Registro === 'Evolucion');
        const colorBorde = esEvol ? 'var(--medical-blue)' : 'var(--medical-red)';
        const textoTipo = esEvol ? 'EVOLUCIÓN' : 'INICIAL';
        
        // --- TRADUCCIÓN TÉCNICA APLICADA ---
        const caraKey = (h.Cara_Diente || '').toUpperCase();
        const nombreTecnico = TRADUCCION_TECNICA_CARAS[caraKey] || h.Cara_Diente;
        
        return `
            <div style="border-left:4px solid ${colorBorde}; background: rgba(255,255,255,0.05); padding: 12px; margin-bottom: 10px; border-radius: 10px; position: relative;">
                <span style="position: absolute; top: 8px; right: 10px; font-size: 9px; font-weight: 900; color: ${colorBorde}; opacity: 0.8;">${textoTipo}</span>
                <div style="font-weight: 800; font-size: 13px; color: #fff; text-transform: uppercase; margin-bottom: 4px;">${h.Estado.replace(/_/g, ' ')}</div>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div style="font-size: 11px; color: #94a3b8;">
                        <i class="fas fa-th"></i> Cara: <b style="color: #fff;">${nombreTecnico}</b>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8;"><i class="far fa-calendar-alt"></i> ${fecha}</div>
                </div>
            </div>
        `;
    }).join('') : '<div style="color:#64748b; font-size:12px; text-align:center; padding:20px;">Sin hallazgos previos.</div>';

    document.getElementById('odo-historial').innerHTML = historialHTML;
};

window.marcarCara = function(el) {
    const tool = window.odontogramaState.currentTool;
    const unit = el.closest('.diente-unit');
    const svg = unit.querySelector('.diente-svg');
    const numDiente = svg.getAttribute('data-diente-id');
    
    if (!svg || !tool) {
        if (!tool) Swal.fire("Aviso", "Seleccione un hallazgo de la barra de herramientas", "info");
        return;
    }

    const estadoClase = tool.toLowerCase().replace(/ /g, '_');

    if (tool === 'Limpiar') {
        svg.classList.remove('ausente-total', 'ortodoncia-total');
        unit.classList.remove('periodontitis-total', 'supernumerario-total');
        svg.querySelectorAll('.cara-odo').forEach(c => c.setAttribute('class', 'cara-odo'));
        unit.querySelectorAll('.zona-raiz').forEach(z => z.className = 'zona-raiz');

        const historial = window.odontogramaState.data[numDiente] || [];
        historial.forEach(h => {
            if (h.Estado === 'Periodontitis') unit.classList.add('periodontitis-total');
            else if (h.Estado === 'Supernumerario') unit.classList.add('supernumerario-total');
            else if (h.Estado === 'Ausente') svg.classList.add('ausente-total');
            else if (h.Estado === 'Ortodoncia') svg.classList.add('ortodoncia-total');
            else {
                const esEvol = (h.Tipo_Registro === 'Evolucion');
                const cls = h.Estado.toLowerCase().replace(/ /g, '_');
                
                if (h.Cara_Diente === 'Raiz') {
                    const zonaRaiz = unit.querySelector('.zona-raiz');
                    if (zonaRaiz) zonaRaiz.className = `zona-raiz ${cls} ${esEvol ? 'is-sanado' : ''}`;
                } else {
                    const caraPoligono = svg.querySelector(`[data-cara="${h.Cara_Diente}"]`);
                    if (caraPoligono) {
                        caraPoligono.setAttribute('class', `cara-odo ${cls} ${esEvol ? 'is-sanado' : ''}`);
                    }
                }
            }
        });
        return;
    }

    if (tool === 'Periodontitis') {
        unit.classList.add('periodontitis-total');
    } else if (tool === 'Supernumerario') {
        unit.classList.add('supernumerario-total');
    } else if (['Ausente', 'Ortodoncia'].includes(tool)) { 
        svg.classList.remove('ausente-total', 'ortodoncia-total');
        svg.classList.add(tool.toLowerCase() + '-total');
    } else {
        svg.classList.remove('ausente-total', 'ortodoncia-total');
        const esEvolucion = !HALLAZGOS_INICIALES.includes(tool);
        
        if (el.classList.contains('zona-raiz')) {
            el.className = `zona-raiz ${estadoClase} ${esEvolucion ? 'is-sanado' : ''}`;
        } else {
            el.setAttribute('class', `cara-odo ${estadoClase} ${esEvolucion ? 'is-sanado' : ''}`);
        }
    }
};

window.setToolOdo = (tool, btn) => {
    window.odontogramaState.currentTool = tool;
    document.querySelectorAll('.btn-tool-odo, .submenu-item').forEach(b => b.classList.remove('active-tool'));
    
    if (btn) {
        btn.classList.add('active-tool');
        const parentGroup = btn.closest('.tool-group');
        if (parentGroup) {
            const mainBtn = parentGroup.querySelector('.btn-tool-odo');
            if (mainBtn) mainBtn.classList.add('active-tool');
        }
    }
};

window.guardarOdontograma = function() {
    const idPac = window.router?.currentPatientId;
    if (!idPac) return Swal.fire("Error", "No hay un paciente seleccionado", "error");

    const sesion = JSON.parse(localStorage.getItem('usuario_sesion') || '{}');
    const idUser = sesion.ID_Usuario || 1;
    const hallazgos = [];

    const estadosPosibles = ['caries', 'resina', 'carilla_resina', 'carilla_porcelana', 'corona', 'protesis_fija', 'protesis_removible', 'endodoncia', 'sellante', 'fractura', 'raiz', 'extraer'];

    document.querySelectorAll('.diente-unit').forEach(unit => {
        const svg = unit.querySelector('.diente-svg');
        const num = svg.getAttribute('data-diente-id');

        if (unit.classList.contains('periodontitis-total')) {
            hallazgos.push(crearObjetoHallazgo(idPac, num, 'General', 'Periodontitis', idUser));
        }
        if (unit.classList.contains('supernumerario-total')) {
            hallazgos.push(crearObjetoHallazgo(idPac, num, 'General', 'Supernumerario', idUser));
        }

        if (svg.classList.contains('ausente-total')) {
            hallazgos.push(crearObjetoHallazgo(idPac, num, 'General', 'Ausente', idUser));
        } else if (svg.classList.contains('ortodoncia-total')) {
            hallazgos.push(crearObjetoHallazgo(idPac, num, 'General', 'Ortodoncia', idUser));
        } else {
            // Guardar caras de corona (SVG)
            // SOLUCION: Validar clases estrictas como un Array para que 'zona-raiz' no coincida erróneamente con 'raiz'
            svg.querySelectorAll('.cara-odo').forEach(cara => {
                const clasesArray = Array.from(cara.classList);
                const estFound = estadosPosibles.find(e => clasesArray.includes(e));
                
                if (estFound) {
                    const estNom = estFound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const tipoReg = clasesArray.includes('is-sanado') ? 'Evolucion' : 'Inicial';
                    hallazgos.push({
                        id_paciente: parseInt(idPac),
                        numero_diente: parseInt(num),
                        cara_diente: cara.getAttribute('data-cara'),
                        estado: estNom,
                        tipo_registro: tipoReg,
                        id_usuario: idUser
                    });
                }
            });

            // Guardar caras de raíz (HTML)
            // SOLUCION APLICADA AQUÍ TAMBIÉN:
            unit.querySelectorAll('.zona-raiz').forEach(cara => {
                const clasesArray = Array.from(cara.classList);
                const estFound = estadosPosibles.find(e => clasesArray.includes(e));
                
                if (estFound) {
                    const estNom = estFound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const tipoReg = clasesArray.includes('is-sanado') ? 'Evolucion' : 'Inicial';
                    hallazgos.push({
                        id_paciente: parseInt(idPac),
                        numero_diente: parseInt(num),
                        cara_diente: 'Raiz',
                        estado: estNom,
                        tipo_registro: tipoReg,
                        id_usuario: idUser
                    });
                }
            });
        }
    });

    if (hallazgos.length === 0) {
        return Swal.fire("Atención", "No hay cambios para guardar.", "info");
    }

    window.api.post('/odontograma/guardar', { hallazgos })
        .then(res => {
            if (res.status === "Success") {
                Swal.fire("Éxito", "Odontograma sincronizado correctamente", "success");
                window.odontogramaModule.init(idPac);
            } else {
                throw new Error(res.message);
            }
        })
        .catch(err => Swal.fire("Error", "No se pudo guardar: " + err.message, "error"));
};

function crearObjetoHallazgo(idPac, numDie, cara, estado, idUser) {
    const esPatologia = HALLAZGOS_INICIALES.includes(estado);
    return {
        id_paciente: parseInt(idPac),
        numero_diente: parseInt(numDie),
        cara_diente: cara,
        estado: estado,
        tipo_registro: esPatologia ? 'Inicial' : 'Evolucion',
        id_usuario: idUser,
        observaciones: ""
    };
}

if (window.router?.currentPatientId) {
    window.odontogramaModule.init(window.router.currentPatientId);
}

// ============================================================
// MOTOR 3D MEDICINAECCUADOR - VISOR CLINICO PRO FINAL ELITE XI
// ============================================================

window.initVisor3D = function () {
    const container = document.getElementById('visor-3d-container');
    if (!container) return;

    // =========================================================
    // LIMPIEZA PREVIA
    // =========================================================
    if (window.visorRenderer) {
        cancelAnimationFrame(window.visorAnimId);
        window.visorRenderer.dispose();
        container.querySelector('canvas')?.remove();
    }

    let mainModel = null;
    let highlighted = null;
    let focusTarget = null;
    let pulseTime = 0;

    const DIENTES_OCULTOS = new Set();

    const ESTADOS_OCULTAR = [
        'Ausente'
    ];

    const ESTADOS_REHABILITAR = [
        'Protesis',
        'Protesis Fija',
        'Protesis Removible',
        'Implante',
        'Puente',
        'Corona',
        'Corona Fija'
    ];

    const MAPA_CARAS = {
        Superior: 'I',
        Inferior: 'I',
        Centro: 'V',
        Derecha: 'D',
        Izquierda: 'M',
        General: null,
        Distal: 'D',
        Mesial: 'M',
        Incisal: 'I',
        Oclusal: 'I',
        Vestibular: 'V',
        Palatino: 'P',
        Lingual: 'P',
        Raiz: 'R',
        D: 'D',
        M: 'M',
        I: 'I',
        V: 'V',
        P: 'P',
        R: 'R'
    };

    // =========================================================
    // ESCENA
    // =========================================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(
        35,
        container.clientWidth / container.clientHeight,
        1,
        3000
    );

    camera.position.set(0, 5, 80);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    container.appendChild(renderer.domElement);
    window.visorRenderer = renderer;

    // =========================================================
    // CONTROLES
    // =========================================================
    const controls = new THREE.OrbitControls(
        camera,
        renderer.domElement
    );

    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enableZoom = false;
    controls.rotateSpeed = 0.45;
    controls.panSpeed = 0.5;
    controls.minPolarAngle = Math.PI / 4;
    controls.maxPolarAngle = Math.PI - Math.PI / 4;

    // =========================================================
    // ZOOM
    // =========================================================
    let zoomVelocity = 0;

    const ZOOM_SPEED = 0.010;
    const ZOOM_DAMP = 0.82;
    const ZOOM_MIN = 20;
    const ZOOM_MAX = 120;

    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();

        zoomVelocity += Math.sign(e.deltaY) * ZOOM_SPEED;

        zoomVelocity = THREE.MathUtils.clamp(
            zoomVelocity,
            -0.6,
            0.6
        );
    }, { passive: false });

    function updateZoom() {
        if (Math.abs(zoomVelocity) < 0.0001) {
            zoomVelocity = 0;
            return;
        }

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);

        const next = camera.position
            .clone()
            .addScaledVector(dir, zoomVelocity * 10);

        const dist = next.length();

        if (dist > ZOOM_MIN && dist < ZOOM_MAX) {
            camera.position.copy(next);
        }

        zoomVelocity *= ZOOM_DAMP;
    }

    // =========================================================
    // LUCES
    // =========================================================
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 15, 10);
    scene.add(light);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-10, 5, -10);
    scene.add(fillLight);

    // =========================================================
    // RAYCASTER
    // =========================================================
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // =========================================================
    // HELPERS
    // =========================================================
    function obtenerNumeroDiente(mesh) {
        const nombre = mesh.name || "";
        const match = nombre.match(/^([1-8][1-8])/);
        return match ? match[1] : null;
    }

    function obtenerCaraMesh(mesh) {
        const nombre = mesh.name || "";
        const match = nombre.match(/_(D|M|I|V|P|R)$/i);
        return match ? match[1].toUpperCase() : null;
    }

    function estadoOcultaPieza(estado) {
        return ESTADOS_OCULTAR.includes(estado);
    }

    function estadoRehabilita(estado) {
        return ESTADOS_REHABILITAR.includes(estado);
    }

    function obtenerUltimoEstado(historial) {
        if (!historial?.length) return null;

        return historial
            .slice()
            .sort((a, b) =>
                new Date(b.Fecha) - new Date(a.Fecha)
            )[0];
    }

    // =========================================================
    // COLOR CLINICO
    // =========================================================
    function aplicarColorClinico(mesh, estado, numero) {
        if (!mesh.material) return;

        mesh.material = mesh.material.clone();

        mesh.visible = true;
        DIENTES_OCULTOS.delete(numero);

        switch (estado) {
            case 'Ausente':
                mesh.visible = false;
                DIENTES_OCULTOS.add(numero);
                return;

            case 'Caries':
                mesh.material.color.set(0x7f1d1d);
                break;

            case 'Fractura':
                mesh.material.color.set(0xf59e0b);
                break;

            case 'Endodoncia':
                mesh.material.color.set(0x2563eb);
                break;

            case 'Periodontitis':
                mesh.material.color.set(0x7c3aed);
                break;

            case 'Raiz':
                mesh.material.color.set(0x6b7280);
                break;

            case 'Supernumerario':
                mesh.material.color.set(0x14b8a6);
                break;

            case 'Protesis':
            case 'Protesis Fija':
            case 'Corona':
            case 'Corona Fija':
                mesh.material.color.set(0xe5e7eb);
                mesh.material.metalness = 0.6;
                mesh.material.roughness = 0.25;
                break;

            case 'Protesis Removible':
                mesh.material.color.set(0xfca5a5);
                break;

            case 'Implante':
                mesh.material.color.set(0x94a3b8);
                mesh.material.metalness = 0.8;
                break;

            default:
                mesh.material.color.set(0x10b981);
        }

        mesh.material.emissive = new THREE.Color(
            mesh.material.color
        );

        mesh.material.emissiveIntensity = 0.15;
    }

    // =========================================================
    // PINTAR HALLAZGOS
    // =========================================================
    function pintarHallazgos3D(model) {
        const data = window.odontogramaState?.data || {};

        model.traverse(mesh => {
            if (!mesh.isMesh) return;

            const numero = obtenerNumeroDiente(mesh);
            const caraMesh = obtenerCaraMesh(mesh);

            if (!numero) return;

            const historial = data[numero];
            if (!historial?.length) return;

            const ultimo = obtenerUltimoEstado(historial);

            // PRIORIDAD ABSOLUTA:
            // SI HAY REHABILITACION DESPUES DE AUSENTE -> MOSTRAR
            if (ultimo && estadoRehabilita(ultimo.Estado)) {
                aplicarColorClinico(
                    mesh,
                    ultimo.Estado,
                    numero
                );
                return;
            }

            // SI EL ULTIMO ESTADO ES AUSENTE -> OCULTAR
            if (ultimo && estadoOcultaPieza(ultimo.Estado)) {
                aplicarColorClinico(
                    mesh,
                    ultimo.Estado,
                    numero
                );
                return;
            }

            const hallazgoCara = historial.find(h => {
                const caraRaw = (h.Cara_Diente || '').trim();
                return MAPA_CARAS[caraRaw] === caraMesh;
            });

            if (hallazgoCara) {
                aplicarColorClinico(
                    mesh,
                    hallazgoCara.Estado,
                    numero
                );
                return;
            }

            const general = historial.find(h =>
                (h.Cara_Diente || '').trim() === 'General'
            );

            if (general) {
                aplicarColorClinico(
                    mesh,
                    general.Estado,
                    numero
                );
            }
        });
    }

    // =========================================================
    // ENFOQUE
    // =========================================================
    function enfocarDiente(mesh) {
        const box = new THREE.Box3().setFromObject(mesh);
        focusTarget = box.getCenter(new THREE.Vector3());
    }

    function updateCameraFocus() {
        if (!focusTarget) return;
        controls.target.lerp(focusTarget, 0.04);
    }

    // =========================================================
    // HIGHLIGHT
    // =========================================================
    function highlightMesh(mesh) {
        if (!mesh.visible) return;

        if (
            highlighted &&
            highlighted.userData.originalMaterial
        ) {
            highlighted.material =
                highlighted.userData.originalMaterial;
        }

        if (!mesh.userData.originalMaterial) {
            mesh.userData.originalMaterial =
                mesh.material.clone();
        }

        const newMat = mesh.material.clone();

        newMat.emissive = new THREE.Color(0x2563eb);
        newMat.emissiveIntensity = 0.45;

        mesh.material = newMat;
        highlighted = mesh;

        enfocarDiente(mesh);
    }

    function updatePulseHighlight() {
        if (!highlighted || !highlighted.visible) return;

        pulseTime += 0.04;

        const pulse = 0.35 + Math.sin(pulseTime) * 0.15;

        highlighted.material.emissiveIntensity = pulse;
    }

    // =========================================================
// CLICK - ACTUALIZADO PARA FEEDBACK PROFESIONAL
// =========================================================
renderer.domElement.addEventListener('click', (event) => {
    if (!mainModel) return;

    const rect = renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster
        .intersectObject(mainModel, true)
        .filter(h => h.object.visible);

    const hit = hits[0];

    if (hit) {
        highlightMesh(hit.object);

        const diente = obtenerNumeroDiente(hit.object);
        // Capturamos la sigla de la malla (V, M, D, etc.)
        const caraSigla = obtenerCaraMesh(hit.object); 

        if (
            diente &&
            !DIENTES_OCULTOS.has(diente) &&
            window.mostrarCardDiente
        ) {
            // 1. Abrimos la tarjeta lateral
            window.mostrarCardDiente(diente);

            // 2. Feedback de cara técnica (si no hay patologías registradas)
            setTimeout(() => {
                const infoDiente = document.getElementById('odo-info');
                const historial = window.odontogramaState.data[diente] || [];
                
                // Si el diente no tiene hallazgos, mostramos qué cara se tocó
                if (infoDiente && historial.length === 0) {
                    // Mapeamos la sigla al nombre base (Superior, Derecha, etc.)
                    const nombreCaraBase = Object.keys(MAPA_CARAS).find(key => MAPA_CARAS[key] === caraSigla) || "General";
                    
                    // Traducimos al nombre profesional (Oclusal, Vestibular, etc.)
                    const nombreProfesional = TRADUCCION_TECNICA_CARAS[nombreCaraBase.toUpperCase()] || nombreCaraBase;
                    
                    infoDiente.innerHTML = `🦷 Pieza sana. Seleccionada: <b style="color: #3b82f6;">Cara ${nombreProfesional}</b>`;
                }
            }, 100);
        }
    }
});

    // =========================================================
    // LOAD MODEL
    // =========================================================
    const loader = new THREE.GLTFLoader();

/**
 * 1. Obtenemos la URL base configurada.
 * Si window.api.baseURL es "http://192.168.1.100:8000/api",
 * la limpiamos para que quede "http://192.168.1.100:8000"
 */
const apiBaseRaw = window.api && window.api.baseURL ? window.api.baseURL : "http://localhost:8000/api";
const serverRoot = apiBaseRaw.replace('/api', '').replace(/\/$/, '');

console.log("🎯 [Visor 3D]: Intentando cargar modelo desde:", `${serverRoot}/assets/models/dentadura3d/scene.gltf`);

loader.load(
    `${serverRoot}/assets/models/dentadura3d/scene.gltf`,
    (gltf) => {
        mainModel = gltf.scene;

        mainModel.traverse(obj => {
            if (!obj.isMesh) return;

            obj.material = obj.material.clone();
            obj.material.metalness = 0;
            obj.material.roughness = 1;
            obj.material.emissive = new THREE.Color(0x000000);
        });

        pintarHallazgos3D(mainModel);

            const box =
                new THREE.Box3().setFromObject(mainModel);

            const center =
                box.getCenter(new THREE.Vector3());

            mainModel.position.sub(center);

            const size =
                box.getSize(new THREE.Vector3());

            const maxDim = Math.max(
                size.x,
                size.y,
                size.z
            );

            mainModel.scale.setScalar(35 / maxDim);

            scene.add(mainModel);

            controls.target.set(0, 0, 0);
            controls.update();

            document
                .getElementById('loading-visor')
                ?.remove();
        }
    );

    // =========================================================
    // LOOP
    // =========================================================
    const animate = () => {
        window.visorAnimId =
            requestAnimationFrame(animate);

        updateZoom();
        updateCameraFocus();
        updatePulseHighlight();

        controls.update();
        renderer.render(scene, camera);
    };

    animate();
};