// =====================================================================
//  COBERTURA DE CONVENIO / SEGURO POR TRATAMIENTO
//
//  Regla de saldos (siempre se cumple):
//    Costo_Total = pagos del paciente + pagos del convenio
//                + Saldo_Pendiente (debe el paciente) + Saldo_Convenio (debe el seguro)
//
//  - Saldo_Pendiente sigue siendo SOLO lo del paciente (copago): caja, cartera,
//    recordatorios de deuda y KPIs no cambian su significado.
//  - Lo del seguro es una cuenta por cobrar aparte (Saldo_Convenio) con su
//    historial en Convenio_Movimientos.
//  - Estado_Tratamiento = 'PAGADO' solo cuando ambos saldos están en cero.
// =====================================================================
const { sql } = require('../config/db');

const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const CERRADOS = ['ENVIADO', 'PARCIAL', 'PAGADO'];   // ya no se puede cambiar el convenio ni el monto

// Estado financiero del tratamiento según los dos saldos
const SQL_ESTADO = `Estado_Tratamiento = CASE WHEN Saldo_Pendiente <= 0.05 AND ISNULL(Saldo_Convenio, 0) <= 0.05 THEN 'PAGADO'
                                              WHEN Estado_Tratamiento = 'PAGADO' THEN 'PENDIENTE' ELSE Estado_Tratamiento END`;

async function movimiento(tx, d) {
    await tx.request()
        .input('plan', sql.Int, d.idPlan).input('conv', sql.Int, d.idConvenio).input('tipo', sql.VarChar(20), d.tipo)
        .input('monto', sql.Decimal(18, 2), r2(d.monto)).input('pago', sql.Int, d.idPago || null)
        .input('ref', sql.NVarChar(100), d.referencia ? String(d.referencia).slice(0, 100) : null)
        .input('obs', sql.NVarChar(500), d.observacion ? String(d.observacion).slice(0, 500) : null)
        .input('usr', sql.Int, d.idUsuario || null)
        .query(`INSERT INTO Convenio_Movimientos (ID_Plan, ID_Convenio, Tipo, Monto, ID_Pago, Referencia, Observacion, ID_Usuario)
                VALUES (@plan, @conv, @tipo, @monto, @pago, @ref, @obs, @usr)`);
}

/**
 * Asigna, cambia o quita el convenio de un tratamiento.
 * @param tx          pool o transacción (cualquier cosa con .request())
 * @param idPlan
 * @param opciones    { idConvenio (null = particular), autorizacion, monto (opcional), idUsuario }
 * @returns {Promise<{monto:number, convenio:string|null}>}
 * Lanza Error con mensaje legible si no se puede.
 */
