const { getConnection, sql } = require('../config/db');

// 1. GUARDAR PRESUPUESTO (CORREGIDO: Eliminada columna Email de Clinicas)
const guardarPresupuesto = async (req, res) => {
    const { id_paciente, id_clinica, id_usuario, detalle_json, total, observaciones } = req.body;
    
    // Validación de integridad de datos
    if (!id_paciente || !id_clinica || !id_usuario) {
        return res.status(400).json({ 
            status: "Error", 
            message: "Faltan datos obligatorios (Paciente, Clínica o Usuario)." 
        });
    }

    try {
        const pool = await getConnection();
        
        // Insertamos y recuperamos el registro con JOINs
        const result = await pool.request()
            .input('paciente', sql.Int, id_paciente)
            .input('clinica', sql.Int, id_clinica)
            .input('usuario', sql.Int, id_usuario)
            .input('detalle', sql.NVarChar, JSON.stringify(detalle_json))
            .input('total', sql.Decimal(9, 2), total)
            .input('obs', sql.NVarChar, observaciones || '')
            .query(`
                INSERT INTO Presupuestos (
                    ID_Paciente, ID_Clinica, ID_Usuario, Fecha, Detalle_JSON, Total, Estado, Observaciones
                )
                VALUES (
                    @paciente, @clinica, @usuario, GETDATE(), @detalle, @total, 'PENDIENTE', @obs
                );

                -- Recuperamos el presupuesto recién creado con datos de clínica y médico
                SELECT 
                    P.*, 
                    U.Nombres + ' ' + U.Apellidos as Nombre_Medico,
                    C.Nombre_Clinica,
                    C.RUC,
                    C.Logo_Ruta,
                    C.Direccion,
                    C.Telefono
                FROM Presupuestos P
                INNER JOIN Usuarios U ON P.ID_Usuario = U.ID_Usuario
                INNER JOIN Clinicas C ON P.ID_Clinica = C.ID_Clinica
                WHERE P.ID_Presupuesto = SCOPE_IDENTITY();
            `);

        const presupuestoCompleto = result.recordset[0];

        res.json({ 
            status: "Success", 
            message: "Presupuesto guardado correctamente",
            data: presupuestoCompleto 
        });

    } catch (error) {
        console.error("❌ Error en guardarPresupuesto:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 2. OBTENER PRESUPUESTOS POR PACIENTE (CORREGIDO: Eliminada columna Email de Clinicas)
const getPresupuestosPorPaciente = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT 
                    P.*, 
                    U.Nombres + ' ' + U.Apellidos as Nombre_Medico,
                    C.Nombre_Clinica,
                    C.RUC,
                    C.Logo_Ruta,
                    C.Direccion,
                    C.Telefono
                FROM Presupuestos P
                INNER JOIN Usuarios U ON P.ID_Usuario = U.ID_Usuario
                INNER JOIN Clinicas C ON P.ID_Clinica = C.ID_Clinica
                WHERE P.ID_Paciente = @id
                ORDER BY P.Fecha DESC
            `);
        res.json(result.recordset || []);
    } catch (error) {
        console.error("❌ Error en getPresupuestosPorPaciente:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 3. APROBAR PRESUPUESTO (TRANSACCIONAL - GENERA TRATAMIENTOS EN PLAN)
const aprobarPresupuesto = async (req, res) => {
    const { id_presupuesto } = req.params;
    const id_p = id_presupuesto || req.body.id_presupuesto;

    if (!id_p) {
        return res.status(400).json({ status: "Error", message: "ID de presupuesto no proporcionado." });
    }

    let pool;
    try {
        pool = await getConnection();
    } catch (err) {
        return res.status(500).json({ status: "Error", message: "Error de conexión a la base de datos." });
    }

    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const resultPresu = await transaction.request()
            .input('idp', sql.Int, id_p)
            .query("SELECT * FROM Presupuestos WHERE ID_Presupuesto = @idp AND Estado = 'PENDIENTE'");

        if (resultPresu.recordset.length === 0) {
            throw new Error("Presupuesto no encontrado o ya fue aprobado/cancelado.");
        }

        const presupuesto = resultPresu.recordset[0];
        const items = JSON.parse(presupuesto.Detalle_JSON);

        for (const item of items) {
            const cantidadReal = parseInt(item.cantidad) || 1;
            const costoTotalItem = parseFloat(item.costo_total) || 0;
            const costoUnitario = costoTotalItem / cantidadReal;
            const descuentoTotal = parseFloat(item.descuento) || 0;
            const descuentoUnitario = descuentoTotal / cantidadReal;

            for (let i = 0; i < cantidadReal; i++) {
                await transaction.request()
                    .input('paciente', sql.Int, presupuesto.ID_Paciente)
                    .input('presta', sql.Int, item.id_prestacion)
                    .input('nombre_t', sql.NVarChar, item.nombre)
                    .input('medico', sql.Int, presupuesto.ID_Usuario)
                    .input('diente', sql.Int, item.numero_diente || null)
                    .input('p_lista', sql.Decimal(9, 2), item.precio_lista)
                    .input('desc', sql.Decimal(9, 2), descuentoUnitario)
                    .input('total', sql.Decimal(9, 2), costoUnitario)
                    .query(`
                        INSERT INTO Tratamientos_Plan 
                        (ID_Paciente, ID_Prestacion, Nombre_Tratamiento, ID_Medico, Numero_Diente, 
                         Precio_Lista, Descuento, Costo_Total, Saldo_Pendiente, Estado_Tratamiento, Fecha_Inicio)
                        VALUES 
                        (@paciente, @presta, @nombre_t, @medico, @diente, @p_lista, @desc, @total, @total, 'PENDIENTE', GETDATE())
                    `);
            }
        }

        await transaction.request()
            .input('idp', sql.Int, id_p)
            .query("UPDATE Presupuestos SET Estado = 'APROBADO' WHERE ID_Presupuesto = @idp");

        await transaction.commit();
        res.json({ status: "Success", message: "Presupuesto aprobado y plan de tratamiento generado." });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Error en aprobarPresupuesto:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 4. ELIMINAR TRATAMIENTO (CON VALIDACIÓN DE PAGOS)
const eliminarTratamiento = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();

        const checkPagos = await pool.request()
            .input('id', sql.Int, id)
            .query("SELECT COUNT(*) as Total FROM Pagos WHERE ID_Plan = @id");

        if (checkPagos.recordset[0].Total > 0) {
            return res.status(400).json({ 
                status: "Error", 
                message: "No se puede eliminar: El tratamiento ya tiene abonos registrados." 
            });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query("DELETE FROM Tratamientos_Plan WHERE ID_Plan = @id");

        res.json({ status: "Success", message: "Tratamiento eliminado correctamente." });

    } catch (error) {
        console.error("❌ Error en eliminarTratamiento:", error);
        res.status(500).json({ status: "Error", message: "Error interno: " + error.message });
    }
};

module.exports = { 
    guardarPresupuesto, 
    getPresupuestosPorPaciente, 
    aprobarPresupuesto,
    eliminarTratamiento 
};