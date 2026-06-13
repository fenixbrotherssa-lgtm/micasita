window.cajaModule = {
    datosSistema: { efec: 0, trans: 0, tarj: 0, total: 0, vouchers: [] },
    totalContadoGlobal: 0,

    init: async function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return;
        const sesion = JSON.parse(sesionRaw);

        const idClinica = sesion.id_clinica || sesion.ID_Clinica;
        const idUsuario = sesion.id_usuario || sesion.ID_Usuario;

        const fechaEl = document.getElementById('fecha-label');
        if(fechaEl) {
            fechaEl.innerText = new Date().toLocaleDateString('es-ES', { 
                weekday: 'long', day: 'numeric', month: 'long' 
            }).toUpperCase();
        }

        this.renderBilletes();

        try {
            const res = await window.api.get(`/caja/estado?id_usuario=${idUsuario}&id_clinica=${idClinica}`);
            
            if (res.status === "Success") {
                const estaCerradaManualmente = res.caja && (res.caja.Estado === 'CERRADA' || res.caja.estado === 'CERRADA');

                if (estaCerradaManualmente) {
                    this.mostrarPantallaCerrada(sesion, res.caja.ID_Caja);
                    return; 
                }

                this.datosSistema = {
                    efec: parseFloat(res.calculo_sistema?.Efectivo) || 0,
                    trans: parseFloat(res.calculo_sistema?.Transferencia) || 0,
                    tarj: parseFloat(res.calculo_sistema?.Tarjeta) || 0,
                    total: parseFloat(res.calculo_sistema?.Total_Sistema) || 0,
                    vouchers: res.vouchers || []
                };

                const inputIni = document.getElementById('input-inicial');
                if(inputIni) {
                    inputIni.value = res.caja ? (res.caja.Monto_Inicial || 0) : 0;
                }

                this.actualizarInterfazSistema();
                this.calcularDiferenciaGlobal();
            }
        } catch (err) {
            console.error("❌ Error cargando datos de caja:", err);
        }
    },

    mostrarPantallaCerrada: function(sesion, idCaja) {
        const container = document.querySelector('.caja-wrapper');
        if (!container) return;

        container.innerHTML = `
            <div class="caja-nav" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: white; border-bottom: 1px solid #e2e8f0;">
                <button class="btn-back" onclick="window.router.load('dashboard')" style="padding: 10px 20px; border-radius: 8px; cursor: pointer; border: 1px solid #cbd5e0; background: white;">
                    <i class="fas fa-arrow-left"></i> Volver al Inicio
                </button>
                <h2 style="margin:0; font-weight: 800; color: #1e293b; font-size: 1.2rem;">ESTADO DE CAJA</h2>
                <div style="color: #e53e3e; font-weight: 800;"><i class="fas fa-lock"></i> ARQUEO FINALIZADO</div>
            </div>

            <div style="display: flex; justify-content: center; align-items: center; min-height: 60vh; background: #f8fafc;">
                <div class="info-card" style="width: 100%; max-width: 480px; text-align: center; padding: 50px 30px; background: white; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border-top: 6px solid #1e293b;">
                    <div style="font-size: 4.5rem; margin-bottom: 25px;">✅</div>
                    <h2 style="color:#1e293b; font-weight: 800; margin-bottom: 15px;">Caja Cerrada</h2>
                    <p style="color:#64748b; font-weight: 600; line-height: 1.6; margin-bottom: 35px;">
                        El arqueo de este turno ya ha sido registrado satisfactoriamente.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        ${idCaja ? `
                            <button onclick="window.cajaModule.imprimirReporte(${idCaja})" 
                                    style="background: #1e293b; color: white; padding: 16px; border-radius: 12px; border: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fas fa-print"></i> REIMPRIMIR REPORTE DE CIERRE
                            </button>
                        ` : ''}

                        <button onclick="window.router.load('dashboard')" 
                                style="background: #f1f5f9; color: #475569; padding: 14px; border-radius: 12px; border: none; font-weight: 700; cursor: pointer;">
                            Ir al Panel Principal
                        </button>

                        <button onclick="window.cajaModule.solicitarReapertura()" 
                                style="margin-top: 10px; background: none; border: 1px dashed #e53e3e; color: #e53e3e; padding: 12px; border-radius: 12px; cursor: pointer; font-weight: 700; font-size: 0.85rem;">
                            <i class="fas fa-unlock"></i> REAPERTURA DE EMERGENCIA (AUTORIZADA)
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    solicitarReapertura: async function() {
        const { value: claveAdmin } = await Swal.fire({
            title: 'Autorización Requerida',
            text: "Ingrese la clave de administrador para reabrir la caja:",
            input: 'password',
            inputPlaceholder: 'Clave de acceso',
            showCancelButton: true,
            confirmButtonText: 'Autorizar',
            confirmButtonColor: '#1e293b'
        });

        if (claveAdmin) {
            const sesion = JSON.parse(localStorage.getItem('usuario_sesion'));
            try {
                const res = await window.api.post('/caja/reabrir', {
                    id_usuario_cajero: sesion.id_usuario || sesion.ID_Usuario,
                    id_clinica: sesion.id_clinica || sesion.ID_Clinica,
                    clave_admin: claveAdmin
                });

                if (res.status === "Success") {
                    await Swal.fire("Éxito", "Caja abierta nuevamente", "success");
                    window.router.load('caja'); 
                } else {
                    Swal.fire("Error", res.message || "No se pudo autorizar", "error");
                }
            } catch (err) {
                Swal.fire("Error", "Fallo de comunicación con el servidor", "error");
            }
        }
    },

    renderBilletes: function() {
        const container = document.getElementById('billetes-container');
        if (!container) return;
        const denominaciones = [100, 50, 20, 10, 5, 1, 0.50, 0.25, 0.10, 0.05, 0.01];
        container.innerHTML = denominaciones.map(den => `
            <div class="billete-item">
                <div class="billete-label">${den >= 1 ? 'BILLETE' : 'MONEDA'}</div>
                <div class="billete-input-group">
                    <span>$${den < 1 ? den.toFixed(2) : den}</span>
                    <input type="number" min="0" data-den="${den}" value="0" 
                        oninput="window.cajaModule.calcularDiferenciaGlobal()" 
                        onfocus="this.select()">
                </div>
                <div class="subtotal-billete" id="sub-${den.toString().replace('.', '-')}">$0.00</div>
            </div>
        `).join('');
    },

    calcularDiferenciaGlobal: function() {
        let sumaEfectivoFisico = 0;
        const inputsBilletes = document.querySelectorAll('#billetes-container input');
        
        inputsBilletes.forEach(input => {
            const den = parseFloat(input.dataset.den);
            const cant = parseInt(input.value) || 0;
            const sub = den * cant;
            sumaEfectivoFisico += sub;
            const elSub = document.getElementById(`sub-${input.dataset.den.toString().replace('.', '-')}`);
            if (elSub) elSub.innerText = `$${sub.toFixed(2)}`;
        });

        this.totalContadoGlobal = sumaEfectivoFisico;

        const transReal = parseFloat(document.getElementById('real-trans')?.value) || 0;
        const tarjReal = parseFloat(document.getElementById('real-tarjeta')?.value) || 0;
        const inicial = parseFloat(document.getElementById('input-inicial')?.value) || 0;

        const totalFisicoGlobal = sumaEfectivoFisico + transReal + tarjReal;
        const totalEsperadoGlobal = this.datosSistema.total + inicial;
        const diferenciaGlobal = totalFisicoGlobal - totalEsperadoGlobal;

        const displayFisico = document.getElementById('display-fisico');
        const elDif = document.getElementById('diferencia-total');
        const box = document.getElementById('cuadre-result-box');
        
        if (displayFisico) displayFisico.innerText = `$${totalFisicoGlobal.toFixed(2)}`;
        if (elDif) elDif.innerText = `$${diferenciaGlobal.toFixed(2)}`;

        if (box) {
            box.className = "cuadre-box";
            if (Math.abs(diferenciaGlobal) < 0.01) box.classList.add('cuadre-ok');
            else if (diferenciaGlobal < 0) box.classList.add('cuadre-error');
            else box.classList.add('cuadre-sobrante');
        }
    },

    actualizarInterfazSistema: function() {
        const ids = {
            'sis-efectivo': this.datosSistema.efec,
            'sis-trans': this.datosSistema.trans,
            'sis-tarjeta': this.datosSistema.tarj,
            'total-sistema': this.datosSistema.total
        };
        
        for (let id in ids) {
            const el = document.getElementById(id);
            if(el) el.innerText = `$${ids[id].toFixed(2)}`;
        }

        const cv = document.getElementById('lista-vouchers');
        if (!cv) return;

        if (this.datosSistema.vouchers && this.datosSistema.vouchers.length > 0) {
            cv.innerHTML = this.datosSistema.vouchers.map(v => `
                <div class="voucher-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #edf2f7;">
                    <div style="display:flex; flex-direction:column;">
                        <b style="font-size:0.75rem; color:#4a5568;">${v.Metodo_Pago ? v.Metodo_Pago.toUpperCase() : 'PAGO'}</b>
                        <span style="font-size:0.8rem; color:#718096;">Ref: ${v.Referencia_Bancaria || 'S/N'}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-weight:bold; color:#2d3748;">$${parseFloat(v.Monto).toFixed(2)}</span>
                        ${v.Ruta_Voucher_Img ? 
                            `<button onclick="window.cajaModule.verVoucher('${v.Ruta_Voucher_Img}')" 
                                     style="background:#edf2f7; border:1px solid #cbd5e0; border-radius:4px; padding:2px 6px; cursor:pointer;">👁️</button>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            cv.innerHTML = '<div style="text-align:center; color:#a0aec0; padding:20px; font-size:0.8rem;">Sin movimientos hoy</div>';
        }
    },

    verVoucher: function(ruta) {
        // Obtenemos la base eliminando /api para acceder a la carpeta pública
        const baseArchivos = window.api.baseURL.replace('/api', '').replace(/\/$/, '');
        const urlCompleta = `${baseArchivos}${ruta}`;
        
        Swal.fire({
            title: 'Comprobante', 
            imageUrl: urlCompleta, 
            imageWidth: 450,
            confirmButtonText: 'Cerrar', 
            confirmButtonColor: '#2d3748'
        });
    },

    confirmarCierre: async function() {
        const sesionRaw = localStorage.getItem('usuario_sesion');
        if (!sesionRaw) return;
        const sesion = JSON.parse(sesionRaw);

        const idClinica = sesion.id_clinica || sesion.ID_Clinica;
        const idUsuario = sesion.id_usuario || sesion.ID_Usuario;

        const efecReal = this.totalContadoGlobal;
        const transReal = parseFloat(document.getElementById('real-trans')?.value) || 0;
        const tarjReal = parseFloat(document.getElementById('real-tarjeta')?.value) || 0;
        const inicial = parseFloat(document.getElementById('input-inicial')?.value) || 0;

        const totalRealGlobal = efecReal + transReal + tarjReal;
        const totalEsperadoGlobal = this.datosSistema.total + inicial;
        const diferenciaGlobal = totalRealGlobal - totalEsperadoGlobal;

        const { isConfirmed } = await Swal.fire({
            title: '¿Finalizar Arqueo?',
            html: `Total Contado: <b>$${totalRealGlobal.toFixed(2)}</b><br>Diferencia: <b>$${diferenciaGlobal.toFixed(2)}</b>`,
            icon: 'question', 
            showCancelButton: true, 
            confirmButtonText: 'Sí, registrar y cerrar'
        });

        if (isConfirmed) {
            Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            const desglose = {};
            document.querySelectorAll('#billetes-container input').forEach(i => {
                desglose[i.dataset.den] = parseInt(i.value) || 0;
            });

            try {
                const res = await window.api.post('/caja/cerrar', {
                    id_usuario: idUsuario, 
                    id_clinica: idClinica,
                    nombre_usuario: `${sesion.Nombres} ${sesion.Apellidos}`,
                    monto_inicial: inicial, 
                    monto_sistema: this.datosSistema.total,
                    efec_sistema: this.datosSistema.efec, 
                    trans_sistema: this.datosSistema.trans,
                    tarj_sistema: this.datosSistema.tarj, 
                    monto_final_real: totalRealGlobal,
                    efec_real: efecReal, 
                    trans_real: transReal, 
                    tarj_real: tarjReal,
                    observaciones: document.getElementById('notas-arqueo')?.value || "", 
                    desglose_json: JSON.stringify(desglose)
                });

                if (res.status === "Success" && res.id_caja) {
                    this.imprimirReporte(res.id_caja);
                    setTimeout(async () => {
                        await Swal.fire("Arqueo Exitoso", "Caja cerrada correctamente.", "success");
                        window.router.load('dashboard');
                    }, 800);
                } else {
                    throw new Error(res.message);
                }
            } catch (err) {
                Swal.fire("Error", "No se pudo cerrar: " + err.message, "error");
            }
        }
    },

    imprimirReporte: function(idCaja) {
    if (!idCaja) return;

    const baseArchivos = window.api.baseURL.replace('/api', '').replace(/\/$/, '');

    window.api.get(`/caja/reporte-cierre/${idCaja}`)
        .then(response => {
            if (!response || response.status !== "OK") {
                throw new Error(response ? response.message : "Sin respuesta del servidor");
            }

            const d = response.datos;

            const logoUrl = d.clinica.logo 
                ? `${baseArchivos}/uploads/logos/${d.clinica.logo}`
                : `${baseArchivos}/assets/icon.png`;

            // --- NUEVO: Generar filas del desglose ---
            let filasDesglose = '';
            if (d.desglose && d.desglose.length > 0) {
                filasDesglose = d.desglose.map(item => `
                    <tr>
                        <td class="text-left">${item.denominacion}</td>
                        <td style="text-align: center;">${item.cantidad}</td>
                        <td>$${item.subtotal}</td>
                    </tr>
                `).join('');
            } else {
                filasDesglose = '<tr><td colspan="3" style="text-align:center; padding:10px;">No se registró desglose de efectivo</td></tr>';
            }

            const win = window.open('', '_blank');

            win.document.write(`
                <html>
                <head>
                    <title>Reporte Arqueo #${d.info.id}</title>
                    <style>
                        body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #1e293b; background: white; margin: 0; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .logo-reporte { max-width: 140px; height: auto; margin-bottom: 10px; object-fit: contain; }
                        .banner { background: #1e293b; color: white; padding: 10px; text-align: center; font-weight: bold; margin: 20px 0; border-radius: 4px; letter-spacing: 1px; }
                        .info { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 30px; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: #fcfcfc; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        th { border-bottom: 2px solid #1e293b; padding: 12px 10px; text-align: right; font-size: 13px; color: #475569; }
                        td { padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                        .text-left { text-align: left; }
                        .bold { font-weight: bold; }
                        .total-row { background: #f8fafc; font-weight: bold; }
                        .section-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }
                        .footer { margin-top: 80px; display: flex; justify-content: space-around; }
                        .linea { border-top: 1.5px solid #1e293b; width: 220px; text-align: center; font-size: 11px; padding-top: 8px; color: #1e293b; font-weight: bold; }
                        @media print { body { padding: 20px; } .no-print { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <img src="${logoUrl}" class="logo-reporte" onerror="this.src='${baseArchivos}/assets/icon.png'">
                        <h2 style="margin:0; color: #0f172a;">${d.clinica.nombre}</h2>
                        <p style="margin:5px 0; font-size: 13px;">RUC: ${d.clinica.ruc} | ${d.clinica.direccion}</p>
                    </div>

                    <div class="banner">REPORTE DE ARQUEO Y CIERRE DE CAJA</div>

                    <div class="info">
                        <div>
                            <b>ID ARQUEO:</b> #${d.info.id}<br>
                            <b>RESPONSABLE:</b> ${d.info.responsable}
                        </div>
                        <div style="text-align:right;">
                            <b>FECHA:</b> ${d.info.fecha}<br>
                            <b>ESTADO:</b> <span style="color:#059669; font-weight:bold;">${d.info.estado}</span>
                        </div>
                    </div>

                    <div class="section-title">DETALLE DE EFECTIVO CONTADO</div>
                    <table>
                        <thead>
                            <tr>
                                <th class="text-left">DENOMINACIÓN</th>
                                <th style="text-align: center;">CANTIDAD</th>
                                <th>SUBTOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasDesglose}
                        </tbody>
                    </table>

                    <div class="section-title">RESUMEN VS SISTEMA</div>
                    <table>
                        <thead>
                            <tr>
                                <th class="text-left">DESCRIPCIÓN</th>
                                <th>SISTEMA</th>
                                <th>REAL</th>
                                <th>DIFERENCIA</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="text-left">Efectivo</td>
                                <td>$${d.filas.efectivo.sistema}</td>
                                <td>$${d.filas.efectivo.real}</td>
                                <td style="color:${d.filas.efectivo.color}; font-weight:bold;">$${d.filas.efectivo.diferencia}</td>
                            </tr>
                            <tr>
                                <td class="text-left">Transferencias</td>
                                <td>$${d.filas.transferencia.sistema}</td>
                                <td>$${d.filas.transferencia.real}</td>
                                <td style="color:${d.filas.transferencia.color}; font-weight:bold;">$${d.filas.transferencia.diferencia}</td>
                            </tr>
                            <tr>
                                <td class="text-left">Tarjetas</td>
                                <td>$${d.filas.tarjeta.sistema}</td>
                                <td>$${d.filas.tarjeta.real}</td>
                                <td style="color:${d.filas.tarjeta.color}; font-weight:bold;">$${d.filas.tarjeta.diferencia}</td>
                            </tr>
                            <tr class="total-row">
                                <td class="text-left">TOTALES GENERALES</td>
                                <td>$${d.totales.sistema}</td>
                                <td>$${d.totales.real}</td>
                                <td style="color:${d.totales.color}">$${d.totales.diferencia}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="footer">
                        <div class="linea">FIRMA RESPONSABLE</div>
                        <div class="linea">REVISADO POR</div>
                    </div>

                    <script>
                        document.close();
                        const finalizar = () => {
                            setTimeout(() => { window.close(); }, 200);
                        };
                        window.onafterprint = finalizar;
                        setTimeout(() => {
                            window.print();
                            window.onfocus = finalizar;
                        }, 500);
                    </script>
                </body>
                </html>
            `);
        })
        .catch(err => {
            console.error("Error al generar reporte:", err);
            alert("No se pudo obtener la información del arqueo desde el servidor.");
        });
    }
};