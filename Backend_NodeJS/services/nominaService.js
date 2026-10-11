// ============================================================
//  nominaService.js — Cálculo de rol de pagos ecuatoriano
//  CasRodsoft Development — portado de MasterHotel/OMNI CORE
//  (mismas fórmulas, adaptado a las tablas de Ametra OS).
//
//  - IESS: Aporte Personal 9.45% / Aporte Patronal 11.15% (configurables por año).
//  - Décimo Tercero (Art. 111 Código de Trabajo): (salario + bonos) / 12 devengo mensual.
//  - Décimo Cuarto (Art. 113): SBU / 12 mensual — pago: Costa/Galápagos tope 15-mar,
//    Sierra/Amazonía tope 15-ago.
//  - Fondos de Reserva (Art. 196): 8.33% desde el SEGUNDO año de servicio continuo.
//  - Vacaciones (Art. 69 y 71): 15 días/año = salario/24 de devengo mensual.
//
//  Los montos "acumulados" son PROVISIONES — no se suman al neto salvo que el empleado
//  haya elegido mensualizar ese beneficio (su derecho según el Código de Trabajo).
// ============================================================
const { getConnection, sql } = require('../config/db');

async function obtenerParametrosLaborales(anio) {
    const pool = await getConnection();
    const result = await pool.request().input('anio', sql.Int, anio)
        .query(`SELECT * FROM Parametros_Laborales WHERE Anio = @anio`);
    if (result.recordset.length) return result.recordset[0];

    // Si el año no existe, se usa el más reciente configurado en vez de inventar un SBU.
    const fallback = await pool.request()
        .query(`SELECT TOP 1 * FROM Parametros_Laborales ORDER BY Anio DESC`);
    if (!fallback.recordset.length) throw new Error('No hay parámetros laborales configurados (SBU/IESS). Configúrelos en "Parámetros SBU/IESS".');
    return fallback.recordset[0];
}

/** Info del Décimo Cuarto según la región de la clínica (Art. 113). Sin región → Sierra, con aviso. */
function obtenerInfoDecimoCuarto(region, periodo) {
    const reg = region === 'COSTA' ? 'COSTA' : 'SIERRA';
    const [anioStr, mesStr] = String(periodo).split('-');
    const anio = parseInt(anioStr), mes = parseInt(mesStr);
    const mesPago = reg === 'COSTA' ? 3 : 8;
    return {
        region: reg,
        regionConfigurada: region === 'COSTA' || region === 'SIERRA',
        mesPagoObligatorio: mesPago,
        fechaTope: reg === 'COSTA' ? `15/03/${anio}` : `15/08/${anio}`,
        esMesDePago: mes === mesPago
    };
}

