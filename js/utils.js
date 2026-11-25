export const CDE_COLORS = { 
    WIP: 'background:#f1f5f9;color:#334155;', 
    Shared: 'background:#fef3c7;color:#92400e;', 
    Published: 'background:#ccfbf1;color:#115e59;', 
    Archived: 'background:#e2e8f0;color:#64748b;' 
};

export const APTITUD_DEFAULT = { WIP: 'S0', Shared: 'S1', Published: 'A1', Archived: null };
export const ESTADOS_CDE = ['WIP', 'Shared', 'Published', 'Archived'];
export const WEIGHT = { 'Muy alto': 1.65, 'Alto': 1.4, 'Medio': 1.2, 'Bajo': 1.0 };
export const DAY = 86400000;

export const cdeBadge = (e, a) => `<span class="badge-cde" style="${CDE_COLORS[e] || ''}">${e || 'WIP'} · ${a || '—'}</span>`;

// ------------------------------------------------------------------
// FECHAS EN HORA DE LIMA
// Todo "hoy" de la app se calcula en America/Lima, sin depender de la
// zona horaria de la computadora del usuario. Las fechas se manejan
// como texto 'YYYY-MM-DD' (igual que en Supabase).
// ------------------------------------------------------------------
export const TZ_PROYECTO = 'America/Lima';
const fmtLima = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_PROYECTO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha de hoy en Lima, como 'YYYY-MM-DD'. */
export const hoyLima = () => fmtLima.format(new Date());

