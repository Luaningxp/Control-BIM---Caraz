import { state, tareaPorId } from './db.js';
import { toast, fmtDate, escapeHtml, nombreFormateado, getIniciales, colorAvatar, today, hoyLima, isoLocal, sumarDias, lunesDeSemana, latenciaPromedio } from './utils.js';
import { esDiaLaborable, tipoDia } from './roster.js';
import { armarReporteModeladores, exportarPDFModeladores } from './reporte-modeladores.js';

const HORAS_POR_100 = 9.3333;
function pctAHoras(pct) { return (parseFloat(pct || 0) * HORAS_POR_100) / 100; }

function semanaKey(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const lunes = new Date(d.setDate(diff));
    return isoLocal(lunes);
}

function semanasEntre(desde, hasta) {
    const out = [];
    const cur = new Date(desde + 'T00:00:00');
    const end = new Date(hasta + 'T00:00:00');
    while (cur <= end) {
        out.push(isoLocal(cur));
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
    const registros = state.manpowerCache;

    if (registros.length === 0) {
        container.innerHTML = `<div class="card p-8 text-center text-slate-500">
            <p class="text-sm font-semibold mb-1">Aún no hay registros</p>
            <p class="text-xs">Cuando los modeladores registren su % diario, aquí verás el análisis en horas hombre.</p>
        </div>`;
        return;
    }

    const hoy = today();
    hoy.setHours(0, 0, 0, 0);
    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(diffLunes);
    inicioSemana.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); // Último día del mes

    const pctPorUsuarioDia = {};
    registros.forEach(r => {
        const key = `${r.usuario_id}|${r.fecha}`;
        pctPorUsuarioDia[key] = (pctPorUsuarioDia[key] || 0) + parseFloat(r.porcentaje_dia || 0);
    });

    const modeladores = state.perfilesCache.filter(p =>
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    );

    const cumplimientoPorModelador = {};
    modeladores.forEach(p => {
        const diasDelMes = [];
        const diasRestantes = [];
        const cursor = new Date(inicioMes);

        while (cursor <= finMes) {
            const fechaStr = isoLocal(cursor);
            if (esDiaLaborable(p.id, fechaStr)) {
                if (cursor <= hoy) {
                    diasDelMes.push(fechaStr); // Días hábiles hasta hoy
                } else {
                    diasRestantes.push(fechaStr); // Días hábiles que faltan
                }
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        const diasCumplidos = diasDelMes.filter(d => (pctPorUsuarioDia[`${p.id}|${d}`] || 0) >= 100).length;
        const diasRegistrados = diasDelMes.filter(d => (pctPorUsuarioDia[`${p.id}|${d}`] || 0) > 0).length;
        
        // Solo sumar las horas de este mes
        const horasTotales = registros.filter(r => {
            if (r.usuario_id !== p.id || !r.fecha) return false;
            const f = new Date(r.fecha + 'T00:00:00');
            return f >= inicioMes && f <= hoy;
        }).reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);
        
        cumplimientoPorModelador[p.id] = {
            nombre: nombreFormateado(p),
            avatar: p.id,
            cumplidos: diasCumplidos,
            registrados: diasRegistrados,
            totalDias: diasDelMes.length,
            diasRestantesQty: diasRestantes.length,
            horasTotales
        };
    });

    const totalHoras = registros.reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);
    const horasSemana = registros
        .filter(r => r.fecha && new Date(r.fecha + 'T00:00:00') >= inicioSemana)
        .reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);

    // Pendientes según el roster de cada modelador (no cuenta a quien descansa)
    const hoyStr = hoyLima();
    const ultimoLaborableAntes = (uid) => {
        for (let i = 1; i <= 7; i++) {
            const f = sumarDias(hoyStr, -i);
            if (esDiaLaborable(uid, f)) return f;
        }
        return null;
    };
    const laboranHoy = modeladores.filter(p => esDiaLaborable(p.id, hoyStr));
    const modeladoresPendientesHoy = laboranHoy.filter(p => (pctPorUsuarioDia[`${p.id}|${hoyStr}`] || 0) < 100).length;
    const modeladoresPendientesAyer = modeladores.filter(p => {
        const f = ultimoLaborableAntes(p.id);
        return f && (pctPorUsuarioDia[`${p.id}|${f}`] || 0) < 100;
    }).length;

    // Capacidad de la semana (lunes a hoy) según roster: 9.33 h por día laborable de cada modelador
    const lunesStr = lunesDeSemana(hoyStr);
    let capacidadSemana = 0;
    modeladores.forEach(p => {
        for (let f = lunesStr; f <= hoyStr; f = sumarDias(f, 1)) if (esDiaLaborable(p.id, f)) capacidadSemana += HORAS_POR_100;
    });
    const idsModeladores = new Set(modeladores.map(p => p.id));
    const horasSemanaModeladores = registros
        .filter(r => r.fecha && r.fecha >= lunesStr && r.fecha <= hoyStr && idsModeladores.has(r.usuario_id))
        .reduce((acc, r) => acc + pctAHoras(r.porcentaje_dia), 0);
    const ocupacionSemana = capacidadSemana > 0 ? Math.round(horasSemanaModeladores * 100 / capacidadSemana) : null;

    const porGrupo = {};
    registros.forEach(r => {
        const t = tareaPorId(r.pendiente_id);
        const grupo = t ? t.grupo || 'Sin grupo' : 'General';
        porGrupo[grupo] = (porGrupo[grupo] || 0) + pctAHoras(r.porcentaje_dia);
    });

    // === CÁLCULO DE DISTRIBUCIÓN DE EQUIPOS ===
    const jefesValidos = state.perfilesCache.filter(p => {
        const c = (p.cargo || '').toLowerCase();
        return c.includes('supervisor') || c.includes('coordinador') || c.includes('bim manager');
    });

    const distribucionEquipos = {};
    jefesValidos.forEach(j => distribucionEquipos[j.id] = { nombre: nombreFormateado(j), cargo: j.cargo, modeladores: new Set() });
    
    const hoyFechaStr = hoyLima();
    const modeladoresLaborandoHoy = modeladores.filter(m => {
        const tipo = tipoDia(m.id, hoyFechaStr);
        return tipo === 'T' || tipo === 'TE';
    });

    const modeladoresLibres = new Set(modeladoresLaborandoHoy.map(m => m.id));

    modeladoresLaborandoHoy.forEach(m => {
        const tareasM = state.tasksCache.filter(t => 
            t.estado !== 'Cerrado' && 
            (t.responsable_id === m.id || (state.actividadRecursosCache || []).some(r => r.pendiente_id === t.id && r.usuario_id === m.id))
        );

        const conteoJefes = {};
        tareasM.forEach(t => {
            if (t.responsable_id && distribucionEquipos[t.responsable_id]) {
                conteoJefes[t.responsable_id] = (conteoJefes[t.responsable_id] || 0) + 1;
            }
        });

        let jefePrincipal = null;
        let maxTareas = 0;
        Object.entries(conteoJefes).forEach(([idJefe, cant]) => {
            if (cant > maxTareas) { maxTareas = cant; jefePrincipal = idJefe; }
        });

        if (jefePrincipal) {
            distribucionEquipos[jefePrincipal].modeladores.add(m.id);
            modeladoresLibres.delete(m.id);
        }
    });

    const puntosGrafico = [];
    const jefesEjeY = [];
    const modeladoresEjeX = new Set();

    Object.values(distribucionEquipos).forEach(jefe => {
        if (jefe.modeladores.size > 0) {
            jefesEjeY.push(jefe.nombre);
            jefe.modeladores.forEach(modId => {
                const m = modeladores.find(x => x.id === modId);
                if (m) {
                    const nombreM = nombreFormateado(m);
                    modeladoresEjeX.add(nombreM);
                    puntosGrafico.push({ x: nombreM, y: jefe.nombre, jefe: jefe.nombre, mod: nombreM });
                }
            });
        }
    });

    if (modeladoresLibres.size > 0) {
        jefesEjeY.push('Modeladores Libres');
        modeladoresLibres.forEach(modId => {
            const m = modeladores.find(x => x.id === modId);
            if (m) {
                const nombreM = nombreFormateado(m);
                modeladoresEjeX.add(nombreM);
                puntosGrafico.push({ x: nombreM, y: 'Modeladores Libres', jefe: 'Modeladores Libres', mod: nombreM });
            }
        });
    }

    const labelsX = Array.from(modeladoresEjeX).sort();
    const labelsY = jefesEjeY.sort();
    // === FIN CÁLCULO DISTRIBUCIÓN ===

    const fechas = registros.map(r => r.fecha).filter(Boolean).sort();
    const primera = fechas[0];
    const ultima = fechas[fechas.length - 1];
    const semanas = semanasEntre(semanaKey(primera), semanaKey(ultima));

    const serieGrupo = buildSeries(registros, semanas, r => {
        const t = tareaPorId(r.pendiente_id);
        return t ? (t.grupo || 'Sin grupo') : 'General';
    });
   
    const espNombre = (id) => (state.especialidadesTodasCache || []).find(e => String(e.id) === String(id))?.nombre || 'GENERAL';
    const serieNivel = buildSeries(registros, semanas, r => {
        const t = tareaPorId(r.pendiente_id);
        return t ? espNombre(t.especialidad_id) : 'Sin actividad';
    });

    // Horas planificadas vs no planificadas: mismo cálculo que el Dashboard (Supabase: dashboard_semanas).
    // No planificada = actividad creada durante la semana con fin en ella (regla del PPC Last Planner).
    const semanasPlanifSQL = (state.semanasDashboard || []).slice().reverse();
    const planifPorSemana = {};
    semanasPlanifSQL.forEach(w => {
        const sk = String(w.semana).slice(0, 10);
        const total = Number(w.horas_semana || 0);
        const noPlan = Number(w.horas_no_planificadas || 0);
        const general = Number(w.horas_generales || 0);
        planifPorSemana[sk] = { plan: Math.max(0, total - noPlan - general), noPlan, general };
    });
    const semanasPlanif = Object.keys(planifPorSemana);

    const semanasRecientes = semanas.slice(-6);
    const hoyLocalStr = hoyLima(); // YYYY-MM-DD en hora local
    const cumplimientoSemanal = {};
    modeladores.forEach(p => {
        cumplimientoSemanal[p.id] = { nombre: nombreFormateado(p), avatar: p.id, semanas: {} };
        semanasRecientes.forEach(s => {
            const inicio = new Date(s + 'T00:00:00');
            const fin = new Date(inicio); fin.setDate(inicio.getDate() + 6);

            let laborables = 0;      // días laborables de la semana según roster
            const evaluables = [];   // laborables que ya ocurrieron (<= hoy)
            for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
                const fechaStr = isoLocal(d);
                if (!esDiaLaborable(p.id, fechaStr)) continue;
                laborables++;
                if (fechaStr <= hoyLocalStr) evaluables.push(fechaStr);
            }

            if (laborables === 0) {
                cumplimientoSemanal[p.id].semanas[s] = 'DESCANSO';
            } else if (evaluables.length === 0) {
                cumplimientoSemanal[p.id].semanas[s] = 'PENDIENTE';
            } else {
                const cumplidos = evaluables.filter(d => (pctPorUsuarioDia[`${p.id}|${d}`] || 0) >= 100).length;
                cumplimientoSemanal[p.id].semanas[s] = Math.round((cumplidos / evaluables.length) * 100);
            }
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

    // === SOBRECARGA POR TRABAJO EN PARALELO (WIP) · próximas 2 semanas ===
    const wip = calcularWIP(modeladores);
    // === RIESGO POR DEPENDENCIA (solo modeladores) ===
    const riesgo = calcularRiesgo(modeladores, registros);

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
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ocupación registrada</p>
                <p class="text-2xl font-bold mt-1 text-sky-700">${ocupacionSemana === null ? '—' : ocupacionSemana + '%'}</p>
                <p class="text-[10px] text-slate-400">${horasSemanaModeladores.toFixed(1)} h de ${capacidadSemana.toFixed(1)} h disponibles (roster, lun–hoy)</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 border-teal-500">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Horas de la Semana</p>
                <p class="text-2xl font-bold mt-1 text-teal-700">${horasSemana.toFixed(1)} h</p>
                <p class="text-[10px] text-slate-400">Lun - Dom</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 ${modeladoresPendientesHoy > 0 ? 'border-red-500' : 'border-emerald-500'}">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pendientes Hoy</p>
                <p class="text-2xl font-bold mt-1 ${modeladoresPendientesHoy > 0 ? 'text-red-700' : 'text-emerald-700'}">${modeladoresPendientesHoy}</p>
                <p class="text-[10px] text-slate-400">De ${laboranHoy.length} que laboran hoy</p>
            </div>
            <div class="card kpi-card p-3 border-l-4 ${modeladoresPendientesAyer > 0 ? 'border-red-500' : 'border-emerald-500'}">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pendientes Ayer</p>
                <p class="text-2xl font-bold mt-1 ${modeladoresPendientesAyer > 0 ? 'text-red-700' : 'text-emerald-700'}">${modeladoresPendientesAyer}</p>
                <p class="text-[10px] text-slate-400">Su último día laborable < 100%</p>
            </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-3 mb-4">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Horas por semana · por Grupo</h4>
                <div class="chart-box" style="height: 260px;"><canvas id="chart-linea-grupo"></canvas></div>
            </div>
            
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 mb-2">Horas por semana · por Especialidad</h4>
                <div class="chart-box" style="height: 260px;"><canvas id="chart-linea-nivel"></canvas></div>
            </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-3 mb-4">
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 dark:text-white mb-2">Horas planificadas vs. no planificadas</h4>
                <p class="text-[11px] text-slate-500 mb-2">Mismo cálculo que el Dashboard (Last Planner): no planificada = actividad creada durante la semana con fin en esa misma semana. Últimas 8 semanas.</p>
                <div class="chart-box" style="height: 240px;"><canvas id="chart-planif"></canvas></div>
            </div>
            <div class="card p-4">
                <h4 class="font-semibold text-sm text-slate-800 dark:text-white mb-2">Distribución de Modeladores</h4>
                <p class="text-[11px] text-slate-500 mb-2">Estimada: se asigna a cada modelador el jefe que es responsable de la mayoría de sus actividades abiertas.</p>
                <div class="chart-box" style="height: 300px;"><canvas id="chart-equipos"></canvas></div>
            </div>
        </div>

        <div class="card overflow-x-auto mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Cumplimiento semanal del 100%</h4>
                <p class="text-[11px] text-slate-500">% de días laborables reales (según roster) con 100% registrado, por modelador y semana.</p>
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
                                if (v === 'DESCANSO') {
                                    return `<td class="p-3 text-center text-slate-400 font-semibold" title="Sin días laborables en el roster esa semana">Descanso</td>`;
                                }
                                if (v === 'PENDIENTE') {
                                    return `<td class="p-3 text-center text-slate-300 font-semibold" title="Aún no transcurren días laborables de esta semana">—</td>`;
                                }
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
                        <th class="p-3">% del total</th>
                        <th class="p-3">Cerradas</th>
                        <th class="p-3">Abiertas</th>
                        <th class="p-3">h / cerrada</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.entries(porGrupoTareas).sort((a, b) => b[1].horas - a[1].horas).map(([g, d]) => {
                        const ratio = d.cerradas > 0 ? (d.horas / d.cerradas).toFixed(1) : '—';
                        const pct = totalHoras > 0 ? (d.horas / totalHoras) * 100 : 0;
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-700">${escapeHtml(g)}</td>
                            <td class="p-3 font-bold text-sky-700">${d.horas.toFixed(1)} h</td>
                            <td class="p-3">
                                <div class="flex items-center gap-2">
                                    <div class="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                        <div class="h-full bg-sky-500" style="width: ${Math.min(pct, 100)}%"></div>
                                    </div>
                                    <span class="font-semibold text-slate-700">${pct.toFixed(1)}%</span>
                                </div>
                            </td>
                            <td class="p-3">${d.cerradas}</td>
                            <td class="p-3">${d.abiertas}</td>
                            <td class="p-3 font-semibold ${d.cerradas > 0 && d.horas / d.cerradas > 20 ? 'text-red-700' : 'text-slate-700'}">${ratio}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        ${seccionWIP(wip)}

        ${seccionRiesgo(riesgo)}

        <div class="card overflow-x-auto">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Cumplimiento y horas por modelador (mes)</h4>
                <p class="text-[11px] text-slate-500">Días trabajados a la fecha, horas acumuladas y días restantes del mes.</p>
            </div>
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        <th class="p-3 text-center">Días transcurridos</th>
                        <th class="p-3 text-center">Días al 100%</th>
                        <th class="p-3 text-center">Días con registro</th>
                        <th class="p-3 text-center">Días Restantes</th>
                        <th class="p-3">Horas Totales</th>
                        <th class="p-3">Cumplimiento a la fecha</th>
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
                            <td class="p-3 font-semibold text-center text-slate-600">${m.totalDias}</td>
                            <td class="p-3 font-bold text-center ${color}">${m.cumplidos}</td>
                            <td class="p-3 text-center text-slate-600">${m.registrados}</td>
                            <td class="p-3 text-center text-slate-400 font-medium">${m.diasRestantesQty}</td>
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

    ['horasSemana', 'grupos', 'planif', 'wip', 'lineaGrupo', 'lineaCargo', 'lineaNivel', 'equipos'].forEach(k => {
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

    state.charts.planif = new Chart(document.getElementById('chart-planif'), {
        type: 'bar',
        data: {
            labels: semanasPlanif.map(sk => `Sem ${fmtDate(sk).slice(0, 5)}`),
            datasets: [
                { label: 'Planificadas', data: semanasPlanif.map(sk => +((planifPorSemana[sk]?.plan) || 0).toFixed(1)), backgroundColor: '#0284c7' },
                { label: 'No planificadas', data: semanasPlanif.map(sk => +((planifPorSemana[sk]?.noPlan) || 0).toFixed(1)), backgroundColor: '#f59e0b' },
                { label: 'General (sin actividad)', data: semanasPlanif.map(sk => +((planifPorSemana[sk]?.general) || 0).toFixed(1)), backgroundColor: '#cbd5e1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                       tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y} h` } } },
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => v + ' h' } } }
        }
    });

    dibujarWIP(wip);

    if (state.charts.equipos) state.charts.equipos.destroy();

    state.charts.equipos = new Chart(document.getElementById('chart-equipos'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Asignación',
                data: puntosGrafico,
                backgroundColor: puntosGrafico.map(p => 
                    p.y === 'Modeladores Libres' ? '#94a3b8' : '#0ea5e9'
                ),
                pointRadius: 8,
                pointHoverRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.raw.y === 'Modeladores Libres') return `${ctx.raw.x} (Libre)`;
                            return `${ctx.raw.x} ➔ bajo el mando de ${ctx.raw.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'category',
                    labels: labelsX,
                    title: { display: true, text: 'Modeladores', font: { size: 10, weight: 'bold' } },
                    ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    type: 'category',
                    labels: labelsY,
                    title: { display: true, text: 'Supervisores / Coordinadores', font: { size: 10, weight: 'bold' } },
                    ticks: { font: { size: 9 } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

// ============================================================
// SOBRECARGA POR TRABAJO EN PARALELO (WIP)
// Para cada modelador y cada día laborable (roster) de las próximas 2 semanas
// se cuentan las actividades activas en paralelo donde produce. Su día
// (9.33 h) se reparte entre ellas. Sobrecarga = paralelo por encima del límite.
// Vencidas: se proyectan por la latencia promedio (8 semanas; 3 días si no hay datos).
// Sin fecha fin: no entran (aún no programadas).
// ============================================================
const DIAS_VENTANA = 14;

function esModeladorPerfil(p) {
    return (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador';
}

function limitesWIP() {
    const prm = state.parametrosApp || {};
    return {
        modelador: Number(prm.wip_modelador) > 0 ? Number(prm.wip_modelador) : 3,
        supervisor: Number(prm.wip_supervisor) > 0 ? Number(prm.wip_supervisor) : 8
    };
}

/** Modeladores que producen en la actividad: recursos modeladores; si no hay, el responsable si es modelador. */
function ejecutoresDe(t, idsModeladores) {
    const rec = [...new Set((state.actividadRecursosCache || []).filter(r => r.pendiente_id === t.id).map(r => r.usuario_id))]
        .filter(uid => idsModeladores.has(uid));
    if (rec.length) return rec;
    return t.responsable_id && idsModeladores.has(t.responsable_id) ? [t.responsable_id] : [];
}

function actividadAbierta(t) {
    return t.estado !== 'Cerrado' && t.estado !== 'Cancelado' && t.estado !== 'Anulado' && t.estado_cde !== 'Archived';
}

function calcularWIP(modeladores) {
    const hoy = hoyLima();
    const dias = Array.from({ length: DIAS_VENTANA }, (_, i) => sumarDias(hoy, i));
    const lat = latenciaPromedio(state.tasksCache, 8);
    const extraVencida = lat > 0 ? Math.ceil(lat) : 3;
    const lim = limitesWIP();
    const ids = new Set(modeladores.map(p => p.id));
    const fechaLima = (ts) => ts ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)) : null;

    const activas = state.tasksCache.filter(t => actividadAbierta(t) && t.fecha_fin).map(t => {
        const vencida = t.fecha_fin < hoy;
        return {
            t, vencida,
            ini: t.fecha_inicio_programado || fechaLima(t.created_at) || hoy,
            fin: vencida ? sumarDias(hoy, extraVencida - 1) : t.fecha_fin,
            ejec: ejecutoresDe(t, ids)
        };
    });
    const sinFecha = state.tasksCache.filter(t => actividadAbierta(t) && !t.fecha_fin).length;

    const porPersona = (uid, filtro) => {
        const serie = [];
        dias.forEach(d => {
            if (!esDiaLaborable(uid, d)) return;
            const lista = activas.filter(a => filtro(a) && a.ini <= d && a.fin >= d);
            serie.push({ d, n: lista.length, lista });
        });
        return serie;
    };
    const resumen = (serie, limite) => {
        const lab = serie.length;
        const prom = lab ? serie.reduce((s, x) => s + x.n, 0) / lab : 0;
        const pico = serie.reduce((m, x) => x.n > m.n ? x : m, { n: 0, d: null, lista: [] });
        const sobre = serie.filter(x => x.n > limite).length;
        let estado = 'Normal', color = 'text-emerald-700', hex = '#059669';
        if (lab === 0) { estado = 'Sin días laborables'; color = 'text-slate-400'; hex = '#cbd5e1'; }
        else if (prom > limite) { estado = 'Sobrecargado'; color = 'text-red-700'; hex = '#dc2626'; }
        else if (pico.n > limite) { estado = 'Picos'; color = 'text-amber-700'; hex = '#ea580c'; }
        else if (prom < 1) { estado = 'Disponible'; color = 'text-sky-700'; hex = '#0284c7'; }
        return { lab, prom, pico, sobre, estado, color, hex };
    };

    const filasMod = modeladores.map(p => {
        const serie = porPersona(p.id, a => a.ejec.includes(p.id));
        const r = resumen(serie, lim.modelador);
        const vencidas = activas.filter(a => a.vencida && a.ejec.includes(p.id)).length;
        return { id: p.id, nombre: nombreFormateado(p), ...r, vencidas,
                 hPorActPico: r.pico.n ? HORAS_POR_100 / r.pico.n : null };
    }).sort((a, b) => b.prom - a.prom || b.pico.n - a.pico.n);

    const idsResp = [...new Set(activas.map(a => a.t.responsable_id).filter(uid => uid && !ids.has(uid)))];
    const filasSup = idsResp.map(uid => {
        const p = state.perfilesCache.find(x => x.id === uid);
        if (!p) return null;
        const serie = porPersona(uid, a => a.t.responsable_id === uid);
        const r = resumen(serie, lim.supervisor);
        const aCargo = new Set();
        activas.filter(a => a.t.responsable_id === uid && a.fin >= hoy && a.ini <= dias[dias.length - 1]).forEach(a => a.ejec.forEach(e => aCargo.add(e)));
        return { id: uid, nombre: nombreFormateado(p), cargo: p.cargo || '', ...r, aCargo: aCargo.size };
    }).filter(Boolean).sort((a, b) => b.prom - a.prom);

    return { filasMod, filasSup, lim, lat, extraVencida, sinFecha, desde: dias[0], hasta: dias[dias.length - 1] };
}

function seccionWIP(w) {
    const nombreAct = a => `${a.t.codigo_contenedor || ''} ${a.t.actividad || ''}`.trim();
    return `
        <div class="card mb-4">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800">Sobrecarga · trabajo en paralelo (WIP)</h4>
                <p class="text-[11px] text-slate-500">
                    Próximas 2 semanas (${fmtDate(w.desde)} → ${fmtDate(w.hasta)}), solo días laborables según roster. Cuenta las actividades activas a la vez en las que produce cada modelador; su día (${HORAS_POR_100.toFixed(2)} h) se reparte entre ellas.
                    Límite: <b>${w.lim.modelador}</b> en paralelo por modelador. Vencidas proyectadas ${w.extraVencida} día(s) (latencia promedio${w.lat > 0 ? '' : ': sin datos, 3 d por defecto'}).
                    ${w.sinFecha ? `<span class="text-amber-700">${w.sinFecha} actividad(es) sin fecha fin no entran al cálculo.</span>` : ''}
                </p>
            </div>
            <div class="px-4"><div class="chart-box" style="height: 260px;"><canvas id="chart-wip"></canvas></div></div>
            <div class="overflow-x-auto">
            <table class="w-full text-left text-xs mt-2">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Modelador</th>
                        <th class="p-3 text-center">Promedio en paralelo</th>
                        <th class="p-3 text-center">Pico</th>
                        <th class="p-3 text-center">Días sobre el límite</th>
                        <th class="p-3 text-center">h por actividad (pico)</th>
                        <th class="p-3 text-center">Vencidas</th>
                        <th class="p-3">Estado</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${w.filasMod.map(m => `
                        <tr class="hover:bg-slate-50">
                            <td class="p-3 flex items-center gap-2">
                                <div class="w-6 h-6 rounded-full ${colorAvatar(m.id)} text-white text-[9px] font-bold flex items-center justify-center">${getIniciales(m.nombre).toUpperCase()}</div>
                                <span class="font-semibold text-slate-800">${escapeHtml(m.nombre)}</span>
                            </td>
                            <td class="p-3 text-center font-bold">${m.prom.toFixed(1)}</td>
                            <td class="p-3 text-center" title="${m.pico.d ? escapeHtml(fmtDate(m.pico.d) + ': ' + m.pico.lista.map(nombreAct).join(' · ')) : ''}">${m.pico.n}${m.pico.d ? ` <span class="text-slate-400 text-[10px]">${fmtDate(m.pico.d).slice(0, 5)}</span>` : ''}</td>
                            <td class="p-3 text-center ${m.sobre ? 'text-red-700 font-bold' : 'text-slate-400'}">${m.sobre} / ${m.lab}</td>
                            <td class="p-3 text-center">${m.hPorActPico ? m.hPorActPico.toFixed(1) + ' h' : '—'}</td>
                            <td class="p-3 text-center ${m.vencidas ? 'text-red-700 font-bold' : 'text-slate-400'}">${m.vencidas}</td>
                            <td class="p-3 font-bold ${m.color}">${m.estado}</td>
                        </tr>`).join('') || '<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin modeladores</td></tr>'}
                </tbody>
            </table>
            </div>
            ${w.filasSup.length ? `
            <div class="p-4 pt-3 border-t border-slate-100">
                <h5 class="font-semibold text-xs text-slate-700 mb-1">Responsables (gestión) · límite ${w.lim.supervisor} actividades lideradas en paralelo</h5>
                <table class="w-full text-left text-xs">
                    <thead class="text-slate-500 uppercase text-[10px]"><tr><th class="py-1">Responsable</th><th class="py-1 text-center">Promedio liderando</th><th class="py-1 text-center">Pico</th><th class="py-1 text-center">Modeladores a cargo</th><th class="py-1">Estado</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">
                        ${w.filasSup.map(s => `<tr><td class="py-1.5"><b>${escapeHtml(s.nombre)}</b> <span class="text-slate-400">${escapeHtml(s.cargo)}</span></td><td class="py-1.5 text-center">${s.prom.toFixed(1)}</td><td class="py-1.5 text-center">${s.pico.n}</td><td class="py-1.5 text-center">${s.aCargo}</td><td class="py-1.5 font-bold ${s.color}">${s.estado}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}
        </div>`;
}

function dibujarWIP(w) {
    const el = document.getElementById('chart-wip');
    if (!el) return;
    const filas = w.filasMod.filter(m => m.lab > 0);
    state.charts.wip = new Chart(el, {
        data: {
            labels: filas.map(m => m.nombre),
            datasets: [
                { type: 'bar', label: 'Promedio en paralelo', data: filas.map(m => +m.prom.toFixed(2)), backgroundColor: filas.map(m => m.hex), order: 2 },
                { type: 'bar', label: 'Pico', data: filas.map(m => m.pico.n), backgroundColor: filas.map(m => m.hex + '55'), order: 3 },
                { type: 'line', label: `Límite (${w.lim.modelador})`, data: filas.map(() => w.lim.modelador), borderColor: '#dc2626', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, order: 1 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Actividades en paralelo', font: { size: 10 } } },
                      x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 0 }, grid: { display: false } } }
        }
    });
}

// ============================================================
// RIESGO POR DEPENDENCIA (solo modeladores)
// "Si este modelador se va, ¿qué pierdo?"
// - Sin respaldo: actividades abiertas donde es el ÚNICO modelador (el supervisor no cuenta).
// - Conocimiento: % de las horas en actividades críticas (Alto/Muy alto) de las últimas 4 semanas.
// ============================================================
function calcularRiesgo(modeladores, registros) {
    const ids = new Set(modeladores.map(p => p.id));
    const hoy = hoyLima();
    const desde = sumarDias(hoy, -27);
    const esCritica = t => t && (t.importancia === 'Muy alto' || t.importancia === 'Alto');
    const abiertas = state.tasksCache.filter(actividadAbierta);

    const porMod = {};
    modeladores.forEach(p => porMod[p.id] = { id: p.id, nombre: nombreFormateado(p), sinRespaldo: [], horasCrit: 0 });
    abiertas.forEach(t => {
        const ej = ejecutoresDe(t, ids);
        if (ej.length === 1 && porMod[ej[0]]) porMod[ej[0]].sinRespaldo.push(t);
    });
    let totalCrit = 0;
    registros.forEach(r => {
        if (!r.fecha || r.fecha < desde || r.fecha > hoy || !ids.has(r.usuario_id)) return;
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        if (!esCritica(t)) return;
        const h = pctAHoras(r.porcentaje_dia);
        porMod[r.usuario_id].horasCrit += h;
        totalCrit += h;
    });

    const NIVELES = [
        { nivel: 'Crítico', color: 'red' },
        { nivel: 'Alto', color: 'amber' },
        { nivel: 'Medio', color: 'sky' },
        { nivel: 'Bajo', color: 'slate' }
    ];
    const filas = Object.values(porMod).map(m => {
        const criticasSR = m.sinRespaldo.filter(esCritica).length;
        const conocimiento = totalCrit > 0 ? m.horasCrit * 100 / totalCrit : 0;
        let i = 3;
        if (criticasSR >= 3 || conocimiento >= 40) i = 0;
        else if (criticasSR >= 1 || conocimiento >= 25) i = 1;
        else if (m.sinRespaldo.length >= 1 || conocimiento >= 10) i = 2;
        return { ...m, criticasSR, conocimiento, ...NIVELES[i], orden: i };
    }).sort((a, b) => a.orden - b.orden || b.criticasSR - a.criticasSR || b.conocimiento - a.conocimiento);

    const top = filas.slice().sort((a, b) => b.conocimiento - a.conocimiento);
    return { filas, top1: top[0]?.conocimiento || 0, top2: (top[0]?.conocimiento || 0) + (top[1]?.conocimiento || 0) };
}

function seccionRiesgo(rg) {
    const item = t => `<li class="truncate"><span class="font-mono text-[10px] text-slate-400">${escapeHtml(t.codigo_contenedor || '')}</span> ${escapeHtml(t.actividad || '')}${(t.importancia === 'Muy alto' || t.importancia === 'Alto') ? ' <span class="text-red-600 font-bold">●</span>' : ''}</li>`;
    return `
        <div class="card p-4 mb-4">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-3">
                <div>
                    <h4 class="font-semibold text-sm text-slate-800">Riesgo por modelador · ¿qué pierdo si se va?</h4>
                    <p class="text-[11px] text-slate-500">Sin respaldo = actividades abiertas donde es el único modelador (el supervisor no cuenta). Conocimiento = % de las horas en actividades críticas de las últimas 4 semanas.
                    Crítico: ≥ 3 críticas sin respaldo o ≥ 40% del conocimiento · Alto: ≥ 1 crítica sin respaldo o ≥ 25% · Medio: alguna sin respaldo o ≥ 10%.</p>
                </div>
                <div class="flex flex-wrap items-center gap-3 text-xs whitespace-nowrap">
                    <div class="flex items-center gap-1" title="Actividades planificadas por modelador y semana, para presentar a residencia">
                        <select id="rep-mod-semanas" class="text-xs border rounded px-1 py-1">
                            <option value="4" selected>4 semanas + en curso</option>
                            <option value="8">8 semanas + en curso</option>
                            <option value="12">12 semanas + en curso</option>
                        </select>
                        <button onclick="window.exportarReporteModeladores()" class="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 transition"><i class="fa-solid fa-file-pdf mr-1"></i>Exportar PDF</button>
                    </div>
                    <span class="text-slate-500">Top 1: <b class="${rg.top1 >= 40 ? 'text-red-700' : rg.top1 >= 25 ? 'text-amber-700' : 'text-emerald-700'}">${rg.top1.toFixed(0)}%</b></span>
                    <span class="text-slate-500">Top 2: <b class="${rg.top2 >= 70 ? 'text-red-700' : rg.top2 >= 50 ? 'text-amber-700' : 'text-emerald-700'}">${rg.top2.toFixed(0)}%</b></span>
                </div>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${rg.filas.map(m => `
                    <div class="rounded-lg border border-${m.color}-200 bg-${m.color}-50 p-3">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2 min-w-0">
                                <div class="w-7 h-7 rounded-full ${colorAvatar(m.id)} text-white text-[10px] font-bold flex items-center justify-center shrink-0">${getIniciales(m.nombre).toUpperCase()}</div>
                                <span class="font-semibold text-slate-800 text-xs truncate">${escapeHtml(m.nombre)}</span>
                            </div>
                            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-${m.color}-600 text-white">${m.nivel}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-center mb-2">
                            <div><p class="text-xl font-bold text-slate-800">${m.sinRespaldo.length}</p><p class="text-[10px] text-slate-500">sin respaldo (${m.criticasSR} críticas)</p></div>
                            <div><p class="text-xl font-bold text-slate-800">${m.conocimiento.toFixed(0)}%</p><p class="text-[10px] text-slate-500">de horas críticas</p></div>
                        </div>
                        ${m.sinRespaldo.length ? `
                        <details class="text-[11px] text-slate-700">
                            <summary class="cursor-pointer text-slate-500">Ver actividades sin respaldo</summary>
                            <ul class="mt-1 space-y-0.5 max-h-32 overflow-y-auto">${m.sinRespaldo.map(item).join('')}</ul>
                        </details>` : '<p class="text-[11px] text-slate-400">Todas sus actividades tienen respaldo.</p>'}
                    </div>`).join('') || '<p class="text-[11px] text-slate-400">Sin modeladores.</p>'}
            </div>
        </div>`;
}

// Botón "Exportar PDF": actividades planificadas por modelador y semana (para residencia).
window.exportarReporteModeladores = function () {
    try {
        const nCerradas = Number(document.getElementById('rep-mod-semanas')?.value) || 4;
        const datos = armarReporteModeladores({
            modeladores: state.perfilesCache.filter(esModeladorPerfil),
            tareas: state.tasksCache,
            recursos: state.actividadRecursosCache,
            especialidades: state.especialidadesTodasCache,
            nCerradas,
            esLaborable: esDiaLaborable
        });
        exportarPDFModeladores(datos);
    } catch (e) {
        console.error('Error al generar el PDF de modeladores:', e);
        toast('No se pudo generar el PDF. Revisa la consola.');
    }
};
