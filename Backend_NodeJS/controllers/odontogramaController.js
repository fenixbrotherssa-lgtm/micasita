const { getConnection, sql } = require('../config/db');

/**
 * 1. GUARDAR O ACTUALIZAR (UPSERT con Transacción)
 * Incluye la patología 'Supernumerario' según norma MSP.
 */
const guardarHallazgo = async (req, res) => {
    const { hallazgos } = req.body;

    if (!hallazgos || !Array.isArray(hallazgos) || hallazgos.length === 0) {
        return res.status(400).json({ status: "Error", message: "Sin datos recibidos para sincronizar." });
    }

    try {
        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const h of hallazgos) {
                // MSP ECUADOR: Patologías iniciales incluyen Supernumerario (S)
                const patologias = [
                    'Caries', 'Fractura', 'Ausente', 'Raiz', 
                    'Extraer', 'Periodontitis', 'Ortodoncia', 'Supernumerario'
                ];
                
                const tipoReg = patologias.includes(h.estado) ? 'Inicial' : 'Evolucion';

                await transaction.request()
                    .input('paciente', sql.Int, h.id_paciente)
                    .input('diente', sql.Int, h.numero_diente)
                    .input('cara', sql.NVarChar(20), h.cara_diente)
                    .input('estado', sql.NVarChar(50), h.estado)
                    .input('tipo', sql.VarChar(20), h.tipo_registro || tipoReg)
                    .input('lado', sql.VarChar(15), h.lado_cara || 'Centro')
                    .input('plan', sql.Int, h.id_plan_tratamiento || null)
                    .input('obs', sql.NVarChar(sql.MAX), h.observaciones || '')
                    .input('user', sql.Int, h.id_usuario || 1)
                    .query(`
                        IF EXISTS (SELECT 1 FROM Odontograma WHERE ID_Paciente = @paciente AND Numero_Diente = @diente AND Cara_Diente = @cara)
                        BEGIN
                            UPDATE Odontograma SET 
                                Estado = @estado, 
                                Tipo_Registro = @tipo, 
                                Lado_Cara = @lado,
                                ID_Plan_Tratamiento = @plan, 
                                Observaciones = @obs, 
                                ID_Doctor = @user, 
                                Fecha = GETDATE()
                            WHERE ID_Paciente = @paciente AND Numero_Diente = @diente AND Cara_Diente = @cara
                        END
                        ELSE
                        BEGIN
                            INSERT INTO Odontograma (
                                ID_Paciente, Numero_Diente, Cara_Diente, Estado, 
                                Tipo_Registro, Lado_Cara, ID_Plan_Tratamiento, 
                                Observaciones, ID_Doctor, Fecha
                            )
                            VALUES (
                                @paciente, @diente, @cara, @estado, 
                                @tipo, @lado, @plan, 
                                @obs, @user, GETDATE()
                            )
                        END
                    `);
            }
            await transaction.commit();
            res.json({ status: "Success", message: "Sincronización completa con MedicinaEcuador Pro" });
        } catch (err) {
            await transaction.rollback();
            console.error("❌ Error en la transacción de guardado:", err.message);
            throw err;
        }
    } catch (error) {
        console.error("❌ Error en guardarHallazgo:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * 2. OBTENER ODONTOGRAMA + PERFIL
 */
const getOdontogramaPaciente = async (req, res) => {
    const { id_paciente } = req.params;

    if (!id_paciente || id_paciente === 'NaN') {
        return res.status(400).json({ status: "Error", message: "ID de paciente inválido" });
    }

    try {
        const pool = await getConnection();
        
        const [resPerfil, resOdo] = await Promise.all([
            pool.request().input('id', sql.Int, id_paciente).query(`
                SELECT *, 
                DATEDIFF(YEAR, Fecha_Nacimiento, GETDATE()) - 
                CASE WHEN (MONTH(Fecha_Nacimiento) > MONTH(GETDATE())) 
                OR (MONTH(Fecha_Nacimiento) = MONTH(GETDATE()) AND DAY(Fecha_Nacimiento) > DAY(GETDATE())) 
                THEN 1 ELSE 0 END AS Edad
                FROM Pacientes WHERE ID_Paciente = @id
            `),
            pool.request().input('id', sql.Int, id_paciente).query(`
                SELECT Numero_Diente, Cara_Diente, Estado, Tipo_Registro, Lado_Cara, ID_Plan_Tratamiento, Observaciones, Fecha,
                CASE 
                    WHEN Estado IN ('Resina', 'Corona', 'Obturado', 'Protesis', 'Sellante', 'Endodoncia') THEN 1 
                    ELSE 0 
                END AS Es_Sanado
                FROM Odontograma WHERE ID_Paciente = @id
            `)
        ]);

        if (resPerfil.recordset.length === 0) {
            return res.status(404).json({ status: "Error", message: "Paciente no encontrado" });
        }

        res.json({
            status: "Success",
            perfil: resPerfil.recordset[0],
            hallazgos: resOdo.recordset
        });
    } catch (error) {
        console.error("❌ Error en getOdontogramaPaciente:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * 3. ELIMINAR HALLAZGO
 */
const eliminarHallazgo = async (req, res) => {
    const { id_paciente, numero_diente, cara_diente } = req.body;
    
    if (!id_paciente || !numero_diente || !cara_diente) {
        return res.status(400).json({ status: "Error", message: "Faltan parámetros para la eliminación." });
    }

    try {
        const pool = await getConnection();
        await pool.request()
            .input('pac', sql.Int, id_paciente)
            .input('die', sql.Int, numero_diente)
            .input('cara', sql.VarChar(20), cara_diente)
            .query("DELETE FROM Odontograma WHERE ID_Paciente = @pac AND Numero_Diente = @die AND Cara_Diente = @cara");
            
        res.json({ status: "Success", message: "Registro eliminado correctamente" });
    } catch (error) {
        console.error("❌ Error en eliminarHallazgo:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = { 
    guardarHallazgo, 
    getOdontogramaPaciente, 
    eliminarHallazgo 
};