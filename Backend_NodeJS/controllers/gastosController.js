const { getConnection, sql } = require('../config/db');
const bcrypt = require('bcrypt');

const gastosController = {

    // ==========================================
    // 1. GESTIÓN DEL CATÁLOGO DE RUBROS
    // ==========================================
    getCategorias: async (req, res) => {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query("SELECT * FROM Gastos_Categorias WHERE Activo = 1 ORDER BY Nombre_Categoria");
            res.json(result.recordset);
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    guardarCategoria: async (req, res) => {
        const { id, nombre } = req.body;
        try {
            const pool = await getConnection();
            if (id) {
                await pool.request()
                    .input('id', sql.Int, id)
                    .input('nom', sql.NVarChar, nombre)
                    .query("UPDATE Gastos_Categorias SET Nombre_Categoria = @nom WHERE ID_Categoria = @id");
            } else {
                await pool.request()
                    .input('nom', sql.NVarChar, nombre)
                    .query("INSERT INTO Gastos_Categorias (Nombre_Categoria) VALUES (@nom)");
            }
            res.json({ status: "Success" });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    eliminarCategoria: async (req, res) => {
        try {
            const pool = await getConnection();
            await pool.request()
                .input('id', sql.Int, req.params.id)
                .query("UPDATE Gastos_Categorias SET Activo = 0 WHERE ID_Categoria = @id");
            res.json({ status: "Success" });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // ==========================================
    // 2. REGISTRO DE MOVIMIENTOS (CON VOUCHER)
    // ==========================================
    guardarGasto: async (req, res) => {
        try {
            const { ID_Clinica, ID_Usuario, Tipo, Categoria, Monto, Descripcion, Metodo_Pago, Referencia } = req.body;
            const rutaVoucher = req.file ? `/uploads/vouchers/${req.file.filename}` : null;

            const pool = await getConnection();

            // --- LÓGICA DE CIERRE: Validar si el periodo está bloqueado ---
            const checkCierre = await pool.request()
                .input('cli', sql.Int, ID_Clinica)
                .query(`SELECT TOP 1 ID_Cierre FROM Cierres_Financieros 
                        WHERE CAST(GETDATE() AS DATE) BETWEEN Periodo_Desde AND Periodo_Hasta 
                        AND ID_Clinica = @cli AND Estado = 'CERRADO'`);

            if (checkCierre.recordset.length > 0) {
                return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });
            }
            // -------------------------------------------------------------

            await pool.request()
                .input('cli', sql.Int, ID_Clinica)
                .input('usr', sql.Int, ID_Usuario)
                .input('tipo', sql.NVarChar, Tipo)
                .input('cat', sql.NVarChar, Categoria)
                .input('monto', sql.Decimal(9, 2), Monto)
                .input('desc', sql.NVarChar, Descripcion)
                .input('metodo', sql.NVarChar, Metodo_Pago || 'EFECTIVO')
                .input('ref', sql.NVarChar, Referencia || '')
                .input('img', sql.NVarChar, rutaVoucher)
                .query(`
                    INSERT INTO Gastos (
                        ID_Clinica, ID_Usuario, Tipo, Categoria, Monto, 
                        Descripcion, Metodo_Pago, Referencia, Fecha, Ruta_Voucher_Img
                    )
                    VALUES (
                        @cli, @usr, @tipo, @cat, @monto, 
                        @desc, @metodo, @ref, GETDATE(), @img
                    )
                `);

            res.json({ status: "Success", message: "Movimiento registrado correctamente" });
        } catch (error) {
            console.error("❌ Error al guardar gasto:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // ==========================================
    // 3. REPORTE ADMINISTRATIVO INTEGRAL
    // ==========================================
    reporteAdmin: async (req, res) => {
        try {
            const { id_clinica, fecha_inicio, fecha_fin } = req.query;
            const pool = await getConnection();
            
            const esTodas = (!id_clinica || id_clinica === "" || id_clinica === "null");
            const cli = esTodas ? null : parseInt(id_clinica);
            
            const f1 = fecha_inicio || '2000-01-01';
            const f2 = fecha_fin || '2099-12-31';

            const filtroP = esTodas ? "" : " AND Pac.ID_Clinica = @cli ";
            const filtroG = esTodas ? "" : " AND G.ID_Clinica = @cli ";
            const filtroC = esTodas ? "" : " AND C.ID_Clinica = @cli ";

            // A. CARTERA DEUDORA
            const resCartera = await pool.request()
                .input('cli', sql.Int, cli)
                .query(`
                    SELECT 
                        P.Nombres + ' ' + P.Apellidos AS Paciente,
                        TP.Nombre_Tratamiento AS Tratamiento,
                        TP.Saldo_Pendiente AS Deuda_Actual
                    FROM Tratamientos_Plan TP
                    INNER JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                    WHERE TP.Saldo_Pendiente > 0 ${esTodas ? "" : " AND P.ID_Clinica = @cli "}
                    ORDER BY TP.Saldo_Pendiente DESC
                `);

            // B. PRODUCCIÓN
            const resProd = await pool.request()
                .input('cli', sql.Int, cli)
                .input('f1', sql.Date, f1)
                .input('f2', sql.Date, f2)
                .query(`
                    SELECT SUM(TP.Costo_Total) as Total 
                    FROM Tratamientos_Plan TP
                    INNER JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                    WHERE CAST(TP.Fecha_Inicio AS DATE) BETWEEN @f1 AND @f2
                    ${esTodas ? "" : " AND P.ID_Clinica = @cli "}
                `);

            // C. PAGOS / RECAUDACIÓN (DE PACIENTES)
            const resPagos = await pool.request()
                .input('cli', sql.Int, cli)
                .input('f1', sql.Date, f1)
                .input('f2', sql.Date, f2)
                .query(`
                    SELECT 
                        P.ID_Pago, P.Monto, P.Metodo_Pago, P.Concepto, P.Fecha_Pago, P.Ruta_Voucher_Img,
                        U_Cobra.Nombres + ' ' + U_Cobra.Apellidos as Responsable,
                        ISNULL(TP.Nombre_Tratamiento, 'Abono General') as Tratamiento
                    FROM Pagos P
                    LEFT JOIN Usuarios U_Cobra ON P.ID_Usuario = U_Cobra.ID_Usuario
                    LEFT JOIN Tratamientos_Plan TP ON P.ID_Plan = TP.ID_Plan
                    INNER JOIN Pacientes Pac ON P.ID_Paciente = Pac.ID_Paciente
                    WHERE CAST(P.Fecha_Pago AS DATE) BETWEEN @f1 AND @f2 ${filtroP}
                `);

            // D. GASTOS E INGRESOS MANUALES (INCLUYE VOUCHER)
            const resManuales = await pool.request()
                .input('cli', sql.Int, cli)
                .input('f1', sql.Date, f1)
                .input('f2', sql.Date, f2)
                .query(`
                    SELECT G.ID_Gasto, G.Tipo, G.Categoria, G.Monto, G.Descripcion, G.Fecha, 
                           U.Nombres + ' ' + U.Apellidos as Responsable, G.Metodo_Pago, 
                           G.Referencia, G.Ruta_Voucher_Img
                    FROM Gastos G
                    LEFT JOIN Usuarios U ON G.ID_Usuario = U.ID_Usuario
                    WHERE CAST(G.Fecha AS DATE) BETWEEN @f1 AND @f2 ${filtroG}
                `);

            // E. ARQUEOS DE CAJA
            const resCaja = await pool.request()
                .input('cli', sql.Int, cli)
                .input('f1', sql.Date, f1)
                .input('f2', sql.Date, f2)
                .query(`
                    SELECT C.ID_Caja, C.Monto_Final_Real, U.Nombres + ' ' + U.Apellidos as Nombre_Usuario, 
                           C.Fecha_Apertura, C.Estado, C.Diferencia, C.Efectivo_Real, C.Transferencia_Real, C.Tarjeta_Real
                    FROM Caja C
                    LEFT JOIN Usuarios U ON C.ID_Usuario_Apertura = U.ID_Usuario
                    WHERE C.Estado = 'CERRADA' 
                    AND CAST(C.Fecha_Apertura AS DATE) BETWEEN @f1 AND @f2 ${filtroC}
                `);

            // F. PACIENTES ATENDIDOS
            const resAtendidos = await pool.request()
                .input('cli', sql.Int, cli)
                .input('f1', sql.Date, f1)
                .input('f2', sql.Date, f2)
                .query(`
                    SELECT COUNT(DISTINCT TP.ID_Paciente) AS Total
                    FROM Tratamientos_Plan TP
                    INNER JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                    WHERE CAST(TP.Fecha_Inicio AS DATE) BETWEEN @f1 AND @f2
                    ${esTodas ? "" : " AND P.ID_Clinica = @cli "}
                `);

            // G. INVENTARIO ACTUAL
            const filtroInv = esTodas ? "" : " WHERE ID_Clinica = @cli ";
            const resInventario = await pool.request()
                .input('cli', sql.Int, cli)
                .query(`
                    SELECT 
                        Nombre AS Nombre_Producto,
                        Tipo AS Categoria_Inventario,
                        Cantidad AS Stock_Actual,
                        ISNULL(Stock_Minimo, 0) AS Stock_Minimo,
                        (Cantidad * ISNULL(Precio_Unitario, 0)) AS Valor_Inversion
                    FROM Inventario
                    ${filtroInv}
                `);

            // --- PROCESAMIENTO UNIFICADO ---
            const pagos = resPagos.recordset || [];
            const manuales = resManuales.recordset || [];

            const movsPagos = pagos.map(p => ({
                ID_Referencia: p.ID_Pago,
                Origen: 'PACIENTE', 
                Tipo: 'Ingreso', 
                Categoria: (p.Metodo_Pago || 'OTRO').toUpperCase(),
                Monto: Number(p.Monto), 
                Descripcion: `${p.Concepto} | Trat: ${p.Tratamiento}`, 
                Fecha: p.Fecha_Pago, 
                Responsable: p.Responsable || 'SISTEMA',
                Ruta_Voucher_Img: p.Ruta_Voucher_Img
            }));

            const movsManuales = manuales.map(m => ({
                ID_Referencia: m.ID_Gasto, 
                Origen: m.Tipo === 'Egreso' ? 'ADMIN (GASTO)' : 'ADMIN (INGRESO)', 
                Tipo: m.Tipo, 
                Categoria: (m.Categoria || 'VARIO').toUpperCase(),
                Monto: Number(m.Monto), 
                Descripcion: `${m.Descripcion} ${m.Referencia ? '[Ref: '+m.Referencia+']' : ''}`, 
                Fecha: m.Fecha, 
                Responsable: m.Responsable || 'ADMIN',
                Ruta_Voucher_Img: m.Ruta_Voucher_Img
            }));

            const todosLosMovimientos = [...movsPagos, ...movsManuales]
                .sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

            const totalPagos = pagos.reduce((acc, cur) => acc + Number(cur.Monto), 0);
            const totalIngresosM = manuales.filter(m => m.Tipo === 'Ingreso').reduce((acc, cur) => acc + Number(cur.Monto), 0);
            const totalGastosM = manuales.filter(m => m.Tipo === 'Egreso').reduce((acc, cur) => acc + Number(cur.Monto), 0);

            res.json({
                resumen: {
                    totalProduccion: Number(resProd.recordset[0]?.Total) || 0,
                    totalRecaudado: totalPagos + totalIngresosM,
                    totalGastos: totalGastosM,
                    balanceNeto: (totalPagos + totalIngresosM) - totalGastosM,
                    pacientesAtendidos: resAtendidos.recordset[0]?.Total || 0,
                    desglose: {
                        efectivo: pagos.filter(p => (p.Metodo_Pago || '').toLowerCase().includes('efectivo')).reduce((acc, cur) => acc + Number(cur.Monto), 0),
                        banco: pagos.filter(p => (p.Metodo_Pago || '').toLowerCase().match(/trans|banc|depo/)).reduce((acc, cur) => acc + Number(cur.Monto), 0),
                        tarjeta: pagos.filter(p => (p.Metodo_Pago || '').toLowerCase().includes('tarje')).reduce((acc, cur) => acc + Number(cur.Monto), 0)
                    }
                },
                movimientos: todosLosMovimientos,
                arqueosDetalle: resCaja.recordset,
                pacientesDeudores: resCartera.recordset,
                inventario: resInventario.recordset
            });

        } catch (error) {
            console.error("❌ Error en reporteAdmin:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // ==========================================
    // 4. ELIMINAR GASTO CON AUTORIZACIÓN (ESTILO CAJA)
    // ==========================================
    eliminarGasto: async (req, res) => {
        const { id } = req.params;
        const { claveAutorizacion } = req.body || {};

        try {
            if (!claveAutorizacion) {
                return res.json({ status: "Error", message: "Se requiere clave de autorización." });
            }

            const pool = await getConnection();

            // Bloqueo por cierre antes de borrar
            const gInfo = await pool.request().input('id', sql.Int, id).query("SELECT Fecha, ID_Clinica FROM Gastos WHERE ID_Gasto = @id");
            if (gInfo.recordset.length > 0) {
                const check = await pool.request().input('f', sql.Date, gInfo.recordset[0].Fecha).input('c', sql.Int, gInfo.recordset[0].ID_Clinica)
                    .query("SELECT ID_Cierre FROM Cierres_Financieros WHERE @f BETWEEN Periodo_Desde AND Periodo_Hasta AND ID_Clinica = @c AND Estado = 'CERRADO'");
                if (check.recordset.length > 0) return res.json({ status: "Error", message: "Este movimiento pertenece a un periodo cerrado." });
            }

            const admins = await pool.request()
                .query("SELECT Password_Hash FROM Usuarios WHERE ID_Rol = 1 AND Activo = 1");

            let autorizado = false;
            for (const admin of admins.recordset) {
                if (await bcrypt.compare(claveAutorizacion, admin.Password_Hash)) {
                    autorizado = true;
                    break;
                }
            }

            if (!autorizado) {
                return res.json({ status: "Error", message: "Clave de administrador incorrecta." });
            }

            await pool.request()
                .input('id', sql.Int, id)
                .query("DELETE FROM Gastos WHERE ID_Gasto = @id");

            res.json({ status: "Success", message: "Gasto eliminado correctamente." });

        } catch (error) {
            console.error("❌ Error en eliminarGasto:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

   // ==========================================
    // 5. LÓGICA DE CIERRE FINANCIERO (ESTRICTO)
    // ==========================================
    ejecutarCierre: async (req, res) => {
        const { desde, hasta, id_clinica, id_usuario, comentarios } = req.body;
        try {
            const pool = await getConnection();

            // --- VALIDACIÓN DE SEGURIDAD BASADA EN TU TABLA 'CAJA' ---
            const cajasPendientes = await pool.request()
                .input('d', sql.Date, desde)
                .input('h', sql.Date, hasta)
                .input('c', sql.Int, id_clinica)
                .query(`
                    SELECT COUNT(*) as Pendientes 
                    FROM CAJA 
                    WHERE ID_Clinica = @c 
                    AND Estado = 'ABIERTA'
                    AND CAST(Fecha_Apertura AS DATE) BETWEEN @d AND @h
                `);

            if (cajasPendientes.recordset[0].Pendientes > 0) {
                return res.status(400).json({ 
                    status: "Error", 
                    message: `BLOQUEO DE SEGURIDAD: Existen ${cajasPendientes.recordset[0].Pendientes} turno(s) de caja sin cerrar (estado ABIERTA) en este periodo. Todos los cajeros deben realizar su arqueo antes del cierre financiero.` 
                });
            }

            // 1. Calcular recaudación real de pagos
            const resPagos = await pool.request()
                .input('d', sql.Date, desde)
                .input('h', sql.Date, hasta)
                .input('c', sql.Int, id_clinica)
                .query(`SELECT 
                    ISNULL(SUM(CASE WHEN Metodo_Pago LIKE '%EFECTIVO%' THEN Monto ELSE 0 END), 0) as Efectivo,
                    ISNULL(SUM(CASE WHEN Metodo_Pago LIKE '%TRANS%' OR Metodo_Pago LIKE '%BANC%' OR Metodo_Pago LIKE '%DEPO%' THEN Monto ELSE 0 END), 0) as Bancos,
                    ISNULL(SUM(CASE WHEN Metodo_Pago LIKE '%TARJE%' THEN Monto ELSE 0 END), 0) as Tarjetas,
                    ISNULL(SUM(Monto), 0) as Total_Pagos
                    FROM Pagos P 
                    INNER JOIN Pacientes Pac ON P.ID_Paciente = Pac.ID_Paciente
                    WHERE CAST(P.Fecha_Pago AS DATE) BETWEEN @d AND @h AND Pac.ID_Clinica = @c`);

            // 2. Calcular Ingresos y Egresos manuales (desde tabla Gastos)
            const resAdmin = await pool.request()
                .input('d', sql.Date, desde)
                .input('h', sql.Date, hasta)
                .input('c', sql.Int, id_clinica)
                .query(`SELECT 
                    ISNULL(SUM(CASE WHEN Tipo = 'Ingreso' THEN Monto ELSE 0 END), 0) as Ing_Manual,
                    ISNULL(SUM(CASE WHEN Tipo = 'Egreso' THEN Monto ELSE 0 END), 0) as Egresos
                    FROM Gastos 
                    WHERE CAST(Fecha AS DATE) BETWEEN @d AND @h AND ID_Clinica = @c`);

            const p = resPagos.recordset[0];
            const a = resAdmin.recordset[0];

            // 3. Insertar en CIERRES_FINANCIEROS (Nombres exactos de tus columnas)
            const resultadoInsercion = await pool.request()
                .input('d', sql.Date, desde)
                .input('h', sql.Date, hasta)
                .input('in', sql.Decimal(18,2), p.Total_Pagos + a.Ing_Manual)
                .input('out', sql.Decimal(18,2), a.Egresos)
                .input('efec', sql.Decimal(18,2), p.Efectivo)
                .input('ban', sql.Decimal(18,2), p.Bancos)
                .input('tar', sql.Decimal(18,2), p.Tarjetas)
                .input('cli', sql.Int, id_clinica)
                .input('usr', sql.Int, id_usuario)
                .input('obs', sql.NVarChar, comentarios || 'CIERRE MANUAL')
                .query(`INSERT INTO CIERRES_FINANCIEROS (
                            Periodo_Desde, 
                            Periodo_Hasta, 
                            Total_Ingresos, 
                            Total_Gastos, 
                            Efectivo_Real, 
                            Transferencia_Real, 
                            Tarjeta_Real, 
                            ID_Clinica, 
                            ID_Usuario_Cierra, 
                            Comentarios, 
                            Estado, 
                            Fecha_Cierre
                        )
                        OUTPUT INSERTED.ID_Cierre
                        VALUES (
                            @d, @h, @in, @out, @efec, @ban, @tar, @cli, @usr, @obs, 'CERRADO', GETDATE()
                        )`);

            res.json({ 
                status: "Success", 
                message: "Cierre financiero sellado exitosamente.",
                id_cierre: resultadoInsercion.recordset[0].ID_Cierre 
            });

        } catch (error) {
            console.error("Error en ejecutarCierre:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // ==========================================
    // 6. HISTORIAL Y DETALLE DE CIERRES
    // ==========================================

    // Listar todos los cierres realizados para la tabla de historial
    listarCierres: async (req, res) => {
        const { id_clinica } = req.query;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('cli', sql.Int, id_clinica)
                .query(`SELECT C.*, U.Nombres + ' ' + U.Apellidos as Nombre_Usuario 
                        FROM Cierres_Financieros C
                        LEFT JOIN Usuarios U ON C.ID_Usuario_Cierra = U.ID_Usuario
                        WHERE C.ID_Clinica = @cli
                        ORDER BY C.Fecha_Cierre DESC`);
            
            res.json(result.recordset);
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // Obtener los datos de UN cierre específico para el Ticket de impresión
    obtenerDetalleCierre: async (req, res) => {
        const { id } = req.params;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`SELECT C.*, 
                               U.Nombres + ' ' + U.Apellidos as Nombre_Usuario,
                               Cl.Nombre_Clinica,
                               Cl.Direccion as Direccion_Clinica,
                               Cl.Telefono as Telefono_Clinica
                        FROM Cierres_Financieros C
                        INNER JOIN Usuarios U ON C.ID_Usuario_Cierra = U.ID_Usuario
                        INNER JOIN Clinicas Cl ON C.ID_Clinica = Cl.ID_Clinica
                        WHERE C.ID_Cierre = @id`);
            
            if (result.recordset.length > 0) {
                res.json(result.recordset[0]);
            } else {
                res.status(404).json({ status: "Error", message: "Cierre no encontrado" });
            }
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    }
};

module.exports = gastosController;