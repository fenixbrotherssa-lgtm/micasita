const { contextBridge, ipcRenderer } = require('electron');

// ==========================================================
// DETECCIÓN DE ENTORNO DINÁMICA (Desde config.json vía Main)
// ==========================================================

const argApi = process.argv.find(arg => arg.startsWith('--api-url='));
const API_BASE = argApi ? argApi.split('=')[1] : "http://localhost:8000/api";

const argPublic = process.argv.find(arg => arg.startsWith('--public-url='));
const PUBLIC_URL = argPublic ? argPublic.split('=')[1] : "";

const isProd = process.argv.includes('--production');

console.log(`🌐 [Sistema]: Conectado a ${API_BASE} (${isProd ? 'PRODUCCIÓN' : 'DESARROLLO'})`);
if (PUBLIC_URL) {
    console.log(`🌍 [Sistema]: URL pública activa → ${PUBLIC_URL}`);
}

// ==========================================================
// IMPORTANTE (CAMBIO DE ARQUITECTURA):
// ==========================================================
contextBridge.exposeInMainWorld('appConfig', {
    baseURL: API_BASE,
    publicURL: PUBLIC_URL,
    isProd: isProd
});

// Versión y plataforma de esta app (para el control de versión mínima, ver versionApp.js).
const arg = (nombre) => (process.argv.find(a => a.startsWith(`--${nombre}=`)) || '').split('=').slice(1).join('=');
contextBridge.exposeInMainWorld('appInfo', {
    version: arg('app-version'),
    plataforma: arg('plataforma'),
    arquitectura: arg('arquitectura')
});
contextBridge.exposeInMainWorld('_electronActualizador', {
    buscar: () => ipcRenderer.invoke('buscar-actualizacion'),
    instalar: () => ipcRenderer.send('instalar-actualizacion')
});

// Puente para abrir enlaces externos
contextBridge.exposeInMainWorld('_electronAbrirExterno', (url) => {
    ipcRenderer.send('abrir-externo', url);
});

// NUEVO: Puente seguro y aislado para la Sala de Espera
contextBridge.exposeInMainWorld('_electronSalaEspera', {
    llamarPaciente: (datos) => ipcRenderer.send('llamar-paciente', datos)
});