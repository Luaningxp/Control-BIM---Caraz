import { state } from './db.js';
import { WEIGHT, DAY, today, daysToDeadline, isCerrado, semaforo, escapeHtml } from './utils.js';

export function renderDashboard(container) {
    const k = calcularKPIs();
    
    // Render KPIs
    const KPI = [
        { label: 'PPC (28 días)', value: k.ppc !== null ? k.ppc + '%' : '—', sub: `${k.ppcEnPlazo}/${k.ppcTotal} en plazo`, color: 'teal', icon: 'fa-chart-line' },
        { label: 'Total', value: k.total, sub: 'contenedores', color: 'sky', icon: 'fa-cubes' },
        { label: 'Abiertas', value: k.abiertas, sub: 'en curso', color: 'slate', icon: 'fa-list-check' },
        { label: 'Vencidas', value: k.vencidas, sub: 'fuera de plazo', color: 'red', icon: 'fa-triangle-exclamation' },
        { label: 'Por vencer', value: k.porVencer, sub: '≤ 7 días', color: 'amber', icon: 'fa-clock' },
        { label: 'Sin fecha', value: k.sinFecha, sub: 'no vencen', color: 'slate', icon: 'fa-calendar-xmark' }
    ];

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Dashboard de métricas</h3>
                <p class="text-[11px] text-slate-500">PPC, cumplimiento, avance CDE y desempeño por responsable.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            ${KPI.map(x => `
                <div class="card kpi-card p-3">
                    <div class="flex items-center justify-between">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">${x.label}</p>
                        <i class="fa-solid ${x.icon} text-${x.color}-500 text-xs"></i>
                    </div>
                    <p class="text-2xl font-bold mt-1 text-${x.color}-700">${x.value}</p>
                    <p class="text-[10px] text-slate-400">${x.sub}</p>
                </div>
            `).join('')}
        </div>
        <div class="grid lg:grid-cols-3 gap-3 mb-4">
            <div class="card p-4 lg:col-span-2">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">PPC semanal (últimas 8 semanas)</h4>
                <div class="chart-box"><canvas id="chart-ppc"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Distribución por estado CDE</h4>
                <div class="chart-box"><canvas id="chart-cde"></canvas></div>
            </div>
        </div>
        <div class="grid lg:grid-cols-2 gap-3 mb-4">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Abiertas vs Vencidas por responsable</h4>
                <div class="chart-box"><canvas id="chart-resp"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Criticidad vs Estado operativo</h4>
                <div class="chart-box"><canvas id="chart-crit"></canvas></div>
            </div>
        </div>
        <div class="card overflow-x-auto">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Desempeño por responsable</h4>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Responsable</th><th class="p-3">Abiertas</th><th class="p-3">Vencidas</th>
                        <th class="p-3">% Venc.</th><th class="p-3">Cerradas</th><th class="p-3">PPC</th><th class="p-3">Carga</th>
                    </tr>
                </thead>
                <tbody id="perf-table" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>
    `;

    renderCharts();
    renderPerfTable();
}

function calcularKPIs() {
    const total = state.tasksCache.length;
    const abiertas = state.tasksCache.filter(t => !isCerrado(t));
    const vencidas = abiertas.filter(t => semaforo(t) === 'Vencida');
    const porVencer = abiertas.filter(t => semaforo(t) === 'Por vencer');
    const sinFecha = abiertas.filter(t => !t.fecha_fin);
    
    // PPC
    const ref = today();
    const inicio = new Date(ref.getTime() - 28 * DAY);
    const cerradas = state.tasksCache.filter(t => t.fecha_cierre && new Date(t.fecha_cierre + 'T00:00:00') >= inicio);
    const enPlazo = cerradas.filter(t => t.fecha_fin && new Date(t.fecha_cierre + 'T00:00:00') <= new Date(t.fecha_fin + 'T00:00:00'));
    
    return {
        total, abiertas: abiertas.length, vencidas: vencidas.length,
        porVencer: porVencer.length, sinFecha: sinFecha.length,
        ppc: cerradas.length ? Math.round((enPlazo.length / cerradas.length) * 100) : null,
        ppcTotal: cerradas.length, ppcEnPlazo: enPlazo.length
    };
}

function renderCharts() {
    // PPC Chart
    const labels = [], data = [];
    for (let i = 7; i >= 0; i--) {
        const ref = today();
        const inicio = new Date(ref.getTime() - (7 + i * 7) * DAY);
        const fin = new Date(ref.getTime() - i * 7 * DAY);
        const cerradas = state.tasksCache.filter(t => t.fecha_cierre && new Date(t.fecha_cierre + 'T00:00:00') >= inicio && new Date(t.fecha_cierre + 'T00:00:00') < fin);
        const enPlazo = cerradas.filter(t => t.fecha_fin && new Date(t.fecha_cierre + 'T00:00:00') <= new Date(t.fecha_fin + 'T00:00:00')).length;
        labels.push(`S-${i}`);
        data.push(cerradas.length ? Math.round((enPlazo / cerradas.length) * 100) : null);
    }
    if (state.charts.ppc) state.charts.ppc.destroy();
    state.charts.ppc = new Chart(document.getElementById('chart-ppc'), {
        type: 'line', data: { labels, datasets: [{ label: 'PPC %', data, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,.12)', fill: true, tension: .35, spanGaps: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });

    // CDE Chart
    const counts = ['WIP', 'Shared', 'Published', 'Archived'].map(e => state.tasksCache.filter(t => (t.estado_cde || 'WIP') === e).length);
    if (state.charts.cde) state.charts.cde.destroy();
    state.charts.cde = new Chart(document.getElementById('chart-cde'), {
        type: 'doughnut', data: { labels: ['WIP', 'Shared', 'Published', 'Archived'], datasets: [{ data: counts, backgroundColor: ['#94a3b8', '#f59e0b', '#14b8a6', '#64748b'], borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // Resp Chart
    const map = {};
    state.tasksCache.forEach(t => {
        const r = t.responsable || 'Sin asignar';
        if (!map[r]) map[r] = { a: 0, v: 0 };
        if (!isCerrado(t)) { map[r].a++; if (semaforo(t) === 'Vencida') map[r].v++; }
    });
    const resp = Object.keys(map).sort();
    if (state.charts.resp) state.charts.resp.destroy();
    state.charts.resp = new Chart(document.getElementById('chart-resp'), {
        type: 'bar', data: { labels: resp, datasets: [{ label: 'Abiertas', data: resp.map(r => map[r].a), backgroundColor: '#0284c7' }, { label: 'Vencidas', data: resp.map(r => map[r].v), backgroundColor: '#dc2626' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });

    // Crit Chart
    const CRIT = ['Muy alto', 'Alto', 'Medio', 'Bajo'];
    const EST = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];
    const colors = ['#94a3b8', '#0284c7', '#f59e0b', '#7c3aed', '#0d9488'];
    const datasets = EST.map((e, i) => ({
        label: e, data: CRIT.map(c => state.tasksCache.filter(t => t.criticidad === c && t.estado === e).length), backgroundColor: colors[i]
    }));
    if (state.charts.crit) state.charts.crit.destroy();
    state.charts.crit = new Chart(document.getElementById('chart-crit'), {
        type: 'bar', data: { labels: CRIT, datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });
}

function renderPerfTable() {
    const map = {};
    state.tasksCache.forEach(t => {
        const r = t.responsable || 'Sin asignar';
        if (!map[r]) map[r] = { a: 0, v: 0, c: 0, cp: 0, carga: 0 };
        if (isCerrado(t)) {
            map[r].c++;
            if (t.fecha_fin && t.fecha_cierre && new Date(t.fecha_cierre + 'T00:00:00') <= new Date(t.fecha_fin + 'T00:00:00')) map[r].cp++;
        } else {
            map[r].a++;
            if (semaforo(t) === 'Vencida') map[r].v++;
            map[r].carga += WEIGHT[t.criticidad] || 1;
        }
    });
    document.getElementById('perf-table').innerHTML = Object.keys(map).sort().map(r => {
        const m = map[r];
        const pv = m.a ? Math.round((m.v / m.a) * 100) : 0;
        const ppc = m.c ? Math.round((m.cp / m.c) * 100) : null;
        return `<tr>
            <td class="p-3 font-semibold">${escapeHtml(r)}</td>
            <td class="p-3">${m.a}</td>
            <td class="p-3 ${m.v ? 'text-red-600' : ''}">${m.v}</td>
            <td class="p-3">${pv}%</td>
            <td class="p-3">${m.c}</td>
            <td class="p-3">${ppc !== null ? ppc + '%' : '—'}</td>
            <td class="p-3">${m.carga.toFixed(1)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin datos</td></tr>';
}
