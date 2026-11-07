import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, toast } from './utils.js';

let planosState = {
    search: '',
    filterTitulo: '',
    filterCodigo: '',
    filterDisciplina: '',
    filterRevision: '',
    filterEstado: '',
    filterAconex: '',
    filterCategoria: '',
    showColMenu: false,
    sortBy: 'codigo',
    sortDir: 'asc',
    visibleCols: {
        codigo: true, titulo: true, disciplina: true, clasificacion: true,
        revision: true, fecha: true, estado: true, aconex: true,
        responsable: true, estatus_bim: true, modelo_bim: true,
        agrupacion: true, actividades: true
    },
    colWidths: {
        codigo: 150, titulo: 250, disciplina: 120, clasificacion: 120,
        revision: 80, fecha: 100, estado: 100, aconex: 120,
        responsable: 150, estatus_bim: 120, modelo_bim: 150,
        agrupacion: 160, actividades: 100
    }
};

function normalizarCategoria(texto) {
    if (!texto) return null;
    const s = String(texto).trim().toLowerCase();
    if (s.includes('contractual')) return 'contractual';
    if (s.includes('detalle')) return 'detalle';
    return null;
}

const ETIQUETA_CATEGORIA = {
    contractual: { texto: 'Contractual', clase: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' },
    detalle:     { texto: 'Detalle Constructivo', clase: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200' }
};

// --- SISTEMA DE REDIMENSIONADO ---
let isResizing = false, currentCol = null, startX = 0, startWidth = 0;

function initResize(e, colKey) {
    isResizing = true;
    currentCol = colKey;
    startX = e.pageX;
    startWidth = planosState.colWidths[colKey] || 100;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.querySelectorAll('th').forEach(th => { th.style.pointerEvents = 'none'; });
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
    e.stopPropagation();
}

function doResize(e) {
    if (!isResizing) return;
    const diff = e.pageX - startX;
    const newWidth = Math.max(50, startWidth + diff);
    planosState.colWidths[currentCol] = newWidth;
    const th = document.querySelector(`th[data-col="${currentCol}"]`);
    if (th) { th.style.width = `${newWidth}px`; th.style.minWidth = `${newWidth}px`; th.style.maxWidth = `${newWidth}px`; }
    document.querySelectorAll(`td[data-col="${currentCol}"]`).forEach(td => { td.style.width = `${newWidth}px`; td.style.minWidth = `${newWidth}px`; td.style.maxWidth = `${newWidth}px`; });
    e.preventDefault();
}

function stopResize(e) {
    if (!isResizing) return;
    setTimeout(() => { document.querySelectorAll('th').forEach(th => { th.style.pointerEvents = 'auto'; }); }, 50);
    isResizing = false; currentCol = null;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    e.preventDefault(); e.stopPropagation();
}

function toggleSort(col) {
    if (planosState.sortBy === col) {
        planosState.sortDir = planosState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        planosState.sortBy = col;
        planosState.sortDir = 'asc';
    }
    window.renderView();
}

function getSortIcon(col) {
    if (planosState.sortBy !== col) return '<i class="fa-solid fa-sort text-slate-300 dark:text-slate-600 ml-1 text-[10px]"></i>';
    return planosState.sortDir === 'asc' 
        ? '<i class="fa-solid fa-sort-up text-sky-600 ml-1 text-[10px]"></i>' 
        : '<i class="fa-solid fa-sort-down text-sky-600 ml-1 text-[10px]"></i>';
}

export function renderLogPlanos(container) {
    const conteoVinculados = {};
    const actividadPlanos = state.actividadPlanosCache || [];
    actividadPlanos.forEach(ap => {
        conteoVinculados[ap.plano_id] = (conteoVinculados[ap.plano_id] || 0) + 1;
    });

    const planos = state.planosCache || [];

    const disciplinas = [...new Set(planos.map(p => p.disciplina).filter(Boolean))].sort();
    const revisiones = [...new Set(planos.map(p => p.revision).filter(Boolean))].sort();
    const estados = [...new Set(planos.map(p => p.estado).filter(Boolean))].sort();

    const baseFiltrada = planos.filter(p => {
        const matchSearch = !planosState.search || 
            (p.codigo || '').toLowerCase().includes(planosState.search.toLowerCase()) ||
            (p.titulo || '').toLowerCase().includes(planosState.search.toLowerCase());
        const matchTitulo = !planosState.filterTitulo || (p.titulo || '').toLowerCase().includes(planosState.filterTitulo.toLowerCase());
        const matchCodigo = !planosState.filterCodigo || (p.codigo || '').toLowerCase().includes(planosState.filterCodigo.toLowerCase());
        const matchDisc = !planosState.filterDisciplina || p.disciplina === planosState.filterDisciplina;
        const matchRev = !planosState.filterRevision || p.revision === planosState.filterRevision;
        const matchEst = !planosState.filterEstado || p.estado === planosState.filterEstado;
        const matchAcx = !planosState.filterAconex || (p.aconex || '').toLowerCase().includes(planosState.filterAconex.toLowerCase());
        return matchSearch && matchTitulo && matchCodigo && matchDisc && matchRev && matchEst && matchAcx;
    });

    const conteoContractual = baseFiltrada.filter(p => p.categoria === 'contractual').length;
    const conteoDetalle = baseFiltrada.filter(p => p.categoria === 'detalle').length;

    let planosFiltrados = baseFiltrada.filter(p => {
        if (!planosState.filterCategoria) return true;
        return p.categoria === planosState.filterCategoria;
    });

    planosFiltrados.sort((a, b) => {
        let valA = a[planosState.sortBy] || '';
        let valB = b[planosState.sortBy] || '';
        
        if (planosState.sortBy === 'actividades') {
            valA = conteoVinculados[a.id] || 0;
            valB = conteoVinculados[b.id] || 0;
        }

        if (planosState.sortBy === 'fecha') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        } else if (typeof valA === 'number') {
            // Numérico directo
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        if (valA < valB) return planosState.sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return planosState.sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const todasActivas = Object.values(planosState.visibleCols).every(v => v === true);
    const filtrosActivos = Object.entries(planosState).filter(([k, v]) => {
        if (['search', 'showColMenu', 'visibleCols', 'colWidths', 'sortBy', 'sortDir', 'filterCategoria'].includes(k)) return false;
        return v !== '';
    }).length;

    const colStyle = (key) => `width: ${planosState.colWidths[key]}px; min-width: ${planosState.colWidths[key]}px; max-width: ${planosState.colWidths[key]}px;`;
    const resizer = (key) => `<div class="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-slate-300 dark:bg-slate-600 opacity-0 hover:opacity-100 transition-opacity z-30" onmousedown="window.initResizePlanos(event, '${key}')"></div>`;
    const thClass = "p-3 relative group border-r border-slate-200 dark:border-slate-700 last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700";

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full flex-wrap">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="pl-search" placeholder="Búsqueda rápida..." value="${planosState.search}" class="w-full border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-sky-600">
                </div>
                <button onclick="window.togglePlanosFilterDrawer()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5">
                    <i class="fa-solid fa-filter"></i> Filtros
                    ${filtrosActivos > 0 ? `<span class="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">${filtrosActivos}</span>` : ''}
                </button>
                <button onclick="window.setPlanosCategoria('contractual')" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${planosState.filterCategoria === 'contractual' ? 'bg-sky-600 text-white' : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}">
                    <i class="fa-solid fa-file-contract"></i> Contractual
                    <span class="${planosState.filterCategoria === 'contractual' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'} rounded-full px-1.5 text-[10px]">${conteoContractual}</span>
                </button>
                <button onclick="window.setPlanosCategoria('detalle')" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${planosState.filterCategoria === 'detalle' ? 'bg-violet-600 text-white' : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}">
                    <i class="fa-solid fa-ruler-combined"></i> Detalle Constructivo
                    <span class="${planosState.filterCategoria === 'detalle' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'} rounded-full px-1.5 text-[10px]">${conteoDetalle}</span>
                </button>
            </div>
            
            <div class="flex items-center gap-3">
                <div class="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap hidden md:block">
                    Mostrando <b>${planosFiltrados.length}</b> de ${planos.length} planos
                </div>
                
                <div class="relative">
                    <button onclick="window.togglePlanosColMenu()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5">
                        <i class="fa-solid fa-table-columns"></i> Columnas <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>
                    <div class="${planosState.showColMenu ? 'block' : 'hidden'} absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 py-1 max-h-[60vh] overflow-y-auto">
                        <div class="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 mb-1">
                            <button onclick="window.toggleTodasPlanosCols(${!todasActivas})" class="text-xs font-bold text-sky-600 hover:underline">
                                ${todasActivas ? 'Ocultar todas' : 'Mostrar todas'}
                            </button>
                        </div>
                        ${Object.keys(planosState.visibleCols).map(col => `
                            <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs capitalize">
                                <input type="checkbox" onchange="window.togglePlanosCol('${col}')" ${planosState.visibleCols[col] ? 'checked' : ''} class="rounded text-sky-600"> 
                                ${col.replace('_', ' ')}
                            </label>
                        `).join('')}
                    </div>
                </div>

                ${state.isAdmin || state.isCoordinador ? `
                <label class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                    <i class="fa-solid fa-file-import"></i> Importar
                    <input type="file" id="file-planos" accept=".xlsx, .xls" class="hidden" onchange="window.handlePlanosUpload(event)">
                </label>
                ` : ''}
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto overflow-y-auto max-h-[75vh] custom-scrollbar">
                <table class="w-full text-left text-xs" style="table-layout: fixed; min-width: 1500px;">
                    <thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 uppercase font-semibold sticky top-0 z-10 shadow-sm select-none">
                        <tr>
                            ${planosState.visibleCols.codigo ? `<th data-col="codigo" style="${colStyle('codigo')}" class="${thClass}" onclick="window.togglePlanosSort('codigo')">Código ${getSortIcon('codigo')} ${resizer('codigo')}</th>` : ''}
                            ${planosState.visibleCols.titulo ? `<th data-col="titulo" style="${colStyle('titulo')}" class="${thClass}" onclick="window.togglePlanosSort('titulo')">Título ${getSortIcon('titulo')} ${resizer('titulo')}</th>` : ''}
                            ${planosState.visibleCols.disciplina ? `<th data-col="disciplina" style="${colStyle('disciplina')}" class="${thClass}" onclick="window.togglePlanosSort('disciplina')">Disciplina ${getSortIcon('disciplina')} ${resizer('disciplina')}</th>` : ''}
                            ${planosState.visibleCols.clasificacion ? `<th data-col="clasificacion" style="${colStyle('clasificacion')}" class="${thClass}" onclick="window.togglePlanosSort('clasificacion')">Clasificación ${getSortIcon('clasificacion')} ${resizer('clasificacion')}</th>` : ''}
                            ${planosState.visibleCols.revision ? `<th data-col="revision" style="${colStyle('revision')}" class="${thClass}" onclick="window.togglePlanosSort('revision')">Rev. ${getSortIcon('revision')} ${resizer('revision')}</th>` : ''}
                            ${planosState.visibleCols.fecha ? `<th data-col="fecha" style="${colStyle('fecha')}" class="${thClass}" onclick="window.togglePlanosSort('fecha')">Fecha ${getSortIcon('fecha')} ${resizer('fecha')}</th>` : ''}
                            ${planosState.visibleCols.estado ? `<th data-col="estado" style="${colStyle('estado')}" class="${thClass}" onclick="window.togglePlanosSort('estado')">Estado ${getSortIcon('estado')} ${resizer('estado')}</th>` : ''}
                            ${planosState.visibleCols.aconex ? `<th data-col="aconex" style="${colStyle('aconex')}" class="${thClass}" onclick="window.togglePlanosSort('aconex')">Aconex ${getSortIcon('aconex')} ${resizer('aconex')}</th>` : ''}
                            ${planosState.visibleCols.responsable ? `<th data-col="responsable" style="${colStyle('responsable')}" class="${thClass}" onclick="window.togglePlanosSort('responsable')">Responsable ${getSortIcon('responsable')} ${resizer('responsable')}</th>` : ''}
                            ${planosState.visibleCols.estatus_bim ? `<th data-col="estatus_bim" style="${colStyle('estatus_bim')}" class="${thClass}" onclick="window.togglePlanosSort('estatus_bim')">Estatus BIM ${getSortIcon('estatus_bim')} ${resizer('estatus_bim')}</th>` : ''}
                            ${planosState.visibleCols.modelo_bim ? `<th data-col="modelo_bim" style="${colStyle('modelo_bim')}" class="${thClass}" onclick="window.togglePlanosSort('modelo_bim')">Modelo BIM ${getSortIcon('modelo_bim')} ${resizer('modelo_bim')}</th>` : ''}
                            ${planosState.visibleCols.agrupacion ? `<th data-col="agrupacion" style="${colStyle('agrupacion')}" class="${thClass}" onclick="window.togglePlanosSort('agrupacion')">Agrupación ${getSortIcon('agrupacion')} ${resizer('agrupacion')}</th>` : ''}
                            ${planosState.visibleCols.actividades ? `<th data-col="actividades" style="${colStyle('actividades')}" class="${thClass} text-center" onclick="window.togglePlanosSort('actividades')">Actividades ${getSortIcon('actividades')} ${resizer('actividades')}</th>` : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${planosFiltrados.length === 0 ? `<tr><td colspan="13" class="text-center py-8 text-slate-400">No hay planos que coincidan.</td></tr>` : ''}
                        ${planosFiltrados.map(p => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                                ${planosState.visibleCols.codigo ? `<td data-col="codigo" style="${colStyle('codigo')}" class="p-3 font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate" title="${escapeHtml(p.codigo)}">${escapeHtml(p.codigo)}</td>` : ''}
                                ${planosState.visibleCols.titulo ? `<td data-col="titulo" style="${colStyle('titulo')}" class="p-3 font-medium text-slate-800 dark:text-slate-200 truncate" title="${escapeHtml(p.titulo)}">${escapeHtml(p.titulo || '-')}</td>` : ''}
                                ${planosState.visibleCols.disciplina ? `<td data-col="disciplina" style="${colStyle('disciplina')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.disciplina || '-')}</td>` : ''}
                                ${planosState.visibleCols.clasificacion ? `<td data-col="clasificacion" style="${colStyle('clasificacion')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.clasificacion || '-')}</td>` : ''}
                                ${planosState.visibleCols.revision ? `<td data-col="revision" style="${colStyle('revision')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.revision || '-')}</td>` : ''}
                                ${planosState.visibleCols.fecha ? `<td data-col="fecha" style="${colStyle('fecha')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${p.fecha ? fmtDate(p.fecha) : '-'}</td>` : ''}
                                ${planosState.visibleCols.estado ? `<td data-col="estado" style="${colStyle('estado')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.estado || '-')}</td>` : ''}
                                ${planosState.visibleCols.aconex ? `<td data-col="aconex" style="${colStyle('aconex')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.aconex || '-')}</td>` : ''}
                                ${planosState.visibleCols.responsable ? `<td data-col="responsable" style="${colStyle('responsable')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.responsable || '-')}</td>` : ''}
                                ${planosState.visibleCols.estatus_bim ? `<td data-col="estatus_bim" style="${colStyle('estatus_bim')}" class="p-3 truncate">${p.estatus_bim ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">${escapeHtml(p.estatus_bim)}</span>` : '-'}</td>` : ''}
                                ${planosState.visibleCols.modelo_bim ? `<td data-col="modelo_bim" style="${colStyle('modelo_bim')}" class="p-3 text-slate-600 dark:text-slate-400 truncate">${escapeHtml(p.modelo_bim || '-')}</td>` : ''}
                                ${planosState.visibleCols.agrupacion ? `<td data-col="agrupacion" style="${colStyle('agrupacion')}" class="p-3 truncate" title="${escapeHtml(p.agrupacion || '')}">${(() => {
                                    const cat = ETIQUETA_CATEGORIA[p.categoria];
                                    if (cat) return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold ${cat.clase}">${cat.texto}</span>`;
                                    return p.agrupacion ? `<span class="text-slate-600 dark:text-slate-400">${escapeHtml(p.agrupacion)}</span>` : '<span class="text-slate-300">-</span>';
                                })()}</td>` : ''}
                                ${planosState.visibleCols.actividades ? `<td data-col="actividades" style="${colStyle('actividades')}" class="p-3 text-center truncate">${conteoVinculados[p.id] ? `<span class="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">${conteoVinculados[p.id]}</span>` : '<span class="text-slate-300">0</span>'}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    if (!document.getElementById('planos-filter-drawer')) {
        const drawerHtml = `
            <div id="planos-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.togglePlanosFilterDrawer()"></div>
            <div id="planos-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white dark:bg-slate-800 shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 class="font-bold text-sm text-slate-800 dark:text-white">Filtros de Planos</h3>
                    <button onclick="window.togglePlanosFilterDrawer()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="p-4 space-y-4 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Código</label>
                        <input type="text" id="drw-pl-codigo" value="${planosState.filterCodigo}" oninput="window.applyPlanosFilter('filterCodigo', this.value)" class="inp">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Título</label>
                        <input type="text" id="drw-pl-titulo" value="${planosState.filterTitulo}" oninput="window.applyPlanosFilter('filterTitulo', this.value)" class="inp">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Aconex</label>
                        <input type="text" id="drw-pl-aconex" value="${planosState.filterAconex}" oninput="window.applyPlanosFilter('filterAconex', this.value)" class="inp">
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Disciplina</label>
                        <select id="drw-pl-disciplina" onchange="window.applyPlanosFilter('filterDisciplina', this.value)" class="inp">
                            <option value="">Todas</option>
                            ${disciplinas.map(d => `<option value="${escapeHtml(d)}" ${planosState.filterDisciplina === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Revisión</label>
                        <select id="drw-pl-revision" onchange="window.applyPlanosFilter('filterRevision', this.value)" class="inp">
                            <option value="">Todas</option>
                            ${revisiones.map(r => `<option value="${escapeHtml(r)}" ${planosState.filterRevision === r ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Estado</label>
                        <select id="drw-pl-estado" onchange="window.applyPlanosFilter('filterEstado', this.value)" class="inp">
                            <option value="">Todos</option>
                            ${estados.map(e => `<option value="${escapeHtml(e)}" ${planosState.filterEstado === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <button onclick="window.clearPlanosFilters()" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                            <i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    const inputSearch = document.getElementById('pl-search');
    inputSearch.addEventListener('input', (e) => {
        planosState.search = e.target.value;
        clearTimeout(window.planosSearchTimeout);
        window.planosSearchTimeout = setTimeout(() => {
            window.renderView();
            const newInput = document.getElementById('pl-search');
            if (newInput) {
                newInput.focus();
                const val = newInput.value;
                newInput.value = ''; newInput.value = val;
            }
        }, 400);
    });
}

window.togglePlanosSort = toggleSort;
window.togglePlanosFilterDrawer = function() {
    const drawer = document.getElementById('planos-filter-drawer');
    const overlay = document.getElementById('planos-filter-drawer-overlay');
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
window.applyPlanosFilter = function(key, value) {
    planosState[key] = value;
    window.renderView();
};
window.clearPlanosFilters = function() {
    planosState.search = '';
    planosState.filterTitulo = '';
    planosState.filterCodigo = '';
    planosState.filterDisciplina = '';
    planosState.filterRevision = '';
    planosState.filterEstado = '';
    planosState.filterAconex = '';
    planosState.filterCategoria = '';
    window.renderView();
};
window.togglePlanosColMenu = function() {
    planosState.showColMenu = !planosState.showColMenu;
    window.renderView();
};
window.togglePlanosCol = function(col) {
    planosState.visibleCols[col] = !planosState.visibleCols[col];
    window.renderView();
};
window.toggleTodasPlanosCols = function(estado) {
    Object.keys(planosState.visibleCols).forEach(k => {
        planosState.visibleCols[k] = estado;
    });
    window.renderView();
};
window.initResizePlanos = initResize;

window.setPlanosCategoria = function(cat) {
    planosState.filterCategoria = planosState.filterCategoria === cat ? '' : cat;
    window.renderView();
};

window.handlePlanosUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const nombreHoja = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'IMPORTAR');
            if (!nombreHoja) {
                toast('No se encontró la hoja "IMPORTAR" en el archivo.');
                return;
            }
            
            const worksheet = workbook.Sheets[nombreHoja];
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            
            if (json.length === 0) { toast('La hoja "IMPORTAR" está vacía.'); return; }
            if (!confirm(`Se procesarán ${json.length} filas de la hoja "IMPORTAR".\n\nLas filas con igual Código + Revisión serán sobrescritas. Las nuevas serán añadidas.\n\n¿Continuar?`)) return;

            const inserts = json.map(row => {
                const getVal = (keys) => {
                    for (let k of keys) { if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); }
                    return null;
                };

                const codigo = getVal(['Codigo de entregable', 'Código de entregable', 'codigo']);
                if (!codigo) return null;

                const agrupacionTexto = getVal(['AGRUPACIÓN', 'Agrupación', 'AGRUPACION', 'Agrupacion', 'agrupacion']);

                return {
                    codigo: codigo,
                    revision: getVal(['Revision', 'Revisión', 'revision']) || 'C01',
                    titulo: getVal(['Titulo de entregable', 'Título de entregable', 'titulo']),
                    disciplina: getVal(['Disciplina']),
                    clasificacion: getVal(['Clasificacion', 'Clasificación']),
                    fecha: getVal(['Fecha']) ? new Date(row['Fecha']).toISOString().split('T')[0] : null,
                    estado: getVal(['Estado']),
                    aconex: getVal(['Aconex']),
                    responsable: getVal(['Responsable']),
                    estatus_bim: getVal(['ESTATUS (BIM)', 'Estatus BIM']),
                    modelo_bim: getVal(['MODELO BIM', 'Modelo BIM']),
                    agrupacion: agrupacionTexto,
                    categoria: normalizarCategoria(agrupacionTexto)
                };
            }).filter(Boolean);

            if (inserts.length === 0) { toast('No se encontraron filas con código válido.'); return; }

            const codigosPrevios = new Set((state.planosCache || []).map(p => `${p.codigo}|${p.revision}`));
            const actualizados = inserts.filter(p => codigosPrevios.has(`${p.codigo}|${p.revision}`)).length;
            const nuevos = inserts.length - actualizados;

            const errores = [];
            for (let i = 0; i < inserts.length; i += 100) {
                const batch = inserts.slice(i, i + 100);
                const { error } = await supabaseClient
                    .from('planos')
                    .upsert(batch, { onConflict: 'codigo,revision', ignoreDuplicates: false })
                    .select();
                
                if (error) errores.push(error.message);
            }

            await fetchAll();
            window.renderView();

            if (errores.length > 0) {
                toast(`Errores: ${errores[0]}`);
            } else {
                toast(`Importación completa: ${nuevos} nuevos, ${actualizados} sobrescritos.`);
            }

        } catch (err) {
            console.error(err);
            toast('Error al importar planos: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
};
