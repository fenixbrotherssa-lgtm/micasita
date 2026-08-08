// ==========================================
// ARCHIVO: manual.js — Manual de Usuario integrado
// ==========================================
// Portado desde el manual standalone (artifact) que se armó con el equipo. A diferencia
// de esa versión, acá los íconos son las clases reales de Font Awesome que ya carga
// index.html (assets/vendor/fontawesome) — no hace falta embeber nada.

window.manualModule = {
    init: function() {
        renderTocManual();
        renderMainManual();
    }
};

function iconoManual(name, brand) {
    return '<i class="' + (brand ? 'fab' : 'fas') + ' fa-' + name + '"></i>';
}

// ============================================================
// Datos de cada módulo — mapeados directamente de views/*.html
// ============================================================
const MODULOS_MANUAL = [
    {
        id: 'login', file: 'login.html', icon: 'lock', color: '#64748b', role: 'all',
        title: 'Inicio de Sesión',
        purpose: 'Pantalla de acceso con usuario y contraseña. Cada rol (Administrador, Asistente, Médico) ve un sistema distinto a partir de aquí, según lo que tenga asignado.',
        steps: [
            'Ingresa tu <b>usuario</b> y <b>contraseña</b> (te los entrega el Administrador de la clínica).',
            'Presiona <b>Ingresar al Sistema</b>.',
            'Si tu cuenta está desactivada, el sistema no te deja entrar aunque la contraseña sea correcta — pide al Administrador que revise tu estado en <b>Personal</b>.'
        ],
        actions: [
            { icon: 'arrow-right', label: 'Ingresar al Sistema', desc: 'Valida usuario/contraseña y carga el Dashboard correspondiente a tu rol.' }
        ],
        sections: [],
        warnings: [
            'No compartas tu usuario con otro compañero — la trazabilidad de quién hizo cada cobro, cierre de caja o tratamiento depende de que cada quien entre con su propia cuenta.',
            'AMETRA OS no tiene "eliminar usuario", solo desactivar — si alguien deja la clínica, pide al Administrador que lo desactive en <b>Personal</b> en vez de reutilizar su cuenta.'
        ]
    },
    {
        id: 'dashboard', file: 'dashboard.html', icon: 'th-large', color: '#4f46e5', role: 'all',
        title: 'Dashboard',
        purpose: 'Pantalla de inicio tras el login: saludo, mini-indicadores (pacientes, pendientes) y el mapa de acceso a todos los demás módulos, organizado por área.',
        steps: [
            'Revisa los indicadores rápidos (pacientes, pendientes) apenas entras.',
            'Usa <b>Agenda Hoy</b> si solo necesitas ver las citas del día.',
            'Entra a cualquier tarjeta (Pacientes, Citas, Caja, etc.) para trabajar en ese módulo.',
            'Usa <b>Cerrar Sesión</b> al terminar tu turno, sobre todo en equipos compartidos por varios usuarios.'
        ],
        actions: [
            { icon: 'th-large', label: 'Dashboard', desc: 'Vuelve siempre a esta pantalla de inicio.' },
            { icon: 'calendar-check', label: 'Agenda Hoy', desc: 'Acceso directo a las citas del día.' },
            { icon: 'robot', label: 'Asistente IA', desc: 'Abre el chat flotante "Mini Doctor" para consultas rápidas.' },
            { icon: 'power-off', label: 'Cerrar Sesión', desc: 'Pide confirmación y termina la sesión actual.' }
        ],
        sections: [
            { t: 'Operaciones Clínicas', d: 'Pacientes, Citas Médicas, Inventario' },
            { t: 'Gestión Financiera', d: 'Caja, Facturación, Gastos*, Reportes KPI*, CRM*' },
            { t: 'Configuración de Sistema', d: 'Personal* y Sucursales* (*solo Administrador)' }
        ],
        note: 'Las tarjetas de módulos administrativos (Gastos, Reportes KPI, CRM, Personal, Sucursales) directamente no aparecen para Asistentes o Médicos — no es que estén bloqueadas, es que el propio Dashboard las quita de la pantalla según tu rol.',
        warnings: [
            'Si no ves un módulo que esperabas, primero revisa tu rol antes de reportarlo como error — es comportamiento esperado, no un bug.'
        ]
    },
    {
        id: 'pacientes', file: 'pacientes.html', icon: 'user-injured', color: '#3b82f6', role: 'all',
        title: 'Pacientes',
        purpose: 'El registro central de pacientes: alta completa con todos los datos que exige la normativa ecuatoriana de salud, búsqueda, edición, y la puerta de entrada a la Historia Clínica de cada uno.',
        steps: [
            'Antes de crear un paciente nuevo, <b>búscalo primero</b> por nombre o cédula — es más rápido que toparte con el rechazo por cédula duplicada al guardar.',
            'Si no existe, presiona <b>Nuevo Paciente</b> y completa como mínimo nombres, cédula y clínica asignada (son los únicos campos obligatorios).',
            'Completa también los datos MSP (etnia, provincia, cantón, parroquia) — se piden por normativa, aunque el sistema los deje pasar en blanco.',
            'Guarda, y haz clic en el paciente de la lista para entrar a su Historia Clínica.'
        ],
        actions: [
            { icon: 'plus', label: 'Nuevo Paciente', desc: 'Abre el formulario completo de registro.' },
            { icon: 'search', label: 'Buscar', desc: 'Filtra por nombre, apellido o cédula en tiempo real.' },
            { icon: 'file-invoice-dollar', label: 'Auditoría de Prestaciones', desc: 'Consulta un reporte de servicios facturados en un rango de fechas.' },
            { icon: 'pencil-alt', label: 'Editar', desc: 'Abre el registro de un paciente para corregirlo (botón "Editar" en la fila).' },
            { icon: 'trash', label: 'Borrar', desc: 'Elimina el registro del paciente (botón "Borrar" en la fila).' }
        ],
        sections: [
            { t: 'Datos personales', d: 'Nombres, apellidos, DNI, teléfono, género' },
            { t: 'Datos MSP Ecuador', d: 'Etnia, instrucción, provincia, cantón, parroquia' },
            { t: 'Datos clínicos base', d: 'Tipo sanguíneo, estado civil, ocupación, lugar de nacimiento' },
            { t: 'Contacto de emergencia', d: 'Nombre, teléfono y parentesco' }
        ],
        note: 'Al hacer clic en un paciente de la lista, se abre directo su Historia Clínica — desde ahí se llega al Odontograma, Tratamientos, Presupuestos y Pagos.',
        warnings: [
            'La <b>cédula (DNI) es única por clínica</b> — la base de datos bloquea de raíz un segundo registro con la misma cédula en la misma sede. Si intentas crear un duplicado, el sistema rechaza el guardado (aunque el mensaje que muestra es el error técnico de la base de datos, no un aviso amigable tipo "este paciente ya existe" — igual, no te va a dejar duplicarlo).',
            'Esa regla es <b>por sede</b>: la misma persona (misma cédula) sí puede existir como paciente en dos clínicas distintas del sistema, cada una con su propio expediente independiente — es el comportamiento esperado en una red multi-sede, no un error.',
            'No podrás borrar un paciente que tenga saldo pendiente en algún tratamiento — primero hay que cobrar o ajustar la deuda.',
            'Borrar un paciente no destruye nada: solo lo marca inactivo y desaparece de las listas. Su historial completo (citas, tratamientos, pagos, imágenes) queda intacto en la base de datos.'
        ]
    },
    {
        id: 'citas', file: 'citas.html', icon: 'calendar-alt', color: '#a855f7', role: 'all',
        title: 'Citas Médicas',
        purpose: 'Agenda de la clínica en dos vistas: una línea de tiempo por doctor para programar, y un tablero Kanban para seguir el recorrido real del paciente el día de su cita (llegó, en sillón, atendida).',
        steps: [
            'Ve a <b>Vista Cronológica</b>, elige el doctor y el horario libre.',
            'Presiona <b>AGENDAR</b>, busca al paciente y confirma — el sistema envía un recordatorio de WhatsApp automáticamente.',
            'El día de la cita, usa <b>Flujo Kanban</b> para mover la tarjeta del paciente: Por Confirmar → Confirmada → En Sala (cuando llega) → En Consulta → Atendida.'
        ],
        actions: [
            { icon: 'plus', label: 'AGENDAR', desc: 'Abre el formulario para programar una nueva cita y notificar al paciente. Incluye buscador de paciente por nombre o cédula.' },
            { icon: 'search', label: 'Buscar paciente', desc: 'Filtra la agenda por nombre.' },
            { icon: 'clock', label: 'Vista Cronológica', desc: 'Tabla por día y por doctor, con horarios libres para reservar.' },
            { icon: 'columns', label: 'Flujo Kanban', desc: 'Tablero de arrastrar y soltar con el estado en vivo de cada cita del día.' }
        ],
        sections: [
            { t: 'Por Confirmar', d: 'Cita agendada, pendiente de confirmación' },
            { t: 'Confirmada', d: 'El paciente confirmó su asistencia' },
            { t: 'En Sala', d: 'El paciente llegó y espera' },
            { t: 'En Consulta', d: 'Está siendo atendido' },
            { t: 'Atendida', d: 'Cita finalizada' }
        ],
        warnings: [
            'El sistema bloquea el doble-agendamiento del <b>mismo doctor</b> en un horario ya ocupado — pero <b>no</b> avisa si dos doctores distintos quedan agendados en el mismo sillón/consultorio. Coordina eso a ojo si comparten espacio físico.',
            'El recordatorio de WhatsApp puede fallar en silencio (bot desconectado, número inválido, paciente sin teléfono registrado) — la cita se guarda igual, sin ningún aviso de que el mensaje no llegó. No asumas que el paciente fue notificado solo porque la cita se creó bien.',
            'Mover una tarjeta en el Kanban no tiene restricciones de orden — se puede saltar de "Por Confirmar" directo a "Atendida" sin pasar por los estados intermedios. Muévela con cuidado.'
        ]
    },
    {
        id: 'historia_clinica', file: 'historiaclinica.html', icon: 'notes-medical', color: '#0ea5e9', role: 'all',
        title: 'Historia Clínica',
        purpose: 'El expediente completo de un paciente: antecedentes médicos, signos vitales y examen estomatognático (formato MSP-033), planes de tratamiento y saldo, recetas, galería de imágenes clínicas, y consentimientos informados (MSP-024). Desde aquí se accede a Odontograma, Presupuestos y Pagos.',
        steps: [
            'Al abrir la ficha, revisa primero <b>Alertas Médicas y Anamnesis</b> antes de cualquier procedimiento (alergias, condiciones relevantes).',
            'Completa <b>Signos Vitales</b> y <b>Examen Estomatognático MSP-033</b> en la primera consulta del paciente.',
            'Para diagnosticar, ve al accesorio directo <b>Odontograma</b> — desde ahí, no desde aquí, se marcan los hallazgos por pieza.',
            'Sube fotos/radiografías con <b>Subir Imagen</b> en cada control — quedan fechadas automáticamente para poder compararlas después.',
            'Para comparar evolución, abre dos imágenes de fechas distintas en la <b>Galería Clínica</b> y usa el control deslizante — sirve para mostrarle al paciente el antes/después de un tratamiento, o para documentar el progreso de una condición.',
            'Emite recetas con <b>Nueva Receta</b> cuando el paciente necesite medicación.'
        ],
        actions: [
            { icon: 'print', label: 'Imprimir Historia Completa', desc: 'Genera el expediente completo en formato imprimible.' },
            { icon: 'plus', label: 'Nueva Receta', desc: 'Registra medicamentos, indicaciones y próxima cita.' },
            { icon: 'plus', label: 'Subir Imagen', desc: 'Añade fotos o radiografías a la galería clínica del paciente.' },
            { icon: 'file-signature', label: 'Consentimientos MSP-024', desc: 'Historial de consentimientos firmados por tratamiento.' }
        ],
        sections: [
            { t: 'Alertas Médicas y Anamnesis', d: 'Antecedentes relevantes del paciente' },
            { t: 'Signos Vitales MSP-033', d: 'Formato oficial de signos vitales' },
            { t: 'Examen Estomatognático MSP-033', d: '9 regiones: labios, mejillas, maxilares, lengua, paladar, piso, carrillos, glándulas' },
            { t: 'Planes de Tratamiento y Cuenta', d: 'Estado financiero de los tratamientos del paciente' },
            { t: 'Galería Clínica y Comparador', d: 'Fotos/RX con control deslizante de comparación antes/después' }
        ],
        note: 'Los accesos rápidos del costado (Odontograma, Recetas, Presupuestos, Imágenes, Historial de Pagos) son la forma normal de moverse entre las herramientas de un mismo paciente sin perder el contexto.',
        warnings: [
            'El formulario <b>MSP-033</b> (signos vitales y examen estomatognático) no es un capricho del sistema: es el formato de Historia Clínica Única que el Ministerio de Salud Pública del Ecuador exige a todo establecimiento de salud, público o privado, que atienda pacientes odontológicos. Llenarlo no es opcional — es lo que respalda a la clínica ante una auditoría o inspección del MSP.',
            'Por la misma razón, <b>ningún dato clínico de un paciente se puede eliminar</b>: ni antecedentes, ni odontograma, ni tratamientos, ni consentimientos. El historial médico está protegido por normativa de salud (respaldo legal ante reclamos del paciente y ante el propio MSP) — por eso "eliminar paciente" en AMETRA OS solo desactiva su ficha de las listas, nunca borra su historia.',
            'La firma del <b>consentimiento informado MSP-024</b> ocurre al planificar un tratamiento (módulo Tratamientos), no aquí — pero es igual de obligatoria por ley antes de cualquier procedimiento: revisa el módulo Tratamientos para el detalle.'
        ]
    },
    {
        id: 'odontograma', file: 'odontograma.html', icon: 'tooth', color: '#0d9488', role: 'all',
        title: 'Odontograma',
        purpose: 'El mapa dental interactivo: marca hallazgos (caries, fracturas, ausencias) y procedimientos por pieza y por cara, con vista 2D y un visor clínico 3D. Cada hallazgo activo se puede exportar directo a Tratamiento o Presupuesto.',
        steps: [
            'Elige la herramienta de la barra superior (Caries, Resina, Corona, etc.) y haz clic en la cara de la pieza afectada.',
            'Repite por cada pieza/cara que necesites marcar en la consulta.',
            'Presiona <b>Guardar Cambios Clínicos</b> — sin esto, nada de lo marcado queda registrado.',
            'Si aparece la sección <b>Sugerencias por Pieza</b>, revísala: son los hallazgos activos listos para convertirse en tratamiento.',
            'Asigna el procedimiento del catálogo real a cada sugerencia (el sistema propone uno automáticamente, pero puedes cambiarlo) y presiona <b>Enviar a Tratamiento</b> o <b>Enviar a Presupuesto</b> según corresponda.'
        ],
        actions: [
            { icon: 'file-medical', label: 'Exportar a Tratamiento', desc: 'Calcula sugerencias de tratamiento a partir de los hallazgos activos.' },
            { icon: 'print', label: 'Imprimir', desc: 'Genera el reporte del odontograma completo.' },
            { icon: 'save', label: 'Guardar Cambios Clínicos', desc: 'Guarda todos los hallazgos marcados en esta sesión.' },
            { icon: 'eraser', label: 'Limpiar', desc: 'Borra el hallazgo de la pieza/cara seleccionada.' },
            { icon: 'file-invoice-dollar', label: 'Enviar a Presupuesto', desc: 'Manda las sugerencias detectadas a un presupuesto para el paciente.' },
            { icon: 'notes-medical', label: 'Enviar a Tratamiento', desc: 'Manda las sugerencias detectadas directo a planificación de tratamiento.' }
        ],
        sections: [],
        odoLegend: [
            { c: '#ef4444', t: 'Caries / Fractura / Periodontitis' },
            { c: '#3b82f6', t: 'Resina' },
            { c: '#e0f2fe', t: 'Carilla de Resina' },
            { c: '#f59e0b', t: 'Corona' },
            { c: '#10b981', t: 'Prótesis' },
            { c: '#a855f7', t: 'Endodoncia' },
            { c: '#22d3ee', t: 'Sellante' },
            { c: '#6366f1', t: 'Brackets (Ortodoncia)' },
            { c: '#1e293b', t: 'Ausente' },
            { c: '#7c2d12', t: 'Raíz' },
            { c: '#000000', t: 'Extraer' }
        ],
        note: 'La sección "Sugerencias por Pieza" solo aparece cuando hay hallazgos activos sin tratamiento asignado — es el puente directo entre diagnosticar y planificar, sin tener que volver a escribir nada a mano.',
        warnings: [
            'Siempre exporta desde <b>Sugerencias por Pieza</b> en vez de crear el tratamiento a mano en el módulo Tratamientos cuando el procedimiento viene de un diagnóstico — así el odontograma queda sincronizado solo, y esa pieza no te va a seguir apareciendo como "pendiente" cada vez que entres.',
            'Si mandas una sugerencia a Presupuesto y luego el presupuesto se aprueba, también queda reflejado en el odontograma — pero si mandas algo a Tratamiento sin asignar médico, el sistema no te deja guardar hasta que lo completes.'
        ]
    },
    {
        id: 'tratamientos', file: 'tratamientos.html', icon: 'file-medical', color: '#4f46e5', role: 'all',
        title: 'Tratamientos',
        purpose: 'Planificación y seguimiento financiero de los procedimientos de un paciente: historial de tratamientos con su saldo, presupuestos pendientes de aprobar, y el catálogo de servicios con sus precios.',
        steps: [
            'Presiona <b>Planificar Tratamientos</b> (o llega aquí desde "Sugerencias por Pieza" del Odontograma, o desde "Aprobar" un Presupuesto).',
            'Por cada procedimiento: elige médico, servicio del catálogo, pieza/caras y descuento si aplica.',
            'Busca y selecciona el <b>diagnóstico CIE-10</b> correspondiente.',
            'Explica el procedimiento al paciente, y hazlo firmar el <b>consentimiento informado MSP-024</b> en el recuadro de firma — es obligatorio, el sistema no deja guardar sin firma.',
            'Si el paciente es menor de edad o no apto para firmar, marca la casilla de representante legal y completa sus datos.',
            'Si el paciente no está físicamente frente al computador (o prefiere firmar en su propio celular), presiona <b>Enviar a Firma (Celular)</b>: se abre la app móvil de AMETRA OS en la pantalla de Firmador de quien la tenga instalada y con sesión iniciada en esa clínica, y la firma que haga ahí llena este mismo recuadro automáticamente, sin recargar nada.',
            'Guarda — el sistema imprime el MSP-024 si lo necesitas en papel.'
        ],
        actions: [
            { icon: 'plus-circle', label: 'Planificar Tratamientos', desc: 'Abre el modal completo: elige médico, servicio, pieza/caras, descuento, diagnóstico CIE-10, firma del consentimiento MSP-024.' },
            { icon: 'plus', label: 'Nuevo Servicio', desc: 'Agrega una prestación nueva al catálogo (con su precio).' },
            { icon: 'mobile-alt', label: 'Enviar a Firma (Celular)', desc: 'Manda el consentimiento a firmar desde el celular en vez del recuadro del computador — la firma vuelve sola al mismo lugar.' }
        ],
        sections: [
            { t: 'Historial de Procedimientos', d: 'Fecha, procedimiento, pieza, costo, saldo, estado' },
            { t: 'Presupuestos Pendientes', d: 'Cotizaciones a la espera de aprobación' },
            { t: 'Catálogo de Servicios', d: 'Lista de precios de la clínica' }
        ],
        note: 'Estados de un tratamiento: Pendiente (rojo), En Proceso (ámbar), Completado (verde).',
        warnings: [
            'El consentimiento <b>MSP-024</b> no es un trámite interno del software: es el formato exigido por la normativa ecuatoriana de derechos del paciente — todo procedimiento debe quedar respaldado por consentimiento informado, firmado por el paciente o su representante legal. Por eso el sistema bloquea guardar el tratamiento si falta la firma.',
            'No se puede eliminar un tratamiento que ya tiene abonos/pagos registrados — el sistema lo bloquea a propósito. Si necesitas corregirlo, ajusta desde Pagos, no intentes borrar el tratamiento.',
            'Si eliminas un plan de tratamiento que sí se pudo borrar (sin pagos), el odontograma vuelve a mostrar el hallazgo original como pendiente — es intencional, para que el sistema siempre refleje la realidad.',
            'Un ítem sin médico asignado no se puede guardar — usa el lápiz de edición en la tabla del lote para completarlo antes de firmar el consentimiento.',
            '<b>Enviar a Firma (Celular)</b> necesita que tanto el computador como el celular estén conectados a internet en ese momento (viaja por el mismo servidor en tiempo real) — no es una opción para trabajar sin señal. Si el celular no tiene la app instalada o no inició sesión en la misma clínica, la solicitud no le va a llegar.'
        ]
    },
    {
        id: 'pagos', file: 'pagos.html', icon: 'cash-register', color: '#059669', role: 'all',
        title: 'Pagos',
        purpose: 'Registro de abonos sobre un plan de tratamiento específico, con comprobante/voucher adjunto opcional, y el historial de todas las transacciones de ese paciente.',
        steps: [
            'Elige el tratamiento a abonar (los pendientes de ese paciente aparecen en el selector).',
            'Ingresa el monto y el método de pago (efectivo, transferencia, tarjeta).',
            'Si fue transferencia o tarjeta, adjunta el voucher como respaldo.',
            'Presiona <b>Confirmar Pago</b> — el saldo del tratamiento se actualiza al instante y queda en el historial de transacciones.'
        ],
        actions: [
            { icon: 'check', label: 'Confirmar Pago', desc: 'Registra el abono contra el tratamiento seleccionado.' },
            { icon: 'image', label: 'Voucher / Comprobante', desc: 'Adjunta una foto del comprobante de pago (opcional).' }
        ],
        sections: [
            { t: 'Registrar Nuevo Pago', d: 'Tratamiento, monto, método, referencia' },
            { t: 'Historial de Transacciones', d: 'Fecha, tratamiento, monto, método' }
        ],
        warnings: [
            'No hagas doble clic en "Confirmar Pago" — el sistema detecta y rechaza un pago idéntico repetido en pocos segundos (posible doble clic), pero evita el hábito igual.',
            'Cada pago se vincula al turno de Caja abierto de quien lo cobra — cada cajero tiene su propio turno, y su cierre solo actualiza (nunca duplica) ese mismo turno cuando se cierra o se reabre.'
        ]
    },
    {
        id: 'caja', file: 'caja.html', icon: 'cash-register', color: '#10b981', role: 'all',
        title: 'Caja y Cierres',
        purpose: 'El arqueo de caja diario: compara lo que el sistema dice que se cobró (efectivo, transferencias, tarjeta) contra el conteo físico real de billetes y comprobantes, y calcula la diferencia.',
        steps: [
            'Al final del turno, revisa el <b>Reporte del Sistema</b> (lo que AMETRA OS registró como cobrado).',
            'Cuenta el efectivo físico billete por billete en el <b>Desglose Físico</b>, y suma vouchers de transferencia/tarjeta.',
            'Revisa el resultado del cuadre (sobrante, faltante o exacto) antes de cerrar.',
            'Presiona <b>Registrar Arqueo y Cerrar Turno</b> — esto sella el registro para ese usuario y ese día.'
        ],
        actions: [
            { icon: 'lock', label: 'Registrar Arqueo y Cerrar Turno', desc: 'Sella el cierre de caja del turno con el desglose físico ingresado.' }
        ],
        sections: [
            { t: 'Reporte del Sistema', d: 'Totales que el sistema registró: efectivo, transferencias, tarjeta, vouchers' },
            { t: 'Desglose Físico', d: 'Conteo billete por billete, vouchers manuales, notas, y el resultado del cuadre' }
        ],
        warnings: [
            'El sistema <b>no bloquea</b> el cierre si el conteo físico no cuadra con el sistema — se puede cerrar igual con faltante o sobrante; solo queda marcado en rojo/verde para que el Administrador lo revise después. Cuadrar bien es responsabilidad de quien cierra, no una validación automática.',
            'Cada cajero tiene su propio turno de caja — si dos personas cierran caja el mismo día, cada quien cierra el suyo sin mezclarse con el del otro.',
            'Si un cierre se hizo mal (te faltó terminar de contar, te equivocaste en un monto, etc.), la <b>reapertura de caja</b> requiere la contraseña de un Administrador activo de esa sede. Al reabrir, el turno vuelve al estado <b>ABIERTA</b> — puedes volver a contar y cerrar de nuevo cuantas veces haga falta, sin perder el vínculo de los pagos de ese turno.',
            'Al reabrir, los montos que ya habías contado (efectivo real, transferencia real, tarjeta real) se limpian para que hagas el recuento de cero — no queda un borrador de lo anterior.'
        ]
    },
    {
        id: 'facturacion', file: 'facturacion.html', icon: 'file-invoice-dollar', color: '#4f46e5', role: 'all',
        title: 'Facturación',
        purpose: 'Comprobantes electrónicos ante el SRI: facturas, notas de crédito y recibos de consultorio. Administra también la firma electrónica (.p12) de la clínica.',
        steps: [
            'La primera vez, sube el certificado de firma electrónica en <b>Gestionar Firmas .p12</b> (sin esto no se puede facturar nada).',
            'Para cobrar a un paciente, usa <b>Factura Manual</b>, revisa bien sus datos (cédula, nombre) y el detalle de los montos.',
            'Autoriza el comprobante ante el SRI — este paso firma digitalmente y envía el documento.',
            'Usa <b>Consultar Estado SRI</b> para confirmar que quedó autorizado.',
            '<b>Imprimir Último Recibo</b> reimprime el comprobante ya emitido si el paciente lo necesita de nuevo.'
        ],
        actions: [
            { icon: 'file-invoice-dollar', label: 'Factura Manual', desc: 'Emite una factura electrónica manual para un paciente.' },
            { icon: 'key', label: 'Gestionar Firmas .p12', desc: 'Sube o reemplaza el certificado de firma electrónica de la clínica.' },
            { icon: 'receipt', label: 'Imprimir Último Recibo', desc: 'Reimprime el último comprobante emitido.' },
            { icon: 'sync-alt', label: 'Consultar Estado SRI', desc: 'Verifica si el SRI autorizó el comprobante.' }
        ],
        sections: [
            { t: 'Firma Activa', d: 'Estado del certificado electrónico vigente' },
            { t: 'Historial de Comprobantes', d: 'Filtrable por Facturas / Notas de Crédito / Recibos' }
        ],
        warnings: [
            'Revisa los datos del paciente y los montos <b>antes</b> de autorizar ante el SRI — una vez autorizado, el comprobante no se puede editar ni eliminar desde el sistema.',
            'Subir un certificado .p12 nuevo desactiva automáticamente el anterior — no se pueden tener dos firmas activas a la vez.',
            'El sistema no revisa si el certificado está vencido antes de usarlo — si expiró, el SRI lo va a rechazar recién en ese momento. Revisa la fecha de vencimiento de tu firma cada cierto tiempo.',
            'Si los datos tributarios de la sede (RUC, régimen RIMPE, contribuyente especial) están incompletos en Sucursales, la factura se genera igual pero con esos campos en blanco — puede ser inválida ante el SRI. Complétalos antes de facturar desde una sede nueva.'
        ]
    },
    {
        id: 'inventario', file: 'inventario.html', icon: 'box-open', color: '#22d3ee', role: 'all',
        title: 'Inventario',
        purpose: 'Control de activos fijos (equipo/mobiliario) e insumos consumibles de la clínica, con alerta cuando un insumo está por agotarse.',
        steps: [
            'Elige la pestaña correcta: <b>Activos Fijos</b> para equipo/mobiliario, <b>Insumos</b> para consumibles.',
            'Al registrar un insumo nuevo, define bien la <b>cantidad</b> y el <b>stock mínimo</b> — de eso depende la alerta de reposición.',
            'Cuando se consume o se asigna a un doctor, el stock baja automáticamente.',
            'Descarga el <b>Reporte PDF</b> cuando necesites el inventario actual por escrito.'
        ],
        actions: [
            { icon: 'file-pdf', label: 'Reporte PDF', desc: 'Descarga el inventario actual en PDF — visible para todos los roles.' },
            { icon: 'plus', label: 'Nuevo Ingreso', desc: 'Registra un activo o insumo nuevo.' },
            { icon: 'couch', label: 'Activos Fijos', desc: 'Pestaña de equipo y mobiliario.' },
            { icon: 'box-open', label: 'Insumos', desc: 'Pestaña de consumibles con stock mínimo.' }
        ],
        sections: [],
        note: '"Nuevo Ingreso" y el aviso de "Alertas Críticas" de stock bajo solo se muestran al Administrador. Asistentes y Médicos pueden ver el inventario y descargar el PDF, pero no registrar ni editar movimientos.',
        warnings: [
            'El stock <b>no puede quedar negativo</b> — el sistema bloquea la salida o asignación si no hay suficiente cantidad disponible ("Stock insuficiente").',
            'Al registrar un ítem, el sistema <b>no exige</b> completar todos los campos — revisa bien nombre, precio y cantidad antes de guardar, porque no te va a avisar si algo quedó vacío.',
            'Borrar un ítem pide clave de Administrador y nunca es un borrado real: el ítem se desactiva, pero su historial de movimientos queda intacto para siempre.'
        ]
    },
    {
        id: 'gastos', file: 'gastos.html', icon: 'file-invoice-dollar', color: '#ef4444', role: 'admin',
        title: 'Ingresos y Gastos',
        purpose: 'El panel financiero completo de la clínica: producción, recaudación real, egresos, cartera pendiente, auditoría de movimientos por sede, y el historial de todos los cierres de caja ya sellados.',
        steps: [
            'Registra egresos del día a día con <b>Nuevo Movimiento</b>, usando los <b>Rubros</b> (categorías) que definas.',
            'Antes de cerrar un período, confirma que <b>todos los cajeros ya hicieron su arqueo de Caja</b> — el sistema no te va a dejar avanzar si queda alguno abierto.',
            'Revisa los 5 indicadores y la auditoría de movimientos del período.',
            'Presiona <b>Ejecutar Cierre</b> para sellar el período — a partir de ahí, ningún gasto de esas fechas se puede registrar ni borrar.',
            'Usa <b>Imprimir PDF Reporte</b> para dejar constancia física del cierre.'
        ],
        actions: [
            { icon: 'tags', label: 'Rubros', desc: 'Administra las categorías de gasto.' },
            { icon: 'plus-circle', label: 'Nuevo Movimiento', desc: 'Registra un egreso o ingreso administrativo.' },
            { icon: 'lock', label: 'Ejecutar Cierre', desc: 'Sella el período financiero seleccionado.' },
            { icon: 'print', label: 'Imprimir PDF Reporte', desc: 'Genera el reporte financiero del período.' }
        ],
        sections: [
            { t: 'Producción / Recaudación / Egresos', d: '5 tarjetas de métrica principal' },
            { t: 'Auditoría de Movimientos', d: 'Todos los movimientos financieros del período' },
            { t: 'Arqueos / Cajeros', d: 'Quién cerró caja y cuándo' },
            { t: 'Top Deudores', d: 'Pacientes con mayor saldo pendiente' },
            { t: 'Historial de Cierres', d: 'Cierres de caja ya sellados' }
        ],
        warnings: [
            '<b>Ejecutar Cierre está bloqueado</b> si queda algún turno de Caja en estado "Abierta" dentro del período — el sistema avisa exactamente cuántos turnos faltan cerrar y no permite continuar hasta que todos los cajeros hagan su arqueo. Este es el único bloqueo realmente duro de todo el módulo financiero.',
            'Un <b>Cierre Financiero es permanente</b>: no existe función para reabrirlo, editarlo ni borrarlo — ni el registro del cierre ni los movimientos que quedaron dentro de ese período se pueden tocar después. A diferencia de Caja (que sí tiene "Reabrir"), aquí no hay marcha atrás — revisa todo con calma antes de ejecutar el cierre.',
            'Una vez cerrado el período, no se puede registrar ni eliminar ningún gasto con fecha dentro de ese rango — si olvidaste algo, quedará fuera del cierre para siempre.',
            'Eliminar un gasto individual (antes de que su período se cierre) exige clave de autorización de un Administrador.'
        ]
    },
    {
        id: 'kpi', file: 'kpi.html', icon: 'chart-line', color: '#f59e0b', role: 'admin',
        title: 'Reportes KPI',
        purpose: 'Inteligencia de negocio: indicadores clave de la clínica (ingresos, efectividad de citas, cancelaciones, ticket promedio), gráficos de tendencia, ranking de doctores y servicios más rentables.',
        steps: [
            'Elige el rango de fechas y, si administras varias sedes, la clínica a analizar.',
            'Presiona <b>Actualizar</b> para recalcular las métricas de ese período.',
            'Revisa el ranking de doctores y servicios más rentables para decisiones de negocio.',
            'Usa <b>Reporte Detallado</b> cuando necesites imprimir o compartir el informe completo.'
        ],
        actions: [
            { icon: 'sync-alt', label: 'Actualizar', desc: 'Recalcula las métricas para el rango de fechas elegido.' },
            { icon: 'print', label: 'Reporte Detallado', desc: 'Genera el informe ultra-detallado imprimible.' }
        ],
        sections: [
            { t: '8 métricas clave', d: 'Ingresos, gastos, balance, ticket promedio, efectividad de citas, cancelación, cartera, pacientes nuevos' },
            { t: 'Tendencia Ingresos vs Gastos', d: 'Gráfico comparativo' },
            { t: 'Ranking de Doctores', d: 'Producción por médico' },
            { t: 'Top Servicios Rentables', d: 'Los procedimientos que más generan' }
        ]
    },
    {
        id: 'crm', file: 'crm.html', icon: 'heart', color: '#db2777', role: 'admin',
        title: 'CRM & Marketing',
        purpose: 'Retención y marketing de pacientes: recurrencia, canal de origen, demografía, cumpleaños automáticos, patologías más frecuentes por zona (CIE-10), y un armador de campañas dirigidas por WhatsApp o correo.',
        steps: [
            'Revisa los indicadores (recurrencia, valor de vida, cumpleaños de hoy) para entender el estado general de tu cartera de pacientes.',
            'Para una campaña, usa <b>Buscar Segmento</b> con los filtros que necesites (VIP, inactivos hace X meses, saldo pendiente, etc.) o <b>Todos los Pacientes</b> si es masiva.',
            'Elige una plantilla de mensaje y el canal (WhatsApp, Correo o Ambos).',
            'Presiona <b>Enviar Campaña</b> y espera — el envío es progresivo, no instantáneo, para no bloquear el número del bot.'
        ],
        actions: [
            { icon: 'file-pdf', label: 'Generar Reporte', desc: 'Exporta el informe completo de CRM.' },
            { icon: 'filter', label: 'Buscar Segmento', desc: 'Filtra pacientes por VIP, recurrencia, cumpleaños, inactividad, edad o saldo pendiente.' },
            { icon: 'users', label: 'Todos los Pacientes', desc: 'Selecciona la base completa para una campaña.' },
            { icon: 'paper-plane', label: 'Enviar Campaña', desc: 'Envía la plantilla elegida por WhatsApp, correo o ambos, al segmento seleccionado.' }
        ],
        sections: [
            { t: '5 indicadores clave', d: 'Pacientes activos, nuevos del mes, recurrencia, valor de vida, cumpleaños de hoy' },
            { t: 'Canal de Origen y Demografía', d: 'Género, rango de edad, cantones con más pacientes' },
            { t: 'Retención por Médico', d: 'Qué doctor retiene mejor a sus pacientes' },
            { t: 'Patologías por Zona', d: 'Basado en diagnóstico CIE-10' },
            { t: 'Campañas Dirigidas', d: 'Plantillas de descuento, "te extrañamos" y novedades' }
        ],
        warnings: [
            'El sistema manda un mensaje de WhatsApp <b>cada 3 segundos, a propósito</b> — es para que el número del bot no quede bloqueado por WhatsApp por envío masivo. Mientras más grande el segmento, más tarda la campaña completa; no la interrumpas pensando que se colgó.',
            'No hay un límite de tamaño de segmento — se puede mandar a toda la base de pacientes de una, siempre respetando ese ritmo de 3 segundos entre mensajes.',
            'Si un número falla (paciente sin WhatsApp válido, etc.) esa campaña <b>no se detiene</b>: sigue con el resto y al final te dice cuántos fallaron.',
            'El progreso en vivo de una campaña ("enviando X de Y") desaparece 10 minutos después de terminar — si cierras la pestaña y vuelves mucho después, ya no vas a poder consultar ese resumen ahí (aunque los mensajes ya se hayan mandado).'
        ]
    },
    {
        id: 'usuarios', file: 'usuarios.html', icon: 'user-md', color: '#0891b2', role: 'admin',
        title: 'Personal',
        purpose: 'Gestión de las cuentas del personal: alta de usuarios, asignación de rol y sede, y activación o desactivación de acceso al sistema.',
        steps: [
            'Presiona <b>Nuevo Usuario</b> y completa cédula, nombres, usuario y contraseña.',
            'Si es un médico, ingresa su <b>Registro Sanitario / MSP</b> — aparece impreso en recetas y consentimientos.',
            'Asigna el <b>Rol de Acceso</b> correcto (Administrador, Asistente o Médico) y la sede.',
            'Guarda. Si alguien deja la clínica, edítalo y desmarca <b>Activo</b> en vez de intentar borrarlo.'
        ],
        actions: [
            { icon: 'plus-circle', label: 'Nuevo Usuario', desc: 'Crea una cuenta con cédula, registro sanitario/MSP, usuario y contraseña.' },
            { icon: 'save', label: 'Guardar Usuario', desc: 'Confirma los datos y el rol asignado.' }
        ],
        sections: [
            { t: 'Roles disponibles', d: 'Administrador Global · Asistente Administrativo · Médico/Especialista' },
            { t: 'Estado de cuenta', d: 'Activo/Inactivo, para revocar acceso sin borrar el historial del usuario' }
        ],
        warnings: [
            'AMETRA OS <b>no tiene función para eliminar un usuario</b> — solo se puede desactivar. Es intencional: todo lo que ese usuario hizo (tratamientos, cierres de caja, citas) debe seguir siendo rastreable.',
            'Cédula y nombre de usuario deben ser únicos en <b>todo el sistema</b>, no solo en tu sede — si el registro rechaza un dato como duplicado, probablemente ya existe en otra clínica del mismo sistema.',
            'Desactivar a un doctor no revisa si tiene citas o tratamientos pendientes asignados — revisa eso a mano antes de desactivarlo, para no dejar pacientes con un médico responsable inactivo.'
        ]
    },
    {
        id: 'sucursales', file: 'sucursales.html', icon: 'clinic-medical', color: '#06b6d4', role: 'admin',
        title: 'Sucursales',
        purpose: 'Administración de las sedes/clínicas: datos tributarios SRI (RUC, régimen RIMPE, contribuyente especial), ubicación GPS, logo, especialidades y horarios de atención, y el estado/reconexión del bot de WhatsApp de cada sede.',
        steps: [
            'Para dar de alta una sede nueva, contacta a soporte de CasRodSoft — pide una clave maestra y responder preguntas de seguridad, no es autoservicio (medida de seguridad a propósito).',
            'Completa los datos tributarios SRI (RUC, régimen RIMPE, contribuyente especial) antes de que esa sede empiece a facturar.',
            'Marca las <b>Especialidades</b> que ofrece esa sede (Ortodoncia, Endodoncia, etc.); si falta una en la lista, escríbela en el campo de abajo y presiona <b>Agregar</b> — queda disponible para todas las sedes desde ese momento.',
            'Completa los <b>Horarios de Atención</b> día por día (hora de apertura/cierre, o marca "Cerrado" en los días que no atiende) — esto es lo que el bot de WhatsApp le contesta a los pacientes que preguntan por horarios.',
            'Usa <b>Capturar Ubicación</b> para que el bot de WhatsApp pueda compartir la dirección exacta a los pacientes que la pidan.',
            'Si el bot se desconecta (punto gris/rojo), usa <b>Reiniciar Bot</b> — evita tener que pedir soporte remoto para algo tan rutinario.'
        ],
        actions: [
            { icon: 'plus', label: 'Nueva Sucursal', desc: 'Registra una sede nueva con sus datos tributarios.' },
            { icon: 'plus', label: 'Agregar (Especialidad)', desc: 'Suma una especialidad nueva al catálogo compartido entre todas las sedes y la marca en la que estás editando.' },
            { icon: 'rotate-right', label: 'Reiniciar Bot', desc: 'Reinicia el bot de WhatsApp de esa sede sin necesidad de soporte remoto.' },
            { icon: 'crosshairs', label: 'Capturar Ubicación', desc: 'Guarda las coordenadas GPS que el bot comparte a los pacientes.' }
        ],
        sections: [
            { t: 'Datos Tributarios SRI', d: 'RUC, régimen RIMPE, contribuyente especial, obligado a llevar contabilidad' },
            { t: 'Especialidades', d: 'Catálogo compartido entre sedes; cada sede marca las que ofrece — esto es lo que el bot responde en su opción "Especialidades"' },
            { t: 'Horarios de Atención', d: 'Grilla de lunes a domingo con apertura/cierre o "Cerrado" por sede — lo que el bot responde en su opción "Horarios"' },
            { t: 'Bot de WhatsApp', d: 'Estado de conexión (verde/amarillo/rojo) y emparejamiento por código QR' }
        ],
        warnings: [
            'Crear una sede nueva pide una clave maestra de CasRodSoft Development y preguntas de seguridad — es intencional, para que nadie dé de alta una sede sin autorización del proveedor.',
            'El sistema <b>no bloquea</b> guardar una sede con los datos tributarios SRI incompletos — pero si facturas desde ahí, esos campos van a salir en blanco o "NO" en el comprobante, lo cual puede ser inválido ante el SRI. Complétalos siempre antes del primer cobro.',
            'Si no configuras Especialidades u Horarios, el bot de WhatsApp le contesta al paciente que esa sede "aún no configuró" esa información — no se queda mudo, pero tampoco inventa nada.',
            '<b>Especialidades</b> (qué trata la clínica: Ortodoncia, Endodoncia...) y <b>Servicios</b> (el catálogo de precios de Tratamientos) son cosas distintas en el menú del bot — no confundirlas al explicarle al paciente por teléfono.',
            'El bot de WhatsApp de cada sede: envía recordatorios de citas al agendar/reagendar/confirmar, saludos de cumpleaños automáticos (vía CRM), y las campañas de marketing dirigidas — todo con una pausa de 3 segundos entre mensajes para no bloquearse. Si el bot está desconectado, todos esos envíos fallan en silencio (la cita o el registro igual se guarda en el sistema).',
            'Reiniciar el bot puede requerir volver a escanear el código QR — asegúrate de tener el celular de la clínica a mano antes de reiniciarlo.'
        ]
    }
];

