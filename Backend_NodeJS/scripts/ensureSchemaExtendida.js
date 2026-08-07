// Migración aditiva y segura para producción: crea SOLO tablas/columnas nuevas (nunca
// ALTER/DROP/DELETE sobre datos existentes) para que especialidades, servicios y horarios
// dejen de estar hardcodeados en el bot de WhatsApp, y para que las notificaciones push de
// citas próximas tengan la tabla/columna que necesitan. Se invoca una vez al arrancar el
// servidor (ver server.js, connectWithRetry) — cada instalación de clínica en producción
// autoaplica el esquema nuevo al recibir un backend actualizado, sin pasos manuales por
// sede. Es idempotente: correrla de nuevo no duplica tablas, columnas ni datos.
//
// Cada paso corre en su propio try/catch: si uno falla (permisos, lo que sea), no bloquea
// a los demás ni tumba el arranque del servidor — antes un solo error cortaba TODA la
// migración con un mensaje genérico, sin decir cuál paso falló.
const { sql } = require('../config/db');

const CATALOGO_INICIAL_ESPECIALIDADES = [
    'Odontología General',
    'Ortodoncia',
    'Endodoncia',
    'Periodoncia',
    'Cirugía Oral',
    'Odontopediatría',
    'Estética Dental',
    'Implantología'
];

async function existeTabla(pool, nombre) {
    const res = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .query('SELECT 1 as existe FROM sys.tables WHERE name = @nombre');
    return res.recordset.length > 0;
}

async function existeColumna(pool, tabla, columna) {
    const res = await pool.request()
        .input('tabla', sql.NVarChar, tabla)
        .input('columna', sql.NVarChar, columna)
        .query(`
            SELECT 1 as existe FROM sys.columns c
            INNER JOIN sys.tables t ON t.object_id = c.object_id
            WHERE t.name = @tabla AND c.name = @columna
        `);
    return res.recordset.length > 0;
}

async function paso(nombre, fn) {
    try {
        await fn();
    } catch (error) {
        console.error(`❌ [Schema]: Error en paso "${nombre}":`, error.message);
    }
}

async function ensureSchemaExtendida(pool) {
    await paso('crear Especialidades', async () => {
        if (await existeTabla(pool, 'Especialidades')) return;
        await pool.request().query(`
            CREATE TABLE Especialidades (
                ID_Especialidad INT IDENTITY(1,1) PRIMARY KEY,
                Nombre_Especialidad NVARCHAR(150) NOT NULL,
                Activo BIT NOT NULL DEFAULT 1
            )
        `);
        console.log('✅ [Schema]: Tabla Especialidades creada.');
    });

    await paso('crear Clinica_Especialidades', async () => {
        if (await existeTabla(pool, 'Clinica_Especialidades')) return;
        await pool.request().query(`
            CREATE TABLE Clinica_Especialidades (
                ID_Clinica INT NOT NULL,
                ID_Especialidad INT NOT NULL,
                CONSTRAINT PK_Clinica_Especialidades PRIMARY KEY (ID_Clinica, ID_Especialidad),
                CONSTRAINT FK_ClinicaEspecialidades_Clinica FOREIGN KEY (ID_Clinica) REFERENCES Clinicas(ID_Clinica),
                CONSTRAINT FK_ClinicaEspecialidades_Especialidad FOREIGN KEY (ID_Especialidad) REFERENCES Especialidades(ID_Especialidad)
            )
        `);
        console.log('✅ [Schema]: Tabla Clinica_Especialidades creada.');
    });

    await paso('crear Clinica_Horarios', async () => {
        if (await existeTabla(pool, 'Clinica_Horarios')) return;
        // Dia_Semana: 1=Lunes ... 7=Domingo (no el 0=Domingo de JS, para que la grilla de
        // Sedes se lea en orden natural Lunes->Domingo sin reordenar nada al mostrarla).
        // Hora_Apertura/Cierre como texto 'HH:MM' (no TIME/DATETIME): evita repetir el bug
        // de zona horaria que ya se resolvió en citasController.js para columnas de fecha/hora.
        await pool.request().query(`
            CREATE TABLE Clinica_Horarios (
                ID_Clinica INT NOT NULL,
                Dia_Semana TINYINT NOT NULL,
                Hora_Apertura VARCHAR(5) NULL,
                Hora_Cierre VARCHAR(5) NULL,
                Cerrado BIT NOT NULL DEFAULT 0,
                CONSTRAINT PK_Clinica_Horarios PRIMARY KEY (ID_Clinica, Dia_Semana),
                CONSTRAINT FK_ClinicaHorarios_Clinica FOREIGN KEY (ID_Clinica) REFERENCES Clinicas(ID_Clinica)
            )
        `);
        console.log('✅ [Schema]: Tabla Clinica_Horarios creada.');
    });

    await paso('sembrar catálogo de Especialidades', async () => {
        const count = await pool.request().query('SELECT COUNT(*) as c FROM Especialidades');
        if (count.recordset[0].c > 0) return;
        for (const nombre of CATALOGO_INICIAL_ESPECIALIDADES) {
            await pool.request().input('n', sql.NVarChar, nombre).query(
                'INSERT INTO Especialidades (Nombre_Especialidad, Activo) VALUES (@n, 1)'
            );
        }
        console.log(`✅ [Schema]: Catálogo inicial de especialidades sembrado (${CATALOGO_INICIAL_ESPECIALIDADES.length}).`);
    });

    // --- Notificaciones push (agendaNotificationService.js / pushController.js) ---
    await paso('crear Dispositivos_Push', async () => {
        if (await existeTabla(pool, 'Dispositivos_Push')) return;
        await pool.request().query(`
            CREATE TABLE Dispositivos_Push (
                ID_Dispositivo INT IDENTITY(1,1) PRIMARY KEY,
                ID_Usuario INT NOT NULL,
                ID_Clinica INT NOT NULL,
                Token_FCM NVARCHAR(255) NOT NULL,
                Plataforma NVARCHAR(20) NOT NULL,
                Activo BIT NOT NULL DEFAULT 1,
                Fecha_Registro DATETIME NOT NULL DEFAULT GETDATE(),
                Ultima_Actividad DATETIME NOT NULL DEFAULT GETDATE()
            )
        `);
        console.log('✅ [Schema]: Tabla Dispositivos_Push creada.');
    });

    await paso('agregar Citas.Notificado', async () => {
        if (await existeColumna(pool, 'Citas', 'Notificado')) return;
        // DEFAULT 0 en el ALTER: SQL Server lo aplica automáticamente a todas las citas ya
        // existentes (no las deja NULL, ni falla el ALTER por ser NOT NULL sobre una tabla
        // con filas). Las citas de hoy que aún no pasaron quedan elegibles para el aviso de
        // "30 minutos antes" apenas se crea la columna — es el comportamiento correcto, no
        // manda nada retroactivo de días anteriores porque el cron ya filtra por fecha de hoy.
        await pool.request().query(`ALTER TABLE Citas ADD Notificado BIT NOT NULL DEFAULT 0`);
        console.log('✅ [Schema]: Columna Citas.Notificado agregada.');
    });
}

module.exports = { ensureSchemaExtendida };
