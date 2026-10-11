const { getConnection, sql } = require('../config/db');
const { detectarEspecialidad, mapaEspecialidades } = require('./tratamientoController');

// ==========================================================================
// COMISIONES DE DOCTORES
// Base: lo COBRADO (tabla Pagos ligada a un plan con médico). Cada pago se comisiona
// una sola vez: al liquidar se congela en Comisiones_Liquidacion_Detalle con el %
// vigente, y el pago al doctor queda registrado como Egreso en Gastos.
// % por doctor y por especialidad (Comisiones_Config); '*' = % por defecto del doctor.
// ==========================================================================

const CATEGORIA_GASTO = 'Comisiones Médicas';
const ESPECIALIDADES = [...new Set(['Odontología General', ...Object.values(mapaEspecialidades)])].sort();

const r2 = n => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const soloAdmin = (req, res) => {
    if (parseInt(req.usuarioAuth?.id_rol) !== 1) {
        res.status(403).json({ status: "Error", message: "Solo el administrador puede gestionar comisiones." });
        return false;
    }
    return true;
};

// Pagos aún no liquidados del rango, con su especialidad, % y comisión calculados.
// Se usa tanto para mostrar lo pendiente como para liquidar (el backend SIEMPRE recalcula,
// nunca confía en montos que mande el front).
async function calcularPendientes(pool, { id_clinica, fecha_inicio, fecha_fin, id_medico }) {
    const rq = pool.request()
        .input('cli', sql.Int, id_clinica)
        // VarChar y no sql.Date: con useUTC:false un string en sql.Date llega un día antes.
        .input('fIn', sql.VarChar(10), fecha_inicio)
        .input('fOut', sql.VarChar(10), fecha_fin);
    let filtroMedico = '';
    if (id_medico) {
        rq.input('med', sql.Int, id_medico);
        filtroMedico = 'AND TP.ID_Medico = @med';
    }
    const pagos = (await rq.query(`
        SELECT PG.ID_Pago, PG.Fecha_Pago, PG.Monto, PG.Metodo_Pago, PG.ID_Plan,
               TP.ID_Medico, TP.Nombre_Tratamiento, TP.Especialidad AS Especialidad_Plan,
               (P.Nombres + ' ' + P.Apellidos) AS Paciente,
               (U.Nombres + ' ' + U.Apellidos) AS Doctor
        FROM Pagos PG
        JOIN Tratamientos_Plan TP ON PG.ID_Plan = TP.ID_Plan
        JOIN Pacientes P ON PG.ID_Paciente = P.ID_Paciente
        LEFT JOIN Usuarios U ON TP.ID_Medico = U.ID_Usuario
        WHERE PG.ID_Clinica = @cli
          AND CAST(PG.Fecha_Pago AS DATE) BETWEEN @fIn AND @fOut
          AND TP.ID_Medico IS NOT NULL
          AND PG.Monto > 0
          AND NOT EXISTS (SELECT 1 FROM Comisiones_Liquidacion_Detalle D WHERE D.ID_Pago = PG.ID_Pago)
          ${filtroMedico}
        ORDER BY TP.ID_Medico, PG.Fecha_Pago
    `)).recordset;

    const config = (await pool.request().query(
        `SELECT ID_Usuario, Especialidad, Porcentaje FROM Comisiones_Config`
    )).recordset;
    const pct = {};
    config.forEach(c => { pct[`${c.ID_Usuario}|${c.Especialidad}`] = Number(c.Porcentaje); });

    return pagos.map(p => {
        const especialidad = p.Especialidad_Plan || detectarEspecialidad([{ nombre: p.Nombre_Tratamiento }]);
        const propio = pct[`${p.ID_Medico}|${especialidad}`];
        const porDefecto = pct[`${p.ID_Medico}|*`];
        const porcentaje = propio ?? porDefecto ?? 0;
        return {
            ...p,
            Especialidad: especialidad,
            Porcentaje: porcentaje,
            Origen_Porcentaje: propio !== undefined ? 'especialidad' : (porDefecto !== undefined ? 'defecto' : 'sin configurar'),
            Comision: r2(Number(p.Monto) * porcentaje / 100)
        };
    });
}

