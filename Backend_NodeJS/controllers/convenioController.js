// =====================================================================
//  CONVENIOS / SEGUROS: catálogo (aseguradoras, empresas, IESS, RPIS...),
//  convenio de cada paciente y planilla de atenciones para cobrar al convenio.
// =====================================================================
const { getConnection, sql } = require('../config/db');
const { aplicarCobertura, movimiento, SQL_ESTADO, r2 } = require('../services/coberturaConvenio');

const TIPOS = ['ASEGURADORA', 'EMPRESA', 'IESS', 'ISSFA', 'ISSPOL', 'MSP_RPIS', 'OTRO'];
const txt = (v, max) => { const s = String(v == null ? '' : v).trim(); return s ? s.slice(0, max) : null; };
const esAdmin = req => Number(req.usuarioAuth?.id_rol) === 1;
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const soloAdmin = (req, res) => { if (esAdmin(req)) return false; res.status(403).json({ status: 'Error', message: 'Solo el administrador puede gestionar convenios.' }); return true; };

// GET /api/convenios?todos=1
const listar = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().query(`
            SELECT C.*, (SELECT COUNT(*) FROM Paciente_Convenios PC WHERE PC.ID_Convenio = C.ID_Convenio AND PC.Activo = 1) AS Pacientes
            FROM Convenios C ${req.query.todos ? '' : 'WHERE C.Activo = 1'} ORDER BY C.Activo DESC, C.Nombre`);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar los convenios.' });
    }
};

function datosConvenio(b) {
    const tipo = String(b.tipo || 'OTRO').toUpperCase();
    const desc = Math.max(0, Math.min(100, parseFloat(b.descuento_porcentaje) || 0));
    const cobPct = parseFloat(b.cobertura_porcentaje);
    const cob = Math.max(0, Math.min(100, isNaN(cobPct) ? 100 : cobPct));
    return {
        nombre: txt(b.nombre, 150), tipo: TIPOS.includes(tipo) ? tipo : 'OTRO', ruc: txt(b.ruc, 13), contacto: txt(b.contacto, 150),
        telefono: txt(b.telefono, 30), email: txt(b.email, 150), desc, cob, autorizacion: b.requiere_autorizacion ? 1 : 0, obs: txt(b.observaciones, 500)
    };
}
const inputs = (r, d) => r.input('nombre', sql.NVarChar(150), d.nombre).input('tipo', sql.VarChar(20), d.tipo).input('ruc', sql.VarChar(13), d.ruc)
    .input('contacto', sql.NVarChar(150), d.contacto).input('tel', sql.NVarChar(30), d.telefono).input('email', sql.NVarChar(150), d.email)
    .input('desc', sql.Decimal(5, 2), d.desc).input('cob', sql.Decimal(5, 2), d.cob).input('aut', sql.Bit, d.autorizacion).input('obs', sql.NVarChar(500), d.obs);

// POST /api/convenios
const crear = async (req, res) => {
    if (soloAdmin(req, res)) return;
    const d = datosConvenio(req.body || {});
    if (!d.nombre) return res.status(400).json({ status: 'Error', message: 'Indique el nombre del convenio.' });
    try {
        const pool = await getConnection();
        const r = await inputs(pool.request(), d).query(`
            INSERT INTO Convenios (Nombre, Tipo, RUC, Contacto, Telefono, Email, Descuento_Porcentaje, Cobertura_Porcentaje, Requiere_Autorizacion, Observaciones)
            OUTPUT INSERTED.ID_Convenio VALUES (@nombre, @tipo, @ruc, @contacto, @tel, @email, @desc, @cob, @aut, @obs)`);
        res.json({ status: 'Success', message: 'Convenio creado.', id_convenio: r.recordset[0].ID_Convenio });
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo crear el convenio.' });
    }
};

