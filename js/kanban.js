import { supabaseClient, state, fetchAll } from './db.js';
import { 
    escapeHtml, cdeBadge, nombreResponsable, critColor, toast, 
    getCriticidad, fmtDate, daysToDeadline, nombreFormateado, 
    getIniciales, colorAvatar, semaforo
} from './utils.js';

let kanbanState = { 
    search: '', 
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
    soloAsignadosAMi: true
};

export function renderKanban(container) {
    const ESTADOS = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];
    
    const META = {
        'No iniciado': { t: 'No iniciado', sub: 'Pendiente de inicio', color: 'slate', icon: 'fa-circle' },
        'En proceso': { t: 'En proceso', sub: 'Trabajando en ello', color: 'sky', icon: 'fa-spinner' },
        'En espera': { t: 'En espera', sub: 'Bloqueado / Pausado', color: 'amber', icon: 'fa-pause' },
        'Reprogramado': { t: 'Reprogramado', sub: 'Nueva fecha', color: 'purple', icon: 'fa-calendar-plus' },
        'Cerrado': { t: 'Cerrado', sub: 'Completado', color: 'teal', icon: 'fa-check-circle' }
    };

    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreFormateado(p) }));
    const recursosOpts = state.perfilesCache.filter(p => 
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    );

    const filtrosActivos = Object.values(kanbanState).filter(v => v !== '' && v !== false).length;

        // Aplicar filtros
    const filteredTasks = state.tasksCache.filter(t => {
        const searchLower = (kanbanState.search || '').toLowerCase().trim();
        
        const matchSearch = !searchLower || 
            (t.actividad || '').toLowerCase().includes(searchLower) ||
            (t.codigo_contenedor || '').toLowerCase().includes(searchLower);
            
        const matchGrupo = !kanbanState.filterGrupo || t.grupo === kanbanState.filterGrupo;
        const matchResp = !kanbanState.filterResp || t.responsable_id === kanbanState.filterResp;
        const matchRecursos = !kanbanState.filterRecursos || state.actividadRecursosCache.some(r => 
            r.pendiente_id === t.id && r.usuario_id === kanbanState.filterRecursos
        );
        const matchEstado = kanbanState.estadosOcultos.length === 0 || !kanbanState.estadosOcultos.includes(t.estado);
        const matchIniDesde = !kanbanState.iniDesde || (t.fecha_inicio_programado && t.fecha_inicio_programado >= kanbanState.iniDesde);
        const matchIniHasta = !kanbanState.iniHasta || (t.fecha_inicio_programado && t.fecha_inicio_programado <= kanbanState.iniHasta);
        const matchFinDesde = !kanbanState.finDesde || (t.fecha_fin && t.fecha_fin >= kanbanState.finDesde);
        const matchFinHasta = !kanbanState.finHasta || (t.fecha_fin && t.fecha_fin <= kanbanState.finHasta);
        const matchVencidas = !kanbanState.soloVencidas || semaforo(t) === 'Vencida';
        const matchPorVencer = !kanbanState.soloPorVencer || semaforo(t) === 'Por vencer';
        const matchSinFecha = !kanbanState.soloSinFecha || semaforo(t) === 'Sin fecha';
        
        const matchAsignados = !kanbanState.soloAsignadosAMi || (() => {
            const uid = state.currentUser?.id;
            if (!uid) return false;
            if (t.responsable_id === uid) return true;
            return state.actividadRecursosCache.some(r => r.pendiente_id === t.id && r.usuario_id === uid);
        })();

        return matchSearch && matchGrupo && matchResp && matchRecursos && matchEstado &&
               matchIniDesde && matchIniHasta && matchFinDesde && matchFinHasta &&
               matchVencidas && matchPorVencer && matchSinFecha && matchAsignados;
    });

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="kb-search" placeholder="Buscar actividad..." value="${kanbanState.search}" 
       class="w-full border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50 transition">
                </div>
                <button onclick="window.toggleKanbanFilterDrawer()" class="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <i class="fa-solid fa-filter"></i> Filtros
                    ${filtrosActivos > 0 ? `<span class="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">${filtrosActivos}</span>` : ''}
                </button>
                <button onclick="window.toggleKanbanSoloAsignadosAMi()" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${kanbanState.soloAsignadosAMi ? 'bg-sky-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}">
                    <i class="fa-solid fa-user-check"></i> Asignados a mí
                </button>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium px-2"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-2">
            ${ESTADOS.map(estado => {
                const items = filteredTasks.filter(t => t.estado === estado);
                return `
                    <div class="kb-col bg-slate-100 rounded-lg p-2 min-w-[260px]" data-estado="${estado}"
                         ondragover="window.onDragOver(event)" ondragleave="window.onDragLeave(event)" ondrop="window.onDrop(event, '${estado}')">
                        <div class="flex items-center justify-between px-2 py-2 mb-1 border-b border-slate-200">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid ${META[estado].icon} text-${META[estado].color}-500 text-xs"></i>
                                <div>
                                    <p class="text-[12px] font-bold text-slate-800 leading-tight">${META[estado].t}</p>
                                    <p class="text-[10px] text-slate-500">${META[estado].sub}</p>
                                </div>
                            </div>
                            <span class="text-[11px] font-bold bg-white text-slate-600 rounded-full px-2 py-0.5 border border-slate-200">${items.length}</span>
                        </div>
                        <div class="kb-body max-h-[70vh] overflow-y-auto space-y-2 pr-1">
                            ${items.map(t => {
                                const crit = getCriticidad(t);
                                const d = daysToDeadline(t);
                                const equipo = state.actividadRecursosCache.filter(r => r.pendiente_id === t.id);
                                
                                const esArchivada = t.estado_cde === 'Archived';
                                const esOwner = t.user_id === state.currentUser.id;
                                const esResponsable = t.responsable_id === state.currentUser.id;
                                const esRecurso = state.actividadRecursosCache.some(r => 
                                    r.pendiente_id === t.id && r.usuario_id === state.currentUser.id
                                );
                                const participa = esOwner || esResponsable || esRecurso;
                                
                                let canDrag = false;
                                if (state.isAdmin || state.isCoordinador || state.isSupervisor) {
                                    canDrag = true;
                                } else if (state.isModelador && participa && !esArchivada) {
                                    canDrag = true;
                                }

                                let canEditCard = false;
                                if (state.isAdmin || state.isCoordinador || state.isSupervisor) {
                                    canEditCard = true;
                                } else if (state.isModelador && participa && !esArchivada && t.estado_cde === 'WIP') {
                                    canEditCard = true;
                                }

                                return `
                                <div class="kb-card bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'opacity-70 cursor-not-allowed'}" 
                                     draggable="${canDrag}" 
                                     ${canEditCard ? `ondblclick="window.editTask(${t.id})"` : ''}
                                     ondragstart="window.onDragStart(event, ${t.id})" 
                                     ondragend="window.onDragEnd(event)">
                                    <div class="flex justify-between items-start mb-2">
                                        <span class="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${t.codigo_contenedor || '–'}</span>
                                        ${cdeBadge(t.estado_cde, t.codigo_aptitud)}
                                    </div>
                                    <p class="text-[12px] font-semibold text-slate-800 leading-snug mb-2 line-clamp-2">${escapeHtml(t.actividad)}</p>
                                    
                                    <div class="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                                        <span class="flex items-center gap-1"><i class="fa-solid fa-user text-[9px]"></i> ${escapeHtml(nombreResponsable(t, state.perfilesCache))}</span>
                                        <span class="font-bold ${critColor(crit)}">${crit}</span>
                                    </div>

                                    <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <div class="flex -space-x-1.5">
                                            ${equipo.map(r => {
                                                const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                                                if (!p) return '';
                                                return `<div class="w-5 h-5 rounded-full ${colorAvatar(p.id)} text-white text-[8px] font-bold flex items-center justify-center ring-2 ring-white" title="${escapeHtml(nombreFormateado(p))}">${getIniciales(nombreFormateado(p)).toUpperCase()}</div>`;
                                            }).join('')}
                                        </div>
                                        <div class="text-[10px] ${d !== null && d < 0 ? 'text-red-600 font-bold' : d !== null && d <= 7 ? 'text-amber-600 font-semibold' : 'text-slate-400'}">
                                            <i class="fa-regular fa-calendar mr-1"></i>${t.fecha_fin ? fmtDate(t.fecha_fin) : 'Sin fecha'}
                                        </div>
                                    </div>
                                </div>
                            `}).join('') || '<p class="text-[11px] text-slate-400 text-center py-4 italic">Sin tareas</p>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    if (!document.getElementById('kanban-filter-drawer')) {
        const drawerHtml = `
            <div id="kanban-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.toggleKanbanFilterDrawer()"></div>
            <div id="kanban-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-sm text-slate-800">Filtros del Kanban</h3>
                    <button onclick="window.toggleKanbanFilterDrawer()" class="text-slate-400 hover:text-slate-700">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <div class="p-4 space-y-4 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Grupo</label>
                        <select id="kb-drawer-grupo" class="inp" onchange="window.applyKanbanFilter('filterGrupo', this.value)">
                            <option value="">Todos</option>
                            ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${kanbanState.filterGrupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Responsable</label>
                        <select id="kb-drawer-resp" class="inp" onchange="window.applyKanbanFilter('filterResp', this.value)">
                            <option value="">Todos</option>
                            ${respOpts.map(r => `<option value="${r.id}" ${kanbanState.filterResp === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Recursos</label>
                        <select id="kb-drawer-recursos" class="inp" onchange="window.applyKanbanFilter('filterRecursos', this.value)">
                            <option value="">Todos</option>
                            ${recursosOpts.map(p => `<option value="${p.id}" ${kanbanState.filterRecursos === p.id ? 'selected' : ''}>${escapeHtml(nombreFormateado(p))}</option>`).join('')}
                        </select>
                    </div>
                   <div>
    <label class="block font-semibold text-slate-600 mb-2">Ocultar estados</label>
    <div class="space-y-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
        ${['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'].map(e => `
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="rounded text-red-600" 
                       ${kanbanState.estadosOcultos.includes(e) ? 'checked' : ''}
                       onchange="window.toggleKanbanEstadoOculto('${e}', this.checked)">
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
                                <input type="date" id="kb-drawer-ini-desde" class="inp" value="${kanbanState.iniDesde || ''}" onchange="window.applyKanbanFilter('iniDesde', this.value)">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Hasta</label>
                                <input type="date" id="kb-drawer-ini-hasta" class="inp" value="${kanbanState.iniHasta || ''}" onchange="window.applyKanbanFilter('iniHasta', this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <h4 class="font-bold text-slate-700 mb-2">Fecha Fin Prog.</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Desde</label>
                                <input type="date" id="kb-drawer-fin-desde" class="inp" value="${kanbanState.finDesde || ''}" onchange="window.applyKanbanFilter('finDesde', this.value)">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Hasta</label>
                                <input type="date" id="kb-drawer-fin-hasta" class="inp" value="${kanbanState.finHasta || ''}" onchange="window.applyKanbanFilter('finHasta', this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4 space-y-2">
                        <h4 class="font-bold text-slate-700 mb-2">Semáforo</h4>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="kb-drawer-vencidas" class="rounded text-sky-600" ${kanbanState.soloVencidas ? 'checked' : ''} onchange="window.applyKanbanFilter('soloVencidas', this.checked)">
                            Solo vencidas
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="kb-drawer-porVencer" class="rounded text-sky-600" ${kanbanState.soloPorVencer ? 'checked' : ''} onchange="window.applyKanbanFilter('soloPorVencer', this.checked)">
                            Solo por vencer (≤ 7 días)
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="kb-drawer-sinFecha" class="rounded text-sky-600" ${kanbanState.soloSinFecha ? 'checked' : ''} onchange="window.applyKanbanFilter('soloSinFecha', this.checked)">
                            Solo sin fecha
                        </label>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <button onclick="window.clearKanbanFilters()" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                            <i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

            const kbSearch = document.getElementById('kb-search');
    if (kbSearch) {
        // Removemos el listener viejo para no duplicarlo
        const newKbSearch = kbSearch.cloneNode(true);
        kbSearch.parentNode.replaceChild(newKbSearch, kbSearch);
        
        newKbSearch.addEventListener('input', (e) => {
            kanbanState.search = e.target.value;
            
            clearTimeout(window.kbSearchTimeout);
            window.kbSearchTimeout = setTimeout(() => {
                window.renderView();
                const inputAfterRender = document.getElementById('kb-search');
                if (inputAfterRender) {
                    inputAfterRender.focus();
                    const val = inputAfterRender.value;
                    inputAfterRender.value = '';
                    inputAfterRender.value = val;
                }
            }, 400);
        });
    }
window.toggleKanbanFilterDrawer = function() {
    const drawer = document.getElementById('kanban-filter-drawer');
    const overlay = document.getElementById('kanban-filter-drawer-overlay');
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

window.applyKanbanFilter = function(key, value) {
    kanbanState[key] = value;
    window.renderView();
};
window.toggleKanbanSoloAsignadosAMi = function() {
    kanbanState.soloAsignadosAMi = !kanbanState.soloAsignadosAMi;
    window.renderView();
};
window.clearKanbanFilters = function() {
    kanbanState = { 
        search: '', filterGrupo: '', filterResp: '', filterRecursos: '',
        estadosOcultos: [],
        iniDesde: '', iniHasta: '', finDesde: '', finHasta: '',
        soloVencidas: false, soloPorVencer: false, soloSinFecha: false,
        soloAsignadosAMi: true
    };

    // ▼ Añadir esta línea ▼
    const drawer = document.getElementById('kanban-filter-drawer');
    if (drawer) drawer.remove();
    const overlay = document.getElementById('kanban-filter-drawer-overlay');
    if (overlay) overlay.remove();
    // ▲ Añadir esta línea ▲

    window.renderView();
};
export function onDragStart(e, id) {
    if (e.currentTarget.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
    state.dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('opacity-50');
}

export function onDragEnd(e) { e.currentTarget.classList.remove('opacity-50'); state.dragId = null; }
export function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('bg-sky-50', 'ring-2', 'ring-sky-300'); }
export function onDragLeave(e) { e.currentTarget.classList.remove('bg-sky-50', 'ring-2', 'ring-sky-300'); }

export async function onDrop(e, nuevoEstado) {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-sky-50', 'ring-2', 'ring-sky-300');
    const id = state.dragId;
    state.dragId = null;
    if (!id) return;
    
    const t = state.tasksCache.find(x => x.id === id);
    if (!t || t.estado === nuevoEstado) return;

    const soloModelador = state.isModelador && !state.isAdmin && !state.isCoordinador && !state.isSupervisor;
    if (soloModelador && nuevoEstado === 'Cerrado') {
        toast('Los modeladores no pueden cerrar actividades. Coordina con tu supervisor.');
        return;
    }

    // Regla: si se mueve a "Cerrado", debe tener fecha de cierre
    if (nuevoEstado === 'Cerrado' && !t.fecha_cierre) {
        toast('Para cerrar una tarea, asigna una fecha de cierre en el modal.');
        window.editTask(id);
        return;
    }
    
    const updateData = { estado: nuevoEstado };
    if (nuevoEstado !== 'Cerrado') updateData.fecha_cierre = null;

    const { error } = await supabaseClient.from('pendientes_bim').update(updateData).eq('id', id);
    if (error) { toast('Error al mover: ' + error.message); return; }
    
    toast(`Movido a ${nuevoEstado}`);
    await fetchAll(); window.renderView();
}
window.toggleKanbanEstadoOculto = function(estado, checked) {
    if (checked) {
        if (!kanbanState.estadosOcultos.includes(estado)) {
            kanbanState.estadosOcultos.push(estado);
        }
    } else {
        kanbanState.estadosOcultos = kanbanState.estadosOcultos.filter(e => e !== estado);
    }
    window.renderView();
};
