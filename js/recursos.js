import { state } from './db.js';
import { fmtDate, escapeHtml, nombreFormateado, getIniciales, colorAvatar } from './utils.js';

const HORAS_POR_100 = 9.3333;
function pctAHoras(pct) { return (parseFloat(pct || 0) * HORAS_POR_100) / 100; }

function semanaKey(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const lunes = new Date(d.setDate(diff));
    return lunes.toISOString().split('T')[0];
}

function semanasEntre(desde, hasta) {
    const out = [];
    const cur = new Date(desde + 'T00:00:00');
    const end = new Date(hasta + 'T00:00:00');
    while (cur <= end) {
        out.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 7);
    }
    return out;
}

const PALETA = ['#0284c7', '#0d9488', '#f59e0b', '#7c3aed', '#dc2626', '#64748b', '#ec4899', '#22c55e', '#eab308', '#06b6d4'];

function buildSeries(registros, semanas, keyFn) {
    const map = {};
    registros.forEach(r => {
        if (!r.fecha) return;
        const sk = semanaKey(r.fecha);
        const k = keyFn(r) || 'Sin clasificar';
        if (!map[k]) map[k] = {};
        map[k][sk] = (map[k][sk] || 0) + pctAHoras(r.porcentaje_dia);
    });
    const keys = Object.keys(map).sort();
    return {
        labels: semanas.map(s => { const d = new Date(s + 'T00:00:00'); return `Sem ${d.getDate()}/${d.getMonth() + 1}`; }),
        datasets: keys.map((k, i) => ({
            label: k,
            data: semanas.map(s => +(map[k][s] || 0).toFixed(2)),
            borderColor: PALETA[i % PALETA.length],
            backgroundColor: PALETA[i % PALETA.length] + '20',
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            pointBackgroundColor: PALETA[i % PALETA.length]
        }))
    };
}

