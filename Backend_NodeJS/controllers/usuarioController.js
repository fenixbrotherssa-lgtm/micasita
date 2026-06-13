const { getConnection, sql } = require('../config/db');
const bcrypt = require('bcrypt');
const saltRounds = 10;

// 1. LISTAR PERSONAL (Para la tabla de administración de usuarios)
const listarPersonal = async (req, res) => {
    const { id_clinica, id_rol } = req.query;

    try {
        const pool = await getConnection();
        let query = `
            SELECT U.ID_Usuario, U.Cedula, U.Nombres, U.Apellidos, U.Username, R.Descripcion as Rol, 
                   C.Nombre_Clinica, U.Activo, U.ID_Clinica, U.ID_Rol, U.Registro_Sanitario
            FROM Usuarios U
            JOIN Roles R ON U.ID_Rol = R.ID_Rol
            JOIN Clinicas C ON U.ID_Clinica = C.ID_Clinica
        `;

        const request = pool.request();

        // Si no es admin global, filtrar por clínica
        if (parseInt(id_rol) !== 1) {
            query += ` WHERE U.ID_Clinica = @id_cli`;
            request.input('id_cli', sql.Int, id_clinica);
        }

        const result = await request.query(query + " ORDER BY C.Nombre_Clinica, U.Apellidos, U.Nombres");
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 2. GUARDAR O EDITAR USUARIO
const guardarUsuario = async (req, res) => {
    const { 
        id_usuario, cedula, nombres, apellidos, username, 
        password, id_rol, id_clinica, activo, 
        registro_sanitario // <-- Nuevo campo recibido del body
    } = req.body;
    
    try {
        const pool = await getConnection();
        
        // --- VALIDACIÓN DE DUPLICADOS ---
        const checkQuery = id_usuario 
            ? "SELECT Username, Cedula FROM Usuarios WHERE (Cedula = @ced OR Username = @user) AND ID_Usuario <> @id"
            : "SELECT Username, Cedula FROM Usuarios WHERE (Cedula = @ced OR Username = @user)";
        
        const checkReq = pool.request()
            .input('ced', sql.VarChar, cedula)
            .input('user', sql.NVarChar, username);
        if(id_usuario) checkReq.input('id', sql.Int, id_usuario);

        const checkResult = await checkReq.query(checkQuery);

        if (checkResult.recordset.length > 0) {
            const duplicado = checkResult.recordset[0];
            const mensaje = duplicado.Cedula === cedula ? "La cédula ya está registrada" : "El nombre de usuario ya existe";
            return res.status(400).json({ status: "Error", message: mensaje });
        }

        // --- OPERACIÓN DE GUARDADO ---
        const request = pool.request();
        request.input('ced', sql.VarChar, cedula);
        request.input('nom', sql.NVarChar, nombres);
        request.input('ape', sql.NVarChar, apellidos);
        request.input('user', sql.NVarChar, username);
        request.input('rol', sql.Int, id_rol);
        request.input('cli', sql.Int, id_clinica);
        request.input('reg_san', sql.VarChar, registro_sanitario || null); // <-- Nuevo input SQL

        if (id_usuario) {
            // EDICIÓN
            request.input('id', sql.Int, id_usuario);
            request.input('act', sql.Bit, activo);

            let updateQuery = `
                UPDATE Usuarios 
                SET Cedula=@ced, Nombres=@nom, Apellidos=@ape, Username=@user, 
                    ID_Rol=@rol, ID_Clinica=@cli, Activo=@act, Registro_Sanitario=@reg_san
            `;

            if (password && password.trim() !== "") {
                const hash = await bcrypt.hash(password, saltRounds);
                request.input('pass', sql.NVarChar, hash);
                updateQuery += `, Password_Hash=@pass`;
            }

            updateQuery += ` WHERE ID_Usuario=@id`;
            await request.query(updateQuery);
        } else {
            // NUEVO
            if (!password || password.trim() === "") {
                return res.status(400).json({ status: "Error", message: "La contraseña es obligatoria" });
            }

            const hash = await bcrypt.hash(password, saltRounds);
            request.input('pass', sql.NVarChar, hash);
            await request.query(`
                INSERT INTO Usuarios (Cedula, Nombres, Apellidos, Username, Password_Hash, ID_Rol, ID_Clinica, Activo, Registro_Sanitario) 
                VALUES (@ced, @nom, @ape, @user, @pass, @rol, @cli, 1, @reg_san)
            `);
        }

        res.json({ status: "Success", message: "Usuario guardado correctamente" });
    } catch (error) {
        console.error("🔴 Error en guardarUsuario:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

// 3. LISTAR MÉDICOS (Corregido para Roles 1 y 3)
const listarMedicosParaSelect = async (req, res) => {
    try {
        const pool = await getConnection();
        // AJUSTE: ID_Rol 1 (Doctores) e ID_Rol 3 (Médico Dueño)
        const result = await pool.request().query(`
            SELECT ID_Usuario, Nombres, Apellidos, ID_Rol, Registro_Sanitario
            FROM Usuarios 
            WHERE Activo = 1 AND ID_Rol IN (1, 3)
            ORDER BY Apellidos, Nombres
        `);
        
        res.json(result.recordset);
    } catch (error) {
        console.error("🔴 Error en listarMedicosParaSelect:", error.message);
        res.status(500).json({ status: "Error", message: error.message });
    }
};

module.exports = { 
    listarPersonal, 
    guardarUsuario, 
    listarMedicosParaSelect 
};