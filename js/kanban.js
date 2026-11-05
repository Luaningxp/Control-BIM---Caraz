import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, cdeBadge, nombreResponsable, critColor, toast, getCriticidad, fmtDate, daysToDeadline } from './utils.js';

export function renderKanban(container) {
    // Definimos las columnas del Kanban operativo
    const ESTADOS = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];
    
    const META = {
        'No iniciado': { t: 'No iniciado', sub: 'Pendiente de inicio', color: 'slate', icon: 'fa-circle' },
        'En proceso': { t: 'En proceso', sub: 'Trabajando en ello', color: 'sky', icon: 'fa-spinner' },
        'En espera': { t: 'En espera', sub: 'Bloqueado / Pausado', color: 'amber', icon: 'fa-pause' },
        'Reprogramado': { t: 'Reprogramado', sub: 'Nueva fecha', color: 'purple', icon: 'fa-calendar-plus' },
        'Cerrado': { t: 'Cerrado', sub: 'Completado', color: 'teal', icon: 'fa-check-circle' }
    };

    // Los operadores no pueden cerrar tareas directamente desde el Kanban (requiere fecha de cierre)
    // ni mover tareas que no sean suyas.
    const canMove = () => state.isAdmin || state.isCoordinador || state.isSupervisor || state.isModelador;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-3">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Tablero Kanban Operativo</h3>
                <p class="text-[11px] text-slate-500">Arrastra las tarjetas para cambiar el estado de la tarea.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-2">
            ${ESTADOS.map(estado => {
                const items = state.tasksCache.filter(t => t.estado === estado);
                return `
                    <div class="kb-col bg-slate-100 rounded-lg p-2 min-w-[250px]" data-estado="${estado}"
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
                                
                                // Lógica de permisos: Solo el responsable o admin/coordinador pueden mover
                                const isOwner = t.user_id === state.currentUser.id;
                                const canDragThis = canMove() && (state.isAdmin || state.isCoordinador || state.isSupervisor || isOwner);

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

                                    <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <div class="text-[10px] ${d !== null && d < 0 ? 'text-red-600 font-bold' : d !== null && d <= 7 ? 'text-amber-600 font-semibold' : 'text-slate-400'}">
                                            <i class="fa-regular fa-calendar mr-1"></i>${t.fecha_fin ? fmtDate(t.fecha_fin) : 'Sin fecha'}
                                        </div>
                                        <div class="flex gap-1">
                                            ${canEditTask(t) ? `<button onclick="event.stopPropagation(); window.editTask(${t.id})" class="text-slate-400 hover:text-sky-600" title="Editar"><i class="fa-solid fa-pen text-[10px]"></i></button>` : ''}
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
}

function canEditTask(t) {
    if (state.isAdmin || state.isCoordinador || state.isSupervisor) return true;
    if (state.isModelador && t.estado_cde === 'WIP' && t.user_id === state.currentUser?.id) return true;
    return false;
}

export function onDragStart(e, id) {
    if (e.currentTarget.getAttribute('draggable') !== 'true') {
        e.preventDefault();
        return;
    }
    state.dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('opacity-50');
}

export function onDragEnd(e) { 
    e.currentTarget.classList.remove('opacity-50'); 
    state.dragId = null; 
}

export function onDragOver(e) { 
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move'; 
    e.currentTarget.classList.add('bg-sky-50', 'ring-2', 'ring-sky-300'); 
}

export function onDragLeave(e) { 
    e.currentTarget.classList.remove('bg-sky-50', 'ring-2', 'ring-sky-300'); 
}

export async function onDrop(e, nuevoEstado) {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-sky-50', 'ring-2', 'ring-sky-300');
    const id = state.dragId;
    state.dragId = null;
    if (!id) return;
    
    const t = state.tasksCache.find(x => x.id === id);
    if (!t || t.estado === nuevoEstado) return;

    // REGLA DE NEGOCIO: Si se mueve a "Cerrado", debe tener fecha de cierre
    if (nuevoEstado === 'Cerrado' && !t.fecha_cierre) {
        // Abrimos el modal para que coloque la fecha
        toast('Para cerrar una tarea, asigna una fecha de cierre en el modal.');
        window.editTask(id);
        return;
    }
    
    // Si se saca de "Cerrado", borramos la fecha de cierre
    const updateData = { estado: nuevoEstado };
    if (nuevoEstado !== 'Cerrado') {
        updateData.fecha_cierre = null;
    }

    // Actualizamos directamente en Supabase (sin RPC de CDE)
    const { error } = await supabaseClient.from('pendientes_bim').update(updateData).eq('id', id);
    
    if (error) { 
        toast('Error al mover: ' + error.message); 
        return; 
    }
    
    toast(`Movido a ${nuevoEstado}`);
    await fetchAll(); 
    window.renderView();
}