const comisionController = {

    // GET /comisiones/especialidades
    getEspecialidades: (req, res) => res.json({ status: "Success", data: ESPECIALIDADES }),

    // GET /comisiones/doctores?id_clinica=
    // Médicos (rol 3) + cualquier usuario que tenga planes como médico, con su configuración de %.
    getDoctores: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const docs = (await pool.request()
                .input('cli', sql.Int, req.query.id_clinica || 0)
                .query(`
                    SELECT U.ID_Usuario, (U.Nombres + ' ' + U.Apellidos) AS Doctor, U.ID_Rol, U.Registro_Sanitario
                    FROM Usuarios U
                    WHERE U.Activo = 1 AND (
                        (U.ID_Rol = 3 AND (U.ID_Clinica = @cli OR @cli = 0))
                        OR EXISTS (SELECT 1 FROM Tratamientos_Plan TP
                                   JOIN Pacientes P ON TP.ID_Paciente = P.ID_Paciente
                                   WHERE TP.ID_Medico = U.ID_Usuario AND (P.ID_Clinica = @cli OR @cli = 0))
                    )
                    ORDER BY U.Nombres, U.Apellidos
                `)).recordset;
            const config = (await pool.request().query(
                `SELECT ID_Usuario, Especialidad, Porcentaje FROM Comisiones_Config`
            )).recordset;
            docs.forEach(d => {
                d.porcentajes = config
                    .filter(c => c.ID_Usuario === d.ID_Usuario)
                    .map(c => ({ especialidad: c.Especialidad, porcentaje: Number(c.Porcentaje) }));
            });
            res.json({ status: "Success", data: docs });
        } catch (error) {
            console.error("❌ Error getDoctores comisiones:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // PUT /comisiones/config/:id_usuario   { porcentajes: [{ especialidad, porcentaje }] }
    // Reemplaza toda la configuración del doctor. Especialidad '*' = % por defecto.
    guardarConfig: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const idUsuario = parseInt(req.params.id_usuario);
        const lista = Array.isArray(req.body.porcentajes) ? req.body.porcentajes : [];
        for (const p of lista) {
            const v = Number(p.porcentaje);
            if (!p.especialidad || isNaN(v) || v < 0 || v > 100) {
                return res.status(400).json({ status: "Error", message: `Porcentaje inválido en "${p.especialidad || '?'}" (debe estar entre 0 y 100).` });
            }
        }
        let transaction;
        try {
            const pool = await getConnection();
            transaction = new sql.Transaction(pool);
            await transaction.begin();
            await transaction.request().input('u', sql.Int, idUsuario)
                .query(`DELETE FROM Comisiones_Config WHERE ID_Usuario = @u`);
            for (const p of lista) {
                await transaction.request()
                    .input('u', sql.Int, idUsuario)
                    .input('esp', sql.NVarChar(100), p.especialidad)
                    .input('pct', sql.Decimal(5, 2), Number(p.porcentaje))
                    .query(`INSERT INTO Comisiones_Config (ID_Usuario, Especialidad, Porcentaje) VALUES (@u, @esp, @pct)`);
            }
            await transaction.commit();
            res.json({ status: "Success", message: "Porcentajes de comisión guardados." });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            console.error("❌ Error guardarConfig comisiones:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /comisiones/pendientes?id_clinica=&fecha_inicio=&fecha_fin=&id_medico=
    getPendientes: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const filas = await calcularPendientes(pool, req.query);

            const resumen = {};
            filas.forEach(f => {
                const k = f.ID_Medico;
                if (!resumen[k]) resumen[k] = { ID_Medico: k, Doctor: f.Doctor, Pagos: 0, Total_Cobrado: 0, Total_Comision: 0, Sin_Configurar: 0 };
                resumen[k].Pagos++;
                resumen[k].Total_Cobrado = r2(resumen[k].Total_Cobrado + Number(f.Monto));
                resumen[k].Total_Comision = r2(resumen[k].Total_Comision + f.Comision);
                if (f.Origen_Porcentaje === 'sin configurar') resumen[k].Sin_Configurar++;
            });
            res.json({ status: "Success", resumen: Object.values(resumen), detalle: filas });
        } catch (error) {
            console.error("❌ Error getPendientes comisiones:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /comisiones/liquidar
    // { id_clinica, id_medico, fecha_inicio, fecha_fin, metodo_pago, observaciones }
    liquidar: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        const { id_clinica, id_medico, fecha_inicio, fecha_fin, metodo_pago, observaciones } = req.body;
        if (!id_clinica || !id_medico || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({ status: "Error", message: "Faltan datos para liquidar (clínica, doctor y rango)." });
        }
        let transaction;
        try {
            const pool = await getConnection();

            // Mismo bloqueo que Gastos: no se registran egresos en un período cerrado.
            const cierre = await pool.request().input('cli', sql.Int, id_clinica).query(`
                SELECT TOP 1 ID_Cierre FROM Cierres_Financieros
                WHERE CAST(GETDATE() AS DATE) BETWEEN Periodo_Desde AND Periodo_Hasta
                  AND ID_Clinica = @cli AND Estado = 'CERRADO'`);
            if (cierre.recordset.length) {
                return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });
            }

            const filas = await calcularPendientes(pool, { id_clinica, fecha_inicio, fecha_fin, id_medico });
            const comisionables = filas.filter(f => f.Comision > 0);
            if (!comisionables.length) {
                return res.json({ status: "Error", message: "No hay comisiones pendientes para este doctor en el rango (o su % no está configurado)." });
            }
            const totalCobrado = r2(comisionables.reduce((s, f) => s + Number(f.Monto), 0));
            const totalComision = r2(comisionables.reduce((s, f) => s + f.Comision, 0));
            const doctor = comisionables[0].Doctor || `ID ${id_medico}`;
            const metodo = (metodo_pago || 'EFECTIVO').toUpperCase();

            // Categoría para que el egreso aparezca agrupado en Gastos. Fuera de la transacción
            // y sin bloquear: el Gasto guarda la categoría como texto, así que si este INSERT
            // falla (ej. IDENTITY desfasado en Gastos_Categorias) la liquidación sigue igual.
            try {
                await pool.request().input('cat', sql.NVarChar, CATEGORIA_GASTO).query(`
                    IF NOT EXISTS (SELECT 1 FROM Gastos_Categorias WHERE Nombre_Categoria = @cat)
                        INSERT INTO Gastos_Categorias (Nombre_Categoria) VALUES (@cat)`);
            } catch (e) {
                console.warn(`⚠️ [Comisiones]: No se pudo crear la categoría "${CATEGORIA_GASTO}":`, e.message);
            }

            transaction = new sql.Transaction(pool);
            await transaction.begin();

            const liq = await transaction.request()
                .input('cli', sql.Int, id_clinica)
                .input('med', sql.Int, id_medico)
                .input('fIn', sql.VarChar(10), fecha_inicio)
                .input('fOut', sql.VarChar(10), fecha_fin)
                .input('cob', sql.Decimal(18, 2), totalCobrado)
                .input('com', sql.Decimal(18, 2), totalComision)
                .input('met', sql.NVarChar(50), metodo)
                .input('obs', sql.NVarChar(500), observaciones || null)
                .input('usr', sql.Int, req.usuarioAuth?.id_usuario || null)
                .query(`
                    INSERT INTO Comisiones_Liquidacion
                        (ID_Clinica, ID_Medico, Fecha_Desde, Fecha_Hasta, Total_Cobrado, Total_Comision,
                         Metodo_Pago, Observaciones, ID_Usuario_Registro)
                    OUTPUT INSERTED.ID_Liquidacion
                    VALUES (@cli, @med, @fIn, @fOut, @cob, @com, @met, @obs, @usr)`);
            const idLiq = liq.recordset[0].ID_Liquidacion;

            for (const f of comisionables) {
                await transaction.request()
                    .input('liq', sql.Int, idLiq)
                    .input('pago', sql.Int, f.ID_Pago)
                    .input('plan', sql.Int, f.ID_Plan)
                    .input('esp', sql.NVarChar(100), f.Especialidad)
                    .input('monto', sql.Decimal(18, 2), f.Monto)
                    .input('pct', sql.Decimal(5, 2), f.Porcentaje)
                    .input('com', sql.Decimal(18, 2), f.Comision)
                    .query(`INSERT INTO Comisiones_Liquidacion_Detalle
                                (ID_Liquidacion, ID_Pago, ID_Plan, Especialidad, Monto_Pago, Porcentaje, Comision)
                            VALUES (@liq, @pago, @plan, @esp, @monto, @pct, @com)`);
            }

            // El pago al doctor entra a los egresos de la clínica (mismo registro que el módulo Gastos).
            const gasto = await transaction.request()
                .input('cli', sql.Int, id_clinica)
                .input('usr', sql.Int, req.usuarioAuth?.id_usuario || null)
                .input('cat', sql.NVarChar, CATEGORIA_GASTO)
                .input('monto', sql.Decimal(9, 2), totalComision)
                .input('desc', sql.NVarChar, `Comisión Dr(a). ${doctor} · ${fecha_inicio} al ${fecha_fin} · Liquidación #${idLiq}`)
                .input('met', sql.NVarChar, metodo)
                .input('ref', sql.NVarChar, `LIQ-COM-${idLiq}`)
                .query(`
                    INSERT INTO Gastos (ID_Clinica, ID_Usuario, Tipo, Categoria, Monto, Descripcion, Metodo_Pago, Referencia, Fecha)
                    OUTPUT INSERTED.ID_Gasto
                    VALUES (@cli, @usr, 'Egreso', @cat, @monto, @desc, @met, @ref, GETDATE())`);
            await transaction.request()
                .input('liq', sql.Int, idLiq)
                .input('g', sql.Int, gasto.recordset[0].ID_Gasto)
                .query(`UPDATE Comisiones_Liquidacion SET ID_Gasto = @g WHERE ID_Liquidacion = @liq`);

            await transaction.commit();
            res.json({
                status: "Success",
                message: `Liquidación #${idLiq} registrada: ${comisionables.length} pago(s), comisión $${totalComision.toFixed(2)}.`,
                id_liquidacion: idLiq,
                total_comision: totalComision,
                omitidos_sin_porcentaje: filas.length - comisionables.length
            });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            console.error("❌ Error liquidar comisiones:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /comisiones/liquidaciones?id_clinica=&id_medico=
    getLiquidaciones: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const rq = pool.request().input('cli', sql.Int, req.query.id_clinica || 0);
            let filtro = '';
            if (req.query.id_medico) { rq.input('med', sql.Int, req.query.id_medico); filtro = 'AND L.ID_Medico = @med'; }
            const r = await rq.query(`
                SELECT TOP 300 L.*, (U.Nombres + ' ' + U.Apellidos) AS Doctor,
                       (SELECT COUNT(*) FROM Comisiones_Liquidacion_Detalle D WHERE D.ID_Liquidacion = L.ID_Liquidacion) AS Pagos
                FROM Comisiones_Liquidacion L
                LEFT JOIN Usuarios U ON L.ID_Medico = U.ID_Usuario
                WHERE L.ID_Clinica = @cli ${filtro}
                ORDER BY L.ID_Liquidacion DESC`);
            res.json({ status: "Success", data: r.recordset });
        } catch (error) {
            console.error("❌ Error getLiquidaciones:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // GET /comisiones/liquidaciones/:id  → cabecera + pagos incluidos (para ver/imprimir)
    getLiquidacion: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        try {
            const pool = await getConnection();
            const id = parseInt(req.params.id);
            const cab = (await pool.request().input('id', sql.Int, id).query(`
                SELECT L.*, (U.Nombres + ' ' + U.Apellidos) AS Doctor, U.Registro_Sanitario,
                       C.Nombre_Clinica, C.RUC, C.Logo_Ruta
                FROM Comisiones_Liquidacion L
                LEFT JOIN Usuarios U ON L.ID_Medico = U.ID_Usuario
                LEFT JOIN Clinicas C ON L.ID_Clinica = C.ID_Clinica
                WHERE L.ID_Liquidacion = @id`)).recordset[0];
            if (!cab) return res.status(404).json({ status: "Error", message: "Liquidación no encontrada." });
            const det = (await pool.request().input('id', sql.Int, id).query(`
                SELECT D.*, PG.Fecha_Pago, PG.Metodo_Pago, TP.Nombre_Tratamiento,
                       (P.Nombres + ' ' + P.Apellidos) AS Paciente
                FROM Comisiones_Liquidacion_Detalle D
                LEFT JOIN Pagos PG ON D.ID_Pago = PG.ID_Pago
                LEFT JOIN Tratamientos_Plan TP ON D.ID_Plan = TP.ID_Plan
                LEFT JOIN Pacientes P ON PG.ID_Paciente = P.ID_Paciente
                WHERE D.ID_Liquidacion = @id
                ORDER BY PG.Fecha_Pago`)).recordset;
            res.json({ status: "Success", cabecera: cab, detalle: det });
        } catch (error) {
            console.error("❌ Error getLiquidacion:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    },

    // POST /comisiones/liquidaciones/:id/anular
    // Libera los pagos (vuelven a quedar pendientes) y elimina el egreso asociado.
    anularLiquidacion: async (req, res) => {
        if (!soloAdmin(req, res)) return;
        let transaction;
        try {
            const pool = await getConnection();
            const id = parseInt(req.params.id);
            const cab = (await pool.request().input('id', sql.Int, id)
                .query(`SELECT * FROM Comisiones_Liquidacion WHERE ID_Liquidacion = @id`)).recordset[0];
            if (!cab) return res.status(404).json({ status: "Error", message: "Liquidación no encontrada." });
            if (cab.Estado === 'ANULADA') return res.json({ status: "Error", message: "La liquidación ya está anulada." });

            const cierre = await pool.request().input('cli', sql.Int, cab.ID_Clinica).query(`
                SELECT TOP 1 ID_Cierre FROM Cierres_Financieros
                WHERE CAST(GETDATE() AS DATE) BETWEEN Periodo_Desde AND Periodo_Hasta
                  AND ID_Clinica = @cli AND Estado = 'CERRADO'`);
            if (cierre.recordset.length) {
                return res.json({ status: "Error", message: "Periodo bloqueado por Cierre Financiero." });
            }

            transaction = new sql.Transaction(pool);
            await transaction.begin();
            await transaction.request().input('id', sql.Int, id)
                .query(`DELETE FROM Comisiones_Liquidacion_Detalle WHERE ID_Liquidacion = @id`);
            if (cab.ID_Gasto) {
                await transaction.request().input('g', sql.Int, cab.ID_Gasto)
                    .query(`DELETE FROM Gastos WHERE ID_Gasto = @g`);
            }
            await transaction.request().input('id', sql.Int, id)
                .query(`UPDATE Comisiones_Liquidacion SET Estado = 'ANULADA', ID_Gasto = NULL WHERE ID_Liquidacion = @id`);
            await transaction.commit();
            res.json({ status: "Success", message: `Liquidación #${id} anulada. Los pagos vuelven a quedar pendientes.` });
        } catch (error) {
            if (transaction) await transaction.rollback().catch(() => {});
            console.error("❌ Error anularLiquidacion:", error);
            res.status(500).json({ status: "Error", message: error.message });
        }
    }
};

module.exports = comisionController;
