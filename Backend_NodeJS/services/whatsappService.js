const { Client, LocalAuth, Location } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const bcrypt = require('bcrypt');
const path = require('path'); // <--- AÑADIDO: Vital para manejar rutas en servicios
const fs = require('fs');     // <--- AÑADIDO: Necesario para localizar el ejecutable de Chrome
const { getConnection, sql } = require('../config/db');
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const sesionesConversacion = new Map();

const CLINICA_LAT_DEF = -1.0471181180373076; 
const CLINICA_LNG_DEF = -79.46953457199427;

// =======================================================================
// --- RESOLUTOR DE CHROME (a prueba de instalaciones) ---
// Busca el navegador en este orden:
//   1. Variable CHROME_PATH del .env (si la definieron a mano)
//   2. Chrome que viaja DENTRO del proyecto (.cache/puppeteer) -> portable
//   3. Chrome instalado normalmente en Windows
// Si no encuentra ninguno, devuelve null como último recurso.
// =======================================================================
function resolverRutaChrome() {
    // 1. CHROME_PATH definido en el .env
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }

    const esWin = process.platform === 'win32';
    const esMac = process.platform === 'darwin';

    // 2. Chrome empaquetado dentro del proyecto (.cache/puppeteer)
    const nombreChromeExe = esWin ? 'chrome.exe' : 'Google Chrome';
    const buscar = (dir) => {
        if (!fs.existsSync(dir)) return null;
        for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, it.name);
            if (it.isDirectory()) {
                const r = buscar(full);
                if (r) return r;
            } else if (it.name === nombreChromeExe) {
                return full;
            }
        }
        return null;
    };
    // OJO: .cache está en la raíz del servidor (un nivel arriba de /services)
    const enProyecto = buscar(path.join(__dirname, '..', '.cache', 'puppeteer'));
    if (enProyecto) return enProyecto;

    // 3. Rutas comunes según sistema operativo
    const comunes = esWin ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ] : esMac ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ] : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ];
    for (const r of comunes) {
        if (fs.existsSync(r)) return r;
    }

    return null; // último recurso: que puppeteer-core intente por su cuenta
}

const RUTA_CHROME = resolverRutaChrome();
console.log('🌐 [WhatsApp]: Chrome detectado en ->', RUTA_CHROME || 'NO ENCONTRADO');

const client = new Client({
    // CAMBIO 1: Forzamos la ruta absoluta hacia la carpeta 'sessions' en la raíz del proyecto
    authStrategy: new LocalAuth({ 
        dataPath: path.join(__dirname, '..', 'sessions') 
    }),
    puppeteer: {
        handleSIGINT: false,
        executablePath: RUTA_CHROME, // CAMBIO: antes era process.env.CHROME_PATH || null (causa del fallo)
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-extensions',
            '--disable-gpu',           // CAMBIO 2: Desactiva aceleración gráfica (obligatorio en servicios)
            '--disable-dev-shm-usage', // CAMBIO 3: Evita cierres por falta de memoria compartida
            '--no-zygote',             // Mejora la estabilidad en procesos de fondo
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    }
});
// --- FUNCIONES DE APOYO ---

function formatearFechaEcuador(fechaObj) {
    return fechaObj.toLocaleDateString('es-EC', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
    }).toUpperCase();
}

async function obtenerHorariosLibres(pool, id_clinica, fecha, id_doctor) {
    const jornada = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
    try {
        // Calcular fecha y hora actual en Ecuador
        const ahora = new Date();
        ahora.setHours(ahora.getHours() - 5);
        const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
        const esHoy = fecha === fechaHoy;

        // ✅ FIX: Filtrar por doctor para verificar su disponibilidad real
        const res = await pool.request()
            .input('f', sql.Date, fecha)
            .input('cli', sql.Int, id_clinica)
            .input('doc', sql.Int, id_doctor)
            .query(`SELECT LEFT(CAST(Hora_Inicio AS VARCHAR), 5) as hora FROM Citas WHERE Fecha_Cita = @f AND ID_Clinica = @cli AND ID_Doctor = @doc AND Estado != 'Cancelada'`);
        
        const ocupadas = res.recordset.map(r => r.hora);

        return jornada.filter(h => {
            if (ocupadas.includes(h)) return false;          // Ya reservada por este doctor
            if (esHoy && h <= horaActual) return false;      // ✅ Hora ya pasó hoy
            return true;
        });
    } catch (err) { 
        console.error("Error horarios:", err);
        return []; 
    }
}

