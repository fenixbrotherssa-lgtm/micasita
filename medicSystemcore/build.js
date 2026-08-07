const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const ROOT = __dirname;
const STAGING = path.join(ROOT, 'MedicSystem_Ready');
const ISS_FILE = path.join(ROOT, 'MedicinaEcuador_Pro_Installer.iss');
const ISCC = process.env.ISCC_PATH || 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';

const FOLDERS_TO_COPY = ['assets', 'views'];
const FILES_TO_COPY = ['index.html', 'package.json', 'package-lock.json', 'config.json'];

const OBFUSCATE_FLAGS = '--compact true --self-defending true --string-array true --string-array-encoding base64 --unicode-escape-sequence true';

function run(cmd, cwd = ROOT) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd });
}

async function build() {
    console.log('--- INICIANDO BUILD DEL CLIENTE (ametra-os) ---');

    console.log('\n[1/5] Limpiando build anterior...');
    fs.removeSync(STAGING);
    fs.ensureDirSync(STAGING);

    console.log('\n[2/5] Copiando archivos estáticos (sin ofuscar)...');
    FOLDERS_TO_COPY.forEach((folder) => {
        const src = path.join(ROOT, folder);
        if (fs.existsSync(src)) {
            fs.copySync(src, path.join(STAGING, folder));
        }
    });
    FILES_TO_COPY.forEach((file) => {
        const src = path.join(ROOT, file);
        if (fs.existsSync(src)) {
            fs.copySync(src, path.join(STAGING, file));
        }
    });

    console.log('\n[3/5] Enlazando node_modules (junction, sin copiar físicamente)...');
    const nodeModulesSrc = path.join(ROOT, 'node_modules');
    const nodeModulesDest = path.join(STAGING, 'node_modules');
    if (fs.existsSync(nodeModulesDest)) {
        fs.removeSync(nodeModulesDest);
    }
    fs.symlinkSync(nodeModulesSrc, nodeModulesDest, 'junction');

    console.log('\n[4/5] Ofuscando lógica del cliente (main.js, preload.js, js/)...');
    ['main.js', 'preload.js'].forEach((file) => {
        const src = path.join(ROOT, file);
        if (fs.existsSync(src)) {
            console.log(` > Protegiendo: ${file}`);
            run(`npx javascript-obfuscator "${file}" --output "${path.join(STAGING, file)}" ${OBFUSCATE_FLAGS}`);
        }
    });
    if (fs.existsSync(path.join(ROOT, 'js'))) {
        console.log(' > Protegiendo carpeta de lógica: js/');
        run(`npx javascript-obfuscator js --output "${path.join(STAGING, 'js')}" ${OBFUSCATE_FLAGS}`);
    }

    console.log('\n[5/5] Empaquetando con electron-builder y generando instalador con Inno Setup...');
    run('npx electron-builder --win --dir', STAGING);

    if (!fs.existsSync(ISCC)) {
        throw new Error(`No se encontró ISCC.exe en "${ISCC}". Instalá Inno Setup 6 o seteá la variable de entorno ISCC_PATH.`);
    }
    run(`"${ISCC}" "${ISS_FILE}"`);

    console.log('\n--- BUILD COMPLETO ---');
    console.log(`Instalador generado en: ${ROOT}`);
}

build().catch((error) => {
    console.error('\n--- ERROR EN EL BUILD DEL CLIENTE ---');
    console.error(error.message);
    process.exit(1);
});