const GRUPOS_MANUAL = [
    { label: 'Inicio', ids: ['login', 'dashboard'] },
    { label: 'Operaciones Clínicas', ids: ['pacientes', 'citas', 'historia_clinica', 'odontograma', 'tratamientos', 'pagos'] },
    { label: 'Gestión Financiera', ids: ['caja', 'facturacion', 'inventario', 'gastos', 'kpi', 'crm'] },
    { label: 'Configuración', ids: ['usuarios', 'sucursales'] }
];

function moduloManualPorId(id) { return MODULOS_MANUAL.filter(m => m.id === id)[0]; }

function textoBusquedaModulo(m) {
    const partes = [m.title, m.purpose, m.note || ''];
    (m.steps || []).forEach(s => partes.push(s));
    (m.actions || []).forEach(a => partes.push(a.label, a.desc));
    (m.sections || []).forEach(s => partes.push(s.t, s.d));
    (m.warnings || []).forEach(w => partes.push(w));
    return partes.join(' ').replace(/<[^>]+>/g, '').toLowerCase();
}

function modulosQueCoinciden(query) {
    if (!query) return MODULOS_MANUAL;
    const q = query.toLowerCase();
    return MODULOS_MANUAL.filter(m => textoBusquedaModulo(m).indexOf(q) !== -1);
}

