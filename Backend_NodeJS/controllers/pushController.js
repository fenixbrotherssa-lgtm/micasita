const { getConnection, sql } = require('../config/db');

// Registra (o refresca) el token FCM de este dispositivo para el usuario logueado.
// Un mismo token es UNIQUE — si el dispositivo ya estaba registrado (a este u otro
// usuario, ej. cambio de sesión en el mismo celular), se reasigna en vez de duplicar.
const registrarDispositivo = async (req, res) => {
    const { token_fcm, plataforma } = req.body;
    const { id_usuario, id_clinica } = req.usuarioAuth;

    if (!token_fcm) return res.status(400).json({ status: "Error", message: "Falta el token FCM" });

    try {
        const pool = await getConnection();
        const existente = await pool.request()
            .input('token', sql.NVarChar, token_fcm)
            .query(`SELECT ID_Dispositivo FROM Dispositivos_Push WHERE Token_FCM = @token`);

        if (existente.recordset.length) {
            await pool.request()
                .input('token', sql.NVarChar, token_fcm)
                .input('id_usuario', sql.Int, id_usuario)
                .input('id_clinica', sql.Int, id_clinica)
                .query(`
                    UPDATE Dispositivos_Push
                    SET ID_Usuario = @id_usuario, ID_Clinica = @id_clinica, Activo = 1, Ultima_Actividad = GETDATE()
                    WHERE Token_FCM = @token
                `);
        } else {
            await pool.request()
                .input('id_usuario', sql.Int, id_usuario)
                .input('id_clinica', sql.Int, id_clinica)
                .input('token', sql.NVarChar, token_fcm)
                .input('plataforma', sql.NVarChar, plataforma || 'android')
                .query(`
                    INSERT INTO Dispositivos_Push (ID_Usuario, ID_Clinica, Token_FCM, Plataforma)
                    VALUES (@id_usuario, @id_clinica, @token, @plataforma)
                `);
        }

        res.json({ status: "Success", message: "Dispositivo registrado para notificaciones." });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// Se llama al cerrar sesión — un dispositivo que ya no tiene sesión activa no debe
// seguir recibiendo push de la agenda de ese doctor.
const eliminarDispositivo = async (req, res) => {
    const { token_fcm } = req.body;
    if (!token_fcm) return res.status(400).json({ status: "Error", message: "Falta el token FCM" });

    try {
        const pool = await getConnection();
        await pool.request()
            .input('token', sql.NVarChar, token_fcm)
            .query(`UPDATE Dispositivos_Push SET Activo = 0 WHERE Token_FCM = @token`);
        res.json({ status: "Success" });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = { registrarDispositivo, eliminarDispositivo };
