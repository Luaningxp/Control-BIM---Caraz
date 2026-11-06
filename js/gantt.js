import { state } from './db.js';
import { escapeHtml, fmtDate, nombreFormateado, semaforo } from './utils.js';

let ganttState = {
    filterGrupo: '',
    filterResp: '',
    filterRecursos: '',
    estadosOcultos: [],
    iniDesde: '',
    iniHasta: '',
    finDesde: '',
    finHasta: '',
    soloVencidas: false,
    soloPorVencer: false,
    soloSinFecha: false,
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
    // Base: tareas con fechas asignadas
    const tareasConFechas = state.tasksCache.filter(t => t.fecha_inicio_programado && t.fecha_fin);

    // Aplicar filtros
    let tareas = tareasConFechas.filter(t => {
        const matchGrupo = !ganttState.filterGrupo || t.grupo === ganttState.filterGrupo;
        const matchResp = !ganttState.filterResp || t.responsable_id === ganttState.filterResp;
        const matchRecursos = !ganttState.filterRecursos || state.actividadRecursosCache.some(r => 
            r.pendiente_id === t.id && r.usuario_id === ganttState.filterRecursos
        );
        const matchEstado = ganttState.estadosOcultos.length === 0 || !ganttState.estadosOcultos.includes(t.estado);
        const matchIniDesde = !ganttState.iniDesde || (t.fecha_inicio_programado && t.fecha_inicio_programado >= ganttState.iniDesde);
        const matchIniHasta = !ganttState.iniHasta || (t.fecha_inicio_programado && t.fecha_inicio_programado <= ganttState.iniHasta);
        const matchFinDesde = !ganttState.finDesde || (t.fecha_fin && t.fecha_fin >= ganttState.finDesde);
        const matchFinHasta = !ganttState.finHasta || (t.fecha_fin && t.fecha_fin <= ganttState.finHasta);
        const matchVencidas = !ganttState.soloVencidas || semaforo(t) === 'Vencida';
        const matchPorVencer = !ganttState.soloPorVencer || semaforo(t) === 'Por vencer';
        const matchSinFecha = !ganttState.soloSinFecha || semaforo(t) === 'Sin fecha';
        return matchGrupo && matchResp && matchRecursos && matchEstado &&
               matchIniDesde && matchIniHasta && matchFinDesde && matchFinHasta &&
               matchVencidas && matchPorVencer && matchSinFecha;
    });

    const sinFechas = state.tasksCache.length - tareasConFechas.length;

    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreFormateado(p) }));
    const recursosOpts = state.perfilesCache.filter(p => 
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    );
    const estadosOpts = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];

    const filtrosActivos = Object.entries(ganttState).filter(([k, v]) => {
        if (['viewMode', 'currentGantt'].includes(k)) return false;
        if (Array.isArray(v)) return v.length > 0;
        return v !== '' && v !== false && v !== null;
    }).length;

    const conteoEstado = {};
    tareas.forEach(t => {
        conteoEstado[t.estado] = (conteoEstado[t.estado] || 0) + 1;
    });

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 flex-wrap">
                <button onclick="window.toggleGanttFilterDrawer()" class="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <i class="fa-solid fa-filter"></i> Filtros
                    ${filtrosActivos > 0 ? `<span class="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">${filtrosActivos}</span>` : ''}
                </button>
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

        ${tareas.length === 0 ? `
            <div class="card p-8 text-center text-slate-500">
                <i class="fa-solid fa-calendar-days text-3xl text-slate-300 mb-3"></i>
                <p class="text-sm font-semibold mb-1">No hay actividades para mostrar</p>
                <p class="text-xs">Las tareas necesitan tener Fecha Inicio y Fin Prog.</p>
                ${sinFechas > 0 ? `<p class="text-xs text-amber-600 mt-2">Hay ${sinFechas} tarea(s) sin fechas.</p>` : ''}
            </div>
        ` : `
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
        `}
    `;

    // Drawer de filtros
    if (!document.getElementById('gantt-filter-drawer')) {
        const drawerHtml = `
            <div id="gantt-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.toggleGanttFilterDrawer()"></div>
            <div id="gantt-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-sm text-slate-800">Filtros del Gantt</h3>
                    <button onclick="window.toggleGanttFilterDrawer()" class="text-slate-400 hover:text-slate-700">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <div class="p-4 space-y-4 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Grupo</label>
                        <select id="gantt-drawer-grupo" class="inp" onchange="window.applyGanttFilter('filterGrupo', this.value)">
                            <option value="">Todos</option>
                            ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${ganttState.filterGrupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Responsable</label>
                        <select id="gantt-drawer-resp" class="inp" onchange="window.applyGanttFilter('filterResp', this.value)">
                            <option value="">Todos</option>
                            ${respOpts.map(r => `<option value="${r.id}" ${ganttState.filterResp === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Recursos</label>
                        <select id="gantt-drawer-recursos" class="inp" onchange="window.applyGanttFilter('filterRecursos', this.value)">
                            <option value="">Todos</option>
                            ${recursosOpts.map(p => `<option value="${p.id}" ${ganttState.filterRecursos === p.id ? 'selected' : ''}>${escapeHtml(nombreFormateado(p))}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-2">Ocultar estados</label>
                        <div class="space-y-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                            ${estadosOpts.map(e => `
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" class="rounded text-red-600" 
                                           ${ganttState.estadosOcultos.includes(e) ? 'checked' : ''}
                                           onchange="window.toggleGanttEstadoOculto('${e}', this.checked)">
                                    <span class="text-slate-700">${e}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <h4 class="font-bold text-slate-700 mb-2">Fecha Inicio Prog.</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Desde</label>
                                <input type="date" id="gantt-drawer-ini-desde" class="inp" value="${ganttState.iniDesde || ''}" onchange="window.applyGanttFilter('iniDesde', this.value)">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Hasta</label>
                                <input type="date" id="gantt-drawer-ini-hasta" class="inp" value="${ganttState.iniHasta || ''}" onchange="window.applyGanttFilter('iniHasta', this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <h4 class="font-bold text-slate-700 mb-2">Fecha Fin Prog.</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Desde</label>
                                <input type="date" id="gantt-drawer-fin-desde" class="inp" value="${ganttState.finDesde || ''}" onchange="window.applyGanttFilter('finDesde', this.value)">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Hasta</label>
                                <input type="date" id="gantt-drawer-fin-hasta" class="inp" value="${ganttState.finHasta || ''}" onchange="window.applyGanttFilter('finHasta', this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4 space-y-2">
                        <h4 class="font-bold text-slate-700 mb-2">Semáforo</h4>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="rounded text-sky-600" ${ganttState.soloVencidas ? 'checked' : ''} onchange="window.applyGanttFilter('soloVencidas', this.checked)">
                            Solo vencidas
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="rounded text-sky-600" ${ganttState.soloPorVencer ? 'checked' : ''} onchange="window.applyGanttFilter('soloPorVencer', this.checked)">
                            Solo por vencer (≤ 7 días)
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="rounded text-sky-600" ${ganttState.soloSinFecha ? 'checked' : ''} onchange="window.applyGanttFilter('soloSinFecha', this.checked)">
                            Solo sin fecha
                        </label>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <button onclick="window.clearGanttFilters()" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                            <i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    if (tareas.length > 0) {
        setTimeout(() => inicializarGantt(tareas), 100);
    }
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
    // 1. Pintar las barras
    const bars = document.querySelectorAll('.bar-wrapper .bar');
    bars.forEach((bar, idx) => {
        const t = tasksData[idx];
        if (!t) return;
        const color = COLORES_ESTADO[t._estado] || '#94a3b8';
        bar.style.fill = color;
        const progress = bar.querySelector('.bar-progress');
        if (progress) progress.style.fill = color;
    });

    // 2. Línea de HOY
    const ganttWrapper = document.getElementById('gantt-wrapper');
    const ganttContainer = document.getElementById('gantt-container');
    if (!ganttWrapper || !ganttContainer) return;

    // Eliminar contenedor anterior si existe (para no duplicar)
    const oldContainer = document.getElementById('today-line-container');
    if (oldContainer) oldContainer.remove();

    // Obtener la fecha REAL de inicio leyendo el primer "tick" del calendario
    const ticks = ganttContainer.querySelectorAll('.tick');
    if (ticks.length === 0) return;
    
    // Frappe guarda la fecha en el atributo data-date (ej. "2026-11-01")
    const firstTickDate = ticks[0].getAttribute('data-date');
    if (!firstTickDate) return;

    const startDate = new Date(firstTickDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Calcular días exactos transcurridos
    const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    
    // Ancho de la columna izquierda (donde están los nombres)
    const sideHeader = ganttContainer.querySelector('.side-header');
    const sidebarWidth = sideHeader ? sideHeader.offsetWidth : 200;
    
    // Ancho de la columna según la vista
    const colWidth = ganttState.viewMode === 'Day' ? 40 : ganttState.viewMode === 'Week' ? 60 : 100;
    
    let offsetPx = 0;
    if (ganttState.viewMode === 'Day') offsetPx = diffDays * colWidth;
    else if (ganttState.viewMode === 'Week') offsetPx = (diffDays / 7) * colWidth;
    else if (ganttState.viewMode === 'Month') offsetPx = (diffDays / 30.44) * colWidth;

    const finalLeft = sidebarWidth + offsetPx;

    // 3. Crear un contenedor "espejo" que oculte lo que sobra pero permita el scroll
    const lineContainer = document.createElement('div');
    lineContainer.id = 'today-line-container';
    
    // Calculamos la altura del header para que no pase por encima
    const header = ganttContainer.querySelector('.grid-header');
    const headerHeight = header ? header.offsetHeight : 50;

    lineContainer.style.cssText = `
        position: absolute;
        top: ${headerHeight}px; /* Empieza justo debajo del encabezado del calendario */
        left: 0;
        right: 0;
        bottom: 0;
        overflow: hidden; /* Evita que la línea se escape a los lados */
        pointer-events: none;
        z-index: 50;
    `;

    // 4. Crear la línea
    const line = document.createElement('div');
    line.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        left: ${finalLeft}px;
        width: 2px;
        background: #ef4444;
        pointer-events: none;
    `;
    
    // Etiqueta HOY
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

    lineContainer.appendChild(line);
    
    // Hacemos que el contenedor sea pariente del contenedor del gantt para posicionarlo bien
    ganttWrapper.style.position = 'relative';
    ganttWrapper.appendChild(lineContainer);

    // 5. Sincronizar el scroll
    // Buscamos el contenedor que realmente scrollea en Frappe
    const scrollWrapper = ganttContainer.querySelector('.gantt-container') || ganttContainer;
    
    // Removemos el evento anterior si existía
    if (window.todayScrollListener) {
        scrollWrapper.removeEventListener('scroll', window.todayScrollListener);
    }
    
    // Agregamos el nuevo
    window.todayScrollListener = () => {
        const scrollLeft = scrollWrapper.scrollLeft;
        // Movemos la línea en sentido contrario para que parezca que está quieta en su fecha
        line.style.transform = `translateX(-${scrollLeft}px)`;
    };
    scrollWrapper.addEventListener('scroll', window.todayScrollListener);
}

window.toggleGanttFilterDrawer = function() {
    const drawer = document.getElementById('gantt-filter-drawer');
    const overlay = document.getElementById('gantt-filter-drawer-overlay');
    if (!drawer || !overlay) return;
    const isOpen = !drawer.classList.contains('translate-x-full');
    if (isOpen) {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    } else {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
    }
};

window.applyGanttFilter = function(key, value) {
    ganttState[key] = value;
    window.renderView();
};

window.toggleGanttEstadoOculto = function(estado, checked) {
    if (checked) {
        if (!ganttState.estadosOcultos.includes(estado)) {
            ganttState.estadosOcultos.push(estado);
        }
    } else {
        ganttState.estadosOcultos = ganttState.estadosOcultos.filter(e => e !== estado);
    }
    window.renderView();
};

window.clearGanttFilters = function() {
    ganttState = {
        filterGrupo: '', filterResp: '', filterRecursos: '', estadosOcultos: [],
        iniDesde: '', iniHasta: '', finDesde: '', finHasta: '',
        soloVencidas: false, soloPorVencer: false, soloSinFecha: false,
        viewMode: ganttState.viewMode,
        currentGantt: ganttState.currentGantt
    };
    window.renderView();
};
