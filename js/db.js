export const supabaseClient = window.supabase.createClient(
    'https://zsrczkdpluafuoczfokw.supabase.co',
    'sb_publishable_asRWjkS5NLVJ4-FrVA05sw_uW2kFP2A'
);

export const state = {
    currentUser: null,
    currentRol: 'operador',
    currentCargo: '',
    isAdmin: false,
    isCoordinador: false,
    isSupervisor: false,
    isModelador: false,
    tasksCache: [],
    gruposCache: [],
    perfilesCache: [],
    propDefsCache: [],
    propValsCache: [],
    manpowerCache: [],
    actividadRecursosCache: [],
    planosCache: [],
    actividadPlanosCache: [],
    causasCache: [],
    tareaCausasCache: [],
    snapshotsCache: [],
    descansosCache: [],
    feriadosCache: [],
    subcontratasCache: [],
    trabajosExtraCache: [],
    descansosMedicosCache: [],
    currentTab: 'dashboard',
    cdeTargetId: null,
    dragId: null,
    charts: {},
    // Marcadores de "qué ya tengo cargado" para no pedir dos veces lo mismo
    _loaded: {
        core: false,
        propVals: false,
        manpower: false,
        planos: false,         
        planosLigeros: false,   
        planos: false,
        causas: false,
        roster: false,
        snapshots: false
    }
};

// ------------------------------------------------------------------
// Núcleo: lo que TODAS las vistas necesitan. Se carga una vez al login.
// ------------------------------------------------------------------
export async function fetchCore() {
    try {
        const [t, g, p, pd, ar, sub] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo,avatar_url').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('actividad_recursos').select('*'),
            supabaseClient.from('subcontratas').select('*').eq('activo', true).order('nombre')
        ]);

        if (t.error) console.error('fetchCore tareas:', t.error);
        if (p.error) console.error('fetchCore perfiles:', p.error);

        state.tasksCache = t.data || [];
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.actividadRecursosCache = ar.data || [];
        state.subcontratasCache = sub.data || [];
        state._loaded.core = true;
        return true;
    } catch (err) {
        console.error('fetchCore general:', err);
        return false;
    }
}

// ------------------------------------------------------------------
// Cargas complementarias. Idempotentes: si ya están cargadas, no repiten.
// ------------------------------------------------------------------
export async function fetchPropVals() {
    if (state._loaded.propVals) return true;
    const { data, error } = await supabaseClient.from('propiedades_valores').select('*');
    if (error) { console.error('fetchPropVals:', error); return false; }
    state.propValsCache = data || [];
    state._loaded.propVals = true;
    return true;
}

export async function fetchManpower() {
    if (state._loaded.manpower) return true;
    const { data, error } = await supabaseClient
        .from('manpower_registros')
        .select('*')
        .order('fecha', { ascending: false });
    if (error) { console.error('fetchManpower:', error); return false; }
    state.manpowerCache = data || [];
    state._loaded.manpower = true;
    return true;
}

export async function fetchPlanos() {
    if (state._loaded.planos) return true;
    // Carga completa: solo para el Log de Planos
    const [pl, ap] = await Promise.all([
        supabaseClient.from('planos').select('*').order('codigo'),
        supabaseClient.from('actividad_planos').select('*')
    ]);
    if (pl.error) console.error('fetchPlanos planos:', pl.error);
    if (ap.error) console.error('fetchPlanos actividad_planos:', ap.error);
    state.planosCache = pl.data || [];
    state.actividadPlanosCache = ap.data || [];
    state._loaded.planos = true;
    return true;
}

export async function fetchPlanosLigeros() {
    if (state._loaded.planosLigeros) return true;
    
    // 1. Traer solo las vinculaciones
    const { data: ap, error: apErr } = await supabaseClient.from('actividad_planos').select('*');
    if (apErr) { console.error('fetchPlanosLigeros vinculaciones:', apErr); return false; }
    
    // 2. Obtener los IDs únicos de los planos vinculados
    const ids = [...new Set((ap || []).map(x => x.plano_id))];
    
    // 3. Traer solo esos planos
    let pl = [];
    if (ids.length > 0) {
        const { data: plData, error: plErr } = await supabaseClient.from('planos').select('*').in('id', ids);
        if (plErr) console.error('fetchPlanosLigeros planos:', plErr);
        else pl = plData || [];
    }

    state.planosCache = pl;
    state.actividadPlanosCache = ap || [];
    state._loaded.planosLigeros = true;
    return true;
}