function renderTocManual(visibleIds) {
    const cont = document.getElementById('manual-toc-groups');
    if (!cont) return;
    let html = '';
    let hayAlgo = false;
    GRUPOS_MANUAL.forEach(g => {
        const idsAqui = g.ids.filter(id => !visibleIds || visibleIds.indexOf(id) !== -1);
        if (!idsAqui.length) return;
        hayAlgo = true;
        html += `<div class="manual-toc-group"><div class="manual-toc-label">${g.label}</div>`;
        idsAqui.forEach(id => {
            const m = moduloManualPorId(id);
            if (!m) return;
            html += `<a href="#modulo-${m.id}" onclick="event.preventDefault(); window.manualScrollA('${m.id}')">${iconoManual(m.icon)}<span>${m.title}</span>${m.role === 'admin' ? '<span class="manual-chip-admin">ADMIN</span>' : ''}</a>`;
        });
        html += '</div>';
    });
    cont.innerHTML = html;
    const vacio = document.getElementById('manual-toc-empty');
    if (vacio) vacio.style.display = hayAlgo ? 'none' : 'block';
}

function renderPasosManual(steps) {
    if (!steps || !steps.length) return '';
    const items = steps.map(s => `<li>${s}</li>`).join('');
    return `<h4 class="manual-block-label">Cómo se usa, paso a paso</h4><ol class="manual-steps">${items}</ol>`;
}

