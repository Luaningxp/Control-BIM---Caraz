import { colorTema } from './tema.js';
import { state } from './db.js';
import { esDiaLaborable } from './roster.js';
import { WEIGHT, DAY, today, daysToDeadline, isCerrado, semaforo, escapeHtml, getCriticidad, fmtDate, nombreFormateado, isoLocal, hoyLima, sumarDias, lunesDeSemana, TZ_PROYECTO, latenciaPromedio, cerradaTarde } from './utils.js';


// ------------------------------------------------------------------
// ESTADO DEL PORTAFOLIO (vista ejecutiva para gerencia)
// Todas las actividades (sin canceladas/anuladas) en una categoría exclusiva.
// ------------------------------------------------------------------
const CATEGORIAS_PORTAFOLIO = [
    { key: 'cerradaATiempo', label: 'Cerradas a tiempo', color: '#059669' },
    { key: 'cerradaTarde',   label: 'Cerradas con atraso (vs. fin original)', color: '#a7f3d0' },
    { key: 'enPlazo',        label: 'Abiertas en plazo', color: '#0284c7' },
    { key: 'porVencer',      label: 'Abiertas por vencer (≤ 7 d)', color: '#ea580c' },
    { key: 'vencida',        label: 'Abiertas vencidas', color: '#dc2626' },
    { key: 'sinFecha',       label: 'Sin fecha', color: '#cbd5e1' }
];

function categoriaPortafolio(t) {
    // "A tiempo" se mide contra la fecha fin ORIGINAL: reprogramar no borra el atraso
    if (isCerrado(t)) return cerradaTarde(t) ? 'cerradaTarde' : 'cerradaATiempo';
    const s = semaforo(t);
    if (s === 'Sin fecha') return 'sinFecha';
    if (s === 'Vencida') return 'vencida';
    if (s === 'Por vencer') return 'porVencer';
    return 'enPlazo';
}

function datosPortafolio() {
    const tareas = state.tasksCache.filter(t => t.estado !== 'Cancelado' && t.estado !== 'Anulado');
    const conRep = new Set((state.reprogramacionesCache || []).map(r => String(r.pendiente_id)));
    const vacio = () => Object.fromEntries(CATEGORIAS_PORTAFOLIO.map(c => [c.key, 0]));
    const total = vacio();
    const porEsp = {};
    const esps = state.especialidadesTodasCache || [];
    tareas.forEach(t => {
        const c = categoriaPortafolio(t);
        total[c]++;
        const nombre = esps.find(e => String(e.id) === String(t.especialidad_id))?.nombre || 'GENERAL';
        porEsp[nombre] = porEsp[nombre] || vacio();
        porEsp[nombre][c]++;
    });
    const n = tareas.length;
    const cerradas = total.cerradaATiempo + total.cerradaTarde;
    return {
        n, cerradas, total, porEsp,
        avance: n ? Math.round(cerradas * 100 / n) : 0,
        abiertas: n - cerradas,
        vencidas: total.vencida,
        porVencer: total.porVencer,
        sinFecha: total.sinFecha,
        reprogramadas: tareas.filter(t => conRep.has(String(t.id))).length
    };
}

function seccionPortafolio() {
    const d = datosPortafolio();
    const tarjetas = [
        { label: 'Total', value: d.n, sub: 'actividades', color: 'sky' },
        { label: 'Avance', value: d.avance + '%', sub: `${d.cerradas} cerradas`, color: 'emerald' },
        { label: 'Abiertas', value: d.abiertas, sub: 'en curso', color: 'slate' },
        { label: 'Vencidas', value: d.vencidas, sub: 'requieren acción', color: 'red' },
        { label: 'Por vencer', value: d.porVencer, sub: '≤ 7 días', color: 'amber' },
        { label: 'Sin fecha', value: d.sinFecha, sub: 'abiertas sin fecha fin', color: 'slate' },
        { label: 'Reprogramadas', value: d.reprogramadas, sub: 'con ≥ 1 reprogramación', color: 'violet' }
    ];
    const filas = 1 + Object.keys(d.porEsp).length;
    return `
        <div class="card p-4 mb-4">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h4 class="font-bold text-sm text-slate-800">Estado del portafolio</h4>
                    <p class="text-[11px] text-slate-500">Situación actual de todas las actividades (sin canceladas ni anuladas) · ${fmtDate(hoyLima())}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                ${tarjetas.map(x => `
                    <div class="rounded-lg bg-${x.color}-50 border border-${x.color}-100 p-3">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-${x.color}-800">${x.label}</p>
                        <p class="text-3xl font-bold text-${x.color}-700 leading-tight">${x.value}</p>
                        <p class="text-[10px] text-slate-500">${x.sub}</p>
                    </div>`).join('')}
            </div>
            ${d.n ? `<div class="chart-box" style="height: ${Math.min(80 + filas * 34, 520)}px;"><canvas id="chart-portafolio"></canvas></div>`
                  : '<p class="text-[11px] text-slate-400 italic text-center py-6">Sin actividades.</p>'}
        </div>`;
}