async function aplicarCobertura(tx, idPlan, { idConvenio, autorizacion, monto, idUsuario } = {}) {
    const t = (await tx.request().input('id', sql.Int, idPlan).query(`
        SELECT ID_Plan, ID_Paciente, Costo_Total, Saldo_Pendiente, ID_Convenio, Monto_Convenio, Saldo_Convenio,
               Estado_Cobro_Convenio, Numero_Autorizacion, Fecha_Inicio
        FROM Tratamientos_Plan WHERE ID_Plan = @id`)).recordset[0];
    if (!t) throw new Error('El tratamiento no existe.');
    const autorizacionTxt = autorizacion ? String(autorizacion).trim().slice(0, 60) : null;
    idConvenio = idConvenio ? parseInt(idConvenio, 10) : null;

    // Mismo convenio: solo se actualiza el N.° de autorización (si aún no está pagado)
    const mismo = idConvenio && t.ID_Convenio === idConvenio && t.Estado_Cobro_Convenio !== 'RECHAZADO' && (monto === undefined || monto === null || monto === '' || r2(monto) === r2(t.Monto_Convenio));
    if (mismo) {
        if (t.Estado_Cobro_Convenio === 'PAGADO') throw new Error('El convenio ya pagó este tratamiento; no se puede modificar.');
        await tx.request().input('id', sql.Int, idPlan).input('aut', sql.NVarChar(60), autorizacionTxt)
            .query('UPDATE Tratamientos_Plan SET Numero_Autorizacion = @aut WHERE ID_Plan = @id');
        return { monto: r2(t.Monto_Convenio), convenio: null };
    }

    // Cambiar o quitar: solo si el cobro al seguro no ha avanzado
    if (t.ID_Convenio && CERRADOS.includes(t.Estado_Cobro_Convenio)) {
        throw new Error(t.Estado_Cobro_Convenio === 'ENVIADO'
            ? 'Este tratamiento ya se envió en la planilla al convenio; no se puede cambiar la cobertura.'
            : 'El convenio ya registró pagos de este tratamiento; no se puede cambiar la cobertura.');
    }

    // 1) Quitar la cobertura anterior: lo que faltaba cobrar al seguro vuelve al paciente
    if (t.ID_Convenio && r2(t.Saldo_Convenio) > 0) {
        await tx.request().input('id', sql.Int, idPlan).query(`
            UPDATE Tratamientos_Plan SET Saldo_Pendiente = Saldo_Pendiente + Saldo_Convenio, Saldo_Convenio = 0, Monto_Convenio = 0,
                   ID_Convenio = NULL, Numero_Autorizacion = NULL, Estado_Cobro_Convenio = NULL, Fecha_Envio_Convenio = NULL
            WHERE ID_Plan = @id;
            UPDATE Tratamientos_Plan SET ${SQL_ESTADO} WHERE ID_Plan = @id;`);
        await movimiento(tx, { idPlan, idConvenio: t.ID_Convenio, tipo: 'QUITADO', monto: t.Saldo_Convenio, idUsuario,
            observacion: 'El valor del seguro pasa al saldo del paciente.' });
        t.Saldo_Pendiente = r2(t.Saldo_Pendiente) + r2(t.Saldo_Convenio);
    } else if (t.ID_Convenio) {
        // Convenio rechazado anteriormente (saldo del seguro ya en 0): solo se limpia la marca
        await tx.request().input('id', sql.Int, idPlan).query(`
            UPDATE Tratamientos_Plan SET ID_Convenio = NULL, Numero_Autorizacion = NULL, Monto_Convenio = 0, Saldo_Convenio = 0,
                   Estado_Cobro_Convenio = NULL, Fecha_Envio_Convenio = NULL WHERE ID_Plan = @id`);
    }
    if (!idConvenio) return { monto: 0, convenio: null };

    // 2) Asignar el nuevo convenio
    const c = (await tx.request().input('c', sql.Int, idConvenio).input('pac', sql.Int, t.ID_Paciente).query(`
        SELECT C.Nombre, C.Activo, C.Requiere_Autorizacion, ISNULL(C.Cobertura_Porcentaje, 100) AS Cobertura,
               (SELECT COUNT(*) FROM Paciente_Convenios PC WHERE PC.ID_Paciente = @pac AND PC.ID_Convenio = @c AND PC.Activo = 1
                   AND (PC.Vigente_Hasta IS NULL OR PC.Vigente_Hasta >= CAST(GETDATE() AS DATE))) AS Vigente
        FROM Convenios C WHERE C.ID_Convenio = @c`)).recordset[0];
    if (!c || !c.Activo) throw new Error('El convenio no existe o está inactivo.');
    if (!c.Vigente) throw new Error(`El paciente no tiene el convenio ${c.Nombre} vigente. Asígneselo primero en su historia clínica.`);
    if (c.Requiere_Autorizacion && !autorizacionTxt) throw new Error(`${c.Nombre} requiere el número de autorización.`);

    const disponible = r2(t.Saldo_Pendiente);           // no se puede cargar al seguro lo que el paciente ya pagó
    let valor = (monto === undefined || monto === null || monto === '')
        ? r2(Number(t.Costo_Total) * Number(c.Cobertura) / 100)
        : r2(monto);
    if (!(valor >= 0)) throw new Error('Monto del convenio no válido.');
    valor = Math.min(valor, disponible);
    if (valor <= 0) throw new Error('El tratamiento no tiene saldo para cargar al convenio (el paciente ya lo pagó).');

    await tx.request().input('id', sql.Int, idPlan).input('c', sql.Int, idConvenio).input('aut', sql.NVarChar(60), autorizacionTxt)
        .input('v', sql.Decimal(18, 2), valor).query(`
        UPDATE Tratamientos_Plan SET ID_Convenio = @c, Numero_Autorizacion = @aut, Monto_Convenio = @v, Saldo_Convenio = @v,
               Saldo_Pendiente = Saldo_Pendiente - @v, Estado_Cobro_Convenio = 'PENDIENTE', Fecha_Envio_Convenio = NULL
        WHERE ID_Plan = @id;
        UPDATE Tratamientos_Plan SET ${SQL_ESTADO} WHERE ID_Plan = @id;`);
    await movimiento(tx, { idPlan, idConvenio, tipo: 'ASIGNADO', monto: valor, referencia: autorizacionTxt, idUsuario });
    return { monto: valor, convenio: c.Nombre };
}

module.exports = { aplicarCobertura, movimiento, SQL_ESTADO, r2 };
