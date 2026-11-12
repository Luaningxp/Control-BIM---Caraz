import { state } from './db.js';
import { escapeHtml, fmtDate, nombreFormateado, semaforo, getCriticidad, getIniciales, colorAvatar } from './utils.js';
import { tipoDia } from './roster.js';

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

let ocupacionState = {
    semanaOffset: 0,
    diasVisibles: 42
};

const COLORES_ESTADO = {
    'No iniciado': '#94a3b8',
    'En proceso': '#0284c7',
    'En espera': '#f59e0b',
    'Reprogramado': '#7c3aed',
    'Cerrado': '#0d9488'
};

export function renderGantt(container) {
   const tareasConFechas = state.tasksCache.filter(t => 
    t.fecha_inicio_programado && 
    t.fecha_fin && 
    t.fecha_fin >= t.fecha_inicio_programado
);

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
     tareas.sort((a, b) => {
        const fechaA = a.fecha_inicio_programado || '9999-12-31';
        const fechaB = b.fecha_inicio_programado || '9999-12-31';
        return fechaA.localeCompare(fechaB);
    });

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
            <div class="flex flex-wrap items-center gap-2">
                <div class="flex border border-slate-300 rounded-lg overflow-hidden">
                    <button onclick="window.setGanttView('Day')" class="px-2.5 py-1.5 text-xs font-medium ${ganttState.viewMode === 'Day' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">Día</button>
                    <button onclick="window.setGanttView('Week')" class="px-2.5 py-1.5 text-xs font-medium ${ganttState.viewMode === 'Week' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">Semana</button>
                    <button onclick="window.setGanttView('Month')" class="px-2.5 py-1.5 text-xs font-medium ${ganttState.viewMode === 'Month' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">Mes</button>
                </div>
                
                <button onclick="window.openExportModal()" class="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 transition whitespace-nowrap">
                    <i class="fa-solid fa-file-pdf mr-1"></i> Exportar PDF
                </button>
                
                <button onclick="window.fetchAll().then(window.renderView)" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition whitespace-nowrap">
                    <i class="fa-solid fa-rotate-right mr-1"></i> Refrescar
                </button>
            </div>
        </div>

        ${tareas.length === 0 ? `
            <div class="card p-8 text-center text-slate-500">
                <i class="fa-solid fa-calendar-days text-3xl text-slate-300 mb-3"></i>
                <p class="text-sm font-semibold mb-1">No hay actividades para mostrar</p>
                <p class="text-xs">Las tareas necesitan tener Fecha Inicio y Fin Prog.</p>
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

                <div id="gantt-wrapper" class="relative w-full z-0">
                    <div id="gantt-container" class="relative"></div>
                </div>
            </div>

                        <p class="text-[11px] text-slate-400 mt-2">
                <i class="fa-solid fa-circle-info mr-1"></i>
                Las tareas que no tienen fecha de inicio o fin no se muestran en el Gantt.
            </p>
        `}

        <div id="ocupacion-wrapper" class="mt-4"></div>
    `;

    renderOcupacion(document.getElementById('ocupacion-wrapper'), tareas);
    if (!document.getElementById('gantt-filter-drawer')) {
        const drawerHtml = `
            <div id="gantt-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.toggleGanttFilterDrawer()"></div>
            <div id="gantt-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-sm text-slate-800">Filtros del Gantt</h3>
                    <button onclick="window.toggleGanttFilterDrawer()" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark text-lg"></i></button>
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
                                    <input type="checkbox" class="rounded text-red-600" ${ganttState.estadosOcultos.includes(e) ? 'checked' : ''} onchange="window.toggleGanttEstadoOculto('${e}', this.checked)">
                                    <span class="text-slate-700">${e}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="border-t border-slate-200 pt-4 space-y-2">
                        <h4 class="font-bold text-slate-700 mb-2">Semáforo</h4>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="rounded text-sky-600" ${ganttState.soloVencidas ? 'checked' : ''} onchange="window.applyGanttFilter('soloVencidas', this.checked)"> Solo vencidas</label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="rounded text-sky-600" ${ganttState.soloPorVencer ? 'checked' : ''} onchange="window.applyGanttFilter('soloPorVencer', this.checked)"> Solo por vencer</label>
                    </div>
                    <div class="border-t border-slate-200 pt-4">
                        <button onclick="window.clearGanttFilters()" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"><i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    if (tareas.length > 0) {
        setTimeout(() => inicializarGantt(tareas), 150);
    }
}

