// Fase 5 (móvil) — OCR de cédula ecuatoriana para precargar el formulario de
// registro de paciente en campo. Mismo motor que ya usa Payugo para su KYC
// (tesseract.js, corre en el servidor, sin costo de API de IA ni límites de
// cuota) — a diferencia de Payugo (que solo VERIFICA que un número de cédula
// aparezca en la foto), acá el objetivo es EXTRAER nombres/apellidos/fecha de
// nacimiento/número para no escribirlos a mano. El OCR nunca es la fuente de
// verdad: el doctor siempre revisa y corrige antes de guardar.
const Tesseract = require('tesseract.js');
const path = require('path');

const LANG_PATH = path.join(__dirname, '..', 'ocr-data');

function limpiarLinea(l) {
    return l.replace(/[^\p{L}\p{N}\s.\/\-]/gu, '').trim();
}

// Algoritmo oficial de validación de cédula ecuatoriana (módulo 10, coeficientes
// alternados 2-1). Es MUCHO más estricto que adivinar por rango de provincia: una
// secuencia de ruido OCR al azar solo tiene ~1 en 10 chances de pasar este check,
// así que sirve para descartar números inventados en vez de mostrarlos como reales.
function validarCedulaEcuatoriana(cedula) {
    if (!/^\d{10}$/.test(cedula)) return false;
    const provincia = parseInt(cedula.substring(0, 2), 10);
    const tercerDigito = parseInt(cedula.charAt(2), 10);
    if (provincia < 1 || provincia > 24) return false;
    if (tercerDigito > 6) return false; // 7,8,9 = RUC jurídico/público, no cédula de persona natural

    const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let suma = 0;
    for (let i = 0; i < 9; i++) {
        let valor = parseInt(cedula.charAt(i), 10) * coeficientes[i];
        if (valor > 9) valor -= 9;
        suma += valor;
    }
    const digitoVerificador = (10 - (suma % 10)) % 10;
    return digitoVerificador === parseInt(cedula.charAt(9), 10);
}

function extraerDni(texto) {
    // Solo se consideran corridas de dígitos que aparecen como un token limpio
    // (con separadores opcionales tipo espacio/guion, pero sin mezclarse con
    // fechas u otros números largos) — y de esas, SOLO se acepta la que además
    // pase la validación real del dígito verificador. Si ninguna pasa, se
    // devuelve vacío: es preferible dejar el campo en blanco para que el doctor
    // lo escriba a mano, a mostrar un número que el OCR inventó del ruido.
    const candidatos = texto.match(/\b\d[\d\s\-]{8,14}\d\b/g) || [];
    for (const candidato of candidatos) {
        const soloDigitos = candidato.replace(/\D/g, '');
        if (soloDigitos.length === 10 && validarCedulaEcuatoriana(soloDigitos)) {
            return soloDigitos;
        }
    }
    return '';
}

const MESES_ES = {
    ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
    JUL: '07', AGO: '08', SEP: '09', SET: '09', OCT: '10', NOV: '11', DIC: '12'
};

