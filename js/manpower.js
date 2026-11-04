import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, semaforo, today, toast } from './utils.js';
import { canEdit } from './tabla.js';

export function renderMiTrabajo(container) {
    const misTareas = state.tasksCache.filter(t => t.responsable_id === state.currentUser.id && t.estado !== 'Cerrado');
    
    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <h3 class="font-bold text-sm text-slate-800">Mi Trabajo Pendiente</h3>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>
        <div class="grid gap-3">
            ${misTareas.length === 0 ? '<p class="text-slate-500 text-sm">No tienes actividades pendientes.</p>' : ''}
            ${misTareas.map(t => `
                <div class="card p-4 flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(t.actividad)}</h4>
                        <p class="text-xs text-slate-500">${escapeHtml(t.grupo || '-')} · Vence: ${fmtDate(t.fecha_fin)}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded">${semaforo(t)}</span>
                        <button onclick="window.openManpowerModal(${t.id})" class="block mt-2 text-xs bg-slate-800 text-white px-3 py-1 rounded hover:bg-slate-700">⏱ Registrar Horas</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

export function renderManpower(container) {
    const registros = state.manpowerCache.filter(m => state.isAdmin || state.isCoordinador || m.usuario_id === state.currentUser.id);
    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <h3 class="font-bold text-sm text-slate-800">Registro MANPOWER</h3>
            <button onclick="window.openManpowerModal(null)" class="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-700">+ Registrar Horas</button>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr><th class="p-3">Fecha</th><th class="p-3">Usuario</th><th class="p-3">Actividad</th><th class="p-3">Horas</th><th class="p-3">Nota</th></tr>
                </thead>
                <tbody>
                    ${registros.map(r => {
                        const t = state.tasksCache.find(x => x.id === r.pendiente_id);
                        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3">${fmtDate(r.fecha)}</td>
                            <td class="p-3 font-semibold text-slate-700">${escapeHtml(p ? p.email.split('@')[0] : 'Desc.')}</td>
                            <td class="p-3">${escapeHtml(t ? t.actividad : 'General')}</td>
                            <td class="p-3 font-bold text-sky-600">${r.horas} h</td>
                            <td class="p-3 text-slate-500 italic">${escapeHtml(r.descripcion || '')}</td>
                        </tr>`;
                    }).join('')}
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
                    <h3 class="font-bold text-sm text-slate-800">Registrar Horas (MANPOWER)</h3>
                    <form onsubmit="window.saveManpower(event)" class="space-y-3 text-xs">
                        <input type="hidden" id="mp-task-id">
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">Actividad</label>
                            <select id="mp-actividad" class="inp">
                                <option value="">— General —</option>
                                ${state.tasksCache.filter(t=>t.estado!=='Cerrado').map(t => `<option value="${t.id}">${escapeHtml(t.actividad.substring(0,50))}...</option>`).join('')}
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
    
    document.getElementById('mp-task-id').value = pendienteId || '';
    if (pendienteId) document.getElementById('mp-actividad').value = pendienteId;
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
