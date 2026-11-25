import { state } from './db.js';
import { esDiaLaborable } from './roster.js';
import { TIPOS_REPROGRAMACION } from './reprogramaciones.js';
import { WEIGHT, DAY, today, daysToDeadline, isCerrado, semaforo, escapeHtml, getCriticidad, fmtDate, nombreFormateado, isoLocal } from './utils.js';


function metricasReprogramaciones() {
    const rps = (state.reprogramacionesCache || []).filter(r => !r.es_migrada);
    const causas = state.causasTodasCache || state.causasCache || [];
    const porCausa = {}, porTipo = {};
    rps.forEach(r => {
        const n = r.causa_id ? (causas.find(c => Number(c.id) === Number(r.causa_id))?.nombre || 'Causa eliminada') : 'Sin causa';
        porCausa[n] = (porCausa[n] || 0) + 1;
        porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1;
    });
    const ord = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const dias = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY);
    const cerradas = state.tasksCache.filter(t => t.estado === 'Cerrado' && t.fecha_cierre && t.fecha_fin_original);
    const desvios = cerradas.map(t => dias(t.fecha_fin_original, t.fecha_cierre));
    const conRep = new Set(rps.map(r => r.pendiente_id));
    const avg = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : 0;
    return {
        total: rps.length,
        actividades: conRep.size,
        causas: ord(porCausa).slice(0, 6),
        tipos: ord(porTipo),
        cerradasN: cerradas.length,
        aTiempoOriginal: desvios.filter(d => d <= 0).length,
        desvioProm: avg(desvios),
        desvioPromReprog: avg(cerradas.filter(t => conRep.has(t.id)).map(t => dias(t.fecha_fin_original, t.fecha_cierre)))
    };
}

function seccionReprogramaciones() {
    const m = metricasReprogramaciones();
    const barras = (lista, color, etiqueta) => lista.length
        ? lista.map(([n, v]) => `
            <div class="mb-1.5">
                <div class="flex justify-between text-[11px] text-slate-600"><span class="truncate pr-2">${escapeHtml(etiqueta ? etiqueta(n) : n)}</span><span class="font-bold">${v}</span></div>
                <div class="h-1.5 rounded bg-slate-100"><div class="h-1.5 rounded" style="width:${Math.round(v / lista[0][1] * 100)}%;background:${color}"></div></div>
            </div>`).join('')
        : '<p class="text-[11px] text-slate-400 italic">Sin reprogramaciones registradas.</p>';
    const pct = m.cerradasN ? Math.round(m.aTiempoOriginal / m.cerradasN * 100) : 0;
    const signo = v => (v > 0 ? '+' : '') + v;
    return `
        <div class="card p-4 mb-4">
            <h4 class="font-semibold text-sm text-slate-800">Reprogramaciones</h4>
            <p class="text-[11px] text-slate-500 mb-3">${m.total} evento${m.total === 1 ? '' : 's'} en ${m.actividades} actividad${m.actividades === 1 ? '' : 'es'} (sin contar migradas).</p>
            <div class="grid md:grid-cols-3 gap-4">
                <div>
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Causas más frecuentes</p>
                    ${barras(m.causas, '#7c3aed')}
                </div>
                <div>
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Por tipo</p>
                    ${barras(m.tipos, '#F59E0B', t => TIPOS_REPROGRAMACION[t] || t)}
                </div>
                <div>
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Cierre real vs. plan original</p>
                    <p class="text-2xl font-bold text-slate-800">${pct}%</p>
                    <p class="text-[10px] text-slate-400 mb-2">cerradas en o antes del fin original (${m.aTiempoOriginal} de ${m.cerradasN})</p>
                    <p class="text-[11px] text-slate-600">Desvío promedio: <b>${signo(m.desvioProm)} d</b></p>
                    <p class="text-[11px] text-slate-600">Solo reprogramadas: <b>${signo(m.desvioPromReprog)} d</b></p>
                </div>
            </div>
        </div>
`;
}

// ------------------------------------------------------------------
// COMPARACIÓN ENTRE SEMANAS (datos de Supabase: dashboard_semanas)
// La semana en curso se calcula en vivo; las cerradas salen de la foto
// congelada el domingo 23:59 (hora de Lima). Ver sql/dashboard_ppc_especialidades.sql
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
        <div class="card overflow-x-auto mt-4">
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
                    ${filas || '<tr><td colspan="12" class="text-center py-4 text-slate-400">Aún no hay datos. Verifica que se haya ejecutado sql/dashboard_ppc_especialidades.sql en Supabase.</td></tr>'}
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

