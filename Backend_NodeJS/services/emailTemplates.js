// Plantilla HTML compartida para los correos que manda el CRM (mensaje individual,
// campañas masivas y saludos de cumpleaños), para que se vean profesionales en vez de
// texto plano. No se incluye el logo de la clínica: el backend no tiene forma confiable
// de saber su propio dominio público (localhost no es alcanzable desde el correo del
// destinatario), así que un <img> roto se veía peor que no ponerlo.
function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

function construirEmailHTML(nombreClinica, mensajePlano) {
    return `
        <div style="background:#f1f5f9; padding:32px 16px; font-family:Arial, Helvetica, sans-serif;">
            <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 14px rgba(0,0,0,0.08);">
                <div style="background:linear-gradient(135deg,#4f46e5,#db2777); padding:26px 24px; text-align:center;">
                    <div style="color:#ffffff; font-size:19px; font-weight:bold; letter-spacing:0.3px;">${escaparHTML(nombreClinica)}</div>
                </div>
                <div style="padding:28px 26px; color:#1e293b; font-size:15px; line-height:1.7;">
                    ${escaparHTML(mensajePlano)}
                </div>
                <div style="background:#f8fafc; padding:14px 26px; text-align:center; font-size:11px; color:#94a3b8; border-top:1px solid #e2e8f0;">
                    Enviado por ${escaparHTML(nombreClinica)} · Ametra OS
                </div>
            </div>
        </div>
    `;
}

module.exports = { construirEmailHTML };
