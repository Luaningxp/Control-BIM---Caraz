// =====================================================================
// BASE DE DATOS: control de versiones de los scripts de sql/
// (deben coincidir con sql/010_control_versiones.sql)
//
// MIGRACIONES es la lista de scripts que ESTA versión de la app necesita.
// Al agregar un script nuevo a sql/: súmalo aquí con el número siguiente y
// termina el script con: select public.registrar_migracion(<número>, '<nombre>');
// =====================================================================
import { escapeHtml, toast } from './utils.js';
import { supabaseClient, state } from './db.js';

export const MIGRACIONES = [
    { numero: 1,  nombre: '001_manpower_corte_semanal',          titulo: 'Manpower: corte semanal' },
    { numero: 2,  nombre: '002_dashboard_ppc_especialidades',    titulo: 'Dashboard PPC y especialidades' },
    { numero: 3,  nombre: '003_parametros_app',                  titulo: 'Parámetros (límites WIP)' },
    { numero: 4,  nombre: '004_archivar_actividades_cierre',     titulo: 'Eliminar = archivar, cierre automático' },
    { numero: 5,  nombre: '005_manpower_justificar_retraso',     titulo: 'Manpower: justificar retraso' },
    { numero: 6,  nombre: '006_manpower_registro_por_fecha',     titulo: 'Manpower: registro por fecha' },
    { numero: 7,  nombre: '007_reagrupar_grupos_bim',            titulo: 'Reagrupar grupos BIM (solo una vez)' },
    { numero: 8,  nombre: '008_cambio_masivo_grupo',             titulo: 'Cambio masivo de grupo' },
    { numero: 9,  nombre: '009_espera_bloqueos_ppc_responsable', titulo: 'En espera, bloqueos y PPC por responsable' },
    { numero: 10, nombre: '010_control_versiones',               titulo: 'Control de versiones de la base' },
    { numero: 11, nombre: '011_causas_solo_admin',               titulo: 'Causas de incumplimiento: solo admin edita' },
    { numero: 12, nombre: '012_fotos_ppc_solo_lectura',          titulo: 'Fotos del PPC: solo lectura' }
];

// Scripts que redefinen funciones de scripts anteriores: si re-ejecutas uno
// viejo, hay que volver a ejecutar estos después (en este orden).
const POSTERIORES = {
    1: [4, 5, 6], 2: [4, 9], 4: [5, 6, 9], 5: [6]
};

const fmt = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
};

export function renderTarjetaBaseDatos() {
    if (!state.isAdmin) return '';
    return `
        <div class="card p-4 mb-4">
            <div class="flex flex-wrap justify-between items-start gap-2 mb-3">
                <div>
                    <h3 class="font-bold text-sm text-slate-800">Base de datos (scripts SQL)</h3>
                    <p class="text-[10px] text-slate-500">Qué scripts de la carpeta <b>sql/</b> ya se ejecutaron en Supabase. Se ejecutan a mano en el SQL Editor, en orden.</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.cargarEstadoBaseDatos()" class="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"><i class="fa-solid fa-rotate"></i> Revisar</button>
                    <button onclick="window.descargarEsquemaBD()" class="px-2 py-1 text-xs bg-sky-600 text-white rounded hover:bg-sky-700"><i class="fa-solid fa-download"></i> Descargar estructura (.sql)</button>
                </div>
            </div>
            <div id="bd-estado" class="text-xs text-slate-500">Revisando…</div>
        </div>`;
}

