// Inicializa Firebase Admin (FCM) una sola vez, igual que config/db.js centraliza
// la conexión a SQL Server. La credencial vive en secrets/firebase-service-account.json,
// nunca en la raíz del repo ni en variables .env (es un JSON completo, no un string corto).
// firebase-admin@14 usa la API modular (sin el namespace admin.* de versiones viejas).
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const path = require('path');

const rutaCredencial = path.join(__dirname, '..', 'secrets', 'firebase-service-account.json');

if (!getApps().length) {
    initializeApp({
        credential: cert(require(rutaCredencial))
    });
}

module.exports = { getApps };
