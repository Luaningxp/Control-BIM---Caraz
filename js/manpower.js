import { supabaseClient, state, fetchAll } from './db.js';
import { 
    escapeHtml, fmtDate, semaforo, today, toast, nombreFormateado, 
    getIniciales, colorAvatar, confirmDelete, nombreResponsable
} from './utils.js';
import { esDiaLaborable, tipoDia } from './roster.js';

// Conversión: 100% equivale a 9.3333 horas hombre
const HORAS_POR_100 = 9.3333;
function pctAHoras(pct) {
    return (parseFloat(pct || 0) * HORAS_POR_100) / 100;
}

// Filtros del listado
let manpowerState = {
    search: '',
    filterResp: '',
    filterGrupo: '',
    iniDesde: '',
    iniHasta: '',
    soloRegistradosPorMi: true
};

function isUserInvolved(t) {
    const esResponsable = t.responsable_id === state.currentUser.id;
    const esRecurso = state.actividadRecursosCache.some(
        r => r.pendiente_id === t.id && r.usuario_id === state.currentUser.id
    );
    return esResponsable || esRecurso;
}

// ============================================================
// MI TRABAJO
// ============================================================
export function renderMiTrabajo(container) {
    const misTareas = state.tasksCache.filter(t => 
        t.estado !== 'Cerrado' && 
        t.estado_cde !== 'Archived' && 
        isUserInvolved(t)
    );
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    while (ayer.getDay() === 0) { ayer.setDate(ayer.getDate() - 1); }
    
    const ayerStr = ayer.toISOString().split('T')[0];
    const registrosAyer = state.manpowerCache.filter(m => 
        m.usuario_id === state.currentUser.id && 
        m.fecha === ayerStr
    );
    const porcentajeAyer = registrosAyer.reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
        const ayerEraLaborable = esDiaLaborable(state.currentUser.id, ayerStr);
    const esModeladorPuro = state.isModelador && !state.isAdmin && !state.isCoordinador && !state.isSupervisor;
    const noLlenoAyer = esModeladorPuro && porcentajeAyer < 100;

    container.innerHTML = `
        ${noLlenoAyer ? `
            <div class="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-r-lg">
                <div class="flex items-start gap-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-600 text-lg mt-0.5"></i>
                    <div>
                        <p class="font-bold text-amber-900 text-sm">Aviso de registro pendiente</p>
                        <p class="text-amber-800 text-xs mt-0.5">No completaste tu <b>100%</b> el día <b>${fmtDate(ayerStr)}</b> (registraste ${porcentajeAyer.toFixed(1)}% = ${pctAHoras(porcentajeAyer).toFixed(2)} h). <a href="javascript:void(0)" onclick="window.openManpowerModal(null, '${ayerStr}')" class="underline font-semibold">Registrar ahora</a>.</p>
                    </div>
                </div>
            </div>
        ` : ''}

        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Mi Trabajo Pendiente</h3>
                <p class="text-[11px] text-slate-500">Registra tu % del día para cada actividad.</p>
            </div>
            <button onclick="window.openManpowerModal()" class="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-700"><i class="fa-solid fa-plus mr-1"></i> Registrar % del Día</button>
        </div>
        <div class="grid gap-3">
            ${misTareas.length === 0 ? '<div class="card p-6 text-center text-slate-500 text-sm">No tienes actividades pendientes.</div>' : ''}
            ${misTareas.map(t => {
                const equipo = state.actividadRecursosCache.filter(r => r.pendiente_id === t.id);
                const totalUsuarioTarea = state.manpowerCache
                    .filter(m => m.usuario_id === state.currentUser.id && m.pendiente_id === t.id)
                    .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);

                return `
                <div class="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${t.codigo_contenedor || '–'}</span>
                            <span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">${semaforo(t)}</span>
                            ${totalUsuarioTarea > 0 ? `<span class="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold">Acumulado: ${totalUsuarioTarea.toFixed(1)}% · ${pctAHoras(totalUsuarioTarea).toFixed(2)} h</span>` : ''}
                        </div>
                        <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(t.actividad)}</h4>
                        <p class="text-xs text-slate-500 mt-1">${escapeHtml(t.grupo || '-')} · Vence: ${fmtDate(t.fecha_fin)}</p>
                        <div class="flex items-center gap-1 mt-2">
                            <span class="text-[10px] text-slate-400 mr-1">Equipo:</span>
                            ${equipo.map(r => {
                                const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                                if (!p) return '';
                                return `<div class="w-5 h-5 rounded-full ${colorAvatar(p.id)} text-white text-[8px] font-bold flex items-center justify-center ring-1 ring-white" title="${escapeHtml(nombreFormateado(p))}">${getIniciales(nombreFormateado(p)).toUpperCase()}</div>`;
                            }).join('') || '<span class="text-[10px] text-slate-300 italic">Sin recursos</span>'}
                        </div>
                    </div>
                    <div class="text-right flex md:flex-col gap-2">
                        <button onclick="window.openManpowerModal(${t.id})" class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700 whitespace-nowrap">＋ Registrar %</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================================