// La cédula ecuatoriana imprime la fecha como "06 OCT 1988" (mes en texto), no
// "06/10/1988" — y tiene VARIAS fechas (nacimiento, expedición, vencimiento). La
// etiqueta "NACIMIENTO" casi siempre sale garabateada por el OCR (ej. "NACE MI
// EA"), así que se ancla en el fragmento "NAC...MI..." que sobrevive incluso con
// ruido, en vez de exigir la palabra completa — evita cruzar hacia la fecha de
// vencimiento u otra sección.
function extraerFechaNacimiento(texto) {
    const anclaje = texto.match(/NAC\w*\s*MI\w*/);
    const idx = anclaje ? anclaje.index : texto.search(/NACIMIENTO/);
    if (idx === -1) return '';
    const ventana = texto.substring(idx, idx + 60);

    const matchTexto = ventana.match(/\b(\d{1,2})\s+([A-ZÑ]{3,4})\.?\s+(\d{4})\b/);
    if (matchTexto) {
        const [, d, mesTxt, y] = matchTexto;
        const mm = MESES_ES[mesTxt.substring(0, 3)];
        if (mm) return `${y}-${mm}-${d.padStart(2, '0')}`;
    }

    const matchNumerico = ventana.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
    if (matchNumerico) {
        const [, d, m, y] = matchNumerico;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    return '';
}

// Palabras que NUNCA son parte de un nombre real, aunque aparezcan pegadas a la
// etiqueta por un salto de línea que el OCR fusionó mal (ej. "APELLIDOS NDICIÓN
// EXT*PERMANENTE" — el bug que reportó el usuario: eso se estaba devolviendo
// como apellido real).
const PALABRAS_NO_NOMBRE = /CONDICION|CONDICIÓN|EXTRANJER|PERMANENTE|TEMPORAL|NACIONAL|REPUBLICA|REPÚBLICA|ECUADOR|IDENTIDAD/;

function esLineaDeNombre(candidata) {
    return candidata.length >= 2
        && !/\d/.test(candidata)
        && !PALABRAS_NO_NOMBRE.test(candidata);
}

// El valor casi siempre está en la(s) línea(s) SIGUIENTE(S) a la etiqueta, nunca
// pegado en la misma línea (el "mismo renglón" es justo donde el OCR mezcla la
// etiqueta con ruido de la etiqueta vecina, como pasó con APELLIDOS). Los
// apellidos paterno+materno suelen imprimirse en dos líneas separadas, así que
// se concatenan mientras sigan pareciendo nombres.
function extraerValorTrasEtiqueta(lineas, etiquetaRegex, maxLineas = 2) {
    for (let i = 0; i < lineas.length; i++) {
        if (!etiquetaRegex.test(lineas[i])) continue;

        const partes = [];
        for (let j = i + 1; j < Math.min(i + 1 + maxLineas + 1, lineas.length) && partes.length < maxLineas; j++) {
            const candidata = limpiarLinea(lineas[j]);
            if (!candidata) continue;
            if (!esLineaDeNombre(candidata)) break; // llegamos a otra etiqueta u otro dato — paramos
            partes.push(candidata);
        }
        if (partes.length) return partes.join(' ');
    }
    return '';
}

function extraerSexo(texto) {
    if (/\bHOMBRE\b/.test(texto)) return 'Masculino';
    if (/\bMUJER\b/.test(texto)) return 'Femenino';
    const m = texto.match(/SEXO\D{0,5}([MF])\b/);
    if (!m) return '';
    return m[1] === 'M' ? 'Masculino' : 'Femenino';
}

function parsearCedula(textoCrudo) {
    const texto = textoCrudo.toUpperCase();
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

    return {
        dni: extraerDni(texto),
        apellidos: extraerValorTrasEtiqueta(lineas, /APELLIDOS?/, 2), // paterno + materno en líneas separadas
        nombres: extraerValorTrasEtiqueta(lineas, /NOMBRES?/, 1), // ya viene junto en una sola línea ("JUAN JOSE")
        fecha_nac: extraerFechaNacimiento(texto),
        genero: extraerSexo(texto)
    };
}

const escanearCedula = async (req, res) => {
    if (!req.file) return res.status(400).json({ status: "Error", message: "Falta la foto de la cédula" });

    try {
        const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'spa+eng', {
            langPath: LANG_PATH,
            gzip: false,
            logger: () => {}
        });

        const campos = parsearCedula(text);
        res.json({ status: "Success", campos, textoCrudo: text });
    } catch (error) {
        console.error('🔴 Error en OCR de cédula:', error.message);
        res.status(500).json({ status: "Error", message: "No se pudo procesar la imagen de la cédula" });
    }
};

module.exports = { escanearCedula };
