const { getConnection, sql } = require('../config/db');
const PDFDocument = require('pdfkit');
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const path = require('path');
const fs = require('fs');
const forge = require('node-forge');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const nodemailer = require('nodemailer');
const readline = require('readline');
const execPromise = util.promisify(exec);

// ===============================================
// CATÁLOGO SRI - FORMAS DE PAGO (Tabla 24)
// ===============================================
const SRI_FORMAS_PAGO = {
    '01': 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO',
    '15': 'COMPENSACIÓN DE DEUDAS',
    '16': 'TARJETA DE DÉBITO',
    '17': 'DINERO ELECTRÓNICO',
    '18': 'TARJETA PREPAGO',
    '19': 'TARJETA DE CRÉDITO',
    '20': 'OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO',
    '21': 'ENDOSO DE TÍTULOS'
};

// Mapea el Metodo_Pago libre de la tabla Pagos a un código SRI (default cuando el front no manda forma_pago)
function metodoPagoToSRI(metodo) {
    const s = (metodo || '').toString().toLowerCase();
    if (s.includes('efectivo')) return '01';
    if (s.includes('transfer') || s.includes('deposit') || s.includes('banc')) return '20';
    if (s.includes('crédito') || s.includes('credito')) return '19';
    if (s.includes('débito') || s.includes('debito')) return '16';
    if (s.includes('electr')) return '17';
    if (s.includes('prepag')) return '18';
    if (s.includes('tarjeta')) return '19';
    return '01';
}

