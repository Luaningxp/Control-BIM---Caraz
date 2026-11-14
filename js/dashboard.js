import { state } from './db.js';
import { esDiaLaborable } from './roster.js';
import { WEIGHT, DAY, today, daysToDeadline, isCerrado, semaforo, escapeHtml, getCriticidad, fmtDate, nombreFormateado } from './utils.js';

export function renderDashboard(container) {
    if (window.guardarSnapshotSemanal) {
        window.guardarSnapshotSemanal().catch(() => {});
        import { esDiaLaborable as _esDiaLaborable } from './roster.js';
window.__rosterHelpers = { esDiaLaborable: _esDiaLaborable };
    }

    const k = calcularKPIs();
    
    const hoy = new Date();
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
    
    const reprogramadasEstaSemana = state.tasksCache.filter(t => {
        if (t.estado !== 'Reprogramado') return false;
        if (!t.fecha_fin) return false;
        const f = new Date(t.fecha_fin + 'T00:00:00');
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
        { label: 'PPC Semanal', value: k.ppc !== null ? k.ppc + '%' : '—', sub: `${k.ppcEnPlazo}/${k.ppcTotal} cerradas a tiempo`, color: 'teal', icon: 'fa-chart-line' },
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

        <div class="card overflow-x-auto mt-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Comparación entre semanas</h4>
                <p class="text-[11px] text-slate-500">Snapshots guardados al abrir el dashboard. La semana actual se actualiza; las anteriores quedan fijas.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Semana</th>
                        <th class="p-3">Total</th>
                        <th class="p-3">Abiertas</th>
                        <th class="p-3">Vencidas</th>
                        <th class="p-3">Por vencer</th>
                        <th class="p-3">PPC</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">Planos WIP</th>
                        <th class="p-3">Planos Shared</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${(state.snapshotsCache || []).slice(0, 8).map((s, i, arr) => {
                        const prev = arr[i + 1];
                        const delta = (val, prevVal) => {
                            if (prevVal === undefined || prevVal === null) return '';
                            const d = val - prevVal;
                            if (d === 0) return '<span class="text-slate-400">=</span>';
                            return d > 0 ? `<span class="text-red-600">▲${d}</span>` : `<span class="text-emerald-600">▼${Math.abs(d)}</span>`;
                        };
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 font-mono">${fmtDate(s.semana)}</td>
                            <td class="p-3">${s.total_tareas}</td>
                            <td class="p-3">${s.abiertas} ${delta(s.abiertas, prev?.abiertas)}</td>
                            <td class="p-3 font-bold ${s.vencidas > 0 ? 'text-red-700' : ''}">${s.vencidas} ${delta(s.vencidas, prev?.vencidas)}</td>
                            <td class="p-3">${s.por_vencer} ${delta(s.por_vencer, prev?.por_vencer)}</td>
                            <td class="p-3 font-bold">${s.ppc !== null ? s.ppc + '%' : '—'} ${prev?.ppc !== null && prev?.ppc !== undefined && s.ppc !== null ? delta(s.ppc, prev.ppc) : ''}</td>
                            <td class="p-3">${s.horas_semana?.toFixed(1) || '0.0'} h</td>
                            <td class="p-3">${s.planos_wip}</td>
                            <td class="p-3">${s.planos_shared}</td>
                        </tr>`;
                    }).join('') || '<tr><td colspan="9" class="text-center py-4 text-slate-400">Aún no hay snapshots. Se guardará uno al abrir el dashboard.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    renderCharts(inicioSemana, finSemana);
    renderPerfTable(inicioSemana, finSemana);
}

function calcularKPIs() {
    // Import dinámico para no acoplar dashboard.js con roster.js en el top del archivo
    // (roster.js importa db.js; esto evita ciclos si en el futuro cambia).
    // En la práctica es sincrónico porque ya está cargado.
    const { esDiaLaborable } = window.__rosterHelpers || { esDiaLaborable: () => true };

    const total = state.tasksCache.length;
    const abiertas = state.tasksCache.filter(t => !isCerrado(t));
    const vencidas = abiertas.filter(t => semaforo(t) === 'Vencida');
    const porVencer = abiertas.filter(t => semaforo(t) === 'Por vencer');
    const sinFecha = abiertas.filter(t => !t.fecha_fin);

    // Rango de la semana actual (lunes a domingo)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0, 0, 0, 0);
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    finSemana.setHours(23, 59, 59, 999);

    // PPC correcto:
    //  - Universo: tareas con fecha_fin DENTRO de la semana actual.
    //  - Se excluyen las canceladas/anuladas si existiera un estado así.
    //    (Hoy no existe, pero dejamos el filtro por robustez.)
    //  - Una tarea cuenta como "cumplida" si su fecha_cierre cae ANTES
    //    o EL MISMO día que fecha_fin (no "antes del domingo").
    //    Cerrar el viernes una tarea que vencía el miércoles NO es cumplir.
    //  - Se respeta el roster: si el día de fecha_fin NO era laborable
    //    para el responsable, la tarea no entra al denominador
    //    (no se puede incumplir un plazo en día no laborable).
    const tareasSemana = state.tasksCache.filter(t => {
        if (!t.fecha_fin) return false;
        if (t.estado === 'Cancelado' || t.estado === 'Anulado') return false;

        const fin = new Date(t.fecha_fin + 'T00:00:00');
        if (fin < inicioSemana || fin > finSemana) return false;

        // Respetar roster solo si tenemos el helper y responsable_id
        if (t.responsable_id && typeof esDiaLaborable === 'function') {
            if (!esDiaLaborable(t.responsable_id, t.fecha_fin)) return false;
        }
        return true;
    });

    const cumplidas = tareasSemana.filter(t => {
        if (!t.fecha_cierre) return false;
        return t.fecha_cierre <= t.fecha_fin; // cierre antes o igual al fin programado
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

    const labelsPPC = [];
    const dataPPC = [];
    for (let i = 7; i >= 0; i--) {
        const inicio = new Date(inicioSemana);
        inicio.setDate(inicio.getDate() - i * 7);
        const fin = new Date(inicio);
        fin.setDate(inicio.getDate() + 6);
        fin.setHours(23,59,59,999);

        const tareasSemana = state.tasksCache.filter(t => {
            if (!t.fecha_fin) return false;
            const f = new Date(t.fecha_fin + 'T00:00:00');
            return f >= inicio && f <= fin;
        });

        const cumplidas = tareasSemana.filter(t => {
            if (!t.fecha_cierre) return false;
            const c = new Date(t.fecha_cierre + 'T00:00:00');
            return c <= fin;
        });

        labelsPPC.push(`Sem ${inicio.getDate()}/${inicio.getMonth()+1}`);
        dataPPC.push(tareasSemana.length > 0 ? Math.round((cumplidas.length / tareasSemana.length) * 100) : null);
    }

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

        const estados = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];
    const counts = estados.map(e => state.tasksCache.filter(t => t.estado === e).length);
    const colores = ['#94a3b8', '#0284c7', '#f59e0b', '#7c3aed', '#0d9488'];
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
            const f = new Date(t.fecha_fin + 'T00:00:00');
            if (f >= inicioSemana && f <= finSemana) {
                map[key].semanaTareas++;
                if (t.fecha_cierre && new Date(t.fecha_cierre + 'T00:00:00') <= finSemana) {
                    map[key].semanaCumplidas++;
                }
            }
        }
    });

    document.getElementById('perf-table').innerHTML = Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(m => {
        const pv = m.a ? Math.round((m.v / m.a) * 100) : 0;
        const ppc = m.semanaTareas > 0 ? Math.round((m.semanaCumplidas / m.semanaTareas) * 100) : null;
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
