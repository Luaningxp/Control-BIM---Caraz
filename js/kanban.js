import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, cdeBadge, nombreResponsable, critColor, toast, getCriticidad, fmtDate, daysToDeadline, nombreFormateado, getIniciales, colorAvatar } from './utils.js';

let kanbanState = { search: '', filterGrupo: '', filterResp: '' };

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
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreResponsable({ responsable_id: p.id }, state.perfilesCache) }));

    const filteredTasks = state.tasksCache.filter(t => {
        const matchSearch = !kanbanState.search || 
            (t.actividad || '').toLowerCase().includes(kanbanState.search.toLowerCase()) ||
            (t.codigo_contenedor || '').toLowerCase().includes(kanbanState.search.toLowerCase());
        const matchGrupo = !kanbanState.filterGrupo || t.grupo === kanbanState.filterGrupo;
        const matchResp = !kanbanState.filterResp || t.responsable_id === kanbanState.filterResp;
        return matchSearch && matchGrupo && matchResp;
    });

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="kb-search" placeholder="Buscar actividad..." value="${kanbanState.search}" class="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-sky-600">
                </div>
                <select id="kb-fil-grupo" class="inp max-w-[150px] text-xs py-1.5">
                    <option value="">Todos los grupos</option>
                    ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${kanbanState.filterGrupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                </select>
                <select id="kb-fil-resp" class="inp max-w-[150px] text-xs py-1.5">
                    <option value="">Todos los responsables</option>
                    ${respOpts.map(r => `<option value="${r.id}" ${kanbanState.filterResp === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                </select>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium px-2"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
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
                                
                                const isOwner = t.user_id === state.currentUser.id;
                                const canDragThis = state.isAdmin || state.isCoordinador || state.isSupervisor || (state.isModelador && isOwner);

                                return `
                                <div class="kb-card bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${canDragThis ? '' : 'opacity-70 cursor-not-allowed'}" 
                                     draggable="${canDragThis}" 
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

                                    <!-- EQUIPO (RECURSOS) -->
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

    document.getElementById('kb-search').addEventListener('input', (e) => { kanbanState.search = e.target.value; window.renderView(); });
    document.getElementById('kb-fil-grupo').addEventListener('change', (e) => { kanbanState.filterGrupo = e.target.value; window.renderView(); });
    document.getElementById('kb-fil-resp').addEventListener('change', (e) => { kanbanState.filterResp = e.target.value; window.renderView(); });
}

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
