import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, cdeBadge, nombreResponsable, critColor, toast, APTITUD_DEFAULT, getCriticidad } from './utils.js';

export function renderKanban(container) {
    const ESTADOS = ['WIP', 'Shared', 'Published', 'Archived'];
    const META = {
        WIP: { t: 'WIP', s: 'En trabajo', c: 'slate' },
        Shared: { t: 'Shared', s: 'En coordinación', c: 'amber' },
        Published: { t: 'Published', s: 'Publicado', c: 'teal' },
        Archived: { t: 'Archived', s: 'Archivado', c: 'slate' }
    };

    container.innerHTML = `
        <div class="flex justify-between items-center mb-3">
            <div><h3 class="font-bold text-sm text-slate-800">Tablero Kanban</h3><p class="text-[11px] text-slate-500">Arrastra un contenedor entre columnas.</p></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            ${ESTADOS.map(estado => {
                const items = state.tasksCache.filter(t => (t.estado_cde || 'WIP') === estado);
                return `
                    <div class="kb-col p-2" data-estado="${estado}" ondragover="window.onDragOver(event)" ondragleave="window.onDragLeave(event)" ondrop="window.onDrop(event, '${estado}')">
                        <div class="flex items-center justify-between px-2 py-2 mb-1">
                            <div><p class="text-[12px] font-bold text-slate-800 leading-tight">${META[estado].t}</p><p class="text-[10px] text-slate-500">${META[estado].s}</p></div>
                            <span class="text-[11px] font-bold bg-white text-slate-600 rounded-full px-2 py-0.5 border border-slate-200">${items.length}</span>
                        </div>
                        <div class="kb-body">
                            ${items.map(t => {
                                const crit = getCriticidad(t);
                                
                                // PERMISOS PARA ARRASTRAR
                                let canDrag = false;
                                if (state.isAdmin || state.isCoordinador || state.isSupervisor) {
                                    canDrag = true;
                                } else if (state.isModelador && t.user_id === state.currentUser.id) {
                                    canDrag = true;
                                }
                                
                                // NADIE excepto admin/coordinador puede mover una tarjeta que YA ESTÁ ARCHIVADA
                                if (t.estado_cde === 'Archived' && !state.isAdmin && !state.isCoordinador) {
                                    canDrag = false;
                                }

                                return `
                                <div class="kb-card bg-white rounded-lg border border-slate-200 p-2.5 mb-2 shadow-sm ${canDrag ? '' : 'opacity-70 cursor-not-allowed'}" 
                                     draggable="${canDrag}" 
                                     ondragstart="window.onDragStart(event, ${t.id})" 
                                     ondragend="window.onDragEnd(event)">
                                    <div class="flex justify-between gap-2 mb-1">
                                        <span class="font-mono text-[10px] text-slate-400">${t.codigo_contenedor || '–'}</span>
                                        ${cdeBadge(t.estado_cde, t.codigo_aptitud)}
                                    </div>
                                    <p class="text-[12px] font-medium text-slate-800 leading-snug line-clamp-3">${escapeHtml(t.actividad)}</p>
                                    <div class="flex justify-between items-center mt-2 text-[10px] text-slate-500">
                                        <span>${escapeHtml(nombreResponsable(t, state.perfilesCache))}</span>
                                        <span class="${critColor(crit)}">${crit}</span>
                                    </div>
                                </div>
                            `}).join('') || '<p class="text-[11px] text-slate-400 text-center py-4">Vacío</p>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

export function onDragStart(e, id) {
    if (e.currentTarget.getAttribute('draggable') !== 'true') {
        e.preventDefault();
        return;
    }
    state.dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
}

export function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); state.dragId = null; }
export function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
export function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

export async function onDrop(e, nuevoEstado) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const id = state.dragId;
    state.dragId = null;
    if (!id) return;
    
    const t = state.tasksCache.find(x => x.id === id);
    if (!t || (t.estado_cde || 'WIP') === nuevoEstado) return;
    
    const aptitud = APTITUD_DEFAULT[nuevoEstado] || null;
    const { data, error } = await supabaseClient.rpc('transicionar_cde', {
        p_pendiente_id: id, p_estado_nuevo: nuevoEstado, p_aptitud_nueva: aptitud, p_comentario: 'Movido vía Kanban'
    });
    
    if (error) { toast('Error: ' + error.message); return; }
    if (!data?.ok) { toast('Rechazado: ' + (data?.error || 'Inválido')); return; }
    
    toast('Movido a ' + nuevoEstado);
    await fetchAll(); window.renderView();
}
