import { supabaseClient, state, fetchAll } from './db.js';
import { 
    escapeHtml, fmtDate, cdeBadge, nombreResponsable, toast, 
    getCriticidad, critColor, nombreFormateado, getIniciales, colorAvatar, 
    confirmDelete, semaforo
} from './utils.js';

// --- HELPERS DE RECURSOS ---
function getRecursosDeTarea(pendienteId) {
    return (state.actividadRecursosCache || [])
        .filter(r => r.pendiente_id === pendienteId)
        .map(r => state.perfilesCache.find(p => p.id === r.usuario_id))
        .filter(Boolean);
}

let recursosSeleccionados = new Set();

function renderRecursosChips(pendienteId) {
    recursosSeleccionados.clear();
    if (pendienteId) {
        const existentes = (state.actividadRecursosCache || [])
            .filter(r => r.pendiente_id === pendienteId)
            .map(r => r.usuario_id);
        existentes.forEach(id => recursosSeleccionados.add(id));
    }
    actualizarChipsUI();
}

function actualizarChipsUI() {
    const box = document.getElementById('recursos-chips');
    if (!box) return;
    if (recursosSeleccionados.size === 0) {
        box.innerHTML = '<span class="text-[10px] text-slate-400 italic">Sin recursos asignados</span>';
        return;
    }
    const { carga } = calcularCargaModeladores();
    box.innerHTML = Array.from(recursosSeleccionados).map(uid => {
        const p = state.perfilesCache.find(x => x.id === uid);
        if (!p) return '';
        const nombre = nombreFormateado(p);
        const info = carga[p.id];
        const punto = info ? `<span class="w-1.5 h-1.5 rounded-full ${info.color === 'red' ? 'bg-red-500' : info.color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}"></span>` : '';
        return `
            <span class="inline-flex items-center gap-1 bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
                ${punto}
                <div class="w-4 h-4 rounded-full ${colorAvatar(p.id)} text-white text-[8px] font-bold flex items-center justify-center">
                    ${getIniciales(nombre).toUpperCase()}
                </div>
                ${escapeHtml(nombre)}
                <button type="button" onclick="window.quitarRecurso('${uid}')" class="text-sky-600 hover:text-sky-900 dark:text-sky-400 dark:hover:text-white ml-0.5">×</button>
            </span>
        `;
    }).join('');
}

