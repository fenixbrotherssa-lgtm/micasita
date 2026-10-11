const { getConnection, sql } = require('../config/db');
const {
    obtenerParametrosLaborales, calcularRolMensual, obtenerInfoDecimoCuarto, calcularLiquidacionFinal
} = require('../services/nominaService');

// ==========================================================================
// NÓMINA DE PERSONAL — portado de MasterHotel/OMNI CORE.
// Conexión con finanzas: todo dinero que sale (adelanto, bono, horas, pago de rol,
// liquidación final) se registra como EGRESO en la tabla Gastos (el mismo registro del
// módulo "Ingresos y Gastos", que también alimenta el KPI y respeta el Cierre Financiero).
// El DESCUENTO nunca mueve dinero: solo resta del neto a pagar.
// ==========================================================================

const CATEGORIA_DEFECTO = 'Nómina y Personal';
const TIPOS_CON_SALIDA_DINERO = ['ADELANTO', 'BONO', 'HORAS_SUPLEMENTARIAS', 'HORAS_EXTRAORDINARIAS'];
// Art. 55 Código de Trabajo: suplementarias +50%, extraordinarias +100%. Valor hora = salario / 240.
const RECARGO_HORAS = { HORAS_SUPLEMENTARIAS: 1.5, HORAS_EXTRAORDINARIAS: 2.0 };
const ETIQUETA = {
    ADELANTO: 'Adelanto de nómina', BONO: 'Bono / incentivo', DESCUENTO: 'Descuento',
    HORAS_SUPLEMENTARIAS: 'Horas suplementarias', HORAS_EXTRAORDINARIAS: 'Horas extraordinarias',
    PAGO_NOMINA: 'Pago de nómina', LIQUIDACION_FINAL: 'Liquidación final'
};

const soloAdmin = (req, res) => {
    if (parseInt(req.usuarioAuth?.id_rol) !== 1) {
        res.status(403).json({ status: "Error", message: "Solo el administrador puede gestionar la nómina." });
        return false;
    }
    return true;
};
const periodoValido = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''));
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));

// Mismo bloqueo que Gastos: no se registran egresos en un período con Cierre Financiero.
async function periodoBloqueado(pool, idClinica) {
    const r = await pool.request().input('cli', sql.Int, idClinica).query(`
        SELECT TOP 1 ID_Cierre FROM Cierres_Financieros
        WHERE CAST(GETDATE() AS DATE) BETWEEN Periodo_Desde AND Periodo_Hasta
          AND ID_Clinica = @cli AND Estado = 'CERRADO'`);
    return r.recordset.length > 0;
}

// Egreso en Gastos dentro de la transacción; devuelve el ID_Gasto.
async function registrarEgreso(transaction, { idClinica, idUsuario, categoria, monto, descripcion, metodo, referencia }) {
    const r = await transaction.request()
        .input('cli', sql.Int, idClinica)
        .input('usr', sql.Int, idUsuario || null)
        .input('cat', sql.NVarChar, categoria || CATEGORIA_DEFECTO)
        .input('monto', sql.Decimal(9, 2), monto)
        .input('desc', sql.NVarChar, descripcion)
        .input('met', sql.NVarChar, (metodo || 'EFECTIVO').toUpperCase())
        .input('ref', sql.NVarChar, referencia || '')
        .query(`
            INSERT INTO Gastos (ID_Clinica, ID_Usuario, Tipo, Categoria, Monto, Descripcion, Metodo_Pago, Referencia, Fecha)
            OUTPUT INSERTED.ID_Gasto
            VALUES (@cli, @usr, 'Egreso', @cat, @monto, @desc, @met, @ref, GETDATE())`);
    return r.recordset[0].ID_Gasto;
}

