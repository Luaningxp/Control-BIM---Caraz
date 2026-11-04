import { state } from './db.js';
import { escapeHtml, nombreResponsable, daysToDeadline, fmtDate, isCerrado } from './utils.js';

export function renderEisenhower(container) {
    const activos = state.tasksCache.filter(t => t.estado_cde !== 'Archived' && !isCerrado(t));
    const isUrgente = (t) => t.fecha_fin && daysToDeadline(t) <= 7;
    const isImportante = (t) => t.criticidad === 'Muy alto' || t.criticidad === 'Alto';

    const Q = [
        { titulo: 'Hacer ya', sub: 'Urgente + Importante', color: 'red', items: activos.filter(t => isUrgente(t) && isImportante(t)) },
        { titulo: 'Programar', sub: 'Importante, no urgente', color: 'sky', items: activos.filter(t => !isUrgente(t) && isImportante(t)) },
        { titulo: 'Delegar', sub: 'Urgente, no importante', color: 'amber', items: activos.filter(t => isUrgente(t) && !isImportante(t)) },
        { titulo: 'Eliminar / posponer', sub: 'Ni urgente ni importante', color: 'slate', items: activos.filter(t => !isUrgente(t) && !isImportante(t)) }
    ];

    container.innerHTML = `
        <div class="mb-3"><h3 class="font-bold text-sm text-slate-800">Matriz Eisenhower</h3><p class="text-[11px] text-slate-500">Urgente = vence en ≤7 días. Importante = Muy alto / Alto.</p></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${Q.map(q => `
                <div class="eis-q bg-${q.color}-50 border-${q.color}-200">
                    <div class="flex justify-between items-center mb-2">
                        <div><h4 class="text-[13px] font-bold text-${q.color}-800">${q.titulo}</h4><p class="text-[10px] text-${q.color}-600">${q.sub}</p></div>
                        <span class="text-[11px] font-bold bg-white border border-${q.color}-200 text-${q.color}-700 rounded-full px-2 py-0.5">${q.items.length}</span>
                    </div>
                    <div class="eis-body space-y-1.5">
                        ${q.items.slice(0, 50).map(t => `
                            <div class="bg-white rounded border border-slate-200 p-2 text-[11px]">
                                <p class="font-medium text-slate-800 leading-snug line-clamp-2">${escapeHtml(t.actividad)}</p>
                                <div class="flex justify-between items-center mt-1 text-[10px] text-slate-500">
                                    <span>${escapeHtml(nombreResponsable(t, state.perfilesCache))}</span>
                                    <span>${t.fecha_fin ? fmtDate(t.fecha_fin) : 'sin fecha'}</span>
                                </div>
                            </div>
                        `).join('') || '<p class="text-[11px] text-slate-400 text-center py-3">Sin actividades</p>'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}
