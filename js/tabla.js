import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, cdeBadge, nombreResponsable, toast, getCriticidad, critColor } from './utils.js';

const nombreFormateado = (p) => {
    const base = p.email.split('@')[0];
    return base.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim()
        .split(' ').filter(x => x).map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
};

let tableState = {
    sortBy: 'id', sortDir: 'desc', showColMenu: false,
    visibleCols: { 
        codigo: true, actividad: true, grupo: true, responsable: true, 
        importancia: true, urgencia: true, criticidad: true, 
        estado: true, inicio: true, fin: true, cierre: true, nota: true, cde: true 
    },
    visibleProps: {}, filters: { search: '', grupo: '', responsable: '' },
    colWidths: {
        codigo: 100, actividad: 300, grupo: 120, responsable: 140, 
        importancia: 90, urgencia: 90, criticidad: 90, estado: 100, 
        inicio: 90, fin: 90, cierre: 90, nota: 200, cde: 100
    }
};

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
        } else if (tableState.sortBy === 'importancia' || tableState.sortBy === 'urgencia') {
            const weights = { 'Muy alto': 4, 'Alto': 3, 'Medio': 2, 'Bajo': 1 };
            valA = weights[a[tableState.sortBy]] || 0;
            valB = weights[b[tableState.sortBy]] || 0;
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

// --- SISTEMA DE REDIMENSIONADO ---
let isResizing = false, currentCol = null, startX = 0, startWidth = 0;

function initResize(e, colKey) {
    isResizing = true;
    currentCol = colKey;
    startX = e.pageX;
    startWidth = tableState.colWidths[colKey] || 100;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
    e.stopPropagation(); // <-- IMPORTANTE: Evita que el clic se propague al th y dispare el sort
}

function doResize(e) {
    if (!isResizing) return;
    const diff = e.pageX - startX;
    const newWidth = Math.max(50, startWidth + diff);
    tableState.colWidths[currentCol] = newWidth;
    
    const th = document.querySelector(`th[data-col="${currentCol}"]`);
    if (th) {
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
        th.style.maxWidth = `${newWidth}px`;
    }
    document.querySelectorAll(`td[data-col="${currentCol}"]`).forEach(td => {
        td.style.width = `${newWidth}px`;
        td.style.minWidth = `${newWidth}px`;
        td.style.maxWidth = `${newWidth}px`;
    });
    e.stopPropagation(); // <-- Evitar que el movimiento del mouse se propague
}

function stopResize(e) {
    // Solo detener la propagación si efectivamente se estaba redimensionando
    if (isResizing) {
        e.stopPropagation();
        e.preventDefault();
    }
    isResizing = false;
    currentCol = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
}

export function renderTabla(container) {
    const tasks = getProcessedTasks();
    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreResponsable({ responsable_id: p.id }, state.perfilesCache) }));
    const visiblePropDefs = state.propDefsCache.filter(pd => tableState.visibleProps[pd.id] !== false);

    const estadoColors = {
        'No iniciado': 'bg-slate-400', 'En proceso': 'bg-sky-500', 'En espera': 'bg-amber-500',
        'Reprogramado': 'bg-purple-500', 'Cerrado': 'bg-teal-500', 'Terminado': 'bg-emerald-500'
    };

    const colStyle = (key) => `width: ${tableState.colWidths[key] || 100}px; min-width: ${tableState.colWidths[key] || 100}px; max-width: ${tableState.colWidths[key] || 100}px;`;
    const resizer = (key) => `<div class="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-slate-300 opacity-0 hover:opacity-100 transition-opacity z-30" onmousedown="window.initResize(event, '${key}')"></div>`;
    const thClass = "p-3 relative group border-r border-slate-200 last:border-r-0 text-[10px] font-bold tracking-wider text-slate-500 bg-slate-50";
    
    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="tbl-search" placeholder="Buscar actividad..." value="${tableState.filters.search}" class="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-sky-600">
                </div>
                <select id="tbl-fil-grupo" class="inp max-w-[150px] text-xs py-1.5"><option value="">Todos los grupos</option>${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${tableState.filters.grupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>
                <select id="tbl-fil-resp" class="inp max-w-[150px] text-xs py-1.5"><option value="">Todos los responsables</option>${respOpts.map(r => `<option value="${r.id}" ${tableState.filters.responsable === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select>
            </div>
            
            <div class="flex items-center gap-2">
                <div class="relative">
                    <button onclick="window.toggleColMenu()" class="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><i class="fa-solid fa-table-columns"></i> Columnas <i class="fa-solid fa-chevron-down text-[10px]"></i></button>
                    <div class="${tableState.showColMenu ? 'block' : 'hidden'} absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1 max-h-64 overflow-y-auto">
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('codigo')" ${tableState.visibleCols.codigo ? 'checked' : ''} class="rounded text-sky-600"> Código</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('actividad')" ${tableState.visibleCols.actividad ? 'checked' : ''} class="rounded text-sky-600"> Actividad</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('grupo')" ${tableState.visibleCols.grupo ? 'checked' : ''} class="rounded text-sky-600"> Grupo</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('responsable')" ${tableState.visibleCols.responsable ? 'checked' : ''} class="rounded text-sky-600"> Responsable</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('importancia')" ${tableState.visibleCols.importancia ? 'checked' : ''} class="rounded text-sky-600"> Importancia</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('urgencia')" ${tableState.visibleCols.urgencia ? 'checked' : ''} class="rounded text-sky-600"> Urgencia</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('estado')" ${tableState.visibleCols.estado ? 'checked' : ''} class="rounded text-sky-600"> Estado</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('inicio')" ${tableState.visibleCols.inicio ? 'checked' : ''} class="rounded text-sky-600"> Inicio Prog.</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('fin')" ${tableState.visibleCols.fin ? 'checked' : ''} class="rounded text-sky-600"> Fin Prog.</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('cierre')" ${tableState.visibleCols.cierre ? 'checked' : ''} class="rounded text-sky-600"> Cierre Real</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('criticidad')" ${tableState.visibleCols.criticidad ? 'checked' : ''} class="rounded text-sky-600"> Criticidad (Auto)</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleCol('cde')" ${tableState.visibleCols.cde ? 'checked' : ''} class="rounded text-sky-600"> CDE ISO</label>
                        ${state.propDefsCache.length > 0 ? `<div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase border-t border-slate-100 mt-1">Personalizadas</div>${state.propDefsCache.map(pd => `<label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleProp(${pd.id})" ${tableState.visibleProps[pd.id] !== false ? 'checked' : ''} class="rounded text-sky-600"> ${escapeHtml(pd.nombre)}</label>`).join('')}` : ''}
                    </div>
                </div>
                <button onclick="window.fetchAll().then(window.renderView)" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition"><i class="fa-solid fa-rotate-right mr-1"></i> Refrescar</button>
            </div>
        </div>

        <div class="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div class="overflow-x-auto overflow-y-auto max-h-[70vh] custom-scrollbar relative">
                <table class="w-full text-left text-xs" style="table-layout: fixed; min-width: 1200px;">
                    <thead class="sticky top-0 z-10 shadow-sm">
                        <tr class="bg-slate-50">
                            ${tableState.visibleCols.codigo ? `<th data-col="codigo" style="${colStyle('codigo')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('codigo_contenedor')"><div class="pr-2">Código ${getSortIcon('codigo_contenedor')}</div>${resizer('codigo')}</th>` : ''}
                            ${tableState.visibleCols.actividad ? `<th data-col="actividad" style="${colStyle('actividad')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('actividad')"><div class="pr-2">Actividad ${getSortIcon('actividad')}</div>${resizer('actividad')}</th>` : ''}
                            ${tableState.visibleCols.grupo ? `<th data-col="grupo" style="${colStyle('grupo')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('grupo')"><div class="pr-2">Grupo ${getSortIcon('grupo')}</div>${resizer('grupo')}</th>` : ''}
                            ${tableState.visibleCols.responsable ? `<th data-col="responsable" style="${colStyle('responsable')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('responsable_id')"><div class="pr-2">Responsable ${getSortIcon('responsable_id')}</div>${resizer('responsable')}</th>` : ''}
                            
                            ${tableState.visibleCols.importancia ? `<th data-col="importancia" style="${colStyle('importancia')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('importancia')"><div class="pr-2">Importancia ${getSortIcon('importancia')}</div>${resizer('importancia')}</th>` : ''}
                            ${tableState.visibleCols.urgencia ? `<th data-col="urgencia" style="${colStyle('urgencia')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('urgencia')"><div class="pr-2">Urgencia ${getSortIcon('urgencia')}</div>${resizer('urgencia')}</th>` : ''}
                            ${tableState.visibleCols.criticidad ? `<th data-col="criticidad" style="${colStyle('criticidad')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('criticidad')"><div class="pr-2">Criticidad ${getSortIcon('criticidad')}</div>${resizer('criticidad')}</th>` : ''}
                            
                            ${tableState.visibleCols.estado ? `<th data-col="estado" style="${colStyle('estado')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('estado')"><div class="pr-2">Estado ${getSortIcon('estado')}</div>${resizer('estado')}</th>` : ''}
                            ${tableState.visibleCols.inicio ? `<th data-col="inicio" style="${colStyle('inicio')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('fecha_inicio_programado')"><div class="pr-2">Inicio Prog. ${getSortIcon('fecha_inicio_programado')}</div>${resizer('inicio')}</th>` : ''}
                            ${tableState.visibleCols.fin ? `<th data-col="fin" style="${colStyle('fin')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('fecha_fin')"><div class="pr-2">Fin Prog. ${getSortIcon('fecha_fin')}</div>${resizer('fin')}</th>` : ''}
                            ${tableState.visibleCols.cierre ? `<th data-col="cierre" style="${colStyle('cierre')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('fecha_cierre')"><div class="pr-2">Cierre Real ${getSortIcon('fecha_cierre')}</div>${resizer('cierre')}</th>` : ''}
                            ${tableState.visibleCols.cde ? `<th data-col="cde" style="${colStyle('cde')}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('estado_cde')"><div class="pr-2">CDE ISO ${getSortIcon('estado_cde')}</div>${resizer('cde')}</th>` : ''}
                            
                            ${visiblePropDefs.map(pd => `<th data-col="prop_${pd.id}" style="${colStyle('prop_'+pd.id)}" class="${thClass} cursor-pointer hover:bg-slate-200" onclick="window.toggleSort('prop_${pd.id}')"><div class="pr-2">${escapeHtml(pd.nombre)} ${getSortIcon(`prop_${pd.id}`)}</div>${resizer('prop_'+pd.id)}</th>`).join('')}
                            <th class="p-3 text-center sticky right-0 bg-slate-50 z-20 border-l border-slate-200 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)] w-[100px]">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${tasks.length === 0 ? '<tr><td colspan="15" class="text-center text-slate-400 py-8">No hay resultados con los filtros actuales</td></tr>' : ''}
                        ${tasks.map(t => {
                            const crit = getCriticidad(t); 
                            return `
                            <tr class="hover:bg-slate-50 transition group cursor-pointer" ondblclick="window.editTask(${t.id})">
                                ${tableState.visibleCols.codigo ? `<td data-col="codigo" class="p-3 font-mono text-[10px] text-slate-400 truncate" style="${colStyle('codigo')}">${t.codigo_contenedor || '–'}</td>` : ''}
                                ${tableState.visibleCols.actividad ? `
                                    <td data-col="actividad" class="p-3 truncate" style="${colStyle('actividad')}" title="${escapeHtml(t.actividad)}">
                                        <div class="font-medium text-slate-900 text-[12px]">${escapeHtml(t.actividad)}</div>
                                        ${t.nota ? `<div class="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">${escapeHtml(t.nota)}</div>` : ''}
                                    </td>
                                ` : ''}
                                ${tableState.visibleCols.grupo ? `<td data-col="grupo" class="p-3 text-slate-500 text-[11px] truncate" style="${colStyle('grupo')}" title="${escapeHtml(t.grupo || '')}">${escapeHtml(t.grupo || '-')}</td>` : ''}
                                ${tableState.visibleCols.responsable ? `<td data-col="responsable" class="p-3 text-slate-600 text-[11px] truncate" style="${colStyle('responsable')}" title="${escapeHtml(nombreResponsable(t, state.perfilesCache))}">${escapeHtml(nombreResponsable(t, state.perfilesCache))}</td>` : ''}
                                
                                ${tableState.visibleCols.importancia ? `<td data-col="importancia" class="p-3 text-slate-600 text-[11px] truncate" style="${colStyle('importancia')}">${t.importancia || 'Medio'}</td>` : ''}
                                ${tableState.visibleCols.urgencia ? `<td data-col="urgencia" class="p-3 text-slate-600 text-[11px] truncate" style="${colStyle('urgencia')}">${t.urgencia || 'Medio'}</td>` : ''}
                                ${tableState.visibleCols.criticidad ? `<td data-col="criticidad" class="p-3 font-semibold ${critColor(crit)} truncate" style="${colStyle('criticidad')}">${crit}</td>` : ''}
                                
                                ${tableState.visibleCols.estado ? `<td data-col="estado" class="p-3 truncate" style="${colStyle('estado')}"><div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${estadoColors[t.estado] || 'bg-slate-400'}"></span><span class="text-slate-700 text-[11px]">${escapeHtml(t.estado)}</span></div></td>` : ''}
                                ${tableState.visibleCols.inicio ? `<td data-col="inicio" class="p-3 text-slate-500 text-[11px] truncate" style="${colStyle('inicio')}">${t.fecha_inicio_programado ? fmtDate(t.fecha_inicio_programado) : '–'}</td>` : ''}
                                ${tableState.visibleCols.fin ? `<td data-col="fin" class="p-3 text-slate-500 text-[11px] truncate" style="${colStyle('fin')}">${t.fecha_fin ? fmtDate(t.fecha_fin) : '–'}</td>` : ''}
                                ${tableState.visibleCols.cierre ? `<td data-col="cierre" class="p-3 text-slate-500 text-[11px] truncate" style="${colStyle('cierre')}">${t.fecha_cierre ? fmtDate(t.fecha_cierre) : '–'}</td>` : ''}
                                ${tableState.visibleCols.cde ? `<td data-col="cde" class="p-3 truncate" style="${colStyle('cde')}">${cdeBadge(t.estado_cde, t.codigo_aptitud)}</td>` : ''}
                                ${visiblePropDefs.map(pd => {
                                    const pv = state.propValsCache.find(v => v.pendiente_id === t.id && v.propiedad_id === pd.id);
                                    let displayVal = '-';
                                    if (pv) {
                                        if (pd.tipo === 'numero') displayVal = pv.valor_numero ?? '-';
                                        else if (pd.tipo === 'fecha') displayVal = pv.valor_fecha ? fmtDate(pv.valor_fecha) : '-';
                                        else if (pd.tipo === 'booleano') displayVal = pv.valor_booleano ? '<i class="fa-solid fa-check text-teal-600"></i>' : '<i class="fa-solid fa-xmark text-slate-300"></i>';
                                        else displayVal = pv.valor_texto || '-';
                                    }
                                    return `<td data-col="prop_${pd.id}" class="p-3 text-slate-600 text-[11px] truncate" style="${colStyle('prop_'+pd.id)}">${displayVal}</td>`;
                                }).join('')}
                                <td class="p-3 text-center whitespace-nowrap sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-100 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.05)] z-10 w-[100px]">
                                    ${canEdit(t) ? `<button onclick="event.stopPropagation(); window.editTask(${t.id})" class="text-sky-600 hover:text-sky-800 mr-2" title="Editar"><i class="fa-solid fa-pen"></i></button>` : ''}
                                    ${canTransition() ? `<button onclick="event.stopPropagation(); window.openModalCDE(${t.id})" class="text-teal-600 hover:text-teal-800 mr-2" title="Transición CDE"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>` : ''}
                                    ${canDelete() ? `<button onclick="event.stopPropagation(); window.deleteTask(${t.id})" class="text-red-500 hover:text-red-700" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('tbl-search').addEventListener('input', (e) => { tableState.filters.search = e.target.value; setTimeout(() => window.renderView(), 300); });
    document.getElementById('tbl-fil-grupo').addEventListener('change', (e) => { tableState.filters.grupo = e.target.value; window.renderView(); });
    document.getElementById('tbl-fil-resp').addEventListener('change', (e) => { tableState.filters.responsable = e.target.value; window.renderView(); });
}

window.toggleSort = toggleSort; 
window.toggleCol = toggleCol; 
window.toggleProp = toggleProp; 
window.toggleColMenu = toggleColMenu;
window.initResize = initResize;

// --- FUNCIONES DE LOS MODALES ---

export function openModal() {
    if (!state.isAdmin && !state.isCoordinador) return;
    document.getElementById('modal-title').innerText = "Nueva Actividad";
    
    ['task-id','task-actividad','task-fecha-inicio','task-fecha-fin','task-fecha-cierre','task-nota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const impEl = document.getElementById('task-importancia'); if (impEl) impEl.value = 'Medio';
    const urgEl = document.getElementById('task-urgencia'); if (urgEl) urgEl.value = 'Medio'; 
    const estEl = document.getElementById('task-estado'); if (estEl) estEl.value = 'No iniciado';
    
    const grSel = document.getElementById('task-grupo'); 
    if (grSel) grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join('');
    
    const rsSel = document.getElementById('task-responsable'); 
    if (rsSel) rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + state.perfilesCache.map(p => `<option value="${p.id}">${escapeHtml(nombreFormateado(p))}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</option>`).join('');
    
    renderCustomProps(null);
    document.getElementById('modal-task').classList.remove('hidden'); document.getElementById('modal-task').classList.add('flex');
}

export function editTask(id) {
    const t = state.tasksCache.find(x => x.id === id);
    if (!t || !canEdit(t)) return;
    
    document.getElementById('modal-title').innerText = "Editar Actividad";
    document.getElementById('task-id').value = t.id;
    document.getElementById('task-actividad').value = t.actividad || '';
    
    const impEl = document.getElementById('task-importancia'); if (impEl) impEl.value = t.importancia || 'Medio';
    const urgEl = document.getElementById('task-urgencia'); if (urgEl) urgEl.value = t.urgencia || 'Medio';
    const iniEl = document.getElementById('task-fecha-inicio'); if (iniEl) iniEl.value = t.fecha_inicio_programado || '';

    document.getElementById('task-estado').value = t.estado || 'No iniciado';
    document.getElementById('task-fecha-fin').value = t.fecha_fin || '';
    document.getElementById('task-fecha-cierre').value = t.fecha_cierre || '';
    document.getElementById('task-nota').value = t.nota || '';
    
    const grSel = document.getElementById('task-grupo'); 
    if (grSel) { grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join(''); grSel.value = t.grupo || ''; }
    
    const rsSel = document.getElementById('task-responsable'); 
    if (rsSel) { rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + state.perfilesCache.map(p => `<option value="${p.id}">${escapeHtml(nombreFormateado(p))}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</option>`).join(''); rsSel.value = t.responsable_id || ''; }
    
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

export function closeModal() { 
    document.getElementById('modal-task').classList.add('hidden'); 
    document.getElementById('modal-task').classList.remove('flex'); 
}

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
        urgencia: document.getElementById('task-urgencia').value,
        estado: document.getElementById('task-estado').value,
        fecha_inicio_programado: document.getElementById('task-fecha-inicio').value || null,
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
