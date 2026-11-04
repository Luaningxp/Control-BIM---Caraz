import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, cdeBadge, nombreResponsable, toast } from './utils.js';

export function canEdit(t) { 
    return state.isAdmin || state.isCoordinador || (t.estado_cde === 'WIP' && t.user_id === state.currentUser?.id); 
}
export function canDelete() { return state.isAdmin; }
export function canTransition() { return state.isAdmin || state.isCoordinador; }

export function renderTabla(container) {
    // 1. Generar los encabezados dinámicos para las propiedades personalizadas
    const propHeaders = state.propDefsCache.map(pd => 
        `<th class="p-3">${escapeHtml(pd.nombre)}</th>`
    ).join('');

    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <h3 class="font-bold text-sm text-slate-800">Base de Contenedores</h3>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Código</th>
                        <th class="p-3">Actividad</th>
                        <th class="p-3">Grupo</th>
                        <th class="p-3">Responsable</th>
                        <th class="p-3">Crit.</th>
                        <th class="p-3">Estado</th>
                        <th class="p-3">CDE ISO</th>
                        ${propHeaders} <!-- Aquí se inyectan las columnas personalizadas -->
                        <th class="p-3 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody id="task-list" class="divide-y divide-slate-100">
                    ${state.tasksCache.map(t => {
                        // 2. Buscar los valores personalizados de esta tarea específica
                        const propCells = state.propDefsCache.map(pd => {
                            const pv = state.propValsCache.find(v => v.pendiente_id === t.id && v.propiedad_id === pd.id);
                            let displayVal = '-';
                            
                            if (pv) {
                                if (pd.tipo === 'numero') displayVal = pv.valor_numero ?? '-';
                                else if (pd.tipo === 'fecha') displayVal = pv.valor_fecha ? fmtDate(pv.valor_fecha) : '-';
                                else if (pd.tipo === 'booleano') displayVal = pv.valor_booleano ? 'Sí' : 'No';
                                else displayVal = pv.valor_texto || '-';
                            }
                            
                            return `<td class="p-3 text-slate-600">${escapeHtml(displayVal)}</td>`;
                        }).join('');

                        return `
                            <tr class="hover:bg-slate-50 transition">
                                <td class="p-3 font-mono text-[11px] text-slate-500">${t.codigo_contenedor || '–'}</td>
                                <td class="p-3 font-medium text-slate-900 max-w-xs">${escapeHtml(t.actividad)}</td>
                                <td class="p-3 text-slate-500 text-[11px]">${escapeHtml(t.grupo || '-')}</td>
                                <td class="p-3 text-slate-600 text-[11px]">${escapeHtml(nombreResponsable(t, state.perfilesCache))}</td>
                                <td class="p-3 font-semibold text-slate-700">${escapeHtml(t.criticidad)}</td>
                                <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">${escapeHtml(t.estado)}</span></td>
                                <td class="p-3">${cdeBadge(t.estado_cde, t.codigo_aptitud)}</td>
                                ${propCells} <!-- Aquí se inyectan los valores -->
                                <td class="p-3 text-center whitespace-nowrap">
                                    ${canEdit(t) ? `<button onclick="window.editTask(${t.id})" class="text-sky-600 hover:text-sky-800 mr-2"><i class="fa-solid fa-pen"></i></button>` : ''}
                                    ${canTransition() ? `<button onclick="window.openModalCDE(${t.id})" class="text-teal-600 hover:text-teal-800 mr-2"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>` : ''}
                                    ${canDelete() ? `<button onclick="window.deleteTask(${t.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>` : ''}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function openModal() {
    if (!state.isAdmin && !state.isCoordinador) return;
    document.getElementById('modal-title').innerText = "Nuevo Contenedor";
    ['task-id','task-actividad','task-fecha-fin','task-fecha-cierre','task-nota'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('task-criticidad').value = 'Alto';
    document.getElementById('task-estado').value = 'No iniciado';
    
    const grSel = document.getElementById('task-grupo');
    grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join('');
    const rsSel = document.getElementById('task-responsable');
    rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + state.perfilesCache.map(p => `<option value="${p.id}">${escapeHtml(p.email.split('@')[0])}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</option>`).join('');

    renderCustomProps(null);

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('modal-task').classList.add('flex');
}

export function editTask(id) {
    const t = state.tasksCache.find(x => x.id === id);
    if (!t || !canEdit(t)) return;
    
    document.getElementById('modal-title').innerText = "Editar Contenedor";
    document.getElementById('task-id').value = t.id;
    document.getElementById('task-actividad').value = t.actividad || '';
    document.getElementById('task-criticidad').value = t.criticidad || 'Alto';
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

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('modal-task').classList.add('flex');
}

function renderCustomProps(pendienteId) {
    const container = document.getElementById('custom-props-container');
    const inputs = document.getElementById('custom-props-inputs');
    
    if (state.propDefsCache.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    inputs.innerHTML = state.propDefsCache.map(pd => {
        let valor = '';
        if (pendienteId) {
            const pv = state.propValsCache.find(v => v.pendiente_id === pendienteId && v.propiedad_id === pd.id);
            if (pv) {
                valor = pd.tipo === 'numero' ? (pv.valor_numero !== null ? pv.valor_numero : '') : 
                        pd.tipo === 'fecha' ? (pv.valor_fecha || '') : 
                        pd.tipo === 'booleano' ? pv.valor_booleano : 
                        (pv.valor_texto || '');
            }
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

        return `
            <div>
                <label class="block font-semibold text-slate-600 mb-1">${escapeHtml(pd.nombre)} ${pd.requerido ? '<span class="text-red-500">*</span>' : ''}</label>
                ${inputHtml}
            </div>
        `;
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
        criticidad: document.getElementById('task-criticidad').value,
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
        const pid = parseInt(input.dataset.pid);
        const type = input.dataset.type;
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

        if (existente) {
            await supabaseClient.from('propiedades_valores').update(propPayload).eq('id', existente.id);
        } else if (val !== null) {
            await supabaseClient.from('propiedades_valores').insert([propPayload]);
        }
    }

    closeModal();
    await fetchAll();
    window.renderView();
    toast('Guardado');
}

export async function deleteTask(id) {
    if (!canDelete()) return;
    if (!confirm("¿Eliminar este contenedor?")) return;
    const { error } = await supabaseClient.from('pendientes_bim').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); window.renderView();
}

export function openModalCDE(id) {
    if (!canTransition()) return;
    state.cdeTargetId = id;
    document.getElementById('cde-current').innerText = `Contenedor #${id}`;
    document.getElementById('cde-estado').value = 'Shared';
    document.getElementById('cde-aptitud').value = 'S1';
    document.getElementById('cde-comentario').value = '';
    document.getElementById('modal-cde').classList.remove('hidden');
    document.getElementById('modal-cde').classList.add('flex');
}

export function closeModalCDE() {
    document.getElementById('modal-cde').classList.add('hidden');
    document.getElementById('modal-cde').classList.remove('flex');
    state.cdeTargetId = null;
}

export async function confirmarTransicion() {
    if (!state.cdeTargetId) return;
    const estado = document.getElementById('cde-estado').value;
    const aptitud = document.getElementById('cde-aptitud').value || null;
    const comentario = document.getElementById('cde-comentario').value || null;
    const { data, error } = await supabaseClient.rpc('transicionar_cde', {
        p_pendiente_id: state.cdeTargetId, p_estado_nuevo: estado, p_aptitud_nueva: aptitud, p_comentario: comentario
    });
    if (error) { toast('Error RPC: ' + error.message); return; }
    if (!data?.ok) { toast('Rechazado: ' + (data?.error || 'desconocida')); return; }
    closeModalCDE(); await fetchAll(); window.renderView(); toast('Transición aplicada');
}
