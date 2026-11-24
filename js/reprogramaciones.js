import { supabaseClient, state } from './db.js';
import { escapeHtml, fmtDate } from './utils.js';

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
