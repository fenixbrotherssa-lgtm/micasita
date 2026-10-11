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

    await paso('agregar MSP_024_Consentimiento_Informado.Motivo_Consulta', async () => {
        if (await existeColumna(pool, 'MSP_024_Consentimiento_Informado', 'Motivo_Consulta')) return;
        // NULL: los consentimientos ya firmados quedan sin motivo (se imprime "—").
        await pool.request().query(`ALTER TABLE MSP_024_Consentimiento_Informado ADD Motivo_Consulta NVARCHAR(MAX) NULL`);
        console.log('✅ [Schema]: Columna MSP_024_Consentimiento_Informado.Motivo_Consulta agregada.');
    });

    // ── COMISIONES DE DOCTORES ──────────────────────────────────────────
    // Especialidad con la que se planificó cada tratamiento (la del MSP-024). Los planes
    // viejos quedan NULL y la comisión la deduce por el nombre del tratamiento.
    await paso('agregar Tratamientos_Plan.Especialidad', async () => {
        if (await existeColumna(pool, 'Tratamientos_Plan', 'Especialidad')) return;
        await pool.request().query(`ALTER TABLE Tratamientos_Plan ADD Especialidad NVARCHAR(100) NULL`);
        console.log('✅ [Schema]: Columna Tratamientos_Plan.Especialidad agregada.');
    });

    // % de comisión de cada doctor por especialidad. Especialidad '*' = % por defecto del
    // doctor para cualquier especialidad que no tenga un % propio.
    await paso('crear Comisiones_Config', async () => {
        if (await existeTabla(pool, 'Comisiones_Config')) return;
        await pool.request().query(`
            CREATE TABLE Comisiones_Config (
                ID_Config INT IDENTITY(1,1) PRIMARY KEY,
                ID_Usuario INT NOT NULL,
                Especialidad NVARCHAR(100) NOT NULL,
                Porcentaje DECIMAL(5,2) NOT NULL,
                Fecha_Actualizacion DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT UQ_Comisiones_Config UNIQUE (ID_Usuario, Especialidad)
            )
        `);
        console.log('✅ [Schema]: Tabla Comisiones_Config creada.');
    });

    // Cabecera de cada pago de comisiones a un doctor (queda registrado también como Gasto).
    await paso('crear Comisiones_Liquidacion', async () => {
        if (await existeTabla(pool, 'Comisiones_Liquidacion')) return;
        await pool.request().query(`
            CREATE TABLE Comisiones_Liquidacion (
                ID_Liquidacion INT IDENTITY(1,1) PRIMARY KEY,
                ID_Clinica INT NOT NULL,
                ID_Medico INT NOT NULL,
                Fecha_Desde DATE NOT NULL,
                Fecha_Hasta DATE NOT NULL,
                Total_Cobrado DECIMAL(18,2) NOT NULL,
                Total_Comision DECIMAL(18,2) NOT NULL,
                Metodo_Pago NVARCHAR(50) NULL,
                Observaciones NVARCHAR(500) NULL,
                ID_Gasto INT NULL,
                ID_Usuario_Registro INT NULL,
                Fecha_Registro DATETIME NOT NULL DEFAULT GETDATE(),
                Estado VARCHAR(20) NOT NULL DEFAULT 'PAGADA'
            )
        `);
        console.log('✅ [Schema]: Tabla Comisiones_Liquidacion creada.');
    });

    // Cada pago de paciente comisionado, con el % aplicado congelado. ID_Pago UNIQUE
    // (en liquidaciones vigentes) garantiza que un mismo cobro no se comisione dos veces.
    await paso('crear Comisiones_Liquidacion_Detalle', async () => {
        if (await existeTabla(pool, 'Comisiones_Liquidacion_Detalle')) return;
        await pool.request().query(`
            CREATE TABLE Comisiones_Liquidacion_Detalle (
                ID_Detalle INT IDENTITY(1,1) PRIMARY KEY,
                ID_Liquidacion INT NOT NULL,
                ID_Pago INT NOT NULL,
                ID_Plan INT NULL,
                Especialidad NVARCHAR(100) NULL,
                Monto_Pago DECIMAL(18,2) NOT NULL,
                Porcentaje DECIMAL(5,2) NOT NULL,
                Comision DECIMAL(18,2) NOT NULL,
                CONSTRAINT FK_ComLiqDet_Liq FOREIGN KEY (ID_Liquidacion) REFERENCES Comisiones_Liquidacion(ID_Liquidacion),
                CONSTRAINT UQ_ComLiqDet_Pago UNIQUE (ID_Pago)
            )
        `);
        console.log('✅ [Schema]: Tabla Comisiones_Liquidacion_Detalle creada.');
    });

    // ── NÓMINA DE PERSONAL (mismo modelo que MasterHotel/OMNI CORE) ─────
    await paso('crear Personal', async () => {
        if (await existeTabla(pool, 'Personal')) return;
        await pool.request().query(`
            CREATE TABLE Personal (
                ID_Personal INT IDENTITY(1,1) PRIMARY KEY,
                ID_Clinica INT NOT NULL,
                Nombre_Completo NVARCHAR(200) NOT NULL,
                Cedula NVARCHAR(20) NULL,
                Cargo NVARCHAR(100) NULL,
                Salario_Base DECIMAL(10,2) NOT NULL DEFAULT 0,
                Fecha_Ingreso DATE NULL,
                Telefono NVARCHAR(30) NULL,
                Correo NVARCHAR(150) NULL,
                Afiliado_IESS BIT NOT NULL DEFAULT 0,
                Decimo_Tercero_Mensualizado BIT NOT NULL DEFAULT 0,
                Decimo_Cuarto_Mensualizado BIT NOT NULL DEFAULT 0,
                Fondo_Reserva_Mensualizado BIT NOT NULL DEFAULT 0,
                Activo BIT NOT NULL DEFAULT 1,
                Fecha_Registro DATETIME NOT NULL DEFAULT GETDATE()
            )
        `);
        console.log('✅ [Schema]: Tabla Personal creada.');
    });

    // ADELANTO, BONO, DESCUENTO, HORAS_SUPLEMENTARIAS, HORAS_EXTRAORDINARIAS,
    // PAGO_NOMINA, LIQUIDACION_FINAL. ID_Gasto = el Egreso que generó (si salió dinero).
    await paso('crear Movimientos_Personal', async () => {
        if (await existeTabla(pool, 'Movimientos_Personal')) return;
        await pool.request().query(`
            CREATE TABLE Movimientos_Personal (
                ID_Movimiento INT IDENTITY(1,1) PRIMARY KEY,
                ID_Personal INT NOT NULL,
                ID_Clinica INT NOT NULL,
                Tipo VARCHAR(30) NOT NULL,
                Monto DECIMAL(10,2) NOT NULL,
                Descripcion NVARCHAR(500) NULL,
                Periodo CHAR(7) NULL,
                Metodo_Pago NVARCHAR(50) NULL,
                ID_Gasto INT NULL,
                Desglose_JSON NVARCHAR(MAX) NULL,
                ID_Usuario_Registro INT NULL,
                Fecha_Movimiento DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT FK_MovPersonal_Personal FOREIGN KEY (ID_Personal) REFERENCES Personal(ID_Personal)
            )
        `);
        console.log('✅ [Schema]: Tabla Movimientos_Personal creada.');
    });

    // SBU y tasas IESS por año — el administrador los ajusta cada enero (no se inventan).
    await paso('crear Parametros_Laborales', async () => {
        if (await existeTabla(pool, 'Parametros_Laborales')) return;
        await pool.request().query(`
            CREATE TABLE Parametros_Laborales (
                Anio INT PRIMARY KEY,
                SBU DECIMAL(10,2) NOT NULL,
                Aporte_Personal_IESS DECIMAL(6,4) NOT NULL DEFAULT 0.0945,
                Aporte_Patronal_IESS DECIMAL(6,4) NOT NULL DEFAULT 0.1115,
                Porcentaje_Fondo_Reserva DECIMAL(6,4) NOT NULL DEFAULT 0.0833
            )
        `);
        console.log('✅ [Schema]: Tabla Parametros_Laborales creada.');
    });

    // Región para el Décimo Cuarto (Art. 113): 'COSTA' (Costa/Galápagos) o 'SIERRA' (Sierra/Amazonía).
    await paso('agregar Clinicas.Region_Decimo_Cuarto', async () => {
        if (await existeColumna(pool, 'Clinicas', 'Region_Decimo_Cuarto')) return;
        await pool.request().query(`ALTER TABLE Clinicas ADD Region_Decimo_Cuarto VARCHAR(10) NULL`);
        console.log('✅ [Schema]: Columna Clinicas.Region_Decimo_Cuarto agregada.');
    });

    // Identificador único de ESTA instalación (para el registro de instalaciones en
    // casrodsoft.com). Vive en la base de datos: si alguien copia el sistema completo a
    // otra máquina, el mismo ID aparece con otra huella de equipo y el panel lo alerta.
    await paso('crear Sistema_Instalacion', async () => {
        if (!(await existeTabla(pool, 'Sistema_Instalacion'))) {
            await pool.request().query(`
                CREATE TABLE Sistema_Instalacion (
                    ID_Instalacion NVARCHAR(36) NOT NULL PRIMARY KEY,
                    Fecha_Creacion DATETIME NOT NULL DEFAULT GETDATE()
                )
            `);
            console.log('✅ [Schema]: Tabla Sistema_Instalacion creada.');
        }
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM Sistema_Instalacion)
                INSERT INTO Sistema_Instalacion (ID_Instalacion) VALUES (CONVERT(NVARCHAR(36), NEWID()))`);
    });
}

module.exports = { ensureSchemaExtendida };
