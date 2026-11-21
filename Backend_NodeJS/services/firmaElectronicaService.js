// =====================================================================
//  FIRMA ELECTRÓNICA DE DOCUMENTOS CLÍNICOS (PDF / PAdES)
//
//  Firma PDFs con un certificado .p12 de Ecuador (BCE, Security Data, ANF,
//  Uanataca, etc.). El PDF firmado se valida en FirmaEC y en Adobe Reader.
//
//  Dos orígenes de firma:
//   - CLINICA: el mismo .p12 que la clínica ya subió para facturar en el SRI
//              (tabla Facturacion_Certificados). Se reutiliza tal cual.
//   - MEDICO : el .p12 personal de cada médico (tabla Usuarios_Firma_Electronica).
//              Se guarda CIFRADO en la base (AES-256-GCM): archivo y contraseña.
//
//  Llave de cifrado: variable FIRMA_DOCUMENTOS_KEY (64 hex) o, si no existe,
//  secrets/firma-documentos.key (se crea sola la primera vez). Las actualizaciones
//  automáticas nunca tocan secrets/. Si la llave se pierde, los médicos deben
//  volver a subir su firma (los documentos ya firmados siguen siendo válidos).
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const { SignPdf } = require('@signpdf/signpdf');
const { P12Signer } = require('@signpdf/signer-p12');
const { plainAddPlaceholder } = require('@signpdf/placeholder-plain');
const { sql } = require('../config/db');

// ---------------------------------------------------------------------
// Llave de cifrado
// ---------------------------------------------------------------------
// La llave vive FUERA de la carpeta del programa: el instalador borra {app}\secrets al
// reinstalar y build.js copia secrets/ dentro del instalador (la llave nunca debe viajar).
//   Windows: C:\ProgramData\AmetraOS\firma-documentos.key
//   macOS:   /Library/Application Support/AmetraOS/firma-documentos.key
//   otro:    ~/.ametraos/firma-documentos.key
// Para varios servidores (SaaS) definir FIRMA_DOCUMENTOS_KEY igual en todos.
function carpetasLlave() {
    const externa = process.platform === 'win32'
        ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'AmetraOS')
        : process.platform === 'darwin'
            ? '/Library/Application Support/AmetraOS'
            : path.join(require('os').homedir(), '.ametraos');
    return [externa, path.join(process.cwd(), 'secrets')]; // la 2.ª solo como respaldo
}

let llaveCache = null;
function obtenerLlave() {
    if (llaveCache) return llaveCache;
    const env = (process.env.FIRMA_DOCUMENTOS_KEY || '').trim();
    if (/^[0-9a-fA-F]{64}$/.test(env)) {
        llaveCache = Buffer.from(env, 'hex');
        return llaveCache;
    }
    for (const dir of carpetasLlave()) {
        const archivo = path.join(dir, 'firma-documentos.key');
        try {
            if (fs.existsSync(archivo)) {
                const hex = fs.readFileSync(archivo, 'utf8').trim();
                if (/^[0-9a-fA-F]{64}$/.test(hex)) {
                    llaveCache = Buffer.from(hex, 'hex');
                    return llaveCache;
                }
            }
        } catch (_) { /* sin permiso de lectura: probar la siguiente */ }
    }
    const nueva = crypto.randomBytes(32);
    for (const dir of carpetasLlave()) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            const archivo = path.join(dir, 'firma-documentos.key');
            fs.writeFileSync(archivo, nueva.toString('hex'), { encoding: 'utf8', mode: 0o600 });
            console.log(`🔐 [Firma]: llave de cifrado de firmas creada en ${archivo}`);
            llaveCache = nueva;
            return llaveCache;
        } catch (_) { /* sin permiso de escritura: probar la siguiente */ }
    }
    throw new Error('No se pudo crear la llave de cifrado de firmas electrónicas.');
}

function cifrar(buffer) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', obtenerLlave(), iv);
    const datos = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), datos]); // iv(12) + tag(16) + datos
}

function descifrar(buffer) {
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const datos = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', obtenerLlave(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(datos), decipher.final()]);
}