function inicializarBuscadorRecursos() {
    const input = document.getElementById('recursos-search');
    const dropdown = document.getElementById('recursos-dropdown');
    if (!input || !dropdown) return;

    const nuevoInput = input.cloneNode(true);
    input.parentNode.replaceChild(nuevoInput, input);

    nuevoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        mostrarDropdownRecursos(nuevoInput.value);
    });
    nuevoInput.addEventListener('input', (e) => mostrarDropdownRecursos(e.target.value));
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== nuevoInput) dropdown.classList.add('hidden');
    });

    function mostrarDropdownRecursos(query) {
        const q = (query || '').toLowerCase();
        const disponibles = state.perfilesCache.filter(p => {
            const esModelador = (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador';
            if (!esModelador) return false;
            if (recursosSeleccionados.has(p.id)) return false;
            if (q && !nombreFormateado(p).toLowerCase().includes(q)) return false;
            return true;
        });
        
        if (disponibles.length === 0) {
            dropdown.innerHTML = '<div class="p-2 text-[11px] text-slate-400 text-center">Sin resultados</div>';
        } else {
            const { carga } = calcularCargaModeladores();
            dropdown.innerHTML = disponibles.map(p => {
                const nombre = nombreFormateado(p);
                const info = carga[p.id];
                const sem = info ? SEMAFORO[info.color].emoji : '';
                const textoCarga = info ? ` — ${textoCargaCorto(info)}` : '';
                return `
                    <div onclick="window.agregarRecurso('${p.id}')" class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                        <div class="w-6 h-6 rounded-full ${colorAvatar(p.id)} text-white text-[10px] font-bold flex items-center justify-center">
                            ${getIniciales(nombre).toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <p class="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">${sem} ${escapeHtml(nombre)}</p>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(p.cargo || 'Operador')}${textoCarga}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
        dropdown.classList.remove('hidden');
    }
}

window.agregarRecurso = function(uid) {
    recursosSeleccionados.add(uid);
    actualizarChipsUI();
    const input = document.getElementById('recursos-search');
    if (input) input.value = '';
    const dd = document.getElementById('recursos-dropdown');
    if (dd) dd.classList.add('hidden');
};

window.quitarRecurso = function(uid) {
    recursosSeleccionados.delete(uid);
    actualizarChipsUI();
};

// --- HELPERS DE PLANOS ---
let planosSeleccionados = new Set();

function renderPlanosChips(pendienteId) {
    planosSeleccionados.clear();
    if (pendienteId) {
        const existentes = (state.actividadPlanosCache || [])
            .filter(ap => Number(ap.pendiente_id) === Number(pendienteId))
            .map(ap => Number(ap.plano_id));
        existentes.forEach(id => planosSeleccionados.add(id));
    }
    actualizarPlanosUI();
}

function actualizarPlanosUI() {
    const box = document.getElementById('planos-chips');
    if (!box) return;
    if (planosSeleccionados.size === 0) {
        box.innerHTML = '<span class="text-[10px] text-slate-400 italic">Sin planos vinculados</span>';
        return;
    }
    box.innerHTML = Array.from(planosSeleccionados).map(pid => {
        const plano = (state.planosCache || []).find(p => Number(p.id) === Number(pid));
        if (!plano) return '';
        return `
            <span class="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
                <i class="fa-solid fa-file-pdf text-[10px]"></i>
                ${escapeHtml(plano.codigo)}
                <button type="button" onclick="window.quitarPlano('${pid}')" class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-white ml-1 font-bold text-sm leading-none cursor-pointer">
                    ×
                </button>
            </span>
        `;
    }).join('');
}

function inicializarBuscadorPlanos() {
    const input = document.getElementById('planos-search');
    const dropdown = document.getElementById('planos-dropdown');
    if (!input || !dropdown) return;

    const nuevoInput = input.cloneNode(true);
    input.parentNode.replaceChild(nuevoInput, input);

    nuevoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        mostrarDropdownPlanos(nuevoInput.value);
    });
    nuevoInput.addEventListener('input', (e) => mostrarDropdownPlanos(e.target.value));
    
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== nuevoInput) dropdown.classList.add('hidden');
    });

    function mostrarDropdownPlanos(query) {
        const q = (query || '').toLowerCase();
        const disponibles = (state.planosCache || []).filter(p => {
            if (planosSeleccionados.has(Number(p.id))) return false;
            const text = `${p.codigo} ${p.titulo || ''}`.toLowerCase();
            return text.includes(q);
        }).slice(0, 30);
        
        if (disponibles.length === 0) {
            dropdown.innerHTML = '<div class="p-2 text-[11px] text-slate-400 text-center">Sin resultados</div>';
        } else {
            dropdown.innerHTML = disponibles.map(p => `
                <div onclick="window.agregarPlano(${p.id})" class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-50 dark:border-slate-700 last:border-0">
                    <div class="flex-shrink-0 w-6 h-6 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded flex items-center justify-center">
                        <i class="fa-solid fa-file-pdf text-[10px]"></i>
                    </div>
                    <div class="truncate">
                        <p class="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">${escapeHtml(p.codigo)}</p>
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(p.titulo || p.disciplina || '')}</p>
                    </div>
                </div>
            `).join('');
        }
        dropdown.classList.remove('hidden');
    }
}

window.agregarPlano = function(pid) {
    planosSeleccionados.add(Number(pid));
    actualizarPlanosUI();
    const input = document.getElementById('planos-search');
    if (input) input.value = '';
    const dd = document.getElementById('planos-dropdown');
    if (dd) dd.classList.add('hidden');
};

window.quitarPlano = function(pid) {
    planosSeleccionados.delete(Number(pid));
    actualizarPlanosUI();
};

// --- HELPERS DE CAUSAS ---
let causasSeleccionadas = new Set();

function renderCausasChips(pendienteId) {
    causasSeleccionadas.clear();
    if (pendienteId) {
        const existentes = (state.tareaCausasCache || [])
            .filter(tc => Number(tc.pendiente_id) === Number(pendienteId))
            .map(tc => Number(tc.causa_id));
        existentes.forEach(id => causasSeleccionadas.add(id));
    }
    actualizarCausasUI();
}

function actualizarCausasUI() {
    const box = document.getElementById('causas-chips');
    if (!box) return;
    if (causasSeleccionadas.size === 0) {
        box.innerHTML = '<span class="text-[10px] text-slate-400 italic">Sin causas seleccionadas</span>';
        return;
    }
    box.innerHTML = Array.from(causasSeleccionadas).map(cid => {
        const c = (state.causasCache || []).find(x => Number(x.id) === Number(cid));
        if (!c) return '';
        return `
            <span class="inline-flex items-center gap-1 bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
                ${escapeHtml(c.nombre)}
                <button type="button" onclick="window.quitarCausa('${cid}')" class="text-rose-600 hover:text-rose-900 dark:text-rose-400 dark:hover:text-white ml-1 font-bold text-sm leading-none cursor-pointer">×</button>
            </span>
        `;
    }).join('');
}

function inicializarBuscadorCausas() {
    const input = document.getElementById('causas-search');
    const dropdown = document.getElementById('causas-dropdown');
    if (!input || !dropdown) return;

    const nuevoInput = input.cloneNode(true);
    input.parentNode.replaceChild(nuevoInput, input);

    nuevoInput.addEventListener('click', (e) => { e.stopPropagation(); mostrarDropdownCausas(nuevoInput.value); });
    nuevoInput.addEventListener('input', (e) => mostrarDropdownCausas(e.target.value));
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== nuevoInput) dropdown.classList.add('hidden');
    });

    function mostrarDropdownCausas(query) {
        const q = (query || '').toLowerCase();
        const disponibles = (state.causasCache || []).filter(c => {
            if (causasSeleccionadas.has(Number(c.id))) return false;
            if (causasSeleccionadas.size >= 5) return false;
            return !q || c.nombre.toLowerCase().includes(q);
        });
        if (disponibles.length === 0) {
            dropdown.innerHTML = '<div class="p-2 text-[11px] text-slate-400 text-center">Sin resultados o límite de 5 alcanzado</div>';
        } else {
            dropdown.innerHTML = disponibles.map(c => `
                <div onclick="window.agregarCausa(${c.id})" class="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs text-slate-700 dark:text-slate-200">
                    ${escapeHtml(c.nombre)}
                </div>
            `).join('');
        }
        dropdown.classList.remove('hidden');
    }
}

window.agregarCausa = function(cid) {
    if (causasSeleccionadas.size >= 5) { toast('Máximo 5 causas por tarea'); return; }
    causasSeleccionadas.add(Number(cid));
    actualizarCausasUI();
    const input = document.getElementById('causas-search'); if (input) input.value = '';
    const dd = document.getElementById('causas-dropdown'); if (dd) dd.classList.add('hidden');
};
window.quitarCausa = function(cid) {
    causasSeleccionadas.delete(Number(cid));
    actualizarCausasUI();
};

// --- CARGA DE MODELADORES Y SEMÁFORO ---
function calcularCargaModeladores() {
    const CAPACIDAD_SEMANAL_H = 40;
    const PESO_IMPORTANCIA = { 'Muy alto': 3, 'Alto': 2, 'Medio': 1, 'Bajo': 0.5 };
    const hoyStr = new Date().toISOString().split('T')[0];

    const modeladores = state.perfilesCache.filter(p =>
        (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador'
    );

    const carga = {};
    modeladores.forEach(p => {
        carga[p.id] = { tareas: 0, horasEstimadas: 0, semanas: 0, color: 'green' };
    });

    state.tasksCache.filter(t => t.estado !== 'Cerrado').forEach(t => {
        const asignados = new Set();
        if (t.responsable_id) asignados.add(t.responsable_id);
        (state.actividadRecursosCache || []).filter(r => r.pendiente_id === t.id).forEach(r => asignados.add(r.usuario_id));
        asignados.forEach(uid => {
            if (!carga[uid]) return;
            carga[uid].tareas += 1;
            let dias = 0;
            if (t.fecha_fin) {
                const fin = new Date(t.fecha_fin + 'T00:00:00');
                const hoyD = new Date(hoyStr + 'T00:00:00');
                dias = Math.max(0, Math.ceil((fin - hoyD) / 86400000));
            }
            const peso = PESO_IMPORTANCIA[t.importancia] || 1;
            carga[uid].horasEstimadas += dias * 8 * peso;
        });
    });

    let maxSemanas = 0;
    let maxTareas = 0;
    Object.values(carga).forEach(c => {
        c.semanas = c.horasEstimadas / CAPACIDAD_SEMANAL_H;
        if (c.semanas > maxSemanas) { maxSemanas = c.semanas; maxTareas = c.tareas; }
    });

    Object.values(carga).forEach(c => {
        if (maxSemanas <= 0) { c.color = 'green'; return; }
        const ratio = (c.semanas / maxSemanas) * 100;
        if (ratio > 80 && maxTareas >= 3) c.color = 'red';
        else if (ratio > 50) c.color = 'amber';
        else c.color = 'green';
    });

    return { carga, maxSemanas, maxTareas };
}

const SEMAFORO = {
    green: { emoji: '🟢', clase: 'text-emerald-600 dark:text-emerald-400' },
    amber: { emoji: '🟡', clase: 'text-amber-600 dark:text-amber-400' },
    red:   { emoji: '🔴', clase: 'text-red-600 dark:text-red-400' }
};

function textoCargaCorto(info) {
    return `${info.tareas} tarea${info.tareas === 1 ? '' : 's'} · ${info.semanas.toFixed(1)} sem`;
}

// --- ESTADO LOCAL DE LA TABLA ---
let tableState = {
    sortBy: 'id', sortDir: 'desc', showColMenu: false,
    visibleCols: { 
        codigo: true, actividad: true, grupo: true, responsable: true, recursos: true, planos: true,
        importancia: true, urgencia: true, criticidad: true, 
        estado: true, inicio: true, fin: true, cierre: true, cde: true 
    },
    visibleProps: {}, 
    filters: { 
        search: '', grupo: '', responsable: '', recursos: '', 
        estadosOcultos: [], 
        iniDesde: '', iniHasta: '', finDesde: '', finHasta: '',
        cierreDesde: '', cierreHasta: '',
        soloVencidas: false, soloPorVencer: false, soloSinFecha: false
    },
    colWidths: {
        codigo: 100, actividad: 280, grupo: 120, responsable: 140, recursos: 130, planos: 130,
        importancia: 90, urgencia: 90, criticidad: 90, estado: 100, 
        inicio: 90, fin: 90, cierre: 90, cde: 100,
        acciones: 100
    }
};

export function canEdit(t) { 
    if (state.isAdmin || state.isCoordinador || state.isSupervisor) return true;
    if (state.isModelador && t.estado_cde === 'WIP') {
        const esOwner = t.user_id === state.currentUser?.id;
        const esResponsable = t.responsable_id === state.currentUser?.id;
        const esRecurso = (state.actividadRecursosCache || []).some(
            r => r.pendiente_id === t.id && r.usuario_id === state.currentUser?.id
        );
        if (esOwner || esResponsable || esRecurso) return true;
    }
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
    if (tableState.filters.recursos) {
        result = result.filter(t => 
            (state.actividadRecursosCache || []).some(r => r.pendiente_id === t.id && r.usuario_id === tableState.filters.recursos)
        );
    }
    if (tableState.filters.estadosOcultos && tableState.filters.estadosOcultos.length > 0) {
        result = result.filter(t => !tableState.filters.estadosOcultos.includes(t.estado));
    }

    if (tableState.filters.iniDesde) result = result.filter(t => t.fecha_inicio_programado && t.fecha_inicio_programado >= tableState.filters.iniDesde);
    if (tableState.filters.iniHasta) result = result.filter(t => t.fecha_inicio_programado && t.fecha_inicio_programado <= tableState.filters.iniHasta);
    if (tableState.filters.finDesde) result = result.filter(t => t.fecha_fin && t.fecha_fin >= tableState.filters.finDesde);
    if (tableState.filters.finHasta) result = result.filter(t => t.fecha_fin && t.fecha_fin <= tableState.filters.finHasta);
    if (tableState.filters.cierreDesde) result = result.filter(t => t.fecha_cierre && t.fecha_cierre >= tableState.filters.cierreDesde);
    if (tableState.filters.cierreHasta) result = result.filter(t => t.fecha_cierre && t.fecha_cierre <= tableState.filters.cierreHasta);

    if (tableState.filters.soloVencidas) result = result.filter(t => semaforo(t) === 'Vencida');
    if (tableState.filters.soloPorVencer) result = result.filter(t => semaforo(t) === 'Por vencer');
    if (tableState.filters.soloSinFecha) result = result.filter(t => semaforo(t) === 'Sin fecha');

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

let isResizing = false, currentCol = null, startX = 0, startWidth = 0;
function initResize(e, colKey) {
    isResizing = true; currentCol = colKey; startX = e.pageX; startWidth = tableState.colWidths[colKey] || 100;
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    document.querySelectorAll('th').forEach(th => { th.style.pointerEvents = 'none'; });
    document.addEventListener('mousemove', doResize); document.addEventListener('mouseup', stopResize);
    e.preventDefault(); e.stopPropagation();
}
function doResize(e) {
    if (!isResizing) return;
    const newWidth = Math.max(50, startWidth + (e.pageX - startX));
    tableState.colWidths[currentCol] = newWidth;
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
    document.removeEventListener('mousemove', doResize); document.removeEventListener('mouseup', stopResize);
    e.preventDefault(); e.stopPropagation();
}

export function renderTabla(container) {
    const tasks = getProcessedTasks();
    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
            const respOpts = state.perfilesCache
            .filter(esResponsableValido)
            .map(p => ({ id: p.id, name: nombreFormateado(p) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    const recursosOpts = state.perfilesCache.filter(p => (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador');
    const visiblePropDefs = state.propDefsCache.filter(pd => tableState.visibleProps[pd.id] !== false);

    const estadoColors = { 'No iniciado': 'bg-slate-400', 'En proceso': 'bg-sky-500', 'En espera': 'bg-amber-500', 'Reprogramado': 'bg-purple-500', 'Cerrado': 'bg-teal-500', 'Terminado': 'bg-emerald-500' };
    const colStyle = (key) => `width: ${tableState.colWidths[key] || 100}px; min-width: ${tableState.colWidths[key] || 100}px; max-width: ${tableState.colWidths[key] || 100}px;`;
    const resizer = (key) => `<div class="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-slate-300 dark:bg-slate-600 opacity-0 hover:opacity-100 transition-opacity z-30" onmousedown="window.initResize(event, '${key}')"></div>`;
    const thClass = "p-3 relative group border-r border-slate-200 dark:border-slate-700 last:border-r-0 text-[10px] font-bold tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-300";
    const filtrosActivos = Object.values(tableState.filters).filter(v => v !== '' && v !== false && (Array.isArray(v) ? v.length > 0 : true)).length;

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="tbl-search" placeholder="Buscar actividad..." value="${tableState.filters.search}" class="w-full border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-sky-600">
                </div>
                <button onclick="window.toggleFilterDrawer()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5">
                    <i class="fa-solid fa-filter"></i> Filtros
                    ${filtrosActivos > 0 ? `<span class="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">${filtrosActivos}</span>` : ''}
                </button>
            </div>
            <div class="flex items-center gap-2">
                <div class="relative">
                    <button onclick="window.toggleColMenu()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-table-columns"></i> Columnas <i class="fa-solid fa-chevron-down text-[10px]"></i></button>
                    <div class="${tableState.showColMenu ? 'block' : 'hidden'} absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 py-1 max-h-64 overflow-y-auto">
                        ${Object.keys(tableState.visibleCols).map(col => `<label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs capitalize"><input type="checkbox" onchange="window.toggleCol('${col}')" ${tableState.visibleCols[col] ? 'checked' : ''} class="rounded text-sky-600"> ${col.replace('_', ' ')}</label>`).join('')}
                        ${state.propDefsCache.length > 0 ? `<div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase border-t border-slate-100 dark:border-slate-700 mt-1">Personalizadas</div>${state.propDefsCache.map(pd => `<label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.toggleProp(${pd.id})" ${tableState.visibleProps[pd.id] !== false ? 'checked' : ''} class="rounded text-sky-600"> ${escapeHtml(pd.nombre)}</label>`).join('')}` : ''}
                    </div>
                </div>
                <button onclick="window.fetchAll().then(window.renderView)" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"><i class="fa-solid fa-rotate-right mr-1"></i> Refrescar</button>
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <div class="overflow-x-auto overflow-y-auto max-h-[70vh] custom-scrollbar relative">
               <table class="text-left text-xs" style="table-layout: fixed;">
                    <thead class="sticky top-0 z-20 shadow-sm">
                        <tr class="bg-slate-50 dark:bg-slate-800">
                            ${Object.keys(tableState.visibleCols).map(col => {
                                if (!tableState.visibleCols[col]) return '';
                                let title = col.replace('_', ' ');
                                if (col === 'cde') title = 'CDE ISO';
                                return `<th data-col="${col}" style="${colStyle(col)}" class="${thClass} cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onclick="window.toggleSort('${col === 'cde' ? 'estado_cde' : col === 'inicio' ? 'fecha_inicio_programado' : col === 'fin' ? 'fecha_fin' : col === 'cierre' ? 'fecha_cierre' : col === 'responsable' ? 'responsable_id' : col === 'codigo' ? 'codigo_contenedor' : col}')"><div class="pr-2 capitalize">${title} ${getSortIcon(col)}</div>${resizer(col)}</th>`;
                            }).join('')}
                            ${visiblePropDefs.map(pd => `<th data-col="prop_${pd.id}" style="${colStyle('prop_'+pd.id)}" class="${thClass} cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onclick="window.toggleSort('prop_${pd.id}')"><div class="pr-2">${escapeHtml(pd.nombre)} ${getSortIcon(`prop_${pd.id}`)}</div>${resizer('prop_'+pd.id)}</th>`).join('')}
                            <th data-col="acciones" style="width:100px !important;min-width:100px !important;max-width:100px !important;"
                                class="p-3 text-center sticky right-0 z-30 bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${tasks.length === 0 ? '<tr><td colspan="15" class="text-center text-slate-400 py-8">No hay resultados con los filtros actuales</td></tr>' : ''}
                        ${tasks.map(t => {
                            const crit = getCriticidad(t); 
                            return `
                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition group cursor-pointer" ondblclick="window.editTask(${t.id})">
                                ${tableState.visibleCols.codigo ? `<td data-col="codigo" class="p-3 font-mono text-[10px] text-slate-400 truncate" style="${colStyle('codigo')}">${t.codigo_contenedor || '–'}</td>` : ''}
                                ${tableState.visibleCols.actividad ? `<td data-col="actividad" class="p-3 truncate" style="${colStyle('actividad')}" title="${escapeHtml(t.actividad)}"><div class="font-medium text-slate-900 dark:text-slate-100 text-[12px]">${escapeHtml(t.actividad)}</div>${t.nota ? `<div class="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">${escapeHtml(t.nota)}</div>` : ''}</td>` : ''}
                                ${tableState.visibleCols.grupo ? `<td data-col="grupo" class="p-3 text-slate-500 dark:text-slate-400 text-[11px] truncate" style="${colStyle('grupo')}">${escapeHtml(t.grupo || '-')}</td>` : ''}
                                ${tableState.visibleCols.responsable ? `<td data-col="responsable" class="p-3 text-slate-600 dark:text-slate-300 text-[11px] truncate" style="${colStyle('responsable')}">${escapeHtml(nombreResponsable(t, state.perfilesCache))}</td>` : ''}
                                ${tableState.visibleCols.recursos ? `<td data-col="recursos" class="p-3 truncate" style="${colStyle('recursos')}"><div class="flex -space-x-2">${getRecursosDeTarea(t.id).map(p => `<div class="w-6 h-6 rounded-full ${colorAvatar(p.id)} text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-800" title="${escapeHtml(nombreFormateado(p))}">${getIniciales(nombreFormateado(p)).toUpperCase()}</div>`).join('') || '<span class="text-slate-300 text-[10px] italic">-</span>'}</div></td>` : ''}
                                ${tableState.visibleCols.planos ? `<td data-col="planos" class="p-3 truncate" style="${colStyle('planos')}"><div class="flex flex-wrap gap-1">${(state.actividadPlanosCache||[]).filter(ap => ap.pendiente_id === t.id).map(ap => { const plano = (state.planosCache||[]).find(p => p.id === ap.plano_id); return plano ? `<span class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 rounded text-[10px] font-medium" title="${escapeHtml(plano.titulo)}">${escapeHtml(plano.codigo.split('-').pop())}</span>` : ''; }).join('') || '<span class="text-slate-300 text-[10px]">-</span>'}</div></td>` : ''}
                                ${tableState.visibleCols.importancia ? `<td data-col="importancia" class="p-3 text-slate-600 dark:text-slate-300 text-[11px] truncate" style="${colStyle('importancia')}">${t.importancia || 'Medio'}</td>` : ''}
                                ${tableState.visibleCols.urgencia ? `<td data-col="urgencia" class="p-3 text-slate-600 dark:text-slate-300 text-[11px] truncate" style="${colStyle('urgencia')}">${t.urgencia || 'Medio'}</td>` : ''}
                                ${tableState.visibleCols.criticidad ? `<td data-col="criticidad" class="p-3 font-semibold ${critColor(crit)} truncate" style="${colStyle('criticidad')}">${crit}</td>` : ''}
                                ${tableState.visibleCols.estado ? `<td data-col="estado" class="p-3 truncate" style="${colStyle('estado')}"><div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${estadoColors[t.estado] || 'bg-slate-400'}"></span><span class="text-slate-700 dark:text-slate-300 text-[11px]">${escapeHtml(t.estado)}</span></div></td>` : ''}
                                ${tableState.visibleCols.inicio ? `<td data-col="inicio" class="p-3 text-slate-500 dark:text-slate-400 text-[11px] truncate" style="${colStyle('inicio')}">${t.fecha_inicio_programado ? fmtDate(t.fecha_inicio_programado) : '–'}</td>` : ''}
                                ${tableState.visibleCols.fin ? `<td data-col="fin" class="p-3 text-slate-500 dark:text-slate-400 text-[11px] truncate" style="${colStyle('fin')}">${t.fecha_fin ? fmtDate(t.fecha_fin) : '–'}</td>` : ''}
                                ${tableState.visibleCols.cierre ? `<td data-col="cierre" class="p-3 text-slate-500 dark:text-slate-400 text-[11px] truncate" style="${colStyle('cierre')}">${t.fecha_cierre ? fmtDate(t.fecha_cierre) : '–'}</td>` : ''}
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
                                    return `<td data-col="prop_${pd.id}" class="p-3 text-slate-600 dark:text-slate-400 text-[11px] truncate" style="${colStyle('prop_'+pd.id)}">${displayVal}</td>`;
                                }).join('')}
                                <td data-col="acciones" style="width:100px !important;min-width:100px !important;max-width:100px !important;"
                                    class="p-3 text-center whitespace-nowrap sticky right-0 z-10 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-700/50 border-l border-slate-200 dark:border-slate-700 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                                    <div class="flex items-center justify-center gap-0.5">
                                        ${canEdit(t) ? `<button onclick="event.stopPropagation(); window.editTask(${t.id})" class="p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded transition" title="Editar"><i class="fa-solid fa-pen text-[11px]"></i></button>` : ''}
                                        ${(state.isAdmin || state.isCoordinador || state.isSupervisor) ? `<button onclick="event.stopPropagation(); window.duplicateTask(${t.id})" class="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition" title="Duplicar"><i class="fa-solid fa-copy text-[11px]"></i></button>` : ''}
                                        ${canTransition() ? `<button onclick="event.stopPropagation(); window.openModalCDE(${t.id})" class="p-1.5 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded transition" title="Transición CDE"><i class="fa-solid fa-arrows-rotate text-[11px]"></i></button>` : ''}
                                        ${canDelete() ? `<button onclick="event.stopPropagation(); window.deleteTask(${t.id})" class="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition" title="Eliminar"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
                                    </div>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('tbl-search').addEventListener('input', (e) => { 
        tableState.filters.search = e.target.value; 
        clearTimeout(window.tblSearchTimeout);
        window.tblSearchTimeout = setTimeout(() => {
            window.renderView(); 
            const newInput = document.getElementById('tbl-search');
            if (newInput) { newInput.focus(); const val = newInput.value; newInput.value = ''; newInput.value = val; }
        }, 400); 
    });
}

window.toggleSort = toggleSort; 
window.toggleCol = toggleCol; 
window.toggleProp = toggleProp; 
window.toggleColMenu = toggleColMenu;
window.duplicateTask = duplicateTask;
window.initResize = initResize;

window.toggleFilterDrawer = function() {
    if (!document.getElementById('table-filter-drawer')) {
        const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
        const respOpts = state.perfilesCache
            .filter(esResponsableValido)
            .map(p => ({ id: p.id, name: nombreFormateado(p) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const recursosOpts = state.perfilesCache.filter(p => (p.cargo || '').toLowerCase().includes('modelador') || p.rol === 'operador');
        const estadosOpts = ['No iniciado', 'En proceso', 'En espera', 'Reprogramado', 'Cerrado'];
        const drawerHtml = `
            <div id="table-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.toggleFilterDrawer()"></div>
            <div id="table-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white dark:bg-slate-800 shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <h3 class="font-bold text-sm text-slate-800 dark:text-white">Filtros de Actividades</h3>
                    <button onclick="window.toggleFilterDrawer()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="p-4 space-y-4 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Grupo</label>
                        <select class="inp" onchange="window.applyTableFilter('grupo', this.value)">
                            <option value="">Todos</option>
                            ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${tableState.filters.grupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Responsable</label>
                        <select class="inp" onchange="window.applyTableFilter('responsable', this.value)">
                            <option value="">Todos</option>
                            ${respOpts.map(r => `<option value="${r.id}" ${tableState.filters.responsable === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Recursos</label>
                        <select class="inp" onchange="window.applyTableFilter('recursos', this.value)">
                            <option value="">Todos</option>
                            ${recursosOpts.map(p => `<option value="${p.id}" ${tableState.filters.recursos === p.id ? 'selected' : ''}>${escapeHtml(nombreFormateado(p))}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-2">Ocultar estados</label>
                        <div class="space-y-1.5 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                            ${estadosOpts.map(e => `
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" class="rounded text-red-600" ${tableState.filters.estadosOcultos.includes(e) ? 'checked' : ''} onchange="window.toggleTableEstadoOculto('${e}', this.checked)">
                                    <span class="text-slate-700 dark:text-slate-300">${e}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2">Fecha Inicio Prog.</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="date" class="inp" value="${tableState.filters.iniDesde || ''}" onchange="window.applyTableFilter('iniDesde', this.value)">
                            <input type="date" class="inp" value="${tableState.filters.iniHasta || ''}" onchange="window.applyTableFilter('iniHasta', this.value)">
                        </div>
                    </div>
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2">Fecha Fin Prog.</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="date" class="inp" value="${tableState.filters.finDesde || ''}" onchange="window.applyTableFilter('finDesde', this.value)">
                            <input type="date" class="inp" value="${tableState.filters.finHasta || ''}" onchange="window.applyTableFilter('finHasta', this.value)">
                        </div>
                    </div>
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2">Fecha Cierre Real</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="date" class="inp" value="${tableState.filters.cierreDesde || ''}" onchange="window.applyTableFilter('cierreDesde', this.value)">
                            <input type="date" class="inp" value="${tableState.filters.cierreHasta || ''}" onchange="window.applyTableFilter('cierreHasta', this.value)">
                        </div>
                    </div>
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-2">Semáforo</h4>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="rounded text-sky-600" ${tableState.filters.soloVencidas ? 'checked' : ''} onchange="window.applyTableFilter('soloVencidas', this.checked)"> Solo vencidas</label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="rounded text-sky-600" ${tableState.filters.soloPorVencer ? 'checked' : ''} onchange="window.applyTableFilter('soloPorVencer', this.checked)"> Solo por vencer (≤ 7 días)</label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="rounded text-sky-600" ${tableState.filters.soloSinFecha ? 'checked' : ''} onchange="window.applyTableFilter('soloSinFecha', this.checked)"> Solo sin fecha</label>
                    </div>
                    <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                        <button onclick="window.clearTableFilters()" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"><i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    const drawer = document.getElementById('table-filter-drawer');
    const overlay = document.getElementById('table-filter-drawer-overlay');
    const isOpen = !drawer.classList.contains('translate-x-full');
    if (isOpen) {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    } else {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
    }
};

window.applyTableFilter = function(key, value) {
    tableState.filters[key] = value;
    window.renderView();
};

window.toggleTableEstadoOculto = function(estado, checked) {
    if (checked) {
        if (!tableState.filters.estadosOcultos.includes(estado)) tableState.filters.estadosOcultos.push(estado);
    } else {
        tableState.filters.estadosOcultos = tableState.filters.estadosOcultos.filter(e => e !== estado);
    }
    window.renderView();
};

window.clearTableFilters = function() {
    tableState.filters = {
        search: '', grupo: '', responsable: '', recursos: '',
        estadosOcultos: [],
        iniDesde: '', iniHasta: '', finDesde: '', finHasta: '',
        cierreDesde: '', cierreHasta: '',
        soloVencidas: false, soloPorVencer: false, soloSinFecha: false
    };
    window.renderView();
};

function esResponsableValido(p) {
    if (!p) return false;
    const cargo = (p.cargo || '').toLowerCase();
    return cargo.includes('supervisor') || cargo.includes('coordinador') || cargo.includes('bim manager');
}

// --- FUNCIONES DE LOS MODALES ---

export function openModal() {
    if (!state.isAdmin && !state.isCoordinador && !state.isSupervisor) return;
    document.getElementById('modal-title').innerText = "Nueva Actividad";
    
    ['task-id','task-actividad','task-fecha-inicio','task-fecha-fin','task-fecha-cierre','task-nota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const impEl = document.getElementById('task-importancia'); if (impEl) impEl.value = 'Medio';
    const urgEl = document.getElementById('task-urgencia'); if (urgEl) urgEl.value = 'Medio'; 
    const estEl = document.getElementById('task-estado'); if (estEl) estEl.value = 'No iniciado';
    const subSel = document.getElementById('task-subcontrata'); if (subSel) subSel.value = '';
    
    const grSel = document.getElementById('task-grupo'); 
    if (grSel) grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join('');
    
    const rsSel = document.getElementById('task-responsable'); 
    if (rsSel) {
        const { carga } = calcularCargaModeladores();
        const responsables = state.perfilesCache
            .filter(esResponsableValido)
            .sort((a, b) => nombreFormateado(a).localeCompare(nombreFormateado(b)));
        rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + responsables.map(p => {
            const info = carga[p.id];
            const sem = info ? `${SEMAFORO[info.color].emoji} ` : '';
            const extra = info ? ` — ${textoCargaCorto(info)}` : '';
            return `<option value="${p.id}">${sem}${escapeHtml(nombreFormateado(p))}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}${extra}</option>`;
        }).join('');
    }
    
    const subSelect = document.getElementById('task-subcontrata');
    if (subSelect) {
        subSelect.innerHTML = '<option value="">— Sin subcontrata —</option>' + (state.subcontratasCache || []).map(s => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('');
    }
    
    renderCustomProps(null);
    renderRecursosChips(null);
    renderPlanosChips(null);
    inicializarBuscadorRecursos();
    inicializarBuscadorPlanos();

    const causasContainer = document.getElementById('causas-container');
    if (causasContainer) causasContainer.classList.add('hidden');
    causasSeleccionadas.clear();

    aplicarBloqueoModelador();

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('modal-task').classList.add('flex');
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
    if (grSel) { 
        grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join(''); 
        grSel.value = t.grupo || ''; 
    }
    
    const rsSel = document.getElementById('task-responsable'); 
    if (rsSel) {
        const { carga } = calcularCargaModeladores();
        const responsables = state.perfilesCache
            .filter(esResponsableValido)
            .sort((a, b) => nombreFormateado(a).localeCompare(nombreFormateado(b)));
        rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + responsables.map(p => {
            const info = carga[p.id];
            const sem = info ? `${SEMAFORO[info.color].emoji} ` : '';
            const extra = info ? ` — ${textoCargaCorto(info)}` : '';
            return `<option value="${p.id}">${sem}${escapeHtml(nombreFormateado(p))}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}${extra}</option>`;
        }).join('');
        rsSel.value = t.responsable_id || '';
    }
    
    const subSel = document.getElementById('task-subcontrata');
    if (subSel) {
        subSel.innerHTML = '<option value="">— Sin subcontrata —</option>' + (state.subcontratasCache || []).map(s => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('');
        subSel.value = t.subcontrata || '';
    }
    
    renderCustomProps(t.id);
    renderRecursosChips(t.id);
    renderPlanosChips(t.id);
    inicializarBuscadorRecursos();
    inicializarBuscadorPlanos();

    const estaRetrasada = t.fecha_cierre && t.fecha_fin && t.fecha_cierre > t.fecha_fin;
    const causasContainer = document.getElementById('causas-container');
    if (causasContainer) causasContainer.classList.toggle('hidden', !estaRetrasada);

    if (estaRetrasada) {
        renderCausasChips(t.id);
    } else {
        causasSeleccionadas.clear();
        actualizarCausasUI();
    }

    inicializarBuscadorCausas();

    aplicarBloqueoModelador();

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('modal-task').classList.add('flex');
}

export function duplicateTask(id) {
    const t = state.tasksCache.find(x => x.id === id);
    if (!t) return;
    if (!state.isAdmin && !state.isCoordinador && !state.isSupervisor) {
        toast('Solo admin, coordinador o supervisor pueden duplicar actividades.');
        return;
    }

    document.getElementById('modal-title').innerText = "Duplicar Actividad";
    document.getElementById('task-id').value = '';
    document.getElementById('task-actividad').value = `${t.actividad} (copia)`;

    const impEl = document.getElementById('task-importancia');
    if (impEl) impEl.value = t.importancia || 'Medio';
    const urgEl = document.getElementById('task-urgencia');
    if (urgEl) urgEl.value = t.urgencia || 'Medio';
    const iniEl = document.getElementById('task-fecha-inicio');
    if (iniEl) iniEl.value = t.fecha_inicio_programado || '';

    document.getElementById('task-estado').value = 'No iniciado';
    document.getElementById('task-fecha-fin').value = t.fecha_fin || '';
    document.getElementById('task-fecha-cierre').value = '';
    document.getElementById('task-nota').value = t.nota || '';

    const grSel = document.getElementById('task-grupo');
    if (grSel) {
        grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g => g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join('');
        grSel.value = t.grupo || '';
    }

    const rsSel = document.getElementById('task-responsable');
    if (rsSel) {
        const { carga } = calcularCargaModeladores();
        const responsables = state.perfilesCache
            .filter(esResponsableValido)
            .sort((a, b) => nombreFormateado(a).localeCompare(nombreFormateado(b)));
        rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + responsables.map(p => {
            const info = carga[p.id];
            const sem = info ? `${SEMAFORO[info.color].emoji} ` : '';
            const extra = info ? ` — ${textoCargaCorto(info)}` : '';
            return `<option value="${p.id}">${sem}${escapeHtml(nombreFormateado(p))}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}${extra}</option>`;
        }).join('');
        rsSel.value = t.responsable_id || '';
    }

    const subSel = document.getElementById('task-subcontrata');
    if (subSel) {
        subSel.innerHTML = '<option value="">— Sin subcontrata —</option>' + (state.subcontratasCache || []).map(s => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('');
        subSel.value = t.subcontrata || '';
    }

    renderCustomProps(null);

    recursosSeleccionados.clear();
    (state.actividadRecursosCache || []).filter(r => r.pendiente_id === t.id).forEach(r => recursosSeleccionados.add(r.usuario_id));
    actualizarChipsUI();

    planosSeleccionados.clear();
    (state.actividadPlanosCache || []).filter(ap => Number(ap.pendiente_id) === Number(t.id)).forEach(ap => planosSeleccionados.add(Number(ap.plano_id)));
    actualizarPlanosUI();

    causasSeleccionadas.clear();
    actualizarCausasUI();

    inicializarBuscadorRecursos();
    inicializarBuscadorPlanos();
    inicializarBuscadorCausas();

    const causasContainer = document.getElementById('causas-container');
    if (causasContainer) causasContainer.classList.add('hidden');

    aplicarBloqueoModelador();

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('modal-task').classList.add('flex');
}

function aplicarBloqueoModelador() {
    const soloModelador = state.isModelador && !state.isAdmin && !state.isCoordinador && !state.isSupervisor;

    const camposBloqueados = [
        'task-actividad', 'task-grupo', 'task-responsable',
        'task-importancia', 'task-urgencia', 'task-estado',
        'task-fecha-inicio', 'task-fecha-fin'
    ];
    camposBloqueados.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = soloModelador;
        el.classList.toggle('opacity-60', soloModelador);
        el.classList.toggle('cursor-not-allowed', soloModelador);
    });

    const recursosSearch = document.getElementById('recursos-search');
    if (recursosSearch) {
        recursosSearch.disabled = soloModelador;
        recursosSearch.classList.toggle('opacity-60', soloModelador);
    }
    document.querySelectorAll('#recursos-chips button').forEach(b => {
        b.style.display = soloModelador ? 'none' : '';
    });

    document.querySelectorAll('.custom-prop-input').forEach(el => {
        el.disabled = soloModelador;
        el.classList.toggle('opacity-60', soloModelador);
    });

    ['task-fecha-cierre', 'task-nota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
    const planosSearch = document.getElementById('planos-search');
    if (planosSearch) planosSearch.disabled = false;
    document.querySelectorAll('#planos-chips button').forEach(b => {
        b.style.display = '';
    });

    const causasSearch = document.getElementById('causas-search');
    if (causasSearch) causasSearch.disabled = false;
    document.querySelectorAll('#causas-chips button').forEach(b => {
        b.style.display = '';
    });
}

function renderCustomProps(pendienteId) {
    const container = document.getElementById('custom-props-container');
    const inputs = document.getElementById('custom-props-inputs');
    
    const otrosProps = state.propDefsCache.filter(pd => pd.tipo !== 'planos');
    
    if (otrosProps.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    inputs.innerHTML = otrosProps.map(pd => {
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
        return `<div class="mb-2"><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">${escapeHtml(pd.nombre)}</label>${inputHtml}</div>`;
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
    
    const estado = document.getElementById('task-estado').value;
    const fechaCierre = document.getElementById('task-fecha-cierre').value;
    const fechaFinProgramada = document.getElementById('task-fecha-fin').value;

    if (estado === 'Cerrado' && !fechaCierre) {
        toast('No puedes cerrar la actividad sin una Fecha de Cierre Real.');
        document.getElementById('task-fecha-cierre').focus();
        return;
    }

    const esCierreTardio = fechaCierre && fechaFinProgramada && fechaCierre > fechaFinProgramada;
    if (esCierreTardio && causasSeleccionadas.size === 0) {
        toast('El cierre es posterior al Fin Prog. Debes registrar al menos 1 causa de incumplimiento.');
        const causasContainer = document.getElementById('causas-container');
        if (causasContainer) {
            causasContainer.classList.remove('hidden');
            causasContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const causasSearch = document.getElementById('causas-search');
        if (causasSearch) setTimeout(() => causasSearch.focus(), 300);
        return;
    }

    const soloModelador = state.isModelador && !state.isAdmin && !state.isCoordinador && !state.isSupervisor;

    let payload;
    if (soloModelador && id) {
        payload = {
            fecha_cierre: fechaCierre || null,
            nota: document.getElementById('task-nota').value
        };
    } else {
        payload = {
            actividad: document.getElementById('task-actividad').value,
            grupo: document.getElementById('task-grupo').value || null,
            responsable: respPerfil ? (respPerfil.cargo || respPerfil.email) : null,
            responsable_id: respId,
            importancia: document.getElementById('task-importancia').value,
            urgencia: document.getElementById('task-urgencia').value,
            estado: estado,
            fecha_inicio_programado: document.getElementById('task-fecha-inicio').value || null,
            fecha_fin: fechaFinProgramada || null,
            fecha_cierre: fechaCierre || null,
            nota: document.getElementById('task-nota').value,
            subcontrata: document.getElementById('task-subcontrata')?.value || null
        };
    }
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

    await supabaseClient.from('actividad_recursos').delete().eq('pendiente_id', parseInt(taskId));
    if (recursosSeleccionados.size > 0) {
        const recursosData = Array.from(recursosSeleccionados).map(uid => ({ pendiente_id: parseInt(taskId), usuario_id: uid }));
        await supabaseClient.from('actividad_recursos').insert(recursosData);
    }

    await supabaseClient.from('actividad_planos').delete().eq('pendiente_id', parseInt(taskId));
    if (planosSeleccionados.size > 0) {
        const planosData = Array.from(planosSeleccionados).map(pid => ({ pendiente_id: parseInt(taskId), plano_id: pid }));
        const { error: errPlanos } = await supabaseClient.from('actividad_planos').insert(planosData);
        if (errPlanos) { toast('Error al guardar planos: ' + errPlanos.message); }
    }

    await supabaseClient.from('tarea_causas').delete().eq('pendiente_id', parseInt(taskId));
    if (causasSeleccionadas.size > 0) {
        const causasData = Array.from(causasSeleccionadas).map(cid => ({ pendiente_id: parseInt(taskId), causa_id: cid }));
        const { error: errCausas } = await supabaseClient.from('tarea_causas').insert(causasData);
        if (errCausas) { toast('Error al guardar causas: ' + errCausas.message); }
    }

    closeModal(); await fetchAll(); window.renderView(); toast('Guardado');
}

export async function deleteTask(id) {
    if (!canDelete()) return;
    const t = state.tasksCache.find(x => x.id === id);
    const nombre = t ? t.actividad : 'esta actividad';
    
    const confirmado = await confirmDelete({
        title: 'Eliminar actividad',
        message: `Vas a eliminar la actividad "${nombre}". Se borrarán también sus propiedades, recursos y planos. Esta acción no se puede deshacer.`
    });
    if (!confirmado) return;
    
    const { error } = await supabaseClient.from('pendientes_bim').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); window.renderView(); toast('Actividad eliminada');
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