export function renderRecursos(container) {
    const registros = state.manpowerCache.filter(m => 
        state.isAdmin || state.isCoordinador || state.isSupervisor || m.usuario_id === state.currentUser.id
    );

    if (registros.length === 0) {
        container.innerHTML = `<div class="card p-8 text-center text-slate-500">
            <p class="text-sm font-semibold mb-1">Aún no hay registros</p>
            <p class="text-xs">Cuando los modeladores registren su % diario, aquí verás el análisis en horas hombre.</p>
        </div>`;
        return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const pctPorUsuarioDia = {};
    registros.forEach(r => {
        const key = `${r.usuario_id}|${r.fecha}`;
        pctPorUsuarioDia[key] = (pctPorUsuarioDia[key] || 0) + parseFloat(r.porcentaje_dia || 0);
    });

    const modeladores = state.perfilesCache.filter(p =>
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    );

    const diasDelMes = [];
    const cursor = new Date(inicioMes);
    while (cursor <= hoy) {
        if (cursor.getDay() !== 0) diasDelMes.push(cursor.toISOString().split('T')[0]);
        cursor.setDate(cursor.getDate() + 1);
    }

    const cumplimientoPorModelador = {};
    modeladores.forEach(p => {
        const diasCumplidos = diasDelMes.filter(d => (pctPorUsuarioDia[`${p.id}|${d}`] || 0) >= 100).length;
        const diasRegistrados = diasDelMes.filter(d => (pctPorUsuarioDia[`${p.id}|${d}`] || 0) > 0).length;
        const horasTotales = registros.filter(r => r.usuario_id === p.id).reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);
        cumplimientoPorModelador[p.id] = {
            nombre: nombreFormateado(p),
            avatar: p.id,
            cumplidos: diasCumplidos,
            registrados: diasRegistrados,
            totalDias: diasDelMes.length,
            horasTotales
        };
    });

    const totalHoras = registros.reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);
    const horasSemana = registros
        .filter(r => r.fecha && new Date(r.fecha + 'T00:00:00') >= inicioSemana)
        .reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);

    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    while (ayer.getDay() === 0) ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];
    const modeladoresPendientesHoy = modeladores.filter(p => (pctPorUsuarioDia[`${p.id}|${hoyStr}`] || 0) < 100).length;
    const modeladoresPendientesAyer = modeladores.filter(p => (pctPorUsuarioDia[`${p.id}|${ayerStr}`] || 0) < 100).length;

    const porGrupo = {};
    registros.forEach(r => {
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        const grupo = t ? t.grupo || 'Sin grupo' : 'General';
        porGrupo[grupo] = (porGrupo[grupo] || 0) + pctAHoras(r.porcentaje_dia);
    });

    const fechas = registros.map(r => r.fecha).filter(Boolean).sort();
    const primera = fechas[0];
    const ultima = fechas[fechas.length - 1];
    const semanas = semanasEntre(semanaKey(primera), semanaKey(ultima));

    const serieGrupo = buildSeries(registros, semanas, r => {
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        return t ? (t.grupo || 'Sin grupo') : 'General';
    });
   
    const serieNivel = buildSeries(registros, semanas, r => {
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        return t ? (t.importancia || 'Medio') : 'Sin tarea';
    });

    const semanasRecientes = semanas.slice(-6);
    const cumplimientoSemanal = {};
    modeladores.forEach(p => {
        cumplimientoSemanal[p.id] = { nombre: nombreFormateado(p), avatar: p.id, semanas: {} };
        semanasRecientes.forEach(s => {
            const inicio = new Date(s + 'T00:00:00');
            const fin = new Date(inicio); fin.setDate(inicio.getDate() + 4);
            const dias = [];
            for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) dias.push(d.toISOString().split('T')[0]);
            const cumplidos = dias.filter(d => (pctPorUsuarioDia[`${p.id}|${d}`] || 0) >= 100).length;
            cumplimientoSemanal[p.id].semanas[s] = dias.length > 0 ? Math.round((cumplidos / dias.length) * 100) : 0;
        });
    });

    const porGrupoTareas = {};
    Object.keys(porGrupo).forEach(g => {
        const tareasGrupo = state.tasksCache.filter(t => (t.grupo || 'Sin grupo') === g);
        porGrupoTareas[g] = {
            horas: porGrupo[g],
            cerradas: tareasGrupo.filter(t => t.estado === 'Cerrado').length,
            abiertas: tareasGrupo.filter(t => t.estado !== 'Cerrado').length
        };
    });

    // === SOBRECARGA POR MODELADOR ===
    const CAPACIDAD_SEMANAL_H = 40;
    const PESO_IMPORTANCIA = { 'Muy alto': 3, 'Alto': 2, 'Medio': 1, 'Bajo': 0.5 };
    const hoyStrCap = new Date().toISOString().split('T')[0];

    const cargaPorModelador = {};
    state.perfilesCache.forEach(p => {
        const esModelador = (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador';
        if (!esModelador) return;
        cargaPorModelador[p.id] = { nombre: nombreFormateado(p), avatar: p.id, tareas: 0, dias: 0, horasEstimadas: 0, horasReales: 0 };
    });

    state.tasksCache.filter(t => t.estado !== 'Cerrado').forEach(t => {
        const asignados = new Set();
        if (t.responsable_id) asignados.add(t.responsable_id);
        (state.actividadRecursosCache || []).filter(r => r.pendiente_id === t.id).forEach(r => asignados.add(r.usuario_id));
        asignados.forEach(uid => {
            if (!cargaPorModelador[uid]) return;
            cargaPorModelador[uid].tareas += 1;
            let dias = 0;
            if (t.fecha_fin) {
                const fin = new Date(t.fecha_fin + 'T00:00:00');
                const hoyD = new Date(hoyStrCap + 'T00:00:00');
                dias = Math.max(0, Math.ceil((fin - hoyD) / 86400000));
            }
            const peso = PESO_IMPORTANCIA[t.importancia] || 1;
            cargaPorModelador[uid].dias += dias;
            cargaPorModelador[uid].horasEstimadas += dias * 8 * peso;
        });
    });

    registros.forEach(r => {
        if (cargaPorModelador[r.usuario_id]) {
            cargaPorModelador[r.usuario_id].horasReales += pctAHoras(r.porcentaje_dia);
        }
    });

    const listaCarga = Object.values(cargaPorModelador).map(m => {
        const semanasEquivalentes = m.horasEstimadas / CAPACIDAD_SEMANAL_H;
        let estado, color;
        if (semanasEquivalentes > 4) { estado = 'Sobrecargado'; color = 'text-red-700'; }
        else if (semanasEquivalentes > 2) { estado = 'Alto'; color = 'text-amber-700'; }
        else if (semanasEquivalentes > 0.5) { estado = 'Normal'; color = 'text-emerald-700'; }
        else { estado = 'Libre'; color = 'text-slate-500'; }
        return { ...m, semanasEquivalentes, estado, color };
    }).sort((a, b) => b.semanasEquivalentes - a.semanasEquivalentes);
    // === FIN SOBRECARGA ===

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Monitoreo de Horas Hombre</h3>
                <p class="text-[11px] text-slate-500">Análisis en horas (100% = ${HORAS_POR_100} h).</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="card kpi-card p-3 border-l-4 border-sky-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Horas</p>
                <p class="text-2xl font-bold mt-1 text-sky-700">${totalHoras.toFixed(1)} h</p>
                <p class="text-[10px] text-slate-400">Histórico</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-teal-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Horas de la Semana</p>
                <p class="text-2xl font-bold mt-1 text-teal-700">${horasSemana.toFixed(1)} h</p>
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

        <div class="grid lg:grid-cols-2 gap-3 mb-4">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Horas por semana · por Grupo</h4>
                <div class="chart-box" style="height: 260px;"><canvas id="chart-linea-grupo"></canvas></div>
            </div>
            
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Horas por semana · por Nivel (importancia)</h4>
                <div class="chart-box" style="height: 260px;"><canvas id="chart-linea-nivel"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Horas por Grupo (acumulado)</h4>
                <div class="chart-box" style="height: 260px;"><canvas id="chart-grupos"></canvas></div>
            </div>
        </div>

        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Cumplimiento semanal del 100%</h4>
                <p class="text-[11px] text-slate-500">% de días hábiles (lun-vie) con 100% registrado, por modelador y semana.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        ${semanasRecientes.map(s => { const d = new Date(s + 'T00:00:00'); return `<th class="p-3 text-center">Sem ${d.getDate()}/${d.getMonth() + 1}</th>`; }).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.values(cumplimientoSemanal).map(m => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full ${colorAvatar(m.avatar)} text-white text-[9px] font-bold flex items-center justify-center">${getIniciales(m.nombre).toUpperCase()}</div>
                                <span class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</span>
                            </td>
                            ${semanasRecientes.map(s => {
                                const v = m.semanas[s];
                                const color = v >= 80 ? 'text-emerald-700' : v >= 50 ? 'text-amber-700' : 'text-red-700';
                                return `<td class="p-3 text-center font-bold ${color}">${v}%</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Horas vs. Tareas Cerradas por Grupo</h4>
                <p class="text-[11px] text-slate-500">Detecta grupos que consumen horas sin cerrar tareas.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Grupo</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">Cerradas</th>
                        <th class="p-3">Abiertas</th>
                        <th class="p-3">h / cerrada</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.entries(porGrupoTareas).sort((a, b) => b[1].horas - a[1].horas).map(([g, d]) => {
                        const ratio = d.cerradas > 0 ? (d.horas / d.cerradas).toFixed(1) : '—';
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-700">${escapeHtml(g)}</td>
                            <td class="p-3 font-bold text-sky-700">${d.horas.toFixed(1)} h</td>
                            <td class="p-3">${d.cerradas}</td>
                            <td class="p-3">${d.abiertas}</td>
                            <td class="p-3 font-semibold ${d.cerradas > 0 && d.horas / d.cerradas > 20 ? 'text-red-700' : 'text-slate-700'}">${ratio}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Sobrecarga por Modelador</h4>
                <p class="text-[11px] text-slate-500">Estimación: días restantes × 8h × peso de importancia, contra capacidad de ${CAPACIDAD_SEMANAL_H}h/semana.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        <th class="p-3">Tareas abiertas</th>
                        <th class="p-3">Días restantes</th>
                        <th class="p-3">Horas estimadas</th>
                        <th class="p-3">Horas reales</th>
                        <th class="p-3">Semanas equiv.</th>
                        <th class="p-3">Estado</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${listaCarga.map(m => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full ${colorAvatar(m.avatar)} text-white text-[9px] font-bold flex items-center justify-center">${getIniciales(m.nombre).toUpperCase()}</div>
                                <span class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</span>
                            </td>
                            <td class="p-3">${m.tareas}</td>
                            <td class="p-3">${m.dias}</td>
                            <td class="p-3 font-bold text-sky-700">${m.horasEstimadas.toFixed(0)} h</td>
                            <td class="p-3 font-bold text-teal-700">${m.horasReales.toFixed(1)} h</td>
                            <td class="p-3">${m.semanasEquivalentes.toFixed(1)}</td>
                            <td class="p-3 font-bold ${m.color}">${m.estado}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin datos</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="card overflow-x-auto">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Cumplimiento y horas por modelador (mes)</h4>
                <p class="text-[11px] text-slate-500">Días al 100% del mes y horas totales acumuladas.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        <th class="p-3">Días al 100%</th>
                        <th class="p-3">Días con registro</th>
                        <th class="p-3">Total días hábiles</th>
                        <th class="p-3">Horas Totales</th>
                        <th class="p-3">Cumplimiento</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.values(cumplimientoPorModelador).sort((a, b) => b.horasTotales - a.horasTotales).map(m => {
                        const pct = m.totalDias > 0 ? Math.round((m.cumplidos / m.totalDias) * 100) : 0;
                        const color = pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700';
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full ${colorAvatar(m.avatar || m.nombre)} text-white text-[9px] font-bold flex items-center justify-center">${getIniciales(m.nombre).toUpperCase()}</div>
                                <span class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</span>
                            </td>
                            <td class="p-3 font-bold ${color}">${m.cumplidos}</td>
                            <td class="p-3">${m.registrados}</td>
                            <td class="p-3">${m.totalDias}</td>
                            <td class="p-3 font-bold text-sky-700">${m.horasTotales.toFixed(1)} h</td>
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
    `;

    ['horasSemana', 'grupos', 'lineaGrupo', 'lineaCargo', 'lineaNivel'].forEach(k => {
        if (state.charts[k]) { state.charts[k].destroy(); state.charts[k] = null; }
    });

    const optsLinea = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
            y: { beginAtZero: true, ticks: { callback: v => v + ' h' } },
            x: { grid: { display: false } }
        }
    };

    state.charts.lineaGrupo = new Chart(document.getElementById('chart-linea-grupo'), {
        type: 'line', data: serieGrupo, options: optsLinea
    });
   
    state.charts.lineaNivel = new Chart(document.getElementById('chart-linea-nivel'), {
        type: 'line', data: serieNivel, options: optsLinea
    });

    const gruposLabels = Object.keys(porGrupo);
    state.charts.grupos = new Chart(document.getElementById('chart-grupos'), {
        type: 'doughnut',
        data: {
            labels: gruposLabels,
            datasets: [{
                data: gruposLabels.map(g => porGrupo[g].toFixed(1)),
                backgroundColor: PALETA,
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
}