/** Convierte un Date (medianoche local) a 'YYYY-MM-DD' sin pasar por UTC. */
export const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Suma n días calendario a una fecha 'YYYY-MM-DD'. */
export const sumarDias = (fechaStr, n) => {
    const d = new Date(fechaStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

/** Domingo (fin de semana de trabajo) de la semana lunes–domingo que contiene la fecha. */
export const domingoDeSemana = (fechaStr) => {
    const dow = new Date(fechaStr + 'T00:00:00Z').getUTCDay(); // 0 = domingo
    return sumarDias(fechaStr, dow === 0 ? 0 : 7 - dow);
};

/** Lunes de la semana lunes–domingo que contiene la fecha. */
export const lunesDeSemana = (fechaStr) => sumarDias(domingoDeSemana(fechaStr), -6);

/** Medianoche local del día de hoy en Lima (para cálculos con Date). */
export const today = () => new Date(hoyLima() + 'T00:00:00');

/**
 * Latencia promedio (días de atraso) de los cierres tardíos de las últimas N semanas.
 * Única definición para Dashboard y Recursos. Devuelve 0 si no hay cierres tardíos.
 */
export const latenciaPromedio = (tareas, semanas = 8) => {
    const desde = sumarDias(hoyLima(), -7 * semanas);
    const tarde = (tareas || []).filter(t => t.fecha_cierre && t.fecha_fin && t.fecha_cierre > t.fecha_fin && t.fecha_cierre >= desde);
    if (!tarde.length) return 0;
    const dias = t => Math.round((new Date(t.fecha_cierre + 'T00:00:00Z') - new Date(t.fecha_fin + 'T00:00:00Z')) / 86400000);
    return tarde.reduce((acc, t) => acc + dias(t), 0) / tarde.length;
};

// ------------------------------------------------------------------
// REGLAS DE MANPOWER (deben coincidir con sql/manpower_corte_semanal.sql,
// sql/archivar_actividades_cierre.sql y sql/manpower_justificar_retraso.sql)
// ------------------------------------------------------------------
export const DIAS_GRACIA_CIERRE = 2;

/** Rol con permiso de corregir semanas cerradas (BIM Manager y Coordinador BIM). */
export const esAdminManpower = (st) => !!(st.isAdmin || st.isCoordinador);

/** Una semana queda cerrada el domingo a las 23:59 (hora de Lima). */
export const semanaCerrada = (fechaStr, hoy = hoyLima()) => !!fechaStr && domingoDeSemana(fechaStr) < hoy;

/**
 * Último día (inclusive) en que una actividad cerrada sigue visible para el
 * modelador: fecha de cierre + 2 días calendario, sin pasar del domingo.
 */
export const limiteVisibleCerrada = (fechaCierre) => {
    if (!fechaCierre) return null;
    const conGracia = sumarDias(fechaCierre, DIAS_GRACIA_CIERRE);
    const domingo = domingoDeSemana(fechaCierre);
    return conGracia < domingo ? conGracia : domingo;
};

/** ¿La actividad cerrada sigue visible hoy para el modelador? */
export const cerradaVisibleHoy = (t, hoy = hoyLima()) => {
    const lim = limiteVisibleCerrada(t.fecha_cierre);
    return !!lim && hoy <= lim;
};

export const MSG_RETRASO_CERRADA = 'Pasó el plazo de 2 días desde el cierre de la actividad: justifica el retraso.';

/**
 * ¿El motivo lo puede justificar cualquier usuario (no solo un admin)?
 * Solo el retraso al cargar en una actividad cerrada, siempre dentro de la semana en curso.
 */
export const esMotivoJustificableTodos = (motivo) => motivo === MSG_RETRASO_CERRADA;

/**
 * Valida un registro de manpower (crear o editar) para un usuario sin rol admin.
 * Devuelve null si es válido o el mensaje de error.
 * - fecha: fecha del registro; tarea: actividad vinculada (o null si es General).
 * - omitirPlazo: true al corregir un registro existente sin cambiar su actividad
 *   (corregir lo ya cargado no pide justificación).
 * Si el único problema es el plazo de la cerrada, devuelve MSG_RETRASO_CERRADA:
 * cualquier usuario puede guardar justificando el retraso.
 */
export const validarRegistroManpower = ({ fecha, tarea, hoy = hoyLima(), omitirPlazo = false }) => {
    if (!fecha) return 'Indica la fecha del registro.';
    if (fecha > hoy) return 'No puedes registrar horas en una fecha futura.';
    if (semanaCerrada(fecha, hoy)) return 'Esa semana ya está cerrada (corte del domingo 23:59). Pide la corrección a un administrador.';
    if (tarea) {
        if (tarea.archivada_en) return 'La actividad fue eliminada (archivada).';
        if (tarea.estado_cde === 'Archived') return 'La actividad está archivada en el CDE.';
        if (tarea.estado === 'Cerrado') {
            if (!tarea.fecha_cierre) return 'La actividad está cerrada.';
            if (fecha > tarea.fecha_cierre) return 'No puedes cargar horas después de la fecha de cierre de la actividad.';
            if (!omitirPlazo && hoy > limiteVisibleCerrada(tarea.fecha_cierre)) return MSG_RETRASO_CERRADA;
        }
    }
    return null;
};

/**
 * ¿Un registro que ya existe está bloqueado para editarlo o eliminarlo?
 * Bloqueado si su semana ya cerró o si su actividad está archivada.
 * Dentro de la semana en curso se corrige libremente, aunque la actividad haya cerrado hace más de 2 días.
 * Devuelve null si se puede tocar o el motivo del bloqueo.
 */
export const bloqueoRegistroExistente = ({ fecha, tarea, hoy = hoyLima() }) => {
    if (semanaCerrada(fecha, hoy)) return 'Ese registro es de una semana ya cerrada (corte del domingo 23:59).';
    if (tarea && tarea.archivada_en) return 'La actividad del registro fue eliminada (archivada).';
    if (tarea && tarea.estado_cde === 'Archived') return 'La actividad del registro está archivada en el CDE.';
    return null;
};

// ------------------------------------------------------------------
// REGLAS DE CIERRE Y ARCHIVO (deben coincidir con sql/archivar_actividades_cierre.sql)
// ------------------------------------------------------------------
/** Estado al que vuelve una actividad si se le borra la fecha de cierre y no hay registro previo. */
export const ESTADO_REAPERTURA_DEFAULT = 'En proceso';

/** ¿La actividad fue eliminada? (eliminar = archivar, borrado lógico) */
export const esArchivada = (t) => !!(t && t.archivada_en);

/**
 * Valida la fecha de cierre real. Devuelve null si es válida o el mensaje de error.
 * - Nunca futura: como máximo hoy en hora de Lima.
 * - No anterior a la fecha de inicio programada.
 */
export const validarFechaCierre = ({ fechaCierre, fechaInicio, hoy = hoyLima() }) => {
    if (!fechaCierre) return null;
    if (fechaCierre > hoy) return `La fecha de cierre real no puede ser futura (hoy es ${fmtDate(hoy)}).`;
    if (fechaInicio && fechaCierre < fechaInicio) return `La fecha de cierre real no puede ser anterior a la fecha de inicio (${fmtDate(fechaInicio)}).`;
    return null;
};

/**
 * Estado y fecha de cierre resultantes (misma regla que el trigger):
 * - con fecha de cierre -> 'Cerrado'
 * - 'Cerrado' sin fecha -> fecha = hoy (Lima)
 * - se borra la fecha de una cerrada -> vuelve a estadoAntesCierre
 * - se reabre cambiando el estado -> se limpia la fecha
 */
export const resolverCierre = ({ estado, fechaCierre, previa = null, hoy = hoyLima() }) => {
    let e = estado, f = fechaCierre || null;
    if (previa && previa.estado === 'Cerrado') {
        if (e === 'Cerrado' && previa.fecha_cierre && !f) {
            e = (previa.estado_antes_cierre && previa.estado_antes_cierre !== 'Cerrado') ? previa.estado_antes_cierre : ESTADO_REAPERTURA_DEFAULT;
        } else if (e !== 'Cerrado' && f === (previa.fecha_cierre || null)) {
            f = null;
        }
    }
    if (f && e !== 'Cerrado') e = 'Cerrado';
    else if (e === 'Cerrado' && !f) f = hoy;
    return { estado: e, fechaCierre: f };
};

export const fmtDate = (iso) => !iso ? '–' : `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(2,4)}`;

export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const toast = (m) => { 
    const el = document.getElementById('toast'); 
    if (!el) return;
    el.textContent = m; 
    el.classList.remove('hidden'); 
    clearTimeout(toast._t); 
    toast._t = setTimeout(() => el.classList.add('hidden'), 2600); 
};

export const isCerrado = (t) => t.estado === 'Cerrado';

export const daysToDeadline = (t) => !t.fecha_fin ? null : Math.round((new Date(t.fecha_fin + 'T00:00:00') - today()) / DAY);

export const isUrgente = (t) => {
    if (isCerrado(t) || !t.fecha_fin) return false;
    return daysToDeadline(t) <= 7;
};

export const isImportante = (t) => {
    if (isCerrado(t)) return false;
    return t.importancia === 'Muy alto' || t.importancia === 'Alto';
};

export const getCriticidad = (t) => {
    const urg = isUrgente(t);
    const imp = isImportante(t);
    if (urg && imp) return 'Muy alto';
    if (!urg && imp) return 'Alto';
    if (urg && !imp) return 'Medio';
    return 'Bajo';
};

export const semaforo = (t) => {
    if (isCerrado(t)) return 'Cerrado';
    if (!t.fecha_fin) return 'Sin fecha';
    const d = daysToDeadline(t);
    if (d < 0) return 'Vencida';
    if (d <= 7) return 'Por vencer';
    return 'En plazo';
};

export const nombreResponsable = (t, perfiles) => {
    let email = '';
    if (t.responsable_id) {
        const p = perfiles.find(p => p.id === t.responsable_id);
        if (p) email = p.email;
    }
    if (!email) email = t.responsable || '';
    if (!email) return 'Sin asignar';

    const nombreBase = email.split('@')[0];
    return nombreBase
        .replace(/[._-]/g, ' ')
        .replace(/\d+/g, '')
        .trim()
        .split(' ')
        .filter(p => p.length > 0)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
};

export const critColor = (c) => {
    return c === 'Muy alto' ? 'text-red-600' :
           c === 'Alto' ? 'text-orange-600' :
           c === 'Medio' ? 'text-amber-600' : 'text-slate-500';
};

// --- HELPERS PARA AVATARES Y NOMBRES ---
export function nombreFormateado(p) {
    if (!p || !p.email) return '';
    const base = p.email.split('@')[0];
    return base.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim()
        .split(' ').filter(x => x).map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
}

export function getIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ');
    return (partes[0]?.[0] || '') + (partes[1]?.[0] || '');
}

export function colorAvatar(seed) {
    const colores = ['bg-sky-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-emerald-500'];
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colores[Math.abs(hash) % colores.length];
}

// --- MODAL DE CONFIRMACIÓN CON TEXTO ---
let confirmCallback = null;

export function confirmDelete(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const title = document.getElementById('confirm-title');
        const message = document.getElementById('confirm-message');
        const input = document.getElementById('confirm-input');
        const btn = document.getElementById('confirm-btn');
        const error = document.getElementById('confirm-error');
        
        if (!modal) { resolve(false); return; }
        
        title.textContent = options.title || 'Confirmar eliminación';
        message.textContent = options.message || '¿Estás seguro de que quieres eliminar esto?';
        input.value = '';
        error.classList.add('hidden');
        btn.disabled = true;
        
        confirmCallback = resolve;
        
        const checkInput = () => {
            if (input.value.trim() === 'Eliminar') {
                btn.disabled = false;
                error.classList.add('hidden');
            } else {
                btn.disabled = true;
            }
        };
        input.addEventListener('input', checkInput);
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => input.focus(), 100);
    });
}

window.closeConfirm = function() {
    const modal = document.getElementById('modal-confirm');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (confirmCallback) { confirmCallback(false); confirmCallback = null; }
};

window.executeConfirm = function() {
    const input = document.getElementById('confirm-input');
    const error = document.getElementById('confirm-error');
    
    if (input.value.trim() !== 'Eliminar') {
        error.classList.remove('hidden');
        return;
    }
    
    const modal = document.getElementById('modal-confirm');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    
    if (confirmCallback) { confirmCallback(true); confirmCallback = null; }
};
