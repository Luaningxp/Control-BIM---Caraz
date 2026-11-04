import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, cdeBadge, nombreResponsable, toast, getCriticidad, critColor } from './utils.js';

let tableState = {
    sortBy: 'id', sortDir: 'desc', showColMenu: false,
    visibleCols: { codigo: true, actividad: true, grupo: true, responsable: true, criticidad: true, estado: true, cde: true },
    visibleProps: {}, filters: { search: '', grupo: '', responsable: '' }
};

// REGLAS DE PERMISOS
export function canEdit(t) { 
    if (state.isAdmin || state.isCoordinador || state.isSupervisor) return true;
    if (state.isModelador && t.estado_cde === 'WIP' && t.user_id === state.currentUser?.id) return true;
    return false;
}
export function canDelete() { return state.isAdmin; }
export function canTransition() { return state.isAdmin || state.isCoordinador || state.isSupervisor; }

function getProcessedTasks() {
    let result = [...state.tasksCache];
    if (tableState.filters.search) {
        const q = tableState.filters.search.toLowerCase();
        result = result.filter(t => (t.actividad || '').toLowerCase().includes(q) || (t.codigo_contenedor || '').toLowerCase().includes(q));
    }
    if (tableState.filters.grupo) result = result.filter(t => t.grupo === tableState.filters.grupo);
    if (tableState.filters.responsable) result = result.filter(t => t.responsable_id === tableState.filters.responsable);

    result.sort((a, b) => {
        let valA = a[tableState.sortBy] || '';
        let valB = b[tableState.sortBy] || '';
        if (tableState.sortBy === 'criticidad') {
            const weights = { 'Muy alto': 4, 'Alto': 3, 'Medio': 2, 'Bajo': 1 };
            valA = weights[getCriticidad(a)] || 0;
            valB = weights[getCriticidad(b)] || 0;
        } else if (tableState.sortBy.startsWith('prop_')) {
            const pid = parseInt(tableState.sortBy.split('_')[1]);
            const pvA = state.propValsCache.find(v => v.pendiente_id === a.id && v.propiedad_id === pid);
            const pvB = state.propValsCache.find(v => v.pendiente_id === b.id && v.propiedad_id === pid);
            valA = pvA ? (pvA.valor_texto || pvA.valor_numero || pvA.valor_fecha || '') : '';
            valB = pvB ? (pvB.valor_texto || pvB.valor_numero || pvB.valor_fecha || '') : '';
        }
        if (valA < valB) return tableState.sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return tableState.sortDir === 'asc' ? 1 : -1;
        return 0;
    });
    return result;
}

