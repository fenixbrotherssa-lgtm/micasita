// =====================================================================
//  actualizadorService.js — Registro de instalación + actualizaciones
//  automáticas del backend on-premise (CasRodsoft Development).
//
//  1. CHECK-IN: al arrancar y cada 6 horas reporta esta instalación a
//     casrodsoft.com (ID de instalación, huella del equipo, clínicas/RUC,
//     versión, totales). NUNCA envía datos de pacientes. Va firmado con
//     HMAC para que nadie pueda inyectar instalaciones falsas en el panel.
//  2. ACTUALIZACIÓN: la respuesta trae el manifiesto de la última versión
//     publicada. Si es más nueva, se descarga, se verifica su SHA-256 y la
//     FIRMA Ed25519 (con la llave pública de abajo — un paquete que no venga
//     firmado por CasRodsoft se rechaza aunque alguien comprometa la web) y
//     queda "preparada". A las 23:30 el servicio se reinicia y arranque.js la
//     aplica, con respaldo y reversión automática si no arranca.
//
//  Solo se activa en instalaciones reales (process.env.AMETRA_ARRANQUE, que
//  pone arranque.js). Nunca bloquea el sistema: sin internet, simplemente
//  no reporta ni actualiza.
// =====================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cron = require('node-cron');
const { getConnection, sql } = require('../config/db');

const APP_DIR = path.join(__dirname, '..');
const DIR = path.join(APP_DIR, 'actualizaciones');
const ESTADO = path.join(DIR, 'estado.json');
const PREPARADA = path.join(DIR, 'preparada');
const SERVIDOR = (process.env.AMETRA_UPDATE_URL || 'https://www.casrodsoft.com').replace(/\/$/, '');
const VERSION = require('../package.json').version;
const ACTIVO = process.env.AMETRA_ARRANQUE === '1' || process.env.AMETRA_ACTUALIZADOR === '1';

