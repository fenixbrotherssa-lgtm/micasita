// ==========================================
// REPORTES DE CONTROL (panel de soporte)
// Resumen del SaaS, altas por mes frente a las clínicas que ya estaban, detalle por
// clínica (usuarios, pacientes, pagos) y lista de cobros. Cada sección se imprime
// (o se guarda como PDF desde el diálogo de impresión) y se exporta a Excel.
// ==========================================
window.reportesSoporte = {
    _datos: null,
    _pestana: 'resumen',

    _esc: (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    _dinero: (n) => `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    _fecha: (f) => f ? new Date(f).toLocaleDateString('es-EC') : '—',
    _mes: (clave) => {
        const [a, m] = clave.split('-');
        return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
    },

    ESTADOS: {
        activo: ['Activa', '#059669'], por_vencer: ['Por vencer', '#d97706'], vencida: ['Vencida', '#dc2626'],
        suspendido: ['Suspendida', '#dc2626'], moroso: ['Morosa', '#dc2626'], cancelado: ['Cancelada', '#64748b']
    },

    abrir: async function(token) {
        Swal.fire({ title: 'Generando reporte...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        let res;
        try {
            const r = await fetch(window.api.baseURL + '/superadmin/reportes', { headers: { Authorization: `Bearer ${token}` } });
            res = await r.json();
        } catch (_) { res = { status: 'Error', message: 'No se pudo conectar con el servidor.' }; }
        if (res.status !== 'Success') return Swal.fire('Error', res.message || 'No se pudo generar el reporte.', 'error');
        this._datos = res;

        const pestanas = [['resumen', 'Resumen'], ['meses', 'Por mes'], ['clinicas', 'Clínicas'], ['pagos', 'Pagos']];
        await Swal.fire({
            title: 'Reportes de control',
            width: 980,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#64748b',
            html: `
                <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div id="rs-tabs" style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${pestanas.map(([k, t]) => `<button type="button" data-tab="${k}" class="rs-tab" style="border:1px solid #c7d2fe; background:#fff; color:#3730a3; border-radius:8px; padding:6px 12px; font-size:0.8rem; font-weight:700; cursor:pointer;">${t}</button>`).join('')}
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="rs-imprimir" style="background:#4f46e5; color:#fff; border:none; border-radius:8px; padding:6px 12px; font-size:0.8rem; font-weight:700; cursor:pointer;"><i class="fas fa-print"></i> Imprimir / PDF</button>
                        <button type="button" id="rs-excel" style="background:#059669; color:#fff; border:none; border-radius:8px; padding:6px 12px; font-size:0.8rem; font-weight:700; cursor:pointer;"><i class="fas fa-file-excel"></i> Excel</button>
                    </div>
                </div>
                <div id="rs-contenido" style="text-align:left; max-height:62vh; overflow:auto; font-size:0.8rem;"></div>
                <div style="text-align:right; color:#94a3b8; font-size:0.7rem; margin-top:6px;">Generado: ${new Date(res.generado).toLocaleString('es-EC')}</div>`,
            didOpen: () => {
                document.querySelectorAll('.rs-tab').forEach(b => b.onclick = () => this._mostrar(b.dataset.tab));
                document.getElementById('rs-imprimir').onclick = () => this.imprimir(this._pestana);
                document.getElementById('rs-excel').onclick = () => this.excel(this._pestana);
                this._mostrar('resumen');
            }
        });
    },

    _mostrar: function(tab) {
        this._pestana = tab;
        document.querySelectorAll('.rs-tab').forEach(b => {
            const activa = b.dataset.tab === tab;
            b.style.background = activa ? '#4f46e5' : '#fff';
            b.style.color = activa ? '#fff' : '#3730a3';
        });
        document.getElementById('rs-contenido').innerHTML = this.html(tab, false);
    },

    // Tablas de cada sección como { titulo, columnas: [[encabezado, fn, alineación]], filas }.
    tabla: function(tab) {
        const d = this._datos;
        const est = (e) => (this.ESTADOS[e] || [e])[0];
        if (tab === 'meses') return {
            titulo: 'Clínicas y cobros por mes (últimos 12 meses)',
            columnas: [
                ['Mes', m => this._mes(m.Mes)], ['Ya estaban', m => m.Existentes, 'r'], ['Nuevas', m => m.Nuevas, 'r'],
                ['Total al cierre', m => m.Existentes + m.Nuevas, 'r'], ['Clínicas que pagaron', m => m.Clinicas_Que_Pagaron, 'r'],
                ['Pagos', m => m.Pagos, 'r'], ['Ingresos', m => this._dinero(m.Ingresos), 'r']
            ],
            filas: d.meses.slice().reverse(),
            total: ['Total 12 meses', '', d.meses.reduce((s, m) => s + m.Nuevas, 0), '', '', d.meses.reduce((s, m) => s + m.Pagos, 0), this._dinero(d.meses.reduce((s, m) => s + m.Ingresos, 0))]
        };
        if (tab === 'clinicas') return {
            titulo: 'Detalle por clínica',
            columnas: [
                ['Clínica', c => c.Nombre], ['Código', c => c.Identificador], ['Plan', c => c.Plan], ['Estado', c => est(c.Estado)],
                ['Alta', c => this._fecha(c.Alta)], ['Vence', c => this._fecha(c.Vence)],
                ['Usuarios', c => c.Usuarios ?? '—', 'r'], ['Pacientes', c => c.Pacientes ?? '—', 'r'],
                ['Precio/mes', c => c.Precio_Mensual !== null ? this._dinero(c.Precio_Mensual) : 'General', 'r'],
                ['Pagos', c => c.Pagos, 'r'], ['Total pagado', c => this._dinero(c.Total_Pagado), 'r'], ['Último pago', c => this._fecha(c.Ultimo_Pago)]
            ],
            filas: d.clinicas,
            total: ['Total', '', '', '', '', '', d.resumen.Usuarios, d.resumen.Pacientes, '', d.clinicas.reduce((s, c) => s + c.Pagos, 0), this._dinero(d.clinicas.reduce((s, c) => s + c.Total_Pagado, 0)), '']
        };
        if (tab === 'pagos') return {
            titulo: 'Pagos de licencia',
            columnas: [
                ['Fecha', p => this._fecha(p.Fecha_Registro)], ['Clínica', p => p.Nombre_Empresa], ['Código', p => p.Identificador],
                ['Monto', p => this._dinero(p.Monto), 'r'], ['Días', p => p.Periodo_Dias, 'r'], ['Método', p => p.Metodo_Pago || '—'],
                ['Referencia', p => p.Referencia || '—'], ['Nuevo vencimiento', p => this._fecha(p.Fecha_Vencimiento_Nueva)],
                ['Registrado por', p => p.Registrado_Por || 'Automático']
            ],
            filas: d.pagos,
            total: ['Total', '', '', this._dinero(d.pagos.reduce((s, p) => s + Number(p.Monto), 0)), '', '', '', '', '']
        };
        const r = d.resumen;
        return {
            titulo: 'Resumen',
            columnas: [['Indicador', x => x[0]], ['Valor', x => x[1], 'r']],
            filas: [
                ['Clínicas registradas', r.Clinicas], ['Activas', r.Activas], ['Por vencer (5 días o menos)', r.Por_Vencer],
                ['Vencidas', r.Vencidas], ['Suspendidas o morosas', r.Suspendidas], ['Canceladas', r.Canceladas],
                ['Nuevas este mes', r.Nuevas_Este_Mes], ['Sin ningún pago todavía', r.Sin_Pagos],
                ['Usuarios activos (todas las clínicas)', r.Usuarios], ['Pacientes registrados', r.Pacientes],
                ['Ingresos de este mes', this._dinero(r.Ingresos_Mes)], ['Ingresos del año', this._dinero(r.Ingresos_Anio)],
                ['Pagos reportados por revisar', r.Pagos_Por_Revisar]
            ]
        };
    },

    html: function(tab, paraImprimir) {
        const t = this.tabla(tab);
        const r = this._datos.resumen;
        const tarjetas = tab === 'resumen' && !paraImprimir ? `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin-bottom:12px;">
                ${[['Clínicas', r.Clinicas, '#4f46e5'], ['Activas', r.Activas, '#059669'], ['Por vencer', r.Por_Vencer, '#d97706'],
                   ['Vencidas / suspendidas', r.Vencidas + r.Suspendidas, '#dc2626'], ['Usuarios', r.Usuarios, '#0891b2'],
                   ['Ingresos del mes', this._dinero(r.Ingresos_Mes), '#059669']].map(([k, v, c]) => `
                    <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                        <div style="color:#64748b; font-size:0.7rem; text-transform:uppercase; letter-spacing:.04em;">${k}</div>
                        <div style="font-size:1.35rem; font-weight:800; color:${c}; font-variant-numeric:tabular-nums;">${v}</div>
                    </div>`).join('')}
            </div>` : '';
        const anchoMinimo = (k) => (k === 0 && tab === 'clinicas') || (k === 1 && tab === 'pagos') ? 'min-width:150px;' : '';
        const th = t.columnas.map(([h, , a], k) => `<th style="text-align:${a === 'r' ? 'right' : 'left'}; padding:6px 8px; border-bottom:2px solid #cbd5e1; white-space:nowrap; ${anchoMinimo(k)}">${h}</th>`).join('');
        const filas = t.filas.length ? t.filas.map((f, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'};">${t.columnas.map(([, fn, a], k) => {
            let v = this._esc(fn(f));
            if (tab === 'clinicas' && k === 3) {
                const c = (this.ESTADOS[f.Estado] || [, '#334155'])[1];
                v = `<b style="color:${c};">${v}</b>`;
            }
            return `<td style="text-align:${a === 'r' ? 'right' : 'left'}; padding:5px 8px; border-bottom:1px solid #e2e8f0; font-variant-numeric:tabular-nums; white-space:${k === 0 || (tab === 'pagos' && k === 1) ? 'normal' : 'nowrap'};">${v}</td>`;
        }).join('')}</tr>`).join('')
            : `<tr><td colspan="${t.columnas.length}" style="padding:14px; text-align:center; color:#94a3b8;">Sin datos.</td></tr>`;
        const total = t.total ? `<tr>${t.total.map((v, k) => `<td style="text-align:${t.columnas[k][2] === 'r' ? 'right' : 'left'}; padding:6px 8px; border-top:2px solid #cbd5e1; font-weight:800;">${this._esc(v)}</td>`).join('')}</tr>` : '';
        return `${tarjetas}${paraImprimir ? '' : `<div style="font-weight:800; color:#1e293b; margin-bottom:6px;">${t.titulo}</div>`}
            <table style="width:100%; border-collapse:collapse;"><thead><tr>${th}</tr></thead><tbody>${filas}</tbody><tfoot>${total}</tfoot></table>`;
    },

    // Imprime en un iframe oculto: el diálogo de Windows permite elegir impresora o "Microsoft Print to PDF".
    imprimir: function(tab) {
        const t = this.tabla(tab);
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed; width:0; height:0; border:0; right:0; bottom:0;';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>AMETRA OS — ${t.titulo}</title>
            <style>@page { size: ${tab === 'clinicas' || tab === 'pagos' ? 'A4 landscape' : 'A4'}; margin: 14mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 11px; }
            h1 { font-size: 17px; margin: 0; } .sub { color: #64748b; margin: 2px 0 14px; }
            table { width: 100%; border-collapse: collapse; } tr { page-break-inside: avoid; }</style></head><body>
            <h1>AMETRA OS SaaS — ${t.titulo}</h1>
            <div class="sub">CasRodsoft · Generado el ${new Date(this._datos.generado).toLocaleString('es-EC')}</div>
            ${this.html(tab, true)}</body></html>`);
        doc.close();
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => iframe.remove(), 1000);
        }, 300);
    },

    // CSV con ";" y BOM: Excel en español lo abre directo con acentos y columnas correctas.
    excel: function(tab) {
        const t = this.tabla(tab);
        const celda = (v) => {
            const s = String(v ?? '').replace(/\$/g, '').trim();
            return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lineas = [t.columnas.map(([h]) => celda(h)).join(';')]
            .concat(t.filas.map(f => t.columnas.map(([, fn]) => celda(fn(f))).join(';')));
        if (t.total) lineas.push(t.total.map(celda).join(';'));
        const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ametra-saas-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
};
