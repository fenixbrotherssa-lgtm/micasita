const { getConnection, sql } = require('../config/db');
const fs = require('fs');
const path = require('path');

// ======================================
// 1. LISTAR PACIENTES
// ======================================
const getPacientes = async (req, res) => {
    const { busqueda, id_clinica } = req.query;
    try {
        const pool = await getConnection();
        let query = `
            SELECT P.ID_Paciente, P.Nombres, P.Apellidos, P.DNI, P.Telefono, P.Email, 
                   P.Fecha_Nacimiento, P.ID_Clinica, P.Genero, C.Nombre_Clinica, C.Logo_Ruta,
                   DATEDIFF(YEAR, P.Fecha_Nacimiento, GETDATE()) - 
                   CASE WHEN (MONTH(P.Fecha_Nacimiento) > MONTH(GETDATE())) 
                   OR (MONTH(P.Fecha_Nacimiento) = MONTH(GETDATE()) AND DAY(P.Fecha_Nacimiento) > DAY(GETDATE())) 
                   THEN 1 ELSE 0 END AS Edad
            FROM Pacientes P
            LEFT JOIN Clinicas C ON P.ID_Clinica = C.ID_Clinica
            WHERE P.Activo = 1
        `;

        const request = pool.request();
        if (id_clinica) {
            query += ` AND P.ID_Clinica = @id_cli`;
            request.input('id_cli', sql.Int, parseInt(id_clinica));
        }
        if (busqueda && busqueda.trim() !== "") {
            query += ` AND (P.Nombres LIKE @param OR P.Apellidos LIKE @param OR P.DNI LIKE @param)`;
            request.input('param', sql.VarChar, `%${busqueda}%`);
        }
        query += ` ORDER BY P.ID_Paciente DESC`;
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ======================================
// 2. OBTENER UN SOLO PACIENTE
// ======================================
const getPacienteById = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT P.*, C.Nombre_Clinica, C.Logo_Ruta, C.RUC, C.Direccion, C.Telefono AS Telefono_Clinica,
                    DATEDIFF(YEAR, P.Fecha_Nacimiento, GETDATE()) - 
                    CASE WHEN (MONTH(P.Fecha_Nacimiento) > MONTH(GETDATE())) 
                    OR (MONTH(P.Fecha_Nacimiento) = MONTH(GETDATE()) AND DAY(P.Fecha_Nacimiento) > DAY(GETDATE())) 
                    THEN 1 ELSE 0 END AS Edad
                FROM Pacientes P
                LEFT JOIN Clinicas C ON P.ID_Clinica = C.ID_Clinica
                WHERE P.ID_Paciente = @id
            `);
        if (result.recordset.length > 0) res.json(result.recordset[0]);
        else res.status(404).json({ status: "Error", message: "Paciente no encontrado" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ======================================
// 3. CREAR O EDITAR PACIENTE (CAMPOS MSP ACTUALIZADOS)
// ======================================
const crearPaciente = async (req, res) => {
    const { 
        id_paciente, nombres, apellidos, dni, fecha_nac, telefono, email, 
        id_clinica, genero, etnia, provincia, canton, parroquia, instruccion,
        tipo_sanguineo, ocupacion, estado_civil, lugar_nacimiento,
        contacto_emergencia_nombre, contacto_emergencia_telefono, parentesco_contacto
    } = req.body;

    if (!nombres || !dni || !id_clinica) return res.status(400).json({ status: "Error", message: "Datos obligatorios faltantes" });

    let telFinal = telefono ? String(telefono).replace(/\D/g, '') : '';
    if (telFinal.startsWith('0') && telFinal.length === 10) telFinal = '593' + telFinal.substring(1);

    try {
        const pool = await getConnection();
        const request = pool.request()
            .input('nom', sql.NVarChar, nombres)
            .input('ape', sql.NVarChar, apellidos || '')
            .input('dni', sql.VarChar, dni)
            .input('f_nac', sql.Date, fecha_nac || null)
            .input('tel', sql.VarChar, telFinal)
            .input('mail', sql.VarChar, email || '')
            .input('id_cli', sql.Int, parseInt(id_clinica))
            .input('gen', sql.VarChar, genero || 'Otro')
            .input('etn', sql.VarChar, etnia || null)
            .input('prov', sql.VarChar, provincia || null)
            .input('can', sql.VarChar, canton || null)
            .input('parr', sql.VarChar, parroquia || null)
            .input('inst', sql.NVarChar, instruccion || null)
            // Nuevos campos
            .input('sangre', sql.VarChar, tipo_sanguineo || null)
            .input('ocup', sql.NVarChar, ocupacion || null)
            .input('est_civ', sql.VarChar, estado_civil || null)
            .input('lug_nac', sql.NVarChar, lugar_nacimiento || null)
            .input('em_nom', sql.NVarChar, contacto_emergencia_nombre || null)
            .input('em_tel', sql.VarChar, contacto_emergencia_telefono || null)
            .input('em_par', sql.VarChar, parentesco_contacto || null);

        if (id_paciente) {
            await request.input('id_p', sql.Int, id_paciente).query(`
                UPDATE Pacientes SET 
                    Nombres=@nom, Apellidos=@ape, DNI=@dni, Fecha_Nacimiento=@f_nac, 
                    Telefono=@tel, Email=@mail, ID_Clinica=@id_cli, Genero=@gen, 
                    Etnia=@etn, Provincia_Residencia=@prov, Canton_Residencia=@can, 
                    Parroquia_Residencia=@parr, Instruccion_Ultimo_Anio=@inst,
                    Tipo_Sanguineo=@sangre, Ocupacion=@ocup, Estado_Civil=@est_civ, 
                    Lugar_Nacimiento=@lug_nac, Contacto_Emergencia_Nombre=@em_nom, 
                    Contacto_Emergencia_Telefono=@em_tel, Parentesco_Contacto=@em_par
                WHERE ID_Paciente=@id_p`);
            res.json({ status: "Success", message: "Paciente actualizado" });
        } else {
            const result = await request.query(`
                INSERT INTO Pacientes (
                    Nombres, Apellidos, DNI, Fecha_Nacimiento, Telefono, Email, 
                    ID_Clinica, Genero, Fecha_Registro, Activo, Etnia, 
                    Provincia_Residencia, Canton_Residencia, Parroquia_Residencia, Instruccion_Ultimo_Anio,
                    Tipo_Sanguineo, Ocupacion, Estado_Civil, Lugar_Nacimiento, 
                    Contacto_Emergencia_Nombre, Contacto_Emergencia_Telefono, Parentesco_Contacto
                ) VALUES (
                    @nom, @ape, @dni, @f_nac, @tel, @mail, 
                    @id_cli, @gen, GETDATE(), 1, @etn, 
                    @prov, @can, @parr, @inst,
                    @sangre, @ocup, @est_civ, @lug_nac, 
                    @em_nom, @em_tel, @em_par
                ); 
                SELECT SCOPE_IDENTITY() AS ID;`);
            
            const nuevoID = result.recordset[0].ID;
            await pool.request().input('id_p_nuevo', sql.Int, nuevoID).query(`INSERT INTO Antecedentes_Medicos (ID_Paciente, Enfermedades_Sistemicas, Alergias, Medicamentos, Cirugias_Previas, Observaciones, Ultima_Actualizacion) VALUES (@id_p_nuevo, '', '', '', '', '', GETDATE())`);
            res.json({ status: "Success", message: "Paciente registrado", id: nuevoID });
        }
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ======================================
// 4. HISTORIA CLÍNICA COMPLETA
// ======================================
const getHistoriaClinicaCompleta = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        // El SELECT P.* ya trae los nuevos campos automáticamente
        const pacienteRes = await pool.request().input('busqueda', sql.VarChar, id).query(`
            SELECT P.*, C.Nombre_Clinica, C.Logo_Ruta, C.RUC, C.Direccion, 
            DATEDIFF(YEAR, P.Fecha_Nacimiento, GETDATE()) - 
            CASE WHEN (MONTH(P.Fecha_Nacimiento) > MONTH(GETDATE())) 
            OR (MONTH(P.Fecha_Nacimiento) = MONTH(GETDATE()) AND DAY(P.Fecha_Nacimiento) > DAY(GETDATE())) 
            THEN 1 ELSE 0 END AS Edad 
            FROM Pacientes P 
            LEFT JOIN Clinicas C ON P.ID_Clinica = C.ID_Clinica 
            WHERE (CAST(P.ID_Paciente AS VARCHAR) = @busqueda OR P.DNI = @busqueda)`);
        
        if (!pacienteRes.recordset[0]) return res.status(404).json({ status: "Error", message: "No encontrado" });
        const perfil = pacienteRes.recordset[0];
        const idP = perfil.ID_Paciente;

        const [anamnesis, tratamientos, signos, examen] = await Promise.all([
            pool.request().input('idP', sql.Int, idP).query(`SELECT * FROM Antecedentes_Medicos WHERE ID_Paciente = @idP`),
            pool.request().input('idP', sql.Int, idP).query(`SELECT tp.*, ISNULL((SELECT SUM(Monto) FROM Pagos WHERE ID_Plan = tp.ID_Plan), 0) as Total_Pagado FROM Tratamientos_Plan tp WHERE tp.ID_Paciente = @idP`),
            pool.request().input('idP', sql.Int, idP).query(`SELECT TOP 1 * FROM MSP_033_Signos_Vitales WHERE ID_Paciente = @idP ORDER BY Fecha_Registro DESC`),
            pool.request().input('idP', sql.Int, idP).query(`SELECT * FROM MSP_033_Examen_Estomatognatico WHERE ID_Paciente = @idP ORDER BY Fecha_Examen DESC`)
        ]);

        res.json({
            status: "Success",
            perfil,
            historiaMedica: anamnesis.recordset[0] || {},
            planesTratamiento: tratamientos.recordset,
            signosVitales: signos.recordset[0] || null,
            examenEstomatognatico: examen.recordset
        });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ======================================
// 5. GESTIÓN DE SIGNOS VITALES (HISTORIAL COMPLETO)
// ======================================
const getHistorialSignosVitales = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT * FROM MSP_033_Signos_Vitales WHERE ID_Paciente = @id ORDER BY Fecha_Registro DESC`);
        res.json(result.recordset); // Se envía el array directamente para el frontend
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const guardarSignosVitales = async (req, res) => {
    const { id_paciente, pa, fc, temp, fr, saturacion } = req.body;
    try {
        const pool = await getConnection();
        await pool.request()
            .input('pac', sql.Int, id_paciente).input('pa', sql.VarChar, pa).input('fc', sql.Int, fc)
            .input('temp', sql.Decimal(4,2), temp).input('fr', sql.Int, fr).input('sat', sql.Int, saturacion || null)
            .query(`INSERT INTO MSP_033_Signos_Vitales (ID_Paciente, Presion_Arterial, Frecuencia_Cardiaca, Temperatura, Frecuencia_Respiratoria, Saturacion_Oxigeno) VALUES (@pac, @pa, @fc, @temp, @fr, @sat)`);
        res.json({ status: "Success", message: "Signos vitales registrados" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ======================================
// 6. EXAMEN ESTOMATOGNÁTICO Y OTROS
// ======================================
const guardarExamenEstomatognatico = async (req, res) => {
    const { id_paciente, hallazgos } = req.body;
    
    // Validación de seguridad: evitar que el proceso truene si hallazgos no llega
    if (!hallazgos || !Array.isArray(hallazgos)) {
        return res.status(400).json({ status: "Error", message: "No hay hallazgos para procesar" });
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        for (const h of hallazgos) {
            await transaction.request()
                .input('pac', sql.Int, id_paciente)
                .input('reg', sql.Int, h.region_cod)
                .input('norm', sql.Bit, h.es_normal)
                .input('desc', sql.NVarChar, h.descripcion || '')
                .query(`
                    INSERT INTO MSP_033_Examen_Estomatognatico 
                    (ID_Paciente, Region_Cod, Es_Normal, Descripcion_Patologia, Fecha_Examen) 
                    VALUES (@pac, @reg, @norm, @desc, GETDATE())
                `);
        }

        await transaction.commit();
        res.json({ status: "Success", message: "Examen estomatognático guardado correctamente" });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("Error en Examen Estomatognático:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const guardarAnamnesis = async (req, res) => {
    const { id_paciente, enfermedades_sistemicas, alergias, medicamentos, cirugias_previas, observaciones } = req.body;
    try {
        const pool = await getConnection();
        const actual = await pool.request().input('id_p', sql.Int, id_paciente).query(`SELECT CAST(Enfermedades_Sistemicas AS NVARCHAR(MAX)) as enf, CAST(Alergias AS NVARCHAR(MAX)) as ale, CAST(Medicamentos AS NVARCHAR(MAX)) as med, CAST(Cirugias_Previas AS NVARCHAR(MAX)) as cir, CAST(Observaciones AS NVARCHAR(MAX)) as obs FROM Antecedentes_Medicos WHERE ID_Paciente = @id_p`);
        const h = actual.recordset[0] || {};
        const procesarCampo = (nuevo, viejo) => {
            const n = (nuevo || '').trim(); const v = (viejo || '').trim();
            if (n === "" || n === v) return v;
            const fecha = new Date().toISOString().split('T')[0];
            return v !== "" ? `${v} | [${fecha}]: ${n}` : `[${fecha}]: ${n}`;
        };
        await pool.request().input('id', sql.Int, id_paciente).input('enf', sql.NVarChar, procesarCampo(enfermedades_sistemicas, h.enf)).input('ale', sql.NVarChar, procesarCampo(alergias, h.ale)).input('med', sql.NVarChar, procesarCampo(medicamentos, h.med)).input('cir', sql.NVarChar, procesarCampo(cirugias_previas, h.cir)).input('obs', sql.NVarChar, procesarCampo(observaciones, h.obs))
            .query(`IF EXISTS (SELECT 1 FROM Antecedentes_Medicos WHERE ID_Paciente = @id) BEGIN UPDATE Antecedentes_Medicos SET Enfermedades_Sistemicas=@enf, Alergias=@ale, Medicamentos=@med, Cirugias_Previas=@cir, Observaciones=@obs, Ultima_Actualizacion=GETDATE() WHERE ID_Paciente=@id END ELSE BEGIN INSERT INTO Antecedentes_Medicos (ID_Paciente, Enfermedades_Sistemicas, Alergias, Medicamentos, Cirugias_Previas, Observaciones, Ultima_Actualizacion) VALUES (@id, @enf, @ale, @med, @cir, @obs, GETDATE()) END`);
        res.json({ status: "Success", message: "Anamnesis actualizada" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const getReporteMaestro = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request().input('id', sql.Int, id).query("SELECT * FROM Vista_Expediente_Universal WHERE ID_Paciente = @id");
        if (result.recordset.length === 0) return res.status(404).json({ status: "Error", message: "No encontrado" });
        const planes = await pool.request().input('id', sql.Int, id).query(`SELECT ID_Plan, Nombre_Tratamiento, Costo_Total, Saldo_Pendiente, Estado_Tratamiento, Numero_Diente FROM Tratamientos_Plan WHERE ID_Paciente = @id`);
        res.json({ status: "Success", data: result.recordset[0], planesTratamiento: planes.recordset });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const getExamenEstomatognaticoIndividual = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request().input('id', sql.Int, id).query("SELECT Region_Cod, Es_Normal, Descripcion_Patologia, Fecha_Examen FROM MSP_033_Examen_Estomatognatico WHERE ID_Paciente = @id ORDER BY Fecha_Examen DESC");
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ======================================
// 7. GESTIÓN DE IMÁGENES Y ELIMINACIÓN
// ======================================
const subirImagenesPaciente = async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ status: "Error", message: "Sin imágenes" });
    res.json({ status: "Success", archivos: req.files.map(f => f.filename) });
};

const getImagenesPaciente = async (req, res) => {
    const { id } = req.params;
    const baseDir = process.env.NODE_ENV === 'production' ? process.cwd() : path.join(__dirname, '..');
    const directoryPath = path.join(baseDir, 'uploads', 'clinico');
    if (!fs.existsSync(directoryPath)) return res.json({ status: "Success", imagenes: [] });
    fs.readdir(directoryPath, (err, files) => {
        if (err) return res.status(500).json({ status: "Error" });
        const imagenes = files.filter(file => file.startsWith(`PAC-${id}-`)).map(file => {
            const partes = file.split('-');
            return { archivo: file, tipo: partes[2] || 'Otro', fecha: partes[3] ? parseInt(partes[3]) : Date.now() };
        });
        res.json({ status: "Success", imagenes });
    });
};

const eliminarPaciente = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const checkDeuda = await pool.request().input('id', sql.Int, id).query("SELECT SUM(Saldo_Pendiente) as Deuda FROM Tratamientos_Plan WHERE ID_Paciente = @id");
        if ((checkDeuda.recordset[0].Deuda || 0) > 0) return res.json({ status: "Error", message: "Deuda pendiente" });
        await pool.request().input('id', sql.Int, id).query("UPDATE Pacientes SET Activo = 0 WHERE ID_Paciente = @id");
        res.json({ status: "Success", message: "Paciente inactivado" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const guardarConsentimiento024 = async (req, res) => {
    // Desestructuramos los campos exactos de tu tabla
    const { id_paciente, id_plan, aceptado, hash, revocatoria } = req.body;
    
    try {
        const pool = await getConnection();
        await pool.request()
            .input('pac', sql.Int, id_paciente)
            .input('plan', sql.Int, id_plan)
            .input('acep', sql.Bit, aceptado)
            .input('revoc', sql.Bit, revocatoria || 0) // Si no viene, es 0
            .input('hash', sql.NVarChar(sql.MAX), hash) // Cambiado a MAX si es el Base64 de la imagen
            .query(`
                INSERT INTO MSP_024_Consentimiento_Informado 
                (ID_Paciente, ID_Plan, Aceptado, Fecha_Firma, Revocatoria, Hash_Digital) 
                VALUES 
                (@pac, @plan, @acep, GETDATE(), @revoc, @hash)
            `);

        res.json({ status: "Success", message: "Consentimiento guardado correctamente" });
    } catch (error) {
        console.error("❌ Error en Consentimiento:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};
const getReportePrestacionesAdicional = async (req, res) => {
    const { desde, hasta, id_prestacion } = req.query;

    try {
        const pool = await getConnection();
        const request = pool.request();

        // 1. NORMALIZACIÓN TOTAL:
        // Si no viene ID, es undefined o es 'ALL', mandamos 0 al SQL.
        const idPre = (id_prestacion && id_prestacion !== 'ALL' && id_prestacion !== 'undefined') 
            ? parseInt(id_prestacion) 
            : 0;

        // 2. QUERY OPTIMIZADO:
        // Usamos ISNULL para que si el ID_Prestacion en Tratamientos_Plan es NULL, 
        // no se rompa y use el texto manual que pusiste al crear el plan.
        const query = `
            SELECT 
                tp.Fecha_Inicio, 
                pa.Nombres + ' ' + pa.Apellidos AS Nombre_Paciente,
                pa.DNI,
                ISNULL(p.Nombre_Prestacion, tp.Nombre_Tratamiento) AS Nombre_Prestacion,
                ISNULL(u.Nombres + ' ' + u.Apellidos, 'Sin Especialista') AS Doctor,
                tp.Estado_Tratamiento,
                tp.Costo_Total
            FROM Tratamientos_Plan tp
            INNER JOIN Pacientes pa ON tp.ID_Paciente = pa.ID_Paciente
            LEFT JOIN Prestaciones p ON tp.ID_Prestacion = p.ID_Prestacion 
            LEFT JOIN Usuarios u ON tp.ID_Medico = u.ID_Usuario
            WHERE 
                CAST(tp.Fecha_Inicio AS DATE) BETWEEN @desde AND @hasta
                AND (
                    @id_pre = 0  -- Si es 0, ignora el filtro y trae todos (ALL)
                    OR tp.ID_Prestacion = @id_pre -- Si hay ID, filtra exacto
                )
            ORDER BY tp.Fecha_Inicio DESC
        `;

        // 3. PASO DE PARÁMETROS SEGUROS
        request.input('desde', sql.Date, desde);
        request.input('hasta', sql.Date, hasta);
        request.input('id_pre', sql.Int, idPre);

        const result = await request.query(query);

        // 4. RESPUESTA LIMPIA
        res.json({ 
            status: "Success", 
            count: result.recordset.length,
            data: result.recordset 
        });

    } catch (error) {
        console.error("❌ Error Crítico en Auditoría:", error.message);
        res.status(500).json({ 
            status: "Error", 
            message: "Error al generar reporte de auditoría" 
        });
    }
};
module.exports = {
    getPacientes, getPacienteById, crearPaciente, getHistoriaClinicaCompleta, guardarAnamnesis,
    subirImagenesPaciente, getImagenesPaciente, eliminarPaciente, guardarSignosVitales,
    guardarExamenEstomatognatico, guardarConsentimiento024, getReporteMaestro,
    getExamenEstomatognaticoIndividual, getHistorialSignosVitales,getReportePrestacionesAdicional
};