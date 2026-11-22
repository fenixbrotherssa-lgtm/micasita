// =====================================================================
//  CONVENIOS / SEGUROS: catálogo (aseguradoras, empresas, IESS, RPIS...),
//  convenio de cada paciente y planilla de atenciones para cobrar al convenio.
// =====================================================================
const { getConnection, sql } = require('../config/db');

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
    return {
        nombre: txt(b.nombre, 150), tipo: TIPOS.includes(tipo) ? tipo : 'OTRO', ruc: txt(b.ruc, 13), contacto: txt(b.contacto, 150),
        telefono: txt(b.telefono, 30), email: txt(b.email, 150), desc, autorizacion: b.requiere_autorizacion ? 1 : 0, obs: txt(b.observaciones, 500)
    };
}
const inputs = (r, d) => r.input('nombre', sql.NVarChar(150), d.nombre).input('tipo', sql.VarChar(20), d.tipo).input('ruc', sql.VarChar(13), d.ruc)
    .input('contacto', sql.NVarChar(150), d.contacto).input('tel', sql.NVarChar(30), d.telefono).input('email', sql.NVarChar(150), d.email)
    .input('desc', sql.Decimal(5, 2), d.desc).input('aut', sql.Bit, d.autorizacion).input('obs', sql.NVarChar(500), d.obs);

// POST /api/convenios
const crear = async (req, res) => {
    if (soloAdmin(req, res)) return;
    const d = datosConvenio(req.body || {});
    if (!d.nombre) return res.status(400).json({ status: 'Error', message: 'Indique el nombre del convenio.' });
    try {
        const pool = await getConnection();
        const r = await inputs(pool.request(), d).query(`
            INSERT INTO Convenios (Nombre, Tipo, RUC, Contacto, Telefono, Email, Descuento_Porcentaje, Requiere_Autorizacion, Observaciones)
            OUTPUT INSERTED.ID_Convenio VALUES (@nombre, @tipo, @ruc, @contacto, @tel, @email, @desc, @aut, @obs)`);
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
                        Descuento_Porcentaje = @desc, Requiere_Autorizacion = @aut, Observaciones = @obs, Activo = @activo WHERE ID_Convenio = @id`);
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
            SELECT PC.*, C.Nombre, C.Tipo, C.Descuento_Porcentaje, C.Requiere_Autorizacion,
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

// GET /api/convenios/planilla?id_convenio=&desde=&hasta=
// Atenciones (tratamientos del plan) de los pacientes del convenio en el período,
// con el convenio que estaba vigente en la fecha de la atención.
const planilla = async (req, res) => {
    const idConvenio = parseInt(req.query.id_convenio, 10);
    const { desde, hasta } = req.query;
    if (!idConvenio || !esFecha(desde) || !esFecha(hasta)) return res.status(400).json({ status: 'Error', message: 'Indique convenio y período.' });
    try {
        const pool = await getConnection();
        const r = await pool.request().input('conv', sql.Int, idConvenio).input('desde', sql.VarChar(10), desde).input('hasta', sql.VarChar(10), hasta)
            .query(`
            SELECT t.ID_Plan, t.Fecha_Inicio, P.ID_Paciente, P.Apellidos + ' ' + P.Nombres AS Paciente, P.DNI,
                   PC.Numero_Afiliado, PC.Titular, PC.Parentesco,
                   ISNULL(t.Nombre_Tratamiento, pr.Nombre_Prestacion) AS Prestacion, t.Numero_Diente, t.CIE_Cod, t.CIE_Texto,
                   ISNULL(t.Precio_Lista, t.Costo_Total) AS Precio_Lista, ISNULL(t.Descuento, 0) AS Descuento, t.Costo_Total, t.Saldo_Pendiente,
                   t.Estado_Tratamiento, LTRIM(RTRIM(ISNULL(U.Nombres,'') + ' ' + ISNULL(U.Apellidos,''))) AS Medico, U.Registro_Sanitario,
                   C.Descuento_Porcentaje
            FROM Tratamientos_Plan t
            INNER JOIN Pacientes P ON P.ID_Paciente = t.ID_Paciente
            INNER JOIN Paciente_Convenios PC ON PC.ID_Paciente = t.ID_Paciente AND PC.ID_Convenio = @conv
                   AND CAST(PC.Fecha_Registro AS DATE) <= CAST(t.Fecha_Inicio AS DATE)
                   AND (PC.Vigente_Hasta IS NULL OR PC.Vigente_Hasta >= CAST(t.Fecha_Inicio AS DATE))
            INNER JOIN Convenios C ON C.ID_Convenio = PC.ID_Convenio
            LEFT JOIN Prestaciones pr ON pr.ID_Prestacion = t.ID_Prestacion
            LEFT JOIN Usuarios U ON U.ID_Usuario = t.ID_Medico
            WHERE CAST(t.Fecha_Inicio AS DATE) BETWEEN @desde AND @hasta
            ORDER BY t.Fecha_Inicio, P.Apellidos`);
        // Una fila por atención aunque el paciente tenga la misma asignación repetida
        const vistos = new Set();
        const filas = r.recordset.filter(x => (vistos.has(x.ID_Plan) ? false : vistos.add(x.ID_Plan))).map(x => ({
            ...x, Descuento_Convenio: Math.round(Number(x.Costo_Total || 0) * Number(x.Descuento_Porcentaje || 0)) / 100
        }));
        const total = filas.reduce((s, x) => s + Number(x.Costo_Total || 0), 0);
        res.json({ filas, resumen: { atenciones: filas.length, pacientes: new Set(filas.map(f => f.ID_Paciente)).size, total: Math.round(total * 100) / 100 } });
    } catch (e) {
        console.error('❌ planilla convenio:', e.message);
        res.status(500).json({ status: 'Error', message: 'No se pudo generar la planilla.' });
    }
};

module.exports = { listar, crear, actualizar, delPaciente, asignarPaciente, quitarPaciente, planilla };
