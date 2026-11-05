import { state } from './db.js';
import { escapeHtml, fmtDate, nombreFormateado } from './utils.js';

let ganttState = {
    filterGrupo: '',
    filterResp: '',
    filterEstado: '',
    viewMode: 'Week', // Day, Week, Month
    currentGantt: null
};

export function renderGantt(container) {
    // Solo tareas con fecha de inicio y fin (requisito del Gantt)
    const tareasConFechas = state.tasksCache.filter(t => t.fecha_inicio_programado && t.fecha_fin);
    
    // Aplicar filtros
    let tareas = tareasConFechas.filter(t => {
        const matchGrupo = !ganttState.filterGrupo || t.grupo === ganttState.filterGrupo;
        const matchResp = !ganttState.filterResp || t.responsable_id === ganttState.filterResp;
        const matchEstado = !ganttState.filterEstado || t.estado === ganttState.filterEstado;
        return matchGrupo && matchResp && matchEstado;
    });

    // Verificar si hay tareas
    const sinFechas = state.tasksCache.length - tareasConFechas.length;

    if (tareas.length === 0) {
        container.innerHTML = `
            <div class="card p-8 text-center text-slate-500">
                <i class="fa-solid fa-calendar-days text-3xl text-slate-300 mb-3"></i>
                <p class="text-sm font-semibold mb-1">No hay actividades para mostrar en el Gantt</p>
                <p class="text-xs mb-1">Las tareas necesitan tener <b>Fecha Inicio Prog.</b> y <b>Fin Prog.</b></p>
                ${sinFechas > 0 ? `<p class="text-xs text-amber-600 mt-2">Hay ${sinFechas} tarea(s) sin fechas asignadas.</p>` : ''}
            </div>
        `;
        return;
    }

    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreFormateado(p) }));
    const estadosOpts = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 flex-wrap">
                <select id="gantt-fil-grupo" class="inp max-w-[160px] text-xs py-1.5">
                    <option value="">Todos los grupos</option>
                    ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${ganttState.filterGrupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                </select>
                <select id="gantt-fil-resp" class="inp max-w-[160px] text-xs py-1.5">
                    <option value="">Todos los responsables</option>
                    ${respOpts.map(r => `<option value="${r.id}" ${ganttState.filterResp === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                </select>
                <select id="gantt-fil-estado" class="inp max-w-[150px] text-xs py-1.5">
                    <option value="">Todos los estados</option>
                    ${estadosOpts.map(e => `<option value="${e}" ${ganttState.filterEstado === e ? 'selected' : ''}>${e}</option>`).join('')}
                </select>
            </div>
            <div class="flex items-center gap-2">
                <div class="flex border border-slate-300 rounded-lg overflow-hidden">
                    <button onclick="window.setGanttView('Day')" class="px-2.5 py-1.5 text-xs font-medium ${ganttState.viewMode === 'Day' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">Día</button>
                    <button onclick="window.setGanttView('Week')" class="px-2.5 py-1.5 text-xs font-medium ${ganttState.viewMode === 'Week' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">Semana</button>
                    <button onclick="window.setGanttView('Month')" class="px-2.5 py-1.5 text-xs font-medium ${ganttState.viewMode === 'Month' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">Mes</button>
                </div>
                <button onclick="window.fetchAll().then(window.renderView)" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition">
                    <i class="fa-solid fa-rotate-right mr-1"></i> Refrescar
                </button>
            </div>
        </div>

        <div class="card p-4 overflow-hidden">
            <div id="gantt-container" class="relative"></div>
        </div>

        <p class="text-[11px] text-slate-400 mt-2">
            Mostrando <b>${tareas.length}</b> actividad(es) con fechas asignadas.
            ${sinFechas > 0 ? ` <span class="text-amber-600">(${sinFechas} sin fechas no se muestran)</span>` : ''}
        </p>
    `;

    // Listeners de filtros
    document.getElementById('gantt-fil-grupo').addEventListener('change', (e) => {
        ganttState.filterGrupo = e.target.value;
        window.renderView();
    });
    document.getElementById('gantt-fil-resp').addEventListener('change', (e) => {
        ganttState.filterResp = e.target.value;
        window.renderView();
    });
    document.getElementById('gantt-fil-estado').addEventListener('change', (e) => {
        ganttState.filterEstado = e.target.value;
        window.renderView();
    });

    // Renderizar el Gantt
    setTimeout(() => inicializarGantt(tareas), 100);
}

function inicializarGantt(tareas) {
    const container = document.getElementById('gantt-container');
    if (!container) return;

    // Destruir instancia anterior si existe
    if (ganttState.currentGantt) {
        ganttState.currentGantt = null;
    }
    container.innerHTML = '';

    // Transformar tareas al formato que espera Frappe Gantt
    const tasksData = tareas.map(t => {
        // Colores por estado
        const colores = {
            'No iniciado': '#94a3b8',
            'En proceso': '#0284c7',
            'En espera': '#f59e0b',
            'Reprogramado': '#7c3aed',
            'Cerrado': '#0d9488'
        };
        
        return {
            id: String(t.id),
            name: `${t.codigo_contenedor || ''} ${t.actividad}`.substring(0, 70),
            start: t.fecha_inicio_programado,
            end: t.fecha_fin,
            progress: t.estado === 'Cerrado' ? 100 : t.estado === 'En proceso' ? 50 : 0,
            custom_class: `gantt-estado-${t.estado.replace(/\s/g, '-').toLowerCase()}`,
            _estado: t.estado,
            _grupo: t.grupo,
            _responsable: t.responsable
        };
    });

    // Crear el Gantt
    try {
        ganttState.currentGantt = new Gantt('#gantt-container', tasksData, {
            view_mode: ganttState.viewMode,
            language: 'es',
            header_height: 50,
            column_width: ganttState.viewMode === 'Day' ? 40 : ganttState.viewMode === 'Week' ? 60 : 100,
            step: 24,
            bar_height: 24,
            bar_corner_radius: 4,
            arrow_curve: 5,
            padding: 18,
            date_format: 'YYYY-MM-DD',
            custom_popup_html: (task) => {
                const original = tareas.find(t => String(t.id) === task.id);
                if (!original) return '';
                return `
                    <div class="p-3 bg-white rounded-lg shadow-lg border border-slate-200 text-xs min-w-[220px]">
                        <p class="font-bold text-slate-800 mb-1">${escapeHtml(original.codigo_contenedor || '')}</p>
                        <p class="text-slate-700 mb-2">${escapeHtml(original.actividad)}</p>
                        <div class="text-[11px] text-slate-500 space-y-0.5">
                            <p><b>Inicio:</b> ${fmtDate(original.fecha_inicio_programado)}</p>
                            <p><b>Fin:</b> ${fmtDate(original.fecha_fin)}</p>
                            <p><b>Estado:</b> ${escapeHtml(original.estado)}</p>
                            <p><b>Grupo:</b> ${escapeHtml(original.grupo || '-')}</p>
                        </div>
                    </div>
                `;
            }
        });

        // Aplicar colores por estado después de renderizar
        setTimeout(() => {
            const bars = document.querySelectorAll('.bar-wrapper .bar');
            bars.forEach((bar, idx) => {
                const t = tasksData[idx];
                if (!t) return;
                const color = {
                    'No iniciado': '#94a3b8',
                    'En proceso': '#0284c7',
                    'En espera': '#f59e0b',
                    'Reprogramado': '#7c3aed',
                    'Cerrado': '#0d9488'
                }[t._estado] || '#0284c7';
                bar.style.fill = color;
            });
        }, 100);

        // Click en una barra abre el modal de edición
        ganttState.currentGantt.on_click = (task) => {
            window.editTask(parseInt(task.id));
        };

    } catch (err) {
        console.error('Error al crear Gantt:', err);
        container.innerHTML = `<div class="text-red-500 text-sm p-4">Error al renderizar el Gantt: ${err.message}</div>`;
    }
}

window.setGanttView = function(mode) {
    ganttState.viewMode = mode;
    window.renderView();
};
