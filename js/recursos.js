import { state } from './db.js';
import { fmtDate, escapeHtml, nombreFormateado, getIniciales, colorAvatar } from './utils.js';

export function renderRecursos(container) {
    // Todos los registros (admin/coord ven todo, modelador solo lo suyo)
    const registros = state.manpowerCache.filter(m => 
        state.isAdmin || state.isCoordinador || state.isSupervisor || m.usuario_id === state.currentUser.id
    );

    if (registros.length === 0) {
        container.innerHTML = `<div class="card p-8 text-center text-slate-500">
            <p class="text-sm font-semibold mb-1">Aún no hay registros de %</p>
            <p class="text-xs">Cuando los modeladores registren su % diario, aquí verás el análisis.</p>
        </div>`;
        return;
    }

    // --- FECHAS DE REFERENCIA ---
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0,0,0,0);
    
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // --- CÁLCULO DE % REGISTRADO POR DÍA ---
    // Para verificar que cada modelador llenó el 100% cada día hábil
    const pctPorUsuarioDia = {};
    registros.forEach(r => {
        const key = `${r.usuario_id}|${r.fecha}`;
        if (!pctPorUsuarioDia[key]) pctPorUsuarioDia[key] = 0;
        pctPorUsuarioDia[key] += parseFloat(r.porcentaje_dia || 0);
    });

    // Para cada modelador, contar cuántos días hábiles del mes registró 100%
    const modeladores = state.perfilesCache.filter(p => 
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    );

    const diasDelMes = [];
    const cursor = new Date(inicioMes);
    while (cursor <= hoy) {
        if (cursor.getDay() !== 0) { // Excluir domingos
            diasDelMes.push(cursor.toISOString().split('T')[0]);
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    const cumplimientoPorModelador = {};
    modeladores.forEach(p => {
        const diasCumplidos = diasDelMes.filter(d => {
            const key = `${p.id}|${d}`;
            return (pctPorUsuarioDia[key] || 0) >= 100;
        }).length;
        const diasRegistrados = diasDelMes.filter(d => {
            const key = `${p.id}|${d}`;
            return (pctPorUsuarioDia[key] || 0) > 0;
        }).length;
        cumplimientoPorModelador[p.id] = {
            nombre: nombreFormateado(p),
            avatar: p.id,
            cumplidos: diasCumplidos,
            registrados: diasRegistrados,
            totalDias: diasDelMes.length
        };
    });

    // KPIs globales
    const totalPct = registros.reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    const pctSemana = registros
        .filter(r => r.fecha && new Date(r.fecha + 'T00:00:00') >= inicioSemana)
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    
    // Cobertura del día de hoy y ayer (para ver quién no llenó)
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    while (ayer.getDay() === 0) { ayer.setDate(ayer.getDate() - 1); }
    const ayerStr = ayer.toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];
    
    const modeladoresPendientesHoy = modeladores.filter(p => (pctPorUsuarioDia[`${p.id}|${hoyStr}`] || 0) < 100).length;
    const modeladoresPendientesAyer = modeladores.filter(p => (pctPorUsuarioDia[`${p.id}|${ayerStr}`] || 0) < 100).length;

    // Agrupación por grupo (para ver qué grupos concentran horas)
    const porGrupo = {};
    registros.forEach(r => {
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        const grupo = t ? t.grupo || 'Sin grupo' : 'General';
        if (!porGrupo[grupo]) porGrupo[grupo] = 0;
        porGrupo[grupo] += parseFloat(r.porcentaje_dia || 0);
    });

    // Agrupación por semana
    const semanas = {};
    registros.forEach(r => {
        if (!r.fecha) return;
        const d = new Date(r.fecha + 'T00:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const lunes = new Date(d.setDate(diff));
        const key = lunes.toISOString().split('T')[0];
        if (!semanas[key]) semanas[key] = 0;
        semanas[key] += parseFloat(r.porcentaje_dia || 0);
    });
    const semanasOrdenadas = Object.keys(semanas).sort().slice(-8);

    // --- RENDERIZADO ---
    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Monitoreo de Horas Hombre (% Diario)</h3>
                <p class="text-[11px] text-slate-500">Control de cumplimiento del 100% diario por modelador.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>

        <!-- KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="card kpi-card p-3 border-l-4 border-sky-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total % Registrado</p>
                <p class="text-2xl font-bold mt-1 text-sky-700">${totalPct.toFixed(0)}%</p>
                <p class="text-[10px] text-slate-400">Histórico</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-teal-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">% de la Semana</p>
                <p class="text-2xl font-bold mt-1 text-teal-700">${pctSemana.toFixed(0)}%</p>
                <p class="text-[10px] text-slate-400">Lun - Dom</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 ${modeladoresPendientesHoy > 0 ? 'border-red-500' : 'border-emerald-500'}">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pendientes Hoy</p>
                <p class="text-2xl font-bold mt-1 ${modeladoresPendientesHoy > 0 ? 'text-red-700' : 'text-emerald-700'}">${modeladoresPendientesHoy}</p>
                <p class="text-[10px] text-slate-400">No llenaron el 100%</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 ${modeladoresPendientesAyer > 0 ? 'border-red-500' : 'border-emerald-500'}">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pendientes Ayer</p>
                <p class="text-2xl font-bold mt-1 ${modeladoresPendientesAyer > 0 ? 'text-red-700' : 'text-emerald-700'}">${modeladoresPendientesAyer}</p>
                <p class="text-[10px] text-slate-400">Del día anterior</p>
            </div>
        </div>

        <!-- Gráficos -->
        <div class="grid lg:grid-cols-3 gap-3 mb-4">
            <div class="card p-4 lg:col-span-2">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">% Registrado por semana (últimas 8)</h4>
                <div class="chart-box" style="height: 240px;"><canvas id="chart-horas-semana"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">% por Grupo</h4>
                <div class="chart-box" style="height: 240px;"><canvas id="chart-grupos"></canvas></div>
            </div>
        </div>

        <!-- Tabla cumplimiento por modelador -->
        <div class="card overflow-x-auto">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Cumplimiento diario por modelador</h4>
                <p class="text-[11px] text-slate-500">Días del mes en que registró 100% / días hábiles transcurridos.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        <th class="p-3">Días al 100%</th>
                        <th class="p-3">Días con registro</th>
                        <th class="p-3">Total días hábiles</th>
                        <th class="p-3">Cumplimiento</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.values(cumplimientoPorModelador).sort((a,b) => b.cumplidos - a.cumplidos).map(m => {
                        const pct = m.totalDias > 0 ? Math.round((m.cumplidos / m.totalDias) * 100) : 0;
                        const color = pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700';
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full ${colorAvatar(m.avatar || m.nombre)} text-white text-[9px] font-bold flex items-center justify-center">
                                    ${getIniciales(m.nombre).toUpperCase()}
                                </div>
                                <span class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</span>
                            </td>
                            <td class="p-3 font-bold ${color}">${m.cumplidos}</td>
                            <td class="p-3">${m.registrados}</td>
                            <td class="p-3">${m.totalDias}</td>
                            <td class="p-3">
                                <div class="flex items-center gap-2">
                                    <div class="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                        <div class="h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}" style="width: ${pct}%"></div>
                                    </div>
                                    <span class="${color} font-bold">${pct}%</span>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <!-- Tabla por grupo -->
        <div class="card overflow-x-auto mt-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">% registrado por Grupo</h4>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Grupo</th>
                        <th class="p-3">% Total</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.entries(porGrupo).sort((a,b) => b[1] - a[1]).map(([g, pct]) => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-700">${escapeHtml(g)}</td>
                            <td class="p-3 font-bold text-sky-700">${pct.toFixed(0)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Destruir gráficos previos
    if (state.charts.horasSemana) state.charts.horasSemana.destroy();
    if (state.charts.grupos) state.charts.grupos.destroy();

    // Gráfico semanal
    state.charts.horasSemana = new Chart(document.getElementById('chart-horas-semana'), {
        type: 'bar',
        data: {
            labels: semanasOrdenadas.map(s => {
                const d = new Date(s + 'T00:00:00');
                return `Sem ${d.getDate()}/${d.getMonth()+1}`;
            }),
            datasets: [{
                label: '% registrado',
                data: semanasOrdenadas.map(s => semanas[s].toFixed(0)),
                backgroundColor: '#0284c7',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
        }
    });

    // Gráfico por grupo
    const gruposLabels = Object.keys(porGrupo);
    state.charts.grupos = new Chart(document.getElementById('chart-grupos'), {
        type: 'doughnut',
        data: {
            labels: gruposLabels,
            datasets: [{
                data: gruposLabels.map(g => porGrupo[g].toFixed(0)),
                backgroundColor: ['#0284c7', '#0d9488', '#f59e0b', '#7c3aed', '#dc2626', '#64748b', '#ec4899', '#22c55e'],
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
        }
    });
}
