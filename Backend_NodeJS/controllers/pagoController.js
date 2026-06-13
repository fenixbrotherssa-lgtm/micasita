const { getConnection, sql } = require('../config/db');

/**
 * REGISTRAR PAGO (TRANSACCIONAL)
 * Ajustado para usar la estructura real de SistemaOdonto_Pro
 */
const registrarPago = async (req, res) => {
    const { id_paciente, id_plan, monto, metodo, referencia, id_clinica, id_usuario_audit } = req.body;
    
    const rutaImagen = req.file ? `/uploads/vouchers/${req.file.filename}` : null; 

    if (!id_paciente || !id_plan || !monto || !id_usuario_audit) {
        return res.status(400).json({ 
            status: "Error", 
            message: "Datos incompletos. Se requiere Paciente, Plan, Monto y Usuario Cobrador." 
        });
    }

    try {
        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. BUSCAR O CREAR LA CAJA ABIERTA DEL USUARIO
            let cajaResult = await transaction.request()
                .input('user_id', sql.Int, id_usuario_audit)
                .input('clinica_id', sql.Int, id_clinica || 1)
                .query(`
                    SELECT TOP 1 ID_Caja 
                    FROM Caja 
                    WHERE ID_Usuario_Apertura = @user_id 
                      AND ID_Clinica = @clinica_id 
                      AND UPPER(TRIM(Estado)) = 'ABIERTA' 
                    ORDER BY Fecha_Apertura DESC
                `);

            let id_caja_real;

            if (cajaResult.recordset.length === 0) {
                const nuevaCaja = await transaction.request()
                    .input('u_id', sql.Int, id_usuario_audit)
                    .input('c_id', sql.Int, id_clinica || 1)
                    .query(`
                        INSERT INTO Caja (ID_Clinica, ID_Usuario_Apertura, Fecha_Apertura, Monto_Inicial, Estado, Monto_Sistema)
                        OUTPUT INSERTED.ID_Caja
                        VALUES (@c_id, @u_id, GETDATE(), 0, 'ABIERTA', 0)
                    `);
                id_caja_real = nuevaCaja.recordset[0].ID_Caja;
            } else {
                id_caja_real = cajaResult.recordset[0].ID_Caja;
            }

            // 2. INSERTAR EN TABLA 'Pagos'
            const pagoResult = await transaction.request()
                .input('id_paciente', sql.Int, id_paciente)
                .input('id_clinica', sql.Int, id_clinica || 1)
                .input('monto', sql.Decimal(18, 2), monto)
                .input('concepto', sql.NVarChar(200), `Abono a Plan #${id_plan}`)
                .input('metodo', sql.NVarChar(50), metodo || 'Efectivo')
                .input('id_caja', sql.Int, id_caja_real)
                .input('id_usuario', sql.Int, id_usuario_audit)
                .input('id_plan', sql.Int, id_plan)
                .input('ruta', sql.NVarChar(500), rutaImagen)
                .input('ref', sql.NVarChar(100), referencia || '')
                .query(`
                    INSERT INTO Pagos (
                        ID_Paciente, ID_Clinica, Monto, Concepto, Metodo_Pago, 
                        Fecha_Pago, ID_Caja, ID_Usuario, ID_Plan, Ruta_Voucher_Img, Referencia_Bancaria
                    ) 
                    OUTPUT INSERTED.ID_Pago
                    VALUES (
                        @id_paciente, @id_clinica, @monto, @concepto, @metodo, 
                        GETDATE(), @id_caja, @id_usuario, @id_plan, @ruta, @ref
                    )
                `);

            const id_pago_generado = pagoResult.recordset[0].ID_Pago;

            // 3. ACTUALIZAR SALDO EN 'Tratamientos_Plan'
            await transaction.request()
                .input('id_p', sql.Int, id_plan)
                .input('m', sql.Decimal(18, 2), monto)
                .query(`
                    UPDATE Tratamientos_Plan 
                    SET Saldo_Pendiente = Saldo_Pendiente - @m,
                        Estado_Tratamiento = CASE 
                            WHEN (Saldo_Pendiente - @m) <= 0.05 THEN 'PAGADO' 
                            ELSE Estado_Tratamiento 
                        END
                    WHERE ID_Plan = @id_p
                `);

            // 4. ACTUALIZAR TOTALES EN LA CAJA (Desglose por método)
            let columnaCaja = "Efectivo_Sistema";
            const metodoNormalizado = (metodo || 'Efectivo').toUpperCase();
            
            if (metodoNormalizado.includes('TRANSFERENCIA')) columnaCaja = "Transferencia_Sistema";
            if (metodoNormalizado.includes('TARJETA')) columnaCaja = "Tarjeta_Sistema";

            await transaction.request()
                .input('id_c', sql.Int, id_caja_real)
                .input('m_ingreso', sql.Decimal(18, 2), monto)
                .query(`
                    UPDATE Caja 
                    SET Monto_Sistema = ISNULL(Monto_Sistema, 0) + @m_ingreso,
                        ${columnaCaja} = ISNULL(${columnaCaja}, 0) + @m_ingreso
                    WHERE ID_Caja = @id_c;
                `);

            await transaction.commit();
            
            res.json({ 
                status: "Success", 
                message: "Pago registrado exitosamente.",
                id_pago: id_pago_generado,
                id_caja: id_caja_real
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (error) {
        console.error("❌ Error en registrarPago:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * GENERAR RECIBO PDF (Corregido con Logo_Ruta)
 */
const generarReciboPDF = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_pago', sql.Int, id)
            .query(`
                SELECT 
                    p.ID_Pago, p.Monto, p.Metodo_Pago, p.Fecha_Pago, p.Concepto, p.Referencia_Bancaria,
                    pac.Nombres, pac.Apellidos, pac.DNI AS Cedula,
                    clin.Nombre_Clinica, clin.RUC, 
                    clin.Logo_Ruta  -- <--- AGREGADO AQUÍ PARA QUE EL LOGO FUNCIONE
                FROM Pagos p
                INNER JOIN Pacientes pac ON p.ID_Paciente = pac.ID_Paciente
                INNER JOIN Clinicas clin ON p.ID_Clinica = clin.ID_Clinica
                WHERE p.ID_Pago = @id_pago
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: "Error", message: "Recibo no encontrado." });
        }

        res.json({
            success: true,
            titulo: "RECIBO DE PAGO",
            datos: result.recordset[0]
        });

    } catch (error) {
        console.error("❌ Error en generarReciboPDF:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * HISTORIAL DE PAGOS
 */
const getHistorialPagos = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id_paciente', sql.Int, id)
            .query(`
                SELECT 
                    p.ID_Pago, p.Monto, p.Metodo_Pago, p.Referencia_Bancaria, 
                    p.Ruta_Voucher_Img, p.Fecha_Pago, p.Concepto,
                    t.Nombre_Tratamiento
                FROM Pagos p
                LEFT JOIN Tratamientos_Plan t ON p.ID_Plan = t.ID_Plan
                WHERE p.ID_Paciente = @id_paciente
                ORDER BY p.Fecha_Pago DESC
            `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = { registrarPago, getHistorialPagos, generarReciboPDF };