// PUT /api/convenios/:id
const actualizar = async (req, res) => {
    if (soloAdmin(req, res)) return;
    const d = datosConvenio(req.body || {});
    if (!d.nombre) return res.status(400).json({ status: 'Error', message: 'Indique el nombre del convenio.' });
    try {
        const pool = await getConnection();
        await inputs(pool.request(), d).input('id', sql.Int, parseInt(req.params.id, 10))
            .input('activo', sql.Bit, req.body.activo === false || req.body.activo === 0 ? 0 : 1)
            .query(`UPDATE Convenios SET Nombre = @nombre, Tipo = @tipo, RUC = @ruc, Contacto = @contacto, Telefono = @tel, Email = @email,
                        Descuento_Porcentaje = @desc, Cobertura_Porcentaje = @cob, Requiere_Autorizacion = @aut, Observaciones = @obs, Activo = @activo WHERE ID_Convenio = @id`);
        res.json({ status: 'Success', message: 'Convenio actualizado.' });
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo actualizar el convenio.' });
    }
};

// GET /api/convenios/paciente/:id
const delPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id, 10)).query(`
            SELECT PC.*, C.Nombre, C.Tipo, C.Descuento_Porcentaje, C.Cobertura_Porcentaje, C.Requiere_Autorizacion,
                   CASE WHEN PC.Vigente_Hasta IS NULL OR PC.Vigente_Hasta >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS Vigente
            FROM Paciente_Convenios PC INNER JOIN Convenios C ON C.ID_Convenio = PC.ID_Convenio
            WHERE PC.ID_Paciente = @id AND PC.Activo = 1 ORDER BY PC.Fecha_Registro DESC`);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar el convenio del paciente.' });
    }
};

// POST /api/convenios/paciente/:id { id_convenio, numero_afiliado, titular, parentesco, vigente_hasta }
const asignarPaciente = async (req, res) => {
    const b = req.body || {};
    const idPaciente = parseInt(req.params.id, 10);
    const idConvenio = parseInt(b.id_convenio, 10);
    if (!idPaciente || !idConvenio) return res.status(400).json({ status: 'Error', message: 'Seleccione el convenio.' });
    if (b.vigente_hasta && !esFecha(b.vigente_hasta)) return res.status(400).json({ status: 'Error', message: 'Fecha de vigencia no válida.' });
    try {
        const pool = await getConnection();
        await pool.request().input('pac', sql.Int, idPaciente).input('conv', sql.Int, idConvenio)
            .input('num', sql.NVarChar(60), txt(b.numero_afiliado, 60)).input('tit', sql.NVarChar(150), txt(b.titular, 150))
            .input('par', sql.NVarChar(40), txt(b.parentesco, 40)).input('vig', sql.VarChar(10), b.vigente_hasta || null)
            .query(`UPDATE Paciente_Convenios SET Activo = 0 WHERE ID_Paciente = @pac AND ID_Convenio = @conv AND Activo = 1;
                    INSERT INTO Paciente_Convenios (ID_Paciente, ID_Convenio, Numero_Afiliado, Titular, Parentesco, Vigente_Hasta)
                    VALUES (@pac, @conv, @num, @tit, @par, @vig)`);
        res.json({ status: 'Success', message: 'Convenio asignado al paciente.', id_paciente: idPaciente });
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo asignar el convenio.' });
    }
};

// DELETE /api/convenios/asignacion/:id
const quitarPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`UPDATE Paciente_Convenios SET Activo = 0 WHERE ID_Paciente_Convenio = @id`);
        res.json({ status: 'Success', message: 'Convenio quitado del paciente.' });
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo quitar el convenio.' });
    }
};