// Fecha LOCAL desde 'YYYY-MM-DD' o Date de SQL Server (new Date('YYYY-MM-DD') sería
// medianoche UTC = un día antes en Ecuador).
function parsearFechaLocal(fecha) {
    if (fecha instanceof Date) return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const [y, m, d] = String(fecha).substring(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Meses completos de antigüedad entre la fecha de ingreso y una fecha de referencia */
function mesesAntiguedad(fechaIngreso, fechaReferencia) {
    if (!fechaIngreso) return 0;
    const ini = parsearFechaLocal(fechaIngreso);
    const ref = parsearFechaLocal(fechaReferencia);
    let meses = (ref.getFullYear() - ini.getFullYear()) * 12 + (ref.getMonth() - ini.getMonth());
    if (ref.getDate() < ini.getDate()) meses--;
    return Math.max(0, meses);
}

/**
 * Rol de pagos de un empleado para un período (YYYY-MM).
 * @param {object} emp - fila de Personal
 * @param {object} movs - { Adelantos, Bonos, Descuentos } del período
 * @param {object} p - fila de Parametros_Laborales
 */
function calcularRolMensual(emp, movs, p, periodo) {
    const salarioContrato = parseFloat(emp.Salario_Base) || 0;
    const bonos = parseFloat(movs.Bonos) || 0;
    const adelantos = parseFloat(movs.Adelantos) || 0;
    const descuentos = parseFloat(movs.Descuentos) || 0;

    const [anioStr, mesStr] = String(periodo).split('-');
    const inicioDeMes = new Date(parseInt(anioStr), parseInt(mesStr) - 1, 1);
    const finDeMes = new Date(parseInt(anioStr), parseInt(mesStr), 0);

    // Prorrateo del primer mes (mes comercial de 30 días)
    let diasTrabajados = 30;
    if (emp.Fecha_Ingreso) {
        const fi = parsearFechaLocal(emp.Fecha_Ingreso);
        if (fi > finDeMes) diasTrabajados = 0;
        else if (fi > inicioDeMes) diasTrabajados = 30 - Math.min(fi.getDate(), 30) + 1;
    }
    const factorProrrateo = diasTrabajados / 30;
    const salarioBase = parseFloat((salarioContrato * factorProrrateo).toFixed(2));

    const antiguedadMeses = mesesAntiguedad(emp.Fecha_Ingreso, finDeMes);
    const tieneMasDeUnAnio = antiguedadMeses >= 12;

    const aporteIessPersonal = emp.Afiliado_IESS
        ? parseFloat((salarioBase * parseFloat(p.Aporte_Personal_IESS)).toFixed(2)) : 0;
    const aportePatronalIess = emp.Afiliado_IESS
        ? parseFloat((salarioBase * parseFloat(p.Aporte_Patronal_IESS)).toFixed(2)) : 0;

    const decimoTerceroAcumulado = parseFloat(((salarioBase + bonos) / 12).toFixed(2));
    const decimoCuartoAcumulado = parseFloat((parseFloat(p.SBU) / 12 * factorProrrateo).toFixed(2));
    const fondoReservaAcumulado = tieneMasDeUnAnio
        ? parseFloat((salarioBase * parseFloat(p.Porcentaje_Fondo_Reserva)).toFixed(2)) : 0;
    const vacacionesAcumulado = parseFloat((salarioBase / 24).toFixed(2));

    let netoPagar = salarioBase + bonos - adelantos - descuentos - aporteIessPersonal;
    if (emp.Decimo_Tercero_Mensualizado) netoPagar += decimoTerceroAcumulado;
    if (emp.Decimo_Cuarto_Mensualizado) netoPagar += decimoCuartoAcumulado;
    if (emp.Fondo_Reserva_Mensualizado && tieneMasDeUnAnio) netoPagar += fondoReservaAcumulado;
    netoPagar = Math.max(0, parseFloat(netoPagar.toFixed(2)));

    return {
        SalarioContrato: salarioContrato,
        DiasTrabajados: diasTrabajados,
        Prorrateado: factorProrrateo < 1,
        SalarioBase: salarioBase,
        Bonos: bonos,
        Adelantos: adelantos,
        Descuentos: descuentos,
        AfiliadoIESS: !!emp.Afiliado_IESS,
        AporteIessPersonal: aporteIessPersonal,
        AportePatronalIess: aportePatronalIess,
        AntiguedadMeses: antiguedadMeses,
        DecimoTerceroAcumulado: decimoTerceroAcumulado,
        DecimoTerceroMensualizado: !!emp.Decimo_Tercero_Mensualizado,
        DecimoCuartoAcumulado: decimoCuartoAcumulado,
        DecimoCuartoMensualizado: !!emp.Decimo_Cuarto_Mensualizado,
        FondoReservaAcumulado: fondoReservaAcumulado,
        FondoReservaMensualizado: !!emp.Fondo_Reserva_Mensualizado,
        FondoReservaAplica: tieneMasDeUnAnio,
        VacacionesAcumulado: vacacionesAcumulado,
        NetoPagar: netoPagar
    };
}

/** Días con convención comercial ecuatoriana (meses de 30, año de 360) */
function diasComercialesEntre(fechaInicio, fechaFin) {
    const d1 = parsearFechaLocal(fechaInicio), d2 = parsearFechaLocal(fechaFin);
    const dias = (d2.getFullYear() - d1.getFullYear()) * 360
        + (d2.getMonth() - d1.getMonth()) * 30
        + (Math.min(d2.getDate(), 30) - Math.min(d1.getDate(), 30));
    return Math.max(0, dias);
}

/**
 * Liquidación final (finiquito): Art. 111/113 (décimos), 69/71 (vacaciones), 196 (fondo de
 * reserva), 185 (desahucio — renuncia), 188 (indemnización — despido intempestivo).
 * Es una AYUDA de cálculo: vacaciones y fondo de reserva asumen que nunca se tomaron/pagaron,
 * y el administrador ajusta cada valor antes de confirmar.
 */
function calcularLiquidacionFinal({ salarioBase, fechaIngreso, fechaSalida, tipoSalida, sbu, regionDecimoCuarto }) {
    const base = parseFloat(salarioBase) || 0;
    const fSalida = parsearFechaLocal(fechaSalida);
    const fIngreso = fechaIngreso ? parsearFechaLocal(fechaIngreso) : fSalida;

    // Décimo Tercero proporcional (período legal 1-dic a 30-nov)
    let inicioD13 = new Date(fSalida.getFullYear(), 11, 1);
    if (fSalida < inicioD13) inicioD13 = new Date(fSalida.getFullYear() - 1, 11, 1);
    const inicioRealD13 = fIngreso > inicioD13 ? fIngreso : inicioD13;
    const decimoTerceroProporcional = parseFloat((base * diasComercialesEntre(inicioRealD13, fSalida) / 360).toFixed(2));

    // Décimo Cuarto proporcional (según región)
    const mesInicioD14 = regionDecimoCuarto === 'COSTA' ? 2 : 7;
    let inicioD14 = new Date(fSalida.getFullYear(), mesInicioD14, 1);
    if (fSalida < inicioD14) inicioD14 = new Date(fSalida.getFullYear() - 1, mesInicioD14, 1);
    const inicioRealD14 = fIngreso > inicioD14 ? fIngreso : inicioD14;
    const decimoCuartoProporcional = parseFloat((parseFloat(sbu) * diasComercialesEntre(inicioRealD14, fSalida) / 360).toFixed(2));

    const diasVacaciones = diasComercialesEntre(fIngreso, fSalida);
    const vacacionesProporcional = parseFloat((base / 24 * (diasVacaciones / 30)).toFixed(2));

    const antiguedadMeses = mesesAntiguedad(fIngreso, fSalida);
    const mesesConFondoReserva = Math.max(0, antiguedadMeses - 12);
    const fondoReservaPendiente = parseFloat((base * 0.0833 * mesesConFondoReserva).toFixed(2));

    let indemnizacion = 0, desahucio = 0;
    const aniosRedondeoArriba = Math.ceil(antiguedadMeses / 12); // Art. 188: fracción = año completo
    const aniosCompletos = Math.floor(antiguedadMeses / 12);     // Art. 185: años completos
    if (tipoSalida === 'DESPIDO_INTEMPESTIVO') {
        indemnizacion = aniosRedondeoArriba <= 3
            ? parseFloat((base * 3).toFixed(2))
            : parseFloat((base * Math.min(aniosRedondeoArriba, 25)).toFixed(2));
    } else if (tipoSalida === 'RENUNCIA_VOLUNTARIA') {
        desahucio = parseFloat((0.25 * base * aniosCompletos).toFixed(2));
    }

    const total = parseFloat((decimoTerceroProporcional + decimoCuartoProporcional + vacacionesProporcional
        + fondoReservaPendiente + indemnizacion + desahucio).toFixed(2));

    return {
        antiguedadMeses, aniosCompletos,
        decimoTerceroProporcional, decimoCuartoProporcional,
        vacacionesProporcional, fondoReservaPendiente,
        indemnizacion, desahucio, total
    };
}

module.exports = {
    obtenerParametrosLaborales, calcularRolMensual, mesesAntiguedad,
    obtenerInfoDecimoCuarto, calcularLiquidacionFinal, parsearFechaLocal
};