// Formatea fecha/hora EXACTAMENTE como está en la BD (sin conversión de zona horaria).
// El driver mssql devuelve datetime en UTC, así que leemos sus componentes UTC.
function formatFechaHoraSRI(valor) {
    if (!valor) return '';
    const dt = new Date(valor);
    if (isNaN(dt.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`;
}

const facturacionController = {

    // --- GESTIÓN DE CERTIFICADOS (.P12) ---
    subirCertificado: async (req, res) => {
        try {
            const { id_clinica, id_usuario, nombre_certificado, password_p12 } = req.body;
            const p12File = req.file;

            if (!p12File) {
                return res.status(400).json({ status: "Error", mensaje: "Archivo .p12 requerido" });
            }

            const pool = await getConnection();
            const passwordHash = Buffer.from(password_p12).toString('base64'); 

            const fechaVencimiento = new Date();
            fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

            await pool.request()
                .input('id_clinica', sql.Int, id_clinica)
                .input('id_usuario', sql.Int, id_usuario || null)
                .input('nombre', sql.NVarChar, nombre_certificado)
                .input('ruta', sql.NVarChar, p12File.path)
                .input('pass', sql.NVarChar, passwordHash)
                .input('vencimiento', sql.DateTime, fechaVencimiento)
                .query(`
                    INSERT INTO Facturacion_Certificados 
                    (ID_Clinica, ID_Usuario, Nombre_Certificado, Ruta_Archivo_P12, Password_P12_Encrypted, Fecha_Vencimiento, Fecha_Carga, Activo)
                    VALUES 
                    (@id_clinica, @id_usuario, @nombre, @ruta, @pass, @vencimiento, GETDATE(), 1)
                `);

            res.json({ status: "Success", mensaje: "Certificado vinculado correctamente" });
        } catch (err) {
            res.status(500).json({ status: "Error", error: err.message });
        }
    },

    listarCertificados: async (req, res) => {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_clinica', sql.Int, req.params.id_clinica)
                .query(`
                    SELECT TOP 1 ID_Certificado, Nombre_Certificado, Fecha_Vencimiento, Activo, Fecha_Carga
                    FROM Facturacion_Certificados 
                    WHERE ID_Clinica = @id_clinica AND Activo = 1
                    ORDER BY Fecha_Carga DESC
                `);
            res.json({ status: "Success", data: result.recordset });
        } catch (err) {
            res.status(500).json({ status: "Error", error: err.message });
        }
    },

    // ===============================================
    // BÚSQUEDA EN PADRÓN NACIONAL (CSV) PARA FACTURA MANUAL
    // Independiente del flujo clínico: solo lee BASE_MAESTRA_NACIONAL.csv
    // ===============================================
    buscarCliente: async (req, res) => {
        const { documento } = req.params;
        try {
            const doc = (documento || '').trim();
            const rutaMaestra = path.join(__dirname, '..', 'BASE_MAESTRA_NACIONAL.csv');

            if (!fs.existsSync(rutaMaestra)) {
                return res.json({ success: false, message: 'Archivo maestro (BASE_MAESTRA_NACIONAL.csv) no disponible.' });
            }

            const stream = fs.createReadStream(rutaMaestra);
            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
            let clienteCSV = null;

            // NORMALIZACIÓN DE LA LLAVE DE BÚSQUEDA
            // Si ingresan 13 dígitos y termina en 001 (RUC persona natural),
            // buscamos por los primeros 10 dígitos, que es como se guardó la llave.
            let idParaBuscar = doc;
            if (doc.length === 13 && doc.endsWith('001')) {
                idParaBuscar = doc.substring(0, 10);
            }
            const llaveBusqueda = idParaBuscar + ',';

            for await (const linea of rl) {
                if (linea.startsWith(llaveBusqueda)) {
                    // Separamos respetando comillas
                    const campos = linea.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/(^"|"$)/g, '').trim());
                    // Mapeo: [0]ID  [1]RUC  [2]RAZON_SOCIAL  [3]ESTADO  [4]PROVINCIA  [5]CANTON  [6]PARROQUIA
                    clienteCSV = {
                        Documento: doc, // Devolvemos exactamente lo digitado
                        NombreFull: campos[2] || '',
                        Procedencia: `${campos[5] || ''} - ${campos[4] || ''}`.replace(/^- | -$/, ''),
                        Telefono: '',
                        Correo: '',
                        Direccion: ''
                    };
                    break; // Cortamos el bucle para máxima velocidad
                }
            }
            rl.close();

            if (clienteCSV) {
                return res.json({ success: true, source: 'padron', cliente: clienteCSV });
            }
            return res.json({ success: false, message: 'Cliente no encontrado en el padrón nacional.' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    },

    // ===============================================
    // PAGO ORIGEN PARA FACTURA MANUAL
    // Crea un registro real en Pagos para respetar la FK FK_Factura_Pago.
    // Representa el ingreso de la venta facturada manualmente.
    // ===============================================
    crearPagoManual: async (req, res) => {
        try {
            const { id_clinica, id_usuario, monto, concepto, metodo_pago } = req.body;
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_clinica', sql.Int, id_clinica || null)
                .input('id_usuario', sql.Int, id_usuario || null)
                .input('monto', sql.Decimal(18, 2), monto || 0)
                .input('concepto', sql.NVarChar, (concepto || 'FACTURA MANUAL').substring(0, 200))
                .input('metodo', sql.NVarChar, metodo_pago || 'FACTURA MANUAL')
                .query(`
                    INSERT INTO Pagos (ID_Paciente, ID_Clinica, Monto, Concepto, Metodo_Pago, Fecha_Pago, ID_Usuario)
                    OUTPUT INSERTED.ID_Pago
                    VALUES (NULL, @id_clinica, @monto, @concepto, @metodo, GETDATE(), @id_usuario)
                `);
            res.json({ status: "Success", id_pago: result.recordset[0].ID_Pago });
        } catch (err) {
            console.error("❌ ERROR EN PAGO MANUAL:", err.message);
            res.status(500).json({ status: "Error", mensaje: err.message });
        }
    },

    generarRegistroFactura: async (req, res) => {
        try {
            const { factura_data, receptor_data, totales, id_certificado } = req.body;
            const pool = await getConnection();
            
            const idPago = factura_data.id_pago || factura_data.id_referencia;

            // 1. OBTENER RUTA P12 (Consulta limpia)
            const certRes = await pool.request()
                .input('id_cert', sql.Int, id_certificado)
                .query(`SELECT Ruta_Archivo_P12 FROM Facturacion_Certificados WHERE ID_Certificado = @id_cert`);

            const rutaP12 = certRes.recordset[0]?.Ruta_Archivo_P12;

            // 2. LÓGICA DE SECUENCIAL (MANUAL VS AUTOMÁTICO) Y AMBIENTE
            let secuencial;
            const secuencialForzado = factura_data.secuencial_manual;
            
            if (secuencialForzado && secuencialForzado.trim() !== '') {
                secuencial = String(secuencialForzado).padStart(9, '0');
            } else {
                const seqRes = await pool.request()
                    .input('id_clinica', sql.Int, factura_data.id_clinica)
                    .query(`
                        SELECT MAX(CAST(Secuencial AS INT)) as Ultimo_Secuencial 
                        FROM Facturacion_Documentos 
                        WHERE ID_Clinica = @id_clinica 
                        AND Tipo_Documento = '01'
                        AND Establecimiento = '001'
                        AND Punto_Emision = '001'
                    `);

                const ultimoDocBD = seqRes.recordset[0]?.Ultimo_Secuencial;
                let ultimoDoc = parseInt(ultimoDocBD);

                if (isNaN(ultimoDoc) || ultimoDoc < 2000) {
                    ultimoDoc = 2000;
                }
                secuencial = String(ultimoDoc + 1).padStart(9, '0');
            }

            // 3. VARIABLES PARA LA CLAVE
            const rucLimpio = factura_data.ruc_clinica ? factura_data.ruc_clinica.trim() : "";
            const ambienteSRI = factura_data.ambiente_sri || '2'; 

            console.log(`[CASRODSOFT] Ambiente: ${ambienteSRI} | Secuencial Final: ${secuencial}`);

            // 4. GENERACIÓN DE CLAVE DE ACCESO
            const fechaActual = new Date();
            const fAcceso = `${String(fechaActual.getDate()).padStart(2, '0')}${String(fechaActual.getMonth() + 1).padStart(2, '0')}${fechaActual.getFullYear()}`;
            const serie = "001001"; 
            const codNum = "12345678"; 
            const tipoEmis = "1";

            const c48 = `${fAcceso}01${rucLimpio}${ambienteSRI}${serie}${secuencial}${codNum}${tipoEmis}`;
            
            let suma = 0, factor = 2;
            for (let i = c48.length - 1; i >= 0; i--) {
                suma += parseInt(c48.charAt(i)) * factor;
                factor = factor === 7 ? 2 : factor + 1;
            }
            let dv = 11 - (suma % 11);
            if (dv === 11) dv = 0; else if (dv === 10) dv = 1;
            const claveFinal = c48 + dv;

            // 5. UPSERT (INSERT O UPDATE) EN FACTURACION_DOCUMENTOS
            const baseImponibleIva = totales.iva > 0 ? totales.subtotal : 0;

            const result = await pool.request()
                .input('id_pago', sql.Int, idPago)
                .input('id_clinica', sql.Int, factura_data.id_clinica)
                .input('id_usuario', sql.Int, factura_data.id_usuario)
                .input('receptor_nom', sql.NVarChar, receptor_data.nombre)
                .input('receptor_id', sql.VarChar, receptor_data.cedula)
                .input('receptor_email', sql.VarChar, receptor_data.email)
                .input('receptor_dir', sql.NVarChar, receptor_data.direccion || 'S/N')
                .input('subtotal', sql.Decimal(18,2), totales.subtotal)
                .input('base_iva', sql.Decimal(18,2), baseImponibleIva)
                .input('iva', sql.Decimal(18,2), totales.iva)
                .input('total', sql.Decimal(18,2), totales.total)
                .input('secuencial', sql.VarChar, secuencial)
                .input('clave', sql.VarChar, claveFinal)
                .input('ruta', sql.NVarChar, rutaP12)
                .input('val_ambiente', sql.VarChar, ambienteSRI)
                .query(`
                    MERGE Facturacion_Documentos AS target
                    USING (SELECT @id_pago AS ID_Pago_Origen) AS source
                    ON (target.ID_Pago_Origen = source.ID_Pago_Origen)
                    WHEN MATCHED AND target.Estado_SRI = 'PENDIENTE' THEN
                        UPDATE SET 
                            Receptor_Nombre_RS = @receptor_nom,
                            Receptor_Identificacion = @receptor_id,
                            Receptor_Email = @receptor_email,
                            Receptor_Direccion = @receptor_dir,
                            Subtotal_Sin_Impuestos = @subtotal,
                            Base_Imponible_Iva = @base_iva,
                            Valor_Iva = @iva,
                            Importe_Total = @total,
                            Secuencial = @secuencial,
                            Clave_Acceso = @clave,
                            Ruta_P12_Utilizado = @ruta,
                            Ambiente = @val_ambiente,
                            Estado_SRI = 'LISTO_PARA_FIRMA',
                            Fecha_Emision = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (ID_Pago_Origen, ID_Clinica, ID_Usuario_Emisor, Receptor_Nombre_RS, 
                                Receptor_Identificacion, Receptor_Email, Receptor_Direccion,
                                Subtotal_Sin_Impuestos, Base_Imponible_Iva, Valor_Iva, Importe_Total, 
                                Estado_SRI, Fecha_Emision, Tipo_Documento, Secuencial, Clave_Acceso, 
                                Ruta_P12_Utilizado, Ambiente, Establecimiento, Punto_Emision)
                        VALUES (@id_pago, @id_clinica, @id_usuario, @receptor_nom, 
                                @receptor_id, @receptor_email, @receptor_dir,
                                @subtotal, @base_iva, @iva, @total, 
                                'LISTO_PARA_FIRMA', GETDATE(), '01', @secuencial, @clave, 
                                @ruta, @val_ambiente, '001', '001')
                    OUTPUT INSERTED.ID_Facturacion;
                `);

            res.json({ 
                status: "Success", 
                id_facturacion: result.recordset[0].ID_Facturacion,
                secuencial,
                claveAcceso: claveFinal
            });

        } catch (err) {
            console.error("❌ ERROR EN EMISIÓN UNIFICADA:", err.message);
            res.status(500).json({ status: "Error", mensaje: err.message });
        }
    },

    // --- HISTORIAL DINÁMICO ---
    listarHistorial: async (req, res) => {
        try {
            const { id_clinica, tipo } = req.query;
            const pool = await getConnection();
            let query = "";

            if (tipo === "00") {
                query = `
                    SELECT 
                        p.ID_Pago AS ID_Facturacion, p.ID_Pago, p.Fecha_Pago AS Fecha_Emision, 
                        (pa.Nombres + ' ' + pa.Apellidos) AS Receptor_Nombre_RS, pa.DNI AS Cedula,
                        p.Monto AS Importe_Total, p.Metodo_Pago, p.Concepto,
                        c.Nombre_Clinica, c.RUC, c.Logo_Ruta, 'PAGO_INTERNO' AS Estado_SRI,
                        'REC' AS Establecimiento, '001' AS Punto_Emision,
                        CAST(p.ID_Pago AS VARCHAR) AS Secuencial,
                        CASE WHEN fd.ID_Facturacion IS NOT NULL THEN 1 ELSE 0 END AS YaFacturado
                    FROM Pagos p
                    INNER JOIN Pacientes pa ON p.ID_Paciente = pa.ID_Paciente
                    INNER JOIN Clinicas c ON p.ID_Clinica = c.ID_Clinica
                    LEFT JOIN Facturacion_Documentos fd ON p.ID_Pago = fd.ID_Pago_Origen
                    WHERE p.ID_Clinica = @id_clinica
                    ORDER BY p.Fecha_Pago DESC
                `;
            } else {
                query = `
                    SELECT TOP 100 
                        f.ID_Facturacion, f.ID_Pago_Origen AS ID_Pago, f.Fecha_Emision, 
                        f.Receptor_Nombre_RS, f.Receptor_Identificacion, f.Receptor_Email,
                        f.Importe_Total, f.Estado_SRI, f.Ruta_PDF_RIDE, f.Establecimiento, 
                        f.Punto_Emision, f.Secuencial, c.Nombre_Clinica, c.RUC, c.Logo_Ruta
                    FROM Facturacion_Documentos f
                    INNER JOIN Clinicas c ON f.ID_Clinica = c.ID_Clinica
                    WHERE f.ID_Clinica = @id_clinica AND f.Tipo_Documento = @tipo
                    ORDER BY f.Fecha_Emision DESC
                `;
            }

            const result = await pool.request()
                .input('id_clinica', sql.Int, id_clinica)
                .input('tipo', sql.VarChar, tipo)
                .query(query);

            res.json({ status: "Success", data: result.recordset });
        } catch (err) {
            res.status(500).json({ status: "Error", error: err.message });
        }
    },

    obtenerUltimoPago: async (req, res) => {
        try {
            const { id_clinica } = req.params;
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_clinica', sql.Int, id_clinica)
                .query(`SELECT TOP 1 ID_Pago FROM Pagos WHERE ID_Clinica = @id_clinica ORDER BY Fecha_Pago DESC`);
            
            if (result.recordset.length > 0) {
                res.json({ status: "Success", id_pago: result.recordset[0].ID_Pago });
            } else {
                res.status(404).json({ status: "Error", mensaje: "No se encontraron pagos." });
            }
        } catch (err) {
            res.status(500).json({ status: "Error", error: err.message });
        }
    },

    autorizarComprobanteSRI: async (req, res) => {
        try {
            const { id_facturacion, items, forma_pago, info_adicional } = req.body;
            const pool = await getConnection();

            // 1. OBTENER DATOS (TOMA EL AMBIENTE DINÁMICO DE LA BD)
            const query = await pool.request()
                .input('id', sql.Int, id_facturacion)
                .query(`
                    SELECT f.*, c.RUC AS Clinica_RUC, c.Nombre_Clinica AS Clinica_RazonSocial, c.Direccion AS Clinica_Direccion,c.Contribuyente_Especial,c.Obligado_Contabilidad,c.Regimen_Rimpe,
                           p.Metodo_Pago AS Pago_Metodo
                    FROM Facturacion_Documentos f
                    INNER JOIN Clinicas c ON f.ID_Clinica = c.ID_Clinica
                    LEFT JOIN Pagos p ON f.ID_Pago_Origen = p.ID_Pago
                    WHERE f.ID_Facturacion = @id
                `);

            if (query.recordset.length === 0) {
                return res.status(404).json({ status: "Error", mensaje: "Factura no encontrada." });
            }

            const d = query.recordset[0];

            // 2. OBTENER EL CERTIFICADO DIGITAL ACTIVO
            const certQuery = await pool.request()
                .query(`SELECT TOP 1 Ruta_Archivo_P12, Password_P12_Encrypted FROM Facturacion_Certificados WHERE Activo = 1`);

            if (certQuery.recordset.length === 0) {
                return res.status(400).json({ status: "Error", mensaje: "No hay certificado digital activo." });
            }

            const cert = certQuery.recordset[0];

            // ==========================================
            // GENERACIÓN DE CLAVE DE ACCESO Y XML
            // ==========================================
            const fechaE = d.Fecha_Emision ? new Date(d.Fecha_Emision) : new Date();
            const dd = String(fechaE.getDate()).padStart(2, '0');
            const mm = String(fechaE.getMonth() + 1).padStart(2, '0');
            const yyyy = fechaE.getFullYear();
            const fechaK = `${dd}${mm}${yyyy}`;
            const fechaFormateada = `${dd}/${mm}/${yyyy}`;

            const rucK = (d.Clinica_RUC || "").trim();

            // --- AMBIENTE DINÁMICO ---
            const ambK = d.Ambiente ? d.Ambiente.toString() : '2'; 

            let secuencialFinal = d.Secuencial && d.Secuencial !== '---' ? d.Secuencial : "1";
            secuencialFinal = secuencialFinal.toString().padStart(9, '0');

            const estab = "001", ptoEmi = "001", codDoc = "01", tipoEmision = "1", codigoNumerico = "12345678";

            const claveBase = `${fechaK}${codDoc}${rucK}${ambK}${estab}${ptoEmi}${secuencialFinal}${codigoNumerico}${tipoEmision}`;

            if (claveBase.length !== 48) {
                console.error("❌ ERROR CLAVE BASE:", claveBase, "LONG:", claveBase.length);
                return res.status(500).json({ status: "Error", mensaje: "Clave de acceso mal formada (no tiene 48 dígitos)" });
            }

            let suma = 0, factor = 2;
            for (let i = claveBase.length - 1; i >= 0; i--) {
                suma += parseInt(claveBase[i]) * factor;
                factor = factor === 7 ? 2 : factor + 1;
            }
            let dv = 11 - (suma % 11);
            if (dv === 11) dv = 0; if (dv === 10) dv = 1;

            const claveAccesoFinal = claveBase + dv;

            const baseImp = parseFloat(d.Subtotal_Sin_Impuestos || 0).toFixed(2);
            const valorIva = parseFloat(d.Valor_Iva || 0).toFixed(2);
            const totalFinal = parseFloat(d.Importe_Total || 0).toFixed(2);
            const tieneIVA = parseFloat(valorIva) > 0;

            const identificacion = (d.Receptor_Identificacion || "").trim();
            const tipoIdReceptor = identificacion.length === 13 ? '04' : (identificacion.length === 10 ? '05' : '06');

            // --- DETALLES DINÁMICOS: ítems manuales o consulta por defecto (automático) ---
            const codPorc = tieneIVA ? '4' : '0';
            const tarifaIva = tieneIVA ? '15.00' : '0.00';
            // Forma de pago: la elegida en el front; si no llega, se deduce del Metodo_Pago del pago origen
            let formaPagoSRI = (forma_pago && String(forma_pago).trim()) ? String(forma_pago).trim() : null;
            if (!formaPagoSRI) formaPagoSRI = metodoPagoToSRI(d.Pago_Metodo);
            const listaItems = (Array.isArray(items) && items.length > 0)
                ? items
                : [{ codigo: 'SERV-01', descripcion: 'CONSULTA ODONTOLOGICA', cantidad: 1, precioUnitario: parseFloat(baseImp), descuento: 0 }];

            let detallesXml = '';
            listaItems.forEach(it => {
                const cant = parseFloat(it.cantidad || 1);
                const pu   = parseFloat(it.precioUnitario || 0);
                const dsc  = parseFloat(it.descuento || 0);
                const totLinea = (cant * pu - dsc);
                const ivaLinea = tieneIVA ? (totLinea * 0.15) : 0;
                detallesXml += `
                    <detalle>
                        <codigoPrincipal>${it.codigo || 'SERV-01'}</codigoPrincipal>
                        <descripcion>${(it.descripcion || 'SERVICIO').toUpperCase()}</descripcion>
                        <cantidad>${cant.toFixed(2)}</cantidad>
                        <precioUnitario>${pu.toFixed(2)}</precioUnitario>
                        <descuento>${dsc.toFixed(2)}</descuento>
                        <precioTotalSinImpuesto>${totLinea.toFixed(2)}</precioTotalSinImpuesto>
                        <impuestos>
                            <impuesto>
                                <codigo>2</codigo>
                                <codigoPorcentaje>${codPorc}</codigoPorcentaje>
                                <tarifa>${tarifaIva}</tarifa>
                                <baseImponible>${totLinea.toFixed(2)}</baseImponible>
                                <valor>${ivaLinea.toFixed(2)}</valor>
                            </impuesto>
                        </impuestos>
                    </detalle>`;
            });

            const xmlBase = `<?xml version="1.0" encoding="UTF-8"?>
            <factura id="comprobante" version="1.1.0">
                <infoTributaria>
                    <ambiente>${ambK}</ambiente>
                    <tipoEmision>1</tipoEmision>
                    <razonSocial>${(d.Clinica_RazonSocial || "").toUpperCase()}</razonSocial>
                    <ruc>${rucK}</ruc>
                    <claveAcceso>${claveAccesoFinal}</claveAcceso>
                    <codDoc>${codDoc}</codDoc>
                    <estab>${estab}</estab>
                    <ptoEmi>${ptoEmi}</ptoEmi>
                    <secuencial>${secuencialFinal}</secuencial>
                    <dirMatriz>${(d.Clinica_Direccion || "").toUpperCase()}</dirMatriz>
                    ${d.Regimen_Rimpe ? `<contribuyenteRimpe>${d.Regimen_Rimpe}</contribuyenteRimpe>` : ''}
                </infoTributaria>
                <infoFactura>
                    <fechaEmision>${fechaFormateada}</fechaEmision>
                    <dirEstablecimiento>${(d.Clinica_Direccion || "").toUpperCase()}</dirEstablecimiento>
                    ${d.Contribuyente_Especial ? `<contribuyenteEspecial>${d.Contribuyente_Especial}</contribuyenteEspecial>` : ''}
                    <obligadoContabilidad>${d.Obligado_Contabilidad || 'NO'}</obligadoContabilidad>
                    <tipoIdentificacionComprador>${tipoIdReceptor}</tipoIdentificacionComprador>
                    <razonSocialComprador>${(d.Receptor_Nombre_RS || "CONSUMIDOR FINAL").toUpperCase()}</razonSocialComprador>
                    <identificacionComprador>${identificacion}</identificacionComprador>
                    <totalSinImpuestos>${baseImp}</totalSinImpuestos>
                    <totalDescuento>0.00</totalDescuento>
                    <totalConImpuestos>
                        <totalImpuesto>
                            <codigo>2</codigo>
                            <codigoPorcentaje>${tieneIVA ? '4' : '0'}</codigoPorcentaje>
                            <baseImponible>${baseImp}</baseImponible>
                            <valor>${valorIva}</valor>
                        </totalImpuesto>
                    </totalConImpuestos>
                    <propina>0.00</propina>
                    <importeTotal>${totalFinal}</importeTotal>
                    <moneda>DOLAR</moneda>
                    <pagos>
                        <pago>
                            <formaPago>${formaPagoSRI}</formaPago>
                            <total>${totalFinal}</total>
                        </pago>
                    </pagos>
                </infoFactura>
                <detalles>${detallesXml}
                </detalles>
                ${d.Regimen_Rimpe ? `
                <infoAdicional>
                    <campoAdicional nombre="Régimen">CONTRIBUYENTE RÉGIMEN RIMPE</campoAdicional>
                </infoAdicional>` : ''}
            </factura>`;

            // ==========================================
            // CONFIGURACIÓN DE RUTAS Y FIRMA
            // ==========================================
            const dirGenerados = path.join(process.cwd(), 'uploads', 'facturacion', 'xml_generados');
            const dirFirmados = path.join(process.cwd(), 'uploads', 'facturacion', 'xml_firmados');

            if (!fs.existsSync(dirGenerados)) fs.mkdirSync(dirGenerados, { recursive: true });
            if (!fs.existsSync(dirFirmados)) fs.mkdirSync(dirFirmados, { recursive: true });

            const rutaXmlPlano = path.join(dirGenerados, `${claveAccesoFinal}.xml`);
            const nombreArchivoFirmado = `${claveAccesoFinal}_firmado.xml`;
            const rutaXmlFirmado = path.join(dirFirmados, nombreArchivoFirmado);

            fs.writeFileSync(rutaXmlPlano, xmlBase, 'utf8');

            const esWin = process.platform === 'win32';
            const javaBinBundled = path.join(process.cwd(), 'services', 'firmadormedico',
                esWin ? 'jdk-11.0.22.7-hotspot' : 'jdk-11.0.22.7-hotspot-mac',
                'bin', esWin ? 'java.exe' : 'java');
            // En Windows usa JDK bundled. En Mac usa JDK bundled si existe, si no el del sistema.
            const javaBin = fs.existsSync(javaBinBundled) ? javaBinBundled : (!esWin ? 'java' : null);
            const jarPath = path.join(process.cwd(), 'services', 'firmadormedico', 'sri.jar');

            const p12Path = path.resolve(cert.Ruta_Archivo_P12);
            const p12Pass = Buffer.from(cert.Password_P12_Encrypted, 'base64').toString('utf8');

            if (!javaBin) {
                throw new Error("Motor Java no encontrado. En Mac ejecute: brew install openjdk@11");
            }

            try {
                const comando = `"${javaBin}" -jar "${jarPath}" "${p12Path}" "${p12Pass}" "${rutaXmlPlano}" "${dirFirmados}" "${nombreArchivoFirmado}"`;
                await execPromise(comando);
            } catch (errorJar) {
                console.error("❌ FALLO AL FIRMAR:", errorJar.stderr || errorJar.message);
                return res.status(500).json({ status: "Error", mensaje: "Error en el proceso de firma digital." });
            }

            // ==========================================
            // ENVÍO AL SRI (WS SOAP)
            // ==========================================
            if (!fs.existsSync(rutaXmlFirmado)) {
                return res.status(500).json({ status: "Error", mensaje: "No se generó el archivo firmado." });
            }

            const xmlFirmadoBase64 = fs.readFileSync(rutaXmlFirmado, 'base64');
            const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ecua="http://ec.gob.sri.ws.recepcion"><soapenv:Body><ecua:validarComprobante><xml>${xmlFirmadoBase64}</xml></ecua:validarComprobante></soapenv:Body></soapenv:Envelope>`;

            // URLs del SRI (Dinámicas según ambiente)
            const urlRecepcion = ambK === '2' 
                ? 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline'
                : 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline';
                
            const urlAutorizacion = ambK === '2'
                ? 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline'
                : 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline';

            try {
                const respSRI = await axios.post(urlRecepcion, soapEnvelope, { 
                    headers: { 'Content-Type': 'text/xml;charset=UTF-8' } 
                });

                const estadoMatch = respSRI.data.match(/<estado>(.*?)<\/estado>/);
                let estadoEnvio = estadoMatch ? estadoMatch[1] : "ERROR_DESCONOCIDO";

                console.log("✅ ESTADO RECEPCIÓN SRI:", estadoEnvio);

                await pool.request()
                    .input('id', sql.Int, id_facturacion)
                    .input('ruta', sql.NVarChar, rutaXmlFirmado)
                    .input('estado', sql.NVarChar, estadoEnvio)
                    .input('clave', sql.VarChar, claveAccesoFinal)
                    .query(`
                        UPDATE Facturacion_Documentos 
                        SET Ruta_XML_Generado = @ruta, 
                            Estado_SRI = @estado, 
                            Clave_Acceso = @clave 
                        WHERE ID_Facturacion = @id
                    `);

                if (estadoEnvio === 'RECIBIDA') {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const soapAutorizacion = `
                        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
                           <soapenv:Body>
                              <ec:autorizacionComprobante>
                                 <claveAccesoComprobante>${claveAccesoFinal}</claveAccesoComprobante>
                              </ec:autorizacionComprobante>
                           </soapenv:Body>
                        </soapenv:Envelope>`;

                    const respAuto = await axios.post(urlAutorizacion, soapAutorizacion, {
                        headers: { 'Content-Type': 'text/xml;charset=UTF-8' }
                    });

                    if (respAuto.data.includes('AUTORIZADO')) {
                        estadoEnvio = 'AUTORIZADO';
                        
                        await pool.request()
                            .input('id', sql.Int, id_facturacion)
                            .input('estado', sql.NVarChar, 'AUTORIZADO')
                            .query(`UPDATE Facturacion_Documentos SET Estado_SRI = @estado, Fecha_Autorizacion = GETDATE() WHERE ID_Facturacion = @id`);

                        try {
                            const itemsPDF = (Array.isArray(items) && items.length > 0) ? items : null;
                            const extraPDF = {
                                forma_pago: formaPagoSRI,
                                telefono: info_adicional?.telefono,
                                email: info_adicional?.email
                            };
                            const rutaGenerada = await facturacionController.generarPDFRIDE(id_facturacion, itemsPDF, extraPDF);
                            console.log(`✅ RIDE generado con éxito: ${rutaGenerada}`);
                        } catch (pdfError) {
                            console.error("⚠️ Error al generar el PDF RIDE:", pdfError.message);
                        }
                        
                        return res.json({ 
                            status: "Success", 
                            mensaje: "Comprobante Autorizado y PDF Generado", 
                            estado: "AUTORIZADO", 
                            clave: claveAccesoFinal 
                        });
                    }
                }

                return res.json({ status: "Success", estado: estadoEnvio, clave: claveAccesoFinal });

            } catch (err) {
                console.error("❌ ERROR INTERNO SRI:", err.message);
                if (!res.headersSent) {
                    return res.status(500).json({ status: "Error", mensaje: err.message });
                }
            }

        } catch (errorGlobal) {
            console.error("❌ ERROR GLOBAL:", errorGlobal);
            if (!res.headersSent) {
                return res.status(500).json({ status: "Error", mensaje: errorGlobal.message });
            }
        }
    },

    // --- NUEVO MÉTODO: ENVÍO FÍSICO POR NODEMAILER (Ajustado a MAIL_USER y MAIL_PASS) ---
    enviarFacturaCorreoDirecto: async (req, res) => {
        try {
            const { clave_acceso, email_destino } = req.body;
            const pool = await getConnection();

            // 1. Obtener datos de la BD por Clave de Acceso
            const query = await pool.request()
                .input('clave', sql.VarChar, clave_acceso)
                .query(`
                    SELECT f.Ruta_PDF_RIDE, f.Clave_Acceso, c.Nombre_Clinica 
                    FROM Facturacion_Documentos f
                    INNER JOIN Clinicas c ON f.ID_Clinica = c.ID_Clinica
                    WHERE f.Clave_Acceso = @clave
                `);

            if (query.recordset.length === 0) {
                return res.status(404).json({ status: "Error", mensaje: "Comprobante no encontrado en BD." });
            }

            const doc = query.recordset[0];
            
            // 2. Construir rutas absolutas locales (Disco duro)
            const pdfPath = path.join(process.cwd(), doc.Ruta_PDF_RIDE);
            const xmlPath = path.join(process.cwd(), 'uploads', 'facturacion', 'xml_firmados', `${doc.Clave_Acceso}_firmado.xml`);

            if (!fs.existsSync(pdfPath) || !fs.existsSync(xmlPath)) {
                return res.status(404).json({ status: "Error", mensaje: "Los archivos físicos (XML/PDF) no existen en el servidor." });
            }

            // 3. Configurar transporte SMTP con servicio Gmail y variables de entorno simples
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASS
                }
            });

            // 4. Enviar correo con adjuntos físicos
            await transporter.sendMail({
                from: `"${doc.Nombre_Clinica}" <${process.env.MAIL_USER}>`,
                to: email_destino,
                subject: `Comprobante Electrónico Autorizado - ${doc.Clave_Acceso}`,
                text: `Estimado/a cliente,\n\nAdjuntamos su comprobante electrónico (Factura en PDF y XML) debidamente autorizado por el SRI.\n\nGracias por su confianza.\n${doc.Nombre_Clinica}`,
                attachments: [
                    { filename: `${doc.Clave_Acceso}.pdf`, path: pdfPath },
                    { filename: `${doc.Clave_Acceso}.xml`, path: xmlPath }
                ]
            });

            res.json({ status: "Success", mensaje: "Documentos enviados con éxito." });
        } catch (err) {
            console.error("Error Nodemailer:", err);
            res.status(500).json({ status: "Error", mensaje: err.message });
        }
    },

    generarPDFRIDE: async (id_facturacion, itemsOverride = null, extra = null) => {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id_facturacion)
                .query(`
                    SELECT f.*,
                           c.Nombre_Clinica, c.RUC AS Ruc_Clinica, c.Direccion AS Dir_Clinica,
                           c.Telefono AS Tel_Clinica, c.Logo_Ruta,
                           c.Contribuyente_Especial, c.Obligado_Contabilidad, c.Regimen_Rimpe
                    FROM Facturacion_Documentos f
                    INNER JOIN Clinicas c ON f.ID_Clinica = c.ID_Clinica
                    WHERE f.ID_Facturacion = @id
                `);

            const factura = result.recordset[0];
            if (!factura) throw new Error("Factura no encontrada.");

            const nombreArchivo = `${factura.Clave_Acceso}.pdf`;
            const rutaAbsoluta = path.join(process.cwd(), 'uploads', 'facturacion', 'pdf', nombreArchivo);
            const rutaRelativa = `uploads/facturacion/pdf/${nombreArchivo}`;
            const dirPdf = path.dirname(rutaAbsoluta);
            if (!fs.existsSync(dirPdf)) fs.mkdirSync(dirPdf, { recursive: true });

            const doc = new PDFDocument({ size: 'A4', margin: 30 });
            const stream = fs.createWriteStream(rutaAbsoluta);
            doc.pipe(stream);

            const azulSRI = '#2c3e50';
            const L = 40, R = 560, W = R - L; // ancho útil 520

            // --- Totales tomados de la BD (columnas existentes) ---
            const subtotalSinImp = Number(factura.Subtotal_Sin_Impuestos || 0);
            const baseIva   = Number(factura.Base_Imponible_Iva || 0);
            const valorIva  = Number(factura.Valor_Iva || 0);
            const subtotal0 = Math.max(subtotalSinImp - baseIva, 0);
            const descuento = Number(factura.Total_Descuento || 0);
            const propina   = Number(factura.Propina || 0);
            const total     = Number(factura.Importe_Total || 0);
            const tieneIva  = valorIva > 0;

            // Ítems: manuales si vienen, o consulta por defecto (flujo automático)
            const items = (Array.isArray(itemsOverride) && itemsOverride.length > 0)
                ? itemsOverride
                : [{ codigo: 'SERV-01', descripcion: 'CONSULTA Y TRATAMIENTO ODONTOLOGICO', cantidad: 1, precioUnitario: subtotalSinImp, descuento: 0 }];

            // --- Marca de agua ---
            doc.save();
            doc.fillColor('#e2e8f0').opacity(0.25).fontSize(38);
            doc.rotate(-45, { origin: [300, 420] });
            doc.text('CasRodsoft Development', 40, 420, { align: 'center', width: 500 });
            doc.restore();
            doc.opacity(1);

            // --- Logo ---
            if (factura.Logo_Ruta) {
                const logoPath = path.join(process.cwd(), 'uploads', 'logos', path.basename(factura.Logo_Ruta));
                if (fs.existsSync(logoPath)) doc.image(logoPath, L, 40, { fit: [150, 90] });
            }

            // --- Caja emisor (izquierda) ---
            const emisorY = 140;
            doc.lineWidth(0.7).roundedRect(L, emisorY, 245, 110, 4).stroke('#cbd5e1');
            doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
               .text((factura.Nombre_Clinica || '').toUpperCase(), L + 8, emisorY + 10, { width: 230 });
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            let ey = emisorY + 42;
            doc.text(`Dir. Matriz: ${factura.Dir_Clinica || 'S/N'}`, L + 8, ey, { width: 230 }); ey += 22;
            if (factura.Contribuyente_Especial && !['0', '000'].includes(String(factura.Contribuyente_Especial))) {
                doc.text(`Contribuyente Especial Nro: ${factura.Contribuyente_Especial}`, L + 8, ey); ey += 12;
            }
            doc.text(`OBLIGADO A LLEVAR CONTABILIDAD: ${factura.Obligado_Contabilidad || 'NO'}`, L + 8, ey); ey += 12;
            doc.text(`RÉGIMEN RIMPE: ${factura.Regimen_Rimpe || 'NO'}`, L + 8, ey);

            // --- Caja RUC / FACTURA (derecha) ---
            const rx = 300;
            doc.roundedRect(rx, 40, 260, 200, 4).stroke('#cbd5e1');
            doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold').text(`R.U.C.: ${factura.Ruc_Clinica || ''}`, rx + 12, 52);
            doc.fillColor(azulSRI).fontSize(15).text('F A C T U R A', rx + 12, 72);
            doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
               .text(`No. ${factura.Establecimiento}-${factura.Punto_Emision}-${factura.Secuencial}`, rx + 12, 94);
            doc.fontSize(8).font('Helvetica').fillColor('#334155').text('NÚMERO DE AUTORIZACIÓN:', rx + 12, 114);
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000').text(factura.Clave_Acceso || '', rx + 12, 124, { width: 236 });
            const fAut = factura.Fecha_Autorizacion || factura.Fecha_Emision || new Date();
            doc.fontSize(8).font('Helvetica').fillColor('#334155')
               .text(`FECHA Y HORA DE AUTORIZACIÓN: ${formatFechaHoraSRI(fAut)}`, rx + 12, 144, { width: 236 });
            const ambientePDF = String(factura.Clave_Acceso || '').substring(23, 24) === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';
            doc.text(`AMBIENTE: ${ambientePDF}`, rx + 12, 164);
            doc.text('EMISIÓN: NORMAL', rx + 12, 176);
            doc.text('CLAVE DE ACCESO:', rx + 12, 192);
            const canvas = createCanvas();
            JsBarcode(canvas, factura.Clave_Acceso, { format: "CODE128", displayValue: false, height: 35, width: 1.6, margin: 0 });
            doc.image(canvas.toBuffer(), rx + 8, 204, { width: 244, height: 26 });

            // --- Caja receptor ---
            const yR = 260;
            doc.roundedRect(L, yR, W, 62, 4).stroke('#cbd5e1');
            doc.fontSize(8).fillColor('#000000');
            doc.font('Helvetica-Bold').text('Razón Social / Nombres y Apellidos:', L + 10, yR + 9);
            doc.font('Helvetica').text((factura.Receptor_Nombre_RS || '').toUpperCase(), L + 175, yR + 9, { width: 340 });
            doc.font('Helvetica-Bold').text('Identificación:', L + 10, yR + 25);
            doc.font('Helvetica').text(factura.Receptor_Identificacion || '', L + 175, yR + 25);
            doc.font('Helvetica-Bold').text('Fecha Emisión:', 360, yR + 25);
            doc.font('Helvetica').text(new Date(factura.Fecha_Emision).toLocaleDateString(), 435, yR + 25);
            doc.font('Helvetica-Bold').text('Dirección:', L + 10, yR + 41);
            doc.font('Helvetica').text(factura.Receptor_Direccion || 'S/N', L + 175, yR + 41, { width: 340 });

            // --- Tabla de ítems ---
            const yT = yR + 74;
            const cols = { cod: L + 6, desc: L + 70, cant: 360, pu: 410, dsc: 470, tot: 515 };
            doc.rect(L, yT, W, 18).fill(azulSRI);
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
            doc.text('COD.', cols.cod, yT + 5);
            doc.text('DESCRIPCIÓN', cols.desc, yT + 5);
            doc.text('CANT', cols.cant, yT + 5);
            doc.text('P.UNIT', cols.pu, yT + 5);
            doc.text('DESC', cols.dsc, yT + 5);
            doc.text('TOTAL', cols.tot, yT + 5);

            let yRow = yT + 22;
            doc.fillColor('#000000').font('Helvetica').fontSize(8);
            items.forEach(it => {
                const cant = Number(it.cantidad || 1);
                const pu   = Number(it.precioUnitario || 0);
                const dsc  = Number(it.descuento || 0);
                const totLinea = cant * pu - dsc;
                const txtDesc = (it.descripcion || '').toUpperCase();
                doc.text(it.codigo || 'SERV-01', cols.cod, yRow, { width: 60 });
                doc.text(txtDesc, cols.desc, yRow, { width: 245 });
                doc.text(cant.toFixed(2), cols.cant, yRow, { width: 40 });
                doc.text(pu.toFixed(2), cols.pu, yRow, { width: 50 });
                doc.text(dsc.toFixed(2), cols.dsc, yRow, { width: 40 });
                doc.text(totLinea.toFixed(2), cols.tot, yRow, { width: 45 });
                const hDesc = doc.heightOfString(txtDesc, { width: 245 });
                yRow += Math.max(hDesc, 12) + 6;
            });
            doc.moveTo(L, yRow).lineTo(R, yRow).lineWidth(0.5).stroke('#cbd5e1');

            // --- Información adicional + forma de pago (izquierda) ---
            const yBlock = yRow + 14;
            const tel  = (extra && extra.telefono) || factura.Receptor_Telefono || factura.Tel_Clinica || '';
            const mail = (extra && extra.email) || factura.Receptor_Email || '';
            doc.roundedRect(L, yBlock, 250, 60, 4).stroke('#cbd5e1');
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155').text('Información Adicional', L + 8, yBlock + 8);
            doc.font('Helvetica').fillColor('#000000');
            doc.text(`Teléfono: ${tel || '-'}`, L + 8, yBlock + 24);
            doc.text(`Email: ${mail || '-'}`, L + 8, yBlock + 38);
            const yFp = yBlock + 70;
            doc.roundedRect(L, yFp, 250, 30, 4).stroke('#cbd5e1');
            doc.font('Helvetica-Bold').fontSize(8).text('Forma de Pago', L + 8, yFp + 6);
            const fpCode = (extra && extra.forma_pago) ? String(extra.forma_pago) : '01';
            const fpLabel = SRI_FORMAS_PAGO[fpCode] || SRI_FORMAS_PAGO['01'];
            doc.font('Helvetica').fontSize(7.5)
               .text(`${fpCode} - ${fpLabel}`, L + 8, yFp + 18, { width: 234 });

            // --- Totales (derecha) ---
            const tx = 330, tw = 230, rowH = 15;
            const filas = [];
            if (subtotal0 > 0 || !tieneIva) filas.push(['SUBTOTAL 0%', subtotal0]);
            if (tieneIva) filas.push(['SUBTOTAL 15%', baseIva]);
            filas.push(['SUBTOTAL SIN IMPUESTOS', subtotalSinImp]);
            filas.push(['TOTAL DESCUENTO', descuento]);
            filas.push([tieneIva ? 'IVA 15%' : 'IVA 0%', valorIva]);
            filas.push(['PROPINA', propina]);
            let yt2 = yBlock;
            doc.fontSize(8);
            filas.forEach(([label, val]) => {
                doc.rect(tx, yt2, tw, rowH).stroke('#e2e8f0');
                doc.font('Helvetica').fillColor('#334155').text(label, tx + 6, yt2 + 4);
                doc.font('Helvetica-Bold').fillColor('#000000').text(`$${Number(val).toFixed(2)}`, tx + tw - 76, yt2 + 4, { width: 70, align: 'right' });
                yt2 += rowH;
            });
            doc.rect(tx, yt2, tw, 22).fill(azulSRI);
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text('VALOR TOTAL', tx + 6, yt2 + 6);
            doc.text(`$${total.toFixed(2)}`, tx + tw - 86, yt2 + 6, { width: 80, align: 'right' });

            doc.end();

            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            await pool.request()
                .input('id', sql.Int, id_facturacion)
                .input('ruta', sql.NVarChar, rutaRelativa)
                .query(`UPDATE Facturacion_Documentos SET Ruta_PDF_RIDE = @ruta WHERE ID_Facturacion = @id`);

            return rutaRelativa;

        } catch (error) {
            console.error("❌ Error en RIDE:", error.message);
            throw error;
        }
    }
};

module.exports = facturacionController;