﻿const { getConnection, sql } = require('../config/db');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');

/**
 * Obtiene el estado actual de la caja para el usuario y clínica
 * CORRECCIÓN: Filtrado por ID_Usuario para evitar mezcla de dinero entre cajeros
 */
const obtenerEstadoCaja = async (req, res) => {
    const { id_usuario, id_clinica } = req.query;

    try {
        const pool = await getConnection();

        // 1. Buscamos la última caja de este usuario hoy (esté ABIERTA o CERRADA)
        const cajaExistente = await pool.request()
            .input('id_u', sql.Int, id_usuario)
            .input('id_c', sql.Int, id_clinica)
            .query(`
                SELECT TOP 1 * FROM Caja 
                WHERE ID_Usuario_Apertura = @id_u 
                AND ID_Clinica = @id_c
                AND CAST(Fecha_Apertura AS DATE) = CAST(GETDATE() AS DATE)
                ORDER BY ID_Caja DESC
            `);

        // 2. Sumamos totales filtrando por usuario para no mezclar con otros cajeros
        // Esta lógica sobrevive a la reapertura porque se basa en el ID_Usuario y la Fecha
        const cobrosHoy = await pool.request()
            .input('id_u', sql.Int, id_usuario)
            .input('id_c', sql.Int, id_clinica)
            .query(`
                SELECT 
                    ISNULL(SUM(CASE WHEN Metodo_Pago LIKE '%Efectivo%' THEN Monto ELSE 0 END), 0) as Efectivo,
                    ISNULL(SUM(CASE WHEN Metodo_Pago LIKE '%Transferencia%' THEN Monto ELSE 0 END), 0) as Transferencia,
                    ISNULL(SUM(CASE WHEN Metodo_Pago LIKE '%Tarjeta%' THEN Monto ELSE 0 END), 0) as Tarjeta,
                    ISNULL(SUM(Monto), 0) as Total_Sistema
                FROM Pagos
                WHERE CAST(Fecha_Pago AS DATE) = CAST(GETDATE() AS DATE)
                AND ID_Clinica = @id_c
                AND ID_Usuario = @id_u
                AND ID_Paciente IS NOT NULL
            `);

        // 3. Detalle de vouchers filtrando también por usuario
        // NOTA: ID_Paciente IS NOT NULL excluye los pagos "fantasma" que crea
        // Factura Manual (crearPagoManual), que no representan dinero real de caja.
        const detalleVouchers = await pool.request()
            .input('id_u', sql.Int, id_usuario)
            .input('id_c', sql.Int, id_clinica)
            .query(`
                SELECT
                    ID_Pago, Monto, Metodo_Pago, Referencia_Bancaria,
                    Ruta_Voucher_Img, Fecha_Pago
                FROM Pagos
                WHERE CAST(Fecha_Pago AS DATE) = CAST(GETDATE() AS DATE)
                AND ID_Clinica = @id_c
                AND ID_Usuario = @id_u
                AND Metodo_Pago NOT LIKE '%Efectivo%'
                AND ID_Paciente IS NOT NULL
            `);

        res.json({
            status: "Success",
            caja: cajaExistente.recordset[0] || null,
            calculo_sistema: cobrosHoy.recordset[0],
            vouchers: detalleVouchers.recordset
        });

    } catch (error) {
        console.error("Error en obtenerEstadoCaja:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * Registra el arqueo de caja, cierra el turno y vincula los pagos
 */
const procesarCierreCaja = async (req, res) => {
    const { 
        id_usuario, id_clinica, monto_inicial, monto_final_real, 
        monto_sistema, efec_sistema, trans_sistema, tarj_sistema,
        efec_real, trans_real, tarj_real, 
        observaciones, desglose_json, nombre_usuario 
    } = req.body;

    try {
        const pool = await getConnection();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // ANTES esto siempre INSERTaba una fila 'CERRADA' nueva, dejando intacta la fila
            // 'ABIERTA' que registrarPago ya venía usando/acumulando para este cajero durante
            // el día. Esa fila huérfana quedaba "ABIERTA" hasta que el cron de las 23:00
            // (server.js) la atrapaba y la cerraba en falso como "SIN ARQUEO", con montos en
            // cero — un cierre fantasma duplicado cada noche por cada cajero que sí había
            // cerrado bien su turno horas antes. Ahora se busca esa fila y se actualiza in situ.
            const abierta = await transaction.request()
                .input('u_id', sql.Int, id_usuario)
                .input('c_id', sql.Int, id_clinica)
                .query(`
                    SELECT TOP 1 ID_Caja FROM Caja
                    WHERE ID_Usuario_Apertura = @u_id
                      AND ID_Clinica = @c_id
                      AND Estado = 'ABIERTA'
                    ORDER BY Fecha_Apertura DESC
                `);

            let id_generado;

            if (abierta.recordset.length > 0) {
                id_generado = abierta.recordset[0].ID_Caja;
                await transaction.request()
                    .input('id_caja', sql.Int, id_generado)
                    .input('m_ini', sql.Decimal(18,2), monto_inicial)
                    .input('m_sis', sql.Decimal(18,2), monto_sistema)
                    .input('m_real_total', sql.Decimal(18,2), monto_final_real)
                    .input('u_nom', sql.NVarChar, nombre_usuario)
                    .input('e_sis', sql.Decimal(18,2), efec_sistema)
                    .input('tr_sis', sql.Decimal(18,2), trans_sistema)
                    .input('ta_sis', sql.Decimal(18,2), tarj_sistema)
                    .input('e_real', sql.Decimal(18,2), efec_real)
                    .input('tr_real', sql.Decimal(18,2), trans_real)
                    .input('ta_real', sql.Decimal(18,2), tarj_real)
                    .input('obs', sql.NVarChar, observaciones)
                    .input('json', sql.NVarChar, desglose_json)
                    .query(`
                        UPDATE Caja SET
                            Fecha_Cierre = GETDATE(),
                            Monto_Inicial = @m_ini,
                            Monto_Sistema = @m_sis,
                            Monto_Final_Real = @m_real_total,
                            Estado = 'CERRADA',
                            Nombre_Usuario = @u_nom,
                            Efectivo_Sistema = @e_sis,
                            Transferencia_Sistema = @tr_sis,
                            Tarjeta_Sistema = @ta_sis,
                            Efectivo_Real = @e_real,
                            Transferencia_Real = @tr_real,
                            Tarjeta_Real = @ta_real,
                            Observaciones = @obs,
                            Desglose_JSON = @json
                        WHERE ID_Caja = @id_caja
                    `);
            } else {
                // Respaldo: si este cajero no tiene ninguna fila 'ABIERTA' hoy (ej. ya se
                // había cerrado antes, o cerró sin registrar ningún pago), se crea igual para
                // no perder el arqueo.
                const result = await transaction.request()
                    .input('u_id', sql.Int, id_usuario)
                    .input('c_id', sql.Int, id_clinica)
                    .input('m_ini', sql.Decimal(18,2), monto_inicial)
                    .input('m_sis', sql.Decimal(18,2), monto_sistema)
                    .input('m_real_total', sql.Decimal(18,2), monto_final_real)
                    .input('u_nom', sql.NVarChar, nombre_usuario)
                    .input('e_sis', sql.Decimal(18,2), efec_sistema)
                    .input('tr_sis', sql.Decimal(18,2), trans_sistema)
                    .input('ta_sis', sql.Decimal(18,2), tarj_sistema)
                    .input('e_real', sql.Decimal(18,2), efec_real)
                    .input('tr_real', sql.Decimal(18,2), trans_real)
                    .input('ta_real', sql.Decimal(18,2), tarj_real)
                    .input('obs', sql.NVarChar, observaciones)
                    .input('json', sql.NVarChar, desglose_json)
                    .query(`
                        INSERT INTO Caja (
                            ID_Clinica, ID_Usuario_Apertura, Fecha_Apertura, Fecha_Cierre,
                            Monto_Inicial, Monto_Sistema, Monto_Final_Real,
                            Estado, Nombre_Usuario,
                            Efectivo_Sistema, Transferencia_Sistema, Tarjeta_Sistema,
                            Efectivo_Real, Transferencia_Real, Tarjeta_Real,
                            Observaciones, Desglose_JSON
                        )
                        OUTPUT INSERTED.ID_Caja
                        VALUES (
                            @c_id, @u_id, GETDATE(), GETDATE(),
                            @m_ini, @m_sis, @m_real_total,
                            'CERRADA', @u_nom,
                            @e_sis, @tr_sis, @ta_sis,
                            @e_real, @tr_real, @ta_real,
                            @obs, @json
                        )
                    `);
                id_generado = result.recordset[0].ID_Caja;
            }

            // Corrige cualquier pago de HOY de este cajero que no haya quedado bien
            // vinculado (ej. datos previos a este fix, o casos borde) — ahora sí filtrado
            // por usuario, para no tocar pagos de otro cajero que cierre el mismo día.
            await transaction.request()
                .input('id_caja', sql.Int, id_generado)
                .input('id_c', sql.Int, id_clinica)
                .input('id_u', sql.Int, id_usuario)
                .query(`
                    UPDATE Pagos SET ID_Caja = @id_caja
                    WHERE CAST(Fecha_Pago AS DATE) = CAST(GETDATE() AS DATE)
                    AND ID_Clinica = @id_c
                    AND ID_Usuario = @id_u
                    AND ID_Paciente IS NOT NULL
                    AND (ID_Caja IS NULL OR ID_Caja <> @id_caja)
                `);

            await transaction.commit();

            res.json({ 
                status: "Success", 
                message: "Arqueo registrado exitosamente.",
                id_caja: id_generado 
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error("Error en procesarCierreCaja:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * Permite eliminar un arqueo para volver a operar (Solo Admin)
 */
const reabrirCaja = async (req, res) => {
    const { id_usuario_cajero, id_clinica, clave_admin } = req.body;

    try {
        const pool = await getConnection();
        const admins = await pool.request()
            .input('id_c', sql.Int, id_clinica)
            .query(`SELECT Password_Hash FROM Usuarios WHERE ID_Rol = 1 AND ID_Clinica = @id_c AND Activo = 1`);

        let autorizado = false;
        for (const admin of admins.recordset) {
            if (await bcrypt.compare(clave_admin, admin.Password_Hash)) {
                autorizado = true;
                break;
            }
        }

        if (!autorizado) return res.json({ status: "Error", message: "Clave de administrador incorrecta." });

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const cajaRow = await transaction.request()
                .input('id_u', sql.Int, id_usuario_cajero)
                .input('id_c', sql.Int, id_clinica)
                .query(`
                    SELECT TOP 1 ID_Caja FROM Caja 
                    WHERE ID_Usuario_Apertura = @id_u AND ID_Clinica = @id_c 
                    AND CAST(Fecha_Apertura AS DATE) = CAST(GETDATE() AS DATE)
                    ORDER BY ID_Caja DESC
                `);

            if (cajaRow.recordset.length > 0) {
                const id_reabrir = cajaRow.recordset[0].ID_Caja;

                // ANTES esto borraba la fila entera y desvinculaba sus pagos, perdiendo el
                // rastro de que ese arqueo existió. Ahora que el cierre (procesarCierreCaja)
                // actualiza la MISMA fila en vez de crear una nueva, reabrir hace lo simétrico:
                // la regresa a 'ABIERTA' (limpiando solo los datos del cierre) para que el
                // cajero pueda recontar y volver a cerrarla — sin tocar el vínculo de sus pagos.
                await transaction.request()
                    .input('id_caja', sql.Int, id_reabrir)
                    .query(`
                        UPDATE Caja SET
                            Estado = 'ABIERTA',
                            Fecha_Cierre = NULL,
                            Monto_Final_Real = NULL,
                            Efectivo_Real = NULL,
                            Transferencia_Real = NULL,
                            Tarjeta_Real = NULL,
                            Observaciones = CONCAT(ISNULL(Observaciones, ''), ' [REABIERTA]')
                        WHERE ID_Caja = @id_caja
                    `);

                await transaction.commit();
                res.json({ status: "Success", message: "Caja reabierta: vuelve a estar ABIERTA hasta que se cierre de nuevo.", id_caja: id_reabrir });
            } else {
                await transaction.rollback();
                res.json({ status: "Error", message: "No hay arqueo para reabrir." });
            }
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error("Error en reabrirCaja:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

/**
 * Genera la DATA del Reporte de Arqueo con Logo y limpieza de nombre
 */
const generarReportePDFCierre = async (req, res) => {
    const { id_caja } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id_caja)
            .query(`
                SELECT 
                    c.*, 
                    cl.Nombre_Clinica, 
                    cl.RUC, 
                    cl.Direccion, 
                    cl.Logo_Ruta 
                FROM Caja c
                LEFT JOIN Clinicas cl ON c.ID_Clinica = cl.ID_Clinica
                WHERE c.ID_Caja = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ status: "Error", message: "Arqueo no encontrado." });
        }

        const d = result.recordset[0];

        // Lógica de cálculo de filas (Efectivo, Transferencia, Tarjeta)
        const calcularFila = (sis, real) => {
            const s = parseFloat(sis || 0);
            const r = parseFloat(real || 0);
            const dif = r - s;
            return {
                sistema: s.toFixed(2),
                real: r.toFixed(2),
                diferencia: dif.toFixed(2),
                color: dif < 0 ? '#dc2626' : (dif > 0 ? '#059669' : '#64748b')
            };
        };

        const filas = {
            efectivo: calcularFila(d.Efectivo_Sistema, d.Efectivo_Real),
            transferencia: calcularFila(d.Transferencia_Sistema, d.Transferencia_Real),
            tarjeta: calcularFila(d.Tarjeta_Sistema, d.Tarjeta_Real)
        };

        const totSis = parseFloat(d.Monto_Sistema || 0);
        const totReal = parseFloat(d.Monto_Final_Real || 0);
        const totDif = totReal - totSis;

        // Limpieza de la coma rebelde y espacios en el nombre
        const nombreLimpio = d.Nombre_Clinica 
            ? d.Nombre_Clinica.toString().replace(/^,/, '').trim().toUpperCase() 
            : "MEDICINA ECUADOR PRO";

        // Procesamiento del desglose físico de billetes/monedas
        let desgloseFinal = [];
        if (d.Desglose_JSON) {
            try {
                const desglose = JSON.parse(d.Desglose_JSON);
                desgloseFinal = Object.keys(desglose)
                    .filter(k => desglose[k] > 0)
                    .map(den => {
                        const cant = desglose[den];
                        const val = parseFloat(den.replace('$', '').replace(',', '.'));
                        return { 
                            denominacion: den, 
                            cantidad: cant, 
                            subtotal: (cant * val).toFixed(2) 
                        };
                    });
            } catch (e) { 
                console.error("Error al parsear Desglose_JSON"); 
            }
        }

        res.json({
            status: "OK",
            datos: {
                clinica: {
                    nombre: nombreLimpio,
                    ruc: d.RUC || 'N/A',
                    direccion: d.Direccion || '',
                    logo: d.Logo_Ruta || null
                },
                info: {
                    id: d.ID_Caja,
                    responsable: d.Nombre_Usuario || 'N/A',
                    fecha: d.Fecha_Cierre ? new Date(d.Fecha_Cierre).toLocaleString() : 'N/A',
                    estado: d.Estado || 'CERRADA'
                },
                filas,
                totales: {
                    sistema: totSis.toFixed(2),
                    real: totReal.toFixed(2),
                    diferencia: totDif.toFixed(2),
                    color: totDif < 0 ? '#dc2626' : (totDif > 0 ? '#059669' : '#64748b')
                },
                desglose: desgloseFinal,
                observaciones: d.Observaciones || ""
            }
        });

    } catch (error) {
        console.error("Error en data de Caja:", error);
        if (!res.headersSent) {
            res.status(500).json({ status: "Error", message: "Error interno al procesar reporte" });
        }
    }
};

module.exports = { 
    obtenerEstadoCaja, 
    procesarCierreCaja, 
    reabrirCaja,
    generarReportePDFCierre
};