function toggleSort(col) { if (tableState.sortBy === col) tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc'; else { tableState.sortBy = col; tableState.sortDir = 'asc'; } window.renderView(); }
function toggleCol(col) { tableState.visibleCols[col] = !tableState.visibleCols[col]; window.renderView(); }
function toggleProp(pid) { tableState.visibleProps[pid] = tableState.visibleProps[pid] === false ? true : false; window.renderView(); }
function toggleColMenu() { tableState.showColMenu = !tableState.showColMenu; window.renderView(); }
function getSortIcon(col) { if (tableState.sortBy !== col) return '<i class="fa-solid fa-sort text-slate-300 ml-1 text-[10px]"></i>'; return tableState.sortDir === 'asc' ? '<i class="fa-solid fa-sort-up text-sky-600 ml-1 text-[10px]"></i>' : '<i class="fa-solid fa-sort-down text-sky-600 ml-1 text-[10px]"></i>'; }

export function renderTabla(container) {
    const tasks = getProcessedTasks();
    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: p.email.split('@')[0] }));
    const visiblePropDefs = state.propDefsCache.filter(pd => tableState.visibleProps[pd.id] !== false);

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="tbl-search" placeholder="Buscar actividad o código..." value="${tableState.filters.search}" class="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-sky-600">
                </div>
                <select id="tbl-fil-grupo" class="inp max-w-[150px] text-xs py-1.5"><option value="">Todos los grupos</option>${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${tableState.filters.grupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>
                <select id="tbl-fil-resp" class="inp max-w-[150px] text-xs py-1.5"><option value="">Todos los responsables</option>${respOpts.map(r => `<option value="${r.id}" ${tableState.filters.responsable === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select>
            </div>
            
            <div class="flex items-center gap-2">
                <div class="relative">
                    <button onclick="window.toggleColMenu()" class="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><i class="fa-solid fa-table-columns"></i> Columnas <i class="fa-solid fa-chevron-down text-[10px]"></i></button>
                    <div class="${tableState.showColMenu ? 'block' : 'hidden'} absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('codigo')" ${tableState.visibleCols.codigo ? 'checked' : ''} class="rounded text-sky-600"> Código</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('grupo')" ${tableState.visibleCols.grupo ? 'checked' : ''} class="rounded text-sky-600"> Grupo</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('responsable')" ${tableState.visibleCols.responsable ? 'checked' : ''} class="rounded text-sky-600"> Responsable</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('criticidad')" ${tableState.visibleCols.criticidad ? 'checked' : ''} class="rounded text-sky-600"> Criticidad</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('estado')" ${tableState.visibleCols.estado ? 'checked' : ''} class="rounded text-sky-600"> Estado Op.</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('cde')" ${tableState.visibleCols.cde ? 'checked' : ''} class="rounded text-sky-600"> CDE ISO</label>
                        ${state.propDefsCache.length > 0 ? `<div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase border-t border-slate-100 mt-1">Personalizadas</div>${state.propDefsCache.map(pd => `<label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleProp(${pd.id})" ${tableState.visibleProps[pd.id] !== false ? 'checked' : ''} class="rounded text-sky-600"> ${escapeHtml(pd.nombre)}</label>`).join('')}` : ''}
                    </div>
                </div>
                <button onclick="window.fetchAll().then(window.renderView)" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition"><i class="fa-solid fa-rotate-right mr-1"></i> Refrescar</button>
            </div>
        </div>

        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold select-none">
                    <tr>
                        ${tableState.visibleCols.codigo ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('codigo_contenedor')">Código ${getSortIcon('codigo_contenedor')}</th>` : ''}
                        ${tableState.visibleCols.actividad ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('actividad')">Actividad ${getSortIcon('actividad')}</th>` : ''}
                        ${tableState.visibleCols.grupo ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('grupo')">Grupo ${getSortIcon('grupo')}</th>` : ''}
                        ${tableState.visibleCols.responsable ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('responsable_id')">Responsable ${getSortIcon('responsable_id')}</th>` : ''}
                        ${tableState.visibleCols.criticidad ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('criticidad')">Criticidad ${getSortIcon('criticidad')}</th>` : ''}
                        ${tableState.visibleCols.estado ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('estado')">Estado ${getSortIcon('estado')}</th>` : ''}
                        ${tableState.visibleCols.cde ? `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('estado_cde')">CDE ISO ${getSortIcon('estado_cde')}</th>` : ''}
                        ${visiblePropDefs.map(pd => `<th class="p-3 cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('prop_${pd.id}')">${escapeHtml(pd.nombre)} ${getSortIcon(`prop_${pd.id}`)}</th>`).join('')}
                        <th class="p-3 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody id="task-list" class="divide-y divide-slate-100">
                    ${tasks.length === 0 ? '<tr><td colspan="15" class="text-center text-slate-400 py-8">No hay resultados con los filtros actuales</td></tr>' : ''}
                    ${tasks.map(t => {
                        const crit = getCriticidad(t); 
                        return `
                        <tr class="hover:bg-slate-50 transition">
                            ${tableState.visibleCols.codigo ? `<td class="p-3 font-mono text-[11px] text-slate-500">${t.codigo_contenedor || '–'}</td>` : ''}
                            ${tableState.visibleCols.actividad ? `<td class="p-3 font-medium text-slate-900 max-w-[250px] truncate" title="${escapeHtml(t.actividad)}">${escapeHtml(t.actividad)}</td>` : ''}
                            ${tableState.visibleCols.grupo ? `<td class="p-3 text-slate-500 text-[11px]">${escapeHtml(t.grupo || '-')}</td>` : ''}
                            ${tableState.visibleCols.responsable ? `<td class="p-3 text-slate-600 text-[11px]">${escapeHtml(nombreResponsable(t, state.perfilesCache))}</td>` : ''}
                            ${tableState.visibleCols.criticidad ? `<td class="p-3 font-semibold ${critColor(crit)}">${crit}</td>` : ''}
                            ${tableState.visibleCols.estado ? `<td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">${escapeHtml(t.estado)}</span></td>` : ''}
                            ${tableState.visibleCols.cde ? `<td class="p-3">${cdeBadge(t.estado_cde, t.codigo_aptitud)}</td>` : ''}
                            ${visiblePropDefs.map(pd => {
                                const pv = state.propValsCache.find(v => v.pendiente_id === t.id && v.propiedad_id === pd.id);
                                let displayVal = '-';
                                if (pv) {
                                    if (pd.tipo === 'numero') displayVal = pv.valor_numero ?? '-';
                                    else if (pd.tipo === 'fecha') displayVal = pv.valor_fecha ? fmtDate(pv.valor_fecha) : '-';
                                    else if (pd.tipo === 'booleano') displayVal = pv.valor_booleano ? '<i class="fa-solid fa-check text-teal-600"></i>' : '<i class="fa-solid fa-xmark text-slate-300"></i>';
                                    else displayVal = pv.valor_texto || '-';
                                }
                                return `<td class="p-3 text-slate-600 text-[11px]">${displayVal}</td>`;
                            }).join('')}
                            <td class="p-3 text-center whitespace-nowrap">
                                ${canEdit(t) ? `<button onclick="window.editTask(${t.id})" class="text-sky-600 hover:text-sky-800 mr-2" title="Editar"><i class="fa-solid fa-pen"></i></button>` : ''}
                                ${canTransition() ? `<button onclick="window.openModalCDE(${t.id})" class="text-teal-600 hover:text-teal-800 mr-2" title="Transición CDE"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>` : ''}
                                ${canDelete() ? `<button onclick="window.deleteTask(${t.id})" class="text-red-500 hover:text-red-700" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('tbl-search').addEventListener('input', (e) => { tableState.filters.search = e.target.value; setTimeout(() => window.renderView(), 300); });
    document.getElementById('tbl-fil-grupo').addEventListener('change', (e) => { tableState.filters.grupo = e.target.value; window.renderView(); });
    document.getElementById('tbl-fil-resp').addEventListener('change', (e) => { tableState.filters.responsable = e.target.value; window.renderView(); });
}

window.toggleSort = toggleSort; window.toggleCol = toggleCol; window.toggleProp = toggleProp; window.toggleColMenu = toggleColMenu;

export function openModal() {
    if (!state.isAdmin && !state.isCoordinador) return;
    document.getElementById('modal-title').innerText = "Nuevo Contenedor";
    
    ['task-id','task-actividad','task-fecha-fin','task-fecha-cierre','task-nota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    document.getElementById('task-importancia').value = 'Medio';
    document.getElementById('task-estado').value = 'No iniciado';
    
    const grSel = document.getElementById('task-grupo'); 
    grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join('');
    
    const rsSel = document.getElementById('task-responsable'); 
    rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + state.perfilesCache.map(p => `<option value="${p.id}">${escapeHtml(p.email.split('@')[0])}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</option>`).join('');
    
    renderCustomProps(null);
    document.getElementById('modal-task').classList.remove('hidden'); document.getElementById('modal-task').classList.add('flex');
}

export function editTask(id) {
    const t = state.tasksCache.find(x => x.id === id);
    if (!t || !canEdit(t)) return;
    document.getElementById('modal-title').innerText = "Editar Contenedor";
    document.getElementById('task-id').value = t.id;
    document.getElementById('task-actividad').value = t.actividad || '';
    document.getElementById('task-importancia').value = t.importancia || 'Medio';
    document.getElementById('task-estado').value = t.estado || 'No iniciado';
    document.getElementById('task-fecha-fin').value = t.fecha_fin || '';
    document.getElementById('task-fecha-cierre').value = t.fecha_cierre || '';
    document.getElementById('task-nota').value = t.nota || '';
    
    const grSel = document.getElementById('task-grupo'); 
    grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join(''); 
    grSel.value = t.grupo || '';
    
    const rsSel = document.getElementById('task-responsable'); 
    rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + state.perfilesCache.map(p => `<option value="${p.id}">${escapeHtml(p.email.split('@')[0])}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</option>`).join(''); 
    rsSel.value = t.responsable_id || '';
    
    renderCustomProps(t.id);
    document.getElementById('modal-task').classList.remove('hidden'); document.getElementById('modal-task').classList.add('flex');
}

function renderCustomProps(pendienteId) {
    const container = document.getElementById('custom-props-container');
    const inputs = document.getElementById('custom-props-inputs');
    if (state.propDefsCache.length === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    inputs.innerHTML = state.propDefsCache.map(pd => {
        let valor = '';
        if (pendienteId) {
            const pv = state.propValsCache.find(v => v.pendiente_id === pendienteId && v.propiedad_id === pd.id);
            if (pv) valor = pd.tipo === 'numero' ? (pv.valor_numero !== null ? pv.valor_numero : '') : pd.tipo === 'fecha' ? (pv.valor_fecha || '') : pd.tipo === 'booleano' ? pv.valor_booleano : (pv.valor_texto || '');
        }
        let inputHtml = '';
        if (pd.tipo === 'texto') inputHtml = `<input type="text" class="inp custom-prop-input" data-pid="${pd.id}" data-type="texto" value="${escapeHtml(valor)}">`;
        else if (pd.tipo === 'numero') inputHtml = `<input type="number" step="any" class="inp custom-prop-input" data-pid="${pd.id}" data-type="numero" value="${valor}">`;
        else if (pd.tipo === 'fecha') inputHtml = `<input type="date" class="inp custom-prop-input" data-pid="${pd.id}" data-type="fecha" value="${valor}">`;
        else if (pd.tipo === 'booleano') inputHtml = `<input type="checkbox" class="custom-prop-input w-4 h-4 mt-1" data-pid="${pd.id}" data-type="booleano" ${valor ? 'checked' : ''}>`;
        else if (pd.tipo === 'seleccion') {
            const opts = (pd.opciones || []).map(o => `<option value="${escapeHtml(o)}" ${valor === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
            inputHtml = `<select class="inp custom-prop-input" data-pid="${pd.id}" data-type="seleccion"><option value="">— Seleccionar —</option>${opts}</select>`;
        }
        return `<div><label class="block font-semibold text-slate-600 mb-1">${escapeHtml(pd.nombre)} ${pd.requerido ? '<span class="text-red-500">*</span>' : ''}</label>${inputHtml}</div>`;
    }).join('');
}

export function closeModal() { document.getElementById('modal-task').classList.add('hidden'); document.getElementById('modal-task').classList.remove('flex'); }

export async function saveTask(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const respId = document.getElementById('task-responsable').value || null;
    const respPerfil = respId ? state.perfilesCache.find(p => p.id === respId) : null;
    const payload = {
        actividad: document.getElementById('task-actividad').value,
        grupo: document.getElementById('task-grupo').value || null,
        responsable: respPerfil ? (respPerfil.cargo || respPerfil.email) : null,
        responsable_id: respId,
        importancia: document.getElementById('task-importancia').value,
        estado: document.getElementById('task-estado').value,
        fecha_fin: document.getElementById('task-fecha-fin').value || null,
        fecha_cierre: document.getElementById('task-fecha-cierre').value || null,
        nota: document.getElementById('task-nota').value
    };
    let taskId = id;
    if (id) {
        const { error } = await supabaseClient.from('pendientes_bim').update(payload).eq('id', id);
        if (error) { toast('Error: ' + error.message); return; }
    } else {
        payload.estado_cde = 'WIP'; payload.codigo_aptitud = 'S0'; payload.user_id = state.currentUser.id;
        const { data, error } = await supabaseClient.from('pendientes_bim').insert([payload]).select();
        if (error) { toast('Error: ' + error.message); return; }
        taskId = data[0].id;
    }
    const propInputs = document.querySelectorAll('.custom-prop-input');
    for (const input of propInputs) {
        const pid = parseInt(input.dataset.pid); const type = input.dataset.type;
        let val = input.type === 'checkbox' ? input.checked : input.value;
        if (val === '' || val === false) val = null;
        const existente = state.propValsCache.find(v => v.pendiente_id === parseInt(taskId) && v.propiedad_id === pid);
        const propPayload = { pendiente_id: parseInt(taskId), propiedad_id: pid, valor_texto: null, valor_numero: null, valor_fecha: null, valor_booleano: null };
        if (val !== null) {
            if (type === 'texto' || type === 'seleccion') propPayload.valor_texto = val;
            else if (type === 'numero') propPayload.valor_numero = parseFloat(val);
            else if (type === 'fecha') propPayload.valor_fecha = val;
            else if (type === 'booleano') propPayload.valor_booleano = val;
        }
        if (existente) await supabaseClient.from('propiedades_valores').update(propPayload).eq('id', existente.id);
        else if (val !== null) await supabaseClient.from('propiedades_valores').insert([propPayload]);
    }
    closeModal(); await fetchAll(); window.renderView(); toast('Guardado');
}

export async function deleteTask(id) {
    if (!canDelete()) return; if (!confirm("¿Eliminar este contenedor?")) return;
    const { error } = await supabaseClient.from('pendientes_bim').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); window.renderView();
}

export function openModalCDE(id) {
    if (!canTransition()) return;
    state.cdeTargetId = id; document.getElementById('cde-current').innerText = `Contenedor #${id}`; document.getElementById('cde-estado').value = 'Shared'; document.getElementById('cde-aptitud').value = 'S1'; document.getElementById('cde-comentario').value = '';
    document.getElementById('modal-cde').classList.remove('hidden'); document.getElementById('modal-cde').classList.add('flex');
}
export function closeModalCDE() { document.getElementById('modal-cde').classList.add('hidden'); document.getElementById('modal-cde').classList.remove('flex'); state.cdeTargetId = null; }
export async function confirmarTransicion() {
    if (!state.cdeTargetId) return;
    const estado = document.getElementById('cde-estado').value; const aptitud = document.getElementById('cde-aptitud').value || null; const comentario = document.getElementById('cde-comentario').value || null;
    const { data, error } = await supabaseClient.rpc('transicionar_cde', { p_pendiente_id: state.cdeTargetId, p_estado_nuevo: estado, p_aptitud_nueva: aptitud, p_comentario: comentario });
    if (error) { toast('Error RPC: ' + error.message); return; }
    if (!data?.ok) { toast('Rechazado: ' + (data?.error || 'desconocida')); return; }
    closeModalCDE(); await fetchAll(); window.renderView(); toast('Transición aplicada');
}