// Llave pública de firma de actualizaciones (la privada vive solo en la máquina de
// CasRodsoft: %USERPROFILE%\.casrodsoft\ametraos-actualizaciones-privada.pem).
const LLAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAymlyZN/BtGyfgjAu5vX4ooc5iWDr+cXPeS7cGmBYc4s=
-----END PUBLIC KEY-----`;
// Clave compartida del registro de instalaciones (misma que AMETRA_CHECKIN_SECRET en la web).
// Viaja en secrets/ (fuera de git), igual que la credencial de Firebase.
const SECRETO_CHECKIN = (() => {
    try { return fs.readFileSync(path.join(APP_DIR, 'secrets', 'ametra-checkin.key'), 'utf8').trim(); } catch (_) { return ''; }
})();

// Lo que una actualización JAMÁS reemplaza (datos y configuración propios de la clínica).
const PROTEGIDOS = new Set(['.env', 'uploads', 'sessions', 'actualizaciones', 'arranque.js',
    'BASE_MAESTRA_NACIONAL.csv', 'daemon', '.cache', 'secrets']);

const INTERVALO_CHECKIN_MS = 6 * 60 * 60 * 1000;
const SEGUNDOS_PARA_ESTABLE = 90;

let trabajando = false;
let iniciado = false;

function log(msg) {
    const linea = `[${new Date().toISOString()}] [actualizador] ${msg}`;
    console.log(linea);
    try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(path.join(DIR, 'actualizaciones.log'), linea + '\n'); } catch (_) {}
}
function leerEstado() {
    try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch (_) { return {}; }
}
function guardarEstado(cambios) {
    const e = { ...leerEstado(), ...cambios };
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(ESTADO + '.tmp', JSON.stringify(e, null, 2));
    fs.renameSync(ESTADO + '.tmp', ESTADO);
    return e;
}

const sha256Archivo = (ruta) => crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');

function compararVersiones(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n) || 0), pb = String(b).split('.').map(n => parseInt(n) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
}

// Huella del equipo: hash (no se envían los datos crudos) de nombre + plataforma + MAC física.
function huellaEquipo() {
    const macs = Object.values(os.networkInterfaces()).flat()
        .filter(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
        .map(i => i.mac).sort();
    const base = [os.hostname(), os.platform(), os.arch(), macs[0] || ''].join('|');
    return crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
}

function lockHashLocal() {
    const e = leerEstado();
    if (e.lockHash) return e.lockHash;
    try { return sha256Archivo(path.join(APP_DIR, 'package-lock.json')); } catch (_) { return null; }
}

// Texto exacto que firma herramientas/publicar-actualizacion.js
function textoFirmado(m) {
    const mod = m.modulos ? `${m.modulos.archivo}|${m.modulos.sha256}|${m.modulos.tamano}|${m.modulos.lockHash}` : '-';
    return `${m.producto}|${m.version}|${m.archivo}|${m.sha256}|${m.tamano}|${mod}`;
}
function firmaValida(m) {
    try {
        return crypto.verify(null, Buffer.from(textoFirmado(m)), LLAVE_PUBLICA, Buffer.from(m.firma, 'base64'));
    } catch (_) { return false; }
}

async function datosInstalacion() {
    const pool = await getConnection();
    const id = (await pool.request().query('SELECT TOP 1 ID_Instalacion FROM Sistema_Instalacion')).recordset[0]?.ID_Instalacion;
    const clinicas = (await pool.request().query(
        'SELECT Nombre_Clinica AS nombre, RUC AS ruc, Ciudad AS ciudad FROM Clinicas WHERE Activo = 1')).recordset;
    const t = (await pool.request().query(`SELECT
        (SELECT COUNT(*) FROM Usuarios WHERE Activo = 1) AS usuarios,
        (SELECT COUNT(*) FROM Pacientes) AS pacientes`)).recordset[0];
    const e = leerEstado();
    return {
        producto: 'ametraos-onpremise',
        // La web devuelve el manifiesto de ESTA plataforma (win32 → backend.json,
        // darwin → backend-mac.json): los node_modules nativos no son intercambiables.
        plataforma: process.platform,
        installId: id,
        huella: huellaEquipo(),
        equipo: os.hostname(),
        so: `${os.platform()} ${os.release()} ${os.arch()}`,
        version: VERSION,
        clinicas,
        totales: { clinicas: clinicas.length, usuarios: t.usuarios, pacientes: t.pacientes },
        actualizacion: {
            preparada: e.preparada || null, ultimoError: e.ultimoError || null,
            versionFallida: e.versionFallida || null, pendienteVerificar: !!e.pendienteVerificar
        },
        enviadoEn: new Date().toISOString()
    };
}

async function descargar(url, destino, sha256Esperado) {
    const resp = await axios.get(url, { responseType: 'stream', timeout: 30 * 60 * 1000, maxRedirects: 3 });
    await new Promise((ok, mal) => {
        const out = fs.createWriteStream(destino);
        resp.data.pipe(out);
        out.on('finish', ok);
        out.on('error', mal);
        resp.data.on('error', mal);
    });
    const real = sha256Archivo(destino);
    if (real !== sha256Esperado) throw new Error(`SHA-256 no coincide para ${path.basename(destino)} (esperado ${sha256Esperado}, real ${real})`);
}

async function prepararActualizacion(m) {
    const extract = require('extract-zip');
    const tmp = path.join(DIR, 'descarga');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(path.join(tmp, 'contenido'), { recursive: true });

    log(`Descargando versión ${m.version} (${(m.tamano / 1048576).toFixed(1)} MB)...`);
    const zip = path.join(tmp, m.archivo);
    await descargar(`${SERVIDOR}/downloads/ametraos/${encodeURIComponent(m.archivo)}`, zip, m.sha256);
    await extract(zip, { dir: path.join(tmp, 'contenido') });
    fs.rmSync(zip, { force: true });

    // Dependencias (node_modules) solo si cambiaron respecto de las instaladas.
    let lockHash = null;
    if (m.modulos && m.modulos.lockHash !== lockHashLocal()) {
        if (!m.modulos.archivo) {
            throw new Error(`La versión ${m.version} usa dependencias distintas a las instaladas y no trae el paquete de módulos: requiere reinstalación manual.`);
        }
        log(`Las dependencias cambiaron; descargando módulos (${(m.modulos.tamano / 1048576).toFixed(1)} MB)...`);
        const zipMod = path.join(tmp, m.modulos.archivo);
        await descargar(`${SERVIDOR}/downloads/ametraos/${encodeURIComponent(m.modulos.archivo)}`, zipMod, m.modulos.sha256);
        await extract(zipMod, { dir: path.join(tmp, 'contenido') });
        fs.rmSync(zipMod, { force: true });
        lockHash = m.modulos.lockHash;
    }

    // Defensa extra: aunque el paquete los trajera, nunca se tocan datos de la clínica.
    for (const e of fs.readdirSync(path.join(tmp, 'contenido'))) {
        if (PROTEGIDOS.has(e)) fs.rmSync(path.join(tmp, 'contenido', e), { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify({ version: m.version, sha256: m.sha256, lockHash, notas: m.notas || '' }, null, 2));

    fs.rmSync(PREPARADA, { recursive: true, force: true });
    fs.renameSync(tmp, PREPARADA);
    guardarEstado({ preparada: m.version, notasPreparada: m.notas || '', ultimoError: null });
    log(`✅ Versión ${m.version} descargada, verificada y lista. Se instalará a las 23:30 (o con "Instalar ahora").`);
}

async function checkin() {
    if (!ACTIVO || trabajando) return { ok: false, motivo: ACTIVO ? 'ocupado' : 'desactivado (modo desarrollo)' };
    trabajando = true;
    try {
        const cuerpo = JSON.stringify(await datosInstalacion());
        const firma = crypto.createHmac('sha256', SECRETO_CHECKIN).update(cuerpo).digest('hex');
        const r = await axios.post(`${SERVIDOR}/api/ametraos/checkin`, cuerpo, {
            headers: { 'Content-Type': 'application/json', 'X-Ametra-Firma': firma }, timeout: 30000
        });
        const m = r.data?.backend;
        const e = guardarEstado({ ultimaComprobacion: new Date().toISOString(), ultimoCheckinOk: true, mensaje: r.data?.mensaje || null, ultimaPublicada: m?.version || null });

        if (m && compararVersiones(m.version, VERSION) > 0 && m.version !== e.versionFallida && m.version !== e.preparada && m.version !== e.versionOmitida) {
            if (!firmaValida(m)) {
                guardarEstado({ ultimoError: `Se rechazó la versión ${m.version}: firma inválida.` });
                log(`⛔ Versión ${m.version} rechazada: la firma no es de CasRodsoft.`);
            } else {
                try {
                    await prepararActualizacion(m);
                } catch (err) {
                    // Un corte de red se reintenta en el próximo check-in; una versión que exige
                    // reinstalación manual se omite hasta que se publique otra.
                    const omitir = /reinstalación/i.test(err.message);
                    guardarEstado({ ultimoError: `No se pudo preparar la versión ${m.version}: ${err.message}`, ...(omitir ? { versionOmitida: m.version } : {}) });
                    log(`❌ No se pudo preparar ${m.version}: ${err.message}`);
                }
            }
        }
        return { ok: true, publicada: m?.version || null };
    } catch (err) {
        guardarEstado({ ultimaComprobacion: new Date().toISOString(), ultimoCheckinOk: false, ultimoError: `Sin conexión con el servidor de actualizaciones: ${err.message}` });
        log(`Sin conexión con ${SERVIDOR}: ${err.message}`);
        return { ok: false, motivo: err.message };
    } finally {
        trabajando = false;
    }
}

// Reinicia el servicio para que arranque.js aplique lo preparado (el servicio de
// Windows / launchd vuelve a levantar el proceso automáticamente).
function aplicarAhora(motivo) {
    if (!fs.existsSync(path.join(PREPARADA, 'meta.json'))) return false;
    log(`Reiniciando para instalar la versión ${leerEstado().preparada} (${motivo})...`);
    setTimeout(() => process.exit(0), 3000);
    return true;
}

function estadoPublico() {
    const e = leerEstado();
    // "preparada" solo cuenta si de verdad hay algo esperando y es más nuevo que lo instalado.
    if (e.preparada && (!fs.existsSync(path.join(PREPARADA, 'meta.json')) || compararVersiones(e.preparada, VERSION) <= 0)) {
        e.preparada = null;
        e.notasPreparada = '';
    }
    return {
        version: VERSION, activo: ACTIVO, servidor: SERVIDOR,
        ultimaComprobacion: e.ultimaComprobacion || null, ultimoCheckinOk: e.ultimoCheckinOk ?? null,
        ultimaPublicada: e.ultimaPublicada || null,
        preparada: e.preparada || null, notasPreparada: e.notasPreparada || '',
        ultimoError: e.ultimoError || null, mensaje: e.mensaje || null,
        historial: (e.historial || []).slice(0, 10)
    };
}

function iniciar() {
    if (iniciado) return; // connectWithRetry puede volver a llamar tras una reconexión
    iniciado = true;
    if (!ACTIVO) {
        console.log('🔄 [Actualizador]: desactivado (modo desarrollo — se activa solo en instalaciones reales).');
        return;
    }
    const e = leerEstado();
    if (!e.versionInstalada) guardarEstado({ versionInstalada: VERSION });

    // Si arrancó bien después de una actualización, queda confirmada.
    setTimeout(() => {
        const est = leerEstado();
        if (est.pendienteVerificar) {
            const historial = est.historial || [];
            historial.unshift({ version: VERSION, resultado: 'INSTALADA', fecha: new Date().toISOString(), detalle: `Desde ${est.versionAnterior || '?'}` });
            guardarEstado({ pendienteVerificar: false, intentos: 0, historial: historial.slice(0, 30), ultimoError: null });
            log(`✅ Versión ${VERSION} estable.`);
            // Solo se conserva el respaldo más reciente
            try {
                const dirResp = path.join(DIR, 'respaldos');
                fs.readdirSync(dirResp).map(d => path.join(dirResp, d)).filter(d => d !== est.respaldo)
                    .forEach(d => fs.rmSync(d, { recursive: true, force: true }));
            } catch (_) {}
        }
    }, SEGUNDOS_PARA_ESTABLE * 1000);

    setTimeout(checkin, 60 * 1000);
    setInterval(checkin, INTERVALO_CHECKIN_MS);
    // Ventana nocturna: después del cierre automático de caja de las 23:00.
    cron.schedule('30 23 * * *', () => aplicarAhora('ventana nocturna 23:30'));
    console.log(`🔄 [Actualizador]: activo (v${VERSION}) · servidor ${SERVIDOR}`);
}

module.exports = { iniciar, checkin, aplicarAhora, estadoPublico };