function generarOpcionesDias() {
    const dias = [];
    for (let i = 0; i <= 13; i++) {  // ✅ Antes: i = 1, ahora incluye HOY
        const d = new Date(); 
        d.setHours(d.getHours() - 5); // Ajuste Ecuador
        d.setDate(d.getDate() + i);

        if (d.getDay() !== 0) {
            const anio = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            const fechaLimpia = `${anio}-${mes}-${dia}`;
            dias.push({ label: formatearFechaEcuador(d), value: fechaLimpia });
        }
    }
    return dias;
}
// --- EVENTOS DE CLIENTE ---

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('--- ESCANEA EL QR PARA MEDICINA ECUADOR PRO ---');
});

client.on('ready', () => console.log('✅ Sistema Medicina Ecuador Pro: WhatsApp Web Conectado'));

client.on('message', async (msg) => {
    if (msg.isStatus || msg.from === 'status@broadcast') return;
    if (msg.fromMe || msg.from.includes('@g.us')) return;
    if (msg.type !== 'chat' || !msg.body) return;

    let chat = sesionesConversacion.get(msg.from) || { 
        estado: 'MENU', 
        id_rol: 0, 
        id_clinica_seleccionada: 1 
    };

    const textoOriginal = msg.body.trim();
    const texto = textoOriginal.toLowerCase();
    const navFooter = `\n\n________________________\n0️⃣ Volver al *MENÚ PRINCIPAL*`;

    try {
        const pool = await getConnection();
        
        const resInfo = await pool.request()
            .input('id', chat.id_clinica_seleccionada)
            .query("SELECT Nombre_Clinica FROM CLINICAS WHERE ID_Clinica = @id");
        const nombreClinica = resInfo.recordset[0]?.Nombre_Clinica || "MedicinaEcuador Pro";

        if (texto === "0" || texto === "hola" || texto === "menu" || texto === "buenos dias" || texto === "buenas tardes") {
            chat.estado = 'MENU';
            sesionesConversacion.set(msg.from, chat);
            
            let menuTxt = `¡Hola! 👋 Soy *Mini Doctor*, tu asistente de *${nombreClinica}*. 🦷✨\n\n¿En qué puedo apoyarte hoy?\n\n🏠 *MENÚ PRINCIPAL*\n\n1️⃣ Horarios\n2️⃣ Especialidades\n3️⃣ Agendar Cita\n4️⃣ Consultar Cita\n5️⃣ Ubicaciones`;
            
            if (chat.id_rol === 1 || chat.id_rol === 3) {
                menuTxt += `\n\n🔐 *PANEL ADMINISTRATIVO*\n6️⃣ Agenda de Hoy\n7️⃣ Resumen de Caja\n8️⃣ Recordatorios (Citas/Deudas)\n9️⃣ Salir del Modo Doctor`;
            }

            return await msg.reply(menuTxt);
        }

        let numeroWA = msg.from.split('@')[0].replace(/\D/g, ''); 
        let numeroDB = (numeroWA.startsWith('593') && numeroWA.length > 10) ? '0' + numeroWA.substring(3) : numeroWA;

        if (texto === "acceso") {
            chat.estado = 'LOGIN_CEDULA'; 
            sesionesConversacion.set(msg.from, chat);
            return await msg.reply("🔐 *MODO DOCTOR DETECTADO*\n\nPara continuar con el acceso administrativo, por favor ingrese su número de cédula:");
        }

        if (chat.estado === 'LOGIN_CEDULA') {
            const cedulaLimpia = textoOriginal.replace(/\D/g, '');
            if (cedulaLimpia.length < 10) return await msg.reply("⚠️ Cédula no válida. Ingrese los 10 dígitos:");
            chat.temp_cedula = cedulaLimpia;
            chat.estado = 'LOGIN_USUARIO'; sesionesConversacion.set(msg.from, chat);
            return await msg.reply("👤 Correcto. Ahora ingrese su *Usuario*:");
        }
        if (chat.estado === 'LOGIN_USUARIO') {
            chat.temp_user = textoOriginal;
            chat.estado = 'LOGIN_PASSWORD'; sesionesConversacion.set(msg.from, chat);
            return await msg.reply("🔑 Finalmente, ingrese su *Contraseña*:");
        }
        if (chat.estado === 'LOGIN_PASSWORD') {
            const resUser = await pool.request()
                .input('ced', chat.temp_cedula)
                .input('user', chat.temp_user)
                .query(`SELECT ID_Usuario, ID_Rol, Password_Hash, Nombres, ID_Clinica FROM Usuarios WHERE Cedula = @ced AND Username = @user AND Activo = 1`);
            
            if (resUser.recordset.length > 0) {
                const uDB = resUser.recordset[0];
                const match = await bcrypt.compare(textoOriginal, uDB.Password_Hash);
                if (match) {
                    chat.id_rol = uDB.ID_Rol; 
                    chat.id_usuario_db = uDB.ID_Usuario;
                    chat.id_clinica_seleccionada = uDB.ID_Clinica;
                    chat.nombres = uDB.Nombres;
                    chat.estado = 'MENU'; 
                    sesionesConversacion.set(msg.from, chat);
                    return await msg.reply(`✅ *ACCESO CONCEDIDO*\n\nBienvenido/a Dr. ${chat.nombres}. El menú administrativo ha sido habilitado.\n\nEscriba *Menu* para ver las opciones.`);
                }
            }
            return await msg.reply("❌ *CREDENCIALES INCORRECTAS*\n\nIntente su contraseña nuevamente o escriba *0* para cancelar:");
        }

        if (chat.estado === 'SELECCIONAR_CLINICA') {
            const resClinicas = await pool.request().query("SELECT * FROM CLINICAS WHERE Activo = 1");
            const seleccion = parseInt(texto) - 1;
            if (resClinicas.recordset[seleccion]) {
                const cli = resClinicas.recordset[seleccion];
                chat.id_clinica_seleccionada = cli.ID_Clinica;
                chat.ciudad_seleccionada = cli.Ciudad;
                chat.nombre_clinica = cli.Nombre_Clinica;
                chat.lat = cli.Latitud; chat.lng = cli.Longitud;

                const checkP = await pool.request()
                    .input('tel', numeroDB).input('cli', chat.id_clinica_seleccionada)
                    .query("SELECT ID_Paciente FROM Pacientes WHERE Telefono = @tel AND ID_Clinica = @cli");

                if (checkP.recordset.length === 0) {
                    chat.estado = 'ESPERANDO_NOMBRES'; sesionesConversacion.set(msg.from, chat);
                    return await msg.reply(`📍 Sede: *${chat.ciudad_seleccionada}*\n\nNo registramos su número en esta sede. Por favor, ingrese sus *Nombres*:`);
                } else {
                    chat.idPacienteRegistrado = checkP.recordset[0].ID_Paciente;
                    chat.estado = 'AGENDAR_FECHA'; sesionesConversacion.set(msg.from, chat);
                    return await msg.reply(`📍 Sede: *${chat.ciudad_seleccionada}*\n\n📅 *ELIJA EL DÍA DE SU CITA:*\n\n${generarOpcionesDias().map((d,i) => `${i+1}️⃣ ${d.label}`).join('\n')}${navFooter}`);
                }
            } else {
                return await msg.reply("⚠️ Opción de sede incorrecta. Elija un número de la lista:");
            }
        }

        if (chat.estado === 'ESPERANDO_NOMBRES') {
            if (textoOriginal.length < 3) return await msg.reply("⚠️ Por favor, ingrese un nombre válido:");
            chat.nombres_p = textoOriginal; chat.estado = 'ESPERANDO_APELLIDOS'; sesionesConversacion.set(msg.from, chat);
            return await msg.reply(`Un gusto, ${chat.nombres_p}. Ahora ingrese sus *Apellidos*:`);
        }
        if (chat.estado === 'ESPERANDO_APELLIDOS') {
            if (textoOriginal.length < 3) return await msg.reply("⚠️ Por favor, ingrese un apellido válido:");
            chat.apellidos_p = textoOriginal; chat.estado = 'ESPERANDO_DNI'; sesionesConversacion.set(msg.from, chat);
            return await msg.reply(`Gracias. Por favor, ingrese su número de *Cédula o DNI*:`);
        }

        if (chat.estado === 'ESPERANDO_DNI') {
            const dniLimpio = textoOriginal.replace(/\D/g, '');
            if (dniLimpio.length < 10) return await msg.reply("⚠️ Ingrese un DNI/Cédula válido (10 dígitos):");
            chat.temp_dni = dniLimpio;

            try {
                // 1. BÚSQUEDA GLOBAL: Si el DNI existe en cualquier clínica, lo recuperamos
                const checkGlobal = await pool.request()
                    .input('dni', dniLimpio)
                    .query(`
                        SELECT TOP 1 ID_Paciente, Nombres, ID_Clinica 
                        FROM Pacientes 
                        WHERE DNI = @dni
                    `);

                if (checkGlobal.recordset.length > 0) {
                    const paciente = checkGlobal.recordset[0];
                    chat.idPacienteRegistrado = paciente.ID_Paciente;
                    chat.nombres_p = paciente.Nombres;
                    
                    // Si el DNI ya existe, no importa la clínica, lo mandamos a agendar
                    // para evitar el error de UNIQUE KEY al intentar insertar.
                    chat.estado = 'AGENDAR_FECHA';
                    sesionesConversacion.set(msg.from, chat);

                    await msg.reply(`✨ *PACIENTE RECONOCIDO*\n\nHola de nuevo, ${paciente.Nombres}. Ya contamos con su registro en el sistema.`);
                    return await msg.reply(`📅 *ELIJA EL DÍA DE SU CITA:*\n\n${generarOpcionesDias().map((d,i) => `${i+1}️⃣ ${d.label}`).join('\n')}${navFooter}`);
                }

                // Si realmente no existe el DNI en ninguna parte, pedimos teléfono
                chat.estado = 'ESPERANDO_TELEFONO';
                sesionesConversacion.set(msg.from, chat);
                return await msg.reply(`¿Desea que usemos el número *${numeroDB}* para enviarle recordatorios?\n\n1️⃣ Sí, usar este.\n2️⃣ No, ingresar otro.`);

            } catch (err) {
                console.error("Error en validación DNI:", err);
                return await msg.reply("⚠️ Error técnico al validar identidad. Escriba *0*.");
            }
        }

        if (chat.estado === 'ESPERANDO_TELEFONO') {
            let telefonoFinal = "";
            if (texto === "1") {
                telefonoFinal = numeroDB;
            } else if (texto === "2") {
                chat.solicitarTelManual = true;
                sesionesConversacion.set(msg.from, chat);
                return await msg.reply("Perfecto. Ingrese el número de contacto (10 dígitos):");
            } else if (chat.solicitarTelManual && /^\d{10}$/.test(textoOriginal)) {
                telefonoFinal = textoOriginal;
            } else {
                return await msg.reply("⚠️ Selección inválida. Elija 1 o 2.");
            }

            if (telefonoFinal) {
                try {
                    // 2. OPERACIÓN ATÓMICA: UPSERT (Update or Insert)
                    // Buscamos el DNI una última vez antes de insertar para evitar condiciones de carrera
                    const resPac = await pool.request()
                        .input('nom', chat.nombres_p || 'Paciente')
                        .input('ape', chat.apellidos_p || '')
                        .input('tel', telefonoFinal)
                        .input('dni', chat.temp_dni)
                        .input('cli', chat.id_clinica_seleccionada)
                        .query(`
                            SET NOCOUNT ON;
                            DECLARE @ID_Existente INT;
                            
                            SELECT @ID_Existente = ID_Paciente FROM Pacientes WHERE DNI = @dni;

                            IF @ID_Existente IS NULL
                            BEGIN
                                INSERT INTO Pacientes (Nombres, Apellidos, Telefono, DNI, ID_Clinica, Fecha_Registro, Activo)
                                VALUES (@nom, @ape, @tel, @dni, @cli, GETDATE(), 1);
                                SELECT SCOPE_IDENTITY() AS ID_Paciente, 'NUEVO' as EstadoRegistro;
                            END
                            ELSE
                            BEGIN
                                -- Si ya existía el DNI, actualizamos sus datos mínimos y lo retornamos
                                UPDATE Pacientes SET Activo = 1, Telefono = @tel WHERE ID_Paciente = @ID_Existente;
                                SELECT @ID_Existente AS ID_Paciente, 'EXISTENTE' as EstadoRegistro;
                            END
                        `);

                    const registro = resPac.recordset[0];
                    chat.idPacienteRegistrado = registro.ID_Paciente;
                    chat.estado = 'AGENDAR_FECHA';
                    chat.solicitarTelManual = false; // Limpiamos bandera
                    sesionesConversacion.set(msg.from, chat);

                    const mensaje = registro.EstadoRegistro === 'EXISTENTE' 
                        ? `✨ *DATOS VERIFICADOS*\n\nContinuemos con su solicitud.`
                        : `✅ *REGISTRO EXITOSO*\n\nBienvenido/a, ${chat.nombres_p || 'a nuestro sistema'}.`;

                    await msg.reply(mensaje);
                    return await msg.reply(`📅 *ELIJA EL DÍA DE SU CITA:*\n\n${generarOpcionesDias().map((d,i) => `${i+1}️⃣ ${d.label}`).join('\n')}${navFooter}`);

                } catch (dbErr) {
                    console.error("Error Crítico en Registro:", dbErr.message);
                    
                    // Rescate final por si el error de UNIQUE KEY ocurre en el milisegundo de ejecución
                    if (dbErr.message.includes("UNIQUE KEY")) {
                        const rescate = await pool.request().input('dni', chat.temp_dni)
                            .query("SELECT TOP 1 ID_Paciente FROM Pacientes WHERE DNI = @dni");
                        
                        if (rescate.recordset.length > 0) {
                            chat.idPacienteRegistrado = rescate.recordset[0].ID_Paciente;
                            chat.estado = 'AGENDAR_FECHA';
                            sesionesConversacion.set(msg.from, chat);
                            return await msg.reply("✨ Registro detectado. Procedamos.\n\n📅 *ELIJA EL DÍA:* ...");
                        }
                    }
                    return await msg.reply("⚠️ Hubo un inconveniente al guardar. Escriba *0*.");
                }
            }
        }

        if (chat.estado === 'AGENDAR_FECHA') {
            const opciones = generarOpcionesDias();
            const idx = parseInt(texto) - 1;
            if (opciones[idx]) {
                chat.fechaSeleccionada = opciones[idx].value; chat.fechaLabel = opciones[idx].label;
                
                // ✅ FIX: Mostrar doctores disponibles de la clínica para que el paciente elija
                const resDoctores = await pool.request()
                    .input('cli', sql.Int, chat.id_clinica_seleccionada)
                    .query(`SELECT ID_Usuario, Nombres, Apellidos FROM Usuarios WHERE ID_Clinica = @cli AND ID_Rol = 3 AND Activo = 1 ORDER BY Apellidos ASC`);
                
                if (resDoctores.recordset.length === 0) {
                    return await msg.reply("⚠️ No hay doctores disponibles en esta sede actualmente. Escriba *0* para volver al menú.");
                }

                chat.doctoresDisponibles = resDoctores.recordset;
                chat.estado = 'AGENDAR_DOCTOR';
                sesionesConversacion.set(msg.from, chat);

                const listaDoctores = resDoctores.recordset.map((d, i) => `${i+1}️⃣ Dr(a). ${d.Apellidos} ${d.Nombres}`).join('\n');
                return await msg.reply(`👨‍⚕️ *SELECCIONE SU DOCTOR:*\n\n${listaDoctores}${navFooter}`);
            } else {
                return await msg.reply("⚠️ Día no válido. Seleccione un número de la lista:");
            }
        }

        // ✅ FIX: Nuevo estado para selección de doctor
        if (chat.estado === 'AGENDAR_DOCTOR') {
            const idx = parseInt(texto) - 1;
            const doctores = chat.doctoresDisponibles || [];
            if (doctores[idx]) {
                chat.idDoctorSeleccionado = doctores[idx].ID_Usuario;
                chat.nombreDoctor = `Dr(a). ${doctores[idx].Apellidos} ${doctores[idx].Nombres}`;
                
                const libres = await obtenerHorariosLibres(pool, chat.id_clinica_seleccionada, chat.fechaSeleccionada, chat.idDoctorSeleccionado);
                if (libres.length === 0) {
                    return await msg.reply(`⚠️ ${chat.nombreDoctor} no tiene horarios disponibles ese día. Escriba *0* para elegir otra fecha.`);
                }

                chat.estado = 'AGENDAR_HORA'; chat.horariosLibres = libres;
                sesionesConversacion.set(msg.from, chat);
                return await msg.reply(`🕒 *HORARIOS DISPONIBLES - ${chat.nombreDoctor}:*\n\n${libres.join(' | ')}\n\nEscriba la hora (ej: 10:30):` + navFooter);
            } else {
                return await msg.reply("⚠️ Opción no válida. Elija un número de la lista de doctores:");
            }
        }

        if (chat.estado === 'AGENDAR_HORA') {
            const horaIngresada = texto.includes(':') ? texto : `${texto}:00`;
            if (chat.horariosLibres.includes(horaIngresada)) {
                // ✅ FIX: Usar el ID_Doctor real seleccionado por el paciente
                await pool.request().input('idP', chat.idPacienteRegistrado).input('idC', chat.id_clinica_seleccionada)
                    .input('idDoc', sql.Int, chat.idDoctorSeleccionado)
                    .input('f', chat.fechaSeleccionada).input('h', `${horaIngresada}:00`)
                    .query(`INSERT INTO Citas (ID_Paciente, ID_Doctor, ID_Clinica, Fecha_Cita, Hora_Inicio, Hora_Fin, Estado, Asunto, Fecha_Registro) 
                            VALUES (@idP, @idDoc, @idC, @f, CAST(@h AS TIME), DATEADD(MINUTE, 30, CAST(@h AS TIME)), 'Pendiente', 'WhatsApp', GETDATE())`);
                
                await msg.reply(`✅ *CITA RESERVADA*\n📍 Sede: ${chat.nombre_clinica}\n👨‍⚕️ ${chat.nombreDoctor}\n📅 ${chat.fechaLabel}\n🕒 ${horaIngresada}\n\nEnviando ubicación...`);
                await client.sendMessage(msg.from, new Location(chat.lat || CLINICA_LAT_DEF, chat.lng || CLINICA_LNG_DEF, chat.nombre_clinica, "MedicinaEcuador Pro"));
                chat.estado = 'MENU'; sesionesConversacion.set(msg.from, chat);
                return;
            } else {
                return await msg.reply(`⚠️ Hora no disponible o formato incorrecto. Elija una de la lista (ej: ${chat.horariosLibres[0] || '10:00'}):`);
            }
        }

        if (chat.estado === 'CHECK_CITA_DNI') {
            const dniLimpio = textoOriginal.replace(/\D/g, '');
            if (dniLimpio.length < 10) return await msg.reply("⚠️ Ingrese una cédula válida para consultar:");
            
            const resCitas = await pool.request().input('dni', dniLimpio)
                .query(`
                    SELECT c.Fecha_Cita, LEFT(CAST(c.Hora_Inicio AS VARCHAR), 5) as Hora, cl.Nombre_Clinica, c.Estado
                    FROM Citas c 
                    INNER JOIN Pacientes p ON c.ID_Paciente = p.ID_Paciente 
                    INNER JOIN CLINICAS cl ON c.ID_Clinica = cl.ID_Clinica
                    WHERE p.DNI = @dni 
                      AND c.Estado IN ('Pendiente', 'Confirmada') 
                      -- 👇 FILTRO DE FECHA AÑADIDO: Solo citas de hoy en adelante
                      AND CAST(c.Fecha_Cita AS DATE) >= CAST(GETDATE() AS DATE) 
                    ORDER BY c.Fecha_Cita ASC, c.Hora_Inicio ASC
                `);

            chat.estado = 'MENU'; sesionesConversacion.set(msg.from, chat);
            
            if (resCitas.recordset.length > 0) {
                let r = `🔍 *CITAS PRÓXIMAS ENCONTRADAS:*`;
                resCitas.recordset.forEach((cita, index) => {
                    // Formateamos la fecha para que sea legible (YYYY-MM-DD)
                    const fechaLimpia = cita.Fecha_Cita.toISOString().split('T')[0];
                    r += `\n\n📌 *${index+1}. ${cita.Nombre_Clinica}*\n📅 ${fechaLimpia}\n🕒 ${cita.Hora}\n✅ Estado: ${cita.Estado}`;
                });
                return await msg.reply(r + navFooter);
            }
            return await msg.reply("❌ No tiene citas próximas programadas." + navFooter);
        }

        if (chat.estado === 'MENU') {
            switch (texto) {
                case "1": return await msg.reply("🕒 *HORARIOS:*\n\n☀️ Lun-Vie: 09:00 - 17:30\n🌤️ Sáb: 09:00 - 15:30" + navFooter);
                case "2":
                    const prest = await pool.request().query("SELECT Nombre_Prestacion FROM PRESTACIONES WHERE Activo = 1 ORDER BY Nombre_Prestacion ASC");
                    return await msg.reply(`🦷 *ESPECIALIDADES:*\n\n${prest.recordset.map(r => '• ' + r.Nombre_Prestacion).join('\n')}${navFooter}`);
                case "3":
                    const resC = await pool.request().query("SELECT Ciudad FROM CLINICAS WHERE Activo = 1");
                    chat.estado = 'SELECCIONAR_CLINICA'; sesionesConversacion.set(msg.from, chat);
                    return await msg.reply(`🏥 *SELECCIONE CIUDAD:*\n\n${resC.recordset.map((c,i) => `${i+1}️⃣ ${c.Ciudad}`).join('\n')}`);
                case "4": 
                    chat.estado = 'CHECK_CITA_DNI'; sesionesConversacion.set(msg.from, chat);
                    return await msg.reply("🔍 Ingrese su número de cédula:");
                
                case "5":
                    const sedes = await pool.request().query("SELECT Nombre_Clinica, Direccion, Latitud, Longitud FROM CLINICAS WHERE Activo = 1");
                    let txtUbicaciones = "📍 *NUESTRAS SEDES:*\n";
                    for (const s of sedes.recordset) {
                        txtUbicaciones += `\n🏥 *${s.Nombre_Clinica}*\n🗺️ ${s.Direccion || 'Dirección no especificada'}\n`;
                        await client.sendMessage(msg.from, new Location(
                            s.Latitud || CLINICA_LAT_DEF, 
                            s.Longitud || CLINICA_LNG_DEF, 
                            s.Nombre_Clinica, 
                            s.Direccion || 'MedicinaEcuador Pro'
                        ));
                    }
                    return await client.sendMessage(msg.from, txtUbicaciones + navFooter);

                case "6":
                    if (chat.id_rol === 1 || chat.id_rol === 3) {
                        const hoy = new Date().toISOString().split('T')[0];
                        const esAdmin = chat.id_rol === 1;
                        const resCitas = await pool.request()
                            .input('fecha', sql.Date, hoy)
                            .input('cli', chat.id_clinica_seleccionada)
                            .query(`SELECT CAST(Hora_Inicio AS VARCHAR(5)) as Hora, P.Nombres, P.Apellidos FROM Citas C 
                                    INNER JOIN Pacientes P ON C.ID_Paciente = P.ID_Paciente 
                                    WHERE C.Fecha_Cita = @fecha AND C.Estado != 'Cancelada' 
                                    ${esAdmin ? '' : 'AND C.ID_Clinica = @cli'}
                                    ORDER BY C.Hora_Inicio ASC`);
                        let lista = resCitas.recordset.length > 0 ? `📋 *AGENDA DE HOY${esAdmin ? ' (GLOBAL)' : ''}:*\n\n${resCitas.recordset.map(c => `🕒 ${c.Hora} - ${c.Nombres} ${c.Apellidos}`).join('\n')}` : "📭 Sin citas hoy.";
                        return await msg.reply(lista + navFooter);
                    }
                    break;

               case "7":
                    if (chat.id_rol === 1 || chat.id_rol === 3) {
                        const esAdmin = chat.id_rol === 1;
                        const resCaja = await pool.request()
                            .input('cli', chat.id_clinica_seleccionada)
                            .query(`SELECT C.Nombre_Clinica, ISNULL(SUM(P.Monto), 0) as Total, COUNT(P.ID_Pago) as Transacciones 
                                    FROM PAGOS P
                                    INNER JOIN CLINICAS C ON P.ID_Clinica = C.ID_Clinica
                                    WHERE CAST(P.Fecha_Pago AS DATE) = CAST(GETDATE() AS DATE) 
                                    ${esAdmin ? '' : 'AND P.ID_Clinica = @cli'}
                                    GROUP BY C.Nombre_Clinica`);
                        
                        let resumen = `💰 *RESUMEN DE CAJA (HOY)*${esAdmin ? ' [GLOBAL]' : ''}\n\n`;
                        let totalGlobal = 0;
                        let transaccionesGlobal = 0;

                        if (resCaja.recordset.length > 0) {
                            resCaja.recordset.forEach(row => {
                                resumen += `🏥 *${row.Nombre_Clinica}*\n💵 Ingresos: $${row.Total.toFixed(2)}\n🧾 Transacciones: ${row.Transacciones}\n\n`;
                                totalGlobal += row.Total;
                                transaccionesGlobal += row.Transacciones;
                            });
                            if (esAdmin && resCaja.recordset.length > 1) {
                                resumen += `📊 *TOTAL GLOBAL*\n💵 Ingresos: $${totalGlobal.toFixed(2)}\n🧾 Cantidad: ${transaccionesGlobal}`;
                            }
                        } else {
                            resumen += "📭 No hay ingresos registrados hoy.";
                        }
                        return await msg.reply(resumen + navFooter);
                    }
                    break;

                case "8":
    if (chat.id_rol === 1 || chat.id_rol === 3) {
        const esAdmin = chat.id_rol === 1;
        
        // Ejecutamos SOLO el recordatorio de deudas de forma manual
        const deudores = await pool.request()
            .input('cli', chat.id_clinica_seleccionada)
            .query(`SELECT P.Telefono, P.Nombres, T.Saldo_Pendiente 
                    FROM Pacientes P 
                    INNER JOIN TRATAMIENTOS_PLAN T ON P.ID_Paciente = T.ID_Paciente 
                    WHERE T.Saldo_Pendiente > 0 AND P.Activo = 1
                    ${esAdmin ? '' : 'AND P.ID_Clinica = @cli'}`);

        for (const d of deudores.recordset) {
             await enviarMensaje(d.Telefono, `👋 Hola ${d.Nombres}, le saludamos de *MedicinaEcuador Pro*. Le recordamos que mantiene un saldo pendiente de *$${d.Saldo_Pendiente.toFixed(2)}*. Favor acercarse a regularizar su cuenta.`);
             await delay(2500);
        }

        return await msg.reply(`✅ *COBROS PROCESADOS*\n\nSe enviaron ${deudores.recordset.length} recordatorios de deuda.${navFooter}`);
    }
    break;

               case "9":
                    if (chat.id_rol === 1 || chat.id_rol === 3) {
                        // CAMBIO SUGERIDO: Limpiamos el objeto por completo por seguridad
                        const sesionLimpia = { 
                            estado: 'MENU', 
                            id_rol: 0, 
                            id_clinica_seleccionada: 1 
                        };
                        sesionesConversacion.set(msg.from, sesionLimpia);
                        return await msg.reply("🔐 *SESIÓN CERRADA*\n\nModo Doctor desactivado. Volviendo al menú de pacientes.");
                    }
                    break;

                default:
                    return await msg.reply("⚠️ Opción no válida. Escriba *Menu* o *0* para ver las opciones.");
            }
        }

    } catch (e) { 
        console.error("Error General:", e); 
        await msg.reply("⚠️ Error técnico. Escriba *0* para reiniciar."); 
    }
});

