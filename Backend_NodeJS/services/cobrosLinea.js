// =====================================================================
//  v4.8.0 — CUOTAS + LINK DE PAGO (Payphone)
//  - Cuotas: calendario sobre el saldo del paciente. Lo pagado NO se guarda por cuota: se
//    calcula como (suma de cuotas − saldo actual), así cualquier abono (caja, link, convenio)
//    se descuenta de las cuotas en orden y nunca hay dos verdades.
//  - Link de pago: API Links de Payphone. El servidor local no es visible desde internet, por
//    eso no se usa webhook: se consulta el estado (API Sale/client) cada minuto y, si está
//    aprobado, se registra el pago solo (Pagos + caja de quien generó el link).
// =====================================================================
const { sql } = require('../config/db');

const PAYPHONE = 'https://pay.payphonetodoesposible.com/api';
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Columnas DATE: mssql las entrega a medianoche UTC (useUTC) o a medianoche local; se toma el día correcto en ambos casos
const isoDe = v => { if (!v) return null; if (typeof v === 'string') return v.slice(0, 10); const d = new Date(v); const utc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0; const y = utc ? d.getUTCFullYear() : d.getFullYear(), m = utc ? d.getUTCMonth() : d.getMonth(), dd = utc ? d.getUTCDate() : d.getDate(); return `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; };
const fechaEs = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const errorUsuario = (msg, http = 400) => Object.assign(new Error(msg), { http });

// ---------------------------------------------------------------------
// Cuotas
// ---------------------------------------------------------------------
// Reparte lo abonado sobre las cuotas en orden. cuotas: [{ID_Cuota, Numero, Monto, Fecha_Vencimiento}]
function estadoCuotas(cuotas, saldoPaciente) {
    const base = r2(cuotas.reduce((s, c) => s + Number(c.Monto), 0));
    const saldo = r2(saldoPaciente);
    let resto = Math.max(0, r2(base - saldo));
    const hoy = hoyISO();
    const lista = cuotas.map(c => {
        const monto = r2(c.Monto);
        const pagado = r2(Math.min(monto, resto));
        resto = r2(resto - pagado);
        const vence = isoDe(c.Fecha_Vencimiento);
        const pendiente = r2(monto - pagado);
        const estado = pendiente <= 0.01 ? 'PAGADA' : vence < hoy ? 'VENCIDA' : pagado > 0.009 ? 'PARCIAL' : 'PENDIENTE';
        return { id_cuota: c.ID_Cuota, numero: c.Numero, monto, pagado, pendiente: Math.max(0, pendiente), vence, estado, ultimo_recordatorio: isoDe(c.Ultimo_Recordatorio) };
    });
    return {
        cuotas: lista, base, saldo,
        // Saldo que quedó fuera del calendario (p. ej. un rechazo del convenio que pasó al paciente)
        fuera_plan: Math.max(0, r2(saldo - base)),
        vencido: r2(lista.filter(c => c.estado === 'VENCIDA').reduce((s, c) => s + c.pendiente, 0))
    };
}

// Arma N cuotas iguales (la última absorbe el redondeo)
function calendario(saldo, n, frecuencia, primera) {
    const total = r2(saldo);
    const cuota = Math.floor((total / n) * 100) / 100;
    const [a, m, d] = primera.split('-').map(Number);
    const out = [];
    for (let i = 0; i < n; i++) {
        let f;
        if (frecuencia === 'SEMANAL') f = new Date(Date.UTC(a, m - 1, d + 7 * i));
        else if (frecuencia === 'QUINCENAL') f = new Date(Date.UTC(a, m - 1, d + 15 * i));
        else {
            // Mensual: mismo día; si el mes no lo tiene (31 → febrero) va al último día del mes
            const ultimo = new Date(Date.UTC(a, m - 1 + i + 1, 0)).getUTCDate();
            f = new Date(Date.UTC(a, m - 1 + i, Math.min(d, ultimo)));
        }
        out.push({ numero: i + 1, monto: i === n - 1 ? r2(total - cuota * (n - 1)) : cuota, vence: f.toISOString().slice(0, 10) });
    }
    return out;
}

async function cuotasDelPlan(pool, idPlan) {
    const r = await pool.request().input('p', sql.Int, idPlan).query(`
        SELECT ID_Cuota, Numero, Monto, Fecha_Vencimiento, Ultimo_Recordatorio, ID_Usuario
        FROM Tratamiento_Cuotas WHERE ID_Plan = @p AND Activo = 1 ORDER BY Numero`);
    return r.recordset;
}

// ---------------------------------------------------------------------
// Configuración de Payphone por sede
// ---------------------------------------------------------------------
function cifrar(texto) { return require('./firmaElectronicaService').cifrarClaveFirma(texto); }
function descifrar(valor) {
    try { return require('./firmaElectronicaService').leerClaveFirma(valor); }
    catch (_) { throw errorUsuario('No se pudo leer el token de Payphone guardado (cambió la llave de cifrado del servidor). Vuelva a ingresarlo en Cobros en línea.'); }
}

async function configClinica(pool, idClinica) {
    const r = await pool.request().input('c', sql.Int, idClinica || 1)
        .query('SELECT ID_Clinica, Nombre_Clinica, Payphone_Token, Payphone_StoreId, Recordatorio_Cuotas FROM Clinicas WHERE ID_Clinica = @c');
    const c = r.recordset[0] || {};
    return { idClinica: c.ID_Clinica, clinica: c.Nombre_Clinica || 'la clínica', tokenCifrado: c.Payphone_Token || null, storeId: c.Payphone_StoreId || '', recordatorio: !!c.Recordatorio_Cuotas };
}

async function guardarConfig(pool, idClinica, { token, storeId, recordatorio, borrarToken }) {
    const req = pool.request().input('c', sql.Int, idClinica || 1)
        .input('store', sql.NVarChar(100), storeId ? String(storeId).trim().slice(0, 100) : null)
        .input('rec', sql.Bit, recordatorio ? 1 : 0);
    let setToken = '';
    if (borrarToken) setToken = ', Payphone_Token = NULL';
    else if (token && String(token).trim()) { req.input('tok', sql.NVarChar(sql.MAX), cifrar(String(token).trim())); setToken = ', Payphone_Token = @tok'; }
    await req.query(`UPDATE Clinicas SET Payphone_StoreId = @store, Recordatorio_Cuotas = @rec${setToken} WHERE ID_Clinica = @c`);
}

// ---------------------------------------------------------------------
// Payphone
// ---------------------------------------------------------------------
async function llamarPayphone(token, metodo, ruta, cuerpo) {
    let r;
    try {
        r = await fetch(PAYPHONE + ruta, {
            method: metodo,
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept-Language': 'es' },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
            signal: AbortSignal.timeout(20000)
        });
    } catch (e) {
        throw errorUsuario('No hay conexión con Payphone (revise el internet del servidor): ' + e.message, 502);
    }
    const texto = await r.text();
    let datos = texto;
    try { datos = JSON.parse(texto); } catch (_) { /* puede venir texto plano */ }
    return { ok: r.ok, status: r.status, datos };
}

function mensajePayphone(d, status) {
    if (status === 401) return 'Payphone rechazó el token (401). Revise que sea el token de una aplicación tipo API en Payphone Developer.';
    if (d && typeof d === 'object') {
        const det = Array.isArray(d.errors) ? d.errors.map(e => (e.errorDescriptions || []).join(' ') || e.message).filter(Boolean).join(' ') : '';
        return [d.message, det].filter(Boolean).join(': ') || `Payphone respondió ${status}.`;
    }
    return `Payphone respondió ${status}.`;
}

const nuevoTxId = () => ('AM' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 15);

// Crea el link y lo registra. Devuelve datos para mostrar / enviar por WhatsApp.
async function crearLinkPago(pool, { idPlan, idCuota, monto, idUsuario, horas }) {
    const p = (await pool.request().input('p', sql.Int, idPlan).query(`
        SELECT t.ID_Plan, t.ID_Paciente, t.Saldo_Pendiente, ISNULL(t.Nombre_Tratamiento, pr.Nombre_Prestacion) AS Tratamiento,
               P.ID_Clinica, P.Nombres, P.Apellidos, P.Telefono
        FROM Tratamientos_Plan t INNER JOIN Pacientes P ON P.ID_Paciente = t.ID_Paciente
        LEFT JOIN Prestaciones pr ON pr.ID_Prestacion = t.ID_Prestacion WHERE t.ID_Plan = @p`)).recordset[0];
    if (!p) throw errorUsuario('Tratamiento no encontrado.', 404);
    const saldo = r2(p.Saldo_Pendiente);
    monto = r2(monto);
    if (!(monto > 0)) throw errorUsuario('Indique el valor a cobrar.');
    if (monto > saldo + 0.01) throw errorUsuario(`El valor ($${monto.toFixed(2)}) es mayor que lo que debe el paciente ($${saldo.toFixed(2)}).`);
    const cfg = await configClinica(pool, p.ID_Clinica);
    if (!cfg.tokenCifrado || !cfg.storeId) throw errorUsuario('Configure primero Payphone (token y Store ID) en Dashboard → Configuración → Cobros en línea.');
    const token = descifrar(cfg.tokenCifrado);
    horas = Math.max(1, Math.min(168, parseInt(horas, 10) || 72));
    let numeroCuota = null;
    if (idCuota) {
        const q = (await pool.request().input('q', sql.Int, idCuota).input('p', sql.Int, idPlan)
            .query('SELECT Numero FROM Tratamiento_Cuotas WHERE ID_Cuota = @q AND ID_Plan = @p AND Activo = 1')).recordset[0];
        if (!q) throw errorUsuario('La cuota ya no existe (se rehízo el plan de cuotas).');
        numeroCuota = q.Numero;
    }
    const centavos = Math.round(monto * 100);
    const txId = nuevoTxId();
    const referencia = `${cfg.clinica} - ${p.Tratamiento || 'Tratamiento'}${numeroCuota ? ' (cuota ' + numeroCuota + ')' : ''}`.slice(0, 100);
    // Servicios de salud: tarifa 0 % de IVA → todo va como monto sin impuesto
    const r = await llamarPayphone(token, 'POST', '/Links', {
        amount: centavos, amountWithoutTax: centavos, amountWithTax: 0, tax: 0, service: 0, tip: 0, currency: 'USD',
        clientTransactionId: txId, storeId: cfg.storeId, reference: referencia, oneTime: true, expireIn: horas,
        additionalData: `Paciente ${p.Nombres} ${p.Apellidos}`.slice(0, 250)
    });
    const url = typeof r.datos === 'string' && /^https?:\/\//i.test(r.datos.trim()) ? r.datos.trim() : null;
    if (!r.ok || !url) throw errorUsuario('Payphone no generó el link: ' + mensajePayphone(r.datos, r.status), 502);
    const ins = await pool.request()
        .input('cli', sql.Int, p.ID_Clinica).input('pac', sql.Int, p.ID_Paciente).input('plan', sql.Int, idPlan).input('cuota', sql.Int, idCuota || null)
        .input('monto', sql.Decimal(18, 2), monto).input('tx', sql.VarChar(15), txId).input('url', sql.NVarChar(400), url)
        .input('horas', sql.Int, horas).input('usr', sql.Int, idUsuario || null)
        .query(`INSERT INTO Links_Pago (ID_Clinica, ID_Paciente, ID_Plan, ID_Cuota, Monto, Client_Tx_Id, Url, Fecha_Expira, ID_Usuario)
                OUTPUT INSERTED.ID_Link VALUES (@cli, @pac, @plan, @cuota, @monto, @tx, @url, DATEADD(HOUR, @horas, GETDATE()), @usr)`);
    return {
        id_link: ins.recordset[0].ID_Link, url, monto, horas, numero_cuota: numeroCuota, telefono: p.Telefono, nombres: p.Nombres,
        tratamiento: p.Tratamiento, clinica: cfg.clinica, id_paciente: p.ID_Paciente
    };
}

function textoLink(l) {
    return `Hola ${l.nombres || ''}, ${l.clinica} te envía el link para pagar *$${Number(l.monto).toFixed(2)}* de tu tratamiento ${l.tratamiento || ''}${l.numero_cuota ? ' (cuota ' + l.numero_cuota + ')' : ''}:\n${l.url}\n\nPuedes pagar con tarjeta de forma segura con Payphone. El link vale ${l.horas} horas.`;
}

// Consulta Payphone; si está aprobado registra el pago. Devuelve 'PAGADO' | 'PENDIENTE' | 'EXPIRADO'.
async function revisarLink(pool, link) {
    if (link.Estado !== 'PENDIENTE') return link.Estado;
    const cfg = await configClinica(pool, link.ID_Clinica);
    if (!cfg.tokenCifrado) return 'PENDIENTE';
    const r = await llamarPayphone(descifrar(cfg.tokenCifrado), 'GET', `/Sale/client/${encodeURIComponent(link.Client_Tx_Id)}`);
    const lista = Array.isArray(r.datos) ? r.datos : (r.datos && typeof r.datos === 'object' ? [r.datos] : []);
    const aprobada = r.ok ? lista.find(x => Number(x.statusCode) === 3 || String(x.transactionStatus || '').toLowerCase() === 'approved') : null;
    if (aprobada) {
        await registrarPagoLink(pool, link, aprobada);
        return 'PAGADO';
    }
    const vencido = new Date(link.Fecha_Expira).getTime() + 30 * 60000 < Date.now();
    await pool.request().input('id', sql.Int, link.ID_Link).input('venc', sql.Bit, vencido ? 1 : 0)
        .query(`UPDATE Links_Pago SET Ultima_Revision = GETDATE(), Estado = CASE WHEN @venc = 1 AND Estado = 'PENDIENTE' THEN 'EXPIRADO' ELSE Estado END WHERE ID_Link = @id`);
    return vencido ? 'EXPIRADO' : 'PENDIENTE';
}

// Igual que un abono en caja: Pagos + saldo del plan + caja abierta de quien generó el link
async function registrarPagoLink(pool, link, venta) {
    const monto = venta.amount ? r2(Number(venta.amount) / 100) : r2(link.Monto);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const marca = await tx.request().input('id', sql.Int, link.ID_Link)
            .input('trx', sql.BigInt, venta.transactionId || null).input('aut', sql.NVarChar(50), venta.authorizationCode ? String(venta.authorizationCode).slice(0, 50) : null)
            .query(`UPDATE Links_Pago SET Estado = 'PAGADO', Fecha_Pago = GETDATE(), Ultima_Revision = GETDATE(), Transaction_Id = @trx, Autorizacion = @aut
                    WHERE ID_Link = @id AND Estado <> 'PAGADO'; SELECT @@ROWCOUNT AS n`);
        if (!marca.recordset[0].n) { await tx.rollback(); return null; }   // otro proceso ya lo registró
        let idUsuario = link.ID_Usuario;
        if (!idUsuario) idUsuario = (await tx.request().input('c', sql.Int, link.ID_Clinica)
            .query('SELECT TOP 1 ID_Usuario FROM Usuarios WHERE Activo = 1 AND ID_Rol = 1 ORDER BY CASE WHEN ID_Clinica = @c THEN 0 ELSE 1 END, ID_Usuario')).recordset[0]?.ID_Usuario;
        const caja = await tx.request().input('u', sql.Int, idUsuario).input('c', sql.Int, link.ID_Clinica).query(`
            DECLARE @id INT = (SELECT TOP 1 ID_Caja FROM Caja WHERE ID_Usuario_Apertura = @u AND ID_Clinica = @c AND UPPER(TRIM(Estado)) = 'ABIERTA' ORDER BY Fecha_Apertura DESC);
            IF @id IS NULL BEGIN
                INSERT INTO Caja (ID_Clinica, ID_Usuario_Apertura, Fecha_Apertura, Monto_Inicial, Estado, Monto_Sistema) VALUES (@c, @u, GETDATE(), 0, 'ABIERTA', 0);
                SET @id = SCOPE_IDENTITY();
            END
            SELECT @id AS ID_Caja`);
        const idCaja = caja.recordset[0].ID_Caja;
        const pago = await tx.request()
            .input('pac', sql.Int, link.ID_Paciente).input('cli', sql.Int, link.ID_Clinica).input('m', sql.Decimal(18, 2), monto)
            .input('con', sql.NVarChar(200), `Pago en línea (Payphone) a Plan #${link.ID_Plan}`).input('caja', sql.Int, idCaja)
            .input('u', sql.Int, idUsuario).input('plan', sql.Int, link.ID_Plan)
            .input('ref', sql.NVarChar(100), `Payphone ${venta.authorizationCode || ''} ${venta.transactionId || ''}`.trim().slice(0, 100))
            .query(`INSERT INTO Pagos (ID_Paciente, ID_Clinica, Monto, Concepto, Metodo_Pago, Fecha_Pago, ID_Caja, ID_Usuario, ID_Plan, Ruta_Voucher_Img, Referencia_Bancaria)
                    OUTPUT INSERTED.ID_Pago VALUES (@pac, @cli, @m, @con, 'Tarjeta (Payphone)', GETDATE(), @caja, @u, @plan, NULL, @ref)`);
        const idPago = pago.recordset[0].ID_Pago;
        await tx.request().input('p', sql.Int, link.ID_Plan).input('m', sql.Decimal(18, 2), monto).query(`
            UPDATE Tratamientos_Plan SET Saldo_Pendiente = Saldo_Pendiente - @m,
                Estado_Tratamiento = CASE WHEN (Saldo_Pendiente - @m) <= 0.05 AND ISNULL(Saldo_Convenio, 0) <= 0.05 THEN 'PAGADO' ELSE Estado_Tratamiento END
            WHERE ID_Plan = @p`);
        await tx.request().input('c', sql.Int, idCaja).input('m', sql.Decimal(18, 2), monto)
            .query('UPDATE Caja SET Monto_Sistema = ISNULL(Monto_Sistema, 0) + @m, Tarjeta_Sistema = ISNULL(Tarjeta_Sistema, 0) + @m WHERE ID_Caja = @c');
        await tx.request().input('id', sql.Int, link.ID_Link).input('pago', sql.Int, idPago).input('det', sql.NVarChar(300),
            Math.abs(monto - r2(link.Monto)) > 0.009 ? `Payphone aprobó $${monto.toFixed(2)} (el link era por $${r2(link.Monto).toFixed(2)})` : null)
            .query('UPDATE Links_Pago SET ID_Pago = @pago, Detalle = ISNULL(@det, Detalle) WHERE ID_Link = @id');
        await tx.commit();
        console.log(`💳 [Payphone]: pago en línea registrado — link #${link.ID_Link}, plan #${link.ID_Plan}, $${monto.toFixed(2)}`);
        return idPago;
    } catch (e) {
        try { await tx.rollback(); } catch (_) { }
        throw e;
    }
}

