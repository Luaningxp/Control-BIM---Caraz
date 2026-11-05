import { state } from './db.js';
import { fmtDate, escapeHtml, nombreResponsable, semaforo, isCerrado, getCriticidad } from './utils.js';

const DAY = 86400000;

// Función para obtener el lunes de una fecha dada
function getMonday(d) {
    d = new Date(d);
    const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajuste para domingo
    const monday = new Date(d.setDate(diff));
    monday.setHours(0,0,0,0);
    return monday;
}

// Función para obtener el viernes de la misma semana (o domingo)
function getWeekEnd(monday) {
    const end = new Date(monday);
    end.setDate(monday.getDate() + 6); // Domingo
    end.setHours(23,59,59,999);
    return end;
}

export function renderDashboard(container) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const currentWeekStart = getMonday(today);

    // --- CÁLCULO DE KPIs ---
    const total = state.tasksCache.length;
    const abiertas = state.tasksCache.filter(t => !isCerrado(t));
    const vencidas = abiertas.filter(t => semaforo(t) === 'Vencida');
    const porVencer = abiertas.filter(t => semaforo(t) === 'Por vencer');
    
    // PPC SEMANAL (Lunes a Domingo)
    // Contamos las tareas cerradas en la semana actual
    let cerradasEstaSemana = 0;
    let cerradasEnPlazoEstaSemana = 0;

    state.tasksCache.forEach(t => {
        if (t.fecha_cierre) {
            const dCierre = new Date(t.fecha_cierre + 'T00:00:00');
            if (dCierre >= currentWeekStart && dCierre < getWeekEnd(currentWeekStart)) {
                cerradasEstaSemana++;
                if (t.fecha_fin && new Date(t.fecha_cierre + 'T00:00:00') <= new Date(t.fecha_fin + 'T00:00:00')) {
                    cerradasEnPlazoEstaSemana++;
                }
            }
        }
    });

    const ppcActual = cerradasEstaSemana > 0 ? Math.round((cerradasEnPlazoEstaSemana / cerradasEstaSemana) * 100) : 0;

    // KPI de Latencia (Días de retraso promedio en tareas cerradas esta semana)
    let sumaDiasRetraso = 0;
    let tareasConRetraso = 0;
    state.tasksCache.forEach(t => {
        if (t.fecha_cierre && t.fecha_fin) {
            const dCierre = new Date(t.fecha_cierre + 'T00:00:00');
            const dFin = new Date(t.fecha_fin + 'T00:00:00');
            if (dCierre > dFin) {
                sumaDiasRetraso += Math.round((dCierre - dFin) / DAY);
                tareasConRetraso++;
            }
        }
    });
    const latenciaPromedio = tareasConRetraso > 0 ? (sumaDiasRetraso / tareasConRetraso).toFixed(1) : 0;

    // KPI de Carga (Tareas abiertas por persona)
    const cargaPorPersona = {};
    abiertas.forEach(t => {
        const resp = nombreResponsable(t, state.perfilesCache);
        cargaPorPersona[resp] = (cargaPorPersona[resp] || 0) + 1;
    });

    // Gráficos
    const KPI = [
        { label: 'PPC Actual (Semanal)', value: ppcActual + '%', sub: `${cerradasEnPlazoEstaSemana}/${cerradasEstaSemana} a tiempo`, color: 'teal', icon: 'fa-chart-line' },
        { label: 'Latencia Promedio', value: latenciaPromedio + ' d', sub: 'Días de retraso', color: 'rose', icon: 'fa-clock-rotate-left' },
        { label: 'Abiertas', value: abiertas.length, sub: 'en curso', color: 'slate', icon: 'fa-list-check' },
        { label: 'Vencidas', value: vencidas.length, sub: 'fuera de plazo', color: 'red', icon: 'fa-triangle-exclamation' },
        { label: 'Por vencer', value: porVencer.length, sub: '≤ 7 días', color: 'amber', icon: 'fa-clock' },
        { label: 'Total', value: total, sub: 'contenedores', color: 'sky', icon: 'fa-cubes' }
    ];

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Dashboard de Control BIM</h3>
                <p class="text-[11px] text-slate-500">Análisis de cumplimiento y latencia (Cerradas de Lunes a Domingo).</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>

        <!-- KPIs SUPERIORES -->
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

        <!-- GRÁFICOS FILA 1 -->
        <div class="grid lg:grid-cols-3 gap-3 mb-4">
            <div class="card p-4 lg:col-span-2">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Evolución del PPC (Últimas 8 semanas)</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-ppc"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Distribución por Estado</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-estados"></canvas></div>
            </div>
        </div>

        <!-- GRÁFICOS FILA 2 -->
        <div class="grid lg:grid-cols-2 gap-3">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Carga de Trabajo (Tareas Abiertas por Responsable)</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-carga"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Motivos de Vencimiento (Criticidad)</h4>
                <div class="chart-box" style="height: 250px;"><canvas id="chart-vencidas"></canvas></div>
            </div>
        </div>

        <!-- TABLA DE DESEMPEÑO -->
        <div class="card overflow-x-auto mt-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Desempeño por Responsable</h4>
                <p class="text-[11px] text-slate-500">Cerradas en fecha / Cerradas totales (Histórico).</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Responsable</th><th class="p-3">Abiertas</th><th class="p-3">Vencidas</th>
                        <th class="p-3">% Venc.</th><th class="p-3">Cerradas</th><th class="p-3">PPC Histórico</th><th class="p-3">Carga Pond.</th>
                    </tr>
                </thead>
                <tbody id="perf-table" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>
    `;

    renderCharts(state, currentWeekStart);
    renderPerfTable();
}

function renderCharts(state, currentWeekStart) {
    // Destruir gráficos anteriores si existen
    if (state.charts.ppc) state.charts.ppc.destroy();
    if (state.charts.estados) state.charts.estados.destroy();
    if (state.charts.carga) state.charts.carga.destroy();
    if (state.charts.vencidas) state.charts.vencidas.destroy();

    // 1. Gráfico PPC Semanal (Lunes a Domingo)
    const labelsPPC = [];
    const dataPPC = [];
    
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(weekStart.getDate() - (i * 7));
        const weekEnd = getWeekEnd(weekStart);
        
        const cerradasSemana = state.tasksCache.filter(t => {
            if (!t.fecha_cierre) return false;
            const d = new Date(t.fecha_cierre + 'T00:00:00');
            return d >= weekStart && d <= weekEnd;
        });
        
        const enPlazo = cerradasSemana.filter(t => t.fecha_fin && new Date(t.fecha_cierre + 'T00:00:00') <= new Date(t.fecha_fin + 'T00:00:00')).length;
        const ppc = cerradasSemana.length > 0 ? Math.round((enPlazo / cerradasSemana.length) * 100) : null;
        
        labelsPPC.push(`Sem ${weekStart.getDate()}/${weekStart.getMonth()+1}`);
        dataPPC.push(ppc);
    }

    state.charts.ppc = new Chart(document.getElementById('chart-ppc'), {
        type: 'line',
        data: {
            labels: labelsPPC,
            datasets: [{
                label: 'PPC %',
                data: dataPPC,
                borderColor: '#0d9488',
                backgroundColor: 'rgba(13,148,136,.1)',
                fill: true,
                tension: 0.3,
                spanGaps: true,
                pointBackgroundColor: '#0d9488'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y !== null ? c.parsed.y + '%' : 'Sin datos' } } },
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
        }
    });

    // 2. Gráfico Distribución por Estado
    const estados = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];
    const counts = estados.map(e => state.tasksCache.filter(t => t.estado === e).length);
    const colores = ['#94a3b8', '#0284c7', '#f59e0b', '#7c3aed', '#0d9488'];

    state.charts.estados = new Chart(document.getElementById('chart-estados'), {
        type: 'doughnut',
        data: { labels: estados, datasets: [{ data: counts, backgroundColor: colores, borderWidth: 2, borderColor: '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });

    // 3. Gráfico Carga por Responsable
    const cargaMap = {};
    state.tasksCache.filter(t => !isCerrado(t)).forEach(t => {
        const resp = nombreResponsable(t, state.perfilesCache);
        cargaMap[resp] = (cargaMap[resp] || 0) + 1;
    });
    const respLabels = Object.keys(cargaMap).sort();
    const respValues = respLabels.map(r => cargaMap[r]);

    state.charts.carga = new Chart(document.getElementById('chart-carga'), {
        type: 'bar',
        data: { labels: respLabels, datasets: [{ label: 'Tareas Abiertas', data: respValues, backgroundColor: '#0284c7', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });

    // 4. Gráfico de Vencidas por Criticidad
    const vencidas = state.tasksCache.filter(t => !isCerrado(t) && semaforo(t) === 'Vencida');
    const critLabels = ['Muy alto', 'Alto', 'Medio', 'Bajo'];
    const critValues = critLabels.map(c => vencidas.filter(t => getCriticidad(t) === c).length);
    
    state.charts.vencidas = new Chart(document.getElementById('chart-vencidas'), {
        type: 'bar',
        data: { labels: critLabels, datasets: [{ label: 'Vencidas por Criticidad', data: critValues, backgroundColor: ['#dc2626', '#ea580c', '#d97706', '#64748b'], borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });
}

function renderPerfTable() {
    const map = {};
    state.tasksCache.forEach(t => {
        const r = nombreResponsable(t, state.perfilesCache);
        if (!map[r]) map[r] = { a: 0, v: 0, c: 0, cp: 0, carga: 0 };
        if (isCerrado(t)) {
            map[r].c++;
            if (t.fecha_fin && t.fecha_cierre && new Date(t.fecha_cierre + 'T00:00:00') <= new Date(t.fecha_fin + 'T00:00:00')) map[r].cp++;
        } else {
            map[r].a++;
            if (semaforo(t) === 'Vencida') map[r].v++;
            map[r].carga += getCriticidad(t) === 'Muy alto' ? 3 : getCriticidad(t) === 'Alto' ? 2 : 1;
        }
    });

    document.getElementById('perf-table').innerHTML = Object.keys(map).sort().map(r => {
        const m = map[r];
        const pv = m.a ? Math.round((m.v / m.a) * 100) : 0;
        const ppc = m.c ? Math.round((m.cp / m.c) * 100) : null;
        return `<tr class="hover:bg-slate-50">
            <td class="p-3 font-semibold">${escapeHtml(r)}</td>
            <td class="p-3">${m.a}</td>
            <td class="p-3 ${m.v ? 'text-red-600 font-bold' : ''}">${m.v}</td>
            <td class="p-3 ${pv >= 50 ? 'text-red-600' : pv > 0 ? 'text-amber-600' : ''}">${pv}%</td>
            <td class="p-3">${m.c}</td>
            <td class="p-3">${ppc !== null ? `<span class="px-2 py-0.5 rounded font-bold ${ppc >= 80 ? 'bg-teal-100 text-teal-800' : ppc >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}">${ppc}%</span>` : '—'}</td>
            <td class="p-3 font-bold text-slate-700">${m.carga}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin datos</td></tr>';
}
