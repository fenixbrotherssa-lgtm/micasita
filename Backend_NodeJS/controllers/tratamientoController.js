const { getConnection, sql } = require('../config/db');
const crypto = require('crypto'); // nativo de Node, no requiere npm install

/**
 * LÓGICA DE APOYO PARA EL ODONTOGRAMA
 * Estas constantes y funciones detectan si un tratamiento debe pintar el dibujo
 */
const mapaEstadosOdo = {
    'resina': 'Resina',
    'calza': 'Resina',
    'restauracion': 'Resina',
    'extraccion': 'Extraer',
    'exodoncia': 'Extraer',
    'conducto': 'Endodoncia',
    'endodoncia': 'Endodoncia',
    'corona': 'Corona',
    'perno': 'Corona',
    'sellante': 'Sellante',
    'carilla': 'Carilla Resina'
};

const obtenerEstadoVisual = (nombre) => {
    if (!nombre) return null;
    const n = nombre.toLowerCase();
    for (const [key, value] of Object.entries(mapaEstadosOdo)) {
        if (n.includes(key)) return value;
    }
    return null;
};

/**
 * DETECCIÓN INTELIGENTE DE ESPECIALIDAD ODONTOLÓGICA
 * Mapea palabras clave del nombre del procedimiento a la especialidad.
 * Si el frontend ya envía 'especialidad', esa tiene prioridad (el doctor
 * pudo corregirla a mano). Esto solo actúa como respaldo automático.
 */
const mapaEspecialidades = {
    // Endodoncia
    'conducto': 'Endodoncia', 'endodoncia': 'Endodoncia', 'pulp': 'Endodoncia', 'necropulp': 'Endodoncia',
    // Cirugía Oral y Maxilofacial
    'extraccion': 'Cirugía Oral y Maxilofacial', 'exodoncia': 'Cirugía Oral y Maxilofacial',
    'cirugia': 'Cirugía Oral y Maxilofacial', 'cordal': 'Cirugía Oral y Maxilofacial',
    'tercer molar': 'Cirugía Oral y Maxilofacial', 'biopsia': 'Cirugía Oral y Maxilofacial',
    // Ortodoncia y Ortopedia Maxilar
    'ortodoncia': 'Ortodoncia y Ortopedia Maxilar', 'bracket': 'Ortodoncia y Ortopedia Maxilar',
    'alineador': 'Ortodoncia y Ortopedia Maxilar', 'ortopedia': 'Ortodoncia y Ortopedia Maxilar',
    // Periodoncia
    'periodon': 'Periodoncia', 'curetaje': 'Periodoncia', 'raspado': 'Periodoncia',
    'gingiv': 'Periodoncia', 'profilaxis': 'Periodoncia', 'limpieza': 'Periodoncia', 'destartraje': 'Periodoncia',
    // Rehabilitación Oral y Prótesis
    'corona': 'Rehabilitación Oral y Prótesis', 'perno': 'Rehabilitación Oral y Prótesis',
    'protesis': 'Rehabilitación Oral y Prótesis', 'puente': 'Rehabilitación Oral y Prótesis',
    'protésica': 'Rehabilitación Oral y Prótesis', 'incrustacion': 'Rehabilitación Oral y Prótesis',
    // Implantología Oral
    'implante': 'Implantología Oral', 'implantolog': 'Implantología Oral',
    // Estética y Operatoria Dental
    'carilla': 'Estética y Operatoria Dental', 'blanqueamiento': 'Estética y Operatoria Dental',
    'estetica': 'Estética y Operatoria Dental', 'diseño de sonrisa': 'Estética y Operatoria Dental',
    'resina': 'Estética y Operatoria Dental', 'restauracion': 'Estética y Operatoria Dental',
    'calza': 'Estética y Operatoria Dental', 'sellante': 'Estética y Operatoria Dental',
    'obturacion': 'Estética y Operatoria Dental',
    // Odontopediatría
    'pediatr': 'Odontopediatría', 'pulpotomia': 'Odontopediatría', 'corona acero': 'Odontopediatría',
    // Radiología
    'radiograf': 'Radiología Oral y Maxilofacial', 'tomograf': 'Radiología Oral y Maxilofacial'
};