export async function cargarEstadoBaseDatos() {
    const cont = document.getElementById('bd-estado');
    if (!cont) return;
    cont.innerHTML = 'Revisando…';
    const { data, error } = await supabaseClient.rpc('estado_base_datos');
    if (error) {
        cont.innerHTML = `<p class="text-amber-700">Aún no está el control de versiones. Ejecuta <b>sql/010_control_versiones.sql</b> en el SQL Editor de Supabase y vuelve a presionar Revisar.</p>
            <p class="text-[10px] text-slate-400 mt-1">${escapeHtml(error.message || '')}</p>`;
        return;
    }
    const registradas = new Map((data?.registradas || []).map(r => [r.numero, r]));
    const detectadas = new Map((data?.detectadas || []).map(d => [d.numero, d]));
    const faltan = [];

    const filas = MIGRACIONES.map(m => {
        const reg = registradas.get(m.numero);
        const det = detectadas.get(m.numero);
        let icono, texto;
        if (reg && reg.metodo === 'ejecutado') {
            icono = '✅'; texto = `Ejecutado el ${fmt(reg.aplicada_en)}`;
        } else if (reg || det?.detectada) {
            icono = '✅'; texto = 'Ya estaba aplicado (detectado al instalar el control)';
        } else {
            icono = '⚠️'; texto = 'Falta ejecutar';
            faltan.push(m.numero);
        }
        return `<tr class="${icono === '⚠️' ? 'bg-amber-50' : ''}">
            <td class="py-1 pr-2 whitespace-nowrap">${icono}</td>
            <td class="py-1 pr-2 font-mono text-[11px] whitespace-nowrap">sql/${escapeHtml(m.nombre)}.sql</td>
            <td class="py-1 pr-2">${escapeHtml(m.titulo)}</td>
            <td class="py-1 text-slate-500">${escapeHtml(texto)}</td>
        </tr>`;
    }).join('');

    // Pasos sugeridos para lo que falta
    const pasos = [];
    faltan.forEach(n => {
        const m = MIGRACIONES.find(x => x.numero === n);
        const despues = (POSTERIORES[n] || []).filter(p => !faltan.includes(p))
            .map(p => MIGRACIONES.find(x => x.numero === p)?.nombre).filter(Boolean);
        pasos.push(`Ejecuta <b>sql/${escapeHtml(m.nombre)}.sql</b>` +
            (despues.length ? ` y después vuelve a ejecutar, en orden: ${despues.map(d => `<b>sql/${escapeHtml(d)}.sql</b>`).join(', ')}` : '') + '.');
    });

    const funcionesMal = (data?.funciones || []).filter(f => !f.ok);
    const scriptsFunciones = [...new Set(funcionesMal.map(f => f.script))];
    scriptsFunciones.forEach(s => {
        const lista = funcionesMal.filter(f => f.script === s).map(f => f.funcion).join(', ');
        pasos.push(`Las reglas de <i>${escapeHtml(lista)}</i> no están en su última versión: vuelve a ejecutar <b>sql/${escapeHtml(s)}</b>.`);
    });

    const extra = (data?.registradas || []).filter(r => !MIGRACIONES.some(m => m.numero === r.numero));

    cont.innerHTML = `
        ${pasos.length
            ? `<div class="mb-3 p-2 rounded border border-amber-300 bg-amber-50 text-amber-800"><b>Pendiente:</b><ul class="list-disc ml-5 mt-1 space-y-0.5">${pasos.map(p => `<li>${p}</li>`).join('')}</ul></div>`
            : '<div class="mb-3 p-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-800"><b>Base de datos al día.</b> Todos los scripts que necesita esta versión de la app están ejecutados.</div>'}
        <div class="overflow-x-auto">
            <table class="w-full text-left text-xs"><tbody class="divide-y divide-slate-100">${filas}</tbody></table>
        </div>
        ${extra.length ? `<p class="text-[10px] text-slate-500 mt-2">La base tiene scripts más nuevos que esta versión de la app: ${extra.map(e => escapeHtml(e.nombre)).join(', ')}.</p>` : ''}
        <p class="text-[10px] text-slate-400 mt-2">Para probar los permisos por rol: ejecuta <b>sql/pruebas/pruebas_roles.sql</b> en el SQL Editor (no cambia nada, deshace todo al final).</p>`;
}

export async function descargarEsquemaBD() {
    if (!state.isAdmin) { toast('Solo el administrador puede descargar la estructura.'); return; }
    toast('Generando estructura…');
    const { data, error } = await supabaseClient.rpc('exportar_esquema');
    if (error) { toast('No se pudo generar: ' + error.message + ' (¿ejecutaste sql/010_control_versiones.sql?)'); return; }
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const blob = new Blob([data || ''], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `esquema_supabase_${fecha}.sql`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

window.cargarEstadoBaseDatos = cargarEstadoBaseDatos;
window.descargarEsquemaBD = descargarEsquemaBD;
