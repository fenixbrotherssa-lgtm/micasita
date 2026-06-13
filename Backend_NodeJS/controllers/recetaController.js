const { getConnection, sql } = require('../config/db');

const guardarReceta = async (req, res) => {
    const { 
        id_paciente, 
        id_usuario, 
        id_clinica, 
        medicamentos, 
        indicaciones, 
        proxima_cita,
        cie_cod, 
        cie_texto 
    } = req.body;
    
    if (!id_paciente || !id_usuario || !id_clinica) {
        return res.status(400).json({ 
            status: "Error", 
            message: "Faltan datos obligatorios: Paciente, Médico o Clínica." 
        });
    }

    try {
        const pool = await getConnection();
        
        const result = await pool.request()
            .input('paciente', sql.Int, id_paciente)
            .input('usuario', sql.Int, id_usuario) 
            .input('clinica', sql.Int, id_clinica)
            .input('meds', sql.NVarChar, JSON.stringify(medicamentos || []))
            .input('ind', sql.NVarChar, indicaciones || '')
            .input('cita', sql.Date, proxima_cita || null)
            .input('cie_cod', sql.NVarChar, cie_cod || null)
            .input('cie_txt', sql.NVarChar, cie_texto || null)
            .query(`
                INSERT INTO Recetas (
                    ID_Paciente, 
                    ID_Usuario, 
                    ID_Clinica, 
                    Fecha, 
                    Medicamentos_JSON, 
                    Indicaciones_Generales, 
                    Proxima_Cita,
                    Registro_Doc_Snapshot,
                    CIE10_Cod,
                    CIE10_Texto
                )
                SELECT 
                    @paciente, 
                    @usuario, 
                    @clinica, 
                    GETDATE(), 
                    @meds, 
                    @ind, 
                    @cita,
                    Registro_Sanitario,
                    @cie_cod,
                    @cie_txt
                FROM Usuarios 
                WHERE ID_Usuario = @usuario;

                SELECT SCOPE_IDENTITY() AS ID_Receta;
            `);

        const idReceta = result.recordset[0].ID_Receta;

        res.json({ 
            status: "Success", 
            message: "Receta guardada con éxito",
            id_receta: idReceta 
        });
        
    } catch (error) {
        console.error("❌ Error en guardarReceta:", error);
        res.status(500).json({ 
            status: "Error", 
            message: "Error interno al guardar",
            details: error.message 
        });
    }
};

