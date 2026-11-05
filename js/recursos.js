import { state } from './db.js';
import { fmtDate, escapeHtml, nombreFormateado, getIniciales, colorAvatar } from './utils.js';

export function renderRecursos(container) {
    const registros = state.manpowerCache.filter(m => 
        state.isAdmin || state.isCoordinador || state.isSupervisor || m.usuario_id === state.currentUser.id
    );

    if (registros.length === 0) {
        container.innerHTML = `<div class="card p-8 text-center text-slate-500">
            <p class="text-sm font-semibold mb-1">Aún no hay registros de horas</p>
            <p class="text-xs">Cuando los modeladores registren sus horas en la pestaña MANPOWER, aquí verás el análisis.</p>
        </div>`;
        return;
    }

    // --- FECHAS DE REFERENCIA ---
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    // Inicio de la semana actual (lunes)
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0,0,0,0);
    
    // Inicio del mes actual
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // --- CÁLCULO DE MÉTRICAS ---
    const parseH = (h) => parseFloat(h || 0);

    const horasMes = registros
        .filter(r => r.fecha && new Date(r.fecha + 'T00:00:00') >= inicioMes)
        .reduce((s, r) => s + parseH(r.horas), 0);

    const horasSemana = registros
        .filter(r => r.fecha && new Date(r.fecha + 'T00:00:00') >= inicioSemana)
        .reduce((s, r) => s + parseH(r.horas), 0);

    // Agrupación por modelador
    const porModelador = {};
    registros.forEach(r => {
        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
        const nombre = p ? nombreFormateado(p) : 'Desconocido';
        if (!porModelador[nombre]) porModelador[nombre] = { horas: 0, registros: 0, avatar: p ? p.id : null };
        porModelador[nombre].horas += parseH(r.horas);
        porModelador[nombre].registros += 1;
    });

    const ordenados = Object.entries(porModelador).sort((a,b) => b[1].horas - a[1].horas);
    const masCargado = ordenados[0] || ['—', { horas: 0 }];
    const menosCargado = ordenados[ordenados.length - 1] || ['—', { horas: 0 }];
    const totalHoras = ordenados.reduce((s, [, d]) => s + d.horas, 0);

    // Concentración: % de horas del top 3
    const top3Horas = ordenados.slice(0, 3).reduce((s, [, d]) => s + d.horas, 0);
    const concentracion = totalHoras > 0 ? Math.round((top3Horas / totalHoras) * 100) : 0;

    // Promedio semanal (basado en las semanas con registros)
    const semanasUnicas = new Set();
    registros.forEach(r => {
        if (!r.fecha) return;
        const d = new Date(r.fecha + 'T00:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const lunes = new Date(d.setDate(diff));
        semanasUnicas.add(lunes.toISOString().split('T')[0]);
    });
    const promedioSemanal = semanasUnicas.size > 0 ? (totalHoras / semanasUnicas.size).toFixed(1) : 0;

    // Agrupación por actividad
    const porActividad = {};
    registros.forEach(r => {
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        const act = t ? t.actividad : 'General (sin actividad)';
        if (!porActividad[act]) porActividad[act] = 0;
        porActividad[act] += parseH(r.horas);
    });

    // Agrupación por semana (últimas 8)
    const semanas = {};
    registros.forEach(r => {
        if (!r.fecha) return;
        const d = new Date(r.fecha + 'T00:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const lunes = new Date(d.setDate(diff));
        const key = lunes.toISOString().split('T')[0];
        if (!semanas[key]) semanas[key] = 0;
        semanas[key] += parseH(r.horas);
    });
    const semanasOrdenadas = Object.keys(semanas).sort().slice(-8);

    // --- RENDERIZADO ---
    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Monitoreo de Horas Hombre</h3>
                <p class="text-[11px] text-slate-500">Distribución, concentración y tendencia del esfuerzo del equipo.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>

        <!-- KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div class="card kpi-card p-3 border-l-4 border-sky-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Horas del Mes</p>
                <p class="text-2xl font-bold mt-1 text-sky-700">${horasMes.toFixed(1)} h</p>
                <p class="text-[10px] text-slate-400">Mes en curso</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-teal-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Horas de la Semana</p>
                <p class="text-2xl font-bold mt-1 text-teal-700">${horasSemana.toFixed(1)} h</p>
                <p class="text-[10px] text-slate-400">Lun - Dom</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-rose-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Más Cargado</p>
                <p class="text-lg font-bold mt-1 text-rose-700 truncate" title="${escapeHtml(masCargado[0])}">${escapeHtml(masCargado[0])}</p>
                <p class="text-[10px] text-slate-400">${masCargado[1].horas.toFixed(1)} h</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-amber-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Menos Cargado</p>
                <p class="text-lg font-bold mt-1 text-amber-700 truncate" title="${escapeHtml(menosCargado[0])}">${escapeHtml(menosCargado[0])}</p>
                <p class="text-[10px] text-slate-400">${menosCargado[1].horas.toFixed(1)} h</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-violet-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Promedio/Semana</p>
                <p class="text-2xl font-bold mt-1 text-violet-700">${promedioSemanal} h</p>
                <p class="text-[10px] text-slate-400">Entre el equipo</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 ${concentracion >= 70 ? 'border-red-500' : concentracion >= 50 ? 'border-amber-500' : 'border-emerald-500'}">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Concentración Top 3</p>
                <p class="text-2xl font-bold mt-1 ${concentracion >= 70 ? 'text-red-700' : concentracion >= 50 ? 'text-amber-700' : 'text-emerald-700'}">${concentracion}%</p>
                <p class="text-[10px] text-slate-400">Del total</p>
            </div>
        </div>

        <!-- Gráficos -->
        <div class="grid lg:grid-cols-3 gap-3 mb-4">
            <div class="card p-4 lg:col-span-2">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Horas por semana (últimas 8)</h4>
                <div class="chart-box" style="height: 240px;"><canvas id="chart-horas-semana"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Distribución del esfuerzo</h4>
                <div class="chart-box" style="height: 240px;"><canvas id="chart-top-modeladores"></canvas></div>
            </div>
        </div>

        <!-- Tabla por modelador -->
        <div class="card overflow-x-auto">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Horas registradas por modelador</h4>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">% del total</th>
                        <th class="p-3">Registros</th>
                        <th class="p-3">Prom./Registro</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${ordenados.map(([nombre, data]) => {
                        const pct = totalHoras > 0 ? Math.round((data.horas / totalHoras) * 100) : 0;
                        const prom = (data.horas / data.registros).toFixed(1);
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full ${colorAvatar(data.avatar || nombre)} text-white text-[9px] font-bold flex items-center justify-center">
                                    ${getIniciales(nombre).toUpperCase()}
                                </div>
                                <span class="font-semibold text-slate-800">${escapeHtml(nombre)}</span>
                            </td>
                            <td class="p-3 font-bold text-sky-700">${data.horas.toFixed(1)} h</td>
                            <td class="p-3">
                                <div class="flex items-center gap-2">
                                    <div class="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                        <div class="h-full bg-sky-500" style="width: ${pct}%"></div>
                                    </div>
                                    <span class="text-slate-600">${pct}%</span>
                                </div>
                            </td>
                            <td class="p-3">${data.registros}</td>
                            <td class="p-3">${prom} h</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <!-- Tabla por actividad -->
        <div class="card overflow-x-auto mt-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Actividades con más horas invertidas</h4>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Actividad</th>
                        <th class="p-3">Horas Totales</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.entries(porActividad).sort((a,b) => b[1] - a[1]).slice(0, 15).map(([act, horas]) => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-700 max-w-md truncate" title="${escapeHtml(act)}">${escapeHtml(act)}</td>
                            <td class="p-3 font-bold text-sky-700">${horas.toFixed(1)} h</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Destruir gráficos previos
    if (state.charts.horasSemana) state.charts.horasSemana.destroy();
    if (state.charts.topModeladores) state.charts.topModeladores.destroy();

    // Gráfico por semana
    state.charts.horasSemana = new Chart(document.getElementById('chart-horas-semana'), {
        type: 'bar',
        data: {
            labels: semanasOrdenadas.map(s => {
                const d = new Date(s + 'T00:00:00');
                return `Sem ${d.getDate()}/${d.getMonth()+1}`;
            }),
            datasets: [{
                label: 'Horas',
                data: semanasOrdenadas.map(s => semanas[s].toFixed(1)),
                backgroundColor: '#0284c7',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => v + ' h' } }, x: { grid: { display: false } } }
        }
    });

    // Gráfico distribución por modelador (doughnut)
    const topModeladores = ordenados.slice(0, 6);
    state.charts.topModeladores = new Chart(document.getElementById('chart-top-modeladores'), {
        type: 'doughnut',
        data: {
            labels: topModeladores.map(m => m[0]),
            datasets: [{
                data: topModeladores.map(m => m[1].horas.toFixed(1)),
                backgroundColor: ['#0284c7', '#0d9488', '#f59e0b', '#7c3aed', '#dc2626', '#64748b'],
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
        }
    });
}
