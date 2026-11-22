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

    // Certificados médicos (reposo, constancia de atención, certificado de salud). El PDF
    // emitido (firmado o no) queda en uploads/certificados/<Token>.pdf; el Token es aleatorio
    // (no adivinable) y es lo que lleva el QR de verificación.
    await paso('crear Certificados_Medicos', async () => {
        if (await existeTabla(pool, 'Certificados_Medicos')) return;
        await pool.request().query(`
            CREATE TABLE Certificados_Medicos (
                ID_Certificado INT IDENTITY(1,1) PRIMARY KEY,
                Token VARCHAR(64) NOT NULL UNIQUE,
                ID_Paciente INT NOT NULL,
                ID_Clinica INT NOT NULL,
                ID_Medico INT NOT NULL,
                ID_Usuario_Emite INT NULL,
                Fecha_Emision DATETIME NOT NULL DEFAULT GETDATE(),
                Tipo VARCHAR(20) NOT NULL,              -- REPOSO | ASISTENCIA | SALUD
                Fecha_Atencion DATE NOT NULL,
                Hora_Entrada VARCHAR(5) NULL,
                Hora_Salida VARCHAR(5) NULL,
                Contingencia NVARCHAR(100) NULL,
                Dias_Reposo INT NULL,
                Reposo_Desde DATE NULL,
                Reposo_Hasta DATE NULL,
                Resultado_Aptitud NVARCHAR(60) NULL,
                Actividad_Aptitud NVARCHAR(300) NULL,
                CIE10_Cod NVARCHAR(20) NULL,
                CIE10_Texto NVARCHAR(400) NULL,
                Mostrar_Diagnostico BIT NOT NULL DEFAULT 0,
                Motivo NVARCHAR(1000) NULL,
                Observaciones NVARCHAR(2000) NULL,
                Especialidad_Medico NVARCHAR(150) NULL,
                Nombre_Medico_Snapshot NVARCHAR(250) NULL,
                Cedula_Medico_Snapshot VARCHAR(20) NULL,
                Registro_Medico_Snapshot VARCHAR(80) NULL,
                Firma_Tipo VARCHAR(10) NULL,            -- CLINICA | MEDICO | NULL (manuscrita)
                Firma_Titular NVARCHAR(300) NULL,
                Firma_Emisor NVARCHAR(300) NULL,
                Archivo_PDF NVARCHAR(200) NULL,
                Anulado BIT NOT NULL DEFAULT 0,
                Motivo_Anulacion NVARCHAR(500) NULL,
                Fecha_Anulacion DATETIME NULL
            )
        `);
        await pool.request().query(`CREATE INDEX IX_Certificados_Medicos_Paciente ON Certificados_Medicos (ID_Paciente)`);
        console.log('✅ [Schema]: Tabla Certificados_Medicos creada.');
    });

    // Firma electrónica personal de cada médico (.p12 y contraseña CIFRADOS con AES-256-GCM;
    // ver services/firmaElectronicaService.js). Opcional: si no hay, se usa la de la clínica.
    await paso('crear Usuarios_Firma_Electronica', async () => {
        if (await existeTabla(pool, 'Usuarios_Firma_Electronica')) return;
        await pool.request().query(`
            CREATE TABLE Usuarios_Firma_Electronica (
                ID_Firma INT IDENTITY(1,1) PRIMARY KEY,
                ID_Usuario INT NOT NULL,
                P12_Cifrado VARBINARY(MAX) NOT NULL,
                Password_Cifrado VARBINARY(MAX) NOT NULL,
                Titular NVARCHAR(300) NULL,
                Emisor NVARCHAR(300) NULL,
                Fecha_Vencimiento DATETIME NULL,
                Fecha_Carga DATETIME NOT NULL DEFAULT GETDATE(),
                Activo BIT NOT NULL DEFAULT 1
            )
        `);
        console.log('✅ [Schema]: Tabla Usuarios_Firma_Electronica creada.');
    });

    // Especialidad del profesional (se imprime en certificados y recetas)
    await paso('agregar Usuarios.Especialidad', async () => {
        if (await existeColumna(pool, 'Usuarios', 'Especialidad')) return;
        await pool.request().query(`ALTER TABLE Usuarios ADD Especialidad NVARCHAR(150) NULL`);
        console.log('✅ [Schema]: Columna Usuarios.Especialidad agregada.');
    });

    // Código aleatorio para el QR de las recetas (antes el QR usaba el número correlativo
    // y cambiando el número se podían ver otras recetas). Las recetas viejas también lo reciben.
    await paso('agregar Recetas.Codigo_Verificacion', async () => {
        if (!(await existeColumna(pool, 'Recetas', 'Codigo_Verificacion'))) {
            await pool.request().query(`ALTER TABLE Recetas ADD Codigo_Verificacion VARCHAR(32) NULL
                CONSTRAINT DF_Recetas_Codigo_Verificacion DEFAULT (LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', '')))`);
            console.log('✅ [Schema]: Columna Recetas.Codigo_Verificacion agregada.');
        }
        await pool.request().query(`UPDATE Recetas SET Codigo_Verificacion = LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''))
            WHERE Codigo_Verificacion IS NULL`);
        await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Recetas_Codigo_Verificacion' AND object_id = OBJECT_ID('Recetas'))
            CREATE INDEX IX_Recetas_Codigo_Verificacion ON Recetas (Codigo_Verificacion)`);
    });

    // La contraseña de la firma .p12 de la clínica se guardaba solo en base64: se cifra.
    await paso('cifrar contraseña de la firma de la clínica', async () => {
        if (!(await existeTabla(pool, 'Facturacion_Certificados'))) return;
        const { cifrarClaveFirma } = require('../services/firmaElectronicaService');
        const r = await pool.request().query(`SELECT ID_Certificado, Password_P12_Encrypted FROM Facturacion_Certificados
            WHERE Password_P12_Encrypted IS NOT NULL AND Password_P12_Encrypted NOT LIKE 'enc1:%'`);
        for (const c of r.recordset) {
            const plano = Buffer.from(c.Password_P12_Encrypted, 'base64').toString('utf8');
            await pool.request()
                .input('id', sql.Int, c.ID_Certificado)
                .input('pass', sql.NVarChar(sql.MAX), cifrarClaveFirma(plano))
                .query('UPDATE Facturacion_Certificados SET Password_P12_Encrypted = @pass WHERE ID_Certificado = @id');
        }
        if (r.recordset.length) console.log(`✅ [Schema]: ${r.recordset.length} contraseña(s) de firma cifrada(s).`);
    });

    // =====================================================================
    // v4.7.0 — firma con PIN + bandeja de pendientes, receta firmada, trazabilidad
    // con el plan, órdenes de exámenes y convenios. Todo ADITIVO e idempotente.
    // =====================================================================
    const agregarColumnas = async (tabla, columnas) => {
        if (!(await existeTabla(pool, tabla))) return;
        for (const [nombre, definicion] of columnas) {
            if (!(await existeColumna(pool, tabla, nombre))) {
                await pool.request().query(`ALTER TABLE ${tabla} ADD ${nombre} ${definicion}`);
                console.log(`✅ [Schema]: Columna ${tabla}.${nombre} agregada.`);
            }
        }
    };
    const COLUMNAS_FIRMA = [
        ['Firma_Tipo', 'VARCHAR(10) NULL'], ['Firma_Titular', 'NVARCHAR(300) NULL'], ['Firma_Emisor', 'NVARCHAR(300) NULL'],
        ['Archivo_PDF', 'NVARCHAR(200) NULL'], ['Fecha_Firma', 'DATETIME NULL'], ['ID_Usuario_Firma', 'INT NULL'], ['Origen_Firma', 'NVARCHAR(100) NULL']
    ];

    await paso('v4.7 certificados: estado de firma y plan', async () => {
        await agregarColumnas('Certificados_Medicos', [
            ['Estado', "VARCHAR(20) NOT NULL CONSTRAINT DF_Certificados_Medicos_Estado DEFAULT 'EMITIDO'"],
            ['ID_Plan', 'INT NULL'], ['Atencion_Texto', 'NVARCHAR(400) NULL'],
            ['Fecha_Firma', 'DATETIME NULL'], ['ID_Usuario_Firma', 'INT NULL'], ['Origen_Firma', 'NVARCHAR(100) NULL']
        ]);
    });

    await paso('v4.7 recetas: firma electrónica y plan', async () => {
        await agregarColumnas('Recetas', [
            ['Estado_Firma', 'VARCHAR(20) NULL'], ['ID_Plan', 'INT NULL'], ['Atencion_Texto', 'NVARCHAR(400) NULL'],
            ['ID_Usuario_Prepara', 'INT NULL'], ...COLUMNAS_FIRMA
        ]);
    });

    // La contraseña (PIN) de la firma de cada médico ya no se guarda: se borra la que hubiera.
    await paso('v4.7 firma del médico sin contraseña guardada', async () => {
        if (!(await existeTabla(pool, 'Usuarios_Firma_Electronica'))) return;
        const r = await pool.request().query(`UPDATE Usuarios_Firma_Electronica SET Password_Cifrado = 0x WHERE DATALENGTH(Password_Cifrado) > 0`);
        if (r.rowsAffected[0]) console.log(`✅ [Schema]: ${r.rowsAffected[0]} contraseña(s) de firma de médico eliminada(s) (ahora se pide el PIN al firmar).`);
    });

    await paso('v4.7 crear Convenios', async () => {
        if (await existeTabla(pool, 'Convenios')) return;
        await pool.request().query(`
            CREATE TABLE Convenios (
                ID_Convenio INT IDENTITY(1,1) PRIMARY KEY,
                Nombre NVARCHAR(150) NOT NULL,
                Tipo VARCHAR(20) NOT NULL DEFAULT 'OTRO',      -- ASEGURADORA | EMPRESA | IESS | ISSFA | ISSPOL | MSP_RPIS | OTRO
                RUC VARCHAR(13) NULL,
                Contacto NVARCHAR(150) NULL,
                Telefono NVARCHAR(30) NULL,
                Email NVARCHAR(150) NULL,
                Descuento_Porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
                Requiere_Autorizacion BIT NOT NULL DEFAULT 0,
                Observaciones NVARCHAR(500) NULL,
                Activo BIT NOT NULL DEFAULT 1,
                Fecha_Registro DATETIME NOT NULL DEFAULT GETDATE()
            )`);
        console.log('✅ [Schema]: Tabla Convenios creada.');
    });

    await paso('v4.7 crear Paciente_Convenios', async () => {
        if (await existeTabla(pool, 'Paciente_Convenios')) return;
        await pool.request().query(`
            CREATE TABLE Paciente_Convenios (
                ID_Paciente_Convenio INT IDENTITY(1,1) PRIMARY KEY,
                ID_Paciente INT NOT NULL,
                ID_Convenio INT NOT NULL,
                Numero_Afiliado NVARCHAR(60) NULL,
                Titular NVARCHAR(150) NULL,
                Parentesco NVARCHAR(40) NULL,
                Vigente_Hasta DATE NULL,
                Activo BIT NOT NULL DEFAULT 1,
                Fecha_Registro DATETIME NOT NULL DEFAULT GETDATE()
            )`);
        await pool.request().query(`CREATE INDEX IX_Paciente_Convenios_Paciente ON Paciente_Convenios (ID_Paciente)`);
        console.log('✅ [Schema]: Tabla Paciente_Convenios creada.');
    });

    await paso('v4.7 crear Ordenes_Examenes', async () => {
        if (await existeTabla(pool, 'Ordenes_Examenes')) return;
        await pool.request().query(`
            CREATE TABLE Ordenes_Examenes (
                ID_Orden INT IDENTITY(1,1) PRIMARY KEY,
                Codigo_Verificacion VARCHAR(32) NOT NULL CONSTRAINT DF_Ordenes_Examenes_Codigo DEFAULT (LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''))),
                ID_Paciente INT NOT NULL,
                ID_Clinica INT NULL,
                ID_Medico INT NOT NULL,
                ID_Usuario_Emite INT NULL,
                Fecha DATETIME NOT NULL DEFAULT GETDATE(),
                Tipo VARCHAR(15) NOT NULL,                     -- LABORATORIO | IMAGEN | OTRO
                Prioridad VARCHAR(10) NOT NULL DEFAULT 'RUTINA',
                Examenes_JSON NVARCHAR(MAX) NOT NULL,
                CIE10_Cod NVARCHAR(20) NULL,
                CIE10_Texto NVARCHAR(400) NULL,
                Indicaciones NVARCHAR(1000) NULL,
                Destino NVARCHAR(200) NULL,
                ID_Plan INT NULL,
                Atencion_Texto NVARCHAR(400) NULL,
                ID_Convenio INT NULL,
                Convenio_Texto NVARCHAR(200) NULL,
                Estado VARCHAR(20) NOT NULL DEFAULT 'EMITIDO',
                Firma_Tipo VARCHAR(10) NULL,
                Firma_Titular NVARCHAR(300) NULL,
                Firma_Emisor NVARCHAR(300) NULL,
                Archivo_PDF NVARCHAR(200) NULL,
                Fecha_Firma DATETIME NULL,
                ID_Usuario_Firma INT NULL,
                Origen_Firma NVARCHAR(100) NULL,
                Anulado BIT NOT NULL DEFAULT 0,
                Motivo_Anulacion NVARCHAR(500) NULL,
                Fecha_Anulacion DATETIME NULL,
                Resultado_Archivo NVARCHAR(200) NULL,
                Resultado_Nombre NVARCHAR(200) NULL,
                Resultado_Fecha DATETIME NULL,
                Resultado_Notas NVARCHAR(1000) NULL,
                ID_Usuario_Resultado INT NULL
            )`);
        await pool.request().query(`CREATE INDEX IX_Ordenes_Examenes_Paciente ON Ordenes_Examenes (ID_Paciente)`);
        await pool.request().query(`CREATE UNIQUE INDEX IX_Ordenes_Examenes_Codigo ON Ordenes_Examenes (Codigo_Verificacion)`);
        console.log('✅ [Schema]: Tabla Ordenes_Examenes creada.');
    });

    // =====================================================================
    // v4.7.1 — convenio / seguro POR TRATAMIENTO y cuentas por cobrar al convenio.
    // Regla de saldos: Costo_Total = pagos del paciente + pagos del convenio
    //                  + Saldo_Pendiente (lo que debe el paciente) + Saldo_Convenio (lo que debe el seguro).
    // Todo ADITIVO: los tratamientos existentes quedan como particulares (convenio NULL, montos 0).
    // =====================================================================
    await paso('v4.7.1 tratamientos: convenio y cobro al seguro', async () => {
        await agregarColumnas('Tratamientos_Plan', [
            ['ID_Convenio', 'INT NULL'],
            ['Numero_Autorizacion', 'NVARCHAR(60) NULL'],
            ['Monto_Convenio', 'DECIMAL(18,2) NOT NULL CONSTRAINT DF_Tratamientos_Plan_Monto_Convenio DEFAULT 0'],
            ['Saldo_Convenio', 'DECIMAL(18,2) NOT NULL CONSTRAINT DF_Tratamientos_Plan_Saldo_Convenio DEFAULT 0'],
            ['Estado_Cobro_Convenio', 'VARCHAR(20) NULL'],      // PENDIENTE | ENVIADO | PARCIAL | PAGADO | RECHAZADO
            ['Fecha_Envio_Convenio', 'DATETIME NULL']
        ]);
    });

    await paso('v4.7.1 convenios: porcentaje de cobertura', async () => {
        await agregarColumnas('Convenios', [
            ['Cobertura_Porcentaje', 'DECIMAL(5,2) NOT NULL CONSTRAINT DF_Convenios_Cobertura DEFAULT 100']
        ]);
    });

    // Historial (auditoría) de todo lo que pasa con la parte del seguro de cada tratamiento
    await paso('v4.7.1 crear Convenio_Movimientos', async () => {
        if (await existeTabla(pool, 'Convenio_Movimientos')) return;
        await pool.request().query(`
            CREATE TABLE Convenio_Movimientos (
                ID_Movimiento INT IDENTITY(1,1) PRIMARY KEY,
                ID_Plan INT NOT NULL,
                ID_Convenio INT NOT NULL,
                Tipo VARCHAR(20) NOT NULL,                   -- ASIGNADO | QUITADO | ENVIADO | PAGO | RECHAZO
                Monto DECIMAL(18,2) NOT NULL DEFAULT 0,
                ID_Pago INT NULL,
                Referencia NVARCHAR(100) NULL,
                Observacion NVARCHAR(500) NULL,
                ID_Usuario INT NULL,
                Fecha DATETIME NOT NULL DEFAULT GETDATE()
            )`);
        await pool.request().query(`CREATE INDEX IX_Convenio_Movimientos_Plan ON Convenio_Movimientos (ID_Plan)`);
        console.log('✅ [Schema]: Tabla Convenio_Movimientos creada.');
    });

    // v4.7.3 — descuento pactado con el convenio aplicado al tratamiento (se devuelve si se quita el convenio)
    await paso('v4.7.3 tratamientos: descuento del convenio', async () => {
        await agregarColumnas('Tratamientos_Plan', [
            ['Descuento_Convenio', 'DECIMAL(18,2) NOT NULL CONSTRAINT DF_Tratamientos_Plan_Descuento_Convenio DEFAULT 0']
        ]);
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
