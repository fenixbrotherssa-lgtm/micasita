const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacionController');
const multer = require('multer');
const path = require('path');

// Configuración de almacenamiento para firmas (.p12)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Asegúrate de que esta carpeta exista en tu servidor
        cb(null, 'uploads/facturacion/p12/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'FIRMA-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- ENDPOINTS DE ESCRITURA ---

// Sube el archivo P12 y guarda la info en la DB
router.post('/certificado/subir', upload.single('p12'), facturacionController.subirCertificado);

// Registra la factura en la base de datos antes de enviarla al SRI
router.post('/documento/registrar', facturacionController.generarRegistroFactura);

// NUEVO: Crea el Pago origen para una factura manual (respeta la FK hacia Pagos)
router.post('/pago-manual', facturacionController.crearPagoManual);

// Autoriza el comprobante ante el SRI
router.post('/documento/autorizar-sri', facturacionController.autorizarComprobanteSRI);

// NUEVO: Envía la factura y PDF físicamente por correo
router.post('/documento/enviar-correo', facturacionController.enviarFacturaCorreoDirecto);

// --- ENDPOINTS DE LECTURA (Frontend Sync) ---

// NUEVO: Busca cliente en el padrón nacional (CSV) para la factura manual
router.get('/buscar-cliente/:documento', facturacionController.buscarCliente);

// Obtiene la firma activa de la clínica para mostrarla en el panel izquierdo
router.get('/certificados/:id_clinica', facturacionController.listarCertificados);

// Obtiene el historial de facturas para la tabla del panel derecho
router.get('/historial', facturacionController.listarHistorial);

module.exports = router;