// ---------------------------------------------------------------------
// Lectura y validación del .p12
// ---------------------------------------------------------------------
function atributo(entidad, nombres) {
    for (const n of nombres) {
        const a = entidad.getField(n) || entidad.attributes.find(x => x.name === n || x.shortName === n || x.type === n);
        if (a && a.value) return String(a.value);
    }
    return '';
}

/**
 * Abre el .p12 y devuelve los datos del titular. Lanza un Error con mensaje claro
 * si la contraseña es incorrecta, no hay clave privada o el certificado venció.
 */
function leerInfoP12(p12Buffer, password) {
    let p12;
    try {
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer.toString('binary')));
        p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    } catch (e) {
        const msg = String(e && e.message || e);
        if (/mac|password|invalid/i.test(msg)) throw new Error('La contraseña de la firma electrónica es incorrecta.');
        throw new Error('El archivo no es una firma electrónica .p12 válida (' + msg + ').');
    }

    const keyBags = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []);
    if (!keyBags.length || !keyBags[0].key) throw new Error('La firma electrónica no contiene la clave privada.');
    const clave = keyBags[0].key;

    const certBags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []);
    const certBag = certBags.find(b => b.cert && b.cert.publicKey && b.cert.publicKey.n &&
        clave.n.compareTo(b.cert.publicKey.n) === 0 && clave.e.compareTo(b.cert.publicKey.e) === 0);
    if (!certBag) throw new Error('La firma electrónica no contiene el certificado de su clave privada.');

    const cert = certBag.cert;
    const titular = atributo(cert.subject, ['commonName', 'CN']) || 'Titular desconocido';
    const emisor = atributo(cert.issuer, ['organizationName', 'O', 'commonName', 'CN']);
    // Muchos certificados de Ecuador traen la cédula/RUC en serialNumber del sujeto
    const identificacion = atributo(cert.subject, ['serialNumber', '2.5.4.5']).replace(/\D/g, '');
    const desde = cert.validity.notBefore;
    const vence = cert.validity.notAfter;

    return { titular, emisor, identificacion, desde, vence, vencida: vence < new Date() };
}

// ---------------------------------------------------------------------
// Dónde están las firmas
// ---------------------------------------------------------------------
async function obtenerFirmaClinica(pool, idClinica) {
    const r = await pool.request()
        .input('id_clinica', sql.Int, idClinica)
        .query(`SELECT TOP 1 Ruta_Archivo_P12, Password_P12_Encrypted
                FROM Facturacion_Certificados
                WHERE Activo = 1 AND ID_Clinica = @id_clinica
                ORDER BY Fecha_Carga DESC`);
    const c = r.recordset[0];
    if (!c || !c.Ruta_Archivo_P12) return null;
    const ruta = path.resolve(c.Ruta_Archivo_P12);
    if (!fs.existsSync(ruta)) return null;
    const p12 = fs.readFileSync(ruta);
    const password = Buffer.from(c.Password_P12_Encrypted || '', 'base64').toString('utf8');
    return { origen: 'CLINICA', p12, password };
}

async function obtenerFirmaMedico(pool, idUsuario) {
    const r = await pool.request()
        .input('id', sql.Int, idUsuario)
        .query(`SELECT TOP 1 P12_Cifrado, Password_Cifrado
                FROM Usuarios_Firma_Electronica
                WHERE ID_Usuario = @id AND Activo = 1
                ORDER BY Fecha_Carga DESC`);
    const f = r.recordset[0];
    if (!f) return null;
    try {
        return {
            origen: 'MEDICO',
            p12: descifrar(Buffer.from(f.P12_Cifrado)),
            password: descifrar(Buffer.from(f.Password_Cifrado)).toString('utf8')
        };
    } catch (e) {
        console.error('❌ [Firma]: no se pudo descifrar la firma del médico', idUsuario, '-', e.message);
        return null; // llave cambiada: el médico debe volver a subirla
    }
}

