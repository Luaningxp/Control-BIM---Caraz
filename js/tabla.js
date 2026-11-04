import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, cdeBadge, nombreResponsable, toast } from './utils.js';

export function canEdit(t) { return state.isAdmin || state.isCoordinador || (t.estado_cde === 'WIP' && t.user_id === state.currentUser?.id); }
export function canDelete() { return state.isAdmin; }
export function canTransition() { return state.isAdmin || state.isCoordinador; }

export function renderTabla(container) {
    container.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <h3 class="font-bold text-sm text-slate-800">Base de Contenedores</h3>
            <button onclick="window.fetchAll().then(window.renderView)" class="text-xs text-sky-600 hover:underline font-medium"><i class="fa-solid fa-rotate-right mr-1"></i> Actualizar</button>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Código</th><th class="p-3">Actividad</th><th class="p-3">Grupo</th><th class="p-3">Responsable</th>
                        <th class="p-3">Crit.</th><th class="p-3">Estado</th><th class="p-3">CDE ISO</th><th class="p-3 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody id="task-list" class="divide-y divide-slate-100">
                    ${state.tasksCache.map(t => `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-3 font-mono text-[11px] text-slate-500">${t.codigo_contenedor || '–'}</td>
                            <td class="p-3 font-medium text-slate-900 max-w-xs">${escapeHtml(t.actividad)}</td>
                            <td class="p-3 text-slate-500 text-[11px]">${escapeHtml(t.grupo || '-')}</td>
                            <td class="p-3 text-slate-600 text-[11px]">${escapeHtml(nombreResponsable(t, state.perfilesCache))}</td>
                            <td class="p-3 font-semibold text-slate-700">${escapeHtml(t.criticidad)}</td>
                            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">${escapeHtml(t.estado)}</span></td>
                            <td class="p-3">${cdeBadge(t.estado_cde, t.codigo_aptitud)}</td>
                            <td class="p-3 text-center whitespace-nowrap">
                                ${canEdit(t) ? `<button onclick='window.editTask(${JSON.stringify(t).replace(/'/g, "&apos;")})' class="text-sky-600 hover:text-sky-800 mr-2"><i class="fa-solid fa-pen"></i></button>` : ''}
                                ${canTransition() ? `<button onclick="window.openModalCDE(${t.id})" class="text-teal-600 hover:text-teal-800 mr-2"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>` : ''}
                                ${canDelete() ? `<button onclick="window.deleteTask(${t.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Logica para abrir modal, guardar y editar (con propiedades personalizadas)
export function openModal() {
    if (!state.isAdmin && !state.isCoordinador) return;
    document.getElementById('modal-title').innerText = "Nuevo Contenedor";
    ['task-id','task-actividad','task-fecha-fin','task-fecha-cierre','task-nota'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('task-criticidad').value = 'Alto';
    document.getElementById('task-estado').value = 'No iniciado';
    
    // Poblar selects
    const grSel = document.getElementById('task-grupo');
    grSel.innerHTML = '<option value="">— Sin grupo —</option>' + state.gruposCache.filter(g=>g.activo).map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`).join('');
    const rsSel = document.getElementById('task-responsable');
    rsSel.innerHTML = '<option value="">— Sin asignar —</option>' + state.perfilesCache.map(p => `<option value="${p.id}">${escapeHtml(p.email.split('@')[0])}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</option>`).join('');

    // Renderizar propiedades personalizadas (vacías)
    renderCustomProps(null);

    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('modal-task').classList.add('flex');
}

export function editTask(t) {
    if (!canEdit(t)) return;
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

    // Renderizar propiedades personalizadas (con valores)
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
            if (pv) valor = pd.tipo === 'numero' ? pv.valor_numero : pd.tipo === 'fecha' ? p
