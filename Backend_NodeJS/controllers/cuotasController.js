// v4.8.0 — cuotas por tratamiento + link de pago (Payphone). Lógica en services/cobrosLinea.js
const { getConnection, sql } = require('../config/db');
const cl = require('../services/cobrosLinea');

const esAdmin = req => Number(req.usuarioAuth?.id_rol) === 1;
const idClinica = req => req.usuarioAuth?.id_clinica || 1;
const fallo = (res, e, def) => {
    if (!e.http) console.error('❌ cuotas:', e.message);
    res.status(e.http || 500).json({ status: 'Error', message: e.http ? e.message : def });
};

async function planBasico(pool, idPlan) {
    const r = await pool.request().input('p', sql.Int, idPlan).query(`
        SELECT t.ID_Plan, t.ID_Paciente, t.Costo_Total, t.Saldo_Pendiente, ISNULL(t.Saldo_Convenio, 0) AS Saldo_Convenio,
               ISNULL(t.Nombre_Tratamiento, pr.Nombre_Prestacion) AS Tratamiento, P.Nombres, P.Apellidos, P.Telefono, P.ID_Clinica
        FROM Tratamientos_Plan t INNER JOIN Pacientes P ON P.ID_Paciente = t.ID_Paciente
        LEFT JOIN Prestaciones pr ON pr.ID_Prestacion = t.ID_Prestacion WHERE t.ID_Plan = @p`);
    if (!r.recordset[0]) throw cl.errorUsuario('Tratamiento no encontrado.', 404);
    return r.recordset[0];
}

// GET /api/cuotas/plan/:idPlan — calendario con lo pagado de cada cuota + links del tratamiento
const verPlan = async (req, res) => {
    try {
        const idPlan = parseInt(req.params.idPlan, 10);
        const pool = await getConnection();
        const plan = await planBasico(pool, idPlan);
        const est = cl.estadoCuotas(await cl.cuotasDelPlan(pool, idPlan), plan.Saldo_Pendiente);
        const links = (await pool.request().input('p', sql.Int, idPlan).query(`
            SELECT TOP 15 L.ID_Link, L.ID_Cuota, L.Monto, L.Url, L.Estado, L.Fecha_Creacion, L.Fecha_Expira, L.Fecha_Pago, L.Autorizacion, L.Detalle, q.Numero AS Numero_Cuota
            FROM Links_Pago L LEFT JOIN Tratamiento_Cuotas q ON q.ID_Cuota = L.ID_Cuota WHERE L.ID_Plan = @p ORDER BY L.ID_Link DESC`)).recordset;
        const cfg = await cl.configClinica(pool, plan.ID_Clinica);
        res.json({ plan, ...est, links, payphone: !!(cfg.tokenCifrado && cfg.storeId) });
    } catch (e) { fallo(res, e, 'No se pudo cargar las cuotas.'); }
};

// POST /api/cuotas/plan/:idPlan { numero_cuotas, frecuencia, primera_fecha } — crea (o rehace) el calendario
const crearPlan = async (req, res) => {
    try {
        const idPlan = parseInt(req.params.idPlan, 10);
        const n = parseInt(req.body.numero_cuotas, 10);
        const frecuencia = ['MENSUAL', 'QUINCENAL', 'SEMANAL'].includes(String(req.body.frecuencia).toUpperCase()) ? String(req.body.frecuencia).toUpperCase() : 'MENSUAL';
        const primera = String(req.body.primera_fecha || '');
        if (!(n >= 2 && n <= 48)) throw cl.errorUsuario('Elija entre 2 y 48 cuotas.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(primera)) throw cl.errorUsuario('Indique la fecha de la primera cuota.');
        const pool = await getConnection();
        const plan = await planBasico(pool, idPlan);
        const saldo = cl.r2(plan.Saldo_Pendiente);
        if (saldo < 1) throw cl.errorUsuario('Este tratamiento no tiene saldo del paciente para dividir en cuotas.');
        const cal = cl.calendario(saldo, n, frecuencia, primera);
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await tx.request().input('p', sql.Int, idPlan).query('UPDATE Tratamiento_Cuotas SET Activo = 0 WHERE ID_Plan = @p AND Activo = 1');
            for (const c of cal) {
                await tx.request().input('p', sql.Int, idPlan).input('n', sql.Int, c.numero).input('m', sql.Decimal(18, 2), c.monto)
                    .input('f', sql.VarChar(10), c.vence).input('u', sql.Int, req.usuarioAuth?.id_usuario || null)
                    .query('INSERT INTO Tratamiento_Cuotas (ID_Plan, Numero, Monto, Fecha_Vencimiento, ID_Usuario) VALUES (@p, @n, @m, CONVERT(DATE, @f, 23), @u)');
            }
            await tx.commit();
        } catch (e) { try { await tx.rollback(); } catch (_) { } throw e; }
        res.json({ status: 'Success', id_paciente: plan.ID_Paciente, message: `Plan de ${n} cuotas de $${cal[0].monto.toFixed(2)} creado (${frecuencia.toLowerCase()}).` });
    } catch (e) { fallo(res, e, 'No se pudo crear el plan de cuotas.'); }
};

