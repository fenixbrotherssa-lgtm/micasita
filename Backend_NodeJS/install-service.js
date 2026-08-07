// Instala este backend como un Servicio de Windows real (sin ventana de
// consola, arranca solo con el sistema, se reinicia solo si el proceso
// muere inesperadamente). Requiere ejecutarse con permisos de Administrador:
//
//   node install-service.js
//
const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

// El instalador (Inno Setup) llama a este script con la ventana oculta, así que no
// hay consola que mirar: todo lo relevante se escribe también a un log propio, en
// vez de depender de que la shell que lo invoque redirija stdout/stderr (esa
// redirección con comillas anidadas resultó frágil desde Inno Setup).
const logFile = path.join(__dirname, 'assets', 'service_install.log');
function log(msg) {
    const linea = `[${new Date().toISOString()}] ${msg}`;
    console.log(linea);
    try { fs.appendFileSync(logFile, linea + '\n'); } catch (e) { /* si no se puede escribir, seguimos igual */ }
}

// node-windows SIEMPRE intenta re-elevar por UAC (ShellExecute "runas") para crear
// el servicio, incluso si este proceso YA corre como Administrador — que es siempre
// el caso acá (Inno Setup exige admin, o se te pide correr esto "como Administrador"
// a mano). Ese cuadro de UAC no se puede click-ear solo y deja el instalador colgado
// hasta el timeout de abajo, sin instalar nada. Como ya tenemos los permisos que hacen
// falta, saltamos ese paso y ejecutamos el comando directo.
require('node-windows/lib/binaries').elevate = function (cmd, options, callback) {
    require('child_process').exec(cmd, options, callback);
};

const svc = new Service({
    name: 'AmetraOS Backend',
    description: 'Servidor de MedicinaEcuador Pro (Ametra OS) — API, base de datos y bot de WhatsApp.',
    script: path.join(__dirname, 'server.js'),
    nodeOptions: [],
    // Si el proceso muere (corte de luz, crash, etc.) se reinicia solo, con
    // backoff progresivo, hasta un máximo de reintentos para no quedar en
    // loop infinito si el fallo es persistente.
    wait: 5,
    grow: 0.5,
    maxRestarts: 10,
});

// Nunca queremos que esto tumbe el instalador: si algo sale mal, queda registrado en
// el log para revisar después, pero el setup sigue su curso (igual que antes con nssm,
// que tampoco frenaba la instalación si algo fallaba puertas adentro).
const salidaForzada = setTimeout(() => {
    log('⚠️  Tiempo de espera agotado instalando el servicio.');
    process.exit(0);
}, 60000);

svc.on('install', () => {
    log('✅ Servicio "AmetraOS Backend" instalado. Iniciando...');
    svc.start();
});

svc.on('alreadyinstalled', () => {
    log('⚠️  El servicio ya estaba instalado.');
    clearTimeout(salidaForzada);
    process.exit(0);
});

svc.on('start', () => {
    log('🚀 Servicio "AmetraOS Backend" iniciado y corriendo en segundo plano.');
    clearTimeout(salidaForzada);
    process.exit(0);
});

svc.on('error', (err) => {
    log('❌ Error instalando el servicio: ' + (err && err.message ? err.message : err));
    clearTimeout(salidaForzada);
    process.exit(0);
});

log('--- Iniciando instalación del servicio ---');
svc.install();
