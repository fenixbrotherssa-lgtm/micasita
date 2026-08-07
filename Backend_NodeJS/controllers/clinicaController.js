const { getConnection, sql } = require('../config/db');
const fs = require('fs');
const path = require('path');

// ================================================================
// CONFIGURACIÓN DE SEGURIDAD CRÍTICA (OFUSCADA EN PRODUCCIÓN)
// ================================================================
const DEV_AUTH = {
    MASTER_KEY: "Daviana1988", // Tu llave maestra
    PREGUNTAS: [
        { r: "mauricio" },    // Respuesta 1: Serie Placa
        { r: "19323254" },  // Respuesta 2: Modelo Servidor
        { r: "30112024" }   // Respuesta 3: Semilla Sistema
    ]
};

const guardarClinica = async (req, res) => {
    try {
        const { 
            id_clinica, nombre, ruc, direccion, ciudad, 
            telefono, latitud, longitud, 
            contribuyente_especial, obligado_contabilidad, regimen_rimpe, // Campos Tributarios
            auth_key, respuestas_dev 
        } = req.body;
        
        // VALIDACIÓN DE CAMPOS OBLIGATORIOS
        if (!nombre || nombre === 'undefined' || nombre.trim() === '') {
            return res.status(400).json({ 
                status: "Error", 
                message: "El campo 'Nombre_Clinica' es obligatorio." 
            });
        }

        const pool = await getConnection();
        const esEdicion = (id_clinica && id_clinica !== 'null' && id_clinica !== 'undefined' && id_clinica !== '');

        // ============================================================
        // BLOQUE DE SEGURIDAD PARA NUEVAS SEDES (EXPANSIÓN)
        // ============================================================
        if (!esEdicion) {
            if (auth_key !== DEV_AUTH.MASTER_KEY) {
                return res.status(403).json({ 
                    status: "Error", 
                    message: "ACCESO DENEGADO: MasterKey de Casrodsoft incorrecta." 
                });
            }

            const respuestasArray = JSON.parse(respuestas_dev || "[]");
            const esValido = DEV_AUTH.PREGUNTAS.every((pregunta, i) => {
                return respuestasArray[i] === pregunta.r;
            });

            if (!esValido) {
                return res.status(403).json({ 
                    status: "Error", 
                    message: "ACCESO DENEGADO: Las respuestas de seguridad no coinciden." 
                });
            }
            console.log("🔓 Autorización de Desarrollador confirmada para nueva sede.");
        }

        // Lógica del Logo
        let logo_final = req.body.logo_ruta || ''; 
        if (req.file) {
            logo_final = req.file.filename;
        }

        if (esEdicion) {
            // Borrar logo anterior si se sube uno nuevo
            if (req.file) {
                const consultaLogo = await pool.request()
                    .input('id', sql.Int, id_clinica)
                    .query("SELECT Logo_Ruta FROM Clinicas WHERE ID_Clinica = @id");

                if (consultaLogo.recordset.length > 0) {
                    const logoAnterior = consultaLogo.recordset[0].Logo_Ruta;
                    if (logoAnterior && logoAnterior !== logo_final) {
                        const rutaArchivoViejo = path.join(__dirname, '..', 'uploads', 'logos', logoAnterior);
                        if (fs.existsSync(rutaArchivoViejo)) {
                            fs.unlinkSync(rutaArchivoViejo);
                            console.log("✅ Archivo viejo eliminado:", logoAnterior);
                        }
                    }
                }
            }

            // --- ACTUALIZACIÓN INTEGRAL ---
            await pool.request()
                .input('id', sql.Int, id_clinica)
                .input('nombre', sql.NVarChar, nombre)
                .input('ruc', sql.NVarChar, ruc || null)
                .input('dir', sql.NVarChar, direccion || null)
                .input('ciudad', sql.NVarChar, ciudad || null)
                .input('logo', sql.NVarChar, logo_final)
                .input('tel', sql.NVarChar, telefono || null)
                .input('lat', sql.Float, latitud || null)
                .input('lng', sql.Float, longitud || null)
                .input('especial', sql.NVarChar, contribuyente_especial || null)
                .input('obligado', sql.NVarChar, obligado_contabilidad || 'NO')
                .input('rimpe', sql.NVarChar, regimen_rimpe || null)
                .query(`
                    UPDATE Clinicas 
                    SET Nombre_Clinica = @nombre, 
                        RUC = @ruc, 
                        Direccion = @dir, 
                        Ciudad = @ciudad, 
                        Logo_Ruta = @logo,
                        Telefono = @tel,
                        Latitud = @lat,
                        Longitud = @lng,
                        Contribuyente_Especial = @especial,
                        Obligado_Contabilidad = @obligado,
                        Regimen_Rimpe = @rimpe
                    WHERE ID_Clinica = @id
                `);
            
            return res.json({ status: "Success", message: "Sucursal actualizada correctamente" });
        } else {
            // --- INSERCIÓN INTEGRAL ---
            // OUTPUT INSERTED.ID_Clinica: el frontend lo necesita para poder guardar
            // especialidades/horarios de la sede recién creada en el mismo paso (antes no
            // había forma de saber qué ID le tocó sin una segunda consulta aparte).
            const insertResult = await pool.request()
                .input('nombre', sql.NVarChar, nombre)
                .input('ruc', sql.NVarChar, ruc || null)
                .input('dir', sql.NVarChar, direccion || null)
                .input('ciudad', sql.NVarChar, ciudad || null)
                .input('logo', sql.NVarChar, logo_final)
                .input('tel', sql.NVarChar, telefono || null)
                .input('lat', sql.Float, latitud || null)
                .input('lng', sql.Float, longitud || null)
                .input('especial', sql.NVarChar, contribuyente_especial || null)
                .input('obligado', sql.NVarChar, obligado_contabilidad || 'NO')
                .input('rimpe', sql.NVarChar, regimen_rimpe || null)
                .query(`
                    INSERT INTO Clinicas (
                        Nombre_Clinica, RUC, Direccion, Ciudad, Logo_Ruta,
                        Telefono, Latitud, Longitud, Activo, Fecha_Registro,
                        Contribuyente_Especial, Obligado_Contabilidad, Regimen_Rimpe
                    )
                    OUTPUT INSERTED.ID_Clinica
                    VALUES (
                        @nombre, @ruc, @dir, @ciudad, @logo,
                        @tel, @lat, @lng, 1, GETDATE(),
                        @especial, @obligado, @rimpe
                    )
                `);

            const nuevoId = insertResult.recordset[0].ID_Clinica;
            return res.json({ status: "Success", message: "Sucursal registrada correctamente", id_clinica: nuevoId });
        }
    } catch (error) {
        console.error("❌ Error en guardarClinica:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const obtenerClinica = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query("SELECT * FROM Clinicas WHERE ID_Clinica = @id");
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ status: "Error", message: "Clínica no encontrada" });
        }
    } catch (error) {
        console.error("❌ Error en obtenerClinica:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const listarClinicas = async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query("SELECT * FROM Clinicas WHERE Activo = 1 ORDER BY Nombre_Clinica ASC");
        res.json(result.recordset);
    } catch (error) {
        console.error("❌ Error en listarClinicas:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ================================================================
// ESPECIALIDADES (catálogo global + asignación por sede)
// Antes el bot de WhatsApp mostraba PRESTACIONES (servicios/tratamientos) como si fueran
// "especialidades" — esto es el concepto real de especialidad médica (Ortodoncia,
// Endodoncia, etc.), configurable por sede desde este módulo, nunca desde el bot.
// ================================================================
const listarEspecialidadesCatalogo = async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(
            "SELECT ID_Especialidad, Nombre_Especialidad FROM Especialidades WHERE Activo = 1 ORDER BY Nombre_Especialidad ASC"
        );
        res.json(result.recordset);
    } catch (error) {
        console.error("❌ Error en listarEspecialidadesCatalogo:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const crearEspecialidadCatalogo = async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ status: "Error", message: "El nombre de la especialidad es obligatorio." });
        }
        const pool = await getConnection();

        const existente = await pool.request()
            .input('nombre', sql.NVarChar, nombre.trim())
            .query("SELECT ID_Especialidad FROM Especialidades WHERE Nombre_Especialidad = @nombre");
        if (existente.recordset.length > 0) {
            return res.json({ status: "Success", id_especialidad: existente.recordset[0].ID_Especialidad });
        }

        const insertResult = await pool.request()
            .input('nombre', sql.NVarChar, nombre.trim())
            .query("INSERT INTO Especialidades (Nombre_Especialidad, Activo) OUTPUT INSERTED.ID_Especialidad VALUES (@nombre, 1)");
        res.json({ status: "Success", id_especialidad: insertResult.recordset[0].ID_Especialidad });
    } catch (error) {
        console.error("❌ Error en crearEspecialidadCatalogo:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const obtenerEspecialidadesClinica = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT E.ID_Especialidad, E.Nombre_Especialidad
                FROM Clinica_Especialidades CE
                INNER JOIN Especialidades E ON CE.ID_Especialidad = E.ID_Especialidad
                WHERE CE.ID_Clinica = @id
                ORDER BY E.Nombre_Especialidad ASC
            `);
        res.json(result.recordset);
    } catch (error) {
        console.error("❌ Error en obtenerEspecialidadesClinica:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// Reemplaza el set completo de especialidades de la sede (borra e inserta de nuevo) —
// más simple y confiable que calcular un diff, y el volumen por sede es mínimo.
const guardarEspecialidadesClinica = async (req, res) => {
    const { id } = req.params;
    const { ids_especialidad } = req.body; // array de ID_Especialidad
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Clinica_Especialidades WHERE ID_Clinica = @id");

        const lista = Array.isArray(ids_especialidad) ? ids_especialidad : [];
        for (const idEsp of lista) {
            await pool.request()
                .input('id', sql.Int, id)
                .input('idEsp', sql.Int, idEsp)
                .query("INSERT INTO Clinica_Especialidades (ID_Clinica, ID_Especialidad) VALUES (@id, @idEsp)");
        }
        res.json({ status: "Success", message: "Especialidades actualizadas correctamente" });
    } catch (error) {
        console.error("❌ Error en guardarEspecialidadesClinica:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ================================================================
// HORARIOS DE ATENCIÓN POR SEDE
// Reemplaza el texto fijo que el bot de WhatsApp respondía para todas las clínicas.
// Dia_Semana: 1=Lunes ... 7=Domingo.
// ================================================================
const obtenerHorariosClinica = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query("SELECT Dia_Semana, Hora_Apertura, Hora_Cierre, Cerrado FROM Clinica_Horarios WHERE ID_Clinica = @id ORDER BY Dia_Semana ASC");
        res.json(result.recordset);
    } catch (error) {
        console.error("❌ Error en obtenerHorariosClinica:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

const guardarHorariosClinica = async (req, res) => {
    const { id } = req.params;
    const { horarios } = req.body; // array de {dia, apertura, cierre, cerrado}
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, id).query("DELETE FROM Clinica_Horarios WHERE ID_Clinica = @id");

        const lista = Array.isArray(horarios) ? horarios : [];
        for (const h of lista) {
            await pool.request()
                .input('id', sql.Int, id)
                .input('dia', sql.TinyInt, h.dia)
                .input('apertura', sql.VarChar, h.cerrado ? null : (h.apertura || null))
                .input('cierre', sql.VarChar, h.cerrado ? null : (h.cierre || null))
                .input('cerrado', sql.Bit, !!h.cerrado)
                .query(`
                    INSERT INTO Clinica_Horarios (ID_Clinica, Dia_Semana, Hora_Apertura, Hora_Cierre, Cerrado)
                    VALUES (@id, @dia, @apertura, @cierre, @cerrado)
                `);
        }
        res.json({ status: "Success", message: "Horarios actualizados correctamente" });
    } catch (error) {
        console.error("❌ Error en guardarHorariosClinica:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = {
    guardarClinica, listarClinicas, obtenerClinica,
    listarEspecialidadesCatalogo, crearEspecialidadCatalogo,
    obtenerEspecialidadesClinica, guardarEspecialidadesClinica,
    obtenerHorariosClinica, guardarHorariosClinica
};