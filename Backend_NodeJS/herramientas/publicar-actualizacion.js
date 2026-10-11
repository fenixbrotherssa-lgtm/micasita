// =====================================================================
//  Publica una actualización automática del backend on-premise.
//  (Herramienta de CasRodsoft — NO viaja a las clínicas: herramientas/ no
//  está en CODE_FOLDERS de build.js.)
//
//  Uso (desde Backend_NodeJS, con la versión ya subida en package.json):
//     node herramientas/publicar-actualizacion.js --notas="Qué trae esta versión"
//  Opciones:
//     --destino=<carpeta>   por defecto la web: C:\BLIND\casrodsoftdevelopment-web\public\downloads\ametraos
//     --sin-build           reutiliza el Backend_DIST ya armado
//     --con-modulos         fuerza incluir node_modules (normalmente se decide solo:
//                           se incluye si package-lock.json cambió desde la última publicación)
//
//  Genera en <destino>:
//     ametraos-backend-<version>.zip          código ofuscado + assets
//     ametraos-backend-modulos-<hash>.zip     node_modules (solo si cambiaron las dependencias)
//     backend.json                            manifiesto FIRMADO (Ed25519) que leen las clínicas
//  Después: copiar esos archivos a la carpeta public/downloads/ametraos/ del servidor web.
// =====================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'Backend_DIST');
const arg = (n) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=') || null;
const flag = (n) => process.argv.includes(`--${n}`);

const DESTINO = arg('destino') || 'C:\\BLIND\\casrodsoftdevelopment-web\\public\\downloads\\ametraos';
const LLAVE_PRIVADA = path.join(os.homedir(), '.casrodsoft', 'ametraos-actualizaciones-privada.pem');
const VERSION = require('../package.json').version;
const NOTAS = arg('notas') || '';

// Lo que viaja en el paquete de código. Nunca: .env, secrets, sessions, uploads, node_modules,
// arranque.js (además el backend los descarta igual al recibirlos — ver PROTEGIDOS).
const ENTRADAS = ['config', 'controllers', 'middlewares', 'routes', 'services', 'scripts',
    'assets', 'ocr-data', 'server.js', 'package.json', 'package-lock.json',
    'install-service.js', 'uninstall-service.js', '.puppeteerrc.cjs'];
// Dentro de assets/ hay instaladores e imágenes del asistente que no hacen falta en una actualización.
const EXCLUIR_ASSETS = /\.(msi|bmp)$|nssm\.exe$|service_install\.log$/i;

// Recursos PESADOS que casi nunca cambian: solo viajan cuando su huella cambió respecto de
// la publicación anterior (la primera publicación es la línea base del instalador manual).
const RECURSOS = [
    { nombre: 'firmador-sri', ruta: 'services/firmadormedico' },
    { nombre: 'modelo-3d', ruta: 'assets/models' },
    { nombre: 'ocr', ruta: 'ocr-data' }
];

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function zipear(destinoZip, agregar) {
    return new Promise((ok, mal) => {
        const out = fs.createWriteStream(destinoZip);
        const z = archiver('zip', { zlib: { level: 9 } });
        out.on('close', ok);
        z.on('error', mal);
        z.pipe(out);
        agregar(z);
        z.finalize();
    });
}

function textoFirmado(m) {
    const mod = m.modulos ? `${m.modulos.archivo}|${m.modulos.sha256}|${m.modulos.tamano}|${m.modulos.lockHash}` : '-';
    return `${m.producto}|${m.version}|${m.archivo}|${m.sha256}|${m.tamano}|${mod}`;
}