// MANPOWER (listado con filtros + conversión a horas)
// ============================================================
export function renderManpower(container) {
    // Base: registros visibles según rol
    let registros = state.manpowerCache.filter(m => 
        state.isAdmin || state.isCoordinador || state.isSupervisor || m.usuario_id === state.currentUser.id
    );
        if (manpowerState.soloRegistradosPorMi) {
        registros = registros.filter(m => m.usuario_id === state.currentUser?.id);
    }

            // Aplicar filtros
    registros = registros.filter(r => {
        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
        const nombre = p ? nombreFormateado(p) : 'Desconocido';
        const grupo = t ? (t.grupo || '') : '';
        const actividad = t ? t.actividad : 'General';

        const q = (manpowerState.search || '').toLowerCase().trim();

        // La búsqueda se limita al Nombre del Usuario y a la Actividad
        const matchSearch = !q || 
            nombre.toLowerCase().includes(q) ||
            actividad.toLowerCase().includes(q);

        const matchResp = !manpowerState.filterResp || r.usuario_id === manpowerState.filterResp;
        const matchGrupo = !manpowerState.filterGrupo || grupo === manpowerState.filterGrupo;
        const matchIni = !manpowerState.iniDesde || (r.fecha && r.fecha >= manpowerState.iniDesde);
        const matchFin = !manpowerState.iniHasta || (r.fecha && r.fecha <= manpowerState.iniHasta);

        return matchSearch && matchResp && matchGrupo && matchIni && matchFin;
    });

    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreFormateado(p) }));

        const filtrosActivos = Object.entries(manpowerState).filter(([k, v]) => {
        // "Registrados por mí" SÍ cuenta como filtro activo
        if (k === 'soloRegistradosPorMi') return v === true;
        
        // El buscador de texto NO cuenta
        if (k === 'search') return false;
        
        // El resto (fechas, grupo, responsable) cuentan si tienen valor
        return v !== '' && v !== false && v !== null;
    }).length;
    const totalHoras = registros.reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                        <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs"></i>
                                       <input type="text" id="mp-search" placeholder="Buscar usuario o actividad..." value="${manpowerState.search}" 
                           class="w-full border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50 transition">
                </div>
                <button onclick="window.toggleManpowerFilterDrawer()" class="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <i class="fa-solid fa-filter"></i> Filtros
                    ${filtrosActivos > 0 ? `<span class="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">${filtrosActivos}</span>` : ''}
                </button>
                <button onclick="window.toggleManpowerSoloMios()" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${manpowerState.soloRegistradosPorMi ? 'bg-sky-600 text-white' : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}">
                    <i class="fa-solid fa-user-check"></i> Registrados por mí
                </button>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right hidden md:block">
                    <p class="text-[10px] text-slate-500 uppercase font-bold">Total Horas</p>
                    <p class="text-lg font-bold text-sky-700">${totalHoras.toFixed(2)} h</p>
                </div>
                <button onclick="window.openManpowerModal()" class="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-700">+ Registrar %</button>
            </div>
        </div>

        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Fecha</th>
                        <th class="p-3">Usuario</th>
                        <th class="p-3">Actividad</th>
                        <th class="p-3">% Día</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">Nota</th>
                        ${state.isAdmin ? '<th class="p-3 text-center">Acciones</th>' : ''}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${registros.map(r => {
                        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
                        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                        const nombre = p ? nombreFormateado(p) : 'Desconocido';
                        const pct = parseFloat(r.porcentaje_dia || 0);
                        const horas = pctAHoras(pct);
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-600">${fmtDate(r.fecha)}</td>
                            <td class="p-3 font-semibold text-slate-700">${escapeHtml(nombre)}</td>
                            <td class="p-3 text-slate-700">${escapeHtml(t ? t.actividad : 'General')}</td>
                            <td class="p-3 text-slate-500">${pct.toFixed(1)}%</td>
                            <td class="p-3 font-bold text-sky-600">${horas.toFixed(2)} h</td>
                            <td class="p-3 text-slate-500 italic">${escapeHtml(r.descripcion || '')}</td>
                            ${state.isAdmin ? `
                                <td class="p-3 text-center whitespace-nowrap">
                                    <button onclick="window.deleteManpower(${r.id})" class="text-red-500 hover:text-red-700" title="Eliminar registro">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            ` : ''}
                        </tr>`;
                    }).join('') || `<tr><td colspan="${state.isAdmin ? 7 : 6}" class="text-center py-6 text-slate-400">No hay registros con los filtros actuales.</td></tr>`}
                </tbody>
                ${registros.length > 0 ? `
                    <tfoot class="bg-slate-50 border-t-2 border-slate-200">
                        <tr>
                            <td colspan="4" class="p-3 text-right font-bold text-slate-700 uppercase text-[10px] tracking-wider">Total del periodo filtrado:</td>
                            <td class="p-3 font-bold text-sky-700 text-sm">${totalHoras.toFixed(2)} h</td>
                            <td colspan="${state.isAdmin ? 2 : 1}" class="p-3"></td>
                        </tr>
                    </tfoot>
                ` : ''}
            </table>
        </div>
    `;

    // Drawer de filtros
    if (!document.getElementById('manpower-filter-drawer')) {
        const drawerHtml = `
            <div id="manpower-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.toggleManpowerFilterDrawer()"></div>
            <div id="manpower-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-sm text-slate-800">Filtros MANPOWER</h3>
                    <button onclick="window.toggleManpowerFilterDrawer()" class="text-slate-400 hover:text-slate-700">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <div class="p-4 space-y-4 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Usuario</label>
                        <select id="mp-drawer-resp" class="inp" onchange="window.applyManpowerFilter('filterResp', this.value)">
                            <option value="">Todos</option>
                            ${respOpts.map(r => `<option value="${r.id}" ${manpowerState.filterResp === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Grupo</label>
                        <select id="mp-drawer-grupo" class="inp" onchange="window.applyManpowerFilter('filterGrupo', this.value)">
                            <option value="">Todos</option>
                            ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${manpowerState.filterGrupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                        </select>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <h4 class="font-bold text-slate-700 mb-2">Rango de fechas</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Desde</label>
                                <input type="date" id="mp-drawer-ini" class="inp" value="${manpowerState.iniDesde || ''}" onchange="window.applyManpowerFilter('iniDesde', this.value)">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Hasta</label>
                                <input type="date" id="mp-drawer-fin" class="inp" value="${manpowerState.iniHasta || ''}" onchange="window.applyManpowerFilter('iniHasta', this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <button onclick="window.clearManpowerFilters()" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                            <i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    const mpSearch = document.getElementById('mp-search');
    if (mpSearch) {
        mpSearch.addEventListener('input', (e) => {
            manpowerState.search = e.target.value;
            clearTimeout(window.mpSearchTimeout);
            window.mpSearchTimeout = setTimeout(() => {
                window.renderView();
                const newInput = document.getElementById('mp-search');
                if (newInput) {
                    newInput.focus();
                    const val = newInput.value;
                    newInput.value = '';
                    newInput.value = val;
                }
            }, 500);
        });
    }
}

// ============================================================
// MODAL REGISTRAR HORAS
// ============================================================
export function openManpowerModal(pendienteId, fechaPredefinida) {
    if (!document.getElementById('modal-manpower')) {
        const modalHtml = `
            <div id="modal-manpower" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
                <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                    <h3 class="font-bold text-sm text-slate-800">Registrar % del Día</h3>
                    <p id="mp-restante-info" class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded"></p>
                    <form onsubmit="window.saveManpower(event)" class="space-y-3 text-xs">
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">Actividad</label>
                            <select id="mp-actividad" class="inp">
                                <option value="">— General —</option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block font-semibold text-slate-600 mb-1">Fecha</label>
                                <input type="date" id="mp-fecha" required class="inp" onchange="window.actualizarRestanteManpower()">
                            </div>
                            <div>
                                <label class="block font-semibold text-slate-600 mb-1">% del Día</label>
                                <input type="number" step="1" min="1" max="100" id="mp-porcentaje" required class="inp" placeholder="Ej. 25" oninput="window.actualizarHorasManpower()">
                                <p id="mp-horas-equivalentes" class="text-[10px] text-slate-500 mt-1">= 0.00 h</p>
                            </div>
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">Nota (opcional)</label>
                            <textarea id="mp-desc" rows="2" class="inp" placeholder="¿Qué hiciste?"></textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onclick="window.closeManpowerModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                            <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const tareasDisponibles = state.tasksCache.filter(t => {
        if (t.estado === 'Cerrado') return false;
        if (state.isAdmin || state.isCoordinador) return true;
        return isUserInvolved(t);
    });

    const select = document.getElementById('mp-actividad');
    select.innerHTML = '<option value="">— General —</option>' + 
        tareasDisponibles.map(t => `<option value="${t.id}">${escapeHtml(t.codigo_contenedor || '')} - ${escapeHtml(t.actividad.substring(0,50))}...</option>`).join('');

    select.value = pendienteId || '';
    document.getElementById('mp-fecha').value = fechaPredefinida || today().toISOString().slice(0,10);
    document.getElementById('mp-porcentaje').value = '';
    
    window.actualizarRestanteManpower();
    window.actualizarHorasManpower();
    
    document.getElementById('modal-manpower').classList.remove('hidden');
    document.getElementById('modal-manpower').classList.add('flex');
}

window.actualizarRestanteManpower = function() {
    const fecha = document.getElementById('mp-fecha').value;
    if (!fecha) return;
    
    const totalDia = state.manpowerCache
        .filter(m => m.usuario_id === state.currentUser.id && m.fecha === fecha)
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    
    const restante = Math.max(0, 100 - totalDia);
    const info = document.getElementById('mp-restante-info');
    if (restante === 0) {
        info.innerHTML = `<b class="text-red-600">Ya registraste el 100% de este día.</b> No puedes agregar más.`;
    } else {
        info.innerHTML = `Tienes <b class="text-sky-700">${restante.toFixed(0)}%</b> disponible (${pctAHoras(restante).toFixed(2)} h) — ya usaste ${totalDia.toFixed(0)}% (${pctAHoras(totalDia).toFixed(2)} h).`;
    }
};

window.actualizarHorasManpower = function() {
    const pct = parseFloat(document.getElementById('mp-porcentaje')?.value || 0);
    const horas = pctAHoras(pct);
    const el = document.getElementById('mp-horas-equivalentes');
    if (el) el.textContent = `= ${horas.toFixed(2)} h`;
};

export function closeManpowerModal() {
    document.getElementById('modal-manpower').classList.add('hidden');
    document.getElementById('modal-manpower').classList.remove('flex');
}

export async function saveManpower(e) {
    e.preventDefault();
    const fecha = document.getElementById('mp-fecha').value;
    const porcentaje = parseFloat(document.getElementById('mp-porcentaje').value);

    if (!esDiaLaborable(state.currentUser.id, fecha)) {
        const tipo = tipoDia(state.currentUser.id, fecha);
        const etiquetas = { DO: 'domingo no laborable', DE: 'descanso', FE: 'feriado' };
        toast(`No puedes registrar en un día no laborable (${etiquetas[tipo] || tipo}).`);
        return;
    }
    
    const totalDia = state.manpowerCache
        .filter(m => m.usuario_id === state.currentUser.id && m.fecha === fecha)
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    
    if (totalDia + porcentaje > 100) {
        toast(`No puedes exceder 100%. Ya tienes ${totalDia.toFixed(0)}% (${pctAHoras(totalDia).toFixed(2)} h) registrado.`);
        return;
    }
    
    const payload = {
        pendiente_id: document.getElementById('mp-actividad').value || null,
        usuario_id: state.currentUser.id,
        fecha: fecha,
        porcentaje_dia: porcentaje,
        descripcion: document.getElementById('mp-desc').value
    };
    const { error } = await supabaseClient.from('manpower_registros').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    closeManpowerModal();
    await fetchAll(); window.renderView();
    toast(`Registro guardado: ${porcentaje}% = ${pctAHoras(porcentaje).toFixed(2)} h`);
}

// ============================================================
// ELIMINAR REGISTRO (solo admin)
// ============================================================
window.deleteManpower = async function(id) {
    if (!state.isAdmin) { toast('Solo los administradores pueden eliminar registros.'); return; }
    
    const r = state.manpowerCache.find(x => x.id === id);
    if (!r) return;
    
    const p = state.perfilesCache.find(x => x.id === r.usuario_id);
    const t = state.tasksCache.find(x => x.id === r.pendiente_id);
    const nombreUsuario = p ? nombreFormateado(p) : 'Desconocido';
    const nombreActividad = t ? t.actividad : 'General';
    const pct = parseFloat(r.porcentaje_dia || 0);
    const horas = pctAHoras(pct);
    
    const confirmado = await confirmDelete({
        title: 'Eliminar registro',
        message: `Vas a eliminar el registro de "${nombreUsuario}" del ${fmtDate(r.fecha)} (${pct.toFixed(1)}% = ${horas.toFixed(2)} h en "${nombreActividad}"). Esta acción no se puede deshacer.`
    });
    
    if (!confirmado) return;
    
    const { error } = await supabaseClient.from('manpower_registros').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    
    toast('Registro eliminado');
    await fetchAll();
    window.renderView();
};

// ============================================================
// FILTROS DEL DRAWER
// ============================================================
window.toggleManpowerFilterDrawer = function() {
    const drawer = document.getElementById('manpower-filter-drawer');
    const overlay = document.getElementById('manpower-filter-drawer-overlay');
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

window.applyManpowerFilter = function(key, value) {
    manpowerState[key] = value;
    window.renderView();
};

window.clearManpowerFilters = function() {
    manpowerState = { 
        search: '', 
        filterResp: '', 
        filterGrupo: '', 
        iniDesde: '', 
        iniHasta: '',
        soloRegistradosPorMi: true
    };

    // ▼ Añadir esta línea ▼
    const drawer = document.getElementById('manpower-filter-drawer');
    if (drawer) drawer.remove();
    const overlay = document.getElementById('manpower-filter-drawer-overlay');
    if (overlay) overlay.remove();
    // ▲ Añadir esta línea ▲

    window.renderView();
};

window.toggleManpowerSoloMios = function() {
    manpowerState.soloRegistradosPorMi = !manpowerState.soloRegistradosPorMi;
    window.renderView();
};