// GET /api/convenios/planilla?id_convenio=&desde=&hasta=&estado=
// Atenciones MARCADAS con este convenio (cada tratamiento dice quién paga), con lo que cubre
// el seguro, el copago del paciente y el estado del cobro.
const planilla = async (req, res) => {
    const idConvenio = parseInt(req.query.id_convenio, 10);
    const { desde, hasta } = req.query;
    const estado = String(req.query.estado || '').toUpperCase();
    if (!idConvenio || !esFecha(desde) || !esFecha(hasta)) return res.status(400).json({ status: 'Error', message: 'Indique convenio y período.' });
    try {
        const pool = await getConnection();
        const r = await pool.request().input('conv', sql.Int, idConvenio).input('desde', sql.VarChar(10), desde).input('hasta', sql.VarChar(10), hasta)
            .input('estado', sql.VarChar(20), estado || null)
            .query(`
            SELECT t.ID_Plan, t.Fecha_Inicio, P.ID_Paciente, P.Apellidos + ' ' + P.Nombres AS Paciente, P.DNI,
                   PC.Numero_Afiliado, PC.Titular, PC.Parentesco, t.Numero_Autorizacion,
                   ISNULL(t.Nombre_Tratamiento, pr.Nombre_Prestacion) AS Prestacion, t.Numero_Diente, t.CIE_Cod, t.CIE_Texto,
                   ISNULL(t.Precio_Lista, t.Costo_Total) AS Precio_Lista, ISNULL(t.Descuento, 0) AS Descuento, t.Costo_Total,
                   t.Monto_Convenio, t.Saldo_Convenio, t.Costo_Total - t.Monto_Convenio AS Copago, t.Saldo_Pendiente, ISNULL(t.Descuento_Convenio, 0) AS Descuento_Convenio,
                   t.Estado_Cobro_Convenio, t.Fecha_Envio_Convenio, t.Estado_Tratamiento,
                   LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Medico, U.Registro_Sanitario
            FROM Tratamientos_Plan t
            INNER JOIN Pacientes P ON P.ID_Paciente = t.ID_Paciente
            OUTER APPLY (SELECT TOP 1 X.Numero_Afiliado, X.Titular, X.Parentesco FROM Paciente_Convenios X
                         WHERE X.ID_Paciente = t.ID_Paciente AND X.ID_Convenio = t.ID_Convenio ORDER BY X.Activo DESC, X.Fecha_Registro DESC) PC
            LEFT JOIN Prestaciones pr ON pr.ID_Prestacion = t.ID_Prestacion
            LEFT JOIN Usuarios U ON U.ID_Usuario = t.ID_Medico
            WHERE t.ID_Convenio = @conv AND CAST(t.Fecha_Inicio AS DATE) BETWEEN @desde AND @hasta
              AND (@estado IS NULL OR t.Estado_Cobro_Convenio = @estado)
            ORDER BY t.Fecha_Inicio, P.Apellidos`);
        const filas = r.recordset;
        const suma = k => r2(filas.reduce((s, x) => s + Number(x[k] || 0), 0));
        res.json({ filas, resumen: {
            atenciones: filas.length, pacientes: new Set(filas.map(f => f.ID_Paciente)).size,
            total: suma('Costo_Total'), convenio: suma('Monto_Convenio'), por_cobrar: suma('Saldo_Convenio'), copago: suma('Copago')
        } });
    } catch (e) {
        console.error('❌ planilla convenio:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo generar la planilla.' });
    }
};

// PUT /api/convenios/tratamiento/:idPlan { id_convenio (null = particular), numero_autorizacion, monto_convenio? }
const coberturaTratamiento = async (req, res) => {
    const idPlan = parseInt(req.params.idPlan, 10);
    if (!idPlan) return res.status(400).json({ status: 'Error', message: 'Tratamiento no válido.' });
    const b = req.body || {};
    const pool = await getConnection();
    const tx = new sql.Transaction(pool);
    try {
        await tx.begin();
        const r = await aplicarCobertura(tx, idPlan, {
            idConvenio: b.id_convenio || null, autorizacion: b.numero_autorizacion, monto: b.monto_convenio, idUsuario: req.usuarioAuth?.id_usuario
        });
        await tx.commit();
        res.json({ status: 'Success', message: b.id_convenio
            ? `Cubre el convenio: $${r.monto.toFixed(2)}.${r.descuento > 0 ? ` Descuento pactado: $${r.descuento.toFixed(2)}.` : ''} El resto queda como copago del paciente.`
            : 'El tratamiento queda como particular.' });
    } catch (e) {
        try { await tx.rollback(); } catch (_) { }
        res.status(400).json({ status: 'Error', message: e.message });
    }
};