export async function fetchCausas() {
    if (state._loaded.causas) return true;
    const [ca, tc] = await Promise.all([
        supabaseClient.from('causas_incumplimiento').select('*').eq('activo', true).order('orden'),
        supabaseClient.from('tarea_causas').select('*')
    ]);
    if (ca.error) console.error('fetchCausas causas:', ca.error);
    if (tc.error) console.error('fetchCausas tarea_causas:', tc.error);
    state.causasCache = ca.data || [];
    state.tareaCausasCache = tc.data || [];
    state._loaded.causas = true;
    return true;
}

export async function fetchSnapshots() {
    if (state._loaded.snapshots) return true;
    const { data, error } = await supabaseClient
        .from('snapshots_semanales')
        .select('*')
        .order('semana', { ascending: false });
    if (error) { console.error('fetchSnapshots:', error); return false; }
    state.snapshotsCache = data || [];
    state._loaded.snapshots = true;
    return true;
}

export async function fetchRoster() {
    if (state._loaded.roster) return true;
    const [de, fe, te, dm] = await Promise.all([
        supabaseClient.from('descansos').select('*'),
        supabaseClient.from('feriados').select('*'),
        supabaseClient.from('trabajos_extra').select('*'),
        supabaseClient.from('descansos_medicos').select('*')
    ]);
    if (de.error) console.error('fetchRoster descansos:', de.error);
    if (fe.error) console.error('fetchRoster feriados:', fe.error);
    if (te.error) console.error('fetchRoster trabajos_extra:', te.error);
    if (dm.error) console.error('fetchRoster descansos_medicos:', dm.error);
    state.descansosCache = de.data || [];
    state.feriadosCache = fe.data || [];
    state.trabajosExtraCache = te.data || [];
    state.descansosMedicosCache = dm.data || [];
    state._loaded.roster = true;
    return true;
}

// ------------------------------------------------------------------
// Carga por vista: decide qué complementos necesita cada tab.
// ------------------------------------------------------------------
export async function fetchVista(tab) {
    if (tab !== 'config') await fetchRoster();

    switch (tab) {
        case 'mitrabajo':
        case 'manpower':
            await fetchManpower();
            await fetchPlanosLigeros(); // Para mostrar los chips de planos en modales
            break;
        case 'dashboard':
            await Promise.all([fetchSnapshots(), fetchPlanosLigeros(), fetchCausas(), fetchManpower()]);
            break;
        case 'tabla':
            await Promise.all([fetchPropVals(), fetchPlanosLigeros(), fetchCausas()]);
            break;
        case 'kanban':
            await fetchPlanosLigeros();
            break;
        case 'eisenhower':
            break;
        case 'gantt':
            // El Gantt no necesita los datos del plano, solo las tareas
            break;
        case 'log-planos':
            // AQUÍ SÍ CARGAMOS LOS 5,216
            await fetchPlanos();
            break;
        case 'recursos':
            await fetchManpower();
            break;
        case 'roster':
            break;
        case 'config':
            await fetchPropVals();
            break;
    }
    return true;
}

// ------------------------------------------------------------------
// Compatibilidad: fetchAll sigue existiendo y trae todo.
// Se usa en botones "Refrescar" que quieren forzar recarga completa.
// ------------------------------------------------------------------
export async function fetchAll() {
    try {
        const [t, g, p, pd, pv, m, ar, pl, ap, ca, tc, sn, de, fe, te, sub, dm] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo,avatar_url').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('propiedades_valores').select('*'),
            supabaseClient.from('manpower_registros').select('*').order('fecha', { ascending: false }),
            supabaseClient.from('actividad_recursos').select('*'),
            supabaseClient.from('planos').select('*').order('codigo'),
            supabaseClient.from('actividad_planos').select('*'),
            supabaseClient.from('causas_incumplimiento').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('tarea_causas').select('*'),
            supabaseClient.from('snapshots_semanales').select('*').order('semana', { ascending: false }),
            supabaseClient.from('descansos').select('*'),
            supabaseClient.from('feriados').select('*'),
            supabaseClient.from('trabajos_extra').select('*'),
            supabaseClient.from('subcontratas').select('*').eq('activo', true).order('nombre'),
            supabaseClient.from('descansos_medicos').select('*')
        ]);

        if (t.error) console.error('Error tareas:', t.error);
        if (pl.error) console.error('Error planos:', pl.error);
        if (ap.error) console.error('Error actividad_planos:', ap.error);
        if (ca.error) console.error('Error causas:', ca.error);
        if (tc.error) console.error('Error tarea_causas:', tc.error);
        if (sn.error) console.error('Error snapshots:', sn.error);
        if (de.error) console.error('Error descansos:', de.error);
        if (fe.error) console.error('Error feriados:', fe.error);
        if (te.error) console.error('Error trabajos_extra:', te.error);

        state.tasksCache = t.data || [];
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.propValsCache = pv.data || [];
        state.manpowerCache = m.data || [];
        state.actividadRecursosCache = ar.data || [];
        state.planosCache = pl.data || [];
        state.actividadPlanosCache = ap.data || [];
        state.causasCache = ca.data || [];
        state.tareaCausasCache = tc.data || [];
        state.snapshotsCache = sn.data || [];
        state.descansosCache = de.data || [];
        state.feriadosCache = fe.data || [];
        state.descansosMedicosCache = dm.data || [];
        state.subcontratasCache = sub.data || [];
        state.trabajosExtraCache = te.data || [];

        // Marcar todo como cargado
        Object.keys(state._loaded).forEach(k => state._loaded[k] = true);
    } catch (err) {
        console.error('Error general en fetchAll:', err);
    }
}