// Ronda de cada minuto: los links recientes se revisan cada minuto, los viejos cada 10.
let revisando = false;
async function revisarLinksPendientes(pool) {
    if (revisando) return 0;
    revisando = true;
    let pagados = 0;
    try {
        const r = await pool.request().query(`
            SELECT TOP 20 * FROM Links_Pago
            WHERE Estado = 'PENDIENTE'
              AND (Ultima_Revision IS NULL OR Ultima_Revision < DATEADD(SECOND, CASE WHEN Fecha_Creacion > DATEADD(HOUR, -2, GETDATE()) THEN -50 ELSE -600 END, GETDATE()))
            ORDER BY ISNULL(Ultima_Revision, '2000-01-01')`);
        for (const l of r.recordset) {
            try { if (await revisarLink(pool, l) === 'PAGADO') pagados++; }
            catch (e) { console.error(`❌ [Payphone]: link #${l.ID_Link}:`, e.message); }
        }
    } catch (e) {
        if (!/Invalid object name/i.test(e.message)) console.error('❌ [Payphone]: revisión de links:', e.message);
    } finally { revisando = false; }
    return pagados;
}

// ---------------------------------------------------------------------
// Recordatorio de cuotas por WhatsApp (una vez al día; sedes con el recordatorio activado)
// enviar(numero, texto) → { success }
// ---------------------------------------------------------------------
async function recordatoriosCuotas(pool, enviar) {
    const r = await pool.request().query(`
        SELECT q.ID_Plan, q.ID_Cuota, q.Numero, q.Monto, q.Fecha_Vencimiento, q.Ultimo_Recordatorio, q.ID_Usuario,
               t.Saldo_Pendiente, ISNULL(t.Nombre_Tratamiento, pr.Nombre_Prestacion) AS Tratamiento,
               P.Nombres, P.Telefono, C.Nombre_Clinica, C.Payphone_Token, C.Payphone_StoreId
        FROM Tratamiento_Cuotas q
        INNER JOIN Tratamientos_Plan t ON t.ID_Plan = q.ID_Plan
        INNER JOIN Pacientes P ON P.ID_Paciente = t.ID_Paciente
        INNER JOIN Clinicas C ON C.ID_Clinica = P.ID_Clinica
        LEFT JOIN Prestaciones pr ON pr.ID_Prestacion = t.ID_Prestacion
        WHERE q.Activo = 1 AND C.Recordatorio_Cuotas = 1 AND t.Saldo_Pendiente > 0.01
        ORDER BY q.ID_Plan, q.Numero`);
    const porPlan = new Map();
    for (const f of r.recordset) { if (!porPlan.has(f.ID_Plan)) porPlan.set(f.ID_Plan, []); porPlan.get(f.ID_Plan).push(f); }
    const hoy = hoyISO();
    const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const haceSiete = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    let enviados = 0;
    for (const [idPlan, filas] of porPlan) {
        const f0 = filas[0];
        if (String(f0.Telefono || '').replace(/\D/g, '').length < 7) continue;
        const est = estadoCuotas(filas, f0.Saldo_Pendiente);
        const c = est.cuotas.find(x => x.estado !== 'PAGADA');
        if (!c) continue;
        const toca = (c.vence === manana && c.ultimo_recordatorio !== hoy) || (c.estado === 'VENCIDA' && (!c.ultimo_recordatorio || c.ultimo_recordatorio <= haceSiete));
        if (!toca) continue;
        let link = null;
        if (f0.Payphone_Token && f0.Payphone_StoreId) {
            try { link = await crearLinkPago(pool, { idPlan, idCuota: c.id_cuota, monto: c.pendiente, idUsuario: filas.find(x => x.ID_Cuota === c.id_cuota)?.ID_Usuario, horas: 72 }); }
            catch (e) { console.error(`❌ [Cuotas]: link para el plan #${idPlan}:`, e.message); }
        }
        const texto = `Hola ${f0.Nombres || ''}, ${f0.Nombre_Clinica || 'tu clínica'} te recuerda que tu cuota ${c.numero} de ${f0.Tratamiento || 'tu tratamiento'} por *$${c.pendiente.toFixed(2)}* ${c.estado === 'VENCIDA' ? 'venció el ' + fechaEs(c.vence) : 'vence mañana (' + fechaEs(c.vence) + ')'}.`
            + (link ? `\n\nPuedes pagarla aquí con tarjeta (Payphone):\n${link.url}` : '') + '\n\n¡Gracias!';
        let envio = null;
        try { envio = await enviar(f0.Telefono, texto); } catch (e) { envio = { success: false }; }
        if (envio && envio.success) {
            enviados++;
            await pool.request().input('q', sql.Int, c.id_cuota).query('UPDATE Tratamiento_Cuotas SET Ultimo_Recordatorio = CAST(GETDATE() AS DATE) WHERE ID_Cuota = @q');
        }
    }
    if (enviados) console.log(`📅 [Cuotas]: ${enviados} recordatorio(s) de cuota enviados por WhatsApp.`);
    return enviados;
}

module.exports = {
    estadoCuotas, calendario, cuotasDelPlan, configClinica, guardarConfig, crearLinkPago, textoLink,
    revisarLink, revisarLinksPendientes, recordatoriosCuotas, errorUsuario, r2, isoDe
};
