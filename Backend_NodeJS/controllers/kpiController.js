const { getConnection, sql } = require('../config/db');

// Estados que cuentan como "cita atendida" (incluye variantes de género/sinónimos)
const ESTADOS_ATENDIDA = "'Atendida','Atendido','Finalizada','Finalizado','Completada','Completado','Realizada','Realizado'";
const ESTADOS_CANCELADA = "'Cancelada','Cancelado','No Asistió','No Asistio','Ausente'";

const kpiController = {
    getDashboardSuperKPI: async (req, res) => {
        const { id_clinica, fecha_inicio, fecha_fin, id_rol } = req.query;

        try {
            const pool = await getConnection();

            // Lista de clínicas (solo Admin rol 1) para el selector
            let listaClinicas = [];
            if (parseInt(id_rol) === 1) {
                const resCli = await pool.request()
                    .query(`SELECT ID_Clinica, Nombre_Clinica FROM Clinicas WHERE Activo = 1 ORDER BY Nombre_Clinica`);
                listaClinicas = resCli.recordset;
            }

            const reqBase = () => pool.request()
                .input('id_cli', sql.Int, id_clinica)
                .input('fIn', sql.Date, fecha_inicio)
                .input('fOut', sql.Date, fecha_fin);

            const [
                ingresosGastos,
                citasMetricas,
                carteraPendiente,
                topTratamientos,
                rankingDoctores,
                metodosPago,
                tendenciaIngresos,
                tendenciaGastos,
                topDeudores,
                stockAlerta,
                ticketInfo
            ] = await Promise.all([

                // 1. INGRESOS vs GASTOS
                reqBase().query(`
                    SELECT 
                        (SELECT ISNULL(SUM(Monto), 0) FROM Pagos 
                         WHERE ID_Clinica = @id_cli AND CAST(Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut AND NOT (ID_Plan IS NULL AND ID_Pago IN (SELECT ID_Pago_Origen FROM Facturacion_Documentos))) as Total_Ingresos,
                        (SELECT ISNULL(SUM(Monto), 0) FROM Gastos 
                         WHERE ID_Clinica = @id_cli AND CAST(Fecha AS DATE) BETWEEN @fIn AND @fOut) as Total_Gastos
                `),

                // 2. CITAS (totales, atendidas, canceladas, pacientes nuevos)
                reqBase().query(`
                    SELECT 
                        COUNT(ID_Cita) as Total_Citas,
                        SUM(CASE WHEN Estado IN (${ESTADOS_ATENDIDA}) THEN 1 ELSE 0 END) as Citas_Atendidas,
                        SUM(CASE WHEN Estado IN (${ESTADOS_CANCELADA}) THEN 1 ELSE 0 END) as Citas_Canceladas,
                        (SELECT COUNT(*) FROM Pacientes 
                         WHERE ID_Clinica = @id_cli AND CAST(Fecha_Registro AS DATE) BETWEEN @fIn AND @fOut) as Pacientes_Nuevos
                    FROM Citas 
                    WHERE ID_Clinica = @id_cli AND Fecha_Cita BETWEEN @fIn AND @fOut
                `),

                // 3. CARTERA PENDIENTE
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    SELECT ISNULL(SUM(Saldo_Pendiente), 0) as Total_Cartera 
                    FROM Tratamientos_Plan TP
                    JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                    WHERE P.ID_Clinica = @id_cli AND TP.Estado_Tratamiento != 'PAGADO'
                `),

                // 4. TOP SERVICIOS RENTABLES
                reqBase().query(`
                    SELECT TOP 6 Nombre_Tratamiento, SUM(Costo_Total) as Total_Generado, COUNT(*) as Veces
                    FROM Tratamientos_Plan TP
                    JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                    WHERE P.ID_Clinica = @id_cli 
                    AND CAST(TP.Fecha_Inicio AS DATE) BETWEEN @fIn AND @fOut
                    GROUP BY Nombre_Tratamiento
                    ORDER BY Total_Generado DESC
                `),

                // 5. RANKING DE DOCTORES MEJORADO (Rastreo 360: Citas + Planes + Pagos)
                reqBase().query(`
                    WITH CitasStats AS (
                        SELECT ID_Doctor,
                            COUNT(*) as Citas_Totales,
                            SUM(CASE WHEN Estado IN (${ESTADOS_ATENDIDA}) THEN 1 ELSE 0 END) as Citas_Atendidas
                        FROM Citas
                        WHERE ID_Clinica = @id_cli AND Fecha_Cita BETWEEN @fIn AND @fOut
                        GROUP BY ID_Doctor
                    ),
                    IngresosStats AS (
                        SELECT TP.ID_Medico, SUM(PG.Monto) as Ingresos_Generados
                        FROM Pagos PG
                        JOIN Tratamientos_Plan TP ON PG.ID_Plan = TP.ID_Plan
                        WHERE PG.ID_Clinica = @id_cli AND CAST(PG.Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut
                        GROUP BY TP.ID_Medico
                    ),
                    PacientesStats AS (
                        SELECT ID_Doctor, COUNT(DISTINCT ID_Paciente) AS Pacientes_Unicos
                        FROM (
                            -- Pacientes registrados vía cita formal
                            SELECT ID_Doctor, ID_Paciente
                            FROM Citas
                            WHERE ID_Clinica = @id_cli AND Fecha_Cita BETWEEN @fIn AND @fOut AND Estado IN (${ESTADOS_ATENDIDA})
                            UNION
                            -- Pacientes ingresados directo a plan de tratamiento (Walk-ins / Emergencias)
                            SELECT TP.ID_Medico AS ID_Doctor, TP.ID_Paciente
                            FROM Tratamientos_Plan TP
                            JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                            WHERE P.ID_Clinica = @id_cli AND CAST(TP.Fecha_Inicio AS DATE) BETWEEN @fIn AND @fOut
                            UNION
                            -- Pacientes con abonos/pagos generados a nombre del médico
                            SELECT TP.ID_Medico AS ID_Doctor, PG.ID_Paciente
                            FROM Pagos PG
                            JOIN Tratamientos_Plan TP ON PG.ID_Plan = TP.ID_Plan
                            WHERE PG.ID_Clinica = @id_cli AND CAST(PG.Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut
                        ) AS P_Unicos
                        WHERE ID_Doctor IS NOT NULL
                        GROUP BY ID_Doctor
                    )
                    SELECT 
                        U.ID_Usuario,
                        (U.Nombres + ' ' + U.Apellidos) as Doctor,
                        ISNULL(C.Citas_Totales, 0) as Citas_Totales,
                        ISNULL(C.Citas_Atendidas, 0) as Citas_Atendidas,
                        ISNULL(P.Pacientes_Unicos, 0) as Pacientes_Unicos,
                        ISNULL(I.Ingresos_Generados, 0) as Ingresos_Generados
                    FROM Usuarios U
                    LEFT JOIN CitasStats C ON U.ID_Usuario = C.ID_Doctor
                    LEFT JOIN IngresosStats I ON U.ID_Usuario = I.ID_Medico
                    LEFT JOIN PacientesStats P ON U.ID_Usuario = P.ID_Doctor
                    WHERE U.Activo = 1
                      AND (C.Citas_Totales > 0 OR I.Ingresos_Generados > 0 OR P.Pacientes_Unicos > 0)
                    ORDER BY Ingresos_Generados DESC, Pacientes_Unicos DESC, Citas_Atendidas DESC
                `),

                // 6. MÉTODOS DE PAGO (monto y cantidad por método)
                reqBase().query(`
                    SELECT 
                        CASE 
                            WHEN Metodo_Pago LIKE '%Efectivo%'      THEN 'Efectivo'
                            WHEN Metodo_Pago LIKE '%Transferencia%' THEN 'Transferencia'
                            WHEN Metodo_Pago LIKE '%Tarjeta%'       THEN 'Tarjeta'
                            ELSE 'Otro'
                        END as Metodo,
                        SUM(Monto) as Total,
                        COUNT(*)   as Cantidad
                    FROM Pagos
                    WHERE ID_Clinica = @id_cli AND CAST(Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut AND NOT (ID_Plan IS NULL AND ID_Pago IN (SELECT ID_Pago_Origen FROM Facturacion_Documentos))
                    GROUP BY 
                        CASE 
                            WHEN Metodo_Pago LIKE '%Efectivo%'      THEN 'Efectivo'
                            WHEN Metodo_Pago LIKE '%Transferencia%' THEN 'Transferencia'
                            WHEN Metodo_Pago LIKE '%Tarjeta%'       THEN 'Tarjeta'
                            ELSE 'Otro'
                        END
                `),

                // 7. TENDENCIA — Ingresos por día
                reqBase().query(`
                    SELECT CAST(Fecha_Pago AS DATE) as Dia, SUM(Monto) as Total
                    FROM Pagos
                    WHERE ID_Clinica = @id_cli AND CAST(Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut AND NOT (ID_Plan IS NULL AND ID_Pago IN (SELECT ID_Pago_Origen FROM Facturacion_Documentos))
                    GROUP BY CAST(Fecha_Pago AS DATE)
                    ORDER BY Dia
                `),

                // 8. TENDENCIA — Gastos por día
                reqBase().query(`
                    SELECT CAST(Fecha AS DATE) as Dia, SUM(Monto) as Total
                    FROM Gastos
                    WHERE ID_Clinica = @id_cli AND CAST(Fecha AS DATE) BETWEEN @fIn AND @fOut
                    GROUP BY CAST(Fecha AS DATE)
                    ORDER BY Dia
                `),

                // 9. TOP DEUDORES (por paciente)
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    SELECT TOP 8 
                        P.ID_Paciente,
                        (P.Nombres + ' ' + P.Apellidos) as Paciente,
                        SUM(TP.Saldo_Pendiente) as Saldo
                    FROM Tratamientos_Plan TP
                    JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                    WHERE P.ID_Clinica = @id_cli AND TP.Saldo_Pendiente > 0
                    GROUP BY P.ID_Paciente, P.Nombres, P.Apellidos
                    ORDER BY Saldo DESC
                `),

                // 10. ALERTA DE STOCK
                pool.request().input('id_cli', sql.Int, id_clinica).query(`
                    SELECT COUNT(*) as Stock_Alerta
                    FROM Inventario
                    WHERE ID_Clinica = @id_cli AND Cantidad <= Stock_Minimo AND Activo = 1
                `),

                // 11. TICKET PROMEDIO y nº de transacciones
                reqBase().query(`
                    SELECT 
                        ISNULL(AVG(Monto), 0) as Ticket_Promedio,
                        COUNT(*) as Total_Transacciones
                    FROM Pagos
                    WHERE ID_Clinica = @id_cli AND CAST(Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut AND NOT (ID_Plan IS NULL AND ID_Pago IN (SELECT ID_Pago_Origen FROM Facturacion_Documentos))
                `)
            ]);

            const fin = ingresosGastos.recordset[0];
            const ope = citasMetricas.recordset[0];
            const tk  = ticketInfo.recordset[0];

            const totalCitas = ope.Total_Citas || 0;
            const atendidas   = ope.Citas_Atendidas || 0;
            const canceladas  = ope.Citas_Canceladas || 0;

            const response = {
                status: "Success",
                clinicas: listaClinicas,

                financiero: {
                    ingresos: fin.Total_Ingresos,
                    gastos: fin.Total_Gastos,
                    balance: fin.Total_Ingresos - fin.Total_Gastos,
                    cartera_pendiente: carteraPendiente.recordset[0].Total_Cartera,
                    ticket_promedio: tk.Ticket_Promedio,
                    total_transacciones: tk.Total_Transacciones
                },

                operativo: {
                    citas_totales: totalCitas,
                    citas_atendidas: atendidas,
                    citas_canceladas: canceladas,
                    efectividad_citas: totalCitas > 0 ? ((atendidas / totalCitas) * 100).toFixed(1) : 0,
                    tasa_cancelacion: totalCitas > 0 ? ((canceladas / totalCitas) * 100).toFixed(1) : 0,
                    pacientes_nuevos: ope.Pacientes_Nuevos,
                    stock_alerta: stockAlerta.recordset[0].Stock_Alerta
                },

                doctores: rankingDoctores.recordset,
                metodos_pago: metodosPago.recordset,
                top_deudores: topDeudores.recordset,
                top_servicios: topTratamientos.recordset,

                tendencia: {
                    ingresos_por_dia: tendenciaIngresos.recordset,
                    gastos_por_dia: tendenciaGastos.recordset
                }
            };

            res.json(response);

        } catch (error) {
            console.error("🔴 Error KPI Multi-Clínica:", error.message);
            res.status(500).json({ 
                status: "Error", 
                message: "Error al generar métricas",
                dev_info: error.message 
            });
        }
    }
};

module.exports = kpiController;