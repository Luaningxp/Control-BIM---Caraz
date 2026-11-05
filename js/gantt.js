import { state } from './db.js';
import { escapeHtml, fmtDate, nombreFormateado } from './utils.js';

let ganttState = {
    filterGrupo: '',
    filterResp: '',
    filterEstado: '',
    viewMode: 'Week',
    currentGantt: null
};

const COLORES_ESTADO = {
    'No iniciado': '#94a3b8',
    'En proceso': '#0284c7',
    'En espera': '#f59e0b',
    'Reprogramado': '#7c3aed',
    'Cerrado': '#0d9488'
};

export function renderGantt(container) {
    const tareasConFechas = state.tasksCache.filter(t => t.fecha_inicio_programado && t.fecha_fin);
    
    let tareas = tareasConFechas.filter(t => {
        const matchGrupo = !ganttState.filterGrupo || t.grupo === ganttState.filterGrupo;
        const matchResp = !ganttState.filterResp || t.responsable_id === ganttState.filterResp;
        const matchEstado = !ganttState.filterEstado || t.estado === ganttState.filterEstado;
        return matchGrupo && matchResp && matchEstado;
    });

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

    const conteoEstado = {};
    tareas.forEach(t => {
        conteoEstado[t.estado] = (conteoEstado[t.estado] || 0) + 1;
    });

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

        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            ${estadosOpts.map(estado => {
                const count = conteoEstado[estado] || 0;
                const color = COLORES_ESTADO[estado];
                return `
                    <div class="card p-2 flex items-center gap-2 border-l-4" style="border-left-color: ${color};">
                        <div class="w-2.5 h-2.5 rounded-full" style="background: ${color};"></div>
                        <div>
                            <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">${estado}</p>
                            <p class="text-base font-bold text-slate-800 leading-none mt-0.5">${count}</p>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="card p-4 overflow-hidden">
            <div class="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div class="flex flex-wrap items-center gap-3 text-[11px]">
                    <span class="font-bold text-slate-600 uppercase tracking-wide mr-2">Leyenda:</span>
                    ${estadosOpts.map(estado => `
                        <div class="flex items-center gap-1.5">
                            <div class="w-3 h-3 rounded-sm" style="background: ${COLORES_ESTADO[estado]};"></div>
                            <span class="text-slate-600">${estado}</span>
                        </div>
                    `).join('')}
                    <div class="flex items-center gap-1.5 ml-2 pl-3 border-l border-slate-200">
                        <div class="w-0.5 h-4 bg-red-500"></div>
                        <span class="text-slate-600 font-semibold">Hoy</span>
                    </div>
                </div>
                <p class="text-[11px] text-slate-400">Mostrando ${tareas.length} de ${state.tasksCache.length}</p>
            </div>

            <div id="gantt-wrapper" class="relative overflow-x-auto">
                <div id="gantt-container" class="relative"></div>
            </div>
        </div>

        <p class="text-[11px] text-slate-400 mt-2">
            <i class="fa-solid fa-circle-info mr-1"></i>
            Las tareas que no tienen fecha de inicio o fin no se muestran en el Gantt.
            ${sinFechas > 0 ? ` <span class="text-amber-600">(${sinFechas} sin fechas)</span>` : ''}
        </p>
    `;

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

    setTimeout(() => inicializarGantt(tareas), 100);
}

function inicializarGantt(tareas) {
    const container = document.getElementById('gantt-container');
    if (!container) return;

    if (ganttState.currentGantt) ganttState.currentGantt = null;
    container.innerHTML = '';

    const tasksData = tareas.map(t => {
        const estadoClase = t.estado.replace(/\s/g, '-').toLowerCase();
        return {
            id: String(t.id),
            name: `${t.codigo_contenedor || ''} ${t.actividad}`.substring(0, 70),
            start: t.fecha_inicio_programado,
            end: t.fecha_fin,
            progress: t.estado === 'Cerrado' ? 100 : t.estado === 'En proceso' ? 50 : 0,
            dependencies: '',
            custom_class: `gantt-bar-${estadoClase}`,
            _estado: t.estado,
            _grupo: t.grupo,
            _responsable: t.responsable
        };
    });

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
                const color = COLORES_ESTADO[original.estado] || '#94a3b8';
                return `
                    <div class="p-3 bg-white rounded-lg shadow-lg border border-slate-200 text-xs min-w-[240px]">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-2.5 h-2.5 rounded-full" style="background: ${color};"></div>
                            <p class="font-bold text-slate-800">${escapeHtml(original.codigo_contenedor || '')}</p>
                        </div>
                        <p class="text-slate-700 mb-2 leading-snug">${escapeHtml(original.actividad)}</p>
                        <div class="text-[11px] text-slate-500 space-y-0.5 pt-2 border-t border-slate-100">
                            <p><b class="text-slate-700">Inicio:</b> ${fmtDate(original.fecha_inicio_programado)}</p>
                            <p><b class="text-slate-700">Fin:</b> ${fmtDate(original.fecha_fin)}</p>
                            <p><b class="text-slate-700">Estado:</b> <span style="color: ${color}; font-weight: 700;">${escapeHtml(original.estado)}</span></p>
                            <p><b class="text-slate-700">Grupo:</b> ${escapeHtml(original.grupo || '-')}</p>
                            <p><b class="text-slate-700">Resp:</b> ${escapeHtml(original.responsable || '-')}</p>
                        </div>
                    </div>
                `;
            }
        });

        setTimeout(() => pintarColoresYHoy(tasksData), 150);

        ganttState.currentGantt.on_click = (task) => {
            window.editTask(parseInt(task.id));
        };

    } catch (err) {
        console.error('Error al crear Gantt:', err);
        container.innerHTML = `<div class="text-red-500 text-sm p-4">Error al renderizar el Gantt: ${err.message}</div>`;
    }
}

function pintarColoresYHoy(tasksData) {
    const bars = document.querySelectorAll('.bar-wrapper .bar');
    bars.forEach((bar, idx) => {
        const t = tasksData[idx];
        if (!t) return;
        const color = COLORES_ESTADO[t._estado] || '#94a3b8';
        bar.style.fill = color;
        const progress = bar.querySelector('.bar-progress');
        if (progress) progress.style.fill = color;
    });

    const ganttWrapper = document.getElementById('gantt-wrapper');
    const ganttContainer = document.getElementById('gantt-container');
    if (!ganttWrapper || !ganttContainer) return;
    
    const oldLine = document.getElementById('gantt-today-line');
    if (oldLine) oldLine.remove();

    const colWidth = ganttState.viewMode === 'Day' ? 40 : ganttState.viewMode === 'Week' ? 60 : 100;
    
    let minDate = null;
    tasksData.forEach(t => {
        const d = new Date(t.start + 'T00:00:00');
        if (!minDate || d < minDate) minDate = d;
    });
    if (!minDate) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const diffDays = Math.floor((today - minDate) / (1000 * 60 * 60 * 24));
    
    let offsetPx = 0;
    if (ganttState.viewMode === 'Day') {
        offsetPx = diffDays * colWidth;
    } else if (ganttState.viewMode === 'Week') {
        offsetPx = (diffDays / 7) * colWidth;
    } else if (ganttState.viewMode === 'Month') {
        offsetPx = (diffDays / 30) * colWidth;
    }

    const sidebarWidth = ganttContainer.querySelector('.side-header')?.offsetWidth || 200;
    const finalLeft = sidebarWidth + offsetPx;

    const line = document.createElement('div');
    line.id = 'gantt-today-line';
    line.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        left: ${finalLeft}px;
        width: 2px;
        background: #ef4444;
        z-index: 5;
        pointer-events: none;
    `;
    
    line.innerHTML = `
        <div style="
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            background: #ef4444;
            color: white;
            font-size: 9px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 3px;
            white-space: nowrap;
            letter-spacing: 0.5px;
        ">HOY</div>
    `;

    const ganttGrid = ganttContainer.querySelector('.grid-body') || ganttContainer;
    ganttGrid.style.position = 'relative';
    ganttGrid.appendChild(line);
}

window.setGanttView = function(mode) {
    ganttState.viewMode = mode;
    window.renderView();
};