// GET /api/convenios/tratamiento/:idPlan/movimientos — historial del cobro al seguro
const movimientosTratamiento = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.idPlan, 10)).query(`
            SELECT M.*, C.Nombre AS Convenio, LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Usuario
            FROM Convenio_Movimientos M LEFT JOIN Convenios C ON C.ID_Convenio = M.ID_Convenio LEFT JOIN Usuarios U ON U.ID_Usuario = M.ID_Usuario
            WHERE M.ID_Plan = @id ORDER BY M.Fecha, M.ID_Movimiento`);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo cargar el historial.' });
    }
};

// GET /api/convenios/por-cobrar — cuentas por cobrar a cada convenio
const porCobrar = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().query(`
            SELECT C.ID_Convenio, C.Nombre, C.Tipo, COUNT(*) AS Atenciones,
                   SUM(t.Saldo_Convenio) AS Por_Cobrar,
                   SUM(CASE WHEN t.Estado_Cobro_Convenio = 'PENDIENTE' THEN t.Saldo_Convenio ELSE 0 END) AS Sin_Enviar,
                   SUM(CASE WHEN t.Estado_Cobro_Convenio IN ('ENVIADO','PARCIAL') THEN t.Saldo_Convenio ELSE 0 END) AS Enviado,
                   MIN(t.Fecha_Inicio) AS Mas_Antigua
            FROM Tratamientos_Plan t INNER JOIN Convenios C ON C.ID_Convenio = t.ID_Convenio
            WHERE t.Saldo_Convenio > 0
            GROUP BY C.ID_Convenio, C.Nombre, C.Tipo ORDER BY SUM(t.Saldo_Convenio) DESC`);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ status: 'Error', message: 'No se pudo calcular lo que deben los convenios.' });
    }
};

const idsValidos = v => (Array.isArray(v) ? v : []).map(x => parseInt(x, 10)).filter(Boolean).slice(0, 500);

// POST /api/convenios/envio { ids_plan, referencia } — se entregó la planilla al convenio
const marcarEnviado = async (req, res) => {
    const ids = idsValidos(req.body?.ids_plan);
    if (!ids.length) return res.status(400).json({ status: 'Error', message: 'No hay atenciones para marcar.' });
    const pool = await getConnection();
    const tx = new sql.Transaction(pool);
    try {
        await tx.begin();
        const r = await tx.request().query(`
            DECLARE @r TABLE (ID_Plan INT, ID_Convenio INT, Saldo_Convenio DECIMAL(18,2));
            UPDATE Tratamientos_Plan SET Estado_Cobro_Convenio = 'ENVIADO', Fecha_Envio_Convenio = GETDATE()
            OUTPUT INSERTED.ID_Plan, INSERTED.ID_Convenio, INSERTED.Saldo_Convenio INTO @r
            WHERE ID_Plan IN (${ids.join(',')}) AND Estado_Cobro_Convenio = 'PENDIENTE' AND Saldo_Convenio > 0;
            SELECT * FROM @r;`);
        for (const x of r.recordset) {
            await movimiento(tx, { idPlan: x.ID_Plan, idConvenio: x.ID_Convenio, tipo: 'ENVIADO', monto: x.Saldo_Convenio, referencia: req.body.referencia, idUsuario: req.usuarioAuth?.id_usuario });
        }
        await tx.commit();
        res.json({ status: 'Success', message: `${r.recordset.length} atención(es) marcadas como enviadas al convenio.` });
    } catch (e) {
        try { await tx.rollback(); } catch (_) { }
        console.error('❌ envío convenio:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo marcar el envío.' });
    }
};

