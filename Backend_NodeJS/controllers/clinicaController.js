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
            await pool.request()
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
                    VALUES (
                        @nombre, @ruc, @dir, @ciudad, @logo, 
                        @tel, @lat, @lng, 1, GETDATE(),
                        @especial, @obligado, @rimpe
                    )
                `);
            
            return res.json({ status: "Success", message: "Sucursal registrada correctamente" });
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

module.exports = { guardarClinica, listarClinicas, obtenerClinica };