// Totales de movimientos de un empleado en un período. Bonos/horas ya pagados aparte
// (ID_Gasto no nulo) NO entran al rol: ya salieron de caja — evita el doble pago.
async function movimientosDelPeriodo(pool, idPersonal, periodo) {
    const r = await pool.request()
        .input('pid', sql.Int, idPersonal).input('periodo', sql.VarChar(7), periodo)
        .query(`
            SELECT
                ISNULL(SUM(CASE WHEN Tipo = 'ADELANTO'  THEN Monto ELSE 0 END), 0) AS Adelantos,
                ISNULL(SUM(CASE WHEN Tipo = 'BONO' AND ID_Gasto IS NULL THEN Monto ELSE 0 END), 0) AS Bonos,
                ISNULL(SUM(CASE WHEN Tipo = 'DESCUENTO' THEN Monto ELSE 0 END), 0) AS Descuentos,
                ISNULL(SUM(CASE WHEN Tipo IN ('HORAS_SUPLEMENTARIAS','HORAS_EXTRAORDINARIAS') AND ID_Gasto IS NULL THEN Monto ELSE 0 END), 0) AS HorasExtra
            FROM Movimientos_Personal
            WHERE ID_Personal = @pid AND Periodo = @periodo AND Tipo NOT IN ('PAGO_NOMINA','LIQUIDACION_FINAL')`);
    return r.recordset[0];
}

async function regionClinica(pool, idClinica) {
    const r = await pool.request().input('cli', sql.Int, idClinica)
        .query(`SELECT Region_Decimo_Cuarto, Nombre_Clinica FROM Clinicas WHERE ID_Clinica = @cli`);
    return r.recordset[0] || {};
}

