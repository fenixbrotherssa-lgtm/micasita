const { getConnection, sql } = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // <-- 1. Importamos JSON Web Token

// 2. Definimos la llave maestra para firmar los tokens (Ofuscada por defecto)
const JWT_SECRET = process.env.JWT_SECRET || "FirmaSecretaAmetraOS45_Casrodsoft"; 

const login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const pool = await getConnection();
        
        // 1. Buscamos al usuario incluyendo todos los datos de la Clínica para la sesión
        const result = await pool.request()
            .input('user', sql.VarChar, username)
            .query(`
                SELECT 
                    U.ID_Usuario, 
                    U.Cedula,
                    U.Nombres,
                    U.Apellidos,
                    U.Password_Hash,
                    U.ID_Rol,
                    R.Descripcion as rol, 
                    U.ID_Clinica as id_clinica,
                    -- DATOS DE LA CLÍNICA (Indispensables para documentos clínicos)
                    C.Nombre_Clinica,
                    C.RUC,
                    C.Direccion,
                    C.Telefono,
                    C.Logo_Ruta
                FROM Usuarios U 
                JOIN Roles R ON U.ID_Rol = R.ID_Rol 
                JOIN Clinicas C ON U.ID_Clinica = C.ID_Clinica
                WHERE U.Username = @user 
                  AND U.Activo = 1
            `);

        if (result.recordset.length > 0) {
            const userData = result.recordset[0];
            
            // 2. COMPARACIÓN TÉCNICA: ¿La clave coincide con el Hash?
            const match = await bcrypt.compare(password, userData.Password_Hash);

            if (match) {
                // Preparamos el objeto para el frontend
                userData.nombre = `${userData.Nombres} ${userData.Apellidos}`.trim();
                
                // Si el Logo_Ruta es nulo, asignamos el icono por defecto del proyecto
                if (!userData.Logo_Ruta) {
                    userData.Logo_Ruta = 'assets/icon.png';
                }

                // SEGURIDAD: Eliminamos el hash antes de enviar al cliente
                delete userData.Password_Hash;

                // 3. GENERACIÓN DEL TOKEN JWT
                // Empaquetamos los datos clave de la sesión en el pasaporte criptográfico
                const token = jwt.sign(
                    { 
                        id_usuario: userData.ID_Usuario, 
                        id_rol: userData.ID_Rol, 
                        id_clinica: userData.id_clinica 
                    }, 
                    JWT_SECRET, 
                    { expiresIn: '12h' } // El token caduca automáticamente en 12 horas
                );

                // 4. Retornamos la respuesta de éxito INCLUYENDO el token
                return res.json({ 
                    status: "Success", 
                    user: userData,
                    token: token // <-- Pasaporte enviado al frontend
                });
            } else {
                // Contraseña incorrecta
                return res.status(401).json({ status: "Error", message: "Contraseña incorrecta" });
            }
        } else {
            // Usuario no encontrado o inactivo
            return res.status(401).json({ status: "Error", message: "Usuario no encontrado o inactivo" });
        }
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = { login };