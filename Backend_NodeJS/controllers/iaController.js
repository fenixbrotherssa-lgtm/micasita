const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getConnection, sql } = require("../config/db");
require("dotenv").config();

const apiKey = process.env.POLITICA_API_KEY;
const primaryModel = process.env.IA_MODEL_NAME || "gemini-1.5-pro";
const fallbackModels = process.env.IA_FALLBACK_MODELS
  ? process.env.IA_FALLBACK_MODELS.split(",").map(m => m.trim())
  : ["gemini-1.5-flash"];

const maxRetries = parseInt(process.env.IA_MAX_RETRIES || "2");
const timeoutMs = parseInt(process.env.IA_TIMEOUT_MS || "15000");

const genAI = new GoogleGenerativeAI(apiKey);

function obtenerModelosEnOrden() {
  return [primaryModel, ...fallbackModels].filter(Boolean);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarConFallback(prompt, historial) {
  const modelos = obtenerModelosEnOrden();

  for (const modelName of modelos) {
    for (let intento = 1; intento <= maxRetries; intento++) {
      try {
        console.log(`🧠 [Mini Doctor Clínico] Evaluando con: ${modelName} | Intento: ${intento}`);

        const model = genAI.getGenerativeModel({ model: modelName });

        const chatHistory = historial.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.parts }]
        }));

        const chat = model.startChat({
          history: chatHistory,
          generationConfig: {
            temperature: 0.1, // Modo Analítico/Diagnóstico Estricto
            topP: 0.8,
            maxOutputTokens: 1500
          }
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
        );

        const result = await Promise.race([
          chat.sendMessage(prompt),
          timeoutPromise
        ]);

        return result;

      } catch (error) {
        console.error(`⚠️ Falló ${modelName}:`, error.message);
        const esReintentable = error.status === 503 || error.message === "TIMEOUT";
        if (!esReintentable) throw error;
        if (intento < maxRetries) await delay(1500 * intento);
      }
    }
    console.log(`🔄 Fallback al siguiente modelo...`);
  }
  throw new Error("Colapso total de motores de inferencia.");
}