const personalController = {

    // GET /personal/lista?id_clinica=
    getLista: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const r = await pool.request().input('cli', sql.Int, req.query.id_clinica || 0).query(`
                SELECT p.*,
                    ISNULL((SELECT SUM(Monto) FROM Movimientos_Personal m
                            WHERE m.ID_Personal = p.ID_Personal AND m.Tipo = 'ADELANTO'), 0) AS Total_Adelantos
                FROM Personal p
                WHERE p.ID_Clinica = @cli AND p.Activo = 1
                ORDER BY p.Nombre_Completo`);
            const cli = await regionClinica(pool, req.query.id_clinica || 0);
            res.json({ status: "Success", data: r.recordset, region: cli.Region_Decimo_Cuarto || null, clinica: cli.Nombre_Clinica || '' });
        } catch (error) {
            console.error("❌ Error lista personal:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/guardar
    guardar: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const b = req.body;
        if (!b.nombre_completo || String(b.nombre_completo).trim().length < 3 || !b.id_clinica) {
            return res.status(400).json({ status: "Error", message: "Nombre completo y clínica son obligatorios." });
        }
        if (b.fecha_ingreso && !fechaValida(b.fecha_ingreso)) {
            return res.status(400).json({ status: "Error", message: "Fecha de ingreso inválida." });
        }
        try {
            const pool = await getConnection();
            const rq = pool.request()
                .input('cli', sql.Int, b.id_clinica)
                .input('nom', sql.NVarChar(200), String(b.nombre_completo).trim())
                .input('ced', sql.NVarChar(20), b.cedula || null)
                .input('cargo', sql.NVarChar(100), b.cargo || null)
                .input('sal', sql.Decimal(10, 2), parseFloat(b.salario_base) || 0)
                // VarChar: con useUTC:false un string en sql.Date se guarda un día antes.
                .input('ing', sql.VarChar(10), b.fecha_ingreso || null)
                .input('tel', sql.NVarChar(30), b.telefono || null)
                .input('mail', sql.NVarChar(150), b.correo || null)
                .input('iess', sql.Bit, !!b.afiliado_iess)
                .input('d13', sql.Bit, !!b.decimo_tercero_mensualizado)
                .input('d14', sql.Bit, !!b.decimo_cuarto_mensualizado)
                .input('fr', sql.Bit, !!b.fondo_reserva_mensualizado);
            if (b.id_personal) {
                await rq.input('id', sql.Int, b.id_personal).query(`
                    UPDATE Personal SET Nombre_Completo=@nom, Cedula=@ced, Cargo=@cargo, Salario_Base=@sal,
                        Fecha_Ingreso=@ing, Telefono=@tel, Correo=@mail, Afiliado_IESS=@iess,
                        Decimo_Tercero_Mensualizado=@d13, Decimo_Cuarto_Mensualizado=@d14, Fondo_Reserva_Mensualizado=@fr
                    WHERE ID_Personal = @id AND ID_Clinica = @cli`);
            } else {
                await rq.query(`
                    INSERT INTO Personal (ID_Clinica, Nombre_Completo, Cedula, Cargo, Salario_Base, Fecha_Ingreso,
                        Telefono, Correo, Afiliado_IESS, Decimo_Tercero_Mensualizado, Decimo_Cuarto_Mensualizado, Fondo_Reserva_Mensualizado)
                    VALUES (@cli, @nom, @ced, @cargo, @sal, @ing, @tel, @mail, @iess, @d13, @d14, @fr)`);
            }
            res.json({ status: "Success", message: "Empleado guardado." });
        } catch (error) {
            console.error("❌ Error guardar personal:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/:id/desactivar
    desactivar: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            await pool.request().input('id', sql.Int, req.params.id)
                .query(`UPDATE Personal SET Activo = 0 WHERE ID_Personal = @id`);
            res.json({ status: "Success", message: "Empleado desactivado." });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /personal/:id/historial
    getHistorial: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const r = await pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT * FROM Movimientos_Personal WHERE ID_Personal = @id ORDER BY Fecha_Movimiento DESC`);
            res.json({ status: "Success", data: r.recordset });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/movimiento
    // { id_personal, id_clinica, tipo, monto | horas, descripcion, periodo, registrar_pago, metodo_pago, categoria }
    registrarMovimiento: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const { id_personal, id_clinica, tipo, monto, horas, descripcion, periodo, registrar_pago, metodo_pago, categoria } = req.body;
        const esHoras = !!RECARGO_HORAS[tipo];
        if (!ETIQUETA[tipo] || ['PAGO_NOMINA', 'LIQUIDACION_FINAL'].includes(tipo)) {
            return res.status(400).json({ status: "Error", message: "Tipo de movimiento inválido." });
        }
        if (!id_personal || !id_clinica || (!esHoras && !(parseFloat(monto) > 0)) || (esHoras && !(parseFloat(horas) > 0))) {
            return res.status(400).json({ status: "Error", message: esHoras ? "Indique las horas." : "Indique un monto mayor a 0." });
        }
        if (!periodoValido(periodo)) return res.status(400).json({ status: "Error", message: "Período inválido (YYYY-MM)." });

        const registrarPago = TIPOS_CON_SALIDA_DINERO.includes(tipo) && !!registrar_pago;
        let transaction;
        try {
            const pool = await getConnection();
            if (registrarPago && await periodoBloqueado(pool, id_clinica)) {
                return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });
            }
            const emp = (await pool.request().input('id', sql.Int, id_personal)
                .query(`SELECT Nombre_Completo, Salario_Base FROM Personal WHERE ID_Personal = @id`)).recordset[0];
            if (!emp) return res.status(404).json({ status: "Error", message: "Empleado no encontrado." });

            // Horas: el monto SIEMPRE se calcula en el servidor sobre el salario real (Art. 55).
            let montoFinal = parseFloat(monto) || 0;
            let descFinal = descripcion || null;
            if (esHoras) {
                const valorHora = parseFloat(emp.Salario_Base) / 240;
                montoFinal = parseFloat((parseFloat(horas) * valorHora * RECARGO_HORAS[tipo]).toFixed(2));
                descFinal = `${horas}h × $${valorHora.toFixed(4)} × ${RECARGO_HORAS[tipo]}${descripcion ? ' — ' + descripcion : ''}`;
            }

            transaction = new sql.Transaction(pool);
            await transaction.begin();

            let idGasto = null;
            if (registrarPago) {
                idGasto = await registrarEgreso(transaction, {
                    idClinica: id_clinica, idUsuario: req.usuarioAuth?.id_usuario, categoria,
                    monto: montoFinal, metodo: metodo_pago, referencia: `NOM-${periodo}`,
                    descripcion: `${ETIQUETA[tipo]} — ${emp.Nombre_Completo} — Período ${periodo}${descFinal ? ' — ' + descFinal : ''}`
                });
            }
            const ins = await transaction.request()
                .input('pid', sql.Int, id_personal).input('cli', sql.Int, id_clinica)
                .input('tipo', sql.VarChar(30), tipo).input('monto', sql.Decimal(10, 2), montoFinal)
                .input('desc', sql.NVarChar(500), descFinal).input('periodo', sql.VarChar(7), periodo)
                .input('met', sql.NVarChar(50), registrarPago ? (metodo_pago || 'EFECTIVO').toUpperCase() : null)
                .input('g', sql.Int, idGasto).input('usr', sql.Int, req.usuarioAuth?.id_usuario || null)
                .query(`
                    INSERT INTO Movimientos_Personal (ID_Personal, ID_Clinica, Tipo, Monto, Descripcion, Periodo, Metodo_Pago, ID_Gasto, ID_Usuario_Registro)
                    OUTPUT INSERTED.ID_Movimiento
                    VALUES (@pid, @cli, @tipo, @monto, @desc, @periodo, @met, @g, @usr)`);
            await transaction.commit();
            res.json({
                status: "Success",
                message: `${ETIQUETA[tipo]} registrado: $${montoFinal.toFixed(2)}${idGasto ? ' (egreso registrado en Gastos)' : ''}.`,
                id_movimiento: ins.recordset[0].ID_Movimiento, monto: montoFinal, id_gasto: idGasto
            });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            console.error("❌ Error movimiento personal:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/movimiento/:id/anular — borra el movimiento y su egreso en Gastos.
    anularMovimiento: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        let transaction;
        try {
            const pool = await getConnection();
            const mov = (await pool.request().input('id', sql.Int, req.params.id)
                .query(`SELECT * FROM Movimientos_Personal WHERE ID_Movimiento = @id`)).recordset[0];
            if (!mov) return res.status(404).json({ status: "Error", message: "Movimiento no encontrado." });
            if (mov.ID_Gasto && await periodoBloqueado(pool, mov.ID_Clinica)) {
                return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });
            }
            transaction = new sql.Transaction(pool);
            await transaction.begin();
            await transaction.request().input('id', sql.Int, mov.ID_Movimiento)
                .query(`DELETE FROM Movimientos_Personal WHERE ID_Movimiento = @id`);
            if (mov.ID_Gasto) {
                await transaction.request().input('g', sql.Int, mov.ID_Gasto)
                    .query(`DELETE FROM Gastos WHERE ID_Gasto = @g`);
            }
            await transaction.commit();
            res.json({ status: "Success", message: `${ETIQUETA[mov.Tipo] || mov.Tipo} anulado${mov.ID_Gasto ? ' y su egreso eliminado' : ''}.` });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/nomina   { id_clinica, periodo }  → rol de pagos calculado (no guarda)
    generarNomina: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const { id_clinica, periodo } = req.body;
        if (!id_clinica || !periodoValido(periodo)) return res.status(400).json({ status: "Error", message: "Clínica y período (YYYY-MM) son obligatorios." });
        try {
            const pool = await getConnection();
            const [anio, mes] = periodo.split('-').map(Number);
            const parametros = await obtenerParametrosLaborales(anio);
            const cli = await regionClinica(pool, id_clinica);
            const infoD14 = obtenerInfoDecimoCuarto(cli.Region_Decimo_Cuarto, periodo);
            const finPeriodo = `${periodo}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;

            // Solo empleados contratados hasta el fin del período
            const empleados = (await pool.request()
                .input('cli', sql.Int, id_clinica).input('fin', sql.VarChar(10), finPeriodo)
                .query(`SELECT * FROM Personal WHERE ID_Clinica = @cli AND Activo = 1
                          AND (Fecha_Ingreso IS NULL OR Fecha_Ingreso <= @fin)
                        ORDER BY Nombre_Completo`)).recordset;

            const nomina = [];
            for (const emp of empleados) {
                const movs = await movimientosDelPeriodo(pool, emp.ID_Personal, periodo);
                const rol = calcularRolMensual(emp, movs, parametros, periodo);
                rol.HorasExtra = parseFloat(movs.HorasExtra) || 0;
                rol.NetoPagar = parseFloat((rol.NetoPagar + rol.HorasExtra).toFixed(2));

                const pago = (await pool.request()
                    .input('pid', sql.Int, emp.ID_Personal).input('periodo', sql.VarChar(7), periodo)
                    .query(`SELECT TOP 1 ID_Movimiento, Monto, Metodo_Pago, Fecha_Movimiento FROM Movimientos_Personal
                            WHERE ID_Personal = @pid AND Periodo = @periodo AND Tipo = 'PAGO_NOMINA'
                            ORDER BY ID_Movimiento DESC`)).recordset[0];

                nomina.push({
                    ID_Personal: emp.ID_Personal, Nombre_Completo: emp.Nombre_Completo,
                    Cedula: emp.Cedula, Cargo: emp.Cargo, ...rol,
                    Pagado: !!pago, InfoPago: pago || null
                });
            }
            res.json({
                status: "Success", periodo, nomina,
                parametros: {
                    Anio: parametros.Anio,
                    SBU: parseFloat(parametros.SBU),
                    AportePersonalIESS: parseFloat(parametros.Aporte_Personal_IESS),
                    AportePatronalIESS: parseFloat(parametros.Aporte_Patronal_IESS),
                    PorcentajeFondoReserva: parseFloat(parametros.Porcentaje_Fondo_Reserva)
                },
                parametrosDeOtroAnio: parseInt(parametros.Anio) !== anio,
                decimoCuarto: infoD14
            });
        } catch (error) {
            console.error("❌ Error generar nómina:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/nomina/pagar  { id_personal, id_clinica, periodo, metodo_pago, categoria }
    // Recalcula el neto en el servidor (nunca confía en el monto del cliente).
    pagarNomina: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const { id_personal, id_clinica, periodo, metodo_pago, categoria } = req.body;
        if (!id_personal || !id_clinica || !periodoValido(periodo)) {
            return res.status(400).json({ status: "Error", message: "Empleado, clínica y período son obligatorios." });
        }
        let transaction;
        try {
            const pool = await getConnection();
            if (await periodoBloqueado(pool, id_clinica)) return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });

            const ya = await pool.request().input('pid', sql.Int, id_personal).input('periodo', sql.VarChar(7), periodo)
                .query(`SELECT 1 FROM Movimientos_Personal WHERE ID_Personal = @pid AND Periodo = @periodo AND Tipo = 'PAGO_NOMINA'`);
            if (ya.recordset.length) return res.json({ status: "Error", message: "La nómina de este empleado ya fue pagada para este período." });

            const emp = (await pool.request().input('id', sql.Int, id_personal)
                .query(`SELECT * FROM Personal WHERE ID_Personal = @id`)).recordset[0];
            if (!emp) return res.status(404).json({ status: "Error", message: "Empleado no encontrado." });

            const [anio, mes] = periodo.split('-').map(Number);
            const finPeriodo = new Date(anio, mes, 0);
            if (emp.Fecha_Ingreso && new Date(emp.Fecha_Ingreso) > finPeriodo) {
                return res.json({ status: "Error", message: `${emp.Nombre_Completo} no estaba contratado en el período ${periodo}.` });
            }

            const parametros = await obtenerParametrosLaborales(anio);
            const movs = await movimientosDelPeriodo(pool, id_personal, periodo);
            const rol = calcularRolMensual(emp, movs, parametros, periodo);
            rol.HorasExtra = parseFloat(movs.HorasExtra) || 0;
            const neto = parseFloat((rol.NetoPagar + rol.HorasExtra).toFixed(2));
            rol.NetoPagar = neto;
            if (neto <= 0) return res.json({ status: "Error", message: "El neto a pagar es $0 — no hay nada que pagar en este período." });

            transaction = new sql.Transaction(pool);
            await transaction.begin();
            const idGasto = await registrarEgreso(transaction, {
                idClinica: id_clinica, idUsuario: req.usuarioAuth?.id_usuario, categoria,
                monto: neto, metodo: metodo_pago, referencia: `NOM-${periodo}`,
                descripcion: `Pago de nómina — ${emp.Nombre_Completo} — Período ${periodo}`
            });
            const ins = await transaction.request()
                .input('pid', sql.Int, id_personal).input('cli', sql.Int, id_clinica)
                .input('monto', sql.Decimal(10, 2), neto)
                .input('desc', sql.NVarChar(500), `Pago neto de nómina — Período ${periodo}`)
                .input('periodo', sql.VarChar(7), periodo)
                .input('met', sql.NVarChar(50), (metodo_pago || 'EFECTIVO').toUpperCase())
                .input('g', sql.Int, idGasto)
                .input('json', sql.NVarChar(sql.MAX), JSON.stringify(rol))
                .input('usr', sql.Int, req.usuarioAuth?.id_usuario || null)
                .query(`
                    INSERT INTO Movimientos_Personal (ID_Personal, ID_Clinica, Tipo, Monto, Descripcion, Periodo, Metodo_Pago, ID_Gasto, Desglose_JSON, ID_Usuario_Registro)
                    OUTPUT INSERTED.ID_Movimiento
                    VALUES (@pid, @cli, 'PAGO_NOMINA', @monto, @desc, @periodo, @met, @g, @json, @usr)`);
            await transaction.commit();
            res.json({ status: "Success", message: `Nómina pagada: ${emp.Nombre_Completo} — $${neto.toFixed(2)}.`, id_movimiento: ins.recordset[0].ID_Movimiento, monto: neto });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            console.error("❌ Error pagar nómina:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /personal/nomina/pagos?id_clinica=&periodo=
    historialPagos: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const r = await pool.request()
                .input('cli', sql.Int, req.query.id_clinica || 0)
                .input('periodo', sql.VarChar(7), periodoValido(req.query.periodo) ? req.query.periodo : null)
                .query(`
                    SELECT m.ID_Movimiento, m.ID_Personal, p.Nombre_Completo, m.Tipo, m.Monto, m.Periodo,
                           m.Metodo_Pago, m.Fecha_Movimiento, m.ID_Gasto
                    FROM Movimientos_Personal m JOIN Personal p ON p.ID_Personal = m.ID_Personal
                    WHERE m.ID_Clinica = @cli AND m.Tipo IN ('PAGO_NOMINA','LIQUIDACION_FINAL')
                      AND (@periodo IS NULL OR m.Periodo = @periodo)
                    ORDER BY m.ID_Movimiento DESC`);
            res.json({ status: "Success", data: r.recordset });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /personal/liquidacion/calcular?id_personal=&fecha_salida=&tipo_salida=
    calcularLiquidacion: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const { id_personal, fecha_salida, tipo_salida } = req.query;
        if (!id_personal || !fechaValida(fecha_salida) || !tipo_salida) {
            return res.status(400).json({ status: "Error", message: "Empleado, fecha y tipo de salida son obligatorios." });
        }
        try {
            const pool = await getConnection();
            const emp = (await pool.request().input('id', sql.Int, id_personal).query(`
                SELECT p.*, c.Region_Decimo_Cuarto FROM Personal p
                JOIN Clinicas c ON c.ID_Clinica = p.ID_Clinica WHERE p.ID_Personal = @id`)).recordset[0];
            if (!emp) return res.status(404).json({ status: "Error", message: "Empleado no encontrado." });
            const parametros = await obtenerParametrosLaborales(parseInt(fecha_salida.substring(0, 4)));
            const desglose = calcularLiquidacionFinal({
                salarioBase: emp.Salario_Base, fechaIngreso: emp.Fecha_Ingreso, fechaSalida: fecha_salida,
                tipoSalida: tipo_salida, sbu: parametros.SBU, regionDecimoCuarto: emp.Region_Decimo_Cuarto
            });
            res.json({ status: "Success", desglose, regionConfigurada: !!emp.Region_Decimo_Cuarto });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/liquidacion
    // { id_personal, id_clinica, tipo_salida, fecha_salida, desglose, metodo_pago, categoria, desactivar }
    registrarLiquidacion: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const { id_personal, id_clinica, tipo_salida, fecha_salida, desglose, metodo_pago, categoria, desactivar } = req.body;
        const campos = ['decimoTerceroProporcional', 'decimoCuartoProporcional', 'vacacionesProporcional',
                        'fondoReservaPendiente', 'indemnizacion', 'desahucio'];
        const d = {};
        campos.forEach(k => { d[k] = Math.max(0, parseFloat(desglose?.[k]) || 0); });
        const monto = parseFloat(campos.reduce((s, k) => s + d[k], 0).toFixed(2));
        if (!id_personal || !id_clinica || !fechaValida(fecha_salida) || monto <= 0) {
            return res.status(400).json({ status: "Error", message: "Empleado, clínica, fecha de salida y un total mayor a 0 son obligatorios." });
        }
        let transaction;
        try {
            const pool = await getConnection();
            if (await periodoBloqueado(pool, id_clinica)) return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });
            const emp = (await pool.request().input('id', sql.Int, id_personal)
                .query(`SELECT Nombre_Completo FROM Personal WHERE ID_Personal = @id`)).recordset[0];
            if (!emp) return res.status(404).json({ status: "Error", message: "Empleado no encontrado." });

            const detalle = `D13:$${d.decimoTerceroProporcional} D14:$${d.decimoCuartoProporcional} Vac:$${d.vacacionesProporcional} FR:$${d.fondoReservaPendiente} Indemn:$${d.indemnizacion} Desahucio:$${d.desahucio}`;
            transaction = new sql.Transaction(pool);
            await transaction.begin();
            const idGasto = await registrarEgreso(transaction, {
                idClinica: id_clinica, idUsuario: req.usuarioAuth?.id_usuario, categoria,
                monto, metodo: metodo_pago, referencia: `LIQ-${fecha_salida}`,
                descripcion: `Liquidación final (${tipo_salida}) — ${emp.Nombre_Completo} — ${detalle}`
            });
            const ins = await transaction.request()
                .input('pid', sql.Int, id_personal).input('cli', sql.Int, id_clinica)
                .input('monto', sql.Decimal(10, 2), monto)
                .input('desc', sql.NVarChar(500), `Liquidación final (${tipo_salida}), salida ${fecha_salida} — ${detalle}`)
                .input('periodo', sql.VarChar(7), fecha_salida.substring(0, 7))
                .input('met', sql.NVarChar(50), (metodo_pago || 'EFECTIVO').toUpperCase())
                .input('g', sql.Int, idGasto)
                .input('json', sql.NVarChar(sql.MAX), JSON.stringify({ tipo_salida, fecha_salida, ...d, total: monto }))
                .input('usr', sql.Int, req.usuarioAuth?.id_usuario || null)
                .query(`
                    INSERT INTO Movimientos_Personal (ID_Personal, ID_Clinica, Tipo, Monto, Descripcion, Periodo, Metodo_Pago, ID_Gasto, Desglose_JSON, ID_Usuario_Registro)
                    OUTPUT INSERTED.ID_Movimiento
                    VALUES (@pid, @cli, 'LIQUIDACION_FINAL', @monto, @desc, @periodo, @met, @g, @json, @usr)`);
            if (desactivar) {
                await transaction.request().input('id', sql.Int, id_personal)
                    .query(`UPDATE Personal SET Activo = 0 WHERE ID_Personal = @id`);
            }
            await transaction.commit();
            res.json({ status: "Success", message: `Liquidación final registrada: $${monto.toFixed(2)}.`, id_movimiento: ins.recordset[0].ID_Movimiento, monto });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            console.error("❌ Error liquidación final:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /personal/parametros-laborales
    getParametros: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const r = await pool.request().query(`SELECT * FROM Parametros_Laborales ORDER BY Anio DESC`);
            res.json({ status: "Success", data: r.recordset });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /personal/parametros-laborales  { anio, sbu, aporte_personal_iess, aporte_patronal_iess, porcentaje_fondo_reserva, id_clinica, region }
    guardarParametros: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const b = req.body;
        const anio = parseInt(b.anio), sbu = parseFloat(b.sbu);
        if (!(anio > 2000) || !(sbu > 0)) return res.status(400).json({ status: "Error", message: "Año y SBU son obligatorios." });
        const tasa = (v, def) => { const n = parseFloat(v); return (n >= 0 && n < 1) ? n : def; };
        try {
            const pool = await getConnection();
            await pool.request()
                .input('anio', sql.Int, anio).input('sbu', sql.Decimal(10, 2), sbu)
                .input('ap', sql.Decimal(6, 4), tasa(b.aporte_personal_iess, 0.0945))
                .input('at', sql.Decimal(6, 4), tasa(b.aporte_patronal_iess, 0.1115))
                .input('fr', sql.Decimal(6, 4), tasa(b.porcentaje_fondo_reserva, 0.0833))
                .query(`
                    IF EXISTS (SELECT 1 FROM Parametros_Laborales WHERE Anio = @anio)
                        UPDATE Parametros_Laborales SET SBU=@sbu, Aporte_Personal_IESS=@ap, Aporte_Patronal_IESS=@at, Porcentaje_Fondo_Reserva=@fr WHERE Anio=@anio
                    ELSE
                        INSERT INTO Parametros_Laborales (Anio, SBU, Aporte_Personal_IESS, Aporte_Patronal_IESS, Porcentaje_Fondo_Reserva)
                        VALUES (@anio, @sbu, @ap, @at, @fr)`);
            if (b.id_clinica && ['COSTA', 'SIERRA'].includes(b.region)) {
                await pool.request().input('cli', sql.Int, b.id_clinica).input('reg', sql.VarChar(10), b.region)
                    .query(`UPDATE Clinicas SET Region_Decimo_Cuarto = @reg WHERE ID_Clinica = @cli`);
            }
            res.json({ status: "Success", message: "Parámetros laborales guardados." });
        } catch (error) {
            res.status(500).json({ status: "Error", message: error.message });
        }
    }
};

module.exports = personalController;
