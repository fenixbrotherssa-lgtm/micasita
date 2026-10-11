// =====================================================================
//  arranque.js — Punto de entrada del servicio "AmetraOS Backend".
//
//  Hace dos cosas ANTES de cargar el sistema (server.js):
//   1. Aplica una actualización ya descargada y verificada por
//      services/actualizadorService.js (queda "preparada" en
//      actualizaciones/preparada/). Se aplica aquí, con el sistema todavía
//      sin cargar, porque en Windows no se pueden sobrescribir módulos
//      nativos (.node) que estén en uso.
//   2. Protege contra una versión que no arranca: si después de aplicar una
//      actualización el sistema se cae 3 veces antes de quedar estable, se
//      restaura el respaldo de la versión anterior automáticamente.
//
//  Este archivo NUNCA se reemplaza con una actualización (ver PROTEGIDOS en
//  actualizadorService.js) y solo usa módulos nativos de Node, para que
//  siempre pueda recuperar el sistema aunque la versión nueva venga rota.
// =====================================================================
const fs = require('fs');
const path = require('path');

const APP_DIR = __dirname;
const DIR = path.join(APP_DIR, 'actualizaciones');
const ESTADO = path.join(DIR, 'estado.json');
const PREPARADA = path.join(DIR, 'preparada');
const MAX_INTENTOS = 3;

function log(msg) {
    const linea = `[${new Date().toISOString()}] [arranque] ${msg}`;
    console.log(linea);
    try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(path.join(DIR, 'actualizaciones.log'), linea + '\n'); } catch (_) {}
}
function leerEstado() {
    try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch (_) { return {}; }
}
function guardarEstado(e) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(ESTADO + '.tmp', JSON.stringify(e, null, 2));
    fs.renameSync(ESTADO + '.tmp', ESTADO);
}
function copiar(origen, destino) {
    fs.cpSync(origen, destino, { recursive: true, force: true });
}

// Todos los archivos (rutas relativas) bajo una carpeta.
function listarArchivos(base, rel = '') {
    const out = [];
    for (const d of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
        const r = path.join(rel, d.name);
        if (d.isDirectory()) out.push(...listarArchivos(base, r));
        else out.push(r);
    }
    return out;
}

// Devuelve el sistema a como estaba antes de aplicar: repone los archivos respaldados y
// borra los que la versión nueva agregó.
function restaurarRespaldo(respaldo) {
    const archivos = path.join(respaldo, 'archivos');
    if (fs.existsSync(archivos)) copiar(archivos, APP_DIR);
    try {
        for (const r of JSON.parse(fs.readFileSync(path.join(respaldo, '_nuevos.json'), 'utf8'))) {
            fs.rmSync(path.join(APP_DIR, r), { force: true });
        }
    } catch (_) {}
}

function aplicarPreparada(estado) {
    const meta = JSON.parse(fs.readFileSync(path.join(PREPARADA, 'meta.json'), 'utf8'));
    const contenido = path.join(PREPARADA, 'contenido');
    const respaldo = path.join(DIR, 'respaldos', `${estado.versionInstalada || 'anterior'}-${Date.now()}`);
    fs.mkdirSync(path.join(respaldo, 'archivos'), { recursive: true });

    // 1. Respaldo archivo por archivo de EXACTAMENTE lo que se va a pisar (no carpetas
    //    enteras: services/ trae 300 MB del firmador SRI que casi nunca cambian).
    const archivos = listarArchivos(contenido);
    const nuevos = [];
    for (const r of archivos) {
        const actual = path.join(APP_DIR, r);
        if (fs.existsSync(actual)) {
            fs.mkdirSync(path.dirname(path.join(respaldo, 'archivos', r)), { recursive: true });
            fs.copyFileSync(actual, path.join(respaldo, 'archivos', r));
        } else {
            nuevos.push(r);
        }
    }
    fs.writeFileSync(path.join(respaldo, '_nuevos.json'), JSON.stringify(nuevos));

    // 2. Copia de la versión nueva encima; si algo falla a medias, se deja todo como estaba.
    try {
        copiar(contenido, APP_DIR);
    } catch (err) {
        log(`❌ Falló la copia de la versión ${meta.version} (${err.message}). Restaurando respaldo...`);
        restaurarRespaldo(respaldo);
        throw err;
    }

    estado.versionAnterior = estado.versionInstalada || null;
    estado.versionInstalada = meta.version;
    estado.respaldo = respaldo;
    estado.pendienteVerificar = true;
    estado.intentos = 0;
    estado.aplicadaEn = new Date().toISOString();
    if (meta.lockHash) estado.lockHash = meta.lockHash;
    delete estado.preparada;
    delete estado.notasPreparada;
    log(`Actualización ${estado.versionAnterior || '?'} → ${meta.version} aplicada (respaldo en ${respaldo}).`);
}

function revertir(estado) {
    log(`La versión ${estado.versionInstalada} no arrancó ${MAX_INTENTOS} veces. Restaurando ${estado.versionAnterior}...`);
    restaurarRespaldo(estado.respaldo);
    (estado.historial = estado.historial || []).unshift({
        version: estado.versionInstalada, resultado: 'REVERTIDA', fecha: new Date().toISOString(),
        detalle: `No arrancó ${MAX_INTENTOS} veces; se restauró ${estado.versionAnterior}`
    });
    estado.versionFallida = estado.versionInstalada; // esta versión no se vuelve a descargar
    estado.versionInstalada = estado.versionAnterior;
    estado.pendienteVerificar = false;
    estado.intentos = 0;
    estado.ultimoError = `La versión ${estado.versionFallida} no arrancó y fue revertida automáticamente.`;
    log('Versión anterior restaurada.');
}

try {
    const estado = leerEstado();
    if (fs.existsSync(path.join(PREPARADA, 'meta.json')) && !estado.pendienteVerificar) {
        try {
            aplicarPreparada(estado);
        } catch (err) {
            estado.ultimoError = `No se pudo aplicar la actualización: ${err.message}`;
        }
        fs.rmSync(PREPARADA, { recursive: true, force: true });
        guardarEstado(estado);
    } else if (estado.pendienteVerificar) {
        estado.intentos = (estado.intentos || 0) + 1;
        if (estado.intentos > MAX_INTENTOS && estado.respaldo) revertir(estado);
        guardarEstado(estado);
    }
} catch (err) {
    log(`❌ Error en el arranque protegido (se continúa normal): ${err.message}`);
}

// Marca que el sistema corre como instalación real (servicio). El actualizador solo se
// activa así — nunca al correr `npm start` en la máquina de desarrollo.
process.env.AMETRA_ARRANQUE = '1';
require('./server.js');