export function renderDashboard(container) {
    const k = calcularKPIs();
    
    const hoy = today();
    hoy.setHours(0,0,0,0);
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0,0,0,0);
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    finSemana.setHours(23,59,59,999);

    const cerradasEstaSemana = state.tasksCache.filter(t => {
        if (!t.fecha_cierre) return false;
        const c = new Date(t.fecha_cierre + 'T00:00:00');
        return c >= inicioSemana && c <= finSemana;
    });
    
    const reprogramadasEstaSemana = (state.reprogramacionesCache || []).filter(r => {
        if (r.es_migrada) return false;
        const f = new Date(r.created_at);
        return f >= inicioSemana && f <= finSemana;
    }).length;

    const vencidasSinCerrar = state.tasksCache.filter(t => 
        !isCerrado(t) && semaforo(t) === 'Vencida'
    ).length;

    const latenciaPromedio = (() => {
        const cerradas = state.tasksCache.filter(t => t.fecha_cierre && t.fecha_fin);
        const conAtraso = cerradas.filter(t => new Date(t.fecha_cierre + 'T00:00:00') > new Date(t.fecha_fin + 'T00:00:00'));
        if (conAtraso.length === 0) return 0;
        const suma = conAtraso.reduce((s, t) => {
            const dias = Math.round((new Date(t.fecha_cierre + 'T00:00:00') - new Date(t.fecha_fin + 'T00:00:00')) / DAY);
            return s + dias;
        }, 0);
        return suma / conAtraso.length;
    })();

    const KPI = [
        (() => {
            const sa = semanaActualDashboard();
            if (!sa) return { label: 'PPC Semanal', value: '—', sub: 'sin datos', color: 'teal', icon: 'fa-chart-line' };
            const ad = Number(sa.adelantadas || 0);
            return {
                label: 'PPC Semanal',
                value: sa.ppc !== null && sa.ppc !== undefined ? sa.ppc + '%' : '—',
                sub: `${sa.cumplidas}/${sa.comprometidas} cumplidas${ad ? ` · +${ad} adelantadas` : ''}`,
                color: 'teal', icon: 'fa-chart-line'
            };
        })(),
        { label: 'Abiertas', value: k.abiertas, sub: 'en curso', color: 'slate', icon: 'fa-list-check' },
        { label: 'Vencidas', value: k.vencidas, sub: 'fuera de plazo', color: 'red', icon: 'fa-triangle-exclamation' },
        { label: 'Por vencer', value: k.porVencer, sub: '≤ 7 días', color: 'amber', icon: 'fa-clock' },
        { label: 'Latencia', value: latenciaPromedio.toFixed(1) + ' d', sub: 'promedio de atraso', color: 'orange', icon: 'fa-hourglass-half' },
        { label: 'Total', value: k.total, sub: 'actividades', color: 'sky', icon: 'fa-cubes' }
    ];

    const COMPLEMENTARIAS = [
        { label: 'Cerradas esta semana', value: cerradasEstaSemana.length, sub: 'todas, a tiempo o tarde', color: 'emerald', icon: 'fa-circle-check' },
        { label: 'Reprogramadas', value: reprogramadasEstaSemana, sub: 'esta semana', color: 'violet', icon: 'fa-calendar-plus' },
        { label: 'Vencidas sin cerrar', value: vencidasSinCerrar, sub: 'requieren acción', color: 'red', icon: 'fa-bell' },
        { label: 'Sin fecha', value: k.sinFecha, sub: 'no vencen', color: 'slate', icon: 'fa-calendar-xmark' }
    ];

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Dashboard de Control BIM</h3>
                <p class="text-[11px] text-slate-500">Análisis de cumplimiento, latencia y salud del planeamiento.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
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

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            ${COMPLEMENTARIAS.map(x => `
                <div class="card p-3 border-l-4 border-${x.color}-500">
                    <div class="flex items-center justify-between">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">${x.label}</p>
                        <i class="fa-solid ${x.icon} text-${x.color}-500 text-xs"></i>
                    </div>
                    <p class="text-xl font-bold mt-1 text-${x.color}-700">${x.value}</p>
                    <p class="text-[10px] text-slate-400">${x.sub}</p>
                </div>
            `).join('')}
        </div>

        <div class="grid lg:grid-cols-3 gap-3 mb-4">
            <div class="card p-4 lg:col-span-2">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Evolución del PPC (últimas 8 semanas)</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-ppc"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Distribución por Estado</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-estados"></canvas></div>
            </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-3 mb-4">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Carga de Trabajo (Tareas Abiertas)</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-carga"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Vencidas por Criticidad</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-vencidas"></canvas></div>
            </div>
        </div>

        ${seccionReprogramaciones()}

        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Desempeño por Responsable</h4>
                <p class="text-[11px] text-slate-500">PPC calculado por semana de fecha_fin programada.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Responsable · Cargo</th>
                        <th class="p-3">Abiertas</th>
                        <th class="p-3">Vencidas</th>
                        <th class="p-3">% Venc.</th>
                        <th class="p-3">Cerradas</th>
                        <th class="p-3">PPC Semanal</th>
                        <th class="p-3">Carga Pond.</th>
                    </tr>
                </thead>
                <tbody id="perf-table" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>

        ${seccionComparacionSemanas()}
    `;

    renderCharts(inicioSemana, finSemana);
    renderPerfTable(inicioSemana, finSemana);
}

function calcularKPIs() {
    const total = state.tasksCache.length;
    const abiertas = state.tasksCache.filter(t => !isCerrado(t));
    const vencidas = abiertas.filter(t => semaforo(t) === 'Vencida');
    const porVencer = abiertas.filter(t => semaforo(t) === 'Por vencer');
    const sinFecha = abiertas.filter(t => !t.fecha_fin);

    const hoy = today();
    hoy.setHours(0, 0, 0, 0);
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0, 0, 0, 0);
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    finSemana.setHours(23, 59, 59, 999);

    const tareasSemana = state.tasksCache.filter(t => {
        if (!t.fecha_fin) return false;
        if (t.estado === 'Cancelado' || t.estado === 'Anulado') return false;
        const fin = new Date(t.fecha_fin + 'T00:00:00');
        if (fin < inicioSemana || fin > finSemana) return false;
        if (t.responsable_id && typeof esDiaLaborable === 'function') {
            if (!esDiaLaborable(t.responsable_id, t.fecha_fin)) return false;
        }
        return true;
    });

    const cumplidas = tareasSemana.filter(t => {
        if (!t.fecha_cierre) return false;
        return t.fecha_cierre <= t.fecha_fin;
    });

    const ppc = tareasSemana.length > 0
        ? Math.round((cumplidas.length / tareasSemana.length) * 100)
        : null;

    return {
        total,
        abiertas: abiertas.length,
        vencidas: vencidas.length,
        porVencer: porVencer.length,
        sinFecha: sinFecha.length,
        ppc,
        ppcTotal: tareasSemana.length,
        ppcEnPlazo: cumplidas.length
    };
}

function renderCharts(inicioSemana, finSemana) {
    if (state.charts.ppc) state.charts.ppc.destroy();
    if (state.charts.estados) state.charts.estados.destroy();
    if (state.charts.carga) state.charts.carga.destroy();
    if (state.charts.vencidas) state.charts.vencidas.destroy();

    // PPC de las últimas 8 semanas: mismo cálculo que la tabla (Supabase: dashboard_semanas)
    const semanasAsc = (state.semanasDashboard || []).slice().reverse();
    const labelsPPC = semanasAsc.map(w => `Sem ${fmtDate(w.semana).slice(0, 5)}`);
    const dataPPC = semanasAsc.map(w => (w.ppc === null || w.ppc === undefined) ? null : Number(w.ppc));

    state.charts.ppc = new Chart(document.getElementById('chart-ppc'), {
        type: 'line',
        data: {
            labels: labelsPPC,
            datasets: [
                {
                    label: 'PPC %',
                    data: dataPPC,
                    borderColor: '#0d9488',
                    backgroundColor: 'rgba(13,148,136,.1)',
                    fill: true,
                    tension: 0.3,
                    spanGaps: true,
                    pointBackgroundColor: '#0d9488',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    order: 1
                },
                {
                    label: 'Mínimo 80%',
                    data: labelsPPC.map(() => 80),
                    borderColor: '#dc2626',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    tension: 0,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 10 } },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: c => {
                            if (c.datasetIndex === 1) return 'Mínimo: 80%';
                            return c.parsed.y !== null ? `PPC: ${c.parsed.y}%` : 'Sin datos';
                        }
                    }
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    max: 110, 
                    ticks: { 
                        stepSize: 10,
                        callback: v => v > 100 ? '' : v + '%'
                    },
                    grid: {
                        color: (ctx) => {
                            if (ctx.tick && ctx.tick.value === 80) return 'rgba(220,38,38,0.4)';
                            if (ctx.tick && ctx.tick.value > 100) return 'rgba(0,0,0,0.02)';
                            return 'rgba(0,0,0,0.05)';
                        }
                    }
                }, 
                x: { grid: { display: false } } 
            }
        }
    });

    const estados = ['No iniciado', 'En proceso', 'En espera', 'Cerrado'];
    const counts = estados.map(e => state.tasksCache.filter(t => t.estado === e).length);
    const colores = ['#94a3b8', '#0284c7', '#f59e0b', '#0d9488'];
    const totalEstados = counts.reduce((s, v) => s + v, 0);

    state.charts.estados = new Chart(document.getElementById('chart-estados'), {
        type: 'doughnut',
        data: { 
            labels: estados, 
            datasets: [{ data: counts, backgroundColor: colores, borderWidth: 2, borderColor: '#fff' }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed;
                            const pct = totalEstados > 0 ? ((v / totalEstados) * 100).toFixed(1) : '0.0';
                            return `${ctx.label}: ${v} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    const cargaMap = {};
    state.tasksCache.filter(t => !isCerrado(t)).forEach(t => {
        const resp = t.responsable || 'Sin asignar';
        cargaMap[resp] = (cargaMap[resp] || 0) + 1;
    });
    const respLabels = Object.keys(cargaMap).sort();
    const respValues = respLabels.map(r => cargaMap[r]);
    const totalCarga = respValues.reduce((s, v) => s + v, 0);

    state.charts.carga = new Chart(document.getElementById('chart-carga'), {
        type: 'bar',
        data: { 
            labels: respLabels, 
            datasets: [{ label: 'Tareas Abiertas', data: respValues, backgroundColor: '#0284c7', borderRadius: 4 }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.y;
                            const pct = totalCarga > 0 ? ((v / totalCarga) * 100).toFixed(1) : '0.0';
                            return `${v} tarea${v === 1 ? '' : 's'} (${pct}%)`;
                        }
                    }
                }
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
        data: { 
            labels: critLabels, 
            datasets: [{ label: 'Vencidas por Criticidad', data: critValues, backgroundColor: ['#dc2626', '#ea580c', '#d97706', '#64748b'], borderRadius: 4 }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.y;
                            const pct = totalCrit > 0 ? ((v / totalCrit) * 100).toFixed(1) : '0.0';
                            return `${v} vencida${v === 1 ? '' : 's'} (${pct}%)`;
                        }
                    }
                }
            }, 
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } 
        }
    });
}

