// ------------------------------------------------------------------
// ACTIVIDADES ESTANCADAS y FLUJO (throughput + tiempo de ciclo)
// Lógica pura: recibe los datos y la función de días laborables (roster),
// para poder probarla sin la interfaz.
// ------------------------------------------------------------------
import { sumarDias, lunesDeSemana } from './utils.js';

export const DIAS_ESTANCADA_DEFAULT = 2;
const MAX_DIAS_ATRAS = 60; // tope de búsqueda hacia atrás

/** Memoriza esLaborable(uid, fecha) durante un cálculo (el roster recorre listas). */
export function memoLaborable(esLaborable) {
    const cache = new Map();
    return (uid, f) => {
        const k = (uid || '-') + '|' + f;
        if (!cache.has(k)) cache.set(k, !!esLaborable(uid || null, f));
        return cache.get(k);
    };
}

/** Responsable + recursos de la actividad (ids únicos, sin vacíos). */
export function asignadosDe(t, recursos) {
    const ids = new Set();
    if (t.responsable_id) ids.add(t.responsable_id);
    (recursos || []).forEach(r => { if (String(r.pendiente_id) === String(t.id) && r.usuario_id) ids.add(r.usuario_id); });
    return [...ids];
}

/** Un día cuenta si al menos un asignado trabajaba (sin asignados: calendario general). */
function diaCuenta(uids, f, lab) {
    return uids.length ? uids.some(u => lab(u, f)) : lab(null, f);
}

const fechaDe = (ts) => (ts ? String(ts).slice(0, 10) : null);

/**
 * Actividades estancadas.
 * Entra: vigente "En proceso", o "No iniciado" con fecha de inicio ya pasada.
 * Estancada: nadie registró horas en los N últimos días laborables TERMINADOS
 * (hoy nunca cuenta: las horas se registran al final del día). Si la actividad
 * empezó hace menos de N días laborables, todavía no se evalúa.
 */
export function calcularEstancadas({ tareas, manpower, recursos, esLaborable, hoy, n = DIAS_ESTANCADA_DEFAULT }) {
    const lab = memoLaborable(esLaborable);
    const ultimaHora = new Map();   // pendiente_id -> fecha del último registro con horas
    (manpower || []).forEach(m => {
        if (!m.fecha || !(parseFloat(m.porcentaje_dia || 0) > 0)) return;
        const k = String(m.pendiente_id);
        if (!ultimaHora.has(k) || m.fecha > ultimaHora.get(k)) ultimaHora.set(k, m.fecha);
    });

    const out = [];
    (tareas || []).forEach(t => {
        if (t.archivada_en) return;
        const enProceso = t.estado === 'En proceso';
        const noIniciadaVencida = t.estado === 'No iniciado' && t.fecha_inicio_programado && t.fecha_inicio_programado < hoy;
        if (!enProceso && !noIniciadaVencida) return;

        const uids = asignadosDe(t, recursos);
        // Desde cuándo se puede exigir avance: fecha de inicio (o de creación si no tiene)
        const desde = t.fecha_inicio_programado || fechaDe(t.created_at);
        const ultima = ultimaHora.get(String(t.id)) || null;
        if (ultima && ultima >= sumarDias(hoy, -1)) return; // registró ayer u hoy: avanza

        // Días laborables terminados sin horas, contando hacia atrás desde ayer
        let sinHoras = 0;
        let tope = true; // true si se llegó al límite de búsqueda sin encontrar el inicio
        for (let i = 1; i <= MAX_DIAS_ATRAS; i++) {
            const f = sumarDias(hoy, -i);
            if ((ultima && f <= ultima) || (desde && f < desde)) { tope = false; break; }
            if (diaCuenta(uids, f, lab)) sinHoras++;
        }
        if (sinHoras < n) return;

        out.push({
            t,
            tipo: ultima ? 'Detenida' : 'Sin arrancar',
            ultima,
            dias: sinHoras,
            tope
        });
    });
    return out.sort((a, b) => b.dias - a.dias);
}

/** Días laborables (roster del responsable) entre dos fechas, ambas incluidas; mínimo 1. */
export function diasCiclo(t, lab) {
    const ini = t.fecha_inicio_programado, fin = t.fecha_cierre;
    if (!ini || !fin) return null;
    if (fin <= ini) return 1;
    let d = 0;
    for (let f = ini; f <= fin; f = sumarDias(f, 1)) if (lab(t.responsable_id || null, f)) d++;
    return Math.max(1, d);
}

/** Percentil por rango más cercano (p entre 0 y 100). */
export function percentil(valores, p) {
    if (!valores.length) return null;
    const v = valores.slice().sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(p / 100 * v.length) - 1);
    return v[idx];
}

export function mediana(valores) {
    if (!valores.length) return null;
    const v = valores.slice().sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2 * 10) / 10;
}

/**
 * Flujo de las últimas `semanas` semanas (lunes a domingo, la actual incluida).
 * Throughput = cerradas por semana según fecha de cierre.
 * Tiempo de ciclo = días laborables de fecha de inicio programada a cierre.
 * claveDe(t) devuelve el grupo o la especialidad de la actividad.
 */
export function calcularFlujo({ tareas, manpower, esLaborable, hoy, semanas = 8, claveDe }) {
    const lab = memoLaborable(esLaborable);
    const lunesActual = lunesDeSemana(hoy);
    const lunes = [];
    for (let i = semanas - 1; i >= 0; i--) lunes.push(sumarDias(lunesActual, -7 * i));
    const desde = lunes[0];
    const hasta = sumarDias(lunesActual, 6);

    const conHoras = new Set((manpower || []).filter(m => parseFloat(m.porcentaje_dia || 0) > 0).map(m => String(m.pendiente_id)));
    const cerradas = (tareas || []).filter(t => !t.archivada_en && t.estado === 'Cerrado' && t.fecha_cierre && t.fecha_cierre >= desde && t.fecha_cierre <= hasta);

    const vacio = () => ({ porSemana: lunes.map(() => 0), ciclos: [], ciclosSemana: lunes.map(() => []), total: 0, sinHoras: 0, sinInicio: 0 });
    const total = vacio();
    const grupos = {};
    cerradas.forEach(t => {
        const k = claveDe(t);
        const g = grupos[k] = grupos[k] || vacio();
        const w = lunes.indexOf(lunesDeSemana(t.fecha_cierre));
        const c = diasCiclo(t, lab);
        [total, g].forEach(x => {
            x.total++;
            if (w >= 0) x.porSemana[w]++;
            if (c === null) x.sinInicio++;
            else { x.ciclos.push(c); if (w >= 0) x.ciclosSemana[w].push(c); }
            if (!conHoras.has(String(t.id))) x.sinHoras++;
        });
    });
    const resumen = (x) => ({ ...x, mediana: mediana(x.ciclos), p85: percentil(x.ciclos, 85), medianaSemana: x.ciclosSemana.map(mediana) });
    return {
        lunes,
        total: resumen(total),
        filas: Object.entries(grupos).map(([k, x]) => ({ clave: k, ...resumen(x) })).sort((a, b) => b.total - a.total || a.clave.localeCompare(b.clave, 'es'))
    };
}

/** Umbral configurable (parametros_app.dias_estancada), entero >= 1. */
export function umbralEstancada(parametros) {
    const v = Math.round(Number(parametros?.dias_estancada));
    return v >= 1 ? v : DIAS_ESTANCADA_DEFAULT;
}