/** Estado de las dos firmas para mostrar en pantalla (sin exponer nada sensible). */
async function estadoFirmas(pool, idClinica, idMedico) {
    const resumen = async (obtener) => {
        try {
            const f = await obtener();
            if (!f) return { disponible: false };
            const info = leerInfoP12(f.p12, f.password);
            return {
                disponible: !info.vencida,
                titular: info.titular,
                emisor: info.emisor,
                vence: info.vence,
                vencida: info.vencida
            };
        } catch (e) {
            return { disponible: false, error: e.message };
        }
    };
    return {
        clinica: await resumen(() => obtenerFirmaClinica(pool, idClinica)),
        medico: idMedico ? await resumen(() => obtenerFirmaMedico(pool, idMedico)) : { disponible: false }
    };
}

async function guardarFirmaMedico(pool, idUsuario, p12Buffer, password) {
    const info = leerInfoP12(p12Buffer, password); // valida antes de guardar
    if (info.vencida) throw new Error(`La firma electrónica venció el ${info.vence.toLocaleDateString('es-EC')}.`);
    await pool.request()
        .input('id', sql.Int, idUsuario)
        .query(`UPDATE Usuarios_Firma_Electronica SET Activo = 0 WHERE ID_Usuario = @id AND Activo = 1`);
    await pool.request()
        .input('id', sql.Int, idUsuario)
        .input('p12', sql.VarBinary(sql.MAX), cifrar(p12Buffer))
        .input('pass', sql.VarBinary(sql.MAX), cifrar(Buffer.from(password, 'utf8')))
        .input('titular', sql.NVarChar(300), info.titular)
        .input('emisor', sql.NVarChar(300), info.emisor || null)
        .input('vence', sql.DateTime, info.vence)
        .query(`INSERT INTO Usuarios_Firma_Electronica
                    (ID_Usuario, P12_Cifrado, Password_Cifrado, Titular, Emisor, Fecha_Vencimiento, Fecha_Carga, Activo)
                VALUES (@id, @p12, @pass, @titular, @emisor, @vence, GETDATE(), 1)`);
    return info;
}

async function eliminarFirmaMedico(pool, idUsuario) {
    await pool.request()
        .input('id', sql.Int, idUsuario)
        .query(`UPDATE Usuarios_Firma_Electronica SET Activo = 0 WHERE ID_Usuario = @id AND Activo = 1`);
}

/**
 * Elige la firma según la preferencia: 'MEDICO' | 'CLINICA' | 'NINGUNA'.
 * Devuelve null si se pidió 'NINGUNA'; lanza Error si la elegida no está disponible.
 */
async function resolverFirma(pool, preferencia, idClinica, idMedico) {
    if (preferencia === 'NINGUNA') return null;
    const firma = preferencia === 'MEDICO'
        ? await obtenerFirmaMedico(pool, idMedico)
        : await obtenerFirmaClinica(pool, idClinica);
    if (!firma) {
        throw new Error(preferencia === 'MEDICO'
            ? 'El médico no tiene una firma electrónica cargada.'
            : 'La clínica no tiene una firma electrónica cargada (Facturación → Certificado).');
    }
    const info = leerInfoP12(firma.p12, firma.password);
    if (info.vencida) throw new Error(`La firma electrónica de ${info.titular} venció el ${info.vence.toLocaleDateString('es-EC')}.`);
    return { ...firma, info };
}

/** Firma un PDF (Buffer) con la firma resuelta. Devuelve el PDF firmado. */
async function firmarPdf(pdfBuffer, firma, { motivo, ubicacion, contacto } = {}) {
    const conPlaceholder = plainAddPlaceholder({
        pdfBuffer,
        reason: motivo || 'Documento clínico',
        contactInfo: contacto || '',
        name: firma.info.titular,
        location: ubicacion || 'Ecuador',
        signatureLength: 16384
    });
    return await new SignPdf().sign(conPlaceholder, new P12Signer(firma.p12, { passphrase: firma.password }));
}

module.exports = {
    leerInfoP12,
    estadoFirmas,
    guardarFirmaMedico,
    eliminarFirmaMedico,
    resolverFirma,
    firmarPdf
};
