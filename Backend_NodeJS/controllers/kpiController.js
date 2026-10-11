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
                .input('fIn', sql.VarChar(10), fecha_inicio)
                .input('fOut', sql.VarChar(10), fecha_fin);

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
    },

    // ==========================================
    // DETALLE (drill-down) — al hacer clic en una métrica del tablero.
    // GET /kpi/detalle?tipo=...&valor=...&id_clinica=...&fecha_inicio=...&fecha_fin=...
    // Usa los MISMOS filtros que getDashboardSuperKPI para que la suma del detalle
    // cuadre con el número de la tarjeta.
    // ==========================================
    getDetalleKPI: async (req, res) => {
        const { tipo, valor, id_clinica, fecha_inicio, fecha_fin } = req.query;

        const PAGOS_OK = `CAST(PG.Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut
            AND NOT (PG.ID_Plan IS NULL AND PG.ID_Pago IN (SELECT ID_Pago_Origen FROM Facturacion_Documentos))`;
        const METODO_CASE = `CASE
                WHEN PG.Metodo_Pago LIKE '%Efectivo%'      THEN 'Efectivo'
                WHEN PG.Metodo_Pago LIKE '%Transferencia%' THEN 'Transferencia'
                WHEN PG.Metodo_Pago LIKE '%Tarjeta%'       THEN 'Tarjeta'
                ELSE 'Otro' END`;
        const SELECT_PAGOS = `
            SELECT TOP 1000 PG.Fecha_Pago AS Fecha,
                   ISNULL(P.Nombres + ' ' + P.Apellidos, '—') AS Paciente,
                   ISNULL(TP.Nombre_Tratamiento, PG.Concepto) AS Concepto,
                   PG.Metodo_Pago AS Metodo, PG.Monto
            FROM Pagos PG
            LEFT JOIN Pacientes P ON PG.ID_Paciente = P.ID_Paciente
            LEFT JOIN Tratamientos_Plan TP ON PG.ID_Plan = TP.ID_Plan`;
        const COLS_PAGOS = [
            { key: 'Fecha', label: 'Fecha', tipo: 'datetime' },
            { key: 'Paciente', label: 'Paciente' },
            { key: 'Concepto', label: 'Concepto / Tratamiento' },
            { key: 'Metodo', label: 'Método' },
            { key: 'Monto', label: 'Monto', tipo: 'money' }
        ];
        const SELECT_CITAS = `
            SELECT TOP 1000 C.Fecha_Cita AS Fecha, C.Hora_Inicio AS Hora,
                   ISNULL(P.Nombres + ' ' + P.Apellidos, '—') AS Paciente,
                   ISNULL(U.Nombres + ' ' + U.Apellidos, '—') AS Doctor,
                   C.Asunto, C.Estado
            FROM Citas C
            LEFT JOIN Pacientes P ON C.ID_Paciente = P.ID_Paciente
            LEFT JOIN Usuarios U ON C.ID_Doctor = U.ID_Usuario
            WHERE C.ID_Clinica = @id_cli AND C.Fecha_Cita BETWEEN @fIn AND @fOut`;
        const COLS_CITAS = [
            { key: 'Fecha', label: 'Fecha', tipo: 'date' },
            { key: 'Hora', label: 'Hora', tipo: 'time' },
            { key: 'Paciente', label: 'Paciente' },
            { key: 'Doctor', label: 'Doctor' },
            { key: 'Asunto', label: 'Asunto' },
            { key: 'Estado', label: 'Estado' }
        ];

        let titulo, columnas, query;
        switch (tipo) {
            case 'ingresos':
            case 'ticket':
                titulo = 'Ingresos del período';
                columnas = COLS_PAGOS;
                query = `${SELECT_PAGOS} WHERE PG.ID_Clinica = @id_cli AND ${PAGOS_OK} ORDER BY PG.Fecha_Pago DESC`;
                break;
            case 'metodo':
                titulo = `Pagos · ${valor}`;
                columnas = COLS_PAGOS;
                query = `${SELECT_PAGOS} WHERE PG.ID_Clinica = @id_cli AND ${PAGOS_OK} AND ${METODO_CASE} = @valor ORDER BY PG.Fecha_Pago DESC`;
                break;
            case 'doctor':
                titulo = 'Ingresos generados por el doctor';
                columnas = COLS_PAGOS;
                query = `${SELECT_PAGOS} WHERE PG.ID_Clinica = @id_cli AND CAST(PG.Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut
                         AND TP.ID_Medico = @valor_int ORDER BY PG.Fecha_Pago DESC`;
                break;
            case 'gastos':
                titulo = 'Gastos del período';
                columnas = [
                    { key: 'Fecha', label: 'Fecha', tipo: 'datetime' },
                    { key: 'Categoria', label: 'Categoría' },
                    { key: 'Descripcion', label: 'Descripción' },
                    { key: 'Metodo', label: 'Método' },
                    { key: 'Monto', label: 'Monto', tipo: 'money' }
                ];
                query = `SELECT TOP 1000 G.Fecha, ISNULL(G.Categoria, G.Tipo) AS Categoria, G.Descripcion,
                                G.Metodo_Pago AS Metodo, G.Monto
                         FROM Gastos G
                         WHERE G.ID_Clinica = @id_cli AND CAST(G.Fecha AS DATE) BETWEEN @fIn AND @fOut
                         ORDER BY G.Fecha DESC`;
                break;
            case 'balance':
                titulo = 'Balance diario (Ingresos − Gastos)';
                columnas = [
                    { key: 'Dia', label: 'Día', tipo: 'date' },
                    { key: 'Ingresos', label: 'Ingresos', tipo: 'money' },
                    { key: 'Gastos', label: 'Gastos', tipo: 'money' },
                    { key: 'Balance', label: 'Balance', tipo: 'money' }
                ];
                query = `
                    WITH I AS (SELECT CAST(PG.Fecha_Pago AS DATE) AS Dia, SUM(PG.Monto) AS Total
                               FROM Pagos PG WHERE PG.ID_Clinica = @id_cli AND ${PAGOS_OK}
                               GROUP BY CAST(PG.Fecha_Pago AS DATE)),
                         G AS (SELECT CAST(Fecha AS DATE) AS Dia, SUM(Monto) AS Total
                               FROM Gastos WHERE ID_Clinica = @id_cli AND CAST(Fecha AS DATE) BETWEEN @fIn AND @fOut
                               GROUP BY CAST(Fecha AS DATE))
                    SELECT ISNULL(I.Dia, G.Dia) AS Dia, ISNULL(I.Total, 0) AS Ingresos, ISNULL(G.Total, 0) AS Gastos,
                           ISNULL(I.Total, 0) - ISNULL(G.Total, 0) AS Balance
                    FROM I FULL OUTER JOIN G ON I.Dia = G.Dia
                    ORDER BY Dia DESC`;
                break;
            case 'dia':
                titulo = `Movimientos del ${valor}`;
                columnas = [
                    { key: 'Fecha', label: 'Fecha', tipo: 'datetime' },
                    { key: 'Tipo', label: 'Tipo' },
                    { key: 'Detalle', label: 'Detalle' },
                    { key: 'Metodo', label: 'Método' },
                    { key: 'Monto', label: 'Monto', tipo: 'money' }
                ];
                query = `
                    SELECT Fecha, Tipo, Detalle, Metodo, Monto FROM (
                        SELECT PG.Fecha_Pago AS Fecha, 'Ingreso' AS Tipo,
                               ISNULL(P.Nombres + ' ' + P.Apellidos, '—') + ' · ' + ISNULL(TP.Nombre_Tratamiento, ISNULL(PG.Concepto, '')) AS Detalle,
                               PG.Metodo_Pago AS Metodo, PG.Monto
                        FROM Pagos PG
                        LEFT JOIN Pacientes P ON PG.ID_Paciente = P.ID_Paciente
                        LEFT JOIN Tratamientos_Plan TP ON PG.ID_Plan = TP.ID_Plan
                        WHERE PG.ID_Clinica = @id_cli AND CAST(PG.Fecha_Pago AS DATE) = @dia
                          AND NOT (PG.ID_Plan IS NULL AND PG.ID_Pago IN (SELECT ID_Pago_Origen FROM Facturacion_Documentos))
                        UNION ALL
                        SELECT G.Fecha, 'Gasto', ISNULL(G.Categoria, G.Tipo) + ' · ' + ISNULL(G.Descripcion, ''),
                               G.Metodo_Pago, -G.Monto
                        FROM Gastos G
                        WHERE G.ID_Clinica = @id_cli AND CAST(G.Fecha AS DATE) = @dia
                    ) X ORDER BY Fecha`;
                break;
            case 'citas':
                titulo = 'Citas del período';
                columnas = COLS_CITAS;
                query = `${SELECT_CITAS} ORDER BY C.Fecha_Cita DESC, C.Hora_Inicio DESC`;
                break;
            case 'canceladas':
                titulo = 'Citas canceladas / no asistió';
                columnas = COLS_CITAS;
                query = `${SELECT_CITAS} AND C.Estado IN (${ESTADOS_CANCELADA}) ORDER BY C.Fecha_Cita DESC, C.Hora_Inicio DESC`;
                break;
            case 'cartera':
                titulo = 'Cartera pendiente';
                columnas = [
                    { key: 'Paciente', label: 'Paciente' },
                    { key: 'Tratamiento', label: 'Tratamiento' },
                    { key: 'Pieza', label: 'Pieza' },
                    { key: 'Fecha', label: 'Inicio', tipo: 'date' },
                    { key: 'Costo', label: 'Costo', tipo: 'money' },
                    { key: 'Saldo', label: 'Saldo', tipo: 'money' }
                ];
                query = `SELECT TOP 1000 (P.Nombres + ' ' + P.Apellidos) AS Paciente, TP.Nombre_Tratamiento AS Tratamiento,
                                TP.Numero_Diente AS Pieza, TP.Fecha_Inicio AS Fecha, TP.Costo_Total AS Costo, TP.Saldo_Pendiente AS Saldo
                         FROM Tratamientos_Plan TP
                         JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                         WHERE P.ID_Clinica = @id_cli AND TP.Estado_Tratamiento != 'PAGADO' AND TP.Saldo_Pendiente > 0
                         ORDER BY TP.Saldo_Pendiente DESC`;
                break;
            case 'deudor':
                titulo = 'Saldos pendientes del paciente';
                columnas = [
                    { key: 'Tratamiento', label: 'Tratamiento' },
                    { key: 'Pieza', label: 'Pieza' },
                    { key: 'Fecha', label: 'Inicio', tipo: 'date' },
                    { key: 'Estado', label: 'Estado' },
                    { key: 'Costo', label: 'Costo', tipo: 'money' },
                    { key: 'Saldo', label: 'Saldo', tipo: 'money' }
                ];
                query = `SELECT TP.Nombre_Tratamiento AS Tratamiento, TP.Numero_Diente AS Pieza, TP.Fecha_Inicio AS Fecha,
                                TP.Estado_Tratamiento AS Estado, TP.Costo_Total AS Costo, TP.Saldo_Pendiente AS Saldo
                         FROM Tratamientos_Plan TP
                         JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                         WHERE P.ID_Clinica = @id_cli AND TP.ID_Paciente = @valor_int AND TP.Saldo_Pendiente > 0
                         ORDER BY TP.Fecha_Inicio DESC`;
                break;
            case 'servicio':
                titulo = `Servicio · ${valor}`;
                columnas = [
                    { key: 'Fecha', label: 'Inicio', tipo: 'date' },
                    { key: 'Paciente', label: 'Paciente' },
                    { key: 'Doctor', label: 'Doctor' },
                    { key: 'Pieza', label: 'Pieza' },
                    { key: 'Costo', label: 'Costo', tipo: 'money' },
                    { key: 'Saldo', label: 'Saldo', tipo: 'money' }
                ];
                query = `SELECT TOP 1000 TP.Fecha_Inicio AS Fecha, (P.Nombres + ' ' + P.Apellidos) AS Paciente,
                                ISNULL(U.Nombres + ' ' + U.Apellidos, '—') AS Doctor, TP.Numero_Diente AS Pieza,
                                TP.Costo_Total AS Costo, TP.Saldo_Pendiente AS Saldo
                         FROM Tratamientos_Plan TP
                         JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                         LEFT JOIN Usuarios U ON TP.ID_Medico = U.ID_Usuario
                         WHERE P.ID_Clinica = @id_cli AND CAST(TP.Fecha_Inicio AS DATE) BETWEEN @fIn AND @fOut
                           AND TP.Nombre_Tratamiento = @valor
                         ORDER BY TP.Fecha_Inicio DESC`;
                break;
            case 'pacientes':
                titulo = 'Pacientes nuevos';
                columnas = [
                    { key: 'Fecha', label: 'Registro', tipo: 'date' },
                    { key: 'HC', label: 'H. Clínica' },
                    { key: 'Paciente', label: 'Paciente' },
                    { key: 'DNI', label: 'Cédula' },
                    { key: 'Telefono', label: 'Teléfono' }
                ];
                query = `SELECT TOP 1000 Fecha_Registro AS Fecha, Historial_Clinico_General AS HC,
                                (Nombres + ' ' + Apellidos) AS Paciente, DNI, Telefono
                         FROM Pacientes
                         WHERE ID_Clinica = @id_cli AND CAST(Fecha_Registro AS DATE) BETWEEN @fIn AND @fOut
                         ORDER BY Fecha_Registro DESC`;
                break;
            case 'stock':
                titulo = 'Inventario en alerta (stock ≤ mínimo)';
                columnas = [
                    { key: 'Nombre', label: 'Ítem' },
                    { key: 'Categoria', label: 'Categoría' },
                    { key: 'Ubicacion', label: 'Ubicación' },
                    { key: 'Cantidad', label: 'Cantidad', tipo: 'number' },
                    { key: 'Stock_Minimo', label: 'Mínimo', tipo: 'number' }
                ];
                query = `SELECT Nombre, Categoria, Ubicacion, Cantidad, Stock_Minimo
                         FROM Inventario
                         WHERE ID_Clinica = @id_cli AND Cantidad <= Stock_Minimo AND Activo = 1
                         ORDER BY Cantidad ASC`;
                break;
            default:
                return res.status(400).json({ status: "Error", message: "Tipo de detalle no válido." });
        }

        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_cli', sql.Int, id_clinica)
                .input('fIn', sql.VarChar(10), fecha_inicio)
                .input('fOut', sql.VarChar(10), fecha_fin)
                .input('valor', sql.NVarChar(300), valor || '')
                .input('valor_int', sql.Int, parseInt(valor) || 0)
                .input('dia', sql.VarChar(10), tipo === 'dia' ? valor : fecha_inicio)
                .query(query);
            res.json({ status: "Success", titulo, columnas, filas: result.recordset });
        } catch (error) {
            console.error("🔴 Error KPI detalle:", error.message);
            res.status(500).json({ status: "Error", message: "Error al obtener el detalle", dev_info: error.message });
        }
    }
};

module.exports = kpiController;