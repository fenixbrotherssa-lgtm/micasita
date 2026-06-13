const { getConnection, sql } = require('../config/db');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');

const inventarioController = {

    // ══════════════════════════════════════════════════════════════════════
    // 1. LISTAR INVENTARIO: Filtrado por sede, tipo y estado activo
    // ══════════════════════════════════════════════════════════════════════
    getInventario: async (req, res) => {
        const { id_clinica, tipo } = req.query;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_cli', sql.Int, (id_clinica && id_clinica !== 'undefined') ? id_clinica : null)
                .input('tipo', sql.VarChar, tipo)
                .query(`
                    SELECT 
                        I.*,
                        (U.Nombres + ' ' + U.Apellidos) AS RegistradoPor,
                        C.Nombre_Clinica,
                        C.Ciudad
                    FROM Inventario I
                    JOIN Usuarios U ON I.ID_Usuario_Registro = U.ID_Usuario
                    JOIN Clinicas C ON I.ID_Clinica = C.ID_Clinica
                    WHERE (I.ID_Clinica = @id_cli OR @id_cli IS NULL)
                      AND I.Tipo = @tipo
                      AND I.Activo = 1
                    ORDER BY I.Fecha_Registro DESC
                `);
            res.json(result.recordset);
        } catch (error) {
            console.error('❌ Error en getInventario:', error);
            res.status(500).json({ status: 'Error', message: error.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 2. GUARDAR / EDITAR ÍTEM: Registro y actualización con auditoría
    //    Al editar, la cantidad se SUMA (reposición), no sobreescribe.
    //    Al agregar nuevas unidades, recalcula el pool de porciones si ya
    //    tiene Porciones_Por_Unidad configurado.
    // ══════════════════════════════════════════════════════════════════════
    guardarItem: async (req, res) => {
        const {
            id_item, id_clinica, id_usuario, tipo, nombre,
            precio, cantidad, factura, fecha, stock_minimo
        } = req.body;

        try {
            const pool = await getConnection();
            const request = pool.request()
                .input('cli',  sql.Int,           id_clinica)
                .input('user', sql.Int,            id_usuario)
                .input('tipo', sql.VarChar,        tipo)
                .input('nom',  sql.NVarChar,       nombre)
                .input('pre',  sql.Decimal(18, 2), precio)
                .input('cant', sql.Int,            cantidad)
                .input('fac',  sql.NVarChar,       factura || null)
                .input('fec',  sql.Date,           fecha || null)
                .input('min',  sql.Int,            stock_minimo || 5);

            if (id_item) {
                // Reposición: suma cantidad y recalcula porciones disponibles
                await request.input('id', sql.Int, id_item)
                    .query(`
                        UPDATE Inventario SET
                            Nombre                    = @nom,
                            Precio_Unitario           = @pre,
                            Cantidad                  = Cantidad + @cant,
                            Numero_Factura            = @fac,
                            Fecha_Compra              = @fec,
                            Stock_Minimo              = @min,
                            Ultima_Actualizacion      = GETDATE(),
                            ID_Usuario_Ultimo_Movimiento = @user,
                            -- Si ya tiene porciones configuradas, suma las nuevas al pool
                            Porciones_Disponibles     = ISNULL(Porciones_Disponibles, 0)
                                + (@cant * ISNULL(Porciones_Por_Unidad, 0))
                        WHERE ID_Item = @id AND ID_Clinica = @cli
                    `);
            } else {
                await request.query(`
                    INSERT INTO Inventario
                    (ID_Clinica, ID_Usuario_Registro, Tipo, Nombre, Precio_Unitario, Cantidad,
                     Numero_Factura, Fecha_Compra, Stock_Minimo, Fecha_Registro, Activo,
                     Porciones_Por_Unidad, Porciones_Disponibles)
                    VALUES
                    (@cli, @user, @tipo, @nom, @pre, @cant,
                     @fac, @fec, @min, GETDATE(), 1,
                     1, 0)
                `);
            }
            res.json({ status: 'Success', message: 'Inventario actualizado correctamente' });
        } catch (error) {
            console.error('❌ Error en guardarItem:', error);
            res.status(500).json({ status: 'Error', message: error.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 3. REGISTRAR SALIDA / CONSUMO GENERAL (descuenta stock sin trazabilidad
    //    por doctor — para salidas rápidas no vinculadas a un profesional)
    // ══════════════════════════════════════════════════════════════════════
    registrarSalida: async (req, res) => {
        const { id_item, cantidad_salida, motivo, id_usuario } = req.body;
        const pool = await getConnection();
        const tr   = new sql.Transaction(pool);

        try {
            await tr.begin();

            const result = await tr.request()
                .input('id',   sql.Int, id_item)
                .input('cant', sql.Int, cantidad_salida)
                .input('user', sql.Int, id_usuario)
                .query(`
                    UPDATE Inventario
                    SET Cantidad                     = Cantidad - @cant,
                        Ultima_Actualizacion         = GETDATE(),
                        ID_Usuario_Ultimo_Movimiento = @user
                    WHERE ID_Item = @id AND Cantidad >= @cant;
                    SELECT @@ROWCOUNT AS afectados;
                `);

            if (result.recordset[0].afectados === 0) {
                await tr.rollback();
                return res.status(400).json({
                    status: 'Error',
                    message: 'Stock insuficiente o el producto no existe.'
                });
            }

            // Registrar en movimientos para trazabilidad
            const itemInfo = await tr.request()
                .input('id', sql.Int, id_item)
                .query('SELECT ID_Clinica FROM Inventario WHERE ID_Item = @id');

            await tr.request()
                .input('id_item',  sql.Int,     id_item)
                .input('id_cli',   sql.Int,     itemInfo.recordset[0].ID_Clinica)
                .input('id_usu',   sql.Int,     id_usuario)
                .input('cant',     sql.Int,     cantidad_salida)
                .input('motivo',   sql.NVarChar, motivo || 'Salida general')
                .query(`
                    INSERT INTO Inventario_Movimientos
                    (ID_Item, ID_Clinica, ID_Usuario, Tipo_Movimiento, Cantidad_Unidades, Motivo)
                    VALUES (@id_item, @id_cli, @id_usu, 'SALIDA_GENERAL', @cant, @motivo)
                `);

            await tr.commit();
            res.json({ status: 'Success', message: `Salida registrada: ${motivo}` });
        } catch (error) {
            await tr.rollback();
            console.error('❌ Error en registrarSalida:', error);
            res.status(500).json({ status: 'Error', message: error.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 4. ELIMINAR: Baja lógica con validación de clave de administrador
    // ══════════════════════════════════════════════════════════════════════
    eliminarItem: async (req, res) => {
        const { id } = req.params;
        const { password, id_clinica, id_usuario_admin } = req.body;

        try {
            const pool = await getConnection();

            const admins = await pool.request()
                .input('id_c', sql.Int, id_clinica)
                .query(`
                    SELECT Password_Hash
                    FROM Usuarios
                    WHERE ID_Rol = 1 AND ID_Clinica = @id_c AND Activo = 1
                `);

            let autorizado = false;
            for (const admin of admins.recordset) {
                if (await bcrypt.compare(password, admin.Password_Hash)) {
                    autorizado = true;
                    break;
                }
            }

            if (!autorizado) {
                return res.json({
                    status: 'Error',
                    message: 'Clave de administrador incorrecta o no tiene permisos en esta sede.'
                });
            }

            const result = await pool.request()
                .input('id',      sql.Int, id)
                .input('u_admin', sql.Int, id_usuario_admin)
                .query(`
                    UPDATE Inventario
                    SET Activo                       = 0,
                        Ultima_Actualizacion         = GETDATE(),
                        ID_Usuario_Ultimo_Movimiento = @u_admin
                    WHERE ID_Item = @id
                `);

            if (result.rowsAffected[0] > 0) {
                res.json({ status: 'Success', message: 'Ítem inhabilitado y auditado por administración.' });
            } else {
                res.status(404).json({ status: 'Error', message: 'El ítem no existe.' });
            }
        } catch (error) {
            console.error('❌ Error en eliminarItem:', error);
            res.status(500).json({ status: 'Error', message: error.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 5. REPORTE PDF: Diseño institucional
    // ══════════════════════════════════════════════════════════════════════
    generarReportePDF: async (req, res) => {
        const { id_clinica, tipo } = req.query;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_cli', sql.Int,     id_clinica)
                .input('tipo',   sql.VarChar,  tipo)
                .query(`
                    SELECT I.*, C.Nombre_Clinica, C.Ciudad
                    FROM Inventario I
                    JOIN Clinicas C ON I.ID_Clinica = C.ID_Clinica
                    WHERE I.ID_Clinica = @id_cli AND I.Tipo = @tipo AND I.Activo = 1
                `);

            const datos = result.recordset;
            if (datos.length === 0) return res.status(404).send('No hay datos para esta sede/tipo');

            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Reporte_${tipo}.pdf`);
            doc.pipe(res);

            doc.rect(0, 0, 600, 75).fill('#1e293b');
            doc.fillColor('#ffffff').fontSize(20).text('REPORTE DE INVENTARIO', 30, 25);
            doc.fontSize(10).text(`${tipo} - ${datos[0].Nombre_Clinica}`, 30, 50);

            const tableTop = 110;
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
            doc.text('PRODUCTO / ACTIVO', 35, tableTop);
            doc.text('CANT.', 300, tableTop);
            doc.text('PORCIONES', 355, tableTop);
            doc.text('VALOR UNIT.', 430, tableTop);
            doc.text('SUBTOTAL', 510, tableTop);
            doc.moveTo(30, tableTop + 15).lineTo(560, tableTop + 15).stroke();

            let y = tableTop + 25;
            let totalAcumulado = 0;

            doc.font('Helvetica').fontSize(9);
            datos.forEach(item => {
                const sub = (item.Cantidad || 0) * (item.Precio_Unitario || 0);
                totalAcumulado += sub;
                doc.text(item.Nombre.toUpperCase(), 35, y, { width: 255 });
                doc.text((item.Cantidad || 0).toString(), 300, y);
                doc.text(
                    item.Porciones_Por_Unidad > 1
                        ? `${item.Porciones_Por_Unidad}/ud`
                        : '—',
                    355, y
                );
                doc.text(`$${(item.Precio_Unitario || 0).toFixed(2)}`, 430, y);
                doc.text(`$${sub.toFixed(2)}`, 510, y);
                y += 20;
                if (y > 750) { doc.addPage(); y = 50; }
            });

            doc.font('Helvetica-Bold').fontSize(11)
               .text(`INVERSIÓN TOTAL: $${totalAcumulado.toFixed(2)}`, 360, y + 20);
            doc.end();
        } catch (error) {
            console.error('❌ Error generando PDF:', error);
            res.status(500).send('Error interno al generar documento.');
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 6. CONFIGURAR PORCIONES POR UNIDAD (solo admin)
    //    Define cuántos usos rinde 1 unidad física de un insumo.
    //    Ejemplo: 1 frasco de resina = 15 aplicaciones.
    //    Recalcula el pool disponible sobre el stock actual.
    // ══════════════════════════════════════════════════════════════════════
    configurarPorciones: async (req, res) => {
        const { id_item, porciones_por_unidad } = req.body;
        if (!id_item || !porciones_por_unidad || porciones_por_unidad < 1) {
            return res.status(400).json({ status: 'Error', message: 'Datos inválidos.' });
        }
        try {
            const pool = await getConnection();
            await pool.request()
                .input('id',  sql.Int, id_item)
                .input('ppU', sql.Int, porciones_por_unidad)
                .query(`
                    UPDATE Inventario
                    SET Porciones_Por_Unidad  = @ppU,
                        Porciones_Disponibles = Cantidad * @ppU,
                        Ultima_Actualizacion  = GETDATE()
                    WHERE ID_Item = @id
                `);
            res.json({ status: 'Success', message: 'Porciones configuradas correctamente.' });
        } catch (e) {
            console.error('❌ configurarPorciones:', e);
            res.status(500).json({ status: 'Error', message: e.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 7. ASIGNAR STOCK A UN DOCTOR
    //    El admin descuenta unidades del inventario clínico y las transfiere
    //    al pool personal del doctor mediante un movimiento de ASIGNACION.
    // ══════════════════════════════════════════════════════════════════════
    asignarADoctor: async (req, res) => {
        const { id_item, id_usuario_destino, cantidad_unidades, motivo, id_usuario_admin } = req.body;
        if (!id_item || !id_usuario_destino || !cantidad_unidades || cantidad_unidades < 1) {
            return res.status(400).json({ status: 'Error', message: 'Datos inválidos.' });
        }
        const pool = await getConnection();
        const tr   = new sql.Transaction(pool);

        try {
            await tr.begin();

            const check = await tr.request()
                .input('id', sql.Int, id_item)
                .query(`
                    SELECT Cantidad, Porciones_Por_Unidad, Porciones_Disponibles,
                           ID_Clinica, Nombre
                    FROM Inventario WHERE ID_Item = @id
                `);
            const item = check.recordset[0];
            if (!item) throw new Error('Ítem no encontrado.');
            if (item.Cantidad < cantidad_unidades) {
                throw new Error(`Stock insuficiente. Disponible: ${item.Cantidad} unidades.`);
            }

            const ppU              = item.Porciones_Por_Unidad || 1;
            const porcionesAsig    = cantidad_unidades * ppU;

            // Descontar del inventario general
            await tr.request()
                .input('id',   sql.Int,           id_item)
                .input('cant', sql.Int,            cantidad_unidades)
                .input('porc', sql.Decimal(10, 2), porcionesAsig)
                .query(`
                    UPDATE Inventario
                    SET Cantidad              = Cantidad - @cant,
                        Porciones_Disponibles = ISNULL(Porciones_Disponibles, 0) - @porc,
                        Ultima_Actualizacion  = GETDATE()
                    WHERE ID_Item = @id
                `);

            // Registrar movimiento de asignación
            await tr.request()
                .input('id_item',   sql.Int,           id_item)
                .input('id_cli',    sql.Int,            item.ID_Clinica)
                .input('id_dest',   sql.Int,            id_usuario_destino)
                .input('cant',      sql.Int,            cantidad_unidades)
                .input('porciones', sql.Decimal(10, 2), porcionesAsig)
                .input('motivo',    sql.NVarChar,       motivo || `Asignación a doctor ID ${id_usuario_destino}`)
                .input('ref',       sql.NVarChar,       `ADMIN:${id_usuario_admin}`)
                .query(`
                    INSERT INTO Inventario_Movimientos
                    (ID_Item, ID_Clinica, ID_Usuario, Tipo_Movimiento,
                     Cantidad_Unidades, Porciones_Cantidad, Motivo, Referencia_Externa)
                    VALUES
                    (@id_item, @id_cli, @id_dest, 'ASIGNACION',
                     @cant, @porciones, @motivo, @ref)
                `);

            await tr.commit();
            res.json({
                status:              'Success',
                message:             `${cantidad_unidades} unidad(es) de "${item.Nombre}" asignadas. El doctor recibe ${porcionesAsig} porciones.`,
                porciones_asignadas: porcionesAsig
            });
        } catch (e) {
            await tr.rollback();
            console.error('❌ asignarADoctor:', e);
            res.status(500).json({ status: 'Error', message: e.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 8. REGISTRAR CONSUMO POR DOCTOR
    //    El doctor descuenta porciones de su pool personal.
    //    Valida que tenga saldo suficiente antes de permitir el consumo.
    //    Acepta fracciones (0.5, 1.5, etc.) para insumos que se usan parcialmente.
    // ══════════════════════════════════════════════════════════════════════
    registrarConsumo: async (req, res) => {
        const { id_item, porciones_usadas, id_usuario, id_paciente, motivo, referencia_externa } = req.body;
        if (!id_item || !porciones_usadas || porciones_usadas <= 0 || !id_usuario) {
            return res.status(400).json({ status: 'Error', message: 'Datos inválidos.' });
        }
        const pool = await getConnection();
        const tr   = new sql.Transaction(pool);

        try {
            await tr.begin();

            // Calcular saldo de porciones disponibles para este doctor en este ítem
            const saldoRes = await tr.request()
                .input('id_item', sql.Int, id_item)
                .input('id_usu',  sql.Int, id_usuario)
                .query(`
                    SELECT
                        ISNULL(SUM(CASE WHEN Tipo_Movimiento = 'ASIGNACION'    THEN Porciones_Cantidad ELSE 0 END), 0)
                      - ISNULL(SUM(CASE WHEN Tipo_Movimiento = 'CONSUMO'       THEN Porciones_Cantidad ELSE 0 END), 0)
                        AS Porciones_Disponibles,
                        I.Nombre,
                        I.ID_Clinica
                    FROM Inventario_Movimientos M
                    JOIN Inventario I ON I.ID_Item = M.ID_Item
                    WHERE M.ID_Item = @id_item AND M.ID_Usuario = @id_usu
                    GROUP BY I.Nombre, I.ID_Clinica
                `);

            const saldo = saldoRes.recordset[0];
            if (!saldo || saldo.Porciones_Disponibles < porciones_usadas) {
                const disponible = saldo ? parseFloat(saldo.Porciones_Disponibles) : 0;
                throw new Error(
                    `Porciones insuficientes. Disponible: ${disponible}. ` +
                    `Solicita reposición al administrador.`
                );
            }

            // Insertar consumo
            await tr.request()
                .input('id_item',   sql.Int,           id_item)
                .input('id_cli',    sql.Int,            saldo.ID_Clinica)
                .input('id_usu',    sql.Int,            id_usuario)
                .input('id_pac',    sql.Int,            id_paciente || null)
                .input('porciones', sql.Decimal(10, 2), porciones_usadas)
                .input('motivo',    sql.NVarChar,       motivo || 'Uso clínico')
                .input('ref',       sql.NVarChar,       referencia_externa || null)
                .query(`
                    INSERT INTO Inventario_Movimientos
                    (ID_Item, ID_Clinica, ID_Usuario, ID_Paciente, Tipo_Movimiento,
                     Porciones_Cantidad, Motivo, Referencia_Externa)
                    VALUES
                    (@id_item, @id_cli, @id_usu, @id_pac, 'CONSUMO',
                     @porciones, @motivo, @ref)
                `);

            await tr.commit();

            const restantes = parseFloat(saldo.Porciones_Disponibles) - parseFloat(porciones_usadas);
            res.json({
                status:              'Success',
                message:             `Consumo registrado: ${porciones_usadas} porción(es) de "${saldo.Nombre}".`,
                porciones_restantes: restantes
            });
        } catch (e) {
            await tr.rollback();
            console.error('❌ registrarConsumo:', e);
            res.status(500).json({ status: 'Error', message: e.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 9. STOCK DEL DOCTOR (vista personal por sesión)
    //    Devuelve todos los ítems asignados con saldo de porciones restantes.
    //    El doctor solo ve los productos donde tiene porciones disponibles > 0.
    // ══════════════════════════════════════════════════════════════════════
    getStockDoctor: async (req, res) => {
        const { id_usuario } = req.params;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_usu', sql.Int, id_usuario)
                .query(`
                    SELECT
                        I.ID_Item,
                        I.Nombre,
                        I.Porciones_Por_Unidad,
                        C.Nombre_Clinica,
                        -- Porciones disponibles = asignadas - consumidas
                        SUM(CASE WHEN M.Tipo_Movimiento = 'ASIGNACION' THEN M.Porciones_Cantidad ELSE 0 END)
                      - SUM(CASE WHEN M.Tipo_Movimiento = 'CONSUMO'    THEN M.Porciones_Cantidad ELSE 0 END)
                        AS Porciones_Disponibles,
                        SUM(CASE WHEN M.Tipo_Movimiento = 'ASIGNACION' THEN M.Porciones_Cantidad ELSE 0 END)
                        AS Porciones_Totales_Recibidas,
                        SUM(CASE WHEN M.Tipo_Movimiento = 'CONSUMO'    THEN M.Porciones_Cantidad ELSE 0 END)
                        AS Porciones_Consumidas,
                        MAX(M.Fecha_Movimiento) AS Ultimo_Movimiento
                    FROM Inventario_Movimientos M
                    JOIN Inventario I ON I.ID_Item = M.ID_Item
                    JOIN Clinicas   C ON C.ID_Clinica = M.ID_Clinica
                    WHERE M.ID_Usuario = @id_usu
                    GROUP BY I.ID_Item, I.Nombre, I.Porciones_Por_Unidad, C.Nombre_Clinica
                    HAVING
                        SUM(CASE WHEN M.Tipo_Movimiento = 'ASIGNACION' THEN M.Porciones_Cantidad ELSE 0 END)
                      - SUM(CASE WHEN M.Tipo_Movimiento = 'CONSUMO'    THEN M.Porciones_Cantidad ELSE 0 END)
                        > 0
                    ORDER BY Ultimo_Movimiento DESC
                `);
            res.json({ status: 'Success', data: result.recordset });
        } catch (e) {
            console.error('❌ getStockDoctor:', e);
            res.status(500).json({ status: 'Error', message: e.message });
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // 10. HISTORIAL DE MOVIMIENTOS POR ÍTEM (admin)
    //     Útil para auditoría: quién usó qué, cuándo y en qué paciente.
    // ══════════════════════════════════════════════════════════════════════
    getMovimientosItem: async (req, res) => {
        const { id_item } = req.params;
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id_item', sql.Int, id_item)
                .query(`
                    SELECT TOP 100
                        M.ID_Movimiento,
                        M.Tipo_Movimiento,
                        M.Cantidad_Unidades,
                        M.Porciones_Cantidad,
                        M.Motivo,
                        M.Fecha_Movimiento,
                        M.Referencia_Externa,
                        U.Nombres + ' ' + U.Apellidos  AS Nombre_Usuario,
                        U.ID_Rol,
                        P.Nombres + ' ' + P.Apellidos  AS Nombre_Paciente
                    FROM Inventario_Movimientos M
                    JOIN Usuarios U ON U.ID_Usuario = M.ID_Usuario
                    LEFT JOIN Pacientes P ON P.ID_Paciente = M.ID_Paciente
                    WHERE M.ID_Item = @id_item
                    ORDER BY M.Fecha_Movimiento DESC
                `);
            res.json({ status: 'Success', data: result.recordset });
        } catch (e) {
            console.error('❌ getMovimientosItem:', e);
            res.status(500).json({ status: 'Error', message: e.message });
        }
    }
};

module.exports = inventarioController;