function renderPerfTable(inicioSemana, finSemana) {
    const map = {};

    const nombreDe = (t) => {
        if (t.responsable_id) {
            const p = state.perfilesCache.find(x => x.id === t.responsable_id);
            if (p) return { nombre: nombreFormateado(p), cargo: p.cargo || '', id: p.id };
        }
        return { nombre: t.responsable || 'Sin asignar', cargo: '', id: null };
    };

    const esBimManager = (t) => {
        if (!t.responsable_id) return false;
        const p = state.perfilesCache.find(x => x.id === t.responsable_id);
        if (!p) return false;
        const cargo = (p.cargo || '').toLowerCase();
        return cargo.includes('bim manager');
    };

    state.tasksCache.forEach(t => {
        if (esBimManager(t)) return;

        const info = nombreDe(t);
        const key = info.id || info.nombre;
        if (!map[key]) {
            map[key] = { nombre: info.nombre, cargo: info.cargo, a: 0, v: 0, c: 0, carga: 0, semanaTareas: 0, semanaCumplidas: 0 };
        }

        if (isCerrado(t)) {
            map[key].c++;
        } else {
            map[key].a++;
            if (semaforo(t) === 'Vencida') map[key].v++;
            map[key].carga += WEIGHT[getCriticidad(t)] || 1;
        }

        if (t.fecha_fin) {
            if (t.estado === 'Cancelado' || t.estado === 'Anulado') return;
            const f = new Date(t.fecha_fin + 'T00:00:00');
            if (f < inicioSemana || f > finSemana) return;

            map[key].semanaTareas++;
            if (t.fecha_cierre && t.fecha_cierre <= t.fecha_fin) {
                map[key].semanaCumplidas++;
            }
        }
    });

    document.getElementById('perf-table').innerHTML = Object.values(map)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(m => {
            const pv = m.a ? Math.round((m.v / m.a) * 100) : 0;
            const ppc = m.semanaTareas > 0
                ? Math.round((m.semanaCumplidas / m.semanaTareas) * 100)
                : null;
            return `<tr class="hover:bg-slate-50">
                <td class="p-3">
                    <div class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(m.cargo || 'Sin cargo')}</div>
                </td>
                <td class="p-3">${m.a}</td>
                <td class="p-3 ${m.v ? 'text-red-600 font-bold' : ''}">${m.v}</td>
                <td class="p-3 ${pv >= 50 ? 'text-red-600' : pv > 0 ? 'text-amber-600' : ''}">${pv}%</td>
                <td class="p-3">${m.c}</td>
                <td class="p-3">${ppc !== null ? `<span class="px-2 py-0.5 rounded font-bold ${ppc >= 80 ? 'bg-teal-100 text-teal-800' : ppc >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}">${ppc}%</span>` : '—'}</td>
                <td class="p-3 font-bold text-slate-700">${m.carga}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin datos</td></tr>';
}