function renderAdvertenciasManual(warnings) {
    if (!warnings || !warnings.length) return '';
    const items = warnings.map(w => `<li>${iconoManual('exclamation-circle')}<span>${w}</span></li>`).join('');
    return `<div class="manual-warn-box"><div class="manual-warn-title">${iconoManual('exclamation-circle')} Qué NO hacer / errores comunes</div><ul class="manual-warn-list">${items}</ul></div>`;
}

function renderAccionesManual(actions) {
    if (!actions || !actions.length) return '';
    const rows = actions.map(a => `<tr><td class="manual-cell-icon"><span class="manual-icon-badge">${iconoManual(a.icon)}</span></td><td class="manual-cell-label">${a.label}</td><td class="manual-cell-desc">${a.desc}</td></tr>`).join('');
    return `<h4 class="manual-block-label">Qué puedes hacer aquí</h4><table class="manual-action-table"><tbody>${rows}</tbody></table>`;
}

function renderSeccionesManual(sections) {
    if (!sections || !sections.length) return '';
    const cards = sections.map(s => `<div class="manual-subsection-card"><div class="t">${s.t}</div><div class="d">${s.d}</div></div>`).join('');
    return `<h4 class="manual-block-label">Secciones</h4><div class="manual-subsections">${cards}</div>`;
}

