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

// Estados que "rehabilitan" una pieza marcada Ausente (compartido entre el pintado 2D y el
// visor 3D — antes vivía duplicado solo adentro de initVisor3D, y el 2D no tenía ninguna
// lista equivalente para saber cuándo debía sacar el estado visual de "Ausente").
const ESTADOS_REHABILITACION = ['Protesis', 'Protesis Fija', 'Protesis Removible', 'Implante', 'Puente', 'Corona', 'Corona Fija'];

// Tratamientos de PIEZA COMPLETA (no de una cara): se dibujan como marca sobre el diente y
// cada uno se guarda en su propia "cara" fija, igual que en el backend (caraFijaPorEstado),
// para que una pieza pueda tener endodoncia + perno + corona sin que un registro pise al otro.
const MARCAS_PIEZA = {
    Endodoncia: { clase: 'tiene-endo', cara: 'Raiz' },
    Perno: { clase: 'tiene-perno', cara: 'Perno' },
    Implante: { clase: 'tiene-implante', cara: 'Implante' }
};

// La patología (Estado del odontograma) y el catálogo de PRESTACIONES (precios) son cosas
// distintas y cada clínica nombra su catálogo distinto — buscar el nombre literal de la
// patología dentro del nombre de la prestación (ej. "caries" dentro de "RESTAURACION SIMPLE")
// casi nunca coincide, así que la sugerencia caía en un placeholder de $0 sin ID_Prestacion
// real y el doctor tenía que borrarlo y agregar el procedimiento a mano. Este mapa da una
// PRIMERA aproximación razonable por palabras clave típicas del procedimiento que resuelve
// cada patología; igual queda editable con un <select> en la sección de sugerencias por si
// el catálogo de la clínica usa otra nomenclatura.
const MAPA_PATOLOGIA_KEYWORDS = {
    'Caries': ['restauracion', 'resina', 'calza', 'obturacion'],
    'Fractura': ['restauracion', 'resina', 'corona'],
    'Ausente': ['protesis', 'puente', 'implante'],
    'Raiz': ['endodoncia', 'conducto'],
    'Extraer': ['extraccion', 'exodoncia'],
    'Periodontitis': ['profilaxis', 'periodon', 'curetaje', 'raspado'],
    'Ortodoncia': ['ortodoncia', 'bracket'],
    'Supernumerario': ['extraccion', 'exodoncia']
};