// ------------------------------------------------------------------
// Invalida cachés que puedan quedar obsoletas tras una escritura.
// Llamar tras guardar tarea, mover en kanban, registrar manpower, etc.
// ------------------------------------------------------------------
export function invalidarCache(keys) {
    (keys || []).forEach(k => {
        if (k in state._loaded) state._loaded[k] = false;
    });
}

// ------------------------------------------------------------------
// Snapshot semanal: sin cambios en lógica (ya está bien).
// ------------------------------------------------------------------
export async function guardarSnapshotSemanal() {
    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const dia = hoy.getDay();
        const diff = hoy.getDate() - dia + (dia === 0 ? -6 : 1);
        const lunes = new Date(hoy); lunes.setDate(diff);
        lunes.setHours(0, 0, 0, 0);
        const semana = lunes.toISOString().split('T')[0];

        const { data: existente, error: errExiste } = await supabaseClient
            .from('snapshots_semanales')
            .select('id')
            .eq('semana', semana)
            .maybeSingle();

        if (errExiste) { console.error('Snapshot check error:', errExiste); return false; }
        if (existente) return true;

        const { semaforo, isCerrado } = await import('./utils.js');
        const { esDiaLaborable } = await import('./roster.js');

        const tareas = state.tasksCache || [];
        const abiertas = tareas.filter(t => !isCerrado(t));
        const vencidas = abiertas.filter(t => semaforo(t) === 'Vencida').length;
        const porVencer = abiertas.filter(t => semaforo(t) === 'Por vencer').length;
        const sinFecha = abiertas.filter(t => !t.fecha_fin).length;

        const finSemana = new Date(lunes);
        finSemana.setDate(lunes.getDate() + 6);
        finSemana.setHours(23, 59, 59, 999);

        const tareasSemana = tareas.filter(t => {
            if (!t.fecha_fin) return false;
            const f = new Date(t.fecha_fin + 'T00:00:00');
            if (f < lunes || f > finSemana) return false;
            if (t.responsable_id && !esDiaLaborable(t.responsable_id, t.fecha_fin)) return false;
            return true;
        });
        const cumplidas = tareasSemana.filter(t =>
            t.fecha_cierre && t.fecha_cierre <= t.fecha_fin
        );
        const ppc = tareasSemana.length > 0
            ? Math.round((cumplidas.length / tareasSemana.length) * 100)
            : null;

        const horasSemana = (state.manpowerCache || []).filter(m => {
            if (!m.fecha) return false;
            const f = new Date(m.fecha + 'T00:00:00');
            return f >= lunes && f <= finSemana;
        }).reduce((s, m) => s + (parseFloat(m.porcentaje_dia || 0) * 9.3333) / 100, 0);

        const conteo = { WIP: 0, Shared: 0, Published: 0, Archived: 0 };
        (state.actividadPlanosCache || []).forEach(ap => {
            const p = (state.planosCache || []).find(x => x.id === ap.plano_id);
            if (p && p.estado && conteo[p.estado] !== undefined) conteo[p.estado]++;
        });

        const causasTop = {};
        (state.tareaCausasCache || []).forEach(tc => {
            const c = (state.causasCache || []).find(x => x.id === tc.causa_id);
            if (c) causasTop[c.nombre] = (causasTop[c.nombre] || 0) + 1;
        });

        const payload = {
            semana,
            total_tareas: tareas.length,
            abiertas: abiertas.length,
            cerradas: tareas.length - abiertas.length,
            vencidas,
            por_vencer: porVencer,
            sin_fecha: sinFecha,
            ppc,
            horas_semana: +horasSemana.toFixed(2),
            planos_wip: conteo.WIP,
            planos_shared: conteo.Shared,
            planos_published: conteo.Published,
            planos_archived: conteo.Archived,
            causas_top: causasTop
        };

        const { error } = await supabaseClient
            .from('snapshots_semanales')
            .insert([payload]);

        if (error && !String(error.message).toLowerCase().includes('duplicate')) {
            console.error('Snapshot insert error:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('guardarSnapshotSemanal', e);
        return false;
    }
}