function renderOdoLegendManual(items) {
    if (!items || !items.length) return '';
    const chips = items.map(i => `<div class="manual-odo-item"><span class="manual-odo-swatch" style="background:${i.c}"></span>${i.t}</div>`).join('');
    return `<h4 class="manual-block-label">Paleta clínica del odontograma</h4><div class="manual-odo-legend">${chips}</div>`;
}

function renderModuloManual(m) {
    const roleChip = m.role === 'admin'
        ? `<span class="manual-role-chip admin">${iconoManual('shield-alt')} Solo Administrador</span>`
        : `<span class="manual-role-chip all">${iconoManual('users')} Todos los roles</span>`;
    const note = m.note ? `<div class="manual-note">${iconoManual('info-circle')}<div><b>Nota: </b>${m.note}</div></div>` : '';

    return `<section class="manual-module" id="modulo-${m.id}">
        <div class="manual-mod-head">
            <div class="manual-mod-icon" style="background:${m.color}22; color:${m.color}">${iconoManual(m.icon)}</div>
            <div class="manual-mod-titlewrap">
                <div class="manual-mod-eyebrow"><span class="manual-mod-file">${m.file}</span>${roleChip}</div>
                <h2 class="manual-mod-title">${m.title}</h2>
                <p class="manual-mod-purpose">${m.purpose}</p>
            </div>
        </div>
        ${note}
        ${renderPasosManual(m.steps)}
        ${renderAccionesManual(m.actions)}
        ${renderOdoLegendManual(m.odoLegend)}
        ${renderSeccionesManual(m.sections)}
        ${renderAdvertenciasManual(m.warnings)}
    </section>`;
}

function renderMainManual(mods) {
    const cont = document.getElementById('manual-main');
    if (!cont) return;
    cont.innerHTML = (mods || MODULOS_MANUAL).map(renderModuloManual).join('');
}

window.manualFiltrar = function(query) {
    const q = (query || '').trim();
    const mods = modulosQueCoinciden(q);
    renderTocManual(q ? mods.map(m => m.id) : null);
    renderMainManual(mods);
};

// Navegación suave dentro del contenedor scrolleable de la vista (no todo el body)
window.manualScrollA = function(id) {
    setTimeout(() => {
        const el = document.getElementById('modulo-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 10);
};
