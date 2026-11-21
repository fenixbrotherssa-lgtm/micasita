const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Configuración: si en esta PC se eligió un servidor con la tuerca del login, se usa
// el config.json de la carpeta del usuario (userData), que sobrevive a actualizaciones
// y reinstalaciones; si no, el de fábrica que trae el instalador.
function rutaConfigFabrica() {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'config.json') 
        : path.join(__dirname, 'config.json');
}
function rutaConfigUsuario() {
    return path.join(app.getPath('userData'), 'config.json');
}
function rutaConfig() {
    const enUsuario = rutaConfigUsuario();
    return (app.isPackaged && fs.existsSync(enUsuario)) ? enUsuario : rutaConfigFabrica();
}

function createWindow() {
    let config;
    const configPath = rutaConfig();
    
    try {
        if (fs.existsSync(configPath)) {
            const rawData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(rawData);
            console.log("✅ Configuración cargada con éxito.");
        } else {
            throw new Error(`Archivo no encontrado en: ${configPath}`);
        }
    } catch (err) {
        console.error("❌ ERROR CRÍTICO DE CONFIGURACIÓN:", err.message);
        app.quit();
        return;
    }

    const apiFinal = config.MODO_DEBUG ? config.URL_DESARROLLO : config.URL_PRODUCCION;
    const publicURL = config.PUBLIC_DOMAIN || apiFinal;

    let dominioLimpio;
    try {
        const urlObj = new URL(apiFinal);
        dominioLimpio = urlObj.origin; 
    } catch (e) {
        dominioLimpio = apiFinal.split('/api')[0];
    }

    let dominioPublico;
    try {
        const urlObjPublic = new URL(publicURL);
        dominioPublico = urlObjPublic.origin;
    } catch (e) {
        dominioPublico = publicURL.split('/api')[0];
    }

    const iconPath = path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico');

    // --- CONTROL DE ESTADO DE RED ---
    const userDataPath = app.getPath('userData');
    const networkStatePath = path.join(userDataPath, 'estado_red.json');
    let requiereLimpieza = false;

    try {
        if (fs.existsSync(networkStatePath)) {
            const estadoGuardado = JSON.parse(fs.readFileSync(networkStatePath, 'utf8'));
            if (estadoGuardado.ultimaIP !== apiFinal) {
                console.log(`🔄 Cambio de servidor detectado (${estadoGuardado.ultimaIP} -> ${apiFinal}). Ejecutando purga...`);
                requiereLimpieza = true;
            }
        } else {
            console.log("⚙️ Primera ejecución detectada. Inicializando estado de red...");
            requiereLimpieza = true;
        }

        if (requiereLimpieza) {
            fs.writeFileSync(networkStatePath, JSON.stringify({ ultimaIP: apiFinal }));
        }
    } catch (error) {
        console.error("❌ Error de I/O en estado_red.json:", error.message);
    }
    // ---------------------------------

    const win = new BrowserWindow({
        width: 1300,
        height: 850,
        title: "ametra os",
        icon: iconPath, 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            plugins: true,
            pdfViewerEnabled: true,
            devTools: config.MODO_DEBUG,
            additionalArguments: [
                `--api-url=${apiFinal}`,
                `--public-url=${publicURL}`,
                config.MODO_DEBUG ? '--development' : '--production'
            ]
        }
    });
      
    win.webContents.on('before-input-event', (event, input) => {
        const key = input.key.toLowerCase();
        if (
            (input.control && input.shift && key === 'i') || // Ctrl+Shift+I
            (input.control && input.shift && key === 'j') || // Ctrl+Shift+J
            (input.control && key === 'u') ||               // Ctrl+U
            key === 'f12'
        ) {
            event.preventDefault();
        }
    });

    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    `default-src 'self' ${dominioLimpio} ${dominioPublico} 'unsafe-inline' data: blob:; ` +
                    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${dominioLimpio} ${dominioPublico} http://localhost:8000 http://127.0.0.1:8000; ` +
                    `style-src 'self' 'unsafe-inline'; ` +
                    `font-src 'self' data:; ` +
                    `img-src 'self' data: blob: http: https:; ` +
                    `connect-src 'self' ${dominioLimpio} ${dominioPublico} ws: wss: http: https: http://127.0.0.1:8000 ws://127.0.0.1:8000; ` +
                    `frame-src 'self' ${dominioLimpio} ${dominioPublico} http: https: blob:; ` + 
                    `object-src 'self' ${dominioLimpio} ${dominioPublico} http: https:; ` +
                    `worker-src 'self' blob:;` 
                ]
            }
        });
    });

    win.setMenuBarVisibility(false);

    // --- CARGA CONDICIONAL Y DESTRUCCIÓN DE CACHÉ ---
    if (requiereLimpieza) {
        win.webContents.session.clearStorageData().then(() => {
            console.log("✅ Caché, IndexedDB y LocalStorage purgados exitosamente.");
            win.loadFile(path.join(__dirname, 'index.html'));
        });
    } else {
        win.loadFile(path.join(__dirname, 'index.html'));
    }
    // ------------------------------------------------
    
    if (config.MODO_DEBUG) {
        win.webContents.openDevTools();
    }
}

// ✅ Todos los manejadores IPC agrupados aquí
app.whenReady().then(() => {
    
    // ⚙️ Tuerca del login: leer / guardar a qué servidor se conecta esta PC.
    // Se guarda en userData (en desarrollo, en el config.json del proyecto) y la app se reinicia.
    ipcMain.handle('config-servidor-leer', () => {
        try {
            const cfg = JSON.parse(fs.readFileSync(rutaConfig(), 'utf8'));
            return {
                apiUrl: cfg.MODO_DEBUG ? cfg.URL_DESARROLLO : cfg.URL_PRODUCCION,
                publicDomain: cfg.PUBLIC_DOMAIN || ''
            };
        } catch (e) {
            return { apiUrl: '', publicDomain: '' };
        }
    });

    ipcMain.handle('config-servidor-guardar', (event, datos) => {
        let cfg = {};
        try { cfg = JSON.parse(fs.readFileSync(rutaConfig(), 'utf8')); } catch (_) {}
        if (cfg.MODO_DEBUG) cfg.URL_DESARROLLO = datos.apiUrl;
        else cfg.URL_PRODUCCION = datos.apiUrl;
        cfg.PUBLIC_DOMAIN = datos.publicDomain || '';
        const destino = app.isPackaged ? rutaConfigUsuario() : rutaConfigFabrica();
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, JSON.stringify(cfg, null, 2), 'utf8');
        console.log(`⚙️ Servidor cambiado a ${datos.apiUrl} (guardado en ${destino})`);
        setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
        return { ok: true };
    });

    ipcMain.on('abrir-externo', (event, url) => {
        console.log('🌐 Abriendo URL externa:', url);
        shell.openExternal(url);
    });

    // NUEVO: Escucha el evento emitido desde citas.js (Kanban)
    ipcMain.on('llamar-paciente', (event, data) => {
        console.log('📢 Evento IPC recibido [llamar-paciente]:', data);
        // Cuando construyas la vista de la TV, aquí enviarás el evento hacia ella.
        // Ejemplo futuro: if (ventanaTV) ventanaTV.webContents.send('paciente-llamado', data);
    });

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});