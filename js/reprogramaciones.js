import { supabaseClient, state } from './db.js';
import { escapeHtml, fmtDate, nombreFormateado, toast } from './utils.js';

export const TIPOS_REPROGRAMACION = {
    desplazamiento: 'Desplazamiento',
    ampliacion: 'Ampliación de plazo',
    inicio_diferido: 'Inicio diferido',
    compresion: 'Compresión',
    otro: 'Otro'
};

function diasEntre(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function clasificar({ iniAnt, iniNuevo, finAnt, finNuevo }) {
    const dIni = iniAnt && iniNuevo ? diasEntre(iniAnt, iniNuevo) : 0;
    const dFin = finAnt && finNuevo ? diasEntre(finAnt, finNuevo) : 0;

    if (dIni !== 0 && dFin !== 0) {
        if (dIni === dFin) return 'desplazamiento';
        return (dFin - dIni) > 0 ? 'ampliacion' : 'compresion'; // cambio de duración
    }
    if (dFin > 0) return 'ampliacion';
    if (dFin < 0) return 'compresion';
    if (dIni > 0) return 'inicio_diferido';
    return 'otro';
}

// Devuelve null si no hay reprogramación.
// Cargar una fecha por primera vez es planificar, no reprogramar.
export function detectarReprogramacion(previa, payload) {
    if (!previa) return null;

    const iniAnt = previa.fecha_inicio_programado || null;
    const finAnt = previa.fecha_fin || null;
    const iniNuevo = payload.fecha_inicio_programado || null;
    const finNuevo = payload.fecha_fin || null;

    const cambioIni = !!(iniAnt && iniNuevo && iniAnt !== iniNuevo);
    const cambioFin = !!(finAnt && finNuevo && finAnt !== finNuevo);
    if (!cambioIni && !cambioFin) return null;

    const r = { iniAnt, iniNuevo, finAnt, finNuevo, estado: previa.estado };
    r.tipo = clasificar(r);
    return r;
}

// Muestra el modal y devuelve { causa_id, comentario } o null si se cancela
export function pedirMotivoReprogramacion(r) {
    return new Promise(resolve => {
        const causas = (state.causasCache || []).filter(c => c.activo !== false);
        const linea = (label, ant, nuevo) => (!ant || !nuevo || ant === nuevo) ? '' : `
            <div class="flex justify-between">
                <span class="text-slate-500 dark:text-slate-400">${label}</span>
                <span class="font-semibold text-slate-800 dark:text-slate-200">${fmtDate(ant)} → ${fmtDate(nuevo)}</span>
            </div>`;

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4';
        overlay.style.zIndex = '70';
        overlay.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800 dark:text-white">
                    <i class="fa-solid fa-calendar-plus text-purple-600 mr-1"></i> Reprogramación de actividad
                </h3>
                <div class="text-xs bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-1">
                    ${linea('Inicio', r.iniAnt, r.iniNuevo)}
                    ${linea('Fin', r.finAnt, r.finNuevo)}
                    <div class="flex justify-between">
                        <span class="text-slate-500 dark:text-slate-400">Tipo</span>
                        <span class="font-semibold text-purple-700 dark:text-purple-300">${TIPOS_REPROGRAMACION[r.tipo]}</span>
                    </div>
                </div>
                <form id="rp-form" class="space-y-3 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Causa *</label>
                        <select id="rp-causa" required class="inp">
                            <option value="">— Seleccionar —</option>
                            ${causas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Comentario</label>
                        <textarea id="rp-comentario" rows="2" class="inp" placeholder="Detalle breve del motivo"></textarea>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <button type="button" id="rp-cancelar" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Confirmar reprogramación</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(overlay);

        const cerrar = (valor) => { overlay.remove(); resolve(valor); };
        overlay.querySelector('#rp-cancelar').onclick = () => cerrar(null);
        overlay.querySelector('#rp-form').onsubmit = (e) => {
            e.preventDefault();
            const causaId = overlay.querySelector('#rp-causa').value;
            if (!causaId) return;
            cerrar({
                causa_id: Number(causaId),
                comentario: overlay.querySelector('#rp-comentario').value.trim()
            });
        };
    });
}

// Devuelve el error de Supabase (o null si salió bien)
export async function registrarReprogramacion(pendienteId, r, motivo) {
    const { error } = await supabaseClient.from('reprogramaciones_bim').insert([{
        pendiente_id: parseInt(pendienteId),
        inicio_anterior: r.iniAnt,
        inicio_nuevo: r.iniNuevo,
        fin_anterior: r.finAnt,
        fin_nuevo: r.finNuevo,
        tipo: r.tipo,
        causa_id: motivo.causa_id,
        comentario: motivo.comentario || null,
        estado_al_reprogramar: r.estado,
        usuario_id: state.currentUser.id
    }]);
    return error;
}
// --- INSIGNIA E HISTORIAL ---
export function getReprogramaciones(pendienteId) {
    return (state.reprogramacionesCache || []).filter(r => Number(r.pendiente_id) === Number(pendienteId));
}

export function badgeReprogramada(pendienteId) {
    const n = getReprogramaciones(pendienteId).length;
    if (n === 0) return '';
    return `<button type="button" onclick="event.stopPropagation(); window.verHistorialReprogramaciones(${pendienteId})"
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 text-[10px] font-bold hover:bg-purple-200 flex-shrink-0"
        title="Ver historial de reprogramaciones"><i class="fa-solid fa-calendar-plus text-[9px]"></i> ×${n}</button>`;
}

window.verHistorialReprogramaciones = function(pendienteId) {
    const t = state.tasksCache.find(x => Number(x.id) === Number(pendienteId));
    if (!t) return;

    const eventos = getReprogramaciones(pendienteId)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    const causaNombre = (id) => {
        const c = (state.causasTodasCache || state.causasCache || []).find(x => Number(x.id) === Number(id));
        return c ? c.nombre : null;
    };
    const quien = (uid) => {
        const p = state.perfilesCache.find(x => x.id === uid);
        return p ? nombreFormateado(p) : 'Usuario desconocido';
    };
    const cambio = (label, ant, nuevo) => {
        if (!ant || !nuevo || ant === nuevo) return '';
        const d = diasEntre(ant, nuevo);
        return `<div class="flex justify-between gap-2">
            <span class="text-slate-500 dark:text-slate-400">${label}</span>
            <span class="font-semibold text-slate-800 dark:text-slate-200">${fmtDate(ant)} → ${fmtDate(nuevo)}
                <span class="${d > 0 ? 'text-red-600' : 'text-emerald-600'}">(${d > 0 ? '+' : ''}${d} d)</span>
            </span></div>`;
    };

    const ini0 = t.fecha_inicio_original, fin0 = t.fecha_fin_original;
    const desvio = (fin0 && t.fecha_fin) ? diasEntre(fin0, t.fecha_fin) : null;

    const puedeEditarMotivo = !!(state.isAdmin || state.isCoordinador);

    const tarjetas = eventos.map(r => {
        const causa = causaNombre(r.causa_id);
        const fecha = new Date(r.created_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
        const detalle = r.es_migrada
            ? '<div class="text-slate-400 italic">Registro migrado del estado "Reprogramado" (sin detalle de fechas).</div>'
            : cambio('Inicio', r.inicio_anterior, r.inicio_nuevo) + cambio('Fin', r.fin_anterior, r.fin_nuevo);
        return `
            <div class="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-1.5">
                <div class="flex justify-between items-center">
                    <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 text-[10px] font-bold">${TIPOS_REPROGRAMACION[r.tipo] || 'Otro'}</span>
                    <span class="text-[10px] text-slate-400">${fecha}${puedeEditarMotivo ? ` <button type="button" onclick="window.editarMotivoReprogramacion(${r.id}, ${t.id})" class="ml-1 text-sky-600 hover:text-sky-800" title="Editar motivo"><i class="fa-solid fa-pen"></i></button>` : ''}</span>
                </div>
                <div class="text-[11px] space-y-0.5">${detalle}</div>
                ${causa ? `<div class="text-[11px]"><span class="text-slate-500 dark:text-slate-400">Causa:</span> <span class="font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(causa)}</span></div>` : ''}
                ${r.comentario ? `<div class="text-[11px] italic text-slate-600 dark:text-slate-300">"${escapeHtml(r.comentario)}"</div>` : ''}
                <div class="text-[10px] text-slate-400">Por ${escapeHtml(quien(r.usuario_id))}${r.estado_al_reprogramar ? ` · estaba en "${escapeHtml(r.estado_al_reprogramar)}"` : ''}</div>
            </div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4';
    overlay.style.zIndex = '70';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col">
            <div class="p-4 border-b border-slate-100 dark:border-slate-700">
                <h3 class="font-bold text-sm text-slate-800 dark:text-white">
                    <i class="fa-solid fa-calendar-plus text-purple-600 mr-1"></i> Historial de reprogramaciones
                </h3>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">${escapeHtml(t.actividad)}</p>
            </div>
            <div class="p-4 overflow-y-auto space-y-3 text-xs">
                <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-1">
                    <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Plan original</span>
                        <span class="font-semibold text-slate-800 dark:text-slate-200">${ini0 ? fmtDate(ini0) : '–'} → ${fin0 ? fmtDate(fin0) : '–'}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Plan vigente</span>
                        <span class="font-semibold text-slate-800 dark:text-slate-200">${t.fecha_inicio_programado ? fmtDate(t.fecha_inicio_programado) : '–'} → ${t.fecha_fin ? fmtDate(t.fecha_fin) : '–'}</span></div>
                    ${desvio !== null && desvio !== 0 ? `<div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Desvío del fin</span>
                        <span class="font-bold ${desvio > 0 ? 'text-red-600' : 'text-emerald-600'}">${desvio > 0 ? '+' : ''}${desvio} días</span></div>` : ''}
                </div>
                ${tarjetas}
            </div>
            <div class="p-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                <button type="button" id="hr-cerrar" class="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300">Cerrar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const cerrar = () => overlay.remove();
    overlay.querySelector('#hr-cerrar').onclick = cerrar;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
};


// Solo admin / coordinador / BIM manager (state.isAdmin ya incluye coordinador)
window.editarMotivoReprogramacion = function(eventoId, pendienteId) {
    if (!state.isAdmin && !state.isCoordinador) { toast('Solo coordinador o administrador pueden editar el motivo.'); return; }
    const r = (state.reprogramacionesCache || []).find(x => Number(x.id) === Number(eventoId));
    if (!r) return;

    const todas = state.causasTodasCache || state.causasCache || [];
    const opciones = todas.filter(c => c.activo !== false || Number(c.id) === Number(r.causa_id));
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4';
    overlay.style.zIndex = '80';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
            <h3 class="font-bold text-sm text-slate-800 dark:text-white"><i class="fa-solid fa-pen text-sky-600 mr-1"></i> Editar motivo</h3>
            <form id="em-form" class="space-y-3 text-xs">
                <div>
                    <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Causa</label>
                    <select id="em-causa" class="inp">
                        <option value="">— Sin causa —</option>
                        ${opciones.map(c => `<option value="${c.id}" ${Number(c.id) === Number(r.causa_id) ? 'selected' : ''}>${escapeHtml(c.nombre)}${c.activo === false ? ' (inactiva)' : ''}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Comentario</label>
                    <textarea id="em-comentario" rows="3" class="inp">${escapeHtml(r.comentario || '')}</textarea>
                </div>
                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                    <button type="button" id="em-cancelar" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300">Cancelar</button>
                    <button type="submit" id="em-guardar" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700 disabled:opacity-60">Guardar</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(overlay);
    const cerrar = () => overlay.remove();
    overlay.querySelector('#em-cancelar').onclick = cerrar;

    overlay.querySelector('#em-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = overlay.querySelector('#em-guardar');
        if (btn.disabled) return;
        btn.disabled = true;
        const causaVal = overlay.querySelector('#em-causa').value;
        const cambios = {
            causa_id: causaVal ? Number(causaVal) : null,
            comentario: overlay.querySelector('#em-comentario').value.trim() || null
        };
        const { data, error } = await supabaseClient.from('reprogramaciones_bim')
            .update(cambios).eq('id', eventoId).select('id');
        if (error) { toast('Error: ' + error.message); btn.disabled = false; return; }
        if (!data || data.length === 0) { toast('No se pudo editar: la base de datos no te lo permite (falta política UPDATE).'); btn.disabled = false; return; }

        Object.assign(r, cambios);
        cerrar();
        document.querySelectorAll('div.fixed').forEach(el => { if (el.querySelector('#hr-cerrar')) el.remove(); });
        window.verHistorialReprogramaciones(pendienteId);
        toast('Motivo actualizado');
    };
};