// DELETE /api/cuotas/plan/:idPlan — quita el calendario (no toca pagos ni saldo)
const quitarPlan = async (req, res) => {
    try {
        const idPlan = parseInt(req.params.idPlan, 10);
        const pool = await getConnection();
        const plan = await planBasico(pool, idPlan);
        await pool.request().input('p', sql.Int, idPlan).query('UPDATE Tratamiento_Cuotas SET Activo = 0 WHERE ID_Plan = @p AND Activo = 1');
        res.json({ status: 'Success', id_paciente: plan.ID_Paciente, message: 'Se quitó el plan de cuotas. El saldo del paciente no cambia.' });
    } catch (e) { fallo(res, e, 'No se pudo quitar el plan de cuotas.'); }
};

// GET /api/cuotas/vencidas — cuotas atrasadas de la sede (para llamar / enviar link)
const vencidas = async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().input('c', sql.Int, idClinica(req)).query(`
            SELECT q.ID_Plan, q.ID_Cuota, q.Numero, q.Monto, q.Fecha_Vencimiento, q.Ultimo_Recordatorio,
                   t.Saldo_Pendiente, ISNULL(t.Nombre_Tratamiento, pr.Nombre_Prestacion) AS Tratamiento,
                   P.ID_Paciente, P.Apellidos + ' ' + P.Nombres AS Paciente, P.Telefono, P.DNI
            FROM Tratamiento_Cuotas q
            INNER JOIN Tratamientos_Plan t ON t.ID_Plan = q.ID_Plan
            INNER JOIN Pacientes P ON P.ID_Paciente = t.ID_Paciente
            LEFT JOIN Prestaciones pr ON pr.ID_Prestacion = t.ID_Prestacion
            WHERE q.Activo = 1 AND t.Saldo_Pendiente > 0.01 AND P.ID_Clinica = @c
            ORDER BY q.ID_Plan, q.Numero`);
        const porPlan = new Map();
        for (const f of r.recordset) { if (!porPlan.has(f.ID_Plan)) porPlan.set(f.ID_Plan, []); porPlan.get(f.ID_Plan).push(f); }
        const filas = [];
        for (const [idPlan, lista] of porPlan) {
            const f0 = lista[0];
            const est = cl.estadoCuotas(lista, f0.Saldo_Pendiente);
            const atrasadas = est.cuotas.filter(c => c.estado === 'VENCIDA');
            if (!atrasadas.length) continue;
            filas.push({
                id_plan: idPlan, id_paciente: f0.ID_Paciente, paciente: f0.Paciente, dni: f0.DNI, telefono: f0.Telefono, tratamiento: f0.Tratamiento,
                cuotas_vencidas: atrasadas.length, vencido: est.vencido, desde: atrasadas[0].vence, primera: atrasadas[0], saldo: est.saldo
            });
        }
        filas.sort((a, b) => a.desde.localeCompare(b.desde));
        res.json({ filas, total: cl.r2(filas.reduce((s, f) => s + f.vencido, 0)) });
    } catch (e) { fallo(res, e, 'No se pudo cargar las cuotas vencidas.'); }
};

// GET /api/cuotas/config — Payphone de la sede (el token nunca se devuelve)
const verConfig = async (req, res) => {
    try {
        const cfg = await cl.configClinica(await getConnection(), idClinica(req));
        res.json({ clinica: cfg.clinica, store_id: cfg.storeId, token_guardado: !!cfg.tokenCifrado, recordatorio: cfg.recordatorio });
    } catch (e) { fallo(res, e, 'No se pudo leer la configuración.'); }
};

// PUT /api/cuotas/config { token?, store_id, recordatorio, borrar_token? } — solo administrador
const guardarConfig = async (req, res) => {
    if (!esAdmin(req)) return res.status(403).json({ status: 'Error', message: 'Solo el administrador configura los cobros en línea.' });
    try {
        await cl.guardarConfig(await getConnection(), idClinica(req), {
            token: req.body.token, storeId: req.body.store_id, recordatorio: !!req.body.recordatorio, borrarToken: !!req.body.borrar_token
        });
        res.json({ status: 'Success', message: 'Configuración de cobros en línea guardada.' });
    } catch (e) { fallo(res, e, 'No se pudo guardar la configuración.'); }
};

// POST /api/cuotas/link { id_plan, id_cuota?, monto, horas?, enviar_whatsapp? }
const crearLink = async (req, res) => {
    try {
        const pool = await getConnection();
        const l = await cl.crearLinkPago(pool, {
            idPlan: parseInt(req.body.id_plan, 10), idCuota: parseInt(req.body.id_cuota, 10) || null,
            monto: req.body.monto, horas: req.body.horas, idUsuario: req.usuarioAuth?.id_usuario
        });
        let whatsapp = null;
        const texto = cl.textoLink(l);
        if (req.body.enviar_whatsapp) {
            const tel = String(l.telefono || '').replace(/\D/g, '');
            if (tel.length < 7) whatsapp = { success: false, motivo: 'El paciente no tiene un teléfono válido registrado.' };
            else {
                const wa = require('../services/whatsappService');
                const estado = typeof wa.obtenerEstadoBot === 'function' ? wa.obtenerEstadoBot() : null;
                if (estado && estado !== 'conectado') whatsapp = { success: false, motivo: 'El WhatsApp de la clínica no está vinculado.' };
                else {
                    try { whatsapp = await wa.enviarMensaje(l.telefono, texto); } catch (e) { whatsapp = { success: false, motivo: e.message }; }
                    if (whatsapp && !whatsapp.success && !whatsapp.motivo) whatsapp.motivo = 'El número del paciente no tiene WhatsApp.';
                }
            }
        }
        res.json({ status: 'Success', id_paciente: l.id_paciente, id_link: l.id_link, url: l.url, monto: l.monto, horas: l.horas, texto, whatsapp });
    } catch (e) { fallo(res, e, 'No se pudo generar el link de pago.'); }
};

// POST /api/cuotas/link/:id/verificar — consulta a Payphone ahora (sin esperar la ronda de cada minuto)
const verificarLink = async (req, res) => {
    try {
        const pool = await getConnection();
        const l = (await pool.request().input('id', sql.Int, parseInt(req.params.id, 10)).query('SELECT * FROM Links_Pago WHERE ID_Link = @id')).recordset[0];
        if (!l) throw cl.errorUsuario('Link no encontrado.', 404);
        const estado = await cl.revisarLink(pool, l);
        res.json({ status: 'Success', estado, id_paciente: l.ID_Paciente, message: estado === 'PAGADO' ? 'El paciente ya pagó: el pago quedó registrado en caja.' : estado === 'EXPIRADO' ? 'El link venció sin pago.' : 'Todavía no se ha pagado.' });
    } catch (e) { fallo(res, e, 'No se pudo verificar el link.'); }
};

module.exports = { verPlan, crearPlan, quitarPlan, vencidas, verConfig, guardarConfig, crearLink, verificarLink };