function renderPortafolio() {
    if (state.charts.portafolio) { state.charts.portafolio.destroy(); state.charts.portafolio = null; }
    const el = document.getElementById('chart-portafolio');
    if (!el) return;
    const d = datosPortafolio();
    const filas = [['PROYECTO', d.total], ...Object.entries(d.porEsp).sort((a, b) => a[0].localeCompare(b[0], 'es'))];
    const totales = filas.map(([, c]) => Object.values(c).reduce((x, y) => x + y, 0));
    state.charts.portafolio = new Chart(el, {
        type: 'bar',
        data: {
            labels: filas.map(([n], i) => `${n} (${totales[i]})`),
            datasets: CATEGORIAS_PORTAFOLIO.map(c => ({
                label: c.label,
                data: filas.map(([, cnt], i) => totales[i] ? Math.round(cnt[c.key] * 1000 / totales[i]) / 10 : 0),
                _abs: filas.map(([, cnt]) => cnt[c.key]),
                backgroundColor: c.color
            }))
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.dataset._abs[ctx.dataIndex]} (${ctx.parsed.x}%)` } }
            },
            scales: {
                x: { stacked: true, max: 100, ticks: { callback: v => v + '%', font: { size: 10 } } },
                y: { stacked: true, ticks: { font: { size: 10, weight: 'bold' } } }
            }
        }
    });
}

// ------------------------------------------------------------------
// PARETO 80/20: reprogramaciones e incumplimientos
// Cuenta eventos (cada reprogramación o causa registrada vale 1).
// Excluye reprogramaciones migradas. Lo que no tiene causa va en "Sin causa".
// ------------------------------------------------------------------
let paretoState = { semanas: 8, especialidad: '' };

window.setParetoFiltro = function(clave, valor) {
    paretoState[clave] = clave === 'semanas' ? Number(valor) : valor;
    window.renderView();
};

/** Primer día del periodo (lunes de hace N-1 semanas, hora de Lima). null = todo el proyecto. */
function inicioPeriodoPareto() {
    if (!paretoState.semanas) return null;
    return sumarDias(lunesDeSemana(hoyLima()), -7 * (paretoState.semanas - 1));
}

function tareaPasaFiltro(pendienteId) {
    if (!paretoState.especialidad) return true;
    const t = state.tasksCache.find(x => String(x.id) === String(pendienteId));
    return !!t && String(t.especialidad_id) === String(paretoState.especialidad);
}

function nombreCausa(causaId) {
    if (!causaId) return 'Sin causa';
    const causas = state.causasTodasCache || state.causasCache || [];
    return causas.find(c => Number(c.id) === Number(causaId))?.nombre || 'Causa eliminada';
}

/** Ordena de mayor a menor y calcula % acumulado; "vitales" = hasta cruzar el 80% inclusive. */
function calcularPareto(conteo) {
    const filas = Object.entries(conteo).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    const total = filas.reduce((acc, [, n]) => acc + n, 0);
    let acum = 0, cruzo = false;
    return {
        total,
        filas: filas.map(([nombre, n]) => {
            const vital = !cruzo;
            acum += n;
            const pctAcum = total ? Math.round(acum * 1000 / total) / 10 : 0;
            if (pctAcum >= 80) cruzo = true;
            return { nombre, n, pct: total ? Math.round(n * 1000 / total) / 10 : 0, pctAcum, vital };
        })
    };
}

function paretoReprogramaciones() {
    const desde = inicioPeriodoPareto();
    const conteo = {};
    (state.reprogramacionesCache || []).forEach(r => {
        if (r.es_migrada) return;
        const fecha = r.created_at ? fmtLimaDia(r.created_at) : null;
        if (desde && (!fecha || fecha < desde)) return;
        if (!tareaPasaFiltro(r.pendiente_id)) return;
        const n = nombreCausa(r.causa_id);
        conteo[n] = (conteo[n] || 0) + 1;
    });
    return calcularPareto(conteo);
}

function paretoIncumplimientos() {
    const desde = inicioPeriodoPareto();
    const conteo = {};
    const tareas = new Map(state.tasksCache.map(t => [String(t.id), t]));
    const conCausa = new Set();
    (state.tareaCausasCache || []).forEach(tc => {
        const t = tareas.get(String(tc.pendiente_id));
        if (!t || !t.fecha_cierre) return;
        if (desde && t.fecha_cierre < desde) return;
        if (!tareaPasaFiltro(t.id)) return;
        conCausa.add(String(t.id));
        const n = nombreCausa(tc.causa_id);
        conteo[n] = (conteo[n] || 0) + 1;
    });
    // Cierres tardíos sin causa registrada
    state.tasksCache.forEach(t => {
        if (!t.fecha_cierre || !t.fecha_fin || t.fecha_cierre <= t.fecha_fin) return;
        if (desde && t.fecha_cierre < desde) return;
        if (!tareaPasaFiltro(t.id) || conCausa.has(String(t.id))) return;
        conteo['Sin causa'] = (conteo['Sin causa'] || 0) + 1;
    });
    return calcularPareto(conteo);
}

/** Fecha 'YYYY-MM-DD' en Lima de un timestamp. */
function fmtLimaDia(ts) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_PROYECTO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

function metricasCierreVsPlan() {
    const dias = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY);
    const conRep = new Set((state.reprogramacionesCache || []).filter(r => !r.es_migrada).map(r => r.pendiente_id));
    const cerradas = state.tasksCache.filter(t => t.estado === 'Cerrado' && t.fecha_cierre && t.fecha_fin_original);
    const desvios = cerradas.map(t => dias(t.fecha_fin_original, t.fecha_cierre));
    const avg = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : 0;
    return {
        cerradasN: cerradas.length,
        aTiempoOriginal: desvios.filter(d => d <= 0).length,
        desvioProm: avg(desvios),
        desvioPromReprog: avg(cerradas.filter(t => conRep.has(t.id)).map(t => dias(t.fecha_fin_original, t.fecha_cierre)))
    };
}

function bloquePareto(id, titulo, subtitulo, pareto) {
    const vitales = pareto.filas.filter(f => f.vital);
    return `
        <div class="card p-4">
            <h4 class="font-semibold text-sm text-slate-800">${titulo}</h4>
            <p class="text-[11px] text-slate-500 mb-2">${subtitulo} · ${pareto.total} evento${pareto.total === 1 ? '' : 's'}</p>
            ${pareto.total === 0
                ? '<p class="text-[11px] text-slate-400 italic py-10 text-center">Sin registros en el periodo.</p>'
                : `<div class="chart-box" style="height: 260px;"><canvas id="${id}"></canvas></div>
                   <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-3 mb-1">Pocas vitales (${vitales.length} de ${pareto.filas.length} causas ≈ ${vitales.length ? vitales[vitales.length - 1].pctAcum : 0}%)</p>
                   <ul class="text-[11px] text-slate-700 space-y-0.5">
                       ${vitales.map(f => `<li class="flex justify-between"><span class="truncate pr-2">${escapeHtml(f.nombre)}</span><span class="whitespace-nowrap"><b>${f.n}</b> · ${f.pct}%</span></li>`).join('')}
                   </ul>`}
        </div>`;
}

function seccionParetos() {
    const esps = state.especialidadesCache || [];
    const m = metricasCierreVsPlan();
    const pct = m.cerradasN ? Math.round(m.aTiempoOriginal / m.cerradasN * 100) : 0;
    const signo = v => (v > 0 ? '+' : '') + v;
    const periodoTxt = paretoState.semanas ? `Últimas ${paretoState.semanas} semanas` : 'Todo el proyecto';
    return `
        <div class="mb-4">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                <div>
                    <h4 class="font-semibold text-sm text-slate-800">Pareto 80/20 de causas</h4>
                    <p class="text-[11px] text-slate-500">Las barras resaltadas son las pocas causas que explican ~80% de los casos: atacarlas primero.</p>
                </div>
                <div class="flex gap-2 text-xs">
                    <select class="inp" onchange="window.setParetoFiltro('semanas', this.value)">
                        ${[[4, 'Últimas 4 semanas'], [8, 'Últimas 8 semanas'], [0, 'Todo el proyecto']].map(([v, t]) => `<option value="${v}" ${paretoState.semanas === v ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    <select class="inp" onchange="window.setParetoFiltro('especialidad', this.value)">
                        <option value="">Todas las especialidades</option>
                        ${esps.map(e => `<option value="${e.id}" ${String(paretoState.especialidad) === String(e.id) ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="grid lg:grid-cols-5 gap-3">
                <div class="lg:col-span-2">${bloquePareto('chart-pareto-reprog', 'Reprogramaciones por motivo', periodoTxt, paretoReprogramaciones())}</div>
                <div class="lg:col-span-2">${bloquePareto('chart-pareto-incump', 'Incumplimientos por causa', `${periodoTxt} · cierres tardíos`, paretoIncumplimientos())}</div>
                <div class="card p-4">
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Cierre real vs. plan original</p>
                    <p class="text-2xl font-bold text-slate-800">${pct}%</p>
                    <p class="text-[10px] text-slate-400 mb-2">cerradas en o antes del fin original (${m.aTiempoOriginal} de ${m.cerradasN}) · todo el proyecto</p>
                    <p class="text-[11px] text-slate-600">Desvío promedio: <b>${signo(m.desvioProm)} d</b></p>
                    <p class="text-[11px] text-slate-600">Solo reprogramadas: <b>${signo(m.desvioPromReprog)} d</b></p>
                </div>
            </div>
        </div>`;
}

function dibujarPareto(canvasId, pareto, colorVital) {
    const el = document.getElementById(canvasId);
    if (!el || !pareto.total) return;
    const corto = n => n.length > 22 ? n.slice(0, 21) + '…' : n;
    state.charts[canvasId] = new Chart(el, {
        data: {
            labels: pareto.filas.map(f => corto(f.nombre)),
            datasets: [
                { type: 'bar', label: 'Eventos', data: pareto.filas.map(f => f.n), yAxisID: 'y',
                  backgroundColor: pareto.filas.map(f => f.vital ? colorVital : '#cbd5e1'), order: 2 },
                { type: 'line', label: '% acumulado', data: pareto.filas.map(f => f.pctAcum), yAxisID: 'y1',
                  borderColor: colorTema('--chart-line', '#0F1D30'), backgroundColor: colorTema('--chart-line', '#0F1D30'), pointRadius: 3, tension: 0, order: 1 },
                { type: 'line', label: '80%', data: pareto.filas.map(() => 80), yAxisID: 'y1',
                  borderColor: '#dc2626', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, order: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { title: items => pareto.filas[items[0].dataIndex].nombre } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
                y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                x: { ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 30 } }
            }
        }
    });
}

function renderParetos() {
    ['chart-pareto-reprog', 'chart-pareto-incump', 'chart-pareto-bloqueos'].forEach(id => { if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; } });
    dibujarPareto('chart-pareto-reprog', paretoReprogramaciones(), '#7c3aed');
    dibujarPareto('chart-pareto-incump', paretoIncumplimientos(), '#dc2626');
    dibujarPareto('chart-pareto-bloqueos', datosBloqueos().pareto, '#ea580c');
}

// ------------------------------------------------------------------
// COMPARACIÓN ENTRE SEMANAS (datos de Supabase: dashboard_semanas)
// La semana en curso se calcula en vivo; las cerradas salen de la foto
// congelada el domingo 23:59 (hora de Lima). Ver sql/002_dashboard_ppc_especialidades.sql
// ------------------------------------------------------------------
function semanaActualDashboard() {
    return (state.semanasDashboard || [])[0] || null;
}

// sentido: +1 si subir es bueno (PPC, horas, planos); -1 si subir es malo (abiertas, vencidas)
function deltaSemana(val, prevVal, sentido) {
    if (val === null || val === undefined || prevVal === null || prevVal === undefined) return '';
    const d = Math.round((Number(val) - Number(prevVal)) * 10) / 10;
    if (d === 0) return '<span class="text-slate-400">=</span>';
    const bueno = (d > 0) === (sentido > 0);
    const color = bueno ? 'text-emerald-600' : 'text-red-600';
    return `<span class="${color}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`;
}

function seccionComparacionSemanas() {
    const semanas = state.semanasDashboard || [];
    const dash = '<span class="text-slate-300">—</span>';
    const v = (x) => (x === null || x === undefined) ? dash : x;
    const num = (x) => (x === null || x === undefined) ? null : Number(x);

    const filas = semanas.map((s, i) => {
        const prev = semanas[i + 1];
        const comp = num(s.comprometidas) || 0;
        const np = num(s.no_planificadas) || 0;
        const pctNp = comp > 0 ? Math.round(np * 100 / comp) : null;
        const ad = num(s.adelantadas) || 0;
        const esp = s.no_planificadas_por_especialidad || {};
        const espTxt = Object.entries(esp).sort((a, b) => b[1].n - a[1].n)
            .map(([k, x]) => `${k}: ${x.n} (${Number(x.horas).toFixed(1)} h)`).join(' · ');
        const ppc = num(s.ppc);
        return `<tr class="hover:bg-slate-50">
            <td class="p-3 font-mono font-bold ${i === 0 ? 'text-sky-700' : 'text-slate-600'}">${fmtDate(s.semana)} ${i === 0 ? '(Actual)' : ''}</td>
            <td class="p-3">${comp}</td>
            <td class="p-3">${v(num(s.cumplidas))}${ad ? ` <span class="text-emerald-700 text-[10px]" title="Adelantadas de semanas futuras">+${ad}</span>` : ''}</td>
            <td class="p-3 font-bold">${ppc === null ? (ad ? `— <span class="text-emerald-700 text-[10px]">+${ad} adelantadas</span>` : dash) : ppc + '%'} ${deltaSemana(ppc, num(prev?.ppc), +1)}</td>
            <td class="p-3" title="${escapeHtml(espTxt)}">${np}${pctNp !== null ? ` <span class="text-slate-400 text-[10px]">(${pctNp}%)</span>` : ''}</td>
            <td class="p-3">${Number(s.horas_no_planificadas || 0).toFixed(1)} h</td>
            <td class="p-3">${Number(s.horas_semana || 0).toFixed(1)} h ${deltaSemana(num(s.horas_semana), num(prev?.horas_semana), +1)}</td>
            <td class="p-3">${v(num(s.abiertas))} ${deltaSemana(num(s.abiertas), num(prev?.abiertas), -1)}</td>
            <td class="p-3 font-bold ${num(s.vencidas) > 0 ? 'text-red-700' : ''}">${v(num(s.vencidas))} ${deltaSemana(num(s.vencidas), num(prev?.vencidas), -1)}</td>
            <td class="p-3">${v(num(s.por_vencer))} ${deltaSemana(num(s.por_vencer), num(prev?.por_vencer), -1)}</td>
            <td class="p-3">${v(num(s.planos_contractuales))} ${deltaSemana(num(s.planos_contractuales), num(prev?.planos_contractuales), +1)}</td>
            <td class="p-3">${v(num(s.planos_detalle))} ${deltaSemana(num(s.planos_detalle), num(prev?.planos_detalle), +1)}</td>
        </tr>`;
    }).join('');

    // No planificadas por especialidad, acumulado de las semanas mostradas
    const acum = {};
    semanas.forEach(s => Object.entries(s.no_planificadas_por_especialidad || {}).forEach(([k, x]) => {
        acum[k] = acum[k] || { n: 0, horas: 0 };
        acum[k].n += Number(x.n || 0);
        acum[k].horas += Number(x.horas || 0);
    }));
    const acumOrd = Object.entries(acum).sort((a, b) => b[1].horas - a[1].horas);

    return `
        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Comparación entre semanas</h4>
                <p class="text-[11px] text-slate-500">PPC = (cumplidas + adelantadas) ÷ comprometidas. Compromiso fijado el lunes 00:00, más las no planificadas surgidas en la semana. La semana en curso se calcula en vivo; las anteriores quedan congeladas el domingo 23:59 (hora de Lima).</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Semana</th>
                        <th class="p-3" title="Comprometidas el lunes + no planificadas">Compr.</th>
                        <th class="p-3">Cumplidas</th>
                        <th class="p-3">PPC</th>
                        <th class="p-3" title="Surgidas durante la semana (pasa el cursor para ver por especialidad)">No planif.</th>
                        <th class="p-3">Horas no planif.</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">Abiertas</th>
                        <th class="p-3">Vencidas</th>
                        <th class="p-3">Por vencer</th>
                        <th class="p-3" title="Planos distintos con horas registradas en la semana">Planos contract.</th>
                        <th class="p-3" title="Planos distintos con horas registradas en la semana">Det. constr.</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${filas || '<tr><td colspan="12" class="text-center py-4 text-slate-400">Aún no hay datos. Verifica que se haya ejecutado sql/002_dashboard_ppc_especialidades.sql en Supabase.</td></tr>'}
                </tbody>
            </table>
            ${acumOrd.length ? `
                <div class="p-4 pt-3 border-t border-slate-100">
                    <h5 class="font-semibold text-xs text-slate-700 mb-2">No planificadas por especialidad (últimas ${semanas.length} semanas)</h5>
                    <div class="flex flex-wrap gap-2">
                        ${acumOrd.map(([k, x]) => `<span class="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded"><b>${escapeHtml(k)}</b>: ${x.n} act. · ${x.horas.toFixed(1)} h</span>`).join('')}
                    </div>
                </div>` : ''}
        </div>
    `;
}

// ------------------------------------------------------------------
// META DE PPC (parametros_app.meta_ppc; referencia Last Planner 80%)
// ------------------------------------------------------------------
export function metaPPC() {
    const v = Number(state.parametrosApp?.meta_ppc);
    return v > 0 && v <= 100 ? v : 80;
}

function clasePPC(ppc) {
    const meta = metaPPC();
    if (ppc >= meta) return 'bg-teal-100 text-teal-800';
    if (ppc >= meta - 20) return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-700';
}

// ------------------------------------------------------------------
// BLOQUEOS "EN ESPERA" (sql/009_espera_bloqueos_ppc_responsable.sql)
// Días en espera = días laborables del responsable (roster) transcurridos
// desde el inicio del bloqueo. Sin responsable: lunes a sábado.
// ------------------------------------------------------------------
function diasLaborablesEntre(uid, desde, hasta) {
    if (!desde || !hasta || hasta <= desde) return 0;
    let n = 0;
    for (let f = sumarDias(desde, 1); f <= hasta; f = sumarDias(f, 1)) {
        const lab = uid ? esDiaLaborable(uid, f) : new Date(f + 'T00:00:00').getDay() !== 0;
        if (lab) n++;
    }
    return n;
}

function datosBloqueos() {
    const hoy = hoyLima();
    const tareas = new Map(state.tasksCache.map(t => [String(t.id), t]));
    const bloqueos = state.bloqueosCache || [];
    const abiertoDe = new Map(bloqueos.filter(b => !b.fin).map(b => [String(b.pendiente_id), b]));

    const actuales = state.tasksCache.filter(t => t.estado === 'En espera').map(t => {
        const b = abiertoDe.get(String(t.id));
        const desde = b?.inicio ? fmtLimaDia(b.inicio) : null;
        return {
            t, desde,
            dias: desde ? diasLaborablesEntre(t.responsable_id, desde, hoy) : null,
            motivo: (t.motivo_espera_id ?? b?.causa_id) ? nombreCausa(t.motivo_espera_id ?? b?.causa_id) : 'Sin motivo',
            esp: (state.especialidadesTodasCache || []).find(e => String(e.id) === String(t.especialidad_id))?.nombre || 'GENERAL'
        };
    }).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));

    // Pareto y promedios: bloqueos iniciados en el periodo y especialidad del filtro
    const desdePeriodo = inicioPeriodoPareto();
    const enPeriodo = bloqueos.filter(b => {
        const t = tareas.get(String(b.pendiente_id));
        if (!t) return false;
        if (desdePeriodo && fmtLimaDia(b.inicio) < desdePeriodo) return false;
        return tareaPasaFiltro(b.pendiente_id);
    });
    const conteo = {};
    const porEsp = {};
    enPeriodo.forEach(b => {
        const t = tareas.get(String(b.pendiente_id));
        const n = b.causa_id ? nombreCausa(b.causa_id) : 'Sin motivo';
        conteo[n] = (conteo[n] || 0) + 1;
        const dias = diasLaborablesEntre(t.responsable_id, fmtLimaDia(b.inicio), b.fin ? fmtLimaDia(b.fin) : hoy);
        const esp = (state.especialidadesTodasCache || []).find(e => String(e.id) === String(t.especialidad_id))?.nombre || 'GENERAL';
        porEsp[esp] = porEsp[esp] || { n: 0, dias: 0 };
        porEsp[esp].n++;
        porEsp[esp].dias += dias;
    });
    const cerrados = enPeriodo.filter(b => b.fin);
    const diasCerrados = cerrados.map(b => diasLaborablesEntre(tareas.get(String(b.pendiente_id))?.responsable_id, fmtLimaDia(b.inicio), fmtLimaDia(b.fin)));
    const prom = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : 0;
    return {
        actuales,
        pareto: calcularPareto(conteo),
        porEsp: Object.entries(porEsp).map(([k, x]) => ({ esp: k, n: x.n, prom: Math.round(x.dias / x.n * 10) / 10 })).sort((a, b) => b.prom - a.prom),
        promActual: prom(actuales.filter(a => a.dias !== null).map(a => a.dias)),
        promCerrados: prom(diasCerrados),
        cerradosN: cerrados.length,
        sinTabla: !(state.bloqueosCache || []).length && actuales.length > 0
    };
}

function seccionBloqueos() {
    const d = datosBloqueos();
    const periodoTxt = paretoState.semanas ? `Últimas ${paretoState.semanas} semanas` : 'Todo el proyecto';
    const tarjetas = [
        { label: 'En espera ahora', value: d.actuales.length, sub: 'actividades bloqueadas', color: 'amber' },
        { label: 'Días en espera', value: d.promActual + ' d', sub: 'promedio de las actuales', color: 'orange' },
        { label: 'Bloqueos liberados', value: d.cerradosN, sub: periodoTxt.toLowerCase(), color: 'emerald' },
        { label: 'Duración promedio', value: d.promCerrados + ' d', sub: 'de los liberados', color: 'slate' }
    ];
    return `
        <div class="mb-4">
            <h4 class="font-semibold text-sm text-slate-800">Restricciones · actividades "En espera"</h4>
            <p class="text-[11px] text-slate-500 mb-2">Bloqueos con su motivo (catálogo de causas de incumplimiento). Días laborables según el roster del responsable. Usa los mismos filtros del Pareto de causas.</p>
            ${d.sinTabla ? '<p class="text-[11px] text-amber-700 mb-2">Aún no hay historial de bloqueos: ejecuta sql/009_espera_bloqueos_ppc_responsable.sql en Supabase.</p>' : ''}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                ${tarjetas.map(x => `
                    <div class="card p-3 border-l-4 border-${x.color}-500">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">${x.label}</p>
                        <p class="text-xl font-bold mt-1 text-${x.color}-700">${x.value}</p>
                        <p class="text-[10px] text-slate-400">${x.sub}</p>
                    </div>`).join('')}
            </div>
            <div class="grid lg:grid-cols-5 gap-3">
                <div class="lg:col-span-3 card overflow-x-auto">
                    <div class="p-4 pb-2"><h4 class="font-semibold text-sm text-slate-800">En espera ahora (más antiguas primero)</h4></div>
                    <table class="w-full text-left text-xs">
                        <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                            <tr><th class="p-3">Actividad</th><th class="p-3">Responsable</th><th class="p-3">Esp.</th><th class="p-3">Motivo</th><th class="p-3">Desde</th><th class="p-3">Días</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${d.actuales.map(a => `<tr class="hover:bg-slate-50">
                                <td class="p-3"><span class="font-mono text-[10px] text-slate-400">${escapeHtml(a.t.codigo_contenedor || '')}</span> ${escapeHtml(a.t.actividad || '')}</td>
                                <td class="p-3">${escapeHtml(nombreResponsableDash(a.t))}</td>
                                <td class="p-3">${escapeHtml(a.esp)}</td>
                                <td class="p-3 ${a.motivo === 'Sin motivo' ? 'text-slate-400 italic' : ''}">${escapeHtml(a.motivo)}</td>
                                <td class="p-3 whitespace-nowrap">${a.desde ? fmtDate(a.desde) : '—'}</td>
                                <td class="p-3 font-bold ${a.dias >= 5 ? 'text-red-700' : a.dias >= 3 ? 'text-amber-700' : 'text-slate-700'}">${a.dias ?? '—'}</td>
                            </tr>`).join('') || '<tr><td colspan="6" class="text-center py-4 text-slate-400">No hay actividades en espera.</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <div class="lg:col-span-2 space-y-3">
                    ${bloquePareto('chart-pareto-bloqueos', 'Bloqueos por motivo', `${periodoTxt} · iniciados en el periodo`, d.pareto)}
                    ${d.porEsp.length ? `<div class="card p-4">
                        <h5 class="font-semibold text-xs text-slate-700 mb-2">Días promedio bloqueado por especialidad</h5>
                        <div class="flex flex-wrap gap-2">
                            ${d.porEsp.map(x => `<span class="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded"><b>${escapeHtml(x.esp)}</b>: ${x.prom} d · ${x.n} bloqueo${x.n === 1 ? '' : 's'}</span>`).join('')}
                        </div>
                    </div>` : ''}
                </div>
            </div>
        </div>`;
}

// ------------------------------------------------------------------
// PERSONAS
// ------------------------------------------------------------------
function perfilDe(uid) {
    return uid ? state.perfilesCache.find(x => x.id === uid) : null;
}

function nombreResponsableDash(t) {
    const p = perfilDe(t.responsable_id);
    return p ? nombreFormateado(p) : (t.responsable || 'Sin asignar');
}

// ------------------------------------------------------------------
// VISTA
// Orden de reporte: 1 Portafolio · 2 Operación de la semana · 3 Causas
// · 4 Restricciones · 5 Equipo. Cada cifra aparece una sola vez.
// ------------------------------------------------------------------
export function renderDashboard(container) {
    const hoyStr = hoyLima();
    const lunes = lunesDeSemana(hoyStr);
    const domingo = sumarDias(lunes, 6);

    const cerradasEstaSemana = state.tasksCache.filter(t => t.fecha_cierre && t.fecha_cierre >= lunes && t.fecha_cierre <= domingo);
    const cerradasTardeSemana = cerradasEstaSemana.filter(cerradaTarde).length;

    const reprogramadasEstaSemana = (state.reprogramacionesCache || []).filter(r => {
        if (r.es_migrada || !r.created_at) return false;
        const f = fmtLimaDia(r.created_at);
        return f >= lunes && f <= domingo;
    }).length;

    const latencia = latenciaPromedio(state.tasksCache, 8);
    const sa = semanaActualDashboard();
    const meta = metaPPC();

    const KPI = [
        (() => {
            if (!sa) return { label: 'PPC de la semana', value: '—', sub: 'sin datos', color: 'teal', icon: 'fa-chart-line' };
            const ad = Number(sa.adelantadas || 0);
            return {
                label: 'PPC de la semana',
                value: sa.ppc !== null && sa.ppc !== undefined ? sa.ppc + '%' : '—',
                sub: `${sa.cumplidas}/${sa.comprometidas} cumplidas${ad ? ` · +${ad} adelantadas` : ''} · meta ${meta}%`,
                color: sa.ppc !== null && sa.ppc !== undefined && Number(sa.ppc) < meta ? 'red' : 'teal', icon: 'fa-chart-line'
            };
        })(),
        { label: 'Cerradas esta semana', value: cerradasEstaSemana.length, sub: `${cerradasTardeSemana} con atraso vs. fin original`, color: 'emerald', icon: 'fa-circle-check' },
        { label: 'Reprogramadas', value: reprogramadasEstaSemana, sub: 'reprogramaciones esta semana', color: 'violet', icon: 'fa-calendar-plus' },
        { label: 'No planificadas', value: sa ? Number(sa.no_planificadas || 0) : '—', sub: sa ? `${Number(sa.horas_no_planificadas || 0).toFixed(1)} h esta semana` : 'sin datos', color: 'amber', icon: 'fa-bolt' },
        { label: 'Latencia', value: latencia.toFixed(1) + ' d', sub: 'atraso promedio vs. fin original · 8 sem', color: 'orange', icon: 'fa-hourglass-half' }
    ];

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Dashboard de Control BIM</h3>
                <p class="text-[11px] text-slate-500">Reporte del portafolio: estado, cumplimiento del plan, causas, restricciones y equipo.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>

        ${seccionPortafolio()}

        <h4 class="font-semibold text-sm text-slate-800 mb-2">Operación de la semana · ${fmtDate(lunes)} al ${fmtDate(domingo)}</h4>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            ${KPI.map(x => `
                <div class="card kpi-card p-3 border-l-4 border-${x.color}-500">
                    <div class="flex items-center justify-between">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">${x.label}</p>
                        <i class="fa-solid ${x.icon} text-${x.color}-500 text-xs"></i>
                    </div>
                    <p class="text-2xl font-bold mt-1 text-${x.color}-700">${x.value}</p>
                    <p class="text-[10px] text-slate-400">${x.sub}</p>
                </div>
            `).join('')}
        </div>

        <div class="card p-4 mb-4">
            <h4 class="font-semibold text-sm text-slate-800 mb-2">Evolución del PPC (últimas 8 semanas)</h4>
            <div class="chart-box" style="height: 250px;"><canvas id="chart-ppc"></canvas></div>
        </div>

        ${seccionComparacionSemanas()}

        ${seccionParetos()}

        ${seccionBloqueos()}

        <h4 class="font-semibold text-sm text-slate-800 mb-2">Equipo</h4>
        <div class="grid lg:grid-cols-2 gap-3 mb-4">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Carga de trabajo (actividades abiertas por responsable)</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-carga"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Vencidas por criticidad</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-vencidas"></canvas></div>
            </div>
        </div>

        ${seccionDesempeno()}
    `;

    renderCharts();
    renderParetos();
    renderPortafolio();
}

function renderCharts() {
    ['ppc', 'carga', 'vencidas'].forEach(k => { if (state.charts[k]) { state.charts[k].destroy(); state.charts[k] = null; } });
    const meta = metaPPC();

    // PPC de las últimas 8 semanas: mismo cálculo que la tabla (Supabase: dashboard_semanas)
    const semanasAsc = (state.semanasDashboard || []).slice().reverse();
    const labelsPPC = semanasAsc.map(w => `Sem ${fmtDate(w.semana).slice(0, 5)}`);
    const dataPPC = semanasAsc.map(w => (w.ppc === null || w.ppc === undefined) ? null : Number(w.ppc));
    const maxY = Math.max(110, ...dataPPC.filter(v => v !== null).map(v => Math.ceil(v / 10) * 10 + 10));

    state.charts.ppc = new Chart(document.getElementById('chart-ppc'), {
        type: 'line',
        data: {
            labels: labelsPPC,
            datasets: [
                {
                    label: 'PPC %', data: dataPPC,
                    borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,.1)', fill: true, tension: 0.3, spanGaps: true,
                    pointBackgroundColor: dataPPC.map(v => v !== null && v < meta ? '#dc2626' : '#0d9488'),
                    pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7, order: 1
                },
                {
                    label: `Meta ${meta}%`, data: labelsPPC.map(() => meta),
                    borderColor: '#dc2626', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0, order: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 10 } },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: c => c.datasetIndex === 1 ? `Meta: ${meta}%` : (c.parsed.y !== null ? `PPC: ${c.parsed.y}%` : 'Sin datos') } }
            },
            scales: {
                y: { beginAtZero: true, max: maxY, ticks: { stepSize: 10, callback: v => v + '%' } },
                x: { grid: { display: false } }
            }
        }
    });

    // Carga de trabajo: abiertas por persona (id del responsable, no el texto del nombre)
    const cargaMap = {};
    state.tasksCache.filter(t => !isCerrado(t)).forEach(t => {
        const k = t.responsable_id || `txt:${t.responsable || 'Sin asignar'}`;
        cargaMap[k] = cargaMap[k] || { nombre: nombreResponsableDash(t), n: 0 };
        cargaMap[k].n++;
    });
    const filasCarga = Object.values(cargaMap).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
    const totalCarga = filasCarga.reduce((s, x) => s + x.n, 0);

    state.charts.carga = new Chart(document.getElementById('chart-carga'), {
        type: 'bar',
        data: { labels: filasCarga.map(x => x.nombre), datasets: [{ label: 'Abiertas', data: filasCarga.map(x => x.n), backgroundColor: '#0284c7', borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => { const v = ctx.parsed.y; return `${v} actividad${v === 1 ? '' : 'es'} (${totalCarga ? (v * 100 / totalCarga).toFixed(1) : '0.0'}%)`; } } }
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
        }
    });

    const vencidas = state.tasksCache.filter(t => !isCerrado(t) && semaforo(t) === 'Vencida');
    const critLabels = ['Muy alto', 'Alto', 'Medio', 'Bajo'];
    const critValues = critLabels.map(c => vencidas.filter(t => getCriticidad(t) === c).length);
    const totalCrit = critValues.reduce((s, v) => s + v, 0);

    state.charts.vencidas = new Chart(document.getElementById('chart-vencidas'), {
        type: 'bar',
        data: { labels: critLabels, datasets: [{ label: 'Vencidas por criticidad', data: critValues, backgroundColor: ['#dc2626', '#ea580c', '#d97706', '#64748b'], borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => { const v = ctx.parsed.y; return `${v} vencida${v === 1 ? '' : 's'} (${totalCrit ? (v * 100 / totalCrit).toFixed(1) : '0.0'}%)`; } } }
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
        }
    });
}

// ------------------------------------------------------------------
// DESEMPEÑO POR RESPONSABLE
// PPC con la misma regla Last Planner del PPC semanal (Supabase:
// ppc_calcular_semana -> por_responsable). Semanas cerradas = foto congelada.
// ------------------------------------------------------------------
const SEMANAS_DESEMPENO = 4;

function seccionDesempeno() {
    const semanas = (state.semanasDashboard || []).slice(0, SEMANAS_DESEMPENO).reverse(); // antigua -> actual
    const hayPorResp = semanas.some(s => s.por_responsable && Object.keys(s.por_responsable).length);

    const esBimManager = (t) => (perfilDe(t.responsable_id)?.cargo || '').toLowerCase().includes('bim manager');
    const map = {};
    state.tasksCache.forEach(t => {
        if (esBimManager(t)) return;
        const p = perfilDe(t.responsable_id);
        const key = p ? p.id : (t.responsable ? `txt:${t.responsable}` : 'sin_asignar');
        if (!map[key]) map[key] = { key, nombre: p ? nombreFormateado(p) : (t.responsable || 'Sin asignar'), cargo: p?.cargo || '', a: 0, v: 0, c: 0, carga: 0 };
        if (isCerrado(t)) map[key].c++;
        else {
            map[key].a++;
            if (semaforo(t) === 'Vencida') map[key].v++;
            map[key].carga += WEIGHT[getCriticidad(t)] || 1;
        }
    });

    const ppcDe = (s, key) => s.por_responsable?.[key] || null;
    const celda = (x) => {
        if (!x || !Number(x.comprometidas)) return x && Number(x.adelantadas) ? `<span class="text-emerald-700 text-[10px]" title="Solo adelantadas">+${x.adelantadas}</span>` : '<span class="text-slate-300">—</span>';
        const ppc = Number(x.ppc);
        return `<span class="px-2 py-0.5 rounded font-bold ${clasePPC(ppc)}" title="${Number(x.cumplidas) + Number(x.adelantadas || 0)} de ${x.comprometidas} comprometidas">${ppc}%</span>`;
    };

    const filas = Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(m => {
        const pv = m.a ? Math.round((m.v / m.a) * 100) : 0;
        const xs = semanas.map(s => ppcDe(s, m.key));
        const comp = xs.reduce((acc, x) => acc + Number(x?.comprometidas || 0), 0);
        const ok = xs.reduce((acc, x) => acc + Number(x?.cumplidas || 0) + Number(x?.adelantadas || 0), 0);
        const acum = comp ? Math.round(ok * 100 / comp) : null;
        // Tendencia: última semana cerrada vs. la anterior
        const cerradas = semanas.filter(s => s.cerrada).map(s => ppcDe(s, m.key)).filter(x => x && Number(x.comprometidas));
        const tend = cerradas.length >= 2 ? deltaSemana(Number(cerradas[cerradas.length - 1].ppc), Number(cerradas[cerradas.length - 2].ppc), +1) : '';
        return `<tr class="hover:bg-slate-50">
            <td class="p-3">
                <div class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</div>
                <div class="text-[10px] text-slate-500">${escapeHtml(m.cargo || 'Sin cargo')}</div>
            </td>
            <td class="p-3">${m.a}</td>
            <td class="p-3 ${m.v ? 'text-red-600 font-bold' : ''}">${m.v}</td>
            <td class="p-3 ${pv >= 50 ? 'text-red-600' : pv > 0 ? 'text-amber-600' : ''}">${pv}%</td>
            <td class="p-3">${m.c}</td>
            ${xs.map(x => `<td class="p-3 text-center">${celda(x)}</td>`).join('')}
            <td class="p-3 text-center">${acum === null ? '<span class="text-slate-300">—</span>' : `<span class="px-2 py-0.5 rounded font-bold ${clasePPC(acum)}">${acum}%</span>`}</td>
            <td class="p-3 text-center">${tend}</td>
            <td class="p-3 font-bold text-slate-700">${m.carga}</td>
        </tr>`;
    }).join('');

    return `
        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Desempeño por responsable</h4>
                <p class="text-[11px] text-slate-500">PPC por responsable con la misma regla Last Planner del PPC semanal (compromiso del lunes, no planificadas y adelantadas). Semanas cerradas = foto congelada. Meta ${metaPPC()}%.</p>
                ${hayPorResp ? '' : '<p class="text-[11px] text-amber-700 mt-1">Aún no hay PPC por responsable: ejecuta sql/009_espera_bloqueos_ppc_responsable.sql en Supabase.</p>'}
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Responsable · Cargo</th>
                        <th class="p-3">Abiertas</th>
                        <th class="p-3">Vencidas</th>
                        <th class="p-3">% Venc.</th>
                        <th class="p-3">Cerradas</th>
                        ${semanas.map(s => `<th class="p-3 text-center whitespace-nowrap">PPC ${fmtDate(s.semana).slice(0, 5)}${s.cerrada ? '' : ' (actual)'}</th>`).join('')}
                        <th class="p-3 text-center" title="(cumplidas + adelantadas) ÷ comprometidas de las ${semanas.length} semanas">PPC ${semanas.length} sem</th>
                        <th class="p-3 text-center" title="Última semana cerrada vs. la anterior">Tend.</th>
                        <th class="p-3" title="Abiertas ponderadas por criticidad">Carga pond.</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${filas || `<tr><td colspan="${8 + semanas.length}" class="text-center py-4 text-slate-400">Sin datos</td></tr>`}
                </tbody>
            </table>
        </div>`;
}
