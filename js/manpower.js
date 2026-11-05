import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, semaforo, today, toast, nombreFormateado, getIniciales, colorAvatar } from './utils.js';

// Helper para saber si el usuario actual es parte de la tarea (dueño o recurso)
function isUserInvolved(t) {
    const esResponsable = t.responsable_id === state.currentUser.id;
    const esRecurso = state.actividadRecursosCache.some(
        r => r.pendiente_id === t.id && r.usuario_id === state.currentUser.id
    );
    return esResponsable || esRecurso;
}

export function renderMiTrabajo(container) {
    // Tareas donde participa el usuario y no están cerradas
    const misTareas = state.tasksCache.filter(t => 
        t.estado !== 'Cerrado' && 
        t.estado_cde !== 'Archived' && 
        isUserInvolved(t)
    );
    
    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Mi Trabajo Pendiente</h3>
                <p class="text-[11px] text-slate-500">Tareas donde eres responsable o parte del equipo.</p>
            </div>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>
        <div class="grid gap-3">
            ${misTareas.length === 0 ? '<div class="card p-6 text-center text-slate-500 text-sm">No tienes actividades pendientes.</div>' : ''}
            ${misTareas.map(t => {
                const equipo = state.actividadRecursosCache.filter(r => r.pendiente_id === t.id);
                return `
                <div class="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${t.codigo_contenedor || '–'}</span>
                            <span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">${semaforo(t)}</span>
                        </div>
                        <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(t.actividad)}</h4>
                        <p class="text-xs text-slate-500 mt-1">
                            ${escapeHtml(t.grupo || '-')} · Vence: ${fmtDate(t.fecha_fin)}
                        </p>
                        
                        <!-- EQUIPO -->
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
                        <button onclick="window.openManpowerModal(${t.id})" class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700 whitespace-nowrap">⏱ Registrar Horas</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

export function renderManpower(container) {
    const registros = state.manpowerCache.filter(m => state.isAdmin || state.isCoordinador || m.usuario_id === state.currentUser.id);
    
    // Calcular total de horas
    const totalHoras = registros.reduce((sum, r) => sum + parseFloat(r.horas || 0), 0);

    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Registro MANPOWER</h3>
                <p class="text-[11px] text-slate-500">Horas registradas por el equipo.</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right hidden md:block">
                    <p class="text-[10px] text-slate-500 uppercase font-bold">Total Horas</p>
                    <p class="text-lg font-bold text-sky-700">${totalHoras.toFixed(1)} h</p>
                </div>
                <button onclick="window.openManpowerModal(null)" class="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-700">+ Registrar Horas</button>
            </div>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Fecha</th>
                        <th class="p-3">Usuario</th>
                        <th class="p-3">Actividad</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">Nota</th>
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
                            <td class="p-3 font-bold text-sky-600">${r.horas} h</td>
                            <td class="p-3 text-slate-500 italic">${escapeHtml(r.descripcion || '')}</td>
                        </tr>`;
                    }).join('') || '<tr><td colspan="5" class="text-center py-6 text-slate-400">No hay registros de horas aún.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

export function openManpowerModal(pendienteId) {
    if (!document.getElementById('modal-manpower')) {
        const modalHtml = `
            <div id="modal-manpower" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
                <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                    <h3 class="font-bold text-sm text-slate-800">Registrar Horas</h3>
                    <form onsubmit="window.saveManpower(event)" class="space-y-3 text-xs">
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">Actividad</label>
                            <select id="mp-actividad" class="inp">
                                <option value="">— General —</option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div><label class="block font-semibold text-slate-600 mb-1">Fecha</label><input type="date" id="mp-fecha" required class="inp" value="${today().toISOString().slice(0,10)}"></div>
                            <div><label class="block font-semibold text-slate-600 mb-1">Horas</label><input type="number" step="0.5" min="0.5" max="24" id="mp-horas" required class="inp"></div>
                        </div>
                        <div><label class="block font-semibold text-slate-600 mb-1">Descripción</label><textarea id="mp-desc" rows="2" class="inp" placeholder="¿Qué hiciste?"></textarea></div>
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
    
    // Cargar solo tareas donde el usuario participa (o todas si es admin/coord)
    const tareasDisponibles = state.tasksCache.filter(t => {
        if (t.estado === 'Cerrado') return false;
        if (state.isAdmin || state.isCoordinador) return true;
        return isUserInvolved(t);
    });

    const select = document.getElementById('mp-actividad');
    select.innerHTML = '<option value="">— General —</option>' + 
        tareasDisponibles.map(t => `<option value="${t.id}">${escapeHtml(t.codigo_contenedor || '')} - ${escapeHtml(t.actividad.substring(0,50))}...</option>`).join('');

    select.value = pendienteId || '';
    document.getElementById('modal-manpower').classList.remove('hidden');
    document.getElementById('modal-manpower').classList.add('flex');
}

export function closeManpowerModal() {
    document.getElementById('modal-manpower').classList.add('hidden');
    document.getElementById('modal-manpower').classList.remove('flex');
}

export async function saveManpower(e) {
    e.preventDefault();
    const payload = {
        pendiente_id: document.getElementById('mp-actividad').value || null,
        usuario_id: state.currentUser.id,
        fecha: document.getElementById('mp-fecha').value,
        horas: parseFloat(document.getElementById('mp-horas').value),
        descripcion: document.getElementById('mp-desc').value
    };
    const { error } = await supabaseClient.from('manpower_registros').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    closeManpowerModal();
    await fetchAll(); window.renderView();
    toast('Horas registradas');
}