(async () => {
    if (!fs.existsSync(LLAVE_PRIVADA)) throw new Error(`No se encontró la llave privada de firma en ${LLAVE_PRIVADA}.`);
    fs.mkdirSync(DESTINO, { recursive: true });

    const anterior = (() => { try { return JSON.parse(fs.readFileSync(path.join(DESTINO, 'backend.json'), 'utf8')); } catch (_) { return null; } })();
    if (anterior && anterior.version === VERSION) {
        throw new Error(`La versión ${VERSION} ya está publicada. Sube "version" en package.json antes de publicar.`);
    }

    if (!flag('sin-build')) {
        console.log('[1/4] Armando Backend_DIST (código ofuscado)...');
        execSync('node build.js --sin-instalador', { cwd: ROOT, stdio: 'inherit' });
    }

    console.log('[2/4] Empaquetando código...');
    // Huella de cada recurso pesado; solo viaja si cambió desde la publicación anterior.
    const huellaCarpeta = (dir) => {
        const h = crypto.createHash('sha256');
        const recorrer = (rel) => {
            for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
                const r = path.posix.join(rel, d.name);
                if (d.isDirectory()) recorrer(r);
                else { h.update(r); h.update(fs.readFileSync(path.join(dir, r))); }
            }
        };
        if (fs.existsSync(dir)) recorrer('');
        return h.digest('hex');
    };
    const recursos = {};
    const excluidos = [];
    for (const r of RECURSOS) {
        recursos[r.nombre] = huellaCarpeta(path.join(DIST, r.ruta));
        const cambio = anterior?.recursos?.[r.nombre] !== recursos[r.nombre];
        if (!anterior || !cambio) excluidos.push(r.ruta);
        console.log(`   ${r.nombre}: ${!anterior ? 'línea base (no viaja)' : cambio ? 'CAMBIÓ → se incluye' : 'sin cambios (no viaja)'}`);
    }
    const excluido = (nombre) => excluidos.some(r => nombre === r || nombre.startsWith(r + '/'));

    const archivo = `ametraos-backend-${VERSION}.zip`;
    const zipCodigo = path.join(DESTINO, archivo);
    await zipear(zipCodigo, (z) => {
        for (const e of ENTRADAS) {
            const ruta = path.join(DIST, e);
            if (!fs.existsSync(ruta) || excluido(e)) continue;
            if (fs.statSync(ruta).isDirectory()) {
                // archiver entrega la ruta como prefix (carpeta destino) + name (relativa a ella)
                z.directory(ruta, e, (d) => {
                    const completo = [d.prefix, d.name].filter(Boolean).join('/').replace(/\\/g, '/');
                    return (excluido(completo) || (e === 'assets' && EXCLUIR_ASSETS.test(d.name))) ? false : d;
                });
            } else {
                z.file(ruta, { name: e });
            }
        }
    });

    console.log('[3/4] Revisando dependencias...');
    const lockHash = sha256(path.join(ROOT, 'package-lock.json'));
    // - Primera publicación (no hay backend.json previo): NO se empaqueta node_modules — es la
    //   línea base, idéntica a la que trae el instalador manual de esta versión.
    // - Mismas dependencias que la publicación anterior → se reutiliza ese zip.
    // - Dependencias cambiadas (o --con-modulos) → se empaqueta node_modules.
    // Cada clínica compara lockHash con el suyo y solo baja el zip si le hace falta.
    let modulos = null;
    if (!anterior && !flag('con-modulos')) {
        modulos = { lockHash, archivo: null, sha256: null, tamano: 0 };
        console.log('   Primera publicación: node_modules no se empaqueta (línea base del instalador).');
    } else if (anterior?.modulos?.lockHash === lockHash && !flag('con-modulos')) {
        modulos = anterior.modulos;
    }
    if (!modulos) {
        const archivoMod = `ametraos-backend-modulos-${lockHash.slice(0, 12)}.zip`;
        console.log(`   Dependencias nuevas/cambiadas → empaquetando node_modules (${archivoMod}). Esto tarda...`);
        await zipear(path.join(DESTINO, archivoMod), (z) => z.directory(path.join(ROOT, 'node_modules'), 'node_modules'));
        modulos = { archivo: archivoMod, sha256: sha256(path.join(DESTINO, archivoMod)), tamano: fs.statSync(path.join(DESTINO, archivoMod)).size, lockHash };
    }

    console.log('[4/4] Firmando manifiesto...');
    const manifiesto = {
        producto: 'ametraos-backend',
        version: VERSION,
        archivo,
        sha256: sha256(zipCodigo),
        tamano: fs.statSync(zipCodigo).size,
        modulos,
        recursos, // huellas de los recursos pesados (para decidir qué viaja en la próxima publicación)
        notas: NOTAS,
        fecha: new Date().toISOString()
    };
    const llave = crypto.createPrivateKey(fs.readFileSync(LLAVE_PRIVADA));
    manifiesto.firma = crypto.sign(null, Buffer.from(textoFirmado(manifiesto)), llave).toString('base64');
    fs.writeFileSync(path.join(DESTINO, 'backend.json'), JSON.stringify(manifiesto, null, 2));

    console.log(`\n✅ Backend ${VERSION} publicado en ${DESTINO}`);
    console.log(`   ${archivo} (${(manifiesto.tamano / 1048576).toFixed(1)} MB)` + (modulos?.archivo ? ` + ${modulos.archivo} (${(modulos.tamano / 1048576).toFixed(1)} MB)` : ''));
    console.log('   Las clínicas lo descargan en su próximo check-in (≤ 6 h) y lo instalan a las 23:30.');
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
