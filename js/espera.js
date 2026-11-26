// ------------------------------------------------------------------
// BLOQUEOS "EN ESPERA" (deben coincidir con sql/espera_bloqueos_ppc_responsable.sql)
//  * Pasar a "En espera" exige un motivo del catálogo de causas de incumplimiento.
//  * Un bloqueo = un periodo en espera; si se cambia el motivo, vale el último.
//  * Modeladores: solo en actividades donde son responsables o recursos.
//  * Si una actividad estuvo en espera y se cierra tarde, se propone su motivo
//    como causa de incumplimiento (se puede cambiar).
// ------------------------------------------------------------------
import { state, fetchCausas } from './db.js';
import { escapeHtml } from './utils.js';

export const ESTADO_ESPERA = 'En espera';

/** Modelador (rol operador) sin rol de gestión. */
export function esSoloModelador() {
    return state.isModelador && !state.isAdmin && !state.isCoordinador && !state.isSupervisor;
}

/** El usuario actual es responsable o recurso de la actividad. */
export function estaAsignado(t) {
    const uid = state.currentUser?.id;
    if (!uid || !t) return false;
    if (t.responsable_id === uid) return true;
    return (state.actividadRecursosCache || []).some(r => String(r.pendiente_id) === String(t.id) && r.usuario_id === uid);
}

/** Puede cambiar el estado / motivo de espera de la actividad. */
export function puedeCambiarEstado(t) {
    if (!esSoloModelador()) return true;
    return estaAsignado(t);
}

export function nombreCausaPorId(id) {
    if (id === null || id === undefined || id === '') return 'Sin motivo';
    const c = (state.causasTodasCache || []).find(x => String(x.id) === String(id));
    return c ? c.nombre : 'Sin motivo';
}

/** Opciones <option> del catálogo (activas + la seleccionada aunque esté inactiva). */
export function opcionesMotivo(seleccionado) {
    const activas = state.causasCache || [];
    const sel = seleccionado ? (state.causasTodasCache || []).find(c => String(c.id) === String(seleccionado)) : null;
    const lista = sel && !activas.some(c => String(c.id) === String(sel.id)) ? [sel, ...activas] : activas;
    return '<option value="">— Elige el motivo —</option>' + lista
        .map(c => `<option value="${c.id}" ${String(c.id) === String(seleccionado || '') ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
}

/** Llena el select del modal; carga el catálogo si la vista aún no lo trajo. */
export async function llenarSelectMotivo(selectEl, seleccionado) {
    if (!selectEl) return;
    if (!state._loaded.causas) await fetchCausas();
    selectEl.innerHTML = opcionesMotivo(seleccionado);
    selectEl.value = seleccionado ? String(seleccionado) : '';
}

/** Motivo del último bloqueo de la actividad (para proponer la causa al cerrar tarde). */
export function ultimaCausaEspera(pendienteId) {
    const b = (state.bloqueosCache || [])
        .filter(x => String(x.pendiente_id) === String(pendienteId) && x.causa_id)
        .sort((a, c) => String(c.inicio).localeCompare(String(a.inicio)))[0];
    return b ? Number(b.causa_id) : null;
}

/**
 * Pide el motivo de espera en un diálogo propio (Kanban).
 * Devuelve el id de la causa elegida o null si se cancela.
 */
export async function pedirMotivoEspera(t) {
    if (!state._loaded.causas) await fetchCausas();
    return new Promise(resolve => {
        const wrap = document.createElement('div');
        wrap.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50';
        wrap.innerHTML = `
            <div class="card w-full max-w-sm p-4 text-xs">
                <h3 class="font-bold text-sm text-slate-800 mb-1">Pasar a "En espera"</h3>
                <p class="text-[11px] text-slate-500 mb-3">${escapeHtml(`${t.codigo_contenedor || ''} ${t.actividad || ''}`.trim())}</p>
                <label class="block font-semibold text-slate-600 mb-1">Motivo de espera *</label>
                <select class="inp w-full" data-motivo>${opcionesMotivo(t.motivo_espera_id)}</select>
                <p class="text-[10px] text-slate-500 mt-1">Mismo catálogo que las causas de incumplimiento.</p>
                <div class="flex justify-end gap-2 mt-4">
                    <button type="button" data-cancelar class="px-3 py-1.5 rounded border border-slate-300 text-slate-600">Cancelar</button>
                    <button type="button" data-ok class="px-3 py-1.5 rounded bg-sky-600 text-white font-semibold">Guardar</button>
                </div>
            </div>`;
        const cerrar = (v) => { wrap.remove(); resolve(v); };
        wrap.querySelector('[data-cancelar]').onclick = () => cerrar(null);
        wrap.querySelector('[data-ok]').onclick = () => {
            const v = wrap.querySelector('[data-motivo]').value;
            if (!v) { wrap.querySelector('[data-motivo]').focus(); return; }
            cerrar(Number(v));
        };
        document.body.appendChild(wrap);
    });
}