// POST /api/convenios/cobros { items: [{ id_plan, monto }], metodo, referencia }
// El convenio pagó: entra como un pago más (Pagos + caja abierta del usuario, igual que un
// abono del paciente) para que ingresos, cierre de caja y comisiones cuadren.
const registrarCobro = async (req, res) => {
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 500)
        .map(x => ({ idPlan: parseInt(x.id_plan, 10), monto: r2(x.monto) })).filter(x => x.idPlan && x.monto > 0);
    if (!items.length) return res.status(400).json({ status: 'Error', message: 'Indique las atenciones y los valores pagados.' });
    const metodo = txt(req.body.metodo, 50) || 'Transferencia';
    const referencia = txt(req.body.referencia, 100) || '';
    const idUsuario = req.usuarioAuth?.id_usuario;
    const idClinica = req.usuarioAuth?.id_clinica || 1;
    const pool = await getConnection();
    const tx = new sql.Transaction(pool);
    try {
        await tx.begin();
        // Caja abierta del usuario (se crea si no hay, igual que en registrarPago)
        let caja = (await tx.request().input('u', sql.Int, idUsuario).input('c', sql.Int, idClinica).query(`
            SELECT TOP 1 ID_Caja FROM Caja WHERE ID_Usuario_Apertura = @u AND ID_Clinica = @c AND UPPER(TRIM(Estado)) = 'ABIERTA'
            ORDER BY Fecha_Apertura DESC`)).recordset[0];
        if (!caja) {
            caja = (await tx.request().input('u', sql.Int, idUsuario).input('c', sql.Int, idClinica).query(`
                INSERT INTO Caja (ID_Clinica, ID_Usuario_Apertura, Fecha_Apertura, Monto_Inicial, Estado, Monto_Sistema)
                OUTPUT INSERTED.ID_Caja VALUES (@c, @u, GETDATE(), 0, 'ABIERTA', 0)`)).recordset[0];
        }
        const m = metodo.toUpperCase();
        const columnaCaja = m.includes('TRANSFERENCIA') ? 'Transferencia_Sistema' : m.includes('TARJETA') ? 'Tarjeta_Sistema' : 'Efectivo_Sistema';
        let total = 0;
        for (const it of items) {
            const t = (await tx.request().input('id', sql.Int, it.idPlan).query(`
                SELECT t.ID_Paciente, t.ID_Convenio, t.Saldo_Convenio, C.Nombre FROM Tratamientos_Plan t
                LEFT JOIN Convenios C ON C.ID_Convenio = t.ID_Convenio WHERE t.ID_Plan = @id`)).recordset[0];
            if (!t || !t.ID_Convenio) throw new Error(`El tratamiento #${it.idPlan} no está a cargo de un convenio.`);
            if (it.monto > r2(t.Saldo_Convenio) + 0.009) throw new Error(`El tratamiento #${it.idPlan}: el convenio solo debe $${r2(t.Saldo_Convenio).toFixed(2)}.`);
            const pago = (await tx.request()
                .input('pac', sql.Int, t.ID_Paciente).input('cli', sql.Int, idClinica).input('monto', sql.Decimal(18, 2), it.monto)
                .input('concepto', sql.NVarChar(200), `Pago de ${String(t.Nombre || 'convenio').slice(0, 120)} a Plan #${it.idPlan}`)
                .input('metodo', sql.NVarChar(50), metodo).input('caja', sql.Int, caja.ID_Caja).input('usr', sql.Int, idUsuario)
                .input('plan', sql.Int, it.idPlan).input('ref', sql.NVarChar(100), referencia).query(`
                INSERT INTO Pagos (ID_Paciente, ID_Clinica, Monto, Concepto, Metodo_Pago, Fecha_Pago, ID_Caja, ID_Usuario, ID_Plan, Ruta_Voucher_Img, Referencia_Bancaria)
                OUTPUT INSERTED.ID_Pago VALUES (@pac, @cli, @monto, @concepto, @metodo, GETDATE(), @caja, @usr, @plan, NULL, @ref)`)).recordset[0];
            await tx.request().input('id', sql.Int, it.idPlan).input('m', sql.Decimal(18, 2), it.monto).query(`
                UPDATE Tratamientos_Plan SET Saldo_Convenio = Saldo_Convenio - @m,
                       Estado_Cobro_Convenio = CASE WHEN Saldo_Convenio - @m <= 0.009 THEN 'PAGADO' ELSE 'PARCIAL' END
                WHERE ID_Plan = @id;
                UPDATE Tratamientos_Plan SET ${SQL_ESTADO} WHERE ID_Plan = @id;`);
            await movimiento(tx, { idPlan: it.idPlan, idConvenio: t.ID_Convenio, tipo: 'PAGO', monto: it.monto, idPago: pago.ID_Pago, referencia, idUsuario });
            total += it.monto;
        }
        total = r2(total);
        await tx.request().input('caja', sql.Int, caja.ID_Caja).input('m', sql.Decimal(18, 2), total).query(`
            UPDATE Caja SET Monto_Sistema = ISNULL(Monto_Sistema, 0) + @m, ${columnaCaja} = ISNULL(${columnaCaja}, 0) + @m WHERE ID_Caja = @caja`);
        await tx.commit();
        res.json({ status: 'Success', message: `Cobro de $${total.toFixed(2)} registrado en ${items.length} atención(es).` });
    } catch (e) {
        try { await tx.rollback(); } catch (_) { }
        res.status(400).json({ status: 'Error', message: e.message });
    }
};

