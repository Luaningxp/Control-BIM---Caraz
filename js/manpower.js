import { supabaseClient, state, fetchAll } from './db.js';
import { 
    escapeHtml, fmtDate, semaforo, today, toast, nombreFormateado, getIniciales, colorAvatar,
    confirmDelete
} from './utils.js';

function isUserInvolved(t) {
    const esResponsable = t.responsable_id === state.currentUser.id;
    const esRecurso = state.actividadRecursosCache.some(
        r => r.pendiente_id === t.id && r.usuario_id === state.currentUser.id
    );
    return esResponsable || esRecurso;
}

export function renderMiTrabajo(container) {
    const misTareas = state.tasksCache.filter(t => 
        t.estado !== 'Cerrado' && 
        t.estado_cde !== 'Archived' && 
        isUserInvolved(t)
    );
    
    // Verificar si ayer (o el último día hábil) llenó al 100%
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    // Si ayer fue domingo, retroceder al sábado
    while (ayer.getDay() === 0) { ayer.setDate(ayer.getDate() - 1); }
    
    const ayerStr = ayer.toISOString().split('T')[0];
    const registrosAyer = state.manpowerCache.filter(m => 
        m.usuario_id === state.currentUser.id && 
        m.fecha === ayerStr
    );
    const porcentajeAyer = registrosAyer.reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    const noLlenoAyer = porcentajeAyer < 100;

    container.innerHTML = `
        ${noLlenoAyer ? `
            <div class="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-r-lg">
                <div class="flex items-start gap-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-600 text-lg mt-0.5"></i>
                    <div>
                        <p class="font-bold text-amber-900 text-sm">Aviso de registro pendiente</p>
                        <p class="text-amber-800 text-xs mt-0.5">No completaste tu <b>100%</b> el día <b>${fmtDate(ayerStr)}</b> (registraste ${porcentajeAyer.toFixed(1)}%). <a href="javascript:void(0)" onclick="window.openManpowerModal(null, '${ayerStr}')" class="underline font-semibold">Registrar ahora</a>.</p>
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
                // Total registrado en la tarea por el usuario actual (histórico)
                const totalUsuarioTarea = state.manpowerCache
                    .filter(m => m.usuario_id === state.currentUser.id && m.pendiente_id === t.id)
                    .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);

                return `
                <div class="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${t.codigo_contenedor || '–'}</span>
                            <span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">${semaforo(t)}</span>
                            ${totalUsuarioTarea > 0 ? `<span class="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold">Acumulado: ${totalUsuarioTarea.toFixed(1)}%</span>` : ''}
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

export function renderManpower(container) {
    const registros = state.manpowerCache.filter(m => 
        state.isAdmin || state.isCoordinador || m.usuario_id === state.currentUser.id
    );
    
    const registrosCount = registros.length;

    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Registro MANPOWER</h3>
                <p class="text-[11px] text-slate-500">Registra el % del día que dedicaste a cada actividad.</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right hidden md:block">
                    <p class="text-[10px] text-slate-500 uppercase font-bold">Total Registros</p>
                    <p class="text-lg font-bold text-sky-700">${registrosCount}</p>
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
                        <th class="p-3">Nota</th>
                        ${state.isAdmin ? '<th class="p-3 text-center">Acciones</th>' : ''}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${registros.map(r => {
                        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
                        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                        const nombre = p ? nombreFormateado(p) : 'Desconocido';
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-600">${fmtDate(r.fecha)}</td>
                            <td class="p-3 font-semibold text-slate-700">${escapeHtml(nombre)}</td>
                            <td class="p-3 text-slate-700">${escapeHtml(t ? t.actividad : 'General')}</td>
                            <td class="p-3 font-bold text-sky-600">${parseFloat(r.porcentaje_dia || 0).toFixed(1)} %</td>
                            <td class="p-3 text-slate-500 italic">${escapeHtml(r.descripcion || '')}</td>
                            ${state.isAdmin ? `
                                <td class="p-3 text-center whitespace-nowrap">
                                    <button onclick="window.deleteManpower(${r.id})" class="text-red-500 hover:text-red-700" title="Eliminar registro">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            ` : ''}
                        </tr>`;
                    }).join('') || `<tr><td colspan="${state.isAdmin ? 6 : 5}" class="text-center py-6 text-slate-400">No hay registros de % aún.</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
}

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
                                <input type="number" step="1" min="1" max="100" id="mp-porcentaje" required class="inp" placeholder="Ej. 25">
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
        info.innerHTML = `Tienes <b class="text-sky-700">${restante.toFixed(0)}% disponible</b> para registrar en este día (ya usaste ${totalDia.toFixed(0)}%).`;
    }
};

export function closeManpowerModal() {
    document.getElementById('modal-manpower').classList.add('hidden');
    document.getElementById('modal-manpower').classList.remove('flex');
}

export async function saveManpower(e) {
    e.preventDefault();
    const fecha = document.getElementById('mp-fecha').value;
    const porcentaje = parseFloat(document.getElementById('mp-porcentaje').value);
    
    // Validar en cliente también (la BD lo hace de nuevo por seguridad)
    const totalDia = state.manpowerCache
        .filter(m => m.usuario_id === state.currentUser.id && m.fecha === fecha)
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    
    if (totalDia + porcentaje > 100) {
        toast(`No puedes exceder 100%. Ya tienes ${totalDia.toFixed(0)}% registrado.`);
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
    toast('Registro guardado');
}
window.deleteManpower = async function(id) {
    if (!state.isAdmin) { toast('Solo los administradores pueden eliminar registros.'); return; }
    
    const r = state.manpowerCache.find(x => x.id === id);
    if (!r) return;
    
    const p = state.perfilesCache.find(x => x.id === r.usuario_id);
    const t = state.tasksCache.find(x => x.id === r.pendiente_id);
    const nombreUsuario = p ? nombreFormateado(p) : 'Desconocido';
    const nombreActividad = t ? t.actividad : 'General';
    
    const confirmado = await confirmDelete({
        title: 'Eliminar registro de horas',
        message: `Vas a eliminar el registro de "${nombreUsuario}" del ${fmtDate(r.fecha)} (${parseFloat(r.porcentaje_dia || 0).toFixed(1)}% en "${nombreActividad}"). Esta acción no se puede deshacer.`
    });
    
    if (!confirmado) return;
    
    const { error } = await supabaseClient.from('manpower_registros').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    
    toast('Registro eliminado');
    await fetchAll();
    window.renderView();
};
