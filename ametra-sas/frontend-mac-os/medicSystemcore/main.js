const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Actualizaciones automáticas de la app (Windows): electron-updater lee
// https://www.casrodsoft.com/downloads/ametraos-saas/ametraos-saas.yml, descarga la versión
// nueva en segundo plano y la instala al cerrar el programa. En Mac no hay instalación
// silenciosa (requiere app firmada por Apple): ahí avisa js/uimodules/versionApp.js.
let autoUpdaterRef = null;
function configurarActualizaciones(win) {
    if (!app.isPackaged || process.platform !== 'win32') return;
    let autoUpdater;
    try { ({ autoUpdater } = require('electron-updater')); }
    catch (e) { console.warn('electron-updater no disponible:', e.message); return; }
    autoUpdaterRef = autoUpdater;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('error', (err) => console.error('Actualizador:', err && err.message || err));
    autoUpdater.on('update-downloaded', async (info) => {
        const { dialog } = require('electron');
        const r = await dialog.showMessageBox(win, {
            type: 'info',
            title: 'Actualización lista',
            message: `Hay una nueva versión de AMETRA OS (${info.version}) lista para instalar.`,
            detail: 'Se instalará automáticamente al cerrar el programa. ¿Desea reiniciar ahora?',
            buttons: ['Reiniciar ahora', 'Más tarde'],
            defaultId: 0,
            cancelId: 1
        });
        if (r.response === 0) instalarActualizacionAhora();
    });

    const buscar = () => autoUpdater.checkForUpdates().catch(() => {});
    setTimeout(buscar, 10000);
    setInterval(buscar, 4 * 60 * 60 * 1000);
}

function instalarActualizacionAhora() {
    if (!autoUpdaterRef) return;
    app.removeAllListeners('window-all-closed');
    BrowserWindow.getAllWindows().forEach(w => { try { w.removeAllListeners('close'); w.destroy(); } catch (_) {} });
    setImmediate(() => autoUpdaterRef.quitAndInstall());
}

function createWindow() {
    let config;
    const configPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'config.json') 
        : path.join(__dirname, 'config.json');
    
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
                config.MODO_DEBUG ? '--development' : '--production',
                `--app-version=${app.getVersion()}`,
                `--plataforma=${process.platform}`,
                `--arquitectura=${process.arch}`
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

    configurarActualizaciones(win);
}

// ✅ Todos los manejadores IPC agrupados aquí
app.whenReady().then(() => {
    
    ipcMain.on('abrir-externo', (event, url) => {
        console.log('🌐 Abriendo URL externa:', url);
        shell.openExternal(url);
    });

    // La app quedó por debajo de la versión mínima del servidor: buscar y descargar ya la
    // actualización (Windows). Devuelve si hay un actualizador disponible.
    ipcMain.handle('buscar-actualizacion', async () => {
        if (!autoUpdaterRef) return { disponible: false };
        try { await autoUpdaterRef.checkForUpdates(); } catch (_) {}
        return { disponible: true };
    });
    ipcMain.on('instalar-actualizacion', () => instalarActualizacionAhora());

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