const getRecetasPorPaciente = async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    R.*, 
                    U.Nombres + ' ' + U.Apellidos as Nombre_Medico,
                    C.Nombre_Clinica,
                    C.RUC,
                    C.Logo_Ruta,
                    C.Direccion,
                    C.Telefono
                FROM Recetas R
                INNER JOIN Usuarios U ON R.ID_Usuario = U.ID_Usuario
                INNER JOIN Clinicas C ON R.ID_Clinica = C.ID_Clinica
                WHERE R.ID_Paciente = @id 
                ORDER BY R.Fecha DESC
            `);
        res.json(result.recordset);
    } catch (error) {
        console.error("❌ Error en getRecetasPorPaciente:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// ==========================================
// VERIFICACIÓN DE RECETA VÍA QR
// GET /recetas/verificar/:id
// ==========================================
const verificarReceta = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT 
                    R.ID_Receta,
                    R.Fecha,
                    R.Medicamentos_JSON,
                    R.Indicaciones_Generales,
                    R.Proxima_Cita,
                    R.CIE10_Cod,
                    R.CIE10_Texto,
                    P.Nombres + ' ' + P.Apellidos AS Nombre_Paciente,
                    P.DNI,
                    U.Nombres + ' ' + U.Apellidos AS Nombre_Medico,
                    U.Registro_Sanitario,
                    C.Nombre_Clinica,
                    C.Direccion,
                    C.Telefono,
                    C.RUC
                FROM Recetas R
                INNER JOIN Pacientes P ON R.ID_Paciente = P.ID_Paciente
                INNER JOIN Usuarios U  ON R.ID_Usuario  = U.ID_Usuario
                INNER JOIN Clinicas C  ON R.ID_Clinica  = C.ID_Clinica
                WHERE R.ID_Receta = @id
            `);

        if (!result.recordset || result.recordset.length === 0) {
            return res.status(404).send(`
                <html><body style="font-family:sans-serif; text-align:center; padding:60px; color:#ef4444;">
                    <h2>⚠️ Receta no encontrada</h2>
                    <p>El código QR no corresponde a ninguna receta registrada en el sistema.</p>
                </body></html>
            `);
        }

        const r = result.recordset[0];

        let medicamentos = [];
        try {
            medicamentos = JSON.parse(r.Medicamentos_JSON || '[]');
        } catch(e) { medicamentos = []; }

        const fechaEmision = new Date(r.Fecha).toLocaleDateString('es-EC', { year:'numeric', month:'long', day:'numeric' });
        const fechaVerificacion = new Date().toLocaleString('es-EC', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
});
        const proximaCita  = r.Proxima_Cita ? new Date(r.Proxima_Cita).toLocaleDateString('es-EC', { year:'numeric', month:'long', day:'numeric' }) : null;
        const medsRows     = medicamentos.map(m => `
            <tr>
                <td style="padding:10px; font-weight:600;">${m.nombre}</td>
                <td style="padding:10px;">${m.dosis}</td>
                <td style="padding:10px;">${m.frecuencia}</td>
                <td style="padding:10px;">${m.duracion}</td>
            </tr>
        `).join('');

        return res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Verificación Receta N° ${r.ID_Receta}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f1f5f9; color: #1e293b; padding: 20px; }
                    .card { max-width: 680px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
                    .header { background: #1e3a8a; color: white; padding: 24px 28px; }
                    .header h1 { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
                    .header p { font-size: 12px; opacity: 0.75; }
                    .badge-valido { display: inline-block; background: #10b981; color: white; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; margin-top: 10px; letter-spacing: 0.5px; }
                    .body { padding: 24px 28px; }
                    .section { margin-bottom: 20px; }
                    .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
                    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                    .info-item { background: #f8fafc; padding: 10px 14px; border-radius: 8px; }
                    .info-label { font-size: 9px; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 3px; }
                    .info-value { font-size: 13px; font-weight: 600; color: #1e293b; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    thead tr { background: #1e3a8a; color: white; }
                    thead th { padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: 700; }
                    tbody tr { border-bottom: 1px solid #f1f5f9; }
                    tbody tr:last-child { border-bottom: none; }
                    .cie-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; }
                    .cie-code { display: inline-block; background: #166534; color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-right: 8px; }
                    .proxima-cita { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-size: 13px; font-weight: 600; color: #1e3a8a; }
                    .footer { background: #f8fafc; padding: 14px 28px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <h1>${r.Nombre_Clinica}</h1>
                        <p>${r.Direccion} &nbsp;|&nbsp; Telf: ${r.Telefono} &nbsp;|&nbsp; RUC: ${r.RUC}</p>
                        <div class="badge-valido">✔ DOCUMENTO VALIDADO EN SISTEMA — N° ${r.ID_Receta}</div>
                    </div>

                    <div class="body">

                        <div class="section">
                            <div class="section-title">Datos del Paciente</div>
                            <div class="grid-2">
                                <div class="info-item">
                                    <div class="info-label">Nombre Completo</div>
                                    <div class="info-value">${r.Nombre_Paciente}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Cédula / DNI</div>
                                    <div class="info-value">${r.DNI || 'S/N'}</div>
                                </div>
                            </div>
                        </div>

                        <div class="section">
                            <div class="section-title">Profesional Prescriptor</div>
                            <div class="grid-2">
                                <div class="info-item">
                                    <div class="info-label">Médico</div>
                                    <div class="info-value">${r.Nombre_Medico}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Registro Sanitario</div>
                                    <div class="info-value">${r.Registro_Sanitario || '—'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Fecha de Emisión</div>
                                    <div class="info-value">${fechaEmision}</div>
                                </div>
                            </div>
                        </div>

                        ${r.CIE10_Cod ? `
                        <div class="section">
                            <div class="section-title">Diagnóstico (CIE-10)</div>
                            <div class="cie-box">
                                <span class="cie-code">${r.CIE10_Cod}</span>
                                <span style="font-size:13px; font-weight:600; color:#166534;">${r.CIE10_Texto || ''}</span>
                            </div>
                        </div>
                        ` : ''}

                        <div class="section">
                            <div class="section-title">Medicamentos Prescritos</div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Medicamento</th>
                                        <th>Dosis</th>
                                        <th>Frecuencia</th>
                                        <th>Duración</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${medsRows || '<tr><td colspan="4" style="padding:15px; text-align:center; color:#94a3b8;">Sin datos</td></tr>'}
                                </tbody>
                            </table>
                        </div>

                        ${r.Indicaciones_Generales ? `
                        <div class="section">
                            <div class="section-title">Indicaciones / Observaciones</div>
                            <div class="info-item" style="white-space: pre-line; font-size:13px;">
                                ${r.Indicaciones_Generales}
                            </div>
                        </div>
                        ` : ''}

                        ${proximaCita ? `
                        <div class="section">
                            <div class="proxima-cita">📅 Próxima Cita: ${proximaCita}</div>
                        </div>
                        ` : ''}

                    </div>

                    <div class="footer">
    Documento generado por MEDIC SYSTEM PRO &nbsp;|&nbsp;
    Verificación automática vía QR &nbsp;|&nbsp;
    Receta N° ${r.ID_Receta} <br>
    🕒 Verificado el: ${fechaVerificacion}
</div>
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error("❌ Error al verificar receta:", err);
        return res.status(500).send(`
            <html><body style="font-family:sans-serif; text-align:center; padding:60px; color:#ef4444;">
                <h2>❌ Error del servidor</h2>
                <p>No se pudo procesar la verificación. Intente más tarde.</p>
            </body></html>
        `);
    }
};

// ==========================================
// EXPORTAR TODO JUNTO
// ==========================================
module.exports = { guardarReceta, getRecetasPorPaciente, verificarReceta };