// POST /api/convenios/rechazo { ids_plan, motivo } — el convenio no paga (glosa / objeción):
// lo que faltaba cobrar al seguro pasa a deberlo el paciente. Solo el administrador.
const rechazar = async (req, res) => {
    if (soloAdmin(req, res)) return;
    const ids = idsValidos(req.body?.ids_plan);
    const motivo = txt(req.body?.motivo, 500);
    if (!ids.length) return res.status(400).json({ status: 'Error', message: 'No hay atenciones seleccionadas.' });
    if (!motivo) return res.status(400).json({ status: 'Error', message: 'Indique el motivo del rechazo.' });
    const pool = await getConnection();
    const tx = new sql.Transaction(pool);
    try {
        await tx.begin();
        const r = await tx.request().query(`
            DECLARE @r TABLE (ID_Plan INT, ID_Convenio INT, Monto DECIMAL(18,2));
            UPDATE Tratamientos_Plan SET Saldo_Pendiente = Saldo_Pendiente + Saldo_Convenio, Saldo_Convenio = 0, Estado_Cobro_Convenio = 'RECHAZADO'
            OUTPUT INSERTED.ID_Plan, INSERTED.ID_Convenio, DELETED.Saldo_Convenio INTO @r
            WHERE ID_Plan IN (${ids.join(',')}) AND Saldo_Convenio > 0;
            SELECT * FROM @r;
            UPDATE Tratamientos_Plan SET ${SQL_ESTADO} WHERE ID_Plan IN (${ids.join(',')});`);
        for (const x of r.recordset) {
            await movimiento(tx, { idPlan: x.ID_Plan, idConvenio: x.ID_Convenio, tipo: 'RECHAZO', monto: x.Monto, observacion: motivo, idUsuario: req.usuarioAuth?.id_usuario });
        }
        await tx.commit();
        res.json({ status: 'Success', message: `${r.recordset.length} atención(es) rechazada(s): el valor pasa al saldo del paciente.` });
    } catch (e) {
        try { await tx.rollback(); } catch (_) { }
        console.error('❌ rechazo convenio:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo registrar el rechazo.' });
    }
};

module.exports = { listar, crear, actualizar, delPaciente, asignarPaciente, quitarPaciente, planilla, coberturaTratamiento, movimientosTratamiento, porCobrar, marcarEnviado, registrarCobro, rechazar };