// --- FUNCIÓN DE ENVÍO ROBUSTA (Evita Error LID) ---
const enviarMensaje = async (numero, mensaje) => {
    try {
        if (!numero) return { success: false };
        let num = numero.replace(/\D/g, '');
        if (num.startsWith('0')) num = '593' + num.substring(1);
        if (!num.startsWith('593')) num = '593' + num;

        // Verificar si el contacto existe para obtener el ID real de WhatsApp
        const contactId = await client.getNumberId(num);
        if (contactId) {
            await client.sendMessage(contactId._serialized, mensaje);
            return { success: true };
        } else {
            console.log(`Contacto no encontrado: ${num}`);
            return { success: false };
        }
    } catch (f) { 
        console.error("Error al enviar WA:", f.message);
        return { success: false }; 
    }
};

// --- FUNCIÓN DE APOYO PARA FECHAS (Úsala cuando apruebes citas) ---
function normalizarFechaSQL(fechaDb) {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const dia = fechaDb.getUTCDate();
    const mes = meses[fechaDb.getUTCMonth()];
    const anio = fechaDb.getUTCFullYear();
    return `${dia} de ${mes} de ${anio}`;
}

const cron = require('node-cron');

// DISPARADOR AUTOMÁTICO: Todos los días a las 08:00 AM
cron.schedule('0 8 * * *', async () => {
    console.log("🤖 Ejecutando recordatorio automático de citas...");
    try {
        const pool = await getConnection();
        const mañana = new Date(); 
        mañana.setDate(mañana.getDate() + 1);
        const fBusqueda = mañana.toISOString().split('T')[0];

        const citas = await pool.request()
            .input('f', sql.Date, fBusqueda)
            .query(`SELECT P.Telefono, P.Nombres, LEFT(CAST(C.Hora_Inicio AS VARCHAR), 5) as Hora, CL.Nombre_Clinica 
                    FROM Citas C 
                    INNER JOIN Pacientes P ON C.ID_Paciente = P.ID_Paciente 
                    INNER JOIN CLINICAS CL ON C.ID_Clinica = CL.ID_Clinica
                    WHERE C.Fecha_Cita = @f AND C.Estado = 'Pendiente'`);

        for (const c of citas.recordset) {
            await enviarMensaje(c.Telefono, `🗓️ *RECORDATORIO*: Hola ${c.Nombres}, le recordamos su cita para mañana a las *${c.Hora}* en nuestra sede *${c.Nombre_Clinica}*. ¡Le esperamos!`);
            await delay(3000); // Pausa para seguridad de WhatsApp
        }
    } catch (err) {
        console.error("Error en Cron Citas:", err);
    }
});

// --- INICIALIZACIÓN ---
client.initialize();

module.exports = { enviarMensaje, normalizarFechaSQL };