function buscarPrestacionSugerida(catalog, estado) {
    const keywords = MAPA_PATOLOGIA_KEYWORDS[estado] || [];
    for (const kw of keywords) {
        const match = catalog.find(c => c.Nombre_Prestacion.toLowerCase().includes(kw));
        if (match) return match;
    }
    return null;
}

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
    "GENERAL": "Pieza Completa",
    "PERNO": "Intrarradicular (perno/núcleo)",
    "IMPLANTE": "Pieza Completa (implante)"
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
                throw new Error((res && res.message) || "No se pudo obtener la información del paciente");
            }

            const elNombre = document.getElementById('paciente_nombre_odo');
            if (elNombre) {
                elNombre.innerText = `Paciente: ${res.perfil.Nombres} ${res.perfil.Apellidos || ""}`;
            }
            window.odontogramaState.perfilPaciente = res.perfil; // para el reporte imprimible

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
            Swal.fire("Error", err.message || "No se pudo cargar el odontograma.", "error");
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
                    <svg viewBox="0 0 100 100" class="diente-marcas">
                        <g class="marca-perno"><title>Perno / núcleo</title>
                            <rect x="45" y="6" width="10" height="66" rx="2" fill="#334155"/>
                            <rect x="35" y="36" width="30" height="24" rx="3" fill="#94a3b8" stroke="#1e293b" stroke-width="3"/>
                        </g>
                        <g class="marca-implante"><title>Implante</title>
                            <rect x="39" y="8" width="22" height="84" rx="5" fill="#cbd5e1" stroke="#475569" stroke-width="3"/>
                            <path d="M33 22 H67 M33 34 H67 M33 46 H67 M33 58 H67 M33 70 H67 M35 82 H65" stroke="#475569" stroke-width="4" stroke-linecap="round"/>
                        </g>
                        <g class="marca-endo"><title>Endodoncia</title>
                            <polygon points="50,18 80,74 20,74" fill="none" stroke="#7c3aed" stroke-width="8" stroke-linejoin="round"/>
                        </g>
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

        // Los hallazgos llegan ordenados por fecha (ASC). Si esta pieza estaba marcada Ausente
        // por un registro más viejo y ESTE hallazgo es una rehabilitación (prótesis/implante/
        // corona/puente), hay que sacar el estado visual de "Ausente" — si no, el diente queda
        // con opacidad 0.15 para siempre aunque ya no esté realmente ausente. El visor 3D ya
        // hacía este chequeo (estadoRehabilita), acá nunca existió.
        if (ESTADOS_REHABILITACION.includes(estadoOriginal)) {
            svg.classList.remove('ausente-total');
            const imgRehab = unit.querySelector('.diente-img');
            if (imgRehab) imgRehab.style.opacity = '';
        }

        // Endodoncia / perno / implante: marca de pieza completa (cualquiera sea la cara con la
        // que se haya guardado — los registros viejos de Endodoncia venían en caras sueltas).
        if (MARCAS_PIEZA[estadoOriginal]) {
            unit.classList.add(MARCAS_PIEZA[estadoOriginal].clase);
            if (estadoOriginal !== 'Endodoncia') return; // la endodoncia además pinta su cara (abajo)
        }

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

    // ANTES: esto calculaba las sugerencias y de una abría el modal PESADO de Tratamiento
    // (con firma de consentimiento, selección de médico, etc.) — no había forma de mandar lo
    // mismo a un Presupuesto, y cortaba el flujo del doctor que solo quería ver qué se sugería.
    // Ahora solo CALCULA y muestra una sección liviana acá mismo ("Sugerencias por Pieza"), con
    // botones para mandar esas mismas sugerencias a Presupuesto o a Tratamiento — el cálculo se
    // hace una sola vez y queda guardado en odontogramaState.sugerencias para toda la sesión.
    exportarAPlanTratamiento: async function() {
        const idPac = window.router?.currentPatientId;
        if (!idPac) return Swal.fire("Error", "No hay un paciente seleccionado.", "error");

        // El catálogo de precios (Prestaciones) solo se carga cuando el doctor visita
        // Tratamiento o Presupuesto primero — si entra directo al Odontograma llega vacío
        // y el <select> de la sugerencia se ve sin opciones. Lo traemos acá también.
        if (!window.router.catalogoPrestaciones || window.router.catalogoPrestaciones.length === 0) {
            try {
                const catalogoRes = await window.api.get('/tratamientos/catalogo');
                window.router.catalogoPrestaciones = Array.isArray(catalogoRes) ? catalogoRes : [];
            } catch (e) {
                console.error("Error al recuperar catálogo de prestaciones:", e);
            }
        }

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
                    const sugerencia = buscarPrestacionSugerida(catalog, patologia.Estado) ||
                        { ID_Prestacion: null, Nombre_Prestacion: `Seleccione un procedimiento`, Precio_Base: 0 };

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

        window.odontogramaState.sugerencias = itemsParaPlan;
        this.renderSugerencias();

        if (itemsParaPlan.length === 0) {
            Swal.fire("Sin Pendientes", "No se encontraron patologías activas para planificar.", "info");
        }
    },

    renderSugerencias: function() {
        const cont = document.getElementById('odo-sugerencias');
        if (!cont) return;
        const items = window.odontogramaState.sugerencias || [];

        if (items.length === 0) {
            cont.style.display = 'none';
            return;
        }
        cont.style.display = 'block';

        const catalog = window.router.catalogoPrestaciones || [];
        const optionsHtml = catalog.map(c =>
            `<option value="${c.ID_Prestacion}" data-precio="${c.Precio_Base}">${c.Nombre_Prestacion} — $${parseFloat(c.Precio_Base).toFixed(2)}</option>`
        ).join('');

        document.getElementById('odo-sugerencias-lista').innerHTML = items.map((it, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:white; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-bottom:6px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="background:#eef2ff; color:#4f46e5; padding:2px 8px; border-radius:6px; font-weight:800; font-size:11px;">Pieza ${it.numero_diente}</span>
                    <span style="color:#b91c1c; font-size:11px;"><i class="fas fa-notes-medical"></i> ${it.hallazgo_origen}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <select onchange="window.odontogramaModule.actualizarSugerenciaServicio(${idx}, this)"
                            style="font-size:12px; padding:6px 8px; border-radius:6px; border:1px solid #cbd5e1; max-width:280px; ${it.id_prestacion ? '' : 'border-color:#f59e0b;'}">
                        <option value="" ${it.id_prestacion ? '' : 'selected'}>-- Seleccione un procedimiento --</option>
                        ${catalog.map(c =>
                            `<option value="${c.ID_Prestacion}" data-precio="${c.Precio_Base}" ${it.id_prestacion == c.ID_Prestacion ? 'selected' : ''}>${c.Nombre_Prestacion} — $${parseFloat(c.Precio_Base).toFixed(2)}</option>`
                        ).join('')}
                    </select>
                    <span style="font-weight:800; color:#1e293b; font-size:12px; min-width:60px; text-align:right;">$${parseFloat(it.costo_total).toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    },

    // El doctor puede corregir en el propio dropdown el procedimiento del catálogo real
    // (con su precio real) que se está asociando a la patología, en vez de tener que borrar
    // el ítem precargado y agregarlo de cero desde el catálogo en Tratamiento/Presupuesto.
    actualizarSugerenciaServicio: function(idx, selectEl) {
        const items = window.odontogramaState.sugerencias || [];
        const item = items[idx];
        if (!item) return;
        const opt = selectEl.options[selectEl.selectedIndex];
        const precio = parseFloat(opt.dataset.precio) || 0;

        item.id_prestacion = selectEl.value ? parseInt(selectEl.value) : null;
        item.nombre = selectEl.value ? opt.textContent.split(' — $')[0] : 'Seleccione un procedimiento';
        item.precio_lista = precio;
        item.costo_total = precio;
        item.saldo_pendiente = precio;

        this.renderSugerencias();
    },

    irAPresupuesto: function() {
        const items = window.odontogramaState.sugerencias || [];
        if (!items.length) return;
        this._confirmarYEnviar(items, () => {
            if (typeof window.abrirModalPresupuesto === 'function') {
                window.abrirModalPresupuesto(items);
            } else {
                console.error("El módulo de presupuestos (historia.js) no está cargado.");
            }
        });
    },

    irATratamiento: function() {
        const items = window.odontogramaState.sugerencias || [];
        if (!items.length) return;
        this._confirmarYEnviar(items, () => {
            if (typeof window.modalNuevoTratamiento === 'function') {
                window.modalNuevoTratamiento(items);
            } else {
                console.error("El módulo de tratamientos.js no está cargado.");
            }
        });
    },

    // Si alguna sugerencia se quedó sin procedimiento del catálogo asignado, confirma antes
    // de continuar en vez de mandarla en silencio con precio $0.
    _confirmarYEnviar: function(items, callback) {
        const sinAsignar = items.filter(it => !it.id_prestacion).length;
        if (sinAsignar === 0) return callback();

        Swal.fire({
            title: "Procedimientos sin asignar",
            html: `${sinAsignar} pieza(s) todavía no tienen un procedimiento del catálogo seleccionado (quedarán con precio $0). ¿Deseas continuar de todas formas?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Continuar de todas formas",
            cancelButtonText: "Volver a revisar"
        }).then(r => { if (r.isConfirmed) callback(); });
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
                <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                    <div style="font-size: 11px; color: #94a3b8;">
                        <i class="fas fa-th"></i> Cara: <b style="color: #fff;">${nombreTecnico}</b>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8;"><i class="far fa-calendar-alt"></i> ${fecha}</div>
                    ${h.ID_Plan_Tratamiento ? `<div style="font-size: 10px; background: rgba(79,70,229,0.25); color: #a5b4fc; padding: 2px 8px; border-radius: 6px; font-weight: 800;"><i class="fas fa-link"></i> Plan #${h.ID_Plan_Tratamiento}</div>` : ''}
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
        // ANTES: esto solo limpiaba las clases visuales y de inmediato las volvía a pintar desde
        // window.odontogramaState.data (el historial ya guardado en BD) — o sea que un hallazgo
        // ya persistido se "auto-restauraba" al instante y nunca se podía borrar de verdad. El
        // endpoint de borrado (POST /odontograma/eliminar) ya existía en el backend pero nunca se
        // llamaba desde acá. Ahora primero se confirma, se borra en BD, y recién con eso limpio
        // también el estado en memoria para que no se vuelva a repintar solo.
        const idPac = window.router?.currentPatientId;
        if (!idPac) return;

        Swal.fire({
            title: `¿Borrar todos los hallazgos de la pieza ${numDiente}?`,
            text: 'Esto elimina permanentemente lo ya guardado para este diente, no solo lo visual.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, borrar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (!result.isConfirmed) return;

            window.api.eliminarHallazgo({ id_paciente: parseInt(idPac), numero_diente: parseInt(numDiente) })
                .then((res) => {
                    if (res.status !== 'Success') throw new Error(res.message || 'No se pudo borrar.');

                    window.odontogramaState.data[numDiente] = []; // ya no queda nada que re-pintar

                    svg.classList.remove('ausente-total', 'ortodoncia-total');
                    unit.classList.remove('periodontitis-total', 'supernumerario-total', 'tiene-endo', 'tiene-perno', 'tiene-implante');
                    const imgLimpia = unit.querySelector('.diente-img');
                    if (imgLimpia) imgLimpia.style.opacity = '';
                    svg.querySelectorAll('.cara-odo').forEach(c => c.setAttribute('class', 'cara-odo'));
                    unit.querySelectorAll('.zona-raiz').forEach(z => z.className = 'zona-raiz');
                })
                .catch(err => Swal.fire('Error', err.message, 'error'));
        });
        return;
    }

    if (MARCAS_PIEZA[tool]) {
        // Pieza completa: no importa en qué cara se hizo clic.
        unit.classList.add(MARCAS_PIEZA[tool].clase);
        if (tool === 'Endodoncia') {
            const zona = unit.querySelector('.zona-raiz');
            if (zona) zona.className = 'zona-raiz endodoncia is-sanado';
        }
        if (tool === 'Implante') {
            // El implante rehabilita una pieza ausente (igual que prótesis/corona).
            svg.classList.remove('ausente-total');
            const img = unit.querySelector('.diente-img');
            if (img) img.style.opacity = '';
        }
    } else if (tool === 'Periodontitis') {
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
        // Perno e implante (la endodoncia ya se guarda abajo, con la zona de raíz).
        ['Perno', 'Implante'].forEach(est => {
            if (unit.classList.contains(MARCAS_PIEZA[est].clase)) {
                hallazgos.push(crearObjetoHallazgo(idPac, num, MARCAS_PIEZA[est].cara, est, idUser));
            }
        });

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

    // Compartida con pintarHallazgos() (2D) — ver ESTADOS_REHABILITACION al inicio del archivo.
    const ESTADOS_REHABILITAR = ESTADOS_REHABILITACION;

    // FIX de precisión clínica: antes "Centro" (que el tooltip ya llama "Oclusal") pintaba la
    // cara Vestibular del modelo 3D, y "Superior"/"Inferior" (dos zonas distintas en el diagrama
    // 2D) pintaban la MISMA cara 3D ('I'), dejando la cara Palatina/Lingual del modelo
    // completamente inalcanzable desde la interfaz. Con el diagrama "flor" de 5 zonas que ya usa
    // el 2D, la correspondencia clínica correcta es: Centro=Oclusal, Superior=Vestibular (hacia
    // afuera/mejilla), Inferior=Palatino/Lingual (hacia adentro/lengua).
    const MAPA_CARAS = {
        Superior: 'V',
        Inferior: 'P',
        Centro: 'I',
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
                // Corona de porcelana sobre el implante; la raíz natural se reemplaza por el
                // tornillo de titanio en agregarAditamentos3D().
                mesh.material.color.set(0xf8fafc);
                mesh.material.metalness = 0.1;
                mesh.material.roughness = 0.2;
                break;

            // Antes: estos 6 estados caían en el "default" y se veían IGUAL que un diente sano
            // en 3D, aunque el 2D sí los distingue con colores propios. Se usan los mismos
            // colores del 2D (views/odontograma.html) para que ambas vistas coincidan.
            case 'Resina':
                mesh.material.color.set(0x3b82f6); // --medical-blue
                break;

            case 'Carilla Resina':
                mesh.material.color.set(0x93c5fd);
                mesh.material.roughness = 0.2;
                break;

            case 'Carilla Porcelana':
                mesh.material.color.set(0xe0f2fe);
                mesh.material.metalness = 0.2;
                mesh.material.roughness = 0.15;
                break;

            case 'Sellante':
                mesh.material.color.set(0x22d3ee); // --medical-cyan
                break;

            case 'Extraer':
                mesh.material.color.set(0x18181b); // casi negro, misma convención que el 2D
                break;

            case 'Ortodoncia':
                mesh.material.color.set(0x6366f1); // indigo, mismo tono del brillo del 2D
                mesh.material.metalness = 0.7;
                mesh.material.roughness = 0.3;
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

            // .find() devolvía el PRIMER hallazgo que matcheaba esa cara — con el historial
            // completo (Inicial + Evolución) eso significaba mostrar siempre el más VIEJO (ej. la
            // Caries original) en vez del estado actual (ej. la Resina que la sanó). Ahora se
            // filtran todos los que matchean esa cara puntual y se pinta el más reciente.
            const hallazgosDeEstaCara = historial.filter(h => {
                const caraRaw = (h.Cara_Diente || '').trim();
                return MAPA_CARAS[caraRaw] === caraMesh;
            });
            const hallazgoCara = obtenerUltimoEstado(hallazgosDeEstaCara);

            if (hallazgoCara) {
                aplicarColorClinico(
                    mesh,
                    hallazgoCara.Estado,
                    numero
                );
                return;
            }

            const general = obtenerUltimoEstado(
                historial.filter(h => (h.Cara_Diente || '').trim() === 'General')
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
    // ADITAMENTOS: ENDODONCIA / PERNO / IMPLANTE
    // Cada pieza del modelo tiene su raíz como malla propia (NN_R). Se usa su caja en
    // coordenadas de mundo y la dirección raíz→corona para dibujar, dentro de la raíz:
    //  - Endodoncia: conducto obturado (gutapercha) + raíz semitransparente.
    //  - Perno: poste metálico desde el tercio coronal de la raíz hasta la corona.
    //  - Implante: tornillo de titanio en lugar de la raíz natural (que se oculta).
    // Se agregan a la escena (no al modelo) para que el raycaster no los tome como dientes.
    // =========================================================
    const aditamentos = [];

    function marcasDePieza(historial) {
        const tiene = (est) => historial.some(h => h.Estado === est);
        return { endo: tiene('Endodoncia'), perno: tiene('Perno'), implante: tiene('Implante') };
    }

    function orientarCilindro(obj, desde, hasta) {
        const dir = new THREE.Vector3().subVectors(hasta, desde);
        const largo = dir.length();
        obj.position.copy(desde).addScaledVector(dir, 0.5);
        obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        return largo;
    }

    function hacerTransparente(mesh, color) {
        mesh.material = mesh.material.clone();
        mesh.material.transparent = true;
        mesh.material.opacity = 0.35;
        mesh.material.depthWrite = false;
        if (color !== undefined) mesh.material.color.set(color);
        mesh.userData.originalMaterial = mesh.material.clone();
    }

    function geometriaTornillo(largo, radio) {
        // Perfil de rosca (diente de sierra) que se revoluciona alrededor del eje Y.
        const pts = [new THREE.Vector2(0, 0)];
        const pasos = 14;
        for (let i = 0; i <= pasos; i++) {
            const y = (i / pasos) * largo;
            const conico = i < 3 ? 0.55 + i * 0.15 : 1; // ápice cónico
            pts.push(new THREE.Vector2(radio * 0.78 * conico, y));
            if (i < pasos) pts.push(new THREE.Vector2(radio * conico, y + largo / pasos * 0.5));
        }
        pts.push(new THREE.Vector2(radio * 0.9, largo));
        pts.push(new THREE.Vector2(0, largo));
        return new THREE.LatheGeometry(pts, 24);
    }

    function agregarAditamentos3D(model) {
        aditamentos.forEach(o => { scene.remove(o); o.geometry?.dispose(); });
        aditamentos.length = 0;

        const data = window.odontogramaState?.data || {};
        model.updateMatrixWorld(true);

        // Mallas por pieza
        const porPieza = {};
        model.traverse(m => {
            if (!m.isMesh) return;
            const num = obtenerNumeroDiente(m);
            if (!num) return;
            (porPieza[num] = porPieza[num] || []).push(m);
        });

        Object.keys(porPieza).forEach(num => {
            const historial = data[num];
            if (!historial?.length) return;
            const marcas = marcasDePieza(historial);
            if (!marcas.endo && !marcas.perno && !marcas.implante) return;

            const mallas = porPieza[num];
            const raiz = mallas.find(m => obtenerCaraMesh(m) === 'R');
            const corona = mallas.filter(m => obtenerCaraMesh(m) !== 'R');
            if (!raiz || !corona.length) return;

            const cajaRaiz = new THREE.Box3().setFromObject(raiz);
            const cajaCorona = new THREE.Box3();
            corona.forEach(m => cajaCorona.expandByObject(m));
            const centroRaiz = cajaRaiz.getCenter(new THREE.Vector3());
            const centroCorona = cajaCorona.getCenter(new THREE.Vector3());
            const eje = new THREE.Vector3().subVectors(centroCorona, centroRaiz).normalize();

            // Largo de la raíz a lo largo del eje y grosor en el plano perpendicular
            const tam = cajaRaiz.getSize(new THREE.Vector3());
            const largo = Math.abs(tam.x * eje.x) + Math.abs(tam.y * eje.y) + Math.abs(tam.z * eje.z);
            const grosor = Math.min(...[tam.x, tam.y, tam.z].sort((a, b) => b - a).slice(1));
            const apice = centroRaiz.clone().addScaledVector(eje, -largo * 0.5);
            const cuello = centroRaiz.clone().addScaledVector(eje, largo * 0.5);

            if (marcas.implante) {
                raiz.visible = false;
                const geo = geometriaTornillo(largo * 0.95, grosor * 0.32);
                const tornillo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
                    color: 0xa1a1aa, metalness: 0.9, roughness: 0.3, emissive: 0x27272a, emissiveIntensity: 0.2
                }));
                // LatheGeometry crece desde y=0: se ubica la base en el ápice y se orienta hacia la corona.
                tornillo.position.copy(apice);
                tornillo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje);
                scene.add(tornillo);
                aditamentos.push(tornillo);
                return; // con implante no aplica conducto ni perno sobre la raíz natural
            }

            hacerTransparente(raiz, marcas.endo ? 0xfbcfe8 : undefined);

            if (marcas.endo) {
                const conducto = new THREE.Mesh(
                    new THREE.CylinderGeometry(grosor * 0.06, grosor * 0.03, 1, 12),
                    new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xc2410c, emissiveIntensity: 0.5 })
                );
                const l = orientarCilindro(conducto, apice.clone().addScaledVector(eje, largo * 0.06), cuello);
                conducto.scale.y = l;
                scene.add(conducto);
                aditamentos.push(conducto);
            }

            if (marcas.perno) {
                const perno = new THREE.Mesh(
                    new THREE.CylinderGeometry(grosor * 0.2, grosor * 0.14, 1, 16),
                    new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.95, roughness: 0.2, emissive: 0x3f3f46, emissiveIntensity: 0.3 })
                );
                const l = orientarCilindro(perno,
                    centroRaiz.clone().addScaledVector(eje, -largo * 0.15),   // tercio medio de la raíz
                    cuello.clone().addScaledVector(eje, largo * 0.25));       // entra en la corona (núcleo)
                perno.scale.y = l;
                scene.add(perno);
                aditamentos.push(perno);
            }
        });
    }

    // =========================================================
    // VISTA RX: las raíces (y lo que hay dentro: conducto, perno, tornillo) están dentro
    // de la encía. Este modo vuelve translúcidas encía y coronas para verlas, como una
    // radiografía. Guarda y restaura los materiales originales al apagarse.
    // =========================================================
    let modoRX = false;

    function aplicarModoRX(model, activo) {
        modoRX = activo;
        model.traverse(m => {
            if (!m.isMesh || !m.material) return;
            const esDiente = !!obtenerNumeroDiente(m);
            const esRaiz = esDiente && obtenerCaraMesh(m) === 'R';
            if (activo) {
                if (!m.userData.matPreRX) m.userData.matPreRX = m.material;
                const mat = m.material.clone();
                mat.transparent = true;
                mat.depthWrite = esRaiz;
                mat.opacity = !esDiente ? 0.08 : (esRaiz ? Math.min(m.material.opacity ?? 1, 0.55) : 0.35);
                m.material = mat;
            } else if (m.userData.matPreRX) {
                m.material = m.userData.matPreRX;
                delete m.userData.matPreRX;
            }
            // El highlight guarda su propio "original": se reinicia para que no reponga el modo anterior.
            delete m.userData.originalMaterial;
        });
        highlighted = null;
        const btn = document.getElementById('btn-rx-3d');
        if (btn) {
            btn.style.background = activo ? '#22d3ee' : 'rgba(15,23,42,0.85)';
            btn.style.color = activo ? '#0f172a' : '#e2e8f0';
        }
    }

    function crearBotonRX(model, hayAditamentos) {
        container.querySelector('#btn-rx-3d')?.remove();
        const btn = document.createElement('button');
        btn.id = 'btn-rx-3d';
        btn.innerHTML = `<i class="fas fa-x-ray"></i> Vista RX${hayAditamentos ? ' · ver raíces' : ''}`;
        btn.title = 'Ver raíces, conductos, pernos e implantes a través de la encía';
        btn.style.cssText = 'position:absolute; top:14px; left:14px; z-index:5; border:1px solid #22d3ee; border-radius:10px; padding:8px 14px; font-weight:800; font-size:12px; cursor:pointer; font-family:Inter,sans-serif; background:rgba(15,23,42,0.85); color:#e2e8f0;';
        btn.onclick = () => aplicarModoRX(model, !modoRX);
        container.appendChild(btn);
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
            agregarAditamentos3D(mainModel);
            crearBotonRX(mainModel, aditamentos.length > 0);
            // Acceso al visor para depuración/pruebas (cámara, controles, modelo, modo RX).
            window.visor3D = { scene, camera, controls, model: mainModel, rx: (on) => aplicarModoRX(mainModel, on) };

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

// --- IMPRESIÓN DEL ODONTOGRAMA (mismo patrón de ventana con vista previa que ya usan
// gastos.js/caja.js/CRM: window.open + document.write, con el diseño de marca de la clínica) ---
window.imprimirOdontograma = async function() {
    const idPac = window.router?.currentPatientId;
    const perfil = window.odontogramaState?.perfilPaciente;
    if (!idPac || !perfil) return Swal.fire('Atención', 'Cargá primero un paciente.', 'info');

    let clinica = { Nombre_Clinica: 'Clínica', Logo_Ruta: null };
    try {
        const idClinica = perfil.ID_Clinica;
        if (idClinica) clinica = await window.api.get(`/clinicas/leer/${idClinica}`) || clinica;
    } catch (e) { /* seguimos con nombre genérico si falla */ }

    const serverBase = window.api.baseURL.replace('/api', '').replace(/\/$/, '');
    const logoUrl = clinica.Logo_Ruta ? `${serverBase}/uploads/logos/${clinica.Logo_Ruta}` : '';

    const data = window.odontogramaState.data || {};
    const filas = [];
    Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b)).forEach(numDiente => {
        (data[numDiente] || []).forEach(h => {
            filas.push({
                diente: numDiente,
                nombreDiente: NOMBRES_DIENTES[numDiente] || '',
                cara: h.Cara_Diente,
                estado: h.Estado,
                tipo: h.Tipo_Registro,
                fecha: h.Fecha ? new Date(h.Fecha).toLocaleDateString() : ''
            });
        });
    });

    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
        <head>
            <title>Odontograma - ${perfil.Nombres} ${perfil.Apellidos || ''}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; }
                .header img { max-height: 70px; max-width: 200px; object-fit: contain; }
                .header-info { text-align: right; }
                .header-info h2 { margin: 0; font-size: 1.3rem; font-weight: 800; }
                .header-info p { margin: 2px 0; font-size: 0.85rem; color: #64748b; font-weight: 700; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
                th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 800; }
                td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; }
                .badge-inicial { color: #b91c1c; font-weight: 700; }
                .badge-evolucion { color: #15803d; font-weight: 700; }
                .no-print { text-align: center; margin-bottom: 20px; }
                .no-print button { padding: 10px 22px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="no-print"><button onclick="window.print()"><i class="fas fa-print"></i> Imprimir / Guardar como PDF</button></div>
            <div class="header">
                ${logoUrl ? `<img src="${logoUrl}" onerror="this.style.display='none'">` : '<div></div>'}
                <div class="header-info">
                    <h2>ODONTOGRAMA CLÍNICO</h2>
                    <p>${(clinica.Nombre_Clinica || '').toUpperCase()}</p>
                    <p>PACIENTE: ${perfil.Nombres} ${perfil.Apellidos || ''} · ${new Date().toLocaleDateString()}</p>
                </div>
            </div>
            <table>
                <thead><tr><th>Pieza</th><th>Descripción</th><th>Cara</th><th>Hallazgo</th><th>Tipo</th><th>Fecha</th></tr></thead>
                <tbody>
                    ${filas.length
                        ? filas.map(f => `<tr><td><strong>${f.diente}</strong></td><td>${f.nombreDiente}</td><td>${f.cara}</td><td>${f.estado}</td><td class="${f.tipo === 'Inicial' ? 'badge-inicial' : 'badge-evolucion'}">${f.tipo}</td><td>${f.fecha}</td></tr>`).join('')
                        : '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Sin hallazgos registrados.</td></tr>'}
                </tbody>
            </table>
            <div style="margin-top:30px; text-align:center; font-size:8px; color:#94a3b8;">
                Generado por Ametra OS - ${new Date().toLocaleString()}
            </div>
        </body>
        </html>
    `);
    ventana.document.close();
};