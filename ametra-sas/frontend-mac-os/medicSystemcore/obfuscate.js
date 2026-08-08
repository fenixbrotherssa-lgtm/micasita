const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// Configuración de rutas - MedicSystem Pro
const outputDir = path.join(__dirname, '../MedicSystem_Ready');

async function protect() {
    console.log('--- INICIANDO BLINDAJE DE MEDIC_SYSTEM_PRO ---');
    
    try {
        // 1. Limpiar carpeta de salida para evitar basura de builds anteriores
        if (fs.existsSync(outputDir)) {
            console.log('Limpiando versiones anteriores en MedicSystem_Ready...');
            fs.removeSync(outputDir);
        }
        fs.ensureDirSync(outputDir);

        // 2. Copiar archivos y carpetas que NO se deben ofuscar
        // Mantenemos ejecutables y vistas intactos para que no pesen de más ni se rompan
        console.log('Copiando archivos estáticos y ejecutables...');
        
        const foldersToCopy = ['assets', 'views'];
        const filesToCopy = ['index.html', 'package.json', ];

        foldersToCopy.forEach(folder => {
            const src = path.join(__dirname, folder);
            if (fs.existsSync(src)) {
                fs.copySync(src, path.join(outputDir, folder));
            }
        });

        filesToCopy.forEach(file => {
            const src = path.join(__dirname, file);
            if (fs.existsSync(src)) {
                fs.copySync(src, path.join(outputDir, file));
            }
        });

        // 3. Ofuscar archivos críticos (Propiedad Intelectual)
        console.log('Ofuscando lógica principal (Aplicando algoritmos de protección)...');
        
        // Configuramos los flags de seguridad:
        // --compact: Elimina espacios
        // --self-defending: Bloquea el código si intentan formatearlo (Prettify)
        // --string-array-encoding base64: Esconde tus URLs y textos sensibles
        const obfuscateOptions = `--compact true --self-defending true --string-array true --string-array-encoding base64 --unicode-escape-sequence true`;

        // Procesar archivos individuales de Electron
        const singleFiles = ['main.js', 'preload.js'];
        singleFiles.forEach(file => {
            if (fs.existsSync(file)) {
                console.log(` > Protegiendo: ${file}`);
                execSync(`npx javascript-obfuscator ${file} --output ${path.join(outputDir, file)} ${obfuscateOptions}`);
            }
        });

        // Procesar la carpeta completa de lógica de negocio (js/)
        if (fs.existsSync('js')) {
            console.log(' > Protegiendo carpeta de lógica: js/');
            execSync(`npx javascript-obfuscator js --output ${path.join(outputDir, 'js')} ${obfuscateOptions}`);
        }

        console.log('\n--- BÚNKER CREADO CON ÉXITO ---');
        console.log(`Ubicación: ${outputDir}`);
        console.log('Instrucciones:');
        console.log('1. Entra a la carpeta MedicSystem_Ready.');
        console.log('2. Corre "npm install --production" ahí dentro para los node_modules.');
        console.log('3. Genera tu .asar apuntando a esa carpeta.');

    } catch (error) {
        console.error('\n--- ERROR DURANTE EL BLINDAJE ---');
        console.error('Verifica que hayas instalado javascript-obfuscator localmente.');
        console.error('Error detallado:', error.message);
    }
}

protect();