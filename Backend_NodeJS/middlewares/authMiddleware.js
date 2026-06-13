const jwt = require('jsonwebtoken');

// La misma llave maestra ofuscada que usamos en authController.js
const JWT_SECRET = process.env.JWT_SECRET || "FirmaSecretaAmetraOS45_Casrodsoft";

const verificarToken = (req, res, next) => {
    // 1. Buscamos el token en la cabecera 'Authorization'
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(403).json({ status: "Error", message: "Acceso denegado: Token requerido." });
    }

    // 2. El formato estándar esperado es "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ status: "Error", message: "Acceso denegado: Token malformado." });
    }

    // 3. Verificamos que el token sea válido, no haya expirado y pertenezca a nuestro sistema
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ status: "Error", message: "Acceso denegado: Token inválido o expirado." });
        }
        
        // Inyectamos los datos decodificados del usuario en la petición (ID, Rol, Clínica)
        // por si los controladores más adelante necesitan auditar quién hizo la acción
        req.usuarioAuth = decoded; 
        
        // Todo en orden, pasamos al controlador
        next(); 
    });
};

module.exports = verificarToken;