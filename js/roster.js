import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, nombreFormateado, getIniciales, colorAvatar, toast, confirmDelete } from './utils.js';

const DIAS_SEMANA = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

let rosterState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
};

function isoDate(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function estaEnDescanso(usuarioId, fechaStr) {
    return (state.descansosCache || []).some(d => 
        d.usuario_id === usuarioId && fechaStr >= d.fecha_inicio && fechaStr <= d.fecha_fin
    );
}

function esFeriado(fechaStr) {
    return (state.feriadosCache || []).some(f => f.fecha === fechaStr);
}

function esTrabajoExtra(usuarioId, fechaStr) {
    return (state.trabajosExtraCache || []).some(t => t.usuario_id === usuarioId && t.fecha === fechaStr);
}

function clasificarDia(usuarioId, fechaStr) {
    const fecha = new Date(fechaStr + 'T00:00:00');
    const esDomingo = fecha.getDay() === 0;

    if (esTrabajoExtra(usuarioId, fechaStr)) return 'TE';
    if (estaEnDescanso(usuarioId, fechaStr)) return 'DE';
    if (esFeriado(fechaStr)) return 'FE';
    if (esDomingo) return 'DO';
    return 'T';
}

const ESTILO_DIA = {
    T:  { letra: 'T',  clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', label: 'Laborable' },
    TE: { letra: 'TE', clase: 'bg-teal-500 text-white', label: 'Trabajo extra' },
    DO: { letra: 'DO', clase: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400', label: 'Domingo no laborable' },
    DE: { letra: 'DE', clase: 'bg-red-500 text-white', label: 'Descanso' },
    FE: { letra: 'FE', clase: 'bg-amber-400 text-amber-900', label: 'Feriado' }
};

export function renderRoster(container) {
    const { year, month } = rosterState;
    const diasDelMes = new Date(year, month + 1, 0).getDate();
    const usuarios = [...state.perfilesCache].sort((a, b) => a.email.localeCompare(b.email));
    const esAdmin = state.isAdmin;

    const fechas = [];
    for (let d = 1; d <= diasDelMes; d++) fechas.push(isoDate(year, month, d));

    const resumen = {};
    usuarios.forEach(u => {
        resumen[u.id] = { T: 0, TE: 0, DO: 0, DE: 0, FE: 0 };
    });
    usuarios.forEach(u => {
        fechas.forEach(f => {
            resumen[u.id][clasificarDia(u.id, f)]++;
        });
    });

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800 dark:text-white">Roster · ${MESES[month]} ${year}</h3>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Régimen lunes a sábado. Mano de obra solo en T y TE.</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window.rosterPrevMonth()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"><i class="fa-solid fa-chevron-left"></i></button>
                <button onclick="window.rosterToday()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Hoy</button>
                <button onclick="window.rosterNextMonth()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"><i class="fa-solid fa-chevron-right"></i></button>
                ${esAdmin ? `
                    <button onclick="window.openDescansoModal()" class="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"><i class="fa-solid fa-umbrella-beach mr-1"></i> Descanso</button>
                    <button onclick="window.openFeriadoModal()" class="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600"><i class="fa-solid fa-star mr-1"></i> Feriado</button>
                    <button onclick="window.openTrabajoExtraModal()" class="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700"><i class="fa-solid fa-briefcase mr-1"></i> Trabajo extra</button>
                ` : ''}
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 text-[11px] mb-3">
            <span class="font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Leyenda:</span>
            ${Object.entries(ESTILO_DIA).map(([k, v]) => `<span class="inline-flex items-center gap-1"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${v.clase}">${v.letra}</span>${v.label}</span>`).join('')}
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-4">
            <div class="overflow-x-auto">
                <table class="text-left text-xs" style="table-layout: fixed;">
                    <thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                        <tr>
                            <th class="p-2 sticky left-0 bg-slate-100 dark:bg-slate-900 z-10" style="width: 200px; min-width: 200px;">Usuario</th>
                            ${fechas.map((f, i) => {
                                const d = new Date(f + 'T00:00:00');
                                const esDom = d.getDay() === 0;
                                return `<th class="p-1 text-center ${esDom ? 'bg-slate-200 dark:bg-slate-800' : ''}" style="width: 34px; min-width: 34px;">
                                    <div class="text-[9px] leading-tight">${DIAS_SEMANA[d.getDay()]}</div>
                                    <div class="text-[10px] font-bold">${i + 1}</div>
                                </th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${usuarios.map(u => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td class="p-2 sticky left-0 bg-white dark:bg-slate-800 z-10">
                                    <div class="flex items-center gap-2">
                                        <div class="w-6 h-6 rounded-full ${colorAvatar(u.id)} text-white text-[9px] font-bold flex items-center justify-center">${getIniciales(nombreFormateado(u)).toUpperCase()}</div>
                                        <div class="min-w-0">
                                            <div class="font-semibold text-[11px] text-slate-800 dark:text-slate-200 truncate">${escapeHtml(nombreFormateado(u))}</div>
                                            <div class="text-[9px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(u.cargo || 'Sin cargo')}</div>
                                        </div>
                                    </div>
                                </td>
                                ${fechas.map(f => {
                                    const tipo = clasificarDia(u.id, f);
                                    const est = ESTILO_DIA[tipo];
                                    let titulo = est.label;
                                    if (tipo === 'DE') {
                                        const d = (state.descansosCache || []).find(x => x.usuario_id === u.id && f >= x.fecha_inicio && f <= x.fecha_fin);
                                        if (d) titulo += ` · ${d.motivo || 'sin motivo'} (${d.fecha_inicio} → ${d.fecha_fin})`;
                                    } else if (tipo === 'FE') {
                                        const fer = (state.feriadosCache || []).find(x => x.fecha === f);
                                        if (fer) titulo += ` · ${fer.nombre}`;
                                    } else if (tipo === 'TE') {
                                        const te = (state.trabajosExtraCache || []).find(x => x.usuario_id === u.id && x.fecha === f);
                                        if (te) titulo += ` · ${te.motivo || 'sin motivo'}`;
                                    }
                                    const clickHandler = esAdmin ? `onclick="window.rosterCellClick('${u.id}', '${f}', '${tipo}')"` : '';
                                    return `<td class="p-0.5 text-center" style="width: 34px; min-width: 34px;" ${clickHandler}>
                                        <div class="w-full py-1 rounded text-[10px] font-bold ${est.clase} ${esAdmin ? 'cursor-pointer hover:opacity-80' : ''}" title="${escapeHtml(titulo)}">${est.letra}</div>
                                    </td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div class="p-4 pb-2">
                <h4 class="font-semibold text-sm text-slate-800 dark:text-white">Resumen del mes · ${MESES[month]} ${year}</h4>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Días por tipo y total laborables del mes.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                        <tr>
                            <th class="p-3">Usuario</th>
                            <th class="p-3 text-center">T</th>
                            <th class="p-3 text-center">TE</th>
                            <th class="p-3 text-center">DO</th>
                            <th class="p-3 text-center">DE</th>
                            <th class="p-3 text-center">FE</th>
                            <th class="p-3 text-center">Laborables</th>
                            <th class="p-3 text-center">No laborables</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${usuarios.map(u => {
                            const r = resumen[u.id];
                            const laborables = r.T + r.TE;
                            const noLaborables = r.DO + r.DE + r.FE;
                            return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td class="p-3 font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(nombreFormateado(u))}</td>
                                <td class="p-3 text-center text-emerald-700 dark:text-emerald-400 font-bold">${r.T}</td>
                                <td class="p-3 text-center text-teal-700 dark:text-teal-400 font-bold">${r.TE}</td>
                                <td class="p-3 text-center text-slate-500">${r.DO}</td>
                                <td class="p-3 text-center text-red-600 dark:text-red-400 font-bold">${r.DE}</td>
                                <td class="p-3 text-center text-amber-600 dark:text-amber-400 font-bold">${r.FE}</td>
                                <td class="p-3 text-center font-bold text-sky-700 dark:text-sky-400">${laborables}</td>
                                <td class="p-3 text-center font-bold text-slate-500">${noLaborables}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.rosterPrevMonth = function() {
    if (rosterState.month === 0) { rosterState.month = 11; rosterState.year--; }
    else rosterState.month--;
    window.renderView();
};
window.rosterNextMonth = function() {
    if (rosterState.month === 11) { rosterState.month = 0; rosterState.year++; }
    else rosterState.month++;
    window.renderView();
};
window.rosterToday = function() {
    const h = new Date();
    rosterState.year = h.getFullYear();
    rosterState.month = h.getMonth();
    window.renderView();
};

window.rosterCellClick = function(usuarioId, fecha, tipo) {
    if (!state.isAdmin) return;
    if (tipo === 'DE') {
        const d = (state.descansosCache || []).find(x => x.usuario_id === usuarioId && fecha >= x.fecha_inicio && fecha <= x.fecha_fin);
        if (d) { window.openDescansoModal(d.id); return; }
    }
    if (tipo === 'FE') {
        const f = (state.feriadosCache || []).find(x => x.fecha === fecha);
        if (f) { window.openFeriadoModal(f.id); return; }
    }
    if (tipo === 'TE') {
        const t = (state.trabajosExtraCache || []).find(x => x.usuario_id === usuarioId && x.fecha === fecha);
        if (t) { window.openTrabajoExtraModal(t.id); return; }
    }
    // Clic en T o DO: ofrecer crear trabajo extra en esa fecha
    window.openTrabajoExtraModal(null, usuarioId, fecha);
};

// --- MODALES ---
function asegurarModales() {
    if (document.getElementById('modal-descanso')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal-descanso" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800 dark:text-white" id="descanso-title">Nuevo descanso</h3>
                <form onsubmit="window.saveDescanso(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="descanso-id">
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Usuario *</label>
                        <select id="descanso-usuario" required class="inp"></select>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Desde *</label><input type="date" id="descanso-inicio" required class="inp"></div>
                        <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Hasta *</label><input type="date" id="descanso-fin" required class="inp"></div>
                    </div>
                    <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Motivo</label><input type="text" id="descanso-motivo" class="inp" placeholder="Vacaciones, descanso de régimen..."></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <button type="button" onclick="window.closeDescansoModal()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300">Cancelar</button>
                        <button type="button" id="descanso-btn-eliminar" onclick="window.deleteDescansoActual()" class="px-3 py-1.5 bg-red-600 text-white rounded hidden">Eliminar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-feriado" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800 dark:text-white" id="feriado-title">Nuevo feriado</h3>
                <form onsubmit="window.saveFeriado(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="feriado-id">
                    <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Fecha *</label><input type="date" id="feriado-fecha" required class="inp"></div>
                    <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Nombre *</label><input type="text" id="feriado-nombre" required class="inp" placeholder="Ej: Día de la Independencia"></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <button type="button" onclick="window.closeFeriadoModal()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300">Cancelar</button>
                        <button type="button" id="feriado-btn-eliminar" onclick="window.deleteFeriadoActual()" class="px-3 py-1.5 bg-red-600 text-white rounded hidden">Eliminar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-te" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800 dark:text-white" id="te-title">Nuevo trabajo extra</h3>
                <form onsubmit="window.saveTrabajoExtra(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="te-id">
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Usuario *</label>
                        <select id="te-usuario" required class="inp"></select>
                    </div>
                    <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Fecha *</label><input type="date" id="te-fecha" required class="inp"></div>
                    <div><label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Motivo</label><input type="text" id="te-motivo" class="inp" placeholder="Ej: vaciado de losa"></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <button type="button" onclick="window.closeTrabajoExtraModal()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300">Cancelar</button>
                        <button type="button" id="te-btn-eliminar" onclick="window.deleteTrabajoExtraActual()" class="px-3 py-1.5 bg-red-600 text-white rounded hidden">Eliminar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    `);
}

function llenarUsuarios(selectId, valorSeleccionado) {
    const sel = document.getElementById(selectId);
    sel.innerHTML = state.perfilesCache.map(p => `<option value="${p.id}" ${p.id === valorSeleccionado ? 'selected' : ''}>${escapeHtml(nombreFormateado(p))} · ${escapeHtml(p.cargo || 'Sin cargo')}</option>`).join('');
}

window.openDescansoModal = function(id, fechaPredefinida) {
    if (!state.isAdmin) return;
    asegurarModales();
    const d = id ? (state.descansosCache || []).find(x => x.id === id) : null;
    document.getElementById('descanso-title').innerText = d ? 'Editar descanso' : 'Nuevo descanso';
    document.getElementById('descanso-id').value = d?.id || '';
    llenarUsuarios('descanso-usuario', d?.usuario_id);
    document.getElementById('descanso-inicio').value = d?.fecha_inicio || fechaPredefinida || '';
    document.getElementById('descanso-fin').value = d?.fecha_fin || '';
    document.getElementById('descanso-motivo').value = d?.motivo || '';
    document.getElementById('descanso-btn-eliminar').classList.toggle('hidden', !d);
    document.getElementById('modal-descanso').classList.remove('hidden');
    document.getElementById('modal-descanso').classList.add('flex');
};
window.closeDescansoModal = function() {
    document.getElementById('modal-descanso').classList.add('hidden');
    document.getElementById('modal-descanso').classList.remove('flex');
};
window.saveDescanso = async function(e) {
    e.preventDefault();
    const id = document.getElementById('descanso-id').value;
    const payload = {
        usuario_id: document.getElementById('descanso-usuario').value,
        fecha_inicio: document.getElementById('descanso-inicio').value,
        fecha_fin: document.getElementById('descanso-fin').value,
        motivo: document.getElementById('descanso-motivo').value || null
    };
    if (payload.fecha_fin < payload.fecha_inicio) { toast('La fecha fin no puede ser anterior al inicio'); return; }
    const { error } = id
        ? await supabaseClient.from('descansos').update(payload).eq('id', id)
        : await supabaseClient.from('descansos').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeDescansoModal(); await fetchAll(); window.renderView(); toast('Descanso guardado');
};
window.deleteDescansoActual = async function() {
    const id = document.getElementById('descanso-id').value;
    if (!id) return;
    const ok = await confirmDelete({ title: 'Eliminar descanso', message: 'Se eliminará este período de descanso. Los días volverán a su clasificación automática.' });
    if (!ok) return;
    const { error } = await supabaseClient.from('descansos').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeDescansoModal(); await fetchAll(); window.renderView(); toast('Descanso eliminado');
};

window.openFeriadoModal = function(id, fechaPredefinida) {
    if (!state.isAdmin) return;
    asegurarModales();
    const f = id ? (state.feriadosCache || []).find(x => x.id === id) : null;
    document.getElementById('feriado-title').innerText = f ? 'Editar feriado' : 'Nuevo feriado';
    document.getElementById('feriado-id').value = f?.id || '';
    document.getElementById('feriado-fecha').value = f?.fecha || fechaPredefinida || '';
    document.getElementById('feriado-nombre').value = f?.nombre || '';
    document.getElementById('feriado-btn-eliminar').classList.toggle('hidden', !f);
    document.getElementById('modal-feriado').classList.remove('hidden');
    document.getElementById('modal-feriado').classList.add('flex');
};
window.closeFeriadoModal = function() {
    document.getElementById('modal-feriado').classList.add('hidden');
    document.getElementById('modal-feriado').classList.remove('flex');
};
window.saveFeriado = async function(e) {
    e.preventDefault();
    const id = document.getElementById('feriado-id').value;
    const payload = {
        fecha: document.getElementById('feriado-fecha').value,
        nombre: document.getElementById('feriado-nombre').value.trim()
    };
    if (!payload.nombre) { toast('Nombre requerido'); return; }
    const { error } = id
        ? await supabaseClient.from('feriados').update(payload).eq('id', id)
        : await supabaseClient.from('feriados').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeFeriadoModal(); await fetchAll(); window.renderView(); toast('Feriado guardado');
};
window.deleteFeriadoActual = async function() {
    const id = document.getElementById('feriado-id').value;
    if (!id) return;
    const ok = await confirmDelete({ title: 'Eliminar feriado', message: 'Se eliminará este feriado. Ese día volverá a su clasificación automática.' });
    if (!ok) return;
    const { error } = await supabaseClient.from('feriados').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeFeriadoModal(); await fetchAll(); window.renderView(); toast('Feriado eliminado');
};

window.openTrabajoExtraModal = function(id, usuarioId, fecha) {
    if (!state.isAdmin) return;
    asegurarModales();
    const te = id ? (state.trabajosExtraCache || []).find(x => x.id === id) : null;
    document.getElementById('te-title').innerText = te ? 'Editar trabajo extra' : 'Nuevo trabajo extra';
    document.getElementById('te-id').value = te?.id || '';
    llenarUsuarios('te-usuario', te?.usuario_id || usuarioId);
    document.getElementById('te-fecha').value = te?.fecha || fecha || '';
    document.getElementById('te-motivo').value = te?.motivo || '';
    document.getElementById('te-btn-eliminar').classList.toggle('hidden', !te);
    document.getElementById('modal-te').classList.remove('hidden');
    document.getElementById('modal-te').classList.add('flex');
};
window.closeTrabajoExtraModal = function() {
    document.getElementById('modal-te').classList.add('hidden');
    document.getElementById('modal-te').classList.remove('flex');
};
window.saveTrabajoExtra = async function(e) {
    e.preventDefault();
    const id = document.getElementById('te-id').value;
    const payload = {
        usuario_id: document.getElementById('te-usuario').value,
        fecha: document.getElementById('te-fecha').value,
        motivo: document.getElementById('te-motivo').value || null
    };
    const { error } = id
        ? await supabaseClient.from('trabajos_extra').update(payload).eq('id', id)
        : await supabaseClient.from('trabajos_extra').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeTrabajoExtraModal(); await fetchAll(); window.renderView(); toast('Trabajo extra guardado');
};
window.deleteTrabajoExtraActual = async function() {
    const id = document.getElementById('te-id').value;
    if (!id) return;
    const ok = await confirmDelete({ title: 'Eliminar trabajo extra', message: 'Se eliminará este trabajo extra. Ese día volverá a su clasificación automática.' });
    if (!ok) return;
    const { error } = await supabaseClient.from('trabajos_extra').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeTrabajoExtraModal(); await fetchAll(); window.renderView(); toast
