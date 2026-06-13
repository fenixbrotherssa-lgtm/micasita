const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const { 
    getPacientes, 
    getPacienteById, 
    crearPaciente, 
    getHistoriaClinicaCompleta, 
    guardarAnamnesis,
    subirImagenesPaciente,
    getImagenesPaciente,
    eliminarPaciente,
    // MÉTODOS MSP
    guardarSignosVitales,
    guardarExamenEstomatognatico,
    guardarConsentimiento024,
    // NUEVOS MÉTODOS PARA EL REPORTE MAESTRO
    getReporteMaestro,
    getExamenEstomatognaticoIndividual,
    // RECURSO SOLICITADO
    getHistorialSignosVitales,
    // MÉTODO DE AUDITORÍA ADICIONAL (OPCIONAL)
    getReportePrestacionesAdicional
} = require('../controllers/pacienteController');

// ==========================================
// CONFIGURACIÓN DE MULTER (GALERÍA CLÍNICA)
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/clinico'); 
    },
    filename: (req, file, cb) => {
        const idP = req.body.id_paciente || 'S-ID';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `PAC-${idP}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

// ===============================
// RUTAS DE PACIENTES (Base: /api/pacientes)
// ===============================

// Listar o buscar
router.get('/', getPacientes);

// Obtener por ID
router.get('/:id', getPacienteById); 

// Registro y Actualización
router.post('/registro', crearPaciente);

// Historia clínica completa
router.get('/historia/:id', getHistoriaClinicaCompleta);

// Anamnesis
router.post('/anamnesis', guardarAnamnesis);

// ==========================================
// RUTAS PARA REPORTES Y EXÁMENES (FIX 404)
// ==========================================

// Reporte Maestro (Vista SQL) -> /api/pacientes/reporte-maestro/:id
router.get('/reporte-maestro/:id', getReporteMaestro);

// Examen Estomatognático -> /api/pacientes/examenes/estomatognatico/:id
router.get('/examenes/estomatognatico/:id', getExamenEstomatognaticoIndividual);

// Historial completo de signos vitales (SELECT * FROM MSP_033_Signos_Vitales)
router.get('/signos-todos/:id', getHistorialSignosVitales);

// NUEVO: Filtro de Auditoría de Prestaciones (Doctor + Servicio + Fecha)
// Se usa como: /api/pacientes/auditoria/prestaciones/:id_paciente?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/auditoria/prestaciones/:id_paciente', getReportePrestacionesAdicional);

// ==========================================
// CUMPLIMIENTO MSP (033 y 024)
// ==========================================

router.post('/msp/signos', guardarSignosVitales);
router.post('/msp/examen-estomatognatico', guardarExamenEstomatognatico);
router.post('/msp/consentimiento', guardarConsentimiento024);

// ===============================
// GESTIÓN DE IMÁGENES
// ===============================

router.post('/imagenes/subir', upload.array('imagenes'), subirImagenesPaciente);
router.get('/imagenes/:id', getImagenesPaciente); 

// ===============================
// ELIMINACIÓN
// ===============================

router.get('/eliminar/:id', eliminarPaciente);

module.exports = router;