function inicializarGantt(tareas) {
    const container = document.getElementById('gantt-container');
    if (!container) return;

    if (ganttState.currentGantt) {
        ganttState.currentGantt = null;
    }
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

    const todayStr = new Date().toISOString().split('T')[0];
    tasksData.push({
        id: 'today-line',
        name: 'HOY',
        start: todayStr,
        end: todayStr,
        progress: 0,
        dependencies: '',
        custom_class: 'gantt-today-marker',
        _isToday: true
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
            scroll_to: 'today',
            custom_popup_html: (task) => {
                if (task.id === 'today-line') return '';
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
                        </div>
                    </div>
                `;
            }
        });

        pintarBarrasPorEstado(tareas);

                ganttState.currentGantt.on_click = (task) => {
            if (task.id === 'today-line') return;
            window.editTask(parseInt(task.id));
        };

        // Forzar el scroll a la fecha de hoy
        setTimeout(() => {
            const todayBar = document.querySelector('.gantt-container .bar-wrapper[data-id="today-line"]');
            if (todayBar) {
                todayBar.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else {
                const scroller = document.querySelector('.gantt-container .gantt');
                if (scroller) {
                    const today = new Date().toISOString().split('T')[0];
                    const tick = document.querySelector(`.gantt-container .grid-header .tick[data-date="${today}"]`);
                    if (tick) tick.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                }
            }
        }, 600);

    } catch (err) {
        console.error('Error al crear Gantt:', err);
        container.innerHTML = `<div class="text-red-500 text-sm p-4">Error: ${err.message}</div>`;
    }
}

function pintarBarrasPorEstado(tareas) {
    const aplicar = () => {
        const wrappers = document.querySelectorAll('#gantt-container .bar-wrapper');
        if (wrappers.length === 0) return false;

        wrappers.forEach((wrapper) => {
            const bar = wrapper.querySelector('.bar');
            if (!bar) return;

            const labelEl = wrapper.querySelector('.bar-label');
            const nombre = labelEl ? labelEl.textContent.trim() : '';
            if (nombre === 'HOY') return;

            const idStr = wrapper.getAttribute('data-id') || bar.getAttribute('data-id');
            let tarea = idStr ? tareas.find(t => String(t.id) === String(idStr)) : null;

            if (!tarea) {
                const claseWrapper = wrapper.getAttribute('class') || '';
                const match = claseWrapper.match(/gantt-bar-([a-z-]+)/);
                if (match) {
                    const estadoClase = match[1].replace(/-/g, ' ');
                    tarea = tareas.find(t => t.estado.toLowerCase() === estadoClase);
                }
            }

            const estado = tarea?.estado;
            const color = COLORES_ESTADO[estado] || '#94a3b8';

            bar.style.fill = color;
            bar.setAttribute('fill', color);

            const progress = wrapper.querySelector('.bar-progress');
            if (progress) {
                progress.style.fill = color;
                progress.setAttribute('fill', color);
            }

            const handle = wrapper.querySelector('.handle');
            if (handle) {
                handle.style.fill = color;
                handle.setAttribute('fill', color);
            }
        });

        return true;
    };

    if (aplicar()) {
        setTimeout(aplicar, 300);
        setTimeout(aplicar, 800);
    } else {
        setTimeout(() => { aplicar(); setTimeout(aplicar, 300); }, 200);
    }

    setTimeout(() => dibujarLineaHoyNativa(), 900);
}

function dibujarLineaHoyNativa() {
    const wrapper = document.getElementById('gantt-container');
    if (!wrapper) return;

    const scroller = wrapper.querySelector('.gantt-container') || wrapper;
    if (!scroller) return;

    const oldLine = scroller.querySelector('#today-red-line');
    if (oldLine) oldLine.remove();

    const todayElements = scroller.querySelectorAll('.bar-wrapper');
    let todayBar = null;
    todayElements.forEach(el => {
        const label = el.querySelector('.bar-label');
        if (label && label.textContent.trim() === 'HOY') todayBar = el;
    });
    if (!todayBar) return;

    const rectBar = todayBar.getBoundingClientRect();
    const rectScroller = scroller.getBoundingClientRect();
    const leftPos = rectBar.left - rectScroller.left + scroller.scrollLeft;

    if (!scroller.style.position || scroller.style.position === 'static') {
        scroller.style.position = 'relative';
    }

    const line = document.createElement('div');
    line.id = 'today-red-line';
    line.style.cssText = `
        position: absolute;
        top: 50px;
        bottom: 0;
        left: ${leftPos}px;
        width: 2px;
        background-color: #ef4444;
        z-index: 5;
        pointer-events: none;
    `;
    line.innerHTML = `
        <div style="
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            background-color: #ef4444;
            color: white;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
            box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        ">HOY</div>
    `;

        scroller.appendChild(line);
}

window.setGanttView = function(mode) {
    ganttState.viewMode = mode;
    if (ganttState.currentGantt) {
        ganttState.currentGantt.change_view_mode(mode);
        // Al cambiar de vista, se vuelve a renderizar todo para colocar la línea de hoy en el lugar correcto
        setTimeout(() => {
            const tareasFiltradas = state.tasksCache.filter(t => t.fecha_inicio_programado && t.fecha_fin);
            inicializarGantt(tareasFiltradas);
        }, 300);
        window.renderView();
    } else {
        window.renderView();
    }
};

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
        if (!ganttState.estadosOcultos.includes(estado)) ganttState.estadosOcultos.push(estado);
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
        viewMode: ganttState.viewMode, currentGantt: ganttState.currentGantt
    };

    // ▼ Añadir esta línea ▼
    const drawer = document.getElementById('gantt-filter-drawer');
    if (drawer) drawer.remove();
    const overlay = document.getElementById('gantt-filter-drawer-overlay');
    if (overlay) overlay.remove();
    // ▲ Añadir esta línea ▲

    window.renderView();
};
function rangoOcupacion() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() + ocupacionState.semanaOffset * 7 - 3);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + ocupacionState.diasVisibles - 1);
    return { inicio, fin };
}

function renderOcupacion(container, tareasFiltradas) {
    const { inicio, fin } = rangoOcupacion();
    const dias = [];
    const cur = new Date(inicio);
    while (cur <= fin) {
        dias.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }

    const modeladores = state.perfilesCache.filter(p =>
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    ).sort((a, b) => nombreFormateado(a).localeCompare(nombreFormateado(b)));

    const totalDias = dias.length;
    const anchoDiaPct = 100 / totalDias;

        const hoyDate = new Date();
    hoyDate.setHours(0, 0, 0, 0);
    const hoyIdx = Math.round((hoyDate - inicio) / 86400000);
    const hoyEnRango = hoyIdx >= 0 && hoyIdx < totalDias;
    const hoyLeft = hoyEnRango ? hoyIdx * anchoDiaPct : -1;

    const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const COLOR_CRIT = {
        'Muy alto': '#b91c1c',
        'Alto':     '#f59e0b',
        'Medio':    '#2563eb',
        'Bajo':     '#94a3b8'
    };
    const BORDE_ESTADO = {
        'No iniciado':  '#64748b',
        'En proceso':   '#0ea5e9',
        'En espera':    '#eab308',
        'Reprogramado': '#a855f7',
        'Cerrado':      '#10b981'
    };

        const cabeceraDias = dias.map((d, i) => {
        const esLunes = d.getDay() === 1;
        const esDomingo = d.getDay() === 0;
        const esPrimero = d.getDate() === 1;
        const esHoy = i === hoyIdx;
        const etiquetaMes = (esPrimero || i === 0) ? `<div class="text-[8px] font-bold text-slate-500 dark:text-slate-400 leading-none">${MESES_CORTO[d.getMonth()]}</div>` : '';
        const claseFondo = esHoy
            ? 'bg-sky-200 dark:bg-sky-900/60 ring-1 ring-inset ring-sky-500'
            : esDomingo
                ? 'bg-slate-200 dark:bg-slate-700'
                : '';
        return `<div class="text-center ${claseFondo} ${esLunes ? 'border-l border-slate-300 dark:border-slate-600' : ''}" style="width:${anchoDiaPct}%;">
            ${etiquetaMes}
            <div class="text-[9px] leading-tight ${esHoy ? 'text-sky-800 dark:text-sky-200 font-bold' : 'text-slate-600 dark:text-slate-300'}">${['D','L','M','M','J','V','S'][d.getDay()]}</div>
            <div class="text-[9px] font-bold ${esHoy ? 'text-sky-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}">${d.getDate()}</div>
        </div>`;
    }).join('');

    const filas = modeladores.map(p => {
        const tareasUsuario = tareasFiltradas.filter(t => {
            const esResp = t.responsable_id === p.id;
            const esRec = (state.actividadRecursosCache || []).some(r => r.pendiente_id === t.id && r.usuario_id === p.id);
            return esResp || esRec;
        });

        const conFechas = tareasUsuario.filter(t => t.fecha_inicio_programado && t.fecha_fin);

        // Calcular índices de cada barra dentro del rango visible
        const barrasCalc = conFechas.map(t => {
            const iniT = new Date(t.fecha_inicio_programado + 'T00:00:00');
            const finT = new Date(t.fecha_fin + 'T00:00:00');
            const iniIdx = Math.max(0, Math.round((iniT - inicio) / 86400000));
            const finIdx = Math.min(totalDias - 1, Math.round((finT - inicio) / 86400000));
            if (finIdx < 0 || iniIdx > totalDias - 1 || finIdx < iniIdx) return null;
            return { t, iniIdx, finIdx };
        }).filter(Boolean);

        // Asignar sub-fila por apilado (interval partitioning greedy)
        // Se ordena por iniIdx, cada barra va a la primera sub-fila cuyo última finIdx sea < iniIdx
        const ordenadas = [...barrasCalc].sort((a, b) => a.iniIdx - b.iniIdx);
        const subfilas = [];
        ordenadas.forEach(b => {
            let asignada = -1;
            for (let s = 0; s < subfilas.length; s++) {
                if (subfilas[s] < b.iniIdx) { asignada = s; break; }
            }
            if (asignada === -1) { asignada = subfilas.length; subfilas.push(b.finIdx); }
            else { subfilas[asignada] = b.finIdx; }
            b.subfila = asignada;
        });
        const numSubfilas = Math.max(1, subfilas.length);

        // Franjas no laborables: DO solo si el día no tiene ninguna tarea asignada a este modelador;
        // DE y FE siempre se rayan porque son bloqueos explícitos.
        const diasConTarea = new Set();
        barrasCalc.forEach(b => { for (let i = b.iniIdx; i <= b.finIdx; i++) diasConTarea.add(i); });

        const franjasNoLaborables = [];
        for (let i = 0; i < dias.length; i++) {
            const dStr = dias[i].toISOString().split('T')[0];
            const tipo = tipoDia(p.id, dStr);
            let bloquear = false;
            if (tipo === 'DE' || tipo === 'FE') bloquear = true;
            else if (tipo === 'DO' && !diasConTarea.has(i)) bloquear = true;
            if (bloquear) {
                if (franjasNoLaborables.length > 0 && franjasNoLaborables[franjasNoLaborables.length - 1].finIdx === i - 1) {
                    franjasNoLaborables[franjasNoLaborables.length - 1].finIdx = i;
                } else {
                    franjasNoLaborables.push({ iniIdx: i, finIdx: i });
                }
            }
        }

        const fondoFranjas = franjasNoLaborables.map(f => {
            const left = f.iniIdx * anchoDiaPct;
            const width = (f.finIdx - f.iniIdx + 1) * anchoDiaPct;
            return `<div class="absolute top-0 bottom-0 opacity-40" style="left:${left}%;width:${width}%;background:repeating-linear-gradient(45deg, #94a3b8 0, #94a3b8 2px, transparent 2px, transparent 8px);"></div>`;
        }).join('');

        const alturaFila = 8 + numSubfilas * 22;

        const barras = barrasCalc.map(b => {
            const { t, iniIdx, finIdx, subfila } = b;
            const left = iniIdx * anchoDiaPct;
            const width = (finIdx - iniIdx + 1) * anchoDiaPct;
            const crit = getCriticidad(t);
            const bg = COLOR_CRIT[crit] || '#94a3b8';
            const borde = BORDE_ESTADO[t.estado] || '#94a3b8';

            // Conflicto: solo DE o FE cuentan como aviso real, DO se ignora porque se asume trabajo
            let conflicto = false;
            for (let i = iniIdx; i <= finIdx; i++) {
                const dStr = dias[i].toISOString().split('T')[0];
                const tipo = tipoDia(p.id, dStr);
                if (tipo === 'DE' || tipo === 'FE') { conflicto = true; break; }
            }

            const topPx = 4 + subfila * 22;
            const titulo = `${t.actividad}\n${fmtDate(t.fecha_inicio_programado)} → ${fmtDate(t.fecha_fin)}\nEstado: ${t.estado}\nCriticidad: ${crit}${conflicto ? '\n⚠ Programada sobre descanso o feriado' : ''}`;
            return `<div onclick="event.stopPropagation(); window.editTask(${t.id})" class="absolute rounded shadow-sm cursor-pointer hover:brightness-110 transition" 
                        style="left:${left}%;width:${width}%;top:${topPx}px;height:18px;background:${bg};border-left:3px solid ${borde};" 
                        title="${escapeHtml(titulo)}">
                        <span class="absolute left-1 top-0 bottom-0 flex items-center text-[9px] font-semibold text-white/95 truncate pointer-events-none" style="max-width:calc(100% - 8px);">${escapeHtml(t.actividad)}</span>
                        ${conflicto ? `<i class="fa-solid fa-triangle-exclamation absolute -top-1 -right-1 text-[10px] text-amber-300 drop-shadow"></i>` : ''}
                    </div>`;
        }).join('');

        return `
            <div class="flex border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                <div class="sticky left-0 z-10 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 p-2 flex items-center gap-2" style="width:200px;min-width:200px;">
                    <div class="w-6 h-6 rounded-full ${colorAvatar(p.id)} text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">${getIniciales(nombreFormateado(p)).toUpperCase()}</div>
                    <div class="min-w-0 flex-1">
                        <div class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">${escapeHtml(nombreFormateado(p))}</div>
                        <div class="text-[9px] text-slate-500 dark:text-slate-400">${tareasUsuario.length} tarea${tareasUsuario.length === 1 ? '' : 's'}</div>
                    </div>
                </div>
                <div class="relative flex-1" style="min-height:${alturaFila}px;">
                    ${fondoFranjas}
                    ${hoyEnRango ? `<div class="absolute top-0 bottom-0 pointer-events-none" style="left:${hoyLeft}%;width:${anchoDiaPct}%;background:rgba(56,189,248,0.18);border-left:1px solid rgba(14,165,233,0.6);border-right:1px solid rgba(14,165,233,0.6);"></div>` : ''}
                    ${barras}
                </div>
            </div>
        `;
    }).join('');

    const prevBtn = `<button onclick="window.ocupacionMove(-1)" class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"><i class="fa-solid fa-chevron-left"></i></button>`;
    const nextBtn = `<button onclick="window.ocupacionMove(1)" class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"><i class="fa-solid fa-chevron-right"></i></button>`;
    const todayBtn = `<button onclick="window.ocupacionMove(0)" class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Hoy</button>`;

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2">
            <div>
                <h4 class="font-semibold text-sm text-slate-800 dark:text-white">Ocupación por modelador</h4>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">${fmtDate(inicio.toISOString().split('T')[0])} → ${fmtDate(fin.toISOString().split('T')[0])} · Fondo rayado = día no laborable sin tarea</p>
            </div>
            <div class="flex items-center gap-1">
                ${prevBtn}${todayBtn}${nextBtn}
            </div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <div style="min-width:900px;">
                    <div class="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                        <div class="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 p-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" style="width:200px;min-width:200px;">Modelador</div>
                        <div class="flex flex-1">${cabeceraDias}</div>
                    </div>
                    ${filas}
                </div>
            </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[10px] mt-2 text-slate-500 dark:text-slate-400">
            <span class="font-bold uppercase tracking-wide">Criticidad:</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:#b91c1c"></span>Muy alto</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:#f59e0b"></span>Alto</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:#2563eb"></span>Medio</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:#94a3b8"></span>Bajo</span>
            <span class="inline-flex items-center gap-1 ml-2 pl-3 border-l border-slate-300 dark:border-slate-600"><i class="fa-solid fa-triangle-exclamation text-amber-500"></i>Sobre descanso o feriado</span>
        </div>
    `;
}
window.ocupacionMove = function(dir) {
    if (dir === 0) ocupacionState.semanaOffset = 0;
    else ocupacionState.semanaOffset += dir;
    window.renderView();
};

// ============================================
// EXPORTACIÓN A PDF
// ============================================

window.openExportModal = function() {
    // Si el modal ya existe, lo eliminamos para que se cree de nuevo limpio
    const modalExistente = document.getElementById('modal-export-gantt');
    if (modalExistente) modalExistente.remove();

    const modalHtml = `
        <div id="modal-export-gantt" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-slate-200 dark:border-slate-700">
                <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                    <h3 class="font-bold text-sm text-slate-800 dark:text-white">Exportar Gantt a PDF</h3>
                    <button onclick="document.getElementById('modal-export-gantt').remove()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <form id="form-export-gantt" class="space-y-3 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Rango de fechas</label>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="date" id="exp-fecha-ini" required class="inp">
                            <input type="date" id="exp-fecha-fin" required class="inp">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Tamaño</label>
                            <select id="exp-tamano" class="inp">
                                <option value="a4">A4</option>
                                <option value="a3">A3</option>
                                <option value="a2">A2</option>
                                <option value="letter">Carta</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Orientación</label>
                            <select id="exp-orientacion" class="inp">
                                <option value="l">Horizontal</option>
                                <option value="p">Vertical</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Vista</label>
                            <select id="exp-vista" class="inp">
                                <option value="Day">Día</option>
                                <option value="Week" selected>Semana</option>
                                <option value="Month">Mes</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Calidad</label>
                            <select id="exp-calidad" class="inp">
                                <option value="1">Normal (Rápido)</option>
                                <option value="2" selected>Alta (Recomendado)</option>
                                <option value="3">Muy Alta (Pesado)</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <button type="button" onclick="document.getElementById('modal-export-gantt').remove()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300">Cancelar</button>
                        <button type="submit" id="btn-generar-pdf" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700 flex items-center gap-2">
                            <i class="fa-solid fa-download"></i> Descargar PDF
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Fechas por defecto basadas en las tareas reales
    const hoy = new Date();
    const haceUnMes = new Date(hoy); haceUnMes.setMonth(hoy.getMonth() - 1);
    const dentroUnMes = new Date(hoy); dentroUnMes.setMonth(hoy.getMonth() + 1);
    
    document.getElementById('exp-fecha-ini').value = haceUnMes.toISOString().split('T')[0];
    document.getElementById('exp-fecha-fin').value = dentroUnMes.toISOString().split('T')[0];

    document.getElementById('form-export-gantt').onsubmit = async (e) => {
        e.preventDefault();
        await generarPDFGantt();
    };
};

async function generarPDFGantt() {
    const btn = document.getElementById('btn-generar-pdf');
    const htmlOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    btn.disabled = true;

    const estadoOriginal = {
        iniDesde: ganttState.iniDesde,
        iniHasta: ganttState.iniHasta,
        finDesde: ganttState.finDesde,
        finHasta: ganttState.finHasta,
        viewMode: ganttState.viewMode
    };

    const fIni = document.getElementById('exp-fecha-ini').value;
    const fFin = document.getElementById('exp-fecha-fin').value;
    const tamano = document.getElementById('exp-tamano').value;
    const orientacion = document.getElementById('exp-orientacion').value;
    const vista = document.getElementById('exp-vista').value;
    const calidad = parseFloat(document.getElementById('exp-calidad').value);

    // 1. Filtrar tareas del rango
        // Filtro ESTRICTO: Solo tareas que empiezan dentro del rango
    // Esto evita que frappe-gantt expanda el lienzo hacia atrás
        const tareasReales = state.tasksCache
        .filter(t => 
            t.fecha_inicio_programado && 
            t.fecha_fin && 
            t.fecha_fin >= t.fecha_inicio_programado &&
            t.fecha_fin >= fIni &&  // Se solapa con el rango
            t.fecha_inicio_programado <= fFin
        )
        .map(t => {
            // Si la tarea empieza antes del rango, la recortamos a fIni
            const inicioRecortado = t.fecha_inicio_programado < fIni ? fIni : t.fecha_inicio_programado;
            return {
                ...t,
                fecha_inicio_programado: inicioRecortado
            };
        });

    // 2. Tareas fantasma con duración mínima de 1 día
    const fIniMasUnDia = new Date(fIni + 'T00:00:00');
    fIniMasUnDia.setDate(fIniMasUnDia.getDate() + 1);
    const fIniStr = fIniMasUnDia.toISOString().split('T')[0];

    const fFinMasUnDia = new Date(fFin + 'T00:00:00');
    fFinMasUnDia.setDate(fFinMasUnDia.getDate() + 1);
    const fFinStr = fFinMasUnDia.toISOString().split('T')[0];

    const tareasFantasma = [
        { id: 'phantom-start', name: '', start: fIni, end: fIniStr, progress: 0, dependencies: '', custom_class: 'gantt-phantom', _isPhantom: true },
        { id: 'phantom-end', name: '', start: fFin, end: fFinStr, progress: 0, dependencies: '', custom_class: 'gantt-phantom', _isPhantom: true }
    ];

    const tareasParaExportar = [...tareasReales, ...tareasFantasma];

    // 3. Inicializar Gantt temporal
    await new Promise(resolve => {
        ganttState.viewMode = vista; 
        inicializarGanttParaPDF(tareasParaExportar);
        setTimeout(resolve, 1000);
    });

    // 4. Guardar estilos originales del contenedor y UI
    const ganttWrapper = document.getElementById('gantt-container');
    const scrollContainer = ganttWrapper.closest('.overflow-x-auto');
    
    const styleOriginalScroll = {
        overflow: scrollContainer ? scrollContainer.style.overflow : '',
        width: scrollContainer ? scrollContainer.style.width : '',
        maxHeight: scrollContainer ? scrollContainer.style.maxHeight : ''
    };
    
    const styleOriginalWrapper = {
        width: ganttWrapper.style.width,
        overflow: ganttWrapper.style.overflow
    };

    const uiElements = document.querySelectorAll('.gantt-ui-hide');
    uiElements.forEach(el => el.style.display = 'none');

    try {
        // 5. EXPANDIR EL CONTENEDOR REAL PARA CAPTURAR TODO
        if (scrollContainer) {
            scrollContainer.style.overflow = 'visible';
            scrollContainer.style.maxHeight = 'none';
            // Forzamos el ancho total
            if (scrollContainer.firstElementChild) {
                scrollContainer.firstElementChild.style.width = scrollContainer.scrollWidth + 'px';
            }
        }
        ganttWrapper.style.overflow = 'visible';
        ganttWrapper.style.width = 'max-content';

        // Damos un instante para que el navegador re-calcule el layout
        await new Promise(resolve => setTimeout(resolve, 300));

        // 6. Capturar el contenedor real ya expandido
        const canvas = await html2canvas(ganttWrapper, {
            scale: calidad,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: ganttWrapper.scrollWidth,
            height: ganttWrapper.scrollHeight,
            windowWidth: ganttWrapper.scrollWidth,
            windowHeight: ganttWrapper.scrollHeight
        });

        // 7. Generar PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF(orientacion, 'mm', tamano);
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Gantt_BIM_${fIni}_al_${fFin}.pdf`);

    } catch (error) {
        console.error('Error al generar PDF:', error);
        alert('Hubo un error al generar el PDF. Revisa la consola.');
    } finally {
        // 8. RESTAURAR TODO
        uiElements.forEach(el => el.style.display = '');
        
        if (scrollContainer) {
            scrollContainer.style.overflow = styleOriginalScroll.overflow;
            scrollContainer.style.width = styleOriginalScroll.width;
            scrollContainer.style.maxHeight = styleOriginalScroll.maxHeight;
            if (scrollContainer.firstElementChild) {
                scrollContainer.firstElementChild.style.width = '';
            }
        }
        ganttWrapper.style.overflow = styleOriginalWrapper.overflow;
        ganttWrapper.style.width = styleOriginalWrapper.width;

        ganttState.iniDesde = estadoOriginal.iniDesde;
        ganttState.iniHasta = estadoOriginal.iniHasta;
        ganttState.finDesde = estadoOriginal.finDesde;
        ganttState.finHasta = estadoOriginal.finHasta;
        ganttState.viewMode = estadoOriginal.viewMode;
        
        window.renderView();

        btn.innerHTML = htmlOriginal;
        btn.disabled = false;
        const modal = document.getElementById('modal-export-gantt');
        if (modal) modal.remove();
    }
}


function inicializarGanttParaPDF(tasksData) {
    const container = document.getElementById('gantt-container');
    if (!container) return;

    if (ganttState.currentGantt) {
        ganttState.currentGantt = null;
    }
    container.innerHTML = '';

    // Mapear las tareas para frappe-gantt
    const datosGantt = tasksData.map(t => {
        const estadoClase = (t.estado || '').replace(/\s/g, '-').toLowerCase();
        return {
            id: String(t.id),
            name: t.name || `${t.codigo_contenedor || ''} ${t.actividad || ''}`.substring(0, 70),
            start: t.start || t.fecha_inicio_programado,
            end: t.end || t.fecha_fin,
            progress: t.progress !== undefined ? t.progress : (t.estado === 'Cerrado' ? 100 : t.estado === 'En proceso' ? 50 : 0),
            dependencies: '',
            custom_class: t._isPhantom ? 'gantt-phantom' : `gantt-bar-${estadoClase}`,
            _estado: t.estado,
            _isPhantom: t._isPhantom
        };
    });

    try {
        ganttState.currentGantt = new Gantt('#gantt-container', datosGantt, {
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
            custom_popup_html: () => '' // Sin popups en el PDF
        });

        // Pintar barras (ignorando las fantasma)
        pintarBarrasPorEstado(tasksData.filter(t => !t._isPhantom));

        // Ocultar visualmente las barras fantasma
        setTimeout(() => {
            document.querySelectorAll('.gantt-phantom').forEach(el => {
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            });
        }, 100);

    } catch (err) {
        console.error('Error al crear Gantt para PDF:', err);
    }
}