const iaController = {
  consultarMiniDoctor: async (req, res) => {
    try {
      const {
        usuario = {},
        contexto = {},
        consulta_usuario = "",
        historial = []
      } = req.body;

      const id_rol = parseInt(usuario.id_rol || contexto.id_rol) || 0;
      const id_clinica_sesion = parseInt(usuario.id_clinica || contexto.id_clinica) || 1;
      let id_cli_objetivo = id_clinica_sesion;

      const matchSede = consulta_usuario.match(/(?:clinica|sede|agencia|sucursal)\s+(\d+)/i);
      if (matchSede && id_rol === 1) id_cli_objetivo = parseInt(matchSede[1]);

      const pool = await getConnection();

      // =======================================================================
      // 1. MAPEO GLOBAL (Operaciones y Finanzas Restringidas por ROL)
      // =======================================================================
      const resOperativo = await pool.request().input("cli", sql.Int, id_cli_objetivo).query(`
        SELECT 
          (SELECT COUNT(*) FROM Citas WHERE ID_Clinica=@cli AND CAST(Fecha_Cita AS DATE)=CAST(GETDATE() AS DATE)) as CitasHoy,
          (SELECT COUNT(*) FROM Citas WHERE ID_Clinica=@cli AND CAST(Fecha_Cita AS DATE)=CAST(GETDATE() AS DATE) AND Estado='Atendida') as CitasAtendidas,
          (SELECT COUNT(*) FROM Inventario WHERE ID_Clinica=@cli AND Cantidad<=Stock_Minimo AND Activo=1) as AlertasStock,
          (SELECT TOP 1 Nombre_Clinica FROM Clinicas WHERE ID_Clinica=@cli) as NombreClinica
      `);
      
      const gOpe = resOperativo.recordset[0] || {};
      
      let globalContext = `[MÉTRICAS CLÍNICA: ${gOpe.NombreClinica || 'N/A'}]\n- Operaciones Hoy: Citas Programadas: ${gOpe.CitasHoy} | Citas Atendidas: ${gOpe.CitasAtendidas}\n- Inventario: Ítems en Alerta de Stock: ${gOpe.AlertasStock}\n`;

      // 🛡️ BÓVEDA FINANCIERA: SOLO ROL 1
      if (id_rol === 1) {
        const [resFin, resCaja, resTopDeudores] = await Promise.all([
          pool.request().input("cli", sql.Int, id_cli_objetivo).query(`
            SELECT 
              ISNULL((SELECT SUM(Monto) FROM Pagos WHERE ID_Clinica=@cli AND MONTH(Fecha_Pago)=MONTH(GETDATE()) AND YEAR(Fecha_Pago)=YEAR(GETDATE())),0) as IngresosTotales,
              ISNULL((SELECT SUM(Monto) FROM Pagos WHERE ID_Clinica=@cli AND ID_Plan IS NOT NULL AND MONTH(Fecha_Pago)=MONTH(GETDATE()) AND YEAR(Fecha_Pago)=YEAR(GETDATE())),0) as IngresosClinicos,
              ISNULL((SELECT SUM(Monto) FROM Gastos WHERE ID_Clinica=@cli AND MONTH(Fecha)=MONTH(GETDATE()) AND YEAR(Fecha)=YEAR(GETDATE())),0) as GastosTotales,
              ISNULL((SELECT SUM(Total) FROM Presupuestos WHERE ID_Clinica=@cli AND MONTH(Fecha)=MONTH(GETDATE()) AND YEAR(Fecha)=YEAR(GETDATE())),0) as PresupuestosEmitidos
          `),
          pool.request().input("cli", sql.Int, id_cli_objetivo).query(`SELECT TOP 1 ISNULL(Monto_Final_Real,0) as FisicoCaja, ISNULL(Diferencia,0) as Descuadre, ISNULL(Estado,'S/N') as EstadoCaja FROM Caja WHERE ID_Clinica = @cli ORDER BY ID_Caja DESC`),
          pool.request().input("cli", sql.Int, id_cli_objetivo).query(`SELECT TOP 3 P.Nombres + ' ' + P.Apellidos as Paciente, SUM(T.Saldo_Pendiente) as Deuda FROM Tratamientos_Plan T JOIN Pacientes P ON T.ID_Paciente = P.ID_Paciente WHERE P.ID_Clinica = @cli AND T.Saldo_Pendiente > 0 GROUP BY P.Nombres, P.Apellidos ORDER BY Deuda DESC`)
        ]);

        const f = resFin.recordset[0] || {};
        const c = resCaja.recordset[0] || { FisicoCaja: 0, Descuadre: 0, EstadoCaja: 'SIN CIERRE' };

        globalContext += `- Finanzas Mes: Ingresos Clínicos: $${f.IngresosClinicos} | Ingresos Totales: $${f.IngresosTotales} | Gastos: $${f.GastosTotales} | Utilidad: $${f.IngresosTotales - f.GastosTotales}\n`;
        globalContext += `- Presupuestos Emitidos (Mes): $${f.PresupuestosEmitidos}\n`;
        globalContext += `- Caja Actual: ${c.EstadoCaja} | Físico: $${c.FisicoCaja} | Descuadre: $${c.Descuadre}\n`;
        globalContext += `- Top Deudas: ${resTopDeudores.recordset.map(d => `${d.Paciente} ($${d.Deuda})`).join(' | ') || 'Ninguna'}\n`;
      } else {
        globalContext += `- 🔒 SEGURIDAD DE ACCESO: Datos financieros, ingresos, reportes de caja y deudores están bloqueados para el perfil actual (Rol != 1).\n`;
      }

      // =======================================================================
      // 2. MAPEO CLÍNICO PROFUNDO Y AUDITORÍA LEGAL MSP 024
      // =======================================================================
      let patientContext = "";
      const id_paciente = parseInt(contexto.id_referencia) || null;

      if (id_paciente) {
        const patientQueries = [
          pool.request().input("id", sql.Int, id_paciente).query(`SELECT TOP 1 * FROM Vista_Expediente_Universal WHERE ID_Paciente = @id`),
          pool.request().input("id", sql.Int, id_paciente).query(`SELECT Nombre_Tratamiento, Estado_Tratamiento, Saldo_Pendiente FROM Tratamientos_Plan WHERE ID_Paciente = @id AND Estado_Tratamiento != 'FINALIZADO'`),
          pool.request().input("id", sql.Int, id_paciente).query(`SELECT Numero_Diente, Cara_Diente, Estado, Observaciones FROM Odontograma WHERE ID_Paciente = @id`),
          pool.request().input("id", sql.Int, id_paciente).query(`SELECT TOP 2 Fecha, Medicamentos_JSON, CIE10_Cod, CIE10_Texto FROM Recetas WHERE ID_Paciente = @id ORDER BY Fecha DESC`),
          pool.request().input("id", sql.Int, id_paciente).query(`SELECT TOP 3 CIE10_Codigo, CIE10_Descripcion, Aceptado, Fecha_Firma FROM MSP_024_Consentimiento_Informado WHERE ID_Paciente = @id ORDER BY ID_Consentimiento DESC`)
        ];

        // Solo consultamos el historial de pagos si es Admin
        if (id_rol === 1) {
          patientQueries.push(pool.request().input("id", sql.Int, id_paciente).query(`SELECT ISNULL(SUM(Monto),0) as TotalPagado FROM Pagos WHERE ID_Paciente = @id`));
        }

        const patientResults = await Promise.all(patientQueries);
        
        const resUniv = patientResults[0];
        const resTrat = patientResults[1];
        const resOdon = patientResults[2];
        const resRec = patientResults[3];
        const resMSP024 = patientResults[4];
        const resPag = id_rol === 1 ? patientResults[5] : null;

        if (resUniv.recordset.length > 0) {
          const p = resUniv.recordset[0];
          
          // Ocultar la deuda del tratamiento si no es Admin
          const trat = resTrat.recordset.map(t => {
            return id_rol === 1 
              ? `[${t.Estado_Tratamiento}] ${t.Nombre_Tratamiento} - Deuda: $${t.Saldo_Pendiente}` 
              : `[${t.Estado_Tratamiento}] ${t.Nombre_Tratamiento}`;
          }).join('\n');

          const odon = resOdon.recordset.map(o => `Pieza ${o.Numero_Diente} (${o.Cara_Diente}): ${o.Estado} - ${o.Observaciones || ''}`).join('\n');
          const recetas = resRec.recordset.map(r => `Fecha: ${new Date(r.Fecha).toLocaleDateString()} | CIE-10: ${r.CIE10_Cod} | Rx: ${r.Medicamentos_JSON}`).join('\n');
          const msp024 = resMSP024.recordset.map(c => `[Fecha: ${c.Fecha_Firma ? new Date(c.Fecha_Firma).toLocaleDateString() : 'N/A'}] CIE-10: ${c.CIE10_Codigo} | Firmado Legalmente: ${c.Aceptado ? 'SÍ ✅' : 'NO ❌'}`).join('\n');

          patientContext = `
[EXPEDIENTE CLÍNICO DEL PACIENTE]
- Nombre: ${p.Nombres} ${p.Apellidos} | Edad: ${p.Edad_Real || '?'}
- RIESGOS MÉDICOS: Sistémicas: ${p.Enfermedades_Sistemicas || 'Negativo'} | Alergias: ${p.Alergias || 'Negativo'} | Med. Actual: ${p.Medicamentos || 'Negativo'}
- SIGNOS VITALES: PA ${p.Presion_Arterial || '--'}, FC ${p.Frecuencia_Cardiaca || '--'}
${id_rol === 1 && resPag?.recordset.length > 0 ? `- Finanzas Paciente: Total Pagado Histórico: $${resPag.recordset[0].TotalPagado}\n` : ''}
- HALLAZGOS (ODONTOGRAMA):
${odon || 'Sin hallazgos registrados.'}

- PLANES DE TRATAMIENTO:
${trat || 'No cursa tratamientos actualmente.'}

- AUDITORÍA LEGAL (MSP 024 - Consentimiento Informado):
${msp024 || 'ATENCIÓN: No hay historial de consentimientos informados MSP 024 para este paciente.'}

- ÚLTIMAS RECETAS / DIAGNÓSTICOS CIE-10:
${recetas || 'No hay recetas.'}
`;
        }
      }

      // =======================================================================
      // 3. PROMPT DE DECISIÓN CLÍNICA, CUMPLIMIENTO LEGAL Y SEGURIDAD FINANCIERA
      // =======================================================================
      const prompt = `
Eres "Mini Doctor Pro", el Sistema de Soporte a la Decisión Clínica (CDSS) y auditor médico-legal de Ametra OS v4.5.

REGLAS MATRICIALES DE DIAGNÓSTICO Y RESPUESTA:
1. PERFIL: Responde como un Médico Especialista y Auditor de Salud. Tu lenguaje debe ser estrictamente clínico y profesional.
2. ANÁLISIS DE RIESGO: Si el usuario propone un tratamiento, DEBES cruzarlo obligatoriamente con los "RIESGOS MÉDICOS" del paciente.
3. MARCO LEGAL ECUATORIANO (MSP 024): Si tú propones o el médico menciona un procedimiento invasivo, DEBES exigir el "Formulario MSP 024". Si el expediente muestra que el estado es "Firmado Legalmente: NO ❌", levanta una alerta legal en color "danger".
4. SUGERENCIAS REALES CIE-10: Basándote en el Odontograma, propón posibles diagnósticos usando terminología CIE-10 y sugiere el tratamiento a seguir.
5. 🛡️ SEGURIDAD DE LA INFORMACIÓN FINANCIERA: Si el usuario te hace cualquier pregunta relacionada con ingresos, gastos, dinero en caja, presupuestos, balances o pacientes deudores, Y el contexto indica que los datos están "OCULTOS", "BLOQUEADOS" o no te proporcionaron las métricas de dinero, tienes TERMINANTEMENTE PROHIBIDO intentar deducir o dar cifras. Responde amable pero firmemente que por políticas de seguridad del sistema, no tiene permisos de Administrador para visualizar dicha información.

--- CONTEXTO INYECTADO DESDE LA BASE DE DATOS SQL SERVER ---
${globalContext}
${patientContext}
-------------------------------------------

ESTRUCTURA DE RESPUESTA OBLIGATORIA (Devuelve SOLO el JSON válido):
{
  "texto": "Tu análisis clínico, diagnóstico propuesto, respuesta técnica o negación de acceso financiero aquí...",
  "avatar_estado": "feliz | alerta | analizando | médico",
  "color_alerta": "info | warning | danger | success",
  "sugerencia": "Recomendación del siguiente paso clínico, requerimiento del MSP 024 o acción a realizar."
}

Input del Usuario: "${consulta_usuario}"
`;

      const result = await enviarConFallback(prompt, historial);
      const responseText = result.response.text().trim();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      let aiResponse;
      try {
        aiResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { texto: responseText, avatar_estado: "analizando", color_alerta: "warning", sugerencia: "Formato de respuesta anómalo." };
      } catch (e) {
        aiResponse = { texto: responseText.replace(/["'{}]/g, ''), avatar_estado: "alerta", color_alerta: "danger", sugerencia: "Error al parsear el árbol lógico de diagnóstico." };
      }

      const nuevoHistorial = [
        ...historial,
        { role: "user", parts: consulta_usuario },
        { role: "model", parts: aiResponse.texto }
      ];

      res.json({
        status: "Success",
        ...aiResponse,
        historial: nuevoHistorial.slice(-15)
      });

    } catch (error) {
      console.error("❌ [Mini Doctor Clínico] ERROR CRÍTICO:", error);
      res.status(503).json({
        status: "Error",
        texto: "Sistema CDSS temporalmente fuera de línea. Proceda con protocolo clínico manual.",
        avatar_estado: "alerta",
        color_alerta: "danger"
      });
    }
  },

  saludoEntorno: async (req, res) => {
    res.json({
      status: "Success",
      mensaje: "Telemetría clínica, diagnósticos CIE-10 y auditoría MSP 024 sincronizados. ¿Qué analizamos hoy, Doctor?"
    });
  }
};

module.exports = iaController;