/**
 * Recorre los procedimientos del lote y devuelve la especialidad detectada.
 * Por defecto 'Odontología General' si nada coincide.
 */
const detectarEspecialidad = (tratamientos) => {
    if (!Array.isArray(tratamientos)) return 'Odontología General';
    for (const t of tratamientos) {
        const n = (t.nombre || t.Nombre_Tratamiento || '').toLowerCase();
        if (!n) continue;
        for (const [key, esp] of Object.entries(mapaEspecialidades)) {
            if (n.includes(key)) return esp;
        }
    }
    return 'Odontología General';
};

// 1. OBTENER CATÁLOGO COMPLETO
const getCatalogoCompleto = async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query("SELECT * FROM Prestaciones WHERE Activo = 1 ORDER BY Categoria, Nombre_Prestacion");
        res.json(result.recordset);
    } catch (error) { 
        console.error("❌ Error en getCatalogoCompleto:", error);
        res.status(500).json({ status: "Error", message: error.message }); 
    }
};

// 2. GUARDAR O EDITAR PRESTACIÓN (CATÁLOGO)
const guardarOEditarPrestacion = async (req, res) => {
    const { id_prestacion, nombre, categoria, precio_base, activo } = req.body;
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, id_prestacion || 0)
            .input('nom', sql.VarChar, nombre)
            .input('cat', sql.VarChar, categoria || 'General')
            .input('precio', sql.Decimal(18, 2), precio_base)
            .input('act', sql.Bit, activo !== undefined ? activo : 1)
            .query(`
                IF EXISTS (SELECT 1 FROM Prestaciones WHERE ID_Prestacion = @id)
                BEGIN
                    UPDATE Prestaciones 
                    SET Nombre_Prestacion = @nom, Categoria = @cat, Precio_Base = @precio, Activo = @act 
                    WHERE ID_Prestacion = @id
                END
                ELSE
                BEGIN
                    INSERT INTO Prestaciones (Nombre_Prestacion, Categoria, Precio_Base, Activo) 
                    VALUES (@nom, @cat, @precio, 1)
                END
            `);
        res.json({ status: "Success", message: "Catálogo actualizado correctamente" });
    } catch (error) { 
        console.error("❌ Error en guardarOEditarPrestacion:", error);
        res.status(500).json({ status: "Error", message: error.message }); 
    }
};

// 2b. NUEVA PRESTACIÓN RÁPIDA
const guardarNuevaPrestacion = async (req, res) => {
    const { nombre, precio } = req.body;
    try {
        const pool = await getConnection();
        await pool.request()
            .input('nom', sql.VarChar, nombre)
            .input('precio', sql.Decimal(18, 2), precio)
            .query(`
                INSERT INTO Prestaciones (Nombre_Prestacion, Categoria, Precio_Base, Activo) 
                VALUES (@nom, 'General', @precio, 1)
            `);
        res.json({ status: "Success", message: "Servicio agregado al catálogo" });
    } catch (error) { 
        console.error("❌ Error en guardarNuevaPrestacion:", error);
        res.status(500).json({ status: "Error", message: error.message }); 
    }
};

// 3. ASIGNAR TRATAMIENTOS EN LOTE + GUARDAR MSP-024
const asignarTratamientosLote = async (req, res) => {
    const { 
        tratamientos, 
        firma_paciente, 
        consentimiento_aceptado, 
        consentimiento_revocatoria,
        especialidad,      // ← nuevo: especialidad (autodetectada/editable desde el front)
        observaciones,     // ← nuevo: observaciones libres del profesional
        representante,     // ← nuevo: { nombre, cedula, parentesco } (menor/no apto)
        requiere_representante // ← nuevo: 1 si firma el representante legal
    } = req.body;

    if (!tratamientos || !Array.isArray(tratamientos) || tratamientos.length === 0) {
        return res.status(400).json({ status: "Error", message: "No hay tratamientos para procesar" });
    }

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const idsInsertados = [];

        // ── A. INSERTAR CADA TRATAMIENTO ────────────────────────────────
        for (const t of tratamientos) {
            let nombreReal = t.nombre;
            if (!nombreReal) {
                const resultPresta = await transaction.request()
                    .input('idp', sql.Int, t.id_prestacion)
                    .query("SELECT Nombre_Prestacion FROM Prestaciones WHERE ID_Prestacion = @idp");
                nombreReal = resultPresta.recordset[0]?.Nombre_Prestacion || 'Tratamiento';
            }

            const resultPlan = await transaction.request()
                .input('paciente', sql.Int, t.id_paciente)
                .input('presta',   sql.Int, t.id_prestacion)
                .input('nombre_t', sql.NVarChar, nombreReal)
                .input('medico',   sql.Int, t.id_usuario_medico)
                .input('diente',   sql.Int, t.numero_diente || null)
                .input('caras',    sql.VarChar, t.caras || null)
                .input('p_lista',  sql.Decimal(18, 2), t.precio_lista)
                .input('desc',     sql.Decimal(18, 2), t.descuento || 0)
                .input('total',    sql.Decimal(18, 2), t.costo_total)
                .input('saldo',    sql.Decimal(18, 2), t.saldo_pendiente)
                .input('cie_cod',  sql.NVarChar, t.cie_cod || null)
                .input('cie_txt',  sql.NVarChar, t.cie_texto || null)
                .query(`
                    INSERT INTO Tratamientos_Plan 
                    (ID_Paciente, ID_Prestacion, Nombre_Tratamiento, ID_Medico, Numero_Diente, Caras, 
                     Precio_Lista, Descuento, Costo_Total, Saldo_Pendiente, Estado_Tratamiento, 
                     Fecha_Inicio, CIE_Cod, CIE_Texto)
                    VALUES 
                    (@paciente, @presta, @nombre_t, @medico, @diente, @caras, 
                     @p_lista, @desc, @total, @saldo, 'PENDIENTE', 
                     GETDATE(), @cie_cod, @cie_txt);

                    SELECT SCOPE_IDENTITY() AS ID_Plan_Generado;
                `);

            const nuevoIDPlan = resultPlan.recordset[0].ID_Plan_Generado;
            idsInsertados.push(nuevoIDPlan);

            // ── B. ESPEJAR EN ODONTOGRAMA (SI ES VISUAL) ────────────────
            const estadoVisual = obtenerEstadoVisual(nombreReal);
            if (estadoVisual && t.numero_diente) {
                await transaction.request()
                    .input('pac_odo',    sql.Int, t.id_paciente)
                    .input('die_odo',    sql.Int, t.numero_diente)
                    .input('cara_odo',   sql.NVarChar(20), t.caras || 'Centro')
                    .input('est_odo',    sql.NVarChar(50), estadoVisual)
                    .input('user_odo',   sql.Int, t.id_usuario_medico || 1)
                    .input('id_plan_odo',sql.Int, nuevoIDPlan)
                    .query(`
                        INSERT INTO Odontograma 
                        (ID_Paciente, Numero_Diente, Cara_Diente, Estado, Tipo_Registro, ID_Doctor, Fecha, ID_Plan_Tratamiento)
                        VALUES 
                        (@pac_odo, @die_odo, @cara_odo, @est_odo, 'Evolucion', @user_odo, GETDATE(), @id_plan_odo)
                    `);
            }
        }

        // ── C. JOIN CON USUARIOS PARA OBTENER DATOS DEL MÉDICO ──────────
        const idMedico = tratamientos[0].id_usuario_medico;
        const medResult = await transaction.request()
            .input('ID_Medico', sql.Int, idMedico)
            .query(`
                SELECT 
                    Nombres + ' ' + Apellidos          AS Nombre_Completo,
                    ISNULL(Registro_Sanitario, 'S/R')  AS Registro_MSP
                FROM Usuarios
                WHERE ID_Usuario = @ID_Medico
            `);
        const medico = medResult.recordset[0] || { Nombre_Completo: 'Sin asignar', Registro_MSP: 'S/R' };

        // ── H. OBTENER DATOS DE LA CLÍNICA ──────────────────────────────
        const clinicaRes = await transaction.request()
            .input('ID_Pac', sql.Int, tratamientos[0].id_paciente)
            .query(`
                SELECT C.Nombre_Clinica, C.RUC, C.Direccion, C.Ciudad,
                       C.Telefono AS Telefono_Clinicas, C.Logo_Ruta
                FROM Clinicas C
                INNER JOIN Pacientes P ON P.ID_Clinica = C.ID_Clinica
                WHERE P.ID_Paciente = @ID_Pac
            `);
        const clinica = clinicaRes.recordset[0] || {};

        // ── D. DETERMINAR TIPO DE SECCIÓN MSP-024 (C / D / E) ───────────
        let tipoSeccion = 'D';
        if (consentimiento_revocatoria == 1)   tipoSeccion = 'E';
        else if (consentimiento_aceptado == 1) tipoSeccion = 'C';

        // ── E. HASH DIGITAL DE TRAZABILIDAD ─────────────────────────────
        const hashBase    = `${tratamientos[0].id_paciente}-${idsInsertados.join(',')}-${Date.now()}`;
        const hashDigital = crypto.createHash('sha256').update(hashBase).digest('hex').toUpperCase().slice(0, 32);

        // ── F. SNAPSHOT JSON DE PROCEDIMIENTOS ──────────────────────────
        const snapshotJSON = JSON.stringify(
            tratamientos.map(t => ({
                nombre:        t.nombre,
                numero_diente: t.numero_diente || null,
                caras:         t.caras || null,
                costo_total:   t.costo_total,
                cie_cod:       t.cie_cod || null,
                cie_texto:     t.cie_texto || null,
            }))
        );

        // ── F2. ESPECIALIDAD (prioridad al valor enviado; si no, autodetectada) ──
        const especialidadFinal =
            (especialidad && especialidad.trim() !== '')
                ? especialidad.trim()
                : detectarEspecialidad(tratamientos);
        const observacionesFinal = (observaciones && observaciones.trim() !== '')
            ? observaciones.trim()
            : null;

        // ── F3. REPRESENTANTE LEGAL (solo si aplica: menor / no apto) ──
        const rep = representante || {};
        const aplicaRep = (requiere_representante == 1 || requiere_representante === true);
        const repNombre     = (aplicaRep && rep.nombre)     ? rep.nombre.trim()     : null;
        const repCedula     = (aplicaRep && rep.cedula)     ? rep.cedula.trim()     : null;
        const repParentesco = (aplicaRep && rep.parentesco) ? rep.parentesco.trim() : null;

        // ── G. INSERT EN MSP_024_Consentimiento_Informado ────────────────
        const mspResult = await transaction.request()
            .input('ID_Paciente',         sql.Int,                  tratamientos[0].id_paciente)
            .input('ID_Plan',             sql.Int,                  idsInsertados[0])
            .input('Aceptado',            sql.Bit,                  consentimiento_aceptado == 1 ? 1 : 0)
            .input('Revocatoria',         sql.Bit,                  consentimiento_revocatoria == 1 ? 1 : 0)
            .input('Hash_Digital',        sql.NVarChar(100),        hashDigital)
            .input('Firma_Paciente',      sql.NVarChar(sql.MAX),    firma_paciente || null)
            .input('ID_Medico',           sql.Int,                  idMedico)
            .input('Nombre_Medico_Snap',  sql.NVarChar(200),        medico.Nombre_Completo)
            .input('Registro_MSP_Snap',   sql.NVarChar(50),         medico.Registro_MSP)
            .input('Tipo_Seccion',        sql.Char(1),              tipoSeccion)
            .input('Procedimientos_JSON', sql.NVarChar(sql.MAX),    snapshotJSON)
            .input('CIE10_Codigo',        sql.NVarChar(20),         tratamientos[0].cie_cod || null)
            .input('CIE10_Descripcion',   sql.NVarChar(500),        tratamientos[0].cie_texto || null)
            .input('Especialidad',        sql.VarChar(60),          especialidadFinal)
            .input('Observaciones',       sql.NVarChar(sql.MAX),    observacionesFinal)
            .input('Rep_Nombre',          sql.NVarChar(150),        repNombre)
            .input('Rep_Cedula',          sql.VarChar(20),          repCedula)
            .input('Rep_Parentesco',      sql.VarChar(50),          repParentesco)
            .query(`
                INSERT INTO MSP_024_Consentimiento_Informado
                    (ID_Paciente, ID_Plan, Aceptado, Fecha_Firma, Revocatoria,
                     Hash_Digital, Firma_Paciente, ID_Medico, Nombre_Medico_Snap,
                     Registro_MSP_Snap, Tipo_Seccion, Procedimientos_JSON,
                     CIE10_Codigo, CIE10_Descripcion, Especialidad, Observaciones,
                     Rep_Nombre, Rep_Cedula, Rep_Parentesco)
                OUTPUT INSERTED.ID_Consentimiento
                VALUES
                    (@ID_Paciente, @ID_Plan, @Aceptado, GETDATE(), @Revocatoria,
                     @Hash_Digital, @Firma_Paciente, @ID_Medico, @Nombre_Medico_Snap,
                     @Registro_MSP_Snap, @Tipo_Seccion, @Procedimientos_JSON,
                     @CIE10_Codigo, @CIE10_Descripcion, @Especialidad, @Observaciones,
                     @Rep_Nombre, @Rep_Cedula, @Rep_Parentesco)
            `);

        const idConsentimiento = mspResult.recordset[0].ID_Consentimiento;

        await transaction.commit();

        res.json({ 
            status:            "Success", 
            message:           `${tratamientos.length} procedimiento(s) asignados. MSP-024 ID: ${idConsentimiento}`,
            ids_plan:          idsInsertados,
            id_consentimiento: idConsentimiento,
            hash_digital:      hashDigital,
            especialidad:      especialidadFinal,
            observaciones:     observacionesFinal,
            representante:     aplicaRep ? { nombre: repNombre, cedula: repCedula, parentesco: repParentesco } : null,
            requiere_representante: aplicaRep ? 1 : 0,
            // El frontend usa esto para mostrar el médico en el PDF sin otra llamada
            medico: {
                id:           idMedico,
                nombre:       medico.Nombre_Completo,
                registro_msp: medico.Registro_MSP
            },
            clinica: {
                nombre:    clinica.Nombre_Clinica   || '',
                ruc:       clinica.RUC              || '',
                direccion: clinica.Direccion        || '',
                ciudad:    clinica.Ciudad           || '',
                telefono:  clinica.Telefono_Clinicas|| '',
                logo:      clinica.Logo_Ruta        || ''
            }
        });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Error en asignarTratamientosLote:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 4. LISTAR TRATAMIENTOS (Incluyendo diagnóstico CIE-10)
const getTratamientosPorPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    t.ID_Plan, 
                    t.Fecha_Inicio,
                    ISNULL(t.Nombre_Tratamiento, p.Nombre_Prestacion) AS Nombre_Tratamiento,
                    t.Numero_Diente,
                    t.Caras,
                    t.Costo_Total,
                    t.Saldo_Pendiente,
                    t.Estado_Tratamiento,
                    t.CIE_Cod,
                    t.CIE_Texto,
                    ISNULL(U.Nombres + ' ' + U.Apellidos, 'No asignado') AS Nombre_Medico
                FROM Tratamientos_Plan t 
                INNER JOIN Prestaciones p ON t.ID_Prestacion = p.ID_Prestacion 
                LEFT JOIN Usuarios U ON t.ID_Medico = U.ID_Usuario
                WHERE t.ID_Paciente = @id 
                ORDER BY t.Fecha_Inicio DESC
            `);
        res.json(result.recordset);
    } catch (error) { 
        console.error("❌ Error en getTratamientosPorPaciente:", error);
        res.status(500).json({ status: "Error", message: error.message }); 
    }
};

// 5. ELIMINAR TRATAMIENTO
const eliminarTratamiento = async (req, res) => {
    try {
        const pool = await getConnection();
        const idPlan = req.params.id;

        const infoTratamiento = await pool.request()
            .input('id', sql.Int, idPlan)
            .query("SELECT Fecha_Inicio FROM Tratamientos_Plan WHERE ID_Plan = @id");

        if (infoTratamiento.recordset.length === 0) {
            return res.status(404).json({ status: "Error", message: "El tratamiento no existe." });
        }

        const { Fecha_Inicio } = infoTratamiento.recordset[0];

        const checkPago = await pool.request()
            .input('id', sql.Int, idPlan)
            .query("SELECT COUNT(*) as cuenta FROM Pagos WHERE ID_Plan = @id");

        if (checkPago.recordset[0].cuenta > 0) {
            return res.status(403).json({ 
                status: "Error", 
                message: "No se puede eliminar: Ya existen pagos vinculados a este tratamiento." 
            });
        }

        const checkCierre = await pool.request()
            .input('fecha', sql.DateTime, Fecha_Inicio)
            .query(`
                SELECT TOP 1 ID_Cierre 
                FROM CIERRES_FINANCIEROS 
                WHERE @fecha BETWEEN Periodo_Desde AND Periodo_Hasta 
                AND Estado = 'Cerrado'
            `);

        if (checkCierre.recordset.length > 0) {
            return res.status(403).json({ 
                status: "Error", 
                message: "No se puede eliminar: El periodo contable ya fue cerrado." 
            });
        }

        await pool.request()
            .input('id', sql.Int, idPlan)
            .query("DELETE FROM Tratamientos_Plan WHERE ID_Plan = @id");

        res.json({ status: "Success", message: "Tratamiento eliminado correctamente." });

    } catch (error) {
        console.error("❌ Error en eliminarTratamiento:", error);
        res.status(500).json({ status: "Error", message: "Error interno del servidor al procesar el borrado." });
    }
};

// 6. ELIMINAR PRESTACIÓN DEL CATÁLOGO
const eliminarPrestacionCatalogo = async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("UPDATE Prestaciones SET Activo = 0 WHERE ID_Prestacion = @id");
        res.json({ status: "Success", message: "Servicio retirado del catálogo" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 7. HISTORIAL DE CONSENTIMIENTOS MSP-024 POR PACIENTE
// Permite re-imprimir cualquier formulario desde el historial clínico
const getConsentimientosPorPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('ID_Paciente', sql.Int, req.params.id)
            .query(`
                SELECT TOP 20
                    ci.ID_Consentimiento,
                    ci.ID_Paciente,
                    ci.ID_Plan,
                    ci.Aceptado,
                    ci.Fecha_Firma,
                    ci.Revocatoria,
                    ci.Hash_Digital,
                    ci.Tipo_Seccion,
                    ci.Procedimientos_JSON,
                    ci.CIE10_Codigo,
                    ci.CIE10_Descripcion,
                    ci.Especialidad,
                    ci.Observaciones,
                    ci.Rep_Nombre,
                    ci.Rep_Cedula,
                    ci.Rep_Parentesco,
                    ci.Firma_Paciente,
                    -- Snap histórico tiene prioridad; si falta, JOIN en vivo
                    ISNULL(ci.Nombre_Medico_Snap, U.Nombres + ' ' + U.Apellidos) AS Nombre_Medico,
                    ISNULL(ci.Registro_MSP_Snap,  U.Registro_Sanitario)           AS Registro_MSP,
                    ci.ID_Medico
                FROM MSP_024_Consentimiento_Informado ci
                LEFT JOIN Usuarios U ON ci.ID_Medico = U.ID_Usuario
                WHERE ci.ID_Paciente = @ID_Paciente
                ORDER BY ci.Fecha_Firma DESC
            `);
        res.json({ status: "Success", data: result.recordset });
    } catch (error) {
        console.error("❌ Error en getConsentimientosPorPaciente:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = { 
    getCatalogoCompleto, 
    guardarOEditarPrestacion, 
    guardarNuevaPrestacion,
    asignarTratamientosLote,
    getTratamientosPorPaciente,
    eliminarTratamiento,
    eliminarPrestacionCatalogo,
    getConsentimientosPorPaciente   